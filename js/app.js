import { FAMILY, BOT, CURRENT_WEEK, MOTTO, MOTTO_EN, REACTIONS, HISTORY_SEASONS } from './config.js';
import * as db from './data.js';
import { checkFile, parsePickRows, diffPicks, parseTotalsRows, diffTotals } from './upload.js';
import { HELP } from './help.js';
import { leagueStorylines } from './storylines.js';
import { fetchGameNews, lineMove, lineMoveText } from './news.js';
import { buildContext, scoutingReport, leagueLessons, lessonVerdicts } from './profile.js';
import { samePerson } from './names.js';
import { fetchLive, gameState, gradeEntry, indexGames, sideName, sideSpread, fmtHalf } from './live.js';
import { buildModel } from './model.js';
import { simulateWeek, describeWhatIf, fieldModel } from './sim.js';
import { $, $$, esc, pct, fmt1, fam, famByPool, avatar, etTime, etDay, ago, until, ranks, mean, median, quantile,
  openModal, closeModal, modalHead, lineChart, stripPlot, histogram } from './ui.js';

const S = { user: null, league: null, week: null, live: new Map(), msgs: [], reacts: [], tab: 'gameday',
  slateFilter: 'family', famOnly: true, search: '', lastLive: null, timer: null };

// ============================================================ boot
init();
async function init() {
  if (db.LOCAL && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    $('#login').classList.remove('hidden'); $('#loginForm').innerHTML = `<p>The dashboard isn't connected to its database yet. Check back soon.</p>`; return;
  }
  if (db.LOCAL) { $('#previewBanner').classList.remove('hidden'); $('#lname').type = 'text'; $('#lname').placeholder = 'jamie'; }
  $('#loginForm').addEventListener('submit', onLogin);
  $('#magicBtn').onclick = () => emailAction(db.sendSignInLink, 'Check your email for a sign-in link. It opens this page already signed in.');
  $('#forgotBtn').onclick = () => emailAction(db.sendPasswordReset, 'Check your email for a link to choose a new password.');
  $('#pwForm').addEventListener('submit', onSetPassword);
  $('#pwSkip').onclick = () => { $('#pwForm').classList.add('hidden'); S.user ? start() : showLogin(); };
  let recovering = false;
  db.onAuthEvent(ev => { if (ev === 'recovery') { recovering = true; showPasswordForm(); } });
  try { S.user = await db.currentUser(); } catch (err) { S.user = null; $('#loginErr').textContent = err.message; }
  if (recovering) return;
  S.user ? start() : showLogin();
}
function showLogin() { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#loginForm').classList.remove('hidden'); $('#lname').focus(); }
function showPasswordForm() {
  $('#login').classList.remove('hidden'); $('#app').classList.add('hidden');
  $('#loginForm').classList.add('hidden'); $('#pwForm').classList.remove('hidden'); $('#newpw').focus();
}
async function onLogin(e) {
  e.preventDefault(); $('#loginErr').textContent = ''; $('#loginOk').classList.add('hidden');
  if (!$('#lpass').value && !db.LOCAL) { $('#loginErr').textContent = 'Enter your password, or tap "Email me a sign-in link".'; return; }
  try { S.user = await db.signIn($('#lname').value, $('#lpass').value); $('#lpass').value = ''; start(); }
  catch (err) { $('#loginErr').textContent = err.message; }
}
async function emailAction(fn, okMsg) {
  $('#loginErr').textContent = ''; $('#loginOk').classList.add('hidden');
  const email = $('#lname').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { $('#loginErr').textContent = 'Type your email address first.'; $('#lname').focus(); return; }
  try { await fn(email); $('#loginOk').textContent = okMsg; $('#loginOk').classList.remove('hidden'); }
  catch (err) { $('#loginErr').textContent = err.message; }
}
async function onSetPassword(e) {
  e.preventDefault(); $('#pwErr').textContent = '';
  const pw = $('#newpw').value;
  if (pw.length < 8) { $('#pwErr').textContent = 'Use at least 8 characters.'; return; }
  try { await db.setPassword(pw); $('#newpw').value = ''; $('#pwForm').classList.add('hidden');
    S.user = S.user || await db.currentUser(); S.user ? start() : showLogin(); }
  catch (err) { $('#pwErr').textContent = err.message; }
}
// ---------- light / dark ----------
// Follows the device until someone taps the header button; the choice is kept in this browser.
const themeNow = () => document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function setTheme(t) {   // 'light' | 'dark' | null (match the device)
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { t ? localStorage.setItem('sp.theme', t) : localStorage.removeItem('sp.theme'); } catch { /* private mode: just this visit */ }
  drawThemeBtn(); if (S.started) render();
}
function drawThemeBtn() {
  const b = $('#themeBtn'); if (!b) return; const dark = themeNow() === 'dark';
  b.textContent = dark ? '☀️' : '🌙'; b.title = dark ? 'Switch to light mode' : 'Switch to dark mode'; b.setAttribute('aria-label', b.title);
}

// ---------- "a new version is ready" ----------
// The dashboard stays open for hours, so after a deploy it can keep running old code. Every 5
// minutes, compare the server's app.js with the copy this page loaded; if it changed, offer a reload.
async function watchVersion() {
  if (db.LOCAL) return;
  const stamp = r => r.headers.get('etag') || r.headers.get('last-modified');
  let base; try { base = stamp(await fetch('js/app.js', { cache: 'force-cache' })); } catch { return; }
  if (!base) return;
  setInterval(async () => {
    if (document.hidden || $('.update-bar')) return;
    let now; try { now = stamp(await fetch('js/app.js', { method: 'HEAD', cache: 'no-store' })); } catch { return; }
    if (!now || now === base) return;
    const bar = document.createElement('div'); bar.className = 'update-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = 'A new version of the dashboard is ready. <button type="button">Reload</button>';
    bar.querySelector('button').onclick = async () => {   // refresh cached scripts and styles, then reload
      const own = performance.getEntriesByType('resource').map(e => e.name).filter(u => u.startsWith(location.origin) && /\.(js|css)(\?|$)/.test(u));
      await Promise.all(own.map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
      location.reload();
    };
    document.body.appendChild(bar);
  }, 5 * 60e3);
}

function accountMenu() {
  const old = $('.menu'); if (old) { old.remove(); return; }
  const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = `<div class="who">${esc(S.user.email || fam(S.user.key)?.short || '')}</div>
    <button data-a="theme">${themeNow() === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}</button>
    ${document.documentElement.dataset.theme ? '<button data-a="theme-auto">Match my device\'s light/dark</button>' : ''}
    ${db.LOCAL ? '' : '<button data-a="pw">Set or change password</button>'}<button data-a="out">Sign out</button>`;
  document.body.appendChild(m);
  m.onclick = async ev => { const a = ev.target.dataset.a; if (!a) return; m.remove();
    if (a === 'out') { await db.signOut(); location.hash = ''; location.reload(); }
    if (a === 'pw') showPasswordForm();
    if (a === 'theme') setTheme(themeNow() === 'dark' ? 'light' : 'dark');
    if (a === 'theme-auto') setTheme(null); };
  setTimeout(() => document.addEventListener('click', function off(ev) { if (!m.contains(ev.target) && ev.target.closest('#meChip') == null) { m.remove(); document.removeEventListener('click', off); } }), 0);
}
async function start() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  if (S.started) return;   // e.g. returning from "change password"
  S.started = true;
  const me = fam(S.user.key);
  $('#meChip').innerHTML = `${avatar(me)} ${esc(me?.short)} <span class="so" style="opacity:.6">▾</span>`;
  $('#meChip').title = 'Account';
  $('#meChip').onclick = accountMenu;
  drawThemeBtn(); $('#themeBtn').onclick = () => setTheme(themeNow() === 'dark' ? 'light' : 'dark');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { drawThemeBtn(); if (!document.documentElement.dataset.theme) render(); });
  watchVersion();
  if (S.user.admin) $('#adminTab').classList.remove('hidden');
  $$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
  // Show ‹ › on the tab bar whenever more tabs are hidden off that side.
  const nav = $('#tabs'), wrap = $('#tabsWrap');
  const edges = () => { const max = nav.scrollWidth - nav.clientWidth;
    wrap.classList.toggle('can-l', nav.scrollLeft > 4); wrap.classList.toggle('can-r', nav.scrollLeft < max - 4); };
  nav.addEventListener('scroll', edges, { passive: true }); window.addEventListener('resize', edges);
  $('#tabL').onclick = () => nav.scrollBy({ left: -nav.clientWidth * 0.7, behavior: 'smooth' });
  $('#tabR').onclick = () => nav.scrollBy({ left: nav.clientWidth * 0.7, behavior: 'smooth' });
  S.tabEdges = edges; setTimeout(edges, 50);
  $('#mottoBtn').onclick = openMotto; $('#crestBtn').onclick = openMotto;
  $('#main').innerHTML = `<div class="empty">Loading the pool…</div>`;
  try {
    const roster = await db.loadRoster().catch(() => ({}));
    for (const f of FAMILY) if (roster[f.key]) f.pool = roster[f.key];
    const settings = await db.loadDataset('settings').catch(() => null);
    S.settings = settings || { currentWeek: CURRENT_WEEK };
    const wk = settings?.currentWeek ?? CURRENT_WEEK;
    [S.league, S.week] = await Promise.all([db.loadDataset('league'), db.loadDataset(`week${wk}`)]);
  } catch (err) { $('#main').innerHTML = `<div class="empty">Couldn't load pool data: ${esc(err.message)}</div>`; return; }
  if (!S.week) { $('#main').innerHTML = `<div class="empty">No data for this week yet.</div>`; return; }
  await Promise.all([refreshLive(), refreshSocial()]);
  db.subscribe(() => refreshSocial().then(() => { botReplied(); if (S.tab === 'talk') render(); }),
    ({ on }) => { if (on) botWait('typing'); else if (S.botWait?.phase === 'typing') botWait(null); });
  const hash = location.hash.slice(1); if (['gameday', 'standings', 'h2h', 'lab', 'talk', 'history', 'admin', 'help'].includes(hash)) S.tab = hash;
  // Deep links: ?season=2024|all opens History on that season, ?profile=<name> opens a scouting report.
  const q = new URLSearchParams(location.search);
  if (q.get('season')) { S.histYr = q.get('season'); if (!hash) S.tab = 'history'; }
  render(); schedule();
  if (q.get('profile')) openProfile(q.get('profile'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive().then(render); });
}
function go(tab) { S.tab = tab; history.replaceState(null, '', '#' + tab); render(); window.scrollTo({ top: 0 }); }

// Model + simulation are recomputed whenever scores/lines refresh or new picks arrive.
function simEntries() {
  // Every family member (projected from their history if their picks aren't in), the shadow card,
  // and any other league entries whose picks have been uploaded.
  const famNames = new Set(FAMILY.map(f => f.pool).filter(Boolean));
  const fam = entries().map(e => ({ key: e.f.key, label: e.f.shadow ? "Tarun's shadow card" : e.f.short, group: e.f.shadow ? 'shadow' : 'family', name: e.f.pool, conf: e.picks?.conf }))
    .filter(e => e.conf || e.group === 'family');
  const lg = Object.entries(S.week.picks || {}).filter(([n]) => !famNames.has(n)).map(([name, p]) => ({ key: 'lg:' + name, label: name, group: 'league', name, conf: p.conf }));
  return [...fam, ...lg];
}
function recompute() {
  S.week.research = buildModel(S.week, S.live);
  const ents = simEntries();
  S.field = S.league ? fieldModel(S.league, S.week.week) : null;
  S.sim = ents.some(e => e.conf) ? simulateWeek(S.week, S.live, S.week.research, ents, 5000, S.field) : null;
}
function raceLine(f) {
  const se = S.sim?.entries.find(x => x.key === f.key); if (!se || !se.picked) return '';
  const lg = se.league ? `<div class="meta race"><span>🏟️ League: about #${se.league.weekRank} this week · top-10 ${pct(se.league.pTop10)}</span></div>` : '';
  if (se.pWin != null) return `<div class="meta race"><span>🏆 Win week <b>${pct(se.pWin)}</b></span></div>${lg}`;
  const vsShadow = !f.shadow && S.sim.h2h?.[f.key]?.tarun;
  return (vsShadow != null && !f.shadow ? `<div class="meta race"><span>⚔️ Beats shadow <b>${pct(vsShadow)}</b></span></div>` : '') + lg;
}
const simLabel = key => key === 'tarun' ? "Tarun's shadow card" : key === 'family' ? 'The family' : (fam(key)?.short || key.replace(/^lg:/, ''));
// Demo mode: overlay a staged game state (demo-data/live.json) on top of the real ESPN feed.
async function applyDemoLive() {
  const staged = await db.loadDataset('live'); if (!staged) return;
  for (const [id, st] of Object.entries(staged)) {
    const cur = S.live.get(id) || { teams: {} };
    const g = S.week.games.find(x => x.espn?.id === id); if (!g) continue;
    const teams = { ...cur.teams };
    teams[g.espn.espnFav] = { ...(teams[g.espn.espnFav] || {}), score: st.fav };
    teams[g.espn.espnDog] = { ...(teams[g.espn.espnDog] || {}), score: st.dog };
    S.live.set(id, { ...cur, state: st.state, completed: st.state === 'post', detail: st.detail, period: st.period ?? 4, clock: st.clock, clockSec: st.clockSec ?? 0, teams, situation: st.last ? { last: st.last } : null });
  }
}
async function refreshLive() {
  S.live = await fetchLive(S.week); S.lastLive = new Date();
  if (db.DEMO) await applyDemoLive();
  recompute();
  const n = [...S.live.values()].filter(s => s.state === 'in').length;
  $('#liveDot').classList.toggle('on', n > 0);
  $('#liveTxt').textContent = n ? `${n} live` : `updated ${S.lastLive.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
async function refreshSocial() {
  [S.msgs, S.reacts] = await Promise.all([db.listMessages(), db.listReactions()]).catch(() => [[], []]);
}
function schedule() {
  clearTimeout(S.timer);
  const anyLive = [...S.live.values()].some(s => s.state === 'in');
  const soon = S.week.games.some(g => g.espn && Math.abs(new Date(g.espn.kickoff) - Date.now()) < 20 * 60e3);
  S.timer = setTimeout(async () => { await refreshLive(); if ($('.modal')) refreshOpenModal(); else if (S.tab !== 'talk' && S.tab !== 'admin') render(); schedule(); }, anyLive || soon ? 45e3 : 5 * 60e3);
}
let modalRefresher = null;
function refreshOpenModal() { modalRefresher?.(); }

// ============================================================ model
const GB = () => indexGames(S.week);
function entries() {
  // Family entries with picks this week, plus the shadow card.
  return FAMILY.map(f => {
    const picks = f.shadow ? S.week.shadow : (f.pool ? S.week.picks?.[f.pool] : null);
    return { f, picks, grade: picks ? gradeEntry(picks, S.week, S.live) : null };
  });
}
function allEntriesForGame(g) {
  const out = { fav: [], dog: [] };
  for (const e of entries()) if (e.picks) for (const [c, no] of Object.entries(e.picks.conf)) {
    if (no === g.fav_no) out.fav.push({ e, conf: +c }); if (no === g.dog_no) out.dog.push({ e, conf: +c });
  }
  for (const k of ['fav', 'dog']) out[k].sort((a, b) => b.conf - a.conf);
  return out;
}
function leagueTable() {
  const L = S.league; if (!L) return { rows: [], weeks: 0 };
  const weeks = Math.max(0, ...L.members.map(m => m.weeks.reduce((w, v, i) => v != null ? i + 1 : w, 0)));
  const curW = S.week.week;
  const rows = L.members.map(m => {
    const f = famByPool(m.name);
    const official = m.weeks.slice(0, weeks);
    const cur = m.weeks[curW - 1];
    const picks = S.week.picks?.[m.name];
    const liveCur = cur == null && picks ? gradeEntry(picks, S.week, S.live).banked : null;
    const total = official.reduce((a, v) => a + (v || 0), 0);
    return { name: m.name, f, weeks: official, cur: cur ?? liveCur, curLive: cur == null && liveCur != null, total, withCur: total + (cur == null ? (liveCur || 0) : 0) };
  });
  const rk = ranks(rows.map(r => r.total)); rows.forEach((r, i) => r.rank = rk[i]);
  const wr = []; for (let w = 0; w < weeks; w++) { const rr = ranks(rows.map(r => r.weeks[w])); rows.forEach((r, i) => (r.wrank ??= [])[w] = rr[i]); wr.push(rr); }
  rows.forEach(r => r.rankLabel = (rows.filter(o => o.total === r.total).length > 1 ? 'T-' : '#') + r.rank);
  rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return { rows, weeks, n: rows.length, leader: rows[0]?.total ?? 0 };
}
function shadowRow() {
  const f = FAMILY.find(x => x.shadow); const sc = S.league?.shadowScores || {};
  const g = S.week.shadow ? gradeEntry(S.week.shadow, S.week, S.live) : null;
  const weeks = []; for (let w = 1; w <= (leagueTable().weeks || 0); w++) weeks.push(sc[w] ?? null);
  return { f, weeks, cur: g ? g.banked : null, total: weeks.reduce((a, v) => a + (v || 0), 0), since: Object.keys(sc).length ? Math.min(...Object.keys(sc).map(Number)) : S.week.week };
}
const pctile = (rank, n) => Math.round(100 * (n - rank) / Math.max(1, n - 1));

// ============================================================ render
function render() {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  document.body.classList.toggle('talk-mode', S.tab === 'talk');
  const activeTab = $('#tabs button.on');
  if (activeTab) { const nav = $('#tabs'); nav.scrollTo({ left: activeTab.offsetLeft - (nav.clientWidth - activeTab.offsetWidth) / 2, behavior: 'smooth' }); }
  setTimeout(() => S.tabEdges?.(), 400);
  const views = { gameday: viewGameDay, standings: viewStandings, h2h: viewH2H, lab: viewLab, talk: viewTalk, history: viewHistory, admin: viewAdmin, help: viewHelp };
  (views[S.tab] || viewGameDay)();
}
function title(t, sub = '') { return `<div class="section-title"><h2>${t}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`; }

// ------------------------------------------------------------ GAME DAY
function viewGameDay() {
  const T = leagueTable();
  const cards = entries().map(({ f, picks, grade }) => {
    const row = T.rows.find(r => r.f === f);
    const pips = grade ? grade.rows.map(r => `<span class="pip ${r.status}" title="${r.conf}: ${esc(r.g ? sideName(r.g, r.side) : '#' + r.no)}">${r.conf}</span>`).join('') : '';
    const season = f.shadow ? `<span class="shadow-tag">shadow · unofficial</span>` : row ? `Season ${row.rankLabel} of ${T.n} · ${row.total} pts` : '';
    return `<div class="panel fcard clickable" tabindex="0" style="--c:${f.color}" data-member="${f.key}">
      <div class="who">${avatar(f)}<div>${esc(f.short)}<br><small>${f.shadow ? 'Watson–Tarun' : esc(f.pool)}</small></div></div>
      ${grade ? `<div class="big">${grade.banked}<span> pts banked</span></div>
        <div class="meta"><span>Live +${grade.liveNow}</span><span>Max ${grade.maxPossible}</span><span>Exp ${fmt1(grade.expected)}</span></div>${raceLine(f)}
        <div class="pips">${pips}</div>` : `<div class="none">Picks not in yet</div>`}
      <div class="rankline">${season}</div></div>`;
  }).join('');
  $('#main').innerHTML = `${title(`Week ${S.week.week} family scoreboard`, 'Tap anyone for their card')}
    <div class="grid fam">${cards}</div>
    ${title('Lead Watch', `${esc(MOTTO_EN)}. Live games where a family pick is on the line`)}
    <div class="leadwatch" id="lw">${leadWatch()}</div>
    ${title('The slate', `${S.week.games.length} games, graded against the pool's printed spreads`)}
    <div class="filters" id="slateFilters">${[['family', 'Family picks'], ['all', 'All games'], ['live', 'Live'], ['nfl', 'NFL'], ['cfb', 'College'], ['final', 'Final']]
      .map(([k, l]) => `<button class="chip ${S.slateFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div id="slate">${slate()}</div>`;
  $$('[data-member]').forEach(el => { el.onclick = () => openMember(el.dataset.member); el.onkeydown = e => e.key === 'Enter' && el.click(); });
  $$('#slateFilters button').forEach(b => b.onclick = () => { S.slateFilter = b.dataset.f; viewGameDay(); });
  bindGames();
}
function bindGames() { $$('[data-game]').forEach(el => { el.onclick = () => openGame(+el.dataset.game); el.onkeydown = e => e.key === 'Enter' && el.click(); }); }

function leadWatch() {
  const items = [];
  for (const g of S.week.games) {
    const on = allEntriesForGame(g); if (!on.fav.length && !on.dog.length) continue;
    const st = gameState(g, S.live, S.week.research);
    if (st.state === 'in') items.push({ g, st, on, sort: 0 });
    else if (st.state === 'post') { const cush = Math.abs(st.margin - g.spread); if (cush <= 3.5 && Date.now() - new Date(g.espn.kickoff) < 30 * 3600e3) items.push({ g, st, on, sort: 1, close: true }); }
  }
  if (!items.length) {
    const next = S.week.games.filter(g => { const on = allEntriesForGame(g); return (on.fav.length || on.dog.length) && gameState(g, S.live).state === 'pre'; })
      .sort((a, b) => new Date(a.espn.kickoff) - new Date(b.espn.kickoff)).slice(0, 6);
    if (!next.length) return `<div class="panel empty" style="flex:1">No family games live right now.</div>`;
    return next.map(g => { const on = allEntriesForGame(g);
      return `<div class="panel lw clickable" data-game="${g.fav_no}"><div class="hd"><span>${g.league} · kicks in ${until(g.espn.kickoff)}</span><span>${etTime(g.espn.kickoff)}</span></div>
      <div class="sc"><span style="font-size:14px">${esc(g.fav)} −${fmtHalf(g.spread)}</span></div><div class="sc"><span style="font-size:14px">${esc(g.dog)} +${fmtHalf(g.spread)}</span></div>
      <div class="picks">${[...on.fav, ...on.dog].map(p => pickChip(p, g)).join('')}</div></div>`; }).join('');
  }
  items.sort((a, b) => a.sort - b.sort);
  return items.map(({ g, st, on, close }) => {
    const favCover = st.margin > g.spread; const cushion = Math.abs(st.margin - g.spread);
    const leader = favCover ? g.fav : g.dog;
    const head = st.state === 'post' ? `Final: ${esc(leader)} covered by ${fmtHalf(cushion)}${close ? ' (photo finish)' : ''}` : `${esc(leader)} covering by ${fmtHalf(cushion)}`;
    const picks = [...on.fav.map(p => ({ ...p, s: 'fav' })), ...on.dog.map(p => ({ ...p, s: 'dog' }))];
    const lines = picks.map(p => {
      const c = p.s === 'fav' ? st.margin - g.spread : g.spread - st.margin;
      let txt, cls;
      if (st.state === 'post') { txt = c > 0 ? `banked ${p.conf}` : `lost ${p.conf}`; cls = c > 0 ? 'safe' : 'gone'; }
      else if (c > 0) { txt = c < 8 ? `up ${fmtHalf(c)}. Not safe` : c < 14 ? `up ${fmtHalf(c)}. Breathing room` : `up ${fmtHalf(c)}. Looks safe (famous last words)`; cls = c < 8 ? 'danger' : 'safe'; }
      else { txt = `needs ${fmtHalf(-c)} to cover`; cls = 'gone'; }
      return `<div class="verdict ${cls}">${avatar(p.e.f)} ${esc(p.e.f.short)} (${p.conf}): ${txt}</div>`;
    }).join('');
    return `<div class="panel lw clickable" data-game="${g.fav_no}">
      <div class="hd"><span>${g.league} · ${esc(st.detail)}</span><span>cover ${pct(st.pFav)} / ${pct(1 - st.pFav)}</span></div>
      <div class="sc"><span style="font-size:14px">${esc(g.fav)} −${fmtHalf(g.spread)}</span><span>${st.favScore}</span></div>
      <div class="sc"><span style="font-size:14px">${esc(g.dog)} +${fmtHalf(g.spread)}</span><span>${st.dogScore}</span></div>
      <div class="muted" style="font-size:12px;margin-bottom:4px">${head}</div>${lines}</div>`;
  }).join('');
}
function pickChip({ e, conf }, g, side) {
  const r = e.grade?.rows.find(x => x.conf === conf);
  const cls = r?.status === 'won' ? 'won' : r?.status === 'lost' ? 'lost' : '';
  return `<span class="pk ${cls} ${e.f.shadow ? 'shadowpk' : ''}" title="${esc(e.f.short)}: ${conf} on ${esc(sideName(g, r?.side ?? side ?? 'fav'))}">${avatar(e.f)}${conf}</span>`;
}

function slate() {
  const f = S.slateFilter;
  const games = S.week.games.filter(g => {
    const on = allEntriesForGame(g); const st = gameState(g, S.live);
    if (f === 'family') return on.fav.length || on.dog.length;
    if (f === 'live') return st.state === 'in'; if (f === 'final') return st.state === 'post';
    if (f === 'nfl') return g.league === 'NFL'; if (f === 'cfb') return g.league === 'CFB'; return true;
  }).sort((a, b) => new Date(a.espn?.kickoff) - new Date(b.espn?.kickoff) || a.fav_no - b.fav_no);
  if (!games.length) return `<div class="panel empty">${f === 'family' ? 'No family picks loaded for this week yet.' : 'Nothing here right now.'}</div>`;
  let out = '', day = '';
  for (const g of games) {
    const d = g.espn ? etDay(g.espn.kickoff) : g.day;
    if (d !== day) { out += `<div class="day-hd">${esc(d.toUpperCase())}</div>`; day = d; }
    out += gameRow(g);
  }
  return out;
}
function gameRow(g) {
  const st = gameState(g, S.live, S.week.research); const on = allEntriesForGame(g);
  const favCov = st.state !== 'pre' && st.margin > g.spread, dogCov = st.state !== 'pre' && !favCov;
  const team = (side, cov) => {
    const nm = side === 'fav' ? g.fav : g.dog, logo = side === 'fav' ? g.espn?.favLogo : g.espn?.dogLogo, no = side === 'fav' ? g.fav_no : g.dog_no;
    return `<div class="team ${cov ? 'cover' : ''}">${logo ? `<img src="${logo}" alt="" loading="lazy">` : ''}<span class="nm">${esc(nm)}</span>
      <span class="sp">${sideSpread(g, side)}</span>${g.home === side ? '<span class="home">HOME</span>' : ''}<span class="pn">#${no}</span></div>`;
  };
  const mid = st.state === 'pre'
    ? `<div class="score" style="font-size:14px">${etTime(g.espn?.kickoff)}</div><div class="st">${esc(g.league)}${S.live.get(g.espn?.id)?.broadcast ? ' · ' + esc(S.live.get(g.espn.id).broadcast) : ''}</div>`
    : `<div class="score">${st.favScore}–${st.dogScore}</div><div class="st ${st.state === 'in' ? 'in' : ''}">${esc(st.detail)}</div>
       <div class="coverbar" title="${esc(g.fav)} cover chance ${pct(st.pFav)}"><i style="left:0;width:${st.pFav * 100}%"></i></div>`;
  const hookNote = st.state === 'post' && Math.abs(st.margin - g.spread) === 0.5 ? `<div class="hook">DECIDED BY THE HOOK</div>` : '';
  return `<div class="panel game clickable" tabindex="0" data-game="${g.fav_no}">
    <div class="side">${team('fav', favCov)}<div class="picks">${on.fav.map(p => pickChip(p, g, 'fav')).join('')}</div></div>
    <div class="mid">${mid}${hookNote}</div>
    <div class="side r">${team('dog', dogCov)}<div class="picks">${on.dog.map(p => pickChip(p, g, 'dog')).join('')}</div></div></div>`;
}

// ------------------------------------------------------------ STANDINGS
// "Around the league": storylines from the official weekly scores (js/storylines.js).
function aroundTheLeague() {
  const L = leagueStorylines(S.league, FAMILY); if (!L) return '';
  const who = n => { const f = famOf(n); return f ? `${avatar(f)} <b>${esc(f.short)}</b>` : nameLink(n); };
  const mv = x => `${who(x.name)} <span class="muted">#${x.from}→#${x.to}</span>`;
  const arrow = f => f.prev == null ? '' : f.prev === f.rank ? '<span class="muted">–</span>' : f.prev > f.rank ? `<span class="delta up">▲${f.prev - f.rank}</span>` : `<span class="delta dn">▼${f.rank - f.prev}</span>`;
  const famRows = [...L.family].sort((a, b) => a.rank - b.rank).map(f => `<div class="stat-row"><span>${avatar(fam(f.key))} ${esc(f.short)} <span class="muted">#${f.rank}</span> ${arrow(f)}</span><span class="num">wk ${f.week ?? '–'} <span class="muted">(#${f.weekRank ?? '–'})</span></span></div>`).join('');
  return `${title(`Around the league`, `Storylines through week ${L.week}, from the official scores`)}
    <div class="grid two">
      <div class="panel insight"><h3>👑 The lead</h3><p>${L.current.names.map(who).join(' and ')} ${L.current.names.length > 1 ? 'share' : 'leads'} with <b>${L.current.total}</b>${L.lead != null ? `, ${L.lead} ahead` : ''}. ${L.heldSince === 1 ? 'In front since week 1.' : `In front since week ${L.heldSince}.`}</p>
        <p class="note">Lead changes this season: ${L.changes.length ? L.changes.map(w => 'week ' + w).join(', ') : 'none'}. Best single week so far: ${L.best.map(b => `${who(b.name)} ${b.s} (wk ${b.week})`).join(', ')}.</p></div>
      <div class="panel insight"><h3>🏆 Week ${L.week}</h3><p>Top scores: ${L.top.map(x => `${who(x.name)} ${x.s}`).join(' · ')}</p><p class="note">League average ${fmt1(L.weekAvg)}. The family beat the rest of the league's average in ${L.beatN} of ${L.week} weeks.</p></div>
      ${L.climbers.length ? `<div class="panel insight"><h3>📈 Movers in week ${L.week}</h3><p>Up: ${L.climbers.map(mv).join(' · ')}</p><p>Down: ${L.fallers.map(mv).join(' · ') || '–'}</p></div>` : ''}
      <div class="panel insight"><h3>🏠 The family</h3>${famRows}<p class="note">Arrows: season-rank change from last week. "wk": week ${L.week} score and rank that week.</p></div>
    </div>`;
}
function viewStandings() {
  const T = leagueTable(); const sh = shadowRow(); const cw = S.week.week;
  const wkCols = Array.from({ length: T.weeks }, (_, i) => `W${i + 1}`);
  const q = S.search.toLowerCase();
  const rows = T.rows.filter(r => (!S.famOnly || r.f) && (!q || r.name.toLowerCase().includes(q)));
  const tr = r => `<tr class="row ${r.f ? 'fam' : ''}" style="--c:${r.f?.color || 'transparent'}" data-name="${esc(r.name)}">
    <td class="num">${r.rankLabel.replace("#", "")}</td><td class="l nm-cell">${r.f ? avatar(r.f) + ' ' : ''}${esc(r.name)}</td>
    ${r.weeks.map((v, i) => `<td class="num wk" title="Week rank ${r.wrank?.[i] ?? '–'}">${v ?? '–'}</td>`).join('')}
    <td class="num">${r.cur == null ? '<span class="muted">–</span>' : `${r.cur}${r.curLive ? '<span class="muted">*</span>' : ''}`}</td>
    <td class="num"><b>${r.total}</b></td><td class="num muted">${r.rank === 1 ? '—' : '−' + (T.leader - r.total)}</td><td class="num pc">${pctile(r.rank, T.n)}</td></tr>`;
  const ghost = `<tr class="ghost row" style="--c:${sh.f.color}" data-member="tarun"><td>—</td><td class="l nm-cell">${avatar(sh.f)} Shadow card <span class="shadow-tag">unofficial</span></td>
    ${sh.weeks.map(v => `<td class="num wk">${v ?? '–'}</td>`).join('')}<td class="num">${sh.cur ?? '–'}<span class="muted">*</span></td><td class="num">${sh.total}</td><td class="muted">since W${sh.since}</td><td class="pc"></td></tr>`;

  const fams = T.rows.filter(r => r.f);
  const cols = Array.from({ length: T.weeks }, (_, w) => T.rows.map(r => r.weeks[w]));
  const cumul = r => { let s = 0; return r.weeks.map(v => (s += v || 0)); };
  const medCum = Array.from({ length: T.weeks }, (_, w) => median(T.rows.map(r => cumul(r)[w])));
  const top10 = Array.from({ length: T.weeks }, (_, w) => { const s = T.rows.map(r => cumul(r)[w]).sort((a, b) => b - a); return s[9]; });

  $('#main').innerHTML = `${title('League standings', `${T.n} entries · through week ${T.weeks}${S.week.picks ? ` · W${cw} column is live for the picks we have*` : ''}`)}
    <div class="filters"><button class="chip ${S.famOnly ? 'on' : ''}" id="fOnly">Family only</button><button class="chip ${!S.famOnly ? 'on' : ''}" id="fAll">Whole league</button>
      <input class="search" id="srch" placeholder="Search a name…" value="${esc(S.search)}"></div>
    <div class="panel tbl-wrap"><table><thead><tr><th>#</th><th class="l">Name</th>${wkCols.map(c => `<th class="wk">${c}</th>`).join('')}<th>W${cw}</th><th>Total</th><th>Back</th><th class="pc">Pctl</th></tr></thead>
      <tbody>${rows.map(tr).join('')}${S.famOnly || !q ? ghost : ''}</tbody></table></div>
    <div class="note">*Live week-${cw} points from ESPN, for entries whose picks are loaded. Official weekly scores replace them once the commissioner posts totals.</div>
    ${aroundTheLeague()}
    ${title('How the family stacks up')}
    <div class="grid two">
      <div class="panel chart clickable" id="chStrip"><h3>Every weekly score in the league</h3><div class="cap">Grey dots are the ${T.n} entries; dashed line is the weekly average. Tap for details.</div>
        ${stripPlot({ columns: cols, labels: wkCols, highlights: fams.map(r => ({ label: r.f.short, color: r.f.color, values: r.weeks })).concat([{ label: 'Shadow', color: sh.f.color, values: sh.weeks }]) })}
        <div class="legend">${fams.map(r => `<span><i style="background:${r.f.color}"></i>${esc(r.f.short)}</span>`).join('')}<span><i style="background:${sh.f.color}"></i>Shadow</span></div></div>
      <div class="panel chart"><h3>The race</h3><div class="cap">Cumulative points vs the league median and the 10th-place line</div>
        ${lineChart({ labels: wkCols, series: [{ label: 'League median', color: 'var(--ink-3)', values: medCum, dash: '4 4' }, { label: '10th place', color: 'var(--gold)', values: top10, dash: '2 3' },
          ...fams.map(r => ({ label: r.f.short, color: r.f.color, values: cumul(r), width: 2.5 }))] })}
        <div class="legend"><span><i style="background:var(--ink-3)"></i>Median</span><span><i style="background:var(--gold)"></i>10th place</span>${fams.map(r => `<span><i style="background:${r.f.color}"></i>${esc(r.f.short)}</span>`).join('')}</div></div>
      <div class="panel chart"><h3>Season totals</h3><div class="cap">Where the family sits in the league distribution</div>
        ${histogram({ values: T.rows.map(r => r.total), markers: fams.map(r => ({ label: r.f.short, color: r.f.color, value: r.total })) })}</div>
      <div class="panel chart">${familyCup(T)}</div>
      ${familyVsLeagueHistory(T)}
    </div>`;
  $('#fOnly').onclick = () => { S.famOnly = true; viewStandings(); }; $('#fAll').onclick = () => { S.famOnly = false; viewStandings(); };
  $('#srch').oninput = e => { S.search = e.target.value; S.famOnly = S.famOnly && !S.search; viewStandings(); const s = $('#srch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); };
  $$('tr.row').forEach(tr => tr.onclick = () => tr.dataset.member ? openMember(tr.dataset.member) : famOf(tr.dataset.name) ? openMember(famOf(tr.dataset.name).key) : openProfile(tr.dataset.name));
  $('#chStrip').onclick = () => openWeekSpread(T);
  bindProfileLinks($('#main'));
  $$('.cup-row').forEach(el => el.onclick = () => el.dataset.member ? openMember(el.dataset.member) : openLeagueMember(el.dataset.name));
}
function familyCup(T) {
  const fams = T.rows.filter(r => r.f);
  const weekWins = {}; fams.forEach(r => weekWins[r.name] = 0);
  for (let w = 0; w < T.weeks; w++) { const best = Math.max(...fams.map(r => r.weeks[w] ?? -1)); fams.filter(r => r.weeks[w] === best).forEach(r => weekWins[r.name]++); }
  const medals = ['🥇', '🥈', '🥉'];
  // Shadow card: unofficial, and only exists from its first week, so compare it on that window.
  const sh = shadowRow(); const from = sh.since - 1;
  const since = r => r.weeks.slice(from).reduce((a, v) => a + (v || 0), 0);
  const famSince = fams.map(since); const lo = Math.min(...famSince), hi = Math.max(...famSince);
  const shRank = 1 + famSince.filter(v => v > sh.total).length;
  const row = (medal, f, name, big, sub, attrs, cls = '') => `<div class="cup-row clickable ${cls}" ${attrs}>
      <span class="cup-medal">${medal}</span>${avatar(f)}<span class="cup-name">${name}</span>
      <span class="cup-pts num">${big}</span><span class="cup-sub">${sub}</span></div>`;
  return `<h3>The Family Cup</h3><div class="cap">Season order inside the family, with weekly family wins</div>
    ${fams.map((r, i) => row(medals[i] || '', r.f, esc(r.f.short), r.total,
      `${weekWins[r.name]} week${weekWins[r.name] === 1 ? '' : 's'} won · league ${r.rankLabel}`, `data-name="${esc(r.name)}"`)).join('')}
    ${row('', sh.f, `Tarun <span class="shadow-tag">shadow · unofficial</span>`, sh.total,
      `since W${sh.since} only · family ${lo === hi ? lo : `${lo}–${hi}`} over the same weeks · would be #${shRank}`, 'data-member="tarun"', 'cup-ghost')}`;
}

// ------------------------------------------------------------ HEAD TO HEAD
// ---------- head to head ----------
// Weekly scores for a family member in a season: 'now' = this season's official weeks, or a past
// season from the rebuilt archives. null = not in the pool that season.
function h2hWeeks(f, yr, T) {
  if (yr === 'now') { if (f.shadow) return shadowRow().weeks; return T.rows.find(r => r.f === f)?.weeks || null; }
  const A = S.ctx?.seasons[yr]?.archive; if (!A || !f.pool || f.shadow) return null;
  return A.entries.find(e => e.name === f.pool || samePerson(e.name, f.pool))?.weeks || null;
}
function h2hRecord(a, b) {
  let w = 0, l = 0, t = 0; if (!a || !b) return null;
  a.forEach((v, i) => { const u = b[i]; if (v == null || u == null) return; v > u ? w++ : v < u ? l++ : t++; });
  return w + l + t ? { w, l, t } : null;
}
// All seasons on file plus this one, summed.
function h2hAllTime(fa, fb, T) {
  const yrs = [...Object.keys(S.ctx?.seasons || {}).sort(), 'now'];
  const per = yrs.map(y => ({ y, r: h2hRecord(h2hWeeks(fa, y, T), h2hWeeks(fb, y, T)) })).filter(x => x.r);
  const tot = per.reduce((s, x) => ({ w: s.w + x.r.w, l: s.l + x.r.l, t: s.t + x.r.t }), { w: 0, l: 0, t: 0 });
  return { per, tot };
}
const recTxt = r => (r ? `${r.w}–${r.l}${r.t ? '–' + r.t : ''}` : '–');

function viewH2H() {
  const T = leagueTable();
  if (!S.ctx) ensureHistory().then(() => { if (S.tab === 'h2h' && !$('.modal')) render(); }).catch(() => {});
  const yrs = Object.keys(S.ctx?.seasons || {}).sort().reverse();
  const yr = S.h2hYr === 'all' || S.h2hYr === 'now' || yrs.includes(S.h2hYr) ? S.h2hYr : 'now';
  const famList = FAMILY.filter(f => !f.shadow && T.rows.some(r => r.f === f));
  const sh = shadowRow(); const showShadow = yr === 'now';
  const missing = famList.filter(f => yrs.some(y => S.ctx && !h2hWeeks(f, y, T)));
  const recOf = (fa, fb) => (yr === 'all' ? h2hAllTime(fa, fb, T).tot : h2hRecord(h2hWeeks(fa, yr, T), h2hWeeks(fb, yr, T)));
  const cell = (fa, fb) => {
    if (fa === fb) return `<td class="muted">—</td>`;
    const r = recOf(fa, fb); if (!r || !(r.w + r.l + r.t)) return `<td class="muted" title="Not both in the pool">–</td>`;
    const c = r.w > r.l ? 'var(--win-bg)' : r.w < r.l ? 'var(--lose-bg)' : 'transparent';
    return `<td class="cell" style="background:${c}" data-a="${fa.key}" data-b="${fb.key}">${recTxt(r)}</td>`;
  };
  const who = (f, label = f.short, extra = '') => `<button type="button" class="rh-in plink-btn" data-member="${f.key}" title="Open ${esc(label)}'s card">${avatar(f)}<span>${esc(label)}${extra}</span></button>`;
  const chips = [['now', 'This season'], ...yrs.map(y => [y, y]), ...(yrs.length ? [['all', 'All-time']] : [])]
    .map(([k, l]) => `<button class="chip ${k === yr ? 'on' : ''}" data-h2hyr="${k}">${l}</button>`).join('');
  const sub = yr === 'all' ? `Every season on file plus this one (${[...yrs].reverse().join(', ')} and now). Tap a record for the rivalry card`
    : yr === 'now' ? 'Weekly score records this season. Read across: row vs column. Tap a record for the rivalry card, or a name for that person'
    : `Weekly score records in ${yr}, rebuilt from the commissioner's files. Tap a record for the rivalry card`;
  $('#main').innerHTML = `${title('Head to head', sub)}
    <div class="filters">${chips}${S.ctx ? '' : '<span class="muted" style="font-size:12.5px">Loading past seasons…</span>'}</div>
    <div class="panel tbl-wrap"><table class="matrix"><thead><tr><th class="rh"></th>${famList.map(f => `<th class="ch"><button type="button" class="ch-btn" data-member="${f.key}" title="Open ${esc(f.short)}'s card">${avatar(f)}<span class="ch-name">${esc(f.short)}</span></button></th>`).join('')}</tr></thead>
    <tbody>${famList.map(a => `<tr><th class="rh">${who(a)}</th>${famList.map(b => cell(a, b)).join('')}</tr>`).join('')}
    ${showShadow ? `<tr class="shadow-row"><th class="rh">${who(sh.f, 'Shadow', `<small>since W${sh.since} · unofficial</small>`)}</th>${famList.map(b => cell(sh.f, b)).join('')}</tr>` : ''}</tbody></table></div>
    ${yr === 'all' && missing.length ? `<p class="note">${missing.map(f => esc(f.short)).join(', ')} ${missing.length > 1 ? "weren't" : "wasn't"} in every past season, so ${missing.length > 1 ? 'those' : 'that'} all-time record${missing.length > 1 ? 's cover' : ' covers'} fewer seasons.</p>` : ''}
    ${title(`This week's biggest swing games`, 'Games where the family is split, weighted by confidence on each side')}
    <div id="swing">${swingGames()}</div>`;
  $$('td.cell').forEach(td => td.onclick = () => openH2H(td.dataset.a, td.dataset.b));
  $$('[data-member]', $('.matrix')).forEach(b => b.onclick = () => openMember(b.dataset.member));
  $$('[data-h2hyr]').forEach(b => b.onclick = () => { S.h2hYr = b.dataset.h2hyr; viewH2H(); });
  bindGames();
}
function swingGames() {
  const list = S.week.games.map(g => { const on = allEntriesForGame(g); const a = on.fav.reduce((s, p) => s + p.conf, 0), b = on.dog.reduce((s, p) => s + p.conf, 0);
    return { g, on, swing: Math.min(a, b) ? a + b : 0, a, b }; }).filter(x => x.swing).sort((x, y) => y.swing - x.swing);
  if (!list.length) return `<div class="panel empty">No family splits yet. When more picks are loaded, the games where you're on opposite sides show up here.</div>`;
  return list.map(x => gameRow(x.g)).join('');
}

// ------------------------------------------------------------ PICK LAB
// "This week's race": simulated odds + what-ifs that move them.
function raceSection() {
  const sim = S.sim;
  if (!sim) return `<div class="panel insight"><p>The race appears once picks are loaded.</p></div>`;
  const rows = sim.entries.filter(e => e.picked && e.group !== 'league').sort((a, b) => (b.official - a.official) || (b.pWin ?? -1) - (a.pWin ?? -1) || b.mean - a.mean);
  const official = rows.filter(r => r.official).length;
  const bar = (p, color) => `<div class="race-bar"><i style="width:${Math.max(2, p * 100)}%;background:${color}"></i></div>`;
  const body = rows.map(r => { const f = fam(r.key);
    const odds = r.pWin != null ? `<b>${pct(r.pWin)}</b><small>to win week</small>` : r.official && sim.h2h[r.key]?.tarun != null ? `<b>${pct(sim.h2h[r.key].tarun)}</b><small>to beat shadow</small>` : `<b class="muted">–</b><small>unofficial</small>`;
    const p = r.pWin ?? (r.official ? sim.h2h[r.key]?.tarun : null);
    return `<div class="race-row clickable ${r.official ? '' : 'race-ghost'}" data-member="${r.key}">
      ${avatar(f)}<div class="race-main"><div class="race-name">${esc(r.official ? f.short : "Tarun's shadow card")}</div>${p != null ? bar(p, f.color) : ''}
      <div class="race-sub">Expected ${fmt1(r.mean)} · likely ${r.p10}–${r.p90}</div></div><div class="race-odds">${odds}</div></div>`; }).join('');
  const ifs = (sim.whatifs || []).slice(0, 4).map(w => describeWhatIf(w, S.week, simLabel)).filter(Boolean);
  const note = official < 2 ? '<p class="note">Family win odds appear once two or more family cards are loaded. Until then it\'s head to head against the shadow card.</p>' : '';
  return `${title("This week's race", `${sim.n.toLocaleString()} simulated weeks using live lines and scores · ${sim.openGames} games still to decide`)}
    <div class="grid two"><div class="panel insight">${body}${note}</div>
      <div class="panel insight"><h3>🔀 What-ifs that matter most</h3>${ifs.length ? ifs.map(x => `<div class="whatif clickable" data-game="${x.favNo}">${esc(x.text)}</div>`).join('') : '<p>Nothing left that changes the race.</p>'}
      <p class="note">Recomputed every refresh. As games finish, these shift, and the Commentator may chime in with the big ones.</p></div></div>`;
}
// "Versus the league": each of us, and the family as a whole, against all league entries this week.
function leagueSection() {
  const sim = S.sim, fvl = sim?.familyVsLeague; if (!fvl) return '';
  const n = sim.leagueSize, T = leagueTable();
  const lgPicks = sim.entries.filter(e => e.group === 'league' && e.picked).length;
  const rows = sim.entries.filter(e => e.league).map(e => { const f = fam(e.key); const now = T.rows.find(r => r.f === f); const L = e.league;
    return `<div class="lg-row clickable ${e.group === 'shadow' ? 'race-ghost' : ''}" data-member="${e.key}">${avatar(f)}<div>
      <div class="race-name">${esc(e.group === 'shadow' ? "Tarun's shadow card" : f.short)}</div>
      <div class="race-sub">This week: about #${L.weekRank} of ${n} · top-10 week ${pct(L.pTop10)} · top quarter ${pct(L.pTopQ)}</div>
      <div class="race-sub">${e.group === 'shadow' ? 'Unofficial: ranked as if it were an entry' : `Season: ${now?.rankLabel ?? '–'} now → about #${L.seasonRank} after this week · season top-10 ${pct(L.pSeasonTop10)}`}</div></div></div>`; }).join('');
  const proj = fvl.projectedMembers.map(k => fam(k)?.short).filter(Boolean);
  const ifs = (sim.leagueWhatifs || []).slice(0, 3).map(w => describeWhatIf(w, S.week, simLabel)).filter(Boolean);
  return `${title('Versus the league', `${n} entries · ${lgPicks ? `${lgPicks} with picks loaded, the rest` : 'other entries'} simulated at the league average`)}
    <div class="grid two">
      <div class="panel insight"><h3>🏟️ The family vs the league</h3>
        <div class="kv"><div><b>${fmt1(fvl.famAvg)}</b><span>Family average this week (projected)</span></div><div><b>${fmt1(fvl.lgAvg)}</b><span>Everyone else's average</span></div>
          <div><b>${pct(fvl.pFamAhead)}</b><span>Family beats the league average</span></div><div><b>${pct(fvl.pFamTop10)}</b><span>Someone in the family has a top-10 week</span></div></div>
        ${proj.length ? `<p class="note">${esc(proj.join(', '))}: picks not in yet, so they're simulated at the league average (past scores don't predict the next week here). This sharpens as sheets are uploaded.</p>` : ''}
        ${ifs.length ? `<h4 class="lg-h">What-ifs</h4>${ifs.map(x => `<div class="whatif clickable" data-game="${x.favNo}">${esc(x.text)}</div>`).join('')}` : ''}</div>
      <div class="panel insight"><h3>📈 Each of us vs the league</h3>${rows || '<p class="muted">Appears once picks are loaded.</p>'}</div>
    </div>`;
}
// Standings: how the family has actually done against the league, week by week.
function familyVsLeagueHistory(T) {
  const fams = T.rows.filter(r => r.f), rest = T.rows.filter(r => !r.f);
  if (!fams.length || !T.weeks) return '';
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  let beat = 0;
  const weeks = Array.from({ length: T.weeks }, (_, w) => {
    const fv = fams.map(r => r.weeks[w]).filter(v => v != null), lv = rest.map(r => r.weeks[w]).filter(v => v != null);
    const fa = avg(fv), la = avg(lv); if (fa > la) beat++;
    const best = fams.filter(r => r.weeks[w] != null).sort((a, b) => b.weeks[w] - a.weeks[w])[0];
    return `<tr><td class="l">Week ${w + 1}</td><td class="num">${fmt1(fa)}</td><td class="num">${fmt1(la)}</td>
      <td class="num ${fa >= la ? 'delta up' : 'delta dn'}">${fa >= la ? '+' : ''}${fmt1(fa - la)}</td>
      <td class="l">${best ? `${avatar(best.f)} ${esc(best.f.short)} ${best.weeks[w]} <span class="muted">(#${best.wrank[w]})</span>` : '–'}</td></tr>`; }).join('');
  const famTot = avg(fams.map(r => r.total)), lgTot = avg(rest.map(r => r.total));
  const pctiles = fams.map(r => pctile(r.rank, T.n));
  // "Team Smelley" best ball: the family's best score each week, as if it were one entry.
  const bb = Array.from({ length: T.weeks }, (_, w) => Math.max(...fams.map(r => r.weeks[w] ?? 0))).reduce((a, b) => a + b, 0);
  const bbRank = (T.rows.some(r => r.total === bb) ? 'T-' : '#') + (1 + T.rows.filter(r => r.total > bb).length);
  return `<div class="panel chart"><h3>Family vs the league</h3><div class="cap">The family's weekly average against everyone else's, from the official scores</div>
    <div class="kv" style="margin:6px 0 10px"><div><b>${beat} of ${T.weeks}</b><span>Weeks the family beat the league average</span></div>
      <div><b>${fmt1(famTot)} <span class="muted" style="font-size:13px">vs ${fmt1(lgTot)}</span></b><span>Average season total</span></div>
      <div><b>${Math.round(avg(pctiles))}</b><span>Average family percentile</span></div>
      <div><b>${bb} <span class="muted" style="font-size:13px">${bbRank}</span></b><span>"Team Smelley" best-ball (best family score each week) would rank</span></div></div>
    <div class="tbl-wrap"><table><thead><tr><th class="l">Week</th><th>Family</th><th>League</th><th>Diff</th><th class="l">Family best</th></tr></thead><tbody>${weeks}</tbody></table></div></div>`;
}
// ---------- pick style: this week vs each person's usual ----------
// Style is what carries over in this pool (underdog share 2024 vs 2025 correlates 0.87, NFL 0.89,
// home 0.81), while results don't (cover rate 0.04). So "this week vs their usual" means something
// even from 10 picks, and a big departure is a real storyline. Home counts only games with a home team.
const STYLE = [
  { k: 'dog', label: 'Underdogs', phrase: 'underdogs', hit: r => r.side === 'dog' },
  { k: 'home', label: 'Home teams', phrase: 'home teams', hit: r => r.g.home === r.side, base: r => r.g.home != null },
  { k: 'nfl', label: 'NFL games', phrase: 'NFL games', hit: r => r.g.league === 'NFL' },
  { k: 'bigFav', label: 'Big favorites (10+)', phrase: 'big favorites (10+)', hit: r => r.side === 'fav' && r.g.spread >= 10 },
];
function weekStyle(e) {
  const rows = e.grade.rows.filter(r => r.g);
  return Object.fromEntries(STYLE.map(s => { const b = rows.filter(s.base || (() => true)); return [s.k, { n: b.filter(s.hit).length, of: b.length }]; }));
}
function usual(f) {   // pooled past-season pick metrics for a family member, or null
  if (!S.ctx || !f?.pool) return null;
  S.usualCache ??= new Map();
  if (!S.usualCache.has(f.pool)) S.usualCache.set(f.pool, scoutingReport(S.ctx, f.pool).career?.metrics || null);
  return S.usualCache.get(f.pool);
}
const OFF_SCRIPT = 0.3;   // about 2 standard errors for a 10-pick week
function styleCard(e) {
  const w = weekStyle(e), m = usual(e.f), Z = S.ctx?.career.spread, lbl = S.ctx?.career.label;
  const rows = e.grade.rows.filter(r => r.g);
  const res = rows.map(r => S.week.research?.[r.side === 'fav' ? r.g.fav_no : r.g.dog_no]).filter(Boolean);
  const bars = STYLE.map(s => { const x = w[s.k], p = x.of ? x.n / x.of : 0, u = m?.[s.k].share, lg = Z?.[s.k]?.mu;
    const off = u != null && x.of >= 8 && Math.abs(p - u) >= OFF_SCRIPT;
    return `<div class="sr-row"><div class="sr-l">${s.label}${off ? `<span class="offscript">${p > u ? 'more' : 'fewer'} than usual</span>` : ''}</div>
      <div class="sr-bar"><i style="width:${p * 100}%"></i>${u != null ? `<b style="left:${u * 100}%" title="Usually ${pct(u)}"></b>` : ''}</div>
      <div class="sr-v">${x.n} of ${x.of}<small>${u != null ? `usually ${pct(u)}` : lg != null ? `league ${pct(lg)}` : ''}</small></div></div>`; }).join('');
  return `<div class="panel insight clickable style-card" data-member="${e.f.key}"><h3>${avatar(e.f)} ${esc(e.f.short)}'s pick style${e.f.shadow ? ' <span class="shadow-tag">shadow</span>' : ''}</h3>
    ${bars}
    <p class="note" style="margin:4px 0 8px">${m ? `Bar = this week · gold tick = usual over ${lbl} (${m.n} picks)` : e.f.shadow ? 'Bar = this week · no past seasons for the shadow card' : S.ctx ? 'Bar = this week · no past seasons on file' : 'Bar = this week · loading past seasons…'}</p>
    <div class="stat-row"><span>Average spread taken</span><span class="num">${fmt1(mean(rows.map(r => r.g.spread)))}</span></div>
    <div class="stat-row"><span>Confidence on underdogs</span><span class="num">${rows.filter(r => r.side === 'dog').reduce((s, r) => s + r.conf, 0)} of 55</span></div>
    <div class="stat-row"><span>Avg model cover chance <small class="muted">(${res.length} picks)</small></span><span class="num">${res.length ? pct(mean(res.map(r => r.p))) : '–'}</span></div></div>`;
}

function viewLab() {
  const E = entries().filter(e => e.picks);
  if (!S.ctx) ensureHistory().then(() => { if (S.tab === 'lab' && !$('.modal')) render(); }).catch(() => {});
  $('#main').innerHTML = `${title('Pick Lab', `Week ${S.week.week}: what everyone's betting on, and how the numbers see it`)}
    ${raceSection()}
    ${leagueSection()}
    ${title('Storylines')}<div class="grid two">${insights(E)}</div>
    ${title('Pick styles', 'This week against each person\'s usual. Style is the one thing that carries over from season to season here')}<div class="grid two">${E.map(styleCard).join('') || '<div class="panel empty">No picks loaded yet.</div>'}</div>
    ${title('Consensus board', 'Every game with at least one family pick')}
    <div class="panel tbl-wrap">${consensusTable()}</div>
    ${S.week.shadow ? `${title('The shadow card', 'Watson–Tarun, built from multi-book lines and power ratings. Unofficial')}<div class="panel" style="padding:8px 14px">${shadowList()}</div>` : ''}`;
  $$('[data-member]').forEach(el => el.onclick = () => openMember(el.dataset.member));
  $$('[data-game]').forEach(el => el.onclick = () => openGame(+el.dataset.game));
}
function insights(E) {
  const all = E.filter(e => !e.f.shadow).flatMap(e => e.grade.rows.filter(r => r.g).map(r => ({ ...r, e })));
  const out = [];
  const card = (icon, h, p, game) => `<div class="panel insight ${game ? 'clickable' : ''}" ${game ? `data-game="${game}"` : ''}><h3>${icon} ${h}</h3><p>${p}</p></div>`;
  if (!all.length) return card('🏈', 'Waiting on picks', 'Once everyone\'s sheets are loaded, this fills with the week\'s storylines.');
  const top = [...all].sort((a, b) => b.conf - a.conf || b.g.spread - a.g.spread)[0];
  const biggestDog = all.filter(r => r.side === 'dog').sort((a, b) => b.conf * b.g.spread - a.conf * a.g.spread)[0];
  const counts = {}; for (const r of all) { const k = `${r.g.fav_no}|${r.side}`; (counts[k] ??= []).push(r); }
  const popular = Object.values(counts).sort((a, b) => b.length - a.length || b.reduce((s, r) => s + r.conf, 0) - a.reduce((s, r) => s + r.conf, 0))[0];
  const lonely = all.filter(r => counts[`${r.g.fav_no}|${r.side}`].length === 1 && E.filter(e => !e.f.shadow).length > 1).sort((a, b) => b.conf - a.conf)[0];
  const withModel = all.map(r => ({ ...r, m: S.week.research?.[r.side === 'fav' ? r.g.fav_no : r.g.dog_no] })).filter(r => r.m);
  const modelFav = [...withModel].sort((a, b) => b.m.p - a.m.p)[0], modelHate = [...withModel].sort((a, b) => a.m.p - b.m.p)[0];
  const early = all.filter(r => new Date(r.g.espn.kickoff) < new Date(S.week.games.find(g => g.day === 'Saturday')?.espn?.kickoff || 0)).sort((a, b) => b.conf - a.conf)[0];
  out.push(card('🎯', 'Boldest confidence', `${esc(top.e.f.short)} put <b>${top.conf}</b> on ${esc(sideName(top.g, top.side))} ${sideSpread(top.g, top.side)}${top.st.state !== 'pre' ? `: currently <b>${top.status}</b>` : ''}.`, top.g.fav_no));
  if (biggestDog) out.push(card('🐕', 'Biggest dog bite', `${esc(biggestDog.e.f.short)} is taking ${esc(sideName(biggestDog.g, 'dog'))} +${fmtHalf(biggestDog.g.spread)} for ${biggestDog.conf} points.`, biggestDog.g.fav_no));
  if (popular && popular.length > 1) out.push(card('🤝', 'Family consensus', `${popular.map(r => esc(r.e.f.short)).join(', ')} all have ${esc(sideName(popular[0].g, popular[0].side))} ${sideSpread(popular[0].g, popular[0].side)}.`, popular[0].g.fav_no));
  if (lonely) out.push(card('🏝️', 'Loneliest pick', `Only ${esc(lonely.e.f.short)} is on ${esc(sideName(lonely.g, lonely.side))} (${lonely.conf} pts).`, lonely.g.fav_no));
  if (early) out.push(card('⏱️', 'Early sweat', `${esc(early.e.f.short)}'s ${early.conf} on ${esc(sideName(early.g, early.side))} goes before Saturday. ${early.st.state === 'post' ? (early.status === 'won' ? 'Already banked.' : 'Already gone. No lead is safe.') : early.st.state === 'in' ? `Live: ${esc(early.st.detail)}.` : ''}`, early.g.fav_no));
  if (modelFav) out.push(card('📈', 'The model\'s favorite family pick', `${esc(modelFav.e.f.short)}'s ${esc(sideName(modelFav.g, modelFav.side))} ${sideSpread(modelFav.g, modelFav.side)}: <b>${pct(modelFav.m.p)}</b> to cover, per the model.`, modelFav.g.fav_no));
  if (modelHate && modelHate !== modelFav) out.push(card('📉', 'The model disagrees', `${esc(modelHate.e.f.short)}'s ${esc(sideName(modelHate.g, modelHate.side))} ${sideSpread(modelHate.g, modelHate.side)}: only <b>${pct(modelHate.m.p)}</b> by the model. Prove it wrong.`, modelHate.g.fav_no));
  out.push(...historyStorylines(E));
  return out.join('');
}
// Storylines from past seasons and from the rest of the league's cards this week. Past results are
// trivia (they don't predict here); styles and the crowd are facts about this week.
function historyStorylines(E) {
  const out = [], fam = E.filter(e => !e.f.shadow && e.f.pool);
  const card = (icon, h, p, game) => `<div class="panel insight ${game ? 'clickable' : ''}" ${game ? `data-game="${game}"` : ''}><h3>${icon} ${h}</h3><p>${p}</p></div>`;
  const lbl = S.ctx?.career.label;
  // Off-script: the biggest departure from someone's usual style.
  let off = null;
  for (const e of fam) { const w = weekStyle(e), m = usual(e.f); if (!m) continue;
    for (const s of STYLE) { const x = w[s.k]; if (x.of < 8) continue; const d = x.n / x.of - m[s.k].share;
      if (Math.abs(d) >= OFF_SCRIPT && (!off || Math.abs(d) > Math.abs(off.d))) off = { e, s, x, d, u: m[s.k].share }; } }
  if (off) out.push(card('🔀', 'Off-script', `${esc(off.e.f.short)} usually puts ${pct(off.u)} of picks on ${off.s.phrase}. This week: <b>${off.x.n} of ${off.x.of}</b>. Pick style barely changes from year to year in this pool, so this is a real change of approach.`));
  // For the record: the most unusual 10s history among this week's 10s.
  const tens = fam.map(e => ({ e, m: usual(e.f), r: e.grade.rows.find(r => r.conf === 10 && r.g) })).filter(x => x.m?.tens.n >= 10 && x.r)
    .sort((a, b) => Math.abs(b.m.tens.cover - 0.5) - Math.abs(a.m.tens.cover - 0.5));
  const t = tens[0];
  if (t) out.push(card('🗂️', 'For the record', `${esc(t.e.f.short)}'s 10s have covered <b>${pct(t.m.tens.cover)}</b> over ${t.m.tens.n} weeks (${lbl}). This week's 10: ${esc(sideName(t.r.g, t.r.side))} ${sideSpread(t.r.g, t.r.side)}. Past 10s haven't predicted the next one here, so it's trivia, not a jinx.`, t.r.g.fav_no));
  // Against the crowd: a family pick most of the league's loaded cards went the other way on.
  const famNames = new Set(FAMILY.map(f => f.pool).filter(Boolean));
  const league = Object.entries(S.week.picks || {}).filter(([n]) => !famNames.has(n)).map(([, p]) => Object.values(p.conf));
  if (league.length >= 20) {
    const lone = fam.flatMap(e => e.grade.rows.filter(r => r.g).map(r => {
      const mine = r.side === 'fav' ? r.g.fav_no : r.g.dog_no, other = r.side === 'fav' ? r.g.dog_no : r.g.fav_no;
      const withMe = league.filter(c => c.includes(mine)).length, against = league.filter(c => c.includes(other)).length;
      return { e, r, withMe, n: withMe + against };
    })).filter(x => x.n >= 10 && x.withMe / x.n < 0.35).sort((a, b) => b.r.conf - a.r.conf || a.withMe / a.n - b.withMe / b.n)[0];
    if (lone) {
      const past = S.ctx ? Object.entries(S.ctx.seasons).sort((a, b) => b[0] - a[0]).map(([y, s]) => { const c = s.rows.filter(r => r.nGame >= 5 && r.pop < 0.35); return c.length ? `${pct(c.filter(r => r.covered).length / c.length)} in ${y}` : null; }).filter(Boolean) : [];
      out.push(card('🧭', 'Against the crowd', `${esc(lone.e.f.short)}'s ${lone.r.conf} on ${esc(sideName(lone.r.g, lone.r.side))} ${sideSpread(lone.r.g, lone.r.side)}: only <b>${lone.withMe} of ${lone.n}</b> league cards on this game agree.${past.length ? ` League-wide, picks like that covered ${past.join(' and ')}: no edge either way.` : ''}`, lone.r.g.fav_no));
    }
  }
  return out;
}
function consensusTable() {
  const games = S.week.games.map(g => ({ g, on: allEntriesForGame(g) })).filter(x => x.on.fav.length || x.on.dog.length)
    .sort((a, b) => (b.on.fav.length + b.on.dog.length) - (a.on.fav.length + a.on.dog.length) || new Date(a.g.espn.kickoff) - new Date(b.g.espn.kickoff));
  if (!games.length) return `<div class="empty">No picks loaded yet.</div>`;
  const r = S.week.research || {};
  return `<table class="stack"><thead><tr><th class="l">Game</th><th class="l">On the favorite</th><th class="l">On the underdog</th><th>Model: fav covers</th><th>Status</th></tr></thead><tbody>
    ${games.map(({ g, on }) => { const st = gameState(g, S.live, S.week.research); const m = r[g.fav_no];
      return `<tr class="row" data-game="${g.fav_no}"><td class="l st-head">${esc(g.fav)} −${fmtHalf(g.spread)} v ${esc(g.dog)}</td>
      <td class="l" data-label="${esc(g.fav)}">${on.fav.map(p => pickChip(p, g, 'fav')).join(' ') || '<span class="muted">–</span>'}</td>
      <td class="l" data-label="${esc(g.dog)}">${on.dog.map(p => pickChip(p, g, 'dog')).join(' ') || '<span class="muted">–</span>'}</td>
      <td class="num" data-label="Model: fav covers">${m ? pct(m.p) : '<span class="muted">–</span>'}</td><td data-label="Status">${st.state === 'pre' ? etTime(g.espn.kickoff) : `${st.favScore}–${st.dogScore} ${esc(st.detail)}`}</td></tr>`; }).join('')}</tbody></table>`;
}
function shadowList() {
  const sh = S.week.shadow; const G = GB();
  return Object.entries(sh.conf).sort((a, b) => b[0] - a[0]).map(([c, no]) => { const { g, side } = G.get(no); const n = sh.notes?.[no] || {};
    const row = gradeEntry(sh, S.week, S.live).rows.find(r => r.conf === +c);
    return `<div class="pickrow clickable" data-game="${g.fav_no}"><span class="cf ${row?.status}">${c}</span><div class="grow"><b>${esc(sideName(g, side))} ${sideSpread(g, side)}</b> <span class="muted">v ${esc(sideName(g, side === 'fav' ? 'dog' : 'fav'))}</span>
      <small>${esc(n.rationale || '')}</small></div><div class="rt">${n.p_low ? `${pct(n.p_low)}–${pct(n.p_high)}` : ''}<br><span class="muted">${esc(n.risk || '')} risk</span></div></div>`; }).join('');
}

// ------------------------------------------------------------ SMACK TALK
function viewTalk() {
  const opts = S.week.games.filter(g => { const o = allEntriesForGame(g); return o.fav.length || o.dog.length; })
    .map(g => `<option value="${g.fav_no}">${esc(g.fav)} v ${esc(g.dog)}</option>`).join('');
  $('#main').innerHTML = `${title('Smack Talk', 'Family only. Keep it spicy, keep it loving')}
    <div class="panel chat"><div class="feed" id="feed">${feed()}</div>
      <form class="compose" id="compose">
        <label class="gtag-pick" title="Attach a game"><span aria-hidden="true">🏈</span><select id="gtag" aria-label="Attach a game"><option value="">No game tag</option>${opts}</select></label>
        <textarea id="body" rows="1" maxlength="1000" enterkeyhint="send" placeholder="Message… (@ to mention)">${esc(S.draft || '')}</textarea>
        <button class="btn gold send" type="submit" aria-label="Send"><span class="send-txt">Send</span><span class="send-ico" aria-hidden="true">➤</span></button></form></div>`;
  fitChat();
  const f = $('#feed'); f.scrollTop = f.scrollHeight;
  const grow = () => { const b = $('#body'); b.style.height = 'auto'; b.style.height = Math.min(b.scrollHeight, 132) + 'px'; };
  grow();
  const hadFocus = S.draftFocus; $('#body').oninput = e => { S.draft = e.target.value; grow(); };
  $('#body').onfocus = () => { S.draftFocus = true; setTimeout(() => { fitChat(); const fd = $('#feed'); if (fd) fd.scrollTop = fd.scrollHeight; }, 250); }; $('#body').onblur = () => S.draftFocus = false;
  if (hadFocus) { const b = $('#body'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  if (S.gtag) $('#gtag').value = S.gtag; $('#gtag').onchange = e => S.gtag = e.target.value;
  $('#compose').onsubmit = async e => { e.preventDefault(); const body = $('#body').value.trim(); if (!body) return;
    try { await db.postMessage(S.user, { body, week: S.week.week, game: $('#gtag').value ? +$('#gtag').value : null }); $('#body').value = ''; S.draft = '';
      if (/@commentator\b/i.test(body)) botWait('queued');
      await refreshSocial(); viewTalk(); }
    catch (err) { alert(err.message); } };
  const menu = mentionMenu($('#body'));
  $('#body').onkeydown = e => { if (menu.handleKey(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#compose').requestSubmit(); } };
  bindReactions($('#main'));
  $$('.gtag').forEach(el => el.onclick = () => openGame(+el.dataset.game));
  $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Delete this message?')) { await db.deleteMessage(+b.dataset.del); await refreshSocial(); viewTalk(); } });
}
// Size the chat to the visible screen (minus the header), tracking the on-screen keyboard.
function fitChat() {
  const chat = $('.chat'); if (!chat) return;
  if (!window.matchMedia('(max-width: 640px)').matches) { chat.style.height = ''; return; }
  const vv = window.visualViewport; const h = vv ? vv.height : window.innerHeight;
  const top = $('header.top').getBoundingClientRect().height;
  chat.style.height = Math.max(260, h - top) + 'px';
}
if (!window.__fitChatBound) {
  window.__fitChatBound = true;
  const onVV = () => { if (S.tab !== 'talk') return; fitChat(); window.scrollTo(0, 0); const fd = $('#feed'); if (fd) fd.scrollTop = fd.scrollHeight; };
  window.visualViewport?.addEventListener('resize', onVV);
  window.addEventListener('resize', onVV); window.addEventListener('orientationchange', onVV);
}
// ---------- "The Commentator is typing…" ----------
// queued: you just tagged it (it checks chat every ~10 s); typing: it broadcast that it's writing.
// Cleared by its reply, its "done" signal, or after 2 minutes.
function botWait(phase) {
  S.botWait = phase ? { phase, at: S.botWait?.at && phase === 'typing' ? S.botWait.at : Date.now() } : null;
  clearInterval(S.botWaitTimer);
  if (S.botWait) S.botWaitTimer = setInterval(() => { if (Date.now() - S.botWait.at > 120e3) botWait(null); else drawTyping(); }, 5e3);
  drawTyping();
}
function botReplied() {
  const last = S.msgs.at(-1);
  if (S.botWait && last?.who === BOT.key && new Date(last.at) >= S.botWait.at - 5e3) botWait(null);
}
function typingHtml() {
  const w = S.botWait; if (!w) return '';
  const secs = (Date.now() - w.at) / 1e3;
  const txt = w.phase === 'typing' ? 'The Commentator is typing' : secs > 45 ? 'Still waiting on the Commentator. It may be offline right now' : 'The Commentator is on it';
  return `<div class="msg typing">${avatar(BOT)}<div class="bubble"><div class="body">${txt}<span class="dots"><i></i><i></i><i></i></span></div></div></div>`;
}
function drawTyping() {
  const box = $('#typing'); if (!box) return;
  const fd = $('#feed'); const atBottom = fd && fd.scrollHeight - fd.scrollTop - fd.clientHeight < 60;
  box.innerHTML = typingHtml();
  if (atBottom) fd.scrollTop = fd.scrollHeight;
}

function feed() {
  return feedMsgs() + `<div id="typing">${typingHtml()}</div>`;
}
function feedMsgs() {
  if (!S.msgs.length) return `<div class="empty">No trash talk yet. Somebody has to start it.</div>`;
  const G = new Map(S.week.games.map(g => [g.fav_no, g]));
  return S.msgs.map(m => { const f = fam(m.who); const mine = m.who === S.user.key; const g = m.game && G.get(m.game);
    return `<div class="msg ${mine ? 'me' : ''}">${avatar(f)}<div class="bubble"><div class="by">${esc(f?.short || m.who)} · ${ago(m.at)}${m.week ? ` · W${m.week}` : ''}${mine ? ` · <a href="javascript:void 0" data-del="${m.id}">delete</a>` : ''}</div>
      ${g ? `<div class="gtag" data-game="${g.fav_no}">🏈 ${esc(g.fav)} v ${esc(g.dog)}</div>` : ''}<div class="body">${withMentions(m.body)}</div>${reactBar(`msg:${m.id}`)}</div></div>`; }).join('');
}
// ---------- @mentions ----------
const handle = f => f.bot ? 'Commentator' : f.short;
const mentionables = () => [BOT, ...FAMILY];
function withMentions(body) {
  const names = new Map(mentionables().map(f => [handle(f).toLowerCase(), f]));
  return esc(body).replace(/(^|\s)@(\w+)/g, (all, pre, name) => { const f = names.get(name.toLowerCase());
    return f ? `${pre}<span class="mention ${f.key === S.user.key ? 'me' : ''}" style="--c:${f.color}">@${esc(handle(f))}</span>` : all; });
}
function mentionMenu(ta) {
  const box = document.createElement('div'); box.className = 'mention-pop hidden'; box.setAttribute('role', 'listbox');
  ta.parentElement.appendChild(box);
  let items = [], idx = 0, start = -1, open = false;
  const close = () => { open = false; box.classList.add('hidden'); };
  const draw = () => { box.innerHTML = items.map((f, i) => `<button type="button" role="option" aria-selected="${i === idx}" class="${i === idx ? 'on' : ''}" data-i="${i}">${avatar(f)}<span>${esc(handle(f))}</span>${f.bot ? '<small>bot</small>' : ''}</button>`).join('');
    box.classList.remove('hidden'); open = true; };
  const query = () => {
    const pos = ta.selectionStart, m = ta.value.slice(0, pos).match(/(^|\s)@(\w*)$/);
    if (!m) return close();
    start = pos - m[2].length - 1; const q = m[2].toLowerCase();
    items = mentionables().filter(f => f.key !== S.user.key && (handle(f).toLowerCase().startsWith(q) || f.key.startsWith(q)));
    if (!items.length) return close();
    idx = Math.min(idx, items.length - 1); draw();
  };
  const pick = i => { const f = items[i]; if (!f) return; const pos = ta.selectionStart; const ins = '@' + handle(f) + ' ';
    ta.value = ta.value.slice(0, start) + ins + ta.value.slice(pos); const c = start + ins.length; ta.setSelectionRange(c, c);
    S.draft = ta.value; close(); ta.focus(); };
  ta.addEventListener('input', () => { idx = 0; query(); });
  ta.addEventListener('click', query);
  ta.addEventListener('blur', () => setTimeout(close, 150));
  box.addEventListener('mousedown', e => { e.preventDefault(); const b = e.target.closest('button'); if (b) pick(+b.dataset.i); });
  return { handleKey(e) {
    if (!open) return false;
    if (e.key === 'ArrowDown') { idx = (idx + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { idx = (idx - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') pick(idx);
    else if (e.key === 'Escape') close();
    else return false;
    e.preventDefault(); return true;
  } };
}
function reactBar(target) {
  const here = S.reacts.filter(r => r.target === target); const by = {};
  for (const r of here) (by[r.emoji] ??= []).push(r.who);
  const chips = Object.entries(by).map(([e, who]) => `<button class="react ${who.includes(S.user.key) ? 'mine' : ''}" data-t="${esc(target)}" data-e="${e}" title="${who.map(k => fam(k)?.short || k).join(', ')}">${e} ${who.length}</button>`).join('');
  return `<div class="reacts">${chips}<button class="react add" data-t="${esc(target)}" data-add="1" title="React">＋🙂</button></div>`;
}
function bindReactions(root, after) {
  $$('.react', root).forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    if (b.dataset.add) return emojiPop(b, after);
    const mine = S.reacts.some(r => r.target === b.dataset.t && r.emoji === b.dataset.e && r.who === S.user.key);
    await db.toggleReaction(S.user, b.dataset.t, b.dataset.e, mine); await refreshSocial(); after ? after() : render();
  });
}
function emojiPop(btn, after) {
  $$('.emoji-pop').forEach(p => p.remove());
  const r = btn.getBoundingClientRect(); const pop = document.createElement('div'); pop.className = 'emoji-pop';
  pop.style.left = `${Math.min(window.innerWidth - 300, r.left + window.scrollX)}px`; pop.style.top = `${r.bottom + window.scrollY + 4}px`;
  pop.innerHTML = REACTIONS.map(e => `<button>${e}</button>`).join(''); document.body.appendChild(pop);
  pop.onclick = async ev => { const e = ev.target.closest('button')?.textContent; pop.remove(); if (!e) return;
    const mine = S.reacts.some(x => x.target === btn.dataset.t && x.emoji === e && x.who === S.user.key);
    await db.toggleReaction(S.user, btn.dataset.t, e, mine); await refreshSocial(); after ? after() : render(); };
  setTimeout(() => document.addEventListener('click', function off(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', off); } }), 0);
}

// ============================================================ CARDS
function gameWhatIf(g) {
  const ws = [S.sim?.whatifs?.find(x => x.favNo === g.fav_no), ...(S.sim?.leagueWhatifs || []).filter(x => x.favNo === g.fav_no)].filter(Boolean);
  const ds = ws.map(w => describeWhatIf(w, S.week, simLabel)).filter(Boolean);
  if (!ds.length) return '';
  return `<h4>What it means for the race</h4>${ds.map(d => `<div class="whatif">${esc(d.text)}</div>`).join('')}`;
}
function openGame(favNo) {
  const g = S.week.games.find(x => x.fav_no === favNo); if (!g) return;
  const draw = () => {
    const st = gameState(g, S.live, S.week.research); const on = allEntriesForGame(g); const live = S.live.get(g.espn?.id);
    const res = S.week.research || {}; const rf = res[g.fav_no], rd = res[g.dog_no];
    const stake = [...on.fav, ...on.dog].reduce((s, p) => s + p.conf, 0);
    const cushion = st.margin == null ? null : st.margin - g.spread;
    const pos = cushion == null ? 50 : Math.max(3, Math.min(97, 50 + cushion / 21 * 47));
    const rows = side => (side === 'fav' ? on.fav : on.dog).map(p => { const r = p.e.grade.rows.find(x => x.conf === p.conf);
      return `<div class="pickrow"><span class="cf ${r?.status}">${p.conf}</span><div class="grow">${avatar(p.e.f)} <b>${esc(p.e.f.short)}</b>${p.e.f.shadow ? ' <span class="shadow-tag">shadow</span>' : ''}</div>
        <div class="rt">${r?.status || ''}</div>${reactBar(`pick:${S.week.week}:${p.e.f.key}:${p.conf}`)}</div>`; }).join('') || '<div class="muted" style="font-size:13px">Nobody in the family.</div>';
    const lead = cushion > 0 ? esc(g.fav) : esc(g.dog);
    const safe = st.state === 'in' && cushion != null ? (Math.abs(cushion) < 8 ? `<b>${lead}'s cover is not safe.</b> ${Math.abs(cushion) <= 3.5 ? 'One score flips it.' : 'One possession from trouble.'}` : Math.abs(cushion) < 14 ? `${lead} is comfortable-ish. No lead is truly safe.` : `${lead}'s cover looks safe… (famous last words)`) : '';
    const espnUrl = g.espn ? `https://www.espn.com/${g.espn.sport === 'nfl' ? 'nfl' : 'college-football'}/game/_/gameId/${g.espn.id}` : null;
    return `${modalHead(`Week ${S.week.week} · ${g.league} · ${st.state === 'pre' ? etTime(g.espn?.kickoff) : st.detail}`, `${esc(g.fav)} −${fmtHalf(g.spread)} <span class="muted">v</span> ${esc(g.dog)}`)}
      <div class="mb">
        ${st.state === 'pre' ? '' : `<div class="kv"><div><b>${st.favScore}–${st.dogScore}</b><span>${esc(g.fav)}–${esc(g.dog)}</span></div>
          <div><b>${cushion > 0 ? esc(g.fav) : esc(g.dog)}</b><span>covering by ${fmtHalf(Math.abs(cushion))}</span></div>
          <div><b>${pct(st.pFav)}</b><span>${esc(g.fav)} cover chance${st.state === 'in' ? ' (live)' : ''}</span></div></div>
          <div class="gauge"><div class="zero"></div><div class="needle" style="left:${pos}%"></div></div>
          <div class="gauge-l"><span>◀ ${esc(g.dog)} covering</span><span>on the number</span><span>${esc(g.fav)} covering ▶</span></div>
          ${safe ? `<p style="margin:8px 0 0">${safe}</p>` : ''}${live?.situation?.last ? `<p class="note">Last play: ${esc(live.situation.last)}</p>` : ''}`}
        <h4>The numbers</h4>
        <div class="kv"><div><b>${esc(g.fav)} −${fmtHalf(g.spread)}</b><span>Pool line (fixed)</span></div>
          <div><b>${esc(live?.odds || '–')}</b><span>ESPN / DraftKings now</span></div>
          ${rf ? `<div><b>${esc(rf.market ?? "–")}</b><span>Market line for ${esc(g.fav)}</span></div><div><b>${pct(rf.p)} / ${pct(rd.p)}</b><span>Model: cover chance fav / dog</span></div>` : ''}
          <div><b>${stake}</b><span>Family points riding</span></div>
          <div><b>${g.home === 'fav' ? esc(g.fav) : g.home === 'dog' ? esc(g.dog) : '–'}</b><span>Home team${g.espn?.neutral ? ' (neutral site)' : ''}</span></div></div>
        ${gameWhatIf(g)}
        <h4>News &amp; injuries</h4><div id="gnews">${newsHtml(g)}</div>
        <h4>${esc(g.fav)} −${fmtHalf(g.spread)} backers</h4>${rows('fav')}
        <h4>${esc(g.dog)} +${fmtHalf(g.spread)} backers</h4>${rows('dog')}
        <h4>Game reactions</h4>${reactBar(`game:${S.week.week}:${g.fav_no}`)}
        ${espnUrl ? `<p class="note"><a href="${espnUrl}" target="_blank" rel="noopener">Open ESPN gamecast ↗</a> · ${esc(g.espn.venue || '')}</p>` : ''}
      </div>`;
  };
  const mount = m => { bindReactions(m, () => { m.innerHTML = draw(); mount(m); }); };
  openModal(draw(), { onMount: mount });
  loadNews(g);
  modalRefresher = () => { const m = $('.modal'); if (m) { m.innerHTML = draw(); mount(m); } };
}

// ---------- game news (ESPN headlines, NFL injuries, line movement) ----------
S.news = new Map();   // espn id -> news, fetched when a game card opens (js/news.js caches 15 min)
function loadNews(g) {
  if (!g.espn?.id) return;
  fetchGameNews(g, S.live).then(n => { S.news.set(g.espn.id, n); const box = $('#gnews'); if (box && $('.modal')) box.innerHTML = newsHtml(g); })
    .catch(() => { const box = $('#gnews'); if (box) box.innerHTML = '<p class="muted" style="font-size:13px">News is unavailable right now.</p>'; });
}
function newsHtml(g) {
  const n = S.news.get(g.espn?.id); if (!n) return '<p class="muted" style="font-size:13px">Loading news…</p>';
  const mv = lineMoveText(g, lineMove(g, S.live));
  const ago = iso => { const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? 'just now' : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
  const inj = side => n.injuries.filter(i => i.side === side).slice(0, 5).map(i => `<li><b>${esc(i.name)}</b> <span class="muted">${esc(i.pos)}</span> · ${esc(i.status)}${i.detail ? ` <span class="muted">(${esc(i.detail)})</span>` : ''}</li>`).join('');
  const injF = inj('fav'), injD = inj('dog');
  const heads = n.articles.slice(0, 6).map(a => `<li>${a.video ? '🎥 ' : ''}${String(a.url || '').startsWith('https://') ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.headline)}</a>` : esc(a.headline)} <span class="muted">· ${esc(a.side === 'fav' ? g.fav : g.dog)} · ${ago(a.published)}</span></li>`).join('');
  return `${mv ? `<p class="news-line">📉 ${esc(mv)}</p>` : ''}
    ${injF || injD ? `<div class="grid two news-inj">${injF ? `<div><div class="news-h">${esc(g.fav)} injuries</div><ul class="sr-list">${injF}</ul></div>` : ''}${injD ? `<div><div class="news-h">${esc(g.dog)} injuries</div><ul class="sr-list">${injD}</ul></div>` : ''}</div>` : ''}
    ${heads ? `<ul class="sr-list news-list">${heads}</ul>` : '<p class="muted" style="font-size:13px">No recent headlines for these teams.</p>'}
    <p class="note">From ESPN${g.league === 'NFL' ? '' : '. College injury reports aren’t published'}; the Commentator sees these too.</p>`;
}

function openMember(key) {
  const f = fam(key); const e = entries().find(x => x.f.key === key); const T = leagueTable();
  const row = T.rows.find(r => r.f === f); const sh = f.shadow ? shadowRow() : null;
  const weeks = f.shadow ? sh.weeks : row?.weeks || [];
  const leagueAvg = Array.from({ length: T.weeks }, (_, w) => Math.round(mean(T.rows.map(r => r.weeks[w]).filter(v => v != null))));
  const played = weeks.filter(v => v != null);
  const draw = () => {
    const grade = e.picks ? gradeEntry(e.picks, S.week, S.live) : null;
    const picks = grade ? grade.rows.map(r => r.g ? `<div class="pickrow clickable" data-game="${r.g.fav_no}"><span class="cf ${r.status}">${r.conf}</span>
      <div class="grow"><b>${esc(sideName(r.g, r.side))} ${sideSpread(r.g, r.side)}</b> <span class="muted">v ${esc(sideName(r.g, r.side === 'fav' ? 'dog' : 'fav'))}</span>
      <small>${r.g.league} · ${r.st.state === 'pre' ? etTime(r.g.espn.kickoff) : `${r.st.favScore}–${r.st.dogScore} ${esc(r.st.detail)}`}${r.cushion != null && r.st.state !== 'pre' ? ` · ${r.cushion > 0 ? 'covering' : 'short'} by ${fmtHalf(Math.abs(r.cushion))}` : ''}</small></div>
      <div class="rt">${r.st.state === 'post' ? (r.status === 'won' ? `+${r.conf}` : '0') : pct(r.pSide)}<br><span class="muted">${r.st.state === 'post' ? r.status : 'to cover'}</span></div>
      ${reactBar(`pick:${S.week.week}:${key}:${r.conf}`)}</div>` : `<div class="pickrow"><span class="cf">${r.conf}</span><div class="grow">Pool #${r.no} isn't on this week's sheet</div></div>`).join('') : `<div class="muted">No picks loaded for week ${S.week.week} yet.</div>`;
    return `${modalHead(f.shadow ? 'Shadow card · unofficial' : `League ${row?.rankLabel ?? '–'} of ${T.n}`, `${esc(f.short)}${f.pool ? ` <span class="muted" style="font-size:14px">${esc(f.pool)}</span>` : ''}`, avatar(f, 'lg'))}
      <div class="mb">
        ${f.shadow ? `<p class="note" style="margin-top:0">${esc(f.note)}</p>` : ''}
        <div class="kv">${grade ? `<div><b>${grade.banked}</b><span>Week ${S.week.week} banked</span></div><div><b>${grade.maxPossible}</b><span>Max possible</span></div><div><b>${fmt1(grade.expected)}</b><span>Expected</span></div>` : ''}
          <div><b>${f.shadow ? sh.total : row?.total ?? '–'}</b><span>${f.shadow ? `Since week ${sh.since}` : 'Season total'}</span></div>
          <div><b>${played.length ? fmt1(mean(played)) : '–'}</b><span>Avg per week (league ${fmt1(mean(leagueAvg))})</span></div>
          <div><b>${played.length ? Math.max(...played) : '–'}</b><span>Best week</span></div>
          ${row ? `<div><b>${pctile(row.rank, T.n)}</b><span>League percentile</span></div>` : ''}</div>
        ${T.weeks ? `<h4>Weekly scores vs league average</h4><div class="chart" style="padding:0">${lineChart({ labels: Array.from({ length: T.weeks }, (_, i) => `W${i + 1}`), yMin: 0, yMax: 55, height: 150,
          series: [{ label: 'League avg', color: 'var(--ink-3)', values: leagueAvg, dash: '4 4' }, { label: f.short, color: f.color, values: weeks, width: 3 }] })}</div>
          ${row?.wrank ? `<div class="note">Weekly league ranks: ${row.wrank.map((r, i) => `W${i + 1} #${r}`).join(' · ')}</div>` : ''}` : ''}
        ${f.pool ? `<p style="margin:12px 0 0"><a href="#" class="plink" data-profile="${esc(f.pool)}">📈 Scouting report: how ${esc(f.short)} picks, history and the neighborhood →</a></p>` : ''}
        <h4>Week ${S.week.week} card</h4>${picks}
      </div>`;
  };
  const mount = m => { $$('[data-game]', m).forEach(el => el.onclick = ev => { if (ev.target.closest('.react')) return; openGame(+el.dataset.game); }); bindProfileLinks(m); bindReactions(m, () => { m.innerHTML = draw(); mount(m); }); };
  openModal(draw(), { onMount: mount });
  modalRefresher = () => { const m = $('.modal'); if (m) { m.innerHTML = draw(); mount(m); } };
}

function openLeagueMember(name) {
  const f = famByPool(name); if (f) return openMember(f.key);
  const T = leagueTable(); const r = T.rows.find(x => x.name === name); if (!r) return;
  const fams = T.rows.filter(x => x.f);
  openModal(`${modalHead(`League ${r.rankLabel} of ${T.n}`, esc(name))}<div class="mb">
    <div class="kv"><div><b>${r.total}</b><span>Season total</span></div><div><b>${fmt1(mean(r.weeks.filter(v => v != null)))}</b><span>Avg per week</span></div><div><b>${pctile(r.rank, T.n)}</b><span>Percentile</span></div></div>
    <h4>Weekly</h4><div class="chart" style="padding:0">${lineChart({ labels: r.weeks.map((_, i) => `W${i + 1}`), yMin: 0, yMax: 55, height: 140, series: [{ label: name, color: 'var(--slate)', values: r.weeks, width: 3 }] })}</div>
    <h4>Versus the family</h4>${fams.map(x => `<div class="stat-row"><span>${avatar(x.f)} ${esc(x.f.short)}</span><span class="num">${x.total > r.total ? `${esc(x.f.short)} leads by ${x.total - r.total}` : x.total < r.total ? `trails by ${r.total - x.total}` : 'tied'}</span></div>`).join('')}
  </div>`);
  modalRefresher = null;
}

// The rivalry card: this week's odds and the games that decide it, the all-time record, how they
// pick differently, and the running gap this season.
function openH2H(aKey, bKey) {
  const T = leagueTable(); const sh = shadowRow();
  const fa = fam(aKey), fb = fam(bKey); if (!fa || !fb) return;
  const rowOf = f => f.shadow ? { name: 'Shadow card', f, weeks: sh.weeks, total: sh.total } : T.rows.find(r => r.f === f);
  const a = rowOf(fa), b = rowOf(fb); if (!a || !b) return;
  const nA = esc(fa.shadow ? 'Shadow card' : fa.short), nB = esc(fb.shadow ? 'Shadow card' : fb.short);
  const ea = entries().find(e => e.f === fa), eb = entries().find(e => e.f === fb);
  const ga = ea?.picks ? gradeEntry(ea.picks, S.week, S.live) : null, gb = eb?.picks ? gradeEntry(eb.picks, S.week, S.live) : null;
  const pWin = S.sim?.h2h?.[fa.key]?.[fb.key];

  // What decides this week: games where their picks differ, with the net swing either way.
  const confOn = (e, no) => { for (const [c, n] of Object.entries(e?.picks?.conf || {})) if (n === no) return +c; return 0; };
  const deciders = ga && gb ? S.week.games.map(g => {
    const aF = confOn(ea, g.fav_no), aD = confOn(ea, g.dog_no), bF = confOn(eb, g.fav_no), bD = confOn(eb, g.dog_no);
    const ifFav = aF - bF, ifDog = aD - bD; if (ifFav === ifDog) return null;   // same result either way
    return { g, ifFav, ifDog, stake: Math.abs(ifFav - ifDog), st: gameState(g, S.live, S.week.research) };
  }).filter(Boolean).sort((x, y) => (x.st.state === 'post') - (y.st.state === 'post') || y.stake - x.stake) : [];
  const swingTxt = n => (n > 0 ? `<b>${nA} +${n}</b>` : n < 0 ? `<b>${nB} +${-n}</b>` : '<span class="muted">even</span>');
  // Finished games collapse to one line: who banked what from the games that split them.
  const done = deciders.filter(d => d.st.state === 'post').map(d => (d.st.margin - d.g.spread > 0 ? d.ifFav : d.ifDog));
  const gotA = done.filter(n => n > 0).reduce((t, n) => t + n, 0), gotB = -done.filter(n => n < 0).reduce((t, n) => t + n, 0);
  const doneLine = done.length ? `<p class="note">Already decided (${done.length} game${done.length > 1 ? 's' : ''}): ${nA} +${gotA}, ${nB} +${gotB}${gotA !== gotB ? `, so ${gotA > gotB ? nA : nB} is up ${Math.abs(gotA - gotB)} from the games that split them` : ''}.</p>` : '';
  const decRows = deciders.filter(d => d.st.state !== 'post').map(d => { const g = d.g; const done = d.st.state === 'post'; const favWon = done ? d.st.margin - g.spread > 0 : null;
    return `<div class="pickrow clickable" data-game="${g.fav_no}"><div class="grow"><div>${esc(g.fav)} −${fmtHalf(g.spread)} covers → ${swingTxt(d.ifFav)}${done && favWon ? ' ✓' : ''}</div>
      <div>${esc(g.dog)} +${fmtHalf(g.spread)} covers → ${swingTxt(d.ifDog)}${done && !favWon ? ' ✓' : ''}</div></div>
      <div class="rt">${done ? 'Final' : d.st.state === 'in' ? esc(d.st.detail) : etTime(g.espn?.kickoff)}<br><span class="muted">${d.stake} pt swing</span></div></div>`; }).join('');

  // All-time record, per season, and the biggest single-week win each way.
  const at = fa.shadow || fb.shadow ? null : h2hAllTime(fa, fb, T);
  let bigA = null, bigB = null;
  if (at) for (const y of [...Object.keys(S.ctx?.seasons || {}), 'now']) {
    const wa = h2hWeeks(fa, y, T), wb = h2hWeeks(fb, y, T); if (!wa || !wb) continue;
    wa.forEach((v, i) => { const u = wb[i]; if (v == null || u == null) return; const d = v - u; const lab = y === 'now' ? `week ${i + 1} this season` : `${y} week ${i + 1}`;
      if (d > 0 && (!bigA || d > bigA.d)) bigA = { d, v, u, lab }; if (d < 0 && (!bigB || -d > bigB.d)) bigB = { d: -d, v: u, u: v, lab }; });
  }
  const leader = at && (at.tot.w > at.tot.l ? `${nA} leads` : at.tot.w < at.tot.l ? `${nB} leads` : 'Dead even');

  // How they pick: two-season usual for each (style carries over; results don't).
  const ma = usual(fa), mb = usual(fb);
  const styleRows = ma && mb ? STYLE.map(st => `<div class="stat-row"><span>${st.label}</span><span class="num">${pct(ma[st.k].share)} <span class="muted">vs</span> ${pct(mb[st.k].share)}</span></div>`).join('')
    + `<div class="stat-row"><span>Their 10s covered</span><span class="num">${pct(ma.tens.cover)} <span class="muted">vs</span> ${pct(mb.tens.cover)}</span></div>` : '';

  // Running gap this season.
  let run = 0; const gap = a.weeks.map((v, i) => { const u = b.weeks[i]; if (v == null || u == null) return null; run += v - u; return run; });
  const weekRows = a.weeks.map((v, i) => { const u = b.weeks[i]; if (v == null && u == null) return ''; const w = v != null && u != null ? (v > u ? nA : v < u ? nB : 'Tie') : '–';
    return `<div class="stat-row"><span>Week ${i + 1}</span><span class="num">${v ?? '–'} – ${u ?? '–'} <span class="muted">· ${w}</span></span></div>`; }).join('');

  openModal(`${modalHead('Rivalry', `${avatar(fa)} ${nA} <span class="muted">vs</span> ${avatar(fb)} ${nB}`)}<div class="mb">
    <div class="kv"><div><b>${a.total} – ${b.total}</b><span>${fa.shadow || fb.shadow ? 'Totals (shadow era only for shadow)' : 'Season totals'}</span></div>
      ${recTxt(h2hRecord(a.weeks, b.weeks)) !== '–' ? `<div><b>${recTxt(h2hRecord(a.weeks, b.weeks))}</b><span>This season, weekly (${nA} first)</span></div>` : ''}
      ${at?.per.length > 1 ? `<div><b>${recTxt(at.tot)}</b><span>All-time · ${leader}</span></div>` : ''}
      ${pWin != null ? `<div><b>${pct(pWin)}</b><span>${nA} outscores ${nB} this week</span></div>` : ''}
      ${ga && gb ? `<div><b>${ga.banked} – ${gb.banked}</b><span>Week ${S.week.week} so far</span></div>` : ''}</div>
    ${ga && gb ? `<h4>What decides it this week</h4>${decRows || (deciders.length ? '<p class="muted" style="font-size:13px">Every game that splits them is over.</p>' : '<p class="muted" style="font-size:13px">Identical cards this week: whatever happens, they score the same.</p>')}${doneLine}
      <p class="note">Only games where their picks differ can change who wins the week. The swing is how many points it moves between them.</p>`
      : `<p class="note">This week's comparison appears once both pick sheets are loaded.</p>`}
    ${at?.per.length ? `<h4>All-time</h4>${at.per.map(x => `<div class="stat-row"><span>${x.y === 'now' ? 'This season' : x.y}</span><span class="num">${recTxt(x.r)}</span></div>`).join('')}
      ${bigA || bigB ? `<p class="note">Biggest wins: ${bigA ? `${nA} ${bigA.v}–${bigA.u} (${bigA.lab})` : ''}${bigA && bigB ? ' · ' : ''}${bigB ? `${nB} ${bigB.v}–${bigB.u} (${bigB.lab})` : ''}.</p>` : ''}` : ''}
    ${styleRows ? `<h4>How they pick <span class="muted" style="text-transform:none;letter-spacing:0">(${nA} vs ${nB}, past seasons)</span></h4>${styleRows}
      <p class="note">Pick style carries over from year to year in this pool; past results don't, so these are habits, not a forecast.</p>` : ''}
    ${gap.filter(v => v != null).length >= 2 ? `<h4>The gap this season</h4><div class="chart" style="padding:0">${lineChart({ labels: gap.map((_, i) => `W${i + 1}`), height: 140,
      series: [{ label: 'Even', color: 'var(--ink-3)', values: gap.map(() => 0), dash: '4 4' }, { label: `${fa.short} minus ${fb.short}`, color: fa.color, values: gap, width: 3 }] })}</div>
      <p class="note">Above the line: ${nA} ahead on season points. Below: ${nB}.</p>` : ''}
    <h4>Week by week</h4>${weekRows}
  </div>`, { onMount: m => { $$('[data-game]', m).forEach(el => el.onclick = () => openGame(+el.dataset.game)); } });
  modalRefresher = null;
}

function openWeekSpread(T) {
  const fams = T.rows.filter(r => r.f);
  const rowsHtml = Array.from({ length: T.weeks }, (_, w) => { const col = T.rows.map(r => r.weeks[w]).filter(v => v != null);
    return `<div class="stat-row"><span>Week ${w + 1}</span><span class="num">avg ${fmt1(mean(col))} · median ${median(col)} · top 25% ≥ ${Math.round(quantile(col, .75))} · high ${Math.max(...col)}</span></div>`; }).join('');
  openModal(`${modalHead('League pulse', 'How hard was each week?')}<div class="mb">${rowsHtml}
    <h4>Family weekly ranks</h4>${fams.map(r => `<div class="stat-row"><span>${avatar(r.f)} ${esc(r.f.short)}</span><span class="num">${r.wrank.map((x, i) => `W${i + 1} #${x}`).join(' · ')}</span></div>`).join('')}
    <p class="note">A 6–4 week can still score in the 20s if the misses carry the big confidence numbers.</p></div>`);
  modalRefresher = null;
}

function openMotto() {
  openModal(`${modalHead('Family motto', 'Nullum praesidium securum est')}<div class="mb motto-card">
    <img src="assets/crest-640.webp" alt="Smelley family crest">
    <div class="la">${MOTTO}</div><p><b>"${MOTTO_EN}."</b></p>
    <p style="text-align:left">It's the oldest truth in baseball and football, and it's this family's creed. A 10 run lead at the top of the 9th? Not safe. A 17-point lead in the fourth quarter? Not safe. Covering by 10 with two minutes left? Not safe. Lead Watch on the Game Day tab tracks exactly that: every family pick that's ahead but still within reach.</p>
    <p class="note" style="text-align:left">The crest: the peach and crossed bats for Georgia, the bison (because Lets go Buffalo!), the state itself, and the golden locomotive because Tarun likes trains (also Lula?). Tap around the dashboard; almost everything opens a card with more info.</p></div>`);
  modalRefresher = null;
}

// ------------------------------------------------------------ HELP
function viewHelp() {
  const groups = HELP.filter(g => !g.admin || S.user.admin);
  $('#main').innerHTML = `${title('Help', 'How everything works, and what to do when something doesn’t')}
    <input class="search help-search" id="hq" placeholder="Search help, e.g. password, hook, reactions…" value="${esc(S.helpQ || '')}">
    <div class="help-toc" id="htoc">${groups.map(g => `<a href="#" data-g="${esc(g.group)}">${esc(g.group)}</a>`).join('')}</div>
    <div id="hbody"></div>
    <p class="note">Still stuck? Post in Smack Talk or text Tarun.</p>`;
  const draw = () => {
    const q = (S.helpQ || '').trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const match = t => !words.length || words.every(w => (t.title + ' ' + t.keys + ' ' + t.body.replace(/<[^>]+>/g, ' ')).toLowerCase().includes(w));
    const html = groups.map(g => { const ts = g.topics.filter(match); if (!ts.length) return '';
      return `<section class="help-group" data-group="${esc(g.group)}"><h3 class="help-gh">${esc(g.group)}</h3>${ts.map(t =>
        `<details class="panel help-item" id="help-${t.id}" ${words.length ? 'open' : ''}><summary>${esc(t.title)}</summary><div class="help-body">${t.body}</div></details>`).join('')}</section>`; }).join('');
    $('#hbody').innerHTML = html || '<div class="panel empty">No help topics match that. Try another word, or ask in Smack Talk.</div>';
  };
  draw();
  $('#hq').oninput = e => { S.helpQ = e.target.value; draw(); };
  $$('#htoc a').forEach(a => a.onclick = e => { e.preventDefault(); S.helpQ = ''; $('#hq').value = ''; draw();
    document.querySelector(`[data-group="${CSS.escape(a.dataset.g)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

// ------------------------------------------------------------ HISTORY + SCOUTING REPORTS
// Past seasons load on demand (~450 KB each), then every name can open a scouting report.
async function ensureHistory() {
  if (S.ctx) return S.ctx;
  if (!S.histLoading) S.histLoading = (async () => {
    const got = await Promise.all(HISTORY_SEASONS.map(y => db.loadDataset(`history${y}`).catch(() => null)));
    S.hist = Object.fromEntries(HISTORY_SEASONS.map((y, i) => [y, got[i]]).filter(([, a]) => a));
    S.ctx = buildContext({ archives: S.hist, league: S.league });
    return S.ctx;
  })();
  return S.histLoading;
}
const pctS = x => (x == null ? '–' : `${Math.round(x * 100)}%`);
const famOf = name => FAMILY.find(f => f.pool && (f.pool === name || samePerson(f.pool, name)));
const nameLink = (name, extra = '') => `<a href="#" class="plink" data-profile="${esc(name)}">${esc(name)}</a>${extra}`;
function bindProfileLinks(root = document) {
  $$('[data-profile]', root).forEach(el => el.onclick = e => { e.preventDefault(); e.stopPropagation(); openProfile(el.dataset.profile); });
}

async function openProfile(name) {
  openModal(`${modalHead('Scouting report', esc(name))}<div class="mb"><div class="empty">Crunching the numbers…</div></div>`);
  modalRefresher = null;
  const ctx = await ensureHistory();
  const rep = scoutingReport(ctx, name);
  const T = leagueTable(); const now = T.rows.find(r => r.name === name || samePerson(r.name, name));
  const f = famOf(name);
  // Headline numbers from the latest season; tendencies from every season pooled.
  const last = rep.seasons[0]; const m = rep.career?.metrics; const P = ctx.career.pooled, Z = ctx.career.spread; const cl = rep.career?.label || '';
  const pY = S.profYr?.name === name ? S.profYr.yr : null; const chartYr = pY && rep.seasons.some(s => s.season === pY && s.entry) ? pY : last?.season;
  const cs = rep.seasons.find(s => s.season === chartYr);
  const bar = (label, mine, typical, cover) => `<div class="sr-row"><div class="sr-l">${label}</div>
      <div class="sr-bar"><i style="width:${Math.min(100, mine * 100)}%"></i><b style="left:${Math.min(100, typical * 100)}%" title="League typical ${pctS(typical)}"></b></div>
      <div class="sr-v">${pctS(mine)}<small>${cover != null ? ` · covered ${pctS(cover)}` : ''}</small></div></div>`;
  const tier = (label, s, base) => `<div class="stat-row"><span>${label}</span><span class="num">${s?.cover != null ? `${pctS(s.cover)} <span class="muted">of ${s.n} · league ${pctS(base)}</span>` : '–'}</span></div>`;
  const nb = rep.neighborhood;
  const nbRow = x => `<tr class="${x.name === nb.me.name ? 'me-row' : ''}"><td class="num">${x.tied ? 'T-' : ''}${x.rank}</td><td class="l">${x.name === nb.me.name ? `<b>${esc(x.name)}</b>` : nameLink(x.name)}</td>
      <td class="num">${x.total}</td><td class="num muted">${x.name === nb.me.name ? '' : x.gap > 0 ? '+' + x.gap : x.gap === 0 ? 'tied' : x.gap}</td>
      ${(x.past || []).map((p, i, a) => `<td class="num ${i < a.length - 1 ? 'opt' : ''}">${p?.rank ?? '–'}</td>`).join('')}<td class="num">${pctS(x.metrics?.cover)}</td><td class="num">${pctS(x.metrics?.dog.share)}</td><td class="num opt">${x.metrics ? (x.metrics.orderEdgePerWeek >= 0 ? '+' : '') + x.metrics.orderEdgePerWeek.toFixed(1) : '–'}</td></tr>`;
  const weekly = cs?.entry?.weeks || [];
  const lgAvgW = cs ? ctx.seasons[cs.season].archive.entries[0].weeks.map((_, w) => { const v = ctx.seasons[cs.season].archive.entries.map(e => e.weeks[w]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }) : [];
  const withEntry = rep.seasons.filter(s => s.entry);
  const seasonRows = withEntry.length > 1 ? `<h4>Season by season</h4><div class="tbl-wrap"><table><thead><tr><th class="l">Season</th><th>Finish</th><th>Wk avg</th><th>Best</th><th>Top-4s</th><th>Bowls</th><th>Cover</th><th>10s</th></tr></thead><tbody>${withEntry.map(s =>
    `<tr><td class="l">${s.season}</td><td class="num">#${s.entry.seasonRank ?? s.entry.guruRank} <span class="muted">of ${s.entries}</span></td><td class="num">${s.weekly.mean?.toFixed(1) ?? '–'}</td><td class="num">${s.weekly.best ?? '–'}</td><td class="num">${s.top4.length}</td><td class="num">${s.bowls ? '#' + s.bowls.rank : '–'}</td><td class="num">${pctS(s.metrics?.cover)}</td><td class="num">${pctS(s.metrics?.tens.cover)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const thisWeek = S.week.picks?.[name] || (f && S.week.picks?.[f.pool]);
  const lessonsLg = lessonVerdicts(ctx).filter(l => l.verdict === 'held').slice(0, 3);   // only patterns that held every season
  const html = `${modalHead(f ? `Scouting report · family` : 'Scouting report', `${f ? avatar(f) + ' ' : ''}${esc(name)}`)}<div class="mb">
    <div class="kv">
      <div><b>${now ? `${now.rankLabel}` : '–'}</b><span>This season (${now ? now.total + ' pts' : 'not ranked'})</span></div>
      ${last?.entry ? `<div><b>#${last.entry.seasonRank ?? last.entry.guruRank}</b><span>${last.season} finish (of ${last.entries})</span></div>
      <div><b>${last.weekly.mean.toFixed(1)}</b><span>${last.season} weekly avg (league ${last.weekly.leagueAvg.toFixed(1)})</span></div>` : ''}
      ${m ? `<div><b>${pctS(m.cover)}</b><span>Picks covered, ${cl} (${m.n.toLocaleString()})</span></div>
      <div><b>${m.orderEdgePerWeek >= 0 ? '+' : ''}${m.orderEdgePerWeek.toFixed(1)}</b><span>Points a week from confidence ordering</span></div>` : ''}
      ${last?.bowls ? `<div><b>#${last.bowls.rank}</b><span>${last.season} bowl pool (${last.bowls.points} pts)</span></div>` : ''}
    </div>
    ${seasonRows}
    ${rep.quirks.length ? `<h4>What stands out <span class="muted" style="text-transform:none;letter-spacing:0">(${cl})</span></h4><ul class="sr-list">${rep.quirks.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
    ${m ? `<h4>How they pick, ${cl} <span class="muted" style="text-transform:none;letter-spacing:0">(bar = share of picks · tick = league typical)</span></h4>
      ${bar('Underdogs', m.dog.share, Z.dog.mu, m.dog.cover)}${bar('Home teams', m.home.share, Z.home.mu, m.home.cover)}${bar('NFL games', m.nfl.share, Z.nfl.mu, m.nfl.cover)}
      ${bar('Big favorites (10+)', m.bigFav.share, Z.bigFav.mu, m.bigFav.cover)}${bar('Big underdogs (10+)', m.bigDog.share, Z.bigDog.mu, m.bigDog.cover)}${bar('Contrarian picks', m.contrarian.share, Z.contrarian.mu, m.contrarian.cover)}
      <h4>By confidence</h4>${tier('High (8–10)', m.top, P.top.cover)}${tier('Middle (4–7)', m.mid, P.mid.cover)}${tier('Low (1–3)', m.low, P.low.cover)}${tier('Their 10s', m.tens, P.tens.cover)}` : ''}
    ${weekly.some(v => v != null) ? `<h4>${chartYr} week by week</h4>${withEntry.length > 1 ? `<div class="filters">${withEntry.map(s => `<button class="chip ${s.season === chartYr ? 'on' : ''}" data-pyr="${s.season}">${s.season}</button>`).join('')}</div>` : ''}<div class="chart" style="padding:0">${lineChart({ labels: weekly.map((_, i) => `W${i + 1}`), yMin: 0, yMax: 55, height: 150,
      series: [{ label: 'League avg', color: 'var(--ink-3)', values: lgAvgW, dash: '4 4' }, { label: name, color: f?.color || 'var(--gold)', values: weekly, width: 3 }] })}</div>
      ${cs.top4.length ? `<div class="note">Weekly top-4 finishes: ${cs.top4.map(t => `Week ${t.week} (#${t.place})`).join(', ')}</div>` : ''}` : ''}
    ${nb ? `<h4>The neighborhood (this season's standings)</h4><div class="tbl-wrap"><table class="nb"><thead><tr><th>#</th><th class="l">Name</th><th>Pts</th><th>Gap</th>${(nb.seasons || []).map((y, i, a) => `<th class="${i < a.length - 1 ? 'opt' : ''}">'${String(y).slice(2)}</th>`).join('')}<th>Cover</th><th>Dogs</th><th class="opt">Order</th></tr></thead>
      <tbody>${[...nb.above, nb.me, ...nb.below].map(nbRow).join('')}</tbody></table></div>
      ${rep.lessons.length ? `<h4>What separates them</h4><ul class="sr-list">${rep.lessons.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}` : ''}
    ${lessonsLg.length ? `<h4>What held up league-wide, ${ctx.career.label}</h4><ul class="sr-list">${lessonsLg.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>` : ''}
    ${thisWeek ? `<h4>This week's card</h4><div class="picks" style="gap:6px">${Object.entries(thisWeek.conf).sort((a, b) => b[0] - a[0]).map(([c, no]) => { const h = GB().get(no); return h ? `<span class="pk">${c} · ${esc(sideName(h.g, h.side))} ${sideSpread(h.g, h.side)}</span>` : ''; }).join('')}</div>` : ''}
    <p class="note">${esc(rep.caveat)}</p>
  </div>`;
  const mEl = $('.modal'); if (!mEl) return;
  mEl.innerHTML = html; bindProfileLinks(mEl); mEl.querySelector('[data-x]').onclick = closeModal;
  mEl.querySelectorAll('[data-pyr]').forEach(b => b.onclick = () => { S.profYr = { name, yr: +b.dataset.pyr }; openProfile(name); });
}

// ---- History tab
async function viewHistory() {
  $('#main').innerHTML = `${title('History', 'Past seasons, rebuilt pick by pick from the commissioner’s files')}<div class="empty">Loading the archive…</div>`;
  const ctx = await ensureHistory();
  const yrs = Object.keys(ctx.seasons).sort();
  if (!yrs.length) { $('#main').innerHTML = `${title('History')}<div class="panel empty">No past seasons loaded yet.</div>`; return; }
  const yr = S.histYr === 'all' || ctx.seasons[S.histYr] ? S.histYr : yrs[yrs.length - 1];
  const yrChips = yrs.length > 1 ? `<div class="filters">${[...yrs].reverse().map(y => `<button class="chip ${y === yr ? 'on' : ''}" data-hyr="${y}">${y}</button>`).join('')}<button class="chip ${yr === 'all' ? 'on' : ''}" data-hyr="all">All seasons</button></div>` : '';
  const bindChips = () => $$('[data-hyr]').forEach(b => b.onclick = () => { S.histYr = b.dataset.hyr; viewHistory(); });
  if (yr === 'all') { viewHistoryAll(ctx, yrs, yrChips); bindChips(); return; }
  const A = ctx.seasons[yr].archive; const n = A.entries.length;
  const fam = FAMILY.filter(f => !f.shadow).map(f => ({ f, e: A.entries.find(e => f.pool && (e.name === f.pool || samePerson(e.name, f.pool))), rep: f.pool ? scoutingReport(ctx, f.pool) : null })).filter(x => x.e);
  const aw = A.winners?.awards || {};
  const champ = (k, label) => aw[k] ? `<div class="champ"><span class="muted">${label}</span><b>${nameLink(aw[k][0])}</b><small>${aw[k].slice(1, 4).map(x => esc(x)).join(' · ')}</small></div>` : '';
  const famRows = fam.sort((a, b) => (a.e.seasonRank ?? 999) - (b.e.seasonRank ?? 999)).map(({ f, e, rep }) => { const s = rep.seasons.find(x => x.season === +yr);
    return `<tr class="row" data-profile="${esc(e.name)}"><td class="l">${avatar(f)} ${esc(f.short)}</td><td class="num">#${e.seasonRank ?? '–'}</td><td class="num">${e.total}</td><td class="num">${s?.weekly.mean?.toFixed(1) ?? '–'}</td><td class="num">${s?.weekly.best ?? '–'}</td><td class="num">${s?.top4.length || 0}</td><td class="num">${s?.bowls ? '#' + s.bowls.rank : '–'}</td><td class="num">${pctS(s?.metrics?.cover)}</td></tr>`; }).join('');
  const weeksN = 19; const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const famNames = new Set(fam.map(x => x.e.name));
  const famAvg = Array.from({ length: weeksN }, (_, w) => avg(fam.map(x => x.e.weeks[w]).filter(v => v != null)));
  const lgAvg = Array.from({ length: weeksN }, (_, w) => avg(A.entries.filter(e => !famNames.has(e.name)).map(e => e.weeks[w]).filter(v => v != null)));
  const beat = famAvg.filter((v, w) => v != null && lgAvg[w] != null && v > lgAvg[w]).length;
  const bb = Array.from({ length: weeksN }, (_, w) => Math.max(...fam.map(x => x.e.weeks[w] ?? 0))).reduce((a, b) => a + b, 0);
  const bbRank = 1 + A.entries.filter(e => (e.total ?? 0) > bb).length;
  const lessons = leagueLessons(ctx, yr);
  const weekOpts = A.weeks.map(w => `<option value="${w.week}">Week ${w.week}${w.picks ? '' : ' (no pick sheet)'}</option>`).join('');
  $('#main').innerHTML = `${title(`${yr} season`, `${n} entries · every pick graded against ESPN final scores · tap any name for a scouting report`)}
    ${yrChips}
    <div class="grid two">
      <div class="panel insight"><h3>🏆 Champions</h3><div class="champs">${champ('Guru Season', 'Season')}${champ('Guru Weeks 1-19', 'Weeks 1–19')}${champ('Bowls', 'Bowl pool')}</div></div>
      <div class="panel insight"><h3>🏟️ The family vs the league</h3>
        <div class="kv"><div><b>${beat} of ${famAvg.filter(v => v != null).length}</b><span>Weeks the family beat the league average</span></div>
          <div><b>${bb} <span class="muted" style="font-size:13px">#${bbRank}</span></b><span>"Team Smelley" best-ball would have ranked</span></div></div>
        <div class="chart" style="padding:0;margin-top:8px">${lineChart({ labels: famAvg.map((_, i) => `W${i + 1}`), yMin: 0, yMax: 50, height: 140, series: [{ label: 'League', color: 'var(--ink-3)', values: lgAvg, dash: '4 4' }, { label: 'Family', color: 'var(--gold)', values: famAvg, width: 3 }] })}</div>
        <div class="legend"><span><i style="background:var(--gold)"></i>Family average</span><span><i style="background:var(--ink-3)"></i>Rest of the league</span></div></div>
    </div>
    ${title('The family in ' + yr)}
    <div class="panel tbl-wrap"><table><thead><tr><th class="l">Name</th><th>Finish</th><th>Wk pts</th><th>Avg</th><th>Best</th><th>Top-4s</th><th>Bowls</th><th>Cover</th></tr></thead><tbody>${famRows}</tbody></table></div>
    ${title('What worked league-wide', `${yr}, all ${A.weeks.reduce((s, w) => s + (w.picks ? Object.keys(w.picks).length : 0), 0).toLocaleString()} cards · ★ = a real pattern, not noise`)}
    <div class="panel insight">${lessons.map(l => `<div class="stat-row"><span>${l.significant ? '★ ' : ''}${esc(l.text)}</span></div>`).join('')}</div>
    ${title('Week by week')}
    <div class="filters"><select id="hWeek" class="search">${weekOpts}</select></div><div id="hWeekBody"></div>`;
  const drawWeek = w => {
    const W = A.weeks.find(x => x.week === w); const box = $('#hWeekBody');
    const scores = A.entries.map(e => ({ name: e.name, s: e.weeks[w - 1] })).filter(x => x.s != null).sort((a, b) => b.s - a.s);
    const rankOf = s => 1 + scores.filter(x => x.s > s).length;
    const famLine = fam.map(({ f, e }) => { const s = e.weeks[w - 1]; return `<div class="stat-row"><span>${avatar(f)} ${nameLink(e.name)}</span><span class="num">${s ?? '–'} <span class="muted">${s != null ? '#' + rankOf(s) + ' of ' + scores.length : ''}</span></span></div>`; }).join('');
    const top = (A.winners?.weeks?.[w] || []).slice(0, 4).map((x, i) => `${['🥇', '🥈', '🥉', '4th'][i]} ${nameLink(x)}`).join(' &nbsp; ');
    const famPicks = W.picks ? fam.map(({ f, e }) => ({ f, p: W.picks[e.name] })).filter(x => x.p) : [];
    const games = W.games.filter(g => famPicks.some(x => Object.values(x.p.conf).some(no => no === g.fav_no || no === g.dog_no)));
    const gRow = g => { const on = s => famPicks.filter(x => Object.entries(x.p.conf).some(([, no]) => no === (s === 'fav' ? g.fav_no : g.dog_no))).map(x => { const c = Object.entries(x.p.conf).find(([, no]) => no === (s === 'fav' ? g.fav_no : g.dog_no))[0]; const won = g.favCovers != null && (s === 'fav') === g.favCovers; return `<span class="pk ${won ? 'won' : 'lost'}">${avatar(x.f)}${c}</span>`; }).join('');
      return `<div class="panel game"><div class="side"><div class="team ${g.favCovers ? 'cover' : ''}"><span class="nm">${esc(g.fav)}</span><span class="sp">−${fmtHalf(g.spread)}</span></div><div class="picks">${on('fav')}</div></div>
        <div class="mid"><div class="score">${g.final ? `${g.final.fav}–${g.final.dog}` : '–'}</div><div class="st">${esc(g.league || '')} · ${g.favCovers == null ? 'no result' : g.favCovers ? 'fav covered' : 'dog covered'}</div></div>
        <div class="side r"><div class="team ${g.favCovers === false ? 'cover' : ''}"><span class="nm">${esc(g.dog)}</span><span class="sp">+${fmtHalf(g.spread)}</span></div><div class="picks">${on('dog')}</div></div></div>`; };
    box.innerHTML = `<div class="grid two"><div class="panel insight"><h3>Family that week</h3>${famLine}</div><div class="panel insight"><h3>League's top 4</h3><p>${top || '–'}</p>
        <p class="note">${W.games.length} games on the sheet; ${W.games.filter(g => g.favCovers === false).length} underdogs covered.</p></div></div>
      ${W.picks ? `<h4 class="lg-h">Games with family picks</h4>${games.map(gRow).join('')}` : '<div class="panel empty">No pick sheet for this week, only scores.</div>'}`;
    bindProfileLinks(box);
  };
  $('#hWeek').onchange = e => drawWeek(+e.target.value); drawWeek(A.weeks[0].week);
  bindProfileLinks($('#main')); bindChips();
}

// Every season side by side: family careers, champions, and whether league-wide lessons held up
// from one year to the next (most "patterns" don't).
function viewHistoryAll(ctx, yrs, yrChips) {
  const C = ctx.career; const short = y => `'${String(y).slice(2)}`;
  const fam = FAMILY.filter(f => !f.shadow && f.pool).map(f => ({ f, rep: scoutingReport(ctx, f.pool) })).filter(x => x.rep.career || x.rep.seasons.length);
  const finOf = (rep, y) => rep.seasons.find(s => s.season === +y)?.entry;
  const avgFin = rep => { const v = yrs.map(y => finOf(rep, y)?.seasonRank).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 999; };
  const famRows = fam.sort((a, b) => avgFin(a.rep) - avgFin(b.rep)).map(({ f, rep }) => { const m = rep.career?.metrics;
    return `<tr class="row" data-profile="${esc(f.pool)}"><td class="l">${avatar(f)} ${esc(f.short)}</td>${yrs.map(y => { const e = finOf(rep, y); return `<td class="num">${e ? '#' + (e.seasonRank ?? e.guruRank) : '–'}</td>`; }).join('')}
      <td class="num">${pctS(m?.cover)}</td><td class="num">${pctS(m?.tens.cover)}</td><td class="num">${pctS(m?.dog.share)}</td><td class="num">${m ? (m.orderEdgePerWeek >= 0 ? '+' : '') + m.orderEdgePerWeek.toFixed(1) : '–'}</td></tr>`; }).join('');
  const champs = [...yrs].reverse().map(y => { const aw = ctx.seasons[y].archive.winners?.awards || {}; const c = k => aw[k]?.[0] ? nameLink(aw[k][0]) : '–';
    return `<div class="stat-row"><span><b>${y}</b></span><span>Season ${c('Guru Season')}${aw['Guru Weeks 1-19'] ? ` · Weeks 1–19 ${c('Guru Weeks 1-19')}` : ''} · Bowls ${c('Bowls')}</span></div>`; }).join('');
  // year-over-year check of each league-wide lesson
  const VERDICT = { held: '★ Held up', flipped: '↔ Flipped', 'one-year': '½ One year only', noise: '· Noise' };
  const zf = z => z == null ? '–' : (z > 0 ? '+' : '') + z.toFixed(1);
  const yoy = lessonVerdicts(ctx).map(l => `<tr><td class="l">${esc(l.text)}</td>${yrs.map(y => `<td class="num">${zf(l.zs[y])}</td>`).join('')}<td class="num">${zf(l.z)}</td><td class="l"><b>${VERDICT[l.verdict]}</b></td></tr>`).join('');
  const cards = yrs.reduce((s, y) => s + ctx.seasons[y].archive.weeks.reduce((t, w) => t + (w.picks ? Object.keys(w.picks).length : 0), 0), 0);
  $('#main').innerHTML = `${title(`All seasons, ${C.label}`, `${yrs.length} seasons · ${cards.toLocaleString()} cards · ${C.rows.length.toLocaleString()} graded picks · tap any name for a scouting report`)}
    ${yrChips}
    <div class="grid two">
      <div class="panel insight"><h3>🏆 Champions</h3>${champs}</div>
      <div class="panel insight"><h3>📈 Did the lessons hold up?</h3><p class="note" style="margin-top:0">A lesson that's real should point the same way every year. The number is a z-score: positive means the first group covered more, and beyond ±2 is more than luck. <b>Held up</b>: same direction every year. <b>Flipped</b>: clearly one way one year and the other way the next. <b>One year only</b>: real in one season, missing in the other. Several 2025 "lessons" (contrarian picks, home teams) ran the opposite way in 2024.</p></div>
    </div>
    ${title('The family, season by season')}
    <div class="panel tbl-wrap"><table><thead><tr><th class="l">Name</th>${yrs.map(y => `<th>${y} fin.</th>`).join('')}<th>Cover</th><th>10s</th><th>Dogs</th><th>Order</th></tr></thead><tbody>${famRows}</tbody></table>
      <p class="note">Cover, 10s, dogs and order pool every graded pick from ${C.label}. Order = points a week gained from confidence placement.</p></div>
    ${title('League lessons, year over year', 'z-score per season and combined')}
    <div class="panel tbl-wrap"><table class="yoy"><thead><tr><th class="l">Pattern (combined)</th>${yrs.map(y => `<th>${short(y)}</th>`).join('')}<th>All</th><th class="l">Verdict</th></tr></thead><tbody>${yoy}</tbody></table></div>`;
  bindProfileLinks($('#main'));
}

// ------------------------------------------------------------ ADMIN (Tarun)
// Weekend kickoff preview: posts once per week when all family cards and ~all league picks are
// loaded (same rule as tools/commentator.mjs), or right away with the button.
function previewCard() {
  const famList = FAMILY.filter(f => !f.shadow);
  const famNames = new Set(famList.map(f => f.pool).filter(Boolean));
  const famIn = famList.filter(f => f.pool && S.week.picks?.[f.pool]).length;
  const lgIn = Object.keys(S.week.picks || {}).filter(n => !famNames.has(n)).length;
  const lgSize = Math.max(0, (S.league?.members?.length || 0) - famList.length), lgNeed = Math.ceil(lgSize * 0.9);
  const queued = S.settings?.previewWeek === S.week.week;
  const ready = famIn === famList.length && lgIn >= lgNeed;
  return `<div class="panel insight" style="margin-top:12px"><h3>📣 Weekend kickoff preview</h3>
    <p>A one-time hype post from the Commentator covering the whole weekend: the family race, each of us vs the league, the family vs the league, and the must-watch games from Thursday to Monday.</p>
    <div class="kv" style="margin:10px 0"><div><b>${famIn} / ${famList.length}</b><span>Family pick sheets loaded</span></div>
      <div><b>${lgIn} / ${lgSize}</b><span>League pick sheets loaded (needs ${lgNeed})</span></div>
      <div><b>${queued ? 'Queued' : ready ? 'Ready' : 'Waiting'}</b><span>${queued ? 'Posting shortly' : ready ? 'Posts automatically within minutes' : 'Posts automatically when both are in'}</span></div></div>
    ${queued ? '' : `<button class="btn gold" id="pvGo">Send the weekend preview now</button>`}
    <div id="pvOut" class="note">It posts once per week. It needs the Commentator running on the PC, and it waits while the Commentator is muted.</div></div>`;
}
// Weekly recap: posts automatically when the commissioner's official scores for a new week are
// uploaded (Standings totals), or on demand from here.
function recapCard() {
  const L = leagueStorylines(S.league, FAMILY);
  const queued = L && S.settings?.recapWeek === L.week;
  return `<div class="panel insight" style="margin-top:12px"><h3>📰 Weekly recap</h3>
    <p>A one-time post from the Commentator after each week's official scores are uploaded: the season lead, the week's top scores, the biggest movers, each of us, and the family vs the league (the same storylines as "Around the league" on Standings).</p>
    <div class="kv" style="margin:10px 0"><div><b>${L ? 'Week ' + L.week : '–'}</b><span>Latest week with official scores</span></div>
      <div><b>${queued ? 'Queued' : 'Automatic'}</b><span>${queued ? 'Posting shortly' : 'Posts when the next week\'s totals are uploaded'}</span></div></div>
    ${L && !queued ? `<button class="btn gold" id="rcGo">Post the week ${L.week} recap now</button>` : ''}
    <div id="rcOut" class="note">One recap per week. It needs the Commentator running on the PC, and it waits while the Commentator is muted.</div></div>`;
}
// ---------- chat clear / archive (admin) ----------
function chatAdminCard() {
  const d = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  return `<div class="panel insight" style="margin-top:12px"><h3>💬 Smack Talk: clear &amp; archives</h3>
    <p><b>${S.msgs.length}</b> message${S.msgs.length === 1 ? '' : 's'} in the live chat. Clearing archives them: the chat starts fresh for everyone, and the old messages stay here for you to view, download, or delete permanently.</p>
    <label class="fld">Archive name<input id="arcLabel" class="search" value="Week ${S.week.week} chat (cleared ${d})" maxlength="60"></label>
    <button class="btn gold" id="arcGo" ${S.msgs.length ? '' : 'disabled'}>Clear chat (archive it)</button>
    <div id="arcOut" class="note"></div>
    <h4 class="lg-h">Archives <span class="muted" style="text-transform:none;letter-spacing:0">(only you can see these)</span></h4>
    <div id="arcList" class="note">Loading…</div></div>`;
}
async function refreshArchiveList() {
  const box = $('#arcList'); if (!box) return;
  const list = await db.listArchives().catch(() => []);
  box.innerHTML = list.length ? list.map(a => `<div class="arc-row"><div><b>${esc(a.label)}</b><br><span class="muted">${a.count} message${a.count === 1 ? '' : 's'} · archived ${ago(a.at)}</span></div>
    <div class="arc-btns"><button class="btn ghost small" data-arc-view="${esc(a.label)}">View</button><button class="btn ghost small" data-arc-dl="${esc(a.label)}">Download</button><button class="btn ghost small danger" data-arc-del="${esc(a.label)}">Delete</button></div></div>`).join('')
    : 'No archives yet.';
  $$('[data-arc-view]', box).forEach(b => b.onclick = () => openArchive(b.dataset.arcView));
  $$('[data-arc-dl]', box).forEach(b => b.onclick = () => downloadArchive(b.dataset.arcDl));
  $$('[data-arc-del]', box).forEach(b => b.onclick = async () => {
    const label = b.dataset.arcDel;
    const typed = prompt(`Permanently delete the archive "${label}"? This can't be undone. Download it first if you might want it.\n\nType DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    try { const n = await db.deleteArchive(label); $('#arcOut').textContent = `Deleted "${label}" (${n} messages) permanently.`; refreshArchiveList(); }
    catch (err) { $('#arcOut').textContent = 'Delete failed: ' + err.message; }
  });
}
function bindChatAdmin() {
  refreshArchiveList();
  $('#arcGo')?.addEventListener('click', async () => {
    const label = ($('#arcLabel').value || '').replace(/[<>]/g, '').trim().slice(0, 60) || `Week ${S.week.week} chat`;
    if (!confirm(`Clear the live chat for everyone?\n\n${S.msgs.length} messages will be archived as "${label}". You can view, download or delete the archive later.`)) return;
    $('#arcGo').disabled = true;
    try { const n = await db.archiveChat(label); await refreshSocial(); $('#arcOut').textContent = `Cleared. ${n} messages archived as "${label}".`; refreshArchiveList(); }
    catch (err) { $('#arcOut').textContent = err.message; $('#arcGo').disabled = false; }
  });
}
function archiveText(label, msgs) {
  const line = m => `[${new Date(m.at).toLocaleString('en-US', { timeZone: 'America/New_York' })}] ${fam(m.who)?.short || m.who}: ${m.body}`;
  return `${label}\n${'='.repeat(label.length)}\n\n${msgs.map(line).join('\n')}\n`;
}
async function openArchive(label) {
  const msgs = await db.loadArchive(label).catch(() => []);
  openModal(`${modalHead('Chat archive', esc(label))}<div class="mb"><div class="feed arc-feed">${msgs.map(m => { const f = fam(m.who);
      return `<div class="msg">${avatar(f)}<div class="bubble"><div class="by">${esc(f?.short || m.who)} · ${new Date(m.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div><div class="body">${withMentions(m.body)}</div></div></div>`; }).join('') || '<div class="empty">Empty archive.</div>'}</div>
    <p class="note">${msgs.length} messages · read-only</p></div>`);
  modalRefresher = null;
}
async function downloadArchive(label) {
  const msgs = await db.loadArchive(label).catch(() => []);
  const blob = new Blob([archiveText(label, msgs)], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${label.replace(/[^\w\- ()]+/g, '').replace(/\s+/g, '-')}.txt`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function viewAdmin() {
  if (!S.user.admin) return go('gameday');
  $('#main').innerHTML = `${title('Upload', 'Commissioner files go in here and everyone sees the update')}
    ${db.LOCAL ? `<div class="panel insight"><p>Preview mode is read-only. Uploads need the Supabase backend.</p></div>` : ''}
    <div class="grid two">
      <div class="panel insight"><h3>📄 Weekly picks sheets (.xls)</h3><p>Drop one or more pick sheets for week ${S.week.week} (e.g. <code>2026.Week4.FirstLast.xls</code>). A sheet with many rows (the whole league) works too.</p>
        <div class="drop" id="dropPicks" style="margin-top:10px">Drop .xls files here or <label style="text-decoration:underline;cursor:pointer">browse<input type="file" id="filePicks" accept=".xls,.xlsx" multiple hidden></label></div><div id="picksOut" class="note"></div></div>
      <div class="panel insight"><h3>📊 Yearly totals (.xls)</h3><p>The commissioner's "Yearly totals through Week N" workbook. Replaces the standings.</p>
        <div class="drop" id="dropTotals" style="margin-top:10px">Drop the totals .xls here or <label style="text-decoration:underline;cursor:pointer">browse<input type="file" id="fileTotals" accept=".xls,.xlsx" hidden></label></div><div id="totalsOut" class="note"></div></div>
    </div>
    ${previewCard()}
    ${recapCard()}
    ${chatAdminCard()}
    <div class="panel insight" style="margin-top:12px"><h3>🎙️ The Commentator</h3>
      <p>Color commentary in Smack Talk when family picks swing, from the commentator program running on Tarun's PC. It only posts while that program is running.</p>
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:600"><input type="checkbox" id="commOn" ${S.settings?.commentary === false ? '' : 'checked'}> Commentary on</label>
      <div id="commOut" class="note"></div></div>
    <p class="note">New week odds sheets (.doc) are built with <code>tools/build-week.mjs</code> and pushed with <code>tools/push-data.mjs</code>. Watson or Claude can run that.</p>`;
  const wire = (drop, input, fn) => { const d = $(drop); d.ondragover = e => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); fn([...e.dataTransfer.files]); }; $(input).onchange = e => fn([...e.target.files]); };
  wire('#dropPicks', '#filePicks', uploadPicks); wire('#dropTotals', '#fileTotals', uploadTotals);
  bindChatAdmin();
  $('#pvGo')?.addEventListener('click', async () => { const out = $('#pvOut'); $('#pvGo').disabled = true;
    try { const latest = await db.loadDataset('settings') || S.settings; S.settings = { ...latest, previewWeek: S.week.week }; await db.saveDataset('settings', S.settings);
      out.textContent = 'Queued. The Commentator posts it within a few minutes, as long as it’s running and not muted.'; }
    catch (err) { out.textContent = 'Failed: ' + err.message; $('#pvGo').disabled = false; } });
  $('#rcGo')?.addEventListener('click', async () => { const out = $('#rcOut'); $('#rcGo').disabled = true;
    try { const L = leagueStorylines(S.league, FAMILY); const latest = await db.loadDataset('settings') || S.settings; S.settings = { ...latest, recapWeek: L.week }; await db.saveDataset('settings', S.settings);
      out.textContent = 'Queued. The Commentator posts it within a minute or so, as long as it’s running and not muted.'; }
    catch (err) { out.textContent = 'Failed: ' + err.message; $('#rcGo').disabled = false; } });
  $('#commOn').onchange = async e => { const out = $('#commOut');
    try { const latest = await db.loadDataset('settings') || S.settings; S.settings = { ...latest, commentary: e.target.checked }; await db.saveDataset('settings', S.settings);
      out.textContent = e.target.checked ? 'On. The Commentator will chime in.' : 'Muted. The Commentator stays quiet until you turn it back on.'; }
    catch (err) { out.textContent = 'Failed: ' + err.message; e.target.checked = !e.target.checked; } };
}
async function sheetRows(file) {
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  const wb = XLSX.read(await file.arrayBuffer(), { cellFormula: false, cellHTML: false }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
}
// Upload flow: read -> validate -> preview (new / changed / unchanged / rejected) -> Confirm -> merge into
// the latest saved copy -> save. Nothing is written until Confirm.
function fileProblems(files) { return files.map(checkFile).filter(Boolean); }
const pill = (cls, t) => `<span class="upill ${cls}">${t}</span>`;

async function uploadPicks(files) {
  const out = $('#picksOut'); out.innerHTML = 'Reading…';
  const probs = fileProblems(files); if (probs.length) { out.innerHTML = probs.map(esc).join('<br>'); return; }
  try {
    const latest = await db.loadDataset(`week${S.week.week}`) || S.week;
    const all = [], fileErrors = [];
    for (const file of files) { const r = parsePickRows(await sheetRows(file), latest, file.name); all.push(...r.entries); fileErrors.push(...r.fileErrors); }
    const names = new Map();
    for (const e of all) { const k = e.name.toLowerCase(); if (k && names.has(k) && names.get(k) !== e.file) e.errors.push(`also in ${names.get(k)}`); names.set(k, e.file); }
    const rows = all.map(e => ({ e, d: e.errors.length ? { status: 'rejected', changes: [] } : diffPicks(latest.picks?.[e.name], e) }));
    const toSave = rows.filter(r => r.d.status === 'new' || r.d.status === 'changed');
    const count = s => rows.filter(r => r.d.status === s).length;
    const label = { new: ['new', 'new'], changed: ['changed', 'changed'], unchanged: ['same', 'already loaded'], rejected: ['bad', 'rejected'] };
    out.innerHTML = `${fileErrors.map(x => `<div class="err">${esc(x)}</div>`).join('')}
      <div class="upl-sum">${pill('new', count('new') + ' new')} ${pill('changed', count('changed') + ' changed')} ${pill('same', count('unchanged') + ' already loaded')} ${pill('bad', count('rejected') + ' rejected')}</div>
      ${rows.length ? `<div class="tbl-wrap"><table class="upl"><thead><tr><th class="l">Entry</th><th class="l">Status</th><th class="l">Details</th></tr></thead><tbody>
      ${rows.map(({ e, d }) => `<tr><td class="l">${esc(e.name || '(no name)')}<br><small class="muted">${esc(e.file)}</small></td>
        <td class="l">${pill(...label[d.status])}</td>
        <td class="l">${[...e.errors.map(x => `<span class="err">✗ ${esc(x)}</span>`), ...d.changes.map(x => `↻ ${esc(x)}`), ...e.warnings.map(x => `<span class="muted">⚠ ${esc(x)}</span>`)].join('<br>') || '<span class="muted">10 picks, all on this week’s sheet</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${toSave.length ? `<button class="btn gold" id="picksGo" style="margin-top:10px">Save ${toSave.length} entr${toSave.length === 1 ? 'y' : 'ies'}</button> <button class="btn ghost" id="picksNo" style="margin-top:10px">Cancel</button>`
        : '<p class="muted">Nothing new to save.</p>'}`;
    if (!toSave.length) return;
    $('#picksNo').onclick = () => { out.innerHTML = 'Cancelled. Nothing was saved.'; };
    $('#picksGo').onclick = async () => {
      $('#picksGo').disabled = true; out.insertAdjacentHTML('beforeend', '<p class="muted">Saving…</p>');
      try {
        const fresh = await db.loadDataset(`week${S.week.week}`) || S.week;      // merge into the newest copy
        fresh.picks ??= {};
        for (const { e } of toSave) fresh.picks[e.name] = { conf: e.conf, tiebreaker: e.tiebreaker };
        fresh.picksUpdated = new Date().toISOString();
        await db.saveDataset(`week${S.week.week}`, fresh); S.week = fresh; recompute();
        out.innerHTML = `✅ Saved ${toSave.length}: ${esc(toSave.map(r => r.e.name).join(', '))}. Everyone sees it on their next refresh.`;
      } catch (err) { out.innerHTML = `<span class="err">Save failed: ${esc(err.message)}</span>`; }
    };
  } catch (err) { out.innerHTML = `<span class="err">Couldn't read that file: ${esc(err.message)}</span>`; }
}

async function uploadTotals(files) {
  const out = $('#totalsOut'); out.innerHTML = 'Reading…';
  if (files.length !== 1) { out.innerHTML = 'Drop one totals workbook at a time.'; return; }
  const probs = fileProblems(files); if (probs.length) { out.innerHTML = probs.map(esc).join('<br>'); return; }
  try {
    const { members, fileErrors, errors } = parseTotalsRows(await sheetRows(files[0]), files[0].name);
    if (fileErrors.length) { out.innerHTML = fileErrors.map(x => `<div class="err">${esc(x)}</div>`).join(''); return; }
    const latest = await db.loadDataset('league') || S.league || {};
    const d = diffTotals(latest.members, members);
    const list = (h, xs, cls = '') => xs.length ? `<h4 style="margin:10px 0 4px">${h}</h4><div class="${cls}">${xs.slice(0, 40).map(esc).join('<br>')}${xs.length > 40 ? `<br>…and ${xs.length - 40} more` : ''}</div>` : '';
    if (d.unchanged && !errors.length) { out.innerHTML = `${pill('same', 'already loaded')} This workbook matches the current standings (${members.length} entries). Nothing to save.`; return; }
    out.innerHTML = `<div class="upl-sum">${pill('new', members.length + ' entries')} ${d.filledWeeks.length ? pill('changed', 'new scores: week ' + d.filledWeeks.join(', ')) : ''} ${d.corrections.length ? pill('bad', d.corrections.length + ' past scores changed') : ''} ${errors.length ? pill('bad', errors.length + ' problems') : ''}</div>
      ${list('Problems (these cells are left blank)', errors, 'err')}
      ${list('Past scores that would change (double-check these)', d.corrections)}
      ${list('New entries', d.added)}${list('Entries missing from this file (would be removed)', d.removed, 'err')}
      ${d.removed.length || d.corrections.length ? `<label style="display:flex;gap:8px;margin-top:10px"><input type="checkbox" id="totAck"> I've checked the changes above and want to save them</label>` : ''}
      <button class="btn gold" id="totGo" style="margin-top:10px">Save standings</button> <button class="btn ghost" id="totNo" style="margin-top:10px">Cancel</button>`;
    $('#totNo').onclick = () => { out.innerHTML = 'Cancelled. Nothing was saved.'; };
    $('#totGo').onclick = async () => {
      if ($('#totAck') && !$('#totAck').checked) { alert('Please tick the box to confirm the flagged changes.'); return; }
      $('#totGo').disabled = true;
      try {
        const fresh = await db.loadDataset('league') || {};
        const through = Math.max(0, ...members.map(m => m.weeks.reduce((w, v, i) => v != null ? i + 1 : w, 0)));
        S.league = { ...fresh, members, through, built: new Date().toISOString() };
        await db.saveDataset('league', S.league);
        out.innerHTML = `✅ Saved standings for ${members.length} entries (through week ${through}).`;
      } catch (err) { out.innerHTML = `<span class="err">Save failed: ${esc(err.message)}</span>`; }
    };
  } catch (err) { out.innerHTML = `<span class="err">Couldn't read that file: ${esc(err.message)}</span>`; }
}
