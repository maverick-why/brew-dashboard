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

module.exports = {
  MYBEER_KEY,
  MYBEER_FONTS,
  MYBEER_IMAGE_TYPES,
  mybeerUploadPrefix,
  normalizeMybeerSettings,
  mybeerUploadPath,
};
