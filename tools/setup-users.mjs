// Add family members (invite-only) and link each login to their pool entry.
//
//   1. .env (gitignored) holds SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
//   2. users.local.json (gitignored) lists who gets access, keyed by the family key in js/config.js:
//        {
//          "jamie":  { "email": "jamie@…", "pool": "<name exactly as on the pool sheet>" },
//          "debbie": { "email": "debbie@…", "pool": "<name on the pool sheet>", "password": "a starting password" },
//          "tarun":  { "email": "tarun@…", "admin": true }
//        }
//      - With "password": the account is created ready to use, and no email is sent.
//        They can change it later from the account menu.
//      - Without "password": Supabase emails an invite. The link signs them in; after that,
//        sign-in links work, or they set a password from the account menu.
//   3. node tools/setup-users.mjs   (safe to re-run: existing accounts are updated, not duplicated)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';
import { FAMILY } from '../js/config.js';

const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const people = JSON.parse(fs.readFileSync('users.local.json', 'utf8'));
const siteUrl = process.env.SITE_URL || 'https://tchaudhary1.github.io/smelley-pool/';

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 200 });
if (listErr) throw listErr;
for (const [key, p] of Object.entries(people)) {
  if (!FAMILY.some(f => f.key === key)) { console.warn(`skip ${key}: not in FAMILY (js/config.js)`); continue; }
  const email = String(p.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) { console.warn(`skip ${key}: missing or invalid email`); continue; }
  if (p.password && p.password.length < 8) { console.warn(`skip ${key}: password must be at least 8 characters`); continue; }

  // An existing account for this family member, matched by profile first, then by email.
  const { data: prof } = await sb.from('profiles').select('user_id').eq('first_name', key).maybeSingle();
  let user = list.users.find(u => u.id === prof?.user_id) || list.users.find(u => u.email === email);

  if (user) {
    const patch = {};
    if (user.email !== email) { patch.email = email; patch.email_confirm = true; }
    if (p.password) patch.password = p.password;
    if (Object.keys(patch).length) { const { error } = await sb.auth.admin.updateUserById(user.id, patch); if (error) throw error; }
    console.log(`updated ${key}${patch.email ? ' (email changed)' : ''}${patch.password ? ' (password set)' : ''}`);
  } else if (p.password) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: p.password, email_confirm: true });
    if (error) throw error; user = data.user; console.log(`created ${key} with a starting password`);
  } else {
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: siteUrl });
    if (error) throw new Error(`${key}: ${error.message}${/rate/i.test(error.message) ? ' (built-in email is rate-limited; retry later or give a starting password)' : ''}`);
    user = data.user; console.log(`invited ${key} (email sent to ${email})`);
  }
  const { error: pErr } = await sb.from('profiles').upsert({ user_id: user.id, first_name: key, pool_name: p.pool ?? null, is_admin: !!p.admin });
  if (pErr) throw pErr;
}
console.log('done');
