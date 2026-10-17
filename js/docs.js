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
  const base = document.documentElement.dataset.base || '';
  const part = (path) => (path.startsWith(base) ? path.slice(base.length) : path).split('/')[1];
  const section = part(location.pathname);
  document.querySelectorAll('.topnav a').forEach((a) => { if (part(a.pathname) === section) a.setAttribute('aria-current', 'true'); });

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
      try { index = await (await fetch(`${document.documentElement.dataset.base || ''}/search-index.json`)).json(); } catch { index = []; }
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
    // data-start-theme on the preview sets its starting theme (the Figma default for that section)
    let pt = el.dataset.startTheme || 'site';
    el.querySelectorAll('[data-pt]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pt === pt)));

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
    rows.forEach((r) => { r.dataset.qhide = q && !r.textContent.toLowerCase().includes(q) ? '1' : ''; r.hidden = !!r.dataset.qhide || !!r.dataset.vhide; });
  });
});

// ---------- Live character counters ----------
document.querySelectorAll('input[data-limit]').forEach((input) => {
  const out = document.querySelector(`output[for="${input.id}"]`);
  const limit = Number(input.dataset.limit);
  const update = () => {
    const n = [...input.value].length;
    out.textContent = `${n} / ${limit}`;
    out.classList.toggle('over', n > limit);
  };
  input.addEventListener('input', update);
});

// ---------- Character limit calculator (same formula as scripts/shortcodes.mjs) ----------
document.querySelectorAll('form.calc').forEach((form) => {
  const styles = JSON.parse(form.dataset.styles);
  const res = form.querySelector('.calc-result');
  const count = form.querySelector('.calc-count');
  let limit = 0;
  function calc() {
    const f = form.elements;
    const s = styles[f.style.value];
    const width = Math.max(50, Number(f.width.value) || 0);
    const lines = Math.max(1, Number(f.lines.value) || 1);
    const k = 0.45 * (s.stretch / 100);
    const cpl = Math.floor(width / (s.size[0] * k));
    limit = Math.max(5, Math.floor((cpl * lines * 0.95) / 5) * 5);
    const cplM = Math.floor(Math.min(width, 342) / (s.size[2] * k));
    res.innerHTML = `<b>${limit}</b> characters max · about ${cpl} per line at ${s.size[0]}px · about ${Math.ceil(limit / cplM)} lines on mobile at ${s.size[2]}px`;
    countCopy();
  }
  function countCopy() {
    const n = [...form.elements.copy.value].length;
    count.textContent = n ? `${n} / ${limit}${n > limit ? ` · ${n - limit} too many` : ' · fits'}` : '';
    count.classList.toggle('over', n > limit);
  }
  form.addEventListener('input', (e) => (e.target.name === 'copy' ? countCopy() : calc()));
  calc();
});

// ---------- Copy a whole code block ----------
document.querySelectorAll('[data-copy-from]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const src = document.querySelector(btn.dataset.copyFrom);
    try { await navigator.clipboard.writeText(src.textContent); } catch { return; }
    const label = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = label; }, 1500);
  });
});

// ---------- Keyboard access to scrollable blocks (WCAG 2.1.1) ----------
function markScrollable() {
  document.querySelectorAll('pre, .table-wrap').forEach((el) => {
    const scrolls = el.scrollWidth > el.clientWidth + 1;
    if (scrolls && !el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'region');
      const label = el.matches('pre') ? 'Code example' : (el.previousElementSibling?.textContent?.trim().slice(0, 60) || 'Table');
      el.setAttribute('aria-label', label + ' (scrolls sideways)');
    } else if (!scrolls && el.getAttribute('role') === 'region') {
      el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-label');
    }
  });
}
markScrollable();
window.addEventListener('resize', () => { clearTimeout(markScrollable.t); markScrollable.t = setTimeout(markScrollable, 200); });

// ---------- Audit table version chips ----------
document.querySelectorAll('[data-vfilter]').forEach((chip, _, all) => {
  chip.addEventListener('click', () => {
    all.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    const v = chip.dataset.vfilter;
    document.querySelectorAll('#audit-table tbody tr').forEach((tr) => { tr.dataset.vhide = v !== 'All' && tr.dataset.v !== v ? '1' : ''; tr.hidden = !!tr.dataset.vhide || !!tr.dataset.qhide; });
  });
});

// Sitemap: full screen and zoom
document.querySelectorAll('[data-ia-frame]').forEach((frame) => {
  const wrap = frame.querySelector('.ia-wrap');
  const svg = frame.querySelector('svg.ia');
  const out = frame.querySelector('.ia-zoom');
  const fullBtn = frame.querySelector('[data-ia="full"]');
  const W = Number(svg.getAttribute('width'));
  let zoom = 1;
  const apply = (z) => {
    zoom = Math.min(3, Math.max(0.25, Math.round(z * 100) / 100));
    svg.style.width = `${W * zoom}px`;
    svg.style.height = 'auto';
    frame.classList.add('is-zoomed');
    out.textContent = `${Math.round(zoom * 100)}%`;
  };
  const fit = () => apply((wrap.clientWidth - 2) / W);
  const native = !!frame.requestFullscreen;
  const isFull = () => document.fullscreenElement === frame || frame.classList.contains('is-full');
  const sync = () => {
    const on = isFull();
    fullBtn.setAttribute('aria-pressed', String(on));
    fullBtn.textContent = on ? 'Exit full screen' : 'Full screen';
    requestAnimationFrame(fit);
  };
  // Overlay fallback for browsers or frames that refuse the Fullscreen API
  const overlay = (on) => {
    frame.classList.toggle('is-full', on);
    document.documentElement.classList.toggle('ia-lock', on);
    sync();
  };
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (frame.classList.contains('is-full')) overlay(false);
    else if (native) {
      frame.requestFullscreen().catch(() => {});
      // Some embedded browsers accept the request and then drop it
      setTimeout(() => { if (document.fullscreenElement !== frame) overlay(true); }, 400);
    }
    else overlay(true);
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && frame.classList.contains('is-full')) { toggle(); fullBtn.focus(); }
  });
  frame.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ia]');
    if (!b) return;
    const a = b.dataset.ia;
    if (a === 'full') toggle();
    else if (a === 'in') apply(zoom + 0.25);
    else if (a === 'out') apply(zoom - 0.25);
    else if (a === 'fit') fit();
    else if (a === 'reset') apply(1);
  });
  wrap.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    apply(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  }, { passive: false });
});

// Token inspector: select a layer to see its variables; padding and gaps are drawn on the image
document.querySelectorAll('[data-tm]').forEach((tm) => {
  const data = JSON.parse(tm.querySelector('.tm-data').textContent);
  const detail = tm.querySelector('.tm-detail');
  const hint = detail.innerHTML;
  let view = 0, sel = null, filter = 'all';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const els = (sel2) => [...tm.querySelectorAll(sel2)];
  const cur = (attr) => tm.querySelector(`${attr}[data-tm-v="${view}"]`);
  const pct = (a, t) => `${(a / t) * 100}%`;
  const box = (b, cls, label) => {
    const V = data[view];
    let h = `<i class="${cls}" style="left:${pct(b[0], V.w)};top:${pct(b[1], V.h)};width:${pct(Math.max(b[2], 1), V.w)};height:${pct(Math.max(b[3], 1), V.h)}"></i>`;
    if (label) h += `<b style="left:${pct(b[0] + b[2] / 2, V.w)};top:${pct(b[1] + b[3] / 2, V.h)}">${label}</b>`;
    return h;
  };
  const ICON = { color: (r) => `<span class="ico" style="background:${r.grad ? `linear-gradient(90deg,${r.grad.join(',')})` : /^#|^rgb/.test(r.swatch || '') ? r.swatch.split(' ')[0] : 'transparent'}"></span>`, type: () => '<span class="ico type">Aa</span>', space: () => '<span class="ico space"></span>', border: () => '<span class="ico border"></span>', none: () => '<span class="ico"></span>' };
  function draw(n) {
    const ov = cur('.tm-view').querySelector('.tm-ov');
    if (!n) { ov.innerHTML = ''; return; }
    let h = '';
    if (n.pad) {
      const [t, r, b, l] = n.pad, [x, y, w, hh] = n.b;
      if (t) h += box([x, y, w, t], 'p', t);
      if (b) h += box([x, y + hh - b, w, b], 'p', b);
      if (l) h += box([x, y + t, l, hh - t - b], 'p', l);
      if (r) h += box([x + w - r, y + t, r, hh - t - b], 'p', r);
    }
    for (const g of n.bands || []) h += box(g, 'g', Math.round(g[2] < g[3] ? g[2] : g[3]));
    h += box(n.b, 'sel');
    ov.innerHTML = h;
  }
  function pick(i, scroll) {
    const V = data[view];
    let n = V.nodes[i];
    sel = i;
    els('.tm-hot').forEach((h) => h.classList.toggle('is-sel', h.closest('[data-tm-v]').dataset.tmV == view && +h.dataset.i === i));
    const base = n.dup != null ? n.dup : i;
    els('[data-tm-pick]').forEach((b) => b.setAttribute('aria-current', String(b.closest('[data-tm-v]').dataset.tmV == view && +b.dataset.tmPick === base)));
    if (scroll) cur('.tm-layers').querySelector(`[data-tm-pick="${base}"]`)?.scrollIntoView({ block: 'nearest' });
    draw(n);
    const rows = n.rows.map((r) => `<li>${(ICON[r.cat] || ICON.none)(r)}<span class="k">${esc(r.prop)}</span><span class="v"><code>${esc(r.figma)}</code>${r.css ? ` → <code>${esc(r.css)}</code>` : ''}</span><span class="v${r.hard ? ' hard' : ''}">${esc(r.value)}${r.hard ? ' · not tokenised' : ''}${r.across && r.across !== r.value ? `<br><small>${esc(r.across)}</small>` : ''}${r.ref ? `<br><small>Alias of ${esc(r.ref)}</small>` : ''}</span></li>`).join('');
    detail.innerHTML = `<h3>${esc(n.name)}</h3><p class="tm-type">${esc(n.type.toLowerCase())} · ${n.b[2]} × ${n.b[3]}${n.text ? ` · “${esc(n.text.trim())}”` : ''}</p>${n.issues.length ? `<ul class="tm-issues">${n.issues.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}<ul class="tm-rows">${rows}</ul>${n.css.length ? `<pre tabindex="0" aria-label="CSS for ${esc(n.name)}"><code>${esc(n.css.join('\n'))}</code></pre>` : ''}`;
  }
  function applyFilter() {
    tm.dataset.filter = filter;
    els('.tm-hot').forEach((h) => h.classList.toggle('is-off', filter !== 'all' && !h.dataset.cats.split(' ').includes(filter)));
    els('.tm-layers li').forEach((li) => { li.hidden = filter !== 'all' && !li.dataset.cats.split(' ').includes(filter); });
  }
  let zoom = 'fit';
  const applyZoom = () => els('.tm-canvas').forEach((c, k) => {
    const on = zoom !== 'fit';
    c.classList.toggle('is-zoomed', on);
    c.style.width = on ? `${data[k].w * +zoom}px` : '';
  });
  const fullBtn = tm.querySelector('[data-tm-full]');
  const setFull = (on) => {
    tm.classList.toggle('is-full', on);
    document.documentElement.classList.toggle('ia-lock', on);
    fullBtn.setAttribute('aria-pressed', String(on));
    fullBtn.textContent = on ? 'Exit full screen' : 'Full screen';
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tm.classList.contains('is-full')) { setFull(false); fullBtn.focus(); } });
  tm.addEventListener('click', (e) => {
    const hot = e.target.closest('.tm-hot');
    if (hot) { pick(+hot.dataset.i, true); return; }
    const p = e.target.closest('[data-tm-pick]');
    if (p) { pick(+p.dataset.tmPick); return; }
    const v = e.target.closest('[data-tm-view]');
    if (v) {
      view = +v.dataset.tmView;
      els('[data-tm-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === v)));
      els('.tm-view, .tm-layers').forEach((el) => { el.hidden = +el.dataset.tmV !== view; });
      els('.tm-ov').forEach((o) => { o.innerHTML = ''; });
      sel = null; detail.innerHTML = hint;
      return;
    }
    const z = e.target.closest('[data-tm-zoom]');
    if (z) {
      els('[data-tm-zoom]').forEach((b) => b.setAttribute('aria-pressed', String(b === z)));
      zoom = z.dataset.tmZoom;
      applyZoom();
      return;
    }
    if (e.target.closest('[data-tm-full]')) { setFull(!tm.classList.contains('is-full')); return; }
    const f = e.target.closest('[data-tm-filter]');
    if (f) {
      filter = f.dataset.tmFilter;
      els('[data-tm-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      applyFilter();
    }
  });
});
