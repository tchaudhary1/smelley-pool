// Scouting reports: how a player picks, how it has gone, what makes them different, and how they
// compare with the players ranked around them. Pure JS (browser + Node).
// Data: past-season archives (tools/build-history.mjs) + this season's standings and picks.
import { samePerson } from './names.js';

const pct = x => `${Math.round(x * 100)}%`;
const r1 = x => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- per-pick table for a season
function pickRows(archive) {
  const rows = [];
  for (const w of archive.weeks) {
    if (!w.picks) continue;
    const byNo = new Map(); for (const g of w.games) { byNo.set(g.fav_no, [g, 'fav']); byNo.set(g.dog_no, [g, 'dog']); }
    // popularity: share of cards on each side, among cards that picked that game
    const sideCount = {}, gameCount = {};
    for (const p of Object.values(w.picks)) for (const no of Object.values(p.conf)) { const h = byNo.get(no); if (!h) continue; sideCount[no] = (sideCount[no] || 0) + 1; gameCount[h[0].fav_no] = (gameCount[h[0].fav_no] || 0) + 1; }
    for (const [name, p] of Object.entries(w.picks)) for (const [c, no] of Object.entries(p.conf)) {
      const h = byNo.get(no); if (!h || h[0].favCovers == null) continue;
      const [g, side] = h;
      rows.push({ name, week: w.week, conf: +c, side, spread: g.spread, league: g.league || 'CFB', home: g.home === side, homeKnown: g.home != null,
        covered: (side === 'fav') === g.favCovers, pop: sideCount[no] / gameCount[g.fav_no], nGame: gameCount[g.fav_no] });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- metrics for a set of picks
function metrics(rows) {
  const n = rows.length; if (!n) return null;
  const rate = f => { const s = rows.filter(f); return { n: s.length, share: s.length / n, cover: s.length ? s.filter(r => r.covered).length / s.length : null }; };
  const weeks = {}; for (const r of rows) (weeks[`${r.season ?? ''}-${r.week}`] ??= []).push(r);
  let orderEdge = 0; const wk = Object.values(weeks);
  for (const ps of wk) { const k = ps.filter(r => r.covered).length; const pts = ps.filter(r => r.covered).reduce((s, r) => s + r.conf, 0); orderEdge += pts - k * (ps.reduce((s, r) => s + r.conf, 0) / ps.length); }
  const tens = rows.filter(r => r.conf === 10);
  return {
    n, cover: rows.filter(r => r.covered).length / n,
    dog: rate(r => r.side === 'dog'), fav: rate(r => r.side === 'fav'), home: rate(r => r.homeKnown && r.home), road: rate(r => r.homeKnown && !r.home),
    nfl: rate(r => r.league === 'NFL'), cfb: rate(r => r.league === 'CFB'),
    bigFav: rate(r => r.side === 'fav' && r.spread >= 10), bigDog: rate(r => r.side === 'dog' && r.spread >= 10), closeLine: rate(r => r.spread <= 3.5),
    top: rate(r => r.conf >= 8), mid: rate(r => r.conf >= 4 && r.conf <= 7), low: rate(r => r.conf <= 3),
    tens: { n: tens.length, cover: tens.length ? tens.filter(r => r.covered).length / tens.length : null, dog: tens.length ? tens.filter(r => r.side === 'dog').length / tens.length : null, nfl: tens.length ? tens.filter(r => r.league === 'NFL').length / tens.length : null },
    contrarian: rate(r => r.nGame >= 5 && r.pop < 0.35), chalk: rate(r => r.nGame >= 5 && r.pop >= 0.65),
    avgPop: rows.reduce((s, r) => s + r.pop, 0) / n, avgSpread: rows.reduce((s, r) => s + r.spread, 0) / n,
    confOnDogs: rows.filter(r => r.side === 'dog').reduce((s, r) => s + r.conf, 0) / Math.max(1, rows.filter(r => r.side === 'dog').length),
    confOnFavs: rows.filter(r => r.side === 'fav').reduce((s, r) => s + r.conf, 0) / Math.max(1, rows.filter(r => r.side === 'fav').length),
    orderEdgePerWeek: wk.length ? orderEdge / wk.length : 0, weeksPicked: wk.length,
  };
}

// ---------------------------------------------------------------- context (built once)
function summarize(rows) {
  const byName = {}; for (const r of rows) (byName[r.name] ??= []).push(r);
  const per = Object.fromEntries(Object.entries(byName).map(([n, rs]) => [n, metrics(rs)]));
  // league baselines: pooled rates, and the spread of individual tendencies (for "stands out")
  const pooled = metrics(rows);
  const keys = ['dog', 'home', 'nfl', 'bigFav', 'bigDog', 'contrarian', 'chalk'];
  const spread = {}; for (const k of keys) { const v = Object.values(per).filter(m => m.n >= 60).map(m => m[k].share); const mu = v.reduce((a, b) => a + b, 0) / v.length; spread[k] = { mu, sd: Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length) }; }
  return { rows, per, pooled, spread };
}
const yrLabel = yrs => yrs.length > 1 ? `${yrs[0]}–${String(yrs[yrs.length - 1]).slice(2)}` : String(yrs[0] ?? '');

export function buildContext({ archives = {}, league = null, family = [] }) {
  const seasons = {};
  for (const [yr, a] of Object.entries(archives)) seasons[yr] = { archive: a, ...summarize(pickRows(a)) };
  // Every season pooled ("career"): the same person can be spelled differently from year to year,
  // so rows are keyed by the newest season's spelling.
  const yrs = Object.keys(seasons).sort();
  const canon = [], memo = new Map();
  const key = n => { if (memo.has(n)) return memo.get(n); const c = canon.find(x => samePerson(x, n)) || (canon.push(n), n); memo.set(n, c); return c; };
  const all = [];
  for (const yr of [...yrs].reverse()) for (const r of seasons[yr].rows) all.push({ ...r, name: key(r.name), season: +yr });
  const career = { ...summarize(all), years: yrs.map(Number), label: yrLabel(yrs) };
  return { seasons, career, league, family };
}

// Each week's top 4: the commissioner's winners list, or (seasons without one) worked out from the scores.
const top4Memo = new WeakMap();
export function weeklyTop4(A) {
  if (A.winners?.weeks) return A.winners.weeks;
  if (top4Memo.has(A)) return top4Memo.get(A);
  const out = {};
  for (let w = 1; w <= 19; w++) { const s = A.entries.filter(e => e.weeks[w - 1] != null).sort((x, y) => y.weeks[w - 1] - x.weeks[w - 1]); if (s.length) out[w] = s.slice(0, 4).map(e => e.name); }
  top4Memo.set(A, out); return out;
}
function findIn(names, name) { return names.find(n => n === name) || names.find(n => samePerson(n, name)) || null; }

// ---------------------------------------------------------------- the report
export function scoutingReport(ctx, name) {
  const out = { name, seasons: [], quirks: [], neighborhood: null, lessons: [], caveat: '' };
  const yrs = Object.keys(ctx.seasons).sort().reverse();
  for (const yr of yrs) {
    const S = ctx.seasons[yr], A = S.archive;
    const ent = A.entries.find(e => e.name === findIn(A.entries.map(e => e.name), name));
    const pk = findIn(Object.keys(S.per), name);
    const m = pk ? S.per[pk] : null;
    if (!ent && !m) continue;
    const weeks = ent ? ent.weeks.filter(v => v != null) : [];
    const leagueWeekly = A.entries.flatMap(e => e.weeks.filter(v => v != null));
    const lgAvg = leagueWeekly.reduce((a, b) => a + b, 0) / Math.max(1, leagueWeekly.length);
    const mean = weeks.length ? weeks.reduce((a, b) => a + b, 0) / weeks.length : null;
    const sd = weeks.length > 1 ? Math.sqrt(weeks.reduce((a, b) => a + (b - mean) ** 2, 0) / (weeks.length - 1)) : null;
    const half = Math.floor(weeks.length / 2);
    const top4 = Object.entries(weeklyTop4(A)).filter(([, ns]) => ns.some(n => samePerson(n, name) || n === ent?.name)).map(([w, ns]) => ({ week: +w, place: 1 + ns.findIndex(n => samePerson(n, name) || n === ent?.name) }));
    const bowlPts = A.bowls ? A.bowls.points[findIn(Object.keys(A.bowls.points), name)] : null;
    const bowlRank = bowlPts != null ? 1 + Object.values(A.bowls.points).filter(p => p > bowlPts).length : null;
    out.seasons.push({ season: +yr, entry: ent || null, metrics: m, weekly: { mean, sd, best: weeks.length ? Math.max(...weeks) : null, worst: weeks.length ? Math.min(...weeks) : null, leagueAvg: lgAvg,
      firstHalf: half ? weeks.slice(0, half).reduce((a, b) => a + b, 0) / half : null, secondHalf: half ? weeks.slice(half).reduce((a, b) => a + b, 0) / (weeks.length - half) : null },
      top4, bowls: bowlPts != null ? { points: bowlPts, rank: bowlRank, of: Object.keys(A.bowls.points).length, max: A.bowls.maxPoints } : null, entries: A.entries.length, partial: A.partial || null });
  }
  // Tendencies come from every season pooled: twice the sample beats one year's noise.
  const C = ctx.career, ck = C ? findIn(Object.keys(C.per), name) : null, cm = ck ? C.per[ck] : null;
  const pickYears = out.seasons.filter(s => s.metrics).map(s => s.season).sort();
  if (cm) out.quirks = quirks(cm, C);
  out.career = cm ? { metrics: cm, label: yrLabel(pickYears), years: pickYears, finishes: out.seasons.filter(s => s.entry).map(s => ({ season: s.season, rank: s.entry.seasonRank ?? s.entry.guruRank, of: s.entries, partial: s.partial?.throughWeek ?? null })) } : null;
  out.caveat = cm ? `Tendencies are based on ${cm.n.toLocaleString()} graded picks over ${cm.weeksPicked} weeks (${pickYears.join(' and ')}): patterns, not guarantees. A difference of a few percentage points is noise at this sample size.` : 'No past pick data for this player yet.';
  out.neighborhood = neighborhood(ctx, name);
  out.lessons = lessons(ctx, name, out.neighborhood);
  return out;
}

// What stands out versus the league (only clear deviations, with samples big enough to matter).
function quirks(m, S) {
  const q = [], P = S.pooled, Z = S.spread;
  const tilt = (k, label, what) => { const z = (m[k].share - Z[k].mu) / (Z[k].sd || 1); if (Math.abs(z) >= 1.2) q.push({ strength: Math.abs(z), text: `${z > 0 ? 'More' : 'Less'} ${label} than most: ${pct(m[k].share)} of picks (league typical ${pct(Z[k].mu)})${what ? '. ' + what(m[k]) : ''}.` }); };
  const res = s => s.n >= 12 ? `Those covered ${pct(s.cover)} (${s.n} picks)` : '';
  tilt('dog', 'underdog-heavy', res); tilt('home', 'home-team-heavy', res); tilt('nfl', 'NFL-heavy', res);
  tilt('bigFav', 'into big favorites (10+)', res); tilt('bigDog', 'into big underdogs (10+)', res); tilt('contrarian', 'contrarian', res);
  const seg = (s, label, base) => { if (s.n >= 15 && s.cover != null && Math.abs(s.cover - base) >= 0.12) q.push({ strength: Math.abs(s.cover - base) * 8, text: `${label}: ${pct(s.cover)} covered over ${s.n} picks (league ${pct(base)}).` }); };
  seg(m.top, 'High-confidence picks (8-10)', P.top.cover); seg(m.low, 'Low-confidence picks (1-3)', P.low.cover);
  seg(m.dog, 'On underdogs', P.dog.cover); seg(m.fav, 'On favorites', P.fav.cover); seg(m.nfl, 'In the NFL', P.nfl.cover); seg(m.cfb, 'In college', P.cfb.cover);
  if (m.tens.n >= 10 && Math.abs(m.tens.cover - P.tens.cover) >= 0.15) q.push({ strength: 3, text: `Their 10s covered ${pct(m.tens.cover)} (${m.tens.n} weeks; league ${pct(P.tens.cover)}).` });
  if (Math.abs(m.orderEdgePerWeek) >= 1.5) q.push({ strength: Math.abs(m.orderEdgePerWeek), text: m.orderEdgePerWeek > 0
    ? `Good at ordering: their confidence placement earned about ${r1(m.orderEdgePerWeek)} extra points a week beyond their hit rate.`
    : `Ordering has cost them: about ${r1(-m.orderEdgePerWeek)} points a week versus spreading the same picks' confidence at random.` });
  if (Math.abs(m.confOnDogs - m.confOnFavs) >= 1.2) q.push({ strength: 1.5, text: `Trusts ${m.confOnDogs > m.confOnFavs ? 'underdogs' : 'favorites'} more: average confidence ${r1(Math.max(m.confOnDogs, m.confOnFavs))} vs ${r1(Math.min(m.confOnDogs, m.confOnFavs))}.` });
  return q.sort((a, b) => b.strength - a.strength).slice(0, 6).map(x => x.text);
}

// Players ranked just above and below in this season's standings, with their past-season profile.
function neighborhood(ctx, name) {
  const L = ctx.league; if (!L?.members?.length) return null;
  const tot = m => m.weeks.reduce((s, v) => s + (v || 0), 0);
  const sorted = [...L.members].sort((a, b) => tot(b) - tot(a));
  const i = sorted.findIndex(m => m.name === name || samePerson(m.name, name)); if (i < 0) return null;
  const rank = m => 1 + L.members.filter(o => tot(o) > tot(m)).length;
  const yrs = Object.keys(ctx.seasons).sort(), yr = yrs[yrs.length - 1]; const S = yr ? ctx.seasons[yr] : null; const C = ctx.career;
  const finish = (y, n) => { const e = ctx.seasons[y].archive.entries.find(x => x.name === n || samePerson(x.name, n)); return e ? { season: +y, rank: e.seasonRank ?? e.guruRank, total: e.total } : null; };
  const card = m => { const pk = C ? findIn(Object.keys(C.per), m.name) : null; const e = S ? S.archive.entries.find(x => samePerson(x.name, m.name)) : null;
    return { name: m.name, rank: rank(m), tied: L.members.filter(o => tot(o) === tot(m)).length > 1, total: tot(m), gap: tot(m) - tot(sorted[i]), lastSeason: e ? { rank: e.seasonRank ?? e.guruRank, total: e.total } : null,
      past: yrs.map(y => finish(y, m.name)), metrics: pk ? C.per[pk] : null }; };
  const above = sorted.slice(Math.max(0, i - 3), i).map(card), below = sorted.slice(i + 1, i + 4).map(card);
  return { me: card(sorted[i]), above, below, season: yr ? +yr : null, seasons: yrs.map(Number) };
}

// What separates the player from those ranked above, tied to whether it worked league-wide.
function lessons(ctx, name, nb) {
  const out = []; if (!nb?.me?.metrics) return out;
  const P = ctx.career.pooled, yr = ctx.career.label;
  const group = nb.above.filter(x => x.metrics && x.metrics.n >= 60); if (!group.length) return out;
  const avg = f => group.reduce((s, x) => s + f(x.metrics), 0) / group.length;
  const firsts = group.map(x => x.name.split(' ')[0]);   // first names, unless two would read the same
  const me = nb.me.metrics, names = (new Set(firsts).size === firsts.length ? firsts : group.map(x => x.name)).join(', ');
  const cmp = [
    { k: 'underdogs', mine: me.dog.share, theirs: avg(m => m.dog.share), worked: P.dog.cover, base: 0.5, seg: 'underdogs' },
    { k: 'big favorites (10+)', mine: me.bigFav.share, theirs: avg(m => m.bigFav.share), worked: P.bigFav.cover, base: 0.5, seg: 'big favorites' },
    { k: 'contrarian picks', mine: me.contrarian.share, theirs: avg(m => m.contrarian.share), worked: P.contrarian.cover, base: P.chalk.cover, seg: 'contrarian picks' },
    { k: 'NFL games', mine: me.nfl.share, theirs: avg(m => m.nfl.share), worked: P.nfl.cover, base: P.cfb.cover, seg: 'NFL picks' },
  ].map(c => ({ ...c, diff: c.theirs - c.mine })).filter(c => Math.abs(c.diff) >= 0.06).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const mattered = c => Math.abs(c.worked - c.base) >= 0.02;
  cmp.sort((x, y) => mattered(y) - mattered(x));
  for (const c of cmp.slice(0, 3)) {
    const helped = c.worked > c.base === c.diff > 0;
    out.push(`${names} (just ahead) ${c.diff > 0 ? 'lean more' : 'lean less'} on ${c.k}: ${pct(c.theirs)} of picks vs ${pct(c.mine)}. ${mattered(c)
      ? `In ${yr}, ${c.seg} covered ${pct(c.worked)} league-wide${c.base !== 0.5 ? ` vs ${pct(c.base)} for the alternative` : ''}, so that lean ${helped ? 'helped' : 'actually cost them'}.`
      : `That didn't matter much in ${yr} (${c.seg} covered ${pct(c.worked)} league-wide), so it's style, not the reason they're ahead.`}`);
  }
  const ord = avg(m => m.orderEdgePerWeek); if (Math.abs(ord - me.orderEdgePerWeek) >= 1)
    out.push(`Confidence ordering: the players just ahead gained ${r1(ord)} points a week from how they ordered picks vs ${r1(me.orderEdgePerWeek)} here. ${ord > me.orderEdgePerWeek ? 'Putting the most confident picks on the right games is where they pulled away.' : 'Ordering is a strength to keep leaning on.'}`);
  const topCover = avg(m => m.top.cover ?? 0.5); if (me.top.cover != null && Math.abs(topCover - me.top.cover) >= 0.08)
    out.push(`High-confidence (8-10) picks covered ${pct(topCover)} for the group ahead vs ${pct(me.top.cover)} here.`);
  return out;
}

// Plain-text version for the Commentator's data brief.
export function reportText(rep) {
  const L = [`SCOUTING REPORT: ${rep.name}`];
  for (const s of rep.seasons) {
    const e = s.entry, m = s.metrics, w = s.weekly;
    L.push(`${s.season}${s.partial ? ` [INCOMPLETE SEASON: standings only through week ${s.partial.throughWeek}; week ${s.partial.missingWeeks.join(', ')} and the final result are missing; say so if you use it]` : ''}: ${e ? `${s.partial ? `ranked ${e.seasonRank ?? e.guruRank} of ${s.entries} after week ${s.partial.throughWeek}` : `finished rank ${e.seasonRank ?? e.guruRank} of ${s.entries}`} (weeks total ${e.total}${e.bowls != null ? `, bowls ${e.bowls}` : ''})` : 'not in the standings'}; weekly average ${w.mean != null ? r1(w.mean) : 'n/a'} (league ${r1(w.leagueAvg)}), best ${w.best}, worst ${w.worst}, first half ${w.firstHalf != null ? r1(w.firstHalf) : 'n/a'} vs second half ${w.secondHalf != null ? r1(w.secondHalf) : 'n/a'}${s.top4.length ? `; weekly top-4 finishes: ${s.top4.map(t => `week ${t.week} (#${t.place})`).join(', ')}` : ''}${s.bowls ? `; bowl pool ${s.bowls.points}/${s.bowls.max}, rank ${s.bowls.rank} of ${s.bowls.of}` : ''}.`);
    if (m) L.push(`  picks: ${m.n} graded, covered ${pct(m.cover)}; underdogs ${pct(m.dog.share)} of picks (covered ${pct(m.dog.cover)}), home ${pct(m.home.share)}, NFL ${pct(m.nfl.share)}; high-confidence 8-10 covered ${pct(m.top.cover ?? 0)}, low 1-3 covered ${pct(m.low.cover ?? 0)}; 10s covered ${m.tens.cover != null ? pct(m.tens.cover) : 'n/a'}; ordering edge ${r1(m.orderEdgePerWeek)} pts/week; contrarian share ${pct(m.contrarian.share)}.`);
  }
  const c = rep.career;
  if (c && c.years.length > 1) { const m = c.metrics; L.push(`All seasons combined (${c.label}): ${m.n} picks, covered ${pct(m.cover)}; underdogs ${pct(m.dog.share)} of picks (covered ${pct(m.dog.cover)}); high-confidence 8-10 covered ${pct(m.top.cover ?? 0)}; 10s covered ${m.tens.cover != null ? pct(m.tens.cover) : 'n/a'}; ordering edge ${r1(m.orderEdgePerWeek)} pts/week. Finishes: ${c.finishes.map(f => `${f.season} #${f.rank} of ${f.of}${f.partial ? ` (after week ${f.partial}, not final)` : ""}`).join(', ')}.`); }
  if (rep.quirks.length) L.push(`Stands out (all seasons): ${rep.quirks.join(' ')}`);
  const fin = x => x.past?.filter(Boolean).map(p => `${p.season} #${p.rank}`).join(', ');
  if (rep.neighborhood) { const nb = rep.neighborhood; L.push(`This season: rank ${nb.me.rank} with ${nb.me.total}. Just ahead: ${nb.above.map(x => `${x.name} (#${x.rank}, ${x.gap ? '+' + x.gap : 'tied'}${fin(x) ? '; past finishes ' + fin(x) : ''})`).join(', ') || 'nobody (leader)'}. Just behind: ${nb.below.map(x => `${x.name} (#${x.rank}, ${x.gap || 'tied'}${fin(x) ? '; past finishes ' + fin(x) : ''})`).join(', ')}.`); }
  if (rep.lessons.length) L.push(`What separates them: ${rep.lessons.join(' ')}`);
  L.push(rep.caveat);
  return L.join('\n');
}

// League-wide patterns from a season, kept only when the gap is statistically meaningful
// (two-proportion z >= 2) so we don't turn noise into strategy. yr = 'all' pools every season.
export function leagueLessons(ctx, yr = Object.keys(ctx.seasons).sort().pop()) {
  const S = yr === 'all' ? ctx.career : ctx.seasons[yr]; if (!S) return [];
  const rows = S.rows, out = [];
  const seg = f => { const s = rows.filter(f); return { n: s.length, p: s.length ? s.filter(r => r.covered).length / s.length : 0 }; };
  const test = (label, a, b, la, lb) => {
    const A = seg(a), B = seg(b); if (A.n < 150 || B.n < 150) return;
    const p = (A.p * A.n + B.p * B.n) / (A.n + B.n); const z = (A.p - B.p) / Math.sqrt(p * (1 - p) * (1 / A.n + 1 / B.n));
    out.push({ label, z, text: `${la} covered ${pct(A.p)} (${A.n.toLocaleString()} picks) vs ${pct(B.p)} for ${lb} (${B.n.toLocaleString()}).`, significant: Math.abs(z) >= 2 });
  };
  test('crowd', r => r.nGame >= 5 && r.pop < 0.35, r => r.nGame >= 5 && r.pop >= 0.65, 'Contrarian picks (under 35% of the league agreeing)', 'crowd favorites (65%+ agreeing)');
  test('tens', r => r.conf === 10, r => r.conf !== 10, "Everyone's 10-point picks", 'all other picks');
  test('top', r => r.conf >= 8, r => r.conf <= 3, 'High-confidence picks (8-10)', 'low-confidence picks (1-3)');
  test('dogs', r => r.side === 'dog', r => r.side === 'fav', 'Underdogs', 'favorites');
  test('home', r => r.homeKnown && r.home, r => r.homeKnown && !r.home, 'Home teams', 'road teams');
  test('nfl', r => r.league === 'NFL', r => r.league === 'CFB', 'NFL picks', 'college picks');
  test('bigfav', r => r.side === 'fav' && r.spread >= 10, r => r.side === 'fav' && r.spread < 10, 'Big favorites (10+)', 'smaller favorites');
  test('close', r => r.spread <= 3.5, r => r.spread > 3.5, 'Close lines (3½ or less)', 'bigger spreads');
  return out.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
}

// ---------------------------------------------------------------- one person's picks on one team
// Sheet spellings vary ("Georgia St" / "Georgia St.", capitals mark the home team, a few typos), so
// names compare by a normalized key. Exact keys only: "georgia" never matches "georgia tech".
const TYPO = { detriot: 'detroit', philadephia: 'philadelphia', indianopolis: 'indianapolis', 'cincinnat i': 'cincinnati' };
export const teamKey = s => { const k = String(s || '').toLowerCase().replace(/\(/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\bstate\b/g, 'st').replace(/\s+/g, ' ').trim(); return TYPO[k] || k; };
const NFL_NICK = { cardinals: 'arizona', falcons: 'atlanta', ravens: 'baltimore', bills: 'buffalo', panthers: 'carolina', bears: 'chicago', bengals: 'cincinnati',
  browns: 'cleveland', cowboys: 'dallas', broncos: 'denver', lions: 'detroit', packers: 'green bay', texans: 'houston', colts: 'indianapolis', jaguars: 'jacksonville',
  jags: 'jacksonville', chiefs: 'kansas city', raiders: 'las vegas', chargers: 'la chargers', rams: 'la rams', dolphins: 'miami', vikings: 'minnesota', patriots: 'new england',
  pats: 'new england', saints: 'new orleans', giants: 'ny giants', jets: 'ny jets', eagles: 'philadelphia', steelers: 'pittsburgh', '49ers': 'san francisco', niners: 'san francisco',
  seahawks: 'seattle', buccaneers: 'tampa bay', bucs: 'tampa bay', titans: 'tennessee', commanders: 'washington' };
const CFB_NICK = { 'ole miss': 'mississippi', uga: 'georgia', bama: 'alabama', hurricanes: 'miami', 'florida international': 'fiu', 'central florida': 'ucf' };
const leagueWord = l => (l === 'NFL' ? 'NFL' : 'college');

// Teams named in a question: [{ key, league }] (league null = either). Longest names match first.
export function teamsInText(ctx, text, extraGames = []) {
  let t = ` ${teamKey(text)} `; const out = [];
  const take = (phrase, key, league) => { const p = ` ${phrase} `; if (!t.includes(p)) return; t = t.split(p).join(' # '); if (!out.some(x => x.key === key && x.league === league)) out.push({ key, league }); };
  for (const [n, k] of Object.entries(CFB_NICK)) take(teamKey(n), k, 'CFB');
  for (const [n, k] of Object.entries(NFL_NICK)) take(n, k, 'NFL');
  const known = new Set();
  for (const s of Object.values(ctx?.seasons || {})) for (const w of s.archive.weeks) for (const g of w.games) { known.add(teamKey(g.fav)); known.add(teamKey(g.dog)); }
  for (const g of extraGames) { known.add(teamKey(g.fav)); known.add(teamKey(g.dog)); }
  for (const k of [...known].filter(k => k.length >= 3).sort((a, b) => b.length - a.length)) take(k, k, null);
  return out;
}

// Every pick a person made on a team's games: by season, for vs against, and whether each covered.
// extra: [{ label, games, picks }] for weeks not in the archives (this season's loaded weeks).
export function teamPickHistory(ctx, name, team, extra = []) {
  const sources = Object.entries(ctx?.seasons || {}).sort().flatMap(([yr, s]) => s.archive.weeks.filter(w => w.picks).map(w => ({ label: yr, week: w.week, games: w.games, picks: w.picks })));
  for (const x of extra) if (x.picks) sources.push(x);
  const seasons = new Map();
  for (const w of sources) {
    const S = seasons.get(w.label) || { label: w.label, onSheet: 0, rows: [], played: false }; seasons.set(w.label, S);
    const pk = findIn(Object.keys(w.picks), name); if (pk) S.played = true;
    const hit = w.games.filter(g => (teamKey(g.fav) === team.key || teamKey(g.dog) === team.key) && (!team.league || (g.league || 'CFB') === team.league));
    if (!hit.length) continue; S.onSheet++;
    const p = pk ? w.picks[pk] : null; if (!p) continue;
    for (const [c, no] of Object.entries(p.conf)) for (const g of hit) {
      if (no !== g.fav_no && no !== g.dog_no) continue;
      const side = no === g.fav_no ? 'fav' : 'dog', pickedTeam = side === 'fav' ? g.fav : g.dog, forTeam = teamKey(pickedTeam) === team.key;
      const covered = g.favCovers == null ? null : (side === 'fav') === g.favCovers;
      S.rows.push({ week: w.week, conf: +c, forTeam, pick: `${pickedTeam} ${side === 'fav' ? '−' : '+'}${g.spread}`, opp: side === 'fav' ? g.dog : g.fav, league: g.league || 'CFB', covered });
    }
  }
  return [...seasons.values()];
}
export function teamPickText(ctx, name, team, extra = []) {
  const label = team.key.replace(/\b\w/g, ch => ch.toUpperCase()) + (team.league ? ` (${leagueWord(team.league)})` : '');
  const res = (rows) => { const d = rows.filter(r => r.covered != null); return d.length ? `, covered ${d.filter(r => r.covered).length} of ${d.length}` : ''; };
  // Lead with the direct answer (counts for and against, by season), then the week-by-week detail.
  const hist = teamPickHistory(ctx, name, team, extra).filter(s => s.onSheet);
  const tally = which => hist.map(s => !s.played ? `${s.label} no sheets on file` : (() => { const r = s.rows.filter(x => x.forTeam === (which === 'for')); return `${s.label} ${r.length === 0 ? 'never' : r.length === 1 ? 'once' : r.length + ' times'}${res(r)}`; })()).join('; ');
  const head = hist.length ? `${name} picked AGAINST ${label}: ${tally('against')}. Picked FOR ${label}: ${tally('for')}.` : '';
  const parts = hist.map(s => {
    if (!s.played) return `${s.label}: ${name} has no pick sheets on file for that season (not in the pool, or sheets not loaded).`;
    const on = s.rows.filter(r => r.forTeam), off = s.rows.filter(r => !r.forTeam);
    const detail = s.rows.map(r => `wk${r.week}: ${r.conf} on ${r.pick} vs ${r.opp}${team.league ? '' : ` (${leagueWord(r.league)})`}${r.covered == null ? ' (pending)' : r.covered ? ' (covered)' : ' (lost)'}`).join('; ');
    return `${s.label}: ${label} was on the sheet ${s.onSheet} week${s.onSheet === 1 ? '' : 's'}; picked FOR ${label} ${on.length} time${on.length === 1 ? '' : 's'}${res(on)}, AGAINST ${off.length} time${off.length === 1 ? '' : 's'}${res(off)}${detail ? `. ${detail}` : ''}.`;
  });
  return `TEAM PICKS: ${name} and ${label}. ${head ? `ANSWER: ${head} DETAIL: ` : ''}${parts.length ? parts.join(' ') : `${label} wasn't on any sheet on file.`}`;
}

// Did each league-wide pattern hold from season to season? Uses only years where the pattern was
// clearly there on its own (|z| >= 2): opposite signs = flipped; the same direction every year (|z| >= 1 each) and
// significant combined = held; significant in one year only = one-year; otherwise noise.
export function lessonVerdicts(ctx) {
  const yrs = Object.keys(ctx.seasons).sort();
  const by = Object.fromEntries(yrs.map(y => [y, Object.fromEntries(leagueLessons(ctx, y).map(l => [l.label, l]))]));
  return leagueLessons(ctx, 'all').map(l => {
    const zs = Object.fromEntries(yrs.map(y => [y, by[y][l.label]?.z ?? null]));
    const vals = Object.values(zs).filter(z => z != null), sig = vals.filter(z => Math.abs(z) >= 2);
    const verdict = sig.some(z => z > 0) && sig.some(z => z < 0) ? 'flipped'
      : l.significant && vals.every(z => Math.sign(z) === Math.sign(l.z) && Math.abs(z) >= 1) && yrs.length > 1 ? 'held'
      : l.significant || sig.length ? 'one-year' : 'noise';
    return { ...l, zs, verdict };
  });
}

// Compact past-season summary for the Commentator's brief.
export function historySummary(ctx, family) {
  const out = [];
  for (const yr of Object.keys(ctx.seasons).sort().reverse()) {
    const A = ctx.seasons[yr].archive; const aw = A.winners?.awards || {};
    if (A.partial) {
      const P = A.partial, top = [...A.entries].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, 3);
      out.push(`${yr} SEASON (${A.entries.length} entries) — INCOMPLETE DATA: standings only through week ${P.throughWeek}; week ${P.missingWeeks.join(', ')} and the final result are missing, so there is no known champion. Official weekly scores for weeks ${P.officialWeeks.join(', ')}; weeks ${P.rebuiltWeeks.join(', ')} are rebuilt from pick sheets. Bowl results partly unofficial. Leaders after week ${P.throughWeek}: ${top.map(e => `${e.name} ${e.total}`).join(', ')}.`);
    } else out.push(`${yr} SEASON (${A.entries.length} entries): season champion ${aw['Guru Season']?.[0] ?? 'n/a'}, weeks 1-19 champion ${aw['Guru Weeks 1-19']?.[0] ?? 'n/a'}, bowl pool champion ${aw['Bowls']?.[0] ?? 'n/a'}.`);
    for (const f of family) {
      if (!f.pool) continue;
      const rep = scoutingReport(ctx, f.pool); const s = rep.seasons.find(x => x.season === +yr); if (!s?.entry) continue;
      const m = s.metrics;
      out.push(`  ${f.short}: ${A.partial ? `ranked #${s.entry.seasonRank ?? s.entry.guruRank} after week ${A.partial.throughWeek} (not final)` : `finished #${s.entry.seasonRank ?? s.entry.guruRank}`} (weeks total ${s.entry.total}, avg ${s.weekly.mean?.toFixed(1)}, best week ${s.weekly.best}, worst ${s.weekly.worst}${s.top4.length ? `, weekly top-4 ${s.top4.map(t => `wk${t.week} #${t.place}`).join(' ')}` : ''}${s.bowls ? `, bowls #${s.bowls.rank}` : ''})${m ? `; picks covered ${Math.round(m.cover * 100)}%, 10s covered ${m.tens.cover != null ? Math.round(m.tens.cover * 100) + '%' : 'n/a'}, underdogs ${Math.round(m.dog.share * 100)}% of picks` : ''}${rep.quirks[0] ? `; stands out: ${rep.quirks[0]}` : ''}`);
    }
    const L = leagueLessons(ctx, yr).filter(l => l.significant);
    if (L.length) out.push(`  League-wide patterns in ${yr} (statistically meaningful): ${L.map(l => l.text).join(' ')}`);
  }
  if (ctx.career?.years.length > 1) {
    out.push(`ALL SEASONS COMBINED (${ctx.career.label}):`);
    for (const f of family) {
      if (!f.pool) continue; const rep = scoutingReport(ctx, f.pool); const c = rep.career; if (!c) continue;
      const fs = [...c.finishes].sort((a, b) => a.season - b.season); let trend = '';
      if (fs.length > 1) { const a = fs[fs.length - 2], b = fs[fs.length - 1], d = a.rank - b.rank;
        trend = d > 0 ? ` (improved ${d} places from ${a.season} to ${b.season})` : d < 0 ? ` (dropped ${-d} places from ${a.season} to ${b.season}; a bigger rank number is worse)` : ' (same finish both years)'; }
      out.push(`  ${f.short}: finishes ${c.finishes.map(x => `${x.season} #${x.rank}${x.partial ? ` (after week ${x.partial}, not final)` : ""}`).join(', ')}${trend}; picks covered ${Math.round(c.metrics.cover * 100)}% over ${c.metrics.n}; 10s covered ${c.metrics.tens.cover != null ? Math.round(c.metrics.tens.cover * 100) + '%' : 'n/a'}`);
    }
    const tag = { held: '[held up every season]', flipped: '[reversed between seasons: not a strategy]', 'one-year': '[showed up in one season only]', noise: '[noise]' };
    out.push(`  League-wide patterns, all seasons pooled, with whether each held year to year: ${lessonVerdicts(ctx).map(l => `${tag[l.verdict]} ${l.text} (z by season: ${Object.entries(l.zs).map(([y, z]) => `${y} ${z == null ? 'n/a' : z.toFixed(1)}`).join(', ')})`).join(' ')}`);
  }
  return out.join('\n');
}
