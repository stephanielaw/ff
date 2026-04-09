"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateHousehold() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invite", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create household");
      router.push("/settings?onboarded=1");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Welcome to Family Finances</h1>
          <p className="text-text-secondary text-sm mt-1">Set up your household to get started</p>
        </div>

        {error && (
          <div className="p-3 bg-danger-surface border border-danger/20 rounded-xl text-danger text-sm text-center">
            {error}
          </div>
        )}

        {/* Create new household */}
        <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-2xl p-5">
          <h2 className="font-semibold text-text-primary mb-1">Create a new household</h2>
          <p className="text-text-secondary text-sm mb-4">
            You&apos;ll be the household owner. After setup, you&apos;ll get an invite link to share with your partner.
          </p>
          <button
            onClick={handleCreateHousehold}
            disabled={loading}
            className="w-full bg-primary text-white font-semibold rounded-xl py-3 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            Create household
          </button>
        </div>

        <div className="text-center text-text-muted text-sm">or</div>

        {/* Accept invite — link to /invite entry with manual token */}
        <div className="bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-2xl p-5">
          <h2 className="font-semibold text-text-primary mb-1">Join an existing household</h2>
          <p className="text-text-secondary text-sm mb-4">
            Ask your partner to share their invite link with you, then open it in this browser.
          </p>
          <p className="text-text-muted text-xs">
            Invite links look like: <span className="font-mono">/invite/abc123…</span>
          </p>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full text-text-muted text-sm py-2 min-h-[44px]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
