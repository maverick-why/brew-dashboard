// api/sponsor-status.js
const { handleOptions, ensureMethod, getQuery } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['GET'])) return;

  try {
    const { openId, tapNo } = getQuery(req);
    if (!openId || !tapNo) return error(res, 400, '缺少 openId 或 tapNo');

    const supabase = getSupabase();
    const { data, error: dbError } = await supabase
      .from('sponsor_records')
      .select('status, reject_reason')
      .eq('open_id', openId)
      .eq('tap_no', parseInt(tapNo, 10))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbError) throw dbError;
    if (!data) return error(res, 404, '未找到冠名记录');

    return ok(res, {
      status: data.status,
      reason: data.reject_reason || undefined,
    });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
