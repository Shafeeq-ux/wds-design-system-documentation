// WDS 3.0 docs: theme switch, mobile navigation, on-page TOC, search and live previews.
(() => {
  const html = document.documentElement;
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };

  // ---------- Theme ----------
  const resolvedTheme = () => html.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');
  function setTheme(choice) {
    if (choice === 'system') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', choice);
    store.set('wds-theme', choice === 'system' ? null : choice);
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === choice)));
    document.dispatchEvent(new CustomEvent('wds:themechange'));
  }
  setTheme(html.getAttribute('data-theme') || 'system');
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeSet)));
  darkQuery.addEventListener('change', () => document.dispatchEvent(new CustomEvent('wds:themechange')));

  // ---------- Mobile sidebar ----------
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.querySelector('.menu-btn');
  const scrim = document.querySelector('.scrim');
  function toggleNav(open) {
    sidebar.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    scrim.hidden = !open;
    if (open) (sidebar.querySelector('[aria-current]') || sidebar.querySelector('a'))?.focus();
  }
  menuBtn?.addEventListener('click', () => toggleNav(!sidebar.classList.contains('open')));
  scrim?.addEventListener('click', () => toggleNav(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sidebar.classList.contains('open')) { toggleNav(false); menuBtn.focus(); } });
  sidebar?.querySelector('[aria-current]')?.scrollIntoView({ block: 'center' });

  // Highlight the top-nav section for the current page
  const section = location.pathname.split('/')[1];
  document.querySelectorAll('.topnav a').forEach((a) => { if (a.pathname.split('/')[1] === section) a.setAttribute('aria-current', 'true'); });

  // ---------- TOC scroll-spy ----------
  const tocLinks = [...document.querySelectorAll('.toc a')];
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map((a) => [a.hash.slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        tocLinks.forEach((a) => a.removeAttribute('aria-current'));
        byId.get(en.target.id)?.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // ---------- Search ----------
  const dialog = document.querySelector('.search-dialog');
  const input = dialog?.querySelector('input');
  const list = dialog?.querySelector('.search-results');
  let index = null;
  let sel = -1;

  async function openSearch() {
    dialog.showModal();
    input.value = '';
    input.focus();
    if (!index) {
      try { index = await (await fetch('/search-index.json')).json(); } catch { index = []; }
    }
    renderResults('');
  }
  function renderResults(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = [];
    for (const p of index || []) {
      const hay = `${p.title} ${p.group} ${p.desc}`.toLowerCase();
      if (terms.every((t) => hay.includes(t))) hits.push({ href: p.href, title: p.title, sub: p.group, score: p.title.toLowerCase().startsWith(terms[0] || '') ? 0 : 1 });
      if (!terms.length) continue;
      for (const h of p.headings) {
        if (terms.every((t) => `${h.text} ${p.title}`.toLowerCase().includes(t))) hits.push({ href: `${p.href}#${h.id}`, title: h.text, sub: `${p.group} › ${p.title}`, score: 2 });
      }
    }
    hits.sort((a, b) => a.score - b.score);
    const shown = hits.slice(0, 30);
    sel = shown.length ? 0 : -1;
    list.innerHTML = shown.length
      ? shown.map((h, i) => `<li><a href="${h.href}" role="option" aria-selected="${i === 0}">${escapeHtml(h.title)}<small>${escapeHtml(h.sub)}</small></a></li>`).join('')
      : `<li class="search-empty">No results for “${escapeHtml(q)}”</li>`;
  }
  function moveSel(d) {
    const links = [...list.querySelectorAll('a')];
    if (!links.length) return;
    sel = (sel + d + links.length) % links.length;
    links.forEach((a, i) => a.setAttribute('aria-selected', String(i === sel)));
    links[sel].scrollIntoView({ block: 'nearest' });
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  document.querySelectorAll('[data-search-open]').forEach((b) => b.addEventListener('click', openSearch));
  input?.addEventListener('input', () => renderResults(input.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); const a = list.querySelectorAll('a')[sel]; if (a) { dialog.close(); location.href = a.href; } }
  });
  dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); if (!dialog.open) openSearch(); }
  });

  // ---------- Live preview: viewport + theme ----------
  // <div class="doc-preview" data-src="/examples/x.html" data-title="Hero"></div>
  const VIEWPORTS = { desktop: 1440, tablet: 768, mobile: 390 };
  document.querySelectorAll('.doc-preview[data-src]').forEach((el, n) => {
    const title = el.dataset.title || 'Preview';
    el.innerHTML = `
      <div class="pv-bar">
        <span class="pv-title">${escapeHtml(title)}</span>
        <div class="seg" role="group" aria-label="Viewport">
          ${Object.keys(VIEWPORTS).map((v) => `<button type="button" data-vp="${v}" aria-pressed="${v === 'desktop'}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
        <span class="pv-size" aria-live="polite"></span>
        <div class="seg" role="group" aria-label="Preview theme">
          <button type="button" data-pt="site" aria-pressed="true">Site</button>
          <button type="button" data-pt="light" aria-pressed="false">Light</button>
          <button type="button" data-pt="dark" aria-pressed="false">Dark</button>
        </div>
        <a class="pv-open" href="${el.dataset.src}" target="_blank" rel="noopener">Open<span class="visually-hidden"> ${escapeHtml(title)} in a new tab</span></a>
      </div>
      <div class="pv-stage"><div class="pv-device"><iframe title="${escapeHtml(title)} preview" src="${el.dataset.src}" loading="lazy" id="pv-${n}"></iframe></div></div>`;

    const stage = el.querySelector('.pv-stage');
    const device = el.querySelector('.pv-device');
    const frame = el.querySelector('iframe');
    const size = el.querySelector('.pv-size');
    let vp = 'desktop';
    let pt = 'site';

    function applyTheme() {
      const doc = frame.contentDocument;
      if (doc) doc.documentElement.setAttribute('data-theme', pt === 'site' ? resolvedTheme() : pt);
    }
    function layout() {
      const w = VIEWPORTS[vp];
      const scale = Math.min(1, stage.clientWidth / w);
      frame.style.width = w + 'px';
      const doc = frame.contentDocument;
      // Measure the body, not the document: the document is never shorter than the iframe itself
      const h = doc?.body ? Math.max(200, Math.ceil(doc.body.getBoundingClientRect().height)) : 480;
      frame.style.height = h + 'px';
      frame.style.transform = `scale(${scale})`;
      device.style.width = w * scale + 'px';
      device.style.height = h * scale + 'px';
      size.textContent = `${w}px${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}`;
    }
    frame.addEventListener('load', () => {
      applyTheme();
      layout();
      // Re-measure when fonts or images settle inside the frame
      if ('ResizeObserver' in window) new ResizeObserver(layout).observe(frame.contentDocument.body);
    });
    el.querySelectorAll('[data-vp]').forEach((b) => b.addEventListener('click', () => {
      vp = b.dataset.vp;
      el.querySelectorAll('[data-vp]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      layout();
    }));
    el.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => {
      pt = b.dataset.pt;
      el.querySelectorAll('[data-pt]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      applyTheme();
    }));
    document.addEventListener('wds:themechange', () => { if (pt === 'site') applyTheme(); });
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(stage);
  });
})();

// ---------- Copy token names ----------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  try { await navigator.clipboard.writeText(btn.dataset.copy); } catch { return; }
  btn.classList.add('copied');
  setTimeout(() => btn.classList.remove('copied'), 1200);
});

// ---------- Filter a table by typing ----------
document.querySelectorAll('[data-filter]').forEach((input) => {
  const rows = [...document.querySelectorAll(`${input.dataset.filter} tbody tr`)];
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    rows.forEach((r) => { r.hidden = q && !r.textContent.toLowerCase().includes(q); });
  });
});
