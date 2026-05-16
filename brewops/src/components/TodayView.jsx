import { STEPS, C } from '../constants.js'
import { stepStatus, fmtD, diffD, tod } from '../utils.js'

export default function TodayView({ batches, todayT, tomT, soonT, onLog, onEdit }) {
  return (
    <div>
      {!todayT.length && !tomT.length && !soonT.length && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:C.mu }}>
          <div style={{ fontSize:36, marginBottom:10 }}>✓</div>
          <div style={{ fontSize:15, fontWeight:600, color:C.g, marginBottom:4 }}>今日无待处理任务</div>
          <div style={{ fontSize:13 }}>所有操作已完成或尚未到期</div>
        </div>
      )}
      {todayT.length > 0 && <TaskSection label="今天" accent={C.red} tasks={todayT} urgent onLog={onLog} />}
      {tomT.length  > 0 && <TaskSection label="明天" accent={C.amb} tasks={tomT} onLog={onLog} />}
      {soonT.length > 0 && <TaskSection label="近期" accent={C.mu}  tasks={soonT} onLog={onLog} />}
      <div style={{ padding:'18px 16px 6px' }}>
        <div style={{ fontSize:10, color:C.mu, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:10 }}>所有发酵罐</div>
      </div>
      {batches.map(batch => {
        const total = STEPS.length
        const done  = batch.logs.filter(l => !l.is_defer).length
        const next  = STEPS.find(s => { const st = stepStatus(batch.plan[s.k]); return st==='today'||st==='tomorrow'||st==='soon' })
        const dayIn = batch.plan.tank_in ? diffD(tod(), new Date(batch.plan.tank_in)) : 0
        const ferDay = dayIn <= 0 ? Math.abs(dayIn) : null
        return (
          <div key={batch.id} style={{ margin:'0 16px 8px', background:C.card, border:`1px solid ${C.bd}`, borderRadius:14, padding:'14px 16px', cursor:'pointer' }}
            onClick={()=>onEdit(batch)}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ width:9, height:9, borderRadius:'50%', background:batch.color, flexShrink:0 }} />
              <span style={{ fontSize:15, fontWeight:700 }}>{batch.tank}</span>
              <span style={{ fontSize:12, color:C.mu }}>{batch.beer}</span>
              {ferDay !== null && <span style={{ marginLeft:'auto', fontSize:11, color:C.mu }}>D+{ferDay}</span>}
            </div>
            <div style={{ height:4, background:C.fa, borderRadius:2, marginBottom:8 }}>
              <div style={{ height:'100%', width:`${Math.round(done/total*100)}%`, background:batch.color, borderRadius:2 }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:C.mu }}>{next ? '下步：'+next.n+' '+fmtD(batch.plan[next.k]) : '完成所有步骤'}</span>
              <span style={{ fontSize:11, color:'#bbb' }}>{done}/{total}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskSection({ label, accent, tasks, urgent, onLog }) {
  return (
    <div style={{ paddingTop:16 }}>
      <div style={{ padding:'0 16px 8px', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background:accent }} />
        <span style={{ fontSize:11, fontWeight:700, color:accent, letterSpacing:'0.06em', textTransform:'uppercase' }}>{label}</span>
      </div>
      {tasks.map(({ batch, step, done }, i) => {
        const log = batch.logs.find(l => l.step_key === step.k)
        return (
          <div key={i} style={{ margin:'0 16px 8px', background:C.card, border:`1px solid ${done?C.bd:urgent?step.c+'55':C.bd}`, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flexShrink:0, width:38, height:38, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, background:step.c+'15', color:step.c }}>
              {done ? '✓' : '○'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:15, fontWeight:700, color:done?'#aaa':C.tx }}>{step.n}</span>
                {done && <span style={{ fontSize:11, color:C.g, fontWeight:600, background:'#e8f5f0', padding:'1px 7px', borderRadius:8 }}>已完成</span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:batch.color }} />
                <span style={{ fontSize:12, color:C.mu }}>{batch.tank} · {batch.beer}</span>
              </div>
              {log && <div style={{ marginTop:4, fontSize:11, color:'#bbb' }}>{log.operator}{log.temp?' · '+log.temp+'°C':''}</div>}
            </div>
            <button onClick={()=>onLog(batch, step)}
              style={{ flexShrink:0, padding:'9px 16px', borderRadius:10, fontSize:13, fontWeight:700, border:'none',
                background: done?C.fa : urgent?step.c:C.fa,
                color: done?'#aaa' : urgent?'#fff':'#555' }}>
              {done ? '重填' : '执行'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
