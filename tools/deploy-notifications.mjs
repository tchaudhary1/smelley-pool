// Set up or update phone notifications on Supabase, end to end:
//   1. VAPID keys + the trigger's shared secret (generated once into .notify.local.json, gitignored;
//      copy that file's values into Bitwarden as a backup)
//   2. the public key into js/config.js
//   3. the site modules the functions reuse (js/notify.js, live.js, model.js) into _shared/site/
//   4. function secrets, the Vault secret and supabase/003_notifications.sql (Management API)
//   5. deploy notify-chat, notify-games, push-test (Supabase CLI) and smoke-test them
//
//   node tools/deploy-notifications.mjs [--skip-sql] [--functions-only]
//
// Needs SUPABASE_ACCESS_TOKEN (a personal access token from supabase.com/dashboard/account/tokens).
// Secrets are never printed or passed on a command line.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REF = 'zivdbnkmgogmyclewabr';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN; if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
const args = new Set(process.argv.slice(2));
const api = async (path, body, method = 'POST') => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null;
};
const sql = query => api('/database/query', { query });
const b64u = buf => Buffer.from(buf).toString('base64url');

// 1. Keys (once).
const KEYFILE = '.notify.local.json';
if (!fs.existsSync(KEYFILE)) {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  fs.writeFileSync(KEYFILE, JSON.stringify({ VAPID_PUBLIC: b64u(ecdh.getPublicKey()), VAPID_PRIVATE: b64u(ecdh.getPrivateKey()), NOTIFY_SECRET: crypto.randomBytes(32).toString('hex'), created: new Date().toISOString() }, null, 1));
  console.log(`generated new keys in ${KEYFILE} (back its values up to Bitwarden)`);
}
const K = JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));

// 2. Public key into the site config.
const cfg = fs.readFileSync('js/config.js', 'utf8');
const nextCfg = cfg.replace(/export const VAPID_PUBLIC = '[^']*';/, `export const VAPID_PUBLIC = '${K.VAPID_PUBLIC}';`);
if (nextCfg !== cfg) { fs.writeFileSync('js/config.js', nextCfg); console.log('js/config.js: VAPID_PUBLIC set (commit and push the site)'); }

// 3. Site modules the functions import.
fs.mkdirSync('supabase/functions/_shared/site', { recursive: true });
for (const f of ['notify.js', 'live.js', 'model.js']) fs.copyFileSync(`js/${f}`, `supabase/functions/_shared/site/${f}`);
console.log('copied js/notify.js, live.js, model.js into supabase/functions/_shared/site/');

// 4. Secrets and SQL.
if (!args.has('--functions-only')) {
  await api('/secrets', [{ name: 'VAPID_PUBLIC', value: K.VAPID_PUBLIC }, { name: 'VAPID_PRIVATE', value: K.VAPID_PRIVATE }, { name: 'NOTIFY_SECRET', value: K.NOTIFY_SECRET }]);
  console.log('function secrets set: VAPID_PUBLIC, VAPID_PRIVATE, NOTIFY_SECRET');
  if (!args.has('--skip-sql')) {
    const lit = s => `'${String(s).replace(/'/g, "''")}'`;
    await sql(`do $$ begin
      if exists (select 1 from vault.secrets where name = 'notify_secret') then
        perform vault.update_secret((select id from vault.secrets where name = 'notify_secret'), ${lit(K.NOTIFY_SECRET)});
      else perform vault.create_secret(${lit(K.NOTIFY_SECRET)}, 'notify_secret'); end if; end $$;`);
    console.log('vault secret notify_secret stored');
    await sql(fs.readFileSync('supabase/003_notifications.sql', 'utf8'));
    console.log('ran supabase/003_notifications.sql');
  }
}

// 5. Deploy (bundled on Supabase's side, no Docker) and smoke-test.
const env = { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN };
for (const fn of ['notify-chat', 'notify-games', 'push-test']) {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'supabase@latest', 'functions', 'deploy', fn, '--project-ref', REF, '--no-verify-jwt', '--use-api'], { stdio: 'inherit', env, shell: process.platform === 'win32' });
}
const call = (fn, headers = {}) => fetch(`https://${REF}.supabase.co/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' }).then(async r => `${r.status} ${(await r.text()).slice(0, 160)}`);
console.log('smoke: notify-games without the secret ->', await call('notify-games'));
console.log('smoke: notify-games with the secret    ->', await call('notify-games', { 'x-notify-secret': K.NOTIFY_SECRET }));
console.log('smoke: push-test signed out            ->', await call('push-test'));
