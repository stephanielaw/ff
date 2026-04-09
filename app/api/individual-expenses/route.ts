import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/utils/sanitize";
import { format, parseISO } from "date-fns";

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
    const { amount, description, categoryId, expenseDate, isRecurring } =
      body as {
        amount: number;
        description?: string;
        categoryId?: string;
        expenseDate: string;
        isRecurring?: boolean;
      };

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (!expenseDate) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    const monthYear = format(parseISO(expenseDate), "yyyy-MM");

    const { error } = await supabase.from("individual_expenses").insert({
      user_id: user.id,
      amount: Number(amount),
      description: sanitizeText(description ?? ""),
      category_id: categoryId || null,
      expense_date: expenseDate,
      month_year: monthYear,
      is_visible_to_partner: false,
    });

    if (error) {
      console.error("[POST /api/individual-expenses]", error);
      return NextResponse.json(
        { error: "Failed to save expense" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/individual-expenses]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
