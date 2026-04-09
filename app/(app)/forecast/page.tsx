import { createClient } from "@/lib/supabase/server";
import ForecastClient from "./ForecastClient";

export default async function ForecastPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const nextYear = new Date().getFullYear() + 1;

  const [
    { data: expenses },
    { data: categories },
    { data: overrides },
  ] = await Promise.all([
    supabase
      .from("joint_expenses")
      .select("category_id, amount, month_year")
      .order("expense_date", { ascending: false }),
    supabase
      .from("joint_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("forecast_overrides")
      .select("*")
      .eq("year", nextYear),
  ]);

  return (
    <ForecastClient
      nextYear={nextYear}
      expenses={expenses ?? []}
      categories={categories ?? []}
      existingOverrides={overrides ?? []}
    />
  );
}
