// api/_lib/claude.js
const crypto = require('crypto');
const fetch = require('node-fetch');

const REVIEW_SYSTEM = `你是一家精酿酒吧的「酒头冠名」内容审核助手。冠名内容将显示在酒吧酒单大屏（最多6汉字或12英文字符）。

默认结论是 pass。只有内容明确触犯以下规则才改变结论：

fail（拒绝）：
- 明确的色情/低俗词汇
- 明确的政治敏感词（领导人姓名、敏感事件）
- 明确的商业广告（竞品品牌名、公司名、电话/网址）
- 明确针对他人的侮辱性词汇

edge（转人工）：
- 内容本身不违规，但包含有歧义的双关语，且歧义指向色情/政治方向

所有其他内容一律 pass，包括但不限于：
- 任何普通人名、昵称、绰号、称谓（"凌云的大哥"、"Tony老师"、"大哥"、"老大"、"小妹"）
- 任何表达情感/爱意的词（"iloveyou"、"爱你"、"宝贝"）
- 任何普通英文单词、短语（"sunshine"、"cheers"）
- 个人标签、纪念日、口头禅、玩笑话、创意表达
- 含有普通亲属/尊称的词组（大哥、大姐、老板、老师、师傅）

重要：社会称谓如"大哥"、"老大"、"老板"是普通口语，不是违规内容，直接 pass。

只返回 JSON，不要其他文字：{"result":"pass","reason":"说明"}`;

async function reviewContent(text) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

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
    return { result: 'pass', reason: '审核服务不可用，自动放行', auto_passed: true };
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
