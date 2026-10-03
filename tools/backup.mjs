// Snapshot every Supabase table to backups/<timestamp>/ (gitignored), plus the auth user list
// (ids, emails, sign-in times; no passwords exist to copy). Restore with tools/restore.mjs.
//
//   node tools/backup.mjs [label]
//
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env or the environment).
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
// Every table the site uses. New tables (notifications) are included when they exist.
const TABLES = ['datasets', 'profiles', 'messages', 'reactions', 'push_subscriptions', 'notification_prefs', 'game_follows', 'notification_log', 'game_alert_state', 'visits'];
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join('backups', `${stamp}${process.argv[2] ? '-' + process.argv[2].replace(/[^\w-]/g, '') : ''}`);
fs.mkdirSync(dir, { recursive: true });

async function all(table) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select('*').range(from, from + page - 1);
    if (error) return { error };
    out.push(...data); if (data.length < page) return { rows: out };
  }
}
const summary = {};
for (const t of TABLES) {
  const { rows, error } = await all(t);
  if (error) { summary[t] = /does not exist|schema cache/i.test(error.message) ? 'not present' : `ERROR ${error.message}`; continue; }
  fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 1));
  summary[t] = rows.length;
}
const users = []; for (let p = 1; ; p++) { const { data, error } = await sb.auth.admin.listUsers({ page: p, perPage: 200 }); if (error) break; users.push(...data.users.map(u => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at }))); if (data.users.length < 200) break; }
fs.writeFileSync(path.join(dir, 'auth_users.json'), JSON.stringify(users, null, 1)); summary.auth_users = users.length;
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), git: process.env.GIT_HEAD || null, summary }, null, 1));
console.log(`backup written to ${dir}`); console.table(summary);
