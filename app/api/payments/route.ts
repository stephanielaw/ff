import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/utils/sanitize";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { amount, paidBy, paidTo, paymentDate, note } = body;

    if (!amount || !paidBy || !paidTo || !paymentDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        amount: Number(amount),
        paid_by: paidBy,
        paid_to: paidTo,
        payment_date: paymentDate,
        note: note ? sanitizeText(note) : null,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert payment error:", error);
      return NextResponse.json(
        { error: "Failed to save payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("POST /api/payments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { error } = await supabase.from("payments").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/payments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
