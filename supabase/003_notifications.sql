-- Phone notifications (Web Push). Run once after schema.sql and 002_chat_archive.sql.
-- Additive only: new tables, two optional columns on messages, a trigger and a schedule.
-- Undo with 003_notifications_rollback.sql.
--
-- Before running: tools/deploy-notifications.mjs stores the shared secret in Vault as
-- 'notify_secret' (the Edge Functions check it), so the trigger and the schedule can call them.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- One row per device that turned notifications on.
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users on delete cascade,
  p256dh     text not null,
  auth       text not null,
  label      text,                       -- "Android · Chrome"
  created_at timestamptz not null default now(),
  last_ok    timestamptz,
  fails      int not null default 0
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own devices" on public.push_subscriptions;
create policy "own devices" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- What each person wants (see js/notify.js for the shape and defaults).
create table if not exists public.notification_prefs (
  user_id    uuid primary key references auth.users on delete cascade,
  prefs      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
drop policy if exists "own prefs" on public.notification_prefs;
create policy "own prefs" on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Games someone tapped the bell on.
create table if not exists public.game_follows (
  user_id    uuid not null references auth.users on delete cascade,
  game_id    text not null,              -- ESPN event id
  week       int,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
alter table public.game_follows enable row level security;
drop policy if exists "own follows" on public.game_follows;
create policy "own follows" on public.game_follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- What was sent, to whom (rate caps, duplicates, after-action). Admin can read; only the server writes.
create table if not exists public.notification_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  kind       text not null,              -- chat, mention, commentator, pick, follow, family, test
  ref        text,                       -- de-duplication key, e.g. final:401872955
  title      text,
  sent       int not null default 0,     -- devices reached
  status     text not null,              -- sent, capped, quiet, no-device, failed
  created_at timestamptz not null default now()
);
create index if not exists notification_log_user_time on public.notification_log (user_id, created_at desc);
create index if not exists notification_log_ref on public.notification_log (user_id, ref);
alter table public.notification_log enable row level security;
drop policy if exists "admin reads log" on public.notification_log;
create policy "admin reads log" on public.notification_log for select to authenticated using (public.is_admin());

-- Last seen state of each game, so the game watcher only reports changes. Server only (no policies).
create table if not exists public.game_alert_state (
  game_id    text primary key,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.game_alert_state enable row level security;

-- The Commentator labels its posts (preview, recap, ask, answer, news, play) and who a post is for.
alter table public.messages add column if not exists kind text;
alter table public.messages add column if not exists meta jsonb;

-- New chat message -> notify-chat (asynchronous: never slows down posting).
create or replace function public.notify_chat_hook() returns trigger
language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://zivdbnkmgogmyclewabr.supabase.co/functions/v1/notify-chat',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 5000);
  return new;
end $$;
drop trigger if exists notify_chat on public.messages;
create trigger notify_chat after insert on public.messages for each row execute function public.notify_chat_hook();

-- Game watcher: every minute. The function returns at once when no family-picked game is near.
create or replace function public.notify_games_tick() returns void
language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://zivdbnkmgogmyclewabr.supabase.co/functions/v1/notify-games',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
end $$;
select cron.unschedule('notify-games') where exists (select 1 from cron.job where jobname = 'notify-games');
select cron.schedule('notify-games', '* * * * *', 'select public.notify_games_tick()');

-- Old log rows aren't needed after a month.
select cron.unschedule('notify-log-trim') where exists (select 1 from cron.job where jobname = 'notify-log-trim');
select cron.schedule('notify-log-trim', '17 4 * * *', $$delete from public.notification_log where created_at < now() - interval '35 days'$$);
