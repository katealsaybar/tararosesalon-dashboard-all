/* THE SHARED JUMP LIST ("On this page"). Kate, 23 Oct 2026: every page gets a mini side nav, and it is mandatory when a page has more than
   one sub-section (adult learning audit, ALD-X-01). Two ways to get one, one markup:

   1. A page that builds its own list calls lgRail(items) or lgShell(items, body): the rail in the gutter from 1400px, a row of chips
      below. These four functions (lgRail, lgShell, lgAnchor, lgJump) lived in branch-ledger.js and were used by seven pages; they are
      here now, at boot, because a page that is not a Ledger should not depend on the Ledgers' file.

   2. Every other page is named in JN_PAGES below (or calls jnWatch from its own file), with the selector that finds its section
      headings. This file then builds the list itself, after the page has drawn and again whenever the page redraws, and puts it under
      the page's title as one line of chips. No page has to change. A page that already carries a rail (.lg-side or .side-nav in its
      view) is left alone.

   On the dashboard the chips are the same .side-nav markup the Pulse and the Ledgers use, so spy() in index.html lights the chip for
   the section in view and writes it to the address (#section); on load the address is read back and the page scrolls there once.
   Outside the dashboard (Team Home, the KB, My Numbers, the campaign drafts) there is no spy(), so this file lights the chip itself.

   Phone: one line, chips scroll sideways with the edge fade. It sits under the page title and pins under the condensed masthead as the
   reader scrolls past it, so the first screen is not taken. A page that already pins a bar of its own says pin:false and the row
   scrolls away with the page instead of stacking two bars. The styles are in jump-nav.css. */

const jnEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function lgRail(items) {
  if (!items || !items.length) return '';
  return `<aside class="lg-side">
    <nav class="side-nav" aria-label="On this page">
      <div class="side-k">On this page</div>
      ${items.map(([id, label, jump]) =>
        `<a href="#${id}" onclick="${jump || `lgJump(event,'${id}')`}">${jnEsc(label)}</a>`).join('')}
    </nav>
  </aside>`;
}

// Rail in the gutter, page beside it. The header, the note and the Split chips stay full width above this: they describe the whole
// page, so indenting them into the document column would leave the rail floating beside nothing.
function lgShell(railItems, bodyHtml, extraCls) {
  return `<div class="lg-shell${extraCls ? ' ' + extraCls : ''}">${lgRail(railItems)}<div class="lg-doc">${bodyHtml}</div></div>`;
}

// What a rail entry points at: a collapsible section if there is one, otherwise an id that is already in the document. spy() resolves
// the same two ways.
function lgAnchor(id) {
  return document.getElementById('sec-' + id) || document.getElementById(id);
}

// How far down the page a jumped-to section should land: under the masthead, and under the row of chips when that is pinned too.
function jnOffset(el) {
  const pin = [...document.querySelectorAll('.jn-rail.jn-pin')].find(r => r.getClientRects().length);
  const own = pin ? parseFloat(pin.style.getPropertyValue('--jn-top')) : NaN;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--topbar-cond-h');
  // A row that follows the masthead's edge lands under the masthead at full height: scrolling up brings the masthead back.
  const full = parseInt(raw, 10) || (document.getElementById('topbar') ? 104 : 0);
  const bar = isNaN(own) ? full : pin.hasAttribute('data-track') ? Math.max(own, full) : own;
  // A heading that has its small label above it (the eyebrow) should land with the label showing, not under the row.
  const lab = el && el.previousElementSibling && /eyebrow/.test(el.previousElementSibling.className) ? el.previousElementSibling.offsetHeight + 6 : 0;
  return bar + 8 + lab + (pin ? pin.offsetHeight : 0);
}

// Scroll to a section, opening it first if it is collapsed: a rail link that lands you on a closed heading looks like it did nothing.
// sectionState is the shared open/closed map the whole dashboard uses, so this asks it rather than reading the DOM. The masthead is
// fixed, hence the offset.
function lgJump(e, id) {
  if (e) e.preventDefault();
  const el = lgAnchor(id);
  if (!el) return;
  if (document.getElementById('sec-' + id) && typeof sectionState !== 'undefined'
      && !sectionState[id] && typeof toggleSection === 'function') toggleSection(id);
  const closed = el.closest('details:not([open])');
  if (closed) closed.open = true;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - jnOffset(el), behavior: 'smooth' });
}

/* ── THE AUTOMATIC LIST ───────────────────────────────────────
   key → { root: where the page draws (default #view-<key>), sel: the selector for the section headings, in document order,
   pin: false when the page pins a bar of its own, full: keep the whole heading text (default: cut at the first comma or dot),
   label: (el) => the chip's text, labels: names by position for sections that carry no heading of their own,
   alt: a second selector to try when the first finds fewer than two, below: a selector for a bar the page pins at its top (Team Home's
   header), so the row pins under it instead of under the dashboard masthead, top: a fixed pin offset in px for a page with no bar (0), shadow: a selector for a host whose sections live in its
   shadow root }. A page outside the dashboard registers itself with jnAdd(key, cfg) after this file loads. A heading may also carry data-jn="Short name". */
const JN_PAGES = {
  compare:        { sel: '.cmp-ans-k0, .cmp-h', full: true },
  marketingspend: { sel: '.ms-eyebrow' },
  team:           { sel: '.section-label', label: el => { const t = (el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.textContent : el.textContent).trim(); return /^Leading/.test(t) ? 'The podium' : t; } },
  teamquad:       { sel: '.tp-q-h', full: true, label: el => el.textContent.replace(/\s*·.*$/, '') },
  staffweeks:     { sel: '.w13-grid', label: el => { const p = el.previousElementSibling; if (p && p.classList.contains('slv-eyebrow')) return p.textContent; return el.querySelector('.w13-card.beauty') ? 'Beauty' : 'Hair'; } },
  stafflevels:    { sel: '#stylistLevelsContent > section.slv-card', labels: ['The level', 'At this level'] },
  clients:        { sel: 'h3' },
  clientmix:      { sel: '#cmCards, .cm-two, #cmListTitle', labels: ['The mix', 'By item', 'The clients'] },
  lostclients:    { sel: '#lcBody > section.slv-card', labels: ['The totals', 'The client list'] },
  wvblast:        { sel: '#wvSendBox, #wvPerf, #wvHost > details.pf, #wvHost > .ll-panel', label: el => el.id === 'wvSendBox' ? 'Send a wave' : el.id === 'wvPerf' ? 'How it is doing' : el.matches('details') ? 'Waves' : 'How clients are chosen' },
  services:       { sel: '#srBody .w13-tiles, #srBody h3', labels: ['The numbers', 'Top services'] },
  products:       { sel: 'h3, .slv-eyebrow[style*="margin:18px"]' },
  supplierspend:  { sel: 'h2.s', shadow: '#spendContent', full: true, labels: ['Weekly spend by family', 'Every supplier', 'What Accounts paid'] },
  googleads:      { sel: 'h3' },
  website:        { sel: 'h3' },
  social:         { sel: 'h3' },
};

const JN_MIN = 2;   // a list of one is no list

function jnLabel(el, cfg, i) {
  let t = el.getAttribute('data-jn') || (cfg.labels && cfg.labels[i]) || (cfg.label ? cfg.label(el) : el.textContent);
  t = (t || '').replace(/\s+/g, ' ').trim();
  if (!cfg.full) t = t.split(/ · |: | – |, /)[0];
  if (t.length > 28) t = t.slice(0, 27).replace(/\s+\S*$/, '') + '…';
  return t;
}

function jnSlug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'section'; }

function jnBox(key) {
  const cfg = JN_PAGES[key];
  const box = document.querySelector(cfg.root || '#view-' + key);
  const host = box && cfg.shadow ? box.querySelector(cfg.shadow) : null;
  return { box, host, scope: cfg.shadow ? (host && host.shadowRoot) : box };
}

// The sections of a page as they stand now: visible headings, outside the rail, a table, a dialog or a folded card.
function jnSections(scope, cfg) {
  const out = [];
  scope.querySelectorAll(cfg.sel).forEach((el, i) => {
    if (!el.getClientRects().length) return;
    if (el.closest('.jn-rail, .lg-side, table, dialog, [hidden], [aria-hidden="true"], .modal, .ps-pop')) return;
    const label = jnLabel(el, cfg, i);
    if (label.length < 2) return;
    out.push({ el, label });
  });
  return out;
}

// Where the row goes: before the block that holds the first section, in the page's own content column (the first descendant with more than
// one child), so it sits under the title and the filters and above the first section, and is a sibling of every section it points at. When
// that block also holds the page title (a page drawn as one wrapper), it looks inside the block for the same spot.
function jnPlace(box, first) {
  const kids = n => [...n.children].filter(c => !c.classList.contains('jn-rail'));
  let root = box;
  for (let guard = 0; guard < 6; guard++) {
    while (kids(root).length === 1 && kids(root)[0] !== first && kids(root)[0].contains(first)) root = kids(root)[0];
    let block = first;
    while (block.parentElement && block.parentElement !== root) block = block.parentElement;
    if (block.parentElement !== root) return null;
    const title = [...block.querySelectorAll('h1, h2')].find(h => h !== first && (h.compareDocumentPosition(first) & 4));
    if (!title || block === first) return { root, block };
    root = block;
  }
  return null;
}

// A page that pins a bar of its own at the top says which, and the row pins under that bar.
function jnPinTop(rail, cfg) {
  const bar = cfg.below && document.querySelector(cfg.below);
  if (bar) rail.style.setProperty('--jn-top', Math.round(bar.getBoundingClientRect().height) + 'px');
  else if (cfg.top != null) rail.style.setProperty('--jn-top', cfg.top + 'px');
  else rail.setAttribute('data-track', '1');
  jnTrack();
}

// On the dashboard the row pins to the masthead's real lower edge, not to the height measured once at load: on a phone the masthead can
// stand shorter or taller than that number, and a row pinned too low leaves a strip of the page showing above it.
function jnTrack() {
  const tb = document.getElementById('topbar');
  if (!tb || getComputedStyle(tb).position !== 'fixed') return;
  const edge = Math.max(0, Math.round(tb.getBoundingClientRect().bottom)) + 'px';
  document.querySelectorAll('.jn-rail[data-track]').forEach(r => { if (r.style.getPropertyValue('--jn-top') !== edge) r.style.setProperty('--jn-top', edge); });
}
addEventListener('scroll', jnTrack, { passive: true });
addEventListener('resize', jnTrack);

function jnBuild(key) {
  const cfg = JN_PAGES[key];
  const { box, host, scope } = jnBox(key);
  if (!cfg || !box || !scope) return;
  const old = box.querySelector('.jn-rail');
  if (box.style.display === 'none' || !box.getClientRects().length) return;
  // A page that carries its own rail keeps it.
  if (box.querySelector('.lg-side, .side-nav:not(.jn-rail .side-nav)')) { if (old) old.remove(); return; }
  let secs = jnSections(scope, cfg);
  if (secs.length < JN_MIN && cfg.alt) secs = jnSections(scope, Object.assign({}, cfg, { sel: cfg.alt }));
  if (secs.length < JN_MIN) { if (old) old.remove(); return; }
  const used = {};
  secs.forEach(s => {
    if (!s.el.id || /^jn-/.test(s.el.id)) {
      let k = 'jn-' + key + '-' + jnSlug(s.label); used[k] = (used[k] || 0) + 1;
      if (used[k] > 1) k += '-' + used[k];
      s.el.id = k;
    }
    s.id = s.el.id;
  });
  const sig = secs.map(s => s.id + '|' + s.label).join('~');
  const spot = jnPlace(box, host || secs[0].el);
  if (!spot) return;
  if (old && old.getAttribute('data-sig') === sig && old.nextElementSibling === spot.block) return;
  if (old) old.remove();
  const rail = document.createElement('div');
  rail.className = 'jn-rail' + (cfg.pin === false ? '' : ' jn-pin');
  rail.setAttribute('data-sig', sig);
  rail.setAttribute('data-jn-key', key);
  jnPinTop(rail, cfg);
  const go = cfg.shadow ? s => `jnGoIn(event,'${key}','${s.id}')` : s => `lgJump(event,'${s.id}')`;
  // spy() lights .side-nav links by id in the document; a shadow root's sections are not in it, so that rail is not a .side-nav.
  rail.innerHTML = `<nav class="${cfg.shadow ? 'jn-nav' : 'side-nav'}" aria-label="On this page"><div class="side-k">On this page</div>${
    secs.map(s => `<a href="#${s.id}" onclick="${go(s)}">${jnEsc(s.label)}</a>`).join('')}</nav>`;
  spot.root.insertBefore(rail, spot.block);
  // The address carries the section (spy() writes it); read it back once, so a reload or a shared link lands there.
  if (!box._jnHash) {
    box._jnHash = 1;
    const h = decodeURIComponent((location.hash || '').slice(1));
    const t = h && /^jn-/.test(h) && !cfg.shadow && document.getElementById(h);
    if (t && box.contains(t)) setTimeout(() => lgJump(null, h), 400);
  }
  if (typeof spy === 'function') spy();
  if (typeof spy !== 'function' || cfg.shadow) jnLight();
}

// A section inside a shadow root (Supplier Spend) is not reachable by id from the document: the chip finds it in the host's root.
function jnGoIn(e, key, id) {
  if (e) e.preventDefault();
  const { scope } = jnBox(key);
  const el = scope && scope.getElementById(id);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - jnOffset(el), behavior: 'smooth' });
}

// Outside the dashboard, and for sections in a shadow root, nothing else lights the chip for the section in view.
function jnLight() {
  document.querySelectorAll('.jn-rail').forEach(r => {
    if (!r.getClientRects().length) return;
    const key = r.getAttribute('data-jn-key'), cfg = JN_PAGES[key], { scope } = jnBox(key);
    if (!scope || (typeof spy === 'function' && !cfg.shadow)) return;
    const line = jnOffset(r) + 16;
    let live = 0;
    const links = [...r.querySelectorAll('a')];
    links.forEach((a, i) => { const el = scope.getElementById ? scope.getElementById(a.getAttribute('href').slice(1)) : document.getElementById(a.getAttribute('href').slice(1)); if (el && el.getBoundingClientRect().top <= line) live = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === live));
  });
}
addEventListener('scroll', jnLight, { passive: true });

// Watch a page: build the row when it has drawn, and again each time it draws again.
function jnWatch(key) {
  const cfg = JN_PAGES[key];
  const timers = jnWatch.timers || (jnWatch.timers = {});
  const queue = () => { clearTimeout(timers[key]); timers[key] = setTimeout(() => { try { jnBuild(key); } catch (e) { /* the page is fine without it */ } }, 300); };
  const mine = n => n.nodeType !== 1 || n.classList.contains('jn-rail') || n.closest('.jn-rail');
  const ownOnly = recs => recs.every(m => (m.target.closest && m.target.closest('.jn-rail'))
    || ([...m.addedNodes, ...m.removedNodes].length && [...m.addedNodes, ...m.removedNodes].every(mine)));
  const box = document.querySelector(cfg.root || '#view-' + key);
  if (!box) return;
  const contentWatch = new MutationObserver(recs => { if (!ownOnly(recs)) queue(); });
  contentWatch.observe(box, { childList: true, subtree: true });
  // The view is shown and hidden by its own style; a page that kept its content while hidden needs the row when it is shown again.
  new MutationObserver(queue).observe(box, { attributes: true, attributeFilter: ['style'] });
  // A page drawn in a shadow root (Supplier Spend) is invisible to the observer above, and its root is made on first draw, with no change
  // to the light DOM to say so: look for the root once a second until it is there, then watch it.
  if (cfg.shadow) {
    const hook = () => {
      const { host } = jnBox(key);
      if (!host || !host.shadowRoot) return false;
      if (!host._jnWatched) { host._jnWatched = 1; contentWatch.observe(host.shadowRoot, { childList: true, subtree: true }); queue(); }
      return true;
    };
    if (!hook()) { const poll = setInterval(() => { if (hook()) clearInterval(poll); }, 1000); }
  }
  queue();
}

function jnAdd(key, cfg) { JN_PAGES[key] = cfg; jnWatch(key); }

Object.keys(JN_PAGES).forEach(jnWatch);
addEventListener('resize', () => document.querySelectorAll('.jn-rail').forEach(r => {
  const cfg = JN_PAGES[r.getAttribute('data-jn-key')];
  if (cfg) jnPinTop(r, cfg);
}));
