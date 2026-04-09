"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import MonthSelector from "@/components/layout/MonthSelector";
import { formatCurrency, formatDate, currentMonthYear } from "@/lib/utils/format";
import type { JointExpense, JointCategory, Profile } from "@/types/database";

interface ExpenseRow extends JointExpense {
  joint_categories: { id: string; name: string } | null;
}

interface ExpensesClientProps {
  currentUserId: string;
  expenses: ExpenseRow[];
  categories: Pick<JointCategory, "id" | "name">[];
  profiles: Pick<Profile, "id" | "display_name">[];
  defaultMonth?: string;
}

export default function ExpensesClient({
  currentUserId,
  expenses,
  categories,
  profiles,
  defaultMonth,
}: ExpensesClientProps) {
  const [monthYear, setMonthYear] = useState(defaultMonth ?? currentMonthYear());
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [paidByFilter, setPaidByFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (e.month_year !== monthYear) return false;
      if (selectedCategories.length > 0 && (!e.category_id || !selectedCategories.includes(e.category_id))) return false;
      if (paidByFilter !== "all" && e.paid_by !== paidByFilter) return false;
      return true;
    });
  }, [expenses, monthYear, selectedCategories, paidByFilter]);

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card-bg border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-medium text-text-primary">Expenses</h1>
          <Link
            href="/expenses/add"
            className="flex items-center justify-center w-9 h-9 bg-primary rounded-xl hover:opacity-90"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Link>
        </div>
        <MonthSelector monthYear={monthYear} onChange={setMonthYear} />
      </header>

      <div className="px-4 py-4">
        {/* Recurring link */}
        <Link
          href="/expenses/recurring"
          className="flex items-center justify-between bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 mb-4 min-h-[44px]"
        >
          <span className="text-text-primary text-sm font-medium">Manage recurring expenses</span>
          <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {/* Filters */}
        <div className="space-y-3 mb-4">
          {/* Category filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[32px] ${
                  selectedCategories.includes(cat.id)
                    ? "bg-primary text-white"
                    : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Paid by filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setPaidByFilter("all")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium min-h-[32px] ${
                paidByFilter === "all"
                  ? "bg-primary text-white"
                  : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
              }`}
            >
              All payers
            </button>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setPaidByFilter(profile.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium min-h-[32px] ${
                  paidByFilter === profile.id
                    ? "bg-primary text-white"
                    : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
                }`}
              >
                {profile.display_name}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between text-sm text-text-secondary mb-3">
          <span>{filtered.length} expenses</span>
          <span className="font-semibold text-text-primary">
            {formatCurrency(filtered.reduce((sum, e) => sum + Number(e.amount), 0))}
          </span>
        </div>

        {/* Expense list */}
        {filtered.length === 0 ? (
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-8 text-center">
            <p className="text-text-muted text-sm">No expenses found</p>
            <Link
              href="/expenses/add"
              className="text-primary text-sm font-medium mt-2 block"
            >
              + Add expense
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((expense) => {
              const payer = profiles.find((p) => p.id === expense.paid_by);
              return (
                <Link
                  key={expense.id}
                  href={`/expenses/add?edit=${expense.id}`}
                  className="bg-card-bg hover:bg-elevated rounded-xl px-4 py-3 flex items-center gap-3 block"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {expense.description}
                      </span>
                      {expense.is_recurring && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary bg-primary-light px-1.5 py-0.5 rounded-md flex-shrink-0">
                          recurring
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {expense.joint_categories?.name && (
                        <span className="text-[11px] bg-primary-light text-primary px-1.5 py-0.5 rounded">
                          {expense.joint_categories.name}
                        </span>
                      )}
                      <span className="text-text-muted text-xs">
                        {payer?.display_name ?? "Unknown"} · {formatDate(expense.expense_date)}
                      </span>
                    </div>
                  </div>
                  <span className="text-text-primary font-semibold text-sm flex-shrink-0">
                    {formatCurrency(expense.amount)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
