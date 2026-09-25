// Week simulator: plays the rest of the week out N times using each game's cover chance
// (live-aware: finished games are fixed, games in progress use the in-game estimate).
// Pure JS so the dashboard and the Commentator share it. Seeded, so the same inputs give the
// same answer and numbers don't jitter between refreshes.
//
// Three lenses:
//   family race   - family entries with picks loaded (plus the unofficial shadow card head to head)
//   vs the league - each family entry's week rank / season rank among all league entries
//   family vs league - the family's average against everyone else's
// League entries whose picks are loaded are scored from their picks. Everyone else (including
// family members whose picks aren't in yet) is drawn from a "field model": their own weekly
// average shrunk hard toward the league average (three weeks is a tiny sample), with the league's
// week-to-week spread.
import { gameState } from './live.js';

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Field model: the league's weekly average and spread, and each entry's season total so far.
export function fieldModel(league, uptoWeek) {
  const members = league?.members || [];
  const played = w => members.some(m => m.weeks[w] != null);
  const weeks = []; for (let w = 0; w < uptoWeek - 1; w++) if (played(w)) weeks.push(w);
  const all = members.flatMap(m => weeks.map(w => m.weeks[w]).filter(v => v != null));
  const L = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 25;
  const S = all.length > 2 ? Math.sqrt(all.reduce((a, b) => a + (b - L) ** 2, 0) / (all.length - 1)) : 9;
  // Everyone is projected at the league average. Scores don't carry over in this pool: a player's
  // 2024 weekly average vs their 2025 average correlates 0.04, and 2025's first half vs its second
  // half -0.05, so a hot start says nothing about this week.
  const proj = new Map(members.map(m => {
    return [m.name, { mean: L, sd: S,
      season: m.weeks.slice(0, uptoWeek - 1).reduce((a, v) => a + (v || 0), 0) }];
  }));
  return { L, S, proj, size: members.length };
}

// entries: [{ key, label, group: 'family' | 'shadow' | 'league', name?, conf? }]
//   - family entries without conf are simulated from the field model (for family-vs-league only)
// field: result of fieldModel(); null skips the league lenses.
// forced: { [favPoolNo]: 1 | 0 } locks a game as "favorite covers" / "underdog covers" (for what-if questions).
export function simulateWeek(week, live, model, entries, N = 5000, field = null, forced = null) {
  const games = week.games, idx = new Map(), pFav = [], decided = [];
  games.forEach((g, i) => {
    idx.set(g.fav_no, [i, 1]); idx.set(g.dog_no, [i, 0]);
    const st = gameState(g, live, model);
    decided[i] = forced && forced[g.fav_no] != null ? (forced[g.fav_no] ? 1 : 0) : st.state === 'post' ? (st.margin > g.spread ? 1 : 0) : -1;
    pFav[i] = st.pFav ?? 0.5;
  });
  const E = entries.map(e => ({ ...e, legs: Object.entries(e.conf || {}).map(([c, no]) => { const h = idx.get(no); return h ? [h[0], h[1], +c] : null; }).filter(Boolean) }))
    .map(e => ({ ...e, picked: e.legs.length > 0, official: e.group === 'family' && e.legs.length > 0 }));
  const off = E.map((e, k) => e.official ? k : -1).filter(k => k >= 0);
  const fam = E.map((e, k) => e.group === 'family' ? k : -1).filter(k => k >= 0);
  const shadowK = E.findIndex(e => e.group === 'shadow');
  const used = [...new Set(E.flatMap(e => e.legs.map(l => l[0])))];
  const open = used.filter(i => decided[i] < 0);
  const rand = rng(1234567), rand2 = rng(7654321);
  const gauss = () => { const u = 1 - rand2(), v = rand2(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const draw = p => Math.max(0, Math.min(55, Math.round(p.mean + p.sd * gauss())));

  // League members outside the family who don't have picks loaded come from the field model.
  const inE = new Set(E.filter(e => e.name).map(e => e.name));
  const others = field ? [...field.proj.entries()].filter(([name]) => !inE.has(name)).map(([name, p]) => ({ name, ...p })) : [];
  const lgIdx = E.map((e, k) => e.group === 'league' ? k : -1).filter(k => k >= 0);
  const seasonOf = e => field?.proj.get(e.name)?.season ?? 0;

  const scores = E.map(() => new Float64Array(N));
  const outcome = new Map(open.map(i => [i, new Uint8Array(N)]));
  const cov = new Int8Array(games.length);
  const oth = new Float64Array(others.length);
  const track = field ? E.map((e, k) => (e.official || e.group === 'shadow') ? k : -1).filter(k => k >= 0) : [];
  const wRank = new Map(track.map(k => [k, new Float64Array(N)])), sRank = new Map(track.map(k => [k, new Float64Array(N)]));
  const famAvg = new Float64Array(N), lgAvg = new Float64Array(N), famBestRank = new Float64Array(N);
  const nLeague = field ? others.length + lgIdx.length + fam.length : 0;

  for (let s = 0; s < N; s++) {
    for (const i of used) cov[i] = decided[i] >= 0 ? decided[i] : (rand() < pFav[i] ? 1 : 0);
    for (const i of open) outcome.get(i)[s] = cov[i];
    for (let k = 0; k < E.length; k++) {
      const e = E[k];
      if (e.picked) { let t = 0; for (const [i, side, c] of e.legs) if (cov[i] === side) t += c; scores[k][s] = t; }
      else if (field && e.group === 'family' && field.proj.get(e.name)) scores[k][s] = draw(field.proj.get(e.name));
    }
    if (!field) continue;
    for (let j = 0; j < others.length; j++) oth[j] = draw(others[j]);
    // week + season rank among the whole league (competition ranking; the shadow card ranks as an extra entry)
    for (const k of track) {
      const x = scores[k][s], sx = seasonOf(E[k]) + x; let wr = 1, sr = 1;
      for (let j = 0; j < others.length; j++) { if (oth[j] > x) wr++; if (others[j].season + oth[j] > sx) sr++; }
      for (const j of [...lgIdx, ...fam]) if (j !== k) { if (scores[j][s] > x) wr++; if (seasonOf(E[j]) + scores[j][s] > sx) sr++; }
      wRank.get(k)[s] = wr; sRank.get(k)[s] = E[k].group === 'shadow' ? NaN : sr;
    }
    let fs = 0; for (const k of fam) fs += scores[k][s]; famAvg[s] = fam.length ? fs / fam.length : NaN;
    let ls = 0; for (let j = 0; j < others.length; j++) ls += oth[j]; for (const j of lgIdx) ls += scores[j][s];
    lgAvg[s] = (others.length + lgIdx.length) ? ls / (others.length + lgIdx.length) : NaN;
    let best = -1; for (const k of fam) best = Math.max(best, scores[k][s]);
    let br = 1; for (let j = 0; j < others.length; j++) if (oth[j] > best) br++; for (const j of lgIdx) if (scores[j][s] > best) br++;
    famBestRank[s] = br;
  }
  // Family win share per sim (family entries with picks only; ties split).
  const winShare = E.map(() => new Float64Array(N));
  if (off.length >= 2) for (let s = 0; s < N; s++) {
    let best = -1, n = 0; for (const k of off) { const v = scores[k][s]; if (v > best) { best = v; n = 1; } else if (v === best) n++; }
    for (const k of off) if (scores[k][s] === best) winShare[k][s] = 1 / n;
  }
  const mean = a => { let t = 0, n = 0; for (const v of a) if (!Number.isNaN(v)) { t += v; n++; } return n ? t / n : null; };
  const frac = (a, f) => { let t = 0; for (const v of a) if (f(v)) t++; return t / a.length; };
  const q = (a, p) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const beat = (a, b, mask) => { let t = 0, n = 0; for (let s = 0; s < N; s++) { if (mask && !mask(s)) continue; n++; const x = scores[a][s], y = scores[b][s]; t += x > y ? 1 : x === y ? 0.5 : 0; } return n ? t / n : null; };
  const topQ = Math.ceil(nLeague / 4);

  const res = { n: N, openGames: open.length, leagueSize: nLeague, entries: E.map((e, k) => ({ key: e.key, label: e.label, official: e.official, group: e.group, picked: e.picked,
    mean: mean(scores[k]), p10: q(scores[k], 0.1), p50: q(scores[k], 0.5), p90: q(scores[k], 0.9), pWin: off.length >= 2 && e.official ? mean(winShare[k]) : null,
    league: wRank.has(k) ? { weekRank: q(wRank.get(k), 0.5), pTop10: frac(wRank.get(k), r => r <= 10), pTopQ: frac(wRank.get(k), r => r <= topQ),
      seasonRank: e.group === 'shadow' ? null : q(sRank.get(k), 0.5), seasonRankNow: e.group === 'shadow' ? null : null, pSeasonTop10: e.group === 'shadow' ? null : frac(sRank.get(k), r => r <= 10) } : null })), h2h: {} };
  for (let a = 0; a < E.length; a++) for (let b = 0; b < E.length; b++) if (a !== b && E[a].picked && E[b].picked) (res.h2h[E[a].key] ??= {})[E[b].key] = beat(a, b);
  if (field && fam.length) res.familyVsLeague = { famAvg: mean(famAvg), lgAvg: mean(lgAvg), pFamAhead: frac(Array.from(famAvg).map((v, s) => v - lgAvg[s]), d => d > 0),
    famBestRank: q(famBestRank, 0.5), pFamTop10: frac(famBestRank, r => r <= 10), projectedMembers: fam.filter(k => !E[k].picked).map(k => E[k].key) };

  // What-ifs: for each unfinished game someone picked, how each lens moves if the favorite covers vs not.
  const pairs = off.length >= 2 ? null : (off.length === 1 && shadowK >= 0) ? [[off[0], shadowK]] : [];
  const cond = (arr, o, v, f = x => x) => { let t = 0, n = 0; for (let s = 0; s < N; s++) if (o[s] === v) { t += f(arr[s]); n++; } return n ? t / n : null; };
  res.whatifs = []; res.leagueWhatifs = [];
  for (const i of open) {
    const g = games[i], o = outcome.get(i);
    const riding = E.flatMap(e => e.legs.filter(l => l[0] === i).map(l => ({ key: e.key, side: l[1] ? 'fav' : 'dog', conf: l[2] })));
    // family race / head to head
    const by = {}; let impact = 0, lead = null;
    if (off.length >= 2) for (const k of off) {
      const w1 = cond(winShare[k], o, 1), w0 = cond(winShare[k], o, 0);
      by[E[k].key] = { now: res.entries[k].pWin, ifFav: w1, ifDog: w0 };
      if (w1 != null && w0 != null && Math.abs(w1 - w0) > impact) { impact = Math.abs(w1 - w0); lead = E[k].key; }
    } else for (const [a, b] of pairs) {
      const w1 = beat(a, b, s => o[s] === 1), w0 = beat(a, b, s => o[s] === 0);
      by[E[a].key] = { now: res.h2h[E[a].key]?.[E[b].key], ifFav: w1, ifDog: w0, vs: E[b].key };
      if (w1 != null && w0 != null) { impact = Math.abs(w1 - w0); lead = E[a].key; }
    }
    if (impact > 0) res.whatifs.push({ favNo: g.fav_no, pFav: pFav[i], impact, lead, by, riding, mode: off.length >= 2 ? 'family' : 'h2h' });
    // vs the league: chance of a top-10 week, per official family entry
    if (field) {
      let li = 0, ll = null, lb = null;
      for (const k of off) {
        const r = wRank.get(k); const w1 = cond(r, o, 1, v => v <= 10 ? 1 : 0), w0 = cond(r, o, 0, v => v <= 10 ? 1 : 0);
        if (w1 != null && w0 != null && Math.abs(w1 - w0) > li) { li = Math.abs(w1 - w0); ll = E[k].key; lb = { now: res.entries[k].league.pTop10, ifFav: w1, ifDog: w0 }; }
      }
      const d = Array.from(famAvg).map((v, s) => v - lgAvg[s]);
      const f1 = cond(d, o, 1, v => v > 0 ? 1 : 0), f0 = cond(d, o, 0, v => v > 0 ? 1 : 0);
      if (li > 0) res.leagueWhatifs.push({ favNo: g.fav_no, impact: li, lead: ll, by: { [ll]: lb }, mode: 'top10' });
      if (f1 != null && f0 != null && Math.abs(f1 - f0) > 0.04) res.leagueWhatifs.push({ favNo: g.fav_no, impact: Math.abs(f1 - f0), lead: 'family', by: { family: { now: res.familyVsLeague.pFamAhead, ifFav: f1, ifDog: f0 } }, mode: 'familyVsLeague' });
    }
  }
  res.whatifs.sort((a, b) => b.impact - a.impact);
  res.leagueWhatifs.sort((a, b) => b.impact - a.impact);
  return res;
}

// Plain-English what-if, used by the dashboard and the Commentator (numbers precomputed here).
const pc = x => `${Math.round(x * 100)}%`;
const half = x => (x % 1 ? `${Math.floor(x) || ''}½` : `${x}`);
export function describeWhatIf(w, week, label) {
  const g = week.games.find(x => x.fav_no === w.favNo); const b = w.by[w.lead]; if (!g || !b || b.now == null) return null;
  const who = label(w.lead), vs = b.vs ? label(b.vs) : null;
  const what = {
    family: `${who}'s chance to win the family this week`,
    h2h: `${who}'s chance to outscore ${vs}`,
    top10: `${who}'s chance of a top-10 week in the whole league`,
    familyVsLeague: `the family's chance of beating the league average this week`,
  }[w.mode];
  return { favNo: g.fav_no, impact: w.impact, mode: w.mode,
    text: `If ${g.fav} −${half(g.spread)} covers, ${what} goes from ${pc(b.now)} to ${pc(b.ifFav)}; if ${g.dog} +${half(g.spread)} covers, it's ${pc(b.ifDog)}.` };
}
