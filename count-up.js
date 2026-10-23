// Count-up for the headline numbers (Kate, 23 Oct 2026: "can we do this rapidly loading numbers when we first open a dashboard section?").
// Marketing Spend counted its four numbers up once; this does it for every page. Each time a section opens, the big numbers on it
// (the figures in the stat tiles and cards, not the table cells) run from 0 to their value in about half a second.
//
// No page needs to know about it: a number counts when it is a leaf element whose whole text is one figure (AED 1,463 / 17.8 to 1 / 62% /
// 3,421 / +4.2%) and it is set in a large size. Dates, names, times, years and anything inside a table, button, link or the sidebar are left
// alone. It waits for the numbers to arrive after a section opens, and stops a few seconds after the first have counted, so a filter
// change later does not replay it. A number counts when it comes into view, so one that is hidden at first (or further down the page) counts when it appears.
// Not for people who ask for less motion.
(function () {
  'use strict';
  if (window.__countUp) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  const DURATION = 650;      // ms for one number
  const OPEN_WINDOW = 90000; // ms after a section opens in which numbers that arrive are counted (a slow page can take a while to draw)
  const AFTER_FIRST = 4000;  // ms the window stays open once the first number has counted (the rest of a page loads together)
  const MIN_PX = 20;         // smaller than this is body text or a table figure, not a headline number

  // [prefix] [sign] number [suffix], and nothing else.
  const FIG = /^(AED\s?|[$£€])?([+\-−])?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(%|k|K|M|x|×|\s?to\s?1|\s?pts)?$/;
  const SKIP = 'table,thead,tbody,tr,td,th,button,a,input,select,textarea,nav,aside,header,footer,script,style,svg,canvas,[data-no-countup]';

  let armedUntil = 0;
  let gen = 0;               // one per section opening, so a section opened again counts again
  const pending = new Set();
  let queued = false;

  function parse(text) {
    const m = FIG.exec(text);
    if (!m) return null;
    const intPart = m[3], dec = m[4] || '';
    // A bare four-digit number from 1990 to 2100 is a year, not a figure.
    if (!m[1] && !m[2] && !m[5] && !dec && /^(19|20)\d\d$/.test(intPart)) return null;
    const value = parseFloat(intPart.replace(/,/g, '') + dec);
    if (!isFinite(value) || value === 0) return null;
    // A bare whole number under 100 is a calendar day, a rank or a small count: nothing worth counting up to.
    if (!m[1] && !m[2] && !m[5] && !dec && value < 100) return null;
    return { pre: (m[1] || '') + (m[2] || ''), value, decimals: dec ? dec.length - 1 : 0, comma: intPart.indexOf(',') > -1, suf: m[5] || '' };
  }

  function format(p, v) {
    const s = p.comma
      ? v.toLocaleString('en-GB', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
      : v.toFixed(p.decimals);
    return p.pre + s + p.suf;
  }

  function animate(el, p, final) {
    const t0 = performance.now();
    let last = null;
    el.style.fontVariantNumeric = 'tabular-nums';
    const done = () => { el.style.fontVariantNumeric = ''; };
    const tick = now => {
      // Someone else wrote to the number (a fresh draw, a filter): leave theirs alone.
      if (last !== null && el.textContent !== last) { done(); return; }
      const t = Math.min(1, (now - t0) / DURATION), e = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        last = format(p, p.value * e);
        el.textContent = last;
        requestAnimationFrame(tick);
      } else {
        el.textContent = final;
        done();
      }
    };
    requestAnimationFrame(tick);
  }

  // A number counts the first time it is on screen after the section opened (one that is hidden at first, or below the fold, waits).
  const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      seen.unobserve(en.target);
      const job = en.target.__cuJob;
      en.target.__cuJob = null;
      if (job && en.target.textContent.trim() === job.text) animate(en.target, job.p, en.target.textContent);
    });
  }, { threshold: 0.4 }) : null;

  function candidate(el) {
    if (el.__cu === gen) return false;
    const text = el.textContent.trim();
    if (!text || text.length > 22) return false;
    const p = parse(text);
    if (!p) return false;
    if (parseFloat(getComputedStyle(el).fontSize) < MIN_PX) return false;
    el.__cu = gen;
    if (seen) { el.__cuJob = { p, text }; seen.observe(el); } else if (el.getClientRects().length) animate(el, p, el.textContent);
    return true;
  }

  function scan(root) {
    let n = 0;
    if (root.nodeType !== 1 || root.closest(SKIP)) return n;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: node => (node !== root && node.matches(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    let node = walk.currentNode;
    const batch = [];
    while (node) {
      if (!node.firstElementChild && node.textContent.length <= 22) batch.push(node);
      node = walk.nextNode();
    }
    batch.forEach(el => { if (candidate(el)) n++; });
    return n;
  }

  function flush() {
    queued = false;
    if (Date.now() > armedUntil) { pending.clear(); return; }
    let counted = 0;
    pending.forEach(root => { if (root.isConnected) counted += scan(root); });
    pending.clear();
    if (counted) armedUntil = Math.min(armedUntil, Date.now() + AFTER_FIRST);
  }

  function queue(root) {
    pending.add(root);
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  }

  new MutationObserver(records => {
    if (Date.now() > armedUntil) return;
    records.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) queue(n); }));
  }).observe(document.body, { childList: true, subtree: true });

  // A section opens: count what is already on it, and what arrives in the next few seconds.
  function opened(view) {
    armedUntil = Date.now() + OPEN_WINDOW;
    gen++;
    if (seen) seen.disconnect();
    const box = document.getElementById('view-' + view);
    if (box) queue(box);
  }

  window.__countUp = { opened };
  if (typeof window.showView === 'function') {
    const orig = window.showView;
    window.showView = function () {
      const r = orig.apply(this, arguments);
      try { opened(typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW ? CURRENT_VIEW : arguments[0]); } catch (e) {}
      return r;
    };
  }
  // The page that is already up when this script arrives (the first open of the day).
  try { opened(typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW ? CURRENT_VIEW : 'dashboard'); } catch (e) {}
})();
