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
 * Returns { userId: netBalance }
 */
export function computeBalances(expenses, splits, currentUserId) {
  const balances = {}

  for (const expense of expenses) {
    const paidBy = expense.paid_by
    if (!(paidBy in balances)) balances[paidBy] = 0
    balances[paidBy] += Number(expense.amount)
  }

  for (const split of splits) {
    const uid = split.user_id
    if (!(uid in balances)) balances[uid] = 0
    balances[uid] -= Number(split.amount)
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
