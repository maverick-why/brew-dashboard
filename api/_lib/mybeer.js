// api/_lib/mybeer.js — settings for the /mybeer custom-label site (lineup image + font)
const crypto = require('crypto');

const MYBEER_KEY = 'mybeer_settings_v1';
const MYBEER_FONTS = ['classic', 'modern', 'elegant', 'sport'];
const MYBEER_BUCKET = 'poster-assets';
const MYBEER_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function mybeerUploadPrefix(supabaseUrl) {
  return `${String(supabaseUrl || '').replace(/\/+$/, '')}/storage/v1/object/public/${MYBEER_BUCKET}/mybeer/`;
}

function normalizeMybeerSettings(input, supabaseUrl) {
  const src = input && typeof input === 'object' ? input : {};
  const font = MYBEER_FONTS.includes(src.font) ? src.font : 'classic';
  const url = typeof src.lineupUrl === 'string' ? src.lineupUrl.trim() : '';
  const lineupUrl = supabaseUrl && url.startsWith(mybeerUploadPrefix(supabaseUrl)) ? url : '';
  const updatedAt = typeof src.updatedAt === 'string' ? src.updatedAt : null;
  return { font, lineupUrl, updatedAt };
}

function mybeerUploadPath(mimeType, now = new Date()) {
  const ext = MYBEER_IMAGE_TYPES[mimeType];
  if (!ext) {
    const err = new Error('只支持 JPG / PNG / WebP 图片');
    err.status = 400;
    throw err;
  }
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  return `mybeer/${now.toISOString().slice(0, 10)}/${now.getTime()}-${id}.${ext}`;
}

const MYBEER_READ_TIMEOUT_MS = 1500;

// Resolves the stored value, or rejects if Redis has not answered within ms.
function readWithTimeout(redis, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Redis timeout')), ms); });
  return Promise.race([redis.get(MYBEER_KEY), timeout]).finally(() => clearTimeout(timer));
}

// Never rejects: the public page falls back to the default look on any failure or slow Redis.
async function getPublicSettings(redis, supabaseUrl, timeoutMs = MYBEER_READ_TIMEOUT_MS) {
  let stored = null;
  try {
    if (redis) {
      const raw = await readWithTimeout(redis, timeoutMs);
      stored = raw ? JSON.parse(raw) : null;
    }
  } catch (_) {
    stored = null;
  }
  const { font, lineupUrl } = normalizeMybeerSettings(stored, supabaseUrl);
  return { font, lineupUrl };
}

const MYBEER_MAX_BYTES = 5 * 1024 * 1024;

// Builds the /api/mybeer handler. deps: { getRedis, getSupabase, verifyAdmin, supabaseUrl }
// getRedis may throw or return null; the public read still answers with defaults.
function createMybeerHandler(deps) {
  const { handleOptions, getQuery, readJsonBody } = require('./http');
  const { ok, error } = require('./response');
  const redisOrNull = () => { try { return deps.getRedis() || null; } catch (_) { return null; } };

  return async function handler(req, res) {
    if (handleOptions(req, res)) return;
    const { op } = getQuery(req);

    if (!op && req.method === 'GET') {
      const settings = await getPublicSettings(redisOrNull(), deps.supabaseUrl);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).end(JSON.stringify({ ok: true, ...settings }));
    }

    try {
      deps.verifyAdmin(req);

      if (req.method === 'GET' && op === 'get') {
        const r = redisOrNull();
        let stored = null;
        try {
          const raw = r ? await readWithTimeout(r, MYBEER_READ_TIMEOUT_MS) : null;
          stored = raw ? JSON.parse(raw) : null;
        } catch (_) {
          return error(res, 503, '暂时读不到设置，请稍后再试');
        }
        return ok(res, normalizeMybeerSettings(stored, deps.supabaseUrl));
      }

      if (req.method === 'POST' && op === 'upload') {
        const body = await readJsonBody(req);
        const size = Number(body.size || 0);
        if (!Number.isFinite(size) || size <= 0 || size > MYBEER_MAX_BYTES) return error(res, 400, '图片不能超过 5MB');
        const path = mybeerUploadPath(body.mimeType);
        const bucket = deps.getSupabase().storage.from(MYBEER_BUCKET);
        const { data: signed, error: signedError } = await bucket.createSignedUploadUrl(path);
        if (signedError) throw signedError;
        const { data: pub } = bucket.getPublicUrl(path);
        return ok(res, { signedUrl: signed.signedUrl, token: signed.token, url: pub.publicUrl, path });
      }

      if (req.method === 'POST' && op === 'save') {
        const body = await readJsonBody(req);
        const r = redisOrNull();
        if (!r) return error(res, 500, '服务器未配置 Redis，无法保存');
        const saved = { ...normalizeMybeerSettings(body, deps.supabaseUrl), updatedAt: new Date().toISOString() };
        await r.set(MYBEER_KEY, JSON.stringify(saved));
        return ok(res, saved);
      }

      return error(res, 400, '未知操作');
    } catch (err) {
      return error(res, err.status || 500, err.message || '服务器错误');
    }
  };
}

module.exports = {
  createMybeerHandler,
  getPublicSettings,
  MYBEER_KEY,
  MYBEER_FONTS,
  MYBEER_IMAGE_TYPES,
  mybeerUploadPrefix,
  normalizeMybeerSettings,
  mybeerUploadPath,
};
