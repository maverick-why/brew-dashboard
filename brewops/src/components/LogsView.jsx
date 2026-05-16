import { STEPS, C } from '../constants.js'
import { fmtTs } from '../utils.js'

export default function LogsView({ batches }) {
  const all = []
  batches.forEach(b => {
    b.logs.filter(l => !l.is_defer).forEach(l => {
      const s = STEPS.find(x => x.k === l.step_key)
      all.push({ ...l, tank:b.tank, beer:b.beer, bColor:b.color, sLabel:s?.n||l.step_key, sColor:s?.c||C.mu })
    })
  })
  all.sort((a, b) => b.ts - a.ts)

  if (!all.length) return <div style={{ textAlign:'center', padding:'60px 20px', color:C.mu, fontSize:14 }}>暂无操作记录</div>

  return (
    <div>
      {all.map(l => (
        <div key={l.id} style={{ padding:'14px 16px', borderBottom:`1px solid ${C.bd}`, background:C.card, marginBottom:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:l.bColor }} />
            <span style={{ fontSize:13, fontWeight:700 }}>{l.tank}</span>
            <span style={{ fontSize:11, color:C.mu }}>{l.beer}</span>
            <span style={{ marginLeft:'auto', fontSize:11, color:'#bbb' }}>{fmtTs(l.ts)}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:l.note||l.temp?6:0 }}>
            <span style={{ fontSize:11, padding:'2px 9px', borderRadius:11, background:l.sColor+'18', color:l.sColor, fontWeight:600, border:`1px solid ${l.sColor}33` }}>{l.sLabel}</span>
            <span style={{ fontSize:12, color:C.mu }}>by <span style={{ color:C.tx, fontWeight:500 }}>{l.operator}</span></span>
          </div>
          {(l.temp||l.brix||l.ph) && (
            <div style={{ display:'flex', gap:12, marginBottom:l.note?5:0, fontSize:11, color:C.mu }}>
              {l.temp && <span>🌡 {l.temp}°C</span>}
              {l.brix && <span>◉ {l.brix} Brix</span>}
              {l.ph   && <span>pH {l.ph}</span>}
            </div>
          )}
          {l.note && <div style={{ fontSize:12, color:'#777', lineHeight:1.5 }}>{l.note}</div>}
        </div>
      ))}
    </div>
  )
}
