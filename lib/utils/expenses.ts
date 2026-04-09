import { format, addMonths, parseISO, isWithinInterval, subDays, addDays } from "date-fns";
import type { JointExpense, JointCategory } from "@/types/database";

/**
 * Generate month_year string in YYYY-MM format from a date string.
 */
export function toMonthYear(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "yyyy-MM");
}

/**
 * Detect duplicate expenses by matching amount + date (±1 day) + fuzzy merchant name.
 */
export interface IncomingExpenseRow {
  date: string;
  merchant: string;
  amount: number;
}

export interface DuplicateCheckResult {
  row: IncomingExpenseRow;
  isDuplicate: boolean;
  matchedExpense?: Pick<JointExpense, "id" | "description" | "expense_date" | "amount">;
}

function normalizeMerchant(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9\s]/g, "").trim();
}

export function detectDuplicates(
  incoming: IncomingExpenseRow[],
  existing: Pick<JointExpense, "id" | "description" | "expense_date" | "amount">[]
): DuplicateCheckResult[] {
  return incoming.map((row) => {
    const incomingDate = parseISO(row.date);
    const normalizedIncoming = normalizeMerchant(row.merchant);

    const match = existing.find((exp) => {
      // Amount must match exactly
      if (Math.abs(Number(exp.amount) - row.amount) > 0.005) return false;

      // Date: exact or ±1 day
      const expDate = parseISO(exp.expense_date);
      const withinRange = isWithinInterval(incomingDate, {
        start: subDays(expDate, 1),
        end: addDays(expDate, 1),
      });
      if (!withinRange) return false;

      // Fuzzy merchant match: check if normalized existing description contains
      // or is contained by the normalized incoming merchant
      const normalizedExisting = normalizeMerchant(exp.description);
      return (
        normalizedExisting.includes(normalizedIncoming) ||
        normalizedIncoming.includes(normalizedExisting)
      );
    });

    return {
      row,
      isDuplicate: !!match,
      matchedExpense: match,
    };
  });
}

/**
 * Detect which required monthly expenses are missing for a given month_year.
 */
export function detectMissingExpenses(
  monthYear: string,
  requiredCategories: Pick<JointCategory, "id" | "name">[],
  existingExpenses: Pick<JointExpense, "category_id">[]
): Pick<JointCategory, "id" | "name">[] {
  const presentCategoryIds = new Set(
    existingExpenses.map((e) => e.category_id).filter(Boolean)
  );

  return requiredCategories.filter((cat) => !presentCategoryIds.has(cat.id));
}

/**
 * Generate recurring expense instances for the next N months.
 */
export function generateRecurringMonths(
  baseExpense: Pick<
    JointExpense,
    "description" | "amount" | "category_id" | "expense_date" | "paid_by" | "entered_by" | "is_required_monthly"
  >,
  parentId: string,
  monthsAhead: number = 12
): Omit<JointExpense, "id" | "created_at" | "updated_at">[] {
  const results: Omit<JointExpense, "id" | "created_at" | "updated_at">[] = [];
  const baseDate = parseISO(baseExpense.expense_date);

  for (let i = 1; i <= monthsAhead; i++) {
    const nextDate = addMonths(baseDate, i);
    const dateStr = format(nextDate, "yyyy-MM-dd");
    results.push({
      description: baseExpense.description,
      amount: baseExpense.amount,
      category_id: baseExpense.category_id,
      expense_date: dateStr,
      month_year: format(nextDate, "yyyy-MM"),
      paid_by: baseExpense.paid_by,
      entered_by: baseExpense.entered_by,
      is_recurring: true,
      is_required_monthly: baseExpense.is_required_monthly,
      recurring_parent_id: parentId,
      recurring_override: false,
      source: "recurring",
      import_batch_id: null,
    });
  }

  return results;
}

/**
 * Generate forecast based on average monthly spend per category over the last N months.
 */
export interface ForecastEntry {
  categoryId: string;
  categoryName: string;
  avgMonthly: number;
  annualForecast: number;
  monthsOfData: number;
}

export function generateForecast(
  expenses: Pick<JointExpense, "category_id" | "amount" | "month_year">[],
  categories: Pick<JointCategory, "id" | "name">[],
  maxMonths: number = 12
): ForecastEntry[] {
  // Collect all unique month_years, sorted descending
  const allMonths = [...new Set(expenses.map((e) => e.month_year))].sort().reverse();
  const relevantMonths = new Set(allMonths.slice(0, maxMonths));

  // Sum amounts per category for relevant months
  const categoryTotals = new Map<string, { total: number; months: Set<string> }>();

  for (const expense of expenses) {
    if (!relevantMonths.has(expense.month_year)) continue;
    if (!expense.category_id) continue;

    const existing = categoryTotals.get(expense.category_id) ?? { total: 0, months: new Set() };
    existing.total += Number(expense.amount);
    existing.months.add(expense.month_year);
    categoryTotals.set(expense.category_id, existing);
  }

  const results: ForecastEntry[] = [];
  const numMonths = Math.max(relevantMonths.size, 1);

  for (const [categoryId, data] of categoryTotals) {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) continue;

    const avgMonthly = data.total / numMonths;
    results.push({
      categoryId,
      categoryName: category.name,
      avgMonthly,
      annualForecast: avgMonthly * 12,
      monthsOfData: data.months.size,
    });
  }

  return results.sort((a, b) => b.annualForecast - a.annualForecast);
}
