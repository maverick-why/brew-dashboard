const { handleOptions, ensureMethod, readJsonBody } = require('../_lib/http');
const { ok, error } = require('../_lib/response');
const { getSupabase } = require('../_lib/supabase');
const { verifyAdmin } = require('../_lib/admin-auth');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    verifyAdmin(req);
    const { tapNo, sponsorName, openId, adminUser } = await readJsonBody(req);
    if (!tapNo || !sponsorName) return error(res, 400, '缺少 tapNo 或 sponsorName');

    const supabase = getSupabase();
    const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: dbError } = await supabase
      .from('sponsor_records')
      .insert({
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
  } catch (err) {
    return error(res, err.status || 500, err.message);
  }
};
