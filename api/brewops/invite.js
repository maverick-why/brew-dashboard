const { getSupabase } = require('../_lib/supabase')
const { createClient } = require('@supabase/supabase-js')

function getAdminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { data: member } = await supabase
    .from('brewery_members')
    .select('role, brewery_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Owner only' })

  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'email required' })

  const admin = getAdminClient()

  // 邀请用户（Supabase 创建 auth 账号并发邮件）
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { brewery_id: member.brewery_id, role: 'brewer' },
    redirectTo: (process.env.APP_URL || 'https://why.beer') + '/brewops/',
  })
  if (inviteErr) return res.status(500).json({ error: inviteErr.message })

  // 预建 pending 成员记录，避免被邀请人登录后找不到酒厂
  const { error: memErr } = await admin
    .from('brewery_members')
    .upsert(
      {
        brewery_id: member.brewery_id,
        user_id:    invited.user.id,
        role:       'brewer',
        display_name: email.split('@')[0],   // 临时昵称，接受邀请时可改
        status:     'pending',
      },
      { onConflict: 'user_id,brewery_id' }
    )
  if (memErr) return res.status(500).json({ error: memErr.message })

  return res.status(200).json({ ok: true })
}
