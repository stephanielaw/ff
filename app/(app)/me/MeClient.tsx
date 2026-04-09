"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import MonthSelector from "@/components/layout/MonthSelector";
import { Toast, useToast } from "@/components/ui/Toast";
import { formatCurrency, currentMonthYear, formatDate } from "@/lib/utils/format";
import { sanitizeText } from "@/lib/utils/sanitize";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getRatioForDate } from "@/lib/utils/balance";
import type {
  Profile,
  IndividualCategory,
  JointCategory,
  SplitRatio,
  MonthlyIncome,
  SavingsGoal,
  SavingsAllocation,
  SavingsTransaction,
} from "@/types/database";

interface IndividualExpense {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  category_id: string | null;
  expense_date: string;
  month_year: string;
  is_visible_to_partner: boolean;
  individual_categories: { id: string; name: string } | null;
}

interface MeClientProps {
  currentUserId: string;
  /** 'user1' = household owner, 'user2' = invited partner */
  userRole: "user1" | "user2";
  profile: Profile | null;
  individualCategories: Pick<IndividualCategory, "id" | "name">[];
  jointCategories: Pick<JointCategory, "id" | "name">[];
  splitRatios: SplitRatio[];
  jointExpenses: { amount: number; paid_by: string; expense_date: string; month_year: string }[];
  individualExpenses: IndividualExpense[];
  income: MonthlyIncome[];
  savingsGoals: SavingsGoal[];
  savingsAllocations: SavingsAllocation[];
  savingsTransactions: SavingsTransaction[];
  profiles: Pick<Profile, "id" | "display_name">[];
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export default function MeClient({
  currentUserId,
  userRole,
  profile,
  individualCategories,
  jointCategories,
  splitRatios,
  jointExpenses,
  individualExpenses,
  income,
  savingsGoals,
  savingsAllocations,
  savingsTransactions,
  profiles,
}: MeClientProps) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();
  const [monthYear, setMonthYear] = useState(currentMonthYear());
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [newGoalAllocated, setNewGoalAllocated] = useState("");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Transaction form state
  const [txForm, setTxForm] = useState<{ goalId: string; type: "deposit" | "withdrawal" } | null>(null);
  const [txAmount, setTxAmount] = useState("");
  const [txNote, setTxNote] = useState("");
  const [txDate, setTxDate] = useState(todayISO());
  const [savingTx, setSavingTx] = useState(false);

  // Which goal's transaction history is expanded
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const displayName = profile?.display_name ?? "Me";
  const initial = displayName.charAt(0).toUpperCase();

  // Monthly income for selected month
  const monthIncome = useMemo(() => {
    return income.find((i) => i.month_year === monthYear);
  }, [income, monthYear]);

  // My joint share this month
  const myJointShare = useMemo(() => {
    const monthJoint = jointExpenses.filter((e) => e.month_year === monthYear);
    let share = new Decimal(0);
    for (const exp of monthJoint) {
      const ratio = getRatioForDate(exp.expense_date, splitRatios);
      const amount = new Decimal(exp.amount);
      const myPct =
        userRole === "user1" ? (ratio.user1_pct ?? 50) : (ratio.user2_pct ?? 50);
      share = share.plus(amount.mul(new Decimal(myPct).div(100)));
    }
    return share;
  }, [jointExpenses, monthYear, userRole, splitRatios]);

  // Personal spending this month
  const personalSpending = useMemo(() => {
    return individualExpenses
      .filter((e) => e.month_year === monthYear)
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }, [individualExpenses, monthYear]);

  // Savings allocations this month
  const monthAllocations = useMemo(() => {
    return savingsAllocations.filter((a) => a.month_year === monthYear);
  }, [savingsAllocations, monthYear]);

  const totalAllocations = monthAllocations.reduce(
    (sum, a) => sum + Number(a.manual_amount),
    0
  );

  const incomeAmount = monthIncome ? Number(monthIncome.amount) : 0;
  const unallocatedCash = incomeAmount - myJointShare.toNumber() - personalSpending;
  const netAfterGoals = unallocatedCash - totalAllocations;
  const savingsRate = incomeAmount > 0 ? (netAfterGoals / incomeAmount) * 100 : 0;

  // Filtered individual expenses
  const filteredExpenses = useMemo(() => {
    return individualExpenses.filter((e) => {
      if (e.month_year !== monthYear) return false;
      if (categoryFilter !== "all" && e.category_id !== categoryFilter) return false;
      return true;
    });
  }, [individualExpenses, monthYear, categoryFilter]);

  // Running balance per goal from transactions
  const goalBalances = useMemo(() => {
    const result = new Map<
      string,
      { balance: number; deposited: number; withdrawn: number; transactions: SavingsTransaction[] }
    >();
    for (const goal of savingsGoals) {
      const txs = savingsTransactions.filter((tx) => tx.goal_id === goal.id);
      if (txs.length === 0) {
        // Fall back to allocated_amount on the goal row as opening balance
        const fallback = Number(goal.allocated_amount ?? 0);
        result.set(goal.id, { balance: fallback, deposited: fallback, withdrawn: 0, transactions: [] });
      } else {
        const deposited = txs
          .filter((tx) => tx.transaction_type === "deposit")
          .reduce((s, tx) => s + Number(tx.amount), 0);
        const withdrawn = txs
          .filter((tx) => tx.transaction_type === "withdrawal")
          .reduce((s, tx) => s + Number(tx.amount), 0);
        result.set(goal.id, { balance: deposited - withdrawn, deposited, withdrawn, transactions: txs });
      }
    }
    return result;
  }, [savingsGoals, savingsTransactions]);

  async function saveIncome() {
    const amount = parseFloat(incomeInput);
    if (isNaN(amount) || amount <= 0) {
      showToast("Please enter a valid income amount", "error");
      return;
    }

    setSavingIncome(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("monthly_income").upsert(
        {
          user_id: currentUserId,
          month_year: monthYear,
          amount,
        },
        { onConflict: "user_id,month_year" }
      );
      showToast("Income saved", "success");
      setEditingIncome(false);
      router.refresh();
    } catch {
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setSavingIncome(false);
    }
  }

  async function saveGoal() {
    if (!newGoalName.trim()) return;
    const targetAmount = parseFloat(newGoalTarget) || null;
    const allocatedAmount = parseFloat(newGoalAllocated) || 0;

    setSavingGoal(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: newGoal, error } = await supabase
        .from("savings_goals")
        .insert({
          user_id: currentUserId,
          name: sanitizeText(newGoalName),
          target_amount: targetAmount,
          allocated_amount: allocatedAmount,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-create opening deposit transaction if an initial amount was given
      if (newGoal && allocatedAmount > 0) {
        await supabase.from("savings_transactions").insert({
          goal_id: newGoal.id,
          amount: allocatedAmount,
          transaction_type: "deposit",
          note: "Initial balance",
          transaction_date: todayISO(),
          created_by: currentUserId,
        });
      }

      showToast("Goal created", "success");
      setShowAddGoal(false);
      setNewGoalName("");
      setNewGoalTarget("");
      setNewGoalAllocated("");
      router.refresh();
    } catch {
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setSavingGoal(false);
    }
  }

  async function saveAllocation(goalId: string, amount: number) {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("savings_allocations").upsert(
        {
          user_id: currentUserId,
          goal_id: goalId,
          month_year: monthYear,
          manual_amount: amount,
          auto_calculated_amount: unallocatedCash > 0 ? unallocatedCash : 0,
        },
        { onConflict: "user_id,goal_id,month_year" } as never
      );
      router.refresh();
    } catch {
      showToast("Something went wrong saving. Please try again.", "error");
    }
  }

  function openTxForm(goalId: string, type: "deposit" | "withdrawal") {
    if (txForm?.goalId === goalId && txForm?.type === type) {
      setTxForm(null);
    } else {
      setTxForm({ goalId, type });
      setTxAmount("");
      setTxNote("");
      setTxDate(todayISO());
    }
  }

  async function saveTransaction() {
    if (!txForm) return;
    const amount = parseFloat(txAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast("Enter a valid amount", "error");
      return;
    }
    setSavingTx(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("savings_transactions").insert({
        goal_id: txForm.goalId,
        amount,
        transaction_type: txForm.type,
        note: txNote.trim() || null,
        transaction_date: txDate,
        created_by: currentUserId,
      });
      if (error) throw error;
      showToast(txForm.type === "deposit" ? "Deposit logged" : "Withdrawal logged", "success");
      setTxForm(null);
      setTxAmount("");
      setTxNote("");
      router.refresh();
    } catch {
      showToast("Something went wrong. Please try again.", "error");
    } finally {
      setSavingTx(false);
    }
  }

  async function addIndividualExpense(formData: {
    amount: number;
    description: string;
    categoryId: string;
    expenseDate: string;
  }) {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("individual_expenses").insert({
        user_id: currentUserId,
        description: sanitizeText(formData.description),
        amount: formData.amount,
        category_id: formData.categoryId || null,
        expense_date: formData.expenseDate,
        month_year: monthYear,
        is_visible_to_partner: false,
      });
      router.refresh();
    } catch {
      showToast("Something went wrong saving. Please try again.", "error");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card-bg border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-12 h-12 rounded-full bg-primary-dark border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-xl font-medium text-primary flex-shrink-0">
            {initial}
          </div>
          <div>
            <h1 className="text-lg font-medium text-text-primary">{displayName}</h1>
            <p className="text-text-muted text-xs">Personal dashboard</p>
          </div>
        </div>
        <MonthSelector monthYear={monthYear} onChange={setMonthYear} />
      </header>

      <div className="px-4 py-4 space-y-5">
        {/* Income & net position */}
        <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)]">
            <h2 className="text-text-primary font-semibold text-sm">Income & position</h2>
          </div>

          {/* Income row */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-[rgba(255,255,255,0.08)]">
            <span className="text-text-secondary text-sm">Monthly income</span>
            {editingIncome ? (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={incomeInput}
                    onChange={(e) => setIncomeInput(e.target.value)}
                    placeholder="0.00"
                    className="w-28 pl-7 pr-3 py-1.5 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg text-sm text-right font-medium focus:outline-none focus:border-primary tabular-nums"
                    autoFocus
                  />
                </div>
                <button
                  onClick={saveIncome}
                  disabled={savingIncome}
                  className="text-primary text-sm font-medium min-h-[36px] px-2"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingIncome(false)}
                  className="text-text-muted text-sm min-h-[36px] px-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEditingIncome(true);
                  setIncomeInput(monthIncome?.amount.toString() ?? "");
                }}
                className="text-text-primary font-semibold text-sm min-h-[44px] flex items-center gap-1"
              >
                {monthIncome ? formatCurrency(monthIncome.amount) : (
                  <span className="text-primary">+ Add income</span>
                )}
              </button>
            )}
          </div>

          <div className="px-4 py-3 flex items-center justify-between border-b border-[rgba(255,255,255,0.08)]">
            <span className="text-text-secondary text-sm">My joint share</span>
            <span className="text-text-primary font-medium text-sm">
              -{formatCurrency(myJointShare.toNumber())}
            </span>
          </div>

          <div className="px-4 py-3 flex items-center justify-between border-b border-[rgba(255,255,255,0.08)]">
            <span className="text-text-secondary text-sm">Personal spending</span>
            <span className="text-text-primary font-medium text-sm">
              -{formatCurrency(personalSpending)}
            </span>
          </div>

          <div className="px-4 py-3 flex items-center justify-between border-b border-[rgba(255,255,255,0.08)]">
            <span className="text-text-secondary text-sm">Allocated to goals</span>
            <span className="text-text-primary font-medium text-sm">
              -{formatCurrency(totalAllocations)}
            </span>
          </div>

          <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between">
              <span className="text-text-primary font-semibold text-sm">Net saved (after goals)</span>
              <span className={`font-bold text-base ${netAfterGoals >= 0 ? "text-success" : "text-danger"}`}>
                {formatCurrency(netAfterGoals)}
              </span>
            </div>
            {incomeAmount > 0 && (
              <p className="text-text-muted text-xs mt-0.5">
                {savingsRate.toFixed(1)}% savings rate
              </p>
            )}
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-text-primary font-semibold text-sm">Unallocated cash</span>
              <span className={`font-bold text-base ${unallocatedCash >= 0 ? "text-success" : "text-danger"}`}>
                {formatCurrency(unallocatedCash)}
              </span>
            </div>
            <p className="text-text-muted text-xs mt-0.5">Before goal allocations</p>
          </div>

          {!monthIncome && (
            <div className="px-4 py-3 bg-warning-surface border-t border-[rgba(255,255,255,0.08)]">
              <p className="text-text-secondary text-xs text-center">
                Add your income for {monthYear} to see your savings rate
              </p>
            </div>
          )}
        </div>

        {/* Savings goals */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text-primary font-semibold">Savings goals</h2>
            <button
              onClick={() => setShowAddGoal(!showAddGoal)}
              className="text-primary text-sm font-medium min-h-[44px] flex items-center gap-1"
            >
              + Add goal
            </button>
          </div>

          {showAddGoal && (
            <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4 space-y-3 mb-3">
              <input
                type="text"
                value={newGoalName}
                onChange={(e) => setNewGoalName(e.target.value)}
                placeholder="Goal name (e.g. Emergency fund)"
                className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-2.5 text-text-primary text-sm min-h-[44px] focus:outline-none focus:border-primary"
              />
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={newGoalAllocated}
                  onChange={(e) => setNewGoalAllocated(e.target.value)}
                  placeholder="Already saved (optional)"
                  className="w-full pl-8 pr-4 py-2.5 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg text-text-primary text-sm min-h-[44px] focus:outline-none focus:border-primary tabular-nums"
                />
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(e.target.value)}
                  placeholder="Target amount (optional)"
                  className="w-full pl-8 pr-4 py-2.5 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg text-text-primary text-sm min-h-[44px] focus:outline-none focus:border-primary tabular-nums"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveGoal}
                  disabled={savingGoal || !newGoalName.trim()}
                  className="flex-1 bg-primary text-white font-medium text-sm rounded-xl min-h-[44px] disabled:opacity-60"
                >
                  Create goal
                </button>
                <button
                  onClick={() => setShowAddGoal(false)}
                  className="px-4 text-text-secondary text-sm min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {savingsGoals.length === 0 && !showAddGoal ? (
            <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-6 text-center">
              <p className="text-text-muted text-sm">No savings goals yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savingsGoals.map((goal) => {
                const bal = goalBalances.get(goal.id) ?? { balance: 0, deposited: 0, withdrawn: 0, transactions: [] };
                const { balance, deposited, withdrawn, transactions } = bal;
                const pct = goal.target_amount
                  ? Math.min((balance / Number(goal.target_amount)) * 100, 100)
                  : null;
                const monthAlloc = monthAllocations.find((a) => a.goal_id === goal.id);
                const isHistoryOpen = expandedHistory === goal.id;
                const isDepositOpen = txForm?.goalId === goal.id && txForm.type === "deposit";
                const isWithdrawOpen = txForm?.goalId === goal.id && txForm.type === "withdrawal";

                return (
                  <div key={goal.id} className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
                    <div className="p-4 space-y-3">
                      {/* Goal name + running balance */}
                      <div className="flex items-center justify-between">
                        <p className="text-text-primary font-semibold">{goal.name}</p>
                        <p className="text-text-primary font-bold text-lg">
                          {formatCurrency(balance)}
                        </p>
                      </div>

                      {/* Progress bar */}
                      {goal.target_amount && (
                        <>
                          <div className="flex justify-between text-xs text-text-muted">
                            <span>Remaining</span>
                            <span>Target: {formatCurrency(goal.target_amount)}</span>
                          </div>
                          <div className="h-2 bg-[rgba(255,255,255,0.08)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct ?? 0}%` }}
                            />
                          </div>
                        </>
                      )}

                      {/* Breakdown */}
                      <div className="flex gap-4 text-xs text-text-muted">
                        <span>
                          <span className="text-success">↑</span>{" "}
                          Deposited {formatCurrency(deposited)}
                        </span>
                        {withdrawn > 0 && (
                          <span>
                            <span className="text-danger">↓</span>{" "}
                            Withdrawn {formatCurrency(withdrawn)}
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => openTxForm(goal.id, "deposit")}
                          className={`flex-1 text-xs font-medium rounded-lg min-h-[36px] border transition-colors ${
                            isDepositOpen
                              ? "bg-success text-white border-success"
                              : "bg-elevated border-[rgba(255,255,255,0.08)] text-text-secondary"
                          }`}
                        >
                          + Deposit
                        </button>
                        <button
                          onClick={() => openTxForm(goal.id, "withdrawal")}
                          className={`flex-1 text-xs font-medium rounded-lg min-h-[36px] border transition-colors ${
                            isWithdrawOpen
                              ? "bg-danger text-white border-danger"
                              : "bg-elevated border-[rgba(255,255,255,0.08)] text-text-secondary"
                          }`}
                        >
                          − Withdraw
                        </button>
                        <button
                          onClick={() =>
                            setExpandedHistory(isHistoryOpen ? null : goal.id)
                          }
                          className={`px-3 text-xs font-medium rounded-lg min-h-[36px] border transition-colors ${
                            isHistoryOpen
                              ? "bg-primary text-white border-primary"
                              : "bg-elevated border-[rgba(255,255,255,0.08)] text-text-secondary"
                          }`}
                        >
                          History ({transactions.length})
                        </button>
                      </div>

                      {/* Transaction form */}
                      {(isDepositOpen || isWithdrawOpen) && (
                        <div className="pt-1 space-y-2 border-t border-[rgba(255,255,255,0.08)]">
                          <p className="text-xs font-medium text-text-secondary pt-1">
                            {isDepositOpen ? "Log a deposit" : "Log a withdrawal"}
                          </p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={txAmount}
                              onChange={(e) => setTxAmount(e.target.value)}
                              placeholder="Amount"
                              autoFocus
                              className="w-full pl-7 pr-3 py-2 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg text-sm min-h-[40px] focus:outline-none focus:border-primary tabular-nums"
                            />
                          </div>
                          <input
                            type="text"
                            value={txNote}
                            onChange={(e) => setTxNote(e.target.value)}
                            placeholder="Note (optional)"
                            className="w-full px-3 py-2 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg text-sm min-h-[40px] focus:outline-none focus:border-primary"
                          />
                          <input
                            type="date"
                            value={txDate}
                            onChange={(e) => setTxDate(e.target.value)}
                            className="w-full px-3 py-2 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg text-sm min-h-[40px] focus:outline-none focus:border-primary"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveTransaction}
                              disabled={savingTx || !txAmount}
                              className={`flex-1 text-white font-medium text-sm rounded-xl min-h-[40px] disabled:opacity-60 ${
                                isDepositOpen ? "bg-success" : "bg-danger"
                              }`}
                            >
                              {savingTx ? "Saving…" : isDepositOpen ? "Log deposit" : "Log withdrawal"}
                            </button>
                            <button
                              onClick={() => setTxForm(null)}
                              className="px-4 text-text-secondary text-sm min-h-[40px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Monthly allocation input (feeds income summary) */}
                      <div className="border-t border-[rgba(255,255,255,0.08)] pt-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <p className="text-text-muted text-xs mb-1">This month's allocation</p>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">$</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                defaultValue={monthAlloc?.manual_amount ?? ""}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  saveAllocation(goal.id, val);
                                }}
                                placeholder="0.00"
                                className="w-full pl-6 pr-3 py-2 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg text-sm text-right min-h-[40px] focus:outline-none focus:border-primary tabular-nums"
                              />
                            </div>
                          </div>
                          {unallocatedCash > 0 && (
                            <div className="text-right flex-shrink-0">
                              <p className="text-text-muted text-xs">Suggestion</p>
                              <p className="text-primary text-sm font-medium">{formatCurrency(unallocatedCash)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Transaction history */}
                    {isHistoryOpen && (
                      <div className="border-t border-[rgba(255,255,255,0.08)]">
                        {transactions.length === 0 ? (
                          <p className="px-4 py-3 text-text-muted text-xs text-center">No transactions yet</p>
                        ) : (
                          <div>
                            {transactions.map((tx) => (
                              <div
                                key={tx.id}
                                className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.08)] last:border-b-0"
                              >
                                <span
                                  className={`text-base flex-shrink-0 ${
                                    tx.transaction_type === "deposit" ? "text-success" : "text-danger"
                                  }`}
                                >
                                  {tx.transaction_type === "deposit" ? "↑" : "↓"}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-text-primary text-sm font-medium">
                                    {tx.transaction_type === "deposit" ? "Deposit" : "Withdrawal"}
                                    {tx.note ? ` — ${tx.note}` : ""}
                                  </p>
                                  <p className="text-text-muted text-xs">{formatDate(tx.transaction_date)}</p>
                                </div>
                                <span
                                  className={`font-semibold text-sm flex-shrink-0 ${
                                    tx.transaction_type === "deposit" ? "text-success" : "text-danger"
                                  }`}
                                >
                                  {tx.transaction_type === "deposit" ? "+" : "−"}
                                  {formatCurrency(tx.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Individual expenses */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text-primary font-semibold">Personal expenses</h2>
            <button
              onClick={() => router.push("/me/add-expense")}
              className="text-primary text-sm font-medium min-h-[44px] flex items-center"
            >
              + Add
            </button>
          </div>

          {/* Category filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mb-3">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium min-h-[32px] ${
                categoryFilter === "all"
                  ? "bg-primary text-white"
                  : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
              }`}
            >
              All
            </button>
            {individualCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium min-h-[32px] ${
                  categoryFilter === cat.id
                    ? "bg-primary text-white"
                    : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-6 text-center">
              <p className="text-text-muted text-sm">No personal expenses this month</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="bg-card-bg hover:bg-elevated rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-medium truncate">
                      {expense.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {expense.individual_categories?.name && (
                        <span className="text-[11px] bg-primary-light text-primary px-1.5 py-0.5 rounded">
                          {expense.individual_categories.name}
                        </span>
                      )}
                      <span className="text-text-muted text-xs">
                        {formatDate(expense.expense_date)}
                      </span>
                      <span className="text-text-muted text-xs">
                        {expense.is_visible_to_partner ? "visible" : "private"}
                      </span>
                    </div>
                  </div>
                  <span className="text-text-primary font-semibold text-sm flex-shrink-0">
                    {formatCurrency(expense.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-4" />
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
