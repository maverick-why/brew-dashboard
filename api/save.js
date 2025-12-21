// /api/save.js
const Redis = require("ioredis");

const KEY = "brew_dash_records_v1";
const TEMP_KEY = "brew_dash_temps_v1"; // 后端温度状态

const TEMP_MIN = 18.0;
const TEMP_MAX = 19.9;

let redis;
function getRedis() {
  if (!redis) {
    if (!process.env.REDIS_URL) throw new Error("REDIS_URL is missing");
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return redis;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseTempNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const t = String(v).trim().replace("℃", "").replace("°C", "").replace("°", "").trim();
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n;
}
function clampTemp(x) {
  return Math.max(TEMP_MIN, Math.min(TEMP_MAX, x));
}
function round1(x) {
  return Math.round(x * 10) / 10;
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
    }

    const pass = req.headers["x-admin-pass"] || req.headers["x-admin-password"];
    if (!pass || pass !== process.env.ADMIN_WRITE_PASSWORD) {
      return res.status(401).end(JSON.stringify({ ok: false, error: "Unauthorized" }));
    }

    const body = await readBody(req);
    let obj;
    try {
      obj = JSON.parse(body || "{}");
    } catch {
      return res.status(400).end(JSON.stringify({ ok: false, error: "Bad JSON" }));
    }

    const r = getRedis();
    await r.set(KEY, JSON.stringify(obj || {}));

    // ✅ 同步/重置后端温度状态：以“后台输入的温度”为起点
    // 这样你在后台填 18，前端/接口看到的一定从 18.0 起步，不会莫名其妙变 3.4℃
    const temps = {};
    for (const [id, row] of Object.entries(obj || {})) {
      const n = parseTempNumber(row && row.temp);
      const init = round1(clampTemp(n ?? TEMP_MIN));
      temps[id] = init;
    }

    const tick = Math.floor(Date.now() / 5000); // 5 秒一个 tick
    const tempState = { lastTick: tick, temps };
    // 给一个较长过期（可选），防止 Redis 长期堆积
    await r.set(TEMP_KEY, JSON.stringify(tempState), "EX", 60 * 60 * 24 * 30);

    return res.status(200).end(JSON.stringify({ ok: true }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
