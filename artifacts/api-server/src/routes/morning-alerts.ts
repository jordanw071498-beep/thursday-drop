import { Router, type IRouter } from "express";
import { sendMorningAlerts } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function checkCronAuth(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization ?? "";
  return auth === `Bearer ${secret}`;
}

/**
 * POST /api/send-morning-alerts
 *
 * Finds all alerts where morning_alert_sent = false and release_opens_at is today.
 * Should be called at 7:00am and 8:00am Eastern every Thursday.
 *
 * Cron schedule (external):
 *   7am ET Thu:  0 12 * * 4   (UTC)
 *   8am ET Thu:  0 13 * * 4   (UTC)
 */
router.post("/send-morning-alerts", async (req, res): Promise<void> => {
  if (!checkCronAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  logger.info("Morning alerts cron triggered");

  try {
    const { sent } = await sendMorningAlerts();
    logger.info({ sent }, "Morning alerts dispatched");
    res.json({ success: true, sent, message: `Sent ${sent} morning alerts` });
  } catch (err: any) {
    logger.error({ err }, "Morning alerts cron failed");
    res.status(500).json({ success: false, sent: 0, error: err.message });
  }
});

export default router;
