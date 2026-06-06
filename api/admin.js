const { handleOptions, getQuery, readJsonBody } = require('./_lib/http');
const { ok, error } = require('./_lib/response');
const { getSupabase } = require('./_lib/supabase');
const { verifyAdmin } = require('./_lib/admin-auth');
const Redis = require('ioredis');
const crypto = require('crypto');

const MENU_KEY = 'brew_dash_menu_v1';
const POSTER_BUCKET = process.env.POSTER_BUCKET || 'poster-assets';
const POSTER_TYPES = ['image', 'beer_recommend', 'info_card'];
const POSTER_BG_TYPES = ['auto_blur', 'solid', 'gradient', 'theme'];
const POSTER_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const POSTER_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

let redis;
function getRedis() {
  if (!redis) {
    if (!process.env.REDIS_URL) return null;
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return redis;
}

async function ensurePosterBucket(supabase) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if ((buckets || []).some(bucket => bucket.name === POSTER_BUCKET)) return;

  const { error: createError } = await supabase.storage.createBucket(POSTER_BUCKET, {
    public: true,
    allowedMimeTypes: Object.keys(POSTER_IMAGE_TYPES),
    fileSizeLimit: POSTER_IMAGE_MAX_BYTES,
  });
  if (createError && !/already exists/i.test(createError.message || '')) throw createError;
}

function normalizePosterImageUpload(body) {
  const mimeType = body.mimeType || body.mime_type || '';
  const dataUrl = body.dataUrl || body.data_url || '';
  if (!POSTER_IMAGE_TYPES[mimeType]) {
    const err = new Error('只支持 JPG / PNG / WebP 图片');
    err.status = 400;
    throw err;
  }

  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix)) {
    const err = new Error('图片数据格式不正确');
    err.status = 400;
    throw err;
  }

  const buffer = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  if (!buffer.length || buffer.length > POSTER_IMAGE_MAX_BYTES) {
    const err = new Error('图片不能超过 3MB');
    err.status = 400;
    throw err;
  }

  const ext = POSTER_IMAGE_TYPES[mimeType];
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const date = new Date().toISOString().slice(0, 10);
  return {
    buffer,
    mimeType,
    path: `poster-items/${date}/${Date.now()}-${id}.${ext}`,
  };
}

function normalizePosterPayload(body) {
  const type = body.type || 'image';
  const bgType = body.bgType || body.bg_type || (type === 'beer_recommend' ? 'theme' : 'auto_blur');
  if (!POSTER_TYPES.includes(type)) {
    const err = new Error('无效的动态内容类型');
    err.status = 400;
    throw err;
  }
  if (!POSTER_BG_TYPES.includes(bgType)) {
    const err = new Error('无效的背景类型');
    err.status = 400;
    throw err;
  }

  const payload = {
    type,
    title: body.title || null,
    image_url: body.imageUrl || body.image_url || null,
    tap_no: body.tapNo === '' || body.tapNo === undefined || body.tapNo === null ? null : Number(body.tapNo),
    body: body.body || null,
    qr_url: body.qrUrl || body.qr_url || null,
    enabled: body.enabled !== false,
    sort_order: Number(body.sortOrder ?? body.sort_order ?? 0) || 0,
    duration_sec: Math.max(3, Number(body.durationSec ?? body.duration_sec ?? 10) || 10),
    starts_at: body.startsAt || body.starts_at || null,
    ends_at: body.endsAt || body.ends_at || null,
    bg_type: bgType,
    bg_value: body.bgValue || body.bg_value || null,
  };

  if (payload.tap_no !== null && (!Number.isInteger(payload.tap_no) || payload.tap_no < 1 || payload.tap_no > 64)) {
    const err = new Error('tap_no 必须是 1-64 的整数');
    err.status = 400;
    throw err;
  }

  if (type === 'image' && !payload.image_url) {
    const err = new Error('图片海报必须填写图片 URL');
    err.status = 400;
    throw err;
  }

  if (type === 'beer_recommend' && payload.tap_no === null) {
    const err = new Error('推荐酒款必须填写酒头编号');
    err.status = 400;
    throw err;
  }

  return payload;
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    verifyAdmin(req);
    const supabase = getSupabase();

    if (req.method === 'GET') {
      const { status, op } = getQuery(req);
      if (op === 'poster-list') {
        const { data, error: dbError } = await supabase
          .from('poster_items')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (dbError) throw dbError;
        return ok(res, data || []);
      }

      const VALID_STATUSES = ['pending', 'live', 'rejected', 'expired'];
      if (status && !VALID_STATUSES.includes(status)) return error(res, 400, '无效的 status 参数');
      let query = supabase.from('sponsor_records').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error: dbError } = await query;
      if (dbError) throw dbError;
      return ok(res, data);
    }

    if (req.method === 'POST') {
      const { op } = getQuery(req);
      const body = await readJsonBody(req);

      if (op === 'review') {
        const { id, action, adminUser, reason } = body;
        if (!id || !['approve', 'reject'].includes(action)) return error(res, 400, '参数错误');
        if (action === 'reject' && !reason) return error(res, 400, '拒绝时必须填写原因');
        const newStatus = action === 'approve' ? 'live' : 'rejected';
        const { error: dbError } = await supabase
          .from('sponsor_records')
          .update({
            status: newStatus,
            reviewed_at: new Date().toISOString(),
            reviewed_by: adminUser || 'admin',
            reject_reason: action === 'reject' ? reason : null,
          })
          .eq('id', id);
        if (dbError) throw dbError;
        return ok(res, { status: newStatus });
      }

      if (op === 'add') {
        const { tapNo, sponsorName, openId, adminUser } = body;
        if (!tapNo || !sponsorName) return error(res, 400, '缺少 tapNo 或 sponsorName');
        const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { error: dbError } = await supabase.from('sponsor_records').insert({
          tap_no: tapNo,
          sponsor_name: sponsorName,
          open_id: openId || 'admin',
          review_result: 'pass',
          status: 'live',
          expire_at: expireAt,
          reviewed_by: adminUser || 'admin',
          reviewed_at: new Date().toISOString(),
        });
        if (dbError) {
          if (dbError.code === '23505') return error(res, 409, '该酒头已被冠名');
          throw dbError;
        }
        return ok(res, { status: 'live' });
      }

      if (op === 'remove') {
        const { sponsorId } = body;
        if (!sponsorId) return error(res, 400, '缺少 sponsorId');
        const { data: record, error: fetchErr } = await supabase
          .from('sponsor_records')
          .select('id, tap_no')
          .eq('id', sponsorId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!record) return error(res, 404, '未找到冠名记录');
        const { error: delErr } = await supabase
          .from('sponsor_records')
          .delete()
          .eq('id', sponsorId);
        if (delErr) throw delErr;
        try {
          const r = getRedis();
          if (r) {
            const val = await r.get(MENU_KEY);
            if (val) {
              const menuData = JSON.parse(val);
              const key = String(record.tap_no);
              if (menuData[key]?.sponsor_name) {
                delete menuData[key].sponsor_name;
                await r.set(MENU_KEY, JSON.stringify(menuData));
              }
            }
          }
        } catch { /* Redis failure is non-fatal */ }
        return ok(res, { deleted: true, tap_no: record.tap_no });
      }

      if (op === 'tap-toggle') {
        const { tapNo, active } = body;
        if (!tapNo || typeof active !== 'boolean') return error(res, 400, '缺少 tapNo 或 active');
        const { error: dbError } = await supabase
          .from('tap_settings')
          .update({ active })
          .eq('tap_no', tapNo);
        if (dbError) throw dbError;
        // 关闭冠名时，同时撤销该酒头所有已有的 live/pending 冠名记录
        if (!active) {
          await supabase
            .from('sponsor_records')
            .delete()
            .eq('tap_no', tapNo)
            .in('status', ['live', 'pending']);
          // 清 Redis 缓存中的 sponsor_name
          try {
            const r = getRedis();
            if (r) {
              const val = await r.get(MENU_KEY);
              if (val) {
                const menuData = JSON.parse(val);
                const key = String(tapNo);
                if (menuData[key]?.sponsor_name) {
                  delete menuData[key].sponsor_name;
                  await r.set(MENU_KEY, JSON.stringify(menuData));
                }
              }
            }
          } catch { /* Redis failure is non-fatal */ }
        }
        return ok(res, { tapNo, active });
      }

      if (op === 'poster-upload') {
        const upload = normalizePosterImageUpload(body);
        await ensurePosterBucket(supabase);
        const { error: uploadError } = await supabase.storage
          .from(POSTER_BUCKET)
          .upload(upload.path, upload.buffer, {
            contentType: upload.mimeType,
            cacheControl: '31536000',
            upsert: false,
          });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage
          .from(POSTER_BUCKET)
          .getPublicUrl(upload.path);
        return ok(res, { url: publicData.publicUrl, path: upload.path });
      }

      if (op === 'poster-upsert') {
        const payload = normalizePosterPayload(body);
        let query;
        if (body.id) {
          query = supabase
            .from('poster_items')
            .update(payload)
            .eq('id', body.id)
            .select('*')
            .single();
        } else {
          query = supabase
            .from('poster_items')
            .insert(payload)
            .select('*')
            .single();
        }
        const { data, error: dbError } = await query;
        if (dbError) throw dbError;
        return ok(res, data);
      }

      if (op === 'poster-delete') {
        const { id } = body;
        if (!id) return error(res, 400, '缺少 id');
        const { error: dbError } = await supabase
          .from('poster_items')
          .delete()
          .eq('id', id);
        if (dbError) throw dbError;
        return ok(res, { deleted: true });
      }

      return error(res, 400, '缺少 op 参数');
    }

    return error(res, 405, 'Method Not Allowed');
  } catch (err) {
    return error(res, err.status || 500, err.message);
  }
};
