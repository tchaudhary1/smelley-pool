// Rebuilds a past season from the commissioner's files, grades every pick against ESPN final
// scores, and checks the result against the official weekly scores.
//
//   node tools/build-history.mjs --dir ../2025_historic_data --season 2025 --start 2025-08-28
//
// --start is the Thursday of pool week 1. Output: local-data/history2025.json (gitignored) and a
// validation report. ESPN responses are cached in history-cache/ (gitignored).
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import WordExtractor from 'word-extractor';
import { parseOdds } from './odds.mjs';
import { matchNames } from '../js/names.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]); return acc; }, []));
const DIR = args.dir, SEASON = +args.season, START = new Date(args.start + 'T12:00:00Z');
if (!DIR || !SEASON || isNaN(START)) throw new Error('usage: --dir <folder> --season <year> --start <YYYY-MM-DD of week-1 Thursday>');
const files = fs.readdirSync(DIR);
const ALIAS = JSON.parse(fs.readFileSync('tools/aliases.json', 'utf8'));

// ---------------------------------------------------------------- odds sheets
const docText = async f => (await new WordExtractor().extract(path.join(DIR, f))).getBody();
function weekFile(re, w) {
  const cands = files.filter(f => re.test(f) && new RegExp(`\\bWeek\\s*${w}\\b`, 'i').test(f));
  return cands.find(f => /amended/i.test(f)) || cands[0] || null;
}

// ---------------------------------------------------------------- ESPN finals (cached)
fs.mkdirSync('history-cache', { recursive: true });
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
async function espnDay(sport, date) {
  const f = `history-cache/${sport}-${date}.json`;
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/${sport}/scoreboard?dates=${date}&limit=400${sport === 'college-football' ? '&groups=80' : ''}`;
  const j = await (await fetch(url)).json();
  const ev = (j.events || []).map(e => { const c = e.competitions[0];
    return { id: e.id, date: e.date, done: c.status.type.completed, teams: c.competitors.map(t => ({ keys: [t.team.location, t.team.displayName, t.team.shortDisplayName, t.team.abbreviation, t.team.name && `${t.team.location} ${t.team.name}`].filter(Boolean), abbr: t.team.abbreviation, score: +t.score })) }; });
  fs.writeFileSync(f, JSON.stringify(ev)); return ev;
}
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[.'’]/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
// Pool shorthand -> spellings ESPN might use.
function variants(name0, league) {
  // Clean typos/shorthand seen in real sheets before generating spellings.
  const name = name0.replace(/\.+$/, '').replace(/\(/g, ' (').replace(/\s+/g, ' ').trim()
    .replace(/^CINCINNAT I$/i, 'Cincinnati').replace(/^INDIANOPOLIS$/i, 'Indianapolis').replace(/^Appalachian\.? St\.?$/i, 'App State');
  const v = new Set([name]);
  const a = ALIAS[league]?.[name]; if (a) v.add(a);
  let s = name.replace(/\.\s*/g, '. ').replace(/\s+/g, ' ').trim();
  const t = s.toLowerCase()
    .replace(/^n\. /, 'north ').replace(/^s\. /, 'south ').replace(/^e\. /, 'east ').replace(/^w\. /, 'west ').replace(/^c\. /, 'central ')
    .replace(/ st\.?$/, ' state').replace(/^ga /, 'georgia ').replace(/^va /, 'virginia ').replace(/^tx /, 'texas ').replace(/^fl /, 'florida ')
    .replace(/^la /, 'los angeles ').replace(/^ny /, 'new york ').replace(/appalachian\. st/, 'app state').replace(/appalachian state/, 'app state');
  v.add(t);
  const special = { 'c. carolina': 'coastal carolina', 'central carolina': 'coastal carolina', "fl int'l": 'florida international', "fla int'l": 'florida international', 'fl intl': 'florida international', 'fla intl': 'florida international', 'san antonio': 'utsa', 'new mexico st': 'new mexico state', 'odu': 'old dominion', 'smu': 'smu', 'tcu': 'tcu', 'ucla': 'ucla', 'unlv': 'unlv', 'mtsu': 'middle tennessee', 'uconn': 'uconn', 'utep': 'utep', 'utsa': 'utsa', 'ul-monroe': 'ul monroe', 'ul monroe': 'ul monroe',
    'fl atlantic': 'florida atlantic', 'tx san antonio': 'utsa', 'miami (oh)': 'miami (oh)', 'mississippi': 'ole miss', 'c. florida': 'ucf', 'central florida': 'ucf', 'southern miss': 'southern miss', 's. mississippi': 'southern miss', 'south mississippi': 'southern miss',
    'fiu': 'florida international', 'fla international': 'florida international', 'n. illinois': 'northern illinois', 'north illinois': 'northern illinois', 'w. kentucky': 'western kentucky', 'west kentucky': 'western kentucky',
    'la tech': 'louisiana tech', 'louisiana tech': 'louisiana tech', 'ul-lafayette': 'louisiana', 'nc state': 'nc state', 'n. carolina st.': 'nc state', 'north carolina state': 'nc state', 'standford': 'stanford', 'hawaii': "hawai'i",
    'app. state': 'app state', 'appalachian st.': 'app state', 's. alabama': 'south alabama', 'n. texas': 'north texas', 'e. carolina': 'east carolina', 'w. michigan': 'western michigan', 'west michigan': 'western michigan', 'e. michigan': 'eastern michigan', 'east michigan': 'eastern michigan', 'c. michigan': 'central michigan',
    'kent st.': 'kent state', 'san jose st.': 'san jose state', 'sam houston st.': 'sam houston', 'sam houston': 'sam houston', 'jacksonville st.': 'jacksonville state', 'kennesaw st.': 'kennesaw state', 'n. mexico st.': 'new mexico state', 'nm state': 'new mexico state' };
  for (const x of [name.toLowerCase(), t]) if (special[x]) v.add(special[x]);
  return [...v].map(norm);
}
function matchEvent(events, g) {
  const fv = variants(g.fav, g.league), dv = variants(g.dog, g.league);
  const hit = (e, vs) => e.teams.findIndex(t => t.keys.map(norm).some(k => vs.includes(k)));
  const found = [];
  for (const e of events) { const a = hit(e, fv), b = hit(e, dv); if (a >= 0 && b >= 0 && a !== b) found.push({ e, a, b }); }
  return found;
}

// ---------------------------------------------------------------- picks + standings
function sheetRows(f) { const wb = XLSX.readFile(path.join(DIR, f)); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: false }); }
function parseMatrix(f) {
  const rows = sheetRows(f); const hi = rows.findIndex(r => [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].every(n => r.map(Number).includes(n)));
  const hdr = rows[hi]; const col = {}; hdr.forEach((h, i) => { const n = Number(h); if (n >= 1 && n <= 10 && String(h).trim() !== '' && !(n in col)) col[n] = i; });
  const tb = hdr.findIndex(h => /tie/i.test(String(h)));
  const out = {};
  for (const r of rows.slice(hi + 1)) { const name = String(r[0] || '').trim(); if (!name || /^name$/i.test(name) || /pool picks/i.test(name)) continue;
    const conf = {}; for (let c = 10; c >= 1; c--) { const v = Number(r[col[c]]); if (Number.isInteger(v) && v > 0) conf[c] = v; }
    if (Object.keys(conf).length) out[name] = { conf, tiebreaker: tb >= 0 && r[tb] !== '' ? Number(r[tb]) : null }; }
  return out;
}
function parseStandings(f) {
  const rows = sheetRows(f); const hi = rows.findIndex(r => r.some(c => /^week\s*1$/i.test(String(c).trim())));
  const hdr = rows[hi].map(c => String(c).trim()); const col = {};
  hdr.forEach((h, i) => { const m = h.match(/^week\s*(\d+)$/i); if (m && !(m[1] in col)) col[m[1]] = i; });
  const find = re => hdr.findIndex(h => re.test(h));
  const cTot = find(/1-19\s*totals/i), cGuru = find(/1-19\s*guru/i), cBowl = find(/^bowls$/i), cSeason = find(/seasonal\s*totals?$/i), cSRank = find(/seasonal\s*guru/i);
  const out = [];
  for (const r of rows.slice(hi + 1)) { const name = String(r[0] || '').trim(); if (!name || /^name$/i.test(name) || /weekly scores/i.test(name)) continue;
    const num = i => (i >= 0 && r[i] !== '' ? Number(r[i]) : null);
    out.push({ name, weeks: Array.from({ length: 19 }, (_, w) => num(col[w + 1] ?? -1)), total: num(cTot), guruRank: num(cGuru), bowls: num(cBowl), season: num(cSeason), seasonRank: num(cSRank) }); }
  return out;
}

// ---------------------------------------------------------------- build
const standings = parseStandings(files.find(f => /end of season/i.test(f)));
const official = new Map(standings.map(s => [s.name, s]));
const weeks = []; const report = [];
for (let w = 1; w <= 19; w++) {
  const oddsF = weekFile(/odds/i, w); const matF = weekFile(/matrix/i, w);
  const games = oddsF ? parseOdds(await docText(oddsF)) : [];
  // ESPN events in this week's window: Tue before .. Tue after the week's Thursday.
  const thu = new Date(START.getTime() + (w - 1) * 7 * 864e5);
  const days = []; for (let d = -2; d <= 6; d++) days.push(ymd(new Date(thu.getTime() + d * 864e5)));
  const evs = { NFL: [], CFB: [] };
  for (const d of days) { evs.NFL.push(...await espnDay('nfl', d)); evs.CFB.push(...await espnDay('college-football', d)); }
  const unmatched = [];
  for (const g of games) {
    const pool = g.league ? evs[g.league] : [...evs.NFL, ...evs.CFB];
    let found = matchEvent(pool, g); if (!found.length && g.league) found = matchEvent([...evs.NFL, ...evs.CFB], g);
    const f = found.find(x => x.e.done) || found[0];
    if (!f) { unmatched.push(`${g.fav_no} ${g.fav} v ${g.dog}`); continue; }
    const fs_ = f.e.teams[f.a].score, ds = f.e.teams[f.b].score;
    g.espn = { id: f.e.id, date: f.e.date }; g.final = f.e.done ? { fav: fs_, dog: ds } : null;
    if (g.final) g.favCovers = fs_ - ds > g.spread;
  }
  const picks = matF ? parseMatrix(matF) : null;
  // grade + compare with official weekly scores
  let exact = 0, off = [], graded = 0;
  const scores = {};
  if (picks) for (const [name, p] of Object.entries(picks)) {
    let s = 0, unknown = 0;
    for (const [c, no] of Object.entries(p.conf)) { const g = games.find(x => x.fav_no === no || x.dog_no === no); if (!g || g.favCovers == null) { unknown++; continue; } if ((g.fav_no === no) === g.favCovers) s += +c; }
    scores[name] = s; graded++;
    const o = official.get(name)?.weeks[w - 1];
    if (o == null) continue;
    if (o === s && !unknown) exact++; else off.push({ name, mine: s, official: o, unknown });
  }
  weeks.push({ week: w, oddsFile: oddsF, matrixFile: matF, games, picks, scores });
  report.push({ w, games: games.length, matched: games.length - unmatched.length, unmatched, entries: picks ? Object.keys(picks).length : 0, exact, graded, off });
  process.stdout.write(`week ${w}: ${games.length} games, ${games.length - unmatched.length} matched; ${picks ? `${Object.keys(picks).length} cards, ${exact} scores match official, ${off.length} differ` : 'no matrix'}\n`);
}
fs.mkdirSync('local-data', { recursive: true });
fs.writeFileSync(`local-data/history${SEASON}-raw.json`, JSON.stringify({ season: SEASON, standings, weeks }, null, 0));
fs.writeFileSync(`local-data/history${SEASON}-report.json`, JSON.stringify(report, null, 1));
console.log(`wrote local-data/history${SEASON}-raw.json and -report.json`);

// ---------------------------------------------------------------- bowls
async function buildBowls() {
  const oddsF = files.filter(f => /bowl/i.test(f) && /odds/i.test(f)).sort((a, b) => /amended/i.test(b) - /amended/i.test(a))[0];
  const matF = files.find(f => /auto calculate matrix/i.test(f));
  if (!oddsF || !matF) return null;
  const text = await docText(oddsF);
  const games = []; let hdr = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/(\d+)-POINT\s*(?:GAME)?\s*\(([^)]+)\)\s*(.*)$/i);
    if (h) { flush(); hdr = { points: +h[1], name: h[2].trim().replace(/\s+/g, ' '), when: h[3].trim() }; continue; }
    const g = parseOdds(line)[0];
    if (g && hdr) { games.push({ ...g, points: hdr.points, bowl: hdr.name, when: hdr.when }); hdr = null; }
  }
  flush();
  // A bowl announced without a line yet (e.g. the title game, lined later by email).
  function flush() { if (hdr) games.push({ fav_no: hdr.points * 2 - 1, dog_no: hdr.points * 2, fav: null, dog: null, spread: null, points: hdr.points, bowl: hdr.name, when: hdr.when }); hdr = null; }
  const wb = XLSX.readFile(path.join(DIR, matF));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Picks'], { header: 1, defval: '' });
  const hdrRow = rows[1], winRow = rows[0];
  const stop = hdrRow.findIndex(h => /tb$/i.test(String(h).trim()));        // "HOLIDAY BOWL TB"
  const gameCols = []; hdrRow.forEach((h, i) => { if (i < stop && Number.isInteger(h) && h >= 1 && h <= 60) gameCols.push([h, i]); });
  const winners = Object.fromEntries(gameCols.map(([k, i]) => [k, Number(winRow[i]) || null]));
  const picks = {}, points = {}, tb = {};
  for (const r of rows) {
    if (typeof r[0] !== 'number' || !r[1] || /^(name|winner)/i.test(String(r[1]))) continue;
    const name = String(r[1]).trim(); if (picks[name]) continue;
    const p = gameCols.map(([k, i]) => (Number.isInteger(r[i]) ? r[i] : null));
    picks[name] = p; points[name] = gameCols.reduce((s, [k], j) => s + (p[j] != null && p[j] === winners[k] ? k : 0), 0);
    tb[name] = Number.isFinite(+r[stop]) && r[stop] !== '' ? +r[stop] : null;
  }
  return { oddsFile: oddsF, games, winners, picks, points, tiebreakers: tb, maxPoints: gameCols.reduce((s, [k]) => s + k, 0) };
}
const bowls = await buildBowls();

// ---------------------------------------------------------------- names + final archive
const stdNames = standings.map(s => s.name);
const allMatrixNames = new Set(weeks.flatMap(w => Object.keys(w.picks || {})));
if (bowls) Object.keys(bowls.picks).forEach(n => allMatrixNames.add(n));
const nameMap = matchNames([...allMatrixNames], stdNames);
const canon = n => nameMap[n] || n;
const flagged = [];
const archive = {
  season: SEASON, built: new Date().toISOString(),
  entries: standings.map(s => ({ name: s.name, weeks: s.weeks, total: s.total, guruRank: s.guruRank, bowls: s.bowls, season: s.season, seasonRank: s.seasonRank })),
  winners: parseWinners(files.find(f => /weekly winners/i.test(f))),
  weeks: weeks.map(w => {
    const picks = {};
    for (const [n, p] of Object.entries(w.picks || {})) {
      const c = canon(n); picks[c] = p;
      const off = official.get(c)?.weeks[w.week - 1];
      if (off != null && w.scores[n] != null && off !== w.scores[n]) flagged.push({ week: w.week, name: c, graded: w.scores[n], official: off });
    }
    return { week: w.week, games: w.games.map(g => ({ fav_no: g.fav_no, dog_no: g.dog_no, fav: g.fav, dog: g.dog, spread: g.spread, home: g.home, league: g.league, day: g.day, final: g.final, favCovers: g.favCovers ?? null, date: g.espn?.date ?? null })), picks: w.picks ? picks : null };
  }),
  gradingNotes: flagged,
  bowls: bowls && { games: bowls.games.map(g => ({ points: g.points, bowl: g.bowl, when: g.when, fav_no: g.fav_no, dog_no: g.dog_no, fav: g.fav, dog: g.dog, spread: g.spread })),
    winners: bowls.winners, maxPoints: bowls.maxPoints,
    picks: Object.fromEntries(Object.entries(bowls.picks).map(([n, p]) => [canon(n), p])),
    points: Object.fromEntries(Object.entries(bowls.points).map(([n, p]) => [canon(n), p])) },
};
if (bowls) {
  let ok = 0, bad = []; for (const [n, p] of Object.entries(archive.bowls.points)) { const o = official.get(n)?.bowls; if (o == null) continue; if (o === p) ok++; else bad.push(`${n} ${p}≠${o}`); }
  console.log(`bowls: ${archive.bowls.games.length} games parsed, ${Object.keys(bowls.picks).length} entries; ${ok} bowl totals match official${bad.length ? `, ${bad.length} differ: ${bad.slice(0, 6).join(', ')}` : ''}`);
}
function parseWinners(f) {
  if (!f) return null; const rows = sheetRows(f); const out = { weeks: {}, awards: {} }; let section = 'weeks';
  for (const r of rows) {
    const k = String(r[0] || '').trim(); const names = r.slice(1).map(x => String(x || '').trim()).filter(Boolean);
    if (/^week\s*(\d+)/i.test(k)) out.weeks[+k.match(/\d+/)[0]] = names.map(canon);
    else if (/^(guru|bowls?)/i.test(k)) { section = k; if (names.length && !/^1st/i.test(names[0])) out.awards[k] = names.map(canon); }
    else if (!k && names.length && !/^1st/i.test(names[0]) && section) out.awards[section] = names.map(canon);
  }
  return out;
}
fs.writeFileSync(`local-data/history${SEASON}.json`, JSON.stringify(archive));
console.log(`wrote local-data/history${SEASON}.json (${Math.round(fs.statSync(`local-data/history${SEASON}.json`).size / 1024)} KB); name matches:`, JSON.stringify(Object.fromEntries(Object.entries(nameMap).filter(([a, b]) => b && a !== b))),
  '; unmatched (kept as-is):', [...allMatrixNames].filter(n => !nameMap[n]).join(', '), `; ${flagged.length} cards whose graded total differs from official`);
