import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export function useBatches(breweryId) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!breweryId) return
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
      Object.entries(plan).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0,10) : v])
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
        Object.entries(update.plan).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0,10) : v])
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
    const { data, error } = isDefer
      ? await supabase.from('batch_logs').insert(row).select().single()
      : await supabase.from('batch_logs').upsert(row, { onConflict: 'batch_id,step_key', ignoreDuplicates: false }).select().single()
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

  async function deferStep({ batchId, stepKey, newDate, note }) {
    await saveLog({ batchId, stepKey: `_defer_${stepKey}`, operator: '', ts: Date.now(), note, isDefer: true })
    await updateBatch(batchId, {
      plan: { ...(batches.find(b=>b.id===batchId)?.plan ?? {}), [stepKey]: newDate }
    })
  }

  return { batches, loading, addBatch, updateBatch, archiveBatch, saveLog, deferStep }
}
