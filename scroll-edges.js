/* Sideways tables on a phone: an edge fade and a one-line hint.
   Audit 18 Oct 2026 (P3-16, P4-21, P6-10, Kate's 16 Oct phone ruling: "edge fade and hint on sideways grids").
   A table wider than the screen scrolls inside its wrapper with nothing to say so, and the last columns (and the Send
   button on the wave tables) are simply cut off. This marks each such wrapper: se-r while there is more to the right,
   se-l once it has moved, and shows "Swipe sideways" above it until the first swipe. The fade itself is CSS (mobile-late.css);
   the wrappers are found by class because the pages draw them with innerHTML, so a MutationObserver finds new ones.

   Kate, 23 Oct 2026: "all subsections that have a table that needs scrolling further to the right must have their first column sticky".
   So every table that scrolls sideways in its wrapper, on any page and at any width, keeps its first column (the name of the row) in
   view while the numbers move under it (se-stk on the table, the look is in mobile-late.css). A table whose first column is already
   sticky, or whose first cell spans the row, is left alone. The column's background is read from the nearest painted ancestor so it
   matches the card or the page, in light and in dark. */
(function () {
  const PHONE = matchMedia('(max-width:760px)');
  const SEL = '.slv-wrap:not(.ll-wrap), .lr-scroll, .lc-wrap.tc-wrap, .tp-cmp-wrap';
  const seen = new WeakSet();
  let queued = false;

  function paint(w) {
    const max = w.scrollWidth - w.clientWidth;
    const on = PHONE.matches && max > 2;
    w.classList.toggle('se-on', on);
    w.classList.toggle('se-r', on && w.scrollLeft < max - 2);
    w.classList.toggle('se-l', on && w.scrollLeft > 2);
    const hint = w.previousElementSibling && w.previousElementSibling.classList.contains('se-hint') ? w.previousElementSibling : null;
    if (on && !hint && !w.dataset.seMoved) {
      const h = document.createElement('div');
      h.className = 'se-hint';
      h.textContent = 'Swipe sideways for more columns';
      w.parentNode.insertBefore(h, w);
    } else if (hint && (!on || w.dataset.seMoved)) hint.remove();
  }

  function attach(w) {
    if (seen.has(w)) return;
    seen.add(w);
    w.addEventListener('scroll', () => {
      if (w.matches(SEL)) {
        if (w.scrollLeft > 6) w.dataset.seMoved = '1';   // she has found it: the hint goes
        paint(w);
      }
      stick(w);
    }, { passive: true });
  }

  // The colour behind a wrapper: the nearest ancestor that is painted at all, so the pinned column covers what scrolls under it.
  function bgOf(el) {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return getComputedStyle(document.body).backgroundColor || '#fff';
  }

  // The scrolling wrapper of a table: its parent, or the one above it, when that one scrolls sideways.
  function wrapOf(t) {
    for (let e = t.parentElement, i = 0; e && i < 3; e = e.parentElement, i++) {
      const o = getComputedStyle(e).overflowX;
      if (o === 'auto' || o === 'scroll') return e;
    }
    return null;
  }

  function stick(w) {
    const over = w.scrollWidth - w.clientWidth > 2;
    w.classList.toggle('se-sl', over && w.scrollLeft > 2);
    w.querySelectorAll('table').forEach(t => {
      const first = t.querySelector('tr > th, tr > td');
      const skip = !first || first.hasAttribute('colspan') || getComputedStyle(first).position === 'sticky' && !t.classList.contains('se-stk');
      const on = over && !skip && wrapOf(t) === w;
      t.classList.toggle('se-stk', on);
      if (on) t.style.setProperty('--se-bg', bgOf(w));
    });
  }

  function scan() {
    queued = false;
    document.querySelectorAll(SEL).forEach(w => { attach(w); paint(w); });
    const done = new Set();
    document.querySelectorAll('table').forEach(t => {
      const w = wrapOf(t);
      if (!w || done.has(w)) return;
      done.add(w);
      attach(w);
      stick(w);
    });
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(scan); } }

  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  new MutationObserver(queue).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });   // light and dark change the colour behind the pinned column
  addEventListener('resize', queue);
  PHONE.addEventListener && PHONE.addEventListener('change', queue);
  queue();
})();
