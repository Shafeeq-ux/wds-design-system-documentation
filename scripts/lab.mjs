// Prototype lab: builds the block library and the preset pages into dist/lab/.
//   dist/lab/blocks.json        every block's markup, read from the WDS examples, plus the presets
//   dist/lab/pages/<id>.html    each preset composed into a standalone WDS page
//   dist/lab/icons.json         feature icons (theme-coloured) and keywords, for the .docx importer
// Blocks are cut from the example files, so the lab always matches the docs.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Split markup into its top-level elements. Drops comments, the meta comment and demo spacers.
export function topLevel(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, '');
  const parts = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  let depth = 0, start = -1, m;
  while ((m = tag.exec(src))) {
    const [all, close, name, self] = m;
    if (close) { if (--depth === 0) parts.push(src.slice(start, m.index + all.length)); continue; }
    if (depth === 0) start = m.index;
    if (self || VOID.has(name.toLowerCase())) { if (depth === 0) parts.push(all); continue; }
    depth++;
  }
  return parts.map((p) => p.trim()).filter((p) => !/^<div style="height:\d+px"><\/div>$/.test(p));
}

const ICONS = join(dirname(fileURLToPath(import.meta.url)), '../assets/icons/feature');

// <wds-icon name="guided-fix-actions"></wds-icon> becomes the inline feature icon. The source SVGs sit on a
// #F5F5F5 tile with #8A9099 strokes; drop the tile and use currentColor so the icon follows the theme.
export function expandIcons(html) {
  return html.replace(/<wds-icon name="([a-z0-9-]+)"><\/wds-icon>/g, (_, name) => readFileSync(join(ICONS, `icon-${name}.svg`), 'utf8')
    .replace(/<rect width="48" height="48" fill="#F5F5F5"\/>\n?/i, '')
    .replace(/#8A9099/gi, 'currentColor')
    .replace(/\s(?:id|data-name)="[^"]*"/g, '')
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
    .trim());
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Put a theme on the block's root element (unless the block fixes its own, like the header).
export function withTheme(html, theme) {
  if (!theme || /^<[a-z]+[^>]*\sdata-theme=/.test(html)) return html;
  return html.replace(/^<([a-z][\w-]*)/, `<$1 data-theme="${theme}"`);
}

// Header blocks sit before <main>, footer blocks after it.
export function composePage({ title, theme, blocks }) {
  const isHead = (h) => /^<header\b/.test(h) || /^<div\b[^>]*\sclass="wds-banner"/.test(h);
  let a = 0, b = blocks.length;
  while (a < b && isHead(blocks[a])) a++;
  while (b > a && /^<footer\b/.test(blocks[b - 1])) b--;
  const body = [...blocks.slice(0, a), '<main id="main">', ...blocks.slice(a, b), '</main>', ...blocks.slice(b)].join('\n');
  return `<!doctype html>
<html lang="en-GB" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/wds.css">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <script src="/js/wds.js" defer></script>
</head>
<body class="wds">
<a class="skip-link" href="#main">Skip to content</a>
${body}
</body>
</html>
`;
}

export function buildLab(SRC, DIST) {
  const manifest = JSON.parse(readFileSync(join(SRC, 'lab/blocks.json'), 'utf8'));
  const cache = new Map();
  const file = (rel) => {
    if (!cache.has(rel)) cache.set(rel, topLevel(expandIcons(readFileSync(join(SRC, rel.startsWith('lab/') ? '' : 'pages', rel), 'utf8'))));
    return cache.get(rel);
  };
  const blocks = manifest.blocks.map(({ from, part, ...b }) => {
    const html = file(from)[part];
    if (!html) throw new Error(`lab: ${from} has no top-level element ${part}`);
    return { ...b, html };
  });
  const byId = new Map(blocks.map((b) => [b.id, b]));

  const presets = manifest.presets;
  for (const p of presets) for (const b of p.blocks) if (!byId.has(b.type)) throw new Error(`lab: preset ${p.id} uses unknown block ${b.type}`);

  mkdirSync(join(DIST, 'lab/pages'), { recursive: true });
  writeFileSync(join(DIST, 'lab/blocks.json'), JSON.stringify({ categories: manifest.categories, blocks, presets }));
  for (const p of presets) {
    const html = p.blocks.map(({ type, theme }) => {
      const b = byId.get(type);
      return withTheme(b.html, theme || b.theme);
    });
    writeFileSync(join(DIST, `lab/pages/${p.id}.html`), composePage({ title: `${p.name} · WDS 3.0 prototype`, theme: p.theme, blocks: html }));
  }

  // Feature icons for the .docx importer, which matches card titles to icon names and keywords
  const kw = JSON.parse(readFileSync(join(SRC, 'data/icons.json'), 'utf8')).documented;
  const keywords = Object.fromEntries(kw.map(([n, k]) => [n.replace(/^icon-/, ''), k]));
  const icons = readdirSync(ICONS).filter((f) => /^icon-[a-z0-9-]+\.svg$/.test(f) && !f.startsWith('icon-duo-')).map((f) => f.slice(5, -4));
  writeFileSync(join(DIST, 'lab/icons.json'), JSON.stringify(Object.fromEntries(icons.map((n) => [n, { keywords: keywords[n] || '', svg: expandIcons(`<wds-icon name="${n}"></wds-icon>`) }]))));
  return presets.length;
}
