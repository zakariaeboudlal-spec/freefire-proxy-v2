import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import statsRouter from "./stats.js";
import botStatusRouter from "./bot-status.js";
import keysRouter from "./keys.js";
import sellersRouter from "./sellers.js";
import pricesRouter from "./prices.js";
import settingsRouter from "./settings.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(statsRouter);
router.use(botStatusRouter);
router.use(keysRouter);
router.use(sellersRouter);
router.use(pricesRouter);
router.use(settingsRouter);

export default router;
