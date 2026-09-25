// Live scores from ESPN's public scoreboard feed, and pick grading against the fixed pool spread.

const SPORT_PATH = { nfl: 'nfl', 'college-football': 'college-football' };

function yyyymmdd(iso) {
  // ESPN buckets events by US Eastern date.
  const d = new Date(iso);
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${et.getFullYear()}${String(et.getMonth() + 1).padStart(2, '0')}${String(et.getDate()).padStart(2, '0')}`;
}

// Returns Map(espnId -> status) for every game on the week's slate.
export async function fetchLive(week) {
  const wanted = new Map();
  for (const g of week.games) if (g.espn) {
    const k = `${g.espn.sport}|${yyyymmdd(g.espn.kickoff)}`;
    if (!wanted.has(k)) wanted.set(k, []);
    wanted.get(k).push(g.espn.id);
  }
  const out = new Map();
  await Promise.all([...wanted.keys()].map(async k => {
    const [sport, date] = k.split('|');
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/${SPORT_PATH[sport]}/scoreboard?dates=${date}&limit=400${sport === 'college-football' ? '&groups=80' : ''}`;
    try {
      const j = await (await fetch(url)).json();
      for (const e of j.events || []) {
        const c = e.competitions[0];
        const st = c.status;
        const teams = {};
        for (const t of c.competitors) teams[t.team.abbreviation] = { score: Number(t.score || 0), home: t.homeAway === 'home' };
        out.set(e.id, {
          state: st.type.state,                  // pre | in | post
          completed: st.type.completed,
          detail: st.type.shortDetail,           // "Q3 4:12", "Final", "Sat 7:30 PM"
          period: st.period, clock: st.displayClock, clockSec: st.clock,
          teams,
          situation: c.situation ? { poss: c.situation.possession, down: c.situation.shortDownDistanceText, redzone: c.situation.isRedZone, last: c.situation.lastPlay?.text } : null,
          odds: (c.odds || [])[0]?.details || null,
          broadcast: (c.broadcasts || [])[0]?.names?.[0] || null,
        });
      }
    } catch (err) { console.warn('ESPN fetch failed', url, err); }
  }));
  return out;
}

// Standard normal CDF.
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Everything about one game relative to the pool line, from the favorite's perspective.
export function gameState(g, live, research) {
  const s = g.espn && live?.get(g.espn.id);
  const base = { state: 'pre', detail: '', favScore: null, dogScore: null, margin: null };
  if (!s) return { ...base, pFav: preP(g, research) };
  const fav = s.teams[g.espn.espnFav], dog = s.teams[g.espn.espnDog];
  const favScore = fav?.score ?? 0, dogScore = dog?.score ?? 0;
  const margin = favScore - dogScore;
  const out = { ...s, state: s.state, favScore, dogScore, margin };
  if (s.state === 'pre') return { ...out, favScore: null, dogScore: null, margin: null, pFav: preP(g, research) };
  if (s.state === 'post') return { ...out, pFav: margin > g.spread ? 1 : 0, favCovers: margin > g.spread };
  // In progress: remaining-time scaled normal around the current margin.
  const quarters = 4, qLen = g.league === 'NFL' ? 900 : 900;
  const elapsed = Math.min(quarters * qLen, (Math.max(1, s.period) - 1) * qLen + (qLen - (s.clockSec ?? qLen)));
  const frac = s.period > 4 ? 0.05 : Math.max(0.02, 1 - elapsed / (quarters * qLen));
  const sd = (g.league === 'NFL' ? 13.5 : 15.5) * Math.sqrt(frac);
  const pre = preP(g, research);
  const drift = (pre - 0.5) * 6 * frac;     // small pregame lean that fades as the game runs
  const pFav = phi((margin + drift - g.spread) / sd);
  return { ...out, pFav, favCovers: margin > g.spread };
}
function preP(g, research) {
  const r = research?.[g.fav_no];
  return r ? r.p : 0.5;
}

// Grade one entry's picks. picks = { conf: { "10": poolNo, ... } }
export function gradeEntry(picks, week, live) {
  const byNo = indexGames(week);
  let banked = 0, lost = 0, expected = 0, maxLeft = 0, liveNow = 0;
  const rows = [];
  for (const [c, no] of Object.entries(picks?.conf || {})) {
    const conf = Number(c), hit = byNo.get(no);
    if (!hit) { rows.push({ conf, no, missing: true }); continue; }
    const { g, side } = hit;
    const st = gameState(g, live, week.research);
    const pSide = side === 'fav' ? st.pFav : 1 - st.pFav;
    let status = 'pending';
    if (st.state === 'post') status = pSide === 1 ? 'won' : 'lost';
    else if (st.state === 'in') status = pSide >= 0.5 ? 'winning' : 'losing';
    if (status === 'won') banked += conf;
    if (status === 'lost') lost += conf;
    if (st.state !== 'post') maxLeft += conf;
    if (status === 'winning') liveNow += conf;
    expected += conf * pSide;
    const cushion = st.margin == null ? null : (side === 'fav' ? st.margin - g.spread : g.spread - st.margin);
    rows.push({ conf, no, g, side, st, pSide, status, cushion });
  }
  rows.sort((a, b) => b.conf - a.conf);
  return { banked, lost, expected, maxPossible: banked + maxLeft, liveNow, rows };
}

export function indexGames(week) {
  const m = new Map();
  for (const g of week.games) { m.set(g.fav_no, { g, side: 'fav' }); m.set(g.dog_no, { g, side: 'dog' }); }
  return m;
}

export const sideName = (g, side) => side === 'fav' ? g.fav : g.dog;
export const sideSpread = (g, side) => side === 'fav' ? `−${fmtHalf(g.spread)}` : `+${fmtHalf(g.spread)}`;
export function fmtHalf(x) { const w = Math.floor(x); return x % 1 ? `${w || ''}½` : `${w}`; }
