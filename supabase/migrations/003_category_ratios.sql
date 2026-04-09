-- ============================================================
-- Family Finances — Per-category split ratio history
-- Replaces the static split_ratio column approach.
-- Run AFTER 002_household_invite.sql
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Remove static split_ratio columns (from old version of this file)
-- ----------------------------------------------------------------
alter table joint_categories
  drop column if exists split_ratio;

alter table individual_categories
  drop column if exists split_ratio;

-- ----------------------------------------------------------------
-- 2. Create category_ratio_history table
--    Records user1's share (as a 0.0–1.0 decimal) for a category
--    from a given effective_date onward. The most recent row whose
--    effective_date is on or before an expense's date is the one
--    that applies. If no row exists, fall back to the global
--    split_ratios table.
-- ----------------------------------------------------------------
create table if not exists category_ratio_history (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null,
  category_type text not null check (category_type in ('joint', 'individual')),
  ratio         numeric(5,4) not null check (ratio >= 0 and ratio <= 1),
  effective_date date not null,
  created_at    timestamptz default now()
);

-- ----------------------------------------------------------------
-- 3. Row Level Security — append-only, all household members
-- ----------------------------------------------------------------
alter table category_ratio_history enable row level security;

-- All authenticated users can read all history
create policy "category_ratio_history_select"
  on category_ratio_history for select
  to authenticated using (true);

-- All authenticated users can insert new entries
create policy "category_ratio_history_insert"
  on category_ratio_history for insert
  to authenticated with check (true);

-- No update or delete policies — history is intentionally append-only

-- ----------------------------------------------------------------
-- 4. Indexes
-- ----------------------------------------------------------------

-- Lookup by category
create index if not exists idx_crh_category_id
  on category_ratio_history (category_id);

-- Lookup by effective date
create index if not exists idx_crh_effective_date
  on category_ratio_history (effective_date);

-- Composite index for the primary query pattern:
-- WHERE category_id = $1 AND effective_date <= $2 ORDER BY effective_date DESC LIMIT 1
create index if not exists idx_crh_category_date
  on category_ratio_history (category_id, effective_date desc);
