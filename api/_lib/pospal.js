// api/_lib/pospal.js
const crypto = require('crypto');
const fetch = require('node-fetch');

class PospalClient {
  constructor() {
    this.host = process.env.POSPAL_HOST;
    this.appId = process.env.POSPAL_APP_ID;
    this.appKey = process.env.POSPAL_APP_KEY;
    if (!this.host || !this.appId || !this.appKey) {
      throw new Error('Missing POSPAL_HOST / POSPAL_APP_ID / POSPAL_APP_KEY');
    }
  }

  _sign(bodyJson) {
    return crypto.createHash('md5')
      .update(this.appKey + bodyJson)
      .digest('hex')
      .toUpperCase();
  }

  async _request(path, body) {
    const timestamp = String(Date.now());
    const bodyJson = JSON.stringify(body);
    const sign = this._sign(bodyJson);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(`${this.host}${path}`, {
        method: 'POST',
        headers: {
          'User-Agent': 'openApi',
          'Content-Type': 'application/json; charset=utf-8',
          'time-stamp': timestamp,
          'data-signature': sign,
        },
        body: bodyJson,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Pospal HTTP ${res.status}`);
      const text = await res.text();
      // customerUid exceeds JS safe integer range — preserve as string before parsing
      const safeText = text.replace(/"customerUid"\s*:\s*(\d+)/g, '"customerUid":"$1"');
      const data = JSON.parse(safeText);
      if (data.status !== 'success') {
        throw new Error(`Pospal error: ${data.message || JSON.stringify(data)}`);
      }
      return data.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  // 手机号查会员 → { customerUid, point, balance, ... }
  async getMemberByPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;

    // CN mobile: support both 159xxxx and 86159xxxx input shapes.
    const cnLocal = /^86(1[3-9]\d{9})$/.test(digits) ? digits.slice(2) : digits;
    const candidates = Array.from(new Set([cnLocal, digits].filter(Boolean)));

    for (const customerTel of candidates) {
      const list = await this._request('/pospal-api2/openapi/v1/customerOpenapi/queryBytel', {
        appId: this.appId,
        customerTel,
      });
      const member = Array.isArray(list) ? list[0] : list;
      if (member?.customerUid) return member;
    }

    return null;
  }

  // UID 查积分余额 → { point, balance, ... }
  async getMemberBalance(customerUid) {
    return this._request('/pospal-api2/openapi/v1/customerOpenApi/queryByUid', {
      appId: this.appId,
      customerUid,
    });
  }

  // 同时调整积分和余额（delta 为负数则扣除）
  async adjustPointsAndBalance(customerUid, pointDelta, balanceDelta) {
    const dataChangeTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return this._request('/pospal-api2/openapi/v1/customerOpenApi/updateBalancePointByIncrement', {
      appId: this.appId,
      customerUid,
      pointIncrement: pointDelta,
      balanceIncrement: balanceDelta,
      dataChangeTime,
    });
  }
}

module.exports = { PospalClient };
