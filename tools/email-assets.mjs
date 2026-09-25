// Crops demo-mode screenshots into email graphics (assets/email/). Screenshots come from
// headless Edge at 500px wide x2 (see README); they show demo data only.
//   node tools/email-assets.mjs <shotsDir>
import sharp from 'sharp';
import fs from 'node:fs';

const dir = process.argv[2]; if (!dir) throw new Error('usage: node tools/email-assets.mjs <shotsDir>');
fs.mkdirSync('assets/email', { recursive: true });
const CARD = '#161e30';   // email card background (corners are flattened onto it)

async function crop(src, out, { left = 0, top, width = 1000, height }, targetW = 1000) {
  const img = sharp(`${dir}/${src}.png`).extract({ left, top, width, height });
  const buf = await img.resize({ width: targetW }).png().toBuffer();
  const { width: w, height: h } = await sharp(buf).metadata();
  const r = 28;
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
  const border = Buffer.from(`<svg width="${w}" height="${h}"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${r}" ry="${r}" fill="none" stroke="#c9a24a" stroke-opacity=".55" stroke-width="3"/></svg>`);
  const rounded = await sharp(buf).composite([{ input: mask, blend: 'dest-in' }, { input: border }]).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 3, background: CARD } })
    .composite([{ input: rounded }]).jpeg({ quality: 82, mozjpeg: true }).toFile(`assets/email/${out}.jpg`);
  console.log(out, `${w}x${h}`, Math.round(fs.statSync(`assets/email/${out}.jpg`).size / 1024) + ' KB');
}

await crop('gameday', 'scoreboard', { top: 296, height: 1374 });
await crop('gameday', 'leadwatch', { top: 1824, height: 512, width: 800 }, 800);
await crop('lab', 'race', { left: 22, top: 500, width: 956, height: 892 }, 956);
await crop('lab', 'whatifs', { left: 22, top: 1414, width: 956, height: 775 }, 956);
await crop('talk', 'chat', { top: 1280, height: 1100 });
// Crest for the header (PNG with transparency, email-safe; webp isn't supported everywhere).
await sharp('assets/crest-640.webp').resize(300).png({ compressionLevel: 9 }).toFile('assets/email/crest.png');
console.log('crest', Math.round(fs.statSync('assets/email/crest.png').size / 1024) + ' KB');
