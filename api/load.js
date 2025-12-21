// /api/load.js
const Redis = require("ioredis");

const KEY = "brew_dash_records_v1";
const TEMP_KEY = "brew_dash_temps_v1";

const READY_THRESHOLD = 95; // >=95% 黄灯（即将开罐）
const TEMP_MIN = 18.0;
const TEMP_MAX = 19.9;
const TEMP_TICK_MS = 5000;  // 每 5 秒一跳
const MAX_CATCHUP_STEPS = 12; // 服务器久未访问时，最多补 12 步（1分钟），避免循环太久

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

function pad2(n) { return String(n).padStart(2, "0"); }

function parseDateMs(s) {
  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? t : NaN;
}

function formatMDshort(dateStr) {
  if (!dateStr) return "--/--";
  const d = new Date(dateStr);
  if (isNaN(d)) return "--/--";
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

function daysSince(startStr) {
  if (!startStr) return null;
  const s = new Date(startStr);
  if (isNaN(s)) return null;
  const ms = Date.now() - s.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86400000) + 1; // DAY 1 起算
}

function calcProgress(startStr, endStr) {
  const s = parseDateMs(startStr);
  const e = parseDateMs(endStr);
  const n = Date.now();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  let p = ((n - s) / (e - s)) * 100;
  p = Math.max(0, Math.min(100, p));
  return Math.round(p);
}

function toABV(v) {
  if (v === undefined || v === null || v === "") return "--";
  const s = String(v).trim();
  if (!s) return "--";
  if (s.includes("%")) return s;
  const n = Number(s);
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
function round1(x) {
  return Math.round(x * 10) / 10;
}
function fmtTemp(x) {
  return `${Number(x).toFixed(1)}℃`;
}

// 简单稳定的 hash，用于“每个罐独立”的随机方向/步长
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stepTemp(cur, id, tick) {
  // 每个罐 + 每个 tick 都有稳定的随机序列
  const h = hash32(`${id}|${tick}`);
  const step = (h & 1) === 0 ? 0.1 : 0.2;
  const dir = (h & 2) === 0 ? 1 : -1;

  let next = cur + dir * step;
  // 触边反弹
  if (next < TEMP_MIN) next = cur + step;
  if (next > TEMP_MAX) next = cur - step;
  next = clampTemp(next);
  return round1(next);
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const r = getRedis();

    const val = await r.get(KEY);
    if (!val) return res.status(200).end(JSON.stringify({}));

    let raw;
    try {
      raw = JSON.parse(val || "{}");
    } catch {
      raw = {};
    }

    // 读取温度状态
    let tempState = null;
    try {
      const tval = await r.get(TEMP_KEY);
      tempState = tval ? JSON.parse(tval) : null;
    } catch {
      tempState = null;
    }
    if (!tempState || typeof tempState !== "object") tempState = { lastTick: 0, temps: {} };
    if (!tempState.temps || typeof tempState.temps !== "object") tempState.temps = {};

    const nowTick = Math.floor(Date.now() / TEMP_TICK_MS);
    let lastTick = Number(tempState.lastTick || 0);
    if (!Number.isFinite(lastTick) || lastTick < 0) lastTick = 0;

    // 初始化：如果温度状态里没有该罐，按“后台输入温度 or 18.0”做起点
    for (const [id, row] of Object.entries(raw || {})) {
      if (tempState.temps[id] === undefined) {
        const n = parseTempNumber(row && row.temp);
        tempState.temps[id] = round1(clampTemp(n ?? TEMP_MIN));
      }
    }

    // 补温度步进（最多补 12 步，避免长时间没访问导致循环太大）
    let steps = nowTick - lastTick;
    if (steps > 0) {
      const doSteps = Math.min(steps, MAX_CATCHUP_STEPS);
      for (let t = lastTick + 1; t <= lastTick + doSteps; t++) {
        for (const id of Object.keys(tempState.temps)) {
          tempState.temps[id] = stepTemp(tempState.temps[id], id, t);
        }
      }
      tempState.lastTick = lastTick + doSteps;

      // 如果缺口太大（比如几小时没访问），我们把 lastTick 直接推进到 nowTick
      // 温度仍然保持在区间内，不会“跳很多步”造成奇怪变动
      if (steps > MAX_CATCHUP_STEPS) {
        tempState.lastTick = nowTick;
      }

      // 写回温度状态
      await r.set(TEMP_KEY, JSON.stringify(tempState), "EX", 60 * 60 * 24 * 30);
    }

    // 后端补全：progress / status / day / 文本化字段 / temp 模拟
    const out = {};
    for (const [id, row0] of Object.entries(raw || {})) {
      const row = row0 || {};

      const progress = calcProgress(row.start, row.end);
      const endMs = parseDateMs(row.end);
      const expired = Number.isFinite(endMs) ? Date.now() >= endMs : false;

      // status 自动化（支持 row.status=auto/fermenting/ready）
      const st = String(row.status || "auto").toLowerCase();
      let status = "fermenting";
      if (st === "fermenting" || st === "ready") {
        status = st;
      } else {
        status = (expired || progress >= READY_THRESHOLD) ? "ready" : "fermenting";
      }

      const day = daysSince(row.start);
      const tempNum = tempState.temps[id] ?? round1(clampTemp(parseTempNumber(row.temp) ?? TEMP_MIN));

      out[id] = {
        // 原始字段照保留（你后台存什么，就还在）
        ...row,

        // ✅ 下面是“后端逻辑产物”，前端直接用，不要再算
        _derived: {
          progress,
          status,
          day, // number | null
          startMD: formatMDshort(row.start),
          endMD: formatMDshort(row.end),
          abvText: toABV(row.abv),
          tempValue: tempNum,     // number
          tempText: fmtTemp(tempNum),
          readyThreshold: READY_THRESHOLD,
        },

        // ✅ 给前端更好用的平铺字段（你前端想怎么取都行）
        progress,
        status,
        day,
        startMD: formatMDshort(row.start),
        endMD: formatMDshort(row.end),
        abvText: toABV(row.abv),
        tempText: fmtTemp(tempNum),
      };
    }

    return res.status(200).end(JSON.stringify(out));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
