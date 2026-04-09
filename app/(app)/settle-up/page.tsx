import { createClient } from "@/lib/supabase/server";
import { getHouseholdMembers } from "@/lib/utils/household";
import SettleUpClient from "./SettleUpClient";

export default async function SettleUpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    householdMembers,
    { data: allExpenses },
    { data: allPayments },
    { data: splitRatios },
    { data: categoryRatioHistory },
  ] = await Promise.all([
    getHouseholdMembers(supabase, user.id),
    supabase
      .from("joint_expenses")
      .select("id, amount, paid_by, expense_date, category_id")
      .order("expense_date", { ascending: true }),
    supabase
      .from("payments")
      .select("*")
      .order("payment_date", { ascending: false }),
    supabase
      .from("split_ratios")
      .select("*")
      .order("effective_date", { ascending: true }),
    supabase.from("category_ratio_history").select("*"),
  ]);

  return (
    <SettleUpClient
      currentUserId={user.id}
      householdMembers={householdMembers}
      allExpenses={allExpenses ?? []}
      allPayments={allPayments ?? []}
      splitRatios={splitRatios ?? []}
      categoryRatioHistory={categoryRatioHistory ?? []}
    />
  );
}
