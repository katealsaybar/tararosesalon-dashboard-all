/* ============================================================
   TARA ROSE SALONS: Team Home, shared script (Kate, 1 Oct 2026)
   hub.js: sign-in check, header (search + account menu), theme.

   Who sees what (Kate, 1 Oct 2026): kb_access() in Supabase
   (migrations/kb_access_levels.sql) returns this person's level (1 staff, 2
   leadership, 3 executives and marketing, 4 accounts and admin, 5 owner) and the
   section keys they may open. The kb_pages policy applies the same rule in the
   database, so this file only draws what it is told. The page text is in kb_pages,
   so this file holds no content at all: the repo is public.
   Needs supabase-js and ../auth.js loaded first.
   ============================================================ */
(function () {
  var c = TRSAuth.client();
  var KB = window.KB = { client: c, role: null, name: null, email: null };

  // The sections. The keys match kb_sections in Supabase, which decides who opens what;
  // `live` is for sections that link out rather than holding pages (a section with
  // pages in kb_pages is live on its own).
  // Kate, 6 Oct 2026: grouped by what you came to do, not by department. One front door:
  // the Today, Numbers, Content and People rows that point into the dashboard are
  // shortcuts (`via: 'dashboards'`), shown to whoever may open the dashboard and is at
  // `min` level or above. They hold no data; the dashboard and the database still
  // decide what each person can read.
  KB.GROUPS = ['The Tara Rose Way', 'Me', 'Learn', 'Today', 'Numbers', 'Content', 'People', 'Admin'];
  KB.SECTIONS = [
    // Kate, 5 Oct 2026: Tara's Full Loop handover site (kb_sections min_level 3).
    // 6 Oct 2026: its own group again, at the top, Level 3 and up.
    { key: 'full-loop', dept: 'The Tara Rose Way', title: 'Service Playbooks', href: '/hub/full-loop', live: true, rule: 'var(--accent-mint)',
      blurb: 'Blonde, brunette, cut, treatments, beauty and home care, with the Low, Mid and High decoder, the Menu Builder and the Handover Tracker.' },

    { key: 'hr-forms', dept: 'Me', title: 'HR Forms & Waivers', href: '/hub/forms', live: true, rule: 'var(--accent-butter)',
      blurb: 'Leave, probation and return-to-work forms; client waivers and consultation forms.' },

    { key: 'hair-sop', dept: 'Learn', title: 'Hair SOPs', rule: 'var(--accent-lavender)',
      blurb: 'Every foundation cut, step by step, plus the backwash, the 8-Step Hair Plan, the client journey and stylist standards.' },
    { key: 'hair-induction', dept: 'Learn', title: 'Hair Induction & Onboarding', rule: 'var(--accent-butter)',
      blurb: 'The induction programme for stylists and hair assistants.' },
    { key: 'beauty-sop', dept: 'Learn', title: 'Beauty SOPs', rule: 'var(--accent-mint)',
      blurb: 'Every beauty treatment, step by step: hands and feet, facials, face and body, plus hygiene and room set-up.' },
    { key: 'beauty-induction', dept: 'Learn', title: 'Beauty Induction & Onboarding', rule: 'var(--accent-butter)',
      blurb: 'The induction programme for the beauty team.' },
    { key: 'front-desk', dept: 'Learn', title: 'Front Desk & Policies', rule: 'var(--accent-coral)',
      blurb: 'The front desk manual, booking and deposit policy, cancellations.' },
    { key: 'front-desk-induction', dept: 'Learn', title: 'Front Desk Induction & Onboarding', rule: 'var(--accent-butter)',
      blurb: 'The induction programme for reception.' },
    // Kate, 5 Oct 2026: the Call Centre Team. Level 2 and up for now; no staff list maps
    // anyone to 'Call Centre' yet, so no Level 1 sees it.
    { key: 'call-centre', dept: 'Learn', title: 'Call Centre Scripts & Policies', rule: 'var(--accent-lavender)',
      blurb: 'Call and WhatsApp scripts, booking follow-ups and lead handling.' },
    { key: 'call-centre-induction', dept: 'Learn', title: 'Call Centre Induction & Onboarding', rule: 'var(--accent-butter)',
      blurb: 'The induction programme for the call centre team.' },

    { key: 'today-targets', via: 'dashboards', min: 1, ic: 'today', dept: 'Today', title: 'Daily Target Sheet', href: '/?view=ledgerTargets', rule: 'var(--accent-coral)',
      blurb: 'Each branch against today’s target.' },
    { key: 'today-stylist', via: 'dashboards', min: 1, ic: 'today', dept: 'Today', title: 'Daily Stylist Target', href: '/?view=ledgerStylist', rule: 'var(--accent-coral)',
      blurb: 'Each stylist against today’s aim.' },
    { key: 'today-actuals', via: 'dashboards', min: 1, ic: 'today', dept: 'Today', title: 'Actuals vs Targets', href: '/?view=ledgerActuals', rule: 'var(--accent-coral)',
      blurb: 'The month so far, against target.' },

    { key: 'dashboards', dept: 'Numbers', title: 'Business', href: '/?view=dashboard', live: true, rule: 'var(--accent-lavender)',
      blurb: 'Organisation Pulse, branch performance, comparison and financial totals.' },
    { key: 'numbers-team', via: 'dashboards', min: 1, ic: 'access', dept: 'Numbers', title: 'Team Performance', href: '/?view=team', rule: 'var(--accent-lavender)',
      blurb: 'Podium race, staff quadrant, benchmarks, quarterly performance and stylist levels.' },
    { key: 'numbers-clients', via: 'dashboards', min: 1, ic: 'lost-clients', dept: 'Numbers', title: 'Clients', href: '/?view=clients', rule: 'var(--accent-lavender)',
      blurb: 'Top clients, lost clients and Google reviews.' },
    { key: 'numbers-sales', via: 'dashboards', min: 1, ic: 'dashboards', dept: 'Numbers', title: 'Sales & Stock', href: '/?view=services', rule: 'var(--accent-lavender)',
      blurb: 'Service rankings and products.' },

    // Kate, 5 Oct 2026: Tara's marketing workspace from her Full Loop handover, as she built it.
    { key: 'marketing', dept: 'Content', title: 'Marketing Workspace', href: '/hub/marketing', live: true, rule: 'var(--accent-coral)',
      blurb: 'Today’s tasks, the campaign calendar and platform checks.' },
    { key: 'post-approvals', via: 'dashboards', min: 3, ic: 'approvals', dept: 'Content', title: 'Post Approvals', href: 'https://katealsaybar.github.io/smm_board_approvals/', rule: 'var(--accent-coral)',
      blurb: 'Posts waiting for a yes, with comments.' },
    // Kate, 6 Oct 2026: named as in the dashboard sidebar (Marketing & Campaigns).
    { key: 'content-ads', via: 'dashboards', min: 3, ic: 'marketing', dept: 'Content', title: 'Google Ads', href: '/?view=googleads', rule: 'var(--accent-coral)',
      blurb: 'Spend, clicks and leads from Google Ads.' },
    { key: 'content-web', via: 'dashboards', min: 3, ic: 'dashboards', dept: 'Content', title: 'Website & Search', href: '/?view=website', rule: 'var(--accent-coral)',
      blurb: 'Website visits and how people find us on Google.' },
    { key: 'campaigns', dept: 'Content', title: 'Wellness Voucher Performance', href: '/?view=wvperf', live: true, rule: 'var(--accent-coral)',
      blurb: 'Wellness Voucher performance.' },

    { key: 'people-orgchart', via: 'dashboards', min: 1, ic: 'people', dept: 'People', title: 'Org Chart', href: '/?view=orgchart', rule: 'var(--accent-mint)',
      blurb: 'Who is who, and who reports to whom.' },
    { key: 'people-cards', via: 'dashboards', min: 1, ic: 'access', dept: 'People', title: 'Staff Cards', href: '/?view=stylists', rule: 'var(--accent-mint)',
      blurb: 'Every stylist and therapist, with photo and level.' },
    // Kate, 3 Oct 2026: who can sign in, for Level 3 and up (kb_sections.min_level 3), view only.
    { key: 'access', dept: 'People', title: 'Staff Roster & Access', href: '/hub/roster', live: true, rule: 'var(--accent-mint)',
      blurb: 'Everyone who can sign in: their level, team and when they were last in.' },

    { key: 'uploads', dept: 'Admin', title: 'Upload Portal', href: '/upload/', live: true, rule: 'var(--accent-mint)',
      blurb: 'Payslips, and the uploads that feed the dashboard.' }
  ];
  // A shortcut row shows when its `via` section is open to this person and they are at
  // its `min` level; every other row when kb_access() opened its own key.
  KB.opens = function (s) {
    if (s.via) return KB.allowed.indexOf(s.via) >= 0 && KB.level >= (s.min || 1);
    return KB.allowed.indexOf(s.key) >= 0;
  };
  KB.LEVELS = { 1: 'Team', 2: 'Leadership', 3: 'Executives & Marketing', 4: 'Accounts & Admin', 5: 'Backend' };
  // The "View as" choices, and the key they live under (this browser only).
  KB.VIEW_AS = [
    { v: '5', label: 'Level 5 · Backend (you)' },
    { v: '4', label: 'Level 4 · Accounts & Admin' },
    { v: '3', label: 'Level 3 · Executives & Marketing' },
    { v: '2', label: 'Level 2 · Leadership' },
    { v: '1|Front Desk', label: 'Level 1 · Team, Front Desk' },
    { v: '1|Hair', label: 'Level 1 · Team, Hair' },
    { v: '1|Beauty', label: 'Level 1 · Team, Beauty' }
  ];
  KB.readViewAs = function () {
    try {
      var v = JSON.parse(localStorage.getItem('trs-viewas') || 'null');
      if (v && v.level >= 1 && v.level <= 4) return v;
    } catch (e) {}
    return null;
  };
  KB.setViewAs = function (v) {
    var parts = String(v || '5').split('|'), lv = +parts[0];
    try {
      if (lv >= 1 && lv <= 4) localStorage.setItem('trs-viewas', JSON.stringify({ level: lv, dept: parts[1] || null }));
      else localStorage.removeItem('trs-viewas');
    } catch (e) {}
    location.reload();
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  KB.esc = esc;

  // Kate, 5 Oct 2026: line icons (24px grid, drawn in the text colour on a tint of the
  // section's colour), in place of the 3D Canva illustrations, which read as AI-made.
  // A section without one keeps its initials. Moved here 6 Oct 2026 so every page can
  // show its section's icon beside the title (KB.titleIcon).
  var CAP = '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v5"/>';
  var ICONS = KB.ICONS = {
    'my-numbers': '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    suggestions: '<path d="M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z"/>',
    dashboards: '<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/>',
    campaigns: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6"/><path d="M19 6.5a8 8 0 0 1 0 11"/>',
    access: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.5a6.5 6.5 0 0 1 3 5.5"/>',
    'lost-clients': '<circle cx="10" cy="8" r="4"/><path d="M3 20a7 7 0 0 1 14 0"/><path d="M17 11h5"/>',
    'hair-sop': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="M14.5 14.5 20 20"/><path d="M8.1 8.1 12 12"/>',
    'beauty-sop': '<rect x="7" y="10" width="10" height="11" rx="2"/><path d="M9 10V7h6v3"/><path d="M10.5 7V3h3v4"/>',
    'front-desk': '<path d="M3 18h18"/><path d="M5 18a7 7 0 0 1 14 0"/><path d="M12 11V8"/><path d="M10 8h4"/>',
    'call-centre': '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19a3 3 0 0 1-3 3h-3"/>',
    marketing: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    'full-loop': '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>',
    'hr-forms': '<path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="2.5" width="6" height="3" rx="1"/><path d="M9 12h6"/><path d="M9 16h4"/>',
    uploads: '<path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    today: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    approvals: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    people: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    'hair-induction': CAP, 'beauty-induction': CAP, 'front-desk-induction': CAP, 'call-centre-induction': CAP
  };
  var ICON_RULE = { suggestions: 'var(--accent-butter)', 'my-numbers': 'var(--accent-mint)' };
  KB.icon = function (key, rule) {
    if (!ICONS[key]) return '';
    if (!rule) { var sec = KB.SECTIONS.filter(function (x) { return x.key === key; })[0]; rule = (sec && sec.rule) || ICON_RULE[key] || 'var(--accent-mint)'; }
    return '<span class="kb-ic kb-ic-line" style="--c:' + rule + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + ICONS[key] + '</svg></span>';
  };
  // Kate, 6 Oct 2026: for pages whose headings someone else's app draws (Marketing,
  // Service Playbooks): every <h1> that appears gets the icon, on each redraw too.
  KB.iconTitles = function (key, rule) {
    var ic = KB.icon(key, rule);
    if (!ic) return;
    function tag() {
      document.querySelectorAll('h1').forEach(function (h) {
        if (h.firstElementChild && h.firstElementChild.classList.contains('kb-ic')) return;
        var span = document.createElement('span');
        while (h.firstChild) span.appendChild(h.firstChild);
        h.innerHTML = ic; h.appendChild(span); h.classList.add('kb-has-ic');
      });
    }
    tag();
    new MutationObserver(tag).observe(document.body, { childList: true, subtree: true });
  };
  // A page title with its section's icon in front: <h2 class="kb-page-title kb-has-ic">.
  KB.titleIcon = function (key, html, cls) {
    var ic = KB.icon(key);
    return '<h2 class="' + (cls || 'kb-page-title') + (ic ? ' kb-has-ic' : '') + '">' + ic + (ic ? '<span>' + html + '</span>' : html) + '</h2>';
  };


  // Kate, 3 Oct 2026: a <select> drawn as the dashboard's soft pill menu (spfDD in
  // index.html), so a dropdown looks the same wherever it is on the site. The select
  // stays, hidden, and keeps the value and its 'change' event; sel._ddPaint() redraws
  // the label after the value is set in code.
  KB.pillDD = function (sel) {
    var wrap = document.createElement('span');
    wrap.className = 'kb-dd';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    var btn = document.createElement('button'), menu = document.createElement('div');
    btn.type = 'button'; btn.className = 'kb-dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
    menu.className = 'kb-dd-menu'; menu.setAttribute('role', 'listbox');
    wrap.appendChild(btn); wrap.appendChild(menu);
    function close() { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    function paint() {
      var cur = sel.options[sel.selectedIndex];
      btn.innerHTML = '<span>' + esc(cur ? cur.text : '') + '</span><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      wrap.classList.toggle('on', !!sel.value);
      menu.innerHTML = [].map.call(sel.options, function (o) {
        var on = o.value === sel.value;
        return '<button type="button" role="option" data-v="' + esc(o.value) + '" aria-selected="' + on + '"' + (on ? ' class="on"' : '') + '>' + esc(o.text) + '</button>';
      }).join('');
    }
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      close(); btn.focus();
      if (sel.value !== b.dataset.v) { sel.value = b.dataset.v; paint(); sel.dispatchEvent(new Event('change')); }
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !wrap.classList.contains('open');
      document.querySelectorAll('.kb-dd.open').forEach(function (w) { w.classList.remove('open'); });
      wrap.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (!open) return;
      // Hangs from the left edge; flips to the right edge if it would run off the screen.
      menu.style.left = ''; menu.style.right = '';
      if (menu.getBoundingClientRect().right > innerWidth - 8) { menu.style.left = 'auto'; menu.style.right = '0'; }
      (menu.querySelector('.on') || menu.firstChild).focus();
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); btn.focus(); return; }
      if (!wrap.classList.contains('open') || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      var bs = [].slice.call(menu.children), i = bs.indexOf(document.activeElement);
      bs[e.key === 'ArrowDown' ? Math.min(i + 1, bs.length - 1) : Math.max(i - 1, 0)].focus();
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    sel._ddPaint = paint;
    paint();
    return wrap;
  };

  // ── Theme: the dashboard's own setting (trs-theme), so the two always match.
  function theme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  KB.toggleTheme = function () {
    var next = theme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('trs-theme', next); } catch (e) {}
    var b = document.getElementById('kbThemeBtn');
    if (b) b.textContent = next === 'dark' ? 'Light mode' : 'Dark mode';
  };

  // ── Sign-in check. No session, or not on either list: the dashboard's sign-in
  // card, which sends people back here afterwards (?next=).
  KB.ready = (async function () {
    var back = '/?next=' + encodeURIComponent(location.pathname + location.search);
    var s = (await c.auth.getSession()).data.session;
    if (!s) { location.replace(back); return new Promise(function () {}); }
    var r = await c.rpc('kb_access');
    if (r.error || !r.data) { location.replace(back); return new Promise(function () {}); }
    KB.access = r.data;
    KB.level = r.data.level;
    KB.allowed = r.data.sections || [];
    KB.myLink = r.data.my_link || null;
    KB.isStaff = KB.level === 1;
    // Kate, 2 Oct 2026: "View as". Level 5 can preview Team Home (and the dashboard
    // sidebar, which reads the same key) as another level. kb_access_as() answers
    // for Level 5 only; this changes what is drawn, never what Kate can open.
    KB.realLevel = KB.level;
    KB.viewAs = null;
    if (KB.realLevel === 5) {
      var va = KB.readViewAs();
      if (va) {
        var p = await c.rpc('kb_access_as', { p_level: va.level, p_dept: va.dept || null });
        if (!p.error && p.data) {
          KB.viewAs = va;
          KB.level = p.data.level;
          KB.allowed = p.data.sections || [];
          KB.isStaff = KB.level === 1;
          KB.myLink = p.data.my_link || null;   // Level 1 Hair: Kate Siryk's, as the sample stylist
          KB.access = Object.assign({}, KB.access, { dept: p.data.dept, scope: null });
        }
      }
    }
    // Kate, 5 Oct 2026: a Level 1 preview also hides the leadership-only pages inside an
    // open section (audience 'manager', like the trade test). The database already hides
    // them from real staff, but Kate is Level 5, so without this the preview showed them.
    KB.hidden = [];
    if (KB.viewAs && KB.level < 2) {
      var m = await c.from('kb_pages').select('slug').eq('audience', 'manager');
      KB.hidden = (m.data || []).map(function (x) { return x.slug; });
    }
    KB.shows = function (slug) { return KB.hidden.indexOf(slug) < 0; };
    KB.email = s.user && s.user.email;
    var n = await c.rpc('kb_me');
    KB.name = (!n.error && n.data) || '';
    drawHeader();
    document.body.classList.remove('kb-wait');
    return KB;
  })();

  // Favourites (Kate, 1 Oct 2026): one row per star in kb_favourites. A section card is
  // its key ('beauty-sop'); a single page inside a section is 'p:' + its slug, so every
  // page can be starred too and all of them show at the top of Team Home.
  KB.favs = null;
  KB.loadFavs = async function () {
    if (KB.favs) return KB.favs;
    KB.favs = {};
    var f = await c.from('kb_favourites').select('section');
    (f.data || []).forEach(function (x) { KB.favs[x.section] = true; });
    return KB.favs;
  };
  // Flips the star straight away, saves, and puts it back if the save fails.
  KB.toggleFav = async function (k, repaint) {
    var was = !!KB.favs[k];
    if (was) delete KB.favs[k]; else KB.favs[k] = true;
    repaint();
    var res = was ? await c.from('kb_favourites').delete().eq('section', k)
                  : await c.from('kb_favourites').insert({ section: k });
    if (res.error) { if (was) KB.favs[k] = true; else delete KB.favs[k]; repaint(); }
  };
  KB.starBtn = function (k, title) {
    var on = !!(KB.favs && KB.favs[k]);
    return '<button type="button" class="kb-star' + (on ? ' on' : '') + '" data-k="' + esc(k) + '" aria-pressed="' + on + '"' +
      ' aria-label="' + (on ? 'Remove ' : 'Add ') + esc(title) + (on ? ' from' : ' to') + ' favourites" title="' + (on ? 'In your favourites' : 'Add to favourites') + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/></svg></button>';
  };

  KB.signOut = async function () {
    await c.auth.signOut();
    try { localStorage.removeItem('trsRole'); } catch (e) {}
    location.replace('/');
  };

  // ── Header: brand, title, search, account.
  function drawHeader() {
    var h = document.getElementById('kbHead');
    if (!h) return;
    var first = (KB.name || '').split(/[\s(]/)[0];
    var initials = (KB.name || KB.email || '?').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    h.innerHTML =
      '<a class="kb-brand" href="/hub/" aria-label="Team Home">' +
        '<img class="kb-logo-light" src="/assets/mast-ink.png" alt="Tara Rose">' +
        '<img class="kb-logo-dark" src="/assets/mast-paper.png" alt="Tara Rose">' +
        '<span>Salons</span></a>' +
      '<div class="kb-titles"><span class="kb-eyebrow">Knowledge Base</span><h1>' + esc(h.dataset.title || 'Team Home') + '</h1></div>' +
      '<div class="kb-head-r"><div class="kb-search-wrap"><div class="kb-search">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input type="search" id="kbSearch" placeholder="Find a treatment, policy or how-to" autocomplete="off" aria-label="Find a treatment, policy or how-to"></div>' +
        '<div class="kb-results" id="kbResults" role="listbox"></div></div>' +
      '<div class="kb-account">' +
        '<button class="kb-account-btn" id="kbAccountBtn" aria-haspopup="true" aria-expanded="false">' +
          '<span class="kb-avatar">' + esc(initials) + '</span><span class="kb-name">' + esc(first || 'Account') + '</span>' +
          '<svg class="kb-caret" width="10" height="7" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<div class="kb-menu hide" id="kbMenu">' +
          '<div class="kb-menu-who"><b>' + esc(KB.name || 'Signed in') + '</b><span>' + esc(KB.email || '') + '</span>' +
            // Kate, 2 Oct 2026: the level line is Level 5's alone; nobody else sees a level.
            (KB.realLevel === 5 ? '<em class="kb-menu-lvl">Level 5 · ' + esc(KB.LEVELS[5]) + '</em>' : '') + '</div>' +
          // Kate, 2 Oct 2026: our own list, not the browser's select box (it looked out of place).
          (KB.realLevel === 5 ? (function () {
            var cur = KB.viewAs ? KB.viewAs.level + (KB.viewAs.dept ? '|' + KB.viewAs.dept : '') : '5';
            var curLabel = (KB.VIEW_AS.find(function (o) { return o.v === cur; }) || KB.VIEW_AS[0]).label;
            return '<div class="kb-menu-viewas"><button type="button" class="kb-va-toggle" id="kbViewAsBtn" aria-expanded="false" aria-controls="kbViewAsList">' +
              '<span class="kb-va-k">View as</span><span class="kb-va-cur">' + esc(curLabel.replace(' (you)', '')) + '</span>' +
              '<svg width="10" height="7" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
              '<div class="kb-va-list hide" id="kbViewAsList" role="listbox" aria-label="View as">' +
              KB.VIEW_AS.map(function (o) {
                return '<button type="button" role="option" data-v="' + esc(o.v) + '" aria-selected="' + (o.v === cur) + '"' +
                  (o.v === cur ? ' class="on"' : '') + '>' + esc(o.label) + '</button>';
              }).join('') + '</div></div>';
          })() : '') +
          (KB.allowed.indexOf('dashboards') >= 0 ? '<a href="/dashboard/">Open the dashboard</a>' : '') +
          (KB.myLink ? '<a href="' + esc(KB.myLink) + '">My numbers &amp; payslip</a>' : '') +

          '<button id="kbThemeBtn" type="button">' + (theme() === 'dark' ? 'Light mode' : 'Dark mode') + '</button>' +
          '<button id="kbSignOut" type="button">Sign out</button>' +
        '</div></div></div>';

    var btn = document.getElementById('kbAccountBtn'), menu = document.getElementById('kbMenu');
    btn.onclick = function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('hide') === false;
      btn.setAttribute('aria-expanded', open);
    };
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target)) { menu.classList.add('hide'); btn.setAttribute('aria-expanded', 'false'); }
    });
    var vaBtn = document.getElementById('kbViewAsBtn'), vaList = document.getElementById('kbViewAsList');
    if (vaBtn) {
      vaBtn.onclick = function () {
        var open = vaList.classList.toggle('hide') === false;
        vaBtn.setAttribute('aria-expanded', open);
      };
      vaList.onclick = function (e) {
        var b = e.target.closest('button[data-v]');
        if (b && !b.classList.contains('on')) KB.setViewAs(b.dataset.v);
      };
    }
    if (KB.viewAs) {
      var bar = document.createElement('div');
      bar.className = 'kb-viewas-bar';
      bar.innerHTML = '<span>Viewing as <b>Level ' + KB.level + ' · ' + esc(KB.LEVELS[KB.level] || '') +
        (KB.viewAs.dept ? ', ' + esc(KB.viewAs.dept) : '') + '</b></span><button type="button">Back to my view</button>';
      bar.querySelector('button').onclick = function () { KB.setViewAs('5'); };
      h.insertAdjacentElement('afterend', bar);
    }
    document.getElementById('kbThemeBtn').onclick = KB.toggleTheme;
    document.getElementById('kbSignOut').onclick = KB.signOut;
    wireSearch();
  }

  // ── Search: kb_search() runs as the signed-in person, so it only ever returns
  // pages they are allowed to read.
  function highlight(text, q) {
    var out = esc(text);
    q.trim().split(/\s+/).filter(function (w) { return w.length > 1; }).forEach(function (w) {
      out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return out;
  }
  function wireSearch() {
    var input = document.getElementById('kbSearch'), box = document.getElementById('kbResults');
    var timer = null, items = [], active = -1, seq = 0;
    function close() { box.classList.remove('open'); box.innerHTML = ''; active = -1; }
    function paint(q) {
      if (!items.length) { box.innerHTML = '<div class="kb-empty">Nothing matches “' + esc(q) + '”.</div>'; box.classList.add('open'); return; }
      box.innerHTML = items.map(function (it, i) {
        return '<a class="kb-result' + (i === active ? ' active' : '') + '" role="option" href="/hub/kb.html?p=' + encodeURIComponent(it.slug) + '">' +
          '<div class="kb-result-group">' + esc(it.group_name || '') + '</div>' +
          '<div class="kb-result-title">' + highlight(it.title, q) + '</div>' +
          (it.snippet ? '<div class="kb-result-snip">…' + highlight(it.snippet, q) + '…</div>' : '') + '</a>';
      }).join('');
      box.classList.add('open');
    }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      timer = setTimeout(async function () {
        var mine = ++seq;
        var r = await c.rpc('kb_search', { q: q });
        if (mine !== seq) return;            // a newer search has gone out
        items = r.error ? [] : (r.data || []);
        if (KB.viewAs) items = items.filter(function (it) { return KB.allowed.indexOf(it.section) >= 0 && KB.shows(it.slug); });
        active = -1; paint(q);
      }, 220);
    });
    input.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); paint(input.value.trim()); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(input.value.trim()); }
      else if (e.key === 'Enter' && items[Math.max(active, 0)]) { e.preventDefault(); location.href = '/hub/kb.html?p=' + encodeURIComponent(items[Math.max(active, 0)].slug); }
      else if (e.key === 'Escape') { close(); input.blur(); }
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target) && e.target !== input) close(); });
  }
})();
