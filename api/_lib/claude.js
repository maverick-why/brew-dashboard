// api/_lib/claude.js
const crypto = require('crypto');
const fetch = require('node-fetch');

const blacklist = [
  // 政治敏感
  '习近平','毛泽东','江泽民','胡锦涛','邓小平','李克强','王岐山','温家宝',
  '天安门','六四','法轮功','法轮','台独','藏独','疆独','港独',
  '共产党','国民党','解放军','政治局','中央委员','人民日报','新华社',
  '文化大革命','大跃进','反右','毛主席','习主席','党中央',
  // 色情低俗
  '操','艹','肏','屌','鸡巴','阴茎','阴道','阴部',
  '龟头','阴蒂','肛门','肛交','口交','性交','做爱','射精','高潮',
  '自慰','手淫','妓女','鸡女','援交','卖淫','嫖娼','嫖','婊','婊子',
  '骚货','骚逼','浪货','淫','淫荡','色情','A片','AV','av','黄片',
  '脱衣','裸体','裸照','约炮','一夜情','包养',
  // 侮辱谩骂
  '傻逼','煞笔','沙比','SB','sb','妈的','他妈','你妈','我操','我日',
  '滚蛋','去死','死去','废物','贱人','贱货','狗逼','狗日','狗娘养',
  '王八蛋','混蛋','白痴','蠢货','猪头','猪脑','蠢猪','弱智','残废',
  '滚开','给我死','去死吧','脑残','智障','神经病','变态','禽兽',
  // 毒品违法
  '大麻','冰毒','海洛因','可卡因','摇头丸','K粉','毒品','吸毒','贩毒',
  '枪支','炸弹','爆炸物','制毒',
];

const REVIEW_SYSTEM = `你是一家精酿酒吧的「酒头冠名」内容审核助手。冠名内容将显示在酒吧酒单大屏（最多6汉字或12英文字符）。
默认结论是 pass。只有内容明确触犯以下规则才改变结论：
fail（拒绝）：
- 明确的色情/低俗词汇
- 明确的政治敏感词（领导人姓名、敏感事件）
- 明确的商业广告（竞品品牌名、公司名、电话/网址）
- 明确针对他人的侮辱性词汇
edge（转人工）：
- 内容本身不违规，但包含有歧义的双关语，且歧义指向色情/政治方向
- 注意：edge 仅用于歧义"极其明显"的情况，不确定时一律 pass
所有其他内容一律 pass，包括但不限于：
- 任何普通人名、昵称、绰号、称谓
- 任何表达情感/爱意的词（你好、爱你、想你等）
- 任何普通英文单词、短语
- 个人标签、纪念日、口头禅、玩笑话、创意表达
- 看起来无害但你不确定含义的词
只返回 JSON，不要其他文字：{"result":"pass","reason":"说明"}`;

async function reviewContent(text) {
  // 第一步：本地黑名单检查
  const lowerText = text.toLowerCase();
  for (const word of blacklist) {
    if (lowerText.includes(word.toLowerCase())) {
      return { result: 'fail', reason: '内容包含违规词汇' };
    }
  }

  // 第二步：调用 AI 审核
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
    // AI 报错或超时，默认放行
    return { result: 'pass', reason: '审核服务不可用，自动放行', auto_passed: true };
  } finally {
    clearTimeout(timeout);
  }
}

function generateReviewToken(content, reviewResult, openId) {
  const secret = process.env.REVIEW_SECRET || 'fallback-secret';
  const ts = Date.now();
  const payload = JSON.stringify({ content, result: reviewResult, openId, ts });
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64');
}

function verifyReviewToken(token, content, openId) {
  try {
    const secret = process.env.REVIEW_SECRET || 'fallback-secret';
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
