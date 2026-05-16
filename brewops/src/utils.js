export const tod = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
export const addD = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r }
export const diffD = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
export const fmtD = d => { if(!d) return '—'; const x=new Date(d); return `${x.getMonth()+1}/${x.getDate()}` }
export const fmtFull = d => { if(!d) return ''; const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}` }
export const fmtTs = ts => { const d=new Date(ts); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
export const parseD = s => { if(!s) return null; const d=new Date(s); d.setHours(0,0,0,0); return isNaN(d)?null:d }

export function stepStatus(dateVal) {
  if (!dateVal) return 'future'
  const diff = diffD(tod(), new Date(dateVal))
  if (diff < 0)  return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 3)  return 'soon'
  return 'future'
}
