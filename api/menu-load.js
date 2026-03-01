// /api/menu-load.js  —  admin only
const Redis = require("ioredis");

const KEY = "brew_dash_menu_v1";

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

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const pass = req.headers["x-admin-pass"] || req.headers["x-admin-password"] || "";
  if (!pass || pass !== process.env.ADMIN_WRITE_PASSWORD) {
    return res.status(401).end(JSON.stringify({ ok: false, error: "Unauthorized" }));
  }

  try {
    const r = getRedis();
    const val = await r.get(KEY);
    const data = val ? JSON.parse(val) : {};
    return res.status(200).end(JSON.stringify({ ok: true, ...data }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
