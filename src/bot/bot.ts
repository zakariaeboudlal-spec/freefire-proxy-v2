import { Telegraf, Markup } from "telegraf";
import { dbOps } from "./database.js";
import { logger } from "../lib/logger.js";

export const OWNER_ID = 7279931745;
export const OWNERS: number[] = [7279931745, 7120438475];
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");

const bot = new Telegraf(BOT_TOKEN);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOwner(id: number) { return OWNERS.includes(id); }
function isSeller(id: number) { return dbOps.isSeller(id); }
function isPrivileged(id: number) { return isOwner(id) || isSeller(id); }

function formatDate(iso: string): string {
  return new Date(iso).toUTCString().replace(" GMT", " UTC");
}
function getDaysLeft(exp: string): number {
  return Math.max(0, Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000));
}
function isExpired(exp: string): boolean { return new Date(exp) < new Date(); }

function typeLabel(t: string) { return t === "pro" ? "⭐ Pro" : "🔵 Basic"; }
function typeEmoji(t: string) { return t === "pro" ? "⭐" : "🔵"; }

function durationLabel(d: number) {
  if (d === 1) return "1 Day";
  if (d === 7) return "1 Week";
  if (d === 30) return "1 Month";
  return `${d} Days`;
}

function proxyText(keyType: string): string {
  const cfg = dbOps.getProxySettings();
  // One port carries the whole modded OBB (Head + Body hits).
  const ep = `\`${cfg.ip}:${cfg.port}\``;
  let t = `🌐 *Server:* ${ep}   🔌 *Port:* ${ep.replace("`", "")}\n\n`;
  t += `🎯 *FF OBB Mod — Head + Body Hits*\n`;
  t += `📦 Your game downloads the small OBB file automatically through the proxy when you enter a match.\n`;
  t += `⚠️ One server & one port for everything — no extra steps.\n`;
  if (keyType === "pro") {
    t += `\n⭐ *Pro* — full headshot/bodyshot injection.\n`;
  }
  return t;
}

// ─── Main keyboard ─────────────────────────────────────────────────────────────
const BTN = {
  CHECK:    "🔐 Check Key",
  USE:      "🚀 Use Key",
  CERT:     "📋 Certificate",
  INFO:     "📊 Bot Info",
  STARS:    "🌟 Buy with Stars",
  BUY:      "💎 Buy Keys",
  MYKEYS:   "🗂️ My Keys",
  WALLET:   "💳 Wallet",
  OWNER:    "👑 Owner Panel",
};

const MENU_TEXTS = new Set(Object.values(BTN));

function mainKeyboard(userId: number) {
  const rows: string[][] = [
    [BTN.CHECK, BTN.USE],
    [BTN.CERT,  BTN.INFO],
    [BTN.STARS],
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

// ─── State ─────────────────────────────────────────────────────────────────────
interface State { action: string; data?: Record<string, string | number | null>; }
const states = new Map<number, State>();

// ─── Middleware ────────────────────────────────────────────────────────────────
bot.use(async (ctx, next) => {
  if (ctx.from) {
    dbOps.registerUser(ctx.from.id, ctx.from.username ?? null, ctx.from.first_name);
  }
  // Always allow pre_checkout_query and successful_payment through
  const isPayment =
    ctx.updateType === "pre_checkout_query" ||
    (ctx.updateType === "message" && ctx.message && "successful_payment" in ctx.message);
  if (!dbOps.getBotEnabled() && !isPayment) return;
  return next();
});

// ─── /start ────────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const id   = ctx.from.id;
  const name = ctx.from.first_name;

  let msg: string;
  if (isOwner(id)) {
    const s = await dbOps.getStats();
    msg =
      `┌─────────────────────┐\n` +
      `│  👑 *Owner Dashboard* │\n` +
      `└─────────────────────┘\n\n` +
      `🤖 *FF Proxy Key Bot*\n\n` +
      `📊 *Quick Stats:*\n` +
      `  🔑 Total Keys: *${s.totalKeys}*\n` +
      `  ✅ Active: *${s.activeKeys}*\n` +
      `  🏪 Sellers: *${s.sellersCount}*\n` +
      `  👥 Users: *${s.totalUsers}*\n\n` +
      `📌 Choose from the menu below:`;
  } else {
    const role = isSeller(id) ? "🏪 Seller" : "👤 User";
    msg =
      `╔═══════════════════╗\n` +
      `║  👋 Welcome, *${name}*!\n` +
      `╚═══════════════════╝\n\n` +
      `🤖 *FF Proxy Key Bot*\n` +
      `🎭 Role: *${role}*\n\n` +
      `📌 Choose from the menu:`;
  }
  await ctx.reply(msg, { parse_mode: "Markdown", ...mainKeyboard(id) });
});

// ─── /reset ────────────────────────────────────────────────────────────────────
bot.command("reset", async (ctx) => {
  const id = ctx.from.id;
  if (!isPrivileged(id)) {
    await ctx.reply("❌ You don't have permission."); return;
  }
  const parts = ctx.message.text.split(" ");
  if (parts.length < 2) {
    await ctx.reply("ℹ️ Usage: `/reset KEY`", { parse_mode: "Markdown" }); return;
  }
  const keyStr = parts[1].trim().toUpperCase();
  const key = await dbOps.getKeyByValue(keyStr);
  if (!key) {
    await ctx.reply(`❌ Key \`${keyStr}\` not found.`, { parse_mode: "Markdown" }); return;
  }
  if (!isOwner(id) && key.created_by !== id) {
    await ctx.reply("❌ You can only reset your own keys."); return;
  }
  const result = await dbOps.resetKeyIp(keyStr);
  if (!result.ok) {
    if (result.reason === "max_reached") {
      await ctx.reply(
        `🚫 *Reset Limit Reached*\n\n🔑 \`${keyStr}\`\n\n❌ This key has been reset *4/4* times.`,
        { parse_mode: "Markdown" }
      );
    } else if (result.reason === "too_soon") {
      await ctx.reply(
        `⏳ *Cooldown Active*\n\n🔑 \`${keyStr}\`\n\n⌚ Wait *${result.retry_after_hours}h* before resetting again.`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }
  const remaining = 4 - (await dbOps.getKeyByValue(keyStr)?.reset_count ?? 4);
  await ctx.reply(
    `♻️ *Reset Successful!*\n\n🔑 \`${keyStr}\`\n\n✅ IP unlocked. Key is free to use.\n🔢 Resets left: *${remaining}/4*`,
    { parse_mode: "Markdown" }
  );
});

// ─── Menu: 📊 Bot Info ────────────────────────────────────────────────────────
bot.hears(BTN.INFO, async (ctx) => {
  const stats  = await dbOps.getStats();
  const prices = dbOps.getPrices();
  const cfg    = dbOps.getProxySettings();
  let pt = "";
  for (const p of prices) pt += `  ${typeEmoji(p.type)} ${typeLabel(p.type)} ${durationLabel(p.duration_days)}: *${p.price}* cr\n`;
  await ctx.reply(
    `📊 *Bot Information*\n\n` +
    `🤖 FF Proxy Key Bot\n\n` +
    `📈 *Statistics:*\n` +
    `  🔑 Keys: ${stats.totalKeys} total | ✅ ${stats.activeKeys} active\n` +
    `  👥 Users: ${stats.totalUsers} | 🏪 Sellers: ${stats.sellersCount}\n\n` +
    `💰 *Prices:*\n${pt}\n` +
    `🌐 Server: \`${cfg.ip}\``,
    { parse_mode: "Markdown" }
  );
});

// ─── Menu: 🔐 Check Key ───────────────────────────────────────────────────────
bot.hears(BTN.CHECK, async (ctx) => {
  states.set(ctx.from.id, { action: "check_key" });
  await ctx.reply("🔐 *Check Key*\n\nSend the key to verify:", { parse_mode: "Markdown", ...Markup.forceReply() });
});

// ─── Menu: 🚀 Use Key ─────────────────────────────────────────────────────────
bot.hears(BTN.USE, async (ctx) => {
  states.set(ctx.from.id, { action: "use_key_enter" });
  await ctx.reply("🚀 *Activate Key*\n\nSend your key:", { parse_mode: "Markdown", ...Markup.forceReply() });
});

// ─── Menu: 📋 Certificate ─────────────────────────────────────────────────────
bot.hears(BTN.CERT, async (ctx) => {
  const cert = dbOps.getCert();
  if (!cert) {
    await ctx.reply(
      "📋 *Mitmproxy Certificate*\n\n⚠️ No certificate uploaded yet.\n📞 Contact the owner.",
      { parse_mode: "Markdown" }
    );
    return;
  }
  // Send both formats: .pem (generic) and .cer (iOS DER-friendly upload)
  const certPath = dbOps.getCertPath();
  let cerPath: string | null = null;
  try {
    const { execSync } = await import("node:child_process");
    // Convert PEM → DER (.cer) for iOS
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
      type: "document" as const,
      media: d,
      ...(i === 0
        ? { caption: "📋 *Proxy CA Certificate*\n\n🍏 *iOS:* open `ffproxy-ca.cer` → Install → Settings → General → VPN & Device Management → Trust\n🤖 *Android:* install `mitmproxy-ca-cert.pem` → Settings → Security" }
        : {}),
    }))
  );
  await ctx.reply("✅ Certificate files sent above — follow the iOS steps for the `.cer` file.");
});

// ─── Menu: 💳 Wallet ──────────────────────────────────────────────────────────
bot.hears(BTN.WALLET, async (ctx) => {
  const id = ctx.from.id;
  if (!isPrivileged(id)) return;
  if (isOwner(id)) {
    await ctx.reply(
      `╔════════════════════╗\n│  💳 *Owner Wallet*   │\n╚════════════════════╝\n\n♾️ Balance: *Unlimited*\n\n👑 You can create keys for free.`,
      { parse_mode: "Markdown" }
    );
    return;
  }
  const seller = dbOps.getSeller(id);
  await ctx.reply(
    `╔════════════════════╗\n│    💳 *My Wallet*    │\n╚════════════════════╝\n\n💰 Balance: *${seller?.balance ?? 0}* credit(s)\n\n🛒 Use credits to buy keys.\n📞 Contact owner to top up.`,
    { parse_mode: "Markdown" }
  );
});

// ─── Menu: 💎 Buy Keys (Seller) ───────────────────────────────────────────────
bot.hears(BTN.BUY, async (ctx) => {
  const id = ctx.from.id;
  if (!isSeller(id)) { await ctx.reply("❌ Only sellers can buy keys."); return; }
  await showBuyMenu(ctx, id);
});

async function showBuyMenu(ctx: any, id: number) {
  const seller = dbOps.getSeller(id);
  const prices = dbOps.getPrices();
  let pt = "";
  for (const p of prices) pt += `  ${typeEmoji(p.type)} ${typeLabel(p.type)} ${durationLabel(p.duration_days)}: *${p.price}* cr\n`;
  await ctx.reply(
    `╔══════════════════╗\n│  💎 *Buy Keys*     │\n╚══════════════════╝\n\n` +
    `💰 Balance: *${seller?.balance ?? 0}* cr\n\n📋 *Prices:*\n${pt}\nSelect type & duration:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔵 Basic — 1 Day",   "buy_basic_1"),
         Markup.button.callback("🔵 Basic — 1 Week",  "buy_basic_7")],
        [Markup.button.callback("🔵 Basic — 1 Month", "buy_basic_30")],
        [Markup.button.callback("⭐ Pro — 1 Day",     "buy_pro_1"),
         Markup.button.callback("⭐ Pro — 1 Week",    "buy_pro_7")],
        [Markup.button.callback("⭐ Pro — 1 Month",   "buy_pro_30")],
        [Markup.button.callback("❌ Cancel",          "close")],
      ]),
    }
  );
}

function showQtyMenu(ctx: any, prefix: string, type: string, days: number, priceEach: number, isOwnerMenu: boolean) {
  const lbl = `${typeLabel(type)} — ${durationLabel(days)}`;
  return ctx.editMessageText(
    `🔢 *Select Quantity*\n\n📋 ${lbl}\n💰 Price: *${priceEach}* cr each`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("× 1",  `${prefix}_${type}_${days}_1`),
          Markup.button.callback("× 3",  `${prefix}_${type}_${days}_3`),
          Markup.button.callback("× 5",  `${prefix}_${type}_${days}_5`),
          Markup.button.callback("× 10", `${prefix}_${type}_${days}_10`),
        ],
        [Markup.button.callback("🔙 Back", isOwnerMenu ? "oc_create" : "show_buy")],
      ]),
    }
  );
}

// Seller buy: step 1 → choose qty
for (const [type, days] of [["basic",1],["basic",7],["basic",30],["pro",1],["pro",7],["pro",30]] as [string,number][]) {
  bot.action(`buy_${type}_${days}`, async (ctx) => {
    await ctx.answerCbQuery();
    if (!isSeller(ctx.from.id)) return;
    const price = dbOps.getPrice(type, days);
    await showQtyMenu(ctx, "bq", type, days, price, false);
  });
}

// Seller buy: step 2 → confirm & buy qty
bot.action(/^bq_(\w+)_(\d+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id  = ctx.from.id;
  if (!isSeller(id)) return;
  const type = ctx.match[1];
  const days = parseInt(ctx.match[2]);
  const qty  = parseInt(ctx.match[3]);
  const price = dbOps.getPrice(type, days);
  const total = price * qty;
  const s = dbOps.getSeller(id);
  if ((s?.balance ?? 0) < total) {
    await ctx.editMessageText(
      `❌ *Insufficient Balance*\n\n💸 Need: ${total} cr (${qty} × ${price})\n💰 Have: ${s?.balance ?? 0} cr`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "show_buy")]]) }
    );
    return;
  }
  if (!dbOps.deductBalance(id, total)) {
    await ctx.editMessageText("❌ *Balance error. Try again.*", { parse_mode: "Markdown" });
    return;
  }
  const keys = await dbOps.createKeys(type, days, id, qty);
  const updated = dbOps.getSeller(id);
  const keyLines = keys.map((k, i) => `  ${i + 1}\\. \`${k.key}\``).join("\n");
  await ctx.editMessageText(
    `✅ *${qty} Key${qty > 1 ? "s" : ""} Created!*\n\n` +
    `${typeLabel(type)} — ${durationLabel(days)}\n📅 Expires: ${formatDate(keys[0].expires_at)}\n\n` +
    `🔑 *Your Keys:*\n${keyLines}\n\n` +
    `💰 Remaining: *${updated?.balance ?? 0}* cr`,
    {
      parse_mode: "MarkdownV2",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("💎 Buy More", "show_buy")],
        [Markup.button.callback("❌ Close", "close")],
      ]),
    }
  );
});

bot.action("show_buy", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
  await showBuyMenu(ctx, ctx.from.id);
});

// ─── Menu: 🗂️ My Keys ─────────────────────────────────────────────────────────
bot.hears(BTN.MYKEYS, async (ctx) => {
  const id = ctx.from.id;
  if (!isPrivileged(id)) return;
  const keys = dbOps.getKeysByCreator(id);
  if (!keys.length) {
    await ctx.reply("📭 *No keys found.*", { parse_mode: "Markdown" }); return;
  }
  if (isOwner(id)) {
    const btns = keys.slice(0, 40).map((k) => [
      Markup.button.callback(
        `🗑️ ${k.key} — ${typeEmoji(k.type)} ${durationLabel(k.duration_days)}`,
        `dk_${k.id}`
      ),
    ]);
    btns.push([Markup.button.callback("❌ Close", "close")]);
    await ctx.reply(
      `🗂️ *My Keys* (${keys.length})\n\nTap to delete:`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard(btns) }
    );
  } else {
    const lines = keys.map((k, i) =>
      `${i + 1}\\. \`${k.key}\` — ${typeLabel(k.type)} — ${getDaysLeft(k.expires_at)}d left`
    ).join("\n");
    await ctx.reply(`🗂️ *My Keys* \\(${keys.length}\\)\n\n${lines}`, { parse_mode: "MarkdownV2" });
  }
});

bot.action(/^dk_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.from.id;
  if (!isOwner(id)) return;
  const kid = parseInt(ctx.match[1]);
  if (!dbOps.deleteKeyById(kid)) {
    await ctx.answerCbQuery("❌ Key not found.", { show_alert: true }); return;
  }
  await ctx.answerCbQuery("🗑️ Deleted!", { show_alert: true });
  const rem = dbOps.getKeysByCreator(id);
  if (!rem.length) {
    await ctx.editMessageText("📭 *No keys left.*", { parse_mode: "Markdown" }); return;
  }
  const btns = rem.slice(0, 40).map((k) => [
    Markup.button.callback(`🗑️ ${k.key} — ${typeEmoji(k.type)} ${durationLabel(k.duration_days)}`, `dk_${k.id}`),
  ]);
  btns.push([Markup.button.callback("❌ Close", "close")]);
  await ctx.editMessageText(`🗂️ *My Keys* (${rem.length})\n\nTap to delete:`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(btns),
  });
});

bot.action("close", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage().catch(() => {});
});

// ─── 🌟 Buy with Stars ────────────────────────────────────────────────────────
bot.hears(BTN.STARS, async (ctx) => {
  const starPrices = dbOps.getStarPrices();
  const btn = (type: string, days: number) => {
    const sp = starPrices.find((p) => p.type === type && p.duration_days === days);
    const stars = sp?.stars ?? 50;
    return Markup.button.callback(
      `${typeEmoji(type)} ${typeLabel(type)} ${durationLabel(days)} — ${stars} ⭐`,
      `stars_${type}_${days}`
    );
  };
  await ctx.reply(
    `🌟 *Buy with Telegram Stars*\n\n💫 Pay using your Telegram Stars and get your key instantly!\n\nSelect a plan:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [btn("basic", 1), btn("basic", 7)],
        [btn("basic", 30)],
        [btn("pro", 1), btn("pro", 7)],
        [btn("pro", 30)],
        [Markup.button.callback("❌ Cancel", "close")],
      ]),
    }
  );
});

bot.action(/^stars_(\w+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const type = ctx.match[1];
  const days = parseInt(ctx.match[2]);
  const stars = dbOps.getStarPrice(type, days);
  const title = `${typeLabel(type)} — ${durationLabel(days)}`;

  await ctx.deleteMessage().catch(() => {});
  await ctx.replyWithInvoice({
    title: `🔑 FF Proxy Key — ${title}`,
    description:
      `${typeLabel(type)} proxy key for ${durationLabel(days)}.\nOne port, full FF OBB mod with Head + Body hits.`,
    payload: `star_${type}_${days}`,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: title, amount: stars }],
  });
});

// ─── Stars: Pre-checkout ───────────────────────────────────────────────────────
bot.on("pre_checkout_query", async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// ─── 👑 Owner Panel ───────────────────────────────────────────────────────────
bot.hears(BTN.OWNER, async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  await sendOwnerPanel(ctx);
});

async function sendOwnerPanel(ctx: any) {
  const s = await dbOps.getStats();
  await ctx.reply(
    `┌───────────────────────┐\n│  👑 *Owner Control Panel*  │\n└───────────────────────┘\n\n` +
    `📊 *Stats:*\n` +
    `  🔑 Keys: ${s.totalKeys} | ✅ Active: ${s.activeKeys}\n` +
    `  🏪 Sellers: ${s.sellersCount} | 👥 Users: ${s.totalUsers}`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔑 Create Key",      "oc_create"),
         Markup.button.callback("🗑️ Delete Key",      "oc_delete")],
        [Markup.button.callback("👥 Manage Sellers",  "oc_sellers"),
         Markup.button.callback("📋 All Keys",        "oc_allkeys")],
        [Markup.button.callback("💰 Prices",          "oc_prices"),
         Markup.button.callback("📢 Broadcast",       "oc_broadcast")],
        [Markup.button.callback("❌ Close",           "close")],
      ]),
    }
  );
}

// Owner: Create Key
bot.action("oc_create", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  await ctx.editMessageText(
    "🔑 *Create Key*\n\nSelect type & duration:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔵 Basic 1d", "om_basic_1"),
         Markup.button.callback("🔵 Basic 7d", "om_basic_7"),
         Markup.button.callback("🔵 Basic 30d","om_basic_30")],
        [Markup.button.callback("⭐ Pro 1d",   "om_pro_1"),
         Markup.button.callback("⭐ Pro 7d",   "om_pro_7"),
         Markup.button.callback("⭐ Pro 30d",  "om_pro_30")],
        [Markup.button.callback("🔵 Basic Custom", "om_basic_custom"),
         Markup.button.callback("⭐ Pro Custom",   "om_pro_custom")],
        [Markup.button.callback("🔙 Back", "oc_back")],
      ]),
    }
  );
});

// Owner: choose qty after selecting type+duration
for (const [type, days] of [["basic",1],["basic",7],["basic",30],["pro",1],["pro",7],["pro",30]] as [string,number][]) {
  bot.action(`om_${type}_${days}`, async (ctx) => {
    await ctx.answerCbQuery();
    if (!isOwner(ctx.from.id)) return;
    await showQtyMenu(ctx, "oq", type, days, 0, true);
  });
}

// Owner: create N keys
bot.action(/^oq_(\w+)_(\d+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  const type = ctx.match[1];
  const days = parseInt(ctx.match[2]);
  const qty  = parseInt(ctx.match[3]);
  const keys = await dbOps.createKeys(type, days, OWNER_ID, qty);
  const keyLines = keys.map((k, i) => `  ${i + 1}. \`${k.key}\``).join("\n");
  await ctx.editMessageText(
    `✅ *${qty} Key${qty > 1 ? "s" : ""} Created!*\n\n` +
    `📋 ${typeLabel(type)} — ${durationLabel(days)}\n📅 Expires: ${formatDate(keys[0].expires_at)}\n\n` +
    `🔑 *Keys:*\n${keyLines}`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔑 Create More", "oc_create")],
        [Markup.button.callback("🔙 Panel",       "oc_back")],
      ]),
    }
  );
});

bot.action("om_basic_custom", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  states.set(ctx.from.id, { action: "owner_custom_days", data: { type: "basic" } });
  await ctx.editMessageText(
    "📅 *Custom Duration — Basic*\n\nSend number of days:",
    { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "oc_back")]]) }
  );
});

bot.action("om_pro_custom", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  states.set(ctx.from.id, { action: "owner_custom_days", data: { type: "pro" } });
  await ctx.editMessageText(
    "📅 *Custom Duration — Pro*\n\nSend number of days:",
    { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "oc_back")]]) }
  );
});

// Owner: Delete Key
bot.action("oc_delete", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  states.set(ctx.from.id, { action: "owner_del_key" });
  await ctx.editMessageText(
    "🗑️ *Delete Key*\n\nSend the key to delete:",
    { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "oc_back")]]) }
  );
});

// Owner: All Keys
bot.action("oc_allkeys", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  const keys = await dbOps.getAllKeys();
  if (!keys.length) {
    await ctx.editMessageText("📭 No keys yet.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "oc_back")]]),
    }); return;
  }
  const recent = keys.slice(0, 10);
  let t = `📋 *All Keys* (${keys.length} total)\n\n`;
  for (const k of recent) {
    const status = isExpired(k.expires_at) ? "❌" : "✅";
    const locked = k.locked_ip ? `🔒` : "🔓";
    t += `${status} \`${k.key}\` ${typeEmoji(k.type)} ${locked}\n`;
  }
  if (keys.length > 10) t += `\n_...and ${keys.length - 10} more_`;
  await ctx.editMessageText(t, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Back", "oc_back")]]),
  });
});

// Owner: Sellers
bot.action("oc_sellers", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx.from.id)) return;
  await showSellers(ctx);
});

async function showSellers(ctx: any) {
  const sellers = dbOps.getAllSellers();
  let t = `👥 *Sellers* (${sellers.length})\n\n`;
  for (const s of sellers) t += `  🏪 \`${s.user_id}\` ${s.username ? `@${s.username}` : ""} — 💰 ${s.balance} cr\n`;
  if (!sellers.length) t += "_No sellers yet._";
  await ctx.editMessageText(t, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("➕ Add Seller",    "os_add"),
       Markup.button.callback("➖ Remove Seller", "os_remove")],
      [Markup.button.callback("💰 Add Balance",   "os_balance")],
      [Markup.button.callback("🔙 Back",          "oc_back")],
    ]),
  });
}

bot.action("os_add", async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  states.set(ctx.from.id, { action: "owner_add_seller" });
  await ctx.editMessageText("➕ *Add Seller*\n\nSend the Telegram ID:", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "oc_sellers")]]),
  });
});

bot.action("os_remove", async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  states.set(ctx.from.id, { action: "owner_remove_seller" });
  await ctx.editMessageText("➖ *Remove Seller*\n\nSend the Telegram ID:", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "oc_sellers")]]),
  });
});

bot.action("os_balance", async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  const sellers = dbOps.getAllSellers();
  if (!sellers.length) {
    await ctx.answerCbQuery("No sellers yet.", { show_alert: true }); return;
  }
  const btns = sellers.map((s) => [
    Markup.button.callback(
      `🏪 ${s.username ? "@" + s.username : s.user_id} — 💰 ${s.balance} cr`,
      `ob_pick_${s.user_id}`
    ),
  ]);
  btns.push([Markup.button.callback("🔙 Back", "oc_sellers")]);
  await ctx.editMessageText("💰 *Send Credits*\n\nChoose a seller:", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(btns),
  });
});

bot.action(/^ob_pick_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  const tid = parseInt(ctx.match[1]);
  const seller = dbOps.getSeller(tid);
  if (!seller) { await ctx.answerCbQuery("Seller not found.", { show_alert: true }); return; }
  states.set(ctx.from.id, { action: "owner_balance_amount", data: { targetId: tid } });
  const name = seller.username ? `@${seller.username}` : `\`${tid}\``;
  await ctx.editMessageText(
    `💰 *Credits for ${name}*\n\n💳 Current: *${seller.balance} cr*\n\nAmount to send?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("10 💰", `ob_q_${tid}_10`),
         Markup.button.callback("25 💰", `ob_q_${tid}_25`),
         Markup.button.callback("50 💰", `ob_q_${tid}_50`)],
        [Markup.button.callback("100 💰", `ob_q_${tid}_100`),
         Markup.button.callback("✏️ Custom",  `ob_c_${tid}`)],
        [Markup.button.callback("🔙 Back", "os_balance")],
      ]),
    }
  );
});

bot.action(/^ob_q_(\d+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  const tid    = parseInt(ctx.match[1]);
  const amount = parseInt(ctx.match[2]);
  dbOps.addBalance(tid, amount);
  const s = dbOps.getSeller(tid);
  const name = s?.username ? `@${s.username}` : `\`${tid}\``;
  await ctx.editMessageText(
    `✅ *Credits Sent!*\n\n👤 ${name}\n💸 +${amount} cr\n💰 New Balance: *${s?.balance ?? 0} cr*`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("💰 Send More", "os_balance")],
        [Markup.button.callback("🔙 Panel",     "oc_back")],
      ]),
    }
  );
});

bot.action(/^ob_c_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  const tid = parseInt(ctx.match[1]);
  const seller = dbOps.getSeller(tid);
  const name = seller?.username ? `@${seller.username}` : `\`${tid}\``;
  states.set(ctx.from.id, { action: "owner_balance_amount", data: { targetId: tid } });
  await ctx.editMessageText(
    `✏️ *Custom Amount*\n\n👤 ${name} — 💳 ${seller?.balance ?? 0} cr\n\nSend the number:`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "os_balance")]]) }
  );
});

// Owner: Prices
bot.action("oc_prices", async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  const prices = dbOps.getPrices();
  let t = "💰 *Key Prices* (cr = credits)\n\n";
  for (const p of prices) t += `  ${typeEmoji(p.type)} ${typeLabel(p.type)} ${durationLabel(p.duration_days)}: *${p.price}* cr\n`;
  await ctx.editMessageText(t, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("✏️ Edit Price",  "oc_edit_prices")],
      [Markup.button.callback("🔙 Back",        "oc_back")],
    ]),
  });
});

bot.action("oc_edit_prices", async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  states.set(ctx.from.id, { action: "owner_edit_price" });
  await ctx.editMessageText(
    "✏️ *Edit Price*\n\nFormat: `TYPE DAYS PRICE`\nExample: `basic 30 3` or `pro 7 5`\n\nTypes: `basic` `pro` — Days: `1` `7` `30`",
    { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "oc_prices")]]) }
  );
});

// Owner: Broadcast
bot.action("oc_broadcast", async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  const users = dbOps.getAllUsers();
  states.set(ctx.from.id, { action: "owner_broadcast" });
  await ctx.editMessageText(
    `📢 *Broadcast Message*\n\n👥 Will be sent to *${users.length}* users.\n\nSend your message now:`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "oc_back")]]) }
  );
});

// Owner: Back
bot.action("oc_back", async (ctx) => {
  await ctx.answerCbQuery(); if (!isOwner(ctx.from.id)) return;
  const s = await dbOps.getStats();
  await ctx.editMessageText(
    `┌───────────────────────┐\n│  👑 *Owner Control Panel*  │\n└───────────────────────┘\n\n` +
    `📊 *Stats:*\n` +
    `  🔑 Keys: ${s.totalKeys} | ✅ Active: ${s.activeKeys}\n` +
    `  🏪 Sellers: ${s.sellersCount} | 👥 Users: ${s.totalUsers}`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔑 Create Key",     "oc_create"),
         Markup.button.callback("🗑️ Delete Key",     "oc_delete")],
        [Markup.button.callback("👥 Manage Sellers", "oc_sellers"),
         Markup.button.callback("📋 All Keys",       "oc_allkeys")],
        [Markup.button.callback("💰 Prices",         "oc_prices"),
         Markup.button.callback("📢 Broadcast",      "oc_broadcast")],
        [Markup.button.callback("❌ Close",          "close")],
      ]),
    }
  );
});

// ─── Stars: Successful Payment ────────────────────────────────────────────────
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
    `🌟 *شكراً على شرائك! | Thank you!*\n\n` +
    `✅ Your key is ready:\n\n` +
    `🔑 \`${k.key}\`\n\n` +
    `📋 ${typeLabel(type)} — ${durationLabel(days)}\n` +
    `📅 Expires: ${formatDate(k.expires_at)}\n\n` +
    `💡 Use *🚀 Use Key* to activate it.`,
    { parse_mode: "Markdown" }
  );
  // Notify owner
  try {
    await bot.telegram.sendMessage(
      OWNER_ID,
      `🌟 *New Stars Payment!*\n\n` +
      `👤 ${ctx.from.first_name}${ctx.from.username ? ` @${ctx.from.username}` : ""}\n` +
      `🆔 \`${userId}\`\n\n` +
      `💫 Stars: *${payment.total_amount}*\n` +
      `🔑 Key: \`${k.key}\`\n` +
      `📋 ${typeLabel(type)} — ${durationLabel(days)}`,
      { parse_mode: "Markdown" }
    );
  } catch { /* owner notification failed, ignore */ }
});

// ─── Text message handler (state machine) ─────────────────────────────────────
bot.on("text", async (ctx) => {
  const id   = ctx.from.id;
  const text = ctx.message.text.trim();
  if (MENU_TEXTS.has(text)) return;

  const state = states.get(id);
  if (!state) return;

  // Check Key flow
  if (state.action === "check_key") {
    states.delete(id);
    const key = await dbOps.checkKey(text.toUpperCase());
    if (!key) {
      await ctx.reply(`❌ *Invalid Key*\n\n\`${text}\` not found.`, { parse_mode: "Markdown" }); return;
    }
    if (isExpired(key.expires_at)) {
      await ctx.reply(`⚠️ *Key Expired*\n\n🔑 \`${key.key}\`\n📅 ${formatDate(key.expires_at)}`, { parse_mode: "Markdown" }); return;
    }
    const locked = key.locked_ip ? `🔒 Locked to: \`${key.locked_ip}\`` : "🔓 Available";
    await ctx.reply(
      `✅ *Key Valid!*\n\n🔑 \`${key.key}\`\n📋 ${typeLabel(key.type)}\n⏳ ${durationLabel(key.duration_days)}\n📅 Expires: ${formatDate(key.expires_at)}\n🕐 Days Left: *${getDaysLeft(key.expires_at)}*\n${locked}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Use Key: enter key
  if (state.action === "use_key_enter") {
    const key = await dbOps.checkKey(text.toUpperCase());
    if (!key) {
      states.delete(id);
      await ctx.reply(`❌ *Invalid Key*\n\n\`${text}\` not found.`, { parse_mode: "Markdown" }); return;
    }
    if (isExpired(key.expires_at)) {
      states.delete(id);
      await ctx.reply(`⚠️ *Key Expired*\n\nExpired: ${formatDate(key.expires_at)}`, { parse_mode: "Markdown" }); return;
    }
    if (key.locked_ip) {
      states.delete(id);
      await ctx.reply(
        `🔒 *Key Already In Use*\n\nLocked to another device.\n\n💡 Ask the owner to reset:\n\`/reset ${key.key}\``,
        { parse_mode: "Markdown" }
      );
      return;
    }
    states.set(id, { action: "use_key_ip", data: { keyStr: key.key, keyType: key.type } });
    await ctx.reply(
      `✅ *Key Verified!*\n\n📋 ${typeLabel(key.type)}\n🕐 Days Left: *${getDaysLeft(key.expires_at)}*\n\n📱 Now send your *device IP address* (open https://ip.me in your browser to see it):`,
      { parse_mode: "Markdown", ...Markup.forceReply() }
    );
    return;
  }

  // Use Key: enter IP
  if (state.action === "use_key_ip") {
    states.delete(id);
    const ip      = text.trim();
    const keyStr  = state.data?.keyStr as string;
    const keyType = state.data?.keyType as string ?? "basic";
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      await ctx.reply("❌ *Invalid IP*\n\nSend a valid IPv4 (e.g. `1.2.3.4`)", { parse_mode: "Markdown" }); return;
    }
    const fresh = await dbOps.getKeyByValue(keyStr);
    if (fresh?.locked_ip) {
      await ctx.reply(`🔒 *Key Just Locked*\n\nAnother device just activated it.`, { parse_mode: "Markdown" }); return;
    }
    await dbOps.lockKeyToIp(keyStr, ip);
    // Sync the key to the Railway proxy server so it relays game traffic.
    const synced = await dbOps.syncKeyToProxy(keyStr, "pro");
    if (!synced) {
      await ctx.reply(
        `⚠️ *Activation saved but proxy sync failed.*\n\nThe key may not work in-game yet.\n\n💡 Ask the owner to check the proxy server.`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    await ctx.reply(
      `🎉 *Connected!*\n\n📱 Your IP \`${ip}\` is linked to this key.\n\n` +
      `📋 *How to use:*\n1️⃣ Install the certificate (📋 Certificate menu)\n2️⃣ Add a Proxy profile in the game with the server & port below\n3️⃣ Launch Free Fire and pick your feature\n\n` +
      proxyText(keyType) +
      `\n🔑 Key: \`${keyStr}\`\n⏳ Expires: ${formatDate(fresh!.expires_at)}\n\n` +
      (keyType === "pro"
        ? `☣️ *Speed x1.5 port is exclusive to ⭐ Pro — use with caution.*`
        : `⬆️ Upgrade to ⭐ *Pro* to unlock ☣️ Speed x1.5 & 🎮 3D Mode!`),
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Owner-only flows
  if (!isOwner(id)) return;

  if (state.action === "owner_custom_days") {
    const days = parseInt(text);
    const type = state.data?.type as string ?? "basic";
    if (isNaN(days) || days < 1) { await ctx.reply("❌ Send a valid number (≥ 1)."); return; }
    states.delete(id);
    states.set(id, { action: "owner_custom_days_qty", data: { type, days } });
    await ctx.reply(
      `🔢 *Quantity?*\n\n${typeLabel(type)} — ${days} day(s)\n\nSend quantity (e.g. 1, 3, 5):`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (state.action === "owner_custom_days_qty") {
    states.delete(id);
    const qty  = parseInt(text);
    const type = state.data?.type as string ?? "basic";
    const days = state.data?.days as number ?? 1;
    if (isNaN(qty) || qty < 1) { await ctx.reply("❌ Send a valid quantity (≥ 1)."); return; }
    const keys = await dbOps.createKeys(type, days, OWNER_ID, qty);
    const lines = keys.map((k, i) => `  ${i + 1}. \`${k.key}\``).join("\n");
    await ctx.reply(
      `✅ *${qty} Key${qty > 1 ? "s" : ""} Created!*\n\n📋 ${typeLabel(type)} — ${durationLabel(days)}\n📅 ${formatDate(keys[0].expires_at)}\n\n🔑 Keys:\n${lines}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (state.action === "owner_del_key") {
    states.delete(id);
    const ok = dbOps.deleteKeyByValue(text.toUpperCase());
    await ctx.reply(
      ok ? `🗑️ Key \`${text.toUpperCase()}\` deleted.` : `❌ Key \`${text}\` not found.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (state.action === "owner_add_seller") {
    states.delete(id);
    const tid = parseInt(text);
    if (isNaN(tid)) { await ctx.reply("❌ Invalid ID."); return; }
    dbOps.addSeller(tid, null);
    await ctx.reply(`✅ User \`${tid}\` added as seller.`, { parse_mode: "Markdown" });
    return;
  }

  if (state.action === "owner_remove_seller") {
    states.delete(id);
    const tid = parseInt(text);
    if (isNaN(tid)) { await ctx.reply("❌ Invalid ID."); return; }
    const ok = dbOps.removeSeller(tid);
    await ctx.reply(
      ok ? `✅ Seller \`${tid}\` removed.` : `❌ \`${tid}\` is not a seller.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (state.action === "owner_balance_amount") {
    states.delete(id);
    const amount = parseInt(text);
    const tid    = state.data?.targetId as number;
    if (isNaN(amount) || amount <= 0) { await ctx.reply("❌ Send a positive number."); return; }
    dbOps.addBalance(tid, amount);
    const s    = dbOps.getSeller(tid);
    const name = s?.username ? `@${s.username}` : `\`${tid}\``;
    await ctx.reply(
      `✅ *Credits Sent!*\n\n👤 ${name}\n💸 +${amount} cr\n💰 New Balance: *${s?.balance ?? 0} cr*`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("💰 Send More", "os_balance")],
          [Markup.button.callback("🔙 Panel",     "oc_back")],
        ]),
      }
    );
    return;
  }

  if (state.action === "owner_edit_price") {
    states.delete(id);
    const parts = text.split(" ");
    if (parts.length !== 3) { await ctx.reply("❌ Format: `basic 30 3`", { parse_mode: "Markdown" }); return; }
    const [type, dStr, pStr] = parts;
    const days  = parseInt(dStr);
    const price = parseInt(pStr);
    if (!["basic","pro"].includes(type) || isNaN(days) || days < 1 || isNaN(price) || price < 0) {
      await ctx.reply("❌ Invalid data."); return;
    }
    dbOps.updatePrice(type, days, price);
    await ctx.reply(`✅ Price updated!\n${typeLabel(type)} — ${durationLabel(days)}: *${price}* cr`, { parse_mode: "Markdown" });
    return;
  }

  if (state.action === "owner_broadcast") {
    states.delete(id);
    const users = dbOps.getAllUsers();
    if (!users.length) { await ctx.reply("📭 No users to broadcast to."); return; }
    const broadcastMsg = text;
    let sent = 0, failed = 0;
    const statusMsg = await ctx.reply(`📢 *Broadcasting...*\n\n👥 Sending to ${users.length} users...`, { parse_mode: "Markdown" });
    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.id, broadcastMsg);
        sent++;
      } catch {
        failed++;
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 40));
    }
    await bot.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      `📢 *Broadcast Complete!*\n\n✅ Sent: *${sent}*\n❌ Failed: *${failed}*\n👥 Total: *${users.length}*`,
      { parse_mode: "Markdown" }
    );
    return;
  }
});

bot.catch((err, ctx) => {
  logger.error({ err, update: ctx.update }, "Bot error");
});

export default bot;
