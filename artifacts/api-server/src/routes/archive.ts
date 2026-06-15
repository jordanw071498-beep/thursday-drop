import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, archiveWinesTable, archiveReleaseCyclesTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /api/archive/history?wine_name=&vintage=
 *
 * Returns historical archive appearances for a specific wine name (case-insensitive
 * exact match). Optionally filtered by vintage.
 *
 * Only returns data — never affects alerts, watchlist, or live releases.
 */
router.get("/archive/history", async (req, res): Promise<void> => {
  const wine_name = String(req.query.wine_name ?? "").trim();
  if (!wine_name) {
    res.status(400).json({ error: "wine_name is required" });
    return;
  }
  const vintage = req.query.vintage ? String(req.query.vintage).trim() : null;

  const conditions = [
    sql`LOWER(${archiveWinesTable.wine_name}) = LOWER(${wine_name})`,
  ];
  if (vintage) {
    conditions.push(eq(archiveWinesTable.vintage, vintage));
  }

  const rows = await db
    .select({
      release_month: archiveReleaseCyclesTable.release_month,
      price: archiveWinesTable.price,
      vintage: archiveWinesTable.vintage,
    })
    .from(archiveWinesTable)
    .innerJoin(
      archiveReleaseCyclesTable,
      eq(archiveWinesTable.archive_cycle_id, archiveReleaseCyclesTable.id),
    )
    .where(and(...conditions))
    .orderBy(desc(archiveReleaseCyclesTable.release_month));

  const count = rows.length;
  const last_seen_month = count > 0 ? (rows[0].release_month ?? null) : null;

  const prices = rows
    .map((r) => (r.price != null ? parseFloat(String(r.price)) : null))
    .filter((p): p is number => p !== null && !isNaN(p));

  const vintages = [
    ...new Set(rows.map((r) => r.vintage).filter((v): v is string => v != null && v !== "")),
  ];

  res.json({ count, last_seen_month, prices, vintages });
});

export default router;
