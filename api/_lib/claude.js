// api/_lib/claude.js
const crypto = require('crypto');
const fetch = require('node-fetch');

const REVIEW_PROMPT = `你是一个中文内容审核助手，为一家精酿酒吧审核用户提交的「酒头冠名」内容。
冠名内容将展示在酒吧酒单大屏，最多6个汉字或12个英文字符。

审核标准：
- 拒绝：低俗/色情/侮辱性词汇
- 拒绝：政治敏感内容
- 拒绝：商业广告（品牌名、公司名、产品推广）
- 拒绝：人身攻击
- 边缘：内容模糊，有歧义，需人工判断
- 通过：普通昵称、纪念日名称、英文名、个人标签等

只返回JSON，不要其他文字：{"result":"pass","reason":"普通昵称，合规"}`;

async function reviewContent(text) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: 'user', content: `${REVIEW_PROMPT}\n\n冠名内容：${text}` }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.content[0].text.trim();
    const parsed = JSON.parse(raw);
    return { result: parsed.result, reason: parsed.reason };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { result: 'edge', reason: '审核超时，转人工处理' };
    }
    return { result: 'edge', reason: '审核异常，转人工处理' };
  } finally {
    clearTimeout(timeout);
  }
}

function generateReviewToken(content, reviewResult, openId) {
  const secret = process.env.REVIEW_SECRET;
  const ts = Date.now();
  const payload = JSON.stringify({ content, result: reviewResult, openId, ts });
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64');
}

function verifyReviewToken(token, content, openId) {
  try {
    const secret = process.env.REVIEW_SECRET;
    const { payload, sig } = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig !== expectedSig) return { valid: false };

    const parsed = JSON.parse(payload);
    if (parsed.content !== content) return { valid: false };
    if (parsed.openId !== openId) return { valid: false };
    if (Date.now() - parsed.ts > 10 * 60 * 1000) return { valid: false };

    return { valid: true, reviewResult: parsed.result };
  } catch {
    return { valid: false };
  }
}

module.exports = { reviewContent, generateReviewToken, verifyReviewToken };
