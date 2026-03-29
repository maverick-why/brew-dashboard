const { handleOptions, ensureMethod, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { PospalClient } = require('./_lib/pospal');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const { openId } = await readJsonBody(req);
    if (!openId) return error(res, 400, '缺少 openId');

    const supabase = getSupabase();
    const { data: member, error: dbError } = await supabase
      .from('wx_members')
      .select('phone')
      .eq('openid', openId)
      .single();

    if (dbError || !member) return error(res, 404, '未找到会员，请先在小程序完成注册');
    if (!member.phone) return error(res, 400, '会员未绑定手机号，请先在小程序完成注册');

    const pospal = new PospalClient();
    const customerInfo = await pospal.getMemberByPhone(member.phone);
    if (!customerInfo || !customerInfo.customerUid) {
      return error(res, 404, '未找到银豹会员记录');
    }

    const balanceInfo = await pospal.getMemberBalance(customerInfo.customerUid);

    return ok(res, {
      point: balanceInfo.point ?? 0,
      balance: balanceInfo.balance ?? 0,
      customerUid: customerInfo.customerUid,
    });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
