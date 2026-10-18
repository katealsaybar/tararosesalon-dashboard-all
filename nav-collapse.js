/* ══════════════════════════════════════════════════════════════
   SIDEBAR: COLLAPSIBLE SECTIONS
   Kate, 24 Sep 2026: "for major sections like org pulse, ledgers, google
   reviews, can we have the option to collapse and expand it".

   Two kinds of fold, both built from the markup that is already there, so a
   new nav item needs no extra wiring:

     Section titles   every .nav-title (DASHBOARDS, LEDGERS, PERFORMANCE,
                      REVIEWS, ADMIN) folds the items under it.
     Parent items     any .nav-sub followed by .lvl2 items (Organisation Pulse,
                      over Branch Performance and Comparison) gets its own small
                      arrow. The arrow folds; the label still navigates.

   Everything starts open. What you fold is remembered per browser. The page
   you are on is never hidden: showView() is wrapped so that landing on a page
   inside a folded section (a deep link, the Pulse's "Open Branch Performance"
   link) opens that section again.
   ══════════════════════════════════════════════════════════════ */
(function () {
  const KEY = 'trsNavFolded';
  let folded = {};
  try { folded = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { folded = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(folded)); } catch (e) {} };
  // Kate, 18 Oct 2026: "Campaigns" is a new group (Lost Clients and the two Wellness Voucher pages). The name was an older group's, and a browser
  // that folded that one would open this one shut. Once, per browser, it opens; after that it remembers like the rest.
  if (!folded['once:campaigns-18oct']) { delete folded['g:Campaigns']; folded['once:campaigns-18oct'] = 1; save(); }

  const aside = document.querySelector('aside.sidebar');
  if (!aside) return;

  // ── The glide (Kate, 14 Oct 2026: "make clicking transitions smooth, sa pag close open") ──
  // Folding used to flip display:none, so a section just vanished. Now the rows slide shut (height, padding, margin and
  // opacity together) and the display:none lands when they have finished, and on the way open they slide out from nothing.
  // Only a click animates: the first paint and a deep link's reveal still set the state straight away. A fold in motion
  // ignores a second click until it lands, and prefers-reduced-motion skips the animation altogether.
  const REDUCE = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const DUR = 240, EASE = 'cubic-bezier(.4,0,.2,1)';
  const shown = el => getComputedStyle(el).display !== 'none';
  const measure = el => { const cs = getComputedStyle(el); return { height: el.offsetHeight + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: 1 }; };
  const ZERO = { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0 };
  // els(): the rows that move. flip(open): sets the classes that really show or hide them (and the chevron).
  // Web Animations rather than CSS transitions, so opening does not depend on the browser having drawn the rows once
  // at their closed size; a timer finishes the fold either way (a hidden tab pauses animations, not timers).
  function glide(owner, els, flip, open) {
    if (owner._gliding) return;
    if (REDUCE.matches || !Element.prototype.animate) { flip(open); return; }
    owner._gliding = true;
    let list;
    if (open) { flip(true); list = els().filter(shown); } else { list = els().filter(shown); }
    if (!list.length) { if (!open) flip(false); owner._gliding = false; return; }
    const full = list.map(measure);
    const anims = list.map((el, i) => {
      el.style.overflow = 'hidden';
      return el.animate(open ? [ZERO, full[i]] : [full[i], ZERO], { duration: DUR, easing: EASE, fill: open ? 'none' : 'forwards' });
    });
    setTimeout(() => {
      if (!open) flip(false);
      anims.forEach(a => { try { a.cancel(); } catch (e) {} });
      list.forEach(el => { el.style.overflow = ''; });
      owner._gliding = false;
    }, DUR + 30);
  }

  // ── Section titles ──
  aside.querySelectorAll('.nav-group').forEach(group => {
    const title = group.querySelector(':scope > .nav-title');
    if (!title) return;
    const id = 'g:' + title.textContent.trim();
    title.classList.add('nav-fold');
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    const set = open => {
      group.classList.toggle('folded', !open);
      title.setAttribute('aria-expanded', String(open));
    };
    set(!folded[id]);
    const toggle = () => {
      if (group._gliding) return;
      const open = group.classList.contains('folded') && !group.classList.contains('folding');
      if (open) delete folded[id]; else folded[id] = 1;
      save();
      title.setAttribute('aria-expanded', String(open));
      // 'folding' turns the chevron at once; 'folded' (display:none on the rows) lands when the glide has finished
      group.classList.toggle('folding', !open);
      glide(group, () => [...group.children].filter(c => c !== title), o => { group.classList.toggle('folded', !o); group.classList.remove('folding'); }, open);
    };
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  // ── Subheads inside a section (Numbers: Business, Team Performance, Clients, Sales & Stock) ──
  // Kate, 9 Oct 2026: "diff color pls, should also be collapsible". Each subhead folds the pages up to the next
  // subhead, remembered with the rest, and takes a tone (0 to 3, in the order they appear) that nav-style.css
  // colours: the label, the rule beside it and the rule beside its pages, so the groups read apart at a glance.
  aside.querySelectorAll('.nav-subhead').forEach((head, hi) => {
    const kids = [];
    for (let n = head.nextElementSibling; n && !n.classList.contains('nav-subhead'); n = n.nextElementSibling) kids.push(n);
    const tone = String(hi % 4);
    head.dataset.tone = tone;
    kids.forEach(k => { k.dataset.tone = tone; });
    const id = 'h:' + head.textContent.trim();
    head.classList.add('nav-sh');
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    const set = open => {
      kids.forEach(k => k.classList.toggle('nav-sh-hidden', !open));
      head.classList.toggle('sh-folded', !open);
      head.setAttribute('aria-expanded', String(open));
    };
    set(!folded[id]);
    const toggle = () => {
      const open = head.classList.contains('sh-folded');
      if (head._gliding) return;
      if (open) delete folded[id]; else folded[id] = 1;
      save();
      head.classList.toggle('sh-folded', !open);           // the chevron turns at once
      head.setAttribute('aria-expanded', String(open));
      glide(head, () => kids, o => kids.forEach(k => k.classList.toggle('nav-sh-hidden', !o)), open);
    };
    head.addEventListener('click', e => { e.stopPropagation(); toggle(); });
    head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    head._navSubSet = open => { set(open); if (open) { delete folded[id]; save(); } };
    kids.forEach(k => { k._navSubhead = head; });
  });

  // ── Parent items (a .nav-sub with .lvl2 items straight after it) ──
  aside.querySelectorAll('.nav-sub:not(.lvl2):not(.lvl3):not(.lvl4)').forEach(parent => {
    const kids = [];
    for (let n = parent.nextElementSibling; n && n.classList.contains('lvl2'); n = n.nextElementSibling) kids.push(n);
    if (!kids.length) return;
    const id = 'p:' + parent.textContent.trim();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-kids-btn';
    parent.classList.add('has-kids');
    parent.appendChild(btn);
    const set = open => {
      kids.forEach(k => k.classList.toggle('nav-kid-hidden', !open));
      parent.classList.toggle('kids-folded', !open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', (open ? 'Hide ' : 'Show ') + kids.map(k => k.textContent.trim()).join(' and '));
    };
    set(!folded[id]);
    btn.addEventListener('click', e => {
      // The arrow folds, it does not navigate, and on a narrow screen it must
      // not close the panel either (the aside's own click handler would).
      e.stopPropagation();
      const open = parent.classList.contains('kids-folded');
      if (parent._gliding) return;
      if (open) delete folded[id]; else folded[id] = 1;
      save();
      parent.classList.toggle('kids-folded', !open);       // the arrow turns at once
      btn.setAttribute('aria-expanded', String(open));
      glide(parent, () => kids, o => kids.forEach(k => k.classList.toggle('nav-kid-hidden', !o)), open);
    });
    parent._navKidsSet = open => { set(open); if (open) { delete folded[id]; save(); } };
    kids.forEach(k => { k._navParent = parent; });
  });

  // ── Never hide the page you are on ──
  function revealActive() {
    const act = aside.querySelector('.nav-sub.active');
    if (!act) return;
    const group = act.closest('.nav-group');
    const title = group && group.querySelector(':scope > .nav-title');
    if (group && group.classList.contains('folded') && title) title.click();
    const p = act._navParent;
    if (p && p.classList.contains('kids-folded') && p._navKidsSet) p._navKidsSet(true);
    const sh = act._navSubhead || (p && p._navSubhead);
    if (sh && sh.classList.contains('sh-folded') && sh._navSubSet) sh._navSubSet(true);
  }
  if (typeof window.showView === 'function') {
    const orig = window.showView;
    window.showView = function () {
      const r = orig.apply(this, arguments);
      revealActive();
      return r;
    };
  }
  revealActive();
})();
