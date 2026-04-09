import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/invite/accept
 * Body: { token: string }
 *
 * Delegates all validation and writes to the `accept_invite` Postgres
 * function (security definer), which bypasses RLS for the household UPDATE.
 * This avoids the race where the new user2 is not yet a household member
 * and therefore the normal UPDATE policy would reject the write.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { token } = body as { token?: string };

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Safety net: ensure the accepting user has a profile row before the
    // accept_invite function tries to write accepted_by = caller.
    const displayName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      "User";

    await supabase
      .from("profiles")
      .upsert(
        { id: user.id, display_name: displayName, email: user.email ?? "" },
        { onConflict: "id", ignoreDuplicates: false }
      )
      .maybeSingle();

    // The RPC is security definer — it handles token validation, the household
    // UPDATE (setting user2_id), and token acceptance atomically.
    const { data: result, error: rpcErr } = await supabase.rpc(
      "accept_invite",
      { p_token: token }
    );

    if (rpcErr) {
      console.error("[POST /api/invite/accept] RPC error:", rpcErr.message);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    // The RPC returns { error: string } or { success: true }
    if (result?.error) {
      const statusMap: Record<string, number> = {
        unauthorised: 401,
        invalid_token: 404,
        already_used: 409,
        expired: 410,
        own_invite: 400,
        already_in_household: 409,
      };
      const status = statusMap[result.error] ?? 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/invite/accept]", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
