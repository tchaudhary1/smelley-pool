// Game news from ESPN's public feeds (browser + Node): each team's recent headlines, NFL injury
// reports, and how far the market line has moved since the commissioner's sheet.
// Headlines are shown as titles with a link to ESPN, never reproduced articles.
import { fmtHalf } from './live.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';
const TTL = 15 * 60e3;                         // cache per game for 15 minutes
const cache = new Map();
const KEEP_TYPES = new Set(['Story', 'HeadlineNews', 'Preview', 'Recap', 'Media']);
const DAYS = 8;                                // headlines from the last 8 days
const KEY_STATUS = /^(out|doubtful|questionable)$/i;

// ESPN team id from what build-week stored (logo URL ".../500/2335.png"), or an explicit id.
export function teamId(g, side) {
  const e = g.espn || {}; const id = side === 'fav' ? e.favId : e.dogId; if (id) return String(id);
  const m = String(side === 'fav' ? e.favLogo : e.dogLogo || '').match(/\/(\d+)\.png/); return m ? m[1] : null;
}
const sportOf = g => (g.espn?.sport === 'nfl' || g.league === 'NFL' ? 'nfl' : 'college-football');
const getJSON = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

// Market line vs the pool's printed spread, from fetchLive() data. moved > 0: the market now makes
// the pool favorite a bigger favorite than the sheet did (their pool line looks cheap).
export function lineMove(g, live) {
  const st = live?.get?.(g.espn?.id); const t = st?.teams?.[g.espn?.espnFav];
  if (!t || !Number.isFinite(t.line)) return null;
  const market = -t.line;                      // favorite's line as a positive number (negative = now the underdog)
  return { pool: g.spread, market, moved: Math.round((market - g.spread) * 2) / 2 };
}
export function lineMoveText(g, mv) {
  if (!mv || Math.abs(mv.moved) < 1) return null;
  const toward = mv.moved > 0 ? g.fav : g.dog;
  const mk = mv.market > 0 ? `${g.fav} −${fmtHalf(mv.market)}` : mv.market < 0 ? `${g.dog} −${fmtHalf(-mv.market)}` : "pick'em";
  return `Line has moved ${fmtHalf(Math.abs(mv.moved))} toward ${toward} since the sheet (pool ${g.fav} −${fmtHalf(mv.pool)}, market now ${mk}).`;
}

export async function fetchGameNews(g, live, { now = Date.now() } = {}) {
  const key = `${g.espn?.id}`; const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return { ...hit.data, line: lineMove(g, live) };
  const sport = sportOf(g); const ids = { fav: teamId(g, 'fav'), dog: teamId(g, 'dog') };
  const since = now - DAYS * 864e5;
  const articles = []; const seen = new Set();
  await Promise.all(['fav', 'dog'].map(async side => {
    if (!ids[side]) return;
    try {
      const j = await getJSON(`${BASE}/${sport}/news?team=${ids[side]}&limit=12`);
      for (const a of j.articles || []) {
        const t = Date.parse(a.published || a.lastModified || 0);
        if (!a.headline || seen.has(a.headline) || !KEEP_TYPES.has(a.type) || !(t >= since)) continue;
        // Skip league-wide roundups (rankings, bubble watch) that tag dozens of teams; game stories tag 2-4.
        if ((a.categories || []).filter(c => c.type === 'team').length > 8) continue;
        seen.add(a.headline);
        articles.push({ headline: a.headline, type: a.type, published: a.published, url: a.links?.web?.href || null, side, video: a.type === 'Media' });
      }
    } catch { /* one team's feed failing shouldn't hide the other */ }
  }));
  // Written stories first, then newest.
  articles.sort((a, b) => (a.video - b.video) || Date.parse(b.published) - Date.parse(a.published));
  let injuries = [];
  if (sport === 'nfl' && g.espn?.id) {   // college summaries don't carry injury reports
    try {
      const j = await getJSON(`${BASE}/nfl/summary?event=${g.espn.id}`);
      const sideOf = abbr => abbr === g.espn.espnFav ? 'fav' : abbr === g.espn.espnDog ? 'dog' : null;
      for (const t of j.injuries || []) for (const i of t.injuries || []) {
        if (!KEY_STATUS.test(i.status || '') || /coach/i.test(i.details?.type || '')) continue;   // "Coach's Decision" = healthy inactive
        injuries.push({ side: sideOf(t.team?.abbreviation), team: t.team?.abbreviation, name: i.athlete?.displayName, pos: i.athlete?.position?.abbreviation || '', status: i.status, detail: i.details?.type || '' });
      }
      const rank = i => (/^out$/i.test(i.status) ? 0 : /doubtful/i.test(i.status) ? 1 : 2) * 10 + (i.pos === 'QB' ? 0 : 1);
      injuries.sort((a, b) => rank(a) - rank(b));
    } catch { injuries = []; }
  }
  const data = { articles: articles.slice(0, 8), injuries, fetched: now };
  cache.set(key, { at: now, data });
  return { ...data, line: lineMove(g, live) };
}

// Short plain-text digest for the Commentator's brief (titles, statuses and the line; no articles).
export function newsFacts(g, n, { headlines = 2, injuries = 4 } = {}) {
  const out = [];
  const mv = lineMoveText(g, n.line); if (mv) out.push(mv);
  const inj = n.injuries.slice(0, injuries).map(i => `${i.team} ${i.pos} ${i.name} ${i.status.toLowerCase()}${i.detail ? ` (${i.detail})` : ''}`);
  if (inj.length) out.push(`Injury report: ${inj.join('; ')}.`);
  const hs = n.articles.filter(a => !a.video).slice(0, headlines).map(a => `"${a.headline}" (ESPN, ${new Date(a.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })})`);
  if (hs.length) out.push(`Headlines: ${hs.join('; ')}.`);
  return out;
}
