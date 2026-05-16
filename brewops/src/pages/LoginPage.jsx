import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { C } from '../constants.js'

export default function LoginPage() {
  const { signIn, signUp, resetPassword, session } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (session) navigate('/brewops', { replace: true })
  }, [session])

  const [mode, setMode]           = useState('login')   // 'login' | 'signup'
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr]             = useState('')
  const [loading, setLoading]     = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [signupOk, setSignupOk]   = useState(false)

  function switchMode(m) { setMode(m); setErr(''); setResetSent(false); setSignupOk(false) }

  async function submit(e) {
    e.preventDefault()
    setErr(''); setLoading(true)
    try {
      if (mode === 'signup') {
        if (password !== password2) { setErr('两次密码不一致'); setLoading(false); return }
        if (password.length < 6)    { setErr('密码至少 6 位');  setLoading(false); return }
        await signUp(email, password)
        setSignupOk(true)
      } else {
        await signIn(email, password)
      }
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function handleReset() {
    if (!email) return setErr('请先输入邮箱')
    try { await resetPassword(email); setResetSent(true); setErr('') }
    catch (e) { setErr(e.message) }
  }

  if (signupOk) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ width:360, background:C.card, borderRadius:20, padding:40, border:`1px solid ${C.bd}`, textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:16 }}>📬</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.tx, marginBottom:8 }}>确认邮件已发送</div>
        <div style={{ fontSize:14, color:C.mu, marginBottom:24 }}>请查收 <b>{email}</b> 的邮件，点击链接完成注册后即可登录。</div>
        <button onClick={() => switchMode('login')}
          style={{ background:'none', border:'none', color:C.g, fontSize:14, fontWeight:600, cursor:'pointer' }}>
          返回登录
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ width:360, background:C.card, borderRadius:20, padding:40, border:`1px solid ${C.bd}` }}>
        <div style={{ fontSize:28, fontWeight:800, color:C.dg, marginBottom:4 }}>🍺 BrewOps</div>
        <div style={{ fontSize:14, color:C.mu, marginBottom:28 }}>
          {mode === 'login' ? '登录你的酒厂账户' : '创建新酒厂账户'}
        </div>

        {/* 模式切换 */}
        <div style={{ display:'flex', background:C.fa, borderRadius:10, padding:3, marginBottom:24 }}>
          {[['login','登录'],['signup','注册']].map(([m, lbl]) => (
            <button key={m} onClick={() => switchMode(m)} style={{
              flex:1, padding:'8px 0', borderRadius:8, fontSize:13, fontWeight:600, border:'none', cursor:'pointer',
              background: mode === m ? C.card : 'transparent',
              color: mode === m ? C.tx : C.mu,
              boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>{lbl}</button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:C.mu, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>邮箱</div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required
              style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:10, border:`1px solid ${C.bd}`, fontSize:14, color:C.tx, background:'#fff' }}/>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:C.mu, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>密码</div>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} required
              style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:10, border:`1px solid ${C.bd}`, fontSize:14, color:C.tx, background:'#fff' }}/>
          </div>
          {mode === 'signup' && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:C.mu, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>确认密码</div>
              <input type="password" value={password2} onChange={e=>setPassword2(e.target.value)} autoComplete="new-password" required
                style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:10, border:`1px solid ${C.bd}`, fontSize:14, color:C.tx, background:'#fff' }}/>
            </div>
          )}
          {err      && <div style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</div>}
          {resetSent && <div style={{ color:C.g,   fontSize:13, marginBottom:12 }}>重置邮件已发送，请查收</div>}
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:14, borderRadius:12, background:C.g, color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:12 }}>
            {loading ? (mode==='login'?'登录中…':'注册中…') : (mode==='login'?'登录':'创建账户')}
          </button>
        </form>

        {mode === 'login' && (
          <button onClick={handleReset} style={{ background:'none', border:'none', color:C.mu, fontSize:13, cursor:'pointer', padding:0 }}>
            忘记密码？发送重置邮件
          </button>
        )}
        {mode === 'signup' && (
          <div style={{ fontSize:12, color:C.mu, lineHeight:1.6 }}>
            注册后需要验证邮箱，然后创建你的酒厂信息。
          </div>
        )}
      </div>
    </div>
  )
}
