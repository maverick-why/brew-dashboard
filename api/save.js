// /api/save.js
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
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

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
    }

    requireAdminPass(req);

    const body = await readBody(req);
    let obj;
    try {
      obj = JSON.parse(body || "{}");
    } catch {
      return res.status(400).end(JSON.stringify({ ok: false, error: "Bad JSON" }));
    }

    const r = getRedis();
    await r.set(KEY, JSON.stringify(obj || {}));

    return res.status(200).end(JSON.stringify({ ok: true }));
  } catch (e) {
    const status = e.statusCode || 500;
    return res.status(status).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
