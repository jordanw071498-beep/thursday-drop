import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, watchlistItemsTable, profilesTable } from "@workspace/db";
import {
  GetWatchlistResponse,
  AddToWatchlistBody,
  RemoveFromWatchlistParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getUserId(req: any): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const userId = authHeader.replace("Bearer ", "");
  return userId || null;
}

router.get("/watchlist", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const items = await db
    .select()
    .from(watchlistItemsTable)
    .where(eq(watchlistItemsTable.user_id, userId));

  res.json(
    GetWatchlistResponse.parse(
      items.map((item) => ({
        ...item,
        match_threshold:
          item.match_threshold != null ? Number(item.match_threshold) : null,
        created_at: item.created_at.toISOString(),
      })),
    ),
  );
});

router.post("/watchlist", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = AddToWatchlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const profile = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);

  const isPro = profile[0]?.is_pro ?? false;

  if (!isPro) {
    const existing = await db
      .select()
      .from(watchlistItemsTable)
      .where(eq(watchlistItemsTable.user_id, userId));

    if (existing.length >= 5) {
      res.status(403).json({ error: "Free tier limit of 5 watchlist items reached. Upgrade to Pro for unlimited." });
      return;
    }
  }

  const [item] = await db
    .insert(watchlistItemsTable)
    .values({
      user_id: userId,
      wine_name: parsed.data.wine_name,
      producer: parsed.data.producer ?? null,
      region: parsed.data.region ?? null,
      match_threshold: parsed.data.match_threshold?.toString() ?? null,
    })
    .returning();

  res.status(201).json({
    ...item,
    match_threshold:
      item.match_threshold != null ? Number(item.match_threshold) : null,
    created_at: item.created_at.toISOString(),
  });
});

router.delete("/watchlist/:id", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
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
        eq(watchlistItemsTable.user_id, userId),
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
