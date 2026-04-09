"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  calculateBalance,
  formatBalanceText,
  enrichExpensesWithCategoryRatios,
} from "@/lib/utils/balance";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { HouseholdMembers, SplitRatio, JointExpense, Payment, CategoryRatioHistory } from "@/types/database";

interface SettleUpClientProps {
  currentUserId: string;
  householdMembers: HouseholdMembers | null;
  allExpenses: Pick<JointExpense, "id" | "amount" | "paid_by" | "expense_date" | "category_id">[];
  allPayments: Payment[];
  splitRatios: SplitRatio[];
  categoryRatioHistory: CategoryRatioHistory[];
}

export default function SettleUpClient({
  currentUserId,
  householdMembers,
  allExpenses,
  allPayments,
  splitRatios,
  categoryRatioHistory,
}: SettleUpClientProps) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [paymentNote, setPaymentNote] = useState("");

  const user1 = householdMembers?.user1 ?? null;
  const user2 = householdMembers?.user2 ?? null;

  const enrichedExpenses = useMemo(
    () => enrichExpensesWithCategoryRatios(allExpenses, categoryRatioHistory),
    [allExpenses, categoryRatioHistory]
  );

  const balance = useMemo(() => {
    if (!user1 || !user2) return null;
    return calculateBalance(
      enrichedExpenses,
      allPayments,
      splitRatios,
      user1.id,
      user2.id
    );
  }, [enrichedExpenses, allPayments, splitRatios, user1, user2]);

  const balanceText = useMemo(() => {
    if (!balance || !user1 || !user2) return null;
    return formatBalanceText(balance, user1.display_name, user2.display_name);
  }, [balance, user1, user2]);

  const suggestedAmount = balance?.amount.toFixed(2) ?? "0.00";

  function getPaymentDirection(): { paidBy: string; paidTo: string } | null {
    if (!balance || !user1 || !user2) return null;
    if (balance.direction === "user2_owes_user1") {
      return { paidBy: user2.id, paidTo: user1.id };
    } else if (balance.direction === "user1_owes_user2") {
      return { paidBy: user1.id, paidTo: user2.id };
    }
    return null;
  }

  async function handleRecordPayment() {
    const direction = getPaymentDirection();
    if (!direction) return;

    const amount = parseFloat(paymentAmount || suggestedAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast("Please enter a valid amount", "error");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          paidBy: direction.paidBy,
          paidTo: direction.paidTo,
          paymentDate,
          note: paymentNote || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to save payment");

      showToast("Payment recorded!", "success");
      router.refresh();
      setPaymentAmount("");
      setPaymentNote("");
    } catch (err) {
      console.error(err);
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  const allProfiles = [user1, user2].filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Settle Up" backHref="/" />

      <div className="px-4 py-6 space-y-5">
        {/* Balance display */}
        <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] border-l-4 border-l-primary rounded-xl p-5">
          <p className="text-text-secondary text-xs mb-1">Current balance</p>
          <p className="text-text-primary font-medium text-3xl tabular-nums">
            {balance ? formatCurrency(balance.amount.toNumber()) : "—"}
          </p>
          <p className="text-text-secondary text-sm mt-1">
            {!user2
              ? "Invite your partner to track the balance"
              : (balanceText ?? "All settled up")}
          </p>
          {balance && (
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="text-primary text-xs mt-3 min-h-[44px] flex items-center"
            >
              {showBreakdown ? "Hide details" : "How is this calculated?"} ↕
            </button>
          )}
        </div>

        {/* Breakdown */}
        {showBreakdown && balance && user1 && user2 && (
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4 space-y-3">
            <h3 className="text-text-primary font-semibold text-sm">
              Balance breakdown
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>{user1.display_name}&apos;s total obligation</span>
                <span>{formatCurrency(balance.user1Owed.toNumber())}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>{user2.display_name}&apos;s total obligation</span>
                <span>{formatCurrency(balance.user2Owed.toNumber())}</span>
              </div>
              <div className="border-t border-[rgba(255,255,255,0.08)] pt-2 flex justify-between text-text-secondary">
                <span>Total payments made</span>
                <span>-{formatCurrency(balance.totalPayments.toNumber())}</span>
              </div>
              <div className="border-t border-[rgba(255,255,255,0.08)] pt-2 flex justify-between font-semibold text-text-primary">
                <span>Net balance</span>
                <span>{balanceText}</span>
              </div>
            </div>
            <p className="text-text-muted text-xs">
              Positive = {user2.display_name} owes {user1.display_name}. Ratio
              changes apply per expense date.
            </p>
          </div>
        )}

        {/* Log a payment */}
        {balance?.direction !== "settled" && user2 && (
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4 space-y-4">
            <h3 className="text-text-primary font-semibold">Record a payment</h3>

            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1.5">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={suggestedAmount}
                  className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg pl-8 pr-4 py-3 text-text-primary text-lg font-medium min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-3 text-text-primary min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1.5">
                Note (optional)
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="e.g. Paycheque transfer"
                className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-3 text-text-primary min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <button
              onClick={handleRecordPayment}
              disabled={loading}
              className="w-full bg-primary text-white font-bold rounded-xl min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Record payment
            </button>

            <p className="text-text-muted text-xs text-center">
              Partial payments are fine — the remainder stays as the running
              balance.
            </p>
          </div>
        )}

        {/* Payment history */}
        <div>
          <h3 className="text-text-primary font-semibold mb-3">Payment history</h3>
          {allPayments.length === 0 ? (
            <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-6 text-center">
              <p className="text-text-muted text-sm">No payments recorded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allPayments.map((payment) => {
                const payer = allProfiles.find((p) => p?.id === payment.paid_by);
                const recipient = allProfiles.find(
                  (p) => p?.id === payment.paid_to
                );
                const isCurrentUser = payment.paid_by === currentUserId;
                return (
                  <div
                    key={payment.id}
                    className="bg-card-bg hover:bg-elevated rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-text-primary text-sm font-medium">
                          {payer?.display_name ?? "Unknown"} →{" "}
                          {recipient?.display_name ?? "Unknown"}
                        </p>
                        <p className="text-text-muted text-xs mt-0.5">
                          {formatDate(payment.payment_date)}
                          {payment.note ? ` · ${payment.note}` : ""}
                        </p>
                        <p className="text-text-muted text-xs">
                          {isCurrentUser
                            ? "You recorded"
                            : `${payer?.display_name ?? "Partner"} recorded`}
                        </p>
                      </div>
                      <span className="text-text-primary font-semibold">
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
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
