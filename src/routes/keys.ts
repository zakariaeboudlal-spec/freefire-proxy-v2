import { Router } from "express";
import { dbOps } from "../bot/database.js";
import { authMiddleware } from "./auth.js";

const OWNER_ID = 7279931745;
const router = Router();

router.get("/keys", authMiddleware, async (_req, res) => {
  res.json(dbOps.getAllKeys());
});

router.post("/keys", authMiddleware, async (req, res) => {
  const { type, duration_days } = req.body;
  if (!type || !duration_days) {
    res.status(400).json({ error: "type and duration_days are required" });
    return;
  }
  const key = await dbOps.createKey(type, Number(duration_days), OWNER_ID);
  res.status(201).json(key);
});

router.post("/keys/batch", authMiddleware, async (req, res) => {
  const { type, duration_days, count } = req.body;
  if (!type || !duration_days) {
    res.status(400).json({ error: "type and duration_days are required" });
    return;
  }
  const qty = Math.max(1, Math.min(50, Number(count) || 1));
  const keys = await dbOps.createKeys(type, Number(duration_days), OWNER_ID, qty);
  res.status(201).json({ keys });
});

router.delete("/keys/:id", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const deleted = dbOps.deleteKeyById(id);
  if (!deleted) { res.status(404).json({ error: "Key not found" }); return; }
  res.json({ success: true });
});

router.post("/keys/:id/reset-ip", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const keys = await dbOps.getAllKeys();
  const key = keys.find((k) => k.id === id);
  if (!key) { res.status(404).json({ error: "Key not found" }); return; }
  const result = await dbOps.resetKeyIp(key.key);
  if (!result.ok) {
    if (result.reason === "max_reached") {
      res.status(429).json({ error: "Reset limit reached (max 4 resets per key)" });
    } else if (result.reason === "too_soon") {
      res.status(429).json({ error: `Too soon — wait ${result.retry_after_hours}h before next reset` });
    }
    return;
  }
  res.json({ success: true });
});

export default router;
