import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/invite
 * Ensures the caller has a profile row and a household, then returns a
 * fresh invite token URL they can share with their partner.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // Safety net: ensure the profile exists before we reference it in
    // households.user1_id (FK → profiles.id).  The DB trigger is the
    // primary mechanism, but race conditions can occur on very fast
    // first-logins before the trigger has committed.
    const displayName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      "User";

    const { error: profileErr } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        display_name: displayName,
        email: user.email ?? "",
      },
      { onConflict: "id", ignoreDuplicates: false }
    );

    if (profileErr) {
      console.error("[POST /api/invite] profile upsert failed:", profileErr.message);
      // Don't abort — the row may already exist and the upsert may have
      // been blocked by RLS on the update path; attempt to continue.
    }

    // Find or create the household
    let { data: household } = await supabase
      .from("households")
      .select("id")
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .maybeSingle();

    if (!household) {
      const { data: newHousehold, error: createErr } = await supabase
        .from("households")
        .insert({ user1_id: user.id })
        .select("id")
        .single();

      if (createErr || !newHousehold) {
        throw new Error(createErr?.message ?? "Failed to create household");
      }
      household = newHousehold;
    }

    // Generate a new invite token
    const { data: token, error: tokenErr } = await supabase
      .from("invite_tokens")
      .insert({
        household_id: household.id,
        created_by: user.id,
      })
      .select("token")
      .single();

    if (tokenErr || !token) {
      throw new Error(tokenErr?.message ?? "Failed to create invite token");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const inviteUrl = `${appUrl}/invite/${token.token}`;

    return NextResponse.json({ inviteUrl, token: token.token });
  } catch (err) {
    console.error("[POST /api/invite]", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
