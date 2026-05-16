import { useState } from 'react'
import { STEPS, DEF, TCOLS, C } from '../constants.js'
import { fmtFull, parseD, addD } from '../utils.js'

export default function AddSheet({ onAdd, onClose, count }) {
  const n = count + 1
  const [tank, setTank]   = useState(`FV-0${n}`)
  const [beer, setBeer]   = useState('')
  const [batchNo, setBatchNo] = useState(`B${new Date().getFullYear()}-0${n}`)
  const [color, setColor] = useState(TCOLS[count % TCOLS.length])
  const [og, setOg]       = useState('')
  const [yeast, setYeast] = useState('')
  const [startStr, setStartStr] = useState(fmtFull(new Date()))
  const [plan, setPlan]   = useState(() => buildPlan(fmtFull(new Date())))

  function buildPlan(dateStr) {
    const base = parseD(dateStr) || new Date()
    return Object.fromEntries(STEPS.map(s => [s.k, fmtFull(addD(base, DEF[s.k] || 0))]))
  }

  function handleStartChange(val) {
    setStartStr(val)
    setPlan(buildPlan(val))
  }

  function submit() {
    const base = parseD(startStr) || new Date()
    const planDates = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, parseD(v) || addD(base, DEF[k] || 0)]))
    onAdd({ tank, beer, batch_no: batchNo, color, og, yeast, notes: '', plan: planDates })
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width:'100%', maxWidth:600, maxHeight:'90vh', overflowY:'auto', background:C.card, borderRadius:20, paddingBottom:28 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:'14px 18px 12px', borderBottom:`1px solid ${C.bd}`, display:'flex', alignItems:'center' }}>
          <span style={{ fontSize:17, fontWeight:700, flex:1 }}>新建批次</span>
          <button onClick={onClose} style={{ fontSize:22, color:'#aaa', background:'none', border:'none', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:'16px 18px 0' }}>
          {[['发酵罐',tank,setTank,'text'],['啤酒品种',beer,setBeer,'text'],['批次号',batchNo,setBatchNo,'text'],['初始糖度 OG',og,setOg,'text'],['酵母菌株',yeast,setYeast,'text']].map(([lbl,val,set,type]) => (
            <div key={lbl} style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:C.mu, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>{lbl}</div>
              <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={lbl}
                style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${C.bd}`, borderRadius:8, padding:'10px 12px', fontSize:14, color:C.tx }} />
            </div>
          ))}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, color:C.mu, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>罐颜色</div>
            <div style={{ display:'flex', gap:8 }}>
              {TCOLS.map(col => (
                <button key={col} onClick={()=>setColor(col)} style={{ width:28, height:28, borderRadius:'50%', background:col, border: col===color?`3px solid ${C.tx}`:'3px solid transparent', cursor:'pointer', padding:0 }} />
              ))}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, color:C.mu, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>入罐日期</div>
            <input type="date" value={startStr} onChange={e=>handleStartChange(e.target.value)}
              style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${C.bd}`, borderRadius:8, padding:'10px 12px', fontSize:14, color:C.tx }} />
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:C.mu, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>节点排期</div>
            {STEPS.map(s => (
              <div key={s.k} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:s.c, flexShrink:0 }} />
                <span style={{ fontSize:12, color:C.tx, width:60 }}>{s.n}</span>
                <input type="date" value={plan[s.k]||''} onChange={e=>setPlan(prev=>({...prev,[s.k]:e.target.value}))}
                  disabled={s.fixed}
                  style={{ flex:1, background:s.fixed?C.fa:'#fff', border:`1px solid ${C.bd}`, borderRadius:8, padding:'6px 10px', fontSize:13, color:C.tx }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ position:'sticky', bottom:0, background:C.card, padding:'10px 18px 24px', borderTop:`1px solid ${C.bd}` }}>
          <button onClick={submit}
            style={{ width:'100%', padding:15, borderRadius:12, fontSize:15, fontWeight:700, background:C.g, color:'#fff', border:'none', cursor:'pointer' }}>
            创建批次
          </button>
        </div>
      </div>
    </div>
  )
}
