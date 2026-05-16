import { useState, useMemo } from 'react'
import { STEPS, C } from '../constants.js'
import { fmtTs, tod } from '../utils.js'

function ymd(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function LogsView({ batches }) {
  const today = tod()
  const [calYear,  setCalYear]  = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState(null)
  const [selOp,    setSelOp]    = useState(null)

  const all = useMemo(() => {
    const arr = []
    batches.forEach(b => {
      b.logs.filter(l => !l.is_defer).forEach(l => {
        const s = STEPS.find(x => x.k === l.step_key)
        arr.push({ ...l, tank:b.tank, beer:b.beer, bColor:b.color, sLabel:s?.n||l.step_key, sColor:s?.c||C.mu })
      })
    })
    return arr.sort((a, b) => b.ts - a.ts)
  }, [batches])

  const operators = useMemo(() => [...new Set(all.map(l => l.operator).filter(Boolean))].sort(), [all])

  const activeDays = useMemo(() => new Set(
    (selOp ? all.filter(l => l.operator === selOp) : all).map(l => ymd(l.ts))
  ), [all, selOp])

  const filtered = all
    .filter(l => !selected || ymd(l.ts) === selected)
    .filter(l => !selOp    || l.operator === selOp)

  const firstDay    = new Date(calYear, calMonth, 1)
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const startDow    = firstDay.getDay()
  const todayStr    = ymd(today.getTime())

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y-1); setCalMonth(11) }
    else setCalMonth(m => m-1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y+1); setCalMonth(0) }
    else setCalMonth(m => m+1)
  }

  return (
    <div style={{ maxWidth:700, margin:'0 auto' }}>

      {/* 上半部分：日历 + 筛选 */}
      <div style={{ display:'flex', gap:10, padding:'12px 16px 0', alignItems:'flex-start' }}>

        {/* 左：紧凑日历 */}
        <div style={{ background:C.card, border:`1px solid ${C.bd}`, borderRadius:12, padding:'8px 8px 6px', flexShrink:0 }}>
          {/* 月份导航 */}
          <div style={{ display:'flex', alignItems:'center', marginBottom:5 }}>
            <button onClick={prevMonth} style={{ background:'none', border:'none', fontSize:14, color:C.mu, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>‹</button>
            <span style={{ flex:1, textAlign:'center', fontSize:11, fontWeight:700, color:C.tx, whiteSpace:'nowrap' }}>
              {calYear}/{calMonth+1}
            </span>
            <button onClick={nextMonth} style={{ background:'none', border:'none', fontSize:14, color:C.mu, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>›</button>
          </div>

          {/* 日期格子，无星期头 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1 }}>
            {Array.from({ length: startDow }, (_, i) => <div key={'e'+i} style={{ width:22, height:22 }} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const key = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const isToday  = key === todayStr
              const isActive = activeDays.has(key)
              const isSel    = selected === key
              const dotColors = [...new Set(all.filter(l => ymd(l.ts) === key && (!selOp || l.operator === selOp)).map(l => l.bColor))]
              return (
                <div key={key} onClick={() => isActive && setSelected(isSel ? null : key)}
                  style={{
                    width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center',
                    borderRadius:5, cursor: isActive ? 'pointer' : 'default', position:'relative',
                    background: isSel ? C.g : isActive ? C.g+'18' : 'transparent',
                    border: isToday ? `1.5px solid ${C.g}` : '1.5px solid transparent',
                  }}>
                  <span style={{ fontSize:10, fontWeight: isToday||isSel?700:400, color: isSel?'#fff': isToday?C.g : isActive?C.tx : '#ccc', lineHeight:1 }}>
                    {day}
                  </span>
                  {isActive && !isSel && (
                    <span style={{ position:'absolute', bottom:1, left:'50%', transform:'translateX(-50%)', width: Math.min(dotColors.length,3)*5, height:3, borderRadius:2, background: dotColors[0] || C.g }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 右：筛选条件 */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:10, color:C.mu, marginBottom:6, letterSpacing:'0.05em', textTransform:'uppercase' }}>操作者</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {operators.length === 0 && <span style={{ fontSize:12, color:'#ccc' }}>暂无数据</span>}
            {operators.map(op => (
              <button key={op} onClick={() => setSelOp(selOp === op ? null : op)}
                style={{
                  padding:'5px 14px', borderRadius:16, fontSize:12, fontWeight:600, cursor:'pointer',
                  border:`1px solid ${selOp===op ? C.g : C.bd}`,
                  background: selOp===op ? C.g : C.card,
                  color: selOp===op ? '#fff' : C.tx,
                }}>{op}</button>
            ))}
          </div>

          {(selected || selOp) && (
            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              {selected && (
                <span style={{ fontSize:11, background:C.g+'18', color:C.g, padding:'3px 10px', borderRadius:10, fontWeight:600 }}>
                  📅 {selected}
                </span>
              )}
              {selOp && (
                <span style={{ fontSize:11, background:'#37a+'+'18', color:C.tx, padding:'3px 10px', borderRadius:10, border:`1px solid ${C.bd}`, fontWeight:600 }}>
                  👤 {selOp}
                </span>
              )}
              <span style={{ fontSize:11, color:C.mu }}>{filtered.length} 条记录</span>
              <button onClick={() => { setSelected(null); setSelOp(null) }}
                style={{ fontSize:11, color:C.mu, background:'none', border:`1px solid ${C.bd}`, borderRadius:8, padding:'3px 10px', cursor:'pointer' }}>
                清除
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 分隔线 */}
      <div style={{ margin:'12px 16px 0', borderTop:`1px solid ${C.bd}` }} />

      {/* 下半部分：搜索结果 */}
      <div>
        {!filtered.length ? (
          <div style={{ textAlign:'center', padding:'40px 20px', color:C.mu, fontSize:13 }}>
            {(selected || selOp) ? '当前筛选条件下暂无记录' : '暂无操作记录'}
          </div>
        ) : filtered.map(l => (
          <div key={l.id} style={{ padding:'12px 16px', borderBottom:`1px solid ${C.bd}`, background:C.card, marginBottom:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:l.bColor, flexShrink:0 }} />
              <span style={{ fontSize:13, fontWeight:700 }}>{l.tank}</span>
              <span style={{ fontSize:11, color:C.mu }}>{l.beer}</span>
              <span style={{ marginLeft:'auto', fontSize:11, color:'#bbb', flexShrink:0 }}>{fmtTs(l.ts)}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:(l.note||l.temp||l.brix||l.ph)?5:0 }}>
              <span style={{ fontSize:11, padding:'2px 9px', borderRadius:11, background:l.sColor+'18', color:l.sColor, fontWeight:600, border:`1px solid ${l.sColor}33` }}>{l.sLabel}</span>
              <span style={{ fontSize:12, color:C.mu }}>by <span style={{ color:C.tx, fontWeight:500 }}>{l.operator}</span></span>
            </div>
            {(l.temp||l.brix||l.ph) && (
              <div style={{ display:'flex', gap:12, marginBottom:l.note?4:0, fontSize:11, color:C.mu }}>
                {l.temp && <span>🌡 {l.temp}°C</span>}
                {l.brix && <span>◉ {l.brix} Brix</span>}
                {l.ph   && <span>pH {l.ph}</span>}
              </div>
            )}
            {l.note && <div style={{ fontSize:12, color:'#777', lineHeight:1.5 }}>{l.note}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
