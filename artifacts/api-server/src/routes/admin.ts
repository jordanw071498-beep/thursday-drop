import { Router, type IRouter } from "express";
import { eq, sql, count } from "drizzle-orm";
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

  const [totalWines] = await db
    .select({ count: sql<number>`count(*)` })
    .from(winesTable);

  const [totalReleases] = await db
    .select({ count: sql<number>`count(*)` })
    .from(releaseCyclesTable);

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

router.post("/admin/scrape", async (req, res): Promise<void> => {
  const userId = getAdminUserId(req);
  if (!userId || !(await isAdmin(userId))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const scraper = await import("../lib/scraper.js");
    const result = await scraper.runScraper();

    res.json(
      TriggerScrapeResponse.parse({
        success: true,
        message: result.message,
        wines_found: result.wines_found,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Scraper error");
    res.json(
      TriggerScrapeResponse.parse({
        success: false,
        message: "Scraper failed. Check logs.",
        wines_found: 0,
      }),
    );
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

    res.json(
      SendAlertsResponse.parse({
        success: true,
        sent: result.sent,
        message: `Sent ${result.sent} alerts`,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Send alerts error");
    res.json(
      SendAlertsResponse.parse({
        success: false,
        sent: 0,
        message: "Failed to send alerts",
      }),
    );
  }
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
    const result = await emailLib.sendWeeklyPicks(
      parsed.data.subject,
      parsed.data.body,
    );

    res.json(
      SendWeeklyPicksResponse.parse({
        success: true,
        sent: result.sent,
        message: `Sent to ${result.sent} Pro subscribers`,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Send weekly picks error");
    res.json(
      SendWeeklyPicksResponse.parse({
        success: false,
        sent: 0,
        message: "Failed to send weekly picks",
      }),
    );
  }
});

export default router;
