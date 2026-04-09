"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import { Toast, useToast } from "@/components/ui/Toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatCurrency } from "@/lib/utils/format";
import type { JointCategory, Profile } from "@/types/database";

interface ParsedRowResult {
  row: { date: string; merchant: string; amount: number; raw: string };
  isDuplicate: boolean;
  matchedExpense?: { id: string; description: string; expense_date: string; amount: number };
}

interface ReviewRow extends ParsedRowResult {
  categoryId: string;
  type: "joint" | "individual";
  confidence: number;
  checked: boolean;
  aiError?: boolean;
}

interface UploadClientProps {
  currentUserId: string;
  categories: Pick<JointCategory, "id" | "name">[];
  profiles: Pick<Profile, "id" | "display_name">[];
}

type Step = 1 | 2 | 3;

export default function UploadClient({
  currentUserId,
  categories,
  profiles,
}: UploadClientProps) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [pasteText, setPasteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [activeTab, setActiveTab] = useState<"review" | "all">("review");
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [importing, setImporting] = useState(false);

  async function handleFileUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      showToast("File too large. Maximum size is 5MB.", "error");
      return;
    }
    if (!["text/csv", "text/plain"].includes(file.type)) {
      showToast("Invalid file type. Please upload a CSV or plain text file.", "error");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }

      const data = await response.json();
      await processUploadedRows(data.rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      showToast(msg, "error");
    } finally {
      setUploading(false);
    }
  }

  async function handlePasteSubmit() {
    if (!pasteText.trim()) {
      showToast("Please paste some content first", "error");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Parse failed");
      }

      const data = await response.json();
      await processUploadedRows(data.rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parse failed";
      showToast(msg, "error");
    } finally {
      setUploading(false);
    }
  }

  async function processUploadedRows(uploadedRows: ParsedRowResult[]) {
    setCategorizing(true);
    setStep(2);

    const reviewRows: ReviewRow[] = uploadedRows.map((r) => ({
      ...r,
      categoryId: "",
      type: "joint" as const,
      confidence: 0,
      checked: !r.isDuplicate,
    }));

    setRows(reviewRows);

    // Categorize each row via AI
    let aiFailures = 0;
    const categorizedRows = [...reviewRows];

    for (let i = 0; i < categorizedRows.length; i++) {
      try {
        const response = await fetch("/api/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantName: categorizedRows[i].row.merchant }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.error === "ai_unavailable") {
            aiFailures++;
          } else {
            categorizedRows[i] = {
              ...categorizedRows[i],
              categoryId: data.categoryId ?? "",
              type: data.type ?? "joint",
              confidence: data.confidence ?? 0,
            };
          }
        }
      } catch {
        aiFailures++;
      }
      // Update incrementally
      setRows([...categorizedRows]);
    }

    if (aiFailures > 0) {
      setAiUnavailable(true);
    }

    setCategorizing(false);
    setActiveTab(categorizedRows.some((r) => r.confidence < 0.7 && !r.isDuplicate) ? "review" : "all");
  }

  function updateRow(index: number, updates: Partial<ReviewRow>) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }

  async function handleImport() {
    const toImport = rows.filter((r) => r.checked && r.type === "joint");

    if (toImport.length === 0) {
      showToast("No expenses selected to import", "error");
      return;
    }

    setImporting(true);
    try {
      // Save corrections to AI memory
      const correctedRows = rows.filter((r) => r.checked && r.categoryId && r.confidence < 0.9);
      for (const row of correctedRows) {
        await fetch("/api/categorize", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantName: row.row.merchant,
            categoryId: row.categoryId,
            type: row.type,
          }),
        });
      }

      // Create import batch
      const supabase = getSupabaseBrowserClient();
      const { data: batch } = await supabase
        .from("import_batches")
        .insert({
          uploaded_by: currentUserId,
          file_name: "statement",
          row_count: toImport.length,
        })
        .select()
        .single();

      // Import expenses
      const batchId = batch?.id;
      for (const row of toImport) {
        const expenseDate = row.row.date;
        const monthYear = format(new Date(expenseDate), "yyyy-MM");
        await supabase.from("joint_expenses").insert({
          description: row.row.merchant,
          amount: row.row.amount,
          category_id: row.categoryId || null,
          expense_date: expenseDate,
          month_year: monthYear,
          paid_by: paidBy,
          entered_by: currentUserId,
          source: "upload",
          import_batch_id: batchId,
        });
      }

      showToast(`Imported ${toImport.length} expenses`, "success");
      setStep(3);
    } catch (err) {
      console.error(err);
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setImporting(false);
    }
  }

  const needsReview = rows.filter((r) => r.confidence < 0.7 && !r.isDuplicate);
  const toImport = rows.filter((r) => r.checked && r.type === "joint");
  const duplicates = rows.filter((r) => r.isDuplicate);
  const displayRows = activeTab === "review" ? needsReview : rows;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Import Statement" backHref="/expenses" />

      {/* Step indicator */}
      <div className="flex items-center px-4 py-3 bg-card-bg border-b border-[rgba(255,255,255,0.08)] gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                step === s
                  ? "bg-primary text-white"
                  : step > s
                  ? "bg-primary-light text-primary"
                  : "bg-elevated text-text-muted"
              }`}
            >
              {step > s ? "✓" : s}
            </div>
            <span className={`text-xs font-medium ${step === s ? "text-text-primary" : "text-text-muted"}`}>
              {s === 1 ? "Upload" : s === 2 ? "Review" : "Confirm"}
            </span>
            {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? "bg-primary" : "bg-[rgba(255,255,255,0.08)]"}`} />}
          </div>
        ))}
      </div>

      <div className="px-4 py-4">
        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-elevated rounded-xl p-4 text-sm text-text-secondary">
              <strong className="text-text-primary">PC Mastercard?</strong> Download as CSV from pcfinancial.ca, or upload the PDF to Claude.ai and ask it to convert to CSV, then paste here.
            </div>

            {/* Who paid */}
            <div>
              <p className="text-text-secondary text-sm font-medium mb-2">Statement belongs to:</p>
              <div className="flex gap-3">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => setPaidBy(profile.id)}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold min-h-[44px] ${
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

            {/* File upload */}
            <div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-[rgba(255,255,255,0.12)] rounded-2xl p-8 text-center hover:border-primary/40 transition-colors disabled:opacity-60 min-h-[44px]"
              >
                <svg className="w-10 h-10 text-text-muted mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-text-primary font-medium">Upload CSV file</p>
                <p className="text-text-muted text-xs mt-1">Max 5MB · CSV or plain text only</p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
              <span className="text-text-muted text-sm">or</span>
              <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
            </div>

            {/* Paste text */}
            <div>
              <p className="text-text-secondary text-sm font-medium mb-2">Paste converted text</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste CSV or tab-separated data here..."
                rows={6}
                className="w-full bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-3 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              />
              <button
                onClick={handlePasteSubmit}
                disabled={uploading || !pasteText.trim()}
                className="w-full mt-2 bg-primary text-white font-bold rounded-xl min-h-[48px] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {uploading && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {uploading ? "Processing…" : "Parse and review"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="space-y-4">
            {aiUnavailable && (
              <div className="bg-warning-surface border border-warning/30 rounded-2xl p-3 text-sm text-text-primary">
                AI categorization is unavailable right now. Please categorize these expenses manually.
              </div>
            )}

            {/* Tabs */}
            <div className="flex bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-1">
              <button
                onClick={() => setActiveTab("review")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
                  activeTab === "review" ? "bg-primary text-white" : "text-text-secondary"
                }`}
              >
                Needs review ({needsReview.length})
              </button>
              <button
                onClick={() => setActiveTab("all")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] ${
                  activeTab === "all" ? "bg-primary text-white" : "text-text-secondary"
                }`}
              >
                All ({rows.length})
              </button>
            </div>

            {categorizing && (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
                <p className="text-text-secondary text-sm">AI is categorizing…</p>
              </div>
            )}

            {/* Row list */}
            <div className="space-y-2">
              {displayRows.map((row, idx) => {
                const globalIdx = rows.indexOf(row);
                return (
                  <div
                    key={idx}
                    className={`bg-card-bg border rounded-xl p-3 space-y-2 ${
                      row.isDuplicate ? "border-warning/40 bg-warning-surface/30" : "border-[rgba(255,255,255,0.08)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={(e) => updateRow(globalIdx, { checked: e.target.checked })}
                        className="w-5 h-5 rounded accent-primary flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-text-primary text-sm font-medium truncate">
                            {row.row.merchant}
                          </p>
                          {row.isDuplicate && (
                            <span className="text-[10px] font-bold bg-warning/20 text-warning px-1.5 py-0.5 rounded-md flex-shrink-0">
                              duplicate?
                            </span>
                          )}
                        </div>
                        <p className="text-text-muted text-xs">
                          {row.row.date} · {formatCurrency(row.row.amount)}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <select
                        value={row.categoryId}
                        onChange={(e) => updateRow(globalIdx, { categoryId: e.target.value })}
                        className="flex-1 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-3 py-2 text-xs text-text-primary min-h-[36px] focus:outline-none focus:border-primary"
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>

                      <div className="flex bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg overflow-hidden">
                        <button
                          onClick={() => updateRow(globalIdx, { type: "joint" })}
                          className={`px-3 text-xs font-medium min-h-[36px] transition-colors ${
                            row.type === "joint"
                              ? "bg-primary text-white"
                              : "text-text-secondary"
                          }`}
                        >
                          Joint
                        </button>
                        <button
                          onClick={() => updateRow(globalIdx, { type: "individual" })}
                          className={`px-3 text-xs font-medium min-h-[36px] transition-colors ${
                            row.type === "individual"
                              ? "bg-primary text-white"
                              : "text-text-secondary"
                          }`}
                        >
                          Individual
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setStep(3)}
              disabled={categorizing}
              className="w-full bg-primary text-white font-bold rounded-2xl min-h-[52px] disabled:opacity-60"
            >
              Continue to confirm
            </button>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl p-4 space-y-2">
              <h3 className="text-text-primary font-semibold">Summary</h3>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Expenses to import</span>
                <span className="text-text-primary font-medium">{toImport.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Duplicates skipped</span>
                <span className="text-warning font-medium">{rows.filter((r) => r.isDuplicate && !r.checked).length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Individual (not imported)</span>
                <span className="text-text-muted font-medium">{rows.filter((r) => r.checked && r.type === "individual").length}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-[rgba(255,255,255,0.08)] pt-2">
                <span className="text-text-secondary font-medium">Total amount</span>
                <span className="text-text-primary font-semibold">
                  {formatCurrency(toImport.reduce((sum, r) => sum + r.row.amount, 0))}
                </span>
              </div>
            </div>

            {/* Final list */}
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={idx} className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => updateRow(idx, { checked: e.target.checked })}
                    className="w-5 h-5 rounded accent-primary flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {row.row.merchant}
                    </p>
                    <p className="text-text-muted text-xs">
                      {categories.find((c) => c.id === row.categoryId)?.name ?? "Uncategorized"} · {row.row.date}
                    </p>
                  </div>
                  <span className="text-text-primary font-semibold text-sm flex-shrink-0">
                    {formatCurrency(row.row.amount)}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handleImport}
              disabled={importing || toImport.length === 0}
              className="w-full bg-primary text-white font-bold rounded-2xl min-h-[52px] text-base disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {importing && (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Import {toImport.length} expense{toImport.length !== 1 ? "s" : ""}
            </button>

            <button
              onClick={() => {
                router.push("/expenses");
                router.refresh();
              }}
              className="w-full text-text-secondary py-3 min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="h-4" />
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
