import { createClient } from "@/lib/supabase/server";
import UploadClient from "./UploadClient";

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: categories }, { data: profiles }] = await Promise.all([
    supabase
      .from("joint_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("profiles").select("id, display_name"),
  ]);

  return (
    <UploadClient
      currentUserId={user.id}
      categories={categories ?? []}
      profiles={profiles ?? []}
    />
  );
}
