// Builds demo-data/ (gitignored): fictional picks, league, chat and a staged live Saturday, so
// screenshots for emails/marketing never show anyone's real picks or league members' names.
//   node tools/make-demo-data.mjs     then open http://localhost:5173/?preview&demo&as=jamie
import fs from 'node:fs';

const week = JSON.parse(fs.readFileSync('local-data/week4.json', 'utf8'));
fs.mkdirSync('demo-data', { recursive: true });
const W = (name, v) => fs.writeFileSync(`demo-data/${name}.json`, JSON.stringify(v, null, 1));

const roster = { jamie: 'Jamie S.', debbie: 'Debbie S.', bobby: 'Bobby S.', shannon: 'Shannon S.', joe: 'Joe P.' };
const picks = {
  'Jamie S.':   { conf: { 10: 79, 9: 56, 8: 69, 7: 11, 6: 61, 5: 124, 4: 1, 3: 119, 2: 88, 1: 145 }, tiebreaker: 42 },
  'Debbie S.':  { conf: { 10: 93, 9: 56, 8: 80, 7: 61, 6: 122, 5: 69, 4: 124, 3: 21, 2: 90, 1: 46 }, tiebreaker: 44 },
  'Bobby S.':   { conf: { 10: 79, 9: 11, 8: 119, 7: 45, 6: 93, 5: 1, 4: 87, 3: 25, 2: 145, 1: 61 }, tiebreaker: 47 },
  'Shannon S.': { conf: { 10: 56, 9: 80, 8: 93, 7: 122, 6: 88, 5: 17, 4: 69, 3: 124, 2: 90, 1: 46 }, tiebreaker: 38 },
  'Joe P.':     { conf: { 10: 61, 9: 94, 8: 79, 7: 11, 6: 55, 5: 21, 4: 69, 3: 88, 2: 145, 1: 1 }, tiebreaker: 51 },
};
W('week4', { ...week, picks });
W('roster', roster);
W('settings', { currentWeek: 4 });
W('pronouns', {});

// League: 108 pseudonymous players plus the family, with plausible (made-up) weekly scores.
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const score = () => Math.max(2, Math.min(52, Math.round(26 + (rnd() + rnd() + rnd() - 1.5) * 18)));
const members = Array.from({ length: 108 }, (_, i) => ({ name: `Player ${i + 1}`, weeks: [score(), score(), score(), ...Array(16).fill(null)] }));
const fam = { 'Jamie S.': [39, 28, 29], 'Debbie S.': [29, 40, 35], 'Bobby S.': [32, 20, 29], 'Shannon S.': [20, 37, 28], 'Joe P.': [28, 33, 31] };
for (const [name, w] of Object.entries(fam)) members.push({ name, weeks: [...w, ...Array(16).fill(null)] });
W('league', { season: 2026, through: 3, members, shadowScores: { 3: 26 } });

// A staged Saturday afternoon: some finals, a couple of nail-biters in progress.
W('live', {
  401856704: { state: 'post', fav: 24, dog: 27, detail: 'Final' },                          // Texas–Tennessee
  401858243: { state: 'post', fav: 38, dog: 20, detail: 'Final' },                          // Louisville–Wake
  401856813: { state: 'post', fav: 31, dog: 24, detail: 'Final' },                          // Baylor–Colorado
  401858467: { state: 'post', fav: 45, dog: 14, detail: 'Final' },                          // Notre Dame–Purdue
  401860897: { state: 'post', fav: 27, dog: 24, detail: 'Final' },                          // Boise–W. Michigan
  401856700: { state: 'in', fav: 24, dog: 13, detail: '4:12 - 4th', period: 4, clock: '4:12', clockSec: 252, last: 'Oklahoma 3rd & 6 at the UGA 38' },
  401858466: { state: 'in', fav: 17, dog: 10, detail: '6:40 - 3rd', period: 3, clock: '6:40', clockSec: 400 },
  401856806: { state: 'in', fav: 21, dog: 10, detail: '2:05 - 2nd', period: 2, clock: '2:05', clockSec: 125 },
});

// Demo chat.
const t = m => new Date(Date.now() - m * 60e3).toISOString();
const messages = [
  { id: 1, at: t(95), who: 'bobby', week: 4, game: 79, body: 'Georgia by 20. Book it. 🍑' },
  { id: 2, at: t(92), who: 'debbie', week: 4, game: 79, body: '@Bobby Oklahoma +14½ says hi 👋' },
  { id: 3, at: t(60), who: 'shannon', week: 4, game: 55, body: 'TENNESSEE COVERED!! 10 points in the bank 🎉' },
  { id: 4, at: t(58), who: 'joe', week: 4, game: 61, body: 'Louisville by 18. Never in doubt 😎' },
  { id: 5, at: t(41), who: 'jamie', week: 4, body: 'Can someone explain what happened to Green Bay on Thursday' },
  { id: 6, at: t(40), who: 'commentator', week: 4, body: 'Jamie, Atlanta ran Green Bay off the tracks 35–14 — the 🚂 derailed early. Georgia −14½ is Jamie’s shot at redemption tonight.' },
  { id: 7, at: t(9), who: 'commentator', week: 4, game: 79, body: 'Georgia up 11 with 4:12 left: Oklahoma +14½ covering by 3½. Jamie, Bobby and Joe need a touchdown; Debbie and Shannon need a stop. No lead is safe. 🍑' },
  { id: 8, at: t(6), who: 'commentator', week: 4, game: 79, body: 'What-if: if Oklahoma hangs on, Shannon’s chance to win the family this week jumps to 58%. Shannon, you know who to root for 🦬' },
  { id: 9, at: t(2), who: 'debbie', week: 4, body: 'DEFENSE!!! 🙏' },
];
const reactions = [
  { id: 1, who: 'jamie', target: 'msg:3', emoji: '🔥' }, { id: 2, who: 'debbie', target: 'msg:3', emoji: '🔥' },
  { id: 3, who: 'bobby', target: 'msg:6', emoji: '😂' }, { id: 4, who: 'joe', target: 'msg:6', emoji: '😂' }, { id: 5, who: 'shannon', target: 'msg:6', emoji: '💀' },
  { id: 6, who: 'shannon', target: 'msg:8', emoji: '🦬' }, { id: 7, who: 'debbie', target: 'msg:8', emoji: '👀' },
];
W('chat', { messages, reactions });
console.log('demo-data written');
