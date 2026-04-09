"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import { Toast, useToast } from "@/components/ui/Toast";
import { sanitizeText } from "@/lib/utils/sanitize";
import type { Profile, JointCategory, JointExpense } from "@/types/database";

interface AddExpenseClientProps {
  currentUserId: string;
  profiles: Pick<Profile, "id" | "display_name" | "email">[];
  categories: Pick<JointCategory, "id" | "name">[];
  editExpense?: JointExpense | null;
  defaultCategoryId?: string;
}

export default function AddExpenseClient({
  currentUserId,
  profiles,
  categories,
  editExpense,
  defaultCategoryId,
}: AddExpenseClientProps) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();
  const isEdit = !!editExpense;

  const [amount, setAmount] = useState(editExpense?.amount?.toString() ?? "");
  const [description, setDescription] = useState(editExpense?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    editExpense?.category_id ?? defaultCategoryId ?? ""
  );
  const [expenseDate, setExpenseDate] = useState(
    editExpense?.expense_date ?? format(new Date(), "yyyy-MM-dd")
  );
  const [paidBy, setPaidBy] = useState(editExpense?.paid_by ?? currentUserId);
  const [isRecurring, setIsRecurring] = useState(editExpense?.is_recurring ?? false);
  const [isRequired, setIsRequired] = useState(editExpense?.is_required_monthly ?? false);
  const [isJoint, setIsJoint] = useState(true);
  const [recurringEditMode, setRecurringEditMode] = useState<"this" | "all" | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const otherUsers = profiles.filter((p) => p.id !== currentUserId);
  const currentProfile = profiles.find((p) => p.id === currentUserId);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = "Amount must be greater than 0";
    }
    if (!categoryId) {
      newErrors.category = "Please select a category";
    }
    if (!paidBy) {
      newErrors.paidBy = "Please select who paid";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    // If editing a recurring expense and mode not chosen yet
    if (isEdit && editExpense?.is_recurring && recurringEditMode === null) {
      // Show the prompt
      setRecurringEditMode("this");
      return;
    }

    setLoading(true);
    try {
      const body = {
        amount: parseFloat(amount),
        description: sanitizeText(description),
        categoryId,
        expenseDate,
        paidBy,
        isRecurring,
        isRequired,
        isJoint,
        editId: editExpense?.id,
        recurringEditMode,
        enteredBy: currentUserId,
      };

      const response = await fetch("/api/expenses", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save expense");
      }

      router.push("/expenses");
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
      <PageHeader
        title={isEdit ? "Edit Expense" : "Add Expense"}
        backHref="/expenses"
      />

      {/* Recurring edit mode prompt */}
      {isEdit && editExpense?.is_recurring && recurringEditMode === null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-card-bg border-t border-[rgba(255,255,255,0.08)] w-full rounded-t-3xl p-6 space-y-4">
            <h3 className="text-text-primary font-bold text-lg">Edit recurring expense</h3>
            <p className="text-text-secondary text-sm">Do you want to edit just this month, or all future months?</p>
            <div className="space-y-3">
              <button
                onClick={() => setRecurringEditMode("this")}
                className="w-full py-3.5 bg-primary text-white rounded-xl font-medium min-h-[44px]"
              >
                Edit this month only
              </button>
              <button
                onClick={() => setRecurringEditMode("all")}
                className="w-full py-3.5 bg-elevated border border-[rgba(255,255,255,0.08)] text-text-primary rounded-xl font-medium min-h-[44px]"
              >
                Edit all future months
              </button>
              <button
                onClick={() => router.back()}
                className="w-full py-3.5 text-text-secondary rounded-xl font-medium min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-4 py-6 space-y-5">
        {/* Joint/Individual toggle */}
        <div className="bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl p-1 flex">
          <button
            type="button"
            onClick={() => setIsJoint(true)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${
              isJoint ? "bg-primary text-white" : "text-text-secondary"
            }`}
          >
            Joint
          </button>
          <button
            type="button"
            onClick={() => setIsJoint(false)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${
              !isJoint ? "bg-primary text-white" : "text-text-secondary"
            }`}
          >
            Individual
          </button>
        </div>

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
            placeholder="e.g. Monthly mortgage payment"
            className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-3.5 text-text-primary min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-2">
            Category
          </label>
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

        {/* Who paid */}
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-2">
            Who paid?
          </label>
          <div className="flex gap-3">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setPaidBy(profile.id)}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${
                  paidBy === profile.id
                    ? "bg-primary text-white"
                    : "bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary"
                }`}
              >
                {profile.display_name}
              </button>
            ))}
          </div>
          {errors.paidBy && (
            <p className="text-danger text-xs mt-1">{errors.paidBy}</p>
          )}
        </div>

        {/* Toggles */}
        <div className="bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl divide-y divide-[rgba(255,255,255,0.08)]">
          <label className="flex items-center justify-between px-4 py-4 cursor-pointer">
            <div>
              <p className="text-text-primary text-sm font-medium">Recurring</p>
              <p className="text-text-muted text-xs mt-0.5">
                Rolls over same amount each month
              </p>
            </div>
            <div
              onClick={() => setIsRecurring(!isRecurring)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                isRecurring ? "bg-primary" : "bg-[rgba(255,255,255,0.12)]"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isRecurring ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </div>
          </label>

          <label className="flex items-center justify-between px-4 py-4 cursor-pointer">
            <div>
              <p className="text-text-primary text-sm font-medium">Required monthly</p>
              <p className="text-text-muted text-xs mt-0.5">
                Alert if missing by end of month
              </p>
            </div>
            <div
              onClick={() => setIsRequired(!isRequired)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                isRequired ? "bg-primary" : "bg-[rgba(255,255,255,0.12)]"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isRequired ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </div>
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white font-bold rounded-2xl min-h-[52px] text-base disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          {isEdit ? "Save changes" : "Add expense"}
        </button>
      </form>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
