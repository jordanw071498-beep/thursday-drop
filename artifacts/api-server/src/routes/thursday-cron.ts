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
 * GET /api/cron/flush-pending-alerts
 *
 * Sends announcement digest emails to users whose 1-hour watchlist-add debounce
 * window has matured. Skips users whose window has not yet expired.
 *
 * This endpoint is the production-safe trigger for the digest flusher:
 *   - Replit/long-running server: also called internally every 15 min via setInterval
 *   - Vercel serverless: call this via a Vercel Cron Job (e.g. every 30 minutes)
 *   - Any other scheduler: curl https://<domain>/api/cron/flush-pending-alerts
 *
 * Protected by CRON_SECRET env var (same as /api/cron/thursday).
 */
router.get("/cron/flush-pending-alerts", async (req, res): Promise<void> => {
  if (!checkCronAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { sendPendingAlerts } = await import("../lib/email.js");
    const { sent } = await sendPendingAlerts({ bypassDigestWindow: false });
    logger.info({ sent }, "flush-pending-alerts cron: done");
    res.json({ success: true, sent });
  } catch (err) {
    logger.error({ err }, "flush-pending-alerts cron: failed");
    res.status(500).json({ error: String(err) });
  }
});

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
