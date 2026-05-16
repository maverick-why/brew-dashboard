import { useState } from 'react'
import { useBrewery } from '../hooks/useBrewery.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { C } from '../constants.js'

export default function AcceptInvitePage() {
  const { pendingMember, acceptInvite } = useBrewery()
  const { signOut } = useAuth()
  const [name, setName]     = useState(pendingMember?.display_name ?? '')
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState('')

  async function handleAccept(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true); setErr('')
    try {
      await acceptInvite(name.trim())
      // acceptInvite 内部调用 load()，会重新触发路由跳转到主页
    } catch (e) {
      setErr(e.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif', padding:24 }}>
      <div style={{ width:'100%', maxWidth:400 }}>

        {/* 图标 */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:64, height:64, borderRadius:20, background:C.g+'22', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:28, marginBottom:12 }}>
            🍺
          </div>
          <div style={{ fontSize:22, fontWeight:800, color:C.tx, marginBottom:6 }}>你收到了邀请</div>
          <div style={{ fontSize:14, color:C.mu }}>
            加入 <span style={{ fontWeight:700, color:C.tx }}>{pendingMember?.breweryName}</span>
          </div>
        </div>

        {/* 表单 */}
        <div style={{ background:C.card, borderRadius:20, padding:24, border:`1px solid ${C.bd}` }}>
          <form onSubmit={handleAccept}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:C.mu, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:8 }}>
                你的昵称
              </div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="显示给团队的名字"
                required
                autoFocus
                style={{
                  width:'100%', boxSizing:'border-box',
                  padding:'12px 14px', borderRadius:12,
                  border:`1px solid ${C.bd}`, fontSize:15,
                  color:C.tx, background:'#fff',
                }}
              />
            </div>

            {err && (
              <div style={{ fontSize:12, color:C.red, marginBottom:12, padding:'8px 12px', background:'#fef2f2', borderRadius:8 }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                width:'100%', padding:14, borderRadius:12,
                fontSize:15, fontWeight:700,
                background: loading ? C.mu : C.g,
                color:'#fff', border:'none', cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '加入中…' : '加入酒厂'}
            </button>
          </form>
        </div>

        <div style={{ textAlign:'center', marginTop:16 }}>
          <button onClick={signOut} style={{ background:'none', border:'none', fontSize:13, color:C.mu, cursor:'pointer' }}>
            这不是我的邀请，退出登录
          </button>
        </div>

      </div>
    </div>
  )
}
