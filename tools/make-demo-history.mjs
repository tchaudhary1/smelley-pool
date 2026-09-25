// Anonymized copies of the past-season archives for demo mode (demo-data/, gitignored), so
// screenshots of History and scouting reports never show a real league member's name.
// Family members get their demo names ("Jamie S."); everyone else becomes "Player N", the same
// N in every season. Game results are public; picks keep their real shape under fake names.
//   node tools/make-demo-history.mjs
import fs from 'node:fs';
import { HISTORY_SEASONS } from '../js/config.js';
import { samePerson } from '../js/names.js';

const roster = JSON.parse(fs.readFileSync('local-data/roster.json', 'utf8'));
const demoRoster = JSON.parse(fs.readFileSync('demo-data/roster.json', 'utf8'));
const seen = [];   // [realName, fakeName]
let n = 0;
// The demo family names go to randomly chosen league entries who played every season, so a
// screenshot of "Debbie S." shows a stranger's record, never Debbie's. The real family members
// become ordinary "Player N"s like everyone else.
const years = HISTORY_SEASONS.filter(y => fs.existsSync(`local-data/history${y}.json`));
const archives = Object.fromEntries(years.map(y => [y, JSON.parse(fs.readFileSync(`local-data/history${y}.json`, 'utf8'))]));
const isFam = name => Object.values(roster).some(r => samePerson(r, name));
const everyYear = archives[years.at(-1)].entries.map(e => e.name)
  .filter(nm => !isFam(nm) && years.every(y => archives[y].entries.some(e => samePerson(e.name, nm))));
for (const k of Object.keys(demoRoster)) {
  const pick = everyYear.splice(Math.floor(Math.random() * everyYear.length), 1)[0];
  if (pick) seen.push([pick, demoRoster[k]]);
}
const fake = real => {
  const hit = seen.find(([r]) => r === real || samePerson(r, real)); if (hit) return hit[1];
  const f = `Player ${++n}`;
  seen.push([real, f]); return f;
};
const keys = o => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [fake(k), v]));

// Newest season first so this year's regulars get the low numbers.
for (const y of [...HISTORY_SEASONS].sort().reverse()) {
  const f = `local-data/history${y}.json`; if (!fs.existsSync(f)) continue;
  const A = JSON.parse(fs.readFileSync(f, 'utf8'));
  A.entries.forEach(e => e.name = fake(e.name));
  if (A.winners) {
    A.winners.weeks = Object.fromEntries(Object.entries(A.winners.weeks || {}).map(([w, ns]) => [w, ns.map(s => s.split('/').map(x => fake(x.trim())).join('/'))]));
    A.winners.awards = Object.fromEntries(Object.entries(A.winners.awards || {}).map(([k, ns]) => [k, ns.map(fake)]));
  }
  A.weeks.forEach(w => { if (w.picks) w.picks = keys(w.picks); });
  A.gradingNotes = (A.gradingNotes || []).map(g => ({ ...g, name: fake(g.name) }));
  if (A.bowls) { A.bowls.picks = keys(A.bowls.picks); A.bowls.points = keys(A.bowls.points); }
  fs.writeFileSync(`demo-data/history${y}.json`, JSON.stringify(A));
  console.log(`demo-data/history${y}.json`, A.entries.length, 'entries');
}
// Nothing real may survive: check every name against the real list.
const real = seen.map(([r]) => r);
for (const y of HISTORY_SEASONS) {
  const t = fs.readFileSync(`demo-data/history${y}.json`, 'utf8');
  const leaks = real.filter(r => r.length > 4 && t.includes(`"${r}"`) && !Object.values(demoRoster).includes(r));
  if (leaks.length) throw new Error(`real names left in ${y}: ${leaks.slice(0, 5).join(', ')}`);
}
console.log('no real names left');
