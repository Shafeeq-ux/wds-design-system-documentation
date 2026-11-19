// WDS 3.0 prototype lab. Compose a page from WDS sections, edit its copy, and export standalone HTML.
// The canvas is an iframe that loads only tokens.css, wds.css and wds.js, so what you see is what ships.
// Blocks come from /lab/blocks.json, which scripts/lab.mjs cuts from the WDS examples at build time.
// Import .docx turns a Word page brief into sections (js/lab-import.js).
(() => {
  const BASE = new URL(document.currentScript.src).pathname.replace(/\/js\/lab\.js$/, '');
  const ATTR = /(\s(?:href|src|data-src|action|poster)=")\/(?!\/)/g;
  const withBase = (html, prefix = BASE) => html.replace(ATTR, `$1${prefix}/`);
  const withoutBase = (html) => (BASE ? html.replaceAll(`="${BASE}/`, '="/') : html);
  const url = (path) => BASE + path;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const VIEWPORTS = { desktop: 1440, tablet: 768, mobile: 390 };
  const KEY = 'wds-lab-v1';
  const ICON = {
    plus: '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    up: '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    copy: '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    trash: '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    grip: '<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>',
  };

  // Canvas-only styles: selection, drop markers and the empty state. Never exported.
  const CANVAS_CSS = `
    [data-lab-uid]{position:relative}
    [data-lab-uid]:hover{outline:1px dashed #47a5ff;outline-offset:-1px}
    [data-lab-uid].lab-sel{outline:2px solid #47a5ff;outline-offset:-2px}
    [data-lab-uid].lab-sel::before{content:attr(data-lab-name);position:absolute;top:0;left:0;z-index:100;padding:2px 8px;background:#47a5ff;color:#fff;font:500 12px/18px Inter,system-ui,sans-serif;pointer-events:none}
    [data-lab-uid].drop-before{box-shadow:0 -4px 0 #47a5ff}
    [data-lab-uid].drop-after{box-shadow:0 4px 0 #47a5ff}
    .lab-editing [contenteditable]{cursor:text;outline:1px dotted rgba(71,165,255,.6);outline-offset:2px}
    .lab-editing [contenteditable]:focus{outline:2px solid #47a5ff}
    .lab-empty{display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;color:var(--wds-text-tertiary);font:16px/24px Inter,system-ui,sans-serif}
    .lab-empty.drop-after{box-shadow:inset 0 0 0 3px #47a5ff}`;
  const EDITABLE = 'h1,h2,h3,h4,h5,h6,p,summary,legend,li>b,li>span,.wds-check>span,.wds-radio>span,.wds-field__label,a.wds-btn,a.wds-navlink,.wds-header__dropdown a,.wds-header__panel a,.wds-footer__col a,.wds-footer__products a,.wds-footer__legal a,.wds-logos li';

  let lib, byType;
  let state = { theme: 'light', vp: 'desktop', blocks: [] }; // block: { uid, type, theme: default|page|light|dark, html }
  let sel = null, editing = false, uidSeq = 0, dragType = null, dragUid = null;
  const past = [], future = [];

  const frame = $('#lab-frame'), stage = $('#lab-stage'), device = $('#lab-device');
  const list = $('#lab-list');

  // ---------- state ----------
  const snapshot = () => JSON.stringify({ theme: state.theme, preset: state.preset, title: state.title, blocks: state.blocks });
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function commit() { past.push(snapshot()); if (past.length > 100) past.shift(); future.length = 0; updateHistory(); }
  function restore(snap) { Object.assign(state, JSON.parse(snap)); if (!find(sel)) sel = null; syncPresetSelect(); syncToolbar(); renderAll(); save(); }
  function undo() { if (!past.length) return; future.push(snapshot()); restore(past.pop()); updateHistory(); }
  function redo() { if (!future.length) return; past.push(snapshot()); restore(future.pop()); updateHistory(); }
  function updateHistory() { $('#lab-undo').disabled = !past.length; $('#lab-redo').disabled = !future.length; }
  const nameOf = (b) => b.name || byType.get(b.type)?.name || b.type;
  const find = (uid) => state.blocks.find((b) => b.uid === uid);
  const nextUid = () => `b${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

  // IDs must stay unique when a section is added twice: rename clashes and the references to them.
  function uniquify(html, skipUid) {
    const taken = new Set(state.blocks.filter((b) => b.uid !== skipUid).flatMap((b) => [...b.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
    const t = document.createElement('template');
    t.innerHTML = html;
    const map = {};
    $$('[id]', t.content).forEach((el) => {
      if (!taken.has(el.id)) return;
      let n = 2;
      while (taken.has(`${el.id}-${n}`)) n++;
      map[el.id] = `${el.id}-${n}`;
      el.id = map[el.id];
    });
    if (!Object.keys(map).length) return html;
    $$('[for],[aria-controls],[aria-labelledby],[aria-describedby],a[href^="#"]', t.content).forEach((el) => {
      for (const a of ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby']) {
        if (el.hasAttribute(a)) el.setAttribute(a, el.getAttribute(a).split(/\s+/).map((x) => map[x] || x).join(' '));
      }
      const h = el.getAttribute('href');
      if (h && map[h.slice(1)]) el.setAttribute('href', `#${map[h.slice(1)]}`);
    });
    return t.innerHTML;
  }

  function addBlock(type, at = state.blocks.length) {
    const def = byType.get(type);
    if (!def) return;
    commit();
    const b = { uid: nextUid(), type, theme: 'default', html: uniquify(def.html) };
    state.blocks.splice(at, 0, b);
    sel = b.uid;
    renderAll({ scrollTo: b.uid });
    save();
    toast(`Added ${def.name}`);
  }
  function removeBlock(uid) {
    const i = state.blocks.findIndex((b) => b.uid === uid);
    if (i < 0) return;
    commit();
    const [b] = state.blocks.splice(i, 1);
    sel = state.blocks[Math.min(i, state.blocks.length - 1)]?.uid || null;
    renderAll();
    save();
    toast(`Removed ${byType.get(b.type)?.name || 'section'}. Undo with ⌘Z`);
  }
  function duplicateBlock(uid) {
    const i = state.blocks.findIndex((b) => b.uid === uid);
    if (i < 0) return;
    commit();
    const b = { ...state.blocks[i], uid: nextUid() };
    b.html = uniquify(b.html);
    state.blocks.splice(i + 1, 0, b);
    sel = b.uid;
    renderAll({ scrollTo: b.uid });
    save();
  }
  function moveBlock(uid, to) {
    const from = state.blocks.findIndex((b) => b.uid === uid);
    if (from < 0) return;
    to = Math.max(0, Math.min(state.blocks.length - 1, to));
    if (to === from) return;
    commit();
    const [b] = state.blocks.splice(from, 1);
    state.blocks.splice(to, 0, b);
    renderAll({ scrollTo: uid });
    save();
  }
  function loadPreset(id) {
    const p = lib.presets.find((x) => x.id === id);
    if (!p) return;
    if (state.blocks.length) commit();
    state.theme = p.theme || 'light';
    state.preset = id;
    state.title = null;
    state.blocks = [];
    for (const { type, theme, name, html } of p.blocks) {
      const def = byType.get(type);
      if (def) state.blocks.push({ uid: nextUid(), type, theme: theme || 'default', name, html: uniquify(html || def.html) });
    }
    sel = null;
    syncPresetSelect();
    renderAll({ top: true });
    save();
    if (past.length) toast(`Loaded ${p.name}. Undo with ⌘Z`);
  }

  // ---------- import a Word brief ----------
  let icons = null;
  async function importDocx(file) {
    if (!/\.docx$/i.test(file.name)) { toast('Choose a Word document (.docx)'); return; }
    const { readDocx, parseBrief, buildPage } = window.WDSLabImport;
    try {
      toast(`Reading ${file.name}…`);
      icons ||= await (await fetch(url('/lab/icons.json'))).json();
      const { paragraphs, comments, changes } = await readDocx(file);
      const { blocks, report } = buildPage(parseBrief(paragraphs), { lib: byType, icons });
      commit();
      const title = file.name.replace(/\.docx$/i, '').replace(/\s*webpage\s*$/i, '').trim();
      Object.assign(state, { theme: 'light', preset: 'import', title, blocks: [] });
      for (const b of blocks) state.blocks.push({ uid: nextUid(), type: b.type, theme: 'default', name: b.name, html: uniquify(b.html) });
      sel = null;
      syncPresetSelect();
      syncToolbar();
      renderAll({ top: true });
      save();
      if (changes) report.todo.push(`The document has ${changes} tracked change${changes === 1 ? '' : 's'}; the page shows them as if accepted`);
      showReport(file.name, report, comments);
    } catch (e) {
      console.error(e);
      toast(`Couldn’t read ${file.name}: ${e.message}`);
    }
  }

  function showReport(fileName, r, comments) {
    const list = (items, cls = '') => `<ul class="${cls}">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    $('#lab-report-title').textContent = `Built ${r.sections.length} sections from ${fileName}`;
    $('#lab-report-body').innerHTML = [
      `<h3>Sections</h3><ol>${r.sections.map((s) => `<li>${esc(s.name)}<small>${esc(s.from || '')}</small></li>`).join('')}</ol>`,
      r.todo.length ? `<h3>Needs attention</h3>${list(r.todo.map(esc), 'is-todo')}` : '',
      r.unplaced.length ? `<h3>Not placed on the page</h3>${list(r.unplaced.map(esc))}` : '',
      r.notes.length ? `<h3>Notes in the brief</h3>${list(r.notes.map((n) => esc(n.text)))}` : '',
      comments.length ? `<h3>Review comments in the document (${comments.length})</h3>${list(comments.map((c) => `<blockquote>${esc(c.text)}</blockquote><small>${esc(c.author)}</small>`))}` : '',
      '<p>Copy is imported as written. Turn on Edit text to change it on the canvas.</p>',
    ].join('');
    $('#lab-report').showModal();
  }

  function syncPresetSelect() {
    const select = $('#lab-preset');
    select.querySelector('option[value="import"]')?.remove();
    if (state.preset === 'import') select.add(new Option(`Imported · ${state.title}`, 'import'), 0);
    select.value = state.preset || lib.presets[0].id;
  }

  // ---------- page HTML ----------
  // Some blocks set their own theme on the root (the header is dark in Figma). That's their default,
  // and an override swaps it, keeping the original in data-lab-own so edits read back unchanged.
  const ownTheme = (b) => (/^<[a-z][\w-]*[^>]*\sdata-theme="(\w+)"/.exec(b.html) || [])[1];
  const themeOf = (b) => (b.theme === 'default' ? ownTheme(b) || byType.get(b.type)?.theme : b.theme === 'page' ? null : b.theme);
  function themed(b) {
    const own = ownTheme(b), t = themeOf(b);
    if (own && t === own) return b.html;
    const html = own ? b.html.replace(/^(<[a-z][\w-]*[^>]*?)\sdata-theme="\w+"/, `$1 data-lab-own="${own}"`) : b.html;
    return t ? html.replace(/^<([a-z][\w-]*)/, `<$1 data-theme="${t}" data-lab-themed`) : html;
  }

  // Same structure as scripts/lab.mjs composePage: header sections, <main>, footer sections.
  function pageHtml(prefix) {
    const html = state.blocks.map((b) => themed(b).replace(/ data-lab-themed| data-lab-own="\w+"/g, ''));
    const isHead = (h) => /^<header\b/.test(h) || /^<div\b[^>]*\sclass="wds-banner"/.test(h);
    let a = 0, z = html.length;
    while (a < z && isHead(html[a])) a++;
    while (z > a && /^<footer\b/.test(html[z - 1])) z--;
    const body = [...html.slice(0, a), '<main id="main">', ...html.slice(a, z), '</main>', ...html.slice(z)].join('\n');
    const preset = lib.presets.find((p) => p.id === state.preset);
    const title = `${state.title || preset?.name || 'Prototype'} · WDS 3.0 prototype`;
    return withBase(`<!doctype html>
<html lang="en-GB" data-theme="${state.theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/wds.css">
  <script src="/js/wds.js" defer></script>
</head>
<body class="wds">
<a class="skip-link" href="#main">Skip to content</a>
${body}
</body>
</html>
`, prefix);
  }

  // ---------- canvas ----------
  let frameReady = false;
  function initFrame() {
    frame.srcdoc = `<!doctype html><html lang="en-GB" data-theme="${state.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">
      <link rel="stylesheet" href="${url('/css/tokens.css')}"><link rel="stylesheet" href="${url('/css/wds.css')}">
      <style>html,body{margin:0}${CANVAS_CSS}</style><script src="${url('/js/wds.js')}" defer><\/script></head><body class="wds"></body></html>`;
    frame.addEventListener('load', () => {
      frameReady = true;
      wireFrame(frame.contentDocument);
      renderCanvas({ top: true });
    }, { once: true });
  }

  function renderCanvas({ scrollTo, top } = {}) {
    if (!frameReady) return;
    const doc = frame.contentDocument;
    const y = top ? 0 : doc.scrollingElement.scrollTop;
    doc.documentElement.setAttribute('data-theme', state.theme);
    doc.body.innerHTML = state.blocks.length
      ? state.blocks.map((b) => `<div data-lab-uid="${b.uid}" data-lab-name="${esc(nameOf(b))}">${withBase(themed(b))}</div>`).join('')
      : '<p class="lab-empty">Drag a section here, or choose + in the Sections library.</p>';
    doc.body.classList.toggle('lab-editing', editing);
    if (editing) setEditable(doc, true);
    markSelection();
    doc.scrollingElement.scrollTop = y;
    if (scrollTo) doc.querySelector(`[data-lab-uid="${scrollTo}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function markSelection() {
    if (!frameReady) return;
    $$('[data-lab-uid]', frame.contentDocument).forEach((w) => w.classList.toggle('lab-sel', w.dataset.labUid === sel));
  }

  // Save edited copy back to state, without the lab's own attributes or open menus.
  function readBack(wrapper) {
    const b = find(wrapper.dataset.labUid);
    const root = wrapper.firstElementChild;
    if (!b || !root) return;
    const clone = root.cloneNode(true);
    if (clone.hasAttribute('data-lab-themed')) clone.removeAttribute('data-theme');
    if (clone.hasAttribute('data-lab-own')) clone.setAttribute('data-theme', clone.getAttribute('data-lab-own'));
    clone.removeAttribute('data-lab-themed');
    clone.removeAttribute('data-lab-own');
    [clone, ...clone.querySelectorAll('[contenteditable]')].forEach((el) => { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); });
    clone.querySelectorAll('[data-wds-toggle][aria-expanded="true"]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
      clone.querySelector(`#${CSS.escape(btn.getAttribute('aria-controls'))}`)?.setAttribute('hidden', '');
    });
    b.html = withoutBase(clone.outerHTML);
    save();
  }

  function setEditable(doc, on) {
    $$(EDITABLE, doc.body).forEach((el) => {
      if (on) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'true'); }
      else { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); }
    });
  }
  function setEditing(on) {
    editing = on;
    $('#lab-edit').setAttribute('aria-pressed', String(on));
    if (!frameReady) return;
    const doc = frame.contentDocument;
    doc.body.classList.toggle('lab-editing', on);
    setEditable(doc, on);
    toast(on ? 'Editing text: click any heading, paragraph or label' : 'Text editing off');
  }

  function wireFrame(doc) {
    doc.addEventListener('click', (e) => {
      // The canvas is a prototype: links and submits stay put
      if (e.target.closest('a') || e.target.closest('[type="submit"]')) e.preventDefault();
      if (editing && e.target.closest('summary')) e.preventDefault();
      const w = e.target.closest('[data-lab-uid]');
      if (w && w.dataset.labUid !== sel) { sel = w.dataset.labUid; markSelection(); renderLayers(); }
    });
    doc.addEventListener('submit', (e) => e.preventDefault());
    let editSnap = false;
    doc.addEventListener('focusin', (e) => { if (e.target.isContentEditable) editSnap = false; });
    doc.addEventListener('input', (e) => {
      const w = e.target.closest?.('[data-lab-uid]');
      if (!w || !e.target.isContentEditable) return;
      if (!editSnap) { commit(); editSnap = true; }
      readBack(w);
    });
    doc.addEventListener('keydown', (e) => {
      if (!e.target.isContentEditable) return forwardKey(e);
      if (e.key === 'Enter') e.preventDefault(); // copy slots are single paragraphs
      if (e.key === ' ' && e.target.closest('summary')) { e.preventDefault(); doc.execCommand('insertText', false, ' '); }
      if (e.key === 'Escape') { e.target.blur(); setEditing(false); }
    });
    // Paste as plain text so copy never brings foreign styles
    doc.addEventListener('paste', (e) => {
      if (!e.target.isContentEditable) return;
      e.preventDefault();
      doc.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' '));
    });

    // Drop sections from the library onto the canvas
    const wrapperAt = (e) => e.target.closest?.('[data-lab-uid]') || null;
    const clearDrop = () => $$('.drop-before,.drop-after', doc).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    doc.addEventListener('dragover', (e) => {
      if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); return; }
      if (!dragType) return;
      e.preventDefault();
      clearDrop();
      const w = wrapperAt(e);
      if (!w) { (doc.querySelector('.lab-empty') || doc.body.lastElementChild)?.classList.add('drop-after'); return; }
      const r = w.getBoundingClientRect();
      w.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    doc.addEventListener('dragleave', (e) => { if (!e.relatedTarget) clearDrop(); });
    doc.addEventListener('drop', (e) => {
      if (e.dataTransfer.files[0]) { e.preventDefault(); importDocx(e.dataTransfer.files[0]); return; }
      if (!dragType) return;
      e.preventDefault();
      const w = wrapperAt(e);
      let at = state.blocks.length;
      if (w) {
        const r = w.getBoundingClientRect();
        at = state.blocks.findIndex((b) => b.uid === w.dataset.labUid) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
      }
      clearDrop();
      addBlock(dragType, at);
      dragType = null;
    });
  }

  function layout() {
    const w = VIEWPORTS[state.vp];
    const sw = stage.clientWidth - 48, sh = stage.clientHeight - 64;
    const scale = Math.min(1, sw / w);
    frame.style.width = `${w}px`;
    frame.style.height = `${sh / scale}px`;
    frame.style.transform = `scale(${scale})`;
    device.style.width = `${w * scale}px`;
    device.style.height = `${sh}px`;
    $('#lab-size').textContent = `${w}px${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}`;
  }

  // ---------- library ----------
  function renderSections(filter = '') {
    const q = filter.trim().toLowerCase();
    const match = (b) => !q || `${b.name} ${b.category} ${b.id}`.toLowerCase().includes(q);
    const html = lib.categories.map((cat) => {
      const items = lib.blocks.filter((b) => b.category === cat && match(b));
      if (!items.length) return '';
      return `<h3>${esc(cat)}</h3><ul class="lab-cards">${items.map((b) => `
        <li class="lab-card" draggable="true" data-type="${b.id}">
          <img src="${url(b.thumb)}" alt="" loading="lazy" width="88" height="56">
          <span><b>${esc(b.name)}</b><small>${b.theme === 'dark' ? 'Dark' : 'Light'} by default</small></span>
          <button class="lab-icon" type="button" data-add="${b.id}" aria-label="Add ${esc(b.name)} to the page" title="Add to the page">${ICON.plus}</button>
        </li>`).join('')}</ul>`;
    }).join('');
    $('#pane-sections').innerHTML = html || '<p class="lab-empty-note">No sections match.</p>';
  }

  let tokens = null;
  async function renderFoundations(filter = '') {
    const pane = $('#pane-foundations');
    if (!tokens) {
      pane.innerHTML = '<p class="lab-empty-note">Loading tokens…</p>';
      try { tokens = (await (await fetch(url('/tokens/wds-css-variables.json'))).json()).variables; }
      catch (e) { pane.innerHTML = '<p class="lab-empty-note">Couldn’t load the tokens.</p>'; return; }
    }
    const q = filter.trim().toLowerCase();
    const entries = Object.entries(tokens).filter(([k, v]) => !q || k.includes(q) || (v.figma || '').toLowerCase().includes(q));
    const colours = entries.filter(([, v]) => 'light' in v && /^#|^rgb/.test(v.light));
    const groups = {};
    for (const [k, v] of colours) (groups[v.figma.split('/')[0]] ||= []).push([k, v]);
    const styles = entries.filter(([k, v]) => k.endsWith('-font-size') && v.desktop && !/^--wds-font-size/.test(k)).map(([k, v]) => [k.slice(6, -10), v]);
    const space = entries.filter(([k, v]) => /^--wds-(gap-g|padding-p)-\d+$/.test(k) && v.value).sort((a, b) => parseFloat(a[1].value) - parseFloat(b[1].value));
    const token = (k, sw, val) => `<li><button class="lab-token" type="button" data-copy="var(${k})" title="Copy var(${k})">${sw}<code>${k.slice(6)}</code>${val ? `<small>${esc(val)}</small>` : ''}</button></li>`;
    pane.innerHTML = [
      Object.keys(groups).length ? `<h3>Colour · light / dark</h3>${Object.entries(groups).map(([g, items]) => `<p class="lab-hint">${esc(g)}</p><ul class="lab-tokens">${items.map(([k, v]) => token(k, `<span class="lab-sw"><i style="background:${v.light}"></i><i style="background:${v.dark}"></i></span>`)).join('')}</ul>`).join('')}` : '',
      styles.length ? `<h3>Typography · desktop / tablet / mobile</h3>${styles.map(([n, v]) => `<button class="lab-type" type="button" data-copy="wds-${n}" title="Copy class wds-${n}"><span class="wds-${n}">${n.startsWith('statistic') ? '$235M' : 'Automotive Retail Cloud'}</span><small><span>.wds-${n}</span><span>${parseInt(v.desktop, 10)} / ${parseInt(v.tablet, 10)} / ${parseInt(v.mobile, 10)}</span></small></button>`).join('')}` : '',
      space.length ? `<h3>Spacing</h3><ul class="lab-tokens">${space.map(([k, v]) => token(k, `<span class="lab-bar" style="width:${Math.min(120, parseFloat(v.value) / 2)}px"></span>`, v.value)).join('')}</ul>` : '',
    ].join('') || '<p class="lab-empty-note">No tokens match.</p>';
  }

  // ---------- layers + inspector ----------
  function renderLayers() {
    $('#lab-count').textContent = `${state.blocks.length} section${state.blocks.length === 1 ? '' : 's'}`;
    list.innerHTML = state.blocks.length ? state.blocks.map((b, i) => {
      const def = { name: nameOf(b) };
      const t = themeOf(b) || state.theme;
      return `<li class="lab-layer" draggable="true" data-uid="${b.uid}" aria-current="${b.uid === sel}">
        <span class="lab-grip" aria-hidden="true">${ICON.grip}</span>
        <button class="lab-layer-name" type="button" data-select="${b.uid}"><span>${esc(def.name)}</span><i class="lab-dot is-${t}" title="${t} theme"></i></button>
        <button class="lab-icon" type="button" data-move="-1" aria-label="Move ${esc(def.name)} up" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
        <button class="lab-icon" type="button" data-move="1" aria-label="Move ${esc(def.name)} down" ${i === state.blocks.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
        <button class="lab-icon" type="button" data-dup aria-label="Duplicate ${esc(def.name)}">${ICON.copy}</button>
        <button class="lab-icon" type="button" data-remove aria-label="Remove ${esc(def.name)}">${ICON.trash}</button>
      </li>`;
    }).join('') : '<li class="lab-layers-empty">No sections yet</li>';
    renderInspector();
  }

  function renderInspector() {
    const b = find(sel);
    const insp = $('#lab-inspector');
    insp.hidden = !b;
    if (!b) return;
    const def = byType.get(b.type);
    $('#lab-insp-name').textContent = nameOf(b);
    $$('#lab-insp-theme button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.bt === b.theme)));
    const fixedInside = /^<[^>]*>[\s\S]*\sdata-theme=/.test(b.html) ? ' Part of this section keeps its own theme.' : '';
    $('#lab-insp-hint').textContent = { default: `Figma default: ${ownTheme(b) || def.theme}.`, page: `Follows the page theme (${state.theme}).`, light: 'Forced light.', dark: 'Forced dark.' }[b.theme] + fixedInside;
    $('#lab-insp-docs').href = url(def.docs);
    $('#lab-insp-add').hidden = b.type !== 'faq';
  }

  function renderAll(opts) { renderLayers(); renderCanvas(opts); }

  // ---------- chrome ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#lab-toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }
  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text); toast(`Copied ${label}`); }
    catch (e) { toast('Couldn’t reach the clipboard'); }
  }
  function syncToolbar() {
    $$('[data-vp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vp === state.vp)));
    $$('[data-pt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pt === state.theme)));
  }

  function wireChrome() {
    $$('[data-vp]').forEach((b) => b.addEventListener('click', () => { state.vp = b.dataset.vp; syncToolbar(); layout(); save(); }));
    $$('[data-pt]').forEach((b) => b.addEventListener('click', () => {
      if (state.theme === b.dataset.pt) return;
      commit(); state.theme = b.dataset.pt; syncToolbar(); renderAll(); save();
    }));
    $('#lab-edit').addEventListener('click', () => setEditing(!editing));
    $('#lab-undo').addEventListener('click', undo);
    $('#lab-redo').addEventListener('click', redo);
    $('#lab-preset').addEventListener('change', (e) => loadPreset(e.target.value));
    $('#lab-import').addEventListener('click', () => $('#lab-file').click());
    $('#lab-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importDocx(f); });
    $$('#lab-report [data-close]').forEach((b) => b.addEventListener('click', () => $('#lab-report').close()));
    $('#lab-report-undo').addEventListener('click', () => { $('#lab-report').close(); undo(); });
    // Drop a .docx anywhere on the stage to import it
    const hasFile = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    stage.addEventListener('dragover', (e) => { if (hasFile(e)) { e.preventDefault(); device.classList.add('is-drop'); } });
    stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) device.classList.remove('is-drop'); });
    stage.addEventListener('drop', (e) => { if (!hasFile(e)) return; e.preventDefault(); device.classList.remove('is-drop'); if (e.dataTransfer.files[0]) importDocx(e.dataTransfer.files[0]); });
    $('#lab-copy').addEventListener('click', () => copy(pageHtml(location.origin + BASE), 'the page HTML'));
    $('#lab-open').addEventListener('click', () => {
      const blob = new Blob([pageHtml(location.origin + BASE)], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    });
    $('#lab-export').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([pageHtml(location.origin + BASE)], { type: 'text/html' }));
      a.download = `${state.preset === 'import' ? state.title.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : state.preset || 'prototype'}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(`Exported ${a.download}`);
    });

    // Narrow screens: Library and Layers open as drawers
    $$('[data-panel]').forEach((b) => b.addEventListener('click', () => {
      const open = document.body.dataset.open === b.dataset.panel ? '' : b.dataset.panel;
      document.body.dataset.open = open;
      $$('[data-panel]').forEach((x) => x.setAttribute('aria-expanded', String(x.dataset.panel === open)));
    }));

    // Library tabs
    const tabs = $$('.lab-tabs [role="tab"]');
    const showTab = (tab) => {
      tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; $(`#${t.getAttribute('aria-controls')}`).hidden = !on; });
      const f = $('#lab-filter');
      f.placeholder = tab.id === 'tab-sections' ? 'Filter sections' : 'Filter tokens';
      f.value = '';
      tab.id === 'tab-sections' ? renderSections() : renderFoundations();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => showTab(t));
      t.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus(); showTab(next);
      });
    });
    $('#lab-filter').addEventListener('input', (e) => ($('#tab-sections').getAttribute('aria-selected') === 'true' ? renderSections : renderFoundations)(e.target.value));

    // Library: add, drag, copy tokens
    const libPanel = $('#lab-library');
    libPanel.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) {
        const i = state.blocks.findIndex((b) => b.uid === sel);
        // Insert after the selection, but keep the footer last
        let at = i >= 0 ? i + 1 : state.blocks.length;
        if (i < 0 && /^<footer\b/.test(state.blocks.at(-1)?.html || '') && byType.get(add.dataset.add)?.category !== 'Footer') at--;
        return addBlock(add.dataset.add, at);
      }
      const c = e.target.closest('[data-copy]');
      if (c) copy(c.dataset.copy, c.dataset.copy);
    });
    libPanel.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.lab-card');
      if (!card) return;
      dragType = card.dataset.type;
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', card.dataset.type);
      device.classList.add('is-drop');
    });
    libPanel.addEventListener('dragend', () => { dragType = null; device.classList.remove('is-drop'); });

    // Layers: select, move, duplicate, remove, drag to reorder
    list.addEventListener('click', (e) => {
      const li = e.target.closest('.lab-layer');
      if (!li) return;
      const uid = li.dataset.uid;
      const i = state.blocks.findIndex((b) => b.uid === uid);
      if (e.target.closest('[data-move]')) moveBlock(uid, i + Number(e.target.closest('[data-move]').dataset.move));
      else if (e.target.closest('[data-dup]')) duplicateBlock(uid);
      else if (e.target.closest('[data-remove]')) removeBlock(uid);
      else { sel = uid; renderLayers(); markSelection(); frame.contentDocument?.querySelector(`[data-lab-uid="${uid}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    });
    const clearLayerDrop = () => $$('.drop-before,.drop-after', list).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    list.addEventListener('dragstart', (e) => {
      const li = e.target.closest('.lab-layer');
      if (!li) return;
      dragUid = li.dataset.uid;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragUid);
    });
    list.addEventListener('dragover', (e) => {
      if (!dragUid && !dragType) return;
      e.preventDefault();
      clearLayerDrop();
      const li = e.target.closest('.lab-layer');
      if (!li) return;
      const r = li.getBoundingClientRect();
      li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const li = e.target.closest('.lab-layer');
      let at = state.blocks.length;
      if (li) {
        const r = li.getBoundingClientRect();
        at = state.blocks.findIndex((b) => b.uid === li.dataset.uid) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
      }
      clearLayerDrop();
      if (dragType) { addBlock(dragType, at); dragType = null; return; }
      const from = state.blocks.findIndex((b) => b.uid === dragUid);
      if (from >= 0) moveBlock(dragUid, at > from ? at - 1 : at);
    });
    list.addEventListener('dragend', () => { dragUid = null; clearLayerDrop(); $$('.is-dragging', list).forEach((x) => x.classList.remove('is-dragging')); });

    // Inspector
    $$('#lab-insp-theme button').forEach((x) => x.addEventListener('click', () => {
      const b = find(sel);
      if (!b || b.theme === x.dataset.bt) return;
      commit(); b.theme = x.dataset.bt; renderAll(); save();
    }));
    // FAQs grow over time: add a closed question to the selected FAQ section
    $('#lab-insp-add').addEventListener('click', () => {
      const b = find(sel);
      if (!b) return;
      const t = document.createElement('template');
      t.innerHTML = b.html;
      const list = t.content.querySelector('.wds-faq__list');
      const li = list?.lastElementChild?.cloneNode(true);
      if (!li) return;
      commit();
      li.querySelector('details').removeAttribute('open');
      li.querySelector('summary').textContent = 'New question?';
      li.querySelector('p').textContent = 'Write the answer here.';
      list.append(li);
      b.html = t.innerHTML;
      renderAll({ scrollTo: b.uid });
      save();
      toast('Added a question. Turn on Edit text to write it');
    });
    $('#lab-insp-reset').addEventListener('click', () => {
      const b = find(sel);
      if (!b) return;
      commit(); b.html = uniquify(byType.get(b.type).html, b.uid); renderAll(); save();
      toast('Content reset to the WDS example');
    });

    document.addEventListener('keydown', forwardKey);
    new ResizeObserver(layout).observe(stage);
  }

  // Shortcuts work from the app and from the canvas
  function forwardKey(e) {
    const t = e.target;
    if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicateBlock(sel); return; }
    if (mod || e.altKey && !/Arrow(Up|Down)/.test(e.key)) return;
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setEditing(!editing); return; }
    if (!sel) return;
    const i = state.blocks.findIndex((b) => b.uid === sel);
    if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveBlock(sel, i - 1); }
    else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveBlock(sel, i + 1); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && !t.closest?.('.lab-top')) { e.preventDefault(); removeBlock(sel); }
  }

  // ---------- start ----------
  async function start() {
    lib = await (await fetch(url('/lab/blocks.json'))).json();
    byType = new Map(lib.blocks.map((b) => [b.id, b]));
    $('#lab-preset').innerHTML = lib.presets.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (saved?.blocks) {
      state = { ...state, ...saved, blocks: saved.blocks.filter((b) => byType.has(b.type)) };
      syncPresetSelect();
    } else {
      loadPreset(lib.presets[0].id);
    }
    syncToolbar();
    wireChrome();
    renderSections();
    renderLayers();
    layout();
    initFrame();
  }
  start().catch((e) => { console.error(e); toast('The lab couldn’t load its block library'); });
})();
