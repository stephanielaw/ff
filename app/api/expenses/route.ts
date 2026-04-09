import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/utils/sanitize";
import { generateRecurringMonths, toMonthYear } from "@/lib/utils/expenses";
import { format, parseISO, addMonths } from "date-fns";

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
    const {
      amount,
      description,
      categoryId,
      expenseDate,
      paidBy,
      isRecurring,
      isRequired,
      enteredBy,
    } = body;

    const sanitizedDescription = sanitizeText(description ?? "");
    const monthYear = format(parseISO(expenseDate), "yyyy-MM");

    const expenseData = {
      amount: Number(amount),
      description: sanitizedDescription,
      category_id: categoryId || null,
      expense_date: expenseDate,
      month_year: monthYear,
      paid_by: paidBy,
      entered_by: enteredBy ?? user.id,
      is_recurring: Boolean(isRecurring),
      is_required_monthly: Boolean(isRequired),
      source: "manual",
    };

    const { data: newExpense, error } = await supabase
      .from("joint_expenses")
      .insert(expenseData)
      .select()
      .single();

    if (error) {
      console.error("Insert expense error:", error);
      return NextResponse.json(
        { error: "Failed to save expense" },
        { status: 500 }
      );
    }

    // If recurring, create future instances
    if (isRecurring && newExpense) {
      const recurringInstances = generateRecurringMonths(
        {
          description: sanitizedDescription,
          amount: Number(amount),
          category_id: categoryId || null,
          expense_date: expenseDate,
          paid_by: paidBy,
          entered_by: enteredBy ?? user.id,
          is_required_monthly: Boolean(isRequired),
        },
        newExpense.id,
        12
      );

      if (recurringInstances.length > 0) {
        const { error: recurringError } = await supabase
          .from("joint_expenses")
          .insert(recurringInstances);

        if (recurringError) {
          console.error("Insert recurring instances error:", recurringError);
        }
      }
    }

    return NextResponse.json({ data: newExpense }, { status: 201 });
  } catch (err) {
    console.error("POST /api/expenses error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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
    const {
      editId,
      amount,
      description,
      categoryId,
      expenseDate,
      paidBy,
      isRecurring,
      isRequired,
      recurringEditMode,
    } = body;

    if (!editId) {
      return NextResponse.json({ error: "Missing editId" }, { status: 400 });
    }

    const sanitizedDescription = sanitizeText(description ?? "");
    const monthYear = format(parseISO(expenseDate), "yyyy-MM");

    const updateData = {
      amount: Number(amount),
      description: sanitizedDescription,
      category_id: categoryId || null,
      expense_date: expenseDate,
      month_year: monthYear,
      paid_by: paidBy,
      is_recurring: Boolean(isRecurring),
      is_required_monthly: Boolean(isRequired),
      updated_at: new Date().toISOString(),
    };

    // Get the existing expense to find parent
    const { data: existingExpense } = await supabase
      .from("joint_expenses")
      .select("*")
      .eq("id", editId)
      .single();

    if (!existingExpense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    if (recurringEditMode === "all" && existingExpense.recurring_parent_id) {
      // Update all future children that haven't been individually overridden
      const today = format(new Date(), "yyyy-MM-dd");
      await supabase
        .from("joint_expenses")
        .update({
          amount: Number(amount),
          description: sanitizedDescription,
          category_id: categoryId || null,
          paid_by: paidBy,
          is_required_monthly: Boolean(isRequired),
          updated_at: new Date().toISOString(),
        })
        .eq("recurring_parent_id", existingExpense.recurring_parent_id)
        .gte("expense_date", today)
        .eq("recurring_override", false);

      // Also update the specific expense
      await supabase
        .from("joint_expenses")
        .update({ ...updateData, recurring_override: true })
        .eq("id", editId);
    } else if (recurringEditMode === "this") {
      // Update only this expense, mark as overridden
      await supabase
        .from("joint_expenses")
        .update({ ...updateData, recurring_override: true })
        .eq("id", editId);
    } else {
      // Normal update
      await supabase
        .from("joint_expenses")
        .update(updateData)
        .eq("id", editId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT /api/expenses error:", err);
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

    const { error } = await supabase
      .from("joint_expenses")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/expenses error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
