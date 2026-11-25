// /api/mybeer — settings for the /mybeer custom-label site.
//   GET  /api/mybeer            public: { ok, font, lineupUrl }
//   GET  /api/mybeer?op=get     admin (x-admin-pass)
//   POST /api/mybeer?op=upload  admin: signed upload URL into poster-assets/mybeer/
//   POST /api/mybeer?op=save    admin: { font, lineupUrl }
const Redis = require('ioredis');
const { getSupabase } = require('./_lib/supabase');
const { verifyAdmin } = require('./_lib/admin-auth');
const { createMybeerHandler } = require('./_lib/mybeer');

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
