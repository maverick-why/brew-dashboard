const { handleOptions, ensureMethod } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { TAPS } = require('./_lib/taps');
const Redis = require('ioredis');

const MENU_KEY = 'brew_dash_menu_v1';
const MENU_EXTRA = ['abv', 'ibu', 'large_price', 'large_size', 'small_price', 'small_size'];

let redis;
function getRedis() {
  if (!redis) {
    if (!process.env.REDIS_URL) return null;
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableReadyCheck: false, lazyConnect: true });
  }
  return redis;
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['GET'])) return;

  try {
    const supabase = getSupabase();
    const [{ data: active, error: dbError }, { data: settings }] = await Promise.all([
      supabase
        .from('sponsor_records')
        .select('tap_no, sponsor_name, expire_at')
        .in('status', ['live', 'pending']),
      supabase
        .from('tap_settings')
        .select('tap_no, active'),
    ]);

    if (dbError) throw dbError;

    const sponsorMap = {};
    for (const s of active || []) {
      sponsorMap[s.tap_no] = s;
    }

    const activeSet = new Set((settings || []).filter(r => r.active).map(r => r.tap_no));

    // non-fatal: merge Redis menu data (prices, ABV, IBU)
    let menuData = {};
    try {
      const r = getRedis();
      if (r) {
        const val = await r.get(MENU_KEY);
        if (val) menuData = JSON.parse(val);
      }
    } catch { /* Redis failure is non-fatal */ }

    const result = TAPS.map(tap => {
      const sponsorRecord = sponsorMap[tap.no];
      const menu = menuData[String(tap.no)] || {};
      const base = {
        no: tap.no,
        name: tap.name,
        name_en: tap.name_en,
        style: tap.style,
        style_en: tap.style_en,
        active: activeSet.has(tap.no),
      };
      for (const f of MENU_EXTRA) {
        if (menu[f] !== undefined && menu[f] !== '') base[f] = menu[f];
      }
      if (sponsorRecord) {
        return { ...base, sponsor: sponsorRecord.sponsor_name, expireAt: sponsorRecord.expire_at };
      }
      return base;
    });

    return ok(res, result);
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
