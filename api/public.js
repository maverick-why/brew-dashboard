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

// 温度状态单独存（避免写回主数据，且更不容易被人从前端推断）
const TEMP_STATE_KEY = "brew_dash_temp_state_v1";

// 更新频率：建议 30 分钟一个桶（更像真实设备，不会每分钟跳）
// 你前端 15 秒轮询没关系：同一桶内温度保持不变
const TEMP_BUCKET_MS = 1000;

// “每天最多降 2℃”硬约束（关键！）
const MAX_DROP_PER_DAY = 2.0;

// 允许轻微回弹（更真实）：每天最多回弹 0.4℃
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

// xorshift32 伪随机（稳定，可复现；加 DISPLAY_SALT 增加不可猜性）
function rngFromSeed(seedU32) {
  let x = seedU32 >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296; // [0,1)
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

// 平滑曲线：cosine easing（平滑、自然）
function cosineEase01(t01) {
  const t = clamp(t01, 0, 1);
  return (1 - Math.cos(Math.PI * t)) / 2;
}

function makeStableSetpoint(id, startStr) {
  // 每个罐一个固定 setpoint：18.2~19.9，步进 0.1
  const salt = process.env.DISPLAY_SALT || "brew";
  const seed = hash32(`${salt}|sp|${id}|${startStr || ""}`);
  const rand = rngFromSeed(seed);
  const steps = Math.round((SETPOINT_MAX - SETPOINT_MIN) / 0.1); // 17
  const idx = Math.floor(rand() * (steps + 1));
  const t = SETPOINT_MIN + idx * 0.1;
  return clamp(Math.round(t * 10) / 10, SETPOINT_MIN, SETPOINT_MAX);
}

function makeStableFinal(id, endStr) {
  // 每个罐一个固定 final：4.0~5.0，步进 0.1
  const salt = process.env.DISPLAY_SALT || "brew";
  const seed = hash32(`${salt}|final|${id}|${endStr || ""}`);
  const rand = rngFromSeed(seed);
  const steps = Math.round((FINAL_MAX - FINAL_MIN) / 0.1); // 10
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

/**
 * 生成“真实故事”温度：
 * - 非降温期：恒温 setpoint（18.2~19.9），不抖
 * - 降温期（倒数10天起）：按平滑目标曲线下探到 4~5，且“每天降温 ≤ 2℃”
 * - 超过 end：锁定 finalT，并显示“即将开罐”
 */
async function computeTempForTank(r, id, row, nowMs) {
  const startStr = safeStr(row.start, "");
  const endStr = safeStr(row.end, "");

  const startMs = new Date(startStr).getTime();
  const endMs = new Date(endStr).getTime();

  const startOk = Number.isFinite(startMs);
  const endOk = Number.isFinite(endMs);

  // setpoint：优先用你后台填的温度（当作“设定温度”），否则每罐生成一个固定 setpoint
  const backendTemp = parseTempNumber(row.temp);
  const setpoint =
    backendTemp !== null
      ? clamp(backendTemp, SETPOINT_MIN, SETPOINT_MAX)
      : makeStableSetpoint(id, startStr);

  // final：每罐固定 4.0~5.0
  const finalT = makeStableFinal(id, endStr);

  // end 不合法：没法讲“倒数10天”故事，直接恒温
  if (!endOk) {
    return { tempText: fmtTemp(setpoint), badgeCN: "发酵中", statusOut: "fermenting" };
  }

  // 冷却开始时间：end-10天，但不早于 start（如果 start 无效，就按 end-10天）
  const coolStartMs = Math.max(
    endMs - COOL_WINDOW_MS,
    startOk ? startMs : endMs - COOL_WINDOW_MS
  );

  const inCooling = nowMs >= coolStartMs;

  // 文案规则：超过 end 显示“即将开罐”，否则降温期显示“降温中”
  const isPastEnd = nowMs >= endMs;
  const badgeCN = inCooling ? (isPastEnd ? "即将开罐" : "降温中") : "发酵中";

  // 你前端黄色 badge：用 statusOut="ready"
  const statusOut = inCooling ? "ready" : "fermenting";

  // 非降温期：恒温
  if (!inCooling) {
    // 同时把温度状态初始化为 setpoint（避免旧状态影响）
    const bucket0 = Math.floor(nowMs / TEMP_BUCKET_MS);
    const st0 = {
      setpoint,
      finalT,
      cur: setpoint,
      lastBucket: bucket0,
      endMs,
      coolStartMs,
    };
    await setTempState(r, id, st0);
    return { tempText: fmtTemp(setpoint), badgeCN, statusOut };
  }

  // 降温期目标曲线（从 coolStart -> end）
  const denom = Math.max(1, endMs - coolStartMs);
  const t01 = (nowMs - coolStartMs) / denom; // 0~1（超过 end 会 >1）
  const k = cosineEase01(t01);
  const target = setpoint + (finalT - setpoint) * k;

  // 当前桶
  const bucket = Math.floor(nowMs / TEMP_BUCKET_MS);

  // 读温度状态
  let st = await getTempState(r, id);

  // 初始化状态
  if (!st || typeof st.cur !== "number" || typeof st.lastBucket !== "number") {
    st = {
      setpoint,
      finalT,
      cur: setpoint,
      lastBucket: bucket,
      endMs,
      coolStartMs,
    };
    await setTempState(r, id, st);
  }

  // 如果你改了 start/end 或温度，刷新 setpoint/final
  st.setpoint = setpoint;
  st.finalT = finalT;
  st.endMs = endMs;
  st.coolStartMs = coolStartMs;

  // 超过 end：直接锁定 final（且保证不会上跳）
  if (isPastEnd) {
    st.cur = Math.min(st.cur, finalT);
    // 进一步收敛到 finalT（固定在 4~5）
    st.cur = finalT;
    st.lastBucket = bucket;
    await setTempState(r, id, st);
    return { tempText: fmtTemp(st.cur), badgeCN, statusOut };
  }

  // 同桶不更新
  if (st.lastBucket === bucket) {
    return { tempText: fmtTemp(st.cur), badgeCN, statusOut };
  }

  // 新桶更新
  st.lastBucket = bucket;

  const prev = Number(st.cur);

  // “每天降温 ≤ 2℃”换算成每桶最大下降
  const maxDown = Math.min(
    0.3, // 你提的“每次刷新不超过0.3”，这里仍保留上限
    (MAX_DROP_PER_DAY * TEMP_BUCKET_MS) / 86400000
  );

  // 允许轻微回弹：每天最多 0.4℃
  const maxUp = Math.min(
    0.1,
    (MAX_RISE_PER_DAY * TEMP_BUCKET_MS) / 86400000
  );

  // 用盐 + id + bucket 生成稳定噪声（外人看数据也不容易反推出规律）
  const salt = process.env.DISPLAY_SALT || "brew";
  const seed = hash32(
    `${salt}|temp|${id}|${bucket}|${round1(prev)}|${round1(target)}|${round1(setpoint)}|${round1(finalT)}`
  );
  const rand = rngFromSeed(seed);

  // 核心：向 target 逼近，但每桶变化受 maxDown / maxUp 限制
  let deltaToward = target - prev; // 负数表示需要下降
  deltaToward = clamp(deltaToward, -maxDown, +maxUp);

  // 加一点非常小的噪声（更真实），但仍不能突破 maxDown/maxUp
  // 噪声范围跟 maxDown 相关（不会大跳）
  const noiseAmp = Math.min(0.03, Math.max(0.005, maxDown * 0.6));
  const noise = (rand() - 0.5) * 2 * noiseAmp;

  let next = prev + deltaToward + noise;

  // 再次硬约束：相对上次变化不超过 maxDown/maxUp
  next = clamp(next, prev - maxDown, prev + maxUp);

  // 曲线约束：不要比 target 高太多（避免“明明应该降了还卡很高”）
  // 允许略高于 target（小回弹），但不能超过 target + 0.1
  next = Math.min(next, target + 0.1);

  // 也不要提前降过头太多：不低于 target - 0.3
  next = Math.max(next, target - 0.3);

  // 合理区间：不会超过 setpoint 上限，也不会低于 FINAL_MIN
  next = clamp(next, FINAL_MIN, SETPOINT_MAX);

  // 写回
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

        // ✅ 后端决定的温度（真实故事曲线）
        temp: tempRes.tempText,

        start_md: formatMDshort(item.start),
        end_md: formatMDshort(item.end),

        progress,

        // ✅ 为了你前端黄色 badge：降温期输出 "ready"
        status: tempRes.statusOut,

        // ✅ 文案
        badgeCN: tempRes.badgeCN,
        dayText: day === null ? "DAY --" : `DAY ${day}`,
      });
    }

    return res.status(200).end(JSON.stringify({ ok: true, items, server_time: nowMs }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
