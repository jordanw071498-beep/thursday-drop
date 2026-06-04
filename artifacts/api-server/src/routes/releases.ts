import { Router, type IRouter } from "express";
import { eq, desc, asc, sql } from "drizzle-orm";
import { db, releaseCyclesTable, winesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import {
  ListReleasesResponse,
  GetLatestReleaseResponse,
  GetReleaseParams,
  GetReleaseResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeRelease(r: typeof releaseCyclesTable.$inferSelect) {
  return { ...r, scraped_at: r.scraped_at.toISOString() };
}

function serializeWine(w: typeof winesTable.$inferSelect) {
  return {
    ...w,
    score: w.score != null ? Number(w.score) : null,
    price: w.price != null ? Number(w.price) : null,
  };
}

router.get("/releases/active", async (_req, res): Promise<void> => {
  const now = new Date();

  const allCycles = await db
    .select()
    .from(releaseCyclesTable)
    .orderBy(desc(sql`program_id::integer`));

  const activeCycles = allCycles.filter((cycle) => {
    if (!cycle.closing_date) return true;
    const closing = new Date(cycle.closing_date);
    if (isNaN(closing.getTime())) return true;
    return closing >= now;
  });

  const programs = await Promise.all(
    activeCycles.map(async (cycle) => {
      const wines = await db
        .select()
        .from(winesTable)
        .where(eq(winesTable.release_cycle_id, cycle.id))
        .orderBy(asc(winesTable.id));
      return {
        release: serializeRelease(cycle),
        wines: wines.map(serializeWine),
      };
    }),
  );

  logger.info({ count: programs.length }, "Active releases returned");
  res.json({ programs });
});

router.get("/releases", async (_req, res): Promise<void> => {
  const releases = await db
    .select()
    .from(releaseCyclesTable)
    .orderBy(desc(releaseCyclesTable.scraped_at));
  res.json(ListReleasesResponse.parse(releases.map(serializeRelease)));
});

router.get("/releases/latest", async (_req, res): Promise<void> => {
  const [release] = await db
    .select()
    .from(releaseCyclesTable)
    .orderBy(desc(releaseCyclesTable.scraped_at))
    .limit(1);

  if (!release) {
    res.status(404).json({ error: "No releases found" });
    return;
  }

  const wines = await db
    .select()
    .from(winesTable)
    .where(eq(winesTable.release_cycle_id, release.id));

  res.json(
    GetLatestReleaseResponse.parse({
      release: serializeRelease(release),
      wines: wines.map(serializeWine),
    }),
  );
});

router.get("/releases/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetReleaseParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [release] = await db
    .select()
    .from(releaseCyclesTable)
    .where(eq(releaseCyclesTable.id, params.data.id));

  if (!release) {
    res.status(404).json({ error: "Release not found" });
    return;
  }

  const wines = await db
    .select()
    .from(winesTable)
    .where(eq(winesTable.release_cycle_id, release.id));

  res.json(
    GetReleaseResponse.parse({
      release: serializeRelease(release),
      wines: wines.map(serializeWine),
    }),
  );
});

export default router;
