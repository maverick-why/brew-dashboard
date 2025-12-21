// /api/public.js
const Redis = require("ioredis");
const crypto = require("crypto");
const { sanitizeState, safeStr } = require("./_schema");

const KEY = "brew_dash_records_v1";

// 公开展示逻辑
const READY_THRESHOLD = 95;

// 温度故事线参数
const SET_MIN = 18.2;
const SET_MAX = 19.9;

const FINAL_MIN = 4.0;
const FINAL_MAX = 5.0;

const COOL_DAYS = 10;
const COOL_WINDOW_MS = COOL_DAYS * 86400000;

// 每天降温不超过 2℃
const MAX_DROP_PER_DAY = 2.0;

// 温度状态保存（保证平滑连续）
const TEMP_STATE_KEY = "brew_dash_temp_state_v2";

// 不要每次请求都更新温度（更像真实控温）
// 60~180 秒都可以，这里用 90 秒
const TEMP_UPDATE_MIN_MS = 90 * 1000;

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

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function round1(x) {
  return Math.round(Number(x) * 10) / 10;
}

function fmtTemp(x) {
  return `${round1(x).toFixed(1)}℃`;
}

// 真随机（不可复现）
function rand01() {
  const buf = crypto.randomBytes(4);
  const u = buf.readUInt32BE(0);
  return u / 0x100000000;
}

// 平滑插值：smoothstep (0..1) -> (0..1)
function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
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

// 阶段：发酵中 / 降温中 / 即将开罐（仅超过预计开罐时间才算）
function phaseByTime(endStr, nowMs) {
  const endMs = new Date(endStr).getTime();
  if (!Number.isFinite(endMs)) return "fermenting";

  if (nowMs > endMs) return "ready"; // 超过预计开罐时间
  if (nowMs >= endMs - COOL_WINDOW_MS) return "cooling"; // 倒数10天
  return "fermenting";
}

function badgeCNByPhase(phase) {
  if (phase === "ready") return "即將開罐";
  if (phase === "cooling") return "降溫中";
  return "發酵中";
}

function resolveStatus(rowStatus, endStr, progress, nowMs) {
  // 允许后台强制指定 status=fermenting/ready/cooling（可选）
  const st = safeStr(rowStatus, "auto").toLowerCase();
  if (st === "fermenting" || st === "cooling" || st === "ready") return st;

  // auto：按时间故事线
  // 注意：这里不再用 READY_THRESHOLD 去显示“即将开罐”，因为你明确要：倒数10天都叫“降溫中”，只有超期才“即將開罐”
  return phaseByTime(endStr, nowMs);
}

// 目标温度：
// - fermenting：保持 setpoint
// - cooling：倒数10天做平滑曲线降到 final
// - ready：保持 final
function targetTemp(setpoint, finalT, endStr, nowMs) {
  const endMs = new Date(endStr).getTime();
  if (!Number.isFinite(endMs)) return setpoint;

  const phase = phaseByTime(endStr, nowMs);
  if (phase === "fermenting") return setpoint;
  if (phase === "ready") return finalT;

  // cooling：倒数10天，从 setpoint 平滑降到 final
  const coolStart = endMs - COOL_WINDOW_MS;
  const t = (nowMs - coolStart) / COOL_WINDOW_MS; // 0..1
  const k = smoothstep(t);
  return setpoint + (finalT - setpoint) * k;
}

// 温度生成：
// 1) 如果后台填了 temp：作为 setpoint（18.2~19.9）
// 2) 如果没填 temp：后端为每个罐生成一个 setpoint & final，并存在 Redis 状态里
// 3) 温度每次更新都“限速”：每天最多变化 MAX_DROP_PER_DAY（保证不超过2℃/天）
// 4) 输出始终 1 位小数
async function tempFor(r, id, row, nowMs) {
  // 读取或初始化状态
  let st = null;
  const raw = await r.hget(TEMP_STATE_KEY, id);
  if (raw) {
    try { st = JSON.parse(raw); } catch { st = null; }
  }

  // setpoint：优先用后台填写；否则用状态里保存的
  const manual = parseTempNumber(row.temp);
  let setpoint =
    manual !== null
      ? clamp(manual, SET_MIN, SET_MAX)
      : (st && Number.isFinite(st.setpoint) ? Number(st.setpoint) : null);

  // final：4.0~5.0（每罐固定一个）
  let finalT =
    st && Number.isFinite(st.finalT) ? Number(st.finalT) : null;

  // current temp & last update time
  let cur =
    st && Number.isFinite(st.cur) ? Number(st.cur) : null;
  let ts =
    st && Number.isFinite(st.ts) ? Number(st.ts) : 0;

  // 初始化 setpoint/final/cur
  if (setpoint === null) {
    setpoint = SET_MIN + rand01() * (SET_MAX - SET_MIN);
    setpoint = round1(setpoint);
  }
  if (finalT === null) {
    finalT = FINAL_MIN + rand01() * (FINAL_MAX - FINAL_MIN);
    finalT = round1(finalT);
  }
  if (cur === null) {
    cur = setpoint;
    ts = 0;
  }

  // 控制更新频率
  if (nowMs - ts < TEMP_UPDATE_MIN_MS) {
    return fmtTemp(cur);
  }

  const phase = phaseByTime(row.end, nowMs);

  // 目标温度（平滑曲线）
  let target = targetTemp(setpoint, finalT, row.end, nowMs);

  // 微小噪声（更真实，但非常小），并且必须满足“每天不超过2℃”
  // 发酵期更稳，降温期也不应抖太大
  const noise = phase === "fermenting" ? (rand01() - 0.5) * 0.08 : (rand01() - 0.5) * 0.06;
  target = target + noise;

  // 限速：每天最大变化 MAX_DROP_PER_DAY
  const dtDays = Math.max(0, (nowMs - ts) / 86400000);
  const maxDelta = MAX_DROP_PER_DAY * dtDays;

  const delta = target - cur;
  const step = clamp(delta, -maxDelta, +maxDelta);

  let next = cur + step;

  // 约束范围：
  // - fermenting：18.2~19.9
  // - cooling：不高于 setpoint、不低于 final（平滑下去）
  // - ready：4.0~5.0
  if (phase === "fermenting") {
    next = clamp(next, SET_MIN, SET_MAX);
  } else if (phase === "cooling") {
    const hi = Math.max(setpoint, finalT);
    const lo = Math.min(setpoint, finalT);
    next = clamp(next, lo, hi);
  } else {
    next = clamp(next, FINAL_MIN, FINAL_MAX);
  }

  next = round1(next);

  // 写回状态（存 30 天）
  await r.hset(TEMP_STATE_KEY, id, JSON.stringify({
    setpoint,
    finalT,
    cur: next,
    ts: nowMs
  }));
  await r.expire(TEMP_STATE_KEY, 60 * 60 * 24 * 30);

  return fmtTemp(next);
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
    try { obj = JSON.parse(val); } catch { obj = {}; }

    const cleaned = sanitizeState(obj);

    const list = Object.entries(cleaned)
      .map(([id, row]) => ({ id, ...row }))
      .filter((x) => x.show === true)
      .sort((a, b) => tankNoFromId(a.id) - tankNoFromId(b.id));

    const items = [];
    for (const item of list) {
      const progress = calcProgress(item.start, item.end, nowMs);

      // 状态：fermenting / cooling / ready
      const status = resolveStatus(item.status, item.end, progress, nowMs);

      const day = daysSince(item.start, nowMs);

      items.push({
        id: item.id,
        no: tankNoFromId(item.id),
        limited: item.limited === true,

        beer: safeStr(item.beer, "（未命名）"),
        style: safeStr(item.style, "--"),

        abv: toABV(item.abv),
        ibu: safeStr(item.ibu, "--"),
        capacity: safeStr(item.capacity, "--"),
        temp: await tempFor(r, item.id, item, nowMs),

        start_md: formatMDshort(item.start),
        end_md: formatMDshort(item.end),

        progress, // 0~100
        status,   // fermenting | cooling | ready
        badgeCN: badgeCNByPhase(status),
        dayText: day === null ? "DAY --" : `DAY ${day}`,
      });
    }

    return res.status(200).end(JSON.stringify({ ok: true, items, server_time: nowMs }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
