const { handleOptions, ensureMethod, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { PospalClient } = require('./_lib/pospal');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const { phone } = await readJsonBody(req);
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return error(res, 400, '请输入正确的手机号');
    }

    // Check member via Pospal
    const pospal = new PospalClient();
    const customer = await pospal.getMemberByPhone(phone);
    if (!customer?.customerUid) {
      return ok(res, { valid: false, reason: 'not_member' });
    }

    // Check if already claimed
    const supabase = getSupabase();
    const { data: cup } = await supabase
      .from('cups')
      .select('number, claimer_name')
      .eq('claimer_phone', phone)
      .maybeSingle();

    if (cup) {
      return ok(res, {
        valid: false,
        reason: 'already_claimed',
        cup: { number: cup.number, claimer_name: cup.claimer_name },
      });
    }

    return ok(res, { valid: true });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
