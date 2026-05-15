import { useState } from 'react'
import { useBrewery } from '../hooks/useBrewery.js'
import { C } from '../constants.js'

export default function SetupPage() {
  const { createBrewery } = useBrewery()
  const [name, setName]               = useState('')
  const [slug, setSlug]               = useState('')
  const [displayName, setDisplayName] = useState('')
  const [err, setErr]                 = useState('')
  const [loading, setLoading]         = useState(false)

  function handleNameChange(val) {
    setName(val)
    setSlug(val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
  }

  async function submit(e) {
    e.preventDefault()
    if (!slug.match(/^[a-z0-9-]+$/)) return setErr('英文标识只能包含小写字母、数字和连字符')
    setErr(''); setLoading(true)
    try { await createBrewery(name, slug, displayName) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ width:400, background:C.card, borderRadius:20, padding:40, border:`1px solid ${C.bd}` }}>
        <div style={{ fontSize:22, fontWeight:800, color:C.tx, marginBottom:8 }}>欢迎！先创建你的酒厂</div>
        <div style={{ fontSize:13, color:C.mu, marginBottom:28 }}>你将成为该酒厂的管理员（Owner）</div>
        <form onSubmit={submit}>
          {[
            ['酒厂名称', name, handleNameChange, 'text', '时光酿造所'],
            ['英文标识（创建后不可修改）', slug, setSlug, 'text', 'shiguang'],
            ['你的姓名（操作记录里显示）', displayName, setDisplayName, 'text', '悟空'],
          ].map(([lbl, val, set, type, ph]) => (
            <div key={lbl} style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:C.mu, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>{lbl}</div>
              <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph} required
                style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:10, border:`1px solid ${C.bd}`, fontSize:14, color:C.tx, background:'#fff' }}/>
            </div>
          ))}
          {err && <div style={{ color:C.red, fontSize:13, marginBottom:12 }}>{err}</div>}
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:14, borderRadius:12, background:C.g, color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}>
            {loading ? '创建中…' : '创建酒厂'}
          </button>
        </form>
      </div>
    </div>
  )
}
