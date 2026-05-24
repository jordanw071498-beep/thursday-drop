import { Router, type IRouter } from "express";
import { runScraper } from "../lib/scraper.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function checkCronAuth(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization ?? "";
  return auth === `Bearer ${secret}`;
}

router.post("/scrape", async (req, res): Promise<void> => {
  if (!checkCronAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const force = req.query["force"] === "true" || req.body?.force === true;
  logger.info({ force }, "Scrape triggered via HTTP");

  try {
    const result = await runScraper({ force });
    res.json({
      success: true,
      message: result.message,
      wines_found: result.wines_found,
      programs: result.programs,
    });
  } catch (err: any) {
    logger.error({ err }, "Scraper HTTP trigger failed");
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
