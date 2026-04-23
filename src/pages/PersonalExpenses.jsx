import { useEffect, useState, useRef } from 'react'
import { Plus, X, Trash2, Calendar, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatINR } from '../utils/debtSimplifier'

const CATEGORIES = [
  'Food & Dining', 'Transport', 'Entertainment', 'Shopping',
  'Bills & Utilities', 'Health', 'Travel', 'Home & Groceries',
  'Personal Care', 'Education', 'Subscriptions', 'General',
]

const CATEGORY_COLORS = {
  'Food & Dining':    'bg-orange-100 text-orange-700',
  'Transport':        'bg-blue-100 text-blue-700',
  'Entertainment':    'bg-purple-100 text-purple-700',
  'Shopping':         'bg-pink-100 text-pink-700',
  'Bills & Utilities':'bg-yellow-100 text-yellow-700',
  'Health':           'bg-green-100 text-green-700',
  'Travel':           'bg-teal-100 text-teal-700',
  'Home & Groceries': 'bg-lime-100 text-lime-700',
  'Personal Care':    'bg-rose-100 text-rose-700',
  'Education':        'bg-indigo-100 text-indigo-700',
  'Subscriptions':    'bg-violet-100 text-violet-700',
  'General':          'bg-gray-100 text-gray-700',
}

const CATEGORY_ICONS = {
  'Food & Dining':    '🍔',
  'Transport':        '🚗',
  'Entertainment':    '🎬',
  'Shopping':         '🛍️',
  'Bills & Utilities':'💡',
  'Health':           '💊',
  'Travel':           '✈️',
  'Home & Groceries': '🏠',
  'Personal Care':    '💇',
  'Education':        '📚',
  'Subscriptions':    '📱',
  'General':          '📌',
}

const KEYWORDS = {
  'Food & Dining':    ['food', 'lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'swiggy', 'zomato', 'snack', 'barbeque', 'bbq', 'biryani', 'dosa', 'chai', 'tea', 'meal', 'eating', 'dhaba', 'canteen', 'juice', 'icecream', 'cake', 'bakery', 'sandwich', 'noodles', 'dominos', 'mcdonalds', 'kfc', 'subway', 'maggi', 'paneer', 'thali'],
  'Transport':        ['uber', 'ola', 'auto', 'taxi', 'bus', 'metro', 'train', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'rapido', 'cab', 'rickshaw', 'scooter', 'commute', 'irctc', 'flight', 'airways', 'indigo', 'spicejet'],
  'Entertainment':    ['movie', 'movies', 'cinema', 'netflix', 'prime', 'hotstar', 'disney', 'spotify', 'concert', 'show', 'theatre', 'gaming', 'sports', 'cricket', 'pvr', 'inox', 'bookmyshow', 'party', 'club', 'pub', 'bowling', 'amusement', 'zoo'],
  'Shopping':         ['shopping', 'clothes', 'shirt', 'shoes', 'amazon', 'flipkart', 'myntra', 'dress', 'accessories', 'bag', 'watch', 'jeans', 'kurta', 'saree', 'jacket', 'tshirt', 'nykaa', 'ajio', 'mall', 'market', 'purchase'],
  'Bills & Utilities':['electricity', 'electric', 'water', 'gas', 'wifi', 'internet', 'broadband', 'recharge', 'bill', 'maintenance', 'dth', 'cable', 'airtel', 'jio', 'bsnl', 'vi', 'vodafone', 'cylinder', 'lpg', 'utility'],
  'Health':           ['medicine', 'doctor', 'hospital', 'pharmacy', 'medical', 'gym', 'fitness', 'yoga', 'chemist', 'tablet', 'injection', 'test', 'scan', 'xray', 'pathology', 'apollo', 'wellness', 'vitamin', 'dentist', 'dental', 'optical'],
  'Travel':           ['trip', 'vacation', 'holiday', 'airbnb', 'hostel', 'resort', 'oyo', 'makemytrip', 'goibibo', 'lodge', 'tourism', 'goa', 'manali', 'shimla', 'kashmir', 'tour'],
  'Home & Groceries': ['rent', 'furniture', 'appliance', 'repair', 'cleaning', 'groceries', 'grocery', 'vegetables', 'fruits', 'milk', 'bread', 'sabzi', 'mandi', 'blinkit', 'zepto', 'bigbasket', 'dmart', 'reliance', 'household', 'kitchen', 'plumber', 'electrician', 'carpenter', 'paint'],
  'Personal Care':    ['salon', 'haircut', 'spa', 'beauty', 'cosmetics', 'grooming', 'parlour', 'waxing', 'facial', 'massage', 'barber', 'shampoo', 'perfume', 'trimmer'],
  'Education':        ['course', 'book', 'books', 'school', 'college', 'tuition', 'fees', 'stationery', 'coaching', 'class', 'udemy', 'coursera', 'exam', 'certification'],
  'Subscriptions':    ['subscription', 'membership', 'premium', 'pro', 'icloud', 'google', 'microsoft', 'adobe', 'canva', 'linkedin', 'renewal', 'annual'],
}

function detectCategory(description) {
  const lower = description.toLowerCase()
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return cat
  }
  return 'General'
}

function newRow() {
  return { id: Date.now() + Math.random(), description: '', amount: '', category: 'General', overridden: false }
}

export default function PersonalExpenses() {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [rows, setRows] = useState([newRow()])
  const [saving, setSaving] = useState(false)
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [filterCategory, setFilterCategory] = useState('All')
  const descRefs = useRef({})

  useEffect(() => { if (user) loadExpenses() }, [user, filterMonth])

  async function loadExpenses() {
    setLoading(true)
    const [year, month] = filterMonth.split('-')
    const from = `${year}-${month}-01`
    const to = new Date(year, month, 0).toISOString().split('T')[0]
    const { data } = await supabase
      .from('expenses').select('*').is('group_id', null).eq('paid_by', user.id)
      .gte('date', from).lte('date', to).order('date', { ascending: false })
    setExpenses(data ?? [])
    setLoading(false)
  }

  function updateRow(id, field, value) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, [field]: value }
      if (field === 'description' && !r.overridden) updated.category = detectCategory(value)
      if (field === 'category') updated.overridden = true
      return updated
    }))
  }

  function addRow(focusId) {
    const r = newRow()
    setRows(prev => [...prev, r])
    setTimeout(() => descRefs.current[r.id]?.focus(), 30)
  }

  function removeRow(id) {
    setRows(prev => prev.length === 1 ? [newRow()] : prev.filter(r => r.id !== id))
  }

  function handleAmountKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addRow() }
  }

  async function saveAll() {
    const valid = rows.filter(r => r.description.trim() && Number(r.amount) > 0)
    if (!valid.length) return
    setSaving(true)
    await supabase.from('expenses').insert(
      valid.map(r => ({
        paid_by: user.id, group_id: null,
        description: r.description.trim(),
        amount: Number(r.amount),
        category: r.category,
        date: batchDate,
      }))
    )
    setRows([newRow()])
    setShowAdd(false)
    setShowDatePicker(false)
    await loadExpenses()
    setSaving(false)
  }

  function openAdd() {
    setBatchDate(new Date().toISOString().split('T')[0])
    setRows([newRow()])
    setShowDatePicker(false)
    setShowAdd(true)
    setTimeout(() => {
      const firstId = Object.keys(descRefs.current)[0]
      if (firstId) descRefs.current[firstId]?.focus()
    }, 50)
  }

  function closeAdd() {
    setShowAdd(false)
    setRows([newRow()])
    setShowDatePicker(false)
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

  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { val, label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) }
  })

  const validCount = rows.filter(r => r.description.trim() && Number(r.amount) > 0).length
  const formattedBatchDate = new Date(batchDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Expenses</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track your personal spending</p>
        </div>
        {!showAdd && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add expenses
          </button>
        )}
      </div>

      {/* Batch add panel */}
      {showAdd && (
        <div className="bg-white border border-teal-200 rounded-2xl p-5 mb-6 shadow-sm">
          {/* Date row */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowDatePicker(s => !s)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-teal-700 transition-colors"
            >
              <Calendar className="w-4 h-4 text-teal-600" />
              {formattedBatchDate}
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={closeAdd} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {showDatePicker && (
            <input
              type="date"
              value={batchDate}
              onChange={e => { setBatchDate(e.target.value); setShowDatePicker(false) }}
              className="mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-full"
              autoFocus
            />
          )}

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_100px_140px_32px] gap-2 mb-2 px-1">
            <span className="text-xs font-medium text-gray-400">Description</span>
            <span className="text-xs font-medium text-gray-400">Amount (₹)</span>
            <span className="text-xs font-medium text-gray-400">Category</span>
            <span />
          </div>

          {/* Rows */}
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={row.id} className="grid grid-cols-[1fr_100px_140px_32px] gap-2 items-center">
                <input
                  ref={el => { descRefs.current[row.id] = el }}
                  type="text"
                  placeholder={`e.g. ${['movie', 'groceries', 'electricity', 'uber', 'gym'][idx % 5]}`}
                  value={row.description}
                  onChange={e => updateRow(row.id, 'description', e.target.value)}
                  onKeyDown={e => e.key === 'Tab' && !e.shiftKey && e.preventDefault()}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <input
                  type="number"
                  placeholder="0"
                  min="0"
                  value={row.amount}
                  onChange={e => updateRow(row.id, 'amount', e.target.value)}
                  onKeyDown={handleAmountKeyDown}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="relative">
                  <select
                    value={row.category}
                    onChange={e => updateRow(row.id, 'category', e.target.value)}
                    className={`w-full pl-2 pr-6 py-2 rounded-lg text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none cursor-pointer ${CATEGORY_COLORS[row.category]}`}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-50" />
                </div>
                <button
                  onClick={() => removeRow(row.id)}
                  className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add row + Save */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-sm text-teal-600 font-medium hover:text-teal-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add another
            </button>
            <button
              onClick={saveAll}
              disabled={saving || validCount === 0}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving…' : `Save ${validCount > 0 ? validCount : ''} expense${validCount !== 1 ? 's' : ''}`}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Press Enter after amount to add next row</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {monthOptions.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilterCategory('All')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCategory === 'All' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >All</button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterCategory === cat ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {CATEGORY_ICONS[cat]} {cat}
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
                <span className={`px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat]}`}>
                  {CATEGORY_ICONS[cat]} {cat}
                </span>
                <span className="text-gray-700 font-medium">{formatINR(amt)}</span>
              </div>
            ))}
            {Object.keys(byCategory).length === 0 && <p className="text-xs text-gray-400">No expenses this period</p>}
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
          <button onClick={openAdd} className="mt-2 text-teal-600 text-sm font-medium hover:underline">
            Add your first expense
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[e.category] ?? 'bg-gray-100 text-gray-600'}`}>
                  {CATEGORY_ICONS[e.category] ?? '📌'} {e.category}
                </span>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{e.description}</p>
                  <p className="text-xs text-gray-400">{new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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
    </div>
  )
}
