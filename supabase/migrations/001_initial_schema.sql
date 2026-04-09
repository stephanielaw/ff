-- ============================================================
-- Family Finances — Initial Schema Migration
-- Run this in the Supabase SQL editor or via `supabase db push`
-- ============================================================

-- Users (maps to Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users primary key,
  display_name text not null,
  email text not null,
  created_at timestamptz default now()
);

-- Joint expense categories
create table if not exists joint_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean default true,
  is_required_monthly boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Individual expense categories
create table if not exists individual_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Split ratio history (dated so mid-year changes are tracked)
create table if not exists split_ratios (
  id uuid primary key default gen_random_uuid(),
  effective_date date not null,
  sarah_pct numeric(5,2) not null default 50.00,
  david_pct numeric(5,2) not null default 50.00,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Joint expenses
create table if not exists joint_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(10,2) not null,
  category_id uuid references joint_categories(id),
  expense_date date not null,
  month_year text not null,
  paid_by uuid references profiles(id) not null,
  entered_by uuid references profiles(id) not null,
  is_recurring boolean default false,
  is_required_monthly boolean default false,
  recurring_parent_id uuid references joint_expenses(id),
  recurring_override boolean default false,
  source text default 'manual',
  import_batch_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Individual expenses
create table if not exists individual_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  description text not null,
  amount numeric(10,2) not null,
  category_id uuid references individual_categories(id),
  expense_date date not null,
  month_year text not null,
  is_visible_to_partner boolean default false,
  reclassified_to_joint uuid references joint_expenses(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Payments between Sarah and David
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  paid_by uuid references profiles(id) not null,
  paid_to uuid references profiles(id) not null,
  amount numeric(10,2) not null,
  payment_date date not null,
  note text,
  created_at timestamptz default now()
);

-- Monthly income entries (per user)
create table if not exists monthly_income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  month_year text not null,
  amount numeric(10,2) not null,
  created_at timestamptz default now(),
  unique(user_id, month_year)
);

-- Savings goals
create table if not exists savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  name text not null,
  target_amount numeric(10,2),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Monthly savings allocations
create table if not exists savings_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  goal_id uuid references savings_goals(id),
  month_year text not null,
  manual_amount numeric(10,2) default 0,
  auto_calculated_amount numeric(10,2) default 0,
  created_at timestamptz default now()
);

-- AI categorization memory (learned corrections)
create table if not exists ai_category_memory (
  id uuid primary key default gen_random_uuid(),
  merchant_pattern text not null unique,
  suggested_category_id uuid references joint_categories(id),
  suggested_type text default 'joint',
  correction_count int default 1,
  last_updated timestamptz default now()
);

-- Statement import batches
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references profiles(id),
  file_name text,
  row_count int,
  imported_at timestamptz default now()
);

-- Forecast overrides
create table if not exists forecast_overrides (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  category_id uuid references joint_categories(id) not null,
  forecasted_amount numeric(10,2) not null,
  note text,
  updated_at timestamptz default now(),
  unique(year, category_id)
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

alter table profiles enable row level security;
alter table joint_categories enable row level security;
alter table individual_categories enable row level security;
alter table split_ratios enable row level security;
alter table joint_expenses enable row level security;
alter table individual_expenses enable row level security;
alter table payments enable row level security;
alter table monthly_income enable row level security;
alter table savings_goals enable row level security;
alter table savings_allocations enable row level security;
alter table ai_category_memory enable row level security;
alter table import_batches enable row level security;
alter table forecast_overrides enable row level security;

-- Profiles: users can read all profiles (to show partner name), update only own
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update" on profiles for update to authenticated using (auth.uid() = id);

-- Joint categories: all authenticated users can read and write
create policy "joint_categories_all" on joint_categories for all to authenticated using (true) with check (true);

-- Individual categories: all authenticated users can read and write
create policy "individual_categories_all" on individual_categories for all to authenticated using (true) with check (true);

-- Split ratios: all authenticated users can read and write
create policy "split_ratios_all" on split_ratios for all to authenticated using (true) with check (true);

-- Joint expenses: all authenticated users can read and write
create policy "joint_expenses_all" on joint_expenses for all to authenticated using (true) with check (true);

-- Individual expenses: read own + partner-visible ones; write only own
create policy "individual_expenses_select" on individual_expenses
  for select to authenticated
  using (user_id = auth.uid() or is_visible_to_partner = true);

create policy "individual_expenses_insert" on individual_expenses
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "individual_expenses_update" on individual_expenses
  for update to authenticated
  using (user_id = auth.uid());

create policy "individual_expenses_delete" on individual_expenses
  for delete to authenticated
  using (user_id = auth.uid());

-- Payments: all authenticated users can read and write
create policy "payments_all" on payments for all to authenticated using (true) with check (true);

-- Monthly income: private by default, user reads/writes own only
create policy "monthly_income_select" on monthly_income
  for select to authenticated using (user_id = auth.uid());
create policy "monthly_income_insert" on monthly_income
  for insert to authenticated with check (user_id = auth.uid());
create policy "monthly_income_update" on monthly_income
  for update to authenticated using (user_id = auth.uid());
create policy "monthly_income_delete" on monthly_income
  for delete to authenticated using (user_id = auth.uid());

-- Savings goals: private by default
create policy "savings_goals_select" on savings_goals
  for select to authenticated using (user_id = auth.uid());
create policy "savings_goals_insert" on savings_goals
  for insert to authenticated with check (user_id = auth.uid());
create policy "savings_goals_update" on savings_goals
  for update to authenticated using (user_id = auth.uid());
create policy "savings_goals_delete" on savings_goals
  for delete to authenticated using (user_id = auth.uid());

-- Savings allocations: private
create policy "savings_allocations_select" on savings_allocations
  for select to authenticated using (user_id = auth.uid());
create policy "savings_allocations_insert" on savings_allocations
  for insert to authenticated with check (user_id = auth.uid());
create policy "savings_allocations_update" on savings_allocations
  for update to authenticated using (user_id = auth.uid());
create policy "savings_allocations_delete" on savings_allocations
  for delete to authenticated using (user_id = auth.uid());

-- AI category memory: both users can read and write
create policy "ai_category_memory_all" on ai_category_memory for all to authenticated using (true) with check (true);

-- Import batches: all authenticated users can read and write
create policy "import_batches_all" on import_batches for all to authenticated using (true) with check (true);

-- Forecast overrides: all authenticated users can read and write
create policy "forecast_overrides_all" on forecast_overrides for all to authenticated using (true) with check (true);

-- ============================================================
-- Auto-create profile on sign up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Seed data
-- ============================================================

-- Joint categories
insert into joint_categories (name, is_required_monthly, sort_order) values
  ('Mortgage', true, 1),
  ('Home Insurance', true, 2),
  ('Enbridge (gas)', false, 3),
  ('Alectra (electricity)', false, 4),
  ('Reliance (hot water)', false, 5),
  ('Water (RHWW)', false, 6),
  ('Internet', false, 7),
  ('Cellphone', false, 8),
  ('Daycare', false, 9),
  ('Car Insurance', false, 10),
  ('Gas', false, 11),
  ('Other Car Expenses', false, 12),
  ('Costco', false, 13),
  ('Other Groceries', false, 14),
  ('Other', false, 15)
on conflict do nothing;

-- Individual categories
insert into individual_categories (name, sort_order) values
  ('Dining', 1),
  ('Grocery', 2),
  ('Travel', 3),
  ('Health', 4),
  ('Kids', 5),
  ('Personal', 6),
  ('Gifts', 7),
  ('Other', 8)
on conflict do nothing;

-- Initial split ratio
insert into split_ratios (effective_date, sarah_pct, david_pct) values
  ('2020-01-01', 50.00, 50.00)
on conflict do nothing;
