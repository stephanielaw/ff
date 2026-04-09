import { createClient } from "@/lib/supabase/server";
import AddIndividualExpenseClient from "./AddIndividualExpenseClient";

export default async function AddIndividualExpensePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: categories } = await supabase
    .from("individual_categories")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");

  return (
    <AddIndividualExpenseClient
      currentUserId={user.id}
      categories={categories ?? []}
    />
  );
}
