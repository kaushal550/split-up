-- Run this entire file in your Supabase project's SQL Editor

-- Profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Groups
create table if not exists groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Group members
create table if not exists group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- Expenses (group_id null = personal expense)
create table if not exists expenses (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade,
  paid_by uuid references profiles(id) on delete set null,
  amount numeric(12, 2) not null,
  description text not null,
  category text not null default 'General',
  date date not null default current_date,
  created_at timestamptz default now()
);

-- Expense splits (only for group expenses)
create table if not exists expense_splits (
  id uuid default gen_random_uuid() primary key,
  expense_id uuid references expenses(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  amount numeric(12, 2) not null,
  settled boolean default false,
  settled_at timestamptz
);

-- Row Level Security
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;

-- Profiles: users can read all profiles (needed for group member display), edit own
create policy "Profiles are viewable by authenticated users" on profiles
  for select using (auth.role() = 'authenticated');
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Groups: members can see their groups
create policy "Group members can view groups" on groups
  for select using (
    exists (select 1 from group_members where group_id = groups.id and user_id = auth.uid())
  );
create policy "Authenticated users can create groups" on groups
  for insert with check (auth.uid() = created_by);
create policy "Group creator can update group" on groups
  for update using (auth.uid() = created_by);

-- Group members: members can see membership
create policy "Members can view group membership" on group_members
  for select using (
    user_id = auth.uid() or
    exists (select 1 from group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid())
  );
create policy "Group creator can manage members" on group_members
  for insert with check (
    exists (select 1 from groups where id = group_id and created_by = auth.uid())
    or user_id = auth.uid()
  );
create policy "Members can leave groups" on group_members
  for delete using (user_id = auth.uid());

-- Expenses: group members can see group expenses; users can see own personal expenses
create policy "View group expenses" on expenses
  for select using (
    (group_id is null and paid_by = auth.uid()) or
    exists (select 1 from group_members where group_id = expenses.group_id and user_id = auth.uid())
  );
create policy "Group members can insert expenses" on expenses
  for insert with check (
    (group_id is null and paid_by = auth.uid()) or
    exists (select 1 from group_members where group_id = expenses.group_id and user_id = auth.uid())
  );
create policy "Expense creator can update" on expenses
  for update using (paid_by = auth.uid());
create policy "Expense creator can delete" on expenses
  for delete using (paid_by = auth.uid());

-- Expense splits: group members can see splits
create policy "View splits for group expenses" on expense_splits
  for select using (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_id and gm.user_id = auth.uid()
    )
  );
create policy "Group members can insert splits" on expense_splits
  for insert with check (
    exists (
      select 1 from expenses e
      join group_members gm on gm.group_id = e.group_id
      where e.id = expense_id and gm.user_id = auth.uid()
    )
  );
create policy "Split owner can update settled status" on expense_splits
  for update using (user_id = auth.uid());
