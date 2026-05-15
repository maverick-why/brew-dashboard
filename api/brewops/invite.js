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

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { brewery_id: member.brewery_id, role: 'brewer' },
  })
  if (inviteErr) return res.status(500).json({ error: inviteErr.message })

  return res.status(200).json({ ok: true })
}
