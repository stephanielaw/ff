import { createClient } from "@/lib/supabase/server";
import RecurringClient from "./RecurringClient";
import type { JointExpense, JointCategory } from "@/types/database";
type RecurringRow = JointExpense & { joint_categories: Pick<JointCategory, "id" | "name"> | null };

export default async function RecurringPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: recurring }, { data: categories }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("joint_expenses")
        .select("*, joint_categories(id, name)")
        .eq("is_recurring", true)
        .is("recurring_parent_id", null)
        .order("description"),
      supabase
        .from("joint_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("profiles").select("id, display_name"),
    ]);

  return (
    <RecurringClient
      currentUserId={user.id}
      recurringExpenses={(recurring ?? []) as unknown as RecurringRow[]}
      categories={categories ?? []}
      profiles={profiles ?? []}
    />
  );
}
