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

process.once("SIGINT", async () => {
  await botManager.stop();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await botManager.stop();
  process.exit(0);
});
