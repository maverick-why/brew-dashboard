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

  _sign(bodyJson, timestamp) {
    return crypto.createHash('md5')
      .update(this.appKey + bodyJson + timestamp)
      .digest('hex');
  }

  async _request(path, body) {
    const timestamp = String(Date.now());
    const bodyJson = JSON.stringify(body);
    const sign = this._sign(bodyJson, timestamp);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${this.host}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'time-stamp': timestamp,
          'access-token': sign,
          'app-id': this.appId,
        },
        body: bodyJson,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Pospal HTTP ${res.status}`);
      const data = await res.json();
      if (data.status !== 'success') {
        throw new Error(`Pospal error: ${data.message || JSON.stringify(data)}`);
      }
      return data.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  // 接口9：手机号查会员 → { customerUid, phone, ... }
  async getMemberByPhone(phone) {
    return this._request('/openapi/customer/queryCustomerByPhone', {
      appId: this.appId,
      customerPhone: phone,
    });
  }

  // 接口1：会员号查积分余额 → { point, balance, ... }
  async getMemberBalance(customerUid) {
    return this._request('/openapi/customer/queryCustomerByUid', {
      appId: this.appId,
      customerUid,
    });
  }

  // 接口5：调整积分（delta 为负数则扣除）
  async adjustPoints(customerUid, delta, dataChangeTime) {
    return this._request('/openapi/customer/updateCustomerInfo', {
      appId: this.appId,
      customerInfo: {
        customerUid,
        pointIncrement: delta,
        dataChangeTime,
      },
    });
  }

  // 接口5：调整余额（delta 为负数则扣除）
  async adjustBalance(customerUid, delta, dataChangeTime) {
    return this._request('/openapi/customer/updateCustomerInfo', {
      appId: this.appId,
      customerInfo: {
        customerUid,
        balanceIncrement: delta,
        dataChangeTime,
      },
    });
  }
}

module.exports = { PospalClient };
