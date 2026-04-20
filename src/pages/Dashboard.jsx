import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, Wallet, TrendingUp, TrendingDown, ArrowRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatINR } from '../utils/debtSimplifier'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [groups, setGroups] = useState([])
  const [personalTotal, setPersonalTotal] = useState(0)
  const [owedToMe, setOwedToMe] = useState(0)
  const [iOwe, setIOwe] = useState(0)
  const [recentExpenses, setRecentExpenses] = useState([])
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [groupError, setGroupError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadDashboard()
  }, [user])

  async function loadDashboard() {
    setLoading(true)
    await Promise.all([loadGroups(), loadPersonalStats(), loadBalances()])
    setLoading(false)
  }

  async function loadGroups() {
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)

    if (!memberships?.length) { setGroups([]); return }

    const groupIds = memberships.map(m => m.group_id)
    const { data: groupData } = await supabase
      .from('groups')
      .select('id, name, created_at')
      .in('id', groupIds)

    const groupsWithCounts = await Promise.all(
      (groupData ?? []).map(async (g) => {
        const { count } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', g.id)
        return { ...g, memberCount: count ?? 0 }
      })
    )
    setGroups(groupsWithCounts)
  }

  async function loadPersonalStats() {
    const now = new Date()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const { data } = await supabase
      .from('expenses')
      .select('amount')
      .is('group_id', null)
      .eq('paid_by', user.id)
      .gte('date', firstOfMonth)

    const total = (data ?? []).reduce((s, e) => s + Number(e.amount), 0)
    setPersonalTotal(total)

    const { data: recent } = await supabase
      .from('expenses')
      .select('id, amount, description, category, date, group_id')
      .eq('paid_by', user.id)
      .order('date', { ascending: false })
      .limit(5)

    setRecentExpenses(recent ?? [])
  }

  async function loadBalances() {
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)

    if (!memberships?.length) { setOwedToMe(0); setIOwe(0); return }
    const groupIds = memberships.map(m => m.group_id)

    const { data: expenses } = await supabase
      .from('expenses')
      .select('id, paid_by, amount')
      .in('group_id', groupIds)

    const { data: splits } = await supabase
      .from('expense_splits')
      .select('expense_id, user_id, amount, settled')
      .in('expense_id', (expenses ?? []).map(e => e.id))

    let owed = 0
    let owes = 0

    for (const exp of expenses ?? []) {
      if (exp.paid_by === user.id) {
        const mySplits = (splits ?? []).filter(s => s.expense_id === exp.id && s.user_id !== user.id && !s.settled)
        owed += mySplits.reduce((s, sp) => s + Number(sp.amount), 0)
      }
    }
    const mySplits = (splits ?? []).filter(s => s.user_id === user.id && !s.settled)
    for (const sp of mySplits) {
      const exp = (expenses ?? []).find(e => e.id === sp.expense_id)
      if (exp && exp.paid_by !== user.id) owes += Number(sp.amount)
    }

    setOwedToMe(owed)
    setIOwe(owes)
  }

  async function createGroup() {
    if (!newGroupName.trim()) return
    setCreating(true)
    setGroupError('')

    const { error } = await supabase
      .from('groups')
      .insert({ name: newGroupName.trim(), created_by: user.id })

    if (error) {
      setGroupError(error.message)
      setCreating(false)
      return
    }

    const { data: newGroup } = await supabase
      .from('groups')
      .select('id')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { error: memberError } = await supabase
      .from('group_members')
      .insert({ group_id: newGroup.id, user_id: user.id })

    if (memberError) {
      setGroupError(memberError.message)
      setCreating(false)
      return
    }

    setNewGroupName('')
    setShowNewGroup(false)
    setGroupError('')
    await loadGroups()
    navigate(`/groups/${group.id}`)
    setCreating(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const net = owedToMe - iOwe

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {profile?.name?.split(' ')[0]}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Here's your financial snapshot</p>
        </div>
        <button
          onClick={() => setShowNewGroup(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New group
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            You are owed
          </div>
          <p className="text-2xl font-bold text-green-600">{formatINR(owedToMe)}</p>
          <p className="text-xs text-gray-400 mt-1">across all groups</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            You owe
          </div>
          <p className="text-2xl font-bold text-red-500">{formatINR(iOwe)}</p>
          <p className="text-xs text-gray-400 mt-1">across all groups</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
            <Wallet className="w-4 h-4 text-teal-500" />
            Personal this month
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatINR(personalTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">personal expenses</p>
        </div>
      </div>

      {net !== 0 && (
        <div className={`rounded-xl border px-5 py-3 mb-6 flex items-center justify-between ${
          net > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <span className="text-sm font-medium text-gray-700">
            Overall you are {net > 0 ? 'owed' : 'in debt by'}
          </span>
          <span className={`text-lg font-bold ${net > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatINR(Math.abs(net))}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Groups */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-600" /> Groups
            </h2>
            <button onClick={() => navigate('/groups')} className="text-xs text-teal-600 hover:underline">View all</button>
          </div>
          <div className="space-y-2">
            {groups.length === 0 && (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center">
                <p className="text-gray-500 text-sm">No groups yet</p>
                <button
                  onClick={() => setShowNewGroup(true)}
                  className="mt-2 text-teal-600 text-sm font-medium hover:underline"
                >
                  Create your first group
                </button>
              </div>
            )}
            {groups.slice(0, 4).map(g => (
              <button
                key={g.id}
                onClick={() => navigate(`/groups/${g.id}`)}
                className="w-full bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:border-teal-300 hover:shadow-sm transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm">
                    {g.name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{g.name}</p>
                    <p className="text-xs text-gray-400">{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Recent expenses */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-teal-600" /> Recent activity
            </h2>
            <button onClick={() => navigate('/personal')} className="text-xs text-teal-600 hover:underline">My expenses</button>
          </div>
          <div className="space-y-2">
            {recentExpenses.length === 0 && (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center">
                <p className="text-gray-500 text-sm">No expenses yet</p>
              </div>
            )}
            {recentExpenses.map(e => (
              <div key={e.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{e.description}</p>
                  <p className="text-xs text-gray-400">{e.category} · {e.date}</p>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatINR(e.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New group modal */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Create a group</h2>
              <button onClick={() => setShowNewGroup(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="e.g. Goa Trip, Flat Rent"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createGroup()}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2"
              autoFocus
            />
            {groupError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{groupError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewGroup(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createGroup}
                disabled={creating || !newGroupName.trim()}
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
