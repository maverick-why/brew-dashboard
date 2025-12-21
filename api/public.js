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

// 你想要“每次刷新变化 ≤ 0.3”，但不需要每秒变动；这里按 60 秒一个桶更新
const TEMP_BUCKET_MS = 60 * 1000;

// 每次更新可选步长（满足 ≤0.3）
// 允许轻微回弹 +0.1（更真实），但整体仍受目标曲线约束
const STEP_CHOICES = [-0.3, -0.2, -0.1, 0, +0.1];

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
    // xorshift32
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

// 平滑目标曲线：cosine easing（平滑且从一开始就会有变化）
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

// 生成“真实”温度：
// - 降温期：受目标曲线约束，且每次变化 <=0.3，允许回弹 +0.1
// - 非降温期：保持 setpoint（不乱抖）
async function computeTempForTank(r, id, row, nowMs) {
  const startStr = safeStr(row.start, "");
  const endStr = safeStr(row.end, "");

  const startMs = new Date(startStr).getTime();
  const endMs = new Date(endStr).getTime();

  // 没有合法 end：就维持设定温度（或稳定 setpoint）
  const endOk = Number.isFinite(endMs);

  const backendTemp = parseTempNumber(row.temp);
  const setpoint = backendTemp !== null ? clamp(backendTemp, SETPOINT_MIN, SETPOINT_MAX) : makeStableSetpoint(id, startStr);
  const finalT = makeStableFinal(id, endStr);

  if (!endOk) {
    return { tempText: fmtTemp(setpoint), badgeCN: "发酵中", statusOut: "fermenting" };
  }

  // 冷却开始时间：end-10天，但不能早于 start
  const coolStartMs = Math.max(endMs - COOL_WINDOW_MS, Number.isFinite(startMs) ? startMs : endMs - COOL_WINDOW_MS);

  // 是否处于降温期（含超过 end 的情况也继续显示降温中）
  const isCooling = nowMs >= coolStartMs;

  // 输出 badge & status（为了你前端黄色 badge：用 statusOut = "ready"）
  const badgeCN = isCooling ? "降温中" : "发酵中";
  const statusOut = isCooling ? "ready" : "fermenting";

  // 非降温期：保持 setpoint（真实：发酵恒温）
  if (!isCooling) {
    return { tempText: fmtTemp(setpoint), badgeCN, statusOut };
  }

  // 目标曲线：从 setpoint 平滑降到 finalT
  const denom = Math.max(1, endMs - coolStartMs);
  const t01 = (nowMs - coolStartMs) / denom;
  const k = cosineEase01(t01);
  const target = setpoint + (finalT - setpoint) * k;

  // 当前桶：每 TEMP_BUCKET_MS 才更新一次（否则太“抖”）
  const bucket = Math.floor(nowMs / TEMP_BUCKET_MS);

  // 读状态
  let st = await getTempState(r, id);

  // 初始化状态
  if (!st || typeof st.cur !== "number") {
    st = {
      setpoint,
      finalT,
      cur: setpoint,      // 内部不 round，让它能累积变化
      lastBucket: bucket,
    };
    await setTempState(r, id, st);
    return { tempText: fmtTemp(st.cur), badgeCN, statusOut };
  }

  // 如果 setpoint 或 final 发生变化（比如你改了日期），同步一下
  st.setpoint = setpoint;
  st.finalT = finalT;

  // 同一个桶内，不更新（保持稳定）
  if (st.lastBucket === bucket) {
    // 但如果已经超过 endMs，为了确保最终落在 4~5，允许“最终归位”
    if (nowMs >= endMs) {
      const forced = Math.min(st.cur, finalT); // 只会更低，不会上跳
      st.cur = forced;
      await setTempState(r, id, st);
    }
    return { tempText: fmtTemp(st.cur), badgeCN, statusOut };
  }

  // 更新：根据目标 + 随机选择一个 step
  st.lastBucket = bucket;

  const prev = st.cur;

  // 目标附近允许的浮动窗口（更真实）：
  // - 允许略高于目标 0.1（回弹）
  // - 允许略低于目标 0.3（提前降温也合理）
  const upperByTarget = target + 0.1;
  const lowerByTarget = target - 0.3;

  // 根据你要求：相对上次变化 <=0.3
  const upperByStep = prev + 0.1; // 允许回弹 0.1
  const lowerByStep = prev - 0.3;

  const upper = Math.min(upperByTarget, upperByStep);
  const lower = Math.max(lowerByTarget, lowerByStep);

  // 随机挑 step（稳定不可猜：加入盐 + id + bucket）
  const salt = process.env.DISPLAY_SALT || "brew";
  const seed = hash32(`${salt}|step|${id}|${bucket}|${round1(prev)}|${round1(target)}`);
  const rand = rngFromSeed(seed);

  // 倾向下降：让负步长概率更高
  // 但如果当前已经明显低于 target，就多给 0 或 +0.1
  const gap = prev - target; // >0 表示比目标高（应该降）
  let pool;
  if (gap > 0.6) pool = [-0.3, -0.2, -0.2, -0.1, -0.3];         // 追赶下降
  else if (gap > 0.3) pool = [-0.2, -0.2, -0.1, -0.1, 0];
  else if (gap > 0.1) pool = [-0.2, -0.1, -0.1, 0, +0.1];       // 允许一点回弹
  else pool = [-0.1, 0, 0, +0.1, -0.1];                         // 贴近目标时更“抖一点”

  const step = pool[Math.floor(rand() * pool.length)];
  let next = prev + step;

  // 硬约束：不超过上下界
  next = clamp(next, lower, upper);

  // 还要保证最终不会低于 finalT 太多，也不会高于 setpoint 太多（合理区间）
  next = clamp(next, FINAL_MIN, SETPOINT_MAX);

  // 如果已经到/超过 end，强制最终收敛到 finalT（不会上跳）
  if (nowMs >= endMs) {
    next = Math.min(next, finalT);
  }

  // 写回（内部不 round）
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

        progress, // 0~100

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
