// Fails if any internal link or asset in dist/ points to a file or #anchor that doesn't exist.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : []; });

const ids = new Map();
const pages = walk(DIST);
for (const p of pages) ids.set('/' + relative(DIST, p), new Set([...readFileSync(p, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));

const broken = [];
for (const p of pages) {
  const from = '/' + relative(DIST, p);
  for (const [, url] of readFileSync(p, 'utf8').matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:)/.test(url) || url === '#') continue;
    const [path, hash] = url.split('#');
    const target = path ? (path.startsWith('/') ? path : '/' + relative(DIST, join(dirname(p), path))) : from;
    if (path && !existsSync(join(DIST, target))) broken.push(`${from} -> ${url}`);
    else if (hash && ids.has(target) && !ids.get(target).has(hash)) broken.push(`${from} -> ${url} (missing #${hash})`);
  }
}
if (broken.length) { console.error(`Broken links (${broken.length}):\n  ` + broken.join('\n  ')); process.exit(1); }
console.log(`Links OK across ${pages.length} pages`);
