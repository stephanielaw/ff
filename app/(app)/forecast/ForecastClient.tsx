"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { generateForecast } from "@/lib/utils/expenses";
import { formatCurrency } from "@/lib/utils/format";
import { sanitizeText } from "@/lib/utils/sanitize";
import { Toast, useToast } from "@/components/ui/Toast";
import type { JointCategory, ForecastOverride } from "@/types/database";

interface ForecastClientProps {
  nextYear: number;
  expenses: { category_id: string | null; amount: number; month_year: string }[];
  categories: Pick<JointCategory, "id" | "name">[];
  existingOverrides: ForecastOverride[];
}

interface ForecastRow {
  categoryId: string;
  categoryName: string;
  avgMonthly: number;
  annualForecast: number;
  overrideAmount: number | null;
  note: string;
  monthsOfData: number;
  isDirty: boolean;
}

export default function ForecastClient({
  nextYear,
  expenses,
  categories,
  existingOverrides,
}: ForecastClientProps) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);

  const baseForecast = useMemo(
    () => generateForecast(expenses, categories, 12),
    [expenses, categories]
  );

  const [rows, setRows] = useState<ForecastRow[]>(() => {
    return baseForecast.map((f) => {
      const override = existingOverrides.find((o) => o.category_id === f.categoryId);
      return {
        categoryId: f.categoryId,
        categoryName: f.categoryName,
        avgMonthly: f.avgMonthly,
        annualForecast: f.annualForecast,
        overrideAmount: override?.forecasted_amount ?? null,
        note: override?.note ?? "",
        monthsOfData: f.monthsOfData,
        isDirty: false,
      };
    });
  });

  function getEffectiveAmount(row: ForecastRow): number {
    return row.overrideAmount ?? row.annualForecast;
  }

  const totalForecast = rows.reduce((sum, r) => sum + getEffectiveAmount(r), 0);

  function updateRow(categoryId: string, updates: Partial<ForecastRow>) {
    setRows((prev) =>
      prev.map((r) =>
        r.categoryId === categoryId ? { ...r, ...updates, isDirty: true } : r
      )
    );
  }

  function resetRow(categoryId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.categoryId === categoryId
          ? { ...r, overrideAmount: null, isDirty: false }
          : r
      )
    );
  }

  function resetAll() {
    setRows((prev) =>
      prev.map((r) => ({ ...r, overrideAmount: null, isDirty: false }))
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const dirtyRows = rows.filter((r) => r.isDirty);

      for (const row of dirtyRows) {
        await supabase.from("forecast_overrides").upsert(
          {
            year: nextYear,
            category_id: row.categoryId,
            forecasted_amount: row.overrideAmount ?? row.annualForecast,
            note: row.note ? sanitizeText(row.note) : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "year,category_id" }
        );
      }

      showToast("Forecast saved", "success");
      setRows((prev) => prev.map((r) => ({ ...r, isDirty: false })));
    } catch {
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const hasDirtyRows = rows.some((r) => r.isDirty);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card-bg border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-medium text-text-primary">Forecast</h1>
            <p className="text-text-muted text-xs">{nextYear}</p>
          </div>
          {hasDirtyRows && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-xl min-h-[40px] disabled:opacity-60 flex items-center gap-1"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Annual total */}
        <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] border-l-4 border-l-primary rounded-xl p-4">
          <p className="text-text-secondary text-xs">Total forecast {nextYear}</p>
          <p className="text-text-primary font-medium text-3xl mt-1 tabular-nums">
            {formatCurrency(totalForecast)}
          </p>
          <p className="text-text-muted text-xs mt-1">
            Based on last 12 months of data
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-elevated rounded-xl p-3 text-sm text-text-secondary">
          Tap any amount to edit. Tap the note field to add context like "Daycare ends June {nextYear}".
        </div>

        {/* Forecast table */}
        {rows.length === 0 ? (
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-8 text-center">
            <p className="text-text-muted text-sm">
              No historical data found. Add expenses to generate a forecast.
            </p>
          </div>
        ) : (
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
            {rows.map((row, i) => {
              const effectiveAmount = getEffectiveAmount(row);
              const hasOverride = row.overrideAmount !== null;
              return (
                <div
                  key={row.categoryId}
                  className={`border-b last:border-b-0 border-[rgba(255,255,255,0.08)] ${
                    hasOverride ? "bg-primary-light" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-text-primary text-sm font-medium">
                          {row.categoryName}
                        </p>
                        {hasOverride && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium flex-shrink-0">
                            edited
                          </span>
                        )}
                      </div>
                      <p className="text-text-muted text-xs">
                        {formatCurrency(row.avgMonthly)}/mo avg · {row.monthsOfData} months data
                      </p>
                    </div>

                    <div className="text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={hasOverride ? row.overrideAmount!.toFixed(2) : row.annualForecast.toFixed(2)}
                        onChange={(e) =>
                          updateRow(row.categoryId, {
                            overrideAmount: parseFloat(e.target.value) || 0,
                          })
                        }
                        className={`w-24 text-right bg-transparent border-b-2 font-semibold text-base focus:outline-none ${
                          hasOverride
                            ? "border-primary text-primary"
                            : "border-transparent text-text-primary"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Note row */}
                  <div className="px-4 pb-3">
                    <input
                      type="text"
                      value={row.note}
                      onChange={(e) =>
                        updateRow(row.categoryId, { note: e.target.value })
                      }
                      placeholder="Add a note…"
                      className="w-full text-xs text-text-muted bg-transparent border-b border-dashed border-[rgba(255,255,255,0.08)] focus:outline-none focus:border-primary py-1"
                    />
                  </div>

                  {hasOverride && (
                    <div className="px-4 pb-3">
                      <button
                        onClick={() => resetRow(row.categoryId)}
                        className="text-text-muted text-xs underline"
                      >
                        Reset to avg ({formatCurrency(row.annualForecast)})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reset all */}
        {rows.some((r) => r.overrideAmount !== null) && (
          <button
            onClick={resetAll}
            className="w-full py-3 text-text-secondary text-sm border border-[rgba(255,255,255,0.08)] rounded-xl min-h-[44px]"
          >
            Reset all to historical averages
          </button>
        )}

        <div className="h-4" />
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
