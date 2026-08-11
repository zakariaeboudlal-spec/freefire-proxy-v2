import { Router } from "express";
import { dbOps } from "../bot/database.js";
import { authMiddleware } from "./auth.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");

const router = Router();

router.get("/stats", authMiddleware, async (_req, res) => {
  const stats = await dbOps.getStats();
  const keys = dbOps.getAllKeys();
  const now = new Date();
  const expiredKeys = keys.filter((k) => new Date(k.expires_at) < now).length;
  const lockedKeys = keys.filter((k) => k.locked_ip !== null).length;
  res.json({
    totalKeys: stats.totalKeys,
    activeKeys: stats.activeKeys,
    expiredKeys,
    sellersCount: stats.sellersCount,
    lockedKeys,
  });
});

export default router;
