// Small DOM, formatting and SVG chart helpers.
import { FAMILY, BOT } from './config.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = x => x < 0.005 ? '<1%' : x > 0.995 ? '>99%' : `${Math.round(x * 100)}%`;
export const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1);

export const fam = key => FAMILY.find(f => f.key === key) || (key === BOT.key ? BOT : undefined);
export const famByPool = name => FAMILY.find(f => f.pool === name);
export const initial = f => f?.initial || (f?.short || '?')[0];
export const avatar = (f, cls = '') => `<span class="av ${cls}" style="background:${f?.color || '#888'}" title="${esc(f?.short)}">${esc(initial(f))}</span>`;

export const etTime = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(':00', '');
export const etDay = iso => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric' });
export function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function until(iso) {
  const s = (new Date(iso) - Date.now()) / 1000; if (s <= 0) return 'now';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`;
}

// Competition ranking (1,2,2,4) of numeric values, higher is better.
export function ranks(values) {
  return values.map(v => v == null ? null : 1 + values.filter(o => o != null && o > v).length);
}
export const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
export function median(a) { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
export function quantile(a, q) { const s = [...a].sort((x, y) => x - y); if (!s.length) return 0; const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); }

// ---------- modal ----------
let lastFocus = null;
export function openModal(html, { onMount } = {}) {
  closeModal();
  lastFocus = document.activeElement;
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-bg" data-close><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const bg = root.firstElementChild;
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-x]')) closeModal(); });
  document.addEventListener('keydown', escClose);
  onMount?.(bg.firstElementChild);
  bg.querySelector('[data-x]')?.focus();
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
export function closeModal() {
  $('#modalRoot').innerHTML = ''; document.removeEventListener('keydown', escClose);
  lastFocus?.focus?.();
}
export const modalHead = (kicker, title, extra = '') =>
  `<div class="mh">${extra}<div><div class="kicker">${esc(kicker)}</div><h2>${title}</h2></div><button class="x" data-x aria-label="Close">×</button></div>`;

// ---------- charts (plain SVG) ----------
// series: [{label, color, values:[..], width, dash}], x labels
export function lineChart({ series, labels, height = 190, yMin, yMax, fmtY = v => v }) {
  const W = 600, H = height, L = 34, R = 10, T = 10, B = 22;
  const all = series.flatMap(s => s.values.filter(v => v != null));
  const lo = yMin ?? Math.floor(Math.min(...all) / 10) * 10, hi = yMax ?? (Math.ceil(Math.max(...all) / 10) * 10 || 10);
  const x = i => L + (labels.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (labels.length - 1));
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
  const ticks = 4; let grid = '';
  for (let k = 0; k <= ticks; k++) { const v = lo + (hi - lo) * k / ticks; grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" /><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtY(Math.round(v))}</text>`; }
  const xl = labels.map((l, i) => `<text x="${x(i)}" y="${H - 5}" text-anchor="middle">${esc(l)}</text>`).join('');
  const lines = series.map(s => {
    const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v)]);
    let d = '', pen = false; for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`; pen = true; }
    const dots = pts.filter(Boolean).map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${s.width > 2 ? 3.5 : 2.5}" fill="${s.color}"><title>${esc(s.label)}</title></circle>`).join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round" />${dots}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}${xl}${lines}</svg>`;
}

// Strip plot: columns of dots (one per week), highlights drawn on top.
export function stripPlot({ columns, labels, highlights, height = 230 }) {
  const W = 600, H = height, L = 34, R = 10, T = 10, B = 22;
  const all = columns.flat().filter(v => v != null);
  const lo = 0, hi = Math.max(55, Math.ceil(Math.max(...all) / 5) * 5);
  const cw = (W - L - R) / labels.length;
  const x = i => L + cw * (i + .5);
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let grid = '';
  for (const v of [0, 10, 20, 30, 40, 50]) if (v <= hi) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" /><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  let dots = '';
  columns.forEach((col, i) => {
    const counts = {};
    for (const v of col) { if (v == null) continue; const k = v; counts[k] = (counts[k] || 0) + 1; const n = counts[k];
      const jitter = ((n % 2 ? 1 : -1) * Math.ceil((n - 1) / 2)) * 5;
      dots += `<circle cx="${x(i) + jitter}" cy="${y(v)}" r="2.6" fill="var(--ink-3)" opacity=".35" />`; }
    const m = mean(col.filter(v => v != null));
    if (col.some(v => v != null)) dots += `<line x1="${x(i) - cw * .38}" x2="${x(i) + cw * .38}" y1="${y(m)}" y2="${y(m)}" stroke="var(--ink-2)" stroke-dasharray="3 3" />`;
  });
  const hs = highlights.map((h, hi2) => h.values.map((v, i) => v == null ? '' :
    `<circle cx="${x(i) + (hi2 - (highlights.length - 1) / 2) * 7}" cy="${y(v)}" r="5.5" fill="${h.color}" stroke="var(--panel)" stroke-width="1.5"><title>${esc(h.label)}: ${v}</title></circle>`).join('')).join('');
  const xl = labels.map((l, i) => `<text x="${x(i)}" y="${H - 5}" text-anchor="middle">${esc(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}${xl}${dots}${hs}</svg>`;
}

// Histogram of values with labelled markers.
export function histogram({ values, markers, bin = 5, height = 170 }) {
  const W = 600, H = height, L = 10, R = 10, T = 26, B = 22;
  const lo = Math.floor(Math.min(...values) / bin) * bin, hi = Math.ceil((Math.max(...values) + 1) / bin) * bin;
  const nb = Math.max(1, (hi - lo) / bin); const counts = Array(nb).fill(0);
  for (const v of values) counts[Math.min(nb - 1, Math.floor((v - lo) / bin))]++;
  const cmax = Math.max(...counts);
  const bw = (W - L - R) / nb, x = v => L + (v - lo) / (hi - lo) * (W - L - R), y = c => T + (H - T - B) * (1 - c / cmax);
  const bars = counts.map((c, i) => `<rect x="${L + i * bw + 1}" y="${y(c)}" width="${bw - 2}" height="${H - B - y(c)}" rx="2" fill="var(--slate)" opacity=".35"><title>${lo + i * bin}–${lo + (i + 1) * bin - 1}: ${c}</title></rect>`).join('');
  const xl = counts.map((_, i) => i % 2 ? '' : `<text x="${L + i * bw}" y="${H - 5}" text-anchor="middle">${lo + i * bin}</text>`).join('');
  const mk = markers.map((m, i) => `<line x1="${x(m.value)}" x2="${x(m.value)}" y1="${T - 4 + (i % 3) * 7}" y2="${H - B}" stroke="${m.color}" stroke-width="2.5" /><circle cx="${x(m.value)}" cy="${T - 4 + (i % 3) * 7}" r="4" fill="${m.color}"><title>${esc(m.label)}: ${m.value}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${bars}${xl}${mk}</svg>`;
}
