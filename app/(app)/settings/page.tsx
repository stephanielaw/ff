import { createClient } from "@/lib/supabase/server";
import { getHouseholdMembers } from "@/lib/utils/household";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: profile },
    { data: splitRatios },
    { data: jointCategories },
    { data: individualCategories },
    { data: categoryRatioHistory },
    householdMembers,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("split_ratios")
      .select("*")
      .order("effective_date", { ascending: false }),
    supabase.from("joint_categories").select("*").order("sort_order"),
    supabase.from("individual_categories").select("*").order("sort_order"),
    supabase
      .from("category_ratio_history")
      .select("*")
      .order("effective_date", { ascending: true }),
    getHouseholdMembers(supabase, user.id),
  ]);

  return (
    <SettingsClient
      currentUserId={user.id}
      userEmail={user.email ?? ""}
      profile={profile}
      splitRatios={splitRatios ?? []}
      jointCategories={jointCategories ?? []}
      individualCategories={individualCategories ?? []}
      categoryRatioHistory={categoryRatioHistory ?? []}
      householdMembers={householdMembers}
    />
  );
}
