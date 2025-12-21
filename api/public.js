// /api/public.js
const Redis = require("ioredis");
const { sanitizeState, safeStr } = require("./_schema");

const KEY = "brew_dash_records_v1";

// 温控故事规则
const COOL_DAYS = 10; // 倒数10天开始降温
const COOL_WINDOW_MS = COOL_DAYS * 86400000;

const SETPOINT_MIN = 18.2;
const SETPOINT_MAX = 19.9;

const FINAL_MIN = 4.0;
const FINAL_MAX = 5.0;

// 温度状态单独存（避免写回主数据）
const TEMP_STATE_KEY = "brew_dash_temp_state_v1";

// ✅ 2 秒一个桶（你要的“每2秒一次更新”）
const TEMP_BUCKET_MS = 2 * 1000;

// 每次刷新最大变化（你说差距不能 > 0.3；这里用 0.1 更自然）
const MAX_STEP_DOWN = 0.1;
const MAX_STEP_UP = 0.1;

// “每天平均降低不超过2度”
const MAX_DROP_PER_DAY = 2.0;

// 允许少量回弹（更真实）
const MAX_RISE_PER_DAY = 0.4;

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

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function round1(x) {
  return Math.round(Number(x) * 10) / 10;
}

function fmtTemp(x) {
  return `${round1(x).toFixed(1)}℃`;
}

// 简单稳定 hash
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// xorshift32 伪随机（加 DISPLAY_SALT 增加不可猜性）
function rngFromSeed(seedU32) {
  let x = seedU32 >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function calcProgress(startStr, endStr, nowMs) {
  const s = new Date(startStr).getTime();
  const e = new Date(endStr).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  let p = ((nowMs - s) / (e - s)) * 100;
  p = clamp(p, 0, 100);
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

// 平滑目标曲线：cosine easing
function cosineEase01(t01) {
  const t = clamp(t01, 0, 1);
  return (1 - Math.cos(Math.PI * t)) / 2;
}

function makeStableSetpoint(id, startStr) {
  // 每罐固定 setpoint：18.2~19.9，步进 0.1
  const salt = process.env.DISPLAY_SALT || "brew";
  const seed = hash32(`${salt}|sp|${id}|${startStr || ""}`);
  const rand = rngFromSeed(seed);
  const steps = Math.round((SETPOINT_MAX - SETPOINT_MIN) / 0.1);
  const idx = Math.floor(rand() * (steps + 1));
  const t = SETPOINT_MIN + idx * 0.1;
  return clamp(Math.round(t * 10) / 10, SETPOINT_MIN, SETPOINT_MAX);
}

function makeStableFinal(id, endStr) {
  // 每罐固定 final：4.0~5.0，步进 0.1
  const salt = process.env.DISPLAY_SALT || "brew";
  const seed = hash32(`${salt}|final|${id}|${endStr || ""}`);
  const rand = rngFromSeed(seed);
  const steps = Math.round((FINAL_MAX - FINAL_MIN) / 0.1);
  const idx = Math.floor(rand() * (steps + 1));
  const t = FINAL_MIN + idx * 0.1;
  return clamp(Math.round(t * 10) / 10, FINAL_MIN, FINAL_MAX);
}

async function getTempState(r, id) {
  const raw = await r.hget(TEMP_STATE_KEY, id);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setTempState(r, id, st) {
  await r.hset(TEMP_STATE_KEY, id, JSON.stringify(st));
}

async function computeTempForTank(r, id, row, nowMs) {
  const startStr = safeStr(row.start, "");
  const endStr = safeStr(row.end, "");

  const startMs = new Date(startStr).getTime();
  const endMs = new Date(endStr).getTime();
  const startOk = Number.isFinite(startMs);
  const endOk = Number.isFinite(endMs);

  const backendTemp = parseTempNumber(row.temp);
  const setpoint =
    backendTemp !== null
      ? clamp(backendTemp, SETPOINT_MIN, SETPOINT_MAX)
      : makeStableSetpoint(id, startStr);

  const finalT = makeStableFinal(id, endStr);

  // 没有 end：恒温发酵
  if (!endOk) {
    return { tempText: fmtTemp(setpoint), badgeCN: "发酵中", statusOut: "fermenting" };
  }

  const coolStartMs = Math.max(
    endMs - COOL_WINDOW_MS,
    startOk ? startMs : endMs - COOL_WINDOW_MS
  );

  const inCooling = nowMs >= coolStartMs;
  const isPastEnd = nowMs >= endMs;

  const badgeCN = inCooling ? (isPastEnd ? "即将开罐" : "降温中") : "发酵中";
  const statusOut = inCooling ? "ready" : "fermenting";

  // 非降温期：恒温 + 重置状态
  if (!inCooling) {
    const bucket0 = Math.floor(nowMs / TEMP_BUCKET_MS);
    await setTempState(r, id, {
      cur: setpoint,
      lastBucket: bucket0,
      setpoint,
      finalT,
      endMs,
      coolStartMs,
    });
    return { tempText: fmtTemp(setpoint), badgeCN, statusOut };
  }

  // 超过 end：锁 final
  if (isPastEnd) {
    const bucket = Math.floor(nowMs / TEMP_BUCKET_MS);
    await setTempState(r, id, {
      cur: finalT,
      lastBucket: bucket,
      setpoint,
      finalT,
      endMs,
      coolStartMs,
    });
    return { tempText: fmtTemp(finalT), badgeCN, statusOut };
  }

  // 目标曲线（coolStart -> end）
  const denom = Math.max(1, endMs - coolStartMs);
  const t01 = (nowMs - coolStartMs) / denom;
  const k = cosineEase01(t01);
  const target = setpoint + (finalT - setpoint) * k;

  const bucket = Math.floor(nowMs / TEMP_BUCKET_MS);
  let st = await getTempState(r, id);

  if (!st || typeof st.cur !== "number") {
    st = { cur: setpoint, lastBucket: bucket };
    await setTempState(r, id, st);
  }

  // 同桶不更新（你要“每2秒一次更新”，桶=2秒）
  if (st.lastBucket === bucket) {
    return { tempText: fmtTemp(st.cur), badgeCN, statusOut };
  }
  st.lastBucket = bucket;

  const prev = Number(st.cur);

  // ✅ “每天最多降2度”的全局约束：此时刻允许的最低温（不能降太快）
  const elapsedDays = (nowMs - coolStartMs) / 86400000;
  const minAllowed = setpoint - MAX_DROP_PER_DAY * clamp(elapsedDays, 0, 1000);
  const maxAllowed = setpoint + MAX_RISE_PER_DAY * clamp(elapsedDays, 0, 1000);

  // 允许围绕 target 小幅跳动，但整体跟随 target 往下走
  const salt = process.env.DISPLAY_SALT || "brew";
  const seed = hash32(`${salt}|2s|${id}|${bucket}|${round1(prev)}|${round1(target)}`);
  const rand = rngFromSeed(seed);

  // 根据“离目标差距”选步长：更偏向下降
  const gap = prev - target; // >0 表示比目标高，需要降
  let stepPool;
  if (gap > 0.6) stepPool = [-0.1, -0.1, -0.1, 0];
  else if (gap > 0.3) stepPool = [-0.1, -0.1, 0, +0.1];
  else if (gap > 0.1) stepPool = [-0.1, 0, 0, +0.1];
  else stepPool = [-0.1, 0, +0.1, 0];

  const step = stepPool[Math.floor(rand() * stepPool.length)];

  // 每次变化限制（满足你：差距不大于0.3；这里更严格）
  let next = prev + step;
  next = clamp(next, prev - MAX_STEP_DOWN, prev + MAX_STEP_UP);

  // 目标附近窗口（更真实）
  next = Math.min(next, target + 0.1);
  next = Math.max(next, target - 0.3);

  // 全局约束：不能降太快
  next = Math.max(next, minAllowed);
  next = Math.min(next, maxAllowed);

  // 合理范围
  next = clamp(next, FINAL_MIN, SETPOINT_MAX);

  st.cur = next;
  await setTempState(r, id, st);

  return { tempText: fmtTemp(next), badgeCN, statusOut };
}

module.exports = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const r = getRedis();
    const val = await r.get(KEY);
    const nowMs = Date.now();

    if (!val) {
      return res.status(200).end(JSON.stringify({ ok: true, items: [], server_time: nowMs }));
    }

    let obj = {};
    try {
      obj = JSON.parse(val);
    } catch {
      obj = {};
    }

    const cleaned = sanitizeState(obj);

    const entries = Object.entries(cleaned)
      .map(([id, row]) => ({ id, ...row }))
      .filter((x) => x.show === true)
      .sort((a, b) => tankNoFromId(a.id) - tankNoFromId(b.id));

    const items = [];
    for (const item of entries) {
      const progress = calcProgress(item.start, item.end, nowMs);
      const day = daysSince(item.start, nowMs);

      const tempRes = await computeTempForTank(r, item.id, item, nowMs);

      items.push({
        id: item.id,
        no: tankNoFromId(item.id),
        limited: item.limited === true,

        beer: safeStr(item.beer, "（未命名）"),
        style: safeStr(item.style, "--"),

        abv: toABV(item.abv),
        ibu: safeStr(item.ibu, "--"),
        capacity: safeStr(item.capacity, "--"),

        temp: tempRes.tempText,

        start_md: formatMDshort(item.start),
        end_md: formatMDshort(item.end),

        progress,
        status: tempRes.statusOut,
        badgeCN: tempRes.badgeCN,
        dayText: day === null ? "DAY --" : `DAY ${day}`,
      });
    }

    return res.status(200).end(JSON.stringify({ ok: true, items, server_time: nowMs }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
