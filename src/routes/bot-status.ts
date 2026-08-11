import { Router } from "express";
import { authMiddleware } from "./auth.js";
import { dbOps } from "../bot/database.js";
import { botManager } from "../bot/bot-manager.js";

const router = Router();

let botInfo: { id: number; first_name: string; username: string } | null = null;

async function fetchBotInfo() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json() as any;
    if (data.ok) botInfo = data.result;
  } catch {
    botInfo = null;
  }
}

fetchBotInfo();
setInterval(fetchBotInfo, 30000);

router.get("/bot/status", authMiddleware, (_req, res) => {
  res.json({
    online: botInfo !== null,
    enabled: dbOps.getBotEnabled(),
    running: botManager.running,
    botName: botInfo?.first_name ?? "Unknown",
    botUsername: botInfo?.username ?? "",
  });
});

router.post("/bot/toggle", authMiddleware, (_req, res) => {
  const current = dbOps.getBotEnabled();
  dbOps.setBotEnabled(!current);
  res.json({ enabled: !current });
});

router.post("/bot/start", authMiddleware, async (_req, res) => {
  try {
    await botManager.start();
    res.json({ ok: true, running: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Failed to start bot" });
  }
});

router.post("/bot/stop", authMiddleware, async (_req, res) => {
  try {
    await botManager.stop();
    res.json({ ok: true, running: false });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Failed to stop bot" });
  }
});

export default router;
