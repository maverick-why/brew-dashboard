import { useState } from 'react'
import { C } from '../constants.js'
import { fmtFull, parseD } from '../utils.js'

export default function LogSheet({ logForm, ops, onSave, onClose }) {
  const { batch, step } = logForm
  const [op, setOp]     = useState(logForm.op)
  const [note, setNote] = useState(logForm.note)
  const [temp, setTemp] = useState(logForm.temp)
  const [brix, setBrix] = useState(logForm.brix)
  const [ph, setPh]     = useState(logForm.ph)
  const [mDate, setMDate] = useState(fmtFull(batch.plan[step.k]))

  function submit() {
    onSave({ stepKey: step.k, operator: op, ts: Date.now(), temp, brix, ph, note, newDate: parseD(mDate) })
  }

  return (
    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', zIndex:100, display:'flex', alignItems:'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width:'100%', maxHeight:'88%', overflowY:'auto', background:C.card, borderRadius:'20px 20px 0 0', paddingBottom:28 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0' }}>
          <div style={{ width:32, height:4, borderRadius:2, background:C.bd }} />
        </div>
        <div style={{ padding:'14px 18px 12px', borderBottom:`1px solid ${C.bd}`, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:step.c+'18', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, color:step.c }}>{step.s}</div>
          <div>
            <div style={{ fontSize:16, fontWeight:700 }}>{step.n}</div>
            <div style={{ fontSize:12, color:C.mu, marginTop:1 }}>{batch.tank} · {batch.beer}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:'auto', fontSize:22, color:'#aaa', background:'none', border:'none', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:'16px 18px 0' }}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:C.mu, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>执行日期</div>
            <input type="date" value={mDate} onChange={e=>setMDate(e.target.value)}
              style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${C.bd}`, borderRadius:8, padding:'10px 12px', fontSize:14, color:C.tx }} />
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:C.mu, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>操作人</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {ops.map(name => (
                <button key={name} onClick={()=>setOp(name)}
                  style={{ padding:'8px 16px', borderRadius:20, fontSize:13, fontWeight:500,
                    border:`1px solid ${op===name?step.c:C.bd}`,
                    background: op===name?step.c+'18':C.card, color:op===name?step.c:'#555' }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:C.mu, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>实测参数（选填）</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {[['温度°C',temp,setTemp],['Brix',brix,setBrix],['pH',ph,setPh]].map(([lbl,val,set]) => (
                <div key={lbl}>
                  <div style={{ fontSize:10, color:C.mu, marginBottom:4, textAlign:'center' }}>{lbl}</div>
                  <input value={val} onChange={e=>set(e.target.value)} inputMode="decimal" placeholder="—"
                    style={{ textAlign:'center', width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${C.bd}`, borderRadius:8, padding:'9px 4px', fontSize:15, color:C.tx }} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:C.mu, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>备注</div>
            <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="操作备注、异常情况…"
              style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${C.bd}`, borderRadius:8, padding:'10px 12px', fontSize:14, color:C.tx, resize:'none' }} />
          </div>
          <button onClick={submit} style={{ width:'100%', padding:15, borderRadius:12, fontSize:15, fontWeight:700, border:'none', background:step.c, color:'#fff', cursor:'pointer' }}>
            ✓ 确认完成
          </button>
        </div>
      </div>
    </div>
  )
}
