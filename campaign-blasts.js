/* Campaign Blasts (Kate, 30 Oct 2026), a dashboard page in the Campaigns group (?view=campaignblasts), so the main sidebar stays. Reads and
   writes only through blast_plan_* (migrations/campaign_blasts.sql), which check the level again (old Levels 3 and 5). Nothing here sends a
   message: it is the plan, the schedule and Coach Emma's review. Tab order is a personal setting (localStorage), the rest is shared.
   Needs only sb (the Supabase client) and TRS_LEVEL. */
(function () {
  function main() { return document.getElementById('campaignBlastsContent'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var FOOT = 'If you’d rather not hear from us, reply STOP';
  var ORDER_KEY = 'trs-cbl-order';
  var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var D = null, cur = 'all', cal = null, drag = null, draft = {}, errMsg = '';
  var big = false, calMsg = '', cdrag = null, noClick = false;   // the bigger calendar, a note under it, a blast being dragged to another day
  var TODAY = dubaiToday();
  var LIVE = null, liveErr = false;   // the audience counted from the till (blast_plan_audience); the numbers typed into the plan are only a fallback
  var BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };

  function dubaiToday() {
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      return p;
    } catch (e) { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
  }
  function notFound() {
    var el = main(); if (el) el.innerHTML = '<p class="slv-muted">This page isn’t open to your account.</p>';
  }
  async function rpc(name, args) {
    var r = await sb.rpc(name, args || {});
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
    return '<div class="cbl-phone-wrap"><div class="cbl-phone"><div class="cbl-screen">' +
      '<div class="cbl-status"><span>11:02</span><span class="ic">5G <span class="cbl-batt"></span></span></div>' +
      '<div class="cbl-chat-head"><span class="cbl-back">‹</span><span class="cbl-av"></span><span class="cbl-who">Tara Rose Salons<small>Business account</small></span><span class="cbl-dots">⋮</span></div>' +
      '<div class="cbl-thread"><span class="cbl-day">Today</span><div class="cbl-bub">' +
      (img ? '<img class="cbl-hdr" src="' + esc(img) + '" alt="Header photo from the landing page">' : '') +
      '<div class="cbl-body">' + esc(body) + '</div><div class="cbl-ftr">' + esc(FOOT) + '</div><div class="cbl-time">11:00</div></div>' +
      '<div class="cbl-btn">Tell me more</div></div>' +
      '<div class="cbl-compose"><span class="cbl-input">Message</span><span class="cbl-mic"></span></div></div></div></div>';
  }
  function fmtN(n) { return Number(n || 0).toLocaleString('en-GB'); }
  // The clients behind a number (Kate, 30 Oct 2026: "client numbers should be clickable, and always updated"): the shared list window of drill.js.
  function drillSpec(b, grp) {
    var what = grp === 'warm' ? 'warm' : grp === 'std' ? 'standard' : 'all';
    return {
      title: b.data.title + ', ' + what + ' clients', cur: 'AED',
      sub: 'Who is in this blast right now, counted from the till.' + (grp ? '' : ' Warm and standard together.'),
      views: [{ id: 'clients', label: 'Clients', load: async function () {
        var r = await rpc('blast_plan_clients', { p_blast: b.id, p_group: grp || null });
        var rows = (r.rows || []).map(function (x) { return { c: x.c, b: BR[x.b] || x.b, g: x.g === 'warm' ? 'Warm' : 'Standard', lv: x.lv, s: x.s, v: x.v }; });
        return {
          cols: [{ k: 'c', l: 'Client' }, { k: 'b', l: 'Branch' }, { k: 'g', l: 'Group' }, { k: 'lv', l: 'Last visit', t: 'date' }, { k: 's', l: 'Spent this year', t: 'aed' }, { k: 'v', l: 'Visits this year', t: 'num' }],
          rows: rows, empty: 'Nobody is in this group right now.',
          note: r.total > rows.length ? 'Showing the first ' + fmtN(rows.length) + ' of ' + fmtN(r.total) + '.' : ''
        };
      } }]
    };
  }
  // A client number: counted from the till when we have it ('…' while it is being counted), the typed plan number if the count failed. Opens its list.
  function numHtml(b, key, fallback) {
    if (!LIVE || !LIVE.blasts) return liveErr ? esc(fallback || '') : '…';
    var x = LIVE.blasts[b.id] || { n: 0, warm: 0, std: 0 }, n = x[key], t = fmtN(n);
    return (typeof TRSD !== 'undefined' && n > 0) ? TRSD.num(t, drillSpec(b, key === 'n' ? null : key)) : t;
  }
  function liveNote() {
    if (LIVE && LIVE.asof) return '<span class="cbl-live">Counted from the till, ' + fd(String(LIVE.asof).slice(0, 10)) + '</span>';
    return '<span class="cbl-live">' + (liveErr ? 'Saved count, could not update' : 'Counting from the till…') + '</span>';
  }
  function lane(label, m, img, b, grp) {
    return '<div class="cbl-lane"><div class="cbl-lane-top"><h3>' + label + '</h3><span>' + numHtml(b, grp, m.c) + ' clients</span></div>' +
      '<div class="w">' + (label === 'Warm' ? 'Last visit within 90 days' : 'Last visit 91 days to 6 months ago') + '</div>' + phone(m, img) +
      '<div class="cbl-name">' + esc(m.name) + '</div></div>';
  }

  /* sidebar: calendar and movable tabs */
  function calHtml() {
    var y = cal.y, m = cal.m, off = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
    var it = item(cur), curIso = it ? it.send_date : '';
    var h = '<div class="cbl-cal cbl-card"><div class="cbl-cal-h"><button type="button" data-act="prev" aria-label="Previous month">‹</button><b>' + MN[m] + ' ' + y + '</b><button type="button" data-act="next" aria-label="Next month">›</button></div><div class="cbl-cal-g">';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { h += '<span class="dn' + (d === 'Mon' ? ' m' : '') + '">' + d.slice(0, 2) + '</span>'; });
    for (var i = 0; i < off; i++) h += '<span></span>';
    for (var d = 1; d <= n; d++) {
      var iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var here = ord().filter(function (id) { return item(id).send_date === iso; });
      var dots = here.slice(0, 3).map(function (id) { return '<b class="' + (item(id).locked ? '' : 'plan') + '"></b>'; }).join('');
      h += '<button type="button" data-iso="' + iso + '" class="cbl-d' + (here.length ? ' has' : '') + (iso === TODAY ? ' today' : '') + (iso === curIso ? ' sel' : '') + '" ' +
        (here.length ? 'data-day="' + iso + '" data-drag="' + (here.indexOf(cur) >= 0 ? cur : here[0]) + '" aria-label="' + fd(iso) + ', ' + here.length + ' blasts"' : 'tabindex="-1" disabled') + '>' + d + (dots ? '<i>' + dots + '</i>' : '') + '</button>';
    }
    return h + '</div><div class="cbl-leg"><span><b></b>Locked</span><span><b class="plan"></b>Planned</span></div>' +
      '<p class="cbl-hint">Drag a date with a dot onto another day to move that blast.</p>' + (calMsg ? '<p class="cbl-err" role="alert">' + esc(calMsg) + '</p>' : '') +
      '<button type="button" class="cbl-bigbtn" data-act="big">Bigger calendar</button></div>';
  }
  // The same month, large: every blast is a chip on its day. Drag a chip to another day to move it; click it to open it.
  function bigCalHtml() {
    var y = cal.y, m = cal.m, off = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
    var h = '<div class="cbl-modal" data-act="close"><div class="cbl-bigcal cbl-card" role="dialog" aria-modal="true" aria-label="Calendar of blasts"><div class="cbl-big-h">' +
      '<button type="button" data-act="prev" aria-label="Previous month">‹</button><b>' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m] + ' ' + y + '</b>' +
      '<button type="button" data-act="next" aria-label="Next month">›</button><button type="button" class="cbl-big-x" data-act="close">Close</button></div>' +
      '<p class="cbl-hint">Drag a blast to another day to move it. Click it to open it. Mondays are shaded: that is when blasts go out.</p>' +
      (calMsg ? '<p class="cbl-err" role="alert">' + esc(calMsg) + '</p>' : '') + '<div class="cbl-big-g">';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { h += '<span class="hd">' + d + '</span>'; });
    for (var i = 0; i < off; i++) h += '<span class="pad"></span>';
    for (var d = 1; d <= n; d++) {
      var iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var dow = (off + d - 1) % 7;
      var chips = ord().filter(function (id) { return item(id).send_date === iso; }).map(function (id) {
        var b = item(id);
        return '<a draggable="false" class="cbl-bc ' + cls(b.review) + (b.locked ? ' lk' : '') + '" href="?view=campaignblasts" data-go="' + esc(id) + '" data-drag="' + esc(id) + '" title="' + esc(b.data.title) + '"><span>' + esc(b.data.title) + '</span><small>' + ft(b.send_time) + (b.locked ? ' · locked' : '') + '</small></a>';
      }).join('');
      h += '<div class="cbl-bd' + (dow === 0 ? ' mon' : '') + (iso === TODAY ? ' today' : '') + '" data-iso="' + iso + '"><b>' + d + '</b>' + chips + '</div>';
    }
    var pre = y + '-' + String(m + 1).padStart(2, '0'), inMonth = ord().filter(function (id) { return item(id).send_date.indexOf(pre) === 0; }).sort(function (a, b) { return item(a).send_date < item(b).send_date ? -1 : item(a).send_date > item(b).send_date ? 1 : 0; });
    // On a phone the chips are too small for a name, so the same blasts are listed under the grid.
    var list = inMonth.length ? '<div class="cbl-big-l">' + inMonth.map(function (id) { var b = item(id); return '<a href="?view=campaignblasts" data-go="' + esc(id) + '"><span class="cbl-chip ' + cls(b.review) + '">' + lab(b.review) + '</span> <b>' + esc(b.data.title) + '</b><small>' + fd(b.send_date) + ', ' + ft(b.send_time) + '</small></a>'; }).join('') + '</div>' : '';
    return h + '</div>' + list + '</div></div>';
  }
  function tabsHtml() {
    var h = '<div class="cbl-tabs cbl-card"><h3>Blasts</h3>' +
      '<div class="cbl-tab' + (cur === 'all' ? ' on' : '') + '"><a href="?view=campaignblasts" data-go="all" style="padding-left:12px"><span>All blasts</span></a></div>' +
      '<p class="cbl-hint">Drag the dots to reorder.</p><div id="cblTabs">';
    ord().forEach(function (id) {
      var b = item(id), n = b.comments.length;
      h += '<div class="cbl-tab' + (cur === id ? ' on' : '') + '" data-id="' + esc(id) + '"><button type="button" class="cbl-grip" aria-label="Move ' + esc(b.data.title) + '. Use arrow up and down."></button>' +
        '<a href="?view=campaignblasts" data-go="' + esc(id) + '"><span>' + esc(b.data.title) + '</span><small>' + fd(b.send_date) + ', ' + ft(b.send_time) + '</small></a>' +
        (n ? '<span class="cbl-cc" title="' + n + ' comments">' + n + '</span>' : '') + '<span class="cbl-dot ' + cls(b.review) + '" title="' + lab(b.review) + '"></span></div>';
    });
    return h + '</div></div>';
  }

  /* pages */
  function allHtml() {
    var ids = ord(), ap = ids.filter(function (id) { return item(id).review === 'ok'; }).length, lk = ids.filter(function (id) { return item(id).locked; }).length;
    var rows = ids.map(function (id) {
      var b = item(id);
      return '<div class="cbl-r" data-go="' + esc(id) + '"><a class="cbl-rl" href="?view=campaignblasts" data-go="' + esc(id) + '"><b>' + esc(b.data.title) + '</b></a><span class="cbl-chip ' + cls(b.review) + '">' + lab(b.review) + '</span>' +
        '<small>' + fd(b.send_date) + ', ' + ft(b.send_time) + ' · ' + numHtml(b, 'n', b.data.n) + ' clients' + (b.locked ? ' · time locked' : '') + (b.comments.length ? ' · ' + b.comments.length + ' comments' : '') + '</small></div>';
    }).join('');
    return '<div><div class="cbl-eyebrow">Internal draft</div><h2>November</h2></div>' +
      '<div class="cbl-sum"><span class="cbl-chip"><b>' + ap + ' of ' + ids.length + '</b> approved</span><span class="cbl-chip"><b>' + lk + ' of ' + ids.length + '</b> times locked</span></div>' +
      '<div class="cbl-card cbl-rows">' + rows + '</div>';
  }
  // The campaign's landing page, so Coach Emma can go back to what the client lands on. Only a path on this site is linked.
  function pageCard(b) {
    var u = b.data.page_url;
    if (!u || !/^\/[^\/]/.test(u)) return '';
    // A small live look at the page's first screen (our own page, shown with clicks switched off), scaled to the card; fitPreviews() sets the scale.
    return '<div class="cbl-fact cbl-card cbl-pgc"><small>Landing page</small><a class="cbl-pg" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(b.data.page_name || 'Open the page') + ' ↗</a>' +
      '<a class="cbl-prev" href="' + esc(u) + '" target="_blank" rel="noopener" aria-label="Open the landing page"><iframe src="' + esc(u) + '" loading="lazy" tabindex="-1" aria-hidden="true" title="Preview of the landing page"></iframe></a></div>';
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
      return '<div class="cbl-cm' + (/^emma/i.test(c.by) ? ' emma' : '') + '"><div class="cbl-cm-h"><b>' + esc(c.by) + '</b><span>' + esc(fat(c.at)) +
        (c.mine || D.level === 5 ? ' <button type="button" data-del="' + c.id + '">Delete</button>' : '') + '</span></div><p>' + esc(c.body) + '</p></div>';
    }).join('') : '<p class="cbl-none">No comments yet.</p>';
    var hasWhy = k === 'changes' && b.comments.some(function (c) { return c.by === b.review_by && b.review_at && new Date(c.at) >= new Date(new Date(b.review_at).getTime() - 60000); });
    return '<a class="cbl-back" href="?view=campaignblasts" data-go="all">‹ All blasts</a>' +
      '<div class="cbl-head"><div><div class="cbl-eyebrow">' + fd(b.send_date) + ', ' + ft(b.send_time) + '</div><h2>' + esc(b.data.title) + '</h2></div><span class="cbl-chip ' + cls(k) + '">' + lab(k) + '</span></div>' +
      '<div class="cbl-facts"><div class="cbl-fact cbl-card"><small>Clients</small><b>' + numHtml(b, 'n', b.data.n) + '</b>' + liveNote() + '</div><div class="cbl-fact cbl-card"><small>Who</small>' + esc(b.data.who) + '</div><div class="cbl-fact cbl-card"><small>She gets</small>' + esc(b.data.gets) + '</div>' + '</div>' +
      '<div class="cbl-row2">' + pageCard(b) +
      '<div class="cbl-card cbl-when"><h3>When it goes out</h3>' +
      '<label class="cbl-fld">Date<input type="date" id="cblDate" value="' + b.send_date + '"></label>' +
      '<label class="cbl-fld">Time (Dubai)<select id="cblTime">' + times + '</select></label>' +
      '<label class="cbl-sw"><input type="checkbox" id="cblLock"' + (b.locked ? ' checked' : '') + '><span class="t"></span>' + (b.locked ? 'Time locked' : 'Lock this time') + '</label>' +
      (w.length ? '<p class="cbl-note warn">' + w.join(' ') + '</p>' : '<p class="cbl-note">Mondays, 11 am to 4 pm. This records the plan; the blast is launched from respond.io.</p>') + '</div>' + '</div>' +
      '<div class="cbl-phones">' + lane('Warm', b.data.warm, b.data.img, b, 'warm') + lane('Standard', b.data.std, b.data.img, b, 'std') + '</div>' +
      '<div class="cbl-card cbl-rev"><div class="cbl-rev-top"><h3>Review and comments</h3><div class="cbl-seg" role="group" aria-label="Review">' +
      '<button type="button" data-st="ok" class="ok' + (k === 'ok' ? ' on' : '') + '">Approve</button><button type="button" data-st="changes" class="changes' + (k === 'changes' ? ' on' : '') + '">Needs changes</button></div></div>' +
      (k !== 'none' && b.review_by ? '<div class="cbl-by">' + (k === 'ok' ? 'Approved' : 'Marked needs changes') + ' by ' + esc(b.review_by) + ', ' + esc(fat(b.review_at)) + '</div>' : '') +
      '<div class="cbl-thr">' + thread + '</div>' +
      (k === 'changes' && !hasWhy ? '<p class="cbl-ask">Add a comment so we know what to change.</p>' : '') +
      '<textarea id="cblCmt" maxlength="2000" placeholder="Leave a comment on this blast" aria-label="Comment"></textarea>' +
      (errMsg ? '<p class="cbl-err" role="alert">' + esc(errMsg) + '</p>' : '') +
      '<div class="cbl-row"><button type="button" class="cbl-pill" id="cblPost">Post comment</button><span class="cbl-chip">Posting as ' + esc(D.me) + '</span></div></div>' +
      '<div class="cbl-pager"><a href="?view=campaignblasts" data-go="' + (p || 'all') + '">' + (p ? '‹ Previous blast' : '‹ All blasts') + '</a><a href="?view=campaignblasts" data-go="' + (n || 'all') + '">' + (n ? 'Next blast ›' : 'All blasts ›') + '</a></div>';
  }

  function render(keep) {
    var y = window.scrollY, b = item(cur);
    var sideEl = document.getElementById('cblSide'), sideY = sideEl ? sideEl.scrollTop : 0;   // the sidebar is drawn again each time; keep its place in the list
    if (!cal) {   // the month of this blast, else the month of the next blast to go
      var next = D.items.map(function (i) { return i.send_date; }).filter(function (s) { return s >= TODAY; }).sort()[0];
      var d = b ? parts(b.send_date) : next ? parts(next) : new Date(); cal = { y: d.getFullYear(), m: d.getMonth() };
    }
    var sideOpen = document.getElementById('cblSide') && document.getElementById('cblSide').classList.contains('open');
    var el = main(); if (!el) return;
    el.innerHTML =
      '<section class="cbl-intro"><h2>Campaign Blasts</h2><p>What each WhatsApp blast looks like per campaign, when it goes out, and Coach Emma’s review.</p>' +
      '<p class="cbl-links"><a href="/campaigns/blonde-standard/" target="_blank" rel="noopener">Blonde Standard ↗</a><a href="/campaigns/hair-rhythm/" target="_blank" rel="noopener">The Hair Rhythm ↗</a><a href="/campaigns/hair-extension-plan/" target="_blank" rel="noopener">Hair Extension Plan ↗</a></p></section>' +
      '<div class="cbl"><div class="cbl-shell"><aside class="cbl-side' + (sideOpen ? ' open' : '') + '" id="cblSide">' +
      '<button type="button" class="cbl-side-toggle" id="cblSideT" aria-expanded="' + (sideOpen ? 'true' : 'false') + '"><span>Calendar and blasts</span><span>+</span></button>' +
      '<div class="cbl-side-body">' + calHtml() + tabsHtml() + '</div></aside><div class="cbl-main" id="cblMain">' + (b ? blastHtml(b) : allHtml()) + '</div></div>' + (big ? bigCalHtml() : '') + '</div>';
    var ta = document.getElementById('cblCmt');
    if (ta) { ta.value = draft[cur] || ''; ta.oninput = function () { draft[cur] = ta.value; }; }
    fitPreviews();
    var sideNew = document.getElementById('cblSide'); if (sideNew && sideY) sideNew.scrollTop = sideY;
    // The dashboard sets scroll-behavior:smooth, which turned this restore into a slow scroll back up from the top. Instant keeps you where you were.
    if (keep) window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  }
  function fitPreviews() {   // the preview is drawn 1280 wide and shrunk to whatever width its card has
    var el = main(); if (!el) return;
    [].forEach.call(el.querySelectorAll('.cbl-prev'), function (p) { if (p.clientWidth) p.style.setProperty('--cbl-s', p.clientWidth / 1280); });
  }
  var fitTimer = null;
  window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(fitPreviews, 120); });
  function go(id, keepMonth) {
    cur = id; errMsg = ''; calMsg = ''; big = false;
    var b = item(id); if (b && !keepMonth) { var d = parts(b.send_date); cal = { y: d.getFullYear(), m: d.getMonth() }; }
    render(true); toTop();   // stay where you are; toTop only moves when the blast's top is above the screen
  }
  // Opening another blast: only move if its top is above the screen, and then jump, never glide.
  function toTop() {
    var el = document.getElementById('cblMain'); if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.top < 60) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 140), left: 0, behavior: 'instant' });
  }
  async function loadLive() {
    try { LIVE = await rpc('blast_plan_audience'); liveErr = false; } catch (e) { console.error(e); liveErr = true; }
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
    var root = main(); if (!root || !D || !root.contains(e.target)) return;
    var t = e.target;
    if (t.closest && t.closest('.dn')) { e.preventDefault(); return; }   // a client number: drill.js opens its list
    var a = t.closest && t.closest('[data-go]');
    if (a) { e.preventDefault(); go(a.getAttribute('data-go')); return; }
    var c = t.closest && t.closest('[data-act]');
    if (c && c.getAttribute('data-act') === 'big') { big = true; calMsg = ''; render(true); return; }
    if (c && c.getAttribute('data-act') === 'close') { if (c.classList.contains('cbl-modal') && t !== c) return; big = false; calMsg = ''; render(true); return; }
    if (c) { var dm = c.getAttribute('data-act') === 'next' ? 1 : -1; cal.m += dm; if (cal.m > 11) { cal.m = 0; cal.y++; } if (cal.m < 0) { cal.m = 11; cal.y--; } render(true); return; }
    var dd = t.closest && t.closest('[data-day]');
    if (dd) { var first = ord().filter(function (id) { return item(id).send_date === dd.getAttribute('data-day'); })[0]; if (first) go(first, true); return; }
    var st = t.closest && t.closest('[data-st]');
    if (st) { var b = item(cur), v = st.getAttribute('data-st'); act(function () { return rpc('blast_plan_review', { p_id: cur, p_status: b.review === v ? 'none' : v }); }); return; }
    var del = t.closest && t.closest('[data-del]');
    if (del) { if (!confirm('Delete this comment?')) return; act(function () { return rpc('blast_plan_comment_delete', { p_comment_id: Number(del.getAttribute('data-del')) }); }); return; }
    if (t.id === 'cblPost') {
      var ta = document.getElementById('cblCmt'), text = ta.value.trim(); if (!text) return;
      t.disabled = true;
      act(async function () { await rpc('blast_plan_comment', { p_id: cur, p_body: text }); draft[cur] = ''; });
      return;
    }
    if (t.closest && t.closest('#cblSideT')) { var sd = document.getElementById('cblSide'), o = sd.classList.toggle('open'); document.getElementById('cblSideT').setAttribute('aria-expanded', o); return; }
  });
  document.addEventListener('change', function (e) {
    var id = e.target.id; if (!D || !main() || !item(cur) || !(id === 'cblDate' || id === 'cblTime' || id === 'cblLock')) return;
    var b = item(cur), date = b.send_date, time = b.send_time, lock = b.locked;
    if (id === 'cblDate' && e.target.value) date = e.target.value;
    if (id === 'cblTime') time = e.target.value;
    if (id === 'cblLock') lock = e.target.checked;
    b.send_date = date; b.send_time = time; b.locked = lock;   // show it at once; the database answer replaces it
    var d = parts(date); cal = { y: d.getFullYear(), m: d.getMonth() }; render(true);
    act(function () { return rpc('blast_plan_schedule', { p_id: cur, p_date: date, p_time: time, p_lock: lock }); });
  });

  /* drag a blast to another day, on the small or the big calendar (pointer events, so it works on a phone) */
  document.addEventListener('pointerdown', function (e) {
    var s = e.target.closest && e.target.closest('[data-drag]'); if (!s || e.button || !main() || !main().contains(s)) return;
    cdrag = { id: s.getAttribute('data-drag'), x: e.clientX, y: e.clientY, on: false, src: s, ghost: null, over: null };
  });
  function dayAt(x, y) { var el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('[data-iso]') : null; }
  document.addEventListener('pointermove', function (e) {
    if (!cdrag) return;
    if (!cdrag.on) {
      if (Math.abs(e.clientX - cdrag.x) + Math.abs(e.clientY - cdrag.y) < 8) return;
      var b = item(cdrag.id); if (!b) { cdrag = null; return; }
      cdrag.on = true; calMsg = ''; cdrag.src.classList.add('dragging');
      cdrag.ghost = document.createElement('div'); cdrag.ghost.className = 'cbl-ghost'; cdrag.ghost.textContent = b.data.title; document.body.appendChild(cdrag.ghost);
    }
    cdrag.ghost.style.left = e.clientX + 12 + 'px'; cdrag.ghost.style.top = e.clientY + 12 + 'px';
    var t = dayAt(e.clientX, e.clientY);
    if (t !== cdrag.over) { if (cdrag.over) cdrag.over.classList.remove('over'); cdrag.over = t; if (t) t.classList.add('over'); }
  });
  function endCalDrag(e, cancel) {
    if (!cdrag) return;
    var c = cdrag; cdrag = null;
    if (!c.on) return;   // a plain click: let it through
    noClick = true; setTimeout(function () { noClick = false; }, 60);
    if (c.ghost) c.ghost.remove();
    if (c.over) c.over.classList.remove('over');
    c.src.classList.remove('dragging');
    var t = cancel ? null : dayAt(e.clientX, e.clientY), b = item(c.id);
    if (!t || !b || !main()) return;
    var iso = t.getAttribute('data-iso'); if (iso === b.send_date) return;
    if (b.locked) { calMsg = b.data.title + ' has its time locked. Open it, switch the lock off, then move it.'; render(true); return; }
    b.send_date = iso;   // show it at once; the database answer replaces it
    render(true);
    act(function () { return rpc('blast_plan_schedule', { p_id: b.id, p_date: iso, p_time: b.send_time, p_lock: b.locked }); });
  }
  document.addEventListener('pointerup', function (e) { endCalDrag(e, false); });
  document.addEventListener('pointercancel', function (e) { endCalDrag(e, true); });
  document.addEventListener('click', function (e) { if (noClick) { noClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && big && main()) { big = false; render(true); } });

  /* drag the tabs (pointer events, so it works on a phone) and arrow keys */
  document.addEventListener('pointerdown', function (e) {
    var g = e.target.closest && e.target.closest('.cbl-grip'); if (!g) return;
    e.preventDefault(); var tab = g.closest('.cbl-tab'); drag = { tab: tab, box: tab.parentNode }; tab.classList.add('drag'); g.setPointerCapture(e.pointerId);
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
    var g = e.target.closest && e.target.closest('.cbl-grip'); if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    var id = g.closest('.cbl-tab').getAttribute('data-id'), o = ord(), i = o.indexOf(id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= o.length) return;
    o.splice(i, 1); o.splice(j, 0, id); setOrd(o); render(true);
    var ng = document.querySelector('.cbl-tab[data-id="' + id + '"] .cbl-grip'); if (ng) ng.focus();
  });
  document.addEventListener('visibilitychange', function () {   // come back to the tab and see what others wrote
    if (document.visibilityState !== 'visible' || !D || !main() || main().offsetParent === null) return;
    var ta = document.getElementById('cblCmt'); if (ta && document.activeElement === ta) return;
    Promise.all([reload(), loadLive()]).then(function () { render(true); });
  });

  // Called by showView each time the page opens: read what the database says now, then draw.
  window.renderCampaignBlasts = async function () {
    var el = main(); if (!el) return;
    if (typeof TRS_LEVEL === 'undefined' || (TRS_LEVEL !== 3 && TRS_LEVEL !== 5)) { notFound(); return; }
    cur = 'all'; cal = null; errMsg = '';   // the sidebar row is the way back to the overview
    if (!D) el.innerHTML = '<section class="cbl-intro"><h2>Campaign Blasts</h2></section><p class="slv-muted">Loading…</p>';
    try { D = await rpc('blast_plan_get'); } catch (e) { console.error(e); notFound(); return; }
    if (cur !== 'all' && !item(cur)) cur = 'all';
    render();
    loadLive().then(function () { if (main() && main().offsetParent !== null) render(true); });   // the counts come a moment after the page
  };
})();
