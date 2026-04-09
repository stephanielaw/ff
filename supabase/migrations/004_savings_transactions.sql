-- ============================================================
-- Family Finances — Savings Goal Drawdown
-- Run AFTER 003_category_ratios.sql
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Add allocated_amount to savings_goals
--    Stores the opening balance so we can fall back to it if no
--    transactions have been logged yet (e.g. pre-migration goals).
-- ----------------------------------------------------------------
alter table savings_goals
  add column if not exists allocated_amount numeric(10,2) default 0;

-- ----------------------------------------------------------------
-- 2. savings_transactions — deposits and withdrawals against a goal
-- ----------------------------------------------------------------
create table if not exists savings_transactions (
  id               uuid primary key default gen_random_uuid(),
  goal_id          uuid not null references savings_goals(id) on delete cascade,
  amount           numeric(10,2) not null check (amount > 0),
  transaction_type text not null check (transaction_type in ('deposit', 'withdrawal')),
  note             text,
  transaction_date date not null,
  created_by       uuid not null references profiles(id),
  created_at       timestamptz default now()
);

-- ----------------------------------------------------------------
-- 3. Row Level Security
-- ----------------------------------------------------------------
alter table savings_transactions enable row level security;

-- Household members can read transactions for any goal owned by
-- themselves or their partner.
create policy "savings_transactions_select"
  on savings_transactions for select
  to authenticated
  using (
    exists (
      select 1 from savings_goals sg
      where sg.id = savings_transactions.goal_id
        and (
          sg.user_id = auth.uid()
          or sg.user_id = get_household_partner_id(auth.uid())
        )
    )
  );

-- Household members can insert transactions (created_by = themselves)
-- for goals owned by either household member.
create policy "savings_transactions_insert"
  on savings_transactions for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from savings_goals sg
      where sg.id = savings_transactions.goal_id
        and (
          sg.user_id = auth.uid()
          or sg.user_id = get_household_partner_id(auth.uid())
        )
    )
  );

-- ----------------------------------------------------------------
-- 4. Indexes
-- ----------------------------------------------------------------
create index if not exists idx_st_goal_id
  on savings_transactions (goal_id);

create index if not exists idx_st_transaction_date
  on savings_transactions (transaction_date);

-- Composite: the primary query pattern is
-- WHERE goal_id = $1 ORDER BY transaction_date ASC
create index if not exists idx_st_goal_date
  on savings_transactions (goal_id, transaction_date asc);

-- ----------------------------------------------------------------
-- 5. Grants
-- ----------------------------------------------------------------
grant select, insert on table public.savings_transactions to authenticated;
