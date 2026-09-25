// Quick health check: which tables exist and how many rows. Uses the secret key from .env / env.
import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
for (const t of ['profiles', 'datasets', 'messages', 'reactions']) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log(t.padEnd(10), error ? `MISSING/ERROR: ${error.message}` : `ok (${count} rows)`);
}
const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
const { data, error } = await anon.from('datasets').select('key');
console.log('anon (signed-out) read of datasets:', error ? `blocked (${error.message})` : `${data.length} rows visible`);
