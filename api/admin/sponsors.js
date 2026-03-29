const { handleOptions, ensureMethod, getQuery } = require('../_lib/http');
const { ok, error } = require('../_lib/response');
const { getSupabase } = require('../_lib/supabase');
const { verifyAdmin } = require('../_lib/admin-auth');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['GET'])) return;

  try {
    verifyAdmin(req);
    const { status } = getQuery(req);
    const VALID_STATUSES = ['pending', 'live', 'rejected', 'expired'];
    if (status && !VALID_STATUSES.includes(status)) {
      return error(res, 400, '无效的 status 参数');
    }
    const supabase = getSupabase();

    let query = supabase
      .from('sponsor_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error: dbError } = await query;
    if (dbError) throw dbError;

    return ok(res, data);
  } catch (err) {
    return error(res, err.status || 500, err.message);
  }
};
