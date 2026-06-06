// /api/poster-public.js — public read for TV dynamic area
const { getSupabase } = require("./_lib/supabase");

function isActiveNow(item, now) {
  if (!item.enabled) return false;
  if (item.starts_at && new Date(item.starts_at) > now) return false;
  if (item.ends_at && new Date(item.ends_at) < now) return false;
  return true;
}

function normalizeItem(row) {
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

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
  }

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
    const items = (data || [])
      .filter((item) => isActiveNow(item, now))
      .map(normalizeItem);

    return res.status(200).end(JSON.stringify({ ok: true, items }));
  } catch (e) {
    return res.status(200).end(JSON.stringify({ ok: true, items: [] }));
  }
};
