// api/sponsor.js
const { handleOptions, getQuery, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { PospalClient } = require('./_lib/pospal');
const { reviewContent, generateReviewToken, verifyReviewToken } = require('./_lib/claude');
const { lookupCache, writeCache } = require('./_lib/member-cache');

async function handleReviewContent(req, res) {
  try {
    const { content, phone } = await readJsonBody(req);
    if (!content || !phone) return error(res, 400, '缺少 content 或 phone');

    let cnCount = 0;
    let totalUnits = 0;
    for (const ch of [...content]) {
      if (/[\u4e00-\u9fa5]/.test(ch)) {
        cnCount++;
        totalUnits += 2;
      } else {
        totalUnits += 1;
      }
    }
    if (cnCount > 6 || totalUnits > 12) {
      return error(res, 400, '冠名内容过长，中文最多6字或英文最多12字符');
    }

    const { result, reason, auto_passed } = await reviewContent(content);

    if (result === 'fail') {
      return ok(res, { result: 'fail', reason: reason || '不符合规范，请重新输入' });
    }

    const token = generateReviewToken(content, result, phone);
    return ok(res, {
      result,
      token,
      reason: result === 'edge' ? '内容存在歧义，提交后人工确认' : undefined,
      ...(auto_passed ? { auto_passed: true } : {}),
    });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const query = getQuery(req);

  // GET → 查状态
  if (req.method === 'GET') {
    try {
      const { phone, tapNo } = query;
      if (!phone || !tapNo) return error(res, 400, '缺少 phone 或 tapNo');
      const supabase = getSupabase();
      const { data, error: dbError } = await supabase
        .from('sponsor_records')
        .select('status, reject_reason')
        .eq('open_id', `h5:${phone}`)
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
  if (query.op === 'review') return handleReviewContent(req, res);

  try {
    const { phone, tapNo, sponsorName, reviewToken } = await readJsonBody(req);

    if (!phone || !tapNo || !sponsorName || !reviewToken) {
      return error(res, 400, '参数不完整');
    }
    if (!/^\+?\d{6,15}$/.test(phone.replace(/[\s\-()]/g, ''))) {
      return error(res, 400, '手机号格式不正确');
    }
    if (!Number.isInteger(tapNo) || tapNo < 1 || tapNo > 27) {
      return error(res, 400, 'tapNo 必须是 1-27 的整数');
    }

    // 验证审核 token（用 phone 作为用户标识，与 review-content 一致）
    const tokenCheck = verifyReviewToken(reviewToken, sponsorName, phone);
    if (!tokenCheck.valid) return error(res, 400, '审核 token 无效或已过期，请重新审核');
    const reviewResult = tokenCheck.reviewResult;

    // 后端查 customerUid：优先走缓存，缓存无 UID 时才调银豹
    const supabase = getSupabase();
    const cached = await lookupCache(supabase, phone);
    let customerUid = cached.found ? cached.customerUid : null;
    const pospal = new PospalClient();

    if (!customerUid) {
      // Cache miss 或缓存中 UID 为空 → 调银豹
      const customerInfo = await pospal.getMemberByPhone(phone);
      customerUid = customerInfo?.customerUid;
      if (!customerUid) {
        return error(res, 404, '未找到银豹会员记录，请先注册');
      }
      // 写入缓存（含 UID）
      await writeCache(supabase, phone, customerUid);
    }
    const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const openId = `h5:${phone}`;

    const { data: inserted, error: insertError } = await supabase
      .from('sponsor_records')
      .insert({
        tap_no: tapNo,
        sponsor_name: sponsorName,
        open_id: openId,
        customer_uid: customerUid,
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

    try {
      await pospal.adjustPointsAndBalance(customerUid, -5, -1);
    } catch (deductErr) {
      await supabase.from('sponsor_records').delete().eq('id', recordId);
      return error(res, 502, `扣款失败：${deductErr.message}`);
    }

    const finalStatus = 'live';
    await supabase
      .from('sponsor_records')
      .update({ status: finalStatus })
      .eq('id', recordId);

    return ok(res, { status: finalStatus });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
