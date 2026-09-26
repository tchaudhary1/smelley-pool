// Screenshot a page in headless Edge after waiting in real time, so data fetched after load
// (news, history) is on screen. Uses the DevTools protocol over Node's built-in WebSocket.
//   node tools/shot.mjs <url> <out.png> [width=500] [height=3000] [waitMs=8000]
// Output is at 2x device scale, like the other email screenshots.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [url, out, W = '500', H = '3000', WAIT = '8000'] = process.argv.slice(2);
if (!url || !out) throw new Error('usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let targets; for (let i = 0; i < 50 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => null); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 2, mobile: false });
  // Some feeds (ESPN) refuse the "HeadlessEdg" user agent; present as ordinary Edge.
  const { result: v } = await send('Browser.getVersion');
  await send('Network.setUserAgentOverride', { userAgent: v.userAgent.replace('HeadlessEdg', 'Edg').replace('HeadlessChrome', 'Chrome') });
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(+WAIT);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('wrote', out);
  ws.close();
} finally { edge.kill(); }
