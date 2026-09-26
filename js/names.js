// Matching people's names across files and seasons ("Mike Kreimer" = "Michael Kreimer",
// "Partick Robbins" = "Patrick Robbins", "Ian Fitchpatrick" = "Ian Fitzpatrick"), without
// merging different people ("Dave Williams" != "Dean Williams").
const NICK = { mike: 'michael', jeff: 'jeffrey', dave: 'david', pete: 'peter', chris: 'christopher', tom: 'thomas', bob: 'robert', bobby: 'robert',
  bill: 'william', will: 'william', joe: 'joseph', jim: 'james', jimmy: 'james', dan: 'daniel', danny: 'daniel', matt: 'matthew', steve: 'steven',
  tony: 'anthony', zach: 'zachary', zack: 'zachary', rich: 'richard', rick: 'richard', ken: 'kenneth', ron: 'ronald', don: 'donald', greg: 'gregory', sam: 'samuel', ben: 'benjamin' };

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function parts(n) {
  const t = String(n).toLowerCase().replace(/[^a-z0-9# ]/g, ' ').split(/\s+/).filter(Boolean);
  const suffix = t.filter(x => /^#?\d+$/.test(x)).join(' ');      // "#2", "2" = a second entry
  const words = t.filter(x => !/^#?\d+$/.test(x));
  return { first: words[0] || '', last: words.slice(1).join(' '), suffix: suffix.replace('#', '') };
}
const firstSame = (a, b) => {
  const x = NICK[a] || a, y = NICK[b] || b;
  // near-identical spellings ("Makenzie"/"Mackenzie", "Partick"/"Patrick"), never short names ("Dave"/"Dean")
  return x === y || (x.length >= 5 && y.length >= 5 && x[0] === y[0] && lev(x, y) <= (Math.min(x.length, y.length) >= 6 ? 2 : 1));
};
const lastSame = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a[0] === b[0] && lev(a, b) <= 2);

export function samePerson(a, b) {
  if (a === b) return true;
  const p = parts(a), q = parts(b);
  return p.suffix === q.suffix && lastSame(p.last, q.last) && firstSame(p.first, q.first);
}
// Map each name in `names` onto a name in `pool` (or null). Ambiguous matches stay null.
export function matchNames(names, pool) {
  const out = {};
  for (const n of names) {
    if (pool.includes(n)) { out[n] = n; continue; }
    const c = pool.filter(p => samePerson(n, p));
    out[n] = c.length === 1 ? c[0] : null;
  }
  return out;
}
