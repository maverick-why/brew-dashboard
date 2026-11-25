// Settings handler for the /mybeer custom-label site. Mounted inside api/menu-public.js
// (not its own function: the project is at Vercel's 12-function limit).
//   GET  /api/menu-public?mybeer=1            public: { ok, font, lineupUrl }
//   GET  /api/menu-public?mybeer=1&op=get     admin (x-admin-pass)
//   POST /api/menu-public?mybeer=1&op=upload  admin: signed upload URL into poster-assets/mybeer/
//   POST /api/menu-public?mybeer=1&op=save    admin: { font, lineupUrl }
const Redis = require('ioredis');
const { getSupabase } = require('./supabase');
const { verifyAdmin } = require('./admin-auth');
const { createMybeerHandler } = require('./mybeer');

let redis;
function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 1500,
      commandTimeout: 1500,
    });
  }
  return redis;
}

module.exports = createMybeerHandler({
  getRedis,
  getSupabase,
  verifyAdmin,
  supabaseUrl: process.env.SUPABASE_URL,
});
