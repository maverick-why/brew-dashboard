const { handleOptions, ensureMethod } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { TAPS } = require('./_lib/taps');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!ensureMethod(req, res, ['GET'])) return;

  try {
    const supabase = getSupabase();
    const { data: active, error: dbError } = await supabase
      .from('sponsor_records')
      .select('tap_no, sponsor_name, expire_at')
      .in('status', ['live', 'pending']);

    if (dbError) throw dbError;

    const sponsorMap = {};
    for (const s of active || []) {
      sponsorMap[s.tap_no] = s;
    }

    const result = TAPS.map(tap => {
      const sponsorRecord = sponsorMap[tap.no];
      const base = {
        no: tap.no,
        name: tap.name,
        name_en: tap.name_en,
        style: tap.style,
        style_en: tap.style_en,
      };
      if (sponsorRecord) {
        return { ...base, sponsor: sponsorRecord.sponsor_name, expireAt: sponsorRecord.expire_at };
      }
      return base;
    });

    return ok(res, result);
  } catch (err) {
    return error(res, 500, err.message || 'Internal server error');
  }
};
