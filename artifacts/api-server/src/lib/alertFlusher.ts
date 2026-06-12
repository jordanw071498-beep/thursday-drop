import { sendPendingAlerts } from "./email.js";
import { logger } from "./logger.js";

const FLUSH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Starts the background alert flush loop.
 *
 * Every 15 minutes, calls sendPendingAlerts with bypassDigestWindow: false.
 * This sends one bundled digest to any user whose 1-hour watchlist-add window
 * has matured, while leaving other users alone until their window expires.
 *
 * The Thursday cron and admin panel bypass this window entirely — they always
 * send immediately to all users with pending alerts.
 */
export function startAlertFlusher(): void {
  setInterval(async () => {
    try {
      const { sent } = await sendPendingAlerts({ bypassDigestWindow: false });
      if (sent > 0) {
        logger.info({ sent }, "Alert flusher: dispatched digest(s) for matured windows");
      }
    } catch (err) {
      logger.error({ err }, "Alert flusher: error during flush");
    }
  }, FLUSH_INTERVAL_MS);

  logger.info({ intervalMs: FLUSH_INTERVAL_MS }, "Alert flusher started — checking every 15 minutes");
}
