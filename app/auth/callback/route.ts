import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite_token");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Get the now-authenticated user so we can ensure a profile row exists.
  // The DB trigger (handle_new_user) should have already created one, but
  // we upsert here as a belt-and-braces safety net for edge cases where the
  // trigger fires before the profiles table is fully ready, or the user
  // re-authenticates with updated Google metadata.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const displayName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      "User";

    await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: displayName,
          email: user.email ?? "",
        },
        {
          onConflict: "id",
          // Don't overwrite a display_name the user has manually customised
          ignoreDuplicates: false,
        }
      )
      .select()
      .maybeSingle();
    // Intentionally ignore errors here — the trigger is the primary mechanism.
    // If both fail, the user will see an error when the app tries to load data.
  }

  // Handle invite token: use the security-definer RPC so that RLS is bypassed
  // for the household UPDATE (the new user2 isn't a member yet when accepting).
  if (inviteToken && user) {
    try {
      const { data: result } = await supabase.rpc("accept_invite", {
        p_token: inviteToken,
      });
      if (result?.error && result.error !== "already_in_household") {
        console.error("[auth/callback] accept_invite failed:", result.error);
      }
    } catch (err) {
      // Non-fatal — user will land on /setup if the household wasn't linked.
      console.error("[auth/callback] accept_invite threw:", err);
    }
    return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
