import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, watchlistItemsTable } from "@workspace/db";
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

export default router;
