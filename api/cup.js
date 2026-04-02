const { handleOptions, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { PospalClient } = require('./_lib/pospal');

// ── helpers ──────────────────────────────────────────────────────────────────

function verifyAdminPass(req) {
  return req.headers['x-admin-pass'] === process.env.ADMIN_PASS;
}

async function isCachedMember(supabase, phone) {
  const { data } = await supabase
    .from('cup_members').select('phone').eq('phone', phone).maybeSingle();
  return !!data;
}

async function cacheMember(supabase, phone) {
  await supabase.from('cup_members')
    .upsert({ phone, synced_at: new Date().toISOString() }, { onConflict: 'phone' });
}

// ── handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const url = (req.url || '').split('?')[0].replace(/\/$/, '');
  const action = url.endsWith('/verify')       ? 'verify'
               : url.endsWith('/claim')        ? 'claim'
               : url.endsWith('/admin')        ? 'admin'
               : url.endsWith('/sync-members') ? 'sync-members'
               : null;

  // ── GET /api/cup → cups list ─────────────────────────────────────────────
  if (req.method === 'GET' && !action) {
    try {
      const supabase = getSupabase();
      const isAdmin = verifyAdminPass(req);
      const select = isAdmin
        ? 'id, number, claimer_name, claimer_phone, claimed_at'
        : 'id, number, claimer_name, claimed_at';
      const { data, error: dbError } = await supabase
        .from('cups').select(select).order('number', { ascending: true });
      if (dbError) throw dbError;
      return ok(res, data.map(c => ({
        id: c.id,
        number: c.number,
        claimer_name: c.claimer_name || null,
        claimed: !!c.claimed_at,
        ...(isAdmin ? { claimer_phone: c.claimer_phone || null, claimed_at: c.claimed_at || null } : {}),
      })));
    } catch (err) {
      return error(res, 500, err.message);
    }
  }

  // ── POST /api/cup/verify ──────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'verify') {
    try {
      const { phone } = await readJsonBody(req);
      if (!phone || !/^1[3-9]\d{9}$/.test(phone))
        return error(res, 400, '请输入正确的手机号');

      const supabase = getSupabase();

      // Already claimed by this phone?
      const { data: cup } = await supabase
        .from('cups').select('number, claimer_name')
        .eq('claimer_phone', phone).maybeSingle();
      if (cup) return ok(res, { valid: false, reason: 'already_claimed',
        cup: { number: cup.number, claimer_name: cup.claimer_name } });

      // Cache hit → skip Pospal
      if (await isCachedMember(supabase, phone))
        return ok(res, { valid: true });

      // Cache miss → call Pospal
      const pospal = new PospalClient();
      const customer = await pospal.getMemberByPhone(phone);
      if (!customer?.customerUid)
        return ok(res, { valid: false, reason: 'not_member' });

      await cacheMember(supabase, phone);
      return ok(res, { valid: true });
    } catch (err) {
      return error(res, 500, err.message);
    }
  }

  // ── POST /api/cup/claim ───────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'claim') {
    try {
      const { phone, cup_id, claimer_name } = await readJsonBody(req);
      if (!phone || !cup_id || !claimer_name)    return error(res, 400, '参数不完整');
      if (!/^1[3-9]\d{9}$/.test(phone))          return error(res, 400, '手机号格式不正确');
      if (!claimer_name.trim())                   return error(res, 400, '请填写姓名');
      if ([...claimer_name.trim()].length > 12)   return error(res, 400, '姓名最多12个字符');

      const supabase = getSupabase();

      const { data: existing } = await supabase
        .from('cups').select('number').eq('claimer_phone', phone).maybeSingle();
      if (existing) return ok(res, { success: false, reason: 'already_claimed' });

      // Cache hit → skip Pospal
      if (!(await isCachedMember(supabase, phone))) {
        const pospal = new PospalClient();
        const customer = await pospal.getMemberByPhone(phone);
        if (!customer?.customerUid)
          return ok(res, { success: false, reason: 'not_member' });
        await cacheMember(supabase, phone);
      }

      const { data: updated, error: updateError } = await supabase
        .from('cups')
        .update({ claimer_name: claimer_name.trim(), claimer_phone: phone,
                  claimed_at: new Date().toISOString() })
        .eq('id', cup_id).is('claimer_phone', null)
        .select('id, number').maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return ok(res, { success: false, reason: 'cup_taken' });

      return ok(res, { success: true, cup: { id: updated.id, number: updated.number } });
    } catch (err) {
      return error(res, 500, err.message);
    }
  }

  // ── POST /api/cup/admin ───────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'admin') {
    if (!verifyAdminPass(req)) return error(res, 401, 'Unauthorized');
    try {
      const { op, cup_id, claimer_name } = await readJsonBody(req);
      const supabase = getSupabase();

      if (op === 'update') {
        if (!cup_id || !claimer_name)             return error(res, 400, '参数不完整');
        if ([...claimer_name.trim()].length > 12) return error(res, 400, '姓名最多12个字符');
        const { error: dbError } = await supabase
          .from('cups').update({ claimer_name: claimer_name.trim() }).eq('id', cup_id);
        if (dbError) throw dbError;
        return ok(res, { success: true });
      }

      if (op === 'cancel') {
        if (!cup_id) return error(res, 400, '缺少 cup_id');
        const { error: dbError } = await supabase
          .from('cups')
          .update({ claimer_name: null, claimer_phone: null, claimed_at: null })
          .eq('id', cup_id);
        if (dbError) throw dbError;
        return ok(res, { success: true });
      }

      return error(res, 400, '未知 op');
    } catch (err) {
      return error(res, 500, err.message);
    }
  }

  // ── POST /api/cup/sync-members ────────────────────────────────────────────
  if (req.method === 'POST' && action === 'sync-members') {
    if (!verifyAdminPass(req)) return error(res, 401, 'Unauthorized');
    const t0 = Date.now();
    try {
      const pospal = new PospalClient();
      const supabase = getSupabase();

      let page = 1;
      const pageSize = 200;
      let allPhones = [];
      let hasMore = true;

      while (hasMore) {
        const result = await pospal._request(
          '/pospal-api2/openapi/v1/customerOpenapi/queryCustomerPages',
          { appId: pospal.appId, currentPage: page, pageSize }
        );
        const records = Array.isArray(result?.result) ? result.result
                       : Array.isArray(result)         ? result : [];
        const phones = records
          .map(r => String(r.phone || r.customerTel || '').replace(/\D/g, ''))
          .filter(p => /^1[3-9]\d{9}$/.test(p));
        allPhones = allPhones.concat(phones);
        hasMore = records.length >= pageSize;
        page++;
      }

      // Batch upsert in chunks
      const chunkSize = 200;
      const now = new Date().toISOString();
      for (let i = 0; i < allPhones.length; i += chunkSize) {
        const chunk = allPhones.slice(i, i + chunkSize).map(phone => ({ phone, synced_at: now }));
        const { error: upsertError } = await supabase
          .from('cup_members').upsert(chunk, { onConflict: 'phone' });
        if (upsertError) throw upsertError;
      }

      const elapsed = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
      return ok(res, { success: true, count: allPhones.length, elapsed });
    } catch (err) {
      return error(res, 500, err.message);
    }
  }

  return error(res, 404, 'Not found');
};
