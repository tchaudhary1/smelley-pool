// "Send me a test" from the Notifications screen. Signed-in users only; reaches only their own devices.
import { sb, json, deliver } from '../_shared/push.ts';
import { mergePrefs } from '../_shared/site/notify.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return new Response(JSON.stringify({ error: 'sign in first' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  const { data: pr } = await sb.from('notification_prefs').select('prefs').eq('user_id', user.id).maybeSingle();
  const status = await deliver({ userId: user.id, prefs: mergePrefs(pr?.prefs || {}) },
    { kind: 'test', title: '🔔 Notifications are on', body: 'This is a test from the Smelley Pool. No lead is safe.', url: './', tag: 'test', ttl: 600, urgent: true }, { force: true });
  const { count } = await sb.from('push_subscriptions').select('endpoint', { count: 'exact', head: true }).eq('user_id', user.id);
  return new Response(JSON.stringify({ status, devices: count || 0 }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
