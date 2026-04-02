// api/_lib/member-cache.js
// Shared cup_members cache helpers used by cup.js and sponsor.js

/**
 * Look up phone in cup_members cache.
 * Returns { found: true, customerUid } or { found: false }
 */
async function lookupCache(supabase, phone) {
  const { data } = await supabase
    .from('cup_members')
    .select('customer_uid')
    .eq('phone', phone)
    .maybeSingle();
  if (!data) return { found: false };
  return { found: true, customerUid: data.customer_uid || null };
}

/**
 * Upsert phone (and optional customerUid) into cup_members cache.
 */
async function writeCache(supabase, phone, customerUid) {
  await supabase
    .from('cup_members')
    .upsert(
      { phone, customer_uid: customerUid || null, synced_at: new Date().toISOString() },
      { onConflict: 'phone' }
    );
}

module.exports = { lookupCache, writeCache };
