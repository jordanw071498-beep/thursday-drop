import { Router, type IRouter } from "express";
import { eq, sql, desc, and } from "drizzle-orm";
import {
  db,
  profilesTable,
  winesTable,
  releaseCyclesTable,
  alertsTable,
  watchlistItemsTable,
  watchlistCategoriesTable,
  emailSubscribersTable,
} from "@workspace/db";
import {
  GetAdminStatsResponse,
  TriggerScrapeResponse,
  SendAlertsResponse,
  SendWeeklyPicksBody,
  SendWeeklyPicksResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { getAuthProfile } from "../lib/auth.js";

const router: IRouter = Router();

/** Looks up by session_token (Bearer header) and checks is_admin. Returns profile or null. */
async function requireAdmin(req: any) {
  const profile = await getAuthProfile(req);
  if (!profile?.is_admin) return null;
  return profile;
}

router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [totalSubs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(emailSubscribersTable)
    .where(eq(emailSubscribersTable.subscribed, true));

  const [proSubs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(profilesTable)
    .where(eq(profilesTable.is_pro, true));

  const [totalWines] = await db.select({ count: sql<number>`count(*)` }).from(winesTable);
  const [totalReleases] = await db.select({ count: sql<number>`count(*)` }).from(releaseCyclesTable);

  const [pendingAlerts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(eq(alertsTable.announcement_alert_sent, false));

  const [realAlerts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)));

  const [testAlerts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, true)));

  const realUsersRows = await db
    .selectDistinct({ user_id: alertsTable.user_id })
    .from(alertsTable)
    .where(and(eq(alertsTable.announcement_alert_sent, false), eq(alertsTable.is_test, false)));

  const proCount = Number(proSubs?.count ?? 0);

  res.json(
    GetAdminStatsResponse.parse({
      total_subscribers: Number(totalSubs?.count ?? 0),
      pro_subscribers: proCount,
      mrr: proCount * 15,
      total_wines: Number(totalWines?.count ?? 0),
      total_releases: Number(totalReleases?.count ?? 0),
      pending_alerts: Number(pendingAlerts?.count ?? 0),
      pending_real_alerts: Number(realAlerts?.count ?? 0),
      pending_test_alerts: Number(testAlerts?.count ?? 0),
      pending_real_users: realUsersRows.length,
    }),
  );
});

router.get("/admin/alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rows = await db
    .select({
      id: alertsTable.id,
      wine_name: alertsTable.wine_name,
      user_email: profilesTable.email,
      program_label: releaseCyclesTable.program_label,
      release_opens_at: releaseCyclesTable.release_opens_at,
      announcement_alert_sent: alertsTable.announcement_alert_sent,
      sent_at: alertsTable.sent_at,
      morning_alert_sent: alertsTable.morning_alert_sent,
      morning_sent_at: alertsTable.morning_sent_at,
      is_test: alertsTable.is_test,
      created_at: alertsTable.created_at,
    })
    .from(alertsTable)
    .innerJoin(winesTable, eq(alertsTable.wine_id, winesTable.id))
    .innerJoin(releaseCyclesTable, eq(winesTable.release_cycle_id, releaseCyclesTable.id))
    .innerJoin(profilesTable, eq(alertsTable.user_id, profilesTable.id))
    .orderBy(desc(alertsTable.created_at))
    .limit(100);

  res.json({
    alerts: rows.map((r) => ({
      ...r,
      release_opens_at: r.release_opens_at?.toISOString() ?? null,
      sent_at: r.sent_at?.toISOString() ?? null,
      morning_sent_at: r.morning_sent_at?.toISOString() ?? null,
      created_at: r.created_at.toISOString(),
    })),
  });
});

router.post("/admin/scrape", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const testMode = req.body?.testMode === true;

  try {
    const scraper = await import("../lib/scraper.js");
    const result = await scraper.runScraper({ testMode });
    res.json(TriggerScrapeResponse.parse({ success: true, message: result.message, wines_found: result.wines_found }));
  } catch (err) {
    logger.error({ err }, "Scraper error");
    res.json(TriggerScrapeResponse.parse({ success: false, message: "Scraper failed. Check logs.", wines_found: 0 }));
  }
});

router.post("/admin/send-alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { confirm } = req.body ?? {};

  // Without confirm=true, return the real-user count so the frontend can show a warning
  if (!confirm) {
    const emailLib = await import("../lib/email.js");
    const counts = await emailLib.getPendingAlertCounts();
    res.json({
      success: false,
      requires_confirmation: true,
      pending_real_alerts: counts.real,
      pending_real_users: counts.realUsers,
      message: `${counts.real} real alerts pending for ${counts.realUsers} users. Send confirm=true to proceed.`,
    });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendPendingAlerts();
    res.json(SendAlertsResponse.parse({ success: true, sent: result.sent, message: `Sent ${result.sent} announcement alerts` }));
  } catch (err) {
    logger.error({ err }, "Send alerts error");
    res.json(SendAlertsResponse.parse({ success: false, sent: 0, message: "Failed to send alerts" }));
  }
});

router.post("/admin/send-morning-alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendMorningAlerts();
    res.json({ success: true, sent: result.sent, message: `Sent ${result.sent} morning alerts` });
  } catch (err) {
    logger.error({ err }, "Send morning alerts error");
    res.json({ success: false, sent: 0, message: "Failed to send morning alerts" });
  }
});

router.post("/admin/send-test-mode-alerts", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendTestModeAlerts();
    res.json({
      success: true,
      sent: result.sent,
      adminEmail: result.adminEmail,
      message: result.sent > 0
        ? `Sent ${result.sent} test alerts to ${result.adminEmail}`
        : "No pending test alerts to send",
    });
  } catch (err: any) {
    logger.error({ err }, "Send test mode alerts error");
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/admin/test-alert", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { email } = req.body ?? {};
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendTestAlert(email);
    logger.info({ resendResponses: result.responses }, "Test alert Resend responses");
    res.json({
      success: result.sent > 0,
      sent: result.sent,
      message: `Sent ${result.sent} test emails to ${email}`,
      resend_responses: result.responses,
    });
  } catch (err: any) {
    logger.error({ err }, "Test alert error");
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const users = await db
    .select({
      id: profilesTable.id,
      email: profilesTable.email,
      is_pro: profilesTable.is_pro,
      is_admin: profilesTable.is_admin,
      created_at: profilesTable.created_at,
    })
    .from(profilesTable)
    .orderBy(desc(profilesTable.created_at))
    .limit(200);

  res.json({
    users: users.map((u) => ({ ...u, created_at: u.created_at.toISOString() })),
  });
});

router.post("/admin/users/:id/toggle-pro", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const targetId = req.params.id;
  const [current] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, targetId))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [updated] = await db
    .update(profilesTable)
    .set({ is_pro: !current.is_pro })
    .where(eq(profilesTable.id, targetId))
    .returning();

  res.json({ id: updated.id, email: updated.email, is_pro: updated.is_pro });
});

router.get("/admin/watchlists", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Fetch all watchlist items with user email
  const items = await db
    .select({
      id: watchlistItemsTable.id,
      user_id: watchlistItemsTable.user_id,
      user_email: profilesTable.email,
      user_is_pro: profilesTable.is_pro,
      wine_name: watchlistItemsTable.wine_name,
      producer: watchlistItemsTable.producer,
      vintage: watchlistItemsTable.vintage,
      match_type: watchlistItemsTable.match_type,
      created_at: watchlistItemsTable.created_at,
    })
    .from(watchlistItemsTable)
    .leftJoin(profilesTable, eq(watchlistItemsTable.user_id, profilesTable.id))
    .orderBy(desc(watchlistItemsTable.created_at));

  // Fetch all watchlist categories with user email
  const categories = await db
    .select({
      id: watchlistCategoriesTable.id,
      user_id: watchlistCategoriesTable.user_id,
      user_email: profilesTable.email,
      user_is_pro: profilesTable.is_pro,
      category: watchlistCategoriesTable.category,
      created_at: watchlistCategoriesTable.created_at,
    })
    .from(watchlistCategoriesTable)
    .leftJoin(profilesTable, eq(watchlistCategoriesTable.user_id, profilesTable.id))
    .orderBy(desc(watchlistCategoriesTable.created_at));

  // Group into per-user structure
  const userMap = new Map<string, {
    user_id: string;
    email: string;
    is_pro: boolean;
    items: typeof items;
    categories: typeof categories;
  }>();

  for (const row of items) {
    const uid = row.user_id ?? "unknown";
    if (!userMap.has(uid)) {
      userMap.set(uid, { user_id: uid, email: row.user_email ?? "unknown", is_pro: row.user_is_pro ?? false, items: [], categories: [] });
    }
    userMap.get(uid)!.items.push(row);
  }
  for (const row of categories) {
    const uid = row.user_id;
    if (!userMap.has(uid)) {
      userMap.set(uid, { user_id: uid, email: row.user_email ?? "unknown", is_pro: row.user_is_pro ?? false, items: [], categories: [] });
    }
    userMap.get(uid)!.categories.push(row);
  }

  const users = Array.from(userMap.values())
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((u) => ({
      ...u,
      items: u.items.map((i) => ({ ...i, created_at: i.created_at.toISOString() })),
      categories: u.categories.map((c) => ({ ...c, created_at: c.created_at.toISOString() })),
    }));

  res.json({
    users,
    total_items: items.length,
    total_categories: categories.length,
    total_users: users.length,
  });
});

router.post("/admin/send-picks", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = SendWeeklyPicksBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendWeeklyPicks(parsed.data.subject, parsed.data.body);
    res.json(SendWeeklyPicksResponse.parse({ success: true, sent: result.sent, message: `Sent to ${result.sent} Pro subscribers` }));
  } catch (err) {
    logger.error({ err }, "Send weekly picks error");
    res.json(SendWeeklyPicksResponse.parse({ success: false, sent: 0, message: "Failed to send weekly picks" }));
  }
});

export default router;
