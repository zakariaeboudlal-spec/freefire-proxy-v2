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
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      bot.launch({
        allowedUpdates: ["message", "callback_query", "pre_checkout_query"],
      }).catch((err: unknown) => {
        logger.error({ err }, "Bot polling error");
        _running = false;
        dbOps.setBotRunning(false);
      });
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
