import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function checkCronAuth(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization ?? "";
  return auth === `Bearer ${secret}`;
}

/**
 * GET /api/cron/thursday
 *
 * Single combined Thursday job — safe to call multiple times (all steps are idempotent):
 *   1. Send morning reminders for wines whose release_opens_at is today (no-op if already sent)
 *   2. Run scraper for new Vintages wines (no-op if program already in DB)
 *   3. Send pending announcement alerts for watchlist matches (no-op if already sent)
 *
 * Scheduled twice in vercel.json (within Vercel Hobby's 2-cron limit):
 *   0 11 * * 4 = 7am ET  — catches morning reminders before ordering opens
 *   0 13 * * 4 = 9am ET  — catches new release wines + announcement alerts
 */
router.get("/cron/thursday", async (req, res): Promise<void> => {
  if (!checkCronAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  logger.info("Thursday cron started");
  const results: Record<string, unknown> = {};

  // Step 1: morning alerts
  try {
    const { sendMorningAlerts } = await import("../lib/email.js");
    const { sent } = await sendMorningAlerts();
    results.morning_alerts_sent = sent;
    logger.info({ sent }, "Thursday cron: morning alerts done");
  } catch (err) {
    logger.error({ err }, "Thursday cron: morning alerts failed");
    results.morning_alerts_error = String(err);
  }

  // Step 2: scraper
  try {
    const { runScraper } = await import("../lib/scraper.js");
    const result = await runScraper({ force: false, testMode: false });
    results.scraper = result.message;
    results.wines_found = result.wines_found;
    logger.info({ message: result.message }, "Thursday cron: scraper done");
  } catch (err) {
    logger.error({ err }, "Thursday cron: scraper failed");
    results.scraper_error = String(err);
  }

  // Step 3: announcement alerts (scraper auto-sends, but belt-and-suspenders)
  try {
    const { sendPendingAlerts } = await import("../lib/email.js");
    const { sent } = await sendPendingAlerts();
    results.announcement_alerts_sent = sent;
    logger.info({ sent }, "Thursday cron: announcement alerts done");
  } catch (err) {
    logger.error({ err }, "Thursday cron: announcement alerts failed");
    results.announcement_alerts_error = String(err);
  }

  logger.info({ results }, "Thursday cron complete");
  res.json({ success: true, ...results });
});

export default router;
