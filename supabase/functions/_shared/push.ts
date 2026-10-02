// Shared by the notification functions: the service client, preferences, and delivery with every
// rule applied (de-duplication, quiet hours, hourly cap, lock-screen privacy, dead-device cleanup).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mergePrefs, inQuietHours, presentable } from './site/notify.js';

export const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
webpush.setVapidDetails('https://tchaudhary1.github.io/smelley-pool/', Deno.env.get('VAPID_PUBLIC')!, Deno.env.get('VAPID_PRIVATE')!);

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// The database trigger and schedule send this header; nothing else can call these functions.
export const authorized = (req: Request) => {
  const want = Deno.env.get('NOTIFY_SECRET'); const got = req.headers.get('x-notify-secret');
  return !!want && got === want;
};

// Everyone who has at least one device on: { userId, key, prefs }.
export async function audience() {
  const [{ data: subs }, { data: profiles }, { data: prefs }] = await Promise.all([
    sb.from('push_subscriptions').select('user_id'),
    sb.from('profiles').select('user_id, first_name'),
    sb.from('notification_prefs').select('user_id, prefs'),
  ]);
  const ids = [...new Set((subs || []).map(s => s.user_id))];
  const keyOf = new Map((profiles || []).map(p => [p.user_id, p.first_name]));
  const prefOf = new Map((prefs || []).map(p => [p.user_id, p.prefs]));
  return { people: ids.map(id => ({ userId: id, key: keyOf.get(id), prefs: mergePrefs(prefOf.get(id) || {}) })).filter(p => p.key), keyOf };
}

export type Notice = { kind: string; ref?: string; title: string; body: string; url?: string; tag?: string; ttl?: number; urgent?: boolean };

// Send one notice to every device a person has. Returns the status written to the log.
export async function deliver(person: { userId: string; prefs: any }, n: Notice, { force = false } = {}) {
  const log = (status: string, sent = 0) => sb.from('notification_log').insert({ user_id: person.userId, kind: n.kind, ref: n.ref ?? null, title: n.title, sent, status }).then(() => status);
  if (n.ref) {
    const { count } = await sb.from('notification_log').select('id', { count: 'exact', head: true }).eq('user_id', person.userId).eq('ref', n.ref).eq('status', 'sent');
    if (count) return 'duplicate';
  }
  if (!force && inQuietHours(person.prefs)) return log('quiet');
  const cap = Number(person.prefs.cap) || 0;
  if (!force && cap > 0) {
    const { count } = await sb.from('notification_log').select('id', { count: 'exact', head: true })
      .eq('user_id', person.userId).eq('status', 'sent').neq('kind', 'test').gte('created_at', new Date(Date.now() - 3600e3).toISOString());
    if ((count || 0) >= cap) return log('capped');
  }
  const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', person.userId);
  if (!subs?.length) return log('no-device');
  const shown = presentable(n, person.prefs);
  const payload = JSON.stringify({ title: shown.title, body: shown.body, url: n.url || './', tag: n.tag || n.kind, kind: n.kind });
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
        { TTL: n.ttl ?? 6 * 3600, urgency: n.urgent ? 'high' : 'normal' });
      sent++; await sb.from('push_subscriptions').update({ last_ok: new Date().toISOString(), fails: 0 }).eq('endpoint', s.endpoint);
    } catch (e: any) {
      const code = e?.statusCode;
      // 404/410: the browser dropped this subscription (app removed, permission revoked). Forget it.
      if (code === 404 || code === 410 || (s.fails ?? 0) >= 4) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else await sb.from('push_subscriptions').update({ fails: (s.fails ?? 0) + 1 }).eq('endpoint', s.endpoint);
    }
  }));
  return log(sent ? 'sent' : 'failed', sent);
}
