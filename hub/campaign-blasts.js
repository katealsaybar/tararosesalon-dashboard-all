/* Campaign Blasts (Kate, 30 Oct 2026). Reads and writes only through blast_plan_* (migrations/campaign_blasts.sql), which check the
   level again. Nothing here sends a message: it is the plan, the schedule and Coach Emma's review. Tab order is a personal setting
   (localStorage), the rest is shared. */
(function () {
  var main = document.getElementById('kbMain'), esc = KB.esc;
  if (/\.html$/.test(location.pathname)) history.replaceState(null, '', location.pathname.replace(/\.html$/, '') + location.search + location.hash);

  var FOOT = 'If you’d rather not hear from us, reply STOP';
  var ORDER_KEY = 'trs-cb-order';
  var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var D = null, cur = 'all', cal = null, drag = null, draft = {}, errMsg = '';
  var TODAY = dubaiToday();

  function dubaiToday() {
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      return p;
    } catch (e) { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
  }
  function notFound() {
    main.innerHTML = '<p class="kb-crumbs"><a href="/hub/">Team Home</a></p><p class="kb-msg">This page isn’t open to your account. <a href="/hub/">Back to Team Home</a></p>';
  }
  async function rpc(name, args) {
    var r = await KB.client.rpc(name, args || {});
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }
  function item(id) { return D.items.filter(function (i) { return i.id === id; })[0]; }
  function parts(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function fd(iso) { var d = parts(iso); return DN[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()]; }
  function ft(t) { var h = +t.split(':')[0], m = t.split(':')[1]; return (h > 12 ? h - 12 : h) + (m === '00' ? '' : ':' + m) + (h >= 12 ? ' pm' : ' am'); }
  function fat(iso) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); }
    catch (e) { return iso; }
  }
  function lab(k) { return k === 'ok' ? 'Approved' : k === 'changes' ? 'Needs changes' : 'Waiting for review'; }
  function saved() { try { return JSON.parse(localStorage.getItem(ORDER_KEY)) || []; } catch (e) { return []; } }
  function ord() {
    var s = saved(), ids = D.items.map(function (i) { return i.id; });
    var first = s.filter(function (id) { return ids.indexOf(id) >= 0; });
    return first.concat(ids.filter(function (id) { return first.indexOf(id) < 0; }));
  }
  function setOrd(a) { try { localStorage.setItem(ORDER_KEY, JSON.stringify(a)); } catch (e) { /* private window */ } }
  function cls(k) { return k === 'ok' || k === 'changes' ? k : ''; }

  /* the phone, as the client sees it */
  function phone(m, img) {
    var body = String(m.t).replace('{{1}}', 'Layla').replace(/\. /g, '.\n\n').replace(/: /g, ':\n');
    return '<div class="cb-phone-wrap"><div class="cb-phone"><div class="cb-screen">' +
      '<div class="cb-status"><span>11:02</span><span class="ic">5G <span class="cb-batt"></span></span></div>' +
      '<div class="cb-chat-head"><span class="cb-back">‹</span><span class="cb-av"></span><span class="cb-who">Tara Rose Salons<small>Business account</small></span><span class="cb-dots">⋮</span></div>' +
      '<div class="cb-thread"><span class="cb-day">Today</span><div class="cb-bub">' +
      (img ? '<img class="cb-hdr" src="' + esc(img) + '" alt="Header photo from the landing page">' : '') +
      '<div class="cb-body">' + esc(body) + '</div><div class="cb-ftr">' + esc(FOOT) + '</div><div class="cb-time">11:00</div></div>' +
      '<div class="cb-btn">Tell me more</div></div>' +
      '<div class="cb-compose"><span class="cb-input">Message</span><span class="cb-mic"></span></div></div></div></div>';
  }
  function lane(label, m, img) {
    return '<div class="cb-lane"><div class="cb-lane-top"><h3>' + label + '</h3><span>' + (m.c ? esc(m.c) + ' clients' : '') + '</span></div>' +
      '<div class="w">' + (label === 'Warm' ? 'Last visit within 90 days' : 'Last visit 91 days to 6 months ago') + '</div>' + phone(m, img) +
      '<div class="cb-name">' + esc(m.name) + '</div></div>';
  }

  /* sidebar: calendar and movable tabs */
  function calHtml() {
    var y = cal.y, m = cal.m, off = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
    var it = item(cur), curIso = it ? it.send_date : '';
    var h = '<div class="cb-cal cb-card"><div class="cb-cal-h"><button type="button" data-act="prev" aria-label="Previous month">‹</button><b>' + MN[m] + ' ' + y + '</b><button type="button" data-act="next" aria-label="Next month">›</button></div><div class="cb-cal-g">';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { h += '<span class="dn' + (d === 'Mon' ? ' m' : '') + '">' + d.slice(0, 2) + '</span>'; });
    for (var i = 0; i < off; i++) h += '<span></span>';
    for (var d = 1; d <= n; d++) {
      var iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var here = ord().filter(function (id) { return item(id).send_date === iso; });
      var dots = here.slice(0, 3).map(function (id) { return '<b class="' + (item(id).locked ? '' : 'plan') + '"></b>'; }).join('');
      h += '<button type="button" class="cb-d' + (here.length ? ' has' : '') + (iso === TODAY ? ' today' : '') + (iso === curIso ? ' sel' : '') + '" ' +
        (here.length ? 'data-day="' + iso + '" aria-label="' + fd(iso) + ', ' + here.length + ' blasts"' : 'tabindex="-1" disabled') + '>' + d + (dots ? '<i>' + dots + '</i>' : '') + '</button>';
    }
    return h + '</div><div class="cb-leg"><span><b></b>Locked</span><span><b class="plan"></b>Planned</span></div></div>';
  }
  function tabsHtml() {
    var h = '<div class="cb-tabs cb-card"><h3>Blasts</h3><p class="cb-hint">Drag the dots to reorder.</p><div id="cbTabs">';
    ord().forEach(function (id) {
      var b = item(id), n = b.comments.length;
      h += '<div class="cb-tab' + (cur === id ? ' on' : '') + '" data-id="' + esc(id) + '"><button type="button" class="cb-grip" aria-label="Move ' + esc(b.data.title) + '. Use arrow up and down."></button>' +
        '<a href="#' + esc(id) + '"><span>' + esc(b.data.title) + '</span><small>' + fd(b.send_date) + ', ' + ft(b.send_time) + '</small></a>' +
        (n ? '<span class="cb-cc" title="' + n + ' comments">' + n + '</span>' : '') + '<span class="cb-dot ' + cls(b.review) + '" title="' + lab(b.review) + '"></span></div>';
    });
    return h + '</div><div class="cb-tab' + (cur === 'all' ? ' on' : '') + '" style="margin-top:6px"><a href="#all" style="padding-left:12px"><span>All blasts</span></a></div></div>';
  }

  /* pages */
  function allHtml() {
    var ids = ord(), ap = ids.filter(function (id) { return item(id).review === 'ok'; }).length, lk = ids.filter(function (id) { return item(id).locked; }).length;
    var rows = ids.map(function (id) {
      var b = item(id);
      return '<a class="cb-r" href="#' + esc(id) + '"><b>' + esc(b.data.title) + '</b><span class="cb-chip ' + cls(b.review) + '">' + lab(b.review) + '</span>' +
        '<small>' + fd(b.send_date) + ', ' + ft(b.send_time) + ' · ' + esc(b.data.n) + ' clients' + (b.locked ? ' · time locked' : '') + (b.comments.length ? ' · ' + b.comments.length + ' comments' : '') + '</small></a>';
    }).join('');
    return '<div><div class="cb-eyebrow">Internal draft</div><h2>Campaign blasts, November</h2></div>' +
      '<div class="cb-sum"><span class="cb-chip"><b>' + ap + ' of ' + ids.length + '</b> approved</span><span class="cb-chip"><b>' + lk + ' of ' + ids.length + '</b> times locked</span></div>' +
      '<div class="cb-card cb-rows">' + rows + '</div>';
  }
  // The campaign's landing page, so Coach Emma can go back to what the client lands on. Only a path on this site is linked.
  function pageCard(b) {
    var u = b.data.page_url;
    if (!u || !/^\/[^\/]/.test(u)) return '';
    return '<div class="cb-fact cb-card"><small>Landing page</small><a class="cb-pg" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(b.data.page_name || 'Open the page') + ' ↗</a></div>';
  }
  function warns(b) {
    var w = [];
    if (parts(b.send_date).getDay() !== 1) w.push('Blasts go out on Mondays.');
    if (b.send_time < '11:00' || b.send_time > '16:00') w.push('Send between 11 am and 4 pm.');
    return w;
  }
  function blastHtml(b) {
    var ids = ord(), i = ids.indexOf(b.id), p = ids[i - 1], n = ids[i + 1], w = warns(b), k = b.review;
    var times = '';
    for (var h = 9; h <= 18; h++) ['00', '30'].forEach(function (m) {
      if (h === 18 && m === '30') return;
      var v = String(h).padStart(2, '0') + ':' + m;
      times += '<option value="' + v + '"' + (v === b.send_time ? ' selected' : '') + '>' + ft(v) + '</option>';
    });
    var thread = b.comments.length ? b.comments.map(function (c) {
      return '<div class="cb-cm' + (/^emma/i.test(c.by) ? ' emma' : '') + '"><div class="cb-cm-h"><b>' + esc(c.by) + '</b><span>' + esc(fat(c.at)) +
        (c.mine || D.level === 5 ? ' <button type="button" data-del="' + c.id + '">Delete</button>' : '') + '</span></div><p>' + esc(c.body) + '</p></div>';
    }).join('') : '<p class="cb-none">No comments yet.</p>';
    var hasWhy = k === 'changes' && b.comments.some(function (c) { return c.by === b.review_by && b.review_at && new Date(c.at) >= new Date(new Date(b.review_at).getTime() - 60000); });
    return '<div class="cb-head"><div><div class="cb-eyebrow">' + fd(b.send_date) + ', ' + ft(b.send_time) + '</div><h2>' + esc(b.data.title) + '</h2></div><span class="cb-chip ' + cls(k) + '">' + lab(k) + '</span></div>' +
      '<div class="cb-facts"><div class="cb-fact cb-card"><small>Clients</small><b>' + esc(b.data.n) + '</b></div><div class="cb-fact cb-card"><small>Who</small>' + esc(b.data.who) + '</div><div class="cb-fact cb-card"><small>She gets</small>' + esc(b.data.gets) + '</div>' + pageCard(b) + '</div>' +
      '<div class="cb-phones">' + lane('Warm', b.data.warm, b.data.img) + lane('Standard', b.data.std, b.data.img) + '</div>' +
      '<div class="cb-card cb-when"><h3>When it goes out</h3>' +
      '<label class="cb-fld">Date<input type="date" id="cbDate" value="' + b.send_date + '"></label>' +
      '<label class="cb-fld">Time (Dubai)<select id="cbTime">' + times + '</select></label>' +
      '<label class="cb-sw"><input type="checkbox" id="cbLock"' + (b.locked ? ' checked' : '') + '><span class="t"></span>' + (b.locked ? 'Time locked' : 'Lock this time') + '</label>' +
      (w.length ? '<p class="cb-note warn">' + w.join(' ') + '</p>' : '<p class="cb-note">Mondays, 11 am to 4 pm. This records the plan; the blast is launched from respond.io.</p>') + '</div>' +
      '<div class="cb-card cb-rev"><div class="cb-rev-top"><h3>Review and comments</h3><div class="cb-seg" role="group" aria-label="Review">' +
      '<button type="button" data-st="ok" class="ok' + (k === 'ok' ? ' on' : '') + '">Approve</button><button type="button" data-st="changes" class="changes' + (k === 'changes' ? ' on' : '') + '">Needs changes</button></div></div>' +
      (k !== 'none' && b.review_by ? '<div class="cb-by">' + (k === 'ok' ? 'Approved' : 'Marked needs changes') + ' by ' + esc(b.review_by) + ', ' + esc(fat(b.review_at)) + '</div>' : '') +
      '<div class="cb-thr">' + thread + '</div>' +
      (k === 'changes' && !hasWhy ? '<p class="cb-ask">Add a comment so we know what to change.</p>' : '') +
      '<textarea id="cbCmt" maxlength="2000" placeholder="Leave a comment on this blast" aria-label="Comment"></textarea>' +
      (errMsg ? '<p class="cb-err" role="alert">' + esc(errMsg) + '</p>' : '') +
      '<div class="cb-row"><button type="button" class="cb-pill" id="cbPost">Post comment</button><span class="cb-chip">Posting as ' + esc(D.me) + '</span></div></div>' +
      '<div class="cb-pager"><a href="#' + (p || 'all') + '" class="' + (p ? '' : 'off') + '">Back</a><a href="#' + (n || 'all') + '">' + (n ? 'Next blast' : 'All blasts') + '</a></div>';
  }

  function render(keep) {
    var y = window.scrollY, b = item(cur);
    if (!cal) {   // the month of this blast, else the month of the next blast to go
      var next = D.items.map(function (i) { return i.send_date; }).filter(function (s) { return s >= TODAY; }).sort()[0];
      var d = b ? parts(b.send_date) : next ? parts(next) : new Date(); cal = { y: d.getFullYear(), m: d.getMonth() };
    }
    var sideOpen = document.getElementById('cbSide') && document.getElementById('cbSide').classList.contains('open');
    main.innerHTML =
      '<p class="kb-crumbs"><a href="/hub/">Team Home</a></p>' + KB.titleIcon('marketing', 'Campaign Blasts') +
      '<p class="kb-meta">What each WhatsApp blast looks like, when it goes out, and Coach Emma’s review.</p>' +
      '<div class="cb"><div class="cb-shell"><aside class="cb-side' + (sideOpen ? ' open' : '') + '" id="cbSide">' +
      '<button type="button" class="cb-side-toggle" id="cbSideT" aria-expanded="' + (sideOpen ? 'true' : 'false') + '"><span>Calendar and blasts</span><span>+</span></button>' +
      '<div class="cb-side-body">' + calHtml() + tabsHtml() + '</div></aside><div class="cb-main" id="cbMain">' + (b ? blastHtml(b) : allHtml()) + '</div></div></div>';
    var ta = document.getElementById('cbCmt');
    if (ta) { ta.value = draft[cur] || ''; ta.oninput = function () { draft[cur] = ta.value; }; }
    if (keep) window.scrollTo(0, y);
  }
  function go(id, keepMonth) {
    cur = id; errMsg = '';
    var b = item(id); if (b && !keepMonth) { var d = parts(b.send_date); cal = { y: d.getFullYear(), m: d.getMonth() }; }
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ }
    render(); window.scrollTo(0, 0);
  }
  async function reload() {
    try { var d = await rpc('blast_plan_get'); D = d; if (cur !== 'all' && !item(cur)) cur = 'all'; } catch (e) { errMsg = 'Could not refresh: ' + e.message; }
  }
  async function act(fn) {   // run a write, then show what the database now says
    errMsg = '';
    try { await fn(); } catch (e) { errMsg = 'Not saved: ' + e.message; }
    await reload(); render(true);
  }

  document.addEventListener('click', function (e) {
    if (!document.getElementById('cbMain')) return;
    var t = e.target, a = t.closest && t.closest('.cb a[href^="#"]');
    if (a) { e.preventDefault(); go(a.getAttribute('href').slice(1)); return; }
    var c = t.closest && t.closest('[data-act]');
    if (c) { var dm = c.getAttribute('data-act') === 'next' ? 1 : -1; cal.m += dm; if (cal.m > 11) { cal.m = 0; cal.y++; } if (cal.m < 0) { cal.m = 11; cal.y--; } render(true); return; }
    var dd = t.closest && t.closest('[data-day]');
    if (dd) { var first = ord().filter(function (id) { return item(id).send_date === dd.getAttribute('data-day'); })[0]; if (first) go(first, true); return; }
    var st = t.closest && t.closest('[data-st]');
    if (st) { var b = item(cur), v = st.getAttribute('data-st'); act(function () { return rpc('blast_plan_review', { p_id: cur, p_status: b.review === v ? 'none' : v }); }); return; }
    var del = t.closest && t.closest('[data-del]');
    if (del) { if (!confirm('Delete this comment?')) return; act(function () { return rpc('blast_plan_comment_delete', { p_comment_id: Number(del.getAttribute('data-del')) }); }); return; }
    if (t.id === 'cbPost') {
      var ta = document.getElementById('cbCmt'), text = ta.value.trim(); if (!text) return;
      t.disabled = true;
      act(async function () { await rpc('blast_plan_comment', { p_id: cur, p_body: text }); draft[cur] = ''; });
      return;
    }
    if (t.closest && t.closest('#cbSideT')) { var sd = document.getElementById('cbSide'), o = sd.classList.toggle('open'); document.getElementById('cbSideT').setAttribute('aria-expanded', o); return; }
  });
  document.addEventListener('change', function (e) {
    var id = e.target.id; if (!item(cur) || !(id === 'cbDate' || id === 'cbTime' || id === 'cbLock')) return;
    var b = item(cur), date = b.send_date, time = b.send_time, lock = b.locked;
    if (id === 'cbDate' && e.target.value) date = e.target.value;
    if (id === 'cbTime') time = e.target.value;
    if (id === 'cbLock') lock = e.target.checked;
    b.send_date = date; b.send_time = time; b.locked = lock;   // show it at once; the database answer replaces it
    var d = parts(date); cal = { y: d.getFullYear(), m: d.getMonth() }; render(true);
    act(function () { return rpc('blast_plan_schedule', { p_id: cur, p_date: date, p_time: time, p_lock: lock }); });
  });

  /* drag the tabs (pointer events, so it works on a phone) and arrow keys */
  document.addEventListener('pointerdown', function (e) {
    var g = e.target.closest && e.target.closest('.cb-grip'); if (!g) return;
    e.preventDefault(); var tab = g.closest('.cb-tab'); drag = { tab: tab, box: tab.parentNode }; tab.classList.add('drag'); g.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var sibs = [].slice.call(drag.box.children).filter(function (x) { return x !== drag.tab; }), before = null;
    for (var i = 0; i < sibs.length; i++) { var r = sibs[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { before = sibs[i]; break; } }
    if (before !== drag.tab.nextSibling) drag.box.insertBefore(drag.tab, before);
  });
  function endDrag() {
    if (!drag) return;
    drag.tab.classList.remove('drag');
    setOrd([].slice.call(drag.box.children).map(function (x) { return x.getAttribute('data-id'); }).filter(Boolean));
    drag = null; render(true);
  }
  document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', function (e) {
    var g = e.target.closest && e.target.closest('.cb-grip'); if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    var id = g.closest('.cb-tab').getAttribute('data-id'), o = ord(), i = o.indexOf(id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= o.length) return;
    o.splice(i, 1); o.splice(j, 0, id); setOrd(o); render(true);
    var ng = document.querySelector('.cb-tab[data-id="' + id + '"] .cb-grip'); if (ng) ng.focus();
  });
  document.addEventListener('visibilitychange', function () {   // come back to the tab and see what others wrote
    if (document.visibilityState !== 'visible' || !D) return;
    var ta = document.getElementById('cbCmt'); if (ta && document.activeElement === ta) return;
    reload().then(function () { render(true); });
  });

  KB.ready.then(async function () {
    if (KB.allowed.indexOf('campaign-blasts') < 0) { notFound(); return; }
    try { D = await rpc('blast_plan_get'); } catch (e) { notFound(); return; }
    var h0 = (location.hash || '').slice(1); cur = item(h0) ? h0 : 'all';
    render();
  });
})();
