// api/admin/sponsor-remove.js
// DELETE a sponsor record by ID, also clears sponsor_name from Redis menu cache.
const { handleOptions, readJsonBody } = require('../_lib/http');
const { ok, error } = require('../_lib/response');
const { getSupabase } = require('../_lib/supabase');
const Redis = require('ioredis');

const MENU_KEY = 'brew_dash_menu_v1';

let redis;
function getRedis() {
  if (!redis) {
    if (!process.env.REDIS_URL) return null;
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return redis;
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return error(res, 405, 'Method Not Allowed');

  const pwd = req.headers['x-admin-pass'];
  if (!pwd || pwd !== process.env.ADMIN_PASSWORD) return error(res, 401, 'Unauthorized');

  try {
    const { sponsorId } = await readJsonBody(req);
    if (!sponsorId) return error(res, 400, '缺少 sponsorId');

    const supabase = getSupabase();

    // Fetch first to get tap_no for Redis cleanup
    const { data: record, error: fetchErr } = await supabase
      .from('sponsor_records')
      .select('id, tap_no')
      .eq('id', sponsorId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!record) return error(res, 404, '未找到冠名记录');

    // Delete the record
    const { error: delErr } = await supabase
      .from('sponsor_records')
      .delete()
      .eq('id', sponsorId);

    if (delErr) throw delErr;

    // Non-fatal: remove sponsor_name from Redis menu cache for this tap
    try {
      const r = getRedis();
      if (r) {
        const val = await r.get(MENU_KEY);
        if (val) {
          const menuData = JSON.parse(val);
          const key = String(record.tap_no);
          if (menuData[key] && menuData[key].sponsor_name) {
            delete menuData[key].sponsor_name;
            await r.set(MENU_KEY, JSON.stringify(menuData));
          }
        }
      }
    } catch { /* Redis failure is non-fatal */ }

    return ok(res, { deleted: true, tap_no: record.tap_no });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
