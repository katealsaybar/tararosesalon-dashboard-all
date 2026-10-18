/* PHONE FOLDS for the Clients pages (audit 18 Oct 2026, P4-20).
   At 375px the first client row sat 3,000px down on Lost Clients and To message, 2,348px on Top Clients: five rows of filter pills, a
   wall of waves and a paragraph of definition came first. Kate's 16 Oct rulings: switches are toggles, visual first, a long
   explanation goes in a collapsed <details>. So on a phone only:
     - the filter bar (.lc-bar) becomes one row, "Filters", whose line says what is picked; tap to open the pills
     - the paragraph under a page title (.slv-intro p) folds behind "About this page" when it runs long
     - Lost Clients' and the Wellness Voucher blast's definition, explainer and wave cards fold behind one row each
   Nothing is removed and nothing is renamed: each block is moved, whole, into a <details>, so every button and every id the pages'
   own scripts look up is still there. The pages redraw by replacing their innerHTML, so a MutationObserver folds the new copy;
   going back to a laptop width unfolds everything. The summary says what is inside so a fold is never a mystery. */
(function () {
  var PHONE = matchMedia('(max-width:760px)');
  var HOSTS = ['topClientsContent', 'lostClientsContent', 'lostListsContent', 'wvBlastContent'];
  var busy = false, queued = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // What the filter bar currently says, in a few words: the picked button of each group, the picked option of each menu.
  function barLine(bar) {
    var out = [];
    bar.querySelectorAll('.lc-grp, .lc-cust').forEach(function (g) {
      var on = g.querySelector('button.on, button[aria-pressed="true"]');
      var ps = g.querySelector('.ps-btn');
      var t = (on && on.textContent) || (ps && ps.textContent) || '';
      t = t.replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    });
    return out.join(' · ');
  }

  function wrap(el, title, line, open) {
    if (!el || !el.parentNode || el.closest('details.pf')) return null;
    var d = document.createElement('details');
    d.className = 'pf';
    if (open) d.open = true;
    var s = document.createElement('summary');
    s.innerHTML = '<span class="pf-t">' + esc(title) + '</span>' + (line ? '<span class="pf-l">' + esc(line) + '</span>' : '');
    el.parentNode.insertBefore(d, el);
    d.appendChild(s);
    d.appendChild(el);
    return d;
  }

  function foldHost(host) {
    // 1. The filter bar.
    host.querySelectorAll('.lc-bar').forEach(function (bar) { var d = wrap(bar, 'Filters', barLine(bar)); if (d) d.dataset.bar = '1'; });
    // 2. The paragraph under the title, when it is long.
    host.querySelectorAll('.slv-intro > p').forEach(function (p) {
      if (p.closest('details.pf')) return;
      if (p.textContent.trim().length > 140) wrap(p, 'About this page', '');
    });
    // 3. Lost Clients and the voucher blast: the definition, the explainer, the wave cards.
    host.querySelectorAll('.ll-def').forEach(function (el) { wrap(el, 'How a client is chosen', ''); });
    host.querySelectorAll('.ll-explain').forEach(function (el) { wrap(el, 'How to read the waves', ''); });
    // The Performance report's stat tiles (.lr-cards) are numbers to read, not wave cards to pick from: left open (18 Oct 2026).
    host.querySelectorAll('.ll-cards:not(.lr-cards)').forEach(function (el) {
      var n = el.querySelectorAll('.ll-card').length;
      var on = el.querySelector('.ll-card.on .ll-t');
      wrap(el, 'Waves' + (n ? ' · ' + n : ''), on ? on.textContent.trim() : '');
    });
  }

  function unfold() {
    document.querySelectorAll('details.pf').forEach(function (d) {
      var kids = [].slice.call(d.children).filter(function (c) { return c.tagName !== 'SUMMARY'; });
      kids.forEach(function (k) { d.parentNode.insertBefore(k, d); });
      d.remove();
    });
  }

  function run() {
    queued = false;
    if (!PHONE.matches) return;
    busy = true;
    try { HOSTS.forEach(function (id) { var h = document.getElementById(id); if (h) foldHost(h); }); } catch (e) { console.warn('phone-fold', e); }
    busy = false;
  }
  function soon() {
    if (queued || busy || !PHONE.matches) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(run, 16);
  }

  function start() {
    var mo = new MutationObserver(soon);
    HOSTS.forEach(function (id) { var h = document.getElementById(id); if (h) mo.observe(h, { childList: true, subtree: true }); });
    // The hosts exist in the page from the start; if one is added later, look again.
    run();
  }
  // A pill is tapped: the page may repaint the bar in place, so the line is read again a moment later.
  document.addEventListener('click', function (e) {
    var d = e.target.closest && e.target.closest('details.pf[data-bar]');
    if (!d) return;
    setTimeout(function () {
      var bar = d.querySelector('.lc-bar'), l = d.querySelector('.pf-l');
      if (bar && l) l.textContent = barLine(bar);
    }, 350);
  });
  PHONE.addEventListener('change', function () { if (PHONE.matches) run(); else unfold(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
