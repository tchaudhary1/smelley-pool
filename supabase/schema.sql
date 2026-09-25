-- Smelley pool dashboard — Supabase schema.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Everything is readable only by signed-in family members; nothing is public.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  first_name text not null unique,          -- login name, lowercase: jamie, debbie, ...
  pool_name  text,                          -- name as it appears on the pool sheets
  is_admin   boolean not null default false
);

-- Weekly data blobs pushed by the admin: 'league', 'week4', 'week5', ...
create table if not exists public.datasets (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users
);

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  week       int,
  game_no    int,                           -- optional: pool number the message is about
  body       text not null check (char_length(body) between 1 and 1000)
);

create table if not exists public.reactions (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  target     text not null,                 -- 'msg:123', 'pick:4:jamie:10', 'game:4:93'
  emoji      text not null check (char_length(emoji) <= 16),
  unique (user_id, target, emoji)
);

alter table public.profiles  enable row level security;
alter table public.datasets  enable row level security;
alter table public.messages  enable row level security;
alter table public.reactions enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false)
$$;

drop policy if exists "family reads profiles" on public.profiles;
create policy "family reads profiles" on public.profiles for select to authenticated using (true);

drop policy if exists "family reads data" on public.datasets;
create policy "family reads data" on public.datasets for select to authenticated using (true);
drop policy if exists "admin writes data" on public.datasets;
create policy "admin writes data" on public.datasets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "family reads messages" on public.messages;
create policy "family reads messages" on public.messages for select to authenticated using (true);
drop policy if exists "post as yourself" on public.messages;
create policy "post as yourself" on public.messages for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own messages" on public.messages;
create policy "delete own messages" on public.messages for delete to authenticated using (user_id = auth.uid());

drop policy if exists "family reads reactions" on public.reactions;
create policy "family reads reactions" on public.reactions for select to authenticated using (true);
drop policy if exists "react as yourself" on public.reactions;
create policy "react as yourself" on public.reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "unreact own" on public.reactions;
create policy "unreact own" on public.reactions for delete to authenticated using (user_id = auth.uid());

-- Live updates for the chat and reactions.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.reactions;
