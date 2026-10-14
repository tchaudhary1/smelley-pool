// Plain text from a Word 97-2003 .doc (the commissioner's odds sheets), in the browser or Node.
// CFB is SheetJS's compound-file reader (XLSX.CFB), passed in so this file has no imports.
// Reads the main document text through the piece table (MS-DOC 2.4.1): each piece is either
// 8-bit Windows-1252 ("compressed") or UTF-16LE. Table cells become tabs, paragraph marks become
// newlines, and of each field only its displayed result is kept.
export function docText(CFB, data) {
  const cfb = CFB.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: 'array' });
  const stream = name => { const f = CFB.find(cfb, name); if (!f?.content) throw new Error(`not a Word .doc (no ${name} stream)`); return Uint8Array.from(f.content); };
  const wd = stream('WordDocument');
  const u16 = (b, o) => b[o] | b[o + 1] << 8, u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
  if (u16(wd, 0) !== 0xA5EC) throw new Error('not a Word .doc (bad header)');
  if (u16(wd, 0x0A) & 0x0100) throw new Error('the .doc is password-protected');
  const table = stream(u16(wd, 0x0A) & 0x0200 ? '1Table' : '0Table');
  const ccpText = u32(wd, 0x4C), fcClx = u32(wd, 0x1A2), lcbClx = u32(wd, 0x1A6);

  // Clx: skip any Prc blocks (0x01), then the Pcdt (0x02) holding the piece table.
  let o = fcClx; const end = fcClx + lcbClx;
  while (o < end && table[o] === 0x01) o += 3 + u16(table, o + 1);
  if (table[o] !== 0x02) throw new Error("couldn't find the .doc's text table");
  const lcb = u32(table, o + 1), plc = o + 5, n = (lcb - 4) / 12;
  const cp1252 = new TextDecoder('windows-1252'), utf16 = new TextDecoder('utf-16le');
  let text = '';
  for (let i = 0; i < n && text.length < ccpText; i++) {
    const cpStart = u32(table, plc + i * 4), cpEnd = Math.min(u32(table, plc + (i + 1) * 4), ccpText);
    if (cpEnd <= cpStart) continue;
    const fcRaw = u32(table, plc + (n + 1) * 4 + i * 8 + 2), len = cpEnd - cpStart;
    text += fcRaw & 0x40000000
      ? cp1252.decode(wd.subarray((fcRaw & 0x3FFFFFFF) / 2, (fcRaw & 0x3FFFFFFF) / 2 + len))
      : utf16.decode(wd.subarray(fcRaw, fcRaw + 2 * len));
  }
  return cleanDocText(text.slice(0, ccpText));
}

// Fields: \x13 instructions \x14 result \x15 -> result. Then Word's control characters.
function cleanDocText(t) {
  let out = '', depth = 0; const inInstr = [];
  for (const ch of t) {
    if (ch === '\x13') { depth++; inInstr.push(true); continue; }
    if (ch === '\x14') { if (depth) inInstr[depth - 1] = false; continue; }
    if (ch === '\x15') { if (depth) { depth--; inInstr.pop(); } continue; }
    if (depth && inInstr[depth - 1]) continue;
    out += ch;
  }
  return out.replace(/\x07/g, '\t').replace(/[\r\x0B\x0C]/g, '\n').replace(/\x1E/g, '-').replace(/[\x00-\x08\x0E-\x1F]/g, '');
}
