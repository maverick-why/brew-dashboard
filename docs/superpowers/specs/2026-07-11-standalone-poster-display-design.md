# Standalone Poster Display Page — Design

## Problem

The Sharp TV used for posters can't read USB (and can't install any apps/browser — it's not a smart TV). Posters currently only render inside a 1/3-width strip on the left TV (`menu.html?screen=left`), as part of the dual-screen beer menu layout. The user wants the uploaded image posters extracted into their own full-screen rotation, to be shown via a wired HDMI connection from an iPad (screen mirroring/AirPlay isn't available since the TV doesn't support it).

## Scope

A new standalone, full-screen, read-only page that loops through the active image posters — nothing else. No changes to the database, upload flow, or the existing left/right TV layouts.

## Architecture

**New file:** `poster-display.html` (repo root, alongside `menu.html`). Self-contained static page — own `<style>`/`<script>`, no shared JS module with `menu.html` (that file is already large and tightly coupled to the dual-TV grid layout; duplicating the ~40 lines of poster-rendering logic is simpler than extracting a shared module for one consumer).

**Data source:** existing `GET /api/menu-public?poster=1` endpoint (no backend changes). Returns active `poster_items`, already filtered by `enabled` and `starts_at`/`ends_at`, ordered by `sort_order`.

**Layout:** fills the viewport (`100vw` × `100vh`), not the fixed 1080px dual-TV canvas `menu.html` uses for bezel-matching across two physical screens — irrelevant here since this is a single device (iPad mirrored over HDMI).

**Visual style:** reuses the existing poster-zone look from `menu.html` (`.poster-bg-layer` blurred/scaled background + `.poster-fg-layer` centered `object-fit: contain` image), so posters look identical to how they already render on the left TV today.

**Rotation logic:** mirrors `menu.html`'s existing `startPosterLoop`/`loadPosterItems` pattern:
- Poll the poster API every 5s (matches `menu.html`'s `REFRESH` cadence).
- Diff the response via a JSON signature; only reset the rotation index if the poster list actually changed (avoids visible flicker/restart on every poll).
- Each item stays on screen for its own `duration_sec` (minimum 3s), then advances to the next, looping.

**Type handling:** admin currently only ever creates `type: "image"` posters (the type field is hardcoded in `admin.html`). This page only renders `type: "image"`. Any other type, or an empty list, falls back to the existing static "时光酿造所" branded placeholder card (same fallback already used in `menu.html`) — no beer-menu/tap data is fetched on this page.

**Access:** public URL, no admin password, consistent with `menu.html` being public.

## Admin integration

Add a fourth button in `admin.html`'s "电视展示" tab, next to "总预览 / 左电视 / 右电视": **"海报独立播放 ↗"** → `window.open('/poster-display.html', '_blank')`.

## Out of scope

- No changes to `poster_items` schema or the upload/CRUD API.
- No changes to the left-TV poster strip in `menu.html` — it stays as-is.
- No portrait-orientation layout (confirmed screen is landscape).
- No AirPlay/casting-specific code — delivery to the TV is a hardware concern (HDMI cable from iPad), not something this page needs to handle differently.

## Deployment note

`main` auto-deploys to the live bar TVs. Diff the full new file before staging, and diff `admin.html` before staging (existing project practice — no separate staging environment).
