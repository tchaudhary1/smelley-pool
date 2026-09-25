// Upload local-data/*.json to Supabase so the family sees it.
//
//   node tools/push-data.mjs league week4 settings
//
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env. With no arguments, pushes every
// file in local-data/.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const keys = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync('local-data').filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
for (const key of keys) {
  const value = JSON.parse(fs.readFileSync(`local-data/${key}.json`, 'utf8'));
  const { error } = await sb.from('datasets').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
  console.log(`pushed ${key}`);
}
