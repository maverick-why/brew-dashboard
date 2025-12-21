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
  const pass = req.headers["x-admin-pass"] || req.headers["x-admin-password"];
  if (!pass || pass !== process.env.ADMIN_WRITE_PASSWORD) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    // ✅ 管理端口令校验（GET 也要）
    requireAdminPass(req);

    const r = getRedis();
    const val = await r.get(KEY);
    if (!val) return res.status(200).end(JSON.stringify({}));

    // 保险：即使 Redis 里有脏数据也清洗后返回
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
