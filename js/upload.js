// Validation and change-detection for commissioner uploads. Pure functions, no DOM, so they
// run in the browser and in Node tests alike. Nothing here saves anything.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_EXT = /\.(xls|xlsx)$/i;

// Control characters, zero-width spaces, bidi marks, line/paragraph separators, BOM.
const INVISIBLE = new RegExp('[' + [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff]]
  .map(([a, b]) => String.fromCharCode(92) + 'u' + a.toString(16).padStart(4, '0') + '-' + String.fromCharCode(92) + 'u' + b.toString(16).padStart(4, '0')).join('') + ']', 'g');

// Names: normalize Unicode, drop control / zero-width / markup characters, collapse spaces.
export function cleanName(v) {
  const s = String(v ?? '').normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>{}\\`]/g, '')
    .replace(/\s+/g, ' ').trim();
  return s.slice(0, 60);
}
const isName = s => /\p{L}/u.test(s) && !/^name$/i.test(s);

function toInt(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isInteger(n) ? n : NaN;
}

export function checkFile(file) {
  if (!ALLOWED_EXT.test(file.name)) return `${file.name}: only Excel files (.xls, .xlsx) are accepted.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name}: file is larger than 5 MB, which is too big for a pick sheet.`;
  if (file.size === 0) return `${file.name}: file is empty.`;
  return null;
}

// ---------------------------------------------------------------- pick sheets
// rows: array of arrays (first sheet). week: the week dataset (games).
export function parsePickRows(rows, week, fileName = 'file') {
  const fileErrors = [];
  const hi = rows.findIndex(r => { const nums = r.map(c => Number(c)); return [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].every(n => nums.includes(n)); });
  if (hi < 0) return { entries: [], fileErrors: [`${fileName}: couldn't find the header row with confidence columns 10 through 1.`] };
  const hdr = rows[hi];
  const confCol = {}; hdr.forEach((h, i) => { const n = Number(h); if (n >= 1 && n <= 10 && !(n in confCol) && String(h).trim() !== '') confCol[n] = i; });
  const tbCol = hdr.findIndex(h => /tie/i.test(String(h)));

  const side = new Map();   // pool no -> game key
  for (const g of week.games) { side.set(g.fav_no, g.fav_no); side.set(g.dog_no, g.fav_no); }

  const entries = []; const seen = new Set();
  for (const r of rows.slice(hi + 1)) {
    const raw = String(r[0] ?? '');
    const name = cleanName(raw);
    const filled = Object.values(confCol).some(i => String(r[i] ?? '').trim() !== '');
    if (!name && !filled) continue;                     // blank row
    const e = { name, conf: {}, tiebreaker: null, errors: [], warnings: [], file: fileName };
    if (!isName(name)) e.errors.push(`row has picks but no valid name ("${raw.slice(0, 30)}")`);
    if (name && raw.trim() !== name) e.warnings.push('name had odd characters that were removed');
    const gamesUsed = new Map();
    for (let c = 10; c >= 1; c--) {
      const v = toInt(r[confCol[c]]);
      if (v == null) { e.errors.push(`no pick for confidence ${c}`); continue; }
      if (Number.isNaN(v)) { e.errors.push(`confidence ${c}: "${String(r[confCol[c]]).slice(0, 12)}" isn't a pool number`); continue; }
      if (!side.has(v)) { e.errors.push(`confidence ${c}: #${v} isn't on this week's sheet`); continue; }
      const gk = side.get(v);
      if (gamesUsed.has(gk)) { e.errors.push(`confidence ${c} (#${v}) is in the same game as confidence ${gamesUsed.get(gk)}`); continue; }
      gamesUsed.set(gk, c);
      e.conf[c] = v;
    }
    if (tbCol >= 0) {
      const t = toInt(r[tbCol]);
      if (t == null) e.warnings.push('no tiebreaker');
      else if (Number.isNaN(t) || t < 0 || t > 200) e.warnings.push(`tiebreaker "${String(r[tbCol]).slice(0, 10)}" ignored (expected 0–200)`);
      else e.tiebreaker = t;
    }
    const key = name.toLowerCase();
    if (name && seen.has(key)) e.errors.push('this name appears more than once in the upload');
    seen.add(key);
    entries.push(e);
  }
  if (!entries.length) fileErrors.push(`${fileName}: no pick rows found under the header.`);
  return { entries, fileErrors };
}

export function diffPicks(existing, e) {
  if (!existing) return { status: 'new', changes: [] };
  const changes = [];
  for (let c = 10; c >= 1; c--) if (existing.conf?.[c] !== e.conf[c]) changes.push(`conf ${c}: #${existing.conf?.[c] ?? '–'} → #${e.conf[c] ?? '–'}`);
  if ((existing.tiebreaker ?? null) !== (e.tiebreaker ?? null)) changes.push(`tiebreaker: ${existing.tiebreaker ?? '–'} → ${e.tiebreaker ?? '–'}`);
  return { status: changes.length ? 'changed' : 'unchanged', changes };
}

// ---------------------------------------------------------------- yearly totals
export function parseTotalsRows(rows, fileName = 'file') {
  const hi = rows.findIndex(r => r.some(c => /^name$/i.test(String(c).trim())) && r.some(c => /^week\s*1$/i.test(String(c).trim())));
  if (hi < 0) return { members: [], fileErrors: [`${fileName}: couldn't find the header row ("Name", "Week 1", ...). Is this the yearly totals workbook?`], errors: [] };
  const hdr = rows[hi].map(c => String(c).trim());
  const col = {}; hdr.forEach((h, i) => { const m = h.match(/^week\s*(\d+)$/i); if (m && !(m[1] in col)) col[m[1]] = i; });
  const members = [], errors = [], seen = new Map();
  for (const r of rows.slice(hi + 1)) {
    const name = cleanName(r[0]);
    if (!isName(name)) continue;                       // repeated header blocks, blanks
    const weeks = [];
    for (let w = 1; w <= 19; w++) {
      const v = toInt(r[col[w]]);
      if (v == null || col[w] == null) { weeks.push(null); continue; }
      if (Number.isNaN(v) || v < 0 || v > 55) { errors.push(`${name}, week ${w}: "${String(r[col[w]]).slice(0, 10)}" isn't a valid score (0–55)`); weeks.push(null); continue; }
      weeks.push(v);
    }
    const key = name.toLowerCase();
    if (seen.has(key)) { errors.push(`${name} appears twice; kept the first row`); continue; }
    seen.set(key, true);
    members.push({ name, weeks });
  }
  const fileErrors = members.length ? [] : [`${fileName}: no entries found.`];
  return { members, fileErrors, errors };
}

export function diffTotals(oldMembers = [], newMembers) {
  const oldBy = new Map(oldMembers.map(m => [m.name.toLowerCase(), m]));
  const newBy = new Map(newMembers.map(m => [m.name.toLowerCase(), m]));
  const added = newMembers.filter(m => !oldBy.has(m.name.toLowerCase())).map(m => m.name);
  const removed = oldMembers.filter(m => !newBy.has(m.name.toLowerCase())).map(m => m.name);
  const filled = new Set(), corrections = [];
  for (const m of newMembers) {
    const o = oldBy.get(m.name.toLowerCase()); if (!o) continue;
    m.weeks.forEach((v, i) => {
      const was = o.weeks[i];
      if (was == null && v != null) filled.add(i + 1);
      else if (was != null && v == null) corrections.push(`${m.name}, week ${i + 1}: ${was} → blank`);
      else if (was != null && v !== was) corrections.push(`${m.name}, week ${i + 1}: ${was} → ${v}`);
    });
  }
  const unchanged = !added.length && !removed.length && !filled.size && !corrections.length;
  return { added, removed, filledWeeks: [...filled].sort((a, b) => a - b), corrections, unchanged };
}
