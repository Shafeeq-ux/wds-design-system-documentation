// Token inspector: <!--wds:token-map hero-default--> renders the Figma variant images with
// every layer that uses a variable, from src/data/token-map/<key>.json (extracted from Figma
// with the Plugin API: boundVariables, text styles and auto-layout padding / gap).
// Values come from tokens/wds-tokens.json, so they always match tokens.css.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cssName } from './build-tokens.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = JSON.parse(readFileSync(join(root, 'tokens/wds-tokens.json'), 'utf8')).collections;
const FIGMA = 'https://www.figma.com/design/lf5SOxUpWBtO8AIzXf6snw/WDS-3.0?node-id=';
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Figma variable path -> { values per mode, alias, collection }
const TOK = new Map();
for (const [p, v, ref] of C.theme.tokens) TOK.set(p, { kind: 'theme', v, ref });
for (const [p, v, ref] of C.breakpoint.tokens) TOK.set(p, { kind: 'breakpoint', v, ref });
for (const [p, v, ref] of C.dimensions.tokens) TOK.set(p, { kind: 'single', v, ref });
for (const [p, v] of C.primitives.tokens) TOK.set(p, { kind: 'single', v });

const BP = ['desktop', 'tablet', 'mobile'];
const px = (v) => (typeof v === 'number' ? `${v}px` : v);
const short = (h) => (typeof h === 'string' && /^#[0-9a-f]{8}$/i.test(h) && h.endsWith('00') ? `${h} (transparent)` : h);

function resolve(path, mode) {
  const t = TOK.get(path);
  if (!t) return { value: '', across: '' };
  if (t.kind === 'theme') return { value: short(t.v[mode.theme]), across: `Light ${short(t.v[0])} · Dark ${short(t.v[1])}`, ref: t.ref, swatch: true };
  if (t.kind === 'breakpoint') return { value: px(t.v[mode.bp]), across: BP.map((b, i) => `${b[0].toUpperCase() + b.slice(1)} ${px(t.v[i])}`).join(' · '), ref: t.ref };
  return { value: px(t.v[0]), across: '', ref: t.ref };
}

const SP_LABEL = { pt: 'Padding top', pr: 'Padding right', pb: 'Padding bottom', pl: 'Padding left', gap: 'Gap', gap2: 'Row gap', w: 'Width', minW: 'Min width', maxW: 'Max width', h: 'Height', minH: 'Min height' };
const SP_CSS = { pt: 'padding-top', pr: 'padding-right', pb: 'padding-bottom', pl: 'padding-left', gap: 'gap', gap2: 'row-gap', w: 'width', minW: 'min-width', maxW: 'max-width', h: 'height', minH: 'min-height' };
const BD_LABEL = { r: 'Corner radius', sw: 'Border width' };
const BD_CSS = { r: 'border-radius', sw: 'border-width' };

function rowsFor(n, mode, name) {
  const rows = [], css = [], issues = [...(n.warn || [])];
  const isText = n.t === 'TEXT';
  if (n.al) css.push(`display: flex;`, `flex-direction: ${n.al === 'V' ? 'column' : 'row'};`);
  if (n.ty) {
    const g = (n.ty.group || '').split('/').pop();
    const st = C.typography.styles[g];
    const across = st ? BP.map((b, i) => `${b[0].toUpperCase() + b.slice(1)} ${st.size[i]}/${st.lh[i]}`).join(' · ') : '';
    rows.push({ cat: 'type', prop: 'Text style', figma: n.ty.style || `${g} (variables only)`, css: st ? `.wds-${g}` : '', value: st ? `${st.size[mode.bp]}px / ${st.lh[mode.bp]}px, weight ${st.weight}` : `${n.ty.size}px`, across });
    if (st) css.push(`/* class="wds-${g}" sets font-size, line-height, letter-spacing, weight */`);
  }
  for (const c of n.c || []) {
    if (c.stops) {
      const names = c.stops.map((s) => name(s.v));
      const group = names[0] && names[0].split('/')[1];
      rows.push({ cat: 'color', prop: c.role.startsWith('text') ? 'Text gradient' : 'Gradient', figma: group ? `gradient/${group}` : 'Unbound gradient', css: group ? `--wds-${group}` : '', value: c.stops.map((s, i) => (names[i] ? resolve(names[i], mode).value : s.hex)).join(' → '), across: names.filter(Boolean).map(cssName).join(', '), grad: c.stops.map((s, i) => (names[i] ? resolve(names[i], mode).value : s.hex)) });
      if (group) css.push(c.role.startsWith('text') ? `background: var(--wds-${group}); -webkit-background-clip: text; background-clip: text; color: transparent;` : `background: var(--wds-${group});`);
      continue;
    }
    if (c.role.endsWith('image')) { rows.push({ cat: 'color', prop: 'Background image', figma: 'Image fill (no variable)', css: '', value: 'Image' }); continue; }
    const path = name(c.v);
    const r = resolve(path, mode);
    const prop = c.role === 'text' ? 'Text colour' : c.role === 'stroke' ? (n.t === 'LINE' ? 'Line colour' : 'Border colour') : 'Background';
    rows.push({ cat: 'color', prop, figma: path, css: cssName(path), value: r.value, across: r.across, ref: r.ref, swatch: r.value });
    css.push(`${c.role === 'text' ? 'color' : c.role === 'stroke' ? (n.t === 'LINE' ? 'border-left-color' : 'border-color') : 'background-color'}: var(${cssName(path)});`);
  }
  // Spacing: merge sides that share the same variable
  const sp = n.sp || {};
  const groups = new Map();
  for (const [k, x] of Object.entries(sp)) {
    const key = `${x.v}|${x.px}|${k.startsWith('p') && k.length === 2 ? 'pad' : k}`;
    if (!groups.has(key)) groups.set(key, { keys: [], x });
    groups.get(key).keys.push(k);
  }
  for (const { keys, x } of groups.values()) {
    const path = x.v == null ? null : name(x.v);
    const label = keys.length === 4 ? 'Padding (all sides)' : keys.map((k) => SP_LABEL[k]).join(', ').replace(/Padding (\w+), Padding (\w+)/, 'Padding $1 and $2');
    const r = path ? resolve(path, mode) : { value: `${x.px}px`, across: '' };
    rows.push({ cat: 'space', prop: label, figma: path || 'No variable', css: path ? cssName(path) : '', value: r.value, across: r.across, ref: r.ref, hard: !path });
    if (path && r.value && parseFloat(r.value) !== x.px) issues.push(`${label}: Figma shows ${x.px}px but the token resolves to ${r.value}`);
    for (const k of keys) css.push(`${isText && k === 'w' ? 'max-width' : SP_CSS[k]}: ${path ? `var(${cssName(path)})` : `${x.px}px`};${path ? '' : ' /* not tokenised in Figma */'}`);
  }
  for (const [k, x] of Object.entries(n.bd || {})) {
    const path = name(x.v);
    const r = resolve(path, mode);
    rows.push({ cat: 'border', prop: BD_LABEL[k], figma: path, css: cssName(path), value: r.value, across: r.across, ref: r.ref });
    css.push(`${BD_CSS[k]}: var(${cssName(path)});`);
  }
  if ((n.c || []).some((c) => c.role === 'stroke') && !(n.bd || {}).sw && n.t !== 'LINE') css.push('border: 1px solid; /* width not tokenised */');
  return { rows, css, issues };
}

function expand(view) {
  return view.nodes.map((e) => (e.same != null ? { ...view.nodes[e.same], b: e.b, d: e.d, dupOf: e.same, text: undefined } : e));
}

const nodeName = (n) => n.n.replace(/^Breakpoint=/, '').replace(/^Type=(.+), State=(.+)$/, '$1 · $2');

export function tokenMap(key) {
  const file = join(root, 'src/data/token-map', `${key}.json`);
  if (!existsSync(file)) throw new Error(`token-map: no data for ${key}`);
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const name = (v) => (typeof v === 'number' ? d.V[v] : v);
  const views = d.views.map((view, vi) => {
    const mode = { bp: Math.max(0, BP.indexOf(view.modes.breakpoint || 'desktop')), theme: view.modes.theme === 'dark' ? 1 : 0 };
    const nodes = expand(view);
    const out = nodes.map((n, i) => {
      if (n.t === 'ART') return { i, name: n.n, type: 'Artwork', d: n.d, b: n.b, cats: [], rows: [{ cat: 'none', prop: 'Artwork', figma: 'Logo or illustration (exported as an image, not tokenised)', css: '', value: '' }], css: [], issues: [], art: true };
      const { rows, css, issues } = rowsFor(n, mode, name);
      const cats = [...new Set(rows.map((r) => r.cat))];
      if (issues.length) cats.push('issue');
      const pad = n.sp && ['pt', 'pr', 'pb', 'pl'].some((k) => n.sp[k]) ? ['pt', 'pr', 'pb', 'pl'].map((k) => (n.sp[k] ? n.sp[k].px : 0)) : null;
      return { i, name: nodeName(n), type: n.t, d: n.d, b: n.b, text: n.text, cats, rows, css, issues, pad, gap: n.sp?.gap?.px || 0, al: n.al, dup: n.dupOf };
    });
    // Gap bands between direct children (as far as the extracted layers show them)
    for (const p of out) {
      if (!p.gap || !p.al) continue;
      const kids = out.filter((k) => k.d === p.d + 1 && k.b[0] >= p.b[0] - 1 && k.b[1] >= p.b[1] - 1 && k.b[0] + k.b[2] <= p.b[0] + p.b[2] + 1 && k.b[1] + k.b[3] <= p.b[1] + p.b[3] + 1);
      const ax = p.al === 'V' ? 1 : 0;
      kids.sort((a, b) => a.b[ax] - b.b[ax]);
      p.bands = [];
      for (let k = 1; k < kids.length; k++) {
        const a = kids[k - 1].b, b = kids[k].b, start = a[ax] + a[ax + 2], size = b[ax] - start;
        if (size <= 0) continue;
        p.bands.push(ax ? [p.b[0], start, p.b[2], size] : [start, p.b[1], size, p.b[3]]);
      }
    }
    return { vi, label: nodeName({ n: view.name }), id: view.id, w: view.w, h: view.h, modes: view.modes, img: `/assets/img/token-map/${key}-${view.name.replace(/^Breakpoint=/, '').toLowerCase().replace(/ /g, '-')}.png`, nodes: out };
  });
  const issues = views.reduce((s, v) => s + v.nodes.filter((n) => n.issues.length && n.dup == null).length, 0);
  const pct = (a, t) => `${((a / t) * 100).toFixed(3)}%`;
  const html = [];
  html.push(`<div class="tm" data-tm id="tm-${key}">`);
  html.push('<div class="tm-bar">');
  if (views.length > 1) html.push(`<div class="tm-group" role="group" aria-label="Breakpoint">${views.map((v) => `<button type="button" class="chip-filter" data-tm-view="${v.vi}" aria-pressed="${v.vi === 0}">${esc(v.label)} <small>${v.w}</small></button>`).join('')}</div>`);
  html.push(`<div class="tm-group" role="group" aria-label="Show">${[['all', 'All'], ['color', 'Colour'], ['type', 'Type'], ['space', 'Spacing'], ['border', 'Border'], ['issue', `Issues <small>${issues}</small>`]].map(([k, l], i) => `<button type="button" class="chip-filter${k === 'issue' ? ' tm-chip-issue' : ''}" data-tm-filter="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>`);
  html.push(`<div class="tm-group tm-zoom" role="group" aria-label="Zoom"><button type="button" class="chip-filter" data-tm-zoom="fit" aria-pressed="true">Fit</button><button type="button" class="chip-filter" data-tm-zoom="0.5" aria-pressed="false">50%</button><button type="button" class="chip-filter" data-tm-zoom="1" aria-pressed="false">100%</button><button type="button" class="chip-filter" data-tm-full aria-pressed="false">Full screen</button></div>`);
  html.push('</div>');
  html.push('<div class="tm-body">');
  html.push('<div class="tm-stage">');
  for (const v of views) {
    const order = [...v.nodes].sort((a, b) => b.b[2] * b.b[3] - a.b[2] * a.b[3]);
    html.push(`<div class="tm-view" data-tm-v="${v.vi}"${v.vi ? ' hidden' : ''}><div class="tm-canvas" style="max-width:${Math.min(v.w, 1100)}px;aspect-ratio:${v.w}/${v.h}"><img src="${v.img}" alt="Figma render of ${esc(d.name)}, ${esc(v.label)}, ${v.w} × ${v.h}" width="${v.w}" height="${v.h}" loading="lazy">`);
    html.push(`<div class="tm-hots" aria-hidden="true">${order.map((n) => `<div class="tm-hot${n.art ? ' tm-art' : ''}${n.issues.length ? ' has-issue' : ''}" data-i="${n.i}" data-cats="${n.cats.join(' ')}" style="left:${pct(n.b[0], v.w)};top:${pct(n.b[1], v.h)};width:${pct(Math.max(n.b[2], 2), v.w)};height:${pct(Math.max(n.b[3], 2), v.h)}"></div>`).join('')}</div><div class="tm-ov" aria-hidden="true"></div></div>`);
    html.push(`<p class="tm-meta">Modes: ${Object.entries(v.modes).map(([k, m]) => `<code>${esc(k)}: ${esc(m)}</code>`).join(' ')} · <a href="${FIGMA}${v.id.replace(':', '-')}" target="_blank" rel="noopener">Open in Figma</a></p></div>`);
  }
  html.push('</div>');
  html.push(`<aside class="tm-panel" aria-label="Layer tokens"><div class="tm-detail" aria-live="polite"><p class="tm-hint">Select a layer on the image or in the list to see its variables, values and CSS.</p></div>`);
  for (const v of views) {
    html.push(`<div class="tm-layers" data-tm-v="${v.vi}"${v.vi ? ' hidden' : ''}><h3>Layers</h3><ul>${v.nodes.filter((n) => n.dup == null).map((n) => {
      const count = v.nodes.filter((m) => m.dup === n.i).length;
      return `<li data-cats="${n.cats.join(' ')}"><button type="button" data-tm-pick="${n.i}" style="--d:${Math.min(n.d, 6)}">${esc(n.name)}${count ? ` <small>×${count + 1}</small>` : ''}${n.issues.length ? ' <span class="tm-flag" title="Has issues">!</span>' : ''}</button></li>`;
    }).join('')}</ul></div>`);
  }
  html.push('</aside></div>');
  html.push(`<script type="application/json" class="tm-data">${JSON.stringify(views.map((v) => ({ w: v.w, h: v.h, nodes: v.nodes.map(({ i, name, type, b, text, rows, css, issues, pad, bands, dup }) => ({ i, name, type, b, text, rows, css, issues, pad, bands, dup })) }))).replace(/</g, '\\u003c')}</script>`);
  html.push('</div>');
  // Static table: works without JavaScript and for screen readers
  html.push(`<details class="tm-table"><summary>All layers and variables (table)</summary>`);
  for (const v of views) {
    html.push(`<h3>${esc(v.label)}</h3><div class="table-wrap"><table><thead><tr><th scope="col">Layer</th><th scope="col">Property</th><th scope="col">Figma variable</th><th scope="col">CSS</th><th scope="col">Value</th></tr></thead><tbody>`);
    for (const n of v.nodes.filter((x) => x.dup == null && !x.art && x.rows.length)) {
      n.rows.forEach((r, k) => html.push(`<tr>${k === 0 ? `<th scope="row" rowspan="${n.rows.length}">${esc(n.name)}${n.issues.length ? `<br><small class="tm-issue-text">${n.issues.map(esc).join('<br>')}</small>` : ''}</th>` : ''}<td>${esc(r.prop)}</td><td><code>${esc(r.figma)}</code></td><td>${r.css ? `<code>${esc(r.css)}</code>` : '—'}</td><td>${esc(r.value)}</td></tr>`));
    }
    html.push('</tbody></table></div>');
  }
  html.push('</details>');
  return html.join('');
}
