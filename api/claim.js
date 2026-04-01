const { handleOptions, ensureMethod, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { PospalClient } = require('./_lib/pospal');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const { phone, cup_id, claimer_name } = await readJsonBody(req);

    if (!phone || !cup_id || !claimer_name) {
      return error(res, 400, '参数不完整');
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return error(res, 400, '手机号格式不正确');
    }
    if (typeof claimer_name !== 'string' || claimer_name.trim().length === 0) {
      return error(res, 400, '请填写姓名');
    }
    if ([...claimer_name.trim()].length > 12) {
      return error(res, 400, '姓名最多12个字符');
    }

    // Re-verify member via Pospal
    const pospal = new PospalClient();
    const customer = await pospal.getMemberByPhone(phone);
    if (!customer?.customerUid) {
      return ok(res, { success: false, reason: 'not_member' });
    }

    const supabase = getSupabase();

    // Re-check not already claimed
    const { data: existing } = await supabase
      .from('cups')
      .select('number')
      .eq('claimer_phone', phone)
      .maybeSingle();

    if (existing) {
      return ok(res, { success: false, reason: 'already_claimed' });
    }

    // Conditional update: only update if claimer_phone is still NULL
    const { data: updated, error: updateError } = await supabase
      .from('cups')
      .update({
        claimer_name: claimer_name.trim(),
        claimer_phone: phone,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', cup_id)
      .is('claimer_phone', null)
      .select('id, number')
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updated) {
      return ok(res, { success: false, reason: 'cup_taken' });
    }

    return ok(res, { success: true, cup: { id: updated.id, number: updated.number } });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
