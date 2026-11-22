import { Router } from "express";
import healthRouter from "./health.js";
import conversionsRouter from "./conversions/index.js";

const router = Router();
router.use(healthRouter);
router.use(conversionsRouter);

export default router;
