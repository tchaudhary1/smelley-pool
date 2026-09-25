// Week simulator: plays the rest of the week out N times using each game's cover chance
// (live-aware: finished games are fixed, games in progress use the in-game estimate).
// Pure JS so the dashboard and the Commentator share it. Seeded, so the same inputs give the
// same answer and numbers don't jitter between refreshes.
import { gameState } from './live.js';

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// entries: [{ key, label, official, conf: { "10": poolNo, ... } }]
export function simulateWeek(week, live, model, entries, N = 5000) {
  const games = week.games, idx = new Map(), pFav = [], decided = [];
  games.forEach((g, i) => {
    idx.set(g.fav_no, [i, 1]); idx.set(g.dog_no, [i, 0]);
    const st = gameState(g, live, model);
    decided[i] = st.state === 'post' ? (st.margin > g.spread ? 1 : 0) : -1;
    pFav[i] = st.pFav ?? 0.5;
  });
  const E = entries.map(e => ({ ...e, legs: Object.entries(e.conf || {}).map(([c, no]) => { const h = idx.get(no); return h ? [h[0], h[1], +c] : null; }).filter(Boolean) }));
  const off = E.map((e, k) => e.official ? k : -1).filter(k => k >= 0);
  const used = [...new Set(E.flatMap(e => e.legs.map(l => l[0])))];
  const open = used.filter(i => decided[i] < 0);
  const rand = rng(1234567);

  const scores = E.map(() => new Float64Array(N));
  const outcome = new Map(open.map(i => [i, new Uint8Array(N)]));
  const cov = new Int8Array(games.length);
  for (let s = 0; s < N; s++) {
    for (const i of used) cov[i] = decided[i] >= 0 ? decided[i] : (rand() < pFav[i] ? 1 : 0);
    for (const i of open) outcome.get(i)[s] = cov[i];
    for (let k = 0; k < E.length; k++) { let t = 0; for (const [i, side, c] of E[k].legs) if (cov[i] === side) t += c; scores[k][s] = t; }
  }
  // Family win share per sim (official entries only; ties split).
  const winShare = E.map(() => new Float64Array(N));
  if (off.length >= 2) for (let s = 0; s < N; s++) {
    let best = -1, n = 0; for (const k of off) { const v = scores[k][s]; if (v > best) { best = v; n = 1; } else if (v === best) n++; }
    for (const k of off) if (scores[k][s] === best) winShare[k][s] = 1 / n;
  }
  const mean = a => { let t = 0; for (const v of a) t += v; return t / a.length; };
  const q = (a, p) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const beat = (a, b, mask) => { let t = 0, n = 0; for (let s = 0; s < N; s++) { if (mask && !mask(s)) continue; n++; const x = scores[a][s], y = scores[b][s]; t += x > y ? 1 : x === y ? 0.5 : 0; } return n ? t / n : null; };

  const res = { n: N, openGames: open.length, entries: E.map((e, k) => ({ key: e.key, label: e.label, official: e.official,
    mean: mean(scores[k]), p10: q(scores[k], 0.1), p50: q(scores[k], 0.5), p90: q(scores[k], 0.9), pWin: off.length >= 2 && e.official ? mean(winShare[k]) : null })), h2h: {} };
  for (let a = 0; a < E.length; a++) for (let b = 0; b < E.length; b++) if (a !== b) (res.h2h[E[a].key] ??= {})[E[b].key] = beat(a, b);

  // What-ifs: for each unfinished game someone picked, how the race moves if the favorite covers vs not.
  const pairs = off.length >= 2 ? null : E.length >= 2 ? [[0, 1]] : [];
  res.whatifs = open.map(i => {
    const g = games[i], o = outcome.get(i);
    const condMean = (arr, v) => { let t = 0, n = 0; for (let s = 0; s < N; s++) if (o[s] === v) { t += arr[s]; n++; } return n ? t / n : null; };
    const by = {}; let impact = 0, lead = null;
    if (off.length >= 2) for (const k of off) {
      const w1 = condMean(winShare[k], 1), w0 = condMean(winShare[k], 0);
      by[E[k].key] = { now: res.entries[k].pWin, ifFav: w1, ifDog: w0 };
      if (w1 != null && w0 != null && Math.abs(w1 - w0) > impact) { impact = Math.abs(w1 - w0); lead = E[k].key; }
    } else for (const [a, b] of pairs) {
      const w1 = beat(a, b, s => o[s] === 1), w0 = beat(a, b, s => o[s] === 0);
      by[E[a].key] = { now: res.h2h[E[a].key][E[b].key], ifFav: w1, ifDog: w0, vs: E[b].key };
      if (w1 != null && w0 != null) { impact = Math.abs(w1 - w0); lead = E[a].key; }
    }
    const riding = E.flatMap(e => e.legs.filter(l => l[0] === i).map(l => ({ key: e.key, side: l[1] ? 'fav' : 'dog', conf: l[2] })));
    return { favNo: g.fav_no, pFav: pFav[i], impact, lead, by, riding, mode: off.length >= 2 ? 'family' : 'h2h' };
  }).filter(w => w.impact > 0).sort((a, b) => b.impact - a.impact);
  return res;
}

// Plain-English what-if, used by the dashboard and the Commentator (numbers precomputed here).
const pc = x => `${Math.round(x * 100)}%`;
const half = x => (x % 1 ? `${Math.floor(x) || ''}½` : `${x}`);
export function describeWhatIf(w, week, label) {
  const g = week.games.find(x => x.fav_no === w.favNo); const b = w.by[w.lead]; if (!g || !b) return null;
  const who = label(w.lead), vs = b.vs ? label(b.vs) : null;
  const what = w.mode === 'family' ? `${who}'s chance to win the family this week` : `${who}'s chance to outscore ${vs}`;
  return { favNo: g.fav_no, impact: w.impact,
    text: `If ${g.fav} −${half(g.spread)} covers, ${what} goes from ${pc(b.now)} to ${pc(b.ifFav)}; if ${g.dog} +${half(g.spread)} covers, it's ${pc(b.ifDog)}.` };
}
