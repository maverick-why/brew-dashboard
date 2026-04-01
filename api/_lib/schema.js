// /api/_schema.js

function safeStr(v, fallback = "") {
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function normalizeRow(row) {
  const r = row || {};
  return {
    show: !!r.show,
    beer: safeStr(r.beer, ""),
    style: safeStr(r.style, ""),
    abv: safeStr(r.abv, ""),
    ibu: safeStr(r.ibu, ""),
    capacity: safeStr(r.capacity, "150L"),
    temp: safeStr(r.temp, ""),
    start: safeStr(r.start, ""),
    end: safeStr(r.end, ""),
    status: safeStr(r.status, "auto"), // auto | fermenting | ready
    limited: !!r.limited,
  };
}

function sanitizeState(obj) {
  const input = obj && typeof obj === "object" ? obj : {};
  const out = {};
  const entries = Object.entries(input);

  // 防止被写入超大对象（可按需调整）
  const MAX_TANKS = 300;

  let count = 0;
  for (const [id, row] of entries) {
    if (count >= MAX_TANKS) break;
    if (!/^F\d+$/i.test(id)) continue; // 只允许 Fxx
    out[id.toUpperCase()] = normalizeRow(row);
    count++;
  }
  return out;
}

module.exports = { normalizeRow, sanitizeState, safeStr };
