import { createClient } from "@/lib/supabase/server";
import { getHouseholdMembers, getUserRole } from "@/lib/utils/household";
import MeClient from "./MeClient";
import type { IndividualExpense, IndividualCategory } from "@/types/database";

type IndExp = IndividualExpense & {
  individual_categories: Pick<IndividualCategory, "id" | "name"> | null;
};

export default async function MePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: profile },
    { data: individualCategories },
    { data: jointCategories },
    { data: splitRatios },
    { data: jointExpenses },
    { data: individualExpenses },
    { data: income },
    { data: savingsGoals },
    { data: savingsAllocations },
    householdMembers,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("individual_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("joint_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("split_ratios")
      .select("*")
      .order("effective_date", { ascending: true }),
    supabase
      .from("joint_expenses")
      .select("amount, paid_by, expense_date, month_year")
      .order("expense_date"),
    supabase
      .from("individual_expenses")
      .select("*, individual_categories(id, name)")
      .eq("user_id", user.id)
      .order("expense_date", { ascending: false }),
    supabase.from("monthly_income").select("*").eq("user_id", user.id),
    supabase
      .from("savings_goals")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase.from("savings_allocations").select("*").eq("user_id", user.id),
    getHouseholdMembers(supabase, user.id),
  ]);

  // Fetch transactions for all of the user's goals (empty array if none)
  const goalIds = (savingsGoals ?? []).map((g) => g.id);
  const { data: savingsTransactions } = goalIds.length > 0
    ? await supabase
        .from("savings_transactions")
        .select("*")
        .in("goal_id", goalIds)
        .order("transaction_date", { ascending: true })
    : { data: [] };

  const userRole = householdMembers
    ? getUserRole(householdMembers, user.id)
    : "user1";

  const profiles = householdMembers
    ? [
        householdMembers.user1,
        ...(householdMembers.user2 ? [householdMembers.user2] : []),
      ]
    : profile
    ? [{ id: profile.id, display_name: profile.display_name }]
    : [];

  return (
    <MeClient
      currentUserId={user.id}
      userRole={userRole}
      profile={profile}
      individualCategories={individualCategories ?? []}
      jointCategories={jointCategories ?? []}
      splitRatios={splitRatios ?? []}
      jointExpenses={jointExpenses ?? []}
      individualExpenses={(individualExpenses ?? []) as unknown as IndExp[]}
      income={income ?? []}
      savingsGoals={savingsGoals ?? []}
      savingsAllocations={savingsAllocations ?? []}
      savingsTransactions={savingsTransactions ?? []}
      profiles={profiles}
    />
  );
}
