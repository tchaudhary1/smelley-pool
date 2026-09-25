// A compact, factual "data brief" of the pool right now: the ground truth the Commentator
// answers questions from. Every number is computed here; Claude only phrases it.
// Pure JS (browser + Node).
import { gameState, gradeEntry, fmtHalf } from './live.js';

const pc = x => (x == null ? 'n/a' : x < 0.005 ? '<1%' : x > 0.995 ? '>99%' : `${Math.round(x * 100)}%`);
const side = (g, s) => (s === 'fav' ? `${g.fav} −${fmtHalf(g.spread)}` : `${g.dog} +${fmtHalf(g.spread)}`);
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);

// P: { week, live, model, league, fam: [{key, short, pool, shadow}], sim, history? }
export function buildBrief(P) {
  const { week, live, model, league, fam, sim } = P;
  const out = [];
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit' });
  out.push(`AS OF ${now} ET — WEEK ${week.week} of the ${week.season} pool. Scoring: 10 picks against the pool's printed spreads, confidence 10 down to 1, a cover earns its confidence points, max 55.`);

  // ---- each family entry, pick by pick
  const members = fam.map(f => ({ f, picks: f.shadow ? week.shadow : week.picks?.[f.pool] }));
  const simE = k => sim?.entries.find(e => e.key === k);
  for (const { f, picks } of members) {
    if (!picks) { out.push(`\n${f.short.toUpperCase()}: picks not loaded yet${simE(f.key) ? ` (projected from season so far: about ${f1(simE(f.key).mean)} points)` : ''}.`); continue; }
    const gr = gradeEntry(picks, week, live);
    const se = simE(f.key);
    const head = `${f.shadow ? "TARUN'S SHADOW CARD (unofficial, not in the league)" : f.short.toUpperCase()}: ${gr.banked} banked, ${gr.liveNow} covering live, max possible ${gr.maxPossible}, expected ${f1(gr.expected)}`
      + (se?.pWin != null ? `, chance to win the family this week ${pc(se.pWin)}` : '')
      + (se?.league ? `, league this week about #${se.league.weekRank} (top-10 week ${pc(se.league.pTop10)})` : '')
      + (se?.league?.seasonRank ? `, projected season rank after this week about #${se.league.seasonRank}` : '') + '.';
    const lines = gr.rows.filter(r => r.g).map(r => {
      const st = r.st; const where = st.state === 'pre' ? `kicks off ${new Date(r.g.espn?.kickoff).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
        : `${r.g.fav} ${st.favScore}, ${r.g.dog} ${st.dogScore} (${st.detail})`;
      const status = r.status === 'won' ? `WON +${r.conf}` : r.status === 'lost' ? 'LOST' : r.status === 'winning' ? `covering by ${fmtHalf(r.cushion)}` : r.status === 'losing' ? `short by ${fmtHalf(-r.cushion)}` : `${pc(r.pSide)} to cover`;
      return `  ${r.conf}: ${side(r.g, r.side)} [#${r.side === 'fav' ? r.g.fav_no : r.g.dog_no}] — ${where} — ${status}`;
    });
    out.push(`\n${head}\n${lines.join('\n')}`);
  }

  // ---- head to head this week
  if (sim?.h2h) {
    const pairs = [];
    const keys = Object.keys(sim.h2h);
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j]; const p = sim.h2h[a]?.[b]; if (p == null) continue;
      pairs.push(`${label(fam, a)} beats ${label(fam, b)} ${pc(p)}`);
    }
    if (pairs.length) out.push(`\nHEAD TO HEAD THIS WEEK (chance to outscore): ${pairs.join('; ')}.`);
  }

  // ---- live and upcoming games with family money on them
  const gl = [];
  for (const g of week.games) {
    const on = members.filter(m => m.picks).flatMap(m => Object.entries(m.picks.conf).filter(([, no]) => no === g.fav_no || no === g.dog_no).map(([c, no]) => `${m.f.shadow ? 'shadow' : m.f.short} ${c} on ${no === g.fav_no ? g.fav : g.dog}`));
    if (!on.length) continue;
    const st = gameState(g, live, model);
    if (st.state === 'post') continue;
    gl.push(`  #${g.fav_no}/${g.dog_no} ${g.fav} −${fmtHalf(g.spread)} vs ${g.dog} +${fmtHalf(g.spread)} (${g.league}): ${st.state === 'in' ? `LIVE ${st.favScore}-${st.dogScore} ${st.detail}` : 'not started'}; ${g.fav} cover chance ${pc(st.pFav)}; family: ${on.join(', ')}.`);
  }
  if (gl.length) out.push(`\nUNFINISHED GAMES WITH FAMILY PICKS:\n${gl.join('\n')}`);

  // ---- single-game what-ifs (precomputed)
  const wi = (sim?.whatifs || []).slice(0, 12).map(w => {
    const g = week.games.find(x => x.fav_no === w.favNo);
    const parts = Object.entries(w.by).map(([k, b]) => `${label(fam, k)}${b.vs ? ` vs ${label(fam, b.vs)}` : ''} ${pc(b.now)} now → ${pc(b.ifFav)} if ${g.fav} covers / ${pc(b.ifDog)} if ${g.dog} covers`);
    return `  ${g.fav} −${fmtHalf(g.spread)} vs ${g.dog}: ${parts.join('; ')}`;
  });
  if (wi.length) out.push(`\nWHAT-IFS (${sim.whatifs[0]?.mode === 'family' ? 'chance to win the family this week' : 'head to head'}), biggest swings first:\n${wi.join('\n')}`);
  const lw = (sim?.leagueWhatifs || []).slice(0, 6).map(w => {
    const g = week.games.find(x => x.fav_no === w.favNo); const b = Object.values(w.by)[0];
    return `  ${g.fav} −${fmtHalf(g.spread)} vs ${g.dog}: ${w.mode === 'top10' ? `${label(fam, w.lead)} top-10 league week` : 'family beats league average'} ${pc(b.now)} → ${pc(b.ifFav)} if ${g.fav} covers / ${pc(b.ifDog)} if ${g.dog} covers`;
  });
  if (lw.length) out.push(`LEAGUE WHAT-IFS:\n${lw.join('\n')}`);

  // ---- season standings and the family vs the league
  const T = league?.members || [];
  if (T.length) {
    const tot = m => m.weeks.reduce((s, v) => s + (v || 0), 0);
    const sorted = [...T].sort((a, b) => tot(b) - tot(a));
    const rank = m => 1 + T.filter(o => tot(o) > tot(m)).length;
    const weeks = Math.max(0, ...T.map(m => m.weeks.reduce((w, v, i) => v != null ? i + 1 : w, 0)));
    const famNames = new Set(fam.map(f => f.pool).filter(Boolean));
    const famM = T.filter(m => famNames.has(m.name)), rest = T.filter(m => !famNames.has(m.name));
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    out.push(`\nSEASON STANDINGS (official, through week ${weeks}; ${T.length} entries; leader has ${tot(sorted[0])}):`);
    for (const m of famM.sort((a, b) => tot(b) - tot(a))) {
      const f = fam.find(x => x.pool === m.name);
      out.push(`  ${f.short}: ${tot(m)} points, rank ${rank(m)}${T.filter(o => tot(o) === tot(m)).length > 1 ? ' (tied)' : ''}, ${tot(sorted[0]) - tot(m)} behind the leader; weekly ${m.weeks.slice(0, weeks).join(', ')}.`);
    }
    const byWeek = Array.from({ length: weeks }, (_, w) => { const fa = avg(famM.map(m => m.weeks[w]).filter(v => v != null)), la = avg(rest.map(m => m.weeks[w]).filter(v => v != null)); return `W${w + 1} family ${f1(fa)} vs league ${f1(la)}`; });
    const bb = Array.from({ length: weeks }, (_, w) => Math.max(...famM.map(m => m.weeks[w] ?? 0))).reduce((a, b) => a + b, 0);
    out.push(`FAMILY VS LEAGUE (official): ${byWeek.join('; ')}. Family average season total ${f1(avg(famM.map(tot)))} vs everyone else ${f1(avg(rest.map(tot)))}. "Team Smelley" best-ball total ${bb} would rank ${1 + T.filter(o => tot(o) > bb).length} in the league.`);
    const shadow = league.shadowScores || {};
    if (Object.keys(shadow).length) out.push(`Shadow card past weeks (unofficial): ${Object.entries(shadow).map(([w, s]) => `W${w} ${s}`).join(', ')}.`);
  }
  if (sim?.familyVsLeague) { const v = sim.familyVsLeague; out.push(`THIS WEEK, FAMILY VS LEAGUE (simulated): family average about ${f1(v.famAvg)} vs rest ${f1(v.lgAvg)}; family beats league average ${pc(v.pFamAhead)}; someone in the family has a top-10 week ${pc(v.pFamTop10)}.`); }

  // ---- past seasons (when provided)
  if (P.history?.summary) out.push(`\nPAST SEASONS:\n${P.history.summary}`);
  return out.join('\n');
}
function label(fam, k) { return k === 'tarun' ? "Tarun's shadow card" : fam.find(f => f.key === k)?.short || k; }
