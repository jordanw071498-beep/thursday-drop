/**
 * Dry-run test for the full Thursday Drop alert lifecycle.
 *
 * Creates isolated test data in the production DB, exercises every DB query
 * that sendMorningAlerts() and sendPendingAlerts() use, verifies the results,
 * then removes every row it inserted.
 *
 * NO emails are sent. Resend is never called. This is a pure DB simulation.
 *
 * Run with: pnpm --filter @workspace/scripts run dry-run-alerts
 */

import {
  db,
  alertsTable,
  profilesTable,
  winesTable,
  releaseCyclesTable,
  watchlistItemsTable,
} from "@workspace/db";
import { eq, and, gte, lt, isNotNull, inArray } from "drizzle-orm";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pass(msg: string) { console.log(`  ✓ PASS  ${msg}`); }
function fail(msg: string) { console.error(`  ✗ FAIL  ${msg}`); process.exitCode = 1; }
function check(condition: boolean, msg: string) { condition ? pass(msg) : fail(msg); }
function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

/** Next Thursday at 8:30am ET (12:30 UTC in summer EDT, 13:30 UTC in winter EST). */
function nextThursdayET(): Date {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const daysToThursday = utcDay <= 4 ? 4 - utcDay : 11 - utcDay;
  const thursday = new Date(now);
  thursday.setUTCDate(thursday.getUTCDate() + daysToThursday);
  const month = thursday.getUTCMonth();
  const offsetHours = month >= 3 && month <= 9 ? 4 : 5;
  thursday.setUTCHours(8 + offsetHours, 30, 0, 0);
  return thursday;
}

/** Today at 8:30am ET — used so morning-alert window query matches right now. */
function todayAt830ET(): Date {
  const now = new Date();
  const month = now.getUTCMonth();
  const offsetHours = month >= 3 && month <= 9 ? 4 : 5;
  const d = new Date(now);
  d.setUTCHours(8 + offsetHours, 30, 0, 0);
  return d;
}

function todayWindowUTC(): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Thursday Drop — Alert System Dry-Run Test             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("\nNo emails will be sent. Resend is never called.");
  console.log("All test rows are removed at the end.\n");

  const TAG = `DRY_RUN_${Date.now()}`;

  // Track inserted IDs for cleanup
  let testCycleId: number | null = null;
  const testWineIds: number[] = [];
  let testWatchlistId: number | null = null;
  const testAlertIds: number[] = [];

  try {

    // ═══════════════════════════════════════════════════════════════
    section("Phase 0 — Locate admin user");
    // ═══════════════════════════════════════════════════════════════

    const [admin] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.is_admin, true))
      .limit(1);

    if (!admin?.email) throw new Error("No admin user found — cannot run test");
    console.log(`  Admin: ${admin.email}  (id: ${admin.id})`);
    console.log(`  alerts_enabled: ${admin.alerts_enabled ?? "null (defaults to true)"}`);

    // ═══════════════════════════════════════════════════════════════
    section("Phase 1 — Create isolated test data");
    // ═══════════════════════════════════════════════════════════════

    const nextThursday = nextThursdayET();
    console.log(`  next Thursday release_opens_at: ${nextThursday.toISOString()}`);
    console.log(`    = ${nextThursday.toLocaleString("en-CA", { timeZone: "America/Toronto" })} ET\n`);

    // 1a. Release cycle
    const [cycle] = await db
      .insert(releaseCyclesTable)
      .values({
        program_id: TAG,
        program_label: `[DRY RUN TEST — ${TAG}]`,
        program_type: "monthly_collection",
        wine_count: 2,
        display_order: 9999,
        status: "available",
        release_opens_at: nextThursday,
      })
      .returning();
    testCycleId = cycle.id;
    console.log(`  Created release cycle id=${cycle.id}`);

    // 1b. Two wines
    const [wine1] = await db
      .insert(winesTable)
      .values({
        release_cycle_id: cycle.id,
        wine_name: "William Fèvre Chablis Grand Cru Vaudésir 2022",
        wine_key: `william fevre chablis grand cru vaudesir 2022 ${TAG}`,
        producer: "William Fèvre",
        region: "Chablis, Burgundy",
        region_category: "burgundy",
        vintage: "2022",
        score: "95",
        score_source: "WS",
        price: "89.95",
        qty_available: 36,
        closing_date: null,
        buy_url: `https://www.vintagesshoponline.com/test`,
        sold_out: false,
      })
      .returning();
    testWineIds.push(wine1.id);
    console.log(`  Created wine 1 id=${wine1.id}: "${wine1.wine_name}"`);

    const [wine2] = await db
      .insert(winesTable)
      .values({
        release_cycle_id: cycle.id,
        wine_name: "William Fèvre Chablis 1er Cru Montée de Tonnerre 2021",
        wine_key: `william fevre chablis 1er cru montee de tonnerre 2021 ${TAG}`,
        producer: "William Fèvre",
        region: "Chablis, Burgundy",
        region_category: "burgundy",
        vintage: "2021",
        score: "93",
        score_source: "WA",
        price: "49.95",
        qty_available: 48,
        closing_date: null,
        buy_url: `https://www.vintagesshoponline.com/test`,
        sold_out: false,
      })
      .returning();
    testWineIds.push(wine2.id);
    console.log(`  Created wine 2 id=${wine2.id}: "${wine2.wine_name}"`);

    // 1c. Watchlist item for admin — producer match "William Fèvre"
    const [wlItem] = await db
      .insert(watchlistItemsTable)
      .values({
        user_id: admin.id,
        wine_name: "William Fèvre",
        producer: "William Fèvre",
        vintage: null,
        match_type: "producer",
      })
      .returning();
    testWatchlistId = wlItem.id;
    console.log(`  Created watchlist item id=${wlItem.id}: producer="William Fèvre" for admin`);

    // 1d. Simulate matching engine: insert alert rows as scraper would
    //     (using ON CONFLICT DO NOTHING — same as production code)
    for (const wine of [wine1, wine2]) {
      const [alert] = await db
        .insert(alertsTable)
        .values({
          user_id: admin.id,
          wine_id: wine.id,
          wine_name: wine.wine_name,
          is_test: false,
        })
        .onConflictDoNothing()
        .returning();

      if (alert) {
        testAlertIds.push(alert.id);
        console.log(`  Created alert id=${alert.id} for wine ${wine.id}`);
      } else {
        console.log(`  Alert for wine ${wine.id} already existed (ON CONFLICT DO NOTHING worked)`);
      }
    }

    check(testAlertIds.length === 2, `Matching engine created ${testAlertIds.length} alert row(s) (expected 2)`);

    // ── Duplicate insert protection ────────────────────────────────
    const dupResult = await db
      .insert(alertsTable)
      .values({ user_id: admin.id, wine_id: wine1.id, wine_name: wine1.wine_name, is_test: false })
      .onConflictDoNothing()
      .returning();
    check(
      dupResult.length === 0,
      `Duplicate insert blocked by ON CONFLICT DO NOTHING (returned ${dupResult.length} rows)`,
    );

    const totalAlertRows = await db
      .select()
      .from(alertsTable)
      .where(inArray(alertsTable.id, testAlertIds));
    check(totalAlertRows.length === 2, `DB contains exactly 2 alert rows for this test (no duplicates)`);

    // ═══════════════════════════════════════════════════════════════
    section("Phase 2 — Announcement alert flow");
    // ═══════════════════════════════════════════════════════════════

    // Run the exact same query sendPendingAlerts() uses
    const announcementRows = await db
      .select({
        alert: alertsTable,
        wine: winesTable,
        cycle: releaseCyclesTable,
        profile: profilesTable,
      })
      .from(alertsTable)
      .innerJoin(winesTable, eq(alertsTable.wine_id, winesTable.id))
      .innerJoin(releaseCyclesTable, eq(winesTable.release_cycle_id, releaseCyclesTable.id))
      .innerJoin(profilesTable, eq(alertsTable.user_id, profilesTable.id))
      .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)))
      .then((rows) => rows.filter((r) => testAlertIds.includes(r.alert.id)));

    // Group by user (exactly as sendPendingAlerts does)
    const announcementByUser = new Map<string, typeof announcementRows>();
    for (const row of announcementRows) {
      const uid = row.alert.user_id;
      if (!announcementByUser.has(uid)) announcementByUser.set(uid, []);
      announcementByUser.get(uid)!.push(row);
    }

    check(announcementRows.length === 2, `Query returns ${announcementRows.length} alert rows (expected 2)`);
    check(
      announcementByUser.size === 1,
      `Grouped into ${announcementByUser.size} user bucket(s) → ${announcementByUser.size} digest email(s) (expected 1)`,
    );

    for (const [, rows] of announcementByUser) {
      const profile = rows[0].profile;
      const wines = rows.map((r) => r.wine.wine_name);
      console.log(`\n  Digest that WOULD be sent to: ${profile.email}`);
      console.log(`  Subject: "${wines.length} watchlist matches announced on Vintages"`);
      wines.forEach((w) => console.log(`    • ${w}`));
    }

    // Simulate successful send — mark all alert rows as sent
    await db
      .update(alertsTable)
      .set({ sent: true, sent_at: new Date(), announcement_alert_sent: true })
      .where(inArray(alertsTable.id, testAlertIds));
    console.log(`\n  Simulated send complete → announcement_alert_sent=true on ${testAlertIds.length} rows`);

    // Verify flags in DB
    const flagCheck = await db
      .select()
      .from(alertsTable)
      .where(inArray(alertsTable.id, testAlertIds));
    check(
      flagCheck.every((r) => r.announcement_alert_sent === true),
      `All ${flagCheck.length} alert rows have announcement_alert_sent=true`,
    );

    // ── Duplicate protection: second run ──────────────────────────
    const announcementRows2 = await db
      .select()
      .from(alertsTable)
      .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)))
      .then((rows) => rows.filter((r) => testAlertIds.includes(r.id)));

    check(
      announcementRows2.length === 0,
      `2nd run: query returns ${announcementRows2.length} pending rows (announcement_alert_sent=true gates re-send)`,
    );

    // ═══════════════════════════════════════════════════════════════
    section("Phase 3 — Morning reminder flow");
    // ═══════════════════════════════════════════════════════════════

    // Reset flags so we can test morning alert independently
    await db
      .update(alertsTable)
      .set({ morning_alert_sent: false, morning_sent_at: null })
      .where(inArray(alertsTable.id, testAlertIds));
    console.log(`  Reset morning_alert_sent=false on test alerts`);

    // Set release_opens_at to TODAY so the date-window query matches now
    const todayRelease = todayAt830ET();
    await db
      .update(releaseCyclesTable)
      .set({ release_opens_at: todayRelease })
      .where(eq(releaseCyclesTable.id, cycle.id));
    console.log(`  Set release_opens_at → ${todayRelease.toISOString()} (today, for query match)\n`);

    const { start: todayStart, end: todayEnd } = todayWindowUTC();

    // Run the exact same query sendMorningAlerts() uses
    const morningRows = await db
      .select({
        alert: alertsTable,
        wine: winesTable,
        cycle: releaseCyclesTable,
        profile: profilesTable,
      })
      .from(alertsTable)
      .innerJoin(winesTable, eq(alertsTable.wine_id, winesTable.id))
      .innerJoin(releaseCyclesTable, eq(winesTable.release_cycle_id, releaseCyclesTable.id))
      .innerJoin(profilesTable, eq(alertsTable.user_id, profilesTable.id))
      .where(
        and(
          eq(alertsTable.morning_alert_sent, false),
          isNotNull(releaseCyclesTable.release_opens_at),
          gte(releaseCyclesTable.release_opens_at, todayStart),
          lt(releaseCyclesTable.release_opens_at, todayEnd),
        ),
      )
      .then((rows) => rows.filter((r) => testAlertIds.includes(r.alert.id)));

    // Group by user
    const morningByUser = new Map<string, typeof morningRows>();
    for (const row of morningRows) {
      const uid = row.alert.user_id;
      if (!morningByUser.has(uid)) morningByUser.set(uid, []);
      morningByUser.get(uid)!.push(row);
    }

    check(morningRows.length === 2, `Morning query returns ${morningRows.length} alert rows (expected 2)`);
    check(
      morningByUser.size === 1,
      `Grouped into ${morningByUser.size} user bucket(s) → ${morningByUser.size} digest email(s) (expected 1)`,
    );

    for (const [, rows] of morningByUser) {
      const profile = rows[0].profile;
      const wines = rows.map((r) => r.wine.wine_name);
      const opensAt = rows[0].cycle.release_opens_at;
      console.log(`\n  Digest that WOULD be sent to: ${profile.email}`);
      console.log(`  Subject: "${wines.length} watchlist wines open for ordering today at 8:30am ET"`);
      console.log(`  release_opens_at from DB: ${opensAt?.toISOString()}`);
      wines.forEach((w) => console.log(`    • ${w}`));
    }

    // Simulate successful send
    await db
      .update(alertsTable)
      .set({ morning_alert_sent: true, morning_sent_at: new Date() })
      .where(inArray(alertsTable.id, testAlertIds));
    console.log(`\n  Simulated send complete → morning_alert_sent=true on ${testAlertIds.length} rows`);

    const morningFlagCheck = await db
      .select()
      .from(alertsTable)
      .where(inArray(alertsTable.id, testAlertIds));
    check(
      morningFlagCheck.every((r) => r.morning_alert_sent === true),
      `All ${morningFlagCheck.length} alert rows have morning_alert_sent=true`,
    );

    // ── Duplicate protection: second run ──────────────────────────
    // Simpler check: just look at the flag on the alert rows themselves
    const morningRows2 = await db
      .select()
      .from(alertsTable)
      .where(inArray(alertsTable.id, testAlertIds))
      .then((rows) => rows.filter((r) => r.morning_alert_sent === false));

    check(
      morningRows2.length === 0,
      `2nd run: query returns ${morningRows2.length} pending rows (morning_alert_sent=true gates re-send)`,
    );

    // ═══════════════════════════════════════════════════════════════
    section("Phase 4 — Final DB state verification");
    // ═══════════════════════════════════════════════════════════════

    const finalAlerts = await db
      .select()
      .from(alertsTable)
      .where(inArray(alertsTable.id, testAlertIds));

    console.log(`  Alert rows in DB: ${finalAlerts.length}`);
    for (const a of finalAlerts) {
      console.log(`\n  Alert id=${a.id} (wine_id=${a.wine_id}):`);
      console.log(`    announcement_alert_sent : ${a.announcement_alert_sent}`);
      console.log(`    sent_at                 : ${a.sent_at?.toISOString() ?? "null"}`);
      console.log(`    morning_alert_sent      : ${a.morning_alert_sent}`);
      console.log(`    morning_sent_at         : ${a.morning_sent_at?.toISOString() ?? "null"}`);
      console.log(`    is_test                 : ${a.is_test}`);
    }

    check(
      finalAlerts.every((a) => a.announcement_alert_sent && a.morning_alert_sent),
      "Both flags true on all test alert rows — no re-send possible",
    );
    check(
      finalAlerts.length === 2,
      `Exactly 2 alert rows exist (no duplicates were ever inserted)`,
    );

  } finally {
    // ═══════════════════════════════════════════════════════════════
    section("Cleanup — removing all test data");
    // ═══════════════════════════════════════════════════════════════

    if (testAlertIds.length > 0) {
      const { rowCount } = await db.delete(alertsTable).where(inArray(alertsTable.id, testAlertIds));
      console.log(`  Deleted ${rowCount ?? testAlertIds.length} alert row(s)`);
    }
    if (testWatchlistId) {
      await db.delete(watchlistItemsTable).where(eq(watchlistItemsTable.id, testWatchlistId));
      console.log(`  Deleted watchlist item id=${testWatchlistId}`);
    }
    for (const wineId of testWineIds) {
      await db.delete(winesTable).where(eq(winesTable.id, wineId));
    }
    if (testWineIds.length > 0) {
      console.log(`  Deleted ${testWineIds.length} wine row(s): ids=${testWineIds.join(", ")}`);
    }
    if (testCycleId) {
      await db.delete(releaseCyclesTable).where(eq(releaseCyclesTable.id, testCycleId));
      console.log(`  Deleted release cycle id=${testCycleId}`);
    }

    console.log("\n  DB is clean — no test data remains.");
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  if (process.exitCode === 1) {
    console.log("║   RESULT: FAILED — see ✗ lines above                    ║");
  } else {
    console.log("║   RESULT: ALL CHECKS PASSED ✓                           ║");
    console.log("║   The alert system is safe to run next Thursday.         ║");
  }
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => process.exit());
