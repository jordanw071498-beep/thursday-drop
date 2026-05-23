import { Router, type IRouter } from "express";
import healthRouter from "./health";
import releasesRouter from "./releases";
import winesRouter from "./wines";
import watchlistRouter from "./watchlist";
import emailRouter from "./email";
import stripeRouter from "./stripe";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(releasesRouter);
router.use(winesRouter);
router.use(watchlistRouter);
router.use(emailRouter);
router.use(stripeRouter);
router.use(adminRouter);

export default router;
