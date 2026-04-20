import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, ArrowRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Groups() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { if (user) loadGroups() }, [user])

  async function loadGroups() {
    setLoading(true)
    const { data: memberships } = await supabase
      .from('group_members').select('group_id').eq('user_id', user.id)

    if (!memberships?.length) { setGroups([]); setLoading(false); return }

    const groupIds = memberships.map(m => m.group_id)
    const { data: groupData } = await supabase
      .from('groups').select('id, name, created_at, created_by').in('id', groupIds)

    const enriched = await Promise.all((groupData ?? []).map(async g => {
      const { count } = await supabase
        .from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', g.id)
      const { data: expData } = await supabase
        .from('expenses').select('amount').eq('group_id', g.id)
      const total = (expData ?? []).reduce((s, e) => s + Number(e.amount), 0)
      return { ...g, memberCount: count ?? 0, total }
    }))

    setGroups(enriched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
    setLoading(false)
  }

  async function createGroup() {
    if (!newName.trim()) return
    setCreating(true)

    const { error } = await supabase
      .from('groups').insert({ name: newName.trim(), created_by: user.id })

    if (error) { setCreating(false); return }

    const { data: newGroup } = await supabase
      .from('groups').select('id').eq('created_by', user.id)
      .order('created_at', { ascending: false }).limit(1).single()

    if (newGroup) {
      await supabase.from('group_members').insert({ group_id: newGroup.id, user_id: user.id })
      setNewName('')
      setShowNew(false)
      navigate(`/groups/${newGroup.id}`)
    }
    setCreating(false)
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage shared expenses with friends</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New group
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No groups yet</p>
          <p className="text-gray-400 text-sm mt-1">Create a group to start splitting expenses</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Create first group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => navigate(`/groups/${g.id}`)}
              className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-teal-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-base">
                  {g.name[0].toUpperCase()}
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 mt-1" />
              </div>
              <p className="font-semibold text-gray-900">{g.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</p>
              <p className="text-sm font-semibold text-teal-700 mt-2">
                ₹{g.total.toLocaleString('en-IN')} total
              </p>
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Create a group</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="e.g. Goa Trip, Flat Rent"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createGroup()}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={createGroup}
                disabled={creating || !newName.trim()}
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
