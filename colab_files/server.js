/**
 * Free Fire MITM Proxy Server — Google Colab edition
 * -----------------------------------------------------------
 * Runs inside Google Colab (free, no credit card).
 *  - Binds to process.env.PORT (default 19201) for game traffic
 *    (CONNECT tunnels + cache_res delivery)
 *  - Sync API on PORT + 1 for the Telegram bot (POST /sync-key,
 *    DELETE-style removal via {remove:true})
 *  - When launched in Colab the script also starts ngrok tcp (if
 *    NGROK_AUTH is set) and prints the public endpoint so the owner
 *    can paste it into the bot.
 *  - Keys are synced from the Telegram bot; when a key expires the
 *    bot removes it and the proxy relays nothing for that customer.
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { makeListener } from "./listener.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ------------------- configuration -------------------
const CFG = {
  targets: ["ff.garena.com", "ff.garena.co.id"],
  publicPort: Number(process.env.PORT) || 19201,
  publicFeature: "pro",
  keysFile: path.join(__dirname, "keys.json"),
};

// ------------------- key store -------------------
let keys = loadKeys();

function loadKeys() {
  try {
    return JSON.parse(fs.readFileSync(CFG.keysFile, "utf8"));
  } catch {
    return [];
  }
}

function saveKeys() {
  fs.writeFileSync(CFG.keysFile, JSON.stringify(keys, null, 2));
}

function findValidKey(clientIp) {
  const now = Date.now();
  return keys.find(
    (k) => k.expired_at > now && (k.status === "active" || !k.status),
  );
}

// ------------------- key sync from bot -------------------
function syncKey(req, res, body) {
  try {
    const { key, ip, expired_at, feature, remove } = JSON.parse(body || "{}");
    if (!key) {
      res.writeHead(400);
      return res.end(JSON.stringify({ ok: false, error: "key required" }));
    }
    if (remove) {
      keys = keys.filter((k) => k.key !== key);
      saveKeys();
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true, removed: true }));
    }
    const idx = keys.findIndex((k) => k.key === key);
    const entry = {
      key,
      locked_ip: ip ?? "any",
      expired_at: expired_at ?? Date.now() + 86400000,
      feature: feature ?? "pro",
      status: "active",
      synced_at: Date.now(),
    };
    if (idx >= 0) keys[idx] = entry;
    else keys.push(entry);
    saveKeys();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, total: keys.length }));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ ok: false, error: String(e) }));
  }
}

// ------------------- embedded mod file server -------------------
loadModFileInListener();
function loadModFileInListener() {
  // listener.js loads cache_res on its own the first time it is imported;
  // the mod file is next to this script so no extra path needed.
}

// ------------------- sync HTTP endpoints -------------------
const SYNC_PORT = Number(process.env.PORT) + 1 || 19202;
const syncServer = http.createServer((req, res) => {
  if ((req.method === "POST" || req.method === "DELETE") && req.url === "/sync-key") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => syncKey(req, res, body));
    return;
  }
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, keys: keys.length }));
  }
  res.writeHead(404);
  res.end("Free Fire Proxy");
});

// ------------------- tunnel helper (Colab only) -------------------
async function startTunnel() {
  const auth = process.env.NGROK_AUTH || "";
  if (!auth) {
    console.log("[TUNNEL] No NGROK_AUTH — start the tunnel manually (see notebook).");
    return null;
  }
  try {
    const bin = process.env.NGROK_BIN || "ngrok";
    execSync(`(${bin} config add-authtoken ${auth} 2>/dev/null); true`);
    execSync(
      `nohup ${bin} tcp ${CFG.publicPort} --log=stdout > /tmp/ngrok.log 2>&1 &`,
    );
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const log = fs.readFileSync("/tmp/ngrok.log", "utf8");
        const m = log.match(/tcp:\/\/([0-9a-z.-]+):(\d+)/);
        if (m) {
          console.log(`[TUNNEL] Public endpoint: tcp://${m[1]}:${m[2]}`);
          return m[1];
        }
      } catch {}
    }
    console.log("[TUNNEL] ngrok URL not ready yet — check /tmp/ngrok.log");
  } catch (e) {
    console.log(`[TUNNEL] ngrok failed: ${e.message}`);
  }
  return null;
}

// ------------------- start listeners -------------------
makeListener({
  port: CFG.publicPort,
  feature: CFG.publicFeature,
  keysFn: loadKeys,
  fs,
  path,
  modFile: path.join(__dirname, "cache_res"),
});

syncServer.listen(SYNC_PORT, "0.0.0.0", () => {
  console.log(`[LISTEN] sync API on 0.0.0.0:${SYNC_PORT}`);
});

console.log(
  `FF MITM Proxy running on port ${CFG.publicPort} (feature=${CFG.publicFeature})`,
);

const host = await startTunnel();
if (host) {
  console.log(`\n📌 Host for the bot / customers: ${host}  Port: ${CFG.publicPort}`);
}
console.log(`\n🔌 Bot sync endpoint: http://localhost:${SYNC_PORT}/sync-key`);
