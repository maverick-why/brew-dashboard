// api/cron/sponsor-expiry.js
const { ok, error } = require('../_lib/response');
const { getSupabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  // Vercel Cron injects Authorization header automatically
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return error(res, 401, 'Unauthorized');
  }

  try {
    const supabase = getSupabase();
    const { data, error: dbError } = await supabase
      .from('sponsor_records')
      .update({ status: 'expired' })
      .eq('status', 'live')
      .lt('expire_at', new Date().toISOString())
      .select('id, tap_no');

    if (dbError) throw dbError;
    return ok(res, { expired: (data || []).length });
  } catch (err) {
    return error(res, 500, err.message);
  }
};
