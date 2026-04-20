import { useEffect, useState } from 'react'
import { Plus, X, Filter, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatINR } from '../utils/debtSimplifier'

const CATEGORIES = ['Food & Dining', 'Transport', 'Shopping', 'Entertainment', 'Bills & Utilities', 'Health', 'Travel', 'General']

const CATEGORY_COLORS = {
  'Food & Dining': 'bg-orange-100 text-orange-700',
  'Transport': 'bg-blue-100 text-blue-700',
  'Shopping': 'bg-pink-100 text-pink-700',
  'Entertainment': 'bg-purple-100 text-purple-700',
  'Bills & Utilities': 'bg-yellow-100 text-yellow-700',
  'Health': 'bg-green-100 text-green-700',
  'Travel': 'bg-teal-100 text-teal-700',
  'General': 'bg-gray-100 text-gray-700',
}

const defaultForm = {
  description: '',
  amount: '',
  category: 'General',
  date: new Date().toISOString().split('T')[0],
}

export default function PersonalExpenses() {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [filterCategory, setFilterCategory] = useState('All')

  useEffect(() => {
    if (user) loadExpenses()
  }, [user, filterMonth])

  async function loadExpenses() {
    setLoading(true)
    const [year, month] = filterMonth.split('-')
    const from = `${year}-${month}-01`
    const to = new Date(year, month, 0).toISOString().split('T')[0]

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .is('group_id', null)
      .eq('paid_by', user.id)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })

    setExpenses(data ?? [])
    setLoading(false)
  }

  async function addExpense() {
    if (!form.description.trim() || !form.amount || Number(form.amount) <= 0) return
    setSaving(true)

    await supabase.from('expenses').insert({
      paid_by: user.id,
      group_id: null,
      description: form.description.trim(),
      amount: Number(form.amount),
      category: form.category,
      date: form.date,
    })

    setForm(defaultForm)
    setShowAdd(false)
    await loadExpenses()
    setSaving(false)
  }

  async function deleteExpense(id) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const filtered = filterCategory === 'All' ? expenses : expenses.filter(e => e.category === filterCategory)
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0)

  const byCategory = CATEGORIES.reduce((acc, cat) => {
    const sum = expenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0)
    if (sum > 0) acc[cat] = sum
    return acc
  }, {})

  // Generate past 6 months for selector
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
    return { val, label }
  })

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Expenses</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track your personal spending</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add expense
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {monthOptions.map(m => (
            <option key={m.val} value={m.val}>{m.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilterCategory('All')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === 'All' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterCategory === cat ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Total {filterCategory !== 'All' ? filterCategory : 'this period'}</p>
          <p className="text-3xl font-bold text-gray-900">{formatINR(total)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-2">By category</p>
          <div className="space-y-1.5 max-h-24 overflow-y-auto">
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat]}`}>{cat}</span>
                <span className="text-gray-700 font-medium">{formatINR(amt)}</span>
              </div>
            ))}
            {Object.keys(byCategory).length === 0 && (
              <p className="text-xs text-gray-400">No expenses this period</p>
            )}
          </div>
        </div>
      </div>

      {/* Expense list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white border border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500">No expenses found</p>
          <button onClick={() => setShowAdd(true)} className="mt-2 text-teal-600 text-sm font-medium hover:underline">
            Add your first expense
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[e.category] ?? 'bg-gray-100 text-gray-600'}`}>
                  {e.category}
                </span>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{e.description}</p>
                  <p className="text-xs text-gray-400">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900">{formatINR(e.amount)}</span>
                <button
                  onClick={() => deleteExpense(e.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add expense modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Add expense</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Dinner at Barbeque Nation"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
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
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addExpense}
                disabled={saving || !form.description.trim() || !form.amount}
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
