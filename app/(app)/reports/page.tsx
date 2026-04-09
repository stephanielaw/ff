import { createClient } from "@/lib/supabase/server";
import ReportsClient from "./ReportsClient";
import type { JointCategory } from "@/types/database";
type ReportExpRow = { id: string; amount: number; paid_by: string; expense_date: string; month_year: string; category_id: string | null; joint_categories: Pick<JointCategory, "id" | "name"> | null };

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: expenses }, { data: categories }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("joint_expenses")
        .select("id, amount, paid_by, expense_date, month_year, category_id, joint_categories(id, name)")
        .order("expense_date", { ascending: true }),
      supabase
        .from("joint_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("profiles").select("id, display_name"),
    ]);

  return (
    <ReportsClient
      currentUserId={user.id}
      expenses={(expenses ?? []) as unknown as ReportExpRow[]}
      categories={categories ?? []}
      profiles={profiles ?? []}
    />
  );
}
