"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import { Toast, useToast } from "@/components/ui/Toast";
import { formatCurrency, formatMonthYear } from "@/lib/utils/format";
import type { Profile } from "@/types/database";

interface RequiredCategory {
  id: string;
  name: string;
}

interface ExistingExpense {
  category_id: string | null;
  month_year: string;
  amount: number;
  description: string;
}

interface MissingExpensesClientProps {
  currentUserId: string;
  requiredCategories: RequiredCategory[];
  existingExpenses: ExistingExpense[];
  profiles: Pick<Profile, "id" | "display_name">[];
  months: string[];
}

interface MissingEntry {
  categoryId: string;
  categoryName: string;
  monthYear: string;
  lastKnownAmount: number;
}

export default function MissingExpensesClient({
  currentUserId,
  requiredCategories,
  existingExpenses,
  profiles,
  months,
}: MissingExpensesClientProps) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [paidBy, setPaidBy] = useState(currentUserId);

  // Compute missing entries per category
  const missingByCategory = useMemo<
    Record<string, { categoryName: string; missing: MissingEntry[] }>
  >(() => {
    const result: Record<
      string,
      { categoryName: string; missing: MissingEntry[] }
    > = {};

    for (const cat of requiredCategories) {
      const presentMonths = new Set(
        existingExpenses
          .filter((e) => e.category_id === cat.id)
          .map((e) => e.month_year)
      );

      const missing: MissingEntry[] = [];
      for (const month of months) {
        if (!presentMonths.has(month)) {
          // Find last known amount for this category
          const lastKnown = existingExpenses
            .filter((e) => e.category_id === cat.id)
            .sort((a, b) => b.month_year.localeCompare(a.month_year))[0];

          missing.push({
            categoryId: cat.id,
            categoryName: cat.name,
            monthYear: month,
            lastKnownAmount: lastKnown ? Number(lastKnown.amount) : 0,
          });
        }
      }

      if (missing.length > 0) {
        result[cat.id] = { categoryName: cat.name, missing };
      }
    }

    return result;
  }, [requiredCategories, existingExpenses, months]);

  const totalMissing = Object.values(missingByCategory).reduce(
    (sum, { missing }) => sum + missing.length,
    0
  );

  async function addExpense(entry: MissingEntry) {
    const key = `${entry.categoryId}-${entry.monthYear}`;
    setSaving((prev) => new Set([...prev, key]));

    try {
      const expenseDate = `${entry.monthYear}-01`;
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: entry.lastKnownAmount || 0,
          description: entry.categoryName,
          categoryId: entry.categoryId,
          expenseDate,
          paidBy,
          isRecurring: false,
          isRequired: true,
          enteredBy: currentUserId,
          source: "backfill",
        }),
      });

      if (!response.ok) throw new Error("Failed to save");
      router.refresh();
    } catch {
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function addAllForCategory(categoryId: string) {
    const group = missingByCategory[categoryId];
    if (!group) return;

    for (const entry of group.missing) {
      await addExpense(entry);
    }
    showToast(`Added ${group.missing.length} expenses for ${group.categoryName}`, "success");
  }

  async function addAllMissing() {
    let count = 0;
    for (const { missing } of Object.values(missingByCategory)) {
      for (const entry of missing) {
        await addExpense(entry);
        count++;
      }
    }
    showToast(`Added ${count} expenses`, "success");
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Missing Expenses" backHref="/" />

      <div className="px-4 py-4 space-y-5">
        {/* Summary */}
        <div className="bg-warning-surface border border-warning/30 rounded-2xl p-4">
          <p className="text-text-primary font-semibold">
            {totalMissing} required entries missing
          </p>
          <p className="text-text-secondary text-sm mt-0.5">
            Across the last 12 months
          </p>
        </div>

        {/* Who paid selector */}
        <div>
          <p className="text-text-secondary text-xs font-medium mb-2">Backfill as paid by:</p>
          <div className="flex gap-2">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setPaidBy(profile.id)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold min-h-[44px] transition-colors ${
                  paidBy === profile.id
                    ? "bg-primary text-white"
                    : "bg-card-bg border border-[rgba(255,255,255,0.08)] text-text-secondary"
                }`}
              >
                {profile.display_name}
              </button>
            ))}
          </div>
        </div>

        {totalMissing === 0 ? (
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-8 text-center">
            <p className="text-success font-semibold">All caught up!</p>
            <p className="text-text-muted text-sm mt-1">No required expenses are missing.</p>
          </div>
        ) : (
          <>
            {/* Per category groups */}
            {Object.entries(missingByCategory).map(([categoryId, group]) => (
              <div key={categoryId} className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-card-bg border-b border-[rgba(255,255,255,0.08)]">
                  <div>
                    <p className="text-text-primary font-semibold text-sm">
                      {group.categoryName}
                    </p>
                    <p className="text-text-muted text-xs">
                      {group.missing.length} months missing
                    </p>
                  </div>
                  <button
                    onClick={() => addAllForCategory(categoryId)}
                    className="text-primary text-xs font-semibold px-3 py-2 bg-primary-light rounded-xl min-h-[36px]"
                  >
                    Add all
                  </button>
                </div>

                <div className="divide-y divide-[rgba(255,255,255,0.08)]">
                  {group.missing.map((entry) => {
                    const key = `${entry.categoryId}-${entry.monthYear}`;
                    const isSaving = saving.has(key);
                    return (
                      <div key={key} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-text-primary text-sm">
                            {formatMonthYear(entry.monthYear)}
                          </p>
                          {entry.lastKnownAmount > 0 && (
                            <p className="text-text-muted text-xs">
                              Last: {formatCurrency(entry.lastKnownAmount)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => addExpense(entry)}
                          disabled={isSaving}
                          className="flex items-center gap-1 text-primary text-xs font-medium bg-primary-light px-3 py-2 rounded-xl min-h-[36px] disabled:opacity-60"
                        >
                          {isSaving ? "Adding…" : `+ Add${entry.lastKnownAmount > 0 ? ` ${formatCurrency(entry.lastKnownAmount)}` : ""}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Global add all */}
            <button
              onClick={addAllMissing}
              className="w-full bg-primary text-white font-bold rounded-2xl min-h-[52px] text-base"
            >
              Add all missing at last known amounts
            </button>
          </>
        )}

        <div className="h-4" />
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
