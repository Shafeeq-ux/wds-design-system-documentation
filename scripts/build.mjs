// Builds the docs site into dist/.
//   1. Regenerates css/tokens.css from tokens/wds-tokens.json
//   2. Wraps every src/pages/**/*.html in the shared layout (header, sidebar, page meta)
//   3. Generates a "planned" stub for every nav item that has no page yet
//   4. Copies css/, js/, assets/ and tokens/ and writes search-index.json
//
// A page starts with an optional meta comment:
//   <!--meta {"title": "Colour", "status": "WIP", "layout": "doc"} -->
// Fields left out are taken from the page's entry in src/nav.json.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import './build-tokens.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src');
const DIST = join(root, 'dist');
const nav = JSON.parse(readFileSync(join(SRC, 'nav.json'), 'utf8'));
const layout = readFileSync(join(SRC, 'partials/layout.html'), 'utf8');
const TODAY = new Date().toISOString().slice(0, 10);

const OUTLINES = {
  component: ['Overview', 'Variants and states', 'Anatomy', 'Design guidance', 'Responsive behaviour', 'Light and dark theme', 'Microcopy and limits', 'Developer implementation', 'Accessibility', 'Figma, asset and code references', 'Acceptance checklist'],
  section: ['Section overview', 'Recommended placement', 'Audience and goal', 'Content structure and character limits', 'Responsive layout behaviour', 'Light and dark theme', 'Variants', 'Marketing handoff checklist'],
  content: ['Pattern purpose', 'Voice and tone', 'Writing rules', 'Character or word limits', 'Approved examples', 'Accessibility and localisation notes'],
  foundation: ['Overview', 'Tokens', 'Usage guidance', 'Responsive behaviour', 'Light and dark theme', 'Accessibility', 'Figma references'],
  dev: ['Overview', 'Setup', 'Code examples', 'Known limitations'],
  template: ['How to use this template', 'Template outline', 'Copyable HTML'],
};

// ---------- helpers ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const figmaUrl = (node) => `${nav.figmaFile}?node-id=${node}`;

const navByHref = new Map();
for (const g of nav.groups) for (const it of g.items) navByHref.set(it.href, { ...it, group: g });

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });
}

function parse(file) {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^\s*<!--meta\s+([\s\S]*?)-->/);
  return { meta: m ? JSON.parse(m[1]) : {}, body: m ? raw.slice(m[0].length) : raw };
}

// Give every h2/h3 an id so the on-page TOC and search can link to it.
function addHeadingIds(html) {
  const used = new Set();
  const headings = [];
  const out = html.replace(/<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (all, lvl, attrs = '', inner) => {
    const text = stripTags(inner);
    let id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
    if (!id) { id = slug(text) || 'section'; while (used.has(id)) id += '-x'; attrs += ` id="${id}"`; }
    used.add(id);
    headings.push({ level: +lvl, id, text });
    return `<h${lvl}${attrs}>${inner}</h${lvl}>`;
  });
  return { html: out, headings };
}

// ---------- shell pieces ----------
function sidebar(href) {
  return nav.groups.map((g) => `
    <div class="sb-group">
      <p class="sb-title"><span class="sb-num">${g.number}</span>${esc(g.title)}</p>
      <ul>${g.items.map((it) => {
        const cur = it.href === href ? ' aria-current="page"' : '';
        const planned = existsSync(join(SRC, 'pages', it.href)) ? '' : ' <span class="sb-dot" title="Planned"></span>';
        return `<li><a href="${it.href}"${cur}>${esc(it.title)}${planned}</a></li>`;
      }).join('')}</ul>
    </div>`).join('');
}

const STATUS_CLASS = { Stable: 'ok', WIP: 'warn', Proposed: 'info', Planned: 'muted', 'Not defined': 'muted' };
function pageMeta(m) {
  const bits = [`<span class="badge badge-${STATUS_CLASS[m.status] || 'muted'}">${esc(m.status)}</span>`];
  if (m.owner) bits.push(`<span><span class="pm-label">Owner</span> ${esc(m.owner)}</span>`);
  if (m.figma) bits.push(`<a href="${figmaUrl(m.figma)}" target="_blank" rel="noopener">Figma<span class="visually-hidden"> (opens in a new tab)</span> <svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></svg></a>`);
  bits.push(`<span><span class="pm-label">Updated</span> <time datetime="${m.updated}">${m.updated}</time></span>`);
  return `<div class="page-meta">${bits.join('')}</div>`;
}

function toc(headings) {
  const h2 = headings.filter((h) => h.level === 2);
  if (h2.length < 2) return '';
  return `<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ul>${h2.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></nav>`;
}

function stub(item) {
  const outline = OUTLINES[item.type] || OUTLINES.foundation;
  return `
<div class="callout callout-info">
  <p><strong>Planned for Phase ${item.phase}.</strong> This page is part of the WDS 3.0 documentation plan and hasn't been written yet.${item.figma ? ` The design source is ready in <a href="${figmaUrl(item.figma)}" target="_blank" rel="noopener">Figma</a>.` : ''}</p>
</div>
<h2>What this page will cover</h2>
<ol class="outline">${outline.map((o) => `<li>${o}</li>`).join('')}</ol>`;
}

function render(href, meta, body) {
  const item = navByHref.get(href) || {};
  const m = {
    title: item.title, desc: item.desc, owner: item.group?.owner, figma: item.figma,
    status: item.status || 'Stable', updated: TODAY, layout: 'doc', ...meta,
  };
  const { html, headings } = addHeadingIds(body);
  const crumb = item.group ? `<p class="crumb"><span>${item.group.number}</span> ${esc(item.group.title)}</p>` : '';
  const header = m.layout === 'doc' ? `<header class="page-head">${crumb}<h1>${esc(m.title)}</h1>${m.desc ? `<p class="lede">${esc(m.desc)}</p>` : ''}${pageMeta(m)}</header>` : '';
  const page = layout
    .replaceAll('{{title}}', esc(m.title === 'WDS 3.0' ? 'WDS 3.0 · Tekion Website Design System' : `${m.title} · WDS 3.0`))
    .replaceAll('{{desc}}', esc(m.desc || ''))
    .replace('{{layout}}', m.layout)
    .replace('{{sidebar}}', sidebar(href))
    .replace('{{header}}', header)
    .replace('{{content}}', html)
    .replace('{{toc}}', m.layout === 'doc' ? toc(headings) : '');
  return { page, index: { title: m.title, href, group: item.group?.title || '', desc: m.desc || '', headings: headings.map((h) => ({ id: h.id, text: h.text })) } };
}

// ---------- build ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
const index = [];
const built = new Set();

for (const file of walk(join(SRC, 'pages'))) {
  const href = '/' + relative(join(SRC, 'pages'), file).split('\\').join('/');
  const { meta, body } = parse(file);
  const outFile = join(DIST, href);
  mkdirSync(dirname(outFile), { recursive: true });
  if (meta.layout === 'bare') { writeFileSync(outFile, body); built.add(href); continue; } // standalone demo pages
  const { page, index: entry } = render(href, meta, body);
  writeFileSync(outFile, page);
  if (!meta.noindex) index.push(entry);
  built.add(href);
}

for (const [href, item] of navByHref) {
  if (built.has(href)) continue;
  const { page, index: entry } = render(href, { status: item.status || 'Planned' }, stub(item));
  mkdirSync(dirname(join(DIST, href)), { recursive: true });
  writeFileSync(join(DIST, href), page);
  index.push({ ...entry, headings: [] }); // stub outlines are the same on every page, so keep them out of search
}

for (const d of ['css', 'js', 'assets', 'tokens']) if (existsSync(join(root, d))) cpSync(join(root, d), join(DIST, d), { recursive: true });
writeFileSync(join(DIST, 'search-index.json'), JSON.stringify(index));
console.log(`Built ${built.size} pages + ${navByHref.size - [...navByHref.keys()].filter((h) => built.has(h)).length} stubs into dist/`);
