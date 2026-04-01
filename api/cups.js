const { handleOptions, ensureMethod } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['GET'])) return;

  try {
    const supabase = getSupabase();
    const { data, error: dbError } = await supabase
      .from('cups')
      .select('id, number, claimer_name, claimed_at')
      .order('number', { ascending: true });

    if (dbError) throw dbError;

    return ok(res, data.map(c => ({
      id: c.id,
      number: c.number,
      claimer_name: c.claimer_name || null,
      claimed: !!c.claimed_at,
    })));
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
