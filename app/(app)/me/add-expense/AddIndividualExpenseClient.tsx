"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import { Toast, useToast } from "@/components/ui/Toast";
import { sanitizeText } from "@/lib/utils/sanitize";
import type { IndividualCategory } from "@/types/database";

interface Props {
  currentUserId: string;
  categories: Pick<IndividualCategory, "id" | "name">[];
}

export default function AddIndividualExpenseClient({ currentUserId, categories }: Props) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isRecurring, setIsRecurring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      next.amount = "Amount must be greater than 0";
    }
    if (!categoryId) {
      next.category = "Please select a category";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/individual-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description: sanitizeText(description),
          categoryId,
          expenseDate,
          isRecurring,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }

      router.push("/me");
      router.refresh();
    } catch (err) {
      console.error(err);
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Add Personal Expense" backHref="/me" />

      <form onSubmit={handleSubmit} className="px-4 py-6 space-y-5">
        {/* Amount */}
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-2">
            Amount
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted font-medium">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg pl-8 pr-4 py-3.5 text-text-primary text-xl font-medium min-h-[56px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary tabular-nums"
            />
          </div>
          {errors.amount && (
            <p className="text-danger text-xs mt-1">{errors.amount}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-2">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Lunch with a friend"
            className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-3.5 text-text-primary min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-2">
            Category
          </label>
          <div className="relative">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-3.5 text-text-primary min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none"
            >
              <option value="">Select category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {/* chevron */}
            <svg
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {errors.category && (
            <p className="text-danger text-xs mt-1">{errors.category}</p>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-2">
            Date
          </label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-3.5 text-text-primary min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* Recurring toggle */}
        <div className="bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl">
          <label className="flex items-center justify-between px-4 py-4 cursor-pointer">
            <div>
              <p className="text-text-primary text-sm font-medium">Recurring</p>
              <p className="text-text-muted text-xs mt-0.5">
                Rolls over same amount each month automatically
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isRecurring}
              onClick={() => setIsRecurring((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                isRecurring ? "bg-primary" : "bg-[rgba(255,255,255,0.12)]"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  isRecurring ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white font-bold rounded-2xl min-h-[52px] text-base disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          Add expense
        </button>
      </form>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
