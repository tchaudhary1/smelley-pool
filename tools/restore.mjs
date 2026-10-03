// Restore tables from a tools/backup.mjs snapshot. Dry run by default: it prints what would change.
//
//   node tools/restore.mjs backups/<folder>                 # dry run, all tables in the snapshot
//   node tools/restore.mjs backups/<folder> datasets --go   # write: upsert those rows back
//
// Rows are upserted by primary key (existing rows are overwritten with the snapshot's values; rows
// added since the snapshot are left alone). Auth users can't be restored this way: re-invite them.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';

const [dir, ...rest] = process.argv.slice(2);
if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error('usage: node tools/restore.mjs backups/<folder> [table ...] [--go]');
const go = rest.includes('--go');
const KEYS = { datasets: 'key', profiles: 'user_id', messages: 'id', reactions: 'id', push_subscriptions: 'endpoint', notification_prefs: 'user_id', game_follows: 'user_id,game_id', notification_log: 'id', game_alert_state: 'game_id', visits: 'id' };
// messages/reactions ids are "generated always", which the API can't write: restore those with the SQL
// editor if ever needed (the snapshot JSON has every column). Everything else upserts cleanly.
const SQL_ONLY = new Set(['messages', 'reactions', 'notification_log']);
const want = rest.filter(x => !x.startsWith('--'));
const tables = (want.length ? want : Object.keys(KEYS)).filter(t => fs.existsSync(path.join(dir, `${t}.json`)));
for (const t of tables.filter(t => SQL_ONLY.has(t))) console.log(`${t}: kept in the snapshot, restore through the SQL editor (identity ids)`);
tables.splice(0, tables.length, ...tables.filter(t => !SQL_ONLY.has(t)));
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
for (const t of tables) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, `${t}.json`), 'utf8'));
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log(`${t}: snapshot ${rows.length} rows, live ${count ?? '?'} rows${go ? '' : ' (dry run)'}`);
  if (!go || !rows.length) continue;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(t).upsert(rows.slice(i, i + 500), { onConflict: KEYS[t] });
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  console.log(`  restored ${rows.length} rows`);
}
