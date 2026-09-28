// Answer data questions by computing, not guessing. The Commentator asks the model to turn a question
// into a small JSON query (QUERY_GUIDE below); runQuery checks the data exists and does the math over
// three tables, and the answer is then written from those exact figures. Pure JS (browser + Node).
//
//   picks:   one row per graded pick (every archived season, plus finished games this week)
//   weeks:   one row per person per week: official (or rebuilt) weekly score and that week's rank
//   seasons: one row per person per past season: regular-season total, final rank, bowls, grand total
import { samePerson } from './names.js';
import { teamKey, teamsInText } from './profile.js';

const pc = x => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);
const r1 = x => Math.round(x * 10) / 10;

export const QUERY_GUIDE = `You turn questions about a family football pool into data queries. Output JSON only, no prose.

Pool basics: each week every entry makes 10 picks against printed spreads, with confidence 10 (most sure) down to 1; a pick that covers earns its confidence points. "Spot", "slot", "N-pointer" or "their 8s" all mean the confidence number.

Tables and fields:
- picks: name, season, week, conf (1-10), side ("fav" or "dog" = favorite or underdog), spread (number, e.g. 3.5), league ("NFL" or "CFB" = college), day ("Thursday".."Monday"), home (true = picked the home team), team (the team picked), opp (its opponent), covered (true/false), crowd (share of the league on the same side, 0-1), game (game number on that week's sheet).
  Family picks only: family_same (how many OTHER family members made the exact same pick that week, 0-4), family_on_game (family members who picked that game at all, either side, including this one). Example: share of family picks that at least one other family member also made = who "family", share_where {"family_same": {"min": 1}}.
- weeks: name, season, week, score (points that week), rank (rank that week, 1 = best), field (entries that week).
- seasons: name, season, total (regular-season points), rank (final regular-season rank), bowls (bowl points), grand (total incl. bowls), grandRank.

Output: {"answerable": true|false, "missing": "<if not answerable: what data would be needed>", "queries": [ ... up to 5 ... ]}
Each query: {
  "table": "picks" | "weeks" | "seasons",
  "who": ["<name>", ...] | "family" (everyone in the family pooled) | "each_family" (each family member separately) | "league" (every entry pooled) | "everyone" (each entry separately; use with sort to find leaders),
  "where": { "<field>": <value> | [<values>] | {"min": <n>, "max": <n>} },
  "share_where": { ... }  // optional: report what share of the "where" rows also match this (e.g. how often the 8s are underdogs)
  "group_by": "<field>",   // optional: break results out by a field (season, conf, week, league, side, team, day)
  "sort": "cover_rate" | "share" | "points" | "n" | "avg" | "max",  // optional, for who="everyone" or group_by
  "min_n": <number>,       // optional minimum sample size for sorted lists
  "limit": <number>,       // optional, default 10
  "label": "<short description>"
}
Use names exactly as they appear in the question (first names are fine). Seasons are years (the pool season 2025 = fall 2025).
If the question is not about pool data (small talk, news, what-ifs about this week's unfinished games), output {"answerable": true, "queries": []}.
If the data can't answer it (e.g. picks before 2023, point totals of real games), output answerable false and say what's missing.`;

// ---------------------------------------------------------------- tables
export function buildTables(ctx, { current = null, extraPicks = [], family = [] } = {}) {
  const picks = [...(ctx?.career?.rows || []).map(r => ({ ...r, crowd: r.pop })), ...extraPicks];
  // Family agreement: for each family pick, how many other family members picked the same side of the
  // same game that week, and how many picked that game at all (either side).
  const isFam = new Map(); const fam = n => { if (!isFam.has(n)) isFam.set(n, family.some(f => f.pool === n || samePerson(f.pool, n))); return isFam.get(n); };
  const byGame = new Map();
  for (const r of picks) if (fam(r.name)) { const k = `${r.season}|${r.week}|${r.game}`; (byGame.get(k) || byGame.set(k, []).get(k)).push(r); }
  for (const rs of byGame.values()) for (const r of rs) { r.family_same = rs.filter(o => o !== r && o.side === r.side).length; r.family_on_game = rs.length; }
  const weeks = [], seasons = [];
  for (const [yr, s] of Object.entries(ctx?.seasons || {})) {
    const A = s.archive;
    for (let w = 1; w <= 19; w++) {
      const es = A.entries.filter(e => e.weeks[w - 1] != null); if (!es.length) continue;
      for (const e of es) weeks.push({ name: e.name, season: +yr, week: w, score: e.weeks[w - 1], rank: 1 + es.filter(o => o.weeks[w - 1] > e.weeks[w - 1]).length, field: es.length });
    }
    for (const e of A.entries) seasons.push({ name: e.name, season: +yr, total: e.total ?? null, rank: e.guruRank ?? null, bowls: e.bowls ?? null, grand: e.season ?? null, grandRank: e.seasonRank ?? null });
  }
  if (current?.members) {
    for (let w = 1; w <= 19; w++) {
      const es = current.members.filter(m => m.weeks[w - 1] != null); if (!es.length) continue;
      for (const m of es) weeks.push({ name: m.name, season: +current.season, week: w, score: m.weeks[w - 1], rank: 1 + es.filter(o => o.weeks[w - 1] > m.weeks[w - 1]).length, field: es.length });
    }
  }
  const range = t => { const ys = [...new Set(t.map(r => r.season))].sort(); return ys.length ? `${ys[0]}–${ys.at(-1)}` : 'none'; };
  const partial = Object.entries(ctx?.seasons || {}).filter(([, s]) => s.archive.partial).map(([yr, s]) => `${yr} is incomplete (through week ${s.archive.partial.throughWeek}; missing week ${s.archive.partial.missingWeeks?.join(', ') || 'none'})`);
  return { picks, weeks, seasons, coverage: `picks ${range(picks)}, weekly scores ${range(weeks)}, season finishes ${range(seasons)}${partial.length ? '; ' + partial.join('; ') : ''}` };
}

// ---------------------------------------------------------------- filters
// Each condition is compiled once into a test (team names resolved, synonyms normalized), then run per row.
const teamMemo = new Map();
const tkey = s => { if (!teamMemo.has(s)) teamMemo.set(s, teamKey(s)); return teamMemo.get(s); };
function compile(field, want, ctx) {
  if (field === 'team' || field === 'opp') {
    const keys = new Set([].concat(want).flatMap(w => { const t = teamsInText(ctx, String(w)); return t.length ? t.map(x => x.key) : [teamKey(w)]; }));
    return r => keys.has(tkey(r[field]));
  }
  if (field === 'league') { const ws = new Set([].concat(want).map(x => (/nfl/i.test(x) ? 'NFL' : 'CFB'))); return r => ws.has(r.league === 'NFL' ? 'NFL' : 'CFB'); }
  if (field === 'side') { const ws = new Set([].concat(want).map(x => (/dog|under/i.test(x) ? 'dog' : 'fav'))); return r => ws.has(r.side); }
  if (field === 'day') { const ws = new Set([].concat(want).map(x => String(x).toLowerCase())); return r => ws.has(String(r.day || '').toLowerCase()); }
  if (field === 'name') { const memo = new Map(); return r => { if (!memo.has(r.name)) memo.set(r.name, [].concat(want).some(n => r.name === n || samePerson(r.name, String(n)))); return memo.get(r.name); }; }
  if (want && typeof want === 'object' && !Array.isArray(want)) return r => r[field] != null && (want.min == null || r[field] >= want.min) && (want.max == null || r[field] <= want.max);
  const ws = [].concat(want).map(String); return r => ws.includes(String(r[field]));
}
const filterRows = (rows, where, ctx) => { const tests = Object.entries(where || {}).map(([f, w]) => compile(f, w, ctx)); return rows.filter(r => tests.every(t => t(r))); };

// ---------------------------------------------------------------- stats
function stats(table, rows, share) {
  const n = rows.length;
  if (table === 'picks') {
    const c = rows.filter(r => r.covered === true).length, graded = rows.filter(r => r.covered != null).length;
    const out = { n, covered: c, cover_rate: graded ? c / graded : null, points: rows.filter(r => r.covered).reduce((s, r) => s + r.conf, 0) };
    if (share) { out.k = share.length; out.share = n ? share.length / n : null; }
    // The same pick made by several people is several rows; count distinct picks too.
    const distinct = rs => new Set(rs.map(r => `${r.season}|${r.week}|${r.game}|${r.side}`)).size;
    out.distinct = distinct(rows); if (share) out.kDistinct = distinct(share);
    const dc = rows.filter(r => r.covered === true); out.distinctCovered = distinct(dc);
    return out;
  }
  const f = table === 'weeks' ? 'score' : 'total';
  const vals = rows.map(r => r[f]).filter(v => v != null);
  const best = rows.filter(r => r[f] != null).sort((a, b) => b[f] - a[f]);
  const out = { n, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, max: best[0] ?? null, min: best.at(-1) ?? null };
  if (share) { out.k = share.length; out.share = n ? share.length / n : null; }
  return out;
}
function statText(table, s, rows, shareDesc = '') {
  if (!s.n) return 'no matching data';
  const sh = s.share != null ? `; ${s.k} of those ${s.n} are ${shareDesc} (${pc(s.share)})` : '';
  if (table === 'picks') {
    const dup = s.distinct < s.n ? ` (counting each person's pick separately; that's ${s.distinct} distinct picks, ${s.distinctCovered} of them covered)` : '';
    const dupK = s.share != null && s.kDistinct < s.k ? ` (${s.kDistinct} distinct picks)` : '';
    return `${s.n} picks${dup}, covered ${s.covered} (${pc(s.cover_rate)}), ${s.points} points won${sh}${dupK}`;
  }
  const f = table === 'weeks' ? 'score' : 'total';
  const when = r => `${table === 'weeks' ? `${r.season} week ${r.week}` : r.season}${r.rank ? `, rank ${r.rank}${r.field ? ` of ${r.field}` : ''}` : ''}`;
  const list = rows.length <= 12 ? `; rows: ${rows.map(r => `${r[f]} (${when(r)})`).join(', ')}` : '';
  return `${s.n} ${table === 'weeks' ? 'weeks' : 'seasons'}, average ${r1(s.avg)}, best ${s.max[f]} (${when(s.max)}), worst ${s.min[f]} (${when(s.min)})${sh}${list}`;
}

// ---------------------------------------------------------------- run
// family: [{ pool, short }] (this season's family, no shadow card)
export function runQuery(ctx, tables, spec, family = []) {
  if (!spec || spec.answerable === false) return `DATA CHECK: the data on file can't answer this${spec?.missing ? ` (missing: ${spec.missing})` : ''}. On file: ${tables.coverage}. Say so plainly; don't estimate.`;
  const out = [];
  for (const q of (spec.queries || []).slice(0, 5)) {
    const table = ['picks', 'weeks', 'seasons'].includes(q.table) ? q.table : 'picks';
    const T = tables[table]; if (!T.length) { out.push(`${q.label || table}: no ${table} data on file.`); continue; }
    const base = filterRows(T, q.where, ctx);
    const names = [...new Set(T.map(r => r.name))];
    const famNames = family.map(f => names.find(n => n === f.pool) || names.find(n => samePerson(n, f.pool))).filter(Boolean);
    const labelOf = n => family.find(f => f.pool === n || samePerson(f.pool, n))?.short || n;
    let groups;   // [[label, rows]]
    if (Array.isArray(q.who)) groups = q.who.map(w => { const n = names.find(x => x === w) || names.find(x => samePerson(x, w)) || famNames.find(x => samePerson(x, w) || x.toLowerCase().startsWith(String(w).toLowerCase() + ' ')); return [n ? labelOf(n) : `${w} (not found in the data)`, n ? base.filter(r => r.name === n) : []]; });
    else if (q.who === 'family') groups = [['Family (pooled)', base.filter(r => famNames.includes(r.name))]];
    else if (q.who === 'each_family') groups = famNames.map(n => [labelOf(n), base.filter(r => r.name === n)]);
    else if (q.who === 'everyone') { const by = new Map(); for (const r of base) (by.get(r.name) || by.set(r.name, []).get(r.name)).push(r); groups = [...by].map(([n, rs]) => [labelOf(n), rs]); }
    else groups = [['Whole league (pooled)', base]];
    const lines = [];
    const one = (label, rows) => { const sh = q.share_where ? filterRows(rows, q.share_where, ctx) : null; return { label, rows, s: stats(table, rows, sh) }; };
    let items = [];
    for (const [label, rows] of groups) {
      if (q.group_by) {
        const by = new Map(); for (const r of rows) { const k = r[q.group_by] ?? 'unknown'; (by.get(k) || by.set(k, []).get(k)).push(r); }
        for (const [k, rs] of [...by.entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1))) items.push(one(`${label}, ${q.group_by} ${k}`, rs));
      } else items.push(one(label, rows));
    }
    if (q.sort) {
      const key = s => (q.sort === 'max' ? (s.max?.[table === 'weeks' ? 'score' : 'total'] ?? -1) : s[q.sort] ?? -1);
      items = items.filter(i => i.s.n >= (q.min_n ?? (q.who === 'everyone' ? 20 : 1))).sort((a, b) => key(b.s) - key(a.s)).slice(0, q.limit || 10);
    }
    const shareDesc = Object.entries(q.share_where || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
    for (const i of items.slice(0, 40)) lines.push(`  ${i.label}: ${statText(table, i.s, i.rows, shareDesc)}`);
    // League baseline for pick questions about specific people or the family.
    const famOnly = JSON.stringify([q.where, q.share_where]).includes('family_');   // no league equivalent
    if (table === 'picks' && q.who !== 'league' && q.who !== 'everyone' && !q.group_by && !famOnly) { const b = one('League baseline, same filter', base); lines.push(`  ${b.label}: ${statText(table, b.s, [], shareDesc)}`); }
    const where = Object.entries(q.where || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
    out.push(`${q.label || 'Query'} [${table}${where ? `; ${where}` : ''}${q.share_where ? `; share where ${JSON.stringify(q.share_where)}` : ''}]:\n${lines.join('\n') || '  no matching data'}`);
  }
  if (!out.length) return '';
  return `COMPUTED FROM THE DATA (exact; on file: ${tables.coverage}):\n${out.join('\n')}\n(Sample sizes matter: a few percentage points on small samples is noise.)`;
}
