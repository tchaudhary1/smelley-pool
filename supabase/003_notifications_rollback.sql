-- Undo 003_notifications.sql. Chat, picks and everything else are untouched.
-- The two columns on messages are kept (harmless); uncomment the last lines to drop them too.
select cron.unschedule('notify-games') where exists (select 1 from cron.job where jobname = 'notify-games');
select cron.unschedule('notify-log-trim') where exists (select 1 from cron.job where jobname = 'notify-log-trim');
drop trigger if exists notify_chat on public.messages;
drop function if exists public.notify_chat_hook();
drop function if exists public.notify_games_tick();
drop table if exists public.game_alert_state;
drop table if exists public.notification_log;
drop table if exists public.game_follows;
drop table if exists public.notification_prefs;
drop table if exists public.push_subscriptions;
delete from vault.secrets where name = 'notify_secret';
-- alter table public.messages drop column if exists kind;
-- alter table public.messages drop column if exists meta;
