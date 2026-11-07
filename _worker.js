var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/_lib.js
var SALT = "soony-b2c-2026";
async function hash(pw) {
  const data = new TextEncoder().encode(SALT + ":" + pw);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hash, "hash");
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
__name(json, "json");
function mask(name) {
  const n = String(name || "").trim();
  if (n.length <= 1) return "*";
  if (n.length === 2) return n[0] + "*";
  return n[0] + "*".repeat(n.length - 2) + n[n.length - 1];
}
__name(mask, "mask");
function digits(v) {
  return String(v || "").replace(/\D/g, "");
}
__name(digits, "digits");
var PER = 12;
var MAX_FAIL = 5;
var LOCK_MS = 60 * 1e3;

// api/posts/[id]/delete.js
async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  const id = parseInt(params.id, 10);
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "NOT_FOUND" }, 404);
  if (row.reply) return json({ ok: false, error: "ALREADY_ANSWERED" }, 409);
  if (await hash(String(b.password || "")) !== row.password_hash) return json({ ok: false, error: "WRONG_PASSWORD" }, 403);
  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
__name(onRequestPost, "onRequestPost");

// api/posts/[id]/open.js
async function onRequestPost2({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  const id = parseInt(params.id, 10);
  if (!id) return json({ ok: false, error: "NOT_FOUND" }, 404);
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!row.is_secret) return json({ ok: true, post: shape(row) });
  const now2 = Date.now();
  if (row.lock_until && row.lock_until > now2) {
    return json({ ok: false, error: "LOCKED", retry: Math.ceil((row.lock_until - now2) / 1e3) }, 429);
  }
  const pw = String(b.password || "");
  if (!pw) return json({ ok: false, error: "PASSWORD_REQUIRED" }, 401);
  if (await hash(pw) !== row.password_hash) {
    const fails = (row.fail_count || 0) + 1;
    if (fails >= MAX_FAIL) {
      await env.DB.prepare("UPDATE posts SET fail_count = 0, lock_until = ? WHERE id = ?").bind(now2 + LOCK_MS, id).run();
      return json({ ok: false, error: "LOCKED", retry: Math.ceil(LOCK_MS / 1e3) }, 429);
    }
    await env.DB.prepare("UPDATE posts SET fail_count = ? WHERE id = ?").bind(fails, id).run();
    return json({ ok: false, error: "WRONG_PASSWORD", left: MAX_FAIL - fails }, 403);
  }
  if (row.fail_count || row.lock_until) {
    await env.DB.prepare("UPDATE posts SET fail_count = 0, lock_until = 0 WHERE id = ?").bind(id).run();
  }
  return json({ ok: true, post: shape(row) });
}
__name(onRequestPost2, "onRequestPost");
function shape(r) {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    author: r.author,
    phone: r.phone,
    product: r.product,
    date: r.created_at,
    updated_at: r.updated_at,
    reply: r.reply,
    replied_at: r.replied_at,
    answered: !!(r.reply && r.reply.length)
  };
}
__name(shape, "shape");

// api/posts/[id]/reply.js
async function onRequestPost3({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: "ADMIN_NOT_CONFIGURED" }, 500);
  if ((request.headers.get("x-admin") || "") !== env.ADMIN_PASSWORD) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  const reply = String(b.reply || "").trim();
  if (reply.length < 2) return json({ ok: false, error: "REPLY" }, 400);
  await env.DB.prepare("UPDATE posts SET reply = ?, replied_at = datetime('now','+9 hours') WHERE id = ?").bind(reply, parseInt(params.id, 10)).run();
  return json({ ok: true });
}
__name(onRequestPost3, "onRequestPost");

// api/posts/[id]/update.js
async function onRequestPost4({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  const id = parseInt(params.id, 10);
  const row = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "NOT_FOUND" }, 404);
  if (row.reply) return json({ ok: false, error: "ALREADY_ANSWERED" }, 409);
  if (await hash(String(b.password || "")) !== row.password_hash) return json({ ok: false, error: "WRONG_PASSWORD" }, 403);
  const title = String(b.title || "").trim();
  const content = String(b.content || "").trim();
  const author = String(b.author || "").trim();
  const phone2 = digits(b.phone);
  if (title.length < 2) return json({ ok: false, error: "TITLE" }, 400);
  if (content.length < 5) return json({ ok: false, error: "CONTENT" }, 400);
  if (!author) return json({ ok: false, error: "AUTHOR" }, 400);
  if (phone2.length < 9) return json({ ok: false, error: "PHONE" }, 400);
  await env.DB.prepare(
    "UPDATE posts SET title = ?, content = ?, author = ?, phone = ?, product = ?, updated_at = datetime('now','+9 hours') WHERE id = ?"
  ).bind(title, content, author, phone2, String(b.product || "").trim(), id).run();
  return json({ ok: true });
}
__name(onRequestPost4, "onRequestPost");

// api/posts/mine.js
async function onRequestPost5({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  const author = String(b.author || "").trim();
  const phone2 = digits(b.phone);
  if (!author) return json({ ok: false, error: "AUTHOR" }, 400);
  if (phone2.length < 9) return json({ ok: false, error: "PHONE" }, 400);
  const rows = await env.DB.prepare(
    "SELECT id, title, created_at, updated_at, is_secret, kind, (reply IS NOT NULL AND reply <> '') AS answered FROM posts WHERE author = ? AND phone = ? ORDER BY id DESC LIMIT 50"
  ).bind(author, phone2).all();
  const list = (rows.results || []).map((r) => ({
    id: r.id,
    title: r.is_secret ? "\uBE44\uBC00\uAE00\uC785\uB2C8\uB2E4." : r.title,
    date: r.created_at,
    edited: !!r.updated_at,
    kind: r.kind || "consult",
    answered: !!r.answered
  }));
  return json({ ok: true, author: mask(author), total: list.length, list });
}
__name(onRequestPost5, "onRequestPost");

// api/admin.js
async function onRequestPost6({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: "ADMIN_NOT_CONFIGURED" }, 500);
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  if (String(b.password || "") !== env.ADMIN_PASSWORD) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  const page = Math.max(1, parseInt(b.page || "1", 10) || 1);
  const per = Math.min(50, Math.max(1, parseInt(b.per || "10", 10) || 10));
  const total = await env.DB.prepare("SELECT COUNT(*) AS c FROM posts").first("c");
  const rows = await env.DB.prepare("SELECT * FROM posts ORDER BY id DESC LIMIT ? OFFSET ?").bind(per, (page - 1) * per).all();
  return json({
    ok: true,
    list: rows.results || [],
    total: total || 0,
    page,
    per,
    pages: Math.max(1, Math.ceil((total || 0) / per))
  });
}
__name(onRequestPost6, "onRequestPost");

// api/_notify.js
function won(n) {
  return String(n || "").replace(/\D/g, "");
}
__name(won, "won");
function phone(d) {
  const s = won(d);
  if (s.length === 11) return s.slice(0, 3) + "-" + s.slice(3, 7) + "-" + s.slice(7);
  if (s.length === 10) return s.slice(0, 3) + "-" + s.slice(3, 6) + "-" + s.slice(6);
  return s;
}
__name(phone, "phone");
function now() {
  const d = new Date(Date.now() + 9 * 3600 * 1e3);
  const z = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "z");
  return d.getUTCFullYear() + "." + z(d.getUTCMonth() + 1) + "." + z(d.getUTCDate()) + " " + z(d.getUTCHours()) + ":" + z(d.getUTCMinutes());
}
__name(now, "now");
function buildMessage(post) {
  const kind = post.kind === "inquiry" ? "1:1\uBB38\uC758" : "\uC0C1\uB2F4\uC2E0\uCCAD";
  const lines = [
    "\u{1F514} \uC0C8 " + kind + "\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
    "",
    "\u25AA \uC0C1\uD488 : " + (post.product || "\uAE30\uD0C0 \uBB38\uC758"),
    "\u25AA \uC774\uB984 : " + post.author,
    "\u25AA \uC5F0\uB77D\uCC98 : " + phone(post.phone),
    "\u25AA \uC81C\uBAA9 : " + post.title,
    "",
    String(post.content || "").slice(0, 300),
    "",
    "\u{1F550} " + now()
  ];
  return lines.join("\n");
}
__name(buildMessage, "buildMessage");
async function notify(env, post) {
  const token = env.TELEGRAM_BOT_TOKEN_LG;
  const chat = env.TELEGRAM_CHAT_ID_LG;
  const text = buildMessage(post);
  const jobs = [];
  if (token && chat) {
    jobs.push(fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    }).catch(() => null));
  }
  if (env.DISCORD_WEBHOOK_LG) {
    jobs.push(fetch(env.DISCORD_WEBHOOK_LG, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text })
    }).catch(() => null));
  }
  if (env.SLACK_WEBHOOK_LG) {
    jobs.push(fetch(env.SLACK_WEBHOOK_LG, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    }).catch(() => null));
  }
  if (env.RESEND_API_KEY_LG && env.NOTIFY_EMAIL_LG && env.NOTIFY_FROM_LG) {
    jobs.push(fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.RESEND_API_KEY_LG },
      body: JSON.stringify({
        from: env.NOTIFY_FROM_LG,
        to: [env.NOTIFY_EMAIL_LG],
        subject: "[\uC0C1\uB2F4\uC2E0\uCCAD] " + post.title,
        text
      })
    }).catch(() => null));
  }
  await Promise.allSettled(jobs);
}
__name(notify, "notify");
function buildBlockMessage(row) {
  const lines = [
    "\u{1F6AB} \uBD80\uC815\uD074\uB9AD \uCC28\uB2E8",
    "",
    "\u25AA IP : " + (row.ip || "-"),
    "\u25AA \uC704\uD5D8\uC810\uC218 : " + (row.score || 0) + "\uC810",
    "\u25AA \uBC18\uBCF5 \uD69F\uC218 : " + (row.hits || 0) + "\uD68C",
    "\u25AA \uC0AC\uC720 : " + (row.reason || "-"),
    "\u25AA \uC9C0\uC5ED(\uCD94\uC815) : " + (row.region || "\uC54C \uC218 \uC5C6\uC74C"),
    "\u25AA \uD1B5\uC2E0\uC0AC : " + (row.org || "\uC54C \uC218 \uC5C6\uC74C"),
    "\u25AA \uCC28\uB2E8 \uD574\uC81C : " + (row.blockedUntil || "\uC601\uAD6C"),
    "",
    "\u25AA \uB9C8\uC9C0\uB9C9 \uD398\uC774\uC9C0 : " + (row.path || "/"),
    row.keyword ? "\u25AA \uC720\uC785 \uAC80\uC0C9\uC5B4 : " + row.keyword : "",
    "",
    "\uD574\uC81C : \uAD00\uB9AC\uC790 \uD398\uC774\uC9C0 \u2192 \uBD80\uC815\uD074\uB9AD \uAC10\uC9C0",
    "\u{1F550} " + now()
  ];
  return lines.filter(Boolean).join("\n");
}
__name(buildBlockMessage, "buildBlockMessage");
async function notifyBlock(env, row) {
  const token = env.TELEGRAM_BOT_TOKEN_LG;
  const chat = env.TELEGRAM_CHAT_ID_LG;
  const text = buildBlockMessage(row);
  if (!token || !chat) return;
  await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
  }).catch(() => null);
}
__name(notifyBlock, "notifyBlock");

// api/_smartlog.js
var RETENTION_DAYS = 365;
var WINDOW_MIN = 30;
var STAGE = { watch: 55, warn: 75, block: 105 };
var HOSTING = [
  "google",
  "amazon",
  "aws",
  "digitalocean",
  "vultr",
  "ovh",
  "hetzner",
  "microsoft",
  "azure",
  "oracle",
  "alibaba",
  "aliyun",
  "tencent",
  "contabo",
  "linode",
  "m247",
  "leaseweb",
  "colocrossing",
  "datacamp",
  "zenlayer",
  "kaopu",
  "choopa",
  "godaddy",
  "hostwinds",
  "ionos",
  "scaleway",
  "upcloud",
  "packethub",
  "kamatera",
  "hostinger",
  "namecheap",
  "sakura",
  "gmo",
  "idc",
  "fastly",
  "akamai",
  "mullvad",
  "nordvpn",
  "expressvpn",
  "surfshark",
  "cyberghost",
  "private internet",
  "proxy",
  "vpn"
];
var CARRIER = ["skt", "kt", "lgu", "lg u+", "samsung", "korea telecom", "sk broadband", "hello", "sk telink"];
var BOT_UA = /(bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|okhttp|scrapy|httpclient|java\/)/i;
var NAVER_AD_PARAMS = ["n_media", "n_query", "n_rank", "n_ad", "n_ad_group", "n_keyword", "n_keyword_id", "n_match", "n_campaign_type", "n_ad_group_type"];
function detectSource(ref, kw, qs) {
  let host = "";
  try {
    host = new URL(ref).hostname.toLowerCase();
  } catch {
  }
  const q = String(qs || "");
  const hasNaverAd = NAVER_AD_PARAMS.some((k) => new RegExp("[?&]" + k + "=").test(q));
  if (hasNaverAd) return "naver";
  if (/[?&]gclid=|gbraid=|wbraid=/.test(q)) return "google";
  if (/[?&]utm_source=naver/i.test(q)) return "naver";
  if (host.includes("search.naver") || host === "naver.com" || host.endsWith(".naver.com")) return "organic-naver";
  if (host.includes("google")) return "organic-google";
  if (host.includes("daum") || host.includes("kakao")) return "organic-daum";
  return "";
}
__name(detectSource, "detectSource");
function srcLabel(src) {
  if (src === "naver" || src === "google") return "\uAD11\uACE0";
  if (String(src || "").startsWith("organic")) return "\uC790\uC5F0\uAC80\uC0C9";
  if (!src) return "\uC9C1\uC811\uBC29\uBB38";
  return "\uC9C1\uC811\uBC29\uBB38";
}
__name(srcLabel, "srcLabel");
function clientIP(request) {
  const h = request.headers;
  return h.get("cf-connecting-ip") || (h.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
}
__name(clientIP, "clientIP");
async function uaHash(ua) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ua || ""));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(uaHash, "uaHash");
function isHosting(org) {
  const o = String(org || "").toLowerCase();
  return HOSTING.some((k) => o.includes(k));
}
__name(isHosting, "isHosting");
function isCarrier(org) {
  const o = String(org || "").toLowerCase();
  return CARRIER.some((k) => o.includes(k));
}
__name(isCarrier, "isCarrier");
async function blockState(env, ip) {
  const r = await env.DB.prepare("SELECT * FROM blocked_ips WHERE ip = ?").bind(ip).first();
  if (!r) return { mode: "none" };
  if (r.mode === "allow") return { mode: "allow", row: r };
  if (r.blocked_until) {
    const t = (/* @__PURE__ */ new Date(r.blocked_until.replace(" ", "T") + "+09:00")).getTime();
    if (t && t < Date.now()) return { mode: "expired", row: r };
  }
  return { mode: "block", row: r };
}
__name(blockState, "blockState");
async function maybePurge(env) {
  if (Math.random() > 0.03) return;
  try {
    await env.DB.prepare(`DELETE FROM click_logs WHERE created_at < datetime('now','+9 hours','-${RETENTION_DAYS} days')`).run();
    await env.DB.prepare(`DELETE FROM blocked_ips WHERE manual = 0 AND blocked_until IS NOT NULL AND blocked_until < datetime('now','+9 hours')`).run();
  } catch (e) {
  }
}
__name(maybePurge, "maybePurge");
function evaluate(c) {
  const why = [];
  if (!c.isAd) {
    const bad = BOT_UA.test(c.ua || "") && isHosting(c.org) ? 1 : 0;
    return { score: bad ? 60 : 0, reasons: bad ? ["\uBD07+\uD638\uC2A4\uD305"] : [], action: "allow", stage: 0 };
  }
  let s = 0;
  if (c.ipHits >= 10) {
    s += 100;
    why.push(`\uB3D9\uC77C IP ${c.ipHits}\uD68C \uAD11\uACE0 \uD074\uB9AD`);
  } else if (c.ipHits >= 6) {
    s += 75;
    why.push(`\uB3D9\uC77C IP ${c.ipHits}\uD68C \uAD11\uACE0 \uD074\uB9AD`);
  } else if (c.ipHits >= 4) {
    s += 55;
    why.push(`\uB3D9\uC77C IP ${c.ipHits}\uD68C \uAD11\uACE0 \uD074\uB9AD`);
  } else if (c.ipHits >= 3) {
    s += 35;
    why.push(`\uB3D9\uC77C IP ${c.ipHits}\uD68C \uAD11\uACE0 \uD074\uB9AD`);
  }
  if (c.fpHits >= 8) {
    s += 110;
    why.push(`\uB3D9\uC77C \uAE30\uAE30 ${c.fpHits}\uD68C`);
  } else if (c.fpHits >= 5) {
    s += 80;
    why.push(`\uB3D9\uC77C \uAE30\uAE30 ${c.fpHits}\uD68C`);
  } else if (c.fpHits >= 4) {
    s += 55;
    why.push(`\uB3D9\uC77C \uAE30\uAE30 ${c.fpHits}\uD68C`);
  } else if (c.fpHits >= 3) {
    s += 35;
    why.push(`\uB3D9\uC77C \uAE30\uAE30 ${c.fpHits}\uD68C`);
  }
  if (c.fpIps >= 3) {
    s += 80;
    why.push(`IP \uBCC0\uACBD ${c.fpIps}\uD68C`);
  } else if (c.fpIps >= 2) {
    s += 45;
    why.push(`IP \uBCC0\uACBD ${c.fpIps}\uD68C`);
  }
  if (BOT_UA.test(c.ua || "")) {
    s += 60;
    why.push("\uC790\uB3D9\uD654 \uD504\uB85C\uADF8\uB7A8");
  }
  if (isHosting(c.org)) {
    s += 50;
    why.push("\uD638\uC2A4\uD305/VPN \uB300\uC5ED");
  } else if (isCarrier(c.org)) {
    s -= 25;
    why.push("\uAD6D\uB0B4 \uD1B5\uC2E0\uC0AC(\uAC10\uC810)");
  }
  if (c.dwell !== null && c.dwell < 2) {
    s += 20;
    why.push("\uC989\uC2DC \uC774\uD0C8");
  }
  if (c.moved === 0) {
    s += 15;
    why.push("\uC0AC\uB78C \uD65C\uB3D9 \uC5C6\uC74C");
  }
  if (c.depth === 1 && c.ipHits >= 3) {
    s += 10;
    why.push("\uB2E8\uC77C \uD398\uC774\uC9C0\uB9CC \uC5F4\uB78C");
  }
  if (c.isKnown === 0 && c.ipHits >= 3) {
    s += 15;
    why.push("\uCFE0\uD0A4 \uC0AD\uC81C \uD6C4 \uC7AC\uC720\uC785");
  }
  s = Math.max(0, s);
  let action = "allow", stage = 0;
  if (s >= STAGE.block) {
    action = "block";
    stage = 3;
  } else if (s >= STAGE.warn) {
    action = "warn";
    stage = 2;
  } else if (s >= STAGE.watch) {
    action = "warn";
    stage = 1;
  }
  return { score: s, reasons: why, action, stage };
}
__name(evaluate, "evaluate");

// api/posts.js
async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  const u = new URL(request.url);
  const page = Math.max(1, parseInt(u.searchParams.get("page") || "1", 10) || 1);
  const field = u.searchParams.get("field") || "all";
  const q = (u.searchParams.get("q") || "").trim();
  const kind = u.searchParams.get("kind") || "all";
  const per = Math.min(100, Math.max(1, parseInt(u.searchParams.get("per") || "0", 10) || PER));
  const days = parseInt(u.searchParams.get("days") || "0", 10) || 0;
  let where = "WHERE 1 = 1";
  const binds = [];
  if (kind === "consult" || kind === "inquiry") {
    where += " AND kind = ?";
    binds.push(kind);
  }
  if (days > 0) {
    where += " AND created_at >= datetime('now','+9 hours','-" + days + " days')";
  }
  if (q) {
    if (field === "author") {
      where += " AND author LIKE ?";
      binds.push("%" + q + "%");
    } else if (field === "title") {
      where += " AND is_secret = 0 AND title LIKE ?";
      binds.push("%" + q + "%");
    } else {
      where += " AND ((is_secret = 0 AND title LIKE ?) OR author LIKE ?)";
      binds.push("%" + q + "%", "%" + q + "%");
    }
  }
  const total = await env.DB.prepare("SELECT COUNT(*) AS c FROM posts " + where).bind(...binds).first("c");
  const rows = await env.DB.prepare(
    "SELECT id, title, author, created_at, updated_at, is_secret, kind, (reply IS NOT NULL AND reply <> '') AS answered FROM posts " + where + " ORDER BY id DESC LIMIT ? OFFSET ?"
  ).bind(...binds, per, (page - 1) * per).all();
  const list = (rows.results || []).map((r) => ({
    id: r.id,
    title: r.is_secret ? "\uBE44\uBC00\uAE00\uC785\uB2C8\uB2E4." : r.title,
    author: mask(r.author),
    date: r.created_at,
    edited: !!r.updated_at,
    kind: r.kind || "consult",
    answered: !!r.answered,
    secret: !!r.is_secret
  }));
  return json({ ok: true, total: total || 0, page, per, pages: Math.max(1, Math.ceil((total || 0) / per)), list });
}
__name(onRequestGet, "onRequestGet");
var LG_PRODUCTS = ["\uAE30\uC5C5\uC778\uD130\uB137", "\uC778\uD130\uB137\uC804\uD654", "\uC0AC\uC7A5\uB2D8\uD328\uD0A4\uC9C0", "\uAE30\uC5C5IPTV", "\uC640\uC774\uD30C\uC774\uC624\uD53C\uC2A4", "\uC9C0\uB2A5\uD615CCTV", "\uAE30\uD0C0 \uBB38\uC758"];
async function onRequestPost7(context) {
  const { request, env } = context;
  const waitUntil = context.waitUntil ? context.waitUntil.bind(context) : null;
  if (env.DB) {
    const _st = await blockState(env, clientIP(request));
    if (_st.mode === "block") return json({ ok: false, error: "BLOCKED", message: "\uBE44\uC815\uC0C1 \uC811\uC18D\uC774 \uAC10\uC9C0\uB418\uC5B4 \uC811\uC218\uAC00 \uC81C\uD55C\uB418\uC5C8\uC2B5\uB2C8\uB2E4." }, 403);
  }
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  let title = String(b.title || "").trim();
  if (!title) title = "[\uC0C1\uB2F4\uC2E0\uCCAD] " + (String(b.product || "").trim() || "\uAE30\uD0C0 \uBB38\uC758");
  const content = String(b.content || "").trim();
  const author = String(b.author || "").trim();
  const phone2 = digits(b.phone);
  const product = String(b.product || "").trim();
  const password = String(b.password || "");
  const kind = b.kind === "inquiry" ? "inquiry" : "consult";
  if (product && !LG_PRODUCTS.includes(product)) return json({ ok: false, error: "PRODUCT" }, 400);
  if (title.length > 120) return json({ ok: false, error: "TITLE" }, 400);
  if (content.length < 5) return json({ ok: false, error: "CONTENT" }, 400);
  if (author.length < 1 || author.length > 20) return json({ ok: false, error: "AUTHOR" }, 400);
  if (phone2.length < 9 || phone2.length > 11) return json({ ok: false, error: "PHONE" }, 400);
  if (kind === "inquiry" && !/^\d{6}$/.test(password)) return json({ ok: false, error: "PASSWORD" }, 400);
  const hashv = await hash(password || crypto.randomUUID() + Date.now());
  const res = await env.DB.prepare(
    "INSERT INTO posts (title, content, author, phone, product, password_hash, is_secret, kind) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(title, content, author, phone2, product, hashv, kind === "inquiry" ? 1 : 0, kind).run();
  const id = res.meta ? res.meta.last_row_id : null;
  const task = notify(env, { title, content, author, phone: phone2, product, kind });
  if (waitUntil) waitUntil(task);
  else await task;
  return json({ ok: true, id });
}
__name(onRequestPost7, "onRequestPost");

// api/smartlog.js
function csvCell(v) {
  const s = String(v == null ? "" : v).replace(/"/g, '""');
  return '"' + s + '"';
}
__name(csvCell, "csvCell");
async function onRequestPost8({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: "ADMIN_NOT_CONFIGURED" }, 500);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  let b = {};
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  if (String(b.password || "") !== env.ADMIN_PASSWORD) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const op = String(b.op || "list");
  if (op === "list") {
    const days = Math.min(365, Math.max(1, parseInt(b.days || "7", 10) || 7));
    const sus = await env.DB.prepare(
      `SELECT ip, COUNT(*) AS hits, MAX(score) AS top, SUM(is_naver) AS naver,
              MAX(created_at) AS last, MAX(org) AS org, MAX(region) AS region,
              MAX(reason) AS reason, COUNT(DISTINCT fp) AS devices,
              ROUND(AVG(dwell),1) AS dwell, MAX(depth) AS depth
         FROM click_logs
        WHERE created_at >= datetime('now','+9 hours','-${days} days')
          AND action <> 'test'
          AND reason <> '\uB0B4\uBD80 \uC774\uB3D9'
        GROUP BY ip
        HAVING hits >= 3 OR top >= 45
        ORDER BY top DESC, hits DESC
        LIMIT 300`
    ).all();
    const blocked = await env.DB.prepare(
      `SELECT * FROM blocked_ips ORDER BY created_at DESC LIMIT 300`
    ).all();
    const stat = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN action='block' THEN 1 ELSE 0 END) AS blocked,
              SUM(CASE WHEN action='warn'  THEN 1 ELSE 0 END) AS warned,
              SUM(CASE WHEN is_naver=1 THEN 1 ELSE 0 END) AS ad,
              SUM(CASE WHEN is_naver=0 AND reason='\uC790\uC5F0\uAC80\uC0C9' THEN 1 ELSE 0 END) AS organic,
              SUM(CASE WHEN is_naver=0 AND reason='\uC9C1\uC811\uBC29\uBB38' THEN 1 ELSE 0 END) AS direct,
              SUM(CASE WHEN is_naver=0 AND reason='\uB0B4\uBD80 \uC774\uB3D9' THEN 1 ELSE 0 END) AS internal,
              SUM(CASE WHEN is_naver=1 AND keyword IS NOT NULL AND keyword<>'' THEN 1 ELSE 0 END) AS kword,
              COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT fp) AS devices
         FROM click_logs
        WHERE created_at >= datetime('now','+9 hours','-${days} days')
          AND action <> 'test'`
    ).first();
    const tstat = await env.DB.prepare(
      `SELECT COUNT(*) AS n, MAX(created_at) AS last FROM click_logs
        WHERE action='test' AND created_at >= datetime('now','+9 hours','-${days} days')`
    ).first();
    const logs = await env.DB.prepare(
      `SELECT id, ip, fp, ref, keyword, path, is_naver, score, action, reason, region, org, country,
              dwell, depth, created_at
         FROM click_logs
        WHERE created_at >= datetime('now','+9 hours','-${days} days')
          AND action <> 'test'
          AND reason <> '\uB0B4\uBD80 \uC774\uB3D9'
        ORDER BY id DESC LIMIT 100`
    ).all();
    return json({ ok: true, days, myIp: clientIP(request), stat: stat || {}, test: tstat || {}, logs: logs.results || [], suspicious: sus.results || [], blocked: blocked.results || [] });
  }
  if (op === "reset") {
    const what = String(b.target || "logs");
    if (what === "all") {
      await env.DB.prepare("DELETE FROM click_logs").run();
      await env.DB.prepare("DELETE FROM blocked_ips WHERE manual = 0").run();
    } else {
      await env.DB.prepare("DELETE FROM click_logs").run();
    }
    return json({ ok: true, reset: what });
  }
  if (op === "block") {
    const ip = String(b.ip || "").trim();
    if (!ip) return json({ ok: false, error: "NO_IP" }, 400);
    const hours = parseInt(b.hours || "0", 10);
    const until = hours > 0 ? new Date(Date.now() + 9 * 36e5 + hours * 36e5).toISOString().slice(0, 19).replace("T", " ") : null;
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, manual, note, blocked_until)
       VALUES (?, 'block', ?, 999, 1, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET mode='block', manual=1, reason=excluded.reason,
         note=excluded.note, blocked_until=excluded.blocked_until`
    ).bind(ip, String(b.reason || "\uAD00\uB9AC\uC790 \uCC28\uB2E8"), String(b.note || ""), until).run();
    await notifyBlock(env, {
      ip,
      score: 999,
      hits: 0,
      reason: "\uAD00\uB9AC\uC790 \uC9C1\uC811 \uCC28\uB2E8",
      region: "-",
      org: String(b.note || ""),
      blockedUntil: until || "\uC601\uAD6C",
      path: "-",
      keyword: ""
    });
    return json({ ok: true });
  }
  if (op === "allow") {
    const ip = String(b.ip || "").trim();
    if (!ip) return json({ ok: false, error: "NO_IP" }, 400);
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, manual, note, blocked_until)
       VALUES (?, 'allow', '\uD5C8\uC6A9 \uBAA9\uB85D', 0, 1, ?, NULL)
       ON CONFLICT(ip) DO UPDATE SET mode='allow', manual=1, blocked_until=NULL`
    ).bind(ip, String(b.note || "")).run();
    return json({ ok: true });
  }
  if (op === "unblock") {
    const ip = String(b.ip || "").trim();
    await env.DB.prepare("DELETE FROM blocked_ips WHERE ip = ?").bind(ip).run();
    return json({ ok: true });
  }
  if (op === "export") {
    const days = Math.min(365, Math.max(1, parseInt(b.days || "30", 10) || 30));
    const rows = await env.DB.prepare(
      `SELECT created_at, ip, fp, keyword, path, ref, score, action, reason, org, region, country, dwell, depth, ua
         FROM click_logs
        WHERE created_at >= datetime('now','+9 hours','-${days} days')
        ORDER BY created_at DESC LIMIT 20000`
    ).all();
    const head = ["\uC811\uC18D\uC77C\uC2DC", "IP", "\uAE30\uAE30\uC9C0\uBB38", "\uAC80\uC0C9\uD0A4\uC6CC\uB4DC", "\uBC29\uBB38\uACBD\uB85C", "\uC720\uC785URL", "\uC704\uD5D8\uC810\uC218", "\uD310\uC815", "\uD310\uC815\uC0AC\uC720", "\uD1B5\uC2E0\uC0AC/\uD638\uC2A4\uD305", "\uC811\uC18D\uC9C0\uC5ED", "\uAD6D\uAC00", "\uCCB4\uB958(\uCD08)", "\uD398\uC774\uC9C0\uC218", "\uBE0C\uB77C\uC6B0\uC800"];
    const lines = [head.map(csvCell).join(",")];
    for (const r of rows.results || []) {
      lines.push([
        r.created_at,
        r.ip,
        r.fp,
        r.keyword,
        r.path,
        r.ref,
        r.score,
        r.action,
        r.reason,
        r.org,
        r.region,
        r.country,
        r.dwell,
        r.depth,
        r.ua
      ].map(csvCell).join(","));
    }
    return new Response("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="smartlog.csv"'
      }
    });
  }
  if (op === "simulate") {
    const ua = request.headers.get("user-agent") || "";
    const org = String(request.cf && request.cf.asOrganization || "");
    const rows = [];
    for (let n = 1; n <= 10; n++) {
      const ev = evaluate({
        ipHits: n,
        fpHits: n,
        fpIps: Math.min(n, 3),
        ua,
        org,
        isAd: true,
        dwell: 8,
        moved: 1,
        depth: 3,
        isKnown: 1
      });
      rows.push({
        clicks: n,
        score: ev.score,
        action: ev.action,
        stage: ev.stage,
        reasons: ev.reasons.join(" / ")
      });
    }
    const ipChange = evaluate({
      ipHits: 3,
      fpHits: 4,
      fpIps: 4,
      ua,
      org,
      isAd: true,
      dwell: 5,
      moved: 1,
      depth: 2,
      isKnown: 0
    });
    return json({ ok: true, thresholds: STAGE, org, rows, ipChange });
  }
  if (op === "clearTest") {
    await env.DB.prepare("DELETE FROM click_logs WHERE path LIKE '%sl_test%'").run();
    return json({ ok: true });
  }
  return json({ ok: false, error: "UNKNOWN_OP" }, 400);
}
__name(onRequestPost8, "onRequestPost");

// api/track.js
function kst(offsetMs) {
  return new Date(Date.now() + 9 * 36e5 + (offsetMs || 0)).toISOString().slice(0, 19).replace("T", " ");
}
__name(kst, "kst");
async function onRequestPost9(context) {
  const { request, env } = context;
  const waitUntil = context.waitUntil ? context.waitUntil.bind(context) : (p) => {
    p && p.catch && p.catch(() => {
    });
  };
  if (!env.DB) return json({ ok: true, action: "allow", score: 0 });
  let b = {};
  try {
    b = await request.json();
  } catch {
  }
  const ip = clientIP(request);
  const cf = request.cf || {};
  const ua = request.headers.get("user-agent") || "";
  const ref = String(b.r || "").slice(0, 500);
  const kw = String(b.q || "").slice(0, 80);
  const path = String(b.p || "/").slice(0, 200);
  const fp = String(b.f || "").slice(0, 40);
  const isKnown = b.n === 1 ? 1 : 0;
  if (b.op === "upd" && b.id) {
    try {
      await env.DB.prepare(
        "UPDATE click_logs SET dwell = ?, depth = MAX(COALESCE(depth,1), ?), moved = MAX(COALESCE(moved,0), ?) WHERE id = ? AND ip = ?"
      ).bind(dwell, depth, moved, b.id, ip).run();
    } catch (e) {
    }
    return json({ ok: true, action: "allow", stage: 0, updated: true });
  }
  const dwell = typeof b.d === "number" ? b.d : null;
  const depth = typeof b.v === "number" ? b.v : 1;
  const moved = b.m === 1 ? 1 : 0;
  const selfHost = new URL(request.url).host;
  let refHost = "";
  try {
    refHost = ref ? new URL(ref).host : "";
  } catch {
  }
  const isEntry = !ref || refHost !== selfHost;
  let src = detectSource(ref, kw, b.qs);
  let testMode = b.t === 1;
  try {
    if (new URL(request.url).searchParams.get("sl_test") === "1") testMode = true;
  } catch {
  }
  if (testMode) src = "naver";
  const isNaver = src === "naver";
  const isAd = src === "naver" || src === "google";
  const uh = await uaHash(ua);
  const region = [cf.region, cf.city].filter(Boolean).join(" ") || String(cf.colo || "");
  const org = String(cf.asOrganization || "");
  const country = String(cf.country || "");
  if (testMode) {
    const r = await env.DB.prepare(
      `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known)
       VALUES (?,?,?,?,?,?,?,0,0,'test','\uD14C\uC2A4\uD2B8',?,?,?,?,?,?,?,?)`
    ).bind(ip, fp, ua.slice(0, 300), uh, ref, kw, path, String(cf.asn || ""), org, country, region, dwell, depth, moved, isKnown).run();
    return json({
      ok: true,
      action: "allow",
      stage: 0,
      score: 0,
      src: "naver",
      testMode: true,
      id: r.meta ? r.meta.last_row_id : null
    });
  }
  const st = await blockState(env, ip);
  if (st.mode === "allow") return json({ ok: true, action: "allow", score: 0, whitelisted: true });
  if (st.mode === "block") {
    return json({
      ok: true,
      action: "block",
      stage: 3,
      score: st.row.score || 100,
      reason: st.row.reason || "\uCC28\uB2E8\uB41C \uC811\uC18D",
      blockedUntil: st.row.blocked_until,
      hits: st.row.hit_count || 0,
      region,
      org
    });
  }
  if (!isEntry) {
    await env.DB.prepare(
      `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known)
       VALUES (?,?,?,?,?,?,?,0,0,'allow','\uB0B4\uBD80 \uC774\uB3D9',?,?,?,?,?,?,?,?)`
    ).bind(
      ip,
      fp,
      ua.slice(0, 300),
      uh,
      ref,
      kw,
      path,
      String(cf.asn || ""),
      org,
      country,
      region,
      dwell,
      depth,
      moved,
      isKnown
    ).run();
    return json({ ok: true, action: "allow", stage: 0, score: 0, internal: true, src, lastId: null });
  }
  const win = `datetime('now','+9 hours','-${WINDOW_MIN} minutes')`;
  let ipHits = 1, fpHits = 1, fpIps = 1;
  if (isAd) {
    const ipAgg = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM click_logs WHERE ip = ? AND is_naver = 1 AND created_at >= ${win}`
    ).bind(ip).first();
    fpHits = fp ? ((await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM click_logs WHERE fp = ? AND is_naver = 1 AND created_at >= ${win}`
    ).bind(fp).first() || {}).n || 0) + 1 : 1;
    fpIps = fp ? ((await env.DB.prepare(
      `SELECT COUNT(DISTINCT ip) AS n FROM click_logs WHERE fp = ? AND is_naver = 1 AND created_at >= ${win}`
    ).bind(fp).first() || {}).n || 0) + 1 : 1;
    ipHits = ((ipAgg || {}).n || 0) + 1;
  }
  const ev = evaluate({ ipHits, fpHits, fpIps, ua, org, isAd, dwell, moved, depth, isKnown });
  let action = ev.action, stage = ev.stage;
  if (action === "block") {
    const ok = await env.DB.prepare(
      `SELECT 1 AS c FROM blocked_ips WHERE ip = ? AND mode = 'allow'`
    ).bind(ip).first();
    if (ok) {
      action = "allow";
      stage = 0;
    }
  }
  const reason = isAd ? ev.reasons.join(" / ") : srcLabel(src);
  const ins = await env.DB.prepare(
    `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    ip,
    fp,
    ua.slice(0, 300),
    uh,
    ref,
    kw,
    path,
    isNaver ? 1 : 0,
    ev.score,
    action,
    reason,
    String(cf.asn || ""),
    org,
    country,
    region,
    dwell,
    depth,
    moved,
    isKnown
  ).run();
  const logId = ins && ins.meta ? ins.meta.last_row_id : null;
  let blockedUntil = null;
  if (action === "block" && isAd) {
    const hours = ev.score >= STAGE.block + 60 ? 24 : 4;
    blockedUntil = kst(hours * 36e5);
    const prev = await env.DB.prepare("SELECT mode, blocked_until FROM blocked_ips WHERE ip = ?").bind(ip).first();
    const isNew = !prev || prev.mode === "allow" || prev.blocked_until && prev.blocked_until < kst(0);
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, hit_count, blocked_until, manual, fp)
       VALUES (?, 'block', ?, ?, ?, ?, 0, ?)
       ON CONFLICT(ip) DO UPDATE SET reason=excluded.reason, score=excluded.score,
         hit_count=COALESCE(blocked_ips.hit_count,0)+1, blocked_until=excluded.blocked_until
       WHERE blocked_ips.manual = 0`
    ).bind(ip, reason || "\uBC18\uBCF5 \uC811\uC18D", ev.score, ipHits, blockedUntil, fp).run();
    if (isNew) {
      waitUntil(notifyBlock(env, {
        ip,
        score: ev.score,
        hits: ipHits,
        reason: reason || "\uBC18\uBCF5 \uC811\uC18D",
        region,
        org,
        country,
        blockedUntil,
        path,
        keyword: kw
      }));
    }
  }
  await maybePurge(env);
  return json({
    ok: true,
    action,
    stage,
    score: ev.score,
    hits: ipHits,
    reason,
    blockedUntil,
    region,
    org,
    fpDetected: fpHits > 1,
    fpIps,
    src,
    testMode,
    id: logId
  });
}
__name(onRequestPost9, "onRequestPost");

// api/_middleware.js
async function onRequest(context) {
  try {
    const response = await context.next();
    const type = response.headers.get("content-type") || "";
    if (type.includes("text/html")) return json({ ok: false, error: "API_NOT_FOUND" }, 404);
    return response;
  } catch {
    return json({ ok: false, error: "API_UNAVAILABLE" }, 500);
  }
}
__name(onRequest, "onRequest");

// ../../../../../../tmp/lg-worker-z3i5989n/.wrangler/tmp/pages-Vy9dai/functionsRoutes-0.5452096319895572.mjs
var routes = [
  {
    routePath: "/api/posts/:id/delete",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/posts/:id/open",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/posts/:id/reply",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/posts/:id/update",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/posts/mine",
    mountPath: "/api/posts",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/admin",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/posts",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/posts",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/smartlog",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/track",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api",
    mountPath: "/api",
    method: "",
    middlewares: [onRequest],
    modules: []
  }
];

// ../../../../../../usr/local/lib/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../../usr/local/lib/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function getOriginalPathPrefix(requestPath, normalizedPrefix) {
  let end = 0;
  for (let index = 0; index < normalizedPrefix.length; index++) {
    end++;
    if (normalizedPrefix[index] === "/") {
      while (requestPath[end] === "/") {
        end++;
      }
    }
  }
  return requestPath.slice(0, end);
}
__name(getOriginalPathPrefix, "getOriginalPathPrefix");
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  const normalizedRequestPath = requestPath.replace(/\/+/g, "/");
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath) || routeMatcher(normalizedRequestPath);
    const originalMountMatch = mountMatcher(requestPath);
    const mountMatchResult = originalMountMatch || mountMatcher(normalizedRequestPath);
    if (matchResult && mountMatchResult) {
      const path = originalMountMatch ? originalMountMatch.path : getOriginalPathPrefix(requestPath, mountMatchResult.path);
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
