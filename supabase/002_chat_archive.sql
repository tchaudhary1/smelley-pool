-- Chat clear/archive (run once in the Supabase SQL editor, after schema.sql).
-- "Clear chat" marks messages archived: they disappear for the family but stay available to
-- the admin (view, download, or delete permanently).

alter table public.messages add column if not exists archived_at   timestamptz;
alter table public.messages add column if not exists archive_label text;
create index if not exists messages_archived_idx on public.messages (archived_at);

-- Family sees only the live chat; the admin can also see archives.
drop policy if exists "family reads messages" on public.messages;
create policy "family reads messages" on public.messages for select to authenticated
  using (archived_at is null or public.is_admin());

-- New messages always start in the live chat.
drop policy if exists "post as yourself" on public.messages;
create policy "post as yourself" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and archived_at is null and archive_label is null);

-- Only the admin can archive (update) or permanently delete other people's messages.
drop policy if exists "admin archives messages" on public.messages;
create policy "admin archives messages" on public.messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin deletes messages" on public.messages;
create policy "admin deletes messages" on public.messages for delete to authenticated
  using (public.is_admin());
drop policy if exists "admin deletes reactions" on public.reactions;
create policy "admin deletes reactions" on public.reactions for delete to authenticated
  using (public.is_admin());
