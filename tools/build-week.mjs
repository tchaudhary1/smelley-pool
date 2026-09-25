// Build dashboard data for one pool week from the commissioner's files.
//
//   node tools/build-week.mjs --week 4 --odds inputs/week4/Week_4_Odds.doc \
//        --picks "inputs/week4/*.xls" --totals inputs/Yearly_totals_through_Week_3.xls \
//        [--shadow ../path/reconciled_week4_card.csv] [--research side_scores.json]
//
// Writes local-data/league.json and local-data/week<N>.json. Push them to Supabase with
// tools/push-data.mjs. Nothing here is committed: local-data/ and inputs/ are gitignored.
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import WordExtractor from 'word-extractor';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]); return acc; }, []));
const WEEK = Number(args.week);
const SEASON = Number(args.season || 2026);
if (!WEEK) throw new Error('--week required');

// ---------- odds sheet ----------
async function oddsText(file) {
  if (file.endsWith('.txt')) return fs.readFileSync(file, 'utf8');
  const doc = await new WordExtractor().extract(file);
  return doc.getBody();
}
function parseOdds(text) {
  const games = []; let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/ /g, ' ');
    const hdr = line.match(/^\s*(\w+)'s\s+(NFL|College)\s+Football\s+Games?/i);
    if (hdr) { section = { day: hdr[1], league: /NFL/i.test(hdr[2]) ? 'NFL' : 'CFB' }; continue; }
    const re = /(\d{1,3})\.\s+(.+?)\s+(\d+)(½?)\s+(\d{1,3})\.\s+(.+?)(?=\s+\d{1,3}\.\s|\s*$)/g;
    let m;
    while ((m = re.exec(line))) {
      const [, fno, fav, whole, half, dno, dog] = m;
      const spread = Number(whole) + (half ? 0.5 : 0);
      const favT = fav.trim(), dogT = dog.trim();
      const isHome = s => s === s.toUpperCase() && /[A-Z]/.test(s);
      games.push({ fav_no: +fno, dog_no: +dno, fav: favT, dog: dogT, spread,
        home: isHome(favT) ? 'fav' : isHome(dogT) ? 'dog' : null,
        day: section.day, league: section.league });
    }
  }
  const tb = text.match(/Tie Breaker[^\n]*?between ([^.]+)\./i);
  return { games, tiebreakerText: tb ? tb[1].trim() : null };
}

// ---------- ESPN matching ----------
const ALIAS = JSON.parse(fs.readFileSync(new URL('./aliases.json', import.meta.url), 'utf8'));
const norm = s => s.toLowerCase().replace(/[.'’]/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
function teamKeys(t) {
  return [t.location, t.displayName, t.shortDisplayName, t.abbreviation, t.name && `${t.location} ${t.name}`]
    .filter(Boolean).map(norm);
}
async function espnEvents(league, dates) {
  const sport = league === 'NFL' ? 'nfl' : 'college-football';
  const out = [];
  for (const d of dates) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/${sport}/scoreboard?dates=${d}&limit=400${league === 'CFB' ? '' : ''}`;
    const r = await fetch(url); const j = await r.json();
    for (const e of j.events || []) out.push({ e, sport });
  }
  return out;
}
function findEvent(events, a, b, league) {
  const ka = norm(ALIAS[league]?.[a] ?? a), kb = norm(ALIAS[league]?.[b] ?? b);
  for (const { e, sport } of events) {
    const cs = e.competitions[0].competitors;
    const hit = k => cs.find(c => teamKeys(c.team).includes(k));
    const ca = hit(ka), cb = hit(kb);
    if (ca && cb && ca !== cb) return { id: e.id, sport, kickoff: e.date,
      espnFav: ca.team.abbreviation, espnDog: cb.team.abbreviation,
      favLogo: ca.team.logo, dogLogo: cb.team.logo,
      favColor: ca.team.color, dogColor: cb.team.color,
      venue: e.competitions[0].venue?.fullName, neutral: e.competitions[0].neutralSite };
  }
  return null;
}

// ---------- picks ----------
function parsePicksFile(file) {
  const wb = XLSX.readFile(file); const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  const hdr = rows[0].map(String);
  const confCols = hdr.map((h, i) => [Number(h), i]).filter(([n]) => n >= 1 && n <= 10);
  const tbCol = hdr.findIndex(h => /tie/i.test(h));
  const out = {};
  for (const r of rows.slice(1)) {
    const name = String(r[0] || '').trim(); if (!name) continue;
    const conf = {}; for (const [c, i] of confCols) if (r[i] !== '') conf[c] = Number(r[i]);
    out[name] = { conf, tiebreaker: tbCol >= 0 && r[tbCol] !== '' ? Number(r[tbCol]) : null };
  }
  return out;
}

// ---------- totals ----------
function parseTotals(file) {
  const wb = XLSX.readFile(file); const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  const hdr = rows[1].map(String);
  const col = {}; hdr.forEach((h, i) => { const m = h.match(/^Week (\d+)$/); if (m) col[m[1]] = i; });
  const members = [];
  for (const r of rows.slice(2)) {
    const name = String(r[0] || '').trim(); if (!name || /^Name$/i.test(name)) continue;
    const weeks = [];
    for (let w = 1; w <= 19; w++) { const v = r[col[w]]; weeks.push(v === '' || v == null ? null : Number(v)); }
    members.push({ name, weeks });
  }
  return members;
}

// ---------- shadow card / research ----------
function parseCsv(file) {
  const t = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const split = l => { const r = []; let c = '', q = false; for (const ch of l) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { r.push(c); c = ''; continue; } c += ch; } r.push(c); return r; };
  const h = split(t[0]); return t.slice(1).map(l => Object.fromEntries(split(l).map((v, i) => [h[i], v])));
}

// ---------- main ----------
const { games, tiebreakerText } = parseOdds(await oddsText(args.odds));
console.log(`odds: ${games.length} games (${games[0]?.fav_no}–${games.at(-1)?.dog_no})`);

const dates = [...new Set((args.dates || '').split(',').filter(Boolean))];
if (!dates.length) throw new Error('--dates YYYYMMDD,YYYYMMDD,... required (every day in the pool week)');
const evNFL = await espnEvents('NFL', dates), evCFB = await espnEvents('CFB', dates);
const unmatched = [];
for (const g of games) {
  const ev = findEvent(g.league === 'NFL' ? evNFL : evCFB, g.fav, g.dog, g.league);
  if (ev) g.espn = ev; else unmatched.push(`${g.fav_no} ${g.fav} v ${g.dog}`);
}
console.log(`espn matched ${games.length - unmatched.length}/${games.length}`, unmatched.length ? unmatched : '');

const picks = {};
for (const f of (args.picks || '').split(',').filter(Boolean)) {
  const files = f.includes('*') ? fs.readdirSync(path.dirname(f)).filter(n => new RegExp('^' + path.basename(f).replace('.', '\\.').replace('*', '.*') + '$').test(n)).map(n => path.join(path.dirname(f), n)) : [f];
  for (const file of files) Object.assign(picks, parsePicksFile(file));
}
const validNos = new Set(games.flatMap(g => [g.fav_no, g.dog_no]));
for (const [n, p] of Object.entries(picks)) for (const [c, no] of Object.entries(p.conf))
  if (!validNos.has(no)) console.warn(`WARN ${n} conf ${c}: pool #${no} not on the sheet`);
console.log('picks:', Object.keys(picks).join(', ') || '(none)');

let shadow = null;
if (args.shadow) {
  shadow = { label: 'Watson–Tarun shadow card', conf: {}, notes: {} };
  for (const r of parseCsv(args.shadow)) {
    shadow.conf[r.confidence] = Number(r.pool_number);
    shadow.notes[r.pool_number] = { p_low: +r.prob_low, p_high: +r.prob_high, risk: r.risk, rationale: r.rationale, market: r.market_spread_median };
  }
}
let research = null;
if (args.research) {
  research = {};
  for (const s of JSON.parse(fs.readFileSync(args.research, 'utf8'))) research[s.no] = { market: s.mkt, p: s.p, p_mkt: s.p_mkt, modelR: s.modelR };
}

fs.mkdirSync('local-data', { recursive: true });
const week = { season: SEASON, week: WEEK, built: new Date().toISOString(), tiebreakerText, games, picks, shadow, research };
fs.writeFileSync(`local-data/week${WEEK}.json`, JSON.stringify(week, null, 1));
if (args.totals) {
  const members = parseTotals(args.totals);
  const league = { season: SEASON, through: WEEK - 1, built: new Date().toISOString(), members,
    shadowScores: args.shadowScores ? Object.fromEntries(args.shadowScores.split(',').map(x => x.split(':').map(Number))) : {} };
  fs.writeFileSync('local-data/league.json', JSON.stringify(league, null, 1));
  console.log(`league: ${members.length} entries`);
}
console.log(`wrote local-data/week${WEEK}.json`);
