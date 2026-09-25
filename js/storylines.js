// League storylines from the official weekly scores (browser + Node): who led after each week,
// lead changes, the week's winners, biggest climbers and fallers, season records, and how each
// family member and the family as a whole moved. Facts about what happened, never forecasts.
import { samePerson } from './names.js';

const sum = a => a.reduce((s, v) => s + (v ?? 0), 0);
const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const r1 = x => Math.round(x * 10) / 10;

// family: [{ key, short, pool, shadow }]
export function leagueStorylines(league, family = []) {
  const M = league?.members || []; if (!M.length) return null;
  // Weeks count once at least half the league has an official score for them.
  let W = 0; for (let w = 0; w < 19; w++) if (M.filter(m => m.weeks[w] != null).length >= M.length / 2) W = w + 1;
  if (!W) return null;
  const tot = (m, w) => sum(m.weeks.slice(0, w));
  const rankAfter = w => { const t = new Map(M.map(m => [m.name, tot(m, w)])); return new Map(M.map(m => [m.name, 1 + M.filter(o => t.get(o.name) > t.get(m.name)).length])); };
  const ranks = Array.from({ length: W + 1 }, (_, w) => (w ? rankAfter(w) : null));
  const famOf = name => family.find(f => !f.shadow && f.pool && (f.pool === name || samePerson(f.pool, name)));
  const label = name => famOf(name)?.short || name;

  // Leaders after each week, and lead changes.
  const leaders = [];
  for (let w = 1; w <= W; w++) leaders.push({ week: w, names: M.filter(m => ranks[w].get(m.name) === 1).map(m => m.name), total: Math.max(...M.map(m => tot(m, w))) });
  const changes = leaders.filter((l, i) => i && l.names.join('|') !== leaders[i - 1].names.join('|')).map(l => l.week);
  const cur = leaders[W - 1];
  const second = Math.max(...M.filter(m => !cur.names.includes(m.name)).map(m => tot(m, W)));
  const heldSince = (() => { let w = W; while (w > 1 && leaders[w - 2].names.join('|') === cur.names.join('|')) w--; return w; })();

  // This week.
  const wk = M.filter(m => m.weeks[W - 1] != null).map(m => ({ name: m.name, s: m.weeks[W - 1] })).sort((a, b) => b.s - a.s);
  const wAvg = avg(wk.map(x => x.s));
  const weekRank = s => 1 + wk.filter(x => x.s > s).length;
  const top = wk.filter(x => weekRank(x.s) <= 3);

  // Season records so far: best single week, and best weekly average among full-time entries.
  let best = null; for (const m of M) m.weeks.slice(0, W).forEach((s, w) => { if (s != null && (!best || s > best.s)) best = { name: m.name, s, week: w + 1 }; });
  const bestTies = M.flatMap(m => m.weeks.slice(0, W).map((s, w) => ({ name: m.name, s, week: w + 1 }))).filter(x => x.s === best?.s);

  // Movers since last week.
  const movers = W >= 2 ? M.map(m => ({ name: m.name, from: ranks[W - 1].get(m.name), to: ranks[W].get(m.name) })).map(x => ({ ...x, d: x.from - x.to })) : [];
  const climbers = [...movers].sort((a, b) => b.d - a.d).filter(x => x.d > 0).slice(0, 3);
  const fallers = [...movers].sort((a, b) => a.d - b.d).filter(x => x.d < 0).slice(0, 3);

  // Family.
  const fam = family.filter(f => !f.shadow && f.pool).map(f => {
    const m = M.find(x => x.name === f.pool || samePerson(x.name, f.pool)); if (!m) return null;
    const hist = ranks.slice(1).map(r => r.get(m.name));
    const s = m.weeks[W - 1];
    return { key: f.key, short: f.short, name: m.name, rank: hist[W - 1], prev: W >= 2 ? hist[W - 2] : null, best: Math.min(...hist), bestWeek: 1 + hist.indexOf(Math.min(...hist)),
      total: tot(m, W), week: s, weekRank: s != null ? weekRank(s) : null, top10: m.weeks.slice(0, W).filter((v, w) => v != null && M.filter(o => (o.weeks[w] ?? -1) > v).length < 10).length };
  }).filter(Boolean);
  const famNames = new Set(fam.map(f => f.name));
  const fvl = Array.from({ length: W }, (_, w) => {
    const f = avg(fam.map(x => M.find(m => m.name === x.name).weeks[w]).filter(v => v != null));
    const l = avg(M.filter(m => !famNames.has(m.name)).map(m => m.weeks[w]).filter(v => v != null));
    return { week: w + 1, fam: f, league: l, beat: f != null && l != null && f > l };
  });
  const beatN = fvl.filter(x => x.beat).length;
  let beatRun = 0; for (let i = fvl.length - 1; i >= 0 && fvl[i].beat === fvl[fvl.length - 1].beat; i--) beatRun++;

  // Plain-text lines (for the Commentator and the recap).
  const lines = [];
  lines.push(`Through week ${W} (${M.length} entries): ${cur.names.map(label).join(' and ')} ${cur.names.length > 1 ? 'share' : 'leads'} the season with ${cur.total}${Number.isFinite(second) ? `, ${cur.total - second} ahead of the next entry` : ''}; ${heldSince === 1 ? 'in front since week 1' : `in front since week ${heldSince}`}. Lead changes this season: ${changes.length ? changes.map(w => `week ${w}`).join(', ') : 'none'}.`);
  lines.push(`Week ${W}: league average ${r1(wAvg)}; top scores ${top.map(x => `${label(x.name)} ${x.s}`).join(', ')}.`);
  if (best) lines.push(`Best single week this season: ${bestTies.map(x => `${label(x.name)} ${x.s} (week ${x.week})`).join(', ')}.`);
  if (climbers.length) lines.push(`Biggest climbers in week ${W}: ${climbers.map(x => `${label(x.name)} #${x.from}→#${x.to}`).join(', ')}. Biggest drops: ${fallers.map(x => `${label(x.name)} #${x.from}→#${x.to}`).join(', ') || 'none'}.`);
  for (const f of fam) lines.push(`${f.short}: #${f.rank} of ${M.length} with ${f.total}${f.prev ? ` (${f.prev === f.rank ? 'no change' : f.prev > f.rank ? `up ${f.prev - f.rank} from #${f.prev}` : `down ${f.rank - f.prev} from #${f.prev}`} last week)` : ''}; week ${W} score ${f.week ?? 'n/a'}${f.weekRank ? ` (#${f.weekRank} that week)` : ''}; best season rank #${f.best} (after week ${f.bestWeek}); top-10 weeks: ${f.top10}.`);
  lines.push(`The family beat the rest of the league's weekly average in ${beatN} of ${W} weeks${W >= 2 ? `; ${fvl[W - 1].beat ? 'beat' : 'trailed'} it the last ${beatRun} week${beatRun > 1 ? 's' : ''} running` : ''} (week ${W}: family ${r1(fvl[W - 1].fam ?? 0)} vs league ${r1(fvl[W - 1].league ?? 0)}).`);
  return { week: W, size: M.length, leaders, changes, current: cur, lead: Number.isFinite(second) ? cur.total - second : null, heldSince, top, weekAvg: wAvg, best: bestTies, climbers, fallers, family: fam, fvl, beatN, beatRun, lines };
}
