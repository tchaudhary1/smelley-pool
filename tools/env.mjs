// Reads KEY=VALUE pairs from .env (gitignored), falling back to the process environment.
import fs from 'node:fs';

const fileVars = {};
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fileVars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
export function env(name) {
  const v = process.env[name] ?? fileVars[name];
  if (!v) throw new Error(`${name} is not set (add it to .env)`);
  return v;
}
