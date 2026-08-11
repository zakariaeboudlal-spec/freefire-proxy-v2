import { dbOps } from "./database.js";
import { logger } from "../lib/logger.js";

let botInstance: import("telegraf").Telegraf | null = null;
let _running = false;

export const botManager = {
  get running() { return _running; },

  async start(): Promise<void> {
    if (_running) return;
    const { default: bot } = await import("./bot.js");
    botInstance = bot;
    try {
      // Drop stale webhook so no concurrent polling survives between
      // Render restarts/hibernation. Keep pending updates so in-flight
      // activation flows are not lost for users.
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });
      // Start polling from the latest known update to avoid a 409 conflict
      // with a stale polling session that is still alive on Telegram's side.
      let startOffset = 0;
      try {
        const recent = await bot.telegram.getUpdates({ limit: 1, timeout: 0 });
        if (recent.length > 0) {
          startOffset = recent[recent.length - 1].update_id + 1;
          logger.info({ startOffset }, "Starting polling from latest update");
        }
      } catch {
        startOffset = 0;
      }
      bot.launch({
        allowedUpdates: ["message", "callback_query", "pre_checkout_query"],
      }).catch((err: unknown) => {
        logger.error({ err }, "Bot polling error");
        _running = false;
        dbOps.setBotRunning(false);
      });
      // Telegraf always starts polling from offset 0, which races with a
      // stale Telegram polling session and causes 409. Jump to the latest
      // known update right after launch so old sessions drain on their own.
      if (startOffset > 0 && (bot as any).polling) {
        (bot as any).polling.offset = startOffset;
      }
      _running = true;
      dbOps.setBotRunning(true);
      logger.info("Telegram bot started via BotManager");
      // Liveness guard: if polling silently dies (Node 24 fetch conflict),
      // detect it after 30s and restart.
      setTimeout(async () => {
        try {
          const info = await bot.telegram.getMe();
          logger.info({ bot: info.username }, "Bot polling alive check");
        } catch (err) {
          logger.warn({ err }, "Polling appears dead, restarting");
          _running = false;
          dbOps.setBotRunning(false);
          await botManager.start();
        }
      }, 30_000);
    } catch (err) {
      logger.error({ err }, "Failed to start bot");
      throw err;
    }
  },

  async stop(): Promise<void> {
    if (!_running || !botInstance) return;
    try {
      botInstance.stop("manual_stop");
    } catch {
      // ignore
    }
    _running = false;
    dbOps.setBotRunning(false);
    logger.info("Telegram bot stopped via BotManager");
  },

  async autoStart(): Promise<void> {
    // Always auto-start when enabled (Render free tier hibernates and
    // SIGTERMs the process, so getBotRunning() would be stale false).
    if (dbOps.getBotEnabled()) {
      logger.info("Auto-starting bot (enabled)");
      await botManager.start().catch((err: unknown) => {
        logger.error({ err }, "Auto-start failed");
      });
    }
  },
};
