// Create (or reset) The Commentator's bot account and save its sign-in to .commentator.local.json.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The bot is an ordinary, non-admin family
// account: it can read the pool and post chat messages, and nothing else.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';
import { BOT } from '../js/config.js';

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const email = 'commentator.smelley@example.com';   // reserved domain: never receives mail
const password = crypto.randomBytes(24).toString('base64url');

const { data: list, error: le } = await sb.auth.admin.listUsers({ perPage: 200 });
if (le) throw le;
let user = list.users.find(u => u.email === email);
if (user) { const { error } = await sb.auth.admin.updateUserById(user.id, { password }); if (error) throw error; }
else { const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error; user = data.user; }
const { error: pe } = await sb.from('profiles').upsert({ user_id: user.id, first_name: BOT.key, pool_name: null, is_admin: false });
if (pe) throw pe;
fs.writeFileSync('.commentator.local.json', JSON.stringify({ email, password }), { mode: 0o600 });
console.log(`bot account ready (${user.id}); credentials saved to .commentator.local.json`);
