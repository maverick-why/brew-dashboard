// api/sponsor.js
const { handleOptions, getQuery, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { PospalClient } = require('./_lib/pospal');
const { verifyReviewToken } = require('./_lib/claude');

async function getCustomerUid(openId) {
  const supabase = getSupabase();
  const { data: member } = await supabase
    .from('wx_members')
    .select('phone')
    .eq('openid', openId)
    .single();
  if (!member?.phone) return null;

  const pospal = new PospalClient();
  const customerInfo = await pospal.getMemberByPhone(member.phone);
  return customerInfo?.customerUid || null;
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  // GET → 查状态（替代 sponsor-status.js）
  if (req.method === 'GET') {
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
      return ok(res, { status: data.status, reason: data.reject_reason || undefined });
    } catch (err) {
      return error(res, 500, err.message || 'Internal server error');
    }
  }

  if (req.method !== 'POST') return error(res, 405, 'Method Not Allowed');

  try {
    const { openId, tapNo, sponsorName, reviewToken } = await readJsonBody(req);

    if (!openId || !tapNo || !sponsorName || !reviewToken) {
      return error(res, 400, '参数不完整');
    }
    if (!Number.isInteger(tapNo) || tapNo < 1 || tapNo > 27) {
      return error(res, 400, 'tapNo 必须是 1-27 的整数');
    }

    const tokenCheck = verifyReviewToken(reviewToken, sponsorName, openId);
    if (!tokenCheck.valid) return error(res, 400, '审核 token 无效或已过期，请重新审核');
    const reviewResult = tokenCheck.reviewResult;

    const supabase = getSupabase();
    const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from('sponsor_records')
      .insert({
        tap_no: tapNo,
        sponsor_name: sponsorName,
        open_id: openId,
        review_result: reviewResult,
        status: 'pending',
        expire_at: expireAt,
      })
      .select('id')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return error(res, 409, '该酒头已被冠名，请选择其他酒头');
      }
      throw insertError;
    }

    const recordId = inserted.id;

    const customerUid = await getCustomerUid(openId);
    if (!customerUid) {
      await supabase.from('sponsor_records').delete().eq('id', recordId);
      return error(res, 404, '未找到银豹会员记录，请先在小程序完成注册');
    }

    await supabase.from('sponsor_records').update({ customer_uid: customerUid }).eq('id', recordId);

    const ts = Date.now();
    const pospal = new PospalClient();

    try {
      await pospal.adjustPoints(customerUid, -5, `${openId}_${tapNo}_pts_${ts}`);
    } catch (pErr) {
      await supabase.from('sponsor_records').delete().eq('id', recordId);
      return error(res, 502, `积分扣除失败：${pErr.message}`);
    }

    try {
      await pospal.adjustBalance(customerUid, -1, `${openId}_${tapNo}_bal_${ts}`);
    } catch (bErr) {
      try {
        await pospal.adjustPoints(customerUid, 5, `${openId}_${tapNo}_pts_refund_${ts}`);
      } catch (refundErr) {
        await supabase.from('pospal_compensation_log').insert({
          open_id: openId,
          tap_no: tapNo,
          action: '余额扣除失败，积分补偿也失败，需人工退还5积分',
          payload: { customerUid, ts, error: refundErr.message },
        });
      }
      await supabase.from('sponsor_records').delete().eq('id', recordId);
      return error(res, 502, `余额扣除失败：${bErr.message}`);
    }

    const finalStatus = reviewResult === 'pass' ? 'live' : 'pending';
    await supabase
      .from('sponsor_records')
      .update({ status: finalStatus })
      .eq('id', recordId);

    return ok(res, { status: finalStatus });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
