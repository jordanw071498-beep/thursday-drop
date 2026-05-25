import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  profilesTable,
  winesTable,
  releaseCyclesTable,
  alertsTable,
  watchlistItemsTable,
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

const router: IRouter = Router();

function getAdminUserId(req: any): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  return authHeader.replace("Bearer ", "") || null;
}

async function isAdmin(userId: string): Promise<boolean> {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);
  return profile?.is_admin ?? false;
}

router.get("/admin/stats", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
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
    .where(eq(alertsTable.sent, false));

  const proCount = Number(proSubs?.count ?? 0);

  res.json(
    GetAdminStatsResponse.parse({
      total_subscribers: Number(totalSubs?.count ?? 0),
      pro_subscribers: proCount,
      mrr: proCount * 15,
      total_wines: Number(totalWines?.count ?? 0),
      total_releases: Number(totalReleases?.count ?? 0),
      pending_alerts: Number(pendingAlerts?.count ?? 0),
    }),
  );
});

router.get("/admin/alerts", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
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
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const scraper = await import("../lib/scraper.js");
    const result = await scraper.runScraper();
    res.json(TriggerScrapeResponse.parse({ success: true, message: result.message, wines_found: result.wines_found }));
  } catch (err) {
    logger.error({ err }, "Scraper error");
    res.json(TriggerScrapeResponse.parse({ success: false, message: "Scraper failed. Check logs.", wines_found: 0 }));
  }
});

router.post("/admin/send-alerts", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
    res.status(401).json({ error: "Unauthorized" });
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
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
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

router.post("/admin/test-alert", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Send test emails to the admin's own email address
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, userId))
    .limit(1);

  if (!profile?.email) {
    res.status(400).json({ error: "No email on admin profile" });
    return;
  }

  try {
    const emailLib = await import("../lib/email.js");
    const result = await emailLib.sendTestAlert(profile.email);
    res.json({ success: true, sent: result.sent, message: `Sent ${result.sent} test emails to ${profile.email}` });
  } catch (err: any) {
    logger.error({ err }, "Test alert error");
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
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
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
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

router.post("/admin/send-picks", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
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
