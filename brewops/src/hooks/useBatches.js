import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { fmtFull } from '../utils.js'

export function useBatches(breweryId) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!breweryId) { setLoading(false); setBatches([]); return }
    load()
  }, [breweryId])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('batches')
      .select('*, batch_logs(*)')
      .eq('brewery_id', breweryId)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
    if (!error) setBatches(normalize(data ?? []))
    setLoading(false)
  }

  function normalize(rows) {
    return rows.map(b => ({
      ...b,
      plan: Object.fromEntries(
        Object.entries(b.plan).map(([k, v]) => [k, v ? new Date(v) : null])
      ),
      logs: (b.batch_logs ?? []).map(l => ({ ...l, ts: new Date(l.ts).getTime() })),
    }))
  }

  async function addBatch({ tank, beer, batch_no, color, og, yeast, notes, plan }) {
    const planStr = Object.fromEntries(
      Object.entries(plan).map(([k, v]) => [k, v instanceof Date ? fmtFull(v) : v])
    )
    const { data, error } = await supabase
      .from('batches')
      .insert({ brewery_id: breweryId, tank, beer, batch_no, color, og, yeast, notes, plan: planStr })
      .select('*, batch_logs(*)')
      .single()
    if (error) throw error
    setBatches(prev => [...prev, ...normalize([data])])
  }

  async function updateBatch(id, fields) {
    const update = { ...fields }
    if (update.plan) {
      update.plan = Object.fromEntries(
        Object.entries(update.plan).map(([k, v]) => [k, v instanceof Date ? fmtFull(v) : v])
      )
    }
    const { error } = await supabase.from('batches').update(update).eq('id', id)
    if (error) throw error
    setBatches(prev => prev.map(b => b.id === id ? { ...b, ...fields } : b))
  }

  async function archiveBatch(id) {
    const { error } = await supabase.from('batches').update({ archived_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    setBatches(prev => prev.filter(b => b.id !== id))
  }

  async function saveLog({ batchId, stepKey, operator, ts, temp, brix, ph, note, newDate, isDefer }) {
    const row = {
      brewery_id: breweryId, batch_id: batchId,
      step_key: stepKey, operator, ts: new Date(ts).toISOString(),
      temp, brix, ph, note, is_defer: isDefer ?? false,
    }
    let data, error
    if (isDefer) {
      ;({ data, error } = await supabase.from('batch_logs').insert(row).select().single())
    } else {
      // 手动 upsert：先找已有记录
      const { data: ex } = await supabase.from('batch_logs')
        .select('id').eq('batch_id', batchId).eq('step_key', stepKey).eq('is_defer', false).maybeSingle()
      if (ex) {
        ;({ data, error } = await supabase.from('batch_logs').update(row).eq('id', ex.id).select().single())
      } else {
        ;({ data, error } = await supabase.from('batch_logs').insert(row).select().single())
      }
    }
    if (error) throw error

    if (newDate) await updateBatch(batchId, { plan: { ...(batches.find(b=>b.id===batchId)?.plan ?? {}), [stepKey]: newDate } })

    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b
      const logs = isDefer
        ? [...b.logs, { ...data, ts: new Date(data.ts).getTime() }]
        : [...b.logs.filter(l => l.step_key !== stepKey), { ...data, ts: new Date(data.ts).getTime() }]
      return { ...b, logs }
    }))
  }

  async function deleteLog(logId, batchId) {
    const { error } = await supabase.from('batch_logs').delete().eq('id', logId)
    if (error) throw error
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b
      return { ...b, logs: b.logs.filter(l => l.id !== logId) }
    }))
  }

  async function clearLog(batchId, stepKey) {
    // 删除该步骤的完成记录（is_defer=false），仅调整排期时调用
    const { data: ex } = await supabase.from('batch_logs')
      .select('id').eq('batch_id', batchId).eq('step_key', stepKey).eq('is_defer', false).maybeSingle()
    if (!ex) return
    const { error } = await supabase.from('batch_logs').delete().eq('id', ex.id)
    if (error) throw error
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b
      return { ...b, logs: b.logs.filter(l => !(l.step_key === stepKey && !l.is_defer)) }
    }))
  }

  async function deferStep({ batchId, stepKey, newDate, note }) {
    await saveLog({ batchId, stepKey: `_defer_${stepKey}`, operator: '', ts: Date.now(), note, isDefer: true })
    await updateBatch(batchId, {
      plan: { ...(batches.find(b=>b.id===batchId)?.plan ?? {}), [stepKey]: newDate }
    })
  }

  return { batches, loading, addBatch, updateBatch, archiveBatch, saveLog, deferStep, clearLog, deleteLog }
}
