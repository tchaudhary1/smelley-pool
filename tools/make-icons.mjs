// App icons for the web app manifest (Android install + notifications), cut from the crest.
//   node tools/make-icons.mjs
import sharp from 'sharp';

const crest = 'assets/crest-640.webp';
// The four quadrants of the shield (peach, bison, Georgia, train), as a square.
const square = { left: 200, top: 258, width: 264, height: 264 };
const NAVY = '#1d2b4a';
const quad = size => sharp(crest).extract(square).resize(size, size, { kernel: 'lanczos3' }).png();

await quad(192).toFile('assets/icon-192.png');
await quad(512).toFile('assets/icon-512.png');
// Maskable: Android may crop to a circle or squircle, so keep the art inside the middle 80%.
const inner = await quad(400).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: NAVY } }).composite([{ input: inner, left: 56, top: 56 }]).png().toFile('assets/icon-maskable-512.png');
// Status-bar badge: Android shows only the alpha channel, in white. A plain shield outline.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <path fill-rule="evenodd" fill="#fff" d="M48 6 L84 18 V46 C84 68 68 82 48 90 C28 82 12 68 12 46 V18 Z M48 17 L74 26 V46 C74 61 63 72 48 79 C33 72 22 61 22 46 V26 Z"/>
  <rect x="44" y="26" width="8" height="46" fill="#fff"/><rect x="28" y="42" width="40" height="8" fill="#fff"/></svg>`;
await sharp(Buffer.from(badge)).png().toFile('assets/badge-96.png');
console.log('wrote assets/icon-192.png, icon-512.png, icon-maskable-512.png, badge-96.png');
