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

  // The sections. `staff: true` shows to everyone signed in; the rest to dashboard
  // users only. A section with pages in kb_pages is live; without, "Coming soon".
  // Grouped by department (Kate, 1 Oct 2026). The keys match kb_sections in Supabase,
  // which decides who opens what; `live` is for sections that link out rather than
  // holding pages (a section with pages in kb_pages is live on its own).
  KB.GROUPS = ['Management', 'Hair', 'Beauty', 'Front Desk', 'Marketing', 'Accounts & Admin'];
  KB.SECTIONS = [
    { key: 'dashboards', dept: 'Management', title: 'Dashboards', href: '/dashboard/', live: true, rule: 'var(--accent-lavender)',
      blurb: 'Sales, ledgers, team performance and every report, as before.' },
    { key: 'campaigns', dept: 'Management', title: 'Campaigns', href: '/?view=wvperf', live: true, rule: 'var(--accent-coral)',
      blurb: 'Wellness Voucher performance.' },
    { key: 'hair-sop', dept: 'Hair', title: 'Hair SOPs', rule: 'var(--accent-lavender)',
      blurb: 'Hair services, the trade test and colour standards.' },
    { key: 'hair-induction', dept: 'Hair', title: 'Hair Induction & Onboarding', rule: 'var(--accent-butter)',
      blurb: 'The induction programme for stylists and hair assistants.' },
    { key: 'beauty-sop', dept: 'Beauty', title: 'Beauty SOPs', rule: 'var(--accent-mint)',
      blurb: 'Every beauty treatment, step by step: hands and feet, facials, face and body, plus hygiene and room set-up.' },
    { key: 'beauty-induction', dept: 'Beauty', title: 'Beauty Induction & Onboarding', rule: 'var(--accent-butter)',
      blurb: 'The induction programme for the beauty team.' },
    { key: 'front-desk', dept: 'Front Desk', title: 'Front Desk & Policies', rule: 'var(--accent-coral)',
      blurb: 'The front desk manual, booking and deposit policy, cancellations.' },
    { key: 'front-desk-induction', dept: 'Front Desk', title: 'Front Desk Induction & Onboarding', rule: 'var(--accent-butter)',
      blurb: 'The induction programme for reception.' },
    { key: 'marketing', dept: 'Marketing', title: 'Marketing', rule: 'var(--accent-coral)',
      blurb: 'Marketing strategy and plans.' },
    { key: 'hr-forms', dept: 'Accounts & Admin', title: 'HR Forms & Waivers', rule: 'var(--accent-butter)',
      blurb: 'Leave, probation and return-to-work forms; client waivers and consultation forms.' },
    { key: 'uploads', dept: 'Accounts & Admin', title: 'Upload Portal', href: '/upload/', live: true, rule: 'var(--accent-mint)',
      blurb: 'Payslips, and the uploads that feed the dashboard.' }
  ];
  KB.LEVELS = { 1: 'Team', 2: 'Leadership', 3: 'Executives & Marketing', 4: 'Accounts & Admin', 5: 'Backend' };

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
    var r = await c.rpc('kb_access');
    if (r.error || !r.data) { location.replace(back); return new Promise(function () {}); }
    KB.access = r.data;
    KB.level = r.data.level;
    KB.allowed = r.data.sections || [];
    KB.myLink = r.data.my_link || null;
    KB.isStaff = KB.level === 1;
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
          '<div class="kb-menu-who"><b>' + esc(KB.name || 'Signed in') + '</b><span>' + esc(KB.email || '') + '</span>' +
            '<em class="kb-menu-lvl">Level ' + KB.level + ' · ' + esc(KB.LEVELS[KB.level] || '') + (KB.access.scope === 'BAH' ? ' · Bahrain' : '') + '</em></div>' +
          (KB.allowed.indexOf('dashboards') >= 0 ? '<a href="/dashboard/">Open the dashboard</a>' : '') +
          (KB.myLink ? '<a href="' + esc(KB.myLink) + '">My numbers</a>' : '') +

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
