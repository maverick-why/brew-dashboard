// /api/menu-public.js  —  public read, no auth
const Redis = require("ioredis");
const { getSupabase } = require("./_lib/supabase");
const mybeerHandler = require("./_lib/mybeer-handler");

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

const COUNTRY_NAMES = {
  "🇨🇳": "中国",
  "🇧🇪": "比利时",
  "🇩🇪": "德国",
  "🇺🇸": "美国",
  "🇬🇧": "英国",
  "🇨🇿": "捷克",
  "🇯🇵": "日本",
  "🇰🇷": "韩国",
  "🇦🇺": "澳大利亚",
  "🇨🇦": "加拿大",
  "🇫🇷": "法国",
  "🇳🇱": "荷兰",
  "🇮🇪": "爱尔兰",
  "🇩🇰": "丹麦",
  "🇸🇪": "瑞典",
  "🇳🇴": "挪威",
  "🇮🇹": "意大利",
};

function computeOrigin(row) {
  const flag = row.flag === undefined ? "🇨🇳" : row.flag;
  if (flag === "") return "";
  if (flag === "🇨🇳") return safe(row.city).trim() || "中国";
  return COUNTRY_NAMES[flag] || "";
}

function shanghaiTodayParts() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function computeTapDay(row) {
  if (!row.show_tap_day || !row.tap_date) return null;
  const tapMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(row.tap_date));
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(shanghaiTodayParts());
  if (!tapMatch || !todayMatch) return null;
  const tapUTC = Date.UTC(+tapMatch[1], +tapMatch[2] - 1, +tapMatch[3]);
  const todayUTC = Date.UTC(+todayMatch[1], +todayMatch[2] - 1, +todayMatch[3]);
  const diffDays = Math.round((todayUTC - tapUTC) / 86400000);
  return diffDays >= 0 ? diffDays : 0;
}

function isActivePosterNow(item, now) {
  if (!item.enabled) return false;
  if (item.starts_at && new Date(item.starts_at) > now) return false;
  if (item.ends_at && new Date(item.ends_at) < now) return false;
  return true;
}

function normalizePosterItem(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title || "",
    imageUrl: row.image_url || "",
    tapNo: row.tap_no || null,
    body: row.body || null,
    qrUrl: row.qr_url || "",
    sortOrder: Number(row.sort_order) || 0,
    durationSec: Math.max(3, Number(row.duration_sec) || 10),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    bgType: row.bg_type || "auto_blur",
    bgValue: row.bg_value || "",
    updatedAt: row.updated_at || null,
  };
}

async function loadPosterItems() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("poster_items")
      .select("id,type,title,image_url,tap_no,body,qr_url,enabled,sort_order,duration_sec,starts_at,ends_at,bg_type,bg_value,updated_at")
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const now = new Date();
    return (data || [])
      .filter((item) => isActivePosterNow(item, now))
      .map(normalizePosterItem);
  } catch (_) {
    return [];
  }
}

function normalizeFunFactItem(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title || "",
    value: row.value || "",
    caption: row.caption || "",
  };
}

async function loadFunFactItems() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("fun_fact_items")
      .select("id,category,title,value,caption,enabled,sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data || []).map(normalizeFunFactItem);
  } catch (_) {
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.query && req.query.mybeer === "1") return mybeerHandler(req, res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.query && req.query.poster === "1") {
      const posterItems = await loadPosterItems();
      return res.status(200).end(JSON.stringify({ ok: true, items: posterItems }));
    }

    if (req.query && req.query.funfacts === "1") {
      const funFactItems = await loadFunFactItems();
      return res.status(200).end(JSON.stringify({ ok: true, items: funFactItems }));
    }

    const r = getRedis();
    const val = await r.get(KEY);
    const raw = val ? JSON.parse(val) : {};

    // 读取酒头数（管理员设置的 _tapCount，默认 16，范围 4–64）
    const tapCount = Math.max(4, Math.min(64, Number(raw._tapCount) || 16));
    // 活动海报区 / 趣味数据榜 一键互换所在屏幕
    const zonesSwapped = !!raw._zonesSwapped;

    // 整理成有序数组，编号 1-tapCount
    const items = [];
    for (let i = 1; i <= tapCount; i++) {
      const row = raw[String(i)] || {};
      items.push({
        no:          i,
        brewery:     safe(row.brewery),
        name:        safe(row.name),
        name_en:     safe(row.name_en),
        style:       safe(row.style),
        style_en:    safe(row.style_en),
        tag1:        safe(row.tag1),
        tag2:        safe(row.tag2),
        abv:         safe(row.abv),
        ibu:         safe(row.ibu),
        large_price: safe(row.large_price),
        large_size:  safe(row.large_size),
        small_price: safe(row.small_price),
        small_size:  safe(row.small_size),
        color:       safe(row.color, "dark"),
        origin:      computeOrigin(row),
        tapDay:      computeTapDay(row),
        sold_out:    !!row.sold_out,
        special:     !!row.special,
        sponsor_name: safe(row.sponsor_name),
      });
    }

    // 以 Supabase sponsor_records 为唯一权威来源，先清空再覆盖
    try {
      const supabase = getSupabase();
      const { data: sponsors } = await supabase
        .from('sponsor_records')
        .select('tap_no, sponsor_name')
        .eq('status', 'live')
        .gt('expire_at', new Date().toISOString());
      // 清空所有 sponsor_name（防止 Redis 缓存残留旧数据）
      for (const item of items) item.sponsor_name = null;
      for (const s of sponsors || []) {
        const item = items.find(i => i.no === s.tap_no);
        if (item) item.sponsor_name = s.sponsor_name;
      }
    } catch (_) {
      // Supabase 不可用时不影响主菜单数据
    }

    return res.status(200).end(JSON.stringify({ ok: true, tapCount, zonesSwapped, items }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
