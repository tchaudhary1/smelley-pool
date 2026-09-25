// Parser for the commissioner's weekly odds sheets (Word docs, text extracted).
// Tolerates the quirks seen in real sheets: a missing period after a pool number ("85  James
// Madison"), a bare "½" spread (pick'em), "TIEBREAKER" labels inside the line, a line whose first
// number was lost ("  RUTGERS  14½  70. Miami (OH)"), and two games run together on one line.
export function parseOdds(text) {
  const games = []; let section = { day: null, league: null };
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/ /g, ' ').replace(/TIE\s*BREAKER(\s+GAME)?/gi, ' ');
    const hdr = line.match(/(\w+)'s\s+(NFL|College)\s+Football\s+Games?/i);
    if (hdr) { section = { day: hdr[1], league: /NFL/i.test(hdr[2]) ? 'NFL' : 'CFB' }; continue; }
    // "85   James Madison" -> "85. James Madison"
    line = line.replace(/(^|\s)(\d{1,3})(?:\s{2,}|\t+)(?=[A-Za-z])/g, '$1$2. ');
    const re = /(\d{1,3})\.\s*([A-Za-z][^\t]*?)\s+(\d*)(½?)\s+(\d{1,3})\.\s*(.+?)(?=\s+\d{1,3}\.\s|\s*$)/g;
    let m, found = false;
    while ((m = re.exec(line))) {
      const [, fno, fav, whole, half, dno, dog] = m;
      if (!whole && !half) continue;
      push(+fno, fav, (whole ? +whole : 0) + (half ? 0.5 : 0), +dno, dog); found = true;
    }
    if (!found) {   // favorite's number missing: "  RUTGERS    14½    70.  Miami (OH)"
      const m2 = line.match(/^\s*([A-Za-z][^\t]*?)\s+(\d*)(½?)\s+(\d{1,3})\.\s*(.+?)\s*$/);
      if (m2 && (m2[2] || m2[3]) && +m2[4] % 2 === 0) push(+m2[4] - 1, m2[1], (m2[2] ? +m2[2] : 0) + (m2[3] ? 0.5 : 0), +m2[4], m2[5]);
    }
  }
  function push(fav_no, fav, spread, dog_no, dog) {
    const favT = fav.trim(), dogT = dog.trim(); const isHome = s => s === s.toUpperCase() && /[A-Z]/.test(s);
    if (games.some(g => g.fav_no === fav_no)) return;
    games.push({ fav_no, dog_no, fav: favT, dog: dogT, spread, home: isHome(favT) ? 'fav' : isHome(dogT) ? 'dog' : null, day: section.day, league: section.league });
  }
  return games.sort((a, b) => a.fav_no - b.fav_no);
}
