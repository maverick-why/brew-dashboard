import { useState, useEffect } from 'react'
import { C } from '../constants.js'

export default function BlinkPill({ label, color, mode, onClick }) {
  const [bright, setBright] = useState(true)
  useEffect(() => {
    if (mode !== 'urgent' && mode !== 'tomorrow') return
    const spd = mode === 'urgent' ? 550 : 1100
    const id = setInterval(() => setBright(v => !v), spd)
    return () => clearInterval(id)
  }, [mode])

  const styles = {
    urgent:   { bg:color,       text:'#fff', border:color,      scale:bright?1:0.88, opacity:bright?1:0.45 },
    tomorrow: { bg:color+'22',  text:color,  border:color+'88', scale:bright?1:0.96, opacity:bright?1:0.6  },
    soon:     { bg:color+'15',  text:color,  border:color+'44', scale:1, opacity:1 },
    done:     { bg:'#00000008', text:'#aaa', border:C.bd,       scale:1, opacity:1 },
    logged:   { bg:color+'22',  text:color,  border:color+'66', scale:1, opacity:1 },
    future:   { bg:color+'15',  text:color,  border:color+'44', scale:1, opacity:1 },
  }[mode] || { bg:color+'15', text:color, border:color+'44', scale:1, opacity:1 }

  return (
    <span onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      padding:'2px 6px', borderRadius:10,
      background:styles.bg, color:styles.text, border:`1px solid ${styles.border}`,
      fontSize:9, fontWeight:700, whiteSpace:'nowrap', cursor:'pointer',
      transform:`scale(${styles.scale})`, opacity:styles.opacity, transition:'none',
      userSelect:'none', lineHeight:1.5,
      boxShadow: mode==='urgent' && bright ? `0 0 0 4px ${color}33` : 'none',
    }}>
      {mode === 'logged' ? '✓ '+label : label}
    </span>
  )
}
