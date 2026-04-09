"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, addMonths, parseISO } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import { Toast, useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { JointExpense, JointCategory, Profile } from "@/types/database";

interface RecurringExpense extends JointExpense {
  joint_categories: { id: string; name: string } | null;
}

interface RecurringClientProps {
  currentUserId: string;
  recurringExpenses: RecurringExpense[];
  categories: Pick<JointCategory, "id" | "name">[];
  profiles: Pick<Profile, "id" | "display_name">[];
}

export default function RecurringClient({
  currentUserId,
  recurringExpenses,
  categories,
  profiles,
}: RecurringClientProps) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();
  const [deactivating, setDeactivating] = useState<string | null>(null);

  async function handleDeactivate(expenseId: string) {
    setDeactivating(expenseId);
    try {
      const supabase = getSupabaseBrowserClient();
      const today = format(new Date(), "yyyy-MM-dd");

      // Delete future children
      await supabase
        .from("joint_expenses")
        .delete()
        .eq("recurring_parent_id", expenseId)
        .gt("expense_date", today);

      // Update parent to not recurring
      await supabase
        .from("joint_expenses")
        .update({ is_recurring: false })
        .eq("id", expenseId);

      showToast("Recurring expense deactivated", "success");
      router.refresh();
    } catch {
      showToast("Something went wrong. Please try again.", "error");
    } finally {
      setDeactivating(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Recurring Expenses" backHref="/expenses" />

      <div className="px-4 py-4 space-y-3">
        {recurringExpenses.length === 0 ? (
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-8 text-center">
            <p className="text-text-muted text-sm">No recurring expenses set up</p>
            <Link
              href="/expenses/add"
              className="text-primary text-sm font-medium mt-2 block"
            >
              Add a recurring expense →
            </Link>
          </div>
        ) : (
          recurringExpenses.map((expense) => {
            const payer = profiles.find((p) => p.id === expense.paid_by);
            const nextMonth = format(
              addMonths(parseISO(expense.expense_date), 1),
              "MMMM yyyy"
            );

            return (
              <div
                key={expense.id}
                className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-text-primary font-semibold text-sm">
                        {expense.description}
                      </p>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-primary bg-primary-light px-1.5 py-0.5 rounded-md flex-shrink-0">
                        recurring
                      </span>
                    </div>
                    <p className="text-text-muted text-xs mt-0.5">
                      {expense.joint_categories?.name ?? "Uncategorized"} ·{" "}
                      {payer?.display_name ?? "Unknown"}
                    </p>
                    <p className="text-text-muted text-xs">
                      Next: {nextMonth}
                    </p>
                  </div>
                  <p className="text-text-primary font-bold text-base flex-shrink-0">
                    {formatCurrency(expense.amount)}
                  </p>
                </div>

                <div className="flex gap-3 mt-3">
                  <Link
                    href={`/expenses/add?edit=${expense.id}`}
                    className="flex-1 text-center py-2 bg-primary-light text-primary text-sm font-medium rounded-xl min-h-[40px] flex items-center justify-center"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDeactivate(expense.id)}
                    disabled={deactivating === expense.id}
                    className="flex-1 py-2 bg-danger-surface text-danger text-sm font-medium rounded-xl min-h-[40px] disabled:opacity-60"
                  >
                    {deactivating === expense.id ? "Stopping…" : "Stop recurring"}
                  </button>
                </div>
              </div>
            );
          })
        )}

        <div className="h-4" />
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
