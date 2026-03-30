// api/_lib/claude.js
const crypto = require('crypto');
const fetch = require('node-fetch');

const REVIEW_SYSTEM = `你是一家精酿酒吧的「酒头冠名」内容审核助手。冠名内容将显示在酒吧酒单大屏（最多6汉字或12英文字符）。

判断规则（按优先级）：

pass（直接通过）—— 绝大多数内容应该通过，以下必须 pass：
- 任何人名、昵称、英文名（Tom、小明、Jerry）
- 表达情感或爱意的词（iloveyou、爱你、宝贝、么么哒、forever）
- 普通英文单词或短语（hello、sunshine、cheers、lucky）
- 个人标签、纪念日、地名、有趣短语
- 轻微搞怪、幽默、创意表达

fail（直接拒绝）—— 只有明确符合以下情况才拒绝：
- 低俗/色情/明显侮辱他人的词
- 政治敏感内容
- 商业广告（品牌名、公司名、联系方式）

edge（转人工）—— 仅当内容同时满足：既不是明显无害，又不是明确违规，存在合理争议时。门槛要高，慎用。

核心原则：宁可漏掉一个边缘词，也绝不误杀无害内容。遇到任何疑问，优先 pass。

只返回 JSON，不要其他文字：{"result":"pass","reason":"说明"}`;

async function reviewContent(text) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const baseUrl = (process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        system: REVIEW_SYSTEM,
        messages: [{ role: 'user', content: `冠名内容：${text}` }],
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
