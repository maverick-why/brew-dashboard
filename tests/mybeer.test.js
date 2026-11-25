const test = require('node:test');
const assert = require('node:assert');
const m = require('../api/_lib/mybeer');

const SB = 'https://x.supabase.co';

test('normalize: empty input gives defaults', () => {
  assert.deepStrictEqual(m.normalizeMybeerSettings(null, SB), { font: 'classic', lineupUrl: '', updatedAt: null });
});

test('normalize: unknown font falls back to classic', () => {
  assert.strictEqual(m.normalizeMybeerSettings({ font: 'comic' }, SB).font, 'classic');
});

test('normalize: keeps a valid font', () => {
  assert.strictEqual(m.normalizeMybeerSettings({ font: 'sport' }, SB).font, 'sport');
});

test('normalize: drops a lineup url from another host', () => {
  assert.strictEqual(m.normalizeMybeerSettings({ lineupUrl: 'https://evil.com/a.png' }, SB).lineupUrl, '');
});

test('normalize: drops a bucket url outside the mybeer/ folder', () => {
  const u = SB + '/storage/v1/object/public/poster-assets/poster-items/a.png';
  assert.strictEqual(m.normalizeMybeerSettings({ lineupUrl: u }, SB).lineupUrl, '');
});

test('normalize: keeps a mybeer bucket url', () => {
  const u = SB + '/storage/v1/object/public/poster-assets/mybeer/2026-11-25/1-a.webp';
  assert.strictEqual(m.normalizeMybeerSettings({ lineupUrl: u }, SB).lineupUrl, u);
});

test('normalize: keeps updatedAt only when it is a string', () => {
  assert.strictEqual(m.normalizeMybeerSettings({ updatedAt: '2026-11-25T00:00:00Z' }, SB).updatedAt, '2026-11-25T00:00:00Z');
  assert.strictEqual(m.normalizeMybeerSettings({ updatedAt: 5 }, SB).updatedAt, null);
});

test('upload path: dated mybeer folder with the right extension', () => {
  assert.match(m.mybeerUploadPath('image/png', new Date('2026-11-25T00:00:00Z')), /^mybeer\/2026-11-25\/\d+-[0-9a-f-]+\.png$/);
  assert.match(m.mybeerUploadPath('image/webp'), /\.webp$/);
  assert.match(m.mybeerUploadPath('image/jpeg'), /\.jpg$/);
});

test('upload path: rejects other image types with status 400', () => {
  assert.throws(() => m.mybeerUploadPath('image/gif'), (e) => e.status === 400);
});

test('public settings: redis failure gives defaults', async () => {
  const redis = { get: async () => { throw new Error('down'); } };
  assert.deepStrictEqual(await m.getPublicSettings(redis, SB), { font: 'classic', lineupUrl: '' });
});

test('public settings: missing redis gives defaults', async () => {
  assert.deepStrictEqual(await m.getPublicSettings(null, SB), { font: 'classic', lineupUrl: '' });
});

test('public settings: stored values come back normalized', async () => {
  const u = SB + '/storage/v1/object/public/poster-assets/mybeer/x.webp';
  const redis = { get: async (k) => (k === m.MYBEER_KEY ? JSON.stringify({ font: 'modern', lineupUrl: u }) : null) };
  assert.deepStrictEqual(await m.getPublicSettings(redis, SB), { font: 'modern', lineupUrl: u });
});

test('public settings: corrupt json gives defaults', async () => {
  const redis = { get: async () => '{not json' };
  assert.deepStrictEqual(await m.getPublicSettings(redis, SB), { font: 'classic', lineupUrl: '' });
});

// ---- handler (api/mybeer.js) ----
function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = (b) => { r.body = typeof b === 'string' ? JSON.parse(b) : b; return r; };
  return r;
}
function memRedis(init) {
  const store = Object.assign({}, init);
  return { store, get: async (k) => store[k] ?? null, set: async (k, v) => { store[k] = v; return 'OK'; } };
}
const okAdmin = () => {};
const denyAdmin = () => { const e = new Error('Unauthorized'); e.status = 401; throw e; };
function handler(deps) {
  return m.createMybeerHandler(Object.assign({ getRedis: () => memRedis(), getSupabase: () => null, verifyAdmin: okAdmin, supabaseUrl: SB }, deps));
}

test('handler: public GET returns defaults when redis throws, cached 60s', async () => {
  const res = fakeRes();
  await handler({ getRedis: () => { throw new Error('no redis'); } })({ method: 'GET', url: '/api/mybeer' }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { ok: true, font: 'classic', lineupUrl: '' });
  assert.strictEqual(res.headers['cache-control'], 'public, max-age=60');
});

test('handler: admin op without password is 401', async () => {
  const res = fakeRes();
  await handler({ verifyAdmin: denyAdmin })({ method: 'GET', url: '/api/mybeer?op=get', headers: {} }, res);
  assert.strictEqual(res.statusCode, 401);
});

test('handler: save stores normalized settings and drops foreign urls', async () => {
  const redis = memRedis();
  const res = fakeRes();
  await handler({ getRedis: () => redis })({ method: 'POST', url: '/api/mybeer?op=save', headers: {}, body: { font: 'elegant', lineupUrl: 'https://evil.com/x.png' } }, res);
  assert.strictEqual(res.statusCode, 200);
  const stored = JSON.parse(redis.store[m.MYBEER_KEY]);
  assert.strictEqual(stored.font, 'elegant');
  assert.strictEqual(stored.lineupUrl, '');
  assert.strictEqual(typeof stored.updatedAt, 'string');
});

test('handler: get returns what save stored', async () => {
  const redis = memRedis({ [m.MYBEER_KEY]: JSON.stringify({ font: 'sport', lineupUrl: '', updatedAt: 't' }) });
  const res = fakeRes();
  await handler({ getRedis: () => redis })({ method: 'GET', url: '/api/mybeer?op=get', headers: {} }, res);
  assert.deepStrictEqual(res.body.data, { font: 'sport', lineupUrl: '', updatedAt: 't' });
});

test('handler: upload rejects files over 5MB with 400', async () => {
  const res = fakeRes();
  await handler({})({ method: 'POST', url: '/api/mybeer?op=upload', headers: {}, body: { mimeType: 'image/png', size: 6 * 1024 * 1024 } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('handler: upload returns a signed url in the mybeer folder', async () => {
  const supabase = { storage: { from: () => ({
    createSignedUploadUrl: async (p) => ({ data: { signedUrl: 'https://s/' + p, token: 't' }, error: null }),
    getPublicUrl: (p) => ({ data: { publicUrl: SB + '/storage/v1/object/public/poster-assets/' + p } }),
  }) } };
  const res = fakeRes();
  await handler({ getSupabase: () => supabase })({ method: 'POST', url: '/api/mybeer?op=upload', headers: {}, body: { mimeType: 'image/webp', size: 1000 } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.body.data.url, /\/poster-assets\/mybeer\/.+\.webp$/);
});

// ---- review fixes ----
test('public settings: a redis that never answers gives defaults quickly', async () => {
  const redis = { get: () => new Promise(() => {}) };
  const t0 = Date.now();
  const s = await m.getPublicSettings(redis, SB, 50);
  assert.deepStrictEqual(s, { font: 'classic', lineupUrl: '' });
  assert.ok(Date.now() - t0 < 1000, 'took ' + (Date.now() - t0) + 'ms');
});

test('handler: admin get with a failing redis gives a friendly 503', async () => {
  const redis = { get: async () => { throw new Error('Connection is closed'); } };
  const res = fakeRes();
  await handler({ getRedis: () => redis })({ method: 'GET', url: '/api/mybeer?op=get', headers: {} }, res);
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body.message, '暂时读不到设置，请稍后再试');
});

// ---- routing through the existing api/menu-public.js (stays within Vercel's function limit) ----
test('menu-public: ?mybeer=1 answers with site settings, not the menu', async () => {
  const saved = process.env.REDIS_URL; delete process.env.REDIS_URL;
  try {
    const menuPublic = require('../api/menu-public.js');
    const res = fakeRes();
    await menuPublic({ method: 'GET', url: '/api/menu-public?mybeer=1', query: { mybeer: '1' }, headers: {} }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true, font: 'classic', lineupUrl: '' });
  } finally { if (saved !== undefined) process.env.REDIS_URL = saved; }
});

test('menu-public: ?mybeer=1&op=save without password is 401', async () => {
  const menuPublic = require('../api/menu-public.js');
  const res = fakeRes();
  await menuPublic({ method: 'POST', url: '/api/menu-public?mybeer=1&op=save', query: { mybeer: '1', op: 'save' }, headers: {}, body: { font: 'sport' } }, res);
  assert.strictEqual(res.statusCode, 401);
});
