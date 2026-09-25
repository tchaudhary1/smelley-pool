// Cover-probability model for every game on the sheet. Pure functions (browser + Node).
//
// Method: start from the current DraftKings spread and its juice (from ESPN's scoreboard),
// remove the vig to get the market's fair cover chance at that line, and solve for the
// expected margin that implies. College games with power-rating data get a small nudge
// (20% of the bias-corrected model disagreement, as agreed in the Week 4 murder board).
// Then price the pool's printed spread against that margin distribution, which puts extra
// weight on football's key numbers (3, 7, 10, 14…). Honest scale: even the best edges are
// only a few points above 50%.

const SD = { NFL: 13.5, CFB: 15.5 };
const KEYS = {
  NFL: { 0: 0, 1: 1.1, 2: 0.9, 3: 3.2, 4: 1.3, 5: 0.9, 6: 1.6, 7: 2.3, 8: 1.1, 9: 0.8, 10: 1.6, 11: 0.9, 13: 1.0, 14: 1.5, 17: 1.4, 20: 1.1, 21: 1.2, 24: 1.1, 27: 1.1, 28: 1.1 },
  CFB: { 0: 0, 1: 0.8, 2: 0.8, 3: 2.3, 4: 1.15, 5: 0.9, 6: 1.1, 7: 1.9, 8: 1.05, 9: 0.9, 10: 1.35, 11: 1.0, 12: 0.9, 13: 0.95, 14: 1.4, 15: 0.95, 16: 0.95, 17: 1.25, 18: 1.0, 19: 0.95, 20: 1.05, 21: 1.2, 24: 1.1, 28: 1.15, 31: 1.05, 35: 1.1 },
};
export const MODEL_WEIGHT = 0.2;

const cache = new Map();
function pmf(mu, league) {
  const key = `${league}|${mu.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const sd = SD[league], W = KEYS[league];
  const out = []; let z = 0;
  for (let k = -90; k <= 90; k++) { const v = Math.exp(-0.5 * ((k - mu) / sd) ** 2) * (W[Math.abs(k)] ?? 1); out.push([k, v]); z += v; }
  for (const o of out) o[1] /= z;
  if (cache.size > 4000) cache.clear();
  cache.set(key, out); return out;
}
// P(favorite's margin beats `line`), pushes excluded. `line` is the number of points the favorite gives.
export function pCover(mu, line, league) {
  let w = 0, l = 0;
  for (const [k, v] of pmf(mu, league)) { if (k > line) w += v; else if (k < line) l += v; }
  return w / (w + l);
}
function solveMu(line, target, league) {
  let lo = line - 25, hi = line + 25;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (pCover(m, line, league) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const implied = o => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));

// market: { favLine, favOdds, dogOdds } from the favorite's point of view (favLine > 0 = points given).
export function coverProb(g, market, modelR) {
  const league = g.league === 'NFL' ? 'NFL' : 'CFB';
  let mu, source;
  if (market && Number.isFinite(market.favLine)) {
    let target = 0.5;
    if (Number.isFinite(market.favOdds) && Number.isFinite(market.dogOdds)) {
      const a = implied(market.favOdds), b = implied(market.dogOdds);
      target = Math.min(0.65, Math.max(0.35, a / (a + b)));
    }
    mu = solveMu(market.favLine, target, league); source = 'market';
  } else { mu = g.spread; source = 'pool line (no market)'; }
  if (league === 'CFB' && Number.isFinite(modelR)) { mu += MODEL_WEIGHT * modelR; source += ' + ratings'; }
  return { pFav: pCover(mu, g.spread, league), mu, source };
}

// Build the model for the whole slate. Returns { [poolNo]: { p, market, source } } for both sides,
// the same shape the dashboard already uses for per-side probabilities.
const lastPregame = new Map();
export function buildModel(week, live) {
  const out = {};
  for (const g of week.games) {
    const s = g.espn && live?.get(g.espn.id);
    const tf = s?.teams?.[g.espn.espnFav], td = s?.teams?.[g.espn.espnDog];
    // Market line from the POOL favorite's side: DK "-7" for that team means it gives 7.
    let m = tf && Number.isFinite(tf.line) ? { favLine: -tf.line, favOdds: tf.odds, dogOdds: td?.odds, openLine: Number.isFinite(tf.openLine) ? -tf.openLine : null } : null;
    // Freeze the last pre-kickoff line once a game starts (in-game lines aren't what we want).
    if (s?.state === 'pre' && m) lastPregame.set(g.espn.id, m);
    else if (s && s.state !== 'pre' && lastPregame.has(g.espn.id)) m = lastPregame.get(g.espn.id);
    const { pFav, source } = coverProb(g, m, week.modelR?.[g.fav_no]);
    const mk = m ? `${m.favLine > 0 ? '−' : '+'}${Math.abs(m.favLine)}` : null;
    out[g.fav_no] = { p: pFav, market: mk, line: m?.favLine ?? null, open: m?.openLine ?? null, favOdds: m?.favOdds ?? null, source };
    out[g.dog_no] = { p: 1 - pFav, market: m ? `${m.favLine > 0 ? '+' : '−'}${Math.abs(m.favLine)}` : null, dogOdds: m?.dogOdds ?? null, source };
  }
  return out;
}
