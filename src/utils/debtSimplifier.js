/**
 * Greedy min-cash-flow algorithm.
 * Given a map of { userId -> netBalance }, returns the minimum list of
 * transactions to settle all debts.
 * Positive balance = owed money. Negative balance = owes money.
 */
export function simplifyDebts(balances) {
  const creditors = []
  const debtors = []

  for (const [userId, balance] of Object.entries(balances)) {
    const rounded = Math.round(balance * 100) / 100
    if (rounded > 0.01) creditors.push([userId, rounded])
    else if (rounded < -0.01) debtors.push([userId, rounded])
  }

  creditors.sort((a, b) => b[1] - a[1])
  debtors.sort((a, b) => a[1] - b[1])

  const transactions = []
  let i = 0
  let j = 0

  while (i < creditors.length && j < debtors.length) {
    const [creditorId, credit] = creditors[i]
    const [debtorId, debt] = debtors[j]
    const amount = Math.min(credit, -debt)

    transactions.push({
      from: debtorId,
      to: creditorId,
      amount: Math.round(amount * 100) / 100,
    })

    creditors[i] = [creditorId, Math.round((credit - amount) * 100) / 100]
    debtors[j] = [debtorId, Math.round((debt + amount) * 100) / 100]

    if (creditors[i][1] <= 0.01) i++
    if (debtors[j][1] >= -0.01) j++
  }

  return transactions
}

/**
 * Compute net balance per member from a list of expenses + splits.
 * Only unsettled splits contribute to balances.
 * Returns { userId: netBalance }
 */
export function computeBalances(expenses, splits) {
  const balances = {}

  const expensePayer = {}
  for (const expense of expenses) {
    expensePayer[expense.id] = expense.paid_by
    if (!(expense.paid_by in balances)) balances[expense.paid_by] = 0
  }

  for (const split of splits) {
    if (split.settled) continue
    const uid = split.user_id
    const payerId = expensePayer[split.expense_id]
    if (!payerId) continue
    if (!(uid in balances)) balances[uid] = 0
    if (!(payerId in balances)) balances[payerId] = 0
    balances[uid] -= Number(split.amount)
    balances[payerId] += Number(split.amount)
  }

  return balances
}

export function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}
