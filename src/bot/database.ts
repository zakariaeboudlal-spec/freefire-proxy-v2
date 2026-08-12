import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFile<T>(filename: string, defaultVal: T): T {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf-8")) as T;
  } catch {
    return defaultVal;
  }
}

function saveFile(filename: string, data: unknown): void {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}

export interface Key {
  id: number;
  key: string;
  type: string;
  duration_days: number;
  expires_at: string;
  created_by: number;
  is_active: boolean;
  created_at: string;
  locked_ip: string | null;
  reset_count: number;
  last_reset_at: string | null;
}

export type ResetResult =
  | { ok: true }
  | { ok: false; reason: "max_reached" }
  | { ok: false; reason: "too_soon"; retry_after_hours: number }
  | { ok: false; reason: "not_found" };

export const RESET_MAX = 4;
export const RESET_COOLDOWN_HOURS = 3;

export interface Seller {
  user_id: number;
  username: string | null;
  balance: number;
  added_at: string;
}

export interface KeyPrice {
  type: string;
  duration_days: number;
  price: number;
}

export interface StarPrice {
  type: string;
  duration_days: number;
  stars: number;
}

export interface BotUser {
  id: number;
  username: string | null;
  first_name: string;
  last_seen: string;
}

// Single-feature OBB build: one port relays the whole modded OBB
// (small payload downloaded over the proxy at game start) with
// Head/Body auto-hit injection. No separate feature ports anymore.
export interface ProxySettings {
  ip: string;
  port: number;
  feature: string;
}

// Railway public TCP proxy — one endpoint relays the whole OBB mod
// (Head/Body hits). IP lock is not possible here (Railway's public TCP
// proxy hides client IPs behind NAT), so access control lives in key
// syncing: when a key expires or is removed the bot stops syncing it
// and the proxy relays nothing for it anymore.
export const PROXY_SERVER = {
  tcp: "sakura.proxy.rlwy.net:19201",
  syncUrl: "https://ff-mitm-proxy-production.up.railway.app/sync-key",
};

const DEFAULT_PROXY: ProxySettings = {
  ip: "sakura.proxy.rlwy.net",
  port: 19201,
  feature: "obb",
};

const DEFAULT_STAR_PRICES: StarPrice[] = [
  { type: "basic", duration_days: 1,  stars: 50  },
  { type: "basic", duration_days: 7,  stars: 150 },
  { type: "basic", duration_days: 30, stars: 400 },
  { type: "pro",   duration_days: 1,  stars: 100 },
  { type: "pro",   duration_days: 7,  stars: 300 },
  { type: "pro",   duration_days: 30, stars: 700 },
];

// ---------------------------------------------------------------------------
// PostgreSQL-backed key store (Railway Postgres). Keys are kept in a permanent
// database so they survive every Render redeploy. Non-key entities (sellers,
// prices, users, bot state) stay as JSON files since they are rarely changed.
// ---------------------------------------------------------------------------

const PG_URL = process.env.DATABASE_PUBLIC_URL || "";
const USE_PG = !!PG_URL;

let pgPool: pg.Pool | null = null;
let pgReady = false;

function getPool(): pg.Pool {
  if (!pgPool) {
    pgPool = new pg.Pool({ connectionString: PG_URL, max: 5 });
    pgPool.on("error", () => {
      // Connection lost — queries will fall back to JSON file
      pgReady = false;
    });
  }
  return pgPool;
}

async function ensureSchema(): Promise<void> {
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

function keyRowToKey(row: any): Key {
  return {
    id: Number(row.key_value.replace(/[^0-9]/g, "").slice(0, 8) || "0"),
    key: String(row.key_value),
    type: String(row.key_type ?? "daily"),
    duration_days: Number(row.duration_days ?? 1),
    expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : new Date(0).toISOString(),
    created_by: Number(row.user_id ?? 0),
    is_active: row.active === true || row.active === "t",
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    locked_ip: row.locked_ip ?? null,
    reset_count: Number(row.reset_count ?? 0),
    last_reset_at: row.last_reset_at ? new Date(row.last_reset_at).toISOString() : null,
  };
}

function rowToKey(keyStr: string, ktype: string, days: number, createdBy: number): Key {
  return {
    id: 0,
    key: keyStr,
    type: ktype,
    duration_days: days,
    expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    created_by: createdBy,
    is_active: false,
    created_at: new Date().toISOString(),
    locked_ip: null,
    reset_count: 0,
    last_reset_at: null,
  };
}

// ---------------------------------------------------------------------------

const DEFAULT_KEY_FORMAT = "FF-XXXX-XXXX-XXXX";

function loadData() {
  const keys = loadFile<Key[]>("keys.json", []).map((k) => ({
    locked_ip: null,
    reset_count: 0,
    last_reset_at: null,
    ...k,
  }));
  const sellers = loadFile<Seller[]>("sellers.json", []);
  const prices = loadFile<KeyPrice[]>("prices.json", [
    { type: "basic", duration_days: 1, price: 1 },
    { type: "basic", duration_days: 7, price: 2 },
    { type: "basic", duration_days: 30, price: 3 },
    { type: "pro", duration_days: 1, price: 2 },
    { type: "pro", duration_days: 7, price: 4 },
    { type: "pro", duration_days: 30, price: 6 },
  ]);
  const nextKeyId = loadFile<number>("nextKeyId.json", 1);
  const keyFormat = loadFile<string>("keyFormat.json", DEFAULT_KEY_FORMAT);
  return { keys, sellers, prices, nextKeyId, keyFormat };
}

function saveKeys(keys: Key[], nextKeyId: number): void {
  saveFile("keys.json", keys);
  saveFile("nextKeyId.json", nextKeyId);
}

function saveSellers(sellers: Seller[]): void {
  saveFile("sellers.json", sellers);
}

function savePrices(prices: KeyPrice[]): void {
  saveFile("prices.json", prices);
}

function generateKeyStr(format?: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const fmt = format ?? loadFile<string>("keyFormat.json", DEFAULT_KEY_FORMAT);
  return fmt
    .split("")
    .map((ch) => (ch === "X" ? chars[Math.floor(Math.random() * chars.length)] : ch))
    .join("");
}

function getExpiresAt(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export const dbOps = {
  async createKey(type: string, durationDays: number, createdBy: number): Promise<Key> {
    await ensureSchema();
    let keyStr = generateKeyStr();
    if (USE_PG && pgReady) {
      let exists = await getPool().then((p) =>
        p.query("SELECT 1 FROM ff_keys WHERE key_value = $1", [keyStr]).then((r) => r.rows.length > 0).catch(() => false)
      );
      while (exists) {
        keyStr = generateKeyStr();
        exists = await getPool().then((p) =>
          p.query("SELECT 1 FROM ff_keys WHERE key_value = $1", [keyStr]).then((r) => r.rows.length > 0).catch(() => false)
        );
      }
      const key = rowToKey(keyStr, type, durationDays, createdBy);
      return key;
    }
    // fallback: JSON file
    const { keys, nextKeyId } = loadData();
    while (keys.find((k) => k.key === keyStr)) keyStr = generateKeyStr();
    const newKey: Key = {
      id: nextKeyId,
      key: keyStr,
      type,
      duration_days: durationDays,
      expires_at: getExpiresAt(durationDays),
      created_by: createdBy,
      is_active: true,
      created_at: new Date().toISOString(),
      locked_ip: null,
      reset_count: 0,
      last_reset_at: null,
    };
    keys.push(newKey);
    saveKeys(keys, nextKeyId + 1);
    return newKey;
  },

  async createKeys(type: string, durationDays: number, createdBy: number, count: number): Promise<Key[]> {
    await ensureSchema();
    if (USE_PG && pgReady) {
      const pool = getPool();
      const created: Key[] = [];
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
          [keyStr, type, durationDays, new Date(Date.now() + durationDays * 86400000), String(createdBy)]
        );
        created.push(key);
      }
      return created;
    }
    const { keys, nextKeyId } = loadData();
    const created: Key[] = [];
    let idCounter = nextKeyId;
    for (let i = 0; i < count; i++) {
      let keyStr = generateKeyStr();
      while (keys.find((k) => k.key === keyStr) || created.find((k) => k.key === keyStr)) {
        keyStr = generateKeyStr();
      }
      const newKey: Key = {
        id: idCounter++,
        key: keyStr,
        type,
        duration_days: durationDays,
        expires_at: getExpiresAt(durationDays),
        created_by: createdBy,
        is_active: true,
        created_at: new Date().toISOString(),
        locked_ip: null,
        reset_count: 0,
        last_reset_at: null,
      };
      keys.push(newKey);
      created.push(newKey);
    }
    saveKeys(keys, idCounter);
    return created;
  },

  async checkKey(keyStr: string): Promise<Key | null> {
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
        // fall through to JSON
      }
    }
    const { keys } = loadData();
    return keys.find((k) => k.key === keyStr && k.is_active) ?? null;
  },

  async lockKeyToIp(keyStr: string, ip: string): Promise<boolean> {
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
  async syncKeyToProxy(keyStr: string, feature: string = "obb"): Promise<boolean> {
    const key = await dbOps.getKeyByValue(keyStr);
    if (!key || !key.is_active || new Date(key.expires_at) <= new Date()) {
      return false;
    }
    const expiredAtMs = new Date(key.expires_at).getTime();
    try {
      const res = await fetch(PROXY_SERVER.syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyStr, ip: "any", expired_at: expiredAtMs, feature }),
        signal: AbortSignal.timeout(8000),
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

  // Re-sync every active (non-expired) key to the Railway proxy. Run at bot
  // boot and after each proxy redeploy, because the proxy's keys.json is
  // ephemeral and is wiped on every Railway deployment.
  async syncAllActiveKeysToProxy(feature: string = "pro"): Promise<number> {
    if (!USE_PG) return 0;
    try {
      const pool = getPool();
      const res = await pool.query(
        "SELECT key_value, expires_at FROM ff_keys WHERE active = true AND expires_at > NOW()",
      );
      let synced = 0;
      for (const row of res.rows) {
        const expiresMs = new Date(row.expires_at).getTime();
        try {
          const r = await fetch(PROXY_SERVER.syncUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: row.key_value,
              ip: "any",
              expired_at: expiresMs,
              feature,
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (r.ok) synced++;
        } catch {
          /* ignore transient failures */
        }
      }
      console.log(`[PROXY SYNC] re-synced ${synced}/${res.rows.length} active keys`);
      return synced;
    } catch (err) {
      console.error("[PROXY SYNC] bulk sync error", err);
      return 0;
    }
  },

  // Remove a key from the proxy so it relays nothing for it anymore.
  async removeKeyFromProxy(keyStr: string): Promise<boolean> {
    try {
      const res = await fetch(PROXY_SERVER.syncUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyStr }),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async resetKeyIp(keyStr: string): Promise<ResetResult> {
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
    key.last_reset_at = new Date().toISOString();
    saveKeys(keys, nextKeyId);
    return { ok: true };
  },

  async deleteKeyById(id: number): Promise<boolean> {
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

  async deleteKeyByValue(keyStr: string): Promise<boolean> {
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

  async getAllKeys(): Promise<Key[]> {
    await ensureSchema();
    if (USE_PG && pgReady) {
      const pool = getPool();
      try {
        const res = await pool.query(`SELECT * FROM ff_keys ORDER BY created_at DESC`);
        return res.rows.map(keyRowToKey);
      } catch {
        // fall through
      }
    }
    const { keys } = loadData();
    return [...keys].reverse();
  },

  getKeysByCreator(userId: number): Key[] {
    const { keys } = loadData();
    return keys.filter((k) => k.created_by === userId).reverse();
  },

  async getKeyByValue(keyStr: string): Promise<Key | null> {
    await ensureSchema();
    if (USE_PG && pgReady) {
      const pool = getPool();
      try {
        const res = await pool.query(`SELECT * FROM ff_keys WHERE key_value = $1`, [keyStr]);
        if (res.rows.length === 0) return null;
        return keyRowToKey(res.rows[0]);
      } catch {
        // fall through
      }
    }
    const { keys } = loadData();
    return keys.find((k) => k.key === keyStr) ?? null;
  },

  addSeller(userId: number, username: string | null): boolean {
    const sellers = loadFile<Seller[]>("sellers.json", []);
    if (sellers.find((s) => s.user_id === userId)) return false;
    sellers.push({ user_id: userId, username, balance: 0, added_at: new Date().toISOString() });
    saveSellers(sellers);
    return true;
  },

  removeSeller(userId: number): boolean {
    const sellers = loadFile<Seller[]>("sellers.json", []);
    const idx = sellers.findIndex((s) => s.user_id === userId);
    if (idx === -1) return false;
    sellers.splice(idx, 1);
    saveSellers(sellers);
    return true;
  },

  isSeller(userId: number): boolean {
    const sellers = loadFile<Seller[]>("sellers.json", []);
    return !!sellers.find((s) => s.user_id === userId);
  },

  getSeller(userId: number): Seller | null {
    const sellers = loadFile<Seller[]>("sellers.json", []);
    return sellers.find((s) => s.user_id === userId) ?? null;
  },

  getAllSellers(): Seller[] {
    return loadFile<Seller[]>("sellers.json", []);
  },

  addBalance(userId: number, amount: number): boolean {
    const sellers = loadFile<Seller[]>("sellers.json", []);
    const seller = sellers.find((s) => s.user_id === userId);
    if (!seller) return false;
    seller.balance += amount;
    saveSellers(sellers);
    return true;
  },

  deductBalance(userId: number, amount: number): boolean {
    const sellers = loadFile<Seller[]>("sellers.json", []);
    const seller = sellers.find((s) => s.user_id === userId);
    if (!seller || seller.balance < amount) return false;
    seller.balance -= amount;
    saveSellers(sellers);
    return true;
  },

  getPrices(): KeyPrice[] {
    return loadFile<KeyPrice[]>("prices.json", [
      { type: "basic", duration_days: 1, price: 1 },
      { type: "basic", duration_days: 7, price: 2 },
      { type: "basic", duration_days: 30, price: 3 },
      { type: "pro", duration_days: 1, price: 2 },
      { type: "pro", duration_days: 7, price: 4 },
      { type: "pro", duration_days: 30, price: 6 },
    ]);
  },

  getPrice(type: string, days: number): number {
    const prices = dbOps.getPrices();
    return prices.find((p) => p.type === type && p.duration_days === days)?.price ?? 1;
  },

  updatePrice(type: string, days: number, price: number): void {
    const prices = dbOps.getPrices();
    const existing = prices.find((p) => p.type === type && p.duration_days === days);
    if (existing) {
      existing.price = price;
    } else {
      prices.push({ type, duration_days: days, price });
    }
    savePrices(prices);
  },

  getStarPrices(): StarPrice[] {
    return loadFile<StarPrice[]>("starPrices.json", DEFAULT_STAR_PRICES);
  },

  getStarPrice(type: string, days: number): number {
    const prices = dbOps.getStarPrices();
    return prices.find((p) => p.type === type && p.duration_days === days)?.stars ?? 50;
  },

  updateStarPrice(type: string, days: number, stars: number): void {
    const prices = dbOps.getStarPrices();
    const existing = prices.find((p) => p.type === type && p.duration_days === days);
    if (existing) {
      existing.stars = stars;
    } else {
      prices.push({ type, duration_days: days, stars });
    }
    saveFile("starPrices.json", prices);
  },

  getKeyFormat(): string {
    return loadFile<string>("keyFormat.json", DEFAULT_KEY_FORMAT);
  },

  setKeyFormat(format: string): void {
    saveFile("keyFormat.json", format);
  },

  getBotEnabled(): boolean {
    return loadFile<boolean>("botEnabled.json", true);
  },

  setBotEnabled(enabled: boolean): void {
    saveFile("botEnabled.json", enabled);
  },

  getBotRunning(): boolean {
    return loadFile<boolean>("botRunning.json", false);
  },

  setBotRunning(running: boolean): void {
    saveFile("botRunning.json", running);
  },

  getCertPath(): string {
    return path.join(DATA_DIR, "cert.pem");
  },

  hasCert(): boolean {
    return fs.existsSync(path.join(DATA_DIR, "cert.pem"));
  },

  getCert(): Buffer | null {
    const p = path.join(DATA_DIR, "cert.pem");
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  },

  setCert(content: string): void {
    fs.writeFileSync(path.join(DATA_DIR, "cert.pem"), content, "utf-8");
  },

  getProxySettings(): ProxySettings {
    return loadFile<ProxySettings>("proxySettings.json", DEFAULT_PROXY);
  },

  setProxySettings(settings: ProxySettings): void {
    saveFile("proxySettings.json", settings);
  },

  registerUser(id: number, username: string | null, firstName: string): void {
    const users = loadFile<BotUser[]>("users.json", []);
    const existing = users.find((u) => u.id === id);
    if (existing) {
      existing.username = username;
      existing.first_name = firstName;
      existing.last_seen = new Date().toISOString();
    } else {
      users.push({ id, username, first_name: firstName, last_seen: new Date().toISOString() });
    }
    saveFile("users.json", users);
  },

  getAllUsers(): BotUser[] {
    return loadFile<BotUser[]>("users.json", []);
  },

  async getStats(): Promise<{ totalKeys: number; activeKeys: number; expiredKeys: number; sellersCount: number; lockedKeys: number; totalUsers: number }> {
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
        // fall through
      }
    }
    if (totalKeys === 0) {
      const { keys } = loadData();
      const now = new Date();
      activeKeys = keys.filter((k) => k.is_active && new Date(k.expires_at) > now).length;
      expiredKeys = keys.filter((k) => !k.is_active || new Date(k.expires_at) <= now).length;
      lockedKeys = keys.filter((k) => k.locked_ip !== null).length;
      totalKeys = keys.length;
    }
    const sellers = loadFile<Seller[]>("sellers.json", []);
    const users = loadFile<BotUser[]>("users.json", []);
    return { totalKeys, activeKeys, expiredKeys, sellersCount: sellers.length, lockedKeys, totalUsers: users.length };
  },
};
