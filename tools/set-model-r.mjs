// Merge college power-rating residuals (local-data/modelR.json) into week<N> on Supabase without
// touching anything else in it (picks uploaded from the site are preserved).
//   node tools/set-model-r.mjs 4
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';
const wk = process.argv[2]; if (!wk) throw new Error('usage: node tools/set-model-r.mjs <week>');
const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const modelR = JSON.parse(fs.readFileSync('local-data/modelR.json', 'utf8'));
const { data, error } = await sb.from('datasets').select('value').eq('key', `week${wk}`).single(); if (error) throw error;
const value = { ...data.value, modelR };
const { error: e2 } = await sb.from('datasets').update({ value, updated_at: new Date().toISOString() }).eq('key', `week${wk}`); if (e2) throw e2;
console.log(`week${wk}: modelR for ${Object.keys(modelR).length} games; picks kept: ${Object.keys(value.picks || {}).join(', ')}`);
