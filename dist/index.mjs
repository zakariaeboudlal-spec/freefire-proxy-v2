import { createRequire } from 'module'; const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/bot/database.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
function loadFile(filename, defaultVal) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  } catch {
    return defaultVal;
  }
}
function saveFile(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}
function getPool() {
  if (!pgPool) {
    pgPool = new pg.Pool({ connectionString: PG_URL, max: 5 });
    pgPool.on("error", () => {
      pgReady = false;
    });
  }
  return pgPool;
}
async function ensureSchema() {
  if (pgReady || !USE_PG) return;
  try {
    const pool = getPool();
    await pool.query(`CREATE TABLE IF NOT EXISTS ff_keys (
      key_value TEXT PRIMARY KEY,
      key_type TEXT NOT NULL DEFAULT 'daily',
      duration_days INTEGER NOT NULL DEFAULT 1,
      activated_at TIMESTAMP,
      expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '1 day',
      device_ip TEXT,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      user_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      locked_ip TEXT,
      reset_count INTEGER NOT NULL DEFAULT 0,
      last_reset_at TIMESTAMP
    )`);
    pgReady = true;
  } catch {
    pgReady = false;
  }
}
function keyRowToKey(row) {
  return {
    id: Number(row.key_value.replace(/[^0-9]/g, "").slice(0, 8) || "0"),
    key: String(row.key_value),
    type: String(row.key_type ?? "daily"),
    duration_days: Number(row.duration_days ?? 1),
    expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : (/* @__PURE__ */ new Date(0)).toISOString(),
    created_by: Number(row.user_id ?? 0),
    is_active: row.active === true || row.active === "t",
    created_at: row.created_at ? new Date(row.created_at).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
    locked_ip: row.locked_ip ?? null,
    reset_count: Number(row.reset_count ?? 0),
    last_reset_at: row.last_reset_at ? new Date(row.last_reset_at).toISOString() : null
  };
}
function rowToKey(keyStr, ktype, days, createdBy) {
  return {
    id: 0,
    key: keyStr,
    type: ktype,
    duration_days: days,
    expires_at: new Date(Date.now() + days * 864e5).toISOString(),
    created_by: createdBy,
    is_active: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    locked_ip: null,
    reset_count: 0,
    last_reset_at: null
  };
}
function loadData() {
  const keys = loadFile("keys.json", []).map((k) => ({
    locked_ip: null,
    reset_count: 0,
    last_reset_at: null,
    ...k
  }));
  const sellers = loadFile("sellers.json", []);
  const prices = loadFile("prices.json", [
    { type: "basic", duration_days: 1, price: 1 },
    { type: "basic", duration_days: 7, price: 2 },
    { type: "basic", duration_days: 30, price: 3 },
    { type: "pro", duration_days: 1, price: 2 },
    { type: "pro", duration_days: 7, price: 4 },
    { type: "pro", duration_days: 30, price: 6 }
  ]);
  const nextKeyId = loadFile("nextKeyId.json", 1);
  const keyFormat = loadFile("keyFormat.json", DEFAULT_KEY_FORMAT);
  return { keys, sellers, prices, nextKeyId, keyFormat };
}
function saveKeys(keys, nextKeyId) {
  saveFile("keys.json", keys);
  saveFile("nextKeyId.json", nextKeyId);
}
function saveSellers(sellers) {
  saveFile("sellers.json", sellers);
}
function savePrices(prices) {
  saveFile("prices.json", prices);
}
function generateKeyStr(format) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const fmt = format ?? loadFile("keyFormat.json", DEFAULT_KEY_FORMAT);
  return fmt.split("").map((ch) => ch === "X" ? chars[Math.floor(Math.random() * chars.length)] : ch).join("");
}
function getExpiresAt(days) {
  const date = /* @__PURE__ */ new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
var __dirname, DATA_DIR, RESET_MAX, RESET_COOLDOWN_HOURS, PROXY_SERVER, DEFAULT_PROXY, DEFAULT_STAR_PRICES, PG_URL, USE_PG, pgPool, pgReady, DEFAULT_KEY_FORMAT, dbOps;
var init_database = __esm({
  "src/bot/database.ts"() {
    __dirname = path.dirname(fileURLToPath(import.meta.url));
    DATA_DIR = path.resolve(__dirname, "../data");
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    RESET_MAX = 4;
    RESET_COOLDOWN_HOURS = 3;
    PROXY_SERVER = {
      tcp: "sakura.proxy.rlwy.net:19201",
      syncUrl: "https://ff-mitm-proxy-production.up.railway.app/sync-key"
    };
    DEFAULT_PROXY = {
      ip: "sakura.proxy.rlwy.net",
      port: 19201,
      feature: "obb"
    };
    DEFAULT_STAR_PRICES = [
      { type: "basic", duration_days: 1, stars: 50 },
      { type: "basic", duration_days: 7, stars: 150 },
      { type: "basic", duration_days: 30, stars: 400 },
      { type: "pro", duration_days: 1, stars: 100 },
      { type: "pro", duration_days: 7, stars: 300 },
      { type: "pro", duration_days: 30, stars: 700 }
    ];
    PG_URL = process.env.DATABASE_PUBLIC_URL || "";
    USE_PG = !!PG_URL;
    pgPool = null;
    pgReady = false;
    DEFAULT_KEY_FORMAT = "FF-XXXX-XXXX-XXXX";
    dbOps = {
      async createKey(type, durationDays, createdBy) {
        await ensureSchema();
        let keyStr = generateKeyStr();
        if (USE_PG && pgReady) {
          let exists = await getPool().then(
            (p) => p.query("SELECT 1 FROM ff_keys WHERE key_value = $1", [keyStr]).then((r) => r.rows.length > 0).catch(() => false)
          );
          while (exists) {
            keyStr = generateKeyStr();
            exists = await getPool().then(
              (p) => p.query("SELECT 1 FROM ff_keys WHERE key_value = $1", [keyStr]).then((r) => r.rows.length > 0).catch(() => false)
            );
          }
          const key = rowToKey(keyStr, type, durationDays, createdBy);
          return key;
        }
        const { keys, nextKeyId } = loadData();
        while (keys.find((k) => k.key === keyStr)) keyStr = generateKeyStr();
        const newKey = {
          id: nextKeyId,
          key: keyStr,
          type,
          duration_days: durationDays,
          expires_at: getExpiresAt(durationDays),
          created_by: createdBy,
          is_active: true,
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          locked_ip: null,
          reset_count: 0,
          last_reset_at: null
        };
        keys.push(newKey);
        saveKeys(keys, nextKeyId + 1);
        return newKey;
      },
      async createKeys(type, durationDays, createdBy, count) {
        await ensureSchema();
        if (USE_PG && pgReady) {
          const pool = getPool();
          const created2 = [];
          for (let i = 0; i < count; i++) {
            let keyStr = generateKeyStr();
            while (await pool.query("SELECT 1 FROM ff_keys WHERE key_value = $1", [keyStr]).then((r) => r.rows.length > 0).catch(() => false)) {
              keyStr = generateKeyStr();
            }
            const key = rowToKey(keyStr, type, durationDays, createdBy);
            await pool.query(
              `INSERT INTO ff_keys (key_value, key_type, duration_days, expires_at, active, user_id)
           VALUES ($1, $2, $3, $4, FALSE, $5)
           ON CONFLICT (key_value) DO NOTHING`,
              [keyStr, type, durationDays, new Date(Date.now() + durationDays * 864e5), String(createdBy)]
            );
            created2.push(key);
          }
          return created2;
        }
        const { keys, nextKeyId } = loadData();
        const created = [];
        let idCounter = nextKeyId;
        for (let i = 0; i < count; i++) {
          let keyStr = generateKeyStr();
          while (keys.find((k) => k.key === keyStr) || created.find((k) => k.key === keyStr)) {
            keyStr = generateKeyStr();
          }
          const newKey = {
            id: idCounter++,
            key: keyStr,
            type,
            duration_days: durationDays,
            expires_at: getExpiresAt(durationDays),
            created_by: createdBy,
            is_active: true,
            created_at: (/* @__PURE__ */ new Date()).toISOString(),
            locked_ip: null,
            reset_count: 0,
            last_reset_at: null
          };
          keys.push(newKey);
          created.push(newKey);
        }
        saveKeys(keys, idCounter);
        return created;
      },
      async checkKey(keyStr) {
        await ensureSchema();
        if (USE_PG && pgReady) {
          const pool = getPool();
          try {
            const res = await pool.query(
              `SELECT * FROM ff_keys WHERE key_value = $1 AND active = TRUE AND expires_at > NOW()`,
              [keyStr]
            );
            if (res.rows.length === 0) return null;
            const key = keyRowToKey(res.rows[0]);
            key.is_active = true;
            return key;
          } catch {
          }
        }
        const { keys } = loadData();
        return keys.find((k) => k.key === keyStr && k.is_active) ?? null;
      },
      async lockKeyToIp(keyStr, ip) {
        await ensureSchema();
        if (USE_PG && pgReady) {
          const pool = getPool();
          const res = await pool.query(`UPDATE ff_keys SET device_ip = $1, locked_ip = $1 WHERE key_value = $2`, [ip, keyStr]);
          return (res.rowCount ?? 0) > 0;
        }
        const { keys, nextKeyId } = loadData();
        const key = keys.find((k) => k.key === keyStr);
        if (!key) return false;
        key.locked_ip = ip;
        saveKeys(keys, nextKeyId);
        return true;
      },
      // Sync an active key to the Railway proxy server so the proxy relays
      // game traffic for it. Returns true on success (errors are logged only).
      async syncKeyToProxy(keyStr, feature = "obb") {
        const key = await dbOps.getKeyByValue(keyStr);
        if (!key || !key.is_active || new Date(key.expires_at) <= /* @__PURE__ */ new Date()) {
          return false;
        }
        const expiredAtMs = new Date(key.expires_at).getTime();
        try {
          const res = await fetch(PROXY_SERVER.syncUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: keyStr, ip: "any", expired_at: expiredAtMs, feature }),
            signal: AbortSignal.timeout(8e3)
          });
          if (!res.ok) {
            console.error("Proxy sync failed", { status: res.status });
            return false;
          }
          return true;
        } catch (err) {
          console.error("Proxy sync error", err);
          return false;
        }
      },
      // Remove a key from the proxy so it relays nothing for it anymore.
      async removeKeyFromProxy(keyStr) {
        try {
          const res = await fetch(PROXY_SERVER.syncUrl, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: keyStr }),
            signal: AbortSignal.timeout(8e3)
          });
          return res.ok;
        } catch {
          return false;
        }
      },
      async resetKeyIp(keyStr) {
        await ensureSchema();
        if (USE_PG && pgReady) {
          const pool = getPool();
          const res = await pool.query(`SELECT reset_count, last_reset_at FROM ff_keys WHERE key_value = $1`, [keyStr]);
          if (res.rows.length === 0) return { ok: false, reason: "not_found" };
          const { reset_count, last_reset_at } = res.rows[0];
          if ((reset_count ?? 0) >= RESET_MAX) return { ok: false, reason: "max_reached" };
          if (last_reset_at) {
            const hoursSince = (Date.now() - new Date(last_reset_at).getTime()) / 36e5;
            if (hoursSince < RESET_COOLDOWN_HOURS) {
              return { ok: false, reason: "too_soon", retry_after_hours: Math.ceil((RESET_COOLDOWN_HOURS - hoursSince) * 10) / 10 };
            }
          }
          await pool.query(
            `UPDATE ff_keys SET locked_ip = NULL, device_ip = NULL,
         reset_count = reset_count + 1, last_reset_at = NOW() WHERE key_value = $1`,
            [keyStr]
          );
          return { ok: true };
        }
        const { keys, nextKeyId } = loadData();
        const key = keys.find((k) => k.key === keyStr);
        if (!key) return { ok: false, reason: "not_found" };
        if ((key.reset_count ?? 0) >= RESET_MAX) {
          return { ok: false, reason: "max_reached" };
        }
        if (key.last_reset_at) {
          const hoursSince = (Date.now() - new Date(key.last_reset_at).getTime()) / 36e5;
          if (hoursSince < RESET_COOLDOWN_HOURS) {
            const retry_after_hours = Math.ceil((RESET_COOLDOWN_HOURS - hoursSince) * 10) / 10;
            return { ok: false, reason: "too_soon", retry_after_hours };
          }
        }
        key.locked_ip = null;
        key.reset_count = (key.reset_count ?? 0) + 1;
        key.last_reset_at = (/* @__PURE__ */ new Date()).toISOString();
        saveKeys(keys, nextKeyId);
        return { ok: true };
      },
      async deleteKeyById(id) {
        await ensureSchema();
        if (USE_PG && pgReady) {
          const pool = getPool();
          const res = await pool.query(`DELETE FROM ff_keys WHERE key_value LIKE $1`, [`${id}%`]);
          return (res.rowCount ?? 0) > 0;
        }
        const { keys, nextKeyId } = loadData();
        const idx = keys.findIndex((k) => k.id === id);
        if (idx === -1) return false;
        keys.splice(idx, 1);
        saveKeys(keys, nextKeyId);
        return true;
      },
      async deleteKeyByValue(keyStr) {
        await ensureSchema();
        if (USE_PG && pgReady) {
          const pool = getPool();
          const res = await pool.query(`DELETE FROM ff_keys WHERE key_value = $1`, [keyStr]);
          return (res.rowCount ?? 0) > 0;
        }
        const { keys, nextKeyId } = loadData();
        const idx = keys.findIndex((k) => k.key === keyStr);
        if (idx === -1) return false;
        keys.splice(idx, 1);
        saveKeys(keys, nextKeyId);
        return true;
      },
      async getAllKeys() {
        await ensureSchema();
        if (USE_PG && pgReady) {
          const pool = getPool();
          try {
            const res = await pool.query(`SELECT * FROM ff_keys ORDER BY created_at DESC`);
            return res.rows.map(keyRowToKey);
          } catch {
          }
        }
        const { keys } = loadData();
        return [...keys].reverse();
      },
      getKeysByCreator(userId) {
        const { keys } = loadData();
        return keys.filter((k) => k.created_by === userId).reverse();
      },
      async getKeyByValue(keyStr) {
        await ensureSchema();
        if (USE_PG && pgReady) {
          const pool = getPool();
          try {
            const res = await pool.query(`SELECT * FROM ff_keys WHERE key_value = $1`, [keyStr]);
            if (res.rows.length === 0) return null;
            return keyRowToKey(res.rows[0]);
          } catch {
          }
        }
        const { keys } = loadData();
        return keys.find((k) => k.key === keyStr) ?? null;
      },
      addSeller(userId, username) {
        const sellers = loadFile("sellers.json", []);
        if (sellers.find((s) => s.user_id === userId)) return false;
        sellers.push({ user_id: userId, username, balance: 0, added_at: (/* @__PURE__ */ new Date()).toISOString() });
        saveSellers(sellers);
        return true;
      },
      removeSeller(userId) {
        const sellers = loadFile("sellers.json", []);
        const idx = sellers.findIndex((s) => s.user_id === userId);
        if (idx === -1) return false;
        sellers.splice(idx, 1);
        saveSellers(sellers);
        return true;
      },
      isSeller(userId) {
        const sellers = loadFile("sellers.json", []);
        return !!sellers.find((s) => s.user_id === userId);
      },
      getSeller(userId) {
        const sellers = loadFile("sellers.json", []);
        return sellers.find((s) => s.user_id === userId) ?? null;
      },
      getAllSellers() {
        return loadFile("sellers.json", []);
      },
      addBalance(userId, amount) {
        const sellers = loadFile("sellers.json", []);
        const seller = sellers.find((s) => s.user_id === userId);
        if (!seller) return false;
        seller.balance += amount;
        saveSellers(sellers);
        return true;
      },
      deductBalance(userId, amount) {
        const sellers = loadFile("sellers.json", []);
        const seller = sellers.find((s) => s.user_id === userId);
        if (!seller || seller.balance < amount) return false;
        seller.balance -= amount;
        saveSellers(sellers);
        return true;
      },
      getPrices() {
        return loadFile("prices.json", [
          { type: "basic", duration_days: 1, price: 1 },
          { type: "basic", duration_days: 7, price: 2 },
          { type: "basic", duration_days: 30, price: 3 },
          { type: "pro", duration_days: 1, price: 2 },
          { type: "pro", duration_days: 7, price: 4 },
          { type: "pro", duration_days: 30, price: 6 }
        ]);
      },
      getPrice(type, days) {
        const prices = dbOps.getPrices();
        return prices.find((p) => p.type === type && p.duration_days === days)?.price ?? 1;
      },
      updatePrice(type, days, price) {
        const prices = dbOps.getPrices();
        const existing = prices.find((p) => p.type === type && p.duration_days === days);
        if (existing) {
          existing.price = price;
        } else {
          prices.push({ type, duration_days: days, price });
        }
        savePrices(prices);
      },
      getStarPrices() {
        return loadFile("starPrices.json", DEFAULT_STAR_PRICES);
      },
      getStarPrice(type, days) {
        const prices = dbOps.getStarPrices();
        return prices.find((p) => p.type === type && p.duration_days === days)?.stars ?? 50;
      },
      updateStarPrice(type, days, stars) {
        const prices = dbOps.getStarPrices();
        const existing = prices.find((p) => p.type === type && p.duration_days === days);
        if (existing) {
          existing.stars = stars;
        } else {
          prices.push({ type, duration_days: days, stars });
        }
        saveFile("starPrices.json", prices);
      },
      getKeyFormat() {
        return loadFile("keyFormat.json", DEFAULT_KEY_FORMAT);
      },
      setKeyFormat(format) {
        saveFile("keyFormat.json", format);
      },
      getBotEnabled() {
        return loadFile("botEnabled.json", true);
      },
      setBotEnabled(enabled) {
        saveFile("botEnabled.json", enabled);
      },
      getBotRunning() {
        return loadFile("botRunning.json", false);
      },
      setBotRunning(running) {
        saveFile("botRunning.json", running);
      },
      getCertPath() {
        return path.join(DATA_DIR, "cert.pem");
      },
      hasCert() {
        return fs.existsSync(path.join(DATA_DIR, "cert.pem"));
      },
      getCert() {
        const p = path.join(DATA_DIR, "cert.pem");
        if (!fs.existsSync(p)) return null;
        return fs.readFileSync(p);
      },
      setCert(content) {
        fs.writeFileSync(path.join(DATA_DIR, "cert.pem"), content, "utf-8");
      },
      getProxySettings() {
        return loadFile("proxySettings.json", DEFAULT_PROXY);
      },
      setProxySettings(settings) {
        saveFile("proxySettings.json", settings);
      },
      registerUser(id, username, firstName) {
        const users = loadFile("users.json", []);
        const existing = users.find((u) => u.id === id);
        if (existing) {
          existing.username = username;
          existing.first_name = firstName;
          existing.last_seen = (/* @__PURE__ */ new Date()).toISOString();
        } else {
          users.push({ id, username, first_name: firstName, last_seen: (/* @__PURE__ */ new Date()).toISOString() });
        }
        saveFile("users.json", users);
      },
      getAllUsers() {
        return loadFile("users.json", []);
      },
      async getStats() {
        await ensureSchema();
        let totalKeys = 0;
        let activeKeys = 0;
        let expiredKeys = 0;
        let lockedKeys = 0;
        if (USE_PG && pgReady) {
          const pool = getPool();
          try {
            const res = await pool.query(`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE active = TRUE AND expires_at > NOW()) AS active,
          COUNT(*) FILTER (WHERE NOT active OR expires_at <= NOW()) AS expired,
          COUNT(*) FILTER (WHERE locked_ip IS NOT NULL) AS locked
          FROM ff_keys`);
            totalKeys = Number(res.rows[0].total);
            activeKeys = Number(res.rows[0].active);
            expiredKeys = Number(res.rows[0].expired);
            lockedKeys = Number(res.rows[0].locked);
          } catch {
          }
        }
        if (totalKeys === 0) {
          const { keys } = loadData();
          const now = /* @__PURE__ */ new Date();
          activeKeys = keys.filter((k) => k.is_active && new Date(k.expires_at) > now).length;
          expiredKeys = keys.filter((k) => !k.is_active || new Date(k.expires_at) <= now).length;
          lockedKeys = keys.filter((k) => k.locked_ip !== null).length;
          totalKeys = keys.length;
        }
        const sellers = loadFile("sellers.json", []);
        const users = loadFile("users.json", []);
        return { totalKeys, activeKeys, expiredKeys, sellersCount: sellers.length, lockedKeys, totalUsers: users.length };
      }
    };
  }
});

// src/lib/logger.ts
import pino from "pino";
var isProduction, logger;
var init_logger = __esm({
  "src/lib/logger.ts"() {
    isProduction = process.env.NODE_ENV === "production";
    logger = pino({
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']"
      ],
      ...isProduction ? {} : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true }
        }
      }
    });
  }
});

// src/bot/bot.ts
var bot_exports = {};
__export(bot_exports, {
  OWNERS: () => OWNERS,
  OWNER_ID: () => OWNER_ID,
  default: () => bot_default
});
import { Telegraf, Markup } from "telegraf";
function isOwner(id) {
  return OWNERS.includes(id);
}
function isSeller(id) {
  return dbOps.isSeller(id);
}
function isPrivileged(id) {
  return isOwner(id) || isSeller(id);
}
function formatDate(iso) {
  return new Date(iso).toUTCString().replace(" GMT", " UTC");
}
function getDaysLeft(exp) {
  return Math.max(0, Math.ceil((new Date(exp).getTime() - Date.now()) / 864e5));
}
function isExpired(exp) {
  return new Date(exp) < /* @__PURE__ */ new Date();
}
function typeLabel(t) {
  return t === "pro" ? "\u2B50 Pro" : "\u{1F535} Basic";
}
function typeEmoji(t) {
  return t === "pro" ? "\u2B50" : "\u{1F535}";
}
function durationLabel(d) {
  if (d === 1) return "1 Day";
  if (d === 7) return "1 Week";
  if (d === 30) return "1 Month";
  return `${d} Days`;
}
function proxyText(keyType) {
  const cfg = dbOps.getProxySettings();
  const ep = `${cfg.ip}:${cfg.port}`;
  let t = `\u{1F310} *Server:* ${ep}
\u{1F50C} *Port:* ${ep}

`;
  t += `\u{1F3AF} *FF OBB Mod \u2014 Head + Body Hits*
`;
  t += `\u{1F4E6} Your game downloads the small OBB file automatically through the proxy when you enter a match.
`;
  t += `\u26A0\uFE0F One server & one port for everything \u2014 no extra steps.
`;
  if (keyType === "pro") {
    t += `
\u2B50 *Pro* \u2014 full headshot/bodyshot injection.
`;
  }
  return t;
}
function mainKeyboard(userId) {
  const rows = [
    [BTN.CHECK, BTN.USE],
    [BTN.CERT, BTN.INFO],
    [BTN.STARS]
  ];
  if (isSeller(userId) && !isOwner(userId)) {
    rows.push([BTN.BUY, BTN.MYKEYS]);
    rows.push([BTN.WALLET]);
  }
  if (isOwner(userId)) {
    rows.push([BTN.MYKEYS, BTN.WALLET]);
    rows.push([BTN.OWNER]);
  }
  return Markup.keyboard(rows).resize();
}
async function showBuyMenu(ctx, id) {
  const seller = dbOps.getSeller(id);
  const prices = dbOps.getPrices();
  let pt = "";
  for (const p of prices) pt += `  ${typeEmoji(p.type)} ${typeLabel(p.type)} ${durationLabel(p.duration_days)}: *${p.price}* cr
`;
  await ctx.reply(
    `\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2502  \u{1F48E} *Buy Keys*     \u2502
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D

\u{1F4B0} Balance: *${seller?.balance ?? 0}* cr

\u{1F4CB} *Prices:*
${pt}
Select type & duration:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("\u{1F535} Basic \u2014 1 Day", "buy_basic_1"),
          Markup.button.callback("\u{1F535} Basic \u2014 1 Week", "buy_basic_7")
        ],
        [Markup.button.callback("\u{1F535} Basic \u2014 1 Month", "buy_basic_30")],
        [
          Markup.button.callback("\u2B50 Pro \u2014 1 Day", "buy_pro_1"),
          Markup.button.callback("\u2B50 Pro \u2014 1 Week", "buy_pro_7")
        ],
        [Markup.button.callback("\u2B50 Pro \u2014 1 Month", "buy_pro_30")],
        [Markup.button.callback("\u274C Cancel", "close")]
      ])
    }
  );
}
function showQtyMenu(ctx, prefix, type, days, priceEach, isOwnerMenu) {
  const lbl = `${typeLabel(type)} \u2014 ${durationLabel(days)}`;
  return ctx.editMessageText(
    `\u{1F522} *Select Quantity*

\u{1F4CB} ${lbl}
\u{1F4B0} Price: *${priceEach}* cr each`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("\xD7 1", `${prefix}_${type}_${days}_1`),
          Markup.button.callback("\xD7 3", `${prefix}_${type}_${days}_3`),
          Markup.button.callback("\xD7 5", `${prefix}_${type}_${days}_5`),
          Markup.button.callback("\xD7 10", `${prefix}_${type}_${days}_10`)
        ],
        [Markup.button.callback("\u{1F519} Back", isOwnerMenu ? "oc_create" : "show_buy")]
      ])
    }
  );
}
async function sendOwnerPanel(ctx) {
  const s = await dbOps.getStats();
  await ctx.reply(
    `\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  \u{1F451} *Owner Control Panel*  \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518

\u{1F4CA} *Stats:*
  \u{1F511} Keys: ${s.totalKeys} | \u2705 Active: ${s.activeKeys}
  \u{1F3EA} Sellers: ${s.sellersCount} | \u{1F465} Users: ${s.totalUsers}`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("\u{1F511} Create Key", "oc_create"),
          Markup.button.callback("\u{1F5D1}\uFE0F Delete Key", "oc_delete")
        ],
        [
          Markup.button.callback("\u{1F465} Manage Sellers", "oc_sellers"),
          Markup.button.callback("\u{1F4CB} All Keys", "oc_allkeys")
        ],
        [
          Markup.button.callback("\u{1F4B0} Prices", "oc_prices"),
          Markup.button.callback("\u{1F4E2} Broadcast", "oc_broadcast")
        ],
        [Markup.button.callback("\u274C Close", "close")]
      ])
    }
  );
}
async function showSellers(ctx) {
  const sellers = dbOps.getAllSellers();
  let t = `\u{1F465} *Sellers* (${sellers.length})

`;
  for (const s of sellers) t += `  \u{1F3EA} \`${s.user_id}\` ${s.username ? `@${s.username}` : ""} \u2014 \u{1F4B0} ${s.balance} cr
`;
  if (!sellers.length) t += "_No sellers yet._";
  await ctx.editMessageText(t, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback("\u2795 Add Seller", "os_add"),
        Markup.button.callback("\u2796 Remove Seller", "os_remove")
      ],
      [Markup.button.callback("\u{1F4B0} Add Balance", "os_balance")],
      [Markup.button.callback("\u{1F519} Back", "oc_back")]
    ])
  });
}
var OWNER_ID, OWNERS, BOT_TOKEN, bot, BTN, MENU_TEXTS, states, bot_default;
var init_bot = __esm({
  "src/bot/bot.ts"() {
    init_database();
    init_logger();
    OWNER_ID = 7279931745;
    OWNERS = [7279931745, 7120438475];
    BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");
    bot = new Telegraf(BOT_TOKEN);
    BTN = {
      CHECK: "\u{1F510} Check Key",
      USE: "\u{1F680} Use Key",
      CERT: "\u{1F4CB} Certificate",
      INFO: "\u{1F4CA} Bot Info",
      STARS: "\u{1F31F} Buy with Stars",
      BUY: "\u{1F48E} Buy Keys",
      MYKEYS: "\u{1F5C2}\uFE0F My Keys",
      WALLET: "\u{1F4B3} Wallet",
      OWNER: "\u{1F451} Owner Panel"
    };
    MENU_TEXTS = new Set(Object.values(BTN));
    states = /* @__PURE__ */ new Map();
    bot.use(async (ctx, next) => {
      if (ctx.from) {
        dbOps.registerUser(ctx.from.id, ctx.from.username ?? null, ctx.from.first_name);
      }
      const isPayment = ctx.updateType === "pre_checkout_query" || ctx.updateType === "message" && ctx.message && "successful_payment" in ctx.message;
      if (!dbOps.getBotEnabled() && !isPayment) return;
      return next();
    });
    bot.start(async (ctx) => {
      const id = ctx.from.id;
      const name = ctx.from.first_name;
      let msg;
      if (isOwner(id)) {
        const s = await dbOps.getStats();
        msg = `\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  \u{1F451} *Owner Dashboard* \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518

\u{1F916} *FF Proxy Key Bot*

\u{1F4CA} *Quick Stats:*
  \u{1F511} Total Keys: *${s.totalKeys}*
  \u2705 Active: *${s.activeKeys}*
  \u{1F3EA} Sellers: *${s.sellersCount}*
  \u{1F465} Users: *${s.totalUsers}*

\u{1F4CC} Choose from the menu below:`;
      } else {
        const role = isSeller(id) ? "\u{1F3EA} Seller" : "\u{1F464} User";
        msg = `\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551  \u{1F44B} Welcome, *${name}*!
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D

\u{1F916} *FF Proxy Key Bot*
\u{1F3AD} Role: *${role}*

\u{1F4CC} Choose from the menu:`;
      }
      await ctx.reply(msg, { parse_mode: "Markdown", ...mainKeyboard(id) });
    });
    bot.command("reset", async (ctx) => {
      const id = ctx.from.id;
      if (!isPrivileged(id)) {
        await ctx.reply("\u274C You don't have permission.");
        return;
      }
      const parts = ctx.message.text.split(" ");
      if (parts.length < 2) {
        await ctx.reply("\u2139\uFE0F Usage: `/reset KEY`", { parse_mode: "Markdown" });
        return;
      }
      const keyStr = parts[1].trim().toUpperCase();
      const key = await dbOps.getKeyByValue(keyStr);
      if (!key) {
        await ctx.reply(`\u274C Key \`${keyStr}\` not found.`, { parse_mode: "Markdown" });
        return;
      }
      if (!isOwner(id) && key.created_by !== id) {
        await ctx.reply("\u274C You can only reset your own keys.");
        return;
      }
      const result = await dbOps.resetKeyIp(keyStr);
      if (!result.ok) {
        if (result.reason === "max_reached") {
          await ctx.reply(
            `\u{1F6AB} *Reset Limit Reached*

\u{1F511} \`${keyStr}\`

\u274C This key has been reset *4/4* times.`,
            { parse_mode: "Markdown" }
          );
        } else if (result.reason === "too_soon") {
          await ctx.reply(
            `\u23F3 *Cooldown Active*

\u{1F511} \`${keyStr}\`

\u231A Wait *${result.retry_after_hours}h* before resetting again.`,
            { parse_mode: "Markdown" }
          );
        }
        return;
      }
      const remaining = 4 - (await dbOps.getKeyByValue(keyStr)?.reset_count ?? 4);
      await ctx.reply(
        `\u267B\uFE0F *Reset Successful!*

\u{1F511} \`${keyStr}\`

\u2705 IP unlocked. Key is free to use.
\u{1F522} Resets left: *${remaining}/4*`,
        { parse_mode: "Markdown" }
      );
    });
    bot.hears(BTN.INFO, async (ctx) => {
      const stats = await dbOps.getStats();
      const prices = dbOps.getPrices();
      const cfg = dbOps.getProxySettings();
      let pt = "";
      for (const p of prices) pt += `  ${typeEmoji(p.type)} ${typeLabel(p.type)} ${durationLabel(p.duration_days)}: *${p.price}* cr
`;
      await ctx.reply(
        `\u{1F4CA} *Bot Information*

\u{1F916} FF Proxy Key Bot

\u{1F4C8} *Statistics:*
  \u{1F511} Keys: ${stats.totalKeys} total | \u2705 ${stats.activeKeys} active
  \u{1F465} Users: ${stats.totalUsers} | \u{1F3EA} Sellers: ${stats.sellersCount}

\u{1F4B0} *Prices:*
${pt}
\u{1F310} Server: \`${cfg.ip}\``,
        { parse_mode: "Markdown" }
      );
    });
    bot.hears(BTN.CHECK, async (ctx) => {
      states.set(ctx.from.id, { action: "check_key" });
      await ctx.reply("\u{1F510} *Check Key*\n\nSend the key to verify:", { parse_mode: "Markdown", ...Markup.forceReply() });
    });
    bot.hears(BTN.USE, async (ctx) => {
      states.set(ctx.from.id, { action: "use_key_enter" });
      await ctx.reply("\u{1F680} *Activate Key*\n\nSend your key:", { parse_mode: "Markdown", ...Markup.forceReply() });
    });
    bot.hears(BTN.CERT, async (ctx) => {
      const cert = dbOps.getCert();
      if (!cert) {
        await ctx.reply(
          "\u{1F4CB} *Mitmproxy Certificate*\n\n\u26A0\uFE0F No certificate uploaded yet.\n\u{1F4DE} Contact the owner.",
          { parse_mode: "Markdown" }
        );
        return;
      }
      const certPath = dbOps.getCertPath();
      let cerPath = null;
      try {
        const { execSync } = await import("node:child_process");
        cerPath = certPath.replace(/cert\.pem$/, "cert.cer");
        execSync(`openssl x509 -outform der -in "${certPath}" -out "${cerPath}"`);
      } catch {
        cerPath = null;
      }
      const files = [certPath];
      if (cerPath) files.push(cerPath);
      const docs = files.map((f) => ({ source: f, filename: f.endsWith(".cer") ? "ffproxy-ca.cer" : "mitmproxy-ca-cert.pem" }));
      await ctx.replyWithMediaGroup(
        docs.map((d, i) => ({
          type: "document",
          media: d,
          ...i === 0 ? { caption: "\u{1F4CB} *Proxy CA Certificate*\n\n\u{1F34F} *iOS:* open `ffproxy-ca.cer` \u2192 Install \u2192 Settings \u2192 General \u2192 VPN & Device Management \u2192 Trust\n\u{1F916} *Android:* install `mitmproxy-ca-cert.pem` \u2192 Settings \u2192 Security" } : {}
        }))
      );
      await ctx.reply("\u2705 Certificate files sent above \u2014 follow the iOS steps for the `.cer` file.");
    });
    bot.hears(BTN.WALLET, async (ctx) => {
      const id = ctx.from.id;
      if (!isPrivileged(id)) return;
      if (isOwner(id)) {
        await ctx.reply(
          `\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2502  \u{1F4B3} *Owner Wallet*   \u2502
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D

\u267E\uFE0F Balance: *Unlimited*

\u{1F451} You can create keys for free.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const seller = dbOps.getSeller(id);
      await ctx.reply(
        `\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2502    \u{1F4B3} *My Wallet*    \u2502
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D

\u{1F4B0} Balance: *${seller?.balance ?? 0}* credit(s)

\u{1F6D2} Use credits to buy keys.
\u{1F4DE} Contact owner to top up.`,
        { parse_mode: "Markdown" }
      );
    });
    bot.hears(BTN.BUY, async (ctx) => {
      const id = ctx.from.id;
      if (!isSeller(id)) {
        await ctx.reply("\u274C Only sellers can buy keys.");
        return;
      }
      await showBuyMenu(ctx, id);
    });
    for (const [type, days] of [["basic", 1], ["basic", 7], ["basic", 30], ["pro", 1], ["pro", 7], ["pro", 30]]) {
      bot.action(`buy_${type}_${days}`, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isSeller(ctx.from.id)) return;
        const price = dbOps.getPrice(type, days);
        await showQtyMenu(ctx, "bq", type, days, price, false);
      });
    }
    bot.action(/^bq_(\w+)_(\d+)_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const id = ctx.from.id;
      if (!isSeller(id)) return;
      const type = ctx.match[1];
      const days = parseInt(ctx.match[2]);
      const qty = parseInt(ctx.match[3]);
      const price = dbOps.getPrice(type, days);
      const total = price * qty;
      const s = dbOps.getSeller(id);
      if ((s?.balance ?? 0) < total) {
        await ctx.editMessageText(
          `\u274C *Insufficient Balance*

\u{1F4B8} Need: ${total} cr (${qty} \xD7 ${price})
\u{1F4B0} Have: ${s?.balance ?? 0} cr`,
          { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("\u{1F519} Back", "show_buy")]]) }
        );
        return;
      }
      if (!dbOps.deductBalance(id, total)) {
        await ctx.editMessageText("\u274C *Balance error. Try again.*", { parse_mode: "Markdown" });
        return;
      }
      const keys = await dbOps.createKeys(type, days, id, qty);
      const updated = dbOps.getSeller(id);
      const keyLines = keys.map((k, i) => `  ${i + 1}\\. \`${k.key}\``).join("\n");
      await ctx.editMessageText(
        `\u2705 *${qty} Key${qty > 1 ? "s" : ""} Created!*

${typeLabel(type)} \u2014 ${durationLabel(days)}
\u{1F4C5} Expires: ${formatDate(keys[0].expires_at)}

\u{1F511} *Your Keys:*
${keyLines}

\u{1F4B0} Remaining: *${updated?.balance ?? 0}* cr`,
        {
          parse_mode: "MarkdownV2",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("\u{1F48E} Buy More", "show_buy")],
            [Markup.button.callback("\u274C Close", "close")]
          ])
        }
      );
    });
    bot.action("show_buy", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {
      });
      await showBuyMenu(ctx, ctx.from.id);
    });
    bot.hears(BTN.MYKEYS, async (ctx) => {
      const id = ctx.from.id;
      if (!isPrivileged(id)) return;
      const keys = dbOps.getKeysByCreator(id);
      if (!keys.length) {
        await ctx.reply("\u{1F4ED} *No keys found.*", { parse_mode: "Markdown" });
        return;
      }
      if (isOwner(id)) {
        const btns = keys.slice(0, 40).map((k) => [
          Markup.button.callback(
            `\u{1F5D1}\uFE0F ${k.key} \u2014 ${typeEmoji(k.type)} ${durationLabel(k.duration_days)}`,
            `dk_${k.id}`
          )
        ]);
        btns.push([Markup.button.callback("\u274C Close", "close")]);
        await ctx.reply(
          `\u{1F5C2}\uFE0F *My Keys* (${keys.length})

Tap to delete:`,
          { parse_mode: "Markdown", ...Markup.inlineKeyboard(btns) }
        );
      } else {
        const lines = keys.map(
          (k, i) => `${i + 1}\\. \`${k.key}\` \u2014 ${typeLabel(k.type)} \u2014 ${getDaysLeft(k.expires_at)}d left`
        ).join("\n");
        await ctx.reply(`\u{1F5C2}\uFE0F *My Keys* \\(${keys.length}\\)

${lines}`, { parse_mode: "MarkdownV2" });
      }
    });
    bot.action(/^dk_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const id = ctx.from.id;
      if (!isOwner(id)) return;
      const kid = parseInt(ctx.match[1]);
      if (!dbOps.deleteKeyById(kid)) {
        await ctx.answerCbQuery("\u274C Key not found.", { show_alert: true });
        return;
      }
      await ctx.answerCbQuery("\u{1F5D1}\uFE0F Deleted!", { show_alert: true });
      const rem = dbOps.getKeysByCreator(id);
      if (!rem.length) {
        await ctx.editMessageText("\u{1F4ED} *No keys left.*", { parse_mode: "Markdown" });
        return;
      }
      const btns = rem.slice(0, 40).map((k) => [
        Markup.button.callback(`\u{1F5D1}\uFE0F ${k.key} \u2014 ${typeEmoji(k.type)} ${durationLabel(k.duration_days)}`, `dk_${k.id}`)
      ]);
      btns.push([Markup.button.callback("\u274C Close", "close")]);
      await ctx.editMessageText(`\u{1F5C2}\uFE0F *My Keys* (${rem.length})

Tap to delete:`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(btns)
      });
    });
    bot.action("close", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {
      });
    });
    bot.hears(BTN.STARS, async (ctx) => {
      const starPrices = dbOps.getStarPrices();
      const btn = (type, days) => {
        const sp = starPrices.find((p) => p.type === type && p.duration_days === days);
        const stars = sp?.stars ?? 50;
        return Markup.button.callback(
          `${typeEmoji(type)} ${typeLabel(type)} ${durationLabel(days)} \u2014 ${stars} \u2B50`,
          `stars_${type}_${days}`
        );
      };
      await ctx.reply(
        `\u{1F31F} *Buy with Telegram Stars*

\u{1F4AB} Pay using your Telegram Stars and get your key instantly!

Select a plan:`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [btn("basic", 1), btn("basic", 7)],
            [btn("basic", 30)],
            [btn("pro", 1), btn("pro", 7)],
            [btn("pro", 30)],
            [Markup.button.callback("\u274C Cancel", "close")]
          ])
        }
      );
    });
    bot.action(/^stars_(\w+)_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const type = ctx.match[1];
      const days = parseInt(ctx.match[2]);
      const stars = dbOps.getStarPrice(type, days);
      const title = `${typeLabel(type)} \u2014 ${durationLabel(days)}`;
      await ctx.deleteMessage().catch(() => {
      });
      await ctx.replyWithInvoice({
        title: `\u{1F511} FF Proxy Key \u2014 ${title}`,
        description: `${typeLabel(type)} proxy key for ${durationLabel(days)}.
One port, full FF OBB mod with Head + Body hits.`,
        payload: `star_${type}_${days}`,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: title, amount: stars }]
      });
    });
    bot.on("pre_checkout_query", async (ctx) => {
      await ctx.answerPreCheckoutQuery(true);
    });
    bot.hears(BTN.OWNER, async (ctx) => {
      if (!isOwner(ctx.from.id)) return;
      await sendOwnerPanel(ctx);
    });
    bot.action("oc_create", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      await ctx.editMessageText(
        "\u{1F511} *Create Key*\n\nSelect type & duration:",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("\u{1F535} Basic 1d", "om_basic_1"),
              Markup.button.callback("\u{1F535} Basic 7d", "om_basic_7"),
              Markup.button.callback("\u{1F535} Basic 30d", "om_basic_30")
            ],
            [
              Markup.button.callback("\u2B50 Pro 1d", "om_pro_1"),
              Markup.button.callback("\u2B50 Pro 7d", "om_pro_7"),
              Markup.button.callback("\u2B50 Pro 30d", "om_pro_30")
            ],
            [
              Markup.button.callback("\u{1F535} Basic Custom", "om_basic_custom"),
              Markup.button.callback("\u2B50 Pro Custom", "om_pro_custom")
            ],
            [Markup.button.callback("\u{1F519} Back", "oc_back")]
          ])
        }
      );
    });
    for (const [type, days] of [["basic", 1], ["basic", 7], ["basic", 30], ["pro", 1], ["pro", 7], ["pro", 30]]) {
      bot.action(`om_${type}_${days}`, async (ctx) => {
        await ctx.answerCbQuery();
        if (!isOwner(ctx.from.id)) return;
        await showQtyMenu(ctx, "oq", type, days, 0, true);
      });
    }
    bot.action(/^oq_(\w+)_(\d+)_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const type = ctx.match[1];
      const days = parseInt(ctx.match[2]);
      const qty = parseInt(ctx.match[3]);
      const keys = await dbOps.createKeys(type, days, OWNER_ID, qty);
      const keyLines = keys.map((k, i) => `  ${i + 1}. \`${k.key}\``).join("\n");
      await ctx.editMessageText(
        `\u2705 *${qty} Key${qty > 1 ? "s" : ""} Created!*

\u{1F4CB} ${typeLabel(type)} \u2014 ${durationLabel(days)}
\u{1F4C5} Expires: ${formatDate(keys[0].expires_at)}

\u{1F511} *Keys:*
${keyLines}`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("\u{1F511} Create More", "oc_create")],
            [Markup.button.callback("\u{1F519} Panel", "oc_back")]
          ])
        }
      );
    });
    bot.action("om_basic_custom", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      states.set(ctx.from.id, { action: "owner_custom_days", data: { type: "basic" } });
      await ctx.editMessageText(
        "\u{1F4C5} *Custom Duration \u2014 Basic*\n\nSend number of days:",
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("\u274C Cancel", "oc_back")]]) }
      );
    });
    bot.action("om_pro_custom", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      states.set(ctx.from.id, { action: "owner_custom_days", data: { type: "pro" } });
      await ctx.editMessageText(
        "\u{1F4C5} *Custom Duration \u2014 Pro*\n\nSend number of days:",
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("\u274C Cancel", "oc_back")]]) }
      );
    });
    bot.action("oc_delete", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      states.set(ctx.from.id, { action: "owner_del_key" });
      await ctx.editMessageText(
        "\u{1F5D1}\uFE0F *Delete Key*\n\nSend the key to delete:",
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("\u274C Cancel", "oc_back")]]) }
      );
    });
    bot.action("oc_allkeys", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const keys = await dbOps.getAllKeys();
      if (!keys.length) {
        await ctx.editMessageText("\u{1F4ED} No keys yet.", {
          ...Markup.inlineKeyboard([[Markup.button.callback("\u{1F519} Back", "oc_back")]])
        });
        return;
      }
      const recent = keys.slice(0, 10);
      let t = `\u{1F4CB} *All Keys* (${keys.length} total)

`;
      for (const k of recent) {
        const status = isExpired(k.expires_at) ? "\u274C" : "\u2705";
        const locked = k.locked_ip ? `\u{1F512}` : "\u{1F513}";
        t += `${status} \`${k.key}\` ${typeEmoji(k.type)} ${locked}
`;
      }
      if (keys.length > 10) t += `
_...and ${keys.length - 10} more_`;
      await ctx.editMessageText(t, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("\u{1F519} Back", "oc_back")]])
      });
    });
    bot.action("oc_sellers", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      await showSellers(ctx);
    });
    bot.action("os_add", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      states.set(ctx.from.id, { action: "owner_add_seller" });
      await ctx.editMessageText("\u2795 *Add Seller*\n\nSend the Telegram ID:", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("\u274C Cancel", "oc_sellers")]])
      });
    });
    bot.action("os_remove", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      states.set(ctx.from.id, { action: "owner_remove_seller" });
      await ctx.editMessageText("\u2796 *Remove Seller*\n\nSend the Telegram ID:", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("\u274C Cancel", "oc_sellers")]])
      });
    });
    bot.action("os_balance", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const sellers = dbOps.getAllSellers();
      if (!sellers.length) {
        await ctx.answerCbQuery("No sellers yet.", { show_alert: true });
        return;
      }
      const btns = sellers.map((s) => [
        Markup.button.callback(
          `\u{1F3EA} ${s.username ? "@" + s.username : s.user_id} \u2014 \u{1F4B0} ${s.balance} cr`,
          `ob_pick_${s.user_id}`
        )
      ]);
      btns.push([Markup.button.callback("\u{1F519} Back", "oc_sellers")]);
      await ctx.editMessageText("\u{1F4B0} *Send Credits*\n\nChoose a seller:", {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(btns)
      });
    });
    bot.action(/^ob_pick_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const tid = parseInt(ctx.match[1]);
      const seller = dbOps.getSeller(tid);
      if (!seller) {
        await ctx.answerCbQuery("Seller not found.", { show_alert: true });
        return;
      }
      states.set(ctx.from.id, { action: "owner_balance_amount", data: { targetId: tid } });
      const name = seller.username ? `@${seller.username}` : `\`${tid}\``;
      await ctx.editMessageText(
        `\u{1F4B0} *Credits for ${name}*

\u{1F4B3} Current: *${seller.balance} cr*

Amount to send?`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("10 \u{1F4B0}", `ob_q_${tid}_10`),
              Markup.button.callback("25 \u{1F4B0}", `ob_q_${tid}_25`),
              Markup.button.callback("50 \u{1F4B0}", `ob_q_${tid}_50`)
            ],
            [
              Markup.button.callback("100 \u{1F4B0}", `ob_q_${tid}_100`),
              Markup.button.callback("\u270F\uFE0F Custom", `ob_c_${tid}`)
            ],
            [Markup.button.callback("\u{1F519} Back", "os_balance")]
          ])
        }
      );
    });
    bot.action(/^ob_q_(\d+)_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const tid = parseInt(ctx.match[1]);
      const amount = parseInt(ctx.match[2]);
      dbOps.addBalance(tid, amount);
      const s = dbOps.getSeller(tid);
      const name = s?.username ? `@${s.username}` : `\`${tid}\``;
      await ctx.editMessageText(
        `\u2705 *Credits Sent!*

\u{1F464} ${name}
\u{1F4B8} +${amount} cr
\u{1F4B0} New Balance: *${s?.balance ?? 0} cr*`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("\u{1F4B0} Send More", "os_balance")],
            [Markup.button.callback("\u{1F519} Panel", "oc_back")]
          ])
        }
      );
    });
    bot.action(/^ob_c_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const tid = parseInt(ctx.match[1]);
      const seller = dbOps.getSeller(tid);
      const name = seller?.username ? `@${seller.username}` : `\`${tid}\``;
      states.set(ctx.from.id, { action: "owner_balance_amount", data: { targetId: tid } });
      await ctx.editMessageText(
        `\u270F\uFE0F *Custom Amount*

\u{1F464} ${name} \u2014 \u{1F4B3} ${seller?.balance ?? 0} cr

Send the number:`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("\u274C Cancel", "os_balance")]]) }
      );
    });
    bot.action("oc_prices", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const prices = dbOps.getPrices();
      let t = "\u{1F4B0} *Key Prices* (cr = credits)\n\n";
      for (const p of prices) t += `  ${typeEmoji(p.type)} ${typeLabel(p.type)} ${durationLabel(p.duration_days)}: *${p.price}* cr
`;
      await ctx.editMessageText(t, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("\u270F\uFE0F Edit Price", "oc_edit_prices")],
          [Markup.button.callback("\u{1F519} Back", "oc_back")]
        ])
      });
    });
    bot.action("oc_edit_prices", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      states.set(ctx.from.id, { action: "owner_edit_price" });
      await ctx.editMessageText(
        "\u270F\uFE0F *Edit Price*\n\nFormat: `TYPE DAYS PRICE`\nExample: `basic 30 3` or `pro 7 5`\n\nTypes: `basic` `pro` \u2014 Days: `1` `7` `30`",
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("\u274C Cancel", "oc_prices")]]) }
      );
    });
    bot.action("oc_broadcast", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const users = dbOps.getAllUsers();
      states.set(ctx.from.id, { action: "owner_broadcast" });
      await ctx.editMessageText(
        `\u{1F4E2} *Broadcast Message*

\u{1F465} Will be sent to *${users.length}* users.

Send your message now:`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("\u274C Cancel", "oc_back")]]) }
      );
    });
    bot.action("oc_back", async (ctx) => {
      await ctx.answerCbQuery();
      if (!isOwner(ctx.from.id)) return;
      const s = await dbOps.getStats();
      await ctx.editMessageText(
        `\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  \u{1F451} *Owner Control Panel*  \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518

\u{1F4CA} *Stats:*
  \u{1F511} Keys: ${s.totalKeys} | \u2705 Active: ${s.activeKeys}
  \u{1F3EA} Sellers: ${s.sellersCount} | \u{1F465} Users: ${s.totalUsers}`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("\u{1F511} Create Key", "oc_create"),
              Markup.button.callback("\u{1F5D1}\uFE0F Delete Key", "oc_delete")
            ],
            [
              Markup.button.callback("\u{1F465} Manage Sellers", "oc_sellers"),
              Markup.button.callback("\u{1F4CB} All Keys", "oc_allkeys")
            ],
            [
              Markup.button.callback("\u{1F4B0} Prices", "oc_prices"),
              Markup.button.callback("\u{1F4E2} Broadcast", "oc_broadcast")
            ],
            [Markup.button.callback("\u274C Close", "close")]
          ])
        }
      );
    });
    bot.on("message", async (ctx, next) => {
      if (!("successful_payment" in ctx.message)) return next();
      const payment = ctx.message.successful_payment;
      const payload = payment.invoice_payload;
      const parts = payload.split("_");
      if (parts[0] !== "star" || parts.length < 3) return;
      const type = parts[1];
      const days = parseInt(parts[2]);
      const userId = ctx.from.id;
      const k = await dbOps.createKey(type, days, userId);
      await ctx.reply(
        `\u{1F31F} *\u0634\u0643\u0631\u0627\u064B \u0639\u0644\u0649 \u0634\u0631\u0627\u0626\u0643! | Thank you!*

\u2705 Your key is ready:

\u{1F511} \`${k.key}\`

\u{1F4CB} ${typeLabel(type)} \u2014 ${durationLabel(days)}
\u{1F4C5} Expires: ${formatDate(k.expires_at)}

\u{1F4A1} Use *\u{1F680} Use Key* to activate it.`,
        { parse_mode: "Markdown" }
      );
      try {
        await bot.telegram.sendMessage(
          OWNER_ID,
          `\u{1F31F} *New Stars Payment!*

\u{1F464} ${ctx.from.first_name}${ctx.from.username ? ` @${ctx.from.username}` : ""}
\u{1F194} \`${userId}\`

\u{1F4AB} Stars: *${payment.total_amount}*
\u{1F511} Key: \`${k.key}\`
\u{1F4CB} ${typeLabel(type)} \u2014 ${durationLabel(days)}`,
          { parse_mode: "Markdown" }
        );
      } catch {
      }
    });
    bot.on("text", async (ctx) => {
      const id = ctx.from.id;
      const text = ctx.message.text.trim();
      if (MENU_TEXTS.has(text)) return;
      const state = states.get(id);
      if (!state) return;
      if (state.action === "check_key") {
        states.delete(id);
        const key = await dbOps.checkKey(text.toUpperCase());
        if (!key) {
          await ctx.reply(`\u274C *Invalid Key*

\`${text}\` not found.`, { parse_mode: "Markdown" });
          return;
        }
        if (isExpired(key.expires_at)) {
          await ctx.reply(`\u26A0\uFE0F *Key Expired*

\u{1F511} \`${key.key}\`
\u{1F4C5} ${formatDate(key.expires_at)}`, { parse_mode: "Markdown" });
          return;
        }
        const locked = key.locked_ip ? `\u{1F512} Locked to: \`${key.locked_ip}\`` : "\u{1F513} Available";
        await ctx.reply(
          `\u2705 *Key Valid!*

\u{1F511} \`${key.key}\`
\u{1F4CB} ${typeLabel(key.type)}
\u23F3 ${durationLabel(key.duration_days)}
\u{1F4C5} Expires: ${formatDate(key.expires_at)}
\u{1F550} Days Left: *${getDaysLeft(key.expires_at)}*
${locked}`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      if (state.action === "use_key_enter") {
        const key = await dbOps.checkKey(text.toUpperCase());
        if (!key) {
          states.delete(id);
          await ctx.reply(`\u274C *Invalid Key*

\`${text}\` not found.`, { parse_mode: "Markdown" });
          return;
        }
        if (isExpired(key.expires_at)) {
          states.delete(id);
          await ctx.reply(`\u26A0\uFE0F *Key Expired*

Expired: ${formatDate(key.expires_at)}`, { parse_mode: "Markdown" });
          return;
        }
        if (key.locked_ip) {
          states.delete(id);
          await ctx.reply(
            `\u{1F512} *Key Already In Use*

Locked to another device.

\u{1F4A1} Ask the owner to reset:
\`/reset ${key.key}\``,
            { parse_mode: "Markdown" }
          );
          return;
        }
        states.set(id, { action: "use_key_ip", data: { keyStr: key.key, keyType: key.type } });
        await ctx.reply(
          `\u2705 *Key Verified!*

\u{1F4CB} ${typeLabel(key.type)}
\u{1F550} Days Left: *${getDaysLeft(key.expires_at)}*

\u{1F4F1} Now send your *device IP address* (open https://ip.me in your browser to see it):`,
          { parse_mode: "Markdown", ...Markup.forceReply() }
        );
        return;
      }
      if (state.action === "use_key_ip") {
        states.delete(id);
        const ip = text.trim();
        const keyStr = state.data?.keyStr;
        const keyType = state.data?.keyType ?? "basic";
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
          await ctx.reply("\u274C *Invalid IP*\n\nSend a valid IPv4 (e.g. `1.2.3.4`)", { parse_mode: "Markdown" });
          return;
        }
        const fresh = await dbOps.getKeyByValue(keyStr);
        if (fresh?.locked_ip) {
          await ctx.reply(`\u{1F512} *Key Just Locked*

Another device just activated it.`, { parse_mode: "Markdown" });
          return;
        }
        await dbOps.lockKeyToIp(keyStr, ip);
        const synced = await dbOps.syncKeyToProxy(keyStr, "pro");
        if (!synced) {
          await ctx.reply(
            `\u26A0\uFE0F *Activation saved but proxy sync failed.*

The key may not work in-game yet.

\u{1F4A1} Ask the owner to check the proxy server.`,
            { parse_mode: "Markdown" }
          );
          return;
        }
        await ctx.reply(
          `\u{1F389} Connected!

\u{1F4F1} Your IP is now linked to this key.

\u{1F4CB} *How to use:*
1\uFE0F\u20E3 Install the certificate (\u{1F4CB} Certificate menu)
2\uFE0F\u20E3 Add a Proxy profile in the game with the server & port below
3\uFE0F\u20E3 Launch Free Fire and pick your feature

` + proxyText(keyType) + `
\u{1F511} Key: ${keyStr}
\u23F3 Expires: ${formatDate(fresh.expires_at)}`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      if (!isOwner(id)) return;
      if (state.action === "owner_custom_days") {
        const days = parseInt(text);
        const type = state.data?.type ?? "basic";
        if (isNaN(days) || days < 1) {
          await ctx.reply("\u274C Send a valid number (\u2265 1).");
          return;
        }
        states.delete(id);
        states.set(id, { action: "owner_custom_days_qty", data: { type, days } });
        await ctx.reply(
          `\u{1F522} *Quantity?*

${typeLabel(type)} \u2014 ${days} day(s)

Send quantity (e.g. 1, 3, 5):`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      if (state.action === "owner_custom_days_qty") {
        states.delete(id);
        const qty = parseInt(text);
        const type = state.data?.type ?? "basic";
        const days = state.data?.days ?? 1;
        if (isNaN(qty) || qty < 1) {
          await ctx.reply("\u274C Send a valid quantity (\u2265 1).");
          return;
        }
        const keys = await dbOps.createKeys(type, days, OWNER_ID, qty);
        const lines = keys.map((k, i) => `  ${i + 1}. \`${k.key}\``).join("\n");
        await ctx.reply(
          `\u2705 *${qty} Key${qty > 1 ? "s" : ""} Created!*

\u{1F4CB} ${typeLabel(type)} \u2014 ${durationLabel(days)}
\u{1F4C5} ${formatDate(keys[0].expires_at)}

\u{1F511} Keys:
${lines}`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      if (state.action === "owner_del_key") {
        states.delete(id);
        const ok = dbOps.deleteKeyByValue(text.toUpperCase());
        await ctx.reply(
          ok ? `\u{1F5D1}\uFE0F Key \`${text.toUpperCase()}\` deleted.` : `\u274C Key \`${text}\` not found.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      if (state.action === "owner_add_seller") {
        states.delete(id);
        const tid = parseInt(text);
        if (isNaN(tid)) {
          await ctx.reply("\u274C Invalid ID.");
          return;
        }
        dbOps.addSeller(tid, null);
        await ctx.reply(`\u2705 User \`${tid}\` added as seller.`, { parse_mode: "Markdown" });
        return;
      }
      if (state.action === "owner_remove_seller") {
        states.delete(id);
        const tid = parseInt(text);
        if (isNaN(tid)) {
          await ctx.reply("\u274C Invalid ID.");
          return;
        }
        const ok = dbOps.removeSeller(tid);
        await ctx.reply(
          ok ? `\u2705 Seller \`${tid}\` removed.` : `\u274C \`${tid}\` is not a seller.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      if (state.action === "owner_balance_amount") {
        states.delete(id);
        const amount = parseInt(text);
        const tid = state.data?.targetId;
        if (isNaN(amount) || amount <= 0) {
          await ctx.reply("\u274C Send a positive number.");
          return;
        }
        dbOps.addBalance(tid, amount);
        const s = dbOps.getSeller(tid);
        const name = s?.username ? `@${s.username}` : `\`${tid}\``;
        await ctx.reply(
          `\u2705 *Credits Sent!*

\u{1F464} ${name}
\u{1F4B8} +${amount} cr
\u{1F4B0} New Balance: *${s?.balance ?? 0} cr*`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("\u{1F4B0} Send More", "os_balance")],
              [Markup.button.callback("\u{1F519} Panel", "oc_back")]
            ])
          }
        );
        return;
      }
      if (state.action === "owner_edit_price") {
        states.delete(id);
        const parts = text.split(" ");
        if (parts.length !== 3) {
          await ctx.reply("\u274C Format: `basic 30 3`", { parse_mode: "Markdown" });
          return;
        }
        const [type, dStr, pStr] = parts;
        const days = parseInt(dStr);
        const price = parseInt(pStr);
        if (!["basic", "pro"].includes(type) || isNaN(days) || days < 1 || isNaN(price) || price < 0) {
          await ctx.reply("\u274C Invalid data.");
          return;
        }
        dbOps.updatePrice(type, days, price);
        await ctx.reply(`\u2705 Price updated!
${typeLabel(type)} \u2014 ${durationLabel(days)}: *${price}* cr`, { parse_mode: "Markdown" });
        return;
      }
      if (state.action === "owner_broadcast") {
        states.delete(id);
        const users = dbOps.getAllUsers();
        if (!users.length) {
          await ctx.reply("\u{1F4ED} No users to broadcast to.");
          return;
        }
        const broadcastMsg = text;
        let sent = 0, failed = 0;
        const statusMsg = await ctx.reply(`\u{1F4E2} *Broadcasting...*

\u{1F465} Sending to ${users.length} users...`, { parse_mode: "Markdown" });
        for (const u of users) {
          try {
            await bot.telegram.sendMessage(u.id, broadcastMsg);
            sent++;
          } catch {
            failed++;
          }
          await new Promise((r) => setTimeout(r, 40));
        }
        await bot.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          void 0,
          `\u{1F4E2} *Broadcast Complete!*

\u2705 Sent: *${sent}*
\u274C Failed: *${failed}*
\u{1F465} Total: *${users.length}*`,
          { parse_mode: "Markdown" }
        );
        return;
      }
    });
    bot.catch((err, ctx) => {
      logger.error({ err, update: ctx.update }, "Bot error");
    });
    bot_default = bot;
  }
});

// src/app.ts
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";

// src/routes/index.ts
import { Router as Router9 } from "express";

// src/routes/health.ts
import { Router } from "express";
var router = Router();
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
var health_default = router;

// src/routes/auth.ts
import { Router as Router2 } from "express";
import { z } from "zod";
var LoginBody = z.object({ password: z.string() });
var router2 = Router2();
var SECRET = process.env.DASHBOARD_SECRET ?? "admin1234";
var TOKEN = `dashboard-${Buffer.from(SECRET).toString("base64")}`;
function authMiddleware(req, res, next) {
  const header = req.headers["authorization"] ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
router2.post("/auth/login", (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (parsed.data.password !== SECRET) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: TOKEN });
});
var auth_default = router2;

// src/routes/stats.ts
init_database();
import { Router as Router3 } from "express";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var __dirname2 = path2.dirname(fileURLToPath2(import.meta.url));
var DATA_DIR2 = path2.resolve(__dirname2, "../../data");
var router3 = Router3();
router3.get("/stats", authMiddleware, async (_req, res) => {
  const stats = await dbOps.getStats();
  const keys = dbOps.getAllKeys();
  const now = /* @__PURE__ */ new Date();
  const expiredKeys = keys.filter((k) => new Date(k.expires_at) < now).length;
  const lockedKeys = keys.filter((k) => k.locked_ip !== null).length;
  res.json({
    totalKeys: stats.totalKeys,
    activeKeys: stats.activeKeys,
    expiredKeys,
    sellersCount: stats.sellersCount,
    lockedKeys
  });
});
var stats_default = router3;

// src/routes/bot-status.ts
import { Router as Router4 } from "express";
init_database();

// src/bot/bot-manager.ts
init_database();
init_logger();
var botInstance = null;
var _running = false;
var botManager = {
  get running() {
    return _running;
  },
  async start() {
    if (_running) return;
    const { default: bot2 } = await Promise.resolve().then(() => (init_bot(), bot_exports));
    botInstance = bot2;
    try {
      await bot2.telegram.deleteWebhook({ drop_pending_updates: false });
      let startOffset = 0;
      try {
        const recent = await bot2.telegram.getUpdates({ limit: 1, timeout: 0 });
        if (recent.length > 0) {
          startOffset = recent[recent.length - 1].update_id + 1;
          logger.info({ startOffset }, "Starting polling from latest update");
        }
      } catch {
        startOffset = 0;
      }
      bot2.launch({
        allowedUpdates: ["message", "callback_query", "pre_checkout_query"]
      }).catch((err) => {
        logger.error({ err }, "Bot polling error");
        _running = false;
        dbOps.setBotRunning(false);
      });
      if (startOffset > 0 && bot2.polling) {
        bot2.polling.offset = startOffset;
      }
      _running = true;
      dbOps.setBotRunning(true);
      logger.info("Telegram bot started via BotManager");
      setTimeout(async () => {
        try {
          const info = await bot2.telegram.getMe();
          logger.info({ bot: info.username }, "Bot polling alive check");
        } catch (err) {
          logger.warn({ err }, "Polling appears dead, restarting");
          _running = false;
          dbOps.setBotRunning(false);
          await botManager.start();
        }
      }, 3e4);
    } catch (err) {
      logger.error({ err }, "Failed to start bot");
      throw err;
    }
  },
  async stop() {
    if (!_running || !botInstance) return;
    try {
      botInstance.stop("manual_stop");
    } catch {
    }
    _running = false;
    dbOps.setBotRunning(false);
    logger.info("Telegram bot stopped via BotManager");
  },
  async autoStart() {
    if (dbOps.getBotEnabled()) {
      logger.info("Auto-starting bot (enabled)");
      await botManager.start().catch((err) => {
        logger.error({ err }, "Auto-start failed");
      });
    }
  }
};

// src/routes/bot-status.ts
var router4 = Router4();
var botInfo = null;
async function fetchBotInfo() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) botInfo = data.result;
  } catch {
    botInfo = null;
  }
}
fetchBotInfo();
setInterval(fetchBotInfo, 3e4);
router4.get("/bot/status", authMiddleware, (_req, res) => {
  res.json({
    online: botInfo !== null,
    enabled: dbOps.getBotEnabled(),
    running: botManager.running,
    botName: botInfo?.first_name ?? "Unknown",
    botUsername: botInfo?.username ?? ""
  });
});
router4.post("/bot/toggle", authMiddleware, (_req, res) => {
  const current = dbOps.getBotEnabled();
  dbOps.setBotEnabled(!current);
  res.json({ enabled: !current });
});
router4.post("/bot/start", authMiddleware, async (_req, res) => {
  try {
    await botManager.start();
    res.json({ ok: true, running: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? "Failed to start bot" });
  }
});
router4.post("/bot/stop", authMiddleware, async (_req, res) => {
  try {
    await botManager.stop();
    res.json({ ok: true, running: false });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? "Failed to stop bot" });
  }
});
var bot_status_default = router4;

// src/routes/keys.ts
init_database();
import { Router as Router5 } from "express";
var OWNER_ID2 = 7279931745;
var router5 = Router5();
router5.get("/keys", authMiddleware, async (_req, res) => {
  res.json(dbOps.getAllKeys());
});
router5.post("/keys", authMiddleware, async (req, res) => {
  const { type, duration_days } = req.body;
  if (!type || !duration_days) {
    res.status(400).json({ error: "type and duration_days are required" });
    return;
  }
  const key = await dbOps.createKey(type, Number(duration_days), OWNER_ID2);
  res.status(201).json(key);
});
router5.post("/keys/batch", authMiddleware, async (req, res) => {
  const { type, duration_days, count } = req.body;
  if (!type || !duration_days) {
    res.status(400).json({ error: "type and duration_days are required" });
    return;
  }
  const qty = Math.max(1, Math.min(50, Number(count) || 1));
  const keys = await dbOps.createKeys(type, Number(duration_days), OWNER_ID2, qty);
  res.status(201).json({ keys });
});
router5.delete("/keys/:id", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const deleted = dbOps.deleteKeyById(id);
  if (!deleted) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  res.json({ success: true });
});
router5.post("/keys/:id/reset-ip", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const keys = await dbOps.getAllKeys();
  const key = keys.find((k) => k.id === id);
  if (!key) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  const result = await dbOps.resetKeyIp(key.key);
  if (!result.ok) {
    if (result.reason === "max_reached") {
      res.status(429).json({ error: "Reset limit reached (max 4 resets per key)" });
    } else if (result.reason === "too_soon") {
      res.status(429).json({ error: `Too soon \u2014 wait ${result.retry_after_hours}h before next reset` });
    }
    return;
  }
  res.json({ success: true });
});
var keys_default = router5;

// src/routes/sellers.ts
init_database();
import { Router as Router6 } from "express";
var router6 = Router6();
router6.get("/sellers", authMiddleware, (_req, res) => {
  res.json(dbOps.getAllSellers());
});
router6.post("/sellers", authMiddleware, (req, res) => {
  const { user_id, username } = req.body;
  if (!user_id) {
    res.status(400).json({ error: "user_id is required" });
    return;
  }
  dbOps.addSeller(Number(user_id), username ?? null);
  const seller = dbOps.getSeller(Number(user_id));
  res.status(201).json(seller);
});
router6.delete("/sellers/:userId", authMiddleware, (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  const removed = dbOps.removeSeller(userId);
  if (!removed) {
    res.status(404).json({ error: "Seller not found" });
    return;
  }
  res.json({ success: true });
});
router6.post("/sellers/:userId/balance", authMiddleware, (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount must be positive" });
    return;
  }
  dbOps.addBalance(userId, Number(amount));
  const seller = dbOps.getSeller(userId);
  res.json(seller);
});
var sellers_default = router6;

// src/routes/prices.ts
init_database();
import { Router as Router7 } from "express";
var router7 = Router7();
router7.get("/prices", authMiddleware, (_req, res) => {
  res.json(dbOps.getPrices());
});
router7.put("/prices", authMiddleware, (req, res) => {
  const { type, duration_days, price } = req.body;
  if (!type || !duration_days || price === void 0) {
    res.status(400).json({ error: "type, duration_days, and price are required" });
    return;
  }
  dbOps.updatePrice(type, Number(duration_days), Number(price));
  const prices = dbOps.getPrices();
  const updated = prices.find((p) => p.type === type && p.duration_days === Number(duration_days));
  res.json(updated);
});
var prices_default = router7;

// src/routes/settings.ts
init_database();
import { Router as Router8 } from "express";
import fs2 from "node:fs";
var router8 = Router8();
router8.get("/settings/key-format", authMiddleware, (_req, res) => {
  res.json({ format: dbOps.getKeyFormat() });
});
router8.put("/settings/key-format", authMiddleware, (req, res) => {
  const { format } = req.body;
  if (typeof format !== "string" || format.trim().length === 0) {
    res.status(400).json({ error: "format is required" });
    return;
  }
  dbOps.setKeyFormat(format.trim());
  res.json({ format: format.trim() });
});
router8.get("/settings/cert", authMiddleware, (_req, res) => {
  res.json({ hasCert: dbOps.hasCert() });
});
router8.post("/settings/cert", authMiddleware, (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  dbOps.setCert(content.trim());
  res.json({ ok: true });
});
router8.delete("/settings/cert", authMiddleware, (_req, res) => {
  const certPath = dbOps.getCertPath();
  if (fs2.existsSync(certPath)) fs2.unlinkSync(certPath);
  res.json({ ok: true });
});
router8.get("/settings/proxy", authMiddleware, (_req, res) => {
  res.json(dbOps.getProxySettings());
});
router8.put("/settings/proxy", authMiddleware, (req, res) => {
  const { ip, port: port2 } = req.body;
  if (typeof ip !== "string" || !ip.trim()) {
    res.status(400).json({ error: "ip is required" });
    return;
  }
  const current = dbOps.getProxySettings();
  const updated = {
    ip: ip.trim(),
    port: typeof port2 === "number" ? port2 : current.port,
    feature: "obb"
  };
  dbOps.setProxySettings(updated);
  res.json(updated);
});
router8.get("/settings/star-prices", authMiddleware, (_req, res) => {
  res.json(dbOps.getStarPrices());
});
router8.put("/settings/star-prices", authMiddleware, (req, res) => {
  const { type, duration_days, stars } = req.body;
  if (!type || !duration_days || typeof stars !== "number") {
    res.status(400).json({ error: "type, duration_days, stars required" });
    return;
  }
  dbOps.updateStarPrice(type, parseInt(duration_days), stars);
  res.json({ ok: true });
});
var settings_default = router8;

// src/routes/index.ts
var router9 = Router9();
router9.use(health_default);
router9.use(auth_default);
router9.use(stats_default);
router9.use(bot_status_default);
router9.use(keys_default);
router9.use(sellers_default);
router9.use(prices_default);
router9.use(settings_default);
var routes_default = router9;

// src/app.ts
init_logger();
var app = express();
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0]
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode
        };
      }
    }
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", routes_default);
var app_default = app;

// src/index.ts
init_logger();
var rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
var port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}
app_default.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
botManager.autoStart();
process.once("SIGINT", async () => {
  await botManager.stop();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await botManager.stop();
  process.exit(0);
});
