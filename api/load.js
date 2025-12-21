// /api/load.js
const Redis = require("ioredis");
const { sanitizeState } = require("./_schema");

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
  const raw =
    req.headers["x-admin-pass"] ||
    req.headers["x-admin-password"] ||
    req.headers["authorization"]; // 兼容 Authorization: Bearer xxx

  const pass = String(raw || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  const expected = String(process.env.ADMIN_WRITE_PASSWORD || "").trim();

  if (!expected) {
    const err = new Error("ADMIN_WRITE_PASSWORD is missing");
    err.statusCode = 500;
    throw err;
  }

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

    requireAdminPass(req);

    const r = getRedis();
    const val = await r.get(KEY);
    if (!val) return res.status(200).end(JSON.stringify({}));

    let obj = {};
    try {
      obj = JSON.parse(val);
    } catch {
      obj = {};
    }

    const cleaned = sanitizeState(obj);
    return res.status(200).end(JSON.stringify(cleaned));
  } catch (e) {
    const status = e.statusCode || 500;
    return res.status(status).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
