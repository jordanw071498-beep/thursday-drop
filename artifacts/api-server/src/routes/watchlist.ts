import { Router, type IRouter } from "express";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import { db, watchlistItemsTable, watchlistCategoriesTable, wineSuggestionsTable, profilesTable } from "@workspace/db";
import { upsertSuggestion } from "../lib/suggestions.js";
import { queueAlertsForNewWatchlistItem } from "../lib/scraper.js";
import {
  GetWatchlistResponse,
  AddToWatchlistBody,
  RemoveFromWatchlistParams,
} from "@workspace/api-zod";
import { getAuthProfile } from "../lib/auth.js";

const router: IRouter = Router();

function serializeWatchlistItem(item: typeof watchlistItemsTable.$inferSelect) {
  return {
    ...item,
    match_threshold:
      item.match_threshold != null ? Number(item.match_threshold) : null,
    created_at: item.created_at.toISOString(),
  };
}

// ─── Wine suggestions autocomplete (no auth required) ────────────────────────

router.get("/watchlist/suggestions", async (req, res): Promise<void> => {
  const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }

  const typeFilter = typeof req.query.type === "string" ? req.query.type : "all";
  const rawLimit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "10", 10);
  const limit = Math.min(Math.max(rawLimit || 10, 1), 20);

  const normalized = q.toLowerCase();
  const prefixPattern = `${normalized}%`;
  const anyPattern = `%${normalized}%`;

  const conditions = [ilike(wineSuggestionsTable.normalized_name, anyPattern)];
  if (typeFilter === "wine" || typeFilter === "producer") {
    conditions.push(eq(wineSuggestionsTable.type, typeFilter));
  }

  const results = await db
    .select({
      id: wineSuggestionsTable.id,
      display_name: wineSuggestionsTable.display_name,
      producer: wineSuggestionsTable.producer,
      wine_name: wineSuggestionsTable.wine_name,
      type: wineSuggestionsTable.type,
      count: wineSuggestionsTable.count,
    })
    .from(wineSuggestionsTable)
    .where(and(...conditions))
    .orderBy(
      sql`CASE WHEN normalized_name ILIKE ${prefixPattern} THEN 0 ELSE 1 END`,
      desc(wineSuggestionsTable.count),
    )
    .limit(limit);

  res.json(results);
});

router.get("/watchlist", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const items = await db
    .select()
    .from(watchlistItemsTable)
    .where(eq(watchlistItemsTable.user_id, profile.id));

  res.json(GetWatchlistResponse.parse(items.map(serializeWatchlistItem)));
});

router.post("/watchlist", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = AddToWatchlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!profile.is_pro) {
    const existing = await db
      .select()
      .from(watchlistItemsTable)
      .where(eq(watchlistItemsTable.user_id, profile.id));

    if (existing.length >= 5) {
      res.status(403).json({ error: "Free tier limit of 5 watchlist items reached. Upgrade to Pro for unlimited." });
      return;
    }
  }

  const matchType = parsed.data.match_type ?? "exact";

  const [item] = await db
    .insert(watchlistItemsTable)
    .values({
      user_id: profile.id,
      wine_name: parsed.data.wine_name,
      vintage: parsed.data.vintage ?? null,
      producer: parsed.data.producer ?? null,
      region: parsed.data.region ?? null,
      match_type: matchType,
      match_threshold: parsed.data.match_threshold?.toString() ?? null,
    })
    .returning();

  // Grow the suggestions corpus with user-entered names — fire-and-forget.
  const isProducerMatch = matchType === "producer";
  upsertSuggestion(
    {
      display_name: item.wine_name,
      producer: isProducerMatch ? item.wine_name : (item.producer ?? null),
      wine_name: isProducerMatch ? null : item.wine_name,
      type: isProducerMatch ? "producer" : "wine",
    },
    "watchlist",
  ).catch((err) => req.log.error({ err }, "Failed to upsert watchlist suggestion"));

  // Queue alerts for any wines in recently active releases that match this new item.
  // We do NOT send immediately — instead we set a 1-hour digest window on the profile.
  // The background alert flusher checks every 15 minutes and sends one bundled digest
  // once the window matures. Each new addition resets the window, so a user adding 10
  // wines in a row gets exactly one email with all their matches, not 10 separate ones.
  try {
    const queued = await queueAlertsForNewWatchlistItem(profile.id, {
      wine_name: item.wine_name,
      producer: item.producer,
      vintage: item.vintage,
      match_type: matchType,
    });
    if (queued > 0) {
      const sendAt = new Date(Date.now() + 60 * 60 * 1000); // NOW + 1 hour
      await db
        .update(profilesTable)
        .set({ alert_digest_send_at: sendAt })
        .where(eq(profilesTable.id, profile.id));
      req.log.info({ queued, sendAt }, "Watchlist alerts queued — digest window set to 1 hour");
    }
  } catch (err) {
    req.log.error({ err }, "Failed to queue alerts for new watchlist item");
  }

  res.status(201).json(serializeWatchlistItem(item));
});

router.delete("/watchlist/:id", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = RemoveFromWatchlistParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(watchlistItemsTable)
    .where(
      and(
        eq(watchlistItemsTable.id, params.data.id),
        eq(watchlistItemsTable.user_id, profile.id),
      ),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Watchlist item not found" });
    return;
  }

  res.json({ success: true });
});

// ─── Category tracking (Pro only) ────────────────────────────────────────────

router.get("/watchlist/categories", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const items = await db
    .select()
    .from(watchlistCategoriesTable)
    .where(eq(watchlistCategoriesTable.user_id, profile.id));

  res.json(items.map((i) => i.category));
});

router.post("/watchlist/categories", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!profile.is_pro) {
    res.status(403).json({ error: "Category tracking requires a Pro subscription." });
    return;
  }

  const { category } = req.body ?? {};
  if (!category || typeof category !== "string") {
    res.status(400).json({ error: "Category is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(watchlistCategoriesTable)
    .where(
      and(
        eq(watchlistCategoriesTable.user_id, profile.id),
        eq(watchlistCategoriesTable.category, category),
      ),
    )
    .limit(1);

  if (existing) {
    res.status(200).json({ success: true });
    return;
  }

  await db.insert(watchlistCategoriesTable).values({
    user_id: profile.id,
    category,
  });

  res.status(201).json({ success: true });
});

router.delete("/watchlist/categories/:category", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const category = req.params.category as string;

  await db
    .delete(watchlistCategoriesTable)
    .where(
      and(
        eq(watchlistCategoriesTable.user_id, profile.id),
        eq(watchlistCategoriesTable.category, category),
      ),
    );

  res.json({ success: true });
});

export default router;
