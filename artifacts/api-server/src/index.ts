import app from "./app.js";
import { logger } from "./lib/logger.js";
import cron from "node-cron";
import { runScraper } from "./lib/scraper.js";
import { startAlertFlusher } from "./lib/alertFlusher.js";
import { sendMorningAlerts } from "./lib/email.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// Send morning reminders at 7am Eastern every Wednesday —
// the morning before preview wines go live for ordering on Thursday at 8:30am ET.
cron.schedule("0 7 * * 3", async () => {
  logger.info("Cron: Wednesday 7am ET morning alerts starting");
  try {
    const { sent } = await sendMorningAlerts();
    logger.info({ sent }, "Cron: 7am morning alerts complete");
  } catch (err) {
    logger.error({ err }, "Cron: 7am morning alerts failed");
  }
}, { timezone: "America/Toronto" });

// Backup run at 8am Eastern Wednesday in case 7am run missed anyone
cron.schedule("0 8 * * 3", async () => {
  logger.info("Cron: Wednesday 8am ET morning alerts starting");
  try {
    const { sent } = await sendMorningAlerts();
    logger.info({ sent }, "Cron: 8am morning alerts complete");
  } catch (err) {
    logger.error({ err }, "Cron: 8am morning alerts failed");
  }
}, { timezone: "America/Toronto" });

// Run scraper at 9am and 10am Eastern every Thursday —
// discovers new preview wines for the following Thursday's release.
cron.schedule("0 9 * * 4", async () => {
  logger.info("Cron: Thursday 9am ET scrape starting");
  try {
    const result = await runScraper();
    logger.info({ result: result.message }, "Cron: 9am scrape complete");
  } catch (err) {
    logger.error({ err }, "Cron: 9am scrape failed");
  }
}, { timezone: "America/Toronto" });

cron.schedule("0 10 * * 4", async () => {
  logger.info("Cron: Thursday 10am ET scrape starting");
  try {
    const result = await runScraper();
    logger.info({ result: result.message }, "Cron: 10am scrape complete");
  } catch (err) {
    logger.error({ err }, "Cron: 10am scrape failed");
  }
}, { timezone: "America/Toronto" });

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  logger.info("Cron jobs scheduled: Thursday 7am, 8am (morning alerts) and 9am, 10am (scraper) Eastern");
  startAlertFlusher();

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    logger.info({ keyPrefix: resendKey.slice(0, 8) + "..." }, "RESEND_API_KEY loaded");
  } else {
    logger.warn("RESEND_API_KEY is NOT set — emails will fail");
  }
});
