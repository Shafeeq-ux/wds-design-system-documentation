// WDS 3.0 prototype lab: turn a Word page brief (.docx) into WDS sections.
// Runs in the browser: the file is never uploaded. Three steps:
//   readDocx(file)          -> { paragraphs, comments }   (unzips with DecompressionStream, reads word/document.xml)
//   parseBrief(paragraphs)  -> { sections, notes }        (the brief conventions listed in the README)
//   buildPage(brief, kit)   -> { blocks, report }         (fills the WDS example markup with the brief's copy)
window.WDSLabImport = (() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // ---------- .docx ----------
  async function unzip(buf, names) {
    const v = new DataView(buf);
    let e = buf.byteLength - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('This isn’t a .docx file');
    const dec = new TextDecoder();
    const out = {};
    let p = v.getUint32(e + 16, true);
    for (let i = 0, n = v.getUint16(e + 10, true); i < n && v.getUint32(p, true) === 0x02014b50; i++) {
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
      const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), note = v.getUint16(p + 32, true), at = v.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
      p += 46 + nameLen + extra + note;
      if (!names.includes(name)) continue;
      const data = new Uint8Array(buf, at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true), size);
      out[name] = method === 0 ? dec.decode(data)
        : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    return out;
  }

  const clean = (s) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

  // Each paragraph keeps its line breaks (briefs put a card's title and copy on separate lines)
  // and its leading bold text (briefs bold their labels: SUBHEADING:, For Sales Teams:).
  function readParagraph(p) {
    let text = '', lead = '', leading = true;
    for (const r of p.getElementsByTagNameNS(W, 'r')) {
      const b = r.getElementsByTagNameNS(W, 'b')[0];
      const bold = !!b && !/^(0|false)$/.test(b.getAttributeNS(W, 'val') || '');
      for (const n of r.childNodes) {
        const t = n.localName === 't' ? n.textContent : n.localName === 'tab' ? ' ' : (n.localName === 'br' || n.localName === 'cr') ? '\n' : '';
        if (!t) continue;
        if (leading && bold) lead += t; else if (t.trim()) leading = false;
        text += t;
      }
    }
    const lines = text.split('\n').map(clean).filter(Boolean);
    return { text: lines.join('\n'), lines, lead: clean(lead) };
  }

  async function readDocx(file) {
    const parts = await unzip(await file.arrayBuffer(), ['word/document.xml', 'word/comments.xml']);
    if (!parts['word/document.xml']) throw new Error('No document text found in this file');
    const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const body = xml(parts['word/document.xml']).getElementsByTagNameNS(W, 'body')[0];
    const paragraphs = [...body.getElementsByTagNameNS(W, 'p')].map(readParagraph).filter((p) => p.text);
    const comments = parts['word/comments.xml']
      ? [...xml(parts['word/comments.xml']).getElementsByTagNameNS(W, 'comment')].map((c) => ({
          author: c.getAttributeNS(W, 'author') || 'Reviewer',
          text: clean([...c.getElementsByTagNameNS(W, 'p')].map((p) => readParagraph(p).text.replace(/\n/g, ' ')).join(' ').replace(/HYPERLINK "[^"]*"/g, '')),
        })).filter((c) => c.text)
      : [];
    // Tracked changes: insertions are read, deletions are not, so the page shows the text as if accepted
    const doc = body.ownerDocument;
    const changed = (tag, text) => [...doc.getElementsByTagNameNS(W, tag)].filter((el) => [...el.getElementsByTagNameNS(W, text)].some((t) => t.textContent.trim())).length;
    return { paragraphs, comments, changes: changed('ins', 't') + changed('del', 'delText') };
  }

  // ---------- brief ----------
  const MARKER = /^\[([^\]]{1,60})\]\s*/;
  const LABEL = /^([A-Z][A-Z0-9 &/()\-]{1,40}):\s*/;
  const FOR = /^(For [^:\n]{2,60}):\s*/;
  const STAT = /^([$€£]?\d[\d.,]*\s?(?:%|x|X|\+|K|M|B|k|m|b)*\+?)\s+(.{2,80})$/;
  const SAME_AS = /same as\s+(https?:\/\/\S+)/i;

  // A card title and its copy run together when the brief has no line break: "Guided Fix ActionsOne-click fixes".
  // Split where Title Case words stop. The last capital word before lowercase starts the copy.
  function splitCard(lines) {
    if (lines.length > 1) return { title: lines[0], desc: lines.slice(1).join(' ') };
    const line = lines[0] || '';
    const joined = /^(.+?[a-z)])(?=[A-Z][a-z])/.exec(line); // "Guided Fix ActionsOne-click fixes"
    if (joined && !joined[1].includes('  ')) return { title: joined[1], desc: line.slice(joined[1].length) };
    const parts = line.split(/\s{2,}| [–—-] /);
    if (parts.length > 1) return { title: parts[0], desc: parts.slice(1).join(' ') };
    const words = line.split(' ');
    const small = /^(a|an|and|at|by|for|in|of|on|or|the|to|with|&)$/;
    let i = 0;
    while (i < words.length && (/^[A-Z0-9]/.test(words[i]) || small.test(words[i]))) i++;
    if (i > 1 && i < words.length) return { title: words.slice(0, i - 1).join(' '), desc: words.slice(i - 1).join(' ') };
    return { title: line, desc: '' };
  }
  const noStop = (s) => s.replace(/[.:]+$/, '').trim();

  function parseBrief(paragraphs) {
    const sections = [], notes = [], unplaced = [];
    const hero = { kind: 'hero', stats: [], more: [], cards: [] };
    let cur = hero, mode = null, nav = null, faq = null, reuse = null;
    const open = (props = {}) => { cur = { kind: 'section', stats: [], more: [], cards: [], ...props }; sections.push(cur); mode = null; return cur; };
    const setTitle = (t) => { if (cur.title) open(); cur.title = noStop(t); };

    for (const para of paragraphs) {
      const { lines, lead } = para;
      const flat = lines.join(' ');

      if (mode === 'stats') {
        const m = STAT.exec(flat);
        if (m) { cur.stats.push({ value: m[1].replace(/\s/g, ''), label: m[2] }); continue; }
        mode = null;
      }

      let m;
      if ((m = /^(?:dropdown|nav(?:igation)?(?: item)?)\s*[=:]\s*(.+)$/i.exec(flat))) { nav = noStop(m[1]); continue; }
      if ((m = SAME_AS.exec(flat))) {
        reuse = { url: m[1], security: /secur/i.test(flat), footer: /footer/i.test(flat) };
        if (reuse.security) sections.push({ kind: 'security', source: flat });
        mode = null;
        continue;
      }

      if ((m = MARKER.exec(flat))) {
        const name = m[1].trim(), rest = lines.slice(1).length ? lines.slice(1) : [flat.slice(m[0].length)].filter(Boolean);
        if (/card|feature|benefit|tile/i.test(name)) {
          if (cur === hero || cur.kind !== 'section' || cur.personas || cur.video) open();
          const c = splitCard(rest);
          cur.cards.push({ title: noStop(c.title), desc: c.desc });
        } else if (/video/i.test(name)) {
          if (!cur.video) open({ video: true });
          cur.player = true;
        } else if (/image|screenshot|graphic|visual|photo/i.test(name)) {
          notes.push({ type: 'todo', text: `Image placeholder “${name}”: add the artwork` });
        } else {
          open({ label: name.replace(/\bsection\b/i, '').trim() });
          if (/persona|role|audience|impact/i.test(name)) cur.personas = true;
          if (/faq|question/i.test(name)) { faq = cur; cur.faq = []; }
          if (rest.length) setTitle(rest[0]);
        }
        continue;
      }

      if ((m = FOR.exec(flat)) && (lead.startsWith('For') || cur.personas)) {
        if (!cur.personas) { if (cur === hero || cur.cards.length) open(); cur.personas = true; }
        cur.cards.push({ title: noStop(m[1]), desc: flat.slice(m[0].length) });
        continue;
      }

      if ((m = LABEL.exec(flat))) {
        const key = m[1].toUpperCase(), value = flat.slice(m[0].length).trim();
        if (/NOTE|TODO|COMMENT/.test(key)) { notes.push({ type: 'note', text: value || flat }); continue; }
        if (/VIDEO/.test(key) && /HEAD|TITLE/.test(key)) { open({ video: true, player: true }); if (value) cur.title = noStop(value); else mode = 'title'; continue; }
        if (/EYEBROW|OVERLINE|KICKER/.test(key)) { cur.eyebrow = value; continue; }
        if (/STAT/.test(key)) { mode = 'stats'; continue; }
        if (/CTA|BUTTON/.test(key)) { cur.cta = noStop(value); continue; }
        if (/SUB/.test(key)) { if (value) cur.desc = value; else mode = 'desc'; continue; }
        if (/HEAD|TITLE|H1|H2/.test(key)) { if (value) setTitle(value); else mode = 'title'; continue; }
        if (/DESC|BODY|COPY|PARAGRAPH|INTRO/.test(key)) { if (value) cur.desc = value; else mode = 'desc'; continue; }
        // Any other bold label is something the lab has no slot for; unbolded "ARC: …" is just copy
        if (lead.includes(':')) { unplaced.push(flat); continue; }
      }

      // A short line ending in "?" is an FAQ question; what follows is its answer
      if (flat.endsWith('?') && flat.length < 160) {
        if (!faq) { faq = { kind: 'section', faq: [], stats: [], more: [], cards: [] }; sections.push(faq); }
        faq.faq.push({ q: flat, a: [] });
        cur = faq; mode = 'answer';
        continue;
      }
      if (mode === 'answer') { faq.faq.at(-1).a.push(flat); continue; }
      if (mode === 'title') { setTitle(flat); mode = null; continue; }
      if (mode === 'desc') { cur.desc = flat; mode = null; continue; }

      // Plain copy fills the current section's title, then its description, then extra paragraphs
      if (!cur.title) cur.title = noStop(flat);
      else if (!cur.desc) cur.desc = flat;
      else cur.more.push(flat);
    }

    const out = [hero, ...sections].map((s) => {
      if (s.kind !== 'section') return s;
      const kind = s.faq ? 'faq' : s.video ? 'video' : s.personas && s.cards.length ? 'personas' : s.cards.length ? 'cards' : (s.title || s.desc) ? 'statement' : null;
      return kind && { ...s, kind };
    }).filter(Boolean);
    return { nav, sections: out, notes, unplaced, reuse };
  }

  // ---------- WDS markup ----------
  const slug = (s) => s.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function matchIcon(title, icons) {
    const exact = slug(title);
    if (icons[exact]) return { name: exact, exact: true };
    const words = new Set(exact.split('-').filter((w) => w.length > 2));
    let best = null, score = 0;
    for (const [name, { keywords }] of Object.entries(icons)) {
      const pool = new Set([...name.split('-'), ...keywords.split(/[,\s]+/)].filter(Boolean));
      const s = [...words].filter((w) => pool.has(w)).length;
      if (s > score) { best = name; score = s; }
    }
    return score >= 2 ? { name: best, exact: false } : null;
  }

  // Fill a copy of a library block. Slots that the brief leaves empty are removed, not left as sample copy.
  function fill(html, fn) {
    const t = document.createElement('template');
    t.innerHTML = html;
    fn(t.content.firstElementChild);
    return t.innerHTML;
  }
  const text = (el, value) => { if (!el) return; if (value) el.textContent = value; else el.remove(); };
  function head(root, s, { eyebrowClass = 'wds-body-4-reg wds-head__eyebrow' } = {}) {
    const h = root.querySelector('.wds-head');
    text(h.querySelector('h2'), s.title);
    let desc = h.querySelector('.wds-head__desc');
    if (s.desc && !desc) { desc = document.createElement('p'); desc.className = 'wds-body-1-reg wds-head__desc'; h.append(desc); }
    text(desc, s.desc);
    for (const extra of s.more || []) { const p = document.createElement('p'); p.className = 'wds-body-1-reg wds-head__desc'; p.textContent = extra; h.append(p); }
    let eb = h.querySelector('.wds-head__eyebrow');
    if (s.eyebrow && !eb) { eb = document.createElement('p'); eb.className = eyebrowClass; h.prepend(eb); }
    text(eb, s.eyebrow);
  }
  function repeat(list, items, fn) {
    const proto = list.firstElementChild.cloneNode(true);
    list.replaceChildren(...items.map((item, i) => { const el = proto.cloneNode(true); fn(el, item, i); return el; }));
  }

  function buildPage(brief, { lib, icons }) {
    const html = (id) => lib.get(id).html;
    const blocks = [], report = { sections: [], todo: [], notes: brief.notes, unplaced: brief.unplaced };

    blocks.push({ type: 'header', html: fill(html('header'), (root) => {
      if (!brief.nav) return;
      // Add the page to the nav: under the AI agents menu when there is one, else the last menu
      const toggles = [...root.querySelectorAll('[data-wds-toggle][aria-controls^="dd-"]')];
      const menu = (toggles.find((b) => /agent|ai/i.test(b.textContent)) || toggles.at(-1));
      const list = menu && root.querySelector(`#${menu.getAttribute('aria-controls')}`);
      for (const ul of [list, root.querySelector('.wds-header__panel ul')]) {
        if (!ul) continue;
        const li = ul.firstElementChild.cloneNode(true);
        li.querySelector('a').textContent = brief.nav;
        li.querySelector('a').setAttribute('aria-current', 'page');
        ul.append(li);
      }
    }) });
    report.sections.push({ name: 'Header', from: brief.nav ? `Standard header, “${brief.nav}” added to the menu` : 'Standard header' });

    for (const s of brief.sections) {
      if (s.kind === 'hero') {
        if (!s.title) { report.todo.push('No page headline found, so the hero keeps the sample headline'); }
        blocks.push({ type: 'hero-default', html: fill(html('hero-default'), (root) => {
          text(root.querySelector('.wds-head__eyebrow'), s.eyebrow);
          if (s.title) root.querySelector('h1').textContent = s.title;
          text(root.querySelector('.wds-hero__sub'), s.desc);
          const actions = root.querySelector('.wds-actions');
          if (s.cta) actions.querySelector('a').textContent = s.cta; else actions.remove();
          const stats = root.querySelector('.wds-hero__stats');
          if (s.stats.length) repeat(stats, s.stats.slice(0, 3), (li, st) => { li.querySelector('b').textContent = st.value; li.querySelector('span').textContent = st.label; });
          else stats.remove();
        }) });
        report.sections.push({ name: 'Hero · default', from: [s.title, s.cta && `CTA “${s.cta}”`, s.stats.length && `${s.stats.length} stats`].filter(Boolean).join(' · ') });
        if (s.stats.length > 3) report.todo.push(`The hero shows 3 stats; ${s.stats.length - 3} more were left out`);
        report.todo.push('Hero: add the product screenshot');
      } else if (s.kind === 'cards' || s.kind === 'personas') {
        const three = s.cards.length % 3 === 0 && s.cards.length % 4 !== 0;
        let matched = 0;
        blocks.push({ type: 'card-grid-4', name: three ? 'Card grid · 3 column' : undefined, html: fill(html('card-grid-4'), (root) => {
          if (three) root.classList.add('wds-cards4--3');
          head(root, s);
          repeat(root.querySelector('.wds-cards4__grid'), s.cards, (li, c) => {
            li.querySelector('h3').textContent = c.title;
            text(li.querySelector('p'), c.desc);
            const svg = li.querySelector('svg');
            const icon = s.kind === 'cards' && matchIcon(c.title, icons);
            if (!icon) { svg?.remove(); return; }
            matched++;
            const t = document.createElement('template');
            t.innerHTML = icons[icon.name].svg;
            svg.replaceWith(t.content.firstElementChild);
            if (!icon.exact) report.todo.push(`Icon for “${c.title}” is a guess (icon-${icon.name}): check it`);
          });
        }) });
        report.sections.push({ name: `Card grid · ${three ? 3 : 4} column`, from: `${s.title || s.label || 'Untitled'} · ${s.cards.length} cards${s.kind === 'cards' ? `, ${matched} with icons` : ''}` });
      } else if (s.kind === 'video') {
        blocks.push({ type: 'video-single', html: fill(html('video-single'), (root) => {
          head(root, s);
          if (s.title) root.querySelector('[aria-label="Play video"]')?.setAttribute('aria-label', `Play ${s.title}`);
        }) });
        report.sections.push({ name: 'Video · AI single', from: s.title || 'Untitled video' });
        report.todo.push(`Video “${s.title || 'untitled'}”: add the video file`);
      } else if (s.kind === 'statement') {
        blocks.push({ type: 'feature-statement', html: fill(html('feature-statement'), (root) => head(root, s)) });
        report.sections.push({ name: 'Feature · statement', from: s.title || s.desc });
      } else if (s.kind === 'security') {
        blocks.push({ type: 'stats-security', html: html('stats-security') });
        report.sections.push({ name: 'Stats · security', from: 'Standard WDS security section' });
        report.todo.push(`Security copy is the standard WDS version: check it against ${brief.reuse?.url || 'the reference page'}`);
      } else if (s.kind === 'faq') {
        blocks.push({ type: 'faq', html: fill(html('faq'), (root) => {
          if (s.title) root.querySelector('h2').textContent = s.title;
          repeat(root.querySelector('.wds-faq__list'), s.faq, (li, f, i) => {
            const d = li.querySelector('details');
            i === 0 ? d.setAttribute('open', '') : d.removeAttribute('open');
            li.querySelector('summary').textContent = f.q;
            li.querySelector('p').textContent = f.a.join(' ');
          });
        }) });
        report.sections.push({ name: 'FAQ', from: `${s.faq.length} question${s.faq.length === 1 ? '' : 's'}` });
        for (const f of s.faq) if (!f.a.length) report.todo.push(`FAQ “${f.q}” has no answer`);
      }
    }

    blocks.push({ type: 'footer', html: html('footer') });
    report.sections.push({ name: 'Footer', from: brief.reuse?.footer ? `Standard footer (brief: same as ${brief.reuse.url})` : 'Standard footer' });
    return { blocks, report };
  }

  return { readDocx, parseBrief, buildPage };
})();
