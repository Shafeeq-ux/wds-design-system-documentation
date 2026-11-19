// WDS 3.0 component behaviour. Load with `defer` on any page that uses WDS components.
(() => {
  // Primary button: the cursor indicator and hover blur follow the pointer.
  document.addEventListener('pointermove', (e) => {
    const btn = e.target.closest?.('.wds-btn--primary');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--x', `${e.clientX - r.left}px`);
    btn.style.setProperty('--y', `${e.clientY - r.top}px`);
  }, { passive: true });

  // Breadcrumbs, Collapsed layout: the "…" button shows the hidden middle levels
  document.addEventListener('click', (e) => {
    const more = e.target.closest?.('.wds-breadcrumbs__more');
    if (!more) return;
    const list = more.closest('ol');
    list.querySelectorAll('li[hidden]').forEach((li) => { li.hidden = false; });
    const li = more.closest('li');
    (li.nextElementSibling?.querySelector('a') || list.querySelector('a'))?.focus();
    li.remove();
  });

  // Disclosure: <button aria-expanded="false" aria-controls="id" data-wds-toggle>
  // Used by header dropdowns and the menu panel. Only one open at a time per header.
  const open = new Set();
  function setOpen(btn, state) {
    const target = document.getElementById(btn.getAttribute('aria-controls'));
    if (!target) return;
    btn.setAttribute('aria-expanded', String(state));
    target.hidden = !state;
    if (btn.dataset.labelOpen) btn.setAttribute('aria-label', state ? btn.dataset.labelOpen : btn.dataset.labelClosed);
    state ? open.add(btn) : open.delete(btn);
  }
  function closeAll(except) { [...open].forEach((b) => { if (b !== except) setOpen(b, false); }); }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wds-toggle]');
    if (btn) {
      const next = btn.getAttribute('aria-expanded') !== 'true';
      closeAll(btn);
      setOpen(btn, next);
      return;
    }
    // Click outside closes anything open
    if (![...open].some((b) => document.getElementById(b.getAttribute('aria-controls'))?.contains(e.target))) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open.size) return;
    const last = [...open].pop();
    closeAll();
    last.focus();
  });
})();
