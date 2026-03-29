const { handleOptions, ensureMethod, readJsonBody } = require('../_lib/http');
const { ok, error } = require('../_lib/response');
const { getSupabase } = require('../_lib/supabase');
const { verifyAdmin } = require('../_lib/admin-auth');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    verifyAdmin(req);
    const { id, action, adminUser, reason } = await readJsonBody(req);
    if (!id || !['approve', 'reject'].includes(action)) {
      return error(res, 400, '参数错误');
    }
    if (action === 'reject' && !reason) {
      return error(res, 400, '拒绝时必须填写原因');
    }

    const supabase = getSupabase();
    const newStatus = action === 'approve' ? 'live' : 'rejected';

    const { error: dbError } = await supabase
      .from('sponsor_records')
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUser || 'admin',
        reject_reason: action === 'reject' ? (reason || '不符合规范') : null,
      })
      .eq('id', id);

    if (dbError) throw dbError;
    return ok(res, { status: newStatus });
  } catch (err) {
    return error(res, err.status || 500, err.message);
  }
};
