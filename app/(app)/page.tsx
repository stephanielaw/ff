import { createClient } from "@/lib/supabase/server";
import HomeClient from "./HomeClient";
import { getHouseholdMembers } from "@/lib/utils/household";
import type { JointExpense, JointCategory, CategoryRatioHistory } from "@/types/database";

type HomeExpense = JointExpense & {
  joint_categories: Pick<JointCategory, "id" | "name"> | null;
};

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [
    householdMembers,
    { data: splitRatios },
    { data: requiredCategories },
    { data: allExpenses },
    { data: allPayments },
    { count: recurringCount },
    { data: categoryRatioHistory },
  ] = await Promise.all([
    getHouseholdMembers(supabase, user.id),
    supabase
      .from("split_ratios")
      .select("*")
      .order("effective_date", { ascending: true }),
    supabase
      .from("joint_categories")
      .select("id, name")
      .eq("is_required_monthly", true)
      .eq("is_active", true),
    supabase
      .from("joint_expenses")
      .select(
        "id, amount, paid_by, expense_date, month_year, description, category_id, is_recurring, is_required_monthly, joint_categories(id, name)"
      )
      .order("expense_date", { ascending: false }),
    supabase
      .from("payments")
      .select("*")
      .order("payment_date", { ascending: false }),
    supabase
      .from("joint_expenses")
      .select("*", { count: "exact", head: true })
      .eq("is_recurring", true)
      .is("recurring_parent_id", null),
    supabase.from("category_ratio_history").select("*"),
  ]);

  return (
    <HomeClient
      currentUserId={user.id}
      householdMembers={householdMembers}
      splitRatios={splitRatios ?? []}
      allExpenses={(allExpenses ?? []) as unknown as HomeExpense[]}
      allPayments={allPayments ?? []}
      requiredCategories={requiredCategories ?? []}
      recurringCount={recurringCount ?? 0}
      categoryRatioHistory={(categoryRatioHistory ?? []) as CategoryRatioHistory[]}
    />
  );
}
