import app from "./app.js";
import { logger } from "./lib/logger.js";
import { botManager } from "./bot/bot-manager.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// Auto-start bot only if it was running before server restart
botManager.autoStart();

// The Railway proxy wipes its key list on every redeploy (keys.json is
// ephemeral). Re-sync every active key from the permanent database after
// boot so activated customers keep working across proxy redeployments.
setTimeout(async () => {
  try {
    // dynamic import to avoid starting the DB pool before app boot
    const { dbOps } = await import("./bot/database.js");
    if (typeof dbOps.syncAllActiveKeysToProxy === "function") {
      await dbOps.syncAllActiveKeysToProxy("pro");
    }
  } catch (err) {
    logger.error({ err }, "Failed to re-sync active keys to proxy");
  }
}, 20000).unref?.();

process.once("SIGINT", async () => {
  await botManager.stop();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await botManager.stop();
  process.exit(0);
});
