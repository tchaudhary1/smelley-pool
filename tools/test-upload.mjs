// Tests for js/upload.js against the real week-4 files plus malformed cases: node tools/test-upload.mjs
import fs from 'node:fs';
import XLSX from 'xlsx';
import { parsePickRows, diffPicks, parseTotalsRows, diffTotals, cleanName, checkFile } from '../js/upload.js';
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.log('FAIL', msg)); };
const rowsOf = f => { const wb = XLSX.readFile(f); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' }); };
const week = JSON.parse(fs.readFileSync('local-data/week4.json', 'utf8'));
const roster = JSON.parse(fs.readFileSync('local-data/roster.json', 'utf8'));
const JAMIE = roster.jamie;   // full name comes from local data, not the repo
const league = JSON.parse(fs.readFileSync('local-data/league.json', 'utf8'));

// real pick sheet
const jam = parsePickRows(rowsOf(fs.readdirSync('inputs/week4').filter(f => /jamie/i.test(f)).map(f => 'inputs/week4/' + f)[0]), week, 'jamie.xls');
ok(jam.fileErrors.length === 0 && jam.entries.length === 1, 'jamie sheet parses to one entry');
ok(jam.entries[0].errors.length === 0, 'jamie entry valid: ' + jam.entries[0].errors.join('; '));
ok(jam.entries[0].conf[10] === 1 && jam.entries[0].tiebreaker === 42, 'jamie conf 10 = #1, tiebreaker 42');
ok(diffPicks(week.picks[JAMIE], jam.entries[0]).status === 'unchanged', 're-upload detected as unchanged');

// malformed pick rows
const hdr = ['Name', 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, '', 'Tie Breaker'];
const bad = parsePickRows([hdr,
  ['<script>alert(1)</script>Bob', 1, 79, 69, 11, 119, 92, 56, 45, 145, 124, '', 42],   // markup in name
  ['Dup Game', 1, 2, 69, 11, 119, 92, 56, 45, 145, 124, '', 42],                        // 1 and 2 are the same game
  ['Missing', 1, 79, '', 11, 119, 92, 56, 45, 145, 124, '', ''],
  ['Offsheet', 1, 79, 69, 11, 119, 92, 56, 45, 145, 999, '', 'abc'],
  ['Text', 'GB', 79, 69, 11, 119, 92, 56, 45, 145, 124, '', 42],
  ['', 1, 79, 69, 11, 119, 92, 56, 45, 145, 124, '', 42],
  ['Dup Game', 3, 79, 69, 11, 119, 92, 56, 45, 145, 124, '', 42]], week, 'bad.xls');
const by = n => bad.entries.find(e => e.name === n);
ok(by('alert(1) Bob') && !/[<>]/.test(by('alert(1) Bob').name), 'markup stripped from names');
ok(by('Dup Game').errors.some(e => /same game/.test(e)), 'same-game picks rejected');
ok(by('Missing').errors.some(e => /no pick for confidence 8/.test(e)), 'missing pick rejected');
ok(by('Offsheet').errors.some(e => /#999/.test(e)) && by('Offsheet').warnings.some(w => /tiebreaker/.test(w)), 'off-sheet number rejected, bad tiebreaker warned');
ok(by('Text').errors.some(e => /isn't a pool number/.test(e)), 'text in a pick cell rejected');
ok(bad.entries.some(e => e.errors.some(x => /no valid name/.test(x))), 'nameless row rejected');
ok(bad.entries.filter(e => e.name === 'Dup Game')[1].errors.some(e => /more than once/.test(e)), 'duplicate name in upload rejected');
ok(parsePickRows([['foo', 'bar'], ['x', 1]], week, 'junk.xls').fileErrors.length === 1, 'non-pick sheet rejected');
const changed = diffPicks(week.picks[JAMIE], { conf: { ...jam.entries[0].conf, 1: 146 }, tiebreaker: 42 });
ok(changed.status === 'changed' && changed.changes[0] === 'conf 1: #124 → #146', 'changed pick described');

// real totals workbook
const tot = parseTotalsRows(rowsOf('inputs/Yearly_totals_through_Week_3.xls'), 'totals.xls');
ok(tot.fileErrors.length === 0 && tot.members.length === 113 && tot.errors.length === 0, `totals: 113 entries, no errors (${tot.members.length}, ${tot.errors.join('; ')})`);
ok(diffTotals(league.members, tot.members).unchanged, 'same totals re-upload is unchanged');
const next = tot.members.map(m => ({ ...m, weeks: m.weeks.map((v, i) => i === 3 ? 30 : v) }));
next[0] = { ...next[0], weeks: next[0].weeks.map((v, i) => i === 0 ? 99 : v) };
const badTot = parseTotalsRows([['Name', 'Week 1', 'Week 2'], ['Ann', 99, 'x'], ['Ann', 10, 10]], 't.xls');
ok(badTot.errors.length === 3, 'score out of range, non-numeric score and duplicate name flagged: ' + badTot.errors.join('; '));
const d = diffTotals(league.members, next.slice(1));
ok(d.filledWeeks.join() === '4' && d.removed.length === 1, 'new week detected and a removed entry flagged');
const corr = diffTotals(league.members, tot.members.map((m, i) => i ? m : { ...m, weeks: m.weeks.map((v, j) => j === 1 ? v + 1 : v) }));
ok(corr.corrections.length === 1, 'past-week correction flagged');
ok(checkFile({ name: 'x.exe', size: 10 }) && checkFile({ name: 'a.xls', size: 6e6 }) && !checkFile({ name: 'a.xls', size: 1000 }), 'file type and size checks');
ok(cleanName('  Pat' + String.fromCharCode(0x200b) + '   Example' + String.fromCharCode(7) + ' ') === 'Pat Example', 'zero-width/control chars and spacing cleaned');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
