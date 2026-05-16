import { useState, useRef, useEffect } from 'react'
import { STEPS, C } from '../constants.js'
import { stepStatus, addD, diffD, fmtD, tod } from '../utils.js'
import BlinkPill from './BlinkPill.jsx'

export default function GanttView({ batches, ganttStart, ganttDays, setGanttStart, setGanttDays, onLog, onEdit, onReschedule }) {
  const containerRef = useRef(null)
  const [containerW, setContainerW] = useState(window.innerWidth)
  const [dragOver, setDragOver] = useState(null) // { dayOffset }

  function xToDayOffset(clientX) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const dropX = clientX - rect.left - 4
    const svgW = rect.width - 8
    const dropXSvg = (dropX / svgW) * TOTAL_W
    return Math.round((dropXSvg - LW) / cw)
  }

  function handleDragOver(e) {
    e.preventDefault()
    const offset = xToDayOffset(e.clientX)
    if (offset === null) return
    const hoverDate = addD(ganttStart, offset)
    if (diffD(tod(), hoverDate) < 0) { setDragOver(null); return }  // 过去日期不响应
    setDragOver(offset)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(null)
    try {
      const { batchId, stepKey } = JSON.parse(e.dataTransfer.getData('text/plain'))
      const offset = xToDayOffset(e.clientX)
      if (offset === null) return
      const newDate = addD(ganttStart, offset)
      if (diffD(tod(), newDate) < 0) return   // 不允许拖到今天之前
      onReschedule(batchId, stepKey, newDate)
    } catch {}
  }
  useEffect(() => {
    const obs = new ResizeObserver(e => setContainerW(e[0].contentRect.width))
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])
  const LW = 90, TOTAL_W = Math.max(containerW - 8, 300), CHART_W = TOTAL_W - LW
  const cw = CHART_W / ganttDays
  const ROW_H = 62, HDR_H = 34
  const BAR_Y_IN_ROW = 42
  const totalH = HDR_H + batches.length * ROW_H + 4
  const todayX = LW + diffD(ganttStart, tod()) * cw

  return (
    <div>
      {/* Controls */}
      <div style={{ display:'flex', alignItems:'center', gap:4, padding:'10px 14px', borderBottom:`1px solid ${C.bd}`, background:C.bg, flexWrap:'wrap' }}>
        {[['⬅️⬅️', ()=>setGanttStart(s=>addD(s,-7)), '往前7天'], ['⬅️', ()=>setGanttStart(s=>addD(s,-1)), '往前1天'],
          ['今日', ()=>setGanttStart(addD(tod(),-4)), '回到今日'],
          ['➡️', ()=>setGanttStart(s=>addD(s,1)), '往后1天'], ['➡️➡️', ()=>setGanttStart(s=>addD(s,7)), '往后7天']
        ].map(([l, fn, title]) => (
          <button key={l} onClick={fn} title={title} style={{ background:C.card, border:`1px solid ${C.bd}`, borderRadius:7, padding:'5px 9px', color:'#555', fontSize:13 }}>{l}</button>
        ))}
        <span style={{ flex:1 }} />
        {[['+', ()=>setGanttDays(d=>Math.max(10,d-4))], ['−', ()=>setGanttDays(d=>Math.min(35,d+4))]].map(([l, fn]) => (
          <button key={l} onClick={fn} style={{ background:C.card, border:`1px solid ${C.bd}`, borderRadius:7, padding:'5px 9px', color:'#555', fontSize:12 }}>{l}</button>
        ))}
      </div>

      {/* SVG Gantt */}
      <div ref={containerRef} style={{ overflowX:'hidden', padding:'0 4px' }}
        onDragOver={handleDragOver} onDragLeave={()=>setDragOver(null)} onDrop={handleDrop}>
        <svg width="100%" viewBox={`0 0 ${TOTAL_W} ${totalH}`} style={{ display:'block' }}>
          <rect width={TOTAL_W} height={totalH} fill={C.bg} />
          <rect x={LW} y={0} width={CHART_W} height={HDR_H} fill={C.fa} />
          <text x={4} y={22} fontSize={10} fill={C.mu}>发酵罐</text>

          {Array.from({ length:ganttDays }, (_, i) => {
            const dd = addD(ganttStart, i)
            const x = LW + i * cw
            const isT = diffD(dd, tod()) === 0
            const isWE = dd.getDay() === 0 || dd.getDay() === 6
            const show = ganttDays <= 18 || i % 2 === 0
            return (
              <g key={i}>
                {isWE && <rect x={x} y={0} width={cw} height={totalH} fill="#00000007" />}
                {isT  && <rect x={x} y={0} width={cw} height={totalH} fill="#1D9E7508" />}
                <line x1={x} y1={0} x2={x} y2={totalH} stroke={C.bd} strokeWidth={0.5} />
                {show && <>
                  <text x={x+cw/2} y={13} textAnchor="middle" fontSize={9} fill={isT?'#1D9E75':C.mu} fontWeight={isT?'700':'400'}>
                    {`${dd.getMonth()+1}/${dd.getDate()}`}
                  </text>
                  <text x={x+cw/2} y={27} textAnchor="middle" fontSize={8} fill={isT?'#1D9E75':'#bbb'}>
                    {['日','一','二','三','四','五','六'][dd.getDay()]}
                  </text>
                </>}
              </g>
            )
          })}

          {todayX >= LW && todayX <= TOTAL_W && (
            <line x1={todayX} y1={0} x2={todayX} y2={totalH} stroke="#1D9E75" strokeWidth={1.5} strokeDasharray="4,3" />
          )}
          {dragOver !== null && (() => {
            const dx = LW + dragOver * cw
            return dx >= LW && dx <= TOTAL_W ? (
              <g>
                <line x1={dx} y1={0} x2={dx} y2={totalH} stroke="#4A90E2" strokeWidth={2} strokeDasharray="5,3" />
                <rect x={dx-20} y={2} width={40} height={16} rx={4} fill="#4A90E2" opacity={0.9} />
                <text x={dx} y={13} textAnchor="middle" fontSize={9} fill="#fff" fontWeight="700">
                  {(() => { const d = addD(ganttStart, dragOver); return `${d.getMonth()+1}/${d.getDate()}` })()}
                </text>
              </g>
            ) : null
          })()}

          {batches.map((batch, ri) => {
            const ry = HDR_H + ri * ROW_H
            const barY = ry + BAR_Y_IN_ROW
            const mDs = STEPS.map(s => batch.plan[s.k]).filter(Boolean).map(d => new Date(d))
            const bx0 = mDs.length ? LW + diffD(ganttStart, mDs.reduce((a,c)=>a<c?a:c)) * cw : LW
            const bx1 = mDs.length ? LW + diffD(ganttStart, mDs.reduce((a,c)=>a>c?a:c)) * cw : LW
            return (
              <g key={batch.id}>
                <rect x={0} y={ry} width={TOTAL_W} height={ROW_H} fill={ri%2===0?C.card:C.fa} />
                <line x1={0} y1={ry+ROW_H} x2={TOTAL_W} y2={ry+ROW_H} stroke={C.bd} strokeWidth={0.5} />
                {/* 可点击标签区底色 */}
                <rect x={0} y={ry+1} width={LW-1} height={ROW_H-2} rx={6} fill={batch.color+'12'} />
                {/* 发酵罐图标 */}
                <g transform={`translate(7, ${ry+10})`}>
                  {/* 罐顶盖 */}
                  <ellipse cx={13} cy={4} rx={9} ry={3} fill={batch.color+'55'} stroke={batch.color} strokeWidth={1} />
                  {/* 罐身 */}
                  <rect x={4} y={4} width={18} height={22} rx={3} fill={batch.color+'22'} stroke={batch.color} strokeWidth={1} />
                  {/* 罐底弧 */}
                  <ellipse cx={13} cy={26} rx={9} ry={3} fill={batch.color+'33'} stroke={batch.color} strokeWidth={1} />
                  {/* 出料口 */}
                  <rect x={10} y={28} width={6} height={4} rx={1} fill={batch.color+'66'} />
                  {/* 完成勾 */}
                  {batch.logs.length > 0 && <text x={13} y={19} textAnchor="middle" fontSize={9} fill={batch.color} fontWeight="800">✓</text>}
                </g>
                <text x={32} y={ry+22} fontSize={11} fontWeight="700" fill={C.tx}>{batch.tank}</text>
                <text x={32} y={ry+35} fontSize={8} fill={C.mu}>{batch.beer.length>7?batch.beer.slice(0,7)+'…':batch.beer}</text>
                <rect x={0} y={ry} width={LW} height={ROW_H} fill="transparent" style={{ cursor:'pointer' }} onClick={()=>onEdit(batch)} />
                {bx1 > bx0 && Math.min(TOTAL_W,bx1)-Math.max(LW,bx0) > 0 && (
                  <rect x={Math.max(LW,bx0)} y={barY-2} width={Math.min(TOTAL_W,bx1)-Math.max(LW,bx0)} height={4} rx={2} fill={batch.color} opacity={0.15} />
                )}
              </g>
            )
          })}
        </svg>

        {/* Pill overlay */}
        <div style={{ position:'relative', marginTop:`-${totalH}px`, height:totalH, pointerEvents:'none' }}>
          <svg width="100%" viewBox={`0 0 ${TOTAL_W} ${totalH}`} style={{ position:'absolute', top:0, left:0, width:'100%', overflow:'visible' }}>
            {batches.map((batch, ri) => {
              const ry = HDR_H + ri * ROW_H
              const barY = ry + BAR_Y_IN_ROW
              return STEPS.map(s => {
                const mDate = batch.plan[s.k]; if (!mDate) return null
                const mx = LW + diffD(ganttStart, new Date(mDate)) * cw
                if (mx < LW - 4 || mx > TOTAL_W + 4) return null
                return <g key={s.k}><line x1={mx} y1={barY-2} x2={mx} y2={barY-16} stroke={s.c} strokeWidth={0.8} opacity={0.3} /></g>
              })
            })}
          </svg>

          {batches.map((batch, ri) => {
            const ry = HDR_H + ri * ROW_H
            const barY = ry + BAR_Y_IN_ROW
            return STEPS.map(s => {
              const mDate = batch.plan[s.k]; if (!mDate) return null
              const mx = LW + diffD(ganttStart, new Date(mDate)) * cw
              if (mx < LW - 2 || mx > TOTAL_W + 2) return null
              const st = stepStatus(mDate)
              const log = batch.logs.find(l => l.step_key === s.k && !l.is_defer)
              const mode = log ? 'logged' : st==='today' ? 'urgent' : st==='tomorrow' ? 'tomorrow' : st==='soon' ? 'soon' : st==='overdue' ? 'done' : 'future'
              const leftPct = (mx / TOTAL_W * 100) + '%'
              const topPx = barY - 28
              const scaledTop = (topPx / totalH * 100) + '%'
              const canDrag = !s.fixed && !log   // fixed节点或已完成节点不可拖拽
              return (
                <div key={batch.id+s.k}
                  draggable={canDrag}
                  onDragStart={canDrag ? e => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ batchId: batch.id, stepKey: s.k }))
                    e.dataTransfer.effectAllowed = 'move'
                  } : undefined}
                  style={{ position:'absolute', left:`calc(${leftPct} - 0px)`, top:scaledTop, transform:'translateX(-50%)', pointerEvents:'all', zIndex:2, cursor: canDrag ? 'grab' : 'default' }}>
                  <BlinkPill label={s.s} color={s.c} mode={mode} onClick={()=>onLog(batch, s)} />
                </div>
              )
            })
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding:'10px 16px', display:'flex', flexWrap:'wrap', gap:'5px 12px' }}>
        {[{bg:'#1D9E7522',border:'#1D9E7566',label:'已完成 ✓'},
          {bg:'#E24B4A',border:'#E24B4A',label:'今日（闪烁）',text:'#fff'},
          {bg:'#BA751722',border:'#BA751788',label:'明日（闪烁）'},
          {bg:'#1D9E7515',border:'#1D9E7544',label:'待操作'},
        ].map(({bg,border,label,text})=>(
          <span key={label} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10, color:C.mu }}>
            <span style={{ display:'inline-block', width:22, height:11, borderRadius:6, background:bg, border:`1px solid ${border}` }} />
            <span style={{ color:C.mu }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
