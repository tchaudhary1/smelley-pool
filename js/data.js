// Backend: Supabase when configured, otherwise a local preview that reads ./local-data/
// and keeps chat in this browser only.
import { SUPABASE_URL, SUPABASE_ANON_KEY, FAMILY } from './config.js';

// Local preview: no backend configured, or ?preview on localhost (dev testing without touching the real data).
export const LOCAL = !SUPABASE_URL || (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('preview'));
let sb = null;

async function client() {
  if (sb || LOCAL) return sb;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  // detectSessionInUrl picks up sign-in links, invites and password-reset links on return.
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
  return sb;
}
const returnUrl = () => location.origin + location.pathname;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- auth ----------
export async function currentUser() {
  if (LOCAL) return store.get('sp.localUser', null);
  const c = await client();
  const { data } = await c.auth.getSession();
  if (!data.session) return null;
  return profileFor(data.session.user);
}
async function profileFor(user) {
  const c = await client();
  const { data } = await c.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (!data) { await c.auth.signOut(); throw new Error('That email isn’t on the family list. Ask Tarun to add you.'); }
  return { id: user.id, key: data.first_name, email: user.email, admin: !!data.is_admin };
}
const friendly = e => /Invalid login credentials/i.test(e.message) ? 'Wrong email or password.'
  : /Signups not allowed|not found|User not found/i.test(e.message) ? 'That email isn’t on the family list.'
  : /rate limit/i.test(e.message) ? 'Too many emails just now. Try again in a little while, or use your password.' : e.message;

export async function signIn(email, password) {
  if (LOCAL) {   // preview: accept a family first name (or an email starting with one), any password
    const key = email.trim().toLowerCase().split(/[@.\s]/)[0];
    if (!FAMILY.some(f => f.key === key)) throw new Error('Preview mode: type a family first name, e.g. jamie.');
    const u = { id: 'local-' + key, key, admin: key === 'tarun' }; store.set('sp.localUser', u); return u;
  }
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendly(error));
  return profileFor(data.user);
}
// Passwordless: emails a one-tap sign-in link. Only existing (invited) accounts get one.
export async function sendSignInLink(email) {
  if (LOCAL) throw new Error('Sign-in links need the live site.');
  const { error } = await (await client()).auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: returnUrl() } });
  if (error) throw new Error(friendly(error));
}
export async function sendPasswordReset(email) {
  if (LOCAL) throw new Error('Password resets need the live site.');
  const { error } = await (await client()).auth.resetPasswordForEmail(email.trim(), { redirectTo: returnUrl() });
  if (error) throw new Error(friendly(error));
}
export async function setPassword(password) {
  const { error } = await (await client()).auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
// Calls back with 'recovery' when the page was opened from a reset or invite link.
export async function onAuthEvent(cb) {
  if (LOCAL) return;
  (await client()).auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') cb('recovery'); });
}
export async function signOut() {
  if (LOCAL) { store.set('sp.localUser', null); return; }
  await (await client()).auth.signOut();
}

// ---------- roster (full names live in the database, not the repo) ----------
export async function loadRoster() {
  if (LOCAL) { const r = await fetch('./local-data/roster.json', { cache: 'no-store' }); return r.ok ? r.json() : {}; }
  // The 'roster' dataset (pushed by the admin) covers everyone, with or without an account yet.
  const c = await client();
  const [{ data: ds }, { data: profs }] = await Promise.all([
    c.from('datasets').select('value').eq('key', 'roster').maybeSingle(),
    c.from('profiles').select('first_name, pool_name')]);
  return { ...Object.fromEntries((profs || []).filter(p => p.pool_name).map(p => [p.first_name, p.pool_name])), ...(ds?.value || {}) };
}

// ---------- datasets ----------
export async function loadDataset(key) {
  if (LOCAL) {
    const r = await fetch(`./local-data/${key}.json`, { cache: 'no-store' });
    if (!r.ok) return null;
    return r.json();
  }
  const c = await client();
  const { data, error } = await c.from('datasets').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}
export async function saveDataset(key, value) {
  if (LOCAL) throw new Error('Uploading needs the Supabase backend (preview mode is read-only).');
  const c = await client();
  const { error } = await c.from('datasets').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------- chat + reactions ----------
const keyOf = {};   // user_id -> first-name key (Supabase mode)
async function loadProfiles() {
  if (LOCAL) return;
  const { data } = await (await client()).from('profiles').select('user_id, first_name');
  for (const p of data || []) keyOf[p.user_id] = p.first_name;
}
const shapeMsg = m => ({ id: m.id, at: m.created_at, who: keyOf[m.user_id] ?? m.who ?? '?', week: m.week, game: m.game_no, body: m.body, mine: false });

export async function listMessages(week) {
  if (LOCAL) return store.get('sp.msgs', []).filter(m => !week || m.week === week);
  await loadProfiles();
  const q = (await client()).from('messages').select('*').order('created_at', { ascending: true }).limit(500);
  const { data, error } = week ? await q.eq('week', week) : await q;
  if (error) throw error;
  return data.map(shapeMsg);
}
export async function postMessage(user, { body, week, game }) {
  if (LOCAL) {
    const msgs = store.get('sp.msgs', []);
    const m = { id: Date.now(), at: new Date().toISOString(), who: user.key, week, game: game ?? null, body };
    msgs.push(m); store.set('sp.msgs', msgs); return m;
  }
  const { data, error } = await (await client()).from('messages')
    .insert({ body, week, game_no: game ?? null }).select().single();
  if (error) throw error;
  keyOf[data.user_id] = user.key;
  return shapeMsg(data);
}
export async function deleteMessage(id) {
  if (LOCAL) { store.set('sp.msgs', store.get('sp.msgs', []).filter(m => m.id !== id)); return; }
  await (await client()).from('messages').delete().eq('id', id);
}

export async function listReactions() {
  if (LOCAL) return store.get('sp.reacts', []);
  await loadProfiles();
  const { data } = await (await client()).from('reactions').select('*').limit(5000);
  return (data || []).map(r => ({ id: r.id, who: keyOf[r.user_id] ?? '?', target: r.target, emoji: r.emoji }));
}
export async function toggleReaction(user, target, emoji, existing) {
  if (LOCAL) {
    let rs = store.get('sp.reacts', []);
    rs = existing ? rs.filter(r => !(r.who === user.key && r.target === target && r.emoji === emoji))
                  : [...rs, { id: Date.now(), who: user.key, target, emoji }];
    store.set('sp.reacts', rs); return;
  }
  const c = await client();
  if (existing) await c.from('reactions').delete().match({ target, emoji, user_id: user.id });
  else await c.from('reactions').insert({ target, emoji });
}

// Realtime: call onChange() whenever chat or reactions change anywhere.
export async function subscribe(onChange) {
  if (LOCAL) { window.addEventListener('storage', onChange); return; }
  const c = await client();
  c.channel('family').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, onChange).subscribe();
}
