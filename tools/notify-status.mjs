// Who has notifications on, and the last few notifications sent (for checking and after-action).
//   node tools/notify-status.mjs   (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: subs } = await sb.from('push_subscriptions').select('user_id, label, created_at, last_ok, fails');
const { data: prof } = await sb.from('profiles').select('user_id, first_name'); const k = Object.fromEntries(prof.map(p => [p.user_id, p.first_name]));
console.log('devices:', (subs || []).map(s => `${k[s.user_id]} ${s.label} last_ok=${s.last_ok ? new Date(s.last_ok).toLocaleTimeString('en-US',{timeZone:'America/New_York'}) : '-'} fails=${s.fails}`));
const { data: log } = await sb.from('notification_log').select('*').order('id', { ascending: false }).limit(8);
for (const l of log || []) console.log(new Date(l.created_at).toLocaleTimeString('en-US',{timeZone:'America/New_York'}), k[l.user_id], l.kind, l.status, l.sent, l.title);
const { data: m } = await sb.from('messages').select('id, kind, meta, body').order('id', { ascending: false }).limit(2);
console.log('latest messages:', JSON.stringify(m.map(x => ({ id: x.id, kind: x.kind, meta: x.meta, body: x.body.slice(0, 40) }))));
