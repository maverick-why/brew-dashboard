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

  // 仅调整排期，不创建完成记录
  function reschedule() {
    onSave({ stepKey: step.k, rescheduleOnly: true, newDate: parseD(mDate) })
  }

  // 确认完成，创建操作记录，时间戳用填写的执行日期
  function submit() {
    const execDate = parseD(mDate)
    const ts = execDate ? execDate.getTime() : Date.now()
    onSave({ stepKey: step.k, operator: op, ts, temp, brix, ph, note, newDate: execDate })
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width:'100%', maxWidth:600, maxHeight:'90vh', overflowY:'auto', background:C.card, borderRadius:20, paddingBottom:28 }}
        onClick={e => e.stopPropagation()}>
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
            <div style={{ fontSize:10, color:C.mu, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>执行日期（调整排期或记录实际执行日）</div>
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
        </div>
        <div style={{ position:'sticky', bottom:0, background:C.card, padding:'10px 18px 24px', borderTop:`1px solid ${C.bd}` }}>
          <div style={{ display:'flex', gap:10, marginBottom:10 }}>
            <button onClick={reschedule} style={{ flex:1, padding:13, borderRadius:12, fontSize:14, fontWeight:600, border:`1px solid ${C.bd}`, background:C.fa, color:C.tx, cursor:'pointer' }}>
              📅 仅调整排期
            </button>
            <button onClick={submit} style={{ flex:1, padding:13, borderRadius:12, fontSize:14, fontWeight:700, border:'none', background:step.c, color:'#fff', cursor:'pointer' }}>
              ✓ 确认完成
            </button>
          </div>
          <div style={{ fontSize:11, color:C.mu, textAlign:'center' }}>调整排期 = 改计划日期不留记录 · 确认完成 = 已执行留下操作记录</div>
        </div>
      </div>
    </div>
  )
}
