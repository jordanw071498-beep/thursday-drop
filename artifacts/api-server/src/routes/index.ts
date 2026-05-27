import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import releasesRouter from "./releases";
import winesRouter from "./wines";
import watchlistRouter from "./watchlist";
import emailRouter from "./email";
import stripeRouter from "./stripe";
import adminRouter from "./admin";
import scrapeRouter from "./scrape";
import morningAlertsRouter from "./morning-alerts";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(accountRouter);
router.use(releasesRouter);
router.use(winesRouter);
router.use(watchlistRouter);
router.use(emailRouter);
router.use(stripeRouter);
router.use(scrapeRouter);
router.use(adminRouter);
router.use(morningAlertsRouter);

export default router;
