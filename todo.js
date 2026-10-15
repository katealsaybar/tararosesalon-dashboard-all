// To do (Kate, 15 Oct 2026): the calm list of what the dashboards say needs a person. One file for both
// places it lives: the dashboard's To do page (index.html, view=todo) and Team Home's /hub/todo.
// TodoPage.mount(root, client, { head }) draws into root; `client` is a Supabase client signed in as the
// viewer, `head` is optional heading html drawn above the page.
//
// Rows come from todo_items (migrations/todo_items.sql, todo_categories.sql, todo_supply_low.sql,
// todo_status.sql). Who sees which category is the table's own policy, so this file filters nothing for
// access. It folds rows that belong together (one KPI across its branches, one rule across branches) into
// a single card in plain words, brings up five a day, and writes only Done and Not today
// (todo_items.status). Both can be undone from the toast.
(function () {
  var GOAL = 5;
  var BRANCHES = [['', 'All branches'], ['SAA', 'Saadiyat'], ['KCA', 'Khalifa City A'], ['MC', 'Motor City'], ['AQ', 'Al Quoz'], ['BAH', 'Bahrain']];
  var PRI = { 1: 'High', 2: 'Mid', 3: 'Low' };
  // About how long each kind of item takes, in minutes.
  var MINS = { ads_stale: 10, ads_cpa: 15, ads_zero: 10, ledger: 10, sync: 10, pace: 10, kpi: 15, review: 5, ig_post: 10, ig_reach: 15, ig_followers: 10,
    seo_clicks: 15, seo_impr: 15, seo_sessions: 15, seo_position: 10, lost_sign: 5, lost_failed: 10, lastvisit: 25, wv_deadline: 10,
    supply_late: 5, supply_low: 20, supply_reorder: 20, suggest: 10 };
  var STALE_FAST_MIN = 180, STALE_STAFF_H = 30;

  var S = { root: null, client: null, head: '', items: [], cats: [], status: null, pick: '', msg: '', focusMore: false, pinned: '', openCat: '', undo: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Dubai dates, as the refresh uses.
  function dubai(offset) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date(Date.now() + (offset || 0) * 86400000)); }
  function isOpen(i) { return i.status === 'open' || (i.status === 'snoozed' && i.snoozed_until && i.snoozed_until <= dubai(0)); }
  function catOf(k) { return S.cats.filter(function (c) { return c.key === k; })[0] || { key: k, title: k, sort: 99 }; }
  function bname(code) { var b = BRANCHES.filter(function (x) { return x[0] && x[0] === code; })[0]; return b ? b[1] : ''; }
  function list(a) { return a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function lead(i) { var m = /^(\d+)/.exec(i.title); return m ? +m[1] : 0; }
  function safeLink(l) { return l && l.charAt(0) === '/' && l.charAt(1) !== '/' ? l : ''; }
  function scopeOk(i) { return !S.pick || !i.branch || i.branch === S.pick; }
  function sum(l) { return l.reduce(function (s, i) { return s + lead(i); }, 0); }

  // Rows that belong together become one card, titled in plain words.
  function groups(rows) {
    var by = {}, order = [];
    rows.forEach(function (i) {
      var gk = i.rule + '|' + (i.sub || '');
      if (!by[gk]) { by[gk] = []; order.push(gk); }
      by[gk].push(i);
    });
    return order.map(function (gk) {
      var l = by[gk], f = l[0], n = l.length, br = [];
      l.forEach(function (i) { var b = bname(i.branch); if (b && br.indexOf(b) < 0) br.push(b); });
      var g = { gk: gk, rule: f.rule, cat: f.category, sub: f.sub || '', items: l, keys: l.map(function (i) { return i.key; }), branches: br,
        pri: Math.min.apply(null, l.map(function (i) { return i.severity; })), mins: MINS[f.rule] || 10,
        link: safeLink((l.filter(function (i) { return safeLink(i.link); })[0] || {}).link) };
      var b1 = br[0] || '';
      if (n === 1 && b1) {
        var m = /^.*?: (\d+) of (\d+)/.exec(f.title);
        var one = {
          kpi: [(f.sub || 'This number') + ' is low at ' + b1, m ? m[1] + ' of ' + m[2] + ' stylists are under their minimum.' : ''],
          lost_sign: ['Get the ' + b1 + ' Lost Clients list signed off', 'It has been waiting since the campaign started.'],
          lastvisit: ['Win back high-value clients at ' + b1, lead(f) + ' clients who spent AED 5,000 or more are 4 to 6 months away.'],
          supply_low: ['Restock at ' + b1, lead(f) + ' products are out or under a week of cover.'],
          supply_late: ['Chase a late order at ' + b1, ''],
          pace: [b1 + ' is behind target', '']
        }[f.rule];
        if (one) { g.title = one[0]; g.why = one[1] || cut(f.detail, 150); g.lines = f.detail ? [[null, f.detail]] : []; return g; }
      }
      if (n === 1) {
        g.title = f.title; g.why = cut(f.detail, 150); g.lines = String(f.detail || '').length > 150 ? [[null, f.detail]] : [];
        return g;
      }
      var T = {
        kpi: [(f.sub || 'This number') + ' is low at ' + br.length + ' branches', br.length ? list(br) + '.' : ''],
        lost_sign: ['Get ' + n + ' Lost Clients lists signed off', list(br) + ' have been waiting since the campaign started.'],
        lastvisit: ['Win back high-value clients before they count as lost', sum(l) + ' clients who spent AED 5,000 or more are 4 to 6 months away.'],
        supply_low: ['Restock: ' + br.length + ' branches have products out or low', sum(l) + ' products are out or under a week of cover.'],
        supply_late: ['Chase late orders at ' + br.length + ' branches', list(br) + '.'],
        supply_reorder: ['Check what needs reordering', sum(l) + ' fast sellers have gone longer than usual without an order.'],
        pace: [br.length + ' branches are behind target', list(br) + '.'],
        review: [n + ' Google reviews are waiting for a reply', list(br) + '.'],
        ledger: ['Reports are missing for ' + n + ' days', 'Run the daily reports for those dates.'],
        sync: [n + ' syncs need a look', 'They have stopped or are failing.'],
        ads_zero: [n + ' Google Ads campaigns spent with no conversions', 'Over the last 7 days of data.']
      }[f.rule] || [n + ' ' + catOf(f.category).title + ' items', br.length ? list(br) + '.' : ''];
      g.title = T[0]; g.why = T[1];
      g.lines = l.map(function (i) { return [i.title, i.detail]; });
      return g;
    });
  }
  // The order things come up: the best card from each category first, then the next best, and so on,
  // so five staff numbers never crowd out everything else.
  function ranked(gs) {
    var by = {};
    gs.forEach(function (g) { (by[g.cat] = by[g.cat] || []).push(g); });
    Object.keys(by).forEach(function (k) { by[k].sort(function (a, b) { return a.pri - b.pri; }); });
    var out = [], round = 0, more = true;
    while (more) {
      more = false;
      var pass = [];
      S.cats.forEach(function (c) { if (by[c.key] && by[c.key][round]) { pass.push(by[c.key][round]); more = true; } });
      pass.sort(function (a, b) { return a.pri - b.pri; });
      out = out.concat(pass);
      round++;
    }
    var at = out.findIndex(function (g) { return g.gk === S.pinned; });
    if (at > 0) out.unshift(out.splice(at, 1)[0]);
    return out;
  }
  function doneKey() { return 'trs-todo-done-' + dubai(0); }
  function doneCount() { try { return +localStorage.getItem(doneKey()) || 0; } catch (e) { return 0; } }
  function setDone(n) { try { localStorage.setItem(doneKey(), String(Math.max(0, n))); } catch (e) {} }

  function clock() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
  function tick() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5l4.5 4.5L19 7.5"/></svg>'; }
  function pill(p) { return '<span class="td-pill td-p' + p + '"><i></i>' + PRI[p] + '</span>'; }
  function hhmm(iso) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }

  // A strip that says so when the list has stopped refreshing, since nothing else would.
  function staleNote() {
    var st = S.status; if (!st) return '';
    var now = Date.now(), fast = st.fast ? (now - new Date(st.fast).getTime()) / 60000 : Infinity,
        staff = st.staff ? (now - new Date(st.staff).getTime()) / 3600000 : Infinity, why = [];
    if (fast > STALE_FAST_MIN) why.push('The list has not refreshed since ' + (st.fast ? hhmm(st.fast) + ' on ' + dubaiShort(st.fast) : 'ever') + '.');
    if (staff > STALE_STAFF_H) why.push('The staff numbers are from ' + (st.staff ? dubaiShort(st.staff) : 'never') + '.');
    return why.length ? '<div class="td-warn" role="alert"><b>This list may be out of date.</b> ' + esc(why.join(' ')) + ' Tell Kate if Refresh now does not fix it.</div>' : '';
  }
  function dubaiShort(iso) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' }).format(new Date(iso)); }

  function toast(m, undo) {
    var t = S.root.querySelector('.td-toast'); if (!t) return;
    t.innerHTML = esc(m) + (undo ? ' <button type="button" data-act="undo">Undo</button>' : '');
    t.classList.toggle('act', !!undo); t.classList.add('show');
    S.undo = undo || null;
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('show'); S.undo = null; }, undo ? 6000 : 2200);
  }

  function paint() {
    var scoped = S.items.filter(scopeOk);
    var open = groups(scoped.filter(isOpen));
    var q = ranked(open), d = doneCount(), f = q[0];
    var goal = Math.max(GOAL, d);
    var html = (S.head || '') + staleNote() +
      '<div class="td-hello"><div class="td-dots" aria-hidden="true">' +
      Array.from({ length: goal }, function (_, k) { return '<span class="td-dot' + (k < d ? ' on' : '') + '"></span>'; }).join('') + '</div>' +
      '<div class="td-count">' + (d >= goal && d >= GOAL ? '<b>' + d + ' done.</b> That is your five for today.' : '<b>' + d + ' of ' + goal + '</b> for today') + '</div>' +
      '<select class="td-sel" id="tdBranch" aria-label="Which branch">' + BRANCHES.filter(function (b) { return !b[0] || b[0] === S.pick || S.items.some(function (i) { return i.branch === b[0]; }); })
        .map(function (b) { return '<option value="' + b[0] + '"' + (b[0] === S.pick ? ' selected' : '') + '>' + esc(b[1]) + '</option>'; }).join('') + '</select></div>' +
      (S.pick ? '<p class="td-filtered">Showing ' + esc(bname(S.pick)) + ' only. <button type="button" data-act="allbranches">Show all branches</button></p>' : '');

    if (d >= GOAL || !f) {
      html += '<div class="td-label">Start here</div><div class="td-done"><div class="td-check">' + tick() + '</div><h2>' + (f ? 'That is five. Nice work.' : 'All clear.') + '</h2><p>' +
        (f ? q.length + ' more waiting, none of them needed today.' : 'Nothing needs a person right now.') + '</p>' +
        (f ? '<button type="button" class="td-btn ok" id="tdAgain">Pull one forward</button>' : '') + '</div>';
    } else {
      html += '<div class="td-label">Start here</div><article class="td-focus" id="tdFocus"><div class="td-meta">' + pill(f.pri) + '<span class="td-tag">' + esc(catOf(f.cat).title) + '</span></div>' +
        '<h2>' + esc(f.title) + '</h2>' + (f.why ? '<p class="td-why">' + esc(f.why) + '</p>' : '') +
        '<span class="td-time">' + clock() + 'About ' + f.mins + ' minutes</span>' +
        '<div class="td-acts">' + (f.link ? '<a class="td-btn go" href="' + esc(f.link) + '">Open it</a>' : '') +
        '<button type="button" class="td-btn ok" data-act="done">Done</button><button type="button" class="td-btn later" data-act="later">Not today</button></div>' +
        (f.lines.length ? '<details class="td-more"' + (S.focusMore ? ' open' : '') + ' id="tdMore"><summary>Show the numbers</summary><ul>' +
          f.lines.map(function (l) { return '<li>' + (l[0] ? '<b>' + esc(l[0]) + '</b> ' : '') + esc(l[1] || '') + '</li>'; }).join('') + '</ul></details>' : '') + '</article>';
      var nx = q.slice(1, 3);
      if (nx.length) html += '<div class="td-label">Up next</div><div class="td-next">' + nx.map(function (g) {
        return '<button type="button" class="td-nrow" data-pull="' + esc(g.gk) + '"><span class="td-sd p' + g.pri + '"></span><span class="t">' + esc(g.title) + '</span><span class="m">' + g.mins + ' min</span></button>';
      }).join('') + '</div>';
    }

    html += '<div class="td-label">Everything else</div><div class="td-tiles">' + S.cats.map(function (c) {
      var l = open.filter(function (g) { return g.cat === c.key; });
      var top = l.length ? Math.min.apply(null, l.map(function (g) { return g.pri; })) : 0;
      return '<button type="button" class="td-tile' + (l.length ? '' : ' zero') + '" data-cat="' + esc(c.key) + '" aria-expanded="' + (S.openCat === c.key) + '"><span class="n">' + esc(c.title) +
        '</span><span class="c">' + (top ? '<span class="td-sd p' + top + '"></span>' : '') + (l.length ? l.length + (l.length === 1 ? ' thing' : ' things') : 'Nothing') + '</span></button>';
    }).join('') + '</div>';
    if (S.openCat) {
      var pl = open.filter(function (g) { return g.cat === S.openCat; }).sort(function (a, b) { return a.pri - b.pri; });
      html += '<div class="td-panel"><h3>' + esc(catOf(S.openCat).title) + '</h3>' + (pl.length ? '' : '<p class="td-tag" style="padding:8px 0">Nothing here. Good.</p>');
      pl.forEach(function (g) {
        html += '<div class="td-prow"><span class="td-sd p' + g.pri + '" title="' + PRI[g.pri] + '"></span><div class="tx"><b>' + esc(g.title) + '</b>' + (g.why ? '<span>' + esc(g.why) + '</span>' : '') + '</div>' +
          (g.link ? '<a class="td-mini" href="' + esc(g.link) + '">Open</a>' : '') +
          '<button type="button" class="td-mini" data-cdone="' + esc(g.gk) + '">Done</button></div>';
      });
      html += '</div>';
    }

    var parked = groups(scoped.filter(function (i) { return i.status === 'snoozed' && !isOpen(i); })).length;
    var weekAgo = dubai(-7);
    var gone = scoped.filter(function (i) { return i.status === 'closed' && i.closed_at && i.closed_at.slice(0, 10) >= weekAgo; });
    html += '<p class="td-quiet">' + (parked ? parked + ' set aside until tomorrow. <button type="button" data-act="back">Bring them back</button><br>' : '') +
      'Most things refresh every hour, staff numbers once a day' + (S.status && S.status.fast ? ' (last refresh ' + esc(hhmm(S.status.fast)) + ')' : '') + '. <button type="button" id="tdRefresh">Refresh now</button> <span>' + esc(S.msg) + '</span></p>' +
      (gone.length ? '<details class="td-gone"><summary>Sorted by themselves this week (' + gone.length + ')</summary><ul>' +
        gone.slice(0, 12).map(function (i) { return '<li>' + esc(i.title) + '</li>'; }).join('') + '</ul></details>' : '') +
      '<div class="td-toast" role="status" aria-live="polite"></div>';
    S.root.innerHTML = html;
  }

  async function load() {
    var a = await S.client.from('todo_items').select('*');
    if (a.error) { S.msg = 'Could not load: ' + a.error.message; paint(); return; }
    S.items = a.data || [];
    try { var st = await S.client.rpc('todo_status'); S.status = st.error ? null : st.data; } catch (e) { S.status = null; }
    paint();
  }
  async function setStatus(keys, patch) {
    var r = await S.client.from('todo_items').update(patch).in('key', keys);
    if (r.error) { S.msg = 'Could not save: ' + r.error.message; paint(); return false; }
    S.msg = '';
    await load();
    return true;
  }
  function openGroups() { return groups(S.items.filter(scopeOk).filter(isOpen)); }

  function wire(root) {
    if (root.__tdWired) return;
    root.__tdWired = true;
    root.addEventListener('click', async function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var q = ranked(openGroups()), f = q[0];
      var many = function (g) { return g.branches.length > 1 ? ' for ' + g.branches.length + ' branches' : ''; };
      if (b.dataset.act === 'undo' && S.undo) { var u = S.undo; S.undo = null; if (await setStatus(u.keys, { status: 'open' })) { setDone(doneCount() - u.done); toast('Back on your list.'); paint(); } return; }
      if (b.dataset.act === 'done' && f) {
        b.disabled = true;
        if (await setStatus(f.keys, { status: 'done' })) { setDone(doneCount() + 1); S.focusMore = false; paint(); var el = root.querySelector('#tdFocus'); if (el) el.classList.add('pulse'); toast('Done' + many(f) + '. ' + doneCount() + ' for today.', { keys: f.keys, done: 1 }); }
        return;
      }
      if (b.dataset.act === 'later' && f) {
        b.disabled = true;
        if (await setStatus(f.keys, { status: 'snoozed', snoozed_until: dubai(1) })) { S.focusMore = false; toast('Set aside until tomorrow.', { keys: f.keys, done: 0 }); }
        return;
      }
      if (b.dataset.act === 'back') {
        var keys = S.items.filter(function (i) { return i.status === 'snoozed'; }).map(function (i) { return i.key; });
        if (keys.length) await setStatus(keys, { status: 'open' });
        return;
      }
      if (b.dataset.act === 'allbranches') { S.pick = ''; try { localStorage.removeItem('trs-todo-branch2'); } catch (err) {} paint(); return; }
      if (b.id === 'tdAgain') { GOAL += 1; paint(); return; }
      if (b.dataset.pull) { S.pinned = b.dataset.pull; S.focusMore = false; paint(); return; }
      if (b.dataset.cdone) {
        var g = openGroups().filter(function (x) { return x.gk === b.dataset.cdone; })[0];
        if (g && await setStatus(g.keys, { status: 'done' })) { setDone(doneCount() + 1); paint(); toast('Done' + many(g) + '.', { keys: g.keys, done: 1 }); }
        return;
      }
      if (b.dataset.cat) { S.openCat = S.openCat === b.dataset.cat ? '' : b.dataset.cat; paint(); return; }
      if (b.id === 'tdRefresh') {
        b.disabled = true; b.textContent = 'Refreshing…';
        var r = await S.client.rpc('todo_refresh_now');
        S.msg = r.error ? 'Could not refresh: ' + r.error.message : 'Refreshed.';
        await load();
      }
    });
    root.addEventListener('change', function (e) {
      if (e.target.id !== 'tdBranch') return;
      S.pick = e.target.value; try { localStorage.setItem('trs-todo-branch2', S.pick); } catch (err) {}
      paint();
    });
    root.addEventListener('toggle', function (e) { if (e.target.id === 'tdMore') S.focusMore = e.target.open; }, true);
  }

  window.TodoPage = {
    mount: async function (root, client, opts) {
      S.root = root; S.client = client; S.head = (opts && opts.head) || '';
      root.classList.add('td');
      try { S.pick = localStorage.getItem('trs-todo-branch2') || ''; } catch (e) {}
      if (!BRANCHES.some(function (b) { return b[0] === S.pick; })) S.pick = '';
      wire(root);
      if (!S.cats.length) {
        root.innerHTML = (S.head || '') + '<p class="td-tag">Loading…</p>';
        var cr = await client.from('todo_categories').select('key,title,sort').order('sort');
        S.cats = cr.data || [];
      }
      await load();
    }
  };
})();
