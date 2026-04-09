import { createClient } from "@/lib/supabase/server";
import InviteClient from "./InviteClient";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  // Look up the token — use the security-definer function so anyone can read it
  const { data: tokenRows } = await supabase
    .rpc("get_invite_token", { p_token: token });

  const tokenData = tokenRows?.[0] ?? null;

  // Fetch the inviter's profile if token is valid
  let inviterName: string | null = null;
  if (tokenData?.created_by) {
    const { data: inviter } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", tokenData.created_by)
      .single();
    inviterName = inviter?.display_name ?? null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <InviteClient
      token={token}
      isValid={tokenData?.is_valid ?? false}
      isExpired={
        tokenData !== null &&
        !tokenData.is_valid &&
        tokenData.accepted_by === null
      }
      isAlreadyUsed={!!tokenData?.accepted_by}
      inviterName={inviterName}
      currentUserId={user?.id ?? null}
    />
  );
}
