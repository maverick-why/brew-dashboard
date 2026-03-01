// /api/menu-public.js  —  public read, no auth
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

function safe(v, fb = "") {
  if (v === undefined || v === null) return fb;
  return String(v);
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const r = getRedis();
    const val = await r.get(KEY);
    const raw = val ? JSON.parse(val) : {};

    // 整理成有序数组，编号 1-16
    const items = [];
    for (let i = 1; i <= 16; i++) {
      const row = raw[String(i)] || {};
      items.push({
        no:          i,
        brewery:     safe(row.brewery),
        name:        safe(row.name),
        name_en:     safe(row.name_en),
        style:       safe(row.style),
        style_en:    safe(row.style_en),
        abv:         safe(row.abv),
        ibu:         safe(row.ibu),
        large_price: safe(row.large_price),
        large_size:  safe(row.large_size),
        small_price: safe(row.small_price),
        small_size:  safe(row.small_size),
        color:       safe(row.color, "dark"),
        flag:        safe(row.flag),
      });
    }

    return res.status(200).end(JSON.stringify({ ok: true, items }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
