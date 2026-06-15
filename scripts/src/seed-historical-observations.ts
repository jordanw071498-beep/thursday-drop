/**
 * seed-historical-observations.ts
 *
 * Populates historical_release_observations from three sources:
 *
 *   Pass 1 — Archive DB   (archive_wines JOIN archive_release_cycles)
 *   Pass 2 — Live wines   (wines JOIN release_cycles, back-fills pre-hook data)
 *   Pass 3 — Wayback/manual entries confirmed by Wayback Machine research
 *             that are absent from both archive and live tables
 *
 * ISOLATION CONTRACT — this script:
 *   - Imports ONLY: db, historicalReleaseObservationsTable, and source tables
 *   - Never imports or calls: runMatchingEngine, sendPendingAlerts,
 *     sendMorningAlerts, alertFlusher, Resend, or any email function
 *   - Never writes to: alerts, watchlist_items, wines, release_cycles,
 *     profiles, or any table other than historical_release_observations
 *   - All inserts use ON CONFLICT DO NOTHING — fully idempotent, safe to re-run
 */

import { db } from "@workspace/db";
import {
  historicalReleaseObservationsTable,
  archiveWinesTable,
  archiveReleaseCyclesTable,
  winesTable,
  releaseCyclesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

type ObsRow = typeof historicalReleaseObservationsTable.$inferInsert;
type Confidence = "high" | "medium" | "low";
type SourceMethod =
  | "live_scrape"
  | "archive_db"
  | "wayback"
  | "manual_email_confirmation"
  | "manual_research";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateWineKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deduplicates rows by the same key used in the DB unique index:
 *   (wine_key, COALESCE(vintage,''), COALESCE(bottle_size,''), program_id)
 *
 * When duplicates exist (e.g. archive rows with NULL bottle_size for different
 * formats), the row with the highest price is kept as the representative.
 * ON CONFLICT DO NOTHING is the final safety net at the DB level.
 */
function deduplicateBatch(rows: ObsRow[]): ObsRow[] {
  const map = new Map<string, ObsRow>();
  for (const row of rows) {
    const key = [
      row.wine_key,
      row.vintage ?? "",
      row.bottle_size ?? "",
      row.program_id,
    ].join("||");
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
    } else {
      // Keep the row with the higher price as the representative
      const existingPrice = parseFloat(String(existing.price ?? "0"));
      const rowPrice = parseFloat(String(row.price ?? "0"));
      if (rowPrice > existingPrice) map.set(key, row);
    }
  }
  return Array.from(map.values());
}

async function insertBatch(rows: ObsRow[], label: string): Promise<number> {
  if (rows.length === 0) return 0;
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db
      .insert(historicalReleaseObservationsTable)
      .values(chunk)
      .onConflictDoNothing();
    inserted += chunk.length;
    console.log(
      `  [${label}] chunk ${Math.floor(i / CHUNK) + 1}: ${chunk.length} rows sent (ON CONFLICT DO NOTHING)`,
    );
  }
  return inserted;
}

// ─── Pass 1: Archive DB ───────────────────────────────────────────────────────

async function seedFromArchive(): Promise<number> {
  console.log("\n── Pass 1: Archive DB (archive_wines + archive_release_cycles)");

  const rows = await db
    .select({
      wine_name:     archiveWinesTable.wine_name,
      wine_key:      archiveWinesTable.wine_key,
      producer:      archiveWinesTable.producer,
      vintage:       archiveWinesTable.vintage,
      bottle_size:   archiveWinesTable.bottle_size,
      lcbo_number:   archiveWinesTable.lcbo_number,
      price:         archiveWinesTable.price,
      score:         archiveWinesTable.score,
      score_source:  archiveWinesTable.score_source,
      source_url:    archiveWinesTable.source_url,
      program_id:    archiveReleaseCyclesTable.program_id,
      program_type:  archiveReleaseCyclesTable.program_type,
      program_label: archiveReleaseCyclesTable.program_label,
      release_month: archiveReleaseCyclesTable.release_month,
      closing_date:  archiveReleaseCyclesTable.closing_date,
      cycle_source_url: archiveReleaseCyclesTable.source_url,
    })
    .from(archiveWinesTable)
    .innerJoin(
      archiveReleaseCyclesTable,
      eq(archiveWinesTable.archive_cycle_id, archiveReleaseCyclesTable.id),
    );

  console.log(`  Found ${rows.length} archive wine rows`);

  const obsRows: ObsRow[] = rows.map((r) => ({
    wine_name:        r.wine_name,
    wine_key:         r.wine_key ?? generateWineKey(r.wine_name),
    producer:         r.producer,
    vintage:          r.vintage,
    bottle_size:      r.bottle_size,
    lcbo_number:      r.lcbo_number,
    price:            r.price,
    score:            r.score,
    score_source:     r.score_source,
    program_id:       r.program_id,
    program_type:     r.program_type,
    program_label:    r.program_label,
    release_opens_at: null,
    release_month:    r.release_month,
    closing_date:     r.closing_date,
    source_url:       r.source_url ?? r.cycle_source_url,
    confidence:       "high" satisfies Confidence,
    source_method:    "archive_db" satisfies SourceMethod,
  }));

  const deduped = deduplicateBatch(obsRows);
  console.log(`  After deduplication: ${deduped.length} rows`);

  return insertBatch(deduped, "archive_db");
}

// ─── Pass 2: Live wines back-fill ─────────────────────────────────────────────

async function seedFromLive(): Promise<number> {
  console.log("\n── Pass 2: Live wines (wines + release_cycles back-fill)");

  const rows = await db
    .select({
      wine_name:        winesTable.wine_name,
      wine_key:         winesTable.wine_key,
      producer:         winesTable.producer,
      vintage:          winesTable.vintage,
      bottle_size:      winesTable.bottle_size,
      lcbo_number:      winesTable.lcbo_number,
      price:            winesTable.price,
      score:            winesTable.score,
      score_source:     winesTable.score_source,
      buy_url:          winesTable.buy_url,
      closing_date:     winesTable.closing_date,
      program_id:       releaseCyclesTable.program_id,
      program_type:     releaseCyclesTable.program_type,
      program_label:    releaseCyclesTable.program_label,
      release_opens_at: releaseCyclesTable.release_opens_at,
    })
    .from(winesTable)
    .innerJoin(
      releaseCyclesTable,
      eq(winesTable.release_cycle_id, releaseCyclesTable.id),
    );

  console.log(`  Found ${rows.length} live wine rows`);

  const obsRows: ObsRow[] = rows.map((r) => {
    const openDate = r.release_opens_at;
    const releaseMonth = openDate
      ? `${openDate.getUTCFullYear()}-${String(openDate.getUTCMonth() + 1).padStart(2, "0")}`
      : null;

    return {
      wine_name:        r.wine_name,
      wine_key:         r.wine_key ?? generateWineKey(r.wine_name),
      producer:         r.producer,
      vintage:          r.vintage,
      bottle_size:      r.bottle_size,
      lcbo_number:      r.lcbo_number,
      price:            r.price,
      score:            r.score,
      score_source:     r.score_source,
      program_id:       r.program_id,
      program_type:     r.program_type,
      program_label:    r.program_label,
      release_opens_at: openDate ? openDate.toISOString() : null,
      release_month:    releaseMonth,
      closing_date:     r.closing_date,
      source_url:       r.buy_url,
      confidence:       "high" satisfies Confidence,
      source_method:    "live_scrape" satisfies SourceMethod,
    };
  });

  const deduped = deduplicateBatch(obsRows);
  console.log(`  After deduplication: ${deduped.length} rows`);

  return insertBatch(deduped, "live_scrape");
}

// ─── Pass 3: Wayback / manual-research entries ────────────────────────────────
//
// These are wines confirmed by direct Wayback Machine inspection that are
// absent from both archive_wines and wines tables. ON CONFLICT DO NOTHING
// means any row already present (from a future archive import) is safely skipped.
//
// Confidence key:
//   high   — exact price, vintage, score confirmed from a Wayback product row
//   medium — wine confirmed in program description; specific vintage/price not captured
//   low    — wine inferred from program context; not explicitly named

const WAYBACK_ENTRIES: ObsRow[] = [
  // ── Château Lafite Rothschild 2006 ─────────────────────────────────────────
  // Program 987 (Classics Collection, Jun 2023). Confirmed via Wayback Machine
  // capture of the live program page. Program 987 has 0 rows in archive_wines
  // because the archive scraper did not retrieve it.
  // Source: https://web.archive.org/web/20230611*/vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=987
  {
    wine_name:        "Château Lafite Rothschild 2006",
    wine_key:         "chateau lafite rothschild 2006",
    producer:         "Château Lafite Rothschild",
    vintage:          "2006",
    bottle_size:      "750 mL",
    lcbo_number:      null,
    price:            "2200.00",
    score:            "96.0",
    score_source:     "WE",
    program_id:       "987",
    program_type:     "monthly_collection",
    program_label:    "Classics Collection — June 2023",
    release_opens_at: null,
    release_month:    "2023-06",
    closing_date:     null,
    source_url:       "https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=987&lang=en",
    confidence:       "high" satisfies Confidence,
    source_method:    "wayback" satisfies SourceMethod,
  },

  // ── Solaia (program 1162, Apr 2025) ────────────────────────────────────────
  // April 2025 Cellar Collection. Program description explicitly names
  // "Solaia" as a featured wine. Wines sold out before the Apr 17 Wayback
  // capture, so vintage and price are unknown.
  {
    wine_name:        "Solaia",
    wine_key:         "solaia",
    producer:         "Marchesi Antinori",
    vintage:          null,
    bottle_size:      null,
    lcbo_number:      null,
    price:            null,
    score:            null,
    score_source:     null,
    program_id:       "1162",
    program_type:     "monthly_collection",
    program_label:    "Cellar Collection: April 2025",
    release_opens_at: null,
    release_month:    "2025-04",
    closing_date:     null,
    source_url:       "https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=1162&lang=en",
    confidence:       "medium" satisfies Confidence,
    source_method:    "wayback" satisfies SourceMethod,
  },

  // ── Gaja (program 1162, Apr 2025) ──────────────────────────────────────────
  // Same program description confirmed "Gaja" alongside Solaia.
  {
    wine_name:        "Gaja",
    wine_key:         "gaja",
    producer:         "Gaja",
    vintage:          null,
    bottle_size:      null,
    lcbo_number:      null,
    price:            null,
    score:            null,
    score_source:     null,
    program_id:       "1162",
    program_type:     "monthly_collection",
    program_label:    "Cellar Collection: April 2025",
    release_opens_at: null,
    release_month:    "2025-04",
    closing_date:     null,
    source_url:       "https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=1162&lang=en",
    confidence:       "medium" satisfies Confidence,
    source_method:    "wayback" satisfies SourceMethod,
  },

  // ── Tignanello (program 940, Dec 2022) ─────────────────────────────────────
  // Program 940 (Antinori special offer, Dec 2022) description confirmed
  // "Solaia, Tignanello and Guado al Tasso". archive_wines has 20 rows for
  // program 940 but did not capture individual Tignanello product rows —
  // wine sold out before the archive snapshot was taken.
  {
    wine_name:        "Tignanello",
    wine_key:         "tignanello",
    producer:         "Marchesi Antinori",
    vintage:          null,
    bottle_size:      null,
    lcbo_number:      null,
    price:            null,
    score:            null,
    score_source:     null,
    program_id:       "940",
    program_type:     "special_offers",
    program_label:    "Antinori special offer — Dec 2022",
    release_opens_at: null,
    release_month:    "2022-12",
    closing_date:     null,
    source_url:       "https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=940&lang=en",
    confidence:       "medium" satisfies Confidence,
    source_method:    "wayback" satisfies SourceMethod,
  },

  // ── Solaia (program 940, Dec 2022) ─────────────────────────────────────────
  // Same program 940 description; Solaia also sold out before archive snapshot.
  {
    wine_name:        "Solaia",
    wine_key:         "solaia",
    producer:         "Marchesi Antinori",
    vintage:          null,
    bottle_size:      null,
    lcbo_number:      null,
    price:            null,
    score:            null,
    score_source:     null,
    program_id:       "940",
    program_type:     "special_offers",
    program_label:    "Antinori special offer — Dec 2022",
    release_opens_at: null,
    release_month:    "2022-12",
    closing_date:     null,
    source_url:       "https://www.vintagesshoponline.com/vintages/Public/OrderProgramProducts.aspx?programId=940&lang=en",
    confidence:       "medium" satisfies Confidence,
    source_method:    "wayback" satisfies SourceMethod,
  },
];

async function seedWaybackEntries(): Promise<number> {
  console.log(`\n── Pass 3: Wayback/manual entries (${WAYBACK_ENTRIES.length} rows)`);
  const deduped = deduplicateBatch(WAYBACK_ENTRIES);
  return insertBatch(deduped, "wayback");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== seed-historical-observations ===");
  console.log("ISOLATION: writes only to historical_release_observations");
  console.log("ISOLATION: no alerting, matching, or email functions called\n");

  const t0 = Date.now();

  const archiveCount = await seedFromArchive();
  const liveCount    = await seedFromLive();
  const waybackCount = await seedWaybackEntries();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("\n=== Summary ===");
  console.log(`  Pass 1 (archive_db):   ${archiveCount} rows processed`);
  console.log(`  Pass 2 (live_scrape):  ${liveCount} rows processed`);
  console.log(`  Pass 3 (wayback):      ${waybackCount} rows processed`);
  console.log(`  Elapsed: ${elapsed}s`);
  console.log("\nDone. ON CONFLICT DO NOTHING — safe to re-run at any time.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
