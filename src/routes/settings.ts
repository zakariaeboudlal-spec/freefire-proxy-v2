import { Router } from "express";
import fs from "node:fs";
import { dbOps } from "../bot/database.js";
import { authMiddleware } from "./auth.js";

const router = Router();

router.get("/settings/key-format", authMiddleware, (_req, res) => {
  res.json({ format: dbOps.getKeyFormat() });
});

router.put("/settings/key-format", authMiddleware, (req, res) => {
  const { format } = req.body;
  if (typeof format !== "string" || format.trim().length === 0) {
    res.status(400).json({ error: "format is required" });
    return;
  }
  dbOps.setKeyFormat(format.trim());
  res.json({ format: format.trim() });
});

router.get("/settings/cert", authMiddleware, (_req, res) => {
  res.json({ hasCert: dbOps.hasCert() });
});

router.post("/settings/cert", authMiddleware, (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  dbOps.setCert(content.trim());
  res.json({ ok: true });
});

router.delete("/settings/cert", authMiddleware, (_req, res) => {
  const certPath = dbOps.getCertPath();
  if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
  res.json({ ok: true });
});

router.get("/settings/proxy", authMiddleware, (_req, res) => {
  res.json(dbOps.getProxySettings());
});

router.put("/settings/proxy", authMiddleware, (req, res) => {
  const { ip, port } = req.body;
  if (typeof ip !== "string" || !ip.trim()) {
    res.status(400).json({ error: "ip is required" });
    return;
  }
  const current = dbOps.getProxySettings();
  const updated = {
    ip: ip.trim(),
    port: typeof port === "number" ? port : current.port,
    feature: "obb",
  };
  dbOps.setProxySettings(updated);
  res.json(updated);
});

router.get("/settings/star-prices", authMiddleware, (_req, res) => {
  res.json(dbOps.getStarPrices());
});

router.put("/settings/star-prices", authMiddleware, (req, res) => {
  const { type, duration_days, stars } = req.body;
  if (!type || !duration_days || typeof stars !== "number") {
    res.status(400).json({ error: "type, duration_days, stars required" });
    return;
  }
  dbOps.updateStarPrice(type, parseInt(duration_days), stars);
  res.json({ ok: true });
});

export default router;
