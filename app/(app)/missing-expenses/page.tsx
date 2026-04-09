import { createClient } from "@/lib/supabase/server";
import MissingExpensesClient from "./MissingExpensesClient";
import { format, subMonths } from "date-fns";

export default async function MissingExpensesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Get required categories
  const { data: requiredCategories } = await supabase
    .from("joint_categories")
    .select("id, name")
    .eq("is_required_monthly", true)
    .eq("is_active", true);

  // Check last 12 months for missing expenses
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    months.push(format(subMonths(new Date(), i), "yyyy-MM"));
  }

  // Get all expenses for required categories in the last 12 months
  const requiredCategoryIds = (requiredCategories ?? []).map((c) => c.id);
  const { data: existingExpenses } = await supabase
    .from("joint_expenses")
    .select("category_id, month_year, amount, description")
    .in("month_year", months)
    .in("category_id", requiredCategoryIds.length > 0 ? requiredCategoryIds : ["__none__"]);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name");

  return (
    <MissingExpensesClient
      currentUserId={user.id}
      requiredCategories={requiredCategories ?? []}
      existingExpenses={existingExpenses ?? []}
      profiles={profiles ?? []}
      months={months}
    />
  );
}
