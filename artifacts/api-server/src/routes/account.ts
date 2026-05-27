import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, profilesTable, alertsTable, watchlistItemsTable, watchlistCategoriesTable } from "@workspace/db";
import { getAuthProfile } from "../lib/auth.js";

const router: IRouter = Router();

router.delete("/account", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = profile.id;

  // 1. Delete all alerts for this user
  await db.delete(alertsTable).where(eq(alertsTable.user_id, userId));

  // 2. Anonymize watchlist items (preserve preference data, unlink identity)
  await db
    .update(watchlistItemsTable)
    .set({ user_id: null })
    .where(eq(watchlistItemsTable.user_id, userId));

  // 3. Delete watchlist categories (these are personal preferences, fully remove)
  await db
    .delete(watchlistCategoriesTable)
    .where(eq(watchlistCategoriesTable.user_id, userId));

  // 4. Delete the profile (cascades session invalidation)
  await db.delete(profilesTable).where(eq(profilesTable.id, userId));

  res.json({ success: true });
});

export default router;
