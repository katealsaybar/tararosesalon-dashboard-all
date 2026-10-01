/* ============================================================
   TARA ROSE SALONS: Team Home, shared script (Kate, 1 Oct 2026)
   hub.js: sign-in check, header (search + account menu), theme.

   Who sees what: kb_role() in Supabase (migrations/create_kb_hub.sql). Everyone on
   dashboard_users keeps their dashboard role and sees every card; staff (perf_staff
   or kb_staff) get 'staff' and see the staff sections only. The page text is in
   kb_pages and comes back only to someone kb_pages' policy lets read it, so this
   file holds no content at all: the repo is public.
   Needs supabase-js and ../auth.js loaded first.
   ============================================================ */
(function () {
  var c = TRSAuth.client();
  var KB = window.KB = { client: c, role: null, name: null, email: null };

  // The sections. `staff: true` shows to everyone signed in; the rest to dashboard
  // users only. A section with pages in kb_pages is live; without, "Coming soon".
  KB.SECTIONS = [
    { key: 'dashboards', title: 'Dashboards', staff: false, href: '/dashboard/', live: true, rule: 'var(--accent-lavender)',
      blurb: 'Sales, ledgers, team performance and every report, as before.' },
    { key: 'beauty-sop', title: 'Beauty SOPs', staff: true, rule: 'var(--accent-mint)',
      blurb: 'Every beauty treatment, step by step: hands and feet, facials, face and body, plus hygiene and room set-up.' },
    { key: 'hair-sop', title: 'Hair SOPs', staff: true, rule: 'var(--accent-lavender)',
      blurb: 'Hair services, the trade test and colour standards.' },
    { key: 'induction', title: 'Induction & Onboarding', staff: true, rule: 'var(--accent-butter)',
      blurb: 'Your induction programme, whether you are a stylist, an assistant or in beauty.' },
    { key: 'front-desk', title: 'Front Desk & Policies', staff: false, rule: 'var(--accent-coral)',
      blurb: 'The front desk manual, booking and deposit policy, cancellations.' },
    { key: 'hr-forms', title: 'HR Forms & Waivers', staff: false, rule: 'var(--accent-butter)',
      blurb: 'Leave, probation and return-to-work forms; client waivers and consultation forms.' },
    { key: 'campaigns', title: 'Campaigns', staff: false, href: '/?view=wvperf', live: true, rule: 'var(--accent-coral)',
      blurb: 'Wellness Voucher performance.' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  KB.esc = esc;

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
    var r = await c.rpc('kb_role');
    if (r.error || !r.data) { location.replace(back); return new Promise(function () {}); }
    KB.role = r.data;
    KB.email = s.user && s.user.email;
    var n = await c.rpc('kb_me');
    KB.name = (!n.error && n.data) || '';
    KB.isStaff = KB.role === 'staff';
    drawHeader();
    document.body.classList.remove('kb-wait');
    return KB;
  })();

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
      '<div class="kb-search-wrap"><div class="kb-search">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input type="search" id="kbSearch" placeholder="Search the SOPs" autocomplete="off" aria-label="Search the SOPs"></div>' +
        '<div class="kb-results" id="kbResults" role="listbox"></div></div>' +
      '<div class="kb-account">' +
        '<button class="kb-account-btn" id="kbAccountBtn" aria-haspopup="true" aria-expanded="false">' +
          '<span class="kb-avatar">' + esc(initials) + '</span><span class="kb-name">' + esc(first || 'Account') + '</span>' +
          '<svg class="kb-caret" width="10" height="7" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<div class="kb-menu hide" id="kbMenu">' +
          '<div class="kb-menu-who"><b>' + esc(KB.name || 'Signed in') + '</b><span>' + esc(KB.email || '') + '</span></div>' +
          (KB.isStaff ? '' : '<a href="/dashboard/">Open the dashboard</a>') +
          '<button id="kbThemeBtn" type="button">' + (theme() === 'dark' ? 'Light mode' : 'Dark mode') + '</button>' +
          '<button id="kbSignOut" type="button">Sign out</button>' +
        '</div></div>';

    var btn = document.getElementById('kbAccountBtn'), menu = document.getElementById('kbMenu');
    btn.onclick = function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('hide') === false;
      btn.setAttribute('aria-expanded', open);
    };
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target)) { menu.classList.add('hide'); btn.setAttribute('aria-expanded', 'false'); }
    });
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
