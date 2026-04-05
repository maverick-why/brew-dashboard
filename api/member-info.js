const { handleOptions, ensureMethod, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { PospalClient } = require('./_lib/pospal');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const { phone } = await readJsonBody(req);
    if (!phone) return error(res, 400, '缺少手机号');
    if (!/^\+?\d{6,15}$/.test(phone.replace(/[\s\-()]/g, ''))) return error(res, 400, '手机号格式不正确');

    const pospal = new PospalClient();
    const phoneForQuery = phone.replace(/^\+/, '');
    const customerInfo = await pospal.getMemberByPhone(phoneForQuery);
    if (!customerInfo?.customerUid) {
      return error(res, 404, '未找到会员记录，请先注册');
    }

    return ok(res, {
      point: customerInfo.point ?? 0,
      balance: customerInfo.balance ?? 0,
    });
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
