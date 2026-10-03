-- Light usage tracking: who had the dashboard open, when, on what kind of device, which tabs.
-- Nothing about what people read, typed or tapped. Each person writes only their own visits;
-- only the admin reads everyone's. Visits older than 60 days are deleted nightly.
-- Undo: drop table public.visits; select cron.unschedule('visits-trim');
create table if not exists public.visits (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  device     text,                          -- "Android · Firefox · app"
  started_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  tabs       jsonb not null default '{}'    -- { "gameday": 3, "talk": 1 }: times each tab was opened
);
create index if not exists visits_user_time on public.visits (user_id, last_seen desc);
alter table public.visits enable row level security;
drop policy if exists "add own visits" on public.visits;
create policy "add own visits" on public.visits for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update own visits" on public.visits;
create policy "update own visits" on public.visits for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "read own or admin" on public.visits;
create policy "read own or admin" on public.visits for select to authenticated using (user_id = auth.uid() or public.is_admin());
select cron.unschedule('visits-trim') where exists (select 1 from cron.job where jobname = 'visits-trim');
select cron.schedule('visits-trim', '23 4 * * *', $$delete from public.visits where last_seen < now() - interval '60 days'$$);
