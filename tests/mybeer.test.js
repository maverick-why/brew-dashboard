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
