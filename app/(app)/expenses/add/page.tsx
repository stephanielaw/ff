import { createClient } from "@/lib/supabase/server";
import AddExpenseClient from "./AddExpenseClient";

interface PageProps {
  searchParams: { category?: string; edit?: string };
}

export default async function AddExpensePage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profiles }, { data: categories }, { data: editExpense }] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name, email"),
      supabase
        .from("joint_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order"),
      searchParams.edit
        ? supabase
            .from("joint_expenses")
            .select("*")
            .eq("id", searchParams.edit)
            .single()
        : Promise.resolve({ data: null }),
    ]);

  return (
    <AddExpenseClient
      currentUserId={user.id}
      profiles={profiles ?? []}
      categories={categories ?? []}
      editExpense={editExpense}
      defaultCategoryId={searchParams.category}
    />
  );
}
