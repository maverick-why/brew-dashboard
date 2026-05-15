import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { C } from '../constants.js'

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setLoading(true)
    try { await signIn(email, password) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function handleReset() {
    if (!email) return setErr('请先输入邮箱')
    try { await resetPassword(email); setResetSent(true) }
    catch (e) { setErr(e.message) }
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ width:360, background:C.card, borderRadius:20, padding:40, border:`1px solid ${C.bd}` }}>
        <div style={{ fontSize:28, fontWeight:800, color:C.dg, marginBottom:4 }}>🍺 BrewOps</div>
        <div style={{ fontSize:14, color:C.mu, marginBottom:32 }}>登录你的酒厂账户</div>
        <form onSubmit={submit}>
          {[['邮箱','email',email,setEmail,'email'],['密码','password',password,setPassword,'current-password']].map(([lbl,type,val,set,ac])=>(
            <div key={lbl} style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:C.mu, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>{lbl}</div>
              <input type={type} value={val} onChange={e=>set(e.target.value)} autoComplete={ac} required
                style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:10, border:`1px solid ${C.bd}`, fontSize:14, color:C.tx, background:'#fff' }}/>
            </div>
          ))}
          {err && <div style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</div>}
          {resetSent && <div style={{ color:C.g, fontSize:13, marginBottom:12 }}>重置邮件已发送，请查收</div>}
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:14, borderRadius:12, background:C.g, color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:12 }}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
        <button onClick={handleReset} style={{ background:'none', border:'none', color:C.mu, fontSize:13, cursor:'pointer', padding:0 }}>
          忘记密码？发送重置邮件
        </button>
      </div>
    </div>
  )
}
