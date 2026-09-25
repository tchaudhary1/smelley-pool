// Tiny static server for local preview: node tools/serve.mjs [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const port = Number(process.argv[2] || 8765);
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  // Never serve secrets or private data: dotfiles/dirs, *.local.json, inputs/, node_modules/.
  const rel = path.relative(root, f).split(path.sep);
  if (rel.some(seg => seg.startsWith('.')) || /.local.json$|commentator-state.json$|.log$/.test(f) || ['inputs', 'node_modules', 'tools', 'supabase'].includes(rel[0])) { res.writeHead(404).end('not found'); return; }
  fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(buf); });
}).listen(port, () => console.log(`http://localhost:${port}`));
