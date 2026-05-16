import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import { useBrewery } from './hooks/useBrewery.jsx'
import { useBatches } from './hooks/useBatches.js'
import { useState } from 'react'
import LoginPage    from './pages/LoginPage.jsx'
import SetupPage    from './pages/SetupPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import GanttView    from './components/GanttView.jsx'
import TodayView    from './components/TodayView.jsx'
import LogsView     from './components/LogsView.jsx'
import LogSheet     from './components/LogSheet.jsx'
import EditSheet    from './components/EditSheet.jsx'
import AddSheet     from './components/AddSheet.jsx'
import { C, STEPS } from './constants.js'
import { addD, stepStatus, tod } from './utils.js'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/brewops/login" replace />
  return children
}

function RequireOwner({ children }) {
  const { role, loading } = useBrewery()
  if (loading) return <Spinner />
  if (role !== 'owner') return <Navigate to="/brewops" replace />
  return children
}

function Spinner() {
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:C.bg, fontSize:14, color:C.mu }}>加载中…</div>
}

function MainApp() {
  const { brewery, members, loading: breweryLoading } = useBrewery()
  const { batches, loading, addBatch, updateBatch, archiveBatch, saveLog, deferStep, clearLog, deleteLog } = useBatches(brewery?.id)
  const navigate = useNavigate()

  // ⚠️ 所有 useState 必须在任何 early return 之前
  const [view, setView]             = useState('today')
  const [logForm, setLogForm]       = useState(null)
  const [editBatch, setEditBatch]   = useState(null)
  const [addModal, setAddModal]     = useState(false)
  const [ganttStart, setGanttStart] = useState(() => addD(tod(), -4))
  const [ganttDays, setGanttDays]   = useState(18)

  if (breweryLoading) return <Spinner />
  if (!brewery) return <Navigate to="/brewops/setup" replace />

  const OPS = members.filter(m => m.status === 'active').map(m => m.display_name)

  function getTasks() {
    const today = [], tomorrow = [], soon = []
    batches.forEach(batch => {
      STEPS.forEach(s => {
        const d = batch.plan[s.k]; if (!d) return
        const st = stepStatus(d)
        const done = batch.logs.some(l => l.step_key === s.k && !l.is_defer)
        const task = { batch, step: s, date: new Date(d), st, done }
        if (st === 'today') today.push(task)
        else if (st === 'tomorrow') tomorrow.push(task)
        else if (st === 'soon') soon.push(task)
      })
    })
    return { today, tomorrow, soon }
  }

  const { today: todayT, tomorrow: tomT, soon: soonT } = getTasks()
  const urgentN = [...todayT, ...tomT].filter(t => !t.done).length

  function openLog(batch, step) {
    const ex = batch.logs.find(l => l.step_key === step.k && !l.is_defer) ?? null
    setLogForm({ batch, step,
      op:   ex?.operator ?? (OPS[0] ?? ''),
      note: ex?.note     ?? '',
      temp: ex?.temp     ?? '',
      brix: ex?.brix     ?? '',
      ph:   ex?.ph       ?? '',
    })
  }

  if (loading) return <Spinner />

  return (
    <div style={{ background:C.bg, height:'100dvh', display:'flex', flexDirection:'column', fontFamily:'system-ui,-apple-system,sans-serif', color:C.tx, position:'relative', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'18px 16px 0', background:C.bg, flexShrink:0, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:C.mu, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:2 }}>{brewery?.name}</div>
            <div style={{ fontSize:20, fontWeight:700, color:C.tx }}>发酵管理</div>
          </div>
          {urgentN > 0 && (
            <span onClick={() => setView('today')} style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:12, background:C.red, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              {urgentN} 待处理
            </span>
          )}
          <button onClick={() => navigate('/brewops/settings')}
            style={{ background:'none', border:`1px solid ${C.bd}`, borderRadius:20, padding:'7px 12px', color:C.mu, fontSize:12 }}>
            设置
          </button>
          <button onClick={() => setAddModal(true)}
            style={{ background:C.fa, border:`1px solid ${C.g}44`, borderRadius:20, padding:'7px 14px', color:C.dg, fontSize:13, fontWeight:600 }}>
            + 新增
          </button>
        </div>
        <div style={{ display:'flex', borderBottom:`1px solid ${C.bd}` }}>
          {[['today', `今日任务${urgentN > 0 ? ` (${urgentN})` : ''}`], ['gantt','总览'], ['logs','历史记录']].map(([t, lbl]) => (
            <button key={t} onClick={() => setView(t)} style={{
              flex:1, padding:'11px 0', fontSize:13, fontWeight:600, border:'none', background:'none', cursor:'pointer',
              color: view === t ? C.tx : C.mu,
              borderBottom: view === t ? `2px solid ${C.g}` : '2px solid transparent',
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', paddingBottom:20 }}>
        {view === 'today' && <TodayView batches={batches} todayT={todayT} tomT={tomT} soonT={soonT} onLog={openLog} onEdit={b => setEditBatch({ ...b })} />}
        {view === 'gantt' && <GanttView batches={batches} ganttStart={ganttStart} ganttDays={ganttDays} setGanttStart={setGanttStart} setGanttDays={setGanttDays} onLog={openLog} onEdit={b => setEditBatch({ ...b })} onReschedule={async (batchId, stepKey, newDate) => {
          const batch = batches.find(b => b.id === batchId)
          if (!batch) return
          await updateBatch(batchId, { plan: { ...batch.plan, [stepKey]: newDate } })
        }} />}
        {view === 'logs'  && <LogsView batches={batches} />}
      </div>

      {logForm   && <LogSheet   logForm={logForm} ops={OPS} onSave={async d => {
        if (d.rescheduleOnly) {
          await clearLog(logForm.batch.id, d.stepKey)   // 清除已有的完成记录
          await updateBatch(logForm.batch.id, { plan: { ...logForm.batch.plan, [d.stepKey]: d.newDate } })
        } else {
          await saveLog({ batchId: logForm.batch.id, ...d })
        }
        setLogForm(null)
      }} onClose={() => setLogForm(null)} />}
      {editBatch && <EditSheet  batch={editBatch} onSave={async u => { await updateBatch(u.id, u); setEditBatch(null) }} onDelete={async id => { await archiveBatch(id); setEditBatch(null) }} onDeleteLog={async (logId) => { await deleteLog(logId, editBatch.id); setEditBatch(b => ({ ...b, logs: b.logs.filter(l => l.id !== logId) })) }} onLog={openLog} onClose={() => setEditBatch(null)} />}
      {addModal  && <AddSheet   onAdd={async d => { await addBatch(d); setAddModal(false) }} onClose={() => setAddModal(false)} count={batches.length} />}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/brewops/login"    element={<LoginPage />} />
      <Route path="/brewops/setup"    element={<RequireAuth><SetupPage /></RequireAuth>} />
      <Route path="/brewops/settings" element={<RequireOwner><SettingsPage /></RequireOwner>} />
      <Route path="/brewops/*"        element={<RequireAuth><MainApp /></RequireAuth>} />
    </Routes>
  )
}
