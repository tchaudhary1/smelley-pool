// After-action report for one day: how the Commentator ran, how fast it answered, what went wrong,
// and how the family used the chat.
//   node tools/after-action.mjs [YYYY-MM-DD]      (default: today, Eastern time)
// Reads monitor/commentator-<date>.jsonl (written by tools/commentator.mjs) and, signed in as the
// bot, that day's chat from Supabase.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const day = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const file = path.join(ROOT, 'monitor', `commentator-${day}.jsonl`);
const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const et = t => new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const sec = ms => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`);
const out = [`AFTER-ACTION REPORT · ${day}`, ''];

// ---- Commentator uptime and health
const ticks = rows.filter(r => r.type === 'tick'), starts = rows.filter(r => r.type === 'start'), errs = rows.filter(r => r.type === 'error'), posts = rows.filter(r => r.type === 'post');
if (!rows.length) out.push(`No monitor log for ${day} (${path.relative(ROOT, file)}). Was the Commentator running?`);
else {
  const gaps = []; for (let i = 1; i < ticks.length; i++) { const g = Date.parse(ticks[i].t) - Date.parse(ticks[i - 1].t); if (g > 10 * 60e3) gaps.push(`${et(ticks[i - 1].t)}–${et(ticks[i].t)} (${Math.round(g / 60e3)} min)`); }
  out.push('COMMENTATOR');
  out.push(`  Running ${et(rows[0].t)} → ${et(rows.at(-1).t)} · ${ticks.length} checks · ${starts.length} start${starts.length === 1 ? '' : 's'}${starts.length > 1 ? ` (restarted at ${starts.slice(1).map(s => et(s.t)).join(', ')})` : ''}`);
  out.push(`  Gaps over 10 minutes between checks: ${gaps.length ? gaps.join('; ') : 'none'}`);
  const tm = ticks.map(t => t.ms).filter(Number.isFinite), em = ticks.map(t => t.espnMs).filter(Number.isFinite), sm = ticks.map(t => t.simMs).filter(Number.isFinite);
  out.push(`  Check time: typical ${sec(q(tm, 0.5))}, slowest 10% ${sec(q(tm, 0.9))}, worst ${sec(Math.max(...tm, 0))} · ESPN fetch typical ${sec(q(em, 0.5))} · simulation typical ${sec(q(sm, 0.5))}`);
  const live = ticks.filter(t => t.live > 0);
  if (live.length) out.push(`  Games live from about ${et(live[0].t)} to ${et(live.at(-1).t)}; most at once: ${Math.max(...live.map(t => t.live))}`);
  const espnFail = ticks.reduce((s, t) => s + (t.espnFail || 0), 0);
  out.push(`  ESPN fetch failures: ${espnFail}${espnFail ? ` (in ${ticks.filter(t => t.espnFail).length} checks)` : ''}`);
  out.push(`  Errors: ${errs.length}${errs.length ? '' : ' 🎉'}`);
  for (const e of errs.slice(0, 12)) out.push(`    ${et(e.t)} [${e.where}${e.kind ? ' ' + e.kind : ''}] ${e.message}`);
  out.push('');
  // ---- Posts
  const byKind = {}; for (const p of posts) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  const cm = posts.map(p => p.claudeMs).filter(Number.isFinite);
  out.push('POSTS');
  out.push(`  ${posts.length} posts: ${Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
  out.push(`  Claude time per post: typical ${sec(q(cm, 0.5))}, slowest 10% ${sec(q(cm, 0.9))}, worst ${sec(Math.max(...cm, 0))} · pronoun rewrites: ${posts.reduce((s, p) => s + (p.rewrites || 0), 0)}`);
  const hours = {}; for (const p of posts) { const h = new Date(p.t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric' }); hours[h] = (hours[h] || 0) + 1; }
  out.push(`  By hour: ${Object.entries(hours).map(([h, n]) => `${h} ${n}`).join(' · ') || '–'}`);
  const qa = posts.filter(p => p.kind === 'qa');
  if (qa.length) {
    const pick = qa.map(p => p.pickupSec).filter(Number.isFinite), ans = qa.map(p => p.answeredSec).filter(Number.isFinite);
    out.push(`  Questions answered: ${qa.length} (${qa.filter(p => p.web).length} used web search) · picked up in typically ${q(pick, 0.5)}s (worst ${Math.max(...pick)}s) · answer posted in typically ${q(ans, 0.5)}s (worst ${Math.max(...ans)}s)`);
  }
  out.push('');
}

// ---- Chat engagement (signed in as the bot; it can read the family chat)
try {
  const creds = JSON.parse(fs.readFileSync(path.join(ROOT, '.commentator.local.json'), 'utf8'));
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(creds); if (error) throw error;
  const start = new Date(`${day}T00:00:00-04:00`), end = new Date(start.getTime() + 864e5);
  const { data: msgs } = await sb.from('messages').select('id, user_id, body, created_at').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).order('id');
  const { data: profs } = await sb.from('profiles').select('user_id, first_name');
  const name = Object.fromEntries((profs || []).map(p => [p.user_id, p.first_name]));
  const ids = (msgs || []).map(m => `msg:${m.id}`);
  const { data: reacts } = ids.length ? await sb.from('reactions').select('target, emoji, user_id').in('target', ids) : { data: [] };
  const byWho = {}; for (const m of msgs || []) { const n = name[m.user_id] || '?'; byWho[n] = (byWho[n] || 0) + 1; }
  const tags = (msgs || []).filter(m => name[m.user_id] !== 'commentator' && /@commentator\b/i.test(m.body));
  const emoji = {}; for (const r of reacts || []) emoji[r.emoji] = (emoji[r.emoji] || 0) + 1;
  out.push('SMACK TALK');
  out.push(`  ${msgs?.length || 0} messages: ${Object.entries(byWho).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', ') || 'none'}`);
  out.push(`  Questions for the Commentator: ${tags.length} (from ${[...new Set(tags.map(m => name[m.user_id]))].join(', ') || '–'})`);
  out.push(`  Reactions: ${(reacts || []).length}${(reacts || []).length ? ' · ' + Object.entries(emoji).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}${n}`).join(' ') : ''}`);
  const busiest = {}; for (const m of msgs || []) { const h = new Date(m.created_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric' }); busiest[h] = (busiest[h] || 0) + 1; }
  const top = Object.entries(busiest).sort((a, b) => b[1] - a[1])[0]; if (top) out.push(`  Busiest hour: ${top[0]} (${top[1]} messages)`);
} catch (e) { out.push(`SMACK TALK: couldn't read the chat (${e.message})`); }

console.log(out.join('\n'));
