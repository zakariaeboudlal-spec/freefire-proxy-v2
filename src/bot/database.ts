import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export interface ProxySettings {
  ip: string;
  port: number;
  ports: {
    aim_drag: number;
    aim_body: number;
    aim_neck: number;
    speed: number;
    mode_3d: number;
    speed_pro: number;
  };
}

// Railway public TCP proxy — one endpoint relays all feature ports
// (8881-8886) via SNI/feature sniffing. IP lock is not possible here
// (Railway's public TCP proxy hides client IPs behind NAT), so access
// control lives in key syncing: when a key expires or is removed the bot
// stops syncing it and the proxy relays nothing for it anymore.
export const PROXY_SERVER = {
  tcp: "sakura.proxy.rlwy.net:19201",
  syncUrl: "https://ff-mitm-proxy-production.up.railway.app/sync-key",
};

const DEFAULT_PROXY: ProxySettings = {
  ip: "sakura.proxy.rlwy.net",
  port: 19201,
  ports: {
    aim_drag: 8881,
    aim_body: 8882,
    aim_neck: 8883,
    speed: 8884,
    mode_3d: 8885,
    speed_pro: 8886,
  },
};

const DEFAULT_STAR_PRICES: StarPrice[] = [
  { type: "basic", duration_days: 1,  stars: 50  },
  { type: "basic", duration_days: 7,  stars: 150 },
  { type: "basic", duration_days: 30, stars: 400 },
  { type: "pro",   duration_days: 1,  stars: 100 },
  { type: "pro",   duration_days: 7,  stars: 300 },
  { type: "pro",   duration_days: 30, stars: 700 },
];

interface DataStore {
  keys: Key[];
  sellers: Seller[];
  prices: KeyPrice[];
  nextKeyId: number;
  keyFormat: string;
}

const DEFAULT_KEY_FORMAT = "XXXXXXXXXXXXXXXX";

function loadData(): DataStore {
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
  createKey(type: string, durationDays: number, createdBy: number): Key {
    const { keys, nextKeyId } = loadData();
    let keyStr = generateKeyStr();
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

  createKeys(type: string, durationDays: number, createdBy: number, count: number): Key[] {
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

  checkKey(keyStr: string): Key | null {
    const { keys } = loadData();
    return keys.find((k) => k.key === keyStr && k.is_active) ?? null;
  },

  lockKeyToIp(keyStr: string, ip: string): boolean {
    const { keys, nextKeyId } = loadData();
    const key = keys.find((k) => k.key === keyStr);
    if (!key) return false;
    key.locked_ip = ip;
    saveKeys(keys, nextKeyId);
    return true;
  },

  // Sync an active key to the Railway proxy server so the proxy relays
  // game traffic for it. Returns true on success (errors are logged only).
  async syncKeyToProxy(keyStr: string, feature: string): Promise<boolean> {
    const key = dbOps.getKeyByValue(keyStr);
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
        logger.error({ status: res.status }, "Proxy sync failed");
        return false;
      }
      return true;
    } catch (err) {
      logger.error({ err }, "Proxy sync error");
      return false;
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

  resetKeyIp(keyStr: string): ResetResult {
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

  deleteKeyById(id: number): boolean {
    const { keys, nextKeyId } = loadData();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return false;
    keys.splice(idx, 1);
    saveKeys(keys, nextKeyId);
    return true;
  },

  deleteKeyByValue(keyStr: string): boolean {
    const { keys, nextKeyId } = loadData();
    const idx = keys.findIndex((k) => k.key === keyStr);
    if (idx === -1) return false;
    keys.splice(idx, 1);
    saveKeys(keys, nextKeyId);
    return true;
  },

  getAllKeys(): Key[] {
    const { keys } = loadData();
    return [...keys].reverse();
  },

  getKeysByCreator(userId: number): Key[] {
    const { keys } = loadData();
    return keys.filter((k) => k.created_by === userId).reverse();
  },

  getKeyByValue(keyStr: string): Key | null {
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

  getStats(): { totalKeys: number; activeKeys: number; expiredKeys: number; sellersCount: number; lockedKeys: number; totalUsers: number } {
    const { keys } = loadData();
    const sellers = loadFile<Seller[]>("sellers.json", []);
    const users = loadFile<BotUser[]>("users.json", []);
    const now = new Date();
    const activeKeys = keys.filter((k) => k.is_active && new Date(k.expires_at) > now).length;
    const expiredKeys = keys.filter((k) => !k.is_active || new Date(k.expires_at) <= now).length;
    const lockedKeys = keys.filter((k) => k.locked_ip !== null).length;
    return { totalKeys: keys.length, activeKeys, expiredKeys, sellersCount: sellers.length, lockedKeys, totalUsers: users.length };
  },
};
