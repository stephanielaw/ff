"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import PageHeader from "@/components/layout/PageHeader";
import { Toast, useToast } from "@/components/ui/Toast";
import { sanitizeText } from "@/lib/utils/sanitize";
import type {
  Profile,
  SplitRatio,
  JointCategory,
  IndividualCategory,
  HouseholdMembers,
  CategoryRatioHistory,
} from "@/types/database";

interface SettingsClientProps {
  currentUserId: string;
  userEmail: string;
  profile: Profile | null;
  splitRatios: SplitRatio[];
  jointCategories: JointCategory[];
  individualCategories: IndividualCategory[];
  categoryRatioHistory: CategoryRatioHistory[];
  householdMembers: HouseholdMembers | null;
}

interface RatioHistoryModal {
  categoryId: string;
  categoryName: string;
  categoryType: "joint" | "individual";
}

type CategoryTable = "joint_categories" | "individual_categories";

interface DeleteTarget {
  id: string;
  name: string;
  table: CategoryTable;
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 3.5h10M5.5 3.5V2h3v1.5M3 3.5l.75 8h6.5L11 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SettingsClient({
  currentUserId,
  userEmail,
  profile,
  splitRatios,
  jointCategories,
  individualCategories,
  categoryRatioHistory,
  householdMembers,
}: SettingsClientProps) {
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Global ratio modal
  const [showRatioModal, setShowRatioModal] = useState(false);
  const latestRatio = splitRatios[0];
  const [user1Pct, setUser1Pct] = useState(latestRatio?.user1_pct ?? 50);
  const [user2Pct, setUser2Pct] = useState(latestRatio?.user2_pct ?? 50);
  const [ratioEffectiveDate, setRatioEffectiveDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [savingRatio, setSavingRatio] = useState(false);

  // Categories — add new
  const [newJointCat, setNewJointCat] = useState("");
  const [newIndCat, setNewIndCat] = useState("");

  // Category — inline name editing
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  // Category — delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Category — ratio history modal
  const [ratioHistoryModal, setRatioHistoryModal] = useState<RatioHistoryModal | null>(null);
  const [newRatioInput, setNewRatioInput] = useState("");
  const [newRatioDate, setNewRatioDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [savingRatioEntry, setSavingRatioEntry] = useState(false);

  // Invite
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const partner =
    householdMembers?.user1.id === currentUserId
      ? householdMembers?.user2
      : householdMembers?.user1;

  const user1 = householdMembers?.user1;
  const user2 = householdMembers?.user2;

  // ── Profile ───────────────────────────────────────────────

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const response = await fetch("/api/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: sanitizeText(displayName) }),
      });
      if (!response.ok) throw new Error("Failed");
      showToast("Profile updated", "success");
      router.refresh();
    } catch {
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ── Global split ratio ────────────────────────────────────

  async function handleSaveRatio() {
    if (Math.abs(user1Pct + user2Pct - 100) > 0.01) {
      showToast("Percentages must add up to 100", "error");
      return;
    }
    setSavingRatio(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("split_ratios").insert({
        effective_date: ratioEffectiveDate,
        user1_pct: user1Pct,
        user2_pct: user2Pct,
        created_by: currentUserId,
      });
      if (error) throw error;
      showToast("Split ratio updated", "success");
      setShowRatioModal(false);
      router.refresh();
    } catch {
      showToast("Something went wrong saving. Please try again.", "error");
    } finally {
      setSavingRatio(false);
    }
  }

  // ── Invite ────────────────────────────────────────────────

  async function handleGenerateInvite() {
    setGeneratingInvite(true);
    try {
      const res = await fetch("/api/invite", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setInviteUrl(data.inviteUrl);
    } catch {
      showToast("Could not generate invite link. Please try again.", "error");
    } finally {
      setGeneratingInvite(false);
    }
  }

  async function handleCopyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  }

  // ── Joint category toggles ────────────────────────────────

  async function toggleJointCategory(id: string, isActive: boolean) {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("joint_categories")
      .update({ is_active: isActive })
      .eq("id", id);
    router.refresh();
  }

  async function toggleJointRequired(id: string, isRequired: boolean) {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("joint_categories")
      .update({ is_required_monthly: isRequired })
      .eq("id", id);
    router.refresh();
  }

  // ── Add categories ────────────────────────────────────────

  async function addJointCategory() {
    if (!newJointCat.trim()) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("joint_categories").insert({
      name: sanitizeText(newJointCat),
      sort_order: jointCategories.length + 1,
    });
    setNewJointCat("");
    showToast("Category added", "success");
    router.refresh();
  }

  async function addIndividualCategory() {
    if (!newIndCat.trim()) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("individual_categories").insert({
      name: sanitizeText(newIndCat),
      sort_order: individualCategories.length + 1,
    });
    setNewIndCat("");
    showToast("Category added", "success");
    router.refresh();
  }

  // ── Inline name editing ───────────────────────────────────

  function startEditName(id: string, currentName: string) {
    setEditingCatId(id);
    setEditingCatName(currentName);
    setRatioHistoryModal(null);
  }

  function cancelEditName() {
    setEditingCatId(null);
    setEditingCatName("");
  }

  async function saveCatName(id: string, table: CategoryTable) {
    const trimmed = editingCatName.trim();
    setEditingCatId(null);
    if (!trimmed) return;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from(table)
      .update({ name: sanitizeText(trimmed) })
      .eq("id", id);
    if (error) {
      showToast("Failed to save category name", "error");
    } else {
      router.refresh();
    }
  }

  // ── Category delete ───────────────────────────────────────

  async function confirmDeleteCategory() {
    if (!deleteTarget) return;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from(deleteTarget.table)
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      showToast("Failed to delete category", "error");
    } else {
      showToast("Category deleted", "success");
      router.refresh();
    }
    setDeleteTarget(null);
  }

  // ── Category ratio history ────────────────────────────────

  function parseRatioInput(value: string): number | null {
    // Accept "60/40", "60 / 40", "60 40"
    const parts = value
      .split(/[/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length !== 2) return null;
    const u1 = Number(parts[0]);
    const u2 = Number(parts[1]);
    if (isNaN(u1) || isNaN(u2) || u1 < 0 || u2 < 0) return null;
    if (Math.abs(u1 + u2 - 100) > 0.01) return null;
    return u1 / 100;
  }

  /** Returns history entries for a category, oldest first. */
  function getCategoryHistory(categoryId: string): CategoryRatioHistory[] {
    return [...categoryRatioHistory]
      .filter((h) => h.category_id === categoryId)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  }

  /** Returns the current effective ratio label for display, e.g. "60/40" or "Default". */
  function getCategoryRatioLabel(categoryId: string): string {
    const entries = [...categoryRatioHistory]
      .filter((h) => h.category_id === categoryId)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    if (entries.length === 0) return "Default";
    const u1 = Math.round(entries[0].ratio * 100);
    return `${u1}/${100 - u1}`;
  }

  function openRatioHistoryModal(
    categoryId: string,
    categoryName: string,
    categoryType: "joint" | "individual"
  ) {
    setRatioHistoryModal({ categoryId, categoryName, categoryType });
    setNewRatioInput("");
    setNewRatioDate(format(new Date(), "yyyy-MM-dd"));
    setEditingCatId(null);
  }

  async function addRatioEntry() {
    if (!ratioHistoryModal) return;
    const ratio = parseRatioInput(newRatioInput);
    if (ratio === null) {
      showToast("Enter two numbers that add up to 100, e.g. 60/40", "error");
      return;
    }
    setSavingRatioEntry(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("category_ratio_history").insert({
        category_id: ratioHistoryModal.categoryId,
        category_type: ratioHistoryModal.categoryType,
        ratio,
        effective_date: newRatioDate,
      });
      if (error) throw error;
      showToast("Ratio entry added", "success");
      setRatioHistoryModal(null);
      router.refresh();
    } catch {
      showToast("Failed to save ratio entry. Please try again.", "error");
    } finally {
      setSavingRatioEntry(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Settings" backHref="/" />

      <div className="px-4 py-4 space-y-6">
        {/* Profile */}
        <section>
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
            Profile
          </h2>
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-2xl p-4 space-y-3">
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1.5">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2.5 text-text-primary text-sm min-h-[44px] focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1">
                Google account
              </label>
              <p className="text-text-muted text-sm">{userEmail}</p>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full bg-primary text-white font-medium text-sm rounded-xl min-h-[44px] disabled:opacity-60"
            >
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </div>
        </section>

        {/* Household & Partner */}
        <section>
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
            Household
          </h2>
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-2xl p-4 space-y-4">
            {partner ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-dark flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {partner.display_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-text-primary font-medium text-sm">
                    {partner.display_name}
                  </p>
                  <p className="text-text-muted text-xs">{partner.email}</p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-text-secondary text-sm">
                  No partner connected yet.
                </p>
                <p className="text-text-muted text-xs mt-1">
                  Generate an invite link and share it with your partner.
                </p>
              </div>
            )}

            {/* Invite link generator */}
            <div className="border-t border-[rgba(255,255,255,0.08)] pt-4">
              <p className="text-text-secondary text-xs font-medium mb-2">
                {partner ? "Invite a different partner" : "Invite your partner"}
              </p>

              {inviteUrl ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteUrl}
                      readOnly
                      className="flex-1 bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-text-primary text-xs min-h-[44px] overflow-hidden text-ellipsis"
                    />
                    <button
                      onClick={handleCopyInvite}
                      className="bg-primary text-white text-sm font-medium px-4 rounded-xl min-h-[44px] flex-shrink-0"
                    >
                      {copiedInvite ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-text-muted text-xs">
                    This link expires in 30 days and can only be used once.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleGenerateInvite}
                  disabled={generatingInvite}
                  className="w-full bg-primary-light text-primary font-medium text-sm rounded-xl min-h-[44px] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {generatingInvite && (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-[#1D9E75] rounded-full animate-spin" />
                  )}
                  {generatingInvite ? "Generating…" : "Generate invite link"}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Split ratio */}
        <section>
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
            Split ratio
          </h2>
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary font-semibold">
                  {latestRatio
                    ? `${latestRatio.user1_pct}% / ${latestRatio.user2_pct}%`
                    : "50 / 50"}
                </p>
                <p className="text-text-muted text-xs">
                  {user1?.display_name ?? "You"} /{" "}
                  {user2?.display_name ?? "Partner"} · effective{" "}
                  {latestRatio?.effective_date ?? "–"}
                </p>
              </div>
              <button
                onClick={() => setShowRatioModal(true)}
                className="bg-primary-light text-primary text-sm font-medium px-4 py-2 rounded-xl min-h-[44px]"
              >
                Change
              </button>
            </div>

            {splitRatios.length > 1 && (
              <div className="border-t border-[rgba(255,255,255,0.08)] pt-3 space-y-2">
                <p className="text-text-muted text-xs font-medium">History</p>
                {splitRatios.slice(1).map((ratio) => (
                  <div
                    key={ratio.id}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-text-secondary">
                      {ratio.effective_date}
                    </span>
                    <span className="text-text-muted">
                      {ratio.user1_pct}% / {ratio.user2_pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Joint categories */}
        <section>
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
            Joint categories
          </h2>
          <div className="space-y-1">
            {jointCategories.map((cat) => (
              <div
                key={cat.id}
                className="bg-elevated rounded-lg px-4 py-3"
              >
                {/* Row 1: name + delete */}
                <div className="flex items-center gap-2 mb-2">
                  {editingCatId === cat.id ? (
                    <input
                      autoFocus
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      onBlur={() => saveCatName(cat.id, "joint_categories")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveCatName(cat.id, "joint_categories");
                        if (e.key === "Escape") cancelEditName();
                      }}
                      className="flex-1 min-w-0 bg-elevated border border-primary rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startEditName(cat.id, cat.name)}
                      className={`flex-1 min-w-0 text-left text-sm truncate ${
                        cat.is_active ? "text-text-primary" : "text-text-muted line-through"
                      }`}
                    >
                      {cat.name}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setDeleteTarget({
                        id: cat.id,
                        name: cat.name,
                        table: "joint_categories",
                      })
                    }
                    className="text-danger flex-shrink-0 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
                    aria-label={`Delete ${cat.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>

                {/* Row 2: ratio history badge + required/optional + active toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openRatioHistoryModal(cat.id, cat.name, "joint")}
                    className="text-[11px] font-medium px-2 py-1 rounded-lg bg-elevated text-text-secondary min-h-[28px] flex-shrink-0"
                  >
                    {getCategoryRatioLabel(cat.id)}
                  </button>
                  <div className="flex-1" />
                  {cat.is_active && (
                    <button
                      onClick={() =>
                        toggleJointRequired(cat.id, !cat.is_required_monthly)
                      }
                      className={`text-[11px] font-medium px-2 py-1 rounded-lg min-h-[28px] transition-colors ${
                        cat.is_required_monthly
                          ? "bg-warning/20 text-warning"
                          : "bg-elevated text-text-muted"
                      }`}
                    >
                      {cat.is_required_monthly ? "Required" : "Optional"}
                    </button>
                  )}
                  <div
                    onClick={() =>
                      toggleJointCategory(cat.id, !cat.is_active)
                    }
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                      cat.is_active ? "bg-primary" : "bg-elevated"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        cat.is_active ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={newJointCat}
              onChange={(e) => setNewJointCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addJointCategory();
              }}
              placeholder="New category name"
              className="flex-1 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-2.5 text-text-primary text-sm min-h-[44px] focus:outline-none focus:border-primary"
            />
            <button
              onClick={addJointCategory}
              disabled={!newJointCat.trim()}
              className="bg-primary text-white px-4 rounded-xl min-h-[44px] text-sm font-medium disabled:opacity-60"
            >
              Add
            </button>
          </div>
        </section>

        {/* Individual categories */}
        <section>
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
            Individual categories
          </h2>
          <div className="space-y-1">
            {individualCategories.map((cat) => (
              <div
                key={cat.id}
                className="bg-elevated rounded-lg px-4 py-3"
              >
                {/* Row 1: name + delete */}
                <div className="flex items-center gap-2 mb-2">
                  {editingCatId === cat.id ? (
                    <input
                      autoFocus
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      onBlur={() => saveCatName(cat.id, "individual_categories")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveCatName(cat.id, "individual_categories");
                        if (e.key === "Escape") cancelEditName();
                      }}
                      className="flex-1 min-w-0 bg-elevated border border-primary rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startEditName(cat.id, cat.name)}
                      className={`flex-1 min-w-0 text-left text-sm truncate ${
                        cat.is_active ? "text-text-primary" : "text-text-muted line-through"
                      }`}
                    >
                      {cat.name}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setDeleteTarget({
                        id: cat.id,
                        name: cat.name,
                        table: "individual_categories",
                      })
                    }
                    className="text-danger flex-shrink-0 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
                    aria-label={`Delete ${cat.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>

                {/* Row 2: ratio history badge + active toggle */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openRatioHistoryModal(cat.id, cat.name, "individual")}
                    className="text-[11px] font-medium px-2 py-1 rounded-lg bg-elevated text-text-secondary min-h-[28px] flex-shrink-0"
                  >
                    {getCategoryRatioLabel(cat.id)}
                  </button>
                  <div className="flex-1" />
                  <div
                    onClick={async () => {
                      const supabase = getSupabaseBrowserClient();
                      await supabase
                        .from("individual_categories")
                        .update({ is_active: !cat.is_active })
                        .eq("id", cat.id);
                      router.refresh();
                    }}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                      cat.is_active ? "bg-primary" : "bg-elevated"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        cat.is_active ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={newIndCat}
              onChange={(e) => setNewIndCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addIndividualCategory();
              }}
              placeholder="New category name"
              className="flex-1 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-2.5 text-text-primary text-sm min-h-[44px] focus:outline-none focus:border-primary"
            />
            <button
              onClick={addIndividualCategory}
              disabled={!newIndCat.trim()}
              className="bg-primary text-white px-4 rounded-xl min-h-[44px] text-sm font-medium disabled:opacity-60"
            >
              Add
            </button>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
            About
          </h2>
          <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-2xl divide-y divide-[rgba(255,255,255,0.08)]">
            <div className="flex justify-between px-4 py-3">
              <span className="text-text-secondary text-sm">Version</span>
              <span className="text-text-muted text-sm">1.0.0</span>
            </div>
          </div>
        </section>

        <button
          onClick={handleSignOut}
          className="w-full py-3.5 border border-danger/30 text-danger rounded-2xl font-medium min-h-[52px]"
        >
          Sign out
        </button>

        <div className="h-4" />
      </div>

      {/* Global ratio modal */}
      {showRatioModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-card-bg border-t border-[rgba(255,255,255,0.08)] w-full rounded-t-3xl p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            <h3 className="text-text-primary font-bold text-lg">
              Change split ratio
            </h3>

            <div>
              <div className="flex justify-between text-sm text-text-secondary mb-2">
                <span>
                  {user1?.display_name ?? "You"}: {user1Pct}%
                </span>
                <span>
                  {user2?.display_name ?? "Partner"}: {user2Pct}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={user1Pct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setUser1Pct(val);
                  setUser2Pct(100 - val);
                }}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <label className="block text-text-secondary text-sm font-medium mb-1.5">
                Effective date
              </label>
              <input
                type="date"
                value={ratioEffectiveDate}
                onChange={(e) => setRatioEffectiveDate(e.target.value)}
                className="w-full bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 min-h-[48px] focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveRatio}
                disabled={savingRatio}
                className="flex-1 bg-primary text-white font-semibold rounded-xl min-h-[48px] disabled:opacity-60"
              >
                {savingRatio ? "Saving…" : "Save ratio"}
              </button>
              <button
                onClick={() => setShowRatioModal(false)}
                className="flex-1 bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary rounded-xl min-h-[48px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category ratio history modal */}
      {ratioHistoryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-card-bg border-t border-[rgba(255,255,255,0.08)] w-full rounded-t-3xl p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            <h3 className="text-text-primary font-bold text-lg">
              Ratio history — {ratioHistoryModal.categoryName}
            </h3>

            {/* Existing history entries (chronological, oldest first) */}
            {(() => {
              const entries = getCategoryHistory(ratioHistoryModal.categoryId);
              if (entries.length === 0) {
                return (
                  <p className="text-text-muted text-sm">
                    No overrides yet — falls back to global split ratio.
                  </p>
                );
              }
              return (
                <div className="border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
                  {entries.map((entry, i) => {
                    const u1 = Math.round(entry.ratio * 100);
                    const isLatest = i === entries.length - 1;
                    return (
                      <div
                        key={entry.id}
                        className="flex justify-between items-center px-4 py-3 border-b last:border-0 border-[rgba(255,255,255,0.08)]"
                      >
                        <span className="text-text-secondary text-sm">
                          {entry.effective_date}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary text-sm font-medium">
                            {u1}/{100 - u1}
                          </span>
                          {isLatest && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary-light text-primary">
                              Current
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Add new entry */}
            <div className="border-t border-[rgba(255,255,255,0.08)] pt-4 space-y-3">
              <p className="text-text-secondary text-sm font-medium">Add new entry</p>
              <div>
                <label className="block text-text-secondary text-xs font-medium mb-1.5">
                  Ratio (e.g. 60/40)
                </label>
                <input
                  type="text"
                  value={newRatioInput}
                  onChange={(e) => setNewRatioInput(e.target.value)}
                  placeholder="60/40"
                  className="w-full bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2.5 text-sm min-h-[44px] focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-text-secondary text-xs font-medium mb-1.5">
                  Effective date
                </label>
                <input
                  type="date"
                  value={newRatioDate}
                  onChange={(e) => setNewRatioDate(e.target.value)}
                  className="w-full bg-elevated border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 min-h-[48px] focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={addRatioEntry}
                disabled={savingRatioEntry || !newRatioInput.trim()}
                className="flex-1 bg-primary text-white font-semibold rounded-xl min-h-[48px] disabled:opacity-60"
              >
                {savingRatioEntry ? "Saving…" : "Add entry"}
              </button>
              <button
                onClick={() => setRatioHistoryModal(null)}
                className="flex-1 bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary rounded-xl min-h-[48px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-card-bg border-t border-[rgba(255,255,255,0.08)] w-full rounded-t-3xl p-6 space-y-4">
            <h3 className="text-text-primary font-bold text-lg">
              Delete category?
            </h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              <strong>{deleteTarget.name}</strong> will be permanently deleted.
              Existing expenses in this category will not be deleted, but will
              have no category assigned.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmDeleteCategory}
                className="flex-1 bg-danger text-white font-semibold rounded-xl min-h-[48px]"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-elevated border border-[rgba(255,255,255,0.08)] text-text-secondary rounded-xl min-h-[48px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      )}
    </div>
  );
}
