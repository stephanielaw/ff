import { createClient } from "@/lib/supabase/server";
import ExpensesClient from "./ExpensesClient";
import type { JointExpense, JointCategory } from "@/types/database";
type ExpRow = JointExpense & { joint_categories: Pick<JointCategory, "id" | "name"> | null };

interface PageProps {
  searchParams: { month?: string };
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: expenses }, { data: categories }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("joint_expenses")
        .select("*, joint_categories(id, name)")
        .order("expense_date", { ascending: false })
        .limit(500),
      supabase
        .from("joint_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("profiles").select("id, display_name"),
    ]);

  return (
    <ExpensesClient
      currentUserId={user.id}
      expenses={(expenses ?? []) as unknown as ExpRow[]}
      categories={categories ?? []}
      profiles={profiles ?? []}
      defaultMonth={searchParams.month}
    />
  );
}
