import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db, winesTable, releaseCyclesTable } from "@workspace/db";
import {
  ListWinesQueryParams,
  ListWinesResponse,
  GetWineParams,
  GetWineResponse,
  GetWineStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/wines/stats", async (_req, res): Promise<void> => {
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(winesTable);

  const avgResult = await db
    .select({ avg: sql<number>`avg(score::numeric)` })
    .from(winesTable)
    .where(sql`score is not null`);

  const regionsResult = await db
    .select({
      region: winesTable.region,
      count: sql<number>`count(*)`,
    })
    .from(winesTable)
    .where(sql`region is not null`)
    .groupBy(winesTable.region);

  const scoreDistribution = [
    { range: "95+", count: 0 },
    { range: "90-94", count: 0 },
    { range: "87-89", count: 0 },
    { range: "<87", count: 0 },
  ];

  const scoreBuckets = await db
    .select({
      bucket: sql<string>`
        case
          when score::numeric >= 95 then '95+'
          when score::numeric >= 90 then '90-94'
          when score::numeric >= 87 then '87-89'
          else '<87'
        end
      `,
      count: sql<number>`count(*)`,
    })
    .from(winesTable)
    .where(sql`score is not null`)
    .groupBy(sql`1`);

  for (const bucket of scoreBuckets) {
    const entry = scoreDistribution.find((d) => d.range === bucket.bucket);
    if (entry) entry.count = Number(bucket.count);
  }

  res.json(
    GetWineStatsResponse.parse({
      total_wines: Number(totalResult[0]?.count ?? 0),
      avg_score: avgResult[0]?.avg ? Number(avgResult[0].avg) : null,
      regions: regionsResult
        .filter((r) => r.region)
        .map((r) => ({
          region: r.region as string,
          count: Number(r.count),
        })),
      score_distribution: scoreDistribution,
    }),
  );
});

router.get("/wines", async (req, res): Promise<void> => {
  const parsed = ListWinesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { release_cycle_id, region, min_score, max_price, sold_out } =
    parsed.data;

  const conditions = [];

  if (release_cycle_id != null) {
    conditions.push(eq(winesTable.release_cycle_id, release_cycle_id));
  }
  if (region) {
    conditions.push(eq(winesTable.region, region));
  }
  if (min_score != null) {
    conditions.push(gte(sql`${winesTable.score}::numeric`, min_score));
  }
  if (max_price != null) {
    conditions.push(lte(sql`${winesTable.price}::numeric`, max_price));
  }
  if (sold_out != null) {
    conditions.push(eq(winesTable.sold_out, sold_out));
  }

  const wines =
    conditions.length > 0
      ? await db
          .select()
          .from(winesTable)
          .where(and(...conditions))
      : await db.select().from(winesTable);

  res.json(
    ListWinesResponse.parse(
      wines.map((w) => ({
        ...w,
        score: w.score != null ? Number(w.score) : null,
        price: w.price != null ? Number(w.price) : null,
      })),
    ),
  );
});

router.get("/wines/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetWineParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [wine] = await db
    .select()
    .from(winesTable)
    .where(eq(winesTable.id, params.data.id));

  if (!wine) {
    res.status(404).json({ error: "Wine not found" });
    return;
  }

  res.json(
    GetWineResponse.parse({
      ...wine,
      score: wine.score != null ? Number(wine.score) : null,
      price: wine.price != null ? Number(wine.price) : null,
    }),
  );
});

export default router;
