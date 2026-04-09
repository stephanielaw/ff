-- ============================================================
-- Family Finances — Household & Invite System
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Rename sarah_pct / david_pct → user1_pct / user2_pct
--    (split_ratios columns are now generic, not person-specific)
-- ----------------------------------------------------------------
alter table split_ratios rename column sarah_pct to user1_pct;
alter table split_ratios rename column david_pct to user2_pct;

-- ----------------------------------------------------------------
-- 2. households — links two profiles into one household
-- ----------------------------------------------------------------
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  user1_id    uuid not null references profiles(id) on delete cascade,
  user2_id    uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

-- Unique: one household per user1
create unique index if not exists households_user1_unique on households(user1_id);

-- ----------------------------------------------------------------
-- 3. invite_tokens — single-use tokens for partner onboarding
-- ----------------------------------------------------------------
create table if not exists invite_tokens (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default encode(gen_random_bytes(24), 'hex'),
  household_id uuid not null references households(id) on delete cascade,
  created_by   uuid not null references profiles(id) on delete cascade,
  accepted_by  uuid references profiles(id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '30 days'),
  created_at   timestamptz default now()
);

-- ----------------------------------------------------------------
-- 4. Table-level privileges
--    RLS policies alone are insufficient — without an explicit
--    GRANT the role gets "permission denied" before RLS even runs.
-- ----------------------------------------------------------------
grant select, insert, update, delete on table
  public.profiles,
  public.joint_categories,
  public.individual_categories,
  public.split_ratios,
  public.joint_expenses,
  public.individual_expenses,
  public.payments,
  public.monthly_income,
  public.savings_goals,
  public.savings_allocations,
  public.ai_category_memory,
  public.import_batches,
  public.forecast_overrides,
  public.households,
  public.invite_tokens
to authenticated;

-- Allow the trigger function (security definer, runs as postgres) to write
grant select, insert, update, delete on public.profiles to service_role;

-- Sequences — needed for uuid default values and serial columns
grant usage on all sequences in schema public to authenticated;
grant usage on all sequences in schema public to service_role;

-- ----------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------
alter table households enable row level security;
alter table invite_tokens enable row level security;

-- ----------------------------------------------------------------
-- 6. Helper functions (security definer so they bypass RLS)
-- ----------------------------------------------------------------

-- Returns the partner's profile ID for the caller; NULL if solo household.
create or replace function public.get_household_partner_id(caller_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when h.user1_id = caller_id then h.user2_id
      else h.user1_id
    end
  from households h
  where h.user1_id = caller_id or h.user2_id = caller_id
  limit 1;
$$;

-- Returns true if caller_id is a member of household hh_id.
create or replace function public.is_household_member(hh_id uuid, caller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from households
    where id = hh_id
      and (user1_id = caller_id or user2_id = caller_id)
  );
$$;

-- ----------------------------------------------------------------
-- 7. Profile auto-creation trigger
--    Replaces (CREATE OR REPLACE) the version in 001 with a more
--    robust upsert that also updates display_name/email if they
--    change (e.g. when Google OAuth populates metadata in a second
--    UPDATE after the initial INSERT).
-- ----------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_email        text;
begin
  -- Prefer Google's full_name, then name, then email prefix, then 'User'.
  -- nullif(..., '') guards against empty-string metadata values.
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'),      ''),
    nullif(split_part(new.email, '@', 1),              ''),
    'User'
  );

  v_email := coalesce(new.email, '');

  insert into public.profiles (id, display_name, email)
  values (new.id, v_display_name, v_email)
  on conflict (id) do update
    set
      -- Only overwrite display_name if we have a non-empty value;
      -- preserves any user-edited name on subsequent sign-ins.
      display_name = coalesce(
        nullif(excluded.display_name, 'User'),
        nullif(excluded.display_name, ''),
        profiles.display_name
      ),
      email = case
        when excluded.email <> '' then excluded.email
        else profiles.email
      end;

  return new;
end;
$$;

-- Ensure the trigger fires on both INSERT (first-time sign-up) and
-- UPDATE of email/raw_user_meta_data (Google OAuth sometimes INSERTs
-- a partial row first, then UPDATEs it with the full metadata).
-- The column-level filter avoids firing on every login's
-- last_sign_in_at update.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------
-- 8. RLS policies — households
-- ----------------------------------------------------------------
create policy "households_select" on households
  for select to authenticated
  using (user1_id = auth.uid() or user2_id = auth.uid());

create policy "households_insert" on households
  for insert to authenticated
  with check (user1_id = auth.uid());

create policy "households_update" on households
  for update to authenticated
  using (user1_id = auth.uid() or user2_id = auth.uid());

-- ----------------------------------------------------------------
-- 9. RLS policies — invite_tokens
-- ----------------------------------------------------------------
create policy "invite_tokens_select" on invite_tokens
  for select to authenticated
  using (
    is_household_member(household_id, auth.uid())
    or accepted_by = auth.uid()
  );

create policy "invite_tokens_insert" on invite_tokens
  for insert to authenticated
  with check (created_by = auth.uid() and is_household_member(household_id, auth.uid()));

create policy "invite_tokens_update" on invite_tokens
  for update to authenticated
  using (is_household_member(household_id, auth.uid()) or accepted_by = auth.uid());

-- ----------------------------------------------------------------
-- 10. Update existing table RLS to use household membership
-- ----------------------------------------------------------------

-- joint_expenses: both household members can read/write
drop policy if exists "joint_expenses_all" on joint_expenses;
create policy "joint_expenses_all" on joint_expenses
  for all to authenticated
  using (
    paid_by = auth.uid()
    or entered_by = auth.uid()
    or paid_by = get_household_partner_id(auth.uid())
    or entered_by = get_household_partner_id(auth.uid())
    or exists (
      select 1 from households h
      where (h.user1_id = auth.uid() or h.user2_id = auth.uid())
        and (h.user1_id = paid_by or h.user2_id = paid_by
             or h.user1_id = entered_by or h.user2_id = entered_by)
    )
  )
  with check (true);

-- payments: both household members can read/write
drop policy if exists "payments_all" on payments;
create policy "payments_all" on payments
  for all to authenticated
  using (
    paid_by = auth.uid()
    or paid_to = auth.uid()
    or paid_by = get_household_partner_id(auth.uid())
    or paid_to = get_household_partner_id(auth.uid())
  )
  with check (true);

-- individual_expenses: own + partner-visible
drop policy if exists "individual_expenses_select" on individual_expenses;
create policy "individual_expenses_select" on individual_expenses
  for select to authenticated
  using (
    user_id = auth.uid()
    or (is_visible_to_partner = true and user_id = get_household_partner_id(auth.uid()))
  );

-- ----------------------------------------------------------------
-- 11. Token lookup RPC (called from invite pages — bypasses RLS)
-- ----------------------------------------------------------------
create or replace function public.get_invite_token(p_token text)
returns table (
  id           uuid,
  token        text,
  household_id uuid,
  created_by   uuid,
  accepted_by  uuid,
  expires_at   timestamptz,
  is_valid     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    id,
    token,
    household_id,
    created_by,
    accepted_by,
    expires_at,
    (accepted_by is null and expires_at > now()) as is_valid
  from invite_tokens
  where invite_tokens.token = p_token
  limit 1;
$$;

-- ----------------------------------------------------------------
-- 12. accept_invite RPC
--     Atomically validates the token, links the caller as user2,
--     and marks the token used — all inside security definer so
--     it bypasses the RLS policies that would otherwise block the
--     household UPDATE (user2 isn't a member yet when they accept).
-- ----------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id  uuid := auth.uid();
  v_tok        record;
begin
  -- Must be authenticated
  if v_caller_id is null then
    return jsonb_build_object('error', 'unauthorised');
  end if;

  -- Look up and lock the token row
  select id, household_id, created_by, accepted_by, expires_at
    into v_tok
    from invite_tokens
   where token = p_token
     for update  -- prevent double-accept race condition
   limit 1;

  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  if v_tok.accepted_by is not null then
    return jsonb_build_object('error', 'already_used');
  end if;

  if v_tok.expires_at <= now() then
    return jsonb_build_object('error', 'expired');
  end if;

  if v_tok.created_by = v_caller_id then
    return jsonb_build_object('error', 'own_invite');
  end if;

  -- Caller must not already belong to a household
  if exists (
    select 1 from households
    where user1_id = v_caller_id or user2_id = v_caller_id
  ) then
    return jsonb_build_object('error', 'already_in_household');
  end if;

  -- Set user2 on the household
  update households
     set user2_id = v_caller_id
   where id = v_tok.household_id;

  -- Mark token as accepted
  update invite_tokens
     set accepted_by = v_caller_id
   where id = v_tok.id;

  return jsonb_build_object('success', true);
end;
$$;
