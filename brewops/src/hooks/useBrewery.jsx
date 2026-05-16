import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from './useAuth.jsx'

const BreweryCtx = createContext(null)

export function BreweryProvider({ children }) {
  const { user } = useAuth()
  const [brewery, setBrewery]   = useState(null)
  const [role, setRole]         = useState(null)
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!user) { setBrewery(null); setRole(null); setLoading(false); return }
    load()
  }, [user])

  async function load() {
    setLoading(true)
    const { data: mem } = await supabase
      .from('brewery_members')
      .select('role, brewery_id, display_name, breweries(id, name, slug)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!mem) { setBrewery(null); setRole(null); setLoading(false); return }

    setRole(mem.role)
    setBrewery(mem.breweries)

    const { data: all } = await supabase
      .from('brewery_members')
      .select('id, display_name, role, status, user_id')
    setMembers(all ?? [])
    setLoading(false)
  }

  async function createBrewery(name, slug, displayName) {
    const { data: b, error: be } = await supabase
      .from('breweries')
      .insert({ name, slug })
      .select()
      .single()
    if (be) throw be

    const { error: me } = await supabase
      .from('brewery_members')
      .insert({ brewery_id: b.id, user_id: user.id, role: 'owner', display_name: displayName, status: 'active' })
    if (me) throw me

    await load()
  }

  async function removeMember(memberId) {
    const { error } = await supabase.from('brewery_members').delete().eq('id', memberId)
    if (error) throw error
    setMembers(prev => prev.filter(m => m.id !== memberId))
  }

  return (
    <BreweryCtx.Provider value={{ brewery, role, members, loading, createBrewery, removeMember, reload: load }}>
      {children}
    </BreweryCtx.Provider>
  )
}

export const useBrewery = () => useContext(BreweryCtx)
