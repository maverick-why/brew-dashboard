import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from './useAuth.jsx'

const BreweryCtx = createContext(null)

export function BreweryProvider({ children }) {
  const { user } = useAuth()
  const [brewery, setBrewery]         = useState(null)
  const [role, setRole]               = useState(null)
  const [members, setMembers]         = useState([])
  const [pendingMember, setPending]   = useState(null)   // 待接受邀请的成员信息
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    if (!user) { setBrewery(null); setRole(null); setPending(null); setLoading(false); return }
    load()
  }, [user?.id])

  async function load() {
    setLoading(true)
    const { data: mem } = await supabase
      .from('brewery_members')
      .select('id, role, brewery_id, display_name, status')
      .eq('user_id', user.id)
      .in('status', ['active', 'pending'])
      .maybeSingle()

    // 未关联任何酒厂 → 走建厂流程
    if (!mem) { setBrewery(null); setRole(null); setPending(null); setLoading(false); return }

    // 待接受邀请 → 走 AcceptInvitePage 流程
    if (mem.status === 'pending') {
      const { data: b } = await supabase.from('breweries').select('id,name,slug').eq('id', mem.brewery_id).maybeSingle()
      setPending({ ...mem, breweryName: b?.name ?? '' })
      setBrewery(null); setRole(null); setLoading(false); return
    }

    setPending(null)
    setRole(mem.role)

    const { data: b, error: bErr } = await supabase
      .from('breweries')
      .select('id, name, slug')
      .eq('id', mem.brewery_id)
      .maybeSingle()


    setBrewery(b)

    const { data: all } = await supabase
      .from('brewery_members')
      .select('id, display_name, role, status, user_id')
      .eq('brewery_id', mem.brewery_id)   // 显式 scope，不只依赖 RLS
    setMembers(all ?? [])
    setLoading(false)
  }

  async function createBrewery(name, slug, displayName) {
    const breweryId = crypto.randomUUID()

    const { error: be } = await supabase
      .from('breweries')
      .insert({ id: breweryId, name, slug })
    if (be) throw be

    const { error: me } = await supabase
      .from('brewery_members')
      .insert({ brewery_id: breweryId, user_id: user.id, role: 'owner', display_name: displayName, status: 'active' })
    if (me) throw me

    await load()
  }

  async function acceptInvite(displayName) {
    const { error } = await supabase
      .from('brewery_members')
      .update({ status: 'active', display_name: displayName })
      .eq('id', pendingMember.id)
    if (error) throw error
    await load()
  }

  async function removeMember(memberId) {
    const { error } = await supabase.from('brewery_members').delete().eq('id', memberId)
    if (error) throw error
    setMembers(prev => prev.filter(m => m.id !== memberId))
  }

  return (
    <BreweryCtx.Provider value={{ brewery, role, members, pendingMember, loading, createBrewery, acceptInvite, removeMember, reload: load }}>
      {children}
    </BreweryCtx.Provider>
  )
}

export const useBrewery = () => useContext(BreweryCtx)
