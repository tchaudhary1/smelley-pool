// Parser for the commissioner's weekly odds sheets (Word docs, text extracted), plus matching the
// games to ESPN. Shared by the Upload tab (browser) and tools/build-week.mjs (Node).
// The parser tolerates the quirks seen in real sheets: a missing period after a pool number ("85  James
// Madison"), a bare "½" spread (pick'em), "TIEBREAKER" labels inside the line, a line whose first
// number was lost ("  RUTGERS  14½  70. Miami (OH)"), and two games run together on one line.
export function parseOdds(text) {
  const games = []; let section = { day: null, league: null };
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/ /g, ' ').replace(/[‘’]/g, "'").replace(/TIE\s*BREAKER(\s+GAME)?/gi, ' ');
    const hdr = line.match(/(\w+)'s\s+(NFL|College)\s+Football\s+Games?/i);
    if (hdr) { section = { day: hdr[1], league: /NFL/i.test(hdr[2]) ? 'NFL' : 'CFB' }; continue; }
    // "83,  FLORIDA" -> "83.  FLORIDA" (comma typed for the period)
    line = line.replace(/(^|\s)(\d{1,3}),(?=\s+[A-Za-z])/g, '$1$2.');
    // "SAN FRANCISC<tab>O" -> "SAN FRANCISCO" (a tab typed inside a name, leaving a 1-2 letter stub)
    line = line.replace(/([A-Za-z])\t+([A-Za-z]{1,2})(?=\t|\s|$)/g, '$1$2');
    // "85   James Madison" -> "85. James Madison"
    line = line.replace(/(^|\s)(\d{1,3})(?:\s{2,}|\t+)(?=[A-Za-z])/g, '$1$2. ');
    const re = /(\d{1,3})\.\s*([A-Za-z][^\t]*?)\s+(\d*)(½?)\s+(\d{1,3})\.\s*(.+?)(?=\s+\d{1,3}\.\s|\s*$)/g;
    let m, found = false;
    while ((m = re.exec(line))) {
      const [, fno, fav, whole, half, dno, dog] = m;
      if (!whole && !half) continue;
      push(+fno, fav, (whole ? +whole : 0) + (half ? 0.5 : 0), +dno, dog); found = true;
    }
    if (!found) {   // favorite's number missing: "  RUTGERS    14½    70.  Miami (OH)"
      const m2 = line.match(/^\s*([A-Za-z][^\t]*?)\s+(\d*)(½?)\s+(\d{1,3})\.\s*(.+?)\s*$/);
      if (m2 && (m2[2] || m2[3]) && +m2[4] % 2 === 0) push(+m2[4] - 1, m2[1], (m2[2] ? +m2[2] : 0) + (m2[3] ? 0.5 : 0), +m2[4], m2[5]);
    }
  }
  function push(fav_no, fav, spread, dog_no, dog) {
    const favT = fav.trim(), dogT = dog.trim(); const isHome = s => s === s.toUpperCase() && /[A-Z]/.test(s);
    if (games.some(g => g.fav_no === fav_no)) return;
    games.push({ fav_no, dog_no, fav: favT, dog: dogT, spread, home: isHome(favT) ? 'fav' : isHome(dogT) ? 'dog' : null, day: section.day, league: section.league });
  }
  return games.sort((a, b) => a.fav_no - b.fav_no);
}

// The sheet's own header: "WEEK 6", and the tiebreaker sentence ("...game between Buffalo and LA Rams.").
export function sheetInfo(text) {
  const t = text.replace(/[‘’]/g, "'");
  const wk = t.match(/^\s*WEEK\s+(\d{1,2})\b/im);
  const tb = t.match(/Tie\s*Breaker[^\n]*?between ([^.]+)\./i);
  return { week: wk ? +wk[1] : null, tiebreakerText: tb ? tb[1].trim() : null };
}

// Sanity checks for the upload preview: numbering gaps, spreads that aren't X½, games with no section.
export function oddsProblems(games) {
  const out = [];
  if (!games.length) return ["No games found. Is this the week's odds sheet?"];
  const nos = new Set(games.flatMap(g => [g.fav_no, g.dog_no]));
  const max = Math.max(...nos), missing = [];
  for (let n = 1; n <= max; n++) if (!nos.has(n)) missing.push(n);
  if (missing.length) out.push(`Pool numbers missing from the sheet: ${missing.join(', ')}`);
  for (const g of games) {
    if (g.dog_no !== g.fav_no + 1 || g.fav_no % 2 !== 1) out.push(`#${g.fav_no} ${g.fav} v #${g.dog_no} ${g.dog}: unusual numbering`);
    if (g.spread % 1 !== 0.5) out.push(`#${g.fav_no} ${g.fav} v ${g.dog}: spread ${g.spread} isn't X½ (a push is possible)`);
    if (!g.day || !g.league) out.push(`#${g.fav_no} ${g.fav} v ${g.dog}: not under a day / league heading`);
  }
  return out;
}

// The five pool days (Thursday through Monday) as ESPN dates, from that Thursday (YYYY-MM-DD).
export function weekDates(thursday) {
  const d0 = new Date(thursday + 'T12:00:00Z');
  return [0, 1, 2, 3, 4].map(i => new Date(d0.getTime() + i * 864e5).toISOString().slice(0, 10).replace(/-/g, ''));
}

// ---------------------------------------------------------------- ESPN matching
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.'’]/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
const teamKeys = t => [t.location, t.displayName, t.shortDisplayName, t.abbreviation, t.name && `${t.location} ${t.name}`].filter(Boolean).map(norm);
const getJson = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`ESPN ${r.status}`); return r.json(); };

export async function espnEvents(league, dates, fetchJson = getJson) {
  const sport = league === 'NFL' ? 'nfl' : 'college-football', out = [];
  for (const d of dates) {
    const j = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/scoreboard?dates=${d}&limit=400${league === 'CFB' ? '&groups=80' : ''}`);
    for (const e of j.events || []) out.push({ e, sport });
  }
  return out;
}

// aliases: { NFL: { sheetName: espnName }, CFB: {...} }. Sheet capitalization flips with the home
// team (OHIO ST. vs Ohio St.), so aliases match any case.
// If no game has both teams, a game where one team matches exactly and the other is within two
// letters of the sheet's spelling counts (typos like "PHILADEPHIA"); it comes back with .typo set.
export function findEvent(events, a, b, league, aliases = {}) {
  const ci = Object.fromEntries(Object.entries(aliases[league] || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const ka = norm(ci[a.toLowerCase()] ?? a), kb = norm(ci[b.toLowerCase()] ?? b);
  const shape = (e, sport, ca, cb) => ({ id: e.id, sport, kickoff: e.date,
    espnFav: ca.team.abbreviation, espnDog: cb.team.abbreviation,
    favLogo: ca.team.logo, dogLogo: cb.team.logo,
    favColor: ca.team.color, dogColor: cb.team.color,
    venue: e.competitions[0].venue?.fullName, neutral: e.competitions[0].neutralSite });
  for (const { e, sport } of events) {
    const cs = e.competitions[0].competitors;
    const hit = k => cs.find(c => teamKeys(c.team).includes(k));
    const ca = hit(ka), cb = hit(kb);
    if (ca && cb && ca !== cb) return shape(e, sport, ca, cb);
  }
  const close = (k, c) => k.length >= 5 && teamKeys(c.team).some(t => editDistance(k, t) <= 2);
  const typos = [];
  for (const { e, sport } of events) {
    const cs = e.competitions[0].competitors; if (cs.length !== 2) continue;
    const exact = k => cs.find(c => teamKeys(c.team).includes(k));
    const ca = exact(ka), cb = exact(kb);
    if (ca && !cb) { const o = cs.find(c => c !== ca); if (close(kb, o)) typos.push({ ...shape(e, sport, ca, o), typo: `${b} → ${o.team.displayName}` }); }
    if (cb && !ca) { const o = cs.find(c => c !== cb); if (close(ka, o)) typos.push({ ...shape(e, sport, o, cb), typo: `${a} → ${o.team.displayName}` }); }
  }
  return typos.length === 1 ? typos[0] : null;   // two candidates would be a guess, so neither
}
function editDistance(x, y) {
  if (Math.abs(x.length - y.length) > 2) return 3;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

// Sets g.espn on every game ESPN lists for those dates. Returns the games it couldn't find, and the
// ones whose kickoff (Eastern) falls on a different day than the sheet's heading says, and the ones
// matched despite a misspelled team name (worth a glance).
export async function matchEspn(games, dates, aliases, fetchJson = getJson) {
  const ev = { NFL: await espnEvents('NFL', dates, fetchJson), CFB: await espnEvents('CFB', dates, fetchJson) };
  const unmatched = [], wrongDay = [], typos = [];
  for (const g of games) {
    const m = findEvent(ev[g.league] || [], g.fav, g.dog, g.league, aliases);
    if (!m) { delete g.espn; unmatched.push(g); continue; }
    if (m.typo) { typos.push({ g, typo: m.typo }); delete m.typo; }
    g.espn = m;
    const day = new Date(m.kickoff).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
    if (g.day && day !== g.day) wrongDay.push({ g, day });
  }
  return { unmatched, wrongDay, typos };
}
