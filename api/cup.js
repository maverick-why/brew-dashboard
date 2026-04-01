const { handleOptions, ensureMethod, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { PospalClient } = require('./_lib/pospal');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const url = (req.url || '').split('?')[0].replace(/\/$/, '');
  const action = url.endsWith('/verify') ? 'verify'
               : url.endsWith('/claim')  ? 'claim'
               : null;

  // GET /api/cup → cups list
  if (req.method === 'GET' && !action) {
    try {
      const supabase = getSupabase();
      const { data, error: dbError } = await supabase
        .from('cups')
        .select('id, number, claimer_name, claimed_at')
        .order('number', { ascending: true });

      if (dbError) throw dbError;

      return ok(res, data.map(c => ({
        id: c.id,
        number: c.number,
        claimer_name: c.claimer_name || null,
        claimed: !!c.claimed_at,
      })));
    } catch (err) {
      return error(res, 500, err.message || 'Internal server error');
    }
  }

  // POST /api/cup/verify → verify member
  if (req.method === 'POST' && action === 'verify') {
    try {
      const { phone } = await readJsonBody(req);
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return error(res, 400, '请输入正确的手机号');
      }

      const pospal = new PospalClient();
      const customer = await pospal.getMemberByPhone(phone);
      if (!customer?.customerUid) {
        return ok(res, { valid: false, reason: 'not_member' });
      }

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
  }

  // POST /api/cup/claim → claim a cup
  if (req.method === 'POST' && action === 'claim') {
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

      const pospal = new PospalClient();
      const customer = await pospal.getMemberByPhone(phone);
      if (!customer?.customerUid) {
        return ok(res, { success: false, reason: 'not_member' });
      }

      const supabase = getSupabase();

      const { data: existing } = await supabase
        .from('cups')
        .select('number')
        .eq('claimer_phone', phone)
        .maybeSingle();

      if (existing) {
        return ok(res, { success: false, reason: 'already_claimed' });
      }

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
  }

  return error(res, 404, 'Not found');
};
