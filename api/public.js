// /api/public.js
const Redis = require("ioredis");
const { sanitizeState, safeStr } = require("./_schema");

const KEY = "brew_dash_records_v1";

// ✅ 原本写在 display.html 的规则，迁到后端
const READY_THRESHOLD = 95; // >=95% -> ready
const TEMP_MIN = 18.0;
const TEMP_MAX = 19.9;
const TEMP_TICK_MS = 5000;

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function tankNoFromId(id) {
  const m = /^F(\d+)$/i.exec(id || "");
  if (m) return Number(m[1]);
  const n = String(id || "").match(/\d+/);
  return n ? Number(n[0]) : 0;
}

function toABV(v) {
  const s = safeStr(v, "");
  if (!s) return "--";
  if (s.includes("%")) return s;
  const n = Number(String(s).trim());
  if (!Number.isNaN(n)) return `${n}%`;
  return s;
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

function fmtTemp(x) {
  return `${Number(x).toFixed(1)}℃`;
}

// 简单 hash（稳定、不依赖库）
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function calcProgress(startStr, endStr, nowMs) {
  const s = new Date(startStr).getTime();
  const e = new Date(endStr).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  let p = ((nowMs - s) / (e - s)) * 100;
  p = Math.max(0, Math.min(100, p));
  return Math.round(p);
}

function daysSince(startStr, nowMs) {
  if (!startStr) return null;
  const s = new Date(startStr).getTime();
  if (!Number.isFinite(s)) return null;
  const ms = nowMs - s;
  if (ms < 0) return 0;
  return Math.floor(ms / 86400000) + 1;
}

function formatMDshort(dateStr) {
  if (!dateStr) return "--/--";
  const d = new Date(dateStr);
  if (isNaN(d)) return "--/--";
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

function resolveStatus(rowStatus, endStr, progress, nowMs) {
  const st = safeStr(rowStatus, "auto").toLowerCase();
  if (st === "fermenting" || st === "ready") return st;

  const end = new Date(endStr).getTime();
  if (Number.isFinite(end) && nowMs >= end) return "ready";
  if (typeof progress === "number" && progress >= READY_THRESHOLD) return "ready";
  return "fermenting";
}

function tempFor(id, backendTemp, nowMs) {
  const n = parseTempNumber(backendTemp);
  if (n !== null) return fmtTemp(clampTemp(n));

  // 没填温度：后端生成一个“会轻微跳动”的展示温度
  const bucket = Math.floor(nowMs / TEMP_TICK_MS); // 每 5 秒一个桶
  const h = hash32(`${id}|${bucket}|${process.env.DISPLAY_SALT || "brew"}`);
  const stepCount = Math.round((TEMP_MAX - TEMP_MIN) / 0.1); // 19
  const idx = h % (stepCount + 1);
  const t = Math.round((TEMP_MIN + idx * 0.1) * 10) / 10;
  return fmtTemp(t);
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const r = getRedis();
    const val = await r.get(KEY);
    if (!val) return res.status(200).end(JSON.stringify({ ok: true, items: [], server_time: Date.now() }));

    let obj = {};
    try {
      obj = JSON.parse(val);
    } catch {
      obj = {};
    }

    const cleaned = sanitizeState(obj);
    const nowMs = Date.now();

    const items = Object.entries(cleaned)
      .map(([id, row]) => ({ id, ...row }))
      .filter((x) => x.show === true)
      .sort((a, b) => tankNoFromId(a.id) - tankNoFromId(b.id))
      .map((item) => {
        const progress = calcProgress(item.start, item.end, nowMs);
        const status = resolveStatus(item.status, item.end, progress, nowMs);
        const day = daysSince(item.start, nowMs);

        return {
          id: item.id,
          no: tankNoFromId(item.id),
          limited: item.limited === true,

          beer: safeStr(item.beer, "（未命名）"),
          style: safeStr(item.style, "--"),

          abv: toABV(item.abv),
          ibu: safeStr(item.ibu, "--"),
          capacity: safeStr(item.capacity, "--"),
          temp: tempFor(item.id, item.temp, nowMs),

          start_md: formatMDshort(item.start),
          end_md: formatMDshort(item.end),

          progress, // 0~100
          status,   // fermenting | ready
          badgeCN: status === "ready" ? "即将开罐" : "发酵中",
          dayText: day === null ? "DAY --" : `DAY ${day}`,
        };
      });

    return res.status(200).end(JSON.stringify({ ok: true, items, server_time: nowMs }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
