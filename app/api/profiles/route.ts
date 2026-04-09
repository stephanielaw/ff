import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/utils/sanitize";

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { displayName } = body;

    if (!displayName) {
      return NextResponse.json({ error: "Missing displayName" }, { status: 400 });
    }

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: sanitizeText(displayName) })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT /api/profiles error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
