import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, HouseholdMembers, Profile } from "@/types/database";

type AppSupabaseClient = SupabaseClient<Database>;

/**
 * Resolves the household and both member profiles for the given user.
 * Returns null if the user does not belong to any household yet.
 */
export async function getHouseholdMembers(
  supabase: AppSupabaseClient,
  userId: string
): Promise<HouseholdMembers | null> {
  const { data: household, error } = await supabase
    .from("households")
    .select("*")
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .single();

  if (error || !household) return null;

  const memberIds = [household.user1_id, household.user2_id].filter(
    Boolean
  ) as string[];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", memberIds);

  if (!profiles) return null;

  const user1 = profiles.find((p) => p.id === household.user1_id);
  if (!user1) return null;

  const user2 = household.user2_id
    ? (profiles.find((p) => p.id === household.user2_id) ?? null)
    : null;

  return { household, user1, user2 };
}

/**
 * Returns 'user1' | 'user2' based on the caller's role in the household.
 */
export function getUserRole(
  members: HouseholdMembers,
  userId: string
): "user1" | "user2" {
  return members.household.user1_id === userId ? "user1" : "user2";
}

/**
 * Returns the display name of the partner, or a fallback string.
 */
export function getPartnerName(
  members: HouseholdMembers,
  currentUserId: string
): string {
  const role = getUserRole(members, currentUserId);
  if (role === "user1") {
    return members.user2?.display_name ?? "Your partner";
  }
  return members.user1.display_name;
}

/**
 * Given a members object and a profile ID, returns that profile.
 */
export function getMemberProfile(
  members: HouseholdMembers,
  userId: string
): Profile | null {
  if (members.user1.id === userId) return members.user1;
  if (members.user2?.id === userId) return members.user2;
  return null;
}
