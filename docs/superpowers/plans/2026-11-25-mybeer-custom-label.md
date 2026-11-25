# /mybeer 客製啤酒包裝網站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `dashboard.dbbrewbeer.com/mybeer` (the approved preview page) plus a "客制网站" admin tab that swaps the homepage lineup image and the site font.

**Architecture:** Static `mybeer.html` in the repo root, served by a Vercel rewrite like `/db`. Settings `{font, lineupUrl, updatedAt}` live in Redis key `mybeer_settings_v1`; a pure module validates them; `api/admin.js` gets three ops; `api/menu-public.js` gets a `?mybeer=1` read. Images upload through the existing signed-URL flow into the `poster-assets` bucket under `mybeer/`.

**Tech Stack:** Vanilla HTML/JS/CSS, Vercel serverless (Node), ioredis, @supabase/supabase-js, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-mybeer-custom-label-design.md`

**Page source to port:** `/private/tmp/claude-501/-Users-maverick-projects-brew-dashboard/08816fd2-b7ad-4b77-bc77-933035ec43b4/scratchpad/db-custom-site/db-brew-custom.html` (version 8, approved) and its `img/` folder.

## Revision (owner: "must not affect current project code")

Additive only. Do not modify any existing file. Task 2 becomes a new `api/mybeer.js` (handler built by `createMybeerHandler(deps)` in `api/_lib/mybeer.js`):
`GET /api/mybeer` public `{ok,font,lineupUrl}` (Cache-Control `public, max-age=60`); `GET ?op=get`, `POST ?op=upload`, `POST ?op=save` require `x-admin-pass` via `verifyAdmin`.
Task 4 does not touch `vercel.json`; page URL is `/mybeer.html`. Task 5 is a new standalone `mybeer-admin.html`, not a tab in `admin.html`.
Work happens in an isolated worktree based on `origin/main`.

## Global Constraints

- Work on branch `feat/mybeer`. Never commit to or push `main`; `main` auto-deploys to the bar TVs. Pushing the branch and opening a PR need the owner's go-ahead.
- No new files directly under `api/` (Vercel function count). New logic goes in `api/_lib/mybeer.js`, `api/admin.js`, `api/menu-public.js`.
- Static images: `.webp` only, root-level, prefix `mybeer-` (build copies `../*.webp`, not `.jpg`).
- Redis key: `mybeer_settings_v1`. Font keys: `classic` (default), `modern`, `elegant`, `sport`.
- `lineupUrl` accepted only if it starts with `${SUPABASE_URL}/storage/v1/object/public/poster-assets/mybeer/`; anything else saves as `""` (= default lineup).
- Upload limits reuse poster rules: JPG/PNG/WebP, ≤ 5MB.
- Admin tab copy in Simplified Chinese (matches admin.html); public page copy unchanged from the approved preview (Traditional Chinese / English).
- Reunion case caption: `中歐 FMBA 2020 級開學 4 周年慶典 · 重逢 Reunion Tales` / `CEIBS FMBA Class of 2020 · 4th anniversary celebration`, Double Hazy IPA 5.5%.

## Review Focus

1. Public settings read fails (Redis down, missing key) → page renders with classic font and default lineup, no console error shown to visitors. Test: `getPublicSettings` returns defaults when Redis throws (Task 2).
2. Owner saves a font then reloads → choice survives; unknown font key from a stale admin page → stored as `classic`. Test in Task 1.
3. Owner uploads a portrait or very wide image → lineup keeps aspect, chips switch to even layout, no horizontal page scroll at 375px. Manual check in Task 5.
4. Someone posts a foreign URL to `mybeer-save` → stored as `""`. Test in Task 1.
5. Admin opens the tab before any save → shows default lineup and `classic` selected. Test: `normalizeMybeerSettings(null)` defaults (Task 1).

---

### Task 1: Settings module

**Files:**
- Create: `api/_lib/mybeer.js`
- Test: `tests/mybeer.test.js`

**Interfaces:**
- Produces: `MYBEER_KEY = 'mybeer_settings_v1'`, `MYBEER_FONTS = ['classic','modern','elegant','sport']`, `mybeerUploadPrefix(supabaseUrl: string) -> string`, `normalizeMybeerSettings(input: object|null, supabaseUrl: string) -> {font: string, lineupUrl: string, updatedAt: string|null}`, `mybeerUploadPath(mimeType: string, now?: Date) -> string` (`mybeer/YYYY-MM-DD/<ms>-<uuid>.<ext>`, throws status-400 error for other types).

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test'); const assert = require('node:assert');
const m = require('../api/_lib/mybeer');
const SB = 'https://x.supabase.co';
test('defaults', () => assert.deepStrictEqual(m.normalizeMybeerSettings(null, SB), { font: 'classic', lineupUrl: '', updatedAt: null }));
test('unknown font -> classic', () => assert.strictEqual(m.normalizeMybeerSettings({ font: 'comic' }, SB).font, 'classic'));
test('keeps valid font', () => assert.strictEqual(m.normalizeMybeerSettings({ font: 'sport' }, SB).font, 'sport'));
test('foreign url dropped', () => assert.strictEqual(m.normalizeMybeerSettings({ lineupUrl: 'https://evil.com/a.png' }, SB).lineupUrl, ''));
test('bucket url kept', () => { const u = SB + '/storage/v1/object/public/poster-assets/mybeer/2026-11-25/1-a.webp'; assert.strictEqual(m.normalizeMybeerSettings({ lineupUrl: u }, SB).lineupUrl, u); });
test('upload path', () => assert.match(m.mybeerUploadPath('image/png', new Date('2026-11-25T00:00:00Z')), /^mybeer\/2026-11-25\/\d+-[0-9a-f-]+\.png$/));
test('bad type', () => assert.throws(() => m.mybeerUploadPath('image/gif'), e => e.status === 400));
```

- [ ] **Step 2: Run** `node --test tests/` → FAIL (module not found)
- [ ] **Step 3: Implement `api/_lib/mybeer.js`** (CommonJS, matches `_lib` style; `updatedAt` passes through only if a string)
- [ ] **Step 4: Run** `node --test tests/` → 7 pass
- [ ] **Step 5: Commit** `feat(mybeer): settings validation module`

### Task 2: API ops

**Files:**
- Modify: `api/admin.js` (GET branch near `op === 'poster-list'`; POST branch near `op === 'poster-upload'`)
- Modify: `api/menu-public.js` (handler top, beside `req.query.poster === "1"`)
- Modify: `api/_lib/mybeer.js` (add `getPublicSettings`)
- Test: `tests/mybeer.test.js`

**Interfaces:**
- Consumes: Task 1 exports; existing `getRedis()` in each file, `getSupabase()`, `ensurePosterBucket(supabase)`, `POSTER_BUCKET`.
- Produces: `GET /api/admin?op=mybeer-get` → `{code:0,data:{font,lineupUrl,updatedAt}}`; `POST /api/admin?op=mybeer-upload` body `{mimeType,size}` → `{signedUrl,token,url,path}`; `POST /api/admin?op=mybeer-save` body `{font,lineupUrl}` → saved settings; `GET /api/menu-public?mybeer=1` → `{ok:true,font,lineupUrl}` with `Cache-Control: public, max-age=60`. `getPublicSettings(redis, supabaseUrl) -> Promise<{font, lineupUrl}>` never rejects.

- [ ] **Step 1: Failing test** — `getPublicSettings` with a fake redis whose `get` rejects resolves `{font:'classic', lineupUrl:''}`; with `get` resolving `'{"font":"modern"}'` resolves font `modern`.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `getPublicSettings`; wire the three admin ops (size check reuses `POSTER_IMAGE_MAX_BYTES`; save writes `JSON.stringify({...normalized, updatedAt: new Date().toISOString()})`); wire `?mybeer=1` in menu-public before the menu logic.
- [ ] **Step 4: Run** `node --test tests/` → all pass; `node -e "require('./api/admin.js');require('./api/menu-public.js')"` → no output
- [ ] **Step 5: Commit** `feat(mybeer): admin and public settings endpoints`

### Task 3: Static images

**Files:**
- Create (root): `mybeer-lineup.webp`, `mybeer-m-corp.webp`, `mybeer-m-bday.webp`, `mybeer-m-wed.webp`, `mybeer-m-party.webp`, `mybeer-m-team.webp`, `mybeer-blank-bday.webp`, `mybeer-blank-wed.webp`, `mybeer-blank-xmas.webp`, `mybeer-case-football.webp`, `mybeer-case-sideline.webp`, `mybeer-case-pair.webp`, `mybeer-case-reunion.webp`

- [ ] **Step 1:** Convert from the preview `img/` folder (WebP q≈84; football case max 1800w). Reunion: cut the can off the grey background and place it on the same warm plate as `case-pair.jpg` (1200×900, can height 700).
- [ ] **Step 2: Verify** `ls -la mybeer-*.webp` → 13 files, total < 2MB; view `mybeer-case-reunion.webp` — full can, warm background, no grey halo.
- [ ] **Step 3: Commit** `feat(mybeer): page images`

### Task 4: Public page

**Files:**
- Create: `mybeer.html`
- Modify: `vercel.json` (rewrites: add `{ "source": "/mybeer", "destination": "/mybeer.html" }` after `/db`)

**Interfaces:**
- Consumes: `GET /api/menu-public?mybeer=1`; Task 3 filenames.

- [ ] **Step 1:** Port the preview HTML into a full document (own `<!doctype>`, `<head>`, OG title/description, favicon `logo.png`). Replace `img/x.ext` with `/mybeer-x.webp`. Remove nothing else.
- [ ] **Step 2:** Add the four font presets (`classic`/`modern`/`elegant`/`sport`, same families as the preview editor) as a `FONTS` map; on load fetch `?mybeer=1` (3s timeout), apply font vars + preset stylesheet, and if `lineupUrl` set: swap `#lineup-img` src and add `html.custom-lineup` (CSS from preview `editor.css` top block). On failure keep defaults silently.
- [ ] **Step 3:** Cases grid: football row, then Sideline / Reunion / Pair; desktop 3 columns, ≤860px 2 columns with the 3rd card `grid-column: 1 / -1`. Reunion caption per Global Constraints.
- [ ] **Step 4: Verify** `python3 -m http.server` from a temp `dist`-like copy, open `/mybeer.html` at 1280 and 375 widths: no horizontal scroll, zh/EN toggle swaps all text, typing updates the label, 4 cases show full cans; API fetch failing locally leaves defaults.
- [ ] **Step 5: Commit** `feat(mybeer): public custom-label page at /mybeer`

### Task 5: Admin tab

**Files:**
- Modify: `admin.html` (tab button after `data-tab="cups"`, pane after `#tab-cups`, script near the poster upload code)

**Interfaces:**
- Consumes: Task 2 endpoints; existing `ADMIN_PASS`, `toast()`, tab switching.

- [ ] **Step 1:** Tab `客制网站` with: current lineup preview (checkerboard behind transparent PNGs), `上传新图片` (JPG/PNG/WebP ≤5MB → `mybeer-upload` → PUT file to `signedUrl` exactly like poster upload), `恢复原图` (sets `lineupUrl` to `''`), 4 font cards rendered in their own fonts, `保存` → `mybeer-save`, link `打开网站 ↗` to `/mybeer`.
- [ ] **Step 2:** Load via `mybeer-get` on first open of the tab; disable `保存` while a request runs; toast success/failure with the server message.
- [ ] **Step 3: Verify** locally that the tab renders and switching tabs works with the API unavailable (shows error toast, no crash).
- [ ] **Step 4: Commit** `feat(mybeer): admin tab for lineup image and font`

### Task 6: Preview deploy and hand-off

- [ ] **Step 1:** Ask the owner before `git push -u origin feat/mybeer`; after push, open the Vercel preview URL.
- [ ] **Step 2: Verify on preview:** `/mybeer` at desktop and phone; admin tab: upload a test image → `/mybeer` shows it after reload; switch font → reflected; `恢复原图` → default lineup back; existing admin tabs and `/menu.html` unchanged.
- [ ] **Step 3:** Open PR to `main` listing every changed file; merge only on the owner's explicit OK.
