// Game watcher, run every minute by pg_cron. Reads ESPN for this week's games that are live or about
// to start, compares with the last state it saw, and tells people about their picks (finals, cover
// flips, late sweats), games they follow (🔔), their week's total and family lead changes.
// Uses the site's own grading (js/live.js, js/model.js) so the numbers match the dashboard.
import { sb, json, authorized, audience, deliver } from '../_shared/push.ts';
import { fetchLive, gameState, gradeEntry, fmtHalf } from '../_shared/site/live.js';
import { buildModel } from '../_shared/site/model.js';

// ESPN's feed turns away requests that don't look like a browser.
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', Accept: 'application/json,text/plain,*/*', 'Accept-Language': 'en-US,en;q=0.9' };
// js/live.js calls plain fetch(); from Supabase's servers ESPN answers that with 403. Add the
// browser headers to ESPN requests only (everything else, e.g. the database, is untouched).
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init: any = {}) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  return /(^|\.)espn\.com\//.test(new URL(url).host + '/') ? realFetch(input, { ...init, headers: { ...BROWSER, ...(init.headers || {}) } }) : realFetch(input, init);
}) as typeof fetch;
const ds = async (key: string) => (await sb.from('datasets').select('value').eq('key', key).maybeSingle()).data?.value ?? null;
const cap1 = (s: string) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const nice = (s: string) => String(s).replace(/\b([A-Z][A-Z.&' ]+)\b/g, m => (m.length > 3 ? m.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : m));

Deno.serve(async req => {
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401);
  const now = Date.now();
  const settings = await ds('settings'); const week = settings?.currentWeek ? await ds(`week${settings.currentWeek}`) : null;
  if (!week?.games) return json({ idle: 'no week' });
  // Games that are live or ended in the last 6 hours / kick off in the next 10 minutes.
  const near = week.games.filter((g: any) => g.espn?.kickoff && Date.parse(g.espn.kickoff) - now < 10 * 60e3 && now - Date.parse(g.espn.kickoff) < 6 * 3600e3);
  if (!near.length) return json({ idle: 'no games now' });
  const { people } = await audience();
  if (!people.length) return json({ idle: 'nobody subscribed' });

  const roster = (await ds('roster')) || {};
  const live = await fetchLive({ games: near });
  // ?debug: why might the score feed be empty here?
  if (new URL(req.url).searchParams.has('debug')) {
    const g = near[0]; const sp = g.espn.sport === 'nfl' ? 'nfl' : 'college-football';
    const d = new Date(g.espn.kickoff); const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/${sp}/scoreboard?dates=${et.getFullYear()}${String(et.getMonth() + 1).padStart(2, '0')}${String(et.getDate()).padStart(2, '0')}&limit=400${sp === 'college-football' ? '&groups=80' : ''}`;
    const tryIt = async (headers: Record<string, string>) => { try { const r = await fetch(url, { headers }); const t = await r.text(); return `${r.status} ${t.length} bytes: ${t.slice(0, 60)}`; } catch (e) { return 'threw: ' + (e as Error).message; } };
    const probe = { plain: await tryIt({}), browser: await tryIt(BROWSER), alt: await tryIt({ ...BROWSER, Origin: 'https://www.espn.com', Referer: 'https://www.espn.com/' }) };
    return json({ near: near.length, live: live.size, sample: { id: g.espn.id, sport: g.espn.sport, kickoff: g.espn.kickoff, et: d.toLocaleString('en-US', { timeZone: 'America/New_York' }) }, url, probe });
  }
  const research = buildModel({ ...week, games: near }, live);
  const { data: prevRows } = await sb.from('game_alert_state').select('game_id, state').in('game_id', near.map((g: any) => g.espn.id));
  const prev = new Map((prevRows || []).map(r => [r.game_id, r.state]));
  const { data: follows } = await sb.from('game_follows').select('user_id, game_id').in('game_id', near.map((g: any) => g.espn.id));
  const followers = new Map<string, Set<string>>(); for (const f of follows || []) (followers.get(f.game_id) || followers.set(f.game_id, new Set()).get(f.game_id)!).add(f.user_id);

  // What changed in each game since the last run.
  const changes: any[] = []; const writes: any[] = [];
  for (const g of near) {
    const st: any = gameState(g, live, research); if (!live.get(g.espn.id)) continue;
    const cushion = st.margin == null ? null : st.margin - g.spread;
    const cur = { state: st.state, fav: st.favScore, dog: st.dogScore, period: st.period ?? 0, clock: st.clockSec ?? null,
      cover: cushion == null ? null : cushion > 0 ? 'fav' : cushion < 0 ? 'dog' : 'push', sweat: false };
    const p = prev.get(g.espn.id);
    cur.sweat = !!p?.sweat;
    if (p) {
      const ev: any = { g, st, cushion };
      ev.final = st.state === 'post' && p.state !== 'post';
      ev.voided = st.state === 'void' && p.state !== 'void';   // postponed / canceled (e.g. a hurricane)
      ev.scored = st.state === 'in' && (cur.fav !== p.fav || cur.dog !== p.dog);
      ev.coverChanged = st.state !== 'pre' && p.cover && cur.cover && cur.cover !== p.cover && cur.cover !== 'push';
      ev.sweat = st.state === 'in' && !p.sweat && cur.period >= 4 && (cur.clock ?? 900) <= 360 && cushion != null && Math.abs(cushion) <= 7;
      if (ev.sweat) cur.sweat = true;
      if (ev.final || ev.scored || ev.coverChanged || ev.sweat || ev.voided) changes.push(ev);
    }
    if (!p || JSON.stringify(p) !== JSON.stringify(cur)) writes.push({ game_id: g.espn.id, state: cur, updated_at: new Date().toISOString() });
  }
  if (writes.length) await sb.from('game_alert_state').upsert(writes);
  if (!changes.length) return json({ games: near.length, changes: 0 });

  const picksOf = (key: string) => key === 'tarun' ? week.shadow : week.picks?.[roster[key] ?? ''];
  const line = (g: any, side: string) => side === 'fav' ? `${nice(g.fav)} −${fmtHalf(g.spread)}` : `${nice(g.dog)} +${fmtHalf(g.spread)}`;
  const score = (g: any, st: any) => `${nice(g.fav)} ${st.favScore}, ${nice(g.dog)} ${st.dogScore}`;
  const sent: string[] = [];
  for (const person of people) {
    const pk = picksOf(person.key); const P = person.prefs;
    for (const ev of changes) {
      const { g, st, cushion } = ev; const id = g.espn.id; const url = `./?game=${g.fav_no}`; const tag = `game:${id}`;
      const mine = Object.entries(pk?.conf || {}).filter(([, no]) => no === g.fav_no || no === g.dog_no).map(([c, no]) => ({ conf: +c, side: no === g.fav_no ? 'fav' : 'dog' }));
      const follow = followers.get(id)?.has(person.userId);
      const send = (n: any) => deliver(person, { tag, url, ...n }).then(s => sent.push(`${person.key}:${n.ref}:${s}`));
      for (const m of mine) {
        const covering = cushion != null && (m.side === 'fav' ? cushion > 0 : cushion < 0);
        if (ev.voided)
          await send({ kind: 'pick', ref: `void:${id}`, title: `${st.detail}: ${nice(g.fav)} v ${nice(g.dog)}`, body: `The league allows a swap: send the commissioner a replacement for your ${m.conf} on ${nice(m.side === 'fav' ? g.fav : g.dog)}.`, ttl: 24 * 3600, urgent: true });
        else if (ev.final && P.picks.final)
          await send({ kind: 'pick', ref: `final:${id}`, title: `${line(g, m.side)} ${covering ? 'covered ✅' : 'didn’t cover ❌'}`, body: `Final: ${score(g, st)}. Your ${m.conf} ${covering ? `point${m.conf > 1 ? 's are' : ' is'} banked` : `point${m.conf > 1 ? 's are' : ' is'} gone`}.`, ttl: 6 * 3600 });
        else if (ev.coverChanged && P.picks.flips && (st.period ?? 0) >= 2)
          await send({ kind: 'pick', ref: `flip:${id}:${st.favScore}-${st.dogScore}`, title: `Cover flip: your ${m.conf} on ${nice(m.side === 'fav' ? g.fav : g.dog)} is ${covering ? 'now covering' : 'no longer covering'}`, body: `${score(g, st)} (${st.detail}).`, ttl: 600, urgent: true });
        else if (ev.sweat && P.picks.sweats)
          await send({ kind: 'pick', ref: `sweat:${id}`, title: `Late sweat: your ${m.conf} on ${nice(m.side === 'fav' ? g.fav : g.dog)}`, body: `${score(g, st)} (${st.detail}). ${covering ? 'Covering' : 'Not covering'} by ${fmtHalf(Math.abs(cushion))}. No lead is safe.`, ttl: 600, urgent: true });
      }
      if (follow) {
        const pickLine = `${nice(g.fav)} −${fmtHalf(g.spread)} v ${nice(g.dog)}`;
        if (ev.final) await send({ kind: 'follow', ref: `final:${id}`, title: `Final: ${score(g, st)}`, body: `${pickLine}: ${cushion > 0 ? nice(g.fav) : cushion < 0 ? nice(g.dog) : 'nobody'} covered.`, ttl: 6 * 3600 });
        else if (ev.coverChanged && (P.follows === 'cover' || P.follows === 'scores'))
          await send({ kind: 'follow', ref: `cover:${id}:${st.favScore}-${st.dogScore}`, title: `${nice(cushion > 0 ? g.fav : g.dog)} now covering`, body: `${score(g, st)} (${st.detail}). ${pickLine}.`, ttl: 600 });
        else if (ev.scored && P.follows === 'scores')
          await send({ kind: 'follow', ref: `score:${id}:${st.favScore}-${st.dogScore}`, title: score(g, st), body: `${st.detail}. ${pickLine}.`, ttl: 600 });
      }
    }
  }

  // When a game ends: week totals for people whose last pick just finished, and family lead changes.
  // Both need every game of the week graded, so fetch the full week's scores once.
  if (changes.some(ev => ev.final)) {
    const full = await fetchLive(week); week.research = buildModel(week, full);
    const graded = new Map<string, any>();
    for (const k of new Set(people.map(p => p.key).concat(Object.keys(roster)))) { const pk = picksOf(k); if (pk?.conf) graded.set(k, gradeEntry(pk, week, full)); }
    const finalIds = new Set(changes.filter(ev => ev.final).map(ev => ev.g.espn.id));
    for (const person of people) {
      const gr = graded.get(person.key); if (!person.prefs.family.myWeek || !gr) continue;
      const done = gr.rows.every((r: any) => r.missing || r.st?.state === 'post' || r.st?.state === 'void');
      const lastWasJustNow = gr.rows.some((r: any) => r.g && finalIds.has(r.g.espn?.id));
      if (done && lastWasJustNow)
        await deliver(person, { kind: 'family', ref: `week:${week.week}`, title: `Week ${week.week} is in the books: ${gr.banked} points`, body: `All your picks are final. See where it lands on the Game Day tab.`, url: './#gameday', tag: 'week', ttl: 24 * 3600 }).then(s => sent.push(`${person.key}:week:${s}`));
    }
    // Family lead on points banked (real entries only, not the shadow card).
    const fam = [...graded.entries()].filter(([k]) => k !== 'tarun' && roster[k]);
    if (fam.length >= 2) {
      const top = Math.max(...fam.map(([, gr]) => gr.banked));
      const leaders = fam.filter(([, gr]) => gr.banked === top).map(([k]) => k).sort();
      const stateId = `family:${week.week}`;
      const { data: was } = await sb.from('game_alert_state').select('state').eq('game_id', stateId).maybeSingle();
      await sb.from('game_alert_state').upsert({ game_id: stateId, state: { leaders, top }, updated_at: new Date().toISOString() });
      if (was && was.state.leaders.join() !== leaders.join()) {
        const who = leaders.map(cap1).join(' and ');
        for (const person of people.filter(p => p.prefs.family.lead))
          await deliver(person, { kind: 'family', ref: `lead:${week.week}:${leaders.join('+')}:${top}`, title: `${who} ${leaders.length > 1 ? 'share' : 'takes'} the family lead`, body: `${top} points banked so far in week ${week.week}.`, url: './#gameday', tag: 'family-lead', ttl: 3 * 3600 }).then(s => sent.push(`${person.key}:lead:${s}`));
      }
    }
  }
  return json({ games: near.length, changes: changes.length, sent });
});
