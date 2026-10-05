// Notification preferences and the rules for who hears about what. Pure JS, shared by the site
// (settings screen) and the Supabase Edge Functions that send the pushes (copied there on deploy).

export const DEFAULT_PREFS = {
  chat: 'mentions',            // off | mentions (@me and replies to me) | all
  commentator: 'questions',    // off | questions (asked or answering me) | big (+ weekend preview, weekly recap) | all
  picks: { final: true, flips: false, sweats: false },   // my picks: final result, cover flips (2nd half on), late sweats
  follows: 'final',            // games I tap 🔔 on: final | cover (cover changes + final) | scores (every score + final)
  family: { myWeek: true, lead: false },                 // my week's total when my last game ends; family points lead changes
  cap: 12,                     // most notifications per hour (0 = no cap); tests don't count
  quiet: { on: false, start: '23:00', end: '08:00' },    // hold nothing back: alerts in quiet hours are skipped
  lock: 'full',                // full | generic ("New activity in Smelley Pool", no details)
  tz: 'America/New_York',
};

export const LABELS = {
  chat: { off: 'Off', mentions: 'When someone @mentions me or replies to me', all: 'Every message' },
  commentator: { off: 'Off', questions: 'Only when it asks or answers me', big: 'That, plus the weekend preview and weekly recap', all: 'Every post' },
  follows: { final: 'Final score only', cover: 'When the cover changes, and the final', scores: 'Every score, and the final' },
  cap: { 0: 'No limit', 6: '6 an hour', 12: '12 an hour', 24: '24 an hour' },
};

export function mergePrefs(p = {}) {
  const d = DEFAULT_PREFS;
  return { ...d, ...p, picks: { ...d.picks, ...(p.picks || {}) }, family: { ...d.family, ...(p.family || {}) }, quiet: { ...d.quiet, ...(p.quiet || {}) } };
}

// Minutes since midnight in the person's time zone.
function minutesNow(tz, now = new Date()) {
  const s = now.toLocaleTimeString('en-GB', { timeZone: tz || 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
  const [h, m] = s.split(':').map(Number); return (h % 24) * 60 + m;
}
const toMin = hhmm => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export function inQuietHours(prefs, now = new Date()) {
  if (!prefs.quiet?.on) return false;
  const t = minutesNow(prefs.tz, now), a = toMin(prefs.quiet.start), b = toMin(prefs.quiet.end);
  return a <= b ? t >= a && t < b : t >= a || t < b;   // overnight ranges wrap past midnight
}

const cap1 = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
// Should `me` (a family key) hear about this chat message? Returns { kind, title, body } or null.
// msg: { body, kind, meta, author } where author is the poster's family key ('commentator' for the bot).
export function chatNotice(msg, me, prefs, botKey = 'commentator') {
  if (!msg || msg.author === me) return null;
  const meName = cap1(me);
  const tagged = new RegExp(`@(${meName}|all)\\b`, 'i').test(msg.body || '') || (msg.meta?.to || []).includes(me);
  const text = String(msg.body || '').replace(/\s+/g, ' ').trim();
  const short = text.length > 180 ? text.slice(0, 177) + '…' : text;
  if (msg.author === botKey) {
    const c = prefs.commentator;
    if (c === 'off') return null;
    if (tagged) return { kind: 'mention', title: msg.kind === 'answer' ? '🎙️ The Commentator answered you' : '🎙️ The Commentator, to you', body: short };
    if ((msg.kind === 'preview' || msg.kind === 'recap') && (c === 'big' || c === 'all'))
      return { kind: 'commentator', title: msg.kind === 'preview' ? '🎙️ Weekend preview' : '🎙️ Weekly recap', body: short };
    if (c === 'all') return { kind: 'commentator', title: '🎙️ The Commentator', body: short };
    return null;
  }
  const who = cap1(msg.author);
  if (tagged && (prefs.chat === 'mentions' || prefs.chat === 'all')) return { kind: 'mention', title: /@all\b/i.test(msg.body || '') ? `${who} to everyone` : `${who} mentioned you`, body: short };
  if (prefs.chat === 'all') return { kind: 'chat', title: `${who} in Smack Talk`, body: short };
  return null;
}

// The lock-screen setting: "generic" hides who and what.
export function presentable(n, prefs) {
  return prefs.lock === 'generic' ? { ...n, title: 'Smelley Pool', body: n.kind === 'test' ? 'Test notification' : 'New activity. Open the app to see it.' } : n;
}
