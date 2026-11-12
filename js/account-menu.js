/* Kate, 12 Nov 2026: the account menu in the dashboard header, Level 6 (Kate) only. It takes the place of the Sign out button, drawn like Team Home's account menu
   (name, email, level, View as, Reports, Light mode, Sign out) and adds three shortcuts she used to reach through Team Home > Tools:
     1. This page: Live / Under construction / Hidden, with a note, for the page she is on (the same page_status_set as Hide Pages & Under Construction, so the two stay in step);
     2. Rearrange menu: opens Rearrange Menu (sections, sub-sections, pages; nav-layout.js);
     3. Page access for a person: opens one page, or several, for one person whatever their level (dashboard_users.extra_pages, through page_access_people and
        page_access_person_set; pages.js trsPageOpen honours extras at every level below 5).
   Everyone else keeps the plain Sign out button: index.html calls trsAccountMenu() only when the REAL level is 5 (so View as does not take the menu away).
   Called from enterDashboard() with { sb, name }. Needs pages.js (TRS_PAGES, trsPageOpen, TRS_STATUS), page-status.js (the tags) and css/account-menu.css. */
(function () {
  var VIEW_AS = [   // the same choices as Team Home's account menu (hub/hub.js KB.VIEW_AS); the key and shape are the ones index.html trsViewAs() reads
    { v: '5', label: 'Level 6 · Backend' },
    { v: '4', label: 'Level 5 · Accounts & Admin' },
    { v: '3', label: 'Level 4 · Executives & Marketing' },
    { v: '2', label: 'Level 3 · Leadership' },
    { v: '1|Front Desk', label: 'Level 2 · Reception, Front Desk' },
    { v: '1|Call Centre', label: 'Level 2 · Call Centre' },
    { v: '1|Hair', label: 'Level 1 · Stylists, Hair' },
    { v: '1|Beauty', label: 'Level 1 · Beauticians, Beauty' }
  ];
  // The numbers inside the database are the old ones (1 reception, 2 leadership, 3 executives, 4 accounts); people see one more (pages.js header).
  var LV_NAME = { 1: 'Reception & Call Centre', 2: 'Leadership', 3: 'Executives & Marketing', 4: 'Accounts & Admin' };
  function lvNo(n) { return n === 1 ? 2 : n + 1; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var CARET = '<svg class="acct-caret" width="10" height="7" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var S = { sb: null, btn: null, menu: null, name: '', email: '' };

  function curView() { return (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW) || window.trsCurView || ''; }
  function pageList() { return TRS_PAGES.filter(function (p) { return !p.retired; }); }
  function viewAsKey() {
    try { var v = JSON.parse(localStorage.getItem('trs-viewas') || 'null'); if (v && v.level >= 1 && v.level <= 4) return v.level + (v.dept ? '|' + v.dept : ''); } catch (e) {}
    return '5';
  }
  function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

  /* ── The menu ─────────────────────────────────────────────────────────── */
  function statusOf(id) { return typeof trsPageStatus === 'function' ? (trsPageStatus(id) || 'live') : 'live'; }
  function noteOf(id) { var s = (window.TRS_STATUS || {})[typeof trsLive === 'function' ? trsLive(id) : id]; return s ? (s.note || '') : ''; }

  function pageBlock() {
    var id = curView(), p = id && typeof trsPage === 'function' ? trsPage(id) : null;
    if (!p) return '';
    var st = statusOf(id);
    function seg(v, label) { return '<button type="button" role="radio" data-st="' + v + '" aria-checked="' + (st === v) + '" class="acct-seg-' + v + (st === v ? ' on' : '') + '">' + label + '</button>'; }
    return '<div class="acct-sec acct-page" data-id="' + esc(id) + '">' +
      '<div class="acct-k">This page</div><div class="acct-pname">' + esc(trsPageLabel(id)) + '</div>' +
      '<div class="acct-seg" role="radiogroup" aria-label="Status of ' + esc(trsPageLabel(id)) + '">' + seg('live', 'Live') + seg('construction', 'Under construction') + seg('hidden', 'Hidden') + '</div>' +
      '<div class="acct-note"' + (st === 'live' ? ' hidden' : '') + '><input type="text" maxlength="200" value="' + esc(noteOf(id)) + '" aria-label="Note for this page" ' +
        'placeholder="Note (optional)' + '"><button type="button" class="acct-save">Save</button></div>' +
      '<div class="acct-say" role="status" aria-live="polite"></div>' +
      '</div>';
  }

  function build() {
    var cur = viewAsKey();
    var curLabel = (VIEW_AS.filter(function (o) { return o.v === cur; })[0] || VIEW_AS[0]).label;
    return '<div class="acct-who"><b>' + esc(S.name || 'Signed in') + '</b><span>' + esc(S.email) + '</span><em>Level 6 · Backend</em></div>' +
      '<div class="acct-sec acct-va"><button type="button" class="acct-vatog" aria-expanded="false"><span class="acct-k">View as</span><span class="acct-vacur">' + esc(curLabel) + '</span>' + CARET + '</button>' +
        '<div class="acct-valist" hidden role="listbox" aria-label="View as">' + VIEW_AS.map(function (o) {
          return '<button type="button" role="option" data-v="' + esc(o.v) + '" aria-selected="' + (o.v === cur) + '"' + (o.v === cur ? ' class="on"' : '') + '>' + esc(o.label) + '</button>';
        }).join('') + '</div></div>' +
      pageBlock() +
      '<div class="acct-sec acct-tools">' +
        '<a href="/hub/menumover" class="acct-row"><span>Rearrange menu</span><small>Sections, sub-sections, pages</small></a>' +
        '<button type="button" class="acct-row" data-act="access"><span>Page access for a person</span><small>Open pages for someone, any level</small></button>' +
      '</div>' +
      '<div class="acct-sec acct-links">' +
        '<a href="/reports/" class="acct-row"><span>Reports</span></a>' +
        '<a href="/hub/" class="acct-row"><span>Team Home</span></a>' +
        '<button type="button" class="acct-row" data-act="theme"><span>' + (isDark() ? 'Light mode' : 'Dark mode') + '</span></button>' +
        '<button type="button" class="acct-row acct-out" data-act="out"><span>Sign out</span></button>' +
      '</div>';
  }

  function say(root, t, bad) {
    var el = root.querySelector('.acct-say'); if (!el) return;
    el.textContent = t || ''; el.classList.toggle('bad', !!bad);
    clearTimeout(say.t); if (t && !bad) say.t = setTimeout(function () { el.textContent = ''; }, 4500);
  }

  // Saves the current page's status and note, then repaints the menu tags, the header pill and the notice on the page without a reload.
  async function saveStatus(box, status, note) {
    var id = box.getAttribute('data-id'), label = trsPageLabel(id), real = typeof trsLive === 'function' ? trsLive(id) : id;
    var r = await S.sb.rpc('page_status_set', { p_page: real, p_status: status === 'live' ? null : status, p_note: status === 'live' ? null : (note || null) });
    if (r.error) { say(box, 'Not saved: ' + (r.error.message || 'try again') + '.', true); return false; }
    window.TRS_STATUS = window.TRS_STATUS || {};
    if (status === 'live') delete window.TRS_STATUS[real]; else window.TRS_STATUS[real] = { status: status, note: note || '' };
    if (typeof trsStatusNav === 'function') trsStatusNav();
    if (typeof trsStatusBanner === 'function') trsStatusBanner(id);
    if (typeof trsStatusMast === 'function') trsStatusMast(id);
    box.querySelectorAll('.acct-seg button').forEach(function (b) { var on = b.getAttribute('data-st') === status; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    box.querySelector('.acct-note').hidden = status === 'live';
    say(box, label + (status === 'live' ? ' is Live.' : status === 'hidden' ? ' is Hidden: only you can open it.' : ' is Under construction.'));
    return true;
  }

  function open() {
    S.menu.innerHTML = build();
    S.menu.hidden = false; S.btn.setAttribute('aria-expanded', 'true');
  }
  function close() { if (S.menu.hidden) return; S.menu.hidden = true; S.btn.setAttribute('aria-expanded', 'false'); }

  function onMenuClick(e) {
    var t = e.target;
    var va = t.closest('.acct-vatog');
    if (va) { var l = S.menu.querySelector('.acct-valist'); l.hidden = !l.hidden; va.setAttribute('aria-expanded', String(!l.hidden)); return; }
    var opt = t.closest('.acct-valist button[data-v]');
    if (opt) {
      if (opt.classList.contains('on')) return;
      var parts = opt.getAttribute('data-v').split('|'), lv = +parts[0];
      try { if (lv >= 1 && lv <= 4) localStorage.setItem('trs-viewas', JSON.stringify({ level: lv, dept: parts[1] || null })); else localStorage.removeItem('trs-viewas'); } catch (er) {}
      location.reload(); return;
    }
    var seg = t.closest('.acct-seg button');
    if (seg) {
      var box = seg.closest('.acct-page'), st = seg.getAttribute('data-st'), inp = box.querySelector('.acct-note input');
      if (seg.classList.contains('on')) return;
      saveStatus(box, st, st === 'live' ? '' : inp.value.trim()).then(function (ok) { if (ok && st !== 'live') inp.focus(); });
      return;
    }
    if (t.closest('.acct-save')) {
      var b2 = t.closest('.acct-page'), cur = b2.querySelector('.acct-seg button.on');
      if (cur) saveStatus(b2, cur.getAttribute('data-st'), b2.querySelector('.acct-note input').value.trim());
      return;
    }
    var act = t.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');
    if (a === 'theme') { close(); if (typeof toggleTheme === 'function') toggleTheme(); }
    else if (a === 'out') { if (typeof doLogout === 'function') doLogout(); }
    else if (a === 'access') { close(); openAccess(); }
  }

  /* ── Page access for a person ────────────────────────────────────────── */
  var A = { people: [], who: 0, q: '', only: true, root: null };

  function person() { return A.people[A.who] || null; }
  function hasExtra(p, id) { return (p.pages || []).indexOf(id) >= 0; }

  function accessRows() {
    var p = person(), needle = A.q.trim().toLowerCase(), cur = curView(), groups = [], by = {};
    if (!p) return '<p class="acm-empty">No one on the dashboard list yet.</p>';
    pageList().forEach(function (pg) {
      if (needle && (pg.label + ' ' + (pg.group || '') + ' ' + (pg.sub || '')).toLowerCase().indexOf(needle) < 0) return;
      var g = pg.group || 'Other';
      if (!by[g]) { by[g] = []; groups.push(g); }
      by[g].push(pg);
    });
    if (!groups.length) return '<p class="acm-empty">Nothing matches that search.</p>';
    var html = groups.map(function (g) {
      var rows = by[g].map(function (pg) {
        var own = hasExtra(p, pg.id);
        var hidden = statusOf(pg.id) === 'hidden';
        var byLevel = !own && trsPageOpen(pg.id, p.level, []);   // already opened by their level (and the ticks on Page Access)
        if (byLevel && A.only) return '';
        var note = hidden ? 'Hidden: only you can open it' : byLevel ? 'Their level already opens it' : '';
        return '<label class="acm-row' + (hidden || byLevel ? ' dim' : '') + (pg.id === cur ? ' here' : '') + '" data-id="' + esc(pg.id) + '">' +
          '<input type="checkbox"' + (own || byLevel ? ' checked' : '') + (hidden || byLevel ? ' disabled' : '') + ' aria-label="' + esc(pg.label) + '">' +
          '<span class="acm-nm">' + esc(pg.label) + (pg.sub ? '<small>' + esc(pg.sub) + '</small>' : '') + '</span>' +
          (pg.id === cur ? '<em class="acm-here">You are here</em>' : '') +
          (note ? '<em class="acm-note">' + note + '</em>' : own ? '<em class="acm-own">Opened for them</em>' : '') + '</label>';
      }).join('');
      return rows ? '<div class="acm-grp">' + esc(g) + '</div>' + rows : '';
    }).join('');
    return html || '<p class="acm-empty">' + (A.only ? 'Their level already opens everything that matches. Untick “Only pages they cannot open yet” to see them.' : 'Nothing matches that search.') + '</p>';
  }

  function accessHead() {
    var p = person();
    var scoped = p && p.scope ? '<p class="acm-warn">This is a ' + esc(p.scope === 'BAH' ? 'Bahrain' : p.scope) + ' sign-in: only that branch’s pages show, whatever is ticked.</p>' : '';
    return scoped;
  }

  function paintAccess() {
    var r = A.root; if (!r) return;
    r.querySelector('.acm-list').innerHTML = accessRows();
    r.querySelector('.acm-scope').innerHTML = accessHead();
    var p = person(), n = p ? (p.pages || []).length : 0;
    r.querySelector('.acm-count').textContent = p ? (n ? n + ' page' + (n > 1 ? 's' : '') + ' opened for ' + (p.name || 'them').split(/[\s(]/)[0] + ' alone' : 'Nothing opened for ' + (p.name || 'them').split(/[\s(]/)[0] + ' alone yet') : '';
  }

  function aSay(t, bad) {
    var el = A.root && A.root.querySelector('.acm-say'); if (!el) return;
    el.textContent = t || ''; el.classList.toggle('bad', !!bad);
  }

  async function openAccess() {
    if (A.root) return;
    var root = document.createElement('div');
    root.className = 'acm'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Page access for a person');
    root.innerHTML = '<div class="acm-card"><div class="acm-head"><div><div class="acm-title">Page access for a person</div>' +
      '<div class="acm-sub">Open pages for one person, whatever their level.</div></div><button type="button" class="acm-x" aria-label="Close">&times;</button></div>' +
      '<div class="acm-body"><p class="acm-load">Loading the team…</p></div></div>';
    document.body.appendChild(root); A.root = root;
    function shut() { document.removeEventListener('keydown', onKey, true); root.remove(); A.root = null; }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); shut(); } }
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', function (e) { if (e.target === root || e.target.closest('.acm-x')) shut(); });

    var r = await S.sb.rpc('page_access_people');
    var body = root.querySelector('.acm-body');
    if (r.error || !Array.isArray(r.data)) { body.innerHTML = '<p class="acm-warn">Could not load the team: ' + esc((r.error && r.error.message) || 'try again') + '.</p>'; return; }
    A.people = r.data; A.who = 0; A.q = ''; A.only = true;
    body.innerHTML =
      '<label class="acm-lab" for="acmWho">Person</label>' +
      '<select id="acmWho" class="acm-sel">' + A.people.map(function (p, i) {
        return '<option value="' + i + '">' + esc(p.name || p.email) + ' · Level ' + lvNo(p.level) + ', ' + esc(LV_NAME[p.level] || '') + '</option>';
      }).join('') + '</select>' +
      '<div class="acm-count" aria-live="polite"></div><div class="acm-scope"></div>' +
      '<input type="search" class="acm-q" placeholder="Search pages" aria-label="Search pages" autocomplete="off">' +
      '<label class="acm-only"><input type="checkbox" id="acmOnly" checked> Only pages they cannot open yet</label>' +
      '<div class="acm-list" role="group" aria-label="Pages"></div>' +
      '<div class="acm-say" role="status" aria-live="polite"></div>' +
      '<p class="acm-fine">The page opens for them whatever their level. A page whose numbers are held back by the database for a higher level can still say “Level 3 and above” until that page’s data is opened too; tell me which page and it gets done. Someone not on this list is added first in <a href="/hub/roster">Staff Roster &amp; Access</a>.</p>';
    paintAccess();
    var here = root.querySelector('.acm-row.here'); if (here) here.scrollIntoView({ block: 'nearest' });
    body.querySelector('#acmWho').addEventListener('change', function (e) { A.who = +e.target.value; A.q = ''; body.querySelector('.acm-q').value = ''; aSay(''); paintAccess(); });
    body.querySelector('.acm-q').addEventListener('input', function (e) { A.q = e.target.value; paintAccess(); });
    body.querySelector('#acmOnly').addEventListener('change', function (e) { A.only = e.target.checked; paintAccess(); });
    body.querySelector('.acm-list').addEventListener('change', async function (e) {
      var cb = e.target, row = cb.closest && cb.closest('.acm-row'), p = person(); if (!row || !p) return;
      var id = row.getAttribute('data-id'), on = cb.checked;
      cb.disabled = true;
      var res = await S.sb.rpc('page_access_person_set', { p_email: p.email, p_page: id, p_on: on });
      if (res.error) { cb.checked = !on; cb.disabled = false; aSay('Not saved: ' + (res.error.message || 'try again') + '.', true); return; }
      p.pages = (p.pages || []).filter(function (x) { return x !== id; });
      if (on) p.pages.push(id);
      aSay((p.name || 'They').split(/[\s(]/)[0] + (on ? ' can now open ' : ' no longer has ') + trsPageLabel(id) + (on ? '.' : ' opened for them alone.'));
      paintAccess();
    });
  }

  /* ── Mount ───────────────────────────────────────────────────────────── */
  window.trsAccountMenu = function (o) {
    try {
      if (S.btn) return;
      o = o || {}; S.sb = o.sb; S.name = o.name || ''; S.email = o.email || '';
      var out = document.getElementById('signOutBtn'), who = out && out.parentNode;
      if (!who || !S.sb) return;
      var initials = (S.name || S.email || '?').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      var first = (S.name || '').split(/[\s(]/)[0];
      var wrap = document.createElement('span'); wrap.className = 'acct'; wrap.id = 'acct';
      wrap.innerHTML = '<button type="button" class="tglr acct-btn" id="acctBtn" aria-haspopup="true" aria-expanded="false" aria-controls="acctMenu">' +
        '<span class="acct-av">' + esc(initials) + '</span><span class="acct-nm">' + esc(first || 'Account') + '</span>' + CARET + '</button>' +
        '<div class="acct-menu" id="acctMenu" hidden></div>';
      who.insertBefore(wrap, out);
      out.style.display = 'none';   // the menu holds Sign out; the button stays in the page for anyone else
      var hello = document.getElementById('mastHello'); if (hello) hello.style.display = 'none';   // the name is on the button now
      document.body.classList.add('has-acct');
      S.btn = wrap.querySelector('#acctBtn'); S.menu = wrap.querySelector('#acctMenu');
      S.btn.addEventListener('click', function (e) { e.stopPropagation(); if (S.menu.hidden) open(); else close(); });
      S.menu.addEventListener('click', onMenuClick);
      S.menu.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.matches('.acct-note input')) { e.preventDefault(); e.target.closest('.acct-page').querySelector('.acct-save').click(); }
      });
      document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !S.menu.hidden && !A.root) { close(); S.btn.focus(); } });
    } catch (e) { /* a failure leaves the plain Sign out button */ var b = document.getElementById('signOutBtn'); if (b) b.style.display = ''; }
  };
})();
