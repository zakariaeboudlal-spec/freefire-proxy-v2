import { Router } from "express";
import { dbOps } from "../bot/database.js";
import { authMiddleware } from "./auth.js";

const router = Router();

router.get("/prices", authMiddleware, (_req, res) => {
  res.json(dbOps.getPrices());
});

router.put("/prices", authMiddleware, (req, res) => {
  const { type, duration_days, price } = req.body;
  if (!type || !duration_days || price === undefined) {
    res.status(400).json({ error: "type, duration_days, and price are required" });
    return;
  }
  dbOps.updatePrice(type, Number(duration_days), Number(price));
  const prices = dbOps.getPrices();
  const updated = prices.find((p) => p.type === type && p.duration_days === Number(duration_days));
  res.json(updated);
});

export default router;
