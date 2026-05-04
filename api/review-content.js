const { handleOptions, ensureMethod, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { reviewContent, generateReviewToken } = require('./_lib/claude');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const { content, phone } = await readJsonBody(req);
    if (!content || !phone) return error(res, 400, '缺少 content 或 phone');

    // 长度校验：与前端 countInput() 保持一致
    // 中文字符算 2 单位，其余算 1 单位；中文字符数 ≤ 6，总单位 ≤ 12
    let cnCount = 0, totalUnits = 0;
    for (const ch of [...content]) {
      if (/[\u4e00-\u9fa5]/.test(ch)) { cnCount++; totalUnits += 2; }
      else { totalUnits += 1; }
    }
    if (cnCount > 6 || totalUnits > 12) return error(res, 400, '冠名内容过长，中文最多6字或英文最多12字符');

    const { result, reason, auto_passed } = await reviewContent(content);

    if (result === 'fail') {
      return ok(res, { result: 'fail', reason: reason || '不符合规范，请重新输入' });
    }

    // pass 或 edge 都生成 token
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
};
