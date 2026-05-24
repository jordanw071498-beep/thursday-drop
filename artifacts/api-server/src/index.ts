import app from "./app.js";
import { logger } from "./lib/logger.js";
import cron from "node-cron";
import { runScraper } from "./lib/scraper.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// Run scraper at 9am and 10am Eastern every Thursday
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
  logger.info("Cron jobs scheduled: Thursday 9am and 10am Eastern");
});
