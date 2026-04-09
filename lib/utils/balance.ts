import Decimal from "decimal.js";
import type { JointExpense, Payment, SplitRatio, CategoryRatioHistory } from "@/types/database";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface BalanceResult {
  amount: Decimal;
  /**
   * Positive = user2 owes user1 (household owner is owed by partner).
   * Negative = user1 owes user2.
   * "Settled" = within 0.5 cents of zero.
   */
  direction: "user2_owes_user1" | "user1_owes_user2" | "settled";
  /** user1's cumulative obligation across all expenses */
  user1Owed: Decimal;
  /** user2's cumulative obligation across all expenses */
  user2Owed: Decimal;
  totalPayments: Decimal;
}

/** Expense shape accepted by calculateBalance — includes the optional category ratio. */
export type BalanceExpense = Pick<
  JointExpense,
  "amount" | "paid_by" | "expense_date"
> & {
  category_id?: string | null;
  /**
   * User1's share for this expense's category, as a decimal (0.0–1.0).
   * Populated by enrichExpensesWithCategoryRatios; null means fall back
   * to the global dated split_ratios.
   */
  category_split_ratio?: number | null;
};

/**
 * Look up the most recent category ratio history entry for a given
 * category and expense date.
 *
 * Priority:
 *   1. Most recent category_ratio_history row where effective_date <= expenseDate
 *   2. Returns null → caller falls back to global split_ratios (50/50 as last resort)
 */
export function getCategoryRatioForDate(
  categoryId: string | null | undefined,
  expenseDate: string,
  history: CategoryRatioHistory[]
): number | null {
  if (!categoryId || history.length === 0) return null;

  let best: CategoryRatioHistory | null = null;
  for (const entry of history) {
    if (entry.category_id !== categoryId) continue;
    if (entry.effective_date > expenseDate) continue;
    if (!best || entry.effective_date > best.effective_date) {
      best = entry;
    }
  }
  return best ? Number(best.ratio) : null;
}

/**
 * Enrich expenses with category_split_ratio resolved from category_ratio_history.
 * Call this before passing expenses to calculateBalance so that per-category
 * dated overrides are applied correctly.
 */
export function enrichExpensesWithCategoryRatios<T extends BalanceExpense>(
  expenses: T[],
  history: CategoryRatioHistory[]
): T[] {
  if (history.length === 0) return expenses;
  return expenses.map((exp) => ({
    ...exp,
    category_split_ratio: getCategoryRatioForDate(
      exp.category_id,
      exp.expense_date,
      history
    ),
  }));
}

/**
 * Resolve the effective user1 share (0.0–1.0) for a given expense.
 * Priority: category-level override > global dated split ratio.
 */
export function getEffectiveShares(
  expense: BalanceExpense,
  ratios: SplitRatio[]
): { user1Share: Decimal; user2Share: Decimal } {
  const amount = new Decimal(expense.amount);

  if (expense.category_split_ratio != null) {
    // Category-level override
    const u1 = new Decimal(expense.category_split_ratio);
    const u2 = new Decimal(1).minus(u1);
    return { user1Share: amount.mul(u1), user2Share: amount.mul(u2) };
  }

  // Fall back to the global dated ratio
  const ratio = getRatioForDate(expense.expense_date, ratios);
  const u1 = new Decimal(ratio.user1_pct).div(100);
  const u2 = new Decimal(ratio.user2_pct).div(100);
  return { user1Share: amount.mul(u1), user2Share: amount.mul(u2) };
}

/**
 * Find the split ratio effective on a given date.
 * Uses the most recent split_ratio row where effective_date <= expenseDate.
 */
export function getRatioForDate(
  date: string,
  ratios: SplitRatio[]
): SplitRatio {
  const sorted = [...ratios].sort(
    (a, b) =>
      new Date(b.effective_date).getTime() -
      new Date(a.effective_date).getTime()
  );

  const match = sorted.find((r) => r.effective_date <= date);

  // Fall back to earliest ratio if none found
  return (
    match ??
    sorted[sorted.length - 1] ?? {
      user1_pct: 50,
      user2_pct: 50,
      id: "",
      effective_date: "",
      created_by: null,
      created_at: "",
    }
  );
}

/**
 * Apply the correct ratio to an expense and return how much each member owes.
 * Respects category-level split_ratio when present.
 */
export function applyRatioToExpense(
  expense: BalanceExpense,
  ratios: SplitRatio[],
  user1Id: string
): { user2Owes: Decimal; user1Owes: Decimal } {
  const { user1Share, user2Share } = getEffectiveShares(expense, ratios);

  if (expense.paid_by === user1Id) {
    return { user2Owes: user2Share, user1Owes: new Decimal(0) };
  } else {
    return { user2Owes: new Decimal(0), user1Owes: user1Share };
  }
}

/**
 * Calculate the running lifetime balance between the two household members.
 *
 * Positive result = user2 owes user1.
 * Negative result = user1 owes user2.
 *
 * Each expense may carry an optional `category_split_ratio` (user1's share
 * as a 0–1 decimal). When present it takes priority over the global dated
 * ratio from the split_ratios table.
 */
export function calculateBalance(
  expenses: BalanceExpense[],
  payments: Pick<Payment, "paid_by" | "paid_to" | "amount">[],
  ratios: SplitRatio[],
  user1Id: string,
  user2Id: string
): BalanceResult {
  let runningBalance = new Decimal(0); // positive = user2 owes user1

  for (const expense of expenses) {
    const { user1Share, user2Share } = getEffectiveShares(expense, ratios);

    if (expense.paid_by === user1Id) {
      runningBalance = runningBalance.plus(user2Share);
    } else if (expense.paid_by === user2Id) {
      runningBalance = runningBalance.minus(user1Share);
    }
  }

  for (const payment of payments) {
    const amount = new Decimal(payment.amount);
    if (payment.paid_by === user2Id && payment.paid_to === user1Id) {
      runningBalance = runningBalance.minus(amount);
    } else if (payment.paid_by === user1Id && payment.paid_to === user2Id) {
      runningBalance = runningBalance.plus(amount);
    }
  }

  const absBalance = runningBalance.abs();
  let direction: BalanceResult["direction"];

  if (runningBalance.greaterThan(0.005)) {
    direction = "user2_owes_user1";
  } else if (runningBalance.lessThan(-0.005)) {
    direction = "user1_owes_user2";
  } else {
    direction = "settled";
  }

  let user1Owed = new Decimal(0);
  let user2Owed = new Decimal(0);
  for (const expense of expenses) {
    const { user1Share, user2Share } = getEffectiveShares(expense, ratios);
    if (expense.paid_by === user1Id) {
      user2Owed = user2Owed.plus(user2Share);
    } else if (expense.paid_by === user2Id) {
      user1Owed = user1Owed.plus(user1Share);
    }
  }

  const totalPayments = payments.reduce(
    (sum, p) => sum.plus(new Decimal(p.amount)),
    new Decimal(0)
  );

  return { amount: absBalance, direction, user1Owed, user2Owed, totalPayments };
}

/**
 * Build a human-readable balance description using actual member display names.
 */
export function formatBalanceText(
  result: BalanceResult,
  user1Name: string,
  user2Name: string
): string {
  if (result.direction === "settled") return "All settled up";
  if (result.direction === "user2_owes_user1") {
    return `${user2Name} owes ${user1Name} $${result.amount.toFixed(2)}`;
  }
  return `${user1Name} owes ${user2Name} $${result.amount.toFixed(2)}`;
}
