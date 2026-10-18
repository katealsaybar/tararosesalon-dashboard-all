/* Sideways tables on a phone: an edge fade and a one-line hint.
   Audit 18 Oct 2026 (P3-16, P4-21, P6-10, Kate's 16 Oct phone ruling: "edge fade and hint on sideways grids").
   A table wider than the screen scrolls inside its wrapper with nothing to say so, and the last columns (and the Send
   button on the wave tables) are simply cut off. This marks each such wrapper: se-r while there is more to the right,
   se-l once it has moved, and shows "Swipe sideways" above it until the first swipe. The fade itself is CSS (mobile-late.css);
   the wrappers are found by class because the pages draw them with innerHTML, so a MutationObserver finds new ones. */
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
      if (w.scrollLeft > 6) w.dataset.seMoved = '1';   // she has found it: the hint goes
      paint(w);
    }, { passive: true });
  }

  function scan() {
    queued = false;
    document.querySelectorAll(SEL).forEach(w => { attach(w); paint(w); });
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(scan); } }

  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', queue);
  PHONE.addEventListener && PHONE.addEventListener('change', queue);
  queue();
})();
