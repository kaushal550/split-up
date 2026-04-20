import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, UserPlus, X, Check, ChevronDown, ChevronUp, ArrowRight, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { simplifyDebts, computeBalances, formatINR } from '../utils/debtSimplifier'


const TABS = ['Expenses', 'Balances', 'Settle up']

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [splits, setSplits] = useState([])
  const [profiles, setProfiles] = useState({})
  const [tab, setTab] = useState('Expenses')
  const [loading, setLoading] = useState(true)

  // Add expense modal state
  const [showAddExp, setShowAddExp] = useState(false)
  const [expForm, setExpForm] = useState({ description: '', amount: '', date: new Date().toISOString().split('T')[0], paidBy: '' })
  const [customSplits, setCustomSplits] = useState({})
  const [splitMode, setSplitMode] = useState('equal')
  const [selectedMembers, setSelectedMembers] = useState({})
  const [saving, setSaving] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)

  // Add member modal state
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberEmail, setMemberEmail] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [settlingIdx, setSettlingIdx] = useState(null)
  const [settlements, setSettlements] = useState([])

  useEffect(() => { if (user && id) loadAll() }, [user, id])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadGroup(), loadExpensesAndSplits(), loadSettlements()])
    setLoading(false)
  }

  async function loadSettlements() {
    const { data } = await supabase
      .from('settlements')
      .select('*')
      .eq('group_id', id)
      .order('created_at', { ascending: false })
    setSettlements(data ?? [])
  }

  async function loadGroup() {
    const { data } = await supabase.from('groups').select('*').eq('id', id).single()
    setGroup(data)

    const { data: memberData } = await supabase
      .from('group_members').select('user_id, joined_at').eq('group_id', id)

    const memberIds = (memberData ?? []).map(m => m.user_id)
    const { data: profileData } = await supabase
      .from('profiles').select('id, name, email').in('id', memberIds)

    const profileMap = {}
    for (const p of profileData ?? []) profileMap[p.id] = p
    setProfiles(profileMap)
    setMembers(memberData ?? [])
  }

  async function loadExpensesAndSplits() {
    const { data: expData } = await supabase
      .from('expenses')
      .select('*')
      .eq('group_id', id)
      .order('date', { ascending: false })

    const { data: splitData } = expData?.length
      ? await supabase.from('expense_splits').select('*').in('expense_id', expData.map(e => e.id))
      : { data: [] }

    setExpenses(expData ?? [])
    setSplits(splitData ?? [])
  }

  function openAddExpense() {
    const allSelected = members.reduce((acc, m) => { acc[m.user_id] = true; return acc }, {})
    setExpForm({
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      paidBy: user.id,
    })
    setSplitMode('equal')
    setCustomSplits({})
    setSelectedMembers(allSelected)
    setShowAddExp(true)
  }

  function toggleMember(userId) {
    setSelectedMembers(prev => {
      const next = { ...prev, [userId]: !prev[userId] }
      // always keep paidBy selected
      if (userId === expForm.paidBy) return { ...next, [userId]: true }
      return next
    })
  }

  function getActiveMemberIds() {
    return members.map(m => m.user_id).filter(id => selectedMembers[id])
  }

  function getEqualSplit(amount) {
    const active = getActiveMemberIds()
    const each = Math.round((amount / active.length) * 100) / 100
    return active.reduce((acc, id) => { acc[id] = each; return acc }, {})
  }

  function openEditExpense(expense) {
    const expSplits = splits.filter(s => s.expense_id === expense.id)
    const selMembers = {}
    const custSplits = {}
    members.forEach(m => { selMembers[m.user_id] = false })
    expSplits.forEach(s => { selMembers[s.user_id] = true; custSplits[s.user_id] = s.amount })
    setEditingExpense(expense)
    setExpForm({ description: expense.description, amount: expense.amount, date: expense.date, paidBy: expense.paid_by })
    setSplitMode('custom')
    setCustomSplits(custSplits)
    setSelectedMembers(selMembers)
    setShowAddExp(true)
  }

  async function addExpense() {
    const amount = Number(expForm.amount)
    if (!expForm.description.trim() || !amount || amount <= 0) return
    setSaving(true)

    const splitsPayload = splitMode === 'equal'
      ? Object.entries(getEqualSplit(amount)).map(([userId, amt]) => ({ user_id: userId, amount: amt, settled: false }))
      : Object.entries(customSplits).filter(([, amt]) => Number(amt) > 0).map(([userId, amt]) => ({ user_id: userId, amount: Number(amt), settled: false }))

    if (editingExpense) {
      await supabase.from('expenses').update({
        paid_by: expForm.paidBy, amount, description: expForm.description.trim(), date: expForm.date,
      }).eq('id', editingExpense.id)
      await supabase.from('expense_splits').delete().eq('expense_id', editingExpense.id)
      await supabase.from('expense_splits').insert(splitsPayload.map(s => ({ ...s, expense_id: editingExpense.id })))
    } else {
      const { data: expense, error } = await supabase.from('expenses').insert({
        group_id: id, paid_by: expForm.paidBy, amount, description: expForm.description.trim(), date: expForm.date, category: 'Group',
      }).select().single()
      if (!error && expense) {
        await supabase.from('expense_splits').insert(splitsPayload.map(s => ({ ...s, expense_id: expense.id })))
      }
    }

    setShowAddExp(false)
    setEditingExpense(null)
    await loadExpensesAndSplits()
    setSaving(false)
  }

  async function deleteExpense(expenseId) {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return
    await supabase.from('expense_splits').delete().eq('expense_id', expenseId)
    await supabase.from('expenses').delete().eq('id', expenseId)
    setExpenses(prev => prev.filter(e => e.id !== expenseId))
    setSplits(prev => prev.filter(s => s.expense_id !== expenseId))
  }

  async function deleteGroup() {
    if (!window.confirm(`Delete "${group.name}"? All expenses and data will be permanently removed.`)) return
    await supabase.from('groups').delete().eq('id', id)
    navigate('/groups')
  }

  async function addMember() {
    if (!memberEmail.trim()) return
    setAddingMember(true)
    setMemberError('')

    const { data: profileData } = await supabase
      .from('profiles').select('id, name').eq('email', memberEmail.trim().toLowerCase()).single()

    if (!profileData) {
      setMemberError('No user found with that email. They need to sign up first.')
      setAddingMember(false)
      return
    }

    const alreadyMember = members.some(m => m.user_id === profileData.id)
    if (alreadyMember) {
      setMemberError('This person is already in the group.')
      setAddingMember(false)
      return
    }

    await supabase.from('group_members').insert({ group_id: id, user_id: profileData.id })
    setMemberEmail('')
    setShowAddMember(false)
    await loadGroup()
    setAddingMember(false)
  }

  async function markSettled(splitId) {
    await supabase.from('expense_splits').update({ settled: true, settled_at: new Date().toISOString() }).eq('id', splitId)
    setSplits(prev => prev.map(s => s.id === splitId ? { ...s, settled: true } : s))
  }

  async function settleTransaction(fromId, toId, amount, idx) {
    setSettlingIdx(idx)
    const groupExpenseIds = expenses.map(e => e.id)
    const expensesPaidByFrom = expenses.filter(e => e.paid_by === fromId).map(e => e.id)

    // Settle fromId's own splits AND toId's counter-debts on fromId's expenses
    // (the simplified net payment already accounts for both sides)
    const splitsToSettle = splits.filter(s =>
      !s.settled && groupExpenseIds.includes(s.expense_id) && (
        s.user_id === fromId ||
        (s.user_id === toId && expensesPaidByFrom.includes(s.expense_id))
      )
    )
    if (splitsToSettle.length > 0) {
      const ids = splitsToSettle.map(s => s.id)
      await supabase.from('expense_splits')
        .update({ settled: true, settled_at: new Date().toISOString() })
        .in('id', ids)
      setSplits(prev => prev.map(s => ids.includes(s.id) ? { ...s, settled: true } : s))
    }
    const { data: newSettlement } = await supabase.from('settlements').insert({
      group_id: id,
      from_user_id: fromId,
      to_user_id: toId,
      amount,
    }).select().single()
    if (newSettlement) setSettlements(prev => [newSettlement, ...prev])
    setSettlingIdx(null)
  }

  // Compute balances for settle up tab
  const balances = computeBalances(expenses, splits)
  const transactions = simplifyDebts(balances)

  const memberList = members.map(m => ({ ...m, profile: profiles[m.user_id] }))
  const isCreator = group?.created_by === user.id

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!group) {
    return <div className="text-gray-500">Group not found.</div>
  }

  const myBalance = balances[user.id] ?? 0

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/groups')} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
          <p className="text-gray-500 text-sm">
            {memberList.length} member{memberList.length !== 1 ? 's' : ''} ·{' '}
            {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddMember(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Add member
          </button>
          <button
            onClick={openAddExpense}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add expense
          </button>
          {isCreator && (
            <button
              onClick={deleteGroup}
              className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* My balance banner */}
      {myBalance !== 0 && (
        <div className={`rounded-xl border px-5 py-3 mb-5 flex items-center justify-between ${
          myBalance > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <span className="text-sm text-gray-700">
            {myBalance > 0 ? 'You are owed in this group' : 'You owe in this group'}
          </span>
          <span className={`text-lg font-bold ${myBalance > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatINR(Math.abs(myBalance))}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Expenses tab */}
      {tab === 'Expenses' && (
        <div className="space-y-2">
          {expenses.length === 0 && settlements.length === 0 ? (
            <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-500">No expenses yet</p>
              <button onClick={openAddExpense} className="mt-2 text-teal-600 text-sm font-medium hover:underline">
                Add the first expense
              </button>
            </div>
          ) : (
            [
              ...expenses.map(e => ({ type: 'expense', date: e.date + 'T00:00:00', data: e })),
              ...settlements.map(s => ({ type: 'settlement', date: s.created_at, data: s })),
            ]
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map(item => {
                if (item.type === 'expense') {
                  const exp = item.data
                  return (
                    <ExpenseRow
                      key={'exp-' + exp.id}
                      expense={exp}
                      payer={profiles[exp.paid_by]}
                      splits={splits.filter(s => s.expense_id === exp.id)}
                      profiles={profiles}
                      currentUserId={user.id}
                      onEdit={openEditExpense}
                      onDelete={deleteExpense}
                    />
                  )
                }
                const s = item.data
                const fromName = profiles[s.from_user_id]?.name ?? profiles[s.from_user_id]?.email ?? 'Unknown'
                const toName = profiles[s.to_user_id]?.name ?? profiles[s.to_user_id]?.email ?? 'Unknown'
                const isFromMe = s.from_user_id === user.id
                const isToMe = s.to_user_id === user.id
                const date = new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                return (
                  <div key={'settle-' + s.id} className="bg-green-50 border border-green-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        <span>{isFromMe ? 'You' : fromName}</span>
                        <span className="text-gray-500 font-normal"> paid </span>
                        <span>{isToMe ? 'you' : toName}</span>
                      </p>
                      <p className="text-xs text-gray-400">{date}</p>
                    </div>
                    <span className="font-semibold text-green-700 text-sm shrink-0">{formatINR(s.amount)}</span>
                  </div>
                )
              })
          )}
        </div>
      )}

      {/* Balances tab */}
      {tab === 'Balances' && (
        <div className="space-y-2">
          {memberList.map(m => {
            const bal = balances[m.user_id] ?? 0
            const name = m.profile?.name ?? m.profile?.email ?? 'Unknown'
            return (
              <div key={m.user_id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm">
                    {name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{name} {m.user_id === user.id && '(you)'}</p>
                    <p className="text-xs text-gray-400">{m.profile?.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  {Math.abs(bal) < 0.01 ? (
                    <span className="text-sm text-gray-400 font-medium">Settled up</span>
                  ) : bal > 0 ? (
                    <span className="text-sm font-semibold text-green-600">+{formatINR(bal)}</span>
                  ) : (
                    <span className="text-sm font-semibold text-red-500">{formatINR(bal)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Settle up tab */}
      {tab === 'Settle up' && (
        <div>
          {transactions.length === 0 ? (
            <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
              <Check className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="font-medium text-gray-900">All settled up!</p>
              <p className="text-sm text-gray-400 mt-1">No outstanding balances in this group</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                {transactions.length} payment{transactions.length !== 1 ? 's' : ''} to settle all debts
                (simplified from {splits.filter(s => !s.settled).length} individual splits)
              </p>
              <div className="space-y-2">
                {transactions.map((t, i) => {
                  const from = profiles[t.from]
                  const to = profiles[t.to]
                  const fromName = from?.name ?? from?.email ?? 'Unknown'
                  const toName = to?.name ?? to?.email ?? 'Unknown'
                  const isMe = t.from === user.id

                  return (
                    <div key={i} className={`rounded-xl border px-5 py-4 flex items-center justify-between gap-3 ${
                      isMe ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                    }`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold text-xs">
                            {fromName[0].toUpperCase()}
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-xs">
                            {toName[0].toUpperCase()}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            <span className={isMe ? 'text-red-700' : ''}>{fromName}</span>
                            {' '}pays{' '}
                            <span className="text-teal-700">{toName}</span>
                          </p>
                          {isMe && <p className="text-xs text-red-500">You need to pay this</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-gray-900 text-base">{formatINR(t.amount)}</span>
                        {isMe && (
                          <button
                            onClick={() => settleTransaction(t.from, t.to, t.amount, i)}
                            disabled={settlingIdx === i}
                            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            {settlingIdx === i ? 'Settling…' : 'Mark paid'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Settlement history */}
          {settlements.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment history</p>
              <div className="space-y-2">
                {settlements.map(s => {
                  const from = profiles[s.from_user_id]
                  const to = profiles[s.to_user_id]
                  const fromName = from?.name ?? from?.email ?? 'Unknown'
                  const toName = to?.name ?? to?.email ?? 'Unknown'
                  const date = new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  const isMe = s.from_user_id === user.id
                  return (
                    <div key={s.id} className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        <div>
                          <p className="text-sm text-gray-800">
                            <span className="font-medium">{isMe ? 'You' : fromName}</span>
                            {' paid '}
                            <span className="font-medium">{s.to_user_id === user.id ? 'you' : toName}</span>
                          </p>
                          <p className="text-xs text-gray-400">{date}</p>
                        </div>
                      </div>
                      <span className="font-semibold text-green-700 text-sm">{formatINR(s.amount)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add expense modal */}
      {showAddExp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editingExpense ? 'Edit expense' : 'Add group expense'}</h2>
              <button onClick={() => { setShowAddExp(false); setEditingExpense(null) }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Hotel booking, Dinner"
                  value={expForm.description}
                  onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Amount (₹)</label>
                <input
                  type="number"
                  placeholder="0"
                  min="0"
                  value={expForm.amount}
                  onChange={e => {
                    setExpForm(f => ({ ...f, amount: e.target.value }))
                    if (splitMode === 'custom') {
                      const each = Math.round((Number(e.target.value) / members.length) * 100) / 100
                      const cs = {}
                      members.forEach(m => { cs[m.user_id] = each })
                      setCustomSplits(cs)
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Paid by</label>
                <select
                  value={expForm.paidBy}
                  onChange={e => setExpForm(f => ({ ...f, paidBy: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {memberList.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {profiles[m.user_id]?.name ?? profiles[m.user_id]?.email}
                      {m.user_id === user.id ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
                <input
                  type="date"
                  value={expForm.date}
                  onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Split mode */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Split between</label>

                {/* Member checkboxes */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 mb-3">
                  {memberList.map(m => {
                    const name = profiles[m.user_id]?.name ?? profiles[m.user_id]?.email ?? 'Unknown'
                    const isChecked = !!selectedMembers[m.user_id]
                    const isPayer = m.user_id === expForm.paidBy
                    const activeIds = getActiveMemberIds()
                    const perPerson = expForm.amount && activeIds.length
                      ? formatINR(Number(expForm.amount) / activeIds.length)
                      : null
                    return (
                      <label key={m.user_id} className={`flex items-center justify-between cursor-pointer ${isPayer ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isPayer}
                            onChange={() => toggleMember(m.user_id)}
                            className="w-4 h-4 accent-teal-600 rounded"
                          />
                          <span className="text-sm text-gray-700">
                            {name}{m.user_id === user.id ? ' (you)' : ''}{isPayer ? ' · paid' : ''}
                          </span>
                        </div>
                        {isChecked && perPerson && splitMode === 'equal' && (
                          <span className="text-xs font-medium text-gray-600">{perPerson}</span>
                        )}
                      </label>
                    )
                  })}
                </div>

                <div className="flex rounded-lg bg-gray-100 p-1 mb-3">
                  <button
                    onClick={() => setSplitMode('equal')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      splitMode === 'equal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    Equal split
                  </button>
                  <button
                    onClick={() => {
                      setSplitMode('custom')
                      const active = getActiveMemberIds()
                      const each = Math.round((Number(expForm.amount) / active.length) * 100) / 100
                      const cs = {}
                      active.forEach(id => { cs[id] = each })
                      setCustomSplits(cs)
                    }}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      splitMode === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {splitMode === 'custom' && (
                  <div className="space-y-2">
                    {memberList.filter(m => selectedMembers[m.user_id]).map(m => (
                      <div key={m.user_id} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 flex-1">
                          {profiles[m.user_id]?.name ?? 'Unknown'}
                          {m.user_id === user.id ? ' (you)' : ''}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={customSplits[m.user_id] ?? ''}
                          onChange={e => setCustomSplits(prev => ({ ...prev, [m.user_id]: e.target.value }))}
                          className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    ))}
                    {expForm.amount && (
                      <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                        <span className="text-gray-500">Total assigned</span>
                        <span className={`font-medium ${
                          Math.abs(Object.values(customSplits).reduce((s, v) => s + Number(v || 0), 0) - Number(expForm.amount)) < 0.01
                            ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {formatINR(Object.values(customSplits).reduce((s, v) => s + Number(v || 0), 0))} / {formatINR(Number(expForm.amount))}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowAddExp(false); setEditingExpense(null) }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addExpense}
                disabled={saving || !expForm.description.trim() || !expForm.amount}
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                {saving ? 'Saving…' : editingExpense ? 'Save changes' : 'Add expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add member modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Add member</h2>
              <button onClick={() => { setShowAddMember(false); setMemberEmail(''); setMemberError('') }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">They must have a SplitUp account already.</p>
            <input
              type="email"
              placeholder="friend@example.com"
              value={memberEmail}
              onChange={e => { setMemberEmail(e.target.value); setMemberError('') }}
              onKeyDown={e => e.key === 'Enter' && addMember()}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2"
              autoFocus
            />
            {memberError && <p className="text-xs text-red-600 mb-3">{memberError}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setShowAddMember(false); setMemberEmail(''); setMemberError('') }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={addMember}
                disabled={addingMember || !memberEmail.trim()}
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                {addingMember ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExpenseRow({ expense, payer, splits, profiles, currentUserId, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const mySplit = splits.find(s => s.user_id === currentUserId)
  const payerName = payer?.name ?? payer?.email ?? 'Unknown'
  const iPaid = expense.paid_by === currentUserId

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 font-semibold text-sm">
            {expense.description[0].toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900 text-sm">{expense.description}</p>
            <p className="text-xs text-gray-400">
              {iPaid ? 'You paid' : `${payerName} paid`} · {expense.date}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-gray-900">{formatINR(expense.amount)}</p>
            {mySplit && !iPaid && (
              <p className={`text-xs ${mySplit.settled ? 'text-green-600' : 'text-red-500'}`}>
                {mySplit.settled ? 'Settled' : `You owe ${formatINR(mySplit.amount)}`}
              </p>
            )}
            {iPaid && (
              <p className="text-xs text-teal-600">You paid</p>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Split details</p>
          <div className="space-y-1.5 mb-3">
            {splits.map(s => {
              const p = profiles[s.user_id]
              const name = p?.name ?? p?.email ?? 'Unknown'
              return (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{name} {s.user_id === currentUserId && '(you)'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 font-medium">{formatINR(s.amount)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.settled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {s.settled ? 'settled' : 'pending'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => onEdit(expense)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              onClick={() => onDelete(expense.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
