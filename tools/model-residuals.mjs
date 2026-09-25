// Bias-corrected power-rating disagreement per game (points toward the pool favorite), for the
// small college nudge in js/model.js. Inputs are the CSVs from the weekly research pass:
//   node tools/model-residuals.mjs <power_ratings.csv> <lines_multibook.csv>  > local-data/modelR.json
import fs from 'node:fs';
const [ratingsFile, linesFile] = process.argv.slice(2);
const split = l => { const r = []; let c = '', q = false; for (const ch of l) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { r.push(c); c = ''; continue; } c += ch; } r.push(c); return r; };
const csv = f => { const t = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/); const h = split(t[0]); return t.slice(1).map(l => Object.fromEntries(split(l).map((v, i) => [h[i], v]))); };
const MODELS = ['ESPN_FPI_matchup_predictor', 'BlueChipAnalytics_PowerLine', 'DRatings', 'DavidSasser_model', 'Massey', 'Sagarin_PREDICTOR'];
const mkt = {}; for (const r of csv(linesFile)) mkt[r.pool_fav_no] = -parseFloat(r.median_fav_spread);
const pm = {}; for (const r of csv(ratingsFile)) { if (!MODELS.includes(r.source)) continue; const v = parseFloat(r.proj_margin_fav); if (!isNaN(v)) (pm[r.pool_fav_no] ??= {})[r.source] = v; }
// Each model compresses margins differently; rescale by its slope against the market first.
const slope = {}; for (const m of MODELS) { let xy = 0, xx = 0; for (const g in pm) if (pm[g][m] != null && mkt[g] != null) { xy += pm[g][m] * mkt[g]; xx += mkt[g] ** 2; } slope[m] = xy / xx; }
const med = a => { a = [...a].sort((x, y) => x - y); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const out = {};
for (const g in pm) { if (mkt[g] == null) continue; const adj = MODELS.filter(m => pm[g][m] != null).map(m => pm[g][m] / slope[m] - mkt[g]); if (adj.length >= 3) out[g] = Math.round(med(adj) * 10) / 10; }
process.stdout.write(JSON.stringify(out));
