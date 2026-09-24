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

  const aside = document.querySelector('aside.sidebar');
  if (!aside) return;

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
      const open = group.classList.contains('folded');
      set(open);
      if (open) delete folded[id]; else folded[id] = 1;
      save();
    };
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
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
      set(open);
      if (open) delete folded[id]; else folded[id] = 1;
      save();
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
