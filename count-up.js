// Count-up for the numbers (Kate, 23 Oct 2026: "can we do this rapidly loading numbers when we first open a dashboard section?").
// Marketing Spend counted its four numbers up once; this does it for every page. Each time a section opens, the figures on it (stat
// tiles, cards, side summaries and the figures in tables) run from 0 to their value in about half a second, each as it comes on screen.
//
// No page needs to know about it: a number counts when it is a leaf element whose whole text is one figure (AED 1,463 / 17.8 to 1 / 62% /
// 3,421 / +4.2%). Dates, names, times, years, ranks, calendar days, a bare figure under 10 or on a button or link (a pager, a 30 / 90 days chip) and anything in an input, the
// sidebar menu or the masthead are left alone (put data-no-countup on anything else that should stand still). It waits for the numbers to
// arrive after a section opens, and stops a few seconds after the last have counted, so a filter change later does not replay it.
// It also reaches the pages drawn inside a shadow root (Supplier Spend) and inside a frame of this site (Staff Performance, Google
// Reviews, Wellness Voucher Performance). Not for people who ask for less motion.
(function () {
  'use strict';
  if (window.__countUp) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  const DURATION = 650;      // ms for one number
  const OPEN_WINDOW = 90000; // ms after a section opens in which numbers that arrive are counted (a slow page can take a while to draw)
  const AFTER_COUNT = 4000;  // ms the window stays open after numbers have counted (the rest of a page arrives in pieces)
  const MAX_PER_OPEN = 600;  // numbers watched per opening (a table of thousands of rows only counts the first screens)
  const SELF = document.currentScript && document.currentScript.src;
  const inFrame = window.self !== window.top;

  // [prefix] [sign] number [suffix], and nothing else.
  const FIG = /^(AED\s?|[$£€])?([+\-−])?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(%|k|K|M|x|×|\s?to\s?1|\s?pts)?$/;
  const SKIP = 'input,select,textarea,option,nav,aside.sidebar,header,footer,script,style,svg,canvas,[contenteditable],[data-no-countup]';
  // Class names that mean a rank or a calendar day, whatever size they are set in.
  const RANKISH = /(?:^|[\s_-])(?:rk|rank|cal-d|dow)(?:$|[\s_-])/i;

  let armedUntil = 0, openedAt = 0, watched = 0;
  let gen = 0;               // one per section opening, so a section opened again counts again
  const pending = new Set();
  let queued = false;

  function parse(text) {
    const m = FIG.exec(text);
    if (!m) return null;
    const intPart = m[3], dec = m[4] || '';
    const plain = !m[1] && !m[2] && !m[5] && !dec;
    // A bare four-digit number from 1990 to 2100 is a year, and a bare figure under 10 has nothing to count through.
    if (plain && /^(19|20)\d\d$/.test(intPart)) return null;
    const value = parseFloat(intPart.replace(/,/g, '') + dec);
    if (!isFinite(value) || value === 0) return null;
    if (plain && value < 10) return null;
    return { pre: (m[1] || '') + (m[2] || ''), value, decimals: dec ? dec.length - 1 : 0, comma: intPart.indexOf(',') > -1, suf: m[5] || '' };
  }

  function format(p, v) {
    const s = p.comma
      ? v.toLocaleString('en-GB', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
      : v.toFixed(p.decimals);
    return p.pre + s + p.suf;
  }

  // Kate, 26 Oct 2026: the rows jumped up and down while she scrolled Wellness Voucher Performance. A figure that wraps at its final
  // width ("AED / 11,224") fits on one line while it is still counting, so its row went 54px, 34px, 54px, and the frame, which is
  // as tall as its page, moved with it. The box the figure has at its final value is held for the half second it counts: height
  // always, and width on a table cell (its column would otherwise shrink and grow with it). Restored when the count ends.
  function holdBox(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || cs.display === 'none') return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cell = cs.display === 'table-cell';
    const border = cs.boxSizing === 'border-box';
    const padH = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const padW = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const h = border ? r.height : r.height - padH, w = border ? r.width : r.width - padW;
    const was = { minHeight: el.style.minHeight, height: el.style.height, minWidth: el.style.minWidth, width: el.style.width };
    if (cell) { el.style.height = h + 'px'; el.style.width = w + 'px'; } else { el.style.minHeight = h + 'px'; }
    return () => { el.style.minHeight = was.minHeight; el.style.height = was.height; el.style.minWidth = was.minWidth; el.style.width = was.width; };
  }

  function animate(el, p, final) {
    const t0 = performance.now();
    const release = holdBox(el);
    let last = null;
    const tick = now => {
      // Someone else wrote to the number (a fresh draw, a filter): leave theirs alone.
      if (last !== null && el.textContent !== last) { if (release) release(); return; }
      const t = Math.min(1, (now - t0) / DURATION), e = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        last = format(p, p.value * e);
        el.textContent = last;
        requestAnimationFrame(tick);
      } else {
        el.textContent = final;
        if (release) release();
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
    if (RANKISH.test(el.getAttribute('class') || '')) return false;
    // A tile can be a button or a link, but a bare number on one (a pager, a 30 / 90 days chip) is a label, not a figure.
    if (!p.pre && !p.suf && !p.decimals && !p.comma && el.closest('button,a')) return false;
    // A bare whole number in a large size is a calendar day or a rank, not a figure.
    if (!p.pre && !p.suf && !p.decimals && !p.comma && parseFloat(getComputedStyle(el).fontSize) >= 20 && p.value < 100) return false;
    el.__cu = gen;
    watched++;
    if (seen) { el.__cuJob = { p, text }; seen.observe(el); } else if (el.getClientRects().length) animate(el, p, el.textContent);
    return true;
  }

  function scan(root) {
    let n = 0;
    if (root.nodeType === 1 && root.closest(SKIP)) return n;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: node => (node !== root && node.matches(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    let node = walk.currentNode;
    const leaves = [], shadows = [], frames = [];
    while (node) {
      if (node.nodeType === 1) {
        if (!node.firstElementChild && node.textContent.length <= 22) leaves.push(node);
        if (node.shadowRoot) shadows.push(node.shadowRoot);
        if (node.localName === 'iframe') frames.push(node);
      }
      node = walk.nextNode();
    }
    for (let i = 0; i < leaves.length && watched < MAX_PER_OPEN; i++) if (candidate(leaves[i])) n++;
    shadows.forEach(sr => { watch(sr); n += scan(sr); });
    frames.forEach(hookFrame);
    return n;
  }

  function flush() {
    queued = false;
    if (Date.now() > armedUntil) { pending.clear(); return; }
    let counted = 0;
    pending.forEach(root => { if (root.isConnected !== false) counted += scan(root); });
    pending.clear();
    if (counted) armedUntil = Math.min(openedAt + OPEN_WINDOW, Date.now() + AFTER_COUNT);
  }

  function queue(root) {
    pending.add(root);
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  }

  const mo = new MutationObserver(records => {
    if (Date.now() > armedUntil) return;
    records.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) queue(n); }));
  });
  const watching = new WeakSet();
  function watch(root) {
    if (watching.has(root)) return;
    watching.add(root);
    mo.observe(root, { childList: true, subtree: true });
  }
  watch(document.body);

  // A page drawn inside a shadow root (Supplier Spend) is invisible to the observer above: watch each root as it is made.
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function () {
    const sr = attach.apply(this, arguments);
    if (sr.mode === 'open') watch(sr);
    return sr;
  };

  // A frame of this site (Staff Performance, Google Reviews, Wellness Voucher Performance) gets this script too, and is told when its section opens.
  function hookFrame(f) {
    if (inFrame || !SELF || f.__cuHooked) return;
    f.__cuHooked = true;
    const put = () => {
      try {
        const w = f.contentWindow, d = f.contentDocument;
        if (!d || !d.body || w.__countUp) return;
        const s = d.createElement('script');
        s.src = SELF;
        d.head.appendChild(s);
      } catch (e) { /* another site's frame: leave it */ }
    };
    f.addEventListener('load', put);
    if (f.contentDocument && f.contentDocument.readyState === 'complete' && (f.getAttribute('src') || f.dataset.src)) put();
  }

  // A section opens: count what is already on it, and what arrives after.
  function opened(view) {
    openedAt = Date.now();
    armedUntil = openedAt + OPEN_WINDOW;
    gen++;
    watched = 0;
    if (seen) seen.disconnect();
    const box = document.getElementById('view-' + view) || (inFrame ? document.body : null);
    if (box) queue(box);
    if (!inFrame && box) box.querySelectorAll('iframe').forEach(f => {
      hookFrame(f);
      try { if (f.contentWindow.__countUp) f.contentWindow.__countUp.opened(); } catch (e) { /* not ours */ }
    });
  }

  window.__countUp = { opened };
  if (typeof window.showView === 'function') {
    const orig = window.showView;
    window.showView = function () {
      const r = orig.apply(this, arguments);
      try { opened(typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW ? CURRENT_VIEW : arguments[0]); } catch (e) { /* the page matters more */ }
      return r;
    };
  }
  // The page that is already up when this script arrives (the first open of the day), or the whole page when this is a frame.
  try { opened(typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW ? CURRENT_VIEW : 'dashboard'); } catch (e) { /* as above */ }
})();
