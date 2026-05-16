import { useState } from 'react'
import { STEPS, C } from '../constants.js'
import { stepStatus, fmtFull, parseD } from '../utils.js'

export default function EditSheet({ batch, onSave, onDelete, onLog, onClose }) {
  const [tank, setTank]   = useState(batch.tank)
  const [beer, setBeer]   = useState(batch.beer)
  const [batchN, setBatchN] = useState(batch.batch_no || '')
  const [notes, setNotes] = useState(batch.notes || '')
  const [plan, setPlan]   = useState(
    Object.fromEntries(Object.entries(batch.plan).map(([k, v]) => [k, fmtFull(v)]))
  )

  function save() {
    const newPlan = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, parseD(v) || batch.plan[k]]))
    onSave({ ...batch, tank, beer, batch_no: batchN, notes, plan: newPlan })
  }

  return (
    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', zIndex:100, display:'flex', alignItems:'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width:'100%', maxHeight:'92%', overflowY:'auto', background:C.card, borderRadius:'20px 20px 0 0', paddingBottom:28 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0' }}>
          <div style={{ width:32, height:4, borderRadius:2, background:C.bd }} />
        </div>
        <div style={{ padding:'14px 18px 12px', borderBottom:`1px solid ${C.bd}`, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:9, height:9, borderRadius:'50%', background:batch.color }} />
          <span style={{ fontSize:17, fontWeight:700, flex:1 }}>{batch.tank} · {batch.beer}</span>
          <button onClick={onClose} style={{ fontSize:22, color:'#aaa', background:'none', border:'none', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:'14px 18px 0' }}>
          {[['发酵罐',tank,setTank],['啤酒品种',beer,setBeer],['批次号',batchN,setBatchN]].map(([lbl,val,set]) => (
            <div key={lbl} style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:C.mu, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>{lbl}</div>
              <input value={val} onChange={e=>set(e.target.value)}
                style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${C.bd}`, borderRadius:8, padding:'10px 12px', fontSize:14, color:C.tx }} />
            </div>
          ))}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, color:C.mu, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>备注</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
              style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${C.bd}`, borderRadius:8, padding:'10px 12px', fontSize:14, color:C.tx, resize:'none' }} />
          </div>
          <div style={{ fontSize:10, color:C.mu, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>节点日期</div>
          {STEPS.map(s => {
            const st = stepStatus(parseD(plan[s.k]))
            const log = batch.logs.find(l => l.step_key === s.k)
            const hl = st==='today'?'#fef2f2':st==='tomorrow'?'#fffbeb':'transparent'
            return (
              <div key={s.k} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, background:hl, borderRadius:10, padding:'7px 10px', marginLeft:-10, marginRight:-10 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:s.c, flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:12, color:s.c, fontWeight:700 }}>{s.n}</span>
                    {log && <span style={{ fontSize:10, color:C.g, background:'#e8f5f0', padding:'1px 6px', borderRadius:6 }}>✓ {log.operator}</span>}
                    {st==='today' && !log && <span style={{ fontSize:10, color:C.red, fontWeight:700 }}>今天!</span>}
                  </div>
                  <input type="date" value={plan[s.k]||''} onChange={e=>setPlan(prev=>({...prev,[s.k]:e.target.value}))}
                    style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${st==='today'?C.red+'88':C.bd}`, borderRadius:8, padding:'8px 10px', fontSize:13, color:C.tx }} />
                </div>
                <button onClick={()=>{ onClose(); setTimeout(()=>onLog(batch, s), 80) }}
                  style={{ flexShrink:0, background:C.fa, border:`1px solid ${C.bd}`, borderRadius:8, padding:'7px 10px', color:'#555', fontSize:12, cursor:'pointer' }}>记录</button>
              </div>
            )
          })}
          <div style={{ display:'flex', gap:10, marginTop:14 }}>
            <button onClick={save} style={{ flex:1, padding:14, borderRadius:12, fontSize:15, fontWeight:700, background:C.g, color:'#fff', border:'none', cursor:'pointer' }}>保存</button>
            <button onClick={()=>{ if(confirm('确认删除？')) onDelete(batch.id) }}
              style={{ padding:'14px 16px', borderRadius:12, fontSize:13, fontWeight:600, background:'#fef2f2', color:C.red, border:'1px solid #fca5a5', cursor:'pointer' }}>删除</button>
          </div>
        </div>
      </div>
    </div>
  )
}
