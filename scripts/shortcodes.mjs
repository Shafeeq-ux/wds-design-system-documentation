// Build-time shortcodes. In a page, write <!--wds:name arg--> and the build replaces it
// with HTML generated from tokens/wds-tokens.json, so tables never drift from Figma.
//
//   <!--wds:ramp color/gray-->            primitive colour ramp
//   <!--wds:theme text/-->                theme tokens under a path, light + dark, with contrast
//   <!--wds:type-scale-->                 every text style at desktop / tablet / mobile
//   <!--wds:scale spacing/padding/p--->   single-mode size tokens drawn as bars
//   <!--wds:responsive spacing/width/-->  breakpoint tokens at desktop / tablet / mobile
//   <!--wds:radii-->  <!--wds:borders-->  border radius and width previews
//   <!--wds:gradients-->                  gradient cards in light and dark
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cssName } from './build-tokens.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'tokens/wds-tokens.json'), 'utf8'));
const C = data.collections;
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- colour maths (WCAG 2.x) ----------
function rgba(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
}
const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
function over(fg, bg) { const [r, g, b, a] = rgba(fg); const B = rgba(bg); return [r * a + B[0] * (1 - a), g * a + B[1] * (1 - a), b * a + B[2] * (1 - a)]; }
export function contrast(fg, bg) {
  const a = lum(over(fg, bg)); const b = lum(rgba(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function grade(ratio, large = false) {
  const r = Math.round(ratio * 100) / 100;
  const pass = large ? (r >= 4.5 ? 'AAA' : r >= 3 ? 'AA' : 'Fail') : r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large' : 'Fail';
  return `<span class="cr cr-${pass === 'Fail' ? 'fail' : 'pass'}">${r.toFixed(2)} · ${pass}</span>`;
}

const pageBg = C.theme.tokens.find(([p]) => p === 'background/bg-page')[1]; // [light, dark]

// ---------- pieces ----------
const copyBtn = (name) => `<button type="button" class="copy" data-copy="var(${name})" aria-label="Copy var(${name})"><code>${name}</code></button>`;
const chip = (hex) => `<span class="chip" style="background:${hex}" aria-hidden="true"></span>`;
const table = (head, rows, cls = '') => `<div class="table-wrap"><table class="${cls}"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

function ramp(prefix) {
  const items = C.primitives.tokens.filter(([p]) => p.startsWith(prefix + '/'));
  return `<ul class="ramp">${items.map(([p, [hex]]) => {
    const name = cssName(p);
    const onLight = contrast(hex, '#ffffff') >= contrast(hex, '#0a0c10');
    return `<li><button type="button" class="ramp-sw copy" data-copy="var(${name})" style="background:${hex};color:${onLight ? '#ffffff' : '#0a0c10'}" aria-label="${esc(p.split('/').pop())} ${hex}. Copy var(${name})"><span>${esc(p.split('/').pop())}</span><span>${hex}</span></button></li>`;
  }).join('')}</ul>`;
}

function theme(prefix) {
  const rows = C.theme.tokens.filter(([p]) => p.startsWith(prefix));
  const isText = /^(text|icon)/.test(prefix);
  return table(['Token', 'Light', 'Dark', 'Alias', ...(isText ? ['Contrast on bg-page (light / dark)'] : [])], rows.map(([p, [l, d], ref]) => {
    const name = cssName(p);
    const fgLike = /text|icon|label|helper|placeholder/.test(p.split('/').pop());
    const cr = isText ? `<td>${fgLike ? `${grade(contrast(l, pageBg[0]))} ${grade(contrast(d, pageBg[1]))}` : '—'}</td>` : '';
    return `<tr><td>${copyBtn(name)}<small class="figma-path">${esc(p)}</small></td><td class="val">${chip(l)}<code>${l}</code></td><td class="val val-dark">${chip(d)}<code>${d}</code></td><td><small>${esc(ref || '—')}</small></td>${cr}</tr>`;
  }), 'token-table');
}

function typeScale() {
  const S = C.typography.styles;
  const weights = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold' };
  return table(['Style', 'Desktop', 'Tablet', 'Mobile', 'Weight · width', 'Letter spacing (D / T / M)'], Object.entries(S).map(([n, s]) => {
    const cell = (i) => `<td class="num">${s.size[i]} / ${s.lh[i]}</td>`;
    return `<tr><td><span class="wds-${n} type-sample">${n.startsWith('body') || n === 'button' || n === 'overline' ? 'The quick brown fox' : 'Built for dealers'}</span><button type="button" class="copy" data-copy=".wds-${n}" aria-label="Copy class wds-${n}"><code>.wds-${n}</code></button></td>${cell(0)}${cell(1)}${cell(2)}<td>${weights[s.weight]} ${s.weight} · ${s.stretch}%</td><td class="num">${s.ls.join(' / ')}</td></tr>`;
  }), 'type-table');
}

function scale(prefix) {
  const rows = [...C.dimensions.tokens, ...C.primitives.tokens].filter(([p]) => p.startsWith(prefix));
  return table(['Token', 'Value', ''], rows.map(([p, [v], ref]) => `<tr><td>${copyBtn(cssName(p))}${ref ? `<small class="figma-path">${esc(ref)}</small>` : ''}</td><td class="num">${v}px</td><td class="bar-cell"><span class="bar" style="width:${Math.min(v, 200)}px"></span></td></tr>`), 'scale-table');
}

function responsive(prefix) {
  const rows = C.breakpoint.tokens.filter(([p]) => p.startsWith(prefix));
  return table(['Token', 'Desktop', 'Tablet', 'Mobile'], rows.map(([p, v]) => `<tr><td>${copyBtn(cssName(p))}</td>${v.map((x) => `<td class="num">${x}px</td>`).join('')}</tr>`));
}

function radii() {
  const rows = C.dimensions.tokens.filter(([p]) => p.startsWith('border/border-radius/'));
  return `<ul class="radius-grid">${rows.map(([p, [v], ref]) => `<li><span class="radius-box" style="border-radius:${Math.min(v, 9999)}px"></span>${copyBtn(cssName(p))}<small>${v === 9999 ? 'Full (9999px)' : v + 'px'}${ref ? ` · ${esc(ref.split('/').pop())}` : ''}</small></li>`).join('')}</ul>`;
}

function borders() {
  const rows = C.dimensions.tokens.filter(([p]) => p.startsWith('border/border-width/'));
  return table(['Token', 'Value', 'Preview'], rows.map(([p, [v], ref]) => `<tr><td>${copyBtn(cssName(p))}${ref ? `<small class="figma-path">${esc(ref)}</small>` : ''}</td><td class="num">${v}px</td><td><span class="border-demo" style="border-width:${v}px"></span></td></tr>`));
}

function gradients() {
  const names = [...new Set(C.theme.tokens.filter(([p]) => p.startsWith('gradient/')).map(([p]) => p.split('/')[1]))];
  const card = (n, mode) => `<figure class="grad-card" data-theme="${mode}"><div class="grad-sw" style="background:var(--wds-${n})"></div><figcaption>${copyBtn('--wds-' + n)}<small>${data.gradients?.styles?.[n]?.type || 'linear'} · ${mode}</small></figcaption></figure>`;
  return `<div class="grad-grid">${names.map((n) => card(n, 'light') + card(n, 'dark')).join('')}</div>`;
}

// Real foreground/background pairs, checked in both themes
const PAIRS = [
  ['text/text-primary', 'background/bg-page', 'Body copy'],
  ['text/text-secondary', 'background/bg-page', 'Supporting copy'],
  ['text/text-tertiary', 'background/bg-page', 'Captions, metadata'],
  ['text/text-primary', 'background/bg-subtle', 'Copy on subtle sections'],
  ['text/text-secondary', 'background/bg-subtle', 'Supporting copy on subtle sections'],
  ['text/text-inverse', 'background/bg-inverse', 'Copy on inverse sections'],
  ['text/text-teal', 'background/bg-page', 'Teal accent text'],
  ['components/button-primary/btn-primary-text-default', 'components/button-primary/btn-primary-bg-default', 'Primary button label'],
  ['components/button-secondary/btn-secondary-text', 'background/bg-page', 'Secondary button label'],
  ['components/input/input-placeholder', 'background/bg-page', 'Input placeholder'],
  ['status/status-success-text', 'status/status-success-bg', 'Success message'],
  ['status/status-warning-text', 'status/status-warning-bg', 'Warning message'],
  ['status/status-error-text', 'status/status-error-bg', 'Error message'],
  ['status/status-destructive-text', 'status/status-destructive-bg', 'Destructive action'],
  ['border/border-default', 'background/bg-page', 'Input and card borders (needs 3:1 when it identifies a control)'],
];
function pairs() {
  const T = Object.fromEntries(C.theme.tokens.map(([p, v]) => [p, v]));
  return table(['Pair', 'Use', 'Light', 'Dark'], PAIRS.map(([fg, bg, use]) => {
    const cell = (i) => { const bgHex = rgba(T[bg][i])[3] < 1 ? '#' + over(T[bg][i], pageBg[i]).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : T[bg][i];
      return `<td><span class="pair-demo" style="color:${T[fg][i]};background:${bgHex}">Aa</span> ${grade(contrast(T[fg][i], bgHex), fg.startsWith('border'))}</td>`; };
    return `<tr><td><code>${cssName(fg)}</code><br><small>on <code>${cssName(bg)}</code></small></td><td>${use}</td>${cell(0)}${cell(1)}</tr>`;
  }), 'pairs-table');
}

// 16px utility icons, inlined so they inherit currentColor
function icons() {
  const dir = join(root, 'assets/icons');
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  return `<ul class="icon-grid">${files.map((f) => {
    const name = f.replace('.svg', '');
    const svg = readFileSync(join(dir, f), 'utf8').replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
    return `<li><span class="icon-tile">${svg}</span><a href="/assets/icons/${f}" download>icon/${name}</a></li>`;
  }).join('')}</ul>`;
}

// 48px feature icons: names and search keywords from the Figma Icon Documentation frame
function iconKeywords() {
  const d = JSON.parse(readFileSync(join(root, 'src/data/icons.json'), 'utf8'));
  return `<label class="filter"><span>Filter icons</span><input type="search" data-filter="#icon-table" placeholder="Try “invoice” or “ai”" autocomplete="off"></label>`
    + table(['Name', 'Keywords'], d.documented.map(([n, k]) => `<tr><td><code>${esc(n)}</code></td><td>${esc(k)}</td></tr>`)).replace('<table class="">', '<table id="icon-table">')
    + `<p>Another ${d.undocumented.length} feature icons exist in Figma without keywords yet:</p><p class="tag-list">${d.undocumented.map((n) => `<code>${esc(n)}</code>`).join(' ')}</p>`;
}

const CODES = { pairs, icons, 'icon-keywords': iconKeywords, ramp, theme, 'type-scale': typeScale, scale, responsive, radii, borders, gradients };

export function applyShortcodes(html) {
  return html.replace(/<!--wds:([\w-]+)\s*([^>]*?)-->/g, (all, name, arg) => {
    const fn = CODES[name];
    if (!fn) throw new Error(`Unknown shortcode wds:${name}`);
    return fn(arg.trim());
  });
}
