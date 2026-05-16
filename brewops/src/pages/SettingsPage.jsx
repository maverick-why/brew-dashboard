import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useBrewery } from '../hooks/useBrewery.jsx'
import { C } from '../constants.js'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const { brewery, members, removeMember, reload } = useBrewery()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteErr, setInviteErr]     = useState('')
  const [inviteOk, setInviteOk]       = useState(false)
  const [loading, setLoading]         = useState(false)
  const [confirmId, setConfirmId]     = useState(null)  // 待确认移除的成员 id

  async function sendInvite(e) {
    e.preventDefault()
    setInviteErr(''); setInviteOk(false); setLoading(true)
    try {
      const token = session.access_token
      const res = await fetch('/api/brewops/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInviteOk(true); setInviteEmail(''); reload()
    } catch (e) { setInviteErr(e.message) }
    finally { setLoading(false) }
  }

  const statusLabel = { active: '已激活', pending: '待激活' }
  const roleLabel   = { owner: 'Owner', brewer: '酿酒师' }

  return (
    <div style={{ background:C.bg, minHeight:'100vh', fontFamily:'system-ui,sans-serif', maxWidth:480, margin:'0 auto', padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={()=>navigate('/brewops')} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:C.mu }}>←</button>
        <div style={{ fontSize:20, fontWeight:800, color:C.tx }}>酒厂设置</div>
      </div>

      <div style={{ background:C.card, borderRadius:16, padding:20, border:`1px solid ${C.bd}`, marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{brewery?.name}</div>
        <div style={{ fontSize:12, color:C.mu }}>slug: {brewery?.slug} · 成员 {members.length} 人</div>
      </div>

      <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.bd}`, marginBottom:16, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${C.bd}`, fontSize:12, fontWeight:700, color:C.mu, textTransform:'uppercase', letterSpacing:'0.06em' }}>成员</div>
        {members.map(m => (
          <div key={m.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 20px', borderBottom:`1px solid ${C.bd}` }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background: m.status==='active' ? C.g : C.mu }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600 }}>{m.display_name}</div>
              <div style={{ fontSize:11, color:C.mu }}>{roleLabel[m.role]} · {statusLabel[m.status]}</div>
            </div>
            {m.role !== 'owner' && (
              confirmId === m.id ? (
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setConfirmId(null)}
                    style={{ fontSize:11, color:C.mu, background:'none', border:`1px solid ${C.bd}`, borderRadius:8, padding:'4px 8px', cursor:'pointer' }}>取消</button>
                  <button onClick={() => { removeMember(m.id); setConfirmId(null) }}
                    style={{ fontSize:11, color:'#fff', background:C.red, border:'none', borderRadius:8, padding:'4px 10px', cursor:'pointer', fontWeight:700 }}>确认</button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(m.id)}
                  style={{ fontSize:12, color:C.red, background:'none', border:`1px solid ${C.red}44`, borderRadius:8, padding:'5px 10px', cursor:'pointer' }}>
                  移除
                </button>
              )
            )}
          </div>
        ))}
      </div>

      <div style={{ background:C.card, borderRadius:16, padding:20, border:`1px solid ${C.bd}`, marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.mu, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>邀请新成员</div>
        <form onSubmit={sendInvite} style={{ display:'flex', gap:8 }}>
          <input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}
            placeholder="邮箱地址" required
            style={{ flex:1, padding:'10px 12px', borderRadius:10, border:`1px solid ${C.bd}`, fontSize:14, color:C.tx }}/>
          <button type="submit" disabled={loading}
            style={{ padding:'10px 16px', borderRadius:10, background:C.g, color:'#fff', border:'none', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            {loading ? '…' : '发邀请'}
          </button>
        </form>
        {inviteErr && <div style={{ color:C.red, fontSize:12, marginTop:8 }}>{inviteErr}</div>}
        {inviteOk  && <div style={{ color:C.g,   fontSize:12, marginTop:8 }}>邀请邮件已发送</div>}
      </div>

      <button onClick={signOut}
        style={{ width:'100%', padding:14, borderRadius:12, background:C.fa, color:C.mu, border:`1px solid ${C.bd}`, fontSize:14, fontWeight:600, cursor:'pointer' }}>
        退出登录
      </button>
    </div>
  )
}
