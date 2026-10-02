// Called by the database trigger on every new chat message: works out who wants to hear about it
// (js/notify.js chatNotice) and sends it. Chat notifications don't depend on Tarun's PC.
import { sb, json, authorized, audience, deliver } from '../_shared/push.ts';
import { chatNotice } from '../_shared/site/notify.js';

Deno.serve(async req => {
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401);
  const { id } = await req.json().catch(() => ({}));
  if (!id) return json({ error: 'no message id' }, 400);
  const { data: m } = await sb.from('messages').select('id, user_id, body, kind, meta, week').eq('id', id).maybeSingle();
  if (!m) return json({ skipped: 'message not found' });
  const { people, keyOf } = await audience();
  const msg = { body: m.body, kind: m.kind, meta: m.meta, author: keyOf.get(m.user_id) };
  const results: Record<string, string> = {};
  await Promise.all(people.map(async p => {
    const n = chatNotice(msg, p.key, p.prefs); if (!n) return;
    // One chat notification per person that updates in place (the phone shows the latest).
    results[p.key] = await deliver(p, { ...n, ref: `msg:${m.id}`, url: './#talk', tag: 'chat', ttl: 12 * 3600, urgent: n.kind === 'mention' });
  }));
  return json({ message: m.id, results });
});
