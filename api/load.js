// /api/load.js
const Redis = require("ioredis");

const KEY = "brew_dash_records_v1";

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

function requireAdminPass(req) {
  const passRaw = req.headers["x-admin-pass"] || req.headers["x-admin-password"];
  const pass = String(passRaw || "").trim();
  const expected = String(process.env.ADMIN_WRITE_PASSWORD || "").trim();

  if (!expected) throw new Error("ADMIN_WRITE_PASSWORD is missing");
  if (!pass || pass !== expected) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    // 加了鉴权（后台才允许读全量）
    requireAdminPass(req);

    const r = getRedis();
    const val = await r.get(KEY);
    if (!val) return res.status(200).end(JSON.stringify({}));

    return res.status(200).end(val);
  } catch (e) {
    const status = e.statusCode || 500;
    return res.status(status).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
