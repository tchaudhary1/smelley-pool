// Watches the Commentator from outside: prints one line only when something needs attention
// (heartbeat overdue, process gone, new errors, repeated ESPN failures) and one when it recovers.
//   node tools/watchdog.mjs [minutes=29]
// Quiet when all is well, so it can drive a notification feed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HB = path.join(ROOT, 'monitor', 'heartbeat.json');
const until = Date.now() + (+process.argv[2] || 29) * 60e3;
const say = m => console.log(`[${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}] ${m}`);
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const lastError = () => { try { const d = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const rows = fs.readFileSync(path.join(ROOT, 'monitor', `commentator-${d}.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.type === 'error');
  return rows.at(-1); } catch { return null; } };

let base = null, problem = null;
while (Date.now() < until) {
  let hb = null; try { hb = JSON.parse(fs.readFileSync(HB, 'utf8')); } catch { /* not written yet */ }
  const issues = [];
  if (!hb) issues.push('no heartbeat file');
  else {
    const age = (Date.now() - Date.parse(hb.at)) / 1000, allowed = (hb.nextCheckSec || 300) + 180;
    if (!alive(hb.pid)) issues.push(`Commentator process ${hb.pid} is gone`);
    else if (age > allowed) issues.push(`heartbeat overdue: last check ${Math.round(age / 60)} min ago (expected within ${Math.round(allowed / 60)})`);
    if (base) {
      if (hb.pid !== base.pid) { say(`Commentator restarted (pid ${base.pid} → ${hb.pid})`); base = { ...hb }; }
      if (hb.errors > base.errors) { const e = lastError(); say(`${hb.errors - base.errors} new error(s)${e ? `: [${e.where}${e.kind ? ' ' + e.kind : ''}] ${e.message}` : ''}`); base.errors = hb.errors; }
      if (hb.espnFail - base.espnFail >= 3) { say(`ESPN fetch failures climbing: ${hb.espnFail - base.espnFail} since last report`); base.espnFail = hb.espnFail; }
    } else base = { ...hb };
  }
  const now = issues.join('; ') || null;
  if (now && now !== problem) say(`PROBLEM: ${now}`);
  if (!now && problem) say('RECOVERED: Commentator checking in normally again');
  problem = now;
  await new Promise(r => setTimeout(r, 60e3));
}
