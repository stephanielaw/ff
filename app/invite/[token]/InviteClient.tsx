"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface InviteClientProps {
  token: string;
  isValid: boolean;
  isExpired: boolean;
  isAlreadyUsed: boolean;
  inviterName: string | null;
  currentUserId: string | null;
}

export default function InviteClient({
  token,
  isValid,
  isExpired,
  isAlreadyUsed,
  inviterName,
  currentUserId,
}: InviteClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → accept immediately
  async function handleAcceptAsSignedInUser() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to accept invite");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Not signed in → sign in with Google, token stored in cookie via redirect
  async function handleSignInToAccept() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      // Store the invite token in a cookie via the callback URL so the
      // auth callback can call accept after sign-in.
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?invite_token=${token}`,
        },
      });
      if (oauthError) throw oauthError;
    } catch {
      setError("Sign in failed. Please try again.");
      setLoading(false);
    }
  }

  // ---- Invalid token states ----
  if (isAlreadyUsed) {
    return (
      <CenteredCard>
        <Icon variant="warning" />
        <h1 className="text-xl font-bold text-text-primary mt-4">Invite already used</h1>
        <p className="text-text-secondary text-sm mt-2 text-center">
          This invite link has already been accepted. Each link can only be used once.
        </p>
      </CenteredCard>
    );
  }

  if (isExpired) {
    return (
      <CenteredCard>
        <Icon variant="warning" />
        <h1 className="text-xl font-bold text-text-primary mt-4">Invite link expired</h1>
        <p className="text-text-secondary text-sm mt-2 text-center">
          Ask your partner to generate a new invite link from the Settings screen.
        </p>
      </CenteredCard>
    );
  }

  if (!isValid) {
    return (
      <CenteredCard>
        <Icon variant="error" />
        <h1 className="text-xl font-bold text-text-primary mt-4">Invalid invite link</h1>
        <p className="text-text-secondary text-sm mt-2 text-center">
          This link doesn&apos;t look right. Ask your partner to share the link again.
        </p>
      </CenteredCard>
    );
  }

  // ---- Valid token ----
  return (
    <CenteredCard>
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-2">
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-text-primary mt-2">You&apos;ve been invited</h1>
      {inviterName && (
        <p className="text-text-secondary text-sm mt-1">
          <span className="font-semibold">{inviterName}</span> invited you to join their Family Finances household.
        </p>
      )}

      {error && (
        <div className="w-full mt-4 p-3 bg-danger-surface border border-danger/20 rounded-xl text-danger text-sm text-center">
          {error}
        </div>
      )}

      <div className="w-full mt-6 space-y-3">
        {currentUserId ? (
          // Already signed in — accept directly
          <button
            onClick={handleAcceptAsSignedInUser}
            disabled={loading}
            className="w-full bg-primary text-white font-semibold rounded-xl py-3.5 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            Accept and join household
          </button>
        ) : (
          // Not signed in — Google OAuth
          <button
            onClick={handleSignInToAccept}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-elevated border border-[rgba(255,255,255,0.12)] rounded-xl text-text-primary font-medium text-sm hover:bg-[#222629] transition-colors disabled:opacity-60 min-h-[48px]"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-text-muted border-t-[#1D9E75] rounded-full animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {loading ? "Signing in…" : "Sign in with Google to accept"}
          </button>
        )}
      </div>

      <p className="text-text-muted text-xs mt-4 text-center">
        This is a private app. Only people with an invite link can join.
      </p>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card-bg border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 flex flex-col items-center ">
        {children}
      </div>
    </div>
  );
}

function Icon({ variant }: { variant: "warning" | "error" }) {
  const bg = variant === "warning" ? "bg-warning-surface" : "bg-danger-surface";
  const color = variant === "warning" ? "text-warning" : "text-danger";
  return (
    <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${bg}`}>
      <svg className={`w-7 h-7 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
