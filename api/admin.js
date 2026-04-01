const { handleOptions, getQuery, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { verifyAdmin } = require('./_lib/admin-auth');
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

  try {
    verifyAdmin(req);
    const supabase = getSupabase();

    if (req.method === 'GET') {
      const { status } = getQuery(req);
      const VALID_STATUSES = ['pending', 'live', 'rejected', 'expired'];
      if (status && !VALID_STATUSES.includes(status)) return error(res, 400, '无效的 status 参数');
      let query = supabase.from('sponsor_records').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error: dbError } = await query;
      if (dbError) throw dbError;
      return ok(res, data);
    }

    if (req.method === 'POST') {
      const { op } = getQuery(req);
      const body = await readJsonBody(req);

      if (op === 'review') {
        const { id, action, adminUser, reason } = body;
        if (!id || !['approve', 'reject'].includes(action)) return error(res, 400, '参数错误');
        if (action === 'reject' && !reason) return error(res, 400, '拒绝时必须填写原因');
        const newStatus = action === 'approve' ? 'live' : 'rejected';
        const { error: dbError } = await supabase
          .from('sponsor_records')
          .update({
            status: newStatus,
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminUser || 'admin',
            reject_reason: action === 'reject' ? reason : null,
          })
          .eq('id', id);
        if (dbError) throw dbError;
        return ok(res, { status: newStatus });
      }

      if (op === 'add') {
        const { tapNo, sponsorName, openId, adminUser } = body;
        if (!tapNo || !sponsorName) return error(res, 400, '缺少 tapNo 或 sponsorName');
        const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { error: dbError } = await supabase.from('sponsor_records').insert({
          tap_no: tapNo,
          sponsor_name: sponsorName,
          open_id: openId || 'admin',
          review_result: 'pass',
          status: 'live',
          expire_at: expireAt,
          reviewed_by: adminUser || 'admin',
          reviewed_at: new Date().toISOString(),
        });
        if (dbError) {
          if (dbError.code === '23505') return error(res, 409, '该酒头已被冠名');
          throw dbError;
        }
        return ok(res, { status: 'live' });
      }

      if (op === 'remove') {
        const { sponsorId } = body;
        if (!sponsorId) return error(res, 400, '缺少 sponsorId');
        const { data: record, error: fetchErr } = await supabase
          .from('sponsor_records')
          .select('id, tap_no')
          .eq('id', sponsorId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!record) return error(res, 404, '未找到冠名记录');
        const { error: delErr } = await supabase
          .from('sponsor_records')
          .delete()
          .eq('id', sponsorId);
        if (delErr) throw delErr;
        try {
          const r = getRedis();
          if (r) {
            const val = await r.get(MENU_KEY);
            if (val) {
              const menuData = JSON.parse(val);
              const key = String(record.tap_no);
              if (menuData[key]?.sponsor_name) {
                delete menuData[key].sponsor_name;
                await r.set(MENU_KEY, JSON.stringify(menuData));
              }
            }
          }
        } catch { /* Redis failure is non-fatal */ }
        return ok(res, { deleted: true, tap_no: record.tap_no });
      }

      return error(res, 400, '缺少 op 参数');
    }

    return error(res, 405, 'Method Not Allowed');
  } catch (err) {
    return error(res, err.status || 500, err.message);
  }
};
