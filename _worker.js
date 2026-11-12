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

// api/posts/[id]/admin-delete.js
async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: "ADMIN_NOT_CONFIGURED" }, 500);
  if ((request.headers.get("x-admin") || "") !== env.ADMIN_PASSWORD) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const id = parseInt(params.id, 10);
  if (!id) return json({ ok: false, error: "BAD_ID" }, 400);
  const row = await env.DB.prepare("SELECT id, title FROM posts WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "NOT_FOUND" }, 404);
  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  return json({ ok: true, id, title: row.title });
}
__name(onRequestPost, "onRequestPost");

// api/posts/[id]/delete.js
async function onRequestPost2({ request, env, params }) {
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
__name(onRequestPost2, "onRequestPost");

// api/posts/[id]/open.js
async function onRequestPost3({ request, env, params }) {
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
__name(onRequestPost3, "onRequestPost");
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
async function onRequestPost4({ request, env, params }) {
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
__name(onRequestPost4, "onRequestPost");

// api/posts/[id]/update.js
async function onRequestPost5({ request, env, params }) {
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
__name(onRequestPost5, "onRequestPost");

// api/posts/mine.js
async function onRequestPost6({ request, env }) {
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
__name(onRequestPost6, "onRequestPost");

// api/admin.js
async function onRequestPost7({ request, env }) {
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
__name(onRequestPost7, "onRequestPost");

// api/_tg.js
var API = "https://api.telegram.org/bot";
async function readSaved(env) {
  if (!env || !env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT val FROM app_settings WHERE key = 'tg_chat_id'").first();
    return row && row.val ? String(row.val) : null;
  } catch (e) {
    return null;
  }
}
__name(readSaved, "readSaved");
async function saveSaved(env, id) {
  if (!env || !env.DB) return false;
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, val TEXT, updated_at TEXT)"
    ).run();
    await env.DB.prepare(
      "INSERT INTO app_settings (key, val, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET val = excluded.val, updated_at = excluded.updated_at"
    ).bind("tg_chat_id", String(id), (/* @__PURE__ */ new Date()).toISOString()).run();
    return true;
  } catch (e) {
    return false;
  }
}
__name(saveSaved, "saveSaved");
async function send(token, chat, payload) {
  try {
    const res = await fetch(API + token + "/sendMessage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ chat_id: chat }, payload))
    });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }
    return { status: res.status, ok: !!(body && body.ok), body };
  } catch (e) {
    return { status: 0, ok: false, body: { description: String(e && e.message || e) } };
  }
}
__name(send, "send");
async function sendMessage(env, token, chat, payload) {
  if (!token || !chat) return { ok: false, error: "missing_credentials" };
  const saved = await readSaved(env);
  const primary = saved || String(chat);
  let r = await send(token, primary, payload);
  const migrated = r.body && r.body.parameters && r.body.parameters.migrate_to_chat_id;
  if (migrated) {
    const next = String(migrated);
    const r2 = await send(token, next, payload);
    if (r2.ok) {
      await saveSaved(env, next);
      return { ok: true, chat_id: next, migrated: true };
    }
    return { ok: false, chat_id: next, migrated: true, error: r2.body && r2.body.description || "send_failed" };
  }
  if (r.ok) return { ok: true, chat_id: primary };
  if (saved && String(saved) !== String(chat)) {
    const r3 = await send(token, String(chat), payload);
    if (r3.ok) return { ok: true, chat_id: String(chat) };
  }
  return { ok: false, chat_id: primary, error: r.body && r.body.description || "send_failed" };
}
__name(sendMessage, "sendMessage");

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
    jobs.push(sendMessage(env, token, chat, { text, disable_web_page_preview: true }));
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
  await sendMessage(env, token, chat, { text, disable_web_page_preview: true });
}
__name(notifyBlock, "notifyBlock");

// api/_smartlog.js
var RETENTION_DAYS = 365;
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
function judgeSession(c) {
  const why = [];
  let s = 0;
  if (c.isAd) {
    if (c.ipAd >= 10) {
      s += 100;
      why.push(`\uAC19\uC740 IP \uAD11\uACE0 ${c.ipAd}\uD68C`);
    } else if (c.ipAd >= 6) {
      s += 75;
      why.push(`\uAC19\uC740 IP \uAD11\uACE0 ${c.ipAd}\uD68C`);
    } else if (c.ipAd >= 4) {
      s += 55;
      why.push(`\uAC19\uC740 IP \uAD11\uACE0 ${c.ipAd}\uD68C`);
    } else if (c.ipAd >= 3) {
      s += 35;
      why.push(`\uAC19\uC740 IP \uAD11\uACE0 ${c.ipAd}\uD68C`);
    }
    if (c.fpAd >= 8) {
      s += 110;
      why.push(`\uAC19\uC740 \uAE30\uAE30 \uAD11\uACE0 ${c.fpAd}\uD68C`);
    } else if (c.fpAd >= 5) {
      s += 80;
      why.push(`\uAC19\uC740 \uAE30\uAE30 \uAD11\uACE0 ${c.fpAd}\uD68C`);
    } else if (c.fpAd >= 4) {
      s += 55;
      why.push(`\uAC19\uC740 \uAE30\uAE30 \uAD11\uACE0 ${c.fpAd}\uD68C`);
    } else if (c.fpAd >= 3) {
      s += 35;
      why.push(`\uAC19\uC740 \uAE30\uAE30 \uAD11\uACE0 ${c.fpAd}\uD68C`);
    }
    if (c.fpIps >= 3) {
      s += 80;
      why.push(`\uAE30\uAE30\uB2F9 IP ${c.fpIps}\uAC1C`);
    } else if (c.fpIps >= 2) {
      s += 45;
      why.push(`\uAE30\uAE30\uB2F9 IP ${c.fpIps}\uAC1C`);
    }
  }
  if (c.isAd && c.asnAd >= 3 && !c.carrier) {
    if (c.asnAd >= 8) {
      s += 65;
      why.push(`\uAC19\uC740 \uB300\uC5ED \uAD11\uACE0 ${c.asnAd}\uD68C`);
    } else if (c.asnAd >= 5) {
      s += 45;
      why.push(`\uAC19\uC740 \uB300\uC5ED \uAD11\uACE0 ${c.asnAd}\uD68C`);
    } else {
      s += 25;
      why.push(`\uAC19\uC740 \uB300\uC5ED \uAD11\uACE0 ${c.asnAd}\uD68C`);
    }
  }
  if (c.bot) {
    s += 60;
    why.push("\uC790\uB3D9\uD654 \uD504\uB85C\uADF8\uB7A8");
  }
  if (c.hosting) {
    s += 50;
    why.push("\uD638\uC2A4\uD305/VPN \uB300\uC5ED");
  } else if (c.carrier) {
    s -= 25;
    why.push("\uAD6D\uB0B4 \uD1B5\uC2E0\uC0AC(\uAC10\uC810)");
  }
  s = Math.max(0, Math.round(s));
  let verdict = "normal";
  if (s >= STAGE.block) verdict = "block";
  else if (s >= STAGE.warn) verdict = "warn";
  else if (s >= STAGE.watch) verdict = "watch";
  if (c.converted) {
    verdict = "normal";
    s = Math.min(s, 40);
  }
  return { score: s, verdict, reasons: why };
}
__name(judgeSession, "judgeSession");
var _schemaReady = false;
async function ensureSchema(env) {
  if (_schemaReady || !env || !env.DB) return;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS visits (
      sid TEXT PRIMARY KEY, fp TEXT, ip TEXT, src TEXT, is_ad INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL, last_at TEXT, total_ms INTEGER NOT NULL DEFAULT 0,
      pages INTEGER NOT NULL DEFAULT 1, moved INTEGER NOT NULL DEFAULT 0,
      depth INTEGER NOT NULL DEFAULT 1, asn TEXT, region TEXT, org TEXT, country TEXT, ua TEXT, kw TEXT,
      score INTEGER NOT NULL DEFAULT 0, verdict TEXT NOT NULL DEFAULT 'normal', reasons TEXT)`).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_visits_time ON visits (started_at DESC)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits (ip, started_at DESC)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_visits_fp ON visits (fp, started_at DESC)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_visits_ad ON visits (is_ad, started_at DESC)").run();
    try {
      await env.DB.prepare("ALTER TABLE click_logs ADD COLUMN sid TEXT").run();
    } catch (e) {
    }
    try {
      await env.DB.prepare("ALTER TABLE click_logs ADD COLUMN act_ms INTEGER").run();
    } catch (e) {
    }
    try {
      await env.DB.prepare("ALTER TABLE visits ADD COLUMN asn TEXT").run();
    } catch (e) {
    }
    try {
      await env.DB.prepare("ALTER TABLE visits ADD COLUMN kw TEXT").run();
    } catch (e) {
    }
    _schemaReady = true;
  } catch (e) {
  }
}
__name(ensureSchema, "ensureSchema");

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
async function onRequestPost8(context) {
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
__name(onRequestPost8, "onRequestPost");

// api/smartlog.js
var clampDays = /* @__PURE__ */ __name((v) => Math.min(365, Math.max(1, parseInt(v || "7", 10) || 7)), "clampDays");
var clampPage = /* @__PURE__ */ __name((v) => Math.max(1, parseInt(v || "1", 10) || 1), "clampPage");
var clampPer = /* @__PURE__ */ __name((v) => Math.min(100, Math.max(5, parseInt(v || "20", 10) || 20)), "clampPer");
function csvCell(v) {
  return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
}
__name(csvCell, "csvCell");
async function onRequestPost9({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: "ADMIN_NOT_CONFIGURED" }, 500);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_BOUND" }, 500);
  let b = {};
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  if (String(b.password || "") !== env.ADMIN_PASSWORD) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  await ensureSchema(env);
  const op = String(b.op || "summary");
  const days = clampDays(b.days);
  const win = `datetime('now','+9 hours','-${days} days')`;
  if (op === "summary") {
    const s = await env.DB.prepare(
      `SELECT COUNT(*) AS visits,
              SUM(CASE WHEN is_ad = 1 THEN 1 ELSE 0 END) AS ad,
              SUM(CASE WHEN is_ad = 0 THEN 1 ELSE 0 END) AS nonad,
              SUM(CASE WHEN is_ad = 1 THEN total_ms ELSE 0 END) AS ad_ms,
              SUM(CASE WHEN is_ad = 1 AND total_ms < 3000 THEN 1 ELSE 0 END) AS bounce,
              SUM(CASE WHEN verdict = 'block' THEN 1 ELSE 0 END) AS blocked,
              SUM(CASE WHEN verdict = 'warn' THEN 1 ELSE 0 END) AS warned,
              SUM(CASE WHEN verdict = 'watch' THEN 1 ELSE 0 END) AS watched,
              ROUND(AVG(pages), 1) AS avg_pages,
              COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT fp) AS devices
         FROM visits WHERE started_at >= ${win}`
    ).first();
    const s2 = await env.DB.prepare(
      `SELECT COUNT(*) AS pv, SUM(CASE WHEN reason = '\uB0B4\uBD80 \uC774\uB3D9' THEN 1 ELSE 0 END) AS internal
         FROM click_logs WHERE created_at >= ${win} AND action <> 'test'`
    ).first();
    const bl = await env.DB.prepare("SELECT COUNT(*) AS c FROM blocked_ips WHERE mode = 'block'").first();
    return json({ ok: true, days, myIp: clientIP(request), stat: s || {}, pv: s2 || {}, blockedNow: (bl || {}).c || 0 });
  }
  if (op === "visits") {
    const page = clampPage(b.page), per = clampPer(b.per);
    const src = String(b.src || "all"), verdict = String(b.verdict || "all"), q = String(b.q || "").trim();
    let where = `WHERE started_at >= ${win}`;
    const binds = [];
    if (src === "ad") where += " AND is_ad = 1";
    if (src === "nonad") where += " AND is_ad = 0";
    if (verdict !== "all") {
      where += " AND verdict = ?";
      binds.push(verdict);
    }
    if (q) {
      where += " AND (ip LIKE ? OR fp LIKE ? OR org LIKE ? OR kw LIKE ?)";
      binds.push("%" + q + "%", "%" + q + "%", "%" + q + "%", "%" + q + "%");
    }
    const total = await env.DB.prepare("SELECT COUNT(*) AS c FROM visits " + where).bind(...binds).first("c");
    const rows = await env.DB.prepare(
      "SELECT * FROM visits " + where + " ORDER BY started_at DESC LIMIT ? OFFSET ?"
    ).bind(...binds, per, (page - 1) * per).all();
    return json({ ok: true, page, per, total: total || 0, pages: Math.max(1, Math.ceil((total || 0) / per)), list: rows.results || [] });
  }
  if (op === "detail") {
    const sid = String(b.sid || "");
    const v = await env.DB.prepare("SELECT * FROM visits WHERE sid = ?").bind(sid).first();
    const l = await env.DB.prepare(
      `SELECT id, path, ref, keyword, created_at, dwell, act_ms, moved, reason
         FROM click_logs WHERE sid = ? ORDER BY id ASC LIMIT 60`
    ).bind(sid).all();
    return json({ ok: true, visit: v || null, logs: l.results || [] });
  }
  if (op === "suspicious") {
    const page = clampPage(b.page), per = clampPer(b.per);
    const base = `FROM visits WHERE started_at >= ${win} AND (is_ad = 1 OR score >= 60)`;
    const total = await env.DB.prepare("SELECT COUNT(DISTINCT ip) AS c " + base).first("c");
    const rows = await env.DB.prepare(
      `SELECT ip, COUNT(*) AS sessions, SUM(is_ad) AS ad_sessions, MAX(score) AS top,
              COUNT(DISTINCT fp) AS devices, SUM(total_ms) AS ms, MAX(region) AS region,
              MAX(org) AS org, MAX(last_at) AS last, MAX(reasons) AS reason
         ${base}
        GROUP BY ip
        HAVING SUM(is_ad) >= 1 OR MAX(score) >= 60
        ORDER BY top DESC, sessions DESC LIMIT ? OFFSET ?`
    ).bind(per, (page - 1) * per).all();
    return json({ ok: true, page, per, total: total || 0, pages: Math.max(1, Math.ceil((total || 0) / per)), list: rows.results || [] });
  }
  if (op === "asn") {
    const rows = await env.DB.prepare(
      `SELECT asn, MAX(org) AS org, COUNT(*) AS sessions, SUM(is_ad) AS ad_sessions,
              COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT fp) AS devices,
              MAX(score) AS top, SUM(total_ms) AS ms, MAX(region) AS region, MAX(last_at) AS last
         FROM visits
        WHERE started_at >= ${win} AND asn IS NOT NULL AND asn <> ''
          AND (is_ad = 1 OR score >= 60)
        GROUP BY asn
        HAVING SUM(is_ad) >= 2 AND COUNT(DISTINCT ip) >= 2
        ORDER BY ad_sessions DESC, top DESC LIMIT 30`
    ).all();
    return json({ ok: true, list: rows.results || [] });
  }
  if (op === "blocked") {
    const rows = await env.DB.prepare("SELECT * FROM blocked_ips ORDER BY created_at DESC LIMIT 300").all();
    return json({ ok: true, list: rows.results || [] });
  }
  if (op === "logs") {
    const page = clampPage(b.page), per = clampPer(b.per, 30);
    const total = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM click_logs WHERE created_at >= ${win} AND action <> 'test'`
    ).first("c");
    const rows = await env.DB.prepare(
      `SELECT id, ip, fp, sid, path, ref, keyword, is_naver, score, action, reason, region,
              dwell, act_ms, created_at
         FROM click_logs WHERE created_at >= ${win} AND action <> 'test'
        ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(per, (page - 1) * per).all();
    return json({ ok: true, page, per, total: total || 0, pages: Math.max(1, Math.ceil((total || 0) / per)), list: rows.results || [] });
  }
  if (op === "reindex") {
    let from = String(b.from || "").trim();
    if (!from) {
      const mn = await env.DB.prepare("SELECT MIN(created_at) AS m FROM click_logs WHERE action <> 'test'").first("m");
      if (!mn) return json({ ok: true, done: true, inserted: 0, msg: "\uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
      from = mn;
    }
    const toRow = await env.DB.prepare("SELECT datetime(?, '+10 days') AS t").bind(from).first();
    const to = toRow.t;
    const rows = await env.DB.prepare(
      `WITH base AS (
         SELECT id, ip, COALESCE(NULLIF(fp,''), 'ip:' || ip) AS k, is_naver, created_at,
                COALESCE(dwell, 0) AS dwell, COALESCE(moved, 0) AS moved, asn, region, org, country, ua, keyword,
                julianday(created_at) AS jd
           FROM click_logs
          WHERE action <> 'test' AND created_at >= ? AND created_at < ?
       ),
       g AS (SELECT *, CASE WHEN jd - LAG(jd) OVER (PARTITION BY k ORDER BY created_at) > 0.0208333 THEN 1 ELSE 0 END AS ns FROM base),
       s AS (SELECT *, SUM(COALESCE(ns, 1)) OVER (PARTITION BY k ORDER BY created_at ROWS UNBOUNDED PRECEDING) AS seg FROM g)
       SELECT k, seg, MIN(id) AS first_id, MAX(id) AS last_id, MAX(ip) AS ip, MAX(is_naver) AS is_ad,
              COUNT(*) AS pages, SUM(dwell) AS sec, MAX(moved) AS moved,
              MIN(created_at) AS started_at, MAX(created_at) AS last_at,
              MAX(asn) AS asn, MAX(region) AS region, MAX(org) AS org, MAX(country) AS country, MAX(ua) AS ua, MAX(keyword) AS kw
         FROM s GROUP BY k, seg ORDER BY MIN(created_at) ASC`
    ).bind(from, to).all();
    const list = rows.results || [];
    const BOT = /(bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|okhttp|scrapy|httpclient|java\/)/i;
    const byIp = /* @__PURE__ */ new Map(), byFp = /* @__PURE__ */ new Map(), byAsn = /* @__PURE__ */ new Map();
    list.forEach((r, i) => {
      (byIp.get(r.ip) || byIp.set(r.ip, []).get(r.ip)).push(i);
      if (r.k) (byFp.get(r.k) || byFp.set(r.k, []).get(r.k)).push(i);
      if (r.asn) (byAsn.get(r.asn) || byAsn.set(r.asn, []).get(r.asn)).push(i);
    });
    const countWin = /* @__PURE__ */ __name((arr, i, min) => {
      const t = (/* @__PURE__ */ new Date(list[i].started_at.replace(" ", "T") + "+09:00")).getTime();
      let n = 0;
      for (const j of arr) {
        const u = (/* @__PURE__ */ new Date(list[j].started_at.replace(" ", "T") + "+09:00")).getTime();
        if (Math.abs(u - t) <= min * 6e4 && list[j].is_ad) n++;
      }
      return n;
    }, "countWin");
    const stmts = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const isAd = !!r.is_ad;
      const sec = Number(r.sec) || 0;
      const pages = Number(r.pages) || 1;
      let score = 0;
      if (isAd) {
        const ipAd = countWin(byIp.get(r.ip) || [], i, 30);
        const fpAd = r.k ? countWin(byFp.get(r.k) || [], i, 30) : 0;
        const ipSet = /* @__PURE__ */ new Set();
        (byFp.get(r.k) || []).forEach((j) => {
          if (list[j].is_ad) ipSet.add(list[j].ip);
        });
        const fpIps = ipSet.size;
        const host = /(google|amazon|aws|digitalocean|vultr|ovh|hetzner|microsoft|azure|oracle|alibaba|tencent|contabo|linode|m247|leaseweb|colocrossing|hostinger|namecheap|proxy|vpn)/i.test(r.org || "");
        if (ipAd >= 10) score += 100;
        else if (ipAd >= 6) score += 75;
        else if (ipAd >= 4) score += 55;
        else if (ipAd >= 3) score += 35;
        if (fpAd >= 8) score += 110;
        else if (fpAd >= 5) score += 80;
        else if (fpAd >= 4) score += 55;
        else if (fpAd >= 3) score += 35;
        if (fpIps >= 3) score += 80;
        else if (fpIps >= 2) score += 45;
        const carrier = /(skt|kt |lgu|lg u\+|korea telecom|sk broadband|sk telink|hello)/i.test(r.org || "");
        if (r.asn && !carrier) {
          const asnAd = countWin(byAsn.get(r.asn) || [], i, 30);
          if (asnAd >= 8) score += 65;
          else if (asnAd >= 5) score += 45;
          else if (asnAd >= 3) score += 25;
        }
        if (BOT.test(r.ua || "")) score += 60;
        if (host) score += 50;
      }
      score = Math.max(0, Math.round(score));
      let verdict = "normal";
      if (score >= 105) verdict = "block";
      else if (score >= 75) verdict = "warn";
      else if (score >= 55) verdict = "watch";
      const sid = ("b" + r.k + ":" + r.seg + ":" + r.started_at).slice(0, 48);
      stmts.push(env.DB.prepare(
        `INSERT OR REPLACE INTO visits (sid, fp, ip, src, is_ad, started_at, last_at, total_ms, pages, moved, depth, asn, region, org, country, ua, kw, score, verdict, reasons)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        sid,
        r.k && !String(r.k).startsWith("ip:") ? r.k : "",
        r.ip,
        isAd ? "naver" : "",
        isAd ? 1 : 0,
        r.started_at,
        r.last_at,
        sec * 1e3,
        pages,
        r.moved || 0,
        pages,
        String(r.asn || ""),
        r.region || "",
        r.org || "",
        r.country || "",
        String(r.ua || "").slice(0, 200),
        String(r.kw || ""),
        score,
        verdict,
        isAd ? "\uC7AC\uC9D1\uACC4" : ""
      ));
    }
    await env.DB.prepare("DELETE FROM visits WHERE started_at >= ? AND started_at < ?").bind(from, to).run();
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    const done = !list.length || to > new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 19).replace("T", " ");
    return json({ ok: true, done, from, to, inserted: list.length, next: done ? null : to });
  }
  if (op === "export") {
    const rows = await env.DB.prepare(
      `SELECT started_at, ip, fp, total_ms, pages, score, verdict, reasons
         FROM visits WHERE started_at >= ${win} AND (is_ad = 1 OR score >= 60)
        ORDER BY started_at DESC LIMIT 3000`
    ).all();
    const head = ["\uC77C\uC2DC", "IP", "\uAE30\uAE30\uC9C0\uBB38", "\uCD1D\uCCB4\uB958(\uCD08)", "\uD398\uC774\uC9C0", "\uC810\uC218", "\uD310\uC815", "\uC0AC\uC720"];
    const lines = [head.map(csvCell).join(",")];
    (rows.results || []).forEach((r) => lines.push([
      r.started_at,
      r.ip,
      r.fp || "",
      Math.round((r.total_ms || 0) / 1e3),
      r.pages,
      r.score,
      r.verdict,
      r.reasons || ""
    ].map(csvCell).join(",")));
    return json({ ok: true, csv: lines.join("\r\n"), count: (rows.results || []).length });
  }
  if (op === "block" || op === "allow" || op === "unblock") {
    const ip = String(b.ip || "").trim();
    if (!ip) return json({ ok: false, error: "BAD_IP" }, 400);
    if (op === "unblock") {
      await env.DB.prepare("DELETE FROM blocked_ips WHERE ip = ? AND manual = 1").bind(ip).run();
      return json({ ok: true });
    }
    const mode = op;
    const hours = Math.max(0, parseInt(b.hours || "24", 10) || 0);
    const until = mode === "allow" || !hours ? null : new Date(Date.now() + 9 * 36e5 + hours * 36e5).toISOString().slice(0, 19).replace("T", " ");
    await env.DB.prepare(
      `INSERT INTO blocked_ips (ip, mode, reason, score, hit_count, blocked_until, manual)
       VALUES (?, ?, ?, 0, 0, ?, 1)
       ON CONFLICT(ip) DO UPDATE SET mode = excluded.mode, reason = excluded.reason,
         blocked_until = excluded.blocked_until, manual = 1`
    ).bind(ip, mode, mode === "block" ? "\uAD00\uB9AC\uC790 \uC218\uB3D9 \uCC28\uB2E8" : "\uAD00\uB9AC\uC790 \uD5C8\uC6A9", until).run();
    return json({ ok: true });
  }
  if (op === "reset") {
    await env.DB.prepare("DELETE FROM click_logs").run();
    await env.DB.prepare("DELETE FROM visits").run();
    await env.DB.prepare("DELETE FROM blocked_ips WHERE manual = 0").run();
    return json({ ok: true });
  }
  return json({ ok: false, error: "UNKNOWN_OP" }, 400);
}
__name(onRequestPost9, "onRequestPost");

// api/track.js
var BOT_UA = /(bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|okhttp|scrapy|httpclient|java\/)/i;
var MAX_ACT = 30 * 60 * 1e3;
function kst(offsetMs) {
  return new Date(Date.now() + 9 * 36e5 + (offsetMs || 0)).toISOString().slice(0, 19).replace("T", " ");
}
__name(kst, "kst");
async function onRequestPost10(context) {
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
  await ensureSchema(env);
  const ip = clientIP(request);
  const cf = request.cf || {};
  const ua = request.headers.get("user-agent") || "";
  const ref = String(b.r || "").slice(0, 500);
  const kw = String(b.q || "").slice(0, 80);
  const path = String(b.p || "/").slice(0, 200);
  const fp = String(b.f || "").slice(0, 40);
  const sid = String(b.s || "").slice(0, 48);
  const isKnown = b.n === 1 ? 1 : 0;
  const actMs = Math.max(0, Math.min(MAX_ACT, Number(b.a) || 0));
  const asn = String(cf.asn || "");
  const region = [cf.region, cf.city].filter(Boolean).join(" ") || String(cf.colo || "");
  const org = String(cf.asOrganization || "");
  const country = String(cf.country || "");
  if (b.op === "upd" && b.id) {
    try {
      const prev = await env.DB.prepare("SELECT act_ms, sid FROM click_logs WHERE id = ? AND ip = ?").bind(b.id, ip).first();
      if (prev) {
        const oldMs = Number(prev.act_ms) || 0;
        const delta = Math.max(0, actMs - oldMs);
        await env.DB.prepare(
          "UPDATE click_logs SET act_ms = ?, dwell = ?, depth = MAX(COALESCE(depth,1), ?), moved = MAX(COALESCE(moved,0), ?) WHERE id = ?"
        ).bind(actMs, Math.round(actMs / 1e3), typeof b.v === "number" ? b.v : 1, b.m === 1 ? 1 : 0, b.id).run();
        if (delta > 0) {
          const vsid = prev.sid || sid;
          if (vsid) {
            await env.DB.prepare(
              "UPDATE visits SET total_ms = total_ms + ?, last_at = ?, moved = MAX(COALESCE(moved,0), ?) WHERE sid = ?"
            ).bind(delta, kst(0), b.m === 1 ? 1 : 0, vsid).run();
          }
        }
      }
    } catch (e) {
    }
    return json({ ok: true, action: "allow", stage: 0, updated: true });
  }
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
  const isAd = src === "naver" || src === "google";
  const uh = await uaHash(ua);
  if (testMode) {
    const r = await env.DB.prepare(
      `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known, sid, act_ms)
       VALUES (?,?,?,?,?,?,?,0,0,'test','\uD14C\uC2A4\uD2B8',?,?,?,?,0,?,?,?,?,0)`
    ).bind(ip, fp, ua.slice(0, 300), uh, ref, kw, path, String(cf.asn || ""), org, country, region, depth, moved, isKnown, sid).run();
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
  const whitelisted = st.mode === "allow";
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
  const ins = await env.DB.prepare(
    `INSERT INTO click_logs (ip, fp, ua, ua_hash, ref, keyword, path, is_naver, score, action, reason, asn, org, country, region, dwell, depth, moved, is_known, sid, act_ms)
     VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,0,?,?,?,?,0)`
  ).bind(
    ip,
    fp,
    ua.slice(0, 300),
    uh,
    ref,
    kw,
    path,
    isAd ? 1 : 0,
    isEntry ? "allow" : "allow",
    isEntry ? srcLabel(src) : "\uB0B4\uBD80 \uC774\uB3D9",
    String(cf.asn || ""),
    org,
    country,
    region,
    depth,
    moved,
    isKnown,
    sid
  ).run();
  const logId = ins && ins.meta ? ins.meta.last_row_id : null;
  if (!isEntry) {
    if (sid) {
      await env.DB.prepare(
        "UPDATE visits SET pages = pages + 1, last_at = ?, moved = MAX(COALESCE(moved,0), ?), depth = MAX(COALESCE(depth,1), ?) WHERE sid = ?"
      ).bind(kst(0), moved, depth, sid).run().catch(() => null);
    }
    return json({ ok: true, action: "allow", stage: 0, score: 0, internal: true, src, id: logId });
  }
  let ipAd = 1, fpAd = 1, fpIps = 1, asnAd = 1;
  if (isAd && asn) {
    const e = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM visits WHERE asn = ? AND is_ad = 1 AND started_at >= datetime('now','+9 hours','-30 minutes')`
    ).bind(asn).first();
    asnAd = ((e || {}).n || 0) + 1;
  }
  if (isAd) {
    if (fp) {
      const a = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM visits WHERE fp = ? AND is_ad = 1 AND started_at >= datetime('now','+9 hours','-30 minutes')`
      ).bind(fp).first();
      fpAd = ((a || {}).n || 0) + 1;
      const c = await env.DB.prepare(
        `SELECT COUNT(DISTINCT ip) AS n FROM visits WHERE fp = ? AND is_ad = 1 AND started_at >= datetime('now','+9 hours','-24 hours')`
      ).bind(fp).first();
      fpIps = ((c || {}).n || 0) + 1;
    }
    const d = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM visits WHERE ip = ? AND is_ad = 1 AND started_at >= datetime('now','+9 hours','-30 minutes')`
    ).bind(ip).first();
    ipAd = ((d || {}).n || 0) + 1;
  }
  const ev = judgeSession({
    isAd,
    ipAd,
    fpAd,
    fpIps,
    asnAd,
    totalSec: Math.round(actMs / 1e3),
    pages: 1,
    moved: moved === 1,
    bot: BOT_UA.test(ua),
    hosting: isHosting(org),
    carrier: isCarrier(org),
    converted: false
  });
  if (sid) {
    await env.DB.prepare(
      `INSERT INTO visits (sid, fp, ip, src, is_ad, started_at, last_at, total_ms, pages, moved, depth, asn, region, org, country, ua, kw, score, verdict, reasons)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(sid) DO UPDATE SET last_at = excluded.last_at, pages = pages + 1,
         moved = MAX(COALESCE(visits.moved,0), excluded.moved), score = excluded.score,
         verdict = excluded.verdict, reasons = excluded.reasons,
         kw = CASE WHEN visits.kw IS NULL OR visits.kw = '' THEN excluded.kw ELSE visits.kw END`
    ).bind(
      sid,
      fp,
      ip,
      src,
      isAd ? 1 : 0,
      kst(0),
      kst(0),
      actMs,
      moved,
      depth,
      asn,
      region,
      org,
      country,
      ua.slice(0, 200),
      kw,
      ev.score,
      ev.verdict,
      ev.reasons.join(" / ")
    ).run().catch(() => null);
  }
  let action = whitelisted ? "allow" : ev.verdict === "block" ? "block" : ev.verdict === "warn" ? "warn" : "allow";
  let stage = ev.verdict === "block" ? 3 : ev.verdict === "warn" ? 2 : ev.verdict === "watch" ? 1 : 0;
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
    ).bind(ip, ev.reasons.join(" / ") || "\uBC18\uBCF5 \uC811\uC18D", ev.score, ipAd, blockedUntil, fp).run();
    if (isNew) {
      waitUntil(notifyBlock(env, {
        ip,
        score: ev.score,
        hits: ipAd,
        reason: ev.reasons.join(" / ") || "\uBC18\uBCF5 \uC811\uC18D",
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
    hits: ipAd,
    verdict: ev.verdict,
    reason: ev.reasons.join(" / "),
    blockedUntil,
    region,
    org,
    src,
    id: logId
  });
}
__name(onRequestPost10, "onRequestPost");

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

// ../../../../../../tmp/lg-worker-js9ouu9p/.wrangler/tmp/pages-5YKW3t/functionsRoutes-0.6087200272921227.mjs
var routes = [
  {
    routePath: "/api/posts/:id/admin-delete",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/posts/:id/delete",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/posts/:id/open",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/posts/:id/reply",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/posts/:id/update",
    mountPath: "/api/posts/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/posts/mine",
    mountPath: "/api/posts",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/admin",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
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
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/smartlog",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/track",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost10]
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
