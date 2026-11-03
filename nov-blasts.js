/* November Blasts (Kate, 2 Nov 2026), a dashboard page in Tools (?view=novblasts), so the main sidebar stays. The database blasts for November, planned from the 2 Nov Zoom
   with Coach Emma. Three lanes, one per reader: Messages (everyone, Emma approves here), Before sending (Kate's list) and Replies (the call centre:
   what to say when she writes back, and the terms). A next-action card sits above them. Redesigned 2 Nov 2026 (docs/mockups/nov-blasts-redesign.html in the cowork repo).
   3 Nov 2026 (Kate): Decisions are gone (Emma and Kate met), and Messages is laid out like Campaign Blasts: calendar and blast list on the left, the Warm and the Standard
   phone side by side. It reuses the cbl- classes of campaign-blasts.css, which index.html loads for every page.
   Reads and writes only through nov_blast_* (migrations/nov_blasts.sql and nov_blasts_v2.sql), which check the level again (old Levels 3 and 5 edit; a person opened
   for Campaign Blasts reads). Counts are LIVE from the till. All words (messages, decisions, checklist, replies, terms) live in the database, none here. Nothing here
   sends a message. Needs only sb (the Supabase client), TRS_LEVEL, TRSD. */
(function () {
  function main() { return document.getElementById('novBlastsContent'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtN(n) { return Number(n || 0).toLocaleString('en-GB'); }
  var BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' }, BKEYS = ['SAA', 'KCA', 'MC', 'AQ'];
  var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TABS = ['messages', 'before', 'replies'];
  var RATE_AED = 0.21;   // one delivered marketing message: October measured USD 0.044 to 0.055 and Meta raised UAE rates on 1 Oct 2026, so the higher figure; undelivered ones are not charged
  var D = null, LIVE = null, liveErr = false, counting = false, tab = 'messages', cur = '', rb = '', dec = null, more = '', opened = {}, copied = false, sched = false, sim = {}, cal = null, sideOpen = false;
  var errMsg = '', wantBlast = '', wantTab = '', firstOpen = true, bound = false;
  window.nvbUrlParts = function () {
    var p = [], first = D && D.items.filter(isBlast)[0], b = D ? cur : wantBlast, t = D ? tab : (wantTab || 'messages');
    if (t && t !== 'messages') p.push('tab=' + encodeURIComponent(t));
    if (b && (!first || b !== first.id)) p.push('blast=' + encodeURIComponent(b));
    return p;
  };
  function syncUrl() { try { if (typeof trSyncUrl === 'function' && typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'novblasts') trSyncUrl(null); } catch (e) { /* fine without it */ } }
  function notFound() { var el = main(); if (el) el.innerHTML = '<p class="slv-muted">This page isn’t open to your account yet. Ask Kate to open it for you.</p>'; }
  async function rpc(name, args) { var r = await sb.rpc(name, args || {}); if (r.error) throw new Error(r.error.message); return r.data; }
  function canEdit() { return !D || D.editor !== false; }
  function isBlast(i) { return i.id.indexOf('dec') !== 0 && ['oct', 'pre', 'reply', 'terms', 'diff'].indexOf(i.id) < 0; }
  function blasts() { return D.items.filter(isBlast); }
  function decs() { return D.items.filter(function (i) { return i.id.indexOf('dec') === 0; }); }
  function item(id) { return D.items.filter(function (i) { return i.id === id; })[0]; }
  function blast(id) { var b = item(id); return b && isBlast(b) ? b : blasts()[0]; }
  function pickOf(n) { var r = (D.decisions || []).filter(function (d) { return d.idx === n; })[0]; return r && r.pick != null ? r.pick : null; }
  function openDecs() { return decs().map(function (d, i) { return pickOf(i + 1) == null ? i : -1; }).filter(function (i) { return i >= 0; }); }
  function tasks() { var p = item('pre'); return p && p.data && p.data.tasks ? p.data.tasks : []; }
  function isDone(id) { return (D.checks || []).some(function (c) { return c.id === id; }); }
  function openTasks() { return tasks().filter(function (t) { return !isDone(t.id); }); }
  function approved() { return blasts().filter(function (b) { return b.review === 'ok'; }).length; }
  function parts(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function fdate(iso) { var d = parts(iso); return DN[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()]; }
  function fat(iso) { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); } catch (e) { return iso; } }
  function aqDate(b) { return b.data.aq_date || b.data.date; }
  function fmtClock(mins) { var h = Math.floor(mins / 60), m = mins % 60; return (h > 12 ? h - 12 : h) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); }
  // Why the audience is split in two (Kate, 2 Nov 2026: "is it indicated naman doon kung bakit ganon yung split?"). A recent visit gets the warmer wording. The cutoff
  // moves a day every day, so the line says which date it was on when the clients were counted.
  var WHY_SPLIT = 'A recent visit gets the warmer wording: in October, clients who had written to us replied about 8% and colder clients about 3%.';
  function warmSince() {
    if (!LIVE || !LIVE.at) return '';
    try {
      var dub = new Date(LIVE.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }), p = dub.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      d.setUTCDate(d.getUTCDate() - 90);
      return ' (since ' + d.getUTCDate() + ' ' + MN[d.getUTCMonth()] + ' at the last count; it moves a day every day)';
    } catch (e) { return ''; }
  }
  function lv(id) { return LIVE && LIVE.blasts ? (LIVE.blasts[id] || { n: 0, warm: 0, std: 0, SAA: 0, KCA: 0, MC: 0, AQ: 0, ext: 0, blonde: 0, colour: 0 }) : null; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* the clients behind a number (Kate's rule, 27 Oct: every figure with a value opens its rows), the shared list window of drill.js */
  function drillSpec(title, args, showBlast) {
    return {
      title: title, cur: 'AED', sub: 'Who is in this blast right now, counted from our sales records.',
      views: [{ id: 'clients', label: 'Clients', load: async function () {
        var r = await rpc('nov_blast_clients', args);
        var names = {}; blasts().forEach(function (b) { names[b.id] = b.data.short || b.data.title; });
        var rows = (r.rows || []).map(function (x) { return { c: x.c, b: BR[x.b] || x.b, k: names[x.k] || x.k, g: x.g === 'warm' ? 'Warm' : 'Standard', lv: x.lv, s: x.s }; });
        var cols = [{ k: 'c', l: 'Client' }, { k: 'b', l: 'Salon' }];
        if (showBlast) cols.push({ k: 'k', l: 'Blast' });
        cols.push({ k: 'g', l: 'Group' }, { k: 'lv', l: 'Last visit', t: 'date' }, { k: 's', l: 'Spent this year', t: 'aed' });
        return { cols: cols, rows: rows, empty: 'Nobody is in this group right now.', note: r.total > rows.length ? 'Showing the first ' + fmtN(rows.length) + ' of ' + fmtN(r.total) + '.' : '' };
      } }]
    };
  }
  function num(n, title, args, showBlast) {
    var t = fmtN(n);
    return (typeof TRSD !== 'undefined' && n > 0 && canEdit()) ? TRSD.num(t, drillSpec(title, args, showBlast)) : t;
  }
  // a decision's live figure: [label, blast id, n | ext | blonde | colour]
  function figOf(f) {
    var c = lv(f[1]), b = item(f[1]);
    if (!c) return liveErr ? '?' : '…';
    var title = (b ? b.data.short || b.data.title : f[1]) + ', ' + f[0].toLowerCase();
    return num(c[f[2]], title, f[2] === 'n' ? { p_blast: f[1] } : { p_blast: f[1], p_flag: f[2] });
  }
  function sub(t, end) { return esc(t).replace(/\{\{1\}\}/g, '<mark>Layla</mark>').replace(/\{\{2\}\}/g, '<mark>Saadiyat</mark>').replace(/\{\{3\}\}/g, '<mark>' + esc(end || '30 November 2026') + '</mark>'); }

  /* ---------- the top of the page ---------- */
  function nextHtml() {
    var od = openDecs(), pre = item('pre'), nx = (pre && pre.data && pre.data.next) || {}, h, ot = openTasks()[0], unrev = blasts().length - approved();
    if (od.length) h = { t: 'Settle the ' + plural(od.length, 'open decision', 'open decisions') + ' with Coach Emma.', o: (nx.decide || {}).owner || 'Kate, with Coach Emma', by: (nx.decide || {}).by, btn: 'Start with decision ' + (od[0] + 1), go: 'decide:' + od[0] };
    else if (unrev > 0) h = { t: 'Read ' + (unrev === 1 ? 'the last message' : 'the ' + unrev + ' messages') + ' and approve ' + (unrev === 1 ? 'it' : 'each one') + '.', o: (nx.review || {}).owner || 'Coach Emma', by: (nx.review || {}).by, btn: 'Open the messages', go: 'messages' };
    else if (ot) h = { t: ot.t + '.', o: ot.owner, by: ot.due, btn: 'Open the list', go: 'before' };
    else h = { t: 'Everything on the list is done.', o: 'Kate', by: '', btn: 'Open the messages', go: 'messages' };
    return '<div class="nvb-card nvb-next"><div><span class="eyebrow">Next action</span><h2>' + esc(h.t) + '</h2><div class="meta"><span>Owner <b>' + esc(h.o) + '</b></span>' + (h.by ? '<span>By <b>' + esc(h.by) + '</b></span>' : '') + '</div></div>' +
      '<div class="go"><button type="button" class="nvb-btn pri" data-nvb="goto:' + esc(h.go) + '">' + esc(h.btn) + '</button></div></div>';
  }
  function numsHtml() {
    var total = LIVE && LIVE.blasts ? blasts().reduce(function (a, b) { return a + (lv(b.id).n || 0); }, 0) : null;
    var days = {}; blasts().forEach(function (b) { days[b.data.date] = 1; days[aqDate(b)] = 1; });
    var dl = Object.keys(days).sort().map(fdate);
    var tot = total == null ? (liveErr ? '?' : '…') : num(total, 'November blasts, every client', {}, true);
    var cost = total == null ? '…' : 'AED ' + fmtN(Math.round(total * RATE_AED));
    return '<p class="nvb-small nvb-lines"><b>' + tot + '</b> messages in ' + blasts().length + ' blasts, one per client, on ' + esc(dl.join(' and ')) + '. At most <b>' + cost + '</b>: a message that is not delivered is not charged.</p>' + countedHtml();
  }
  // When the clients were counted (the count is kept for up to an hour because counting takes about 20 seconds), and a way to count again.
  function countedHtml() {
    if (counting) return '<p class="nvb-small nvb-counted">Counting the clients again, about 20 seconds…</p>';
    if (!LIVE || !LIVE.at) return '';
    return '<p class="nvb-small nvb-counted">Clients counted ' + esc(fat(LIVE.at)) + ', Dubai time, from our sales records. ' + (canEdit() ? '<button type="button" class="nvb-link" data-nvb="recount">Count again</button>' : '') + '</p>';
  }
  function tabsHtml() {
    var t = [['decide', 'Decisions', 'Coach Emma', openDecs().length], ['messages', 'Messages', 'Everyone', 0], ['before', 'Before sending', 'Kate', openTasks().length], ['replies', 'Replies', 'Call centre', 0]].filter(function (x) { return x[0] !== 'decide' || decs().length; });
    return '<div class="nvb-tabs" role="tablist">' + t.map(function (x) {
      return '<button type="button" role="tab" class="' + (tab === x[0] ? 'on' : '') + '" data-nvb="tab:' + x[0] + '" aria-selected="' + (tab === x[0]) + '"><b>' + x[1] + '</b><span>' + x[2] + '</span>' + (x[3] ? '<i class="dot" aria-label="' + x[3] + ' open">' + x[3] + '</i>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function fold(id, head, small, inner, extra) {
    return '<details class="nvb-fold ' + (extra || '') + '" data-fold="' + id + '"' + (opened[id] ? ' open' : '') + '><summary><span>' + head + (small ? ' <small>' + small + '</small>' : '') + '</span></summary><div class="in">' + inner + '</div></details>';
  }

  /* ---------- lane 1: Decisions, Coach Emma ---------- */
  function decideHtml() {
    var ds = decs(); if (!ds.length) return '<div class="nvb-pane"><h2>Decisions</h2><p class="lead">No decisions are set up.</p></div>';
    var od = openDecs(); if (dec == null || dec >= ds.length) dec = od.length ? od[0] : 0;
    var d = ds[dec], p = pickOf(dec + 1), o = d.data.o || [], ed = canEdit(), figs = d.data.figs || [];
    var dots = ds.map(function (x, i) { var dn = pickOf(i + 1) != null; return '<button type="button" class="' + (i === dec ? 'cur ' : '') + (dn ? 'done' : '') + '" data-nvb="go:' + i + '" aria-label="Decision ' + (i + 1) + (dn ? ', decided' : ', open') + '">' + (i + 1) + '</button>'; }).join('');
    var nxt = od.filter(function (i) { return i !== dec; }), after = nxt.filter(function (i) { return i > dec; })[0];
    var by = p != null ? (function () { var r = (D.decisions || []).filter(function (z) { return z.idx === dec + 1; })[0]; return r ? 'Chosen by ' + esc(r.by) + ', ' + esc(fat(r.at)) + '. ' + (ed ? '<button type="button" class="nvb-link" data-nvb="clear">Undo</button>' : '') : ''; })() : '';
    return '<div class="nvb-pane"><h2>Decisions</h2><p class="lead">For Coach Emma. One call at a time, nothing goes to Meta before these are settled. ' + od.length + ' of ' + ds.length + ' still open.</p>' +
      '<div class="nvb-card nvb-dec"><div class="nvb-dec-top"><span class="eyebrow">Decision ' + (dec + 1) + ' of ' + ds.length + (p != null ? ' · decided' : ' · open') + '</span><div class="nvb-dots">' + dots + '</div></div>' +
      '<h3>' + esc(d.data.q) + '</h3><p class="why">' + esc(d.data.why) + '</p>' +
      (figs.length ? '<div class="nvb-figs">' + figs.map(function (f) { return '<span>' + esc(f[0]) + ' <b>' + figOf(f) + '</b></span>'; }).join('') + '</div>' : '') +
      '<div class="nvb-opts">' + o.map(function (x, i) {
        return '<button type="button" class="nvb-opt' + (p === i ? ' sel' : '') + '"' + (ed ? ' data-nvb="pick:' + i + '"' : ' disabled') + '><b>' + esc(x[0]) + (x[2] ? ' <span class="chip rec">Suggested</span>' : '') + '</b><span>' + esc(x[1]) + '</span></button>';
      }).join('') + '</div>' + (by ? '<div class="nvb-by">' + by + '</div>' : '') +
      '<div class="nvb-dec-nav"><button type="button" class="nvb-btn" ' + (dec === 0 ? 'disabled' : 'data-nvb="go:' + (dec - 1) + '"') + '>Back</button>' +
      (nxt.length ? '<button type="button" class="nvb-btn pri" data-nvb="go:' + (after != null ? after : nxt[0]) + '">Next open decision</button>' : '<button type="button" class="nvb-btn pri" data-nvb="tab:messages">All decided. Read the messages</button>') + '</div></div>' +
      '<div class="nvb-card nvb-review-line"><span><b>Messages approved: ' + approved() + ' of ' + blasts().length + '.</b> <span class="nvb-small">Emma reads each message, then approves it.</span></span><button type="button" class="nvb-btn" data-nvb="tab:messages">Read and approve</button></div></div>';
  }

  /* ---------- lane 2: Messages ---------- */
  /* The Messages lane, laid out like Campaign Blasts (Kate, 3 Nov 2026: "same interface, put the calendar in this for the messages"): the calendar and the list of
     blasts on the left, the blast on the right with the Warm and the Standard phone side by side. The cbl- classes come from campaign-blasts.css. */
  function dubaiToday() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { var n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
  }
  function byDate(a, b) { return a.data.date < b.data.date ? -1 : a.data.date > b.data.date ? 1 : (a.data.time < b.data.time ? -1 : a.data.time > b.data.time ? 1 : 0); }
  function sorted() { return blasts().slice().sort(byDate); }
  function lab(k) { return k === 'ok' ? 'Approved' : k === 'changes' ? 'Needs changes' : 'Waiting for review'; }
  function rcls(k) { return k === 'ok' || k === 'changes' ? k : ''; }
  function tclock(t, add, suffix) {   // the clock in the phone follows the time the blast is set to go out
    var q = String(t || '12:00').split(':'), tot = (+q[0] || 0) * 60 + (+q[1] || 0) + (add || 0), h = Math.floor(tot / 60) % 24, m = tot % 60;
    return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + (suffix ? ' ' + (h >= 12 ? 'pm' : 'am') : '');
  }
  function calSide() {
    var bs = blasts(), b = blast(cur);
    if (!cal) { var cd = b ? parts(b.data.date) : new Date(); cal = { y: cd.getFullYear(), m: cd.getMonth() }; }
    var y = cal.y, mo = cal.m, off = (new Date(y, mo, 1).getDay() + 6) % 7, n = new Date(y, mo + 1, 0).getDate(), curIso = b ? b.data.date : '', today = dubaiToday(), byDay = {};
    bs.forEach(function (x) { [x.data.date, aqDate(x)].forEach(function (iso) { byDay[iso] = byDay[iso] || []; if (byDay[iso].indexOf(x.id) < 0) byDay[iso].push(x.id); }); });
    var h = '<div class="cbl-cal cbl-card"><div class="cbl-cal-h"><button type="button" data-nvb="cal:prev" aria-label="Previous month">‹</button><b>' + MN[mo] + ' ' + y + '</b><button type="button" data-nvb="cal:next" aria-label="Next month">›</button></div><div class="cbl-cal-g">';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { h += '<span class="dn' + (d === 'Mon' ? ' m' : '') + '">' + d.slice(0, 2) + '</span>'; });
    for (var i = 0; i < off; i++) h += '<span></span>';
    for (var d = 1; d <= n; d++) {
      var iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), here = byDay[iso] || [];
      h += '<button type="button" class="cbl-d' + (here.length ? ' has' : '') + (iso === today ? ' today' : '') + (iso === curIso ? ' sel' : '') + '" ' + (here.length ? 'data-nvb="day:' + iso + '" aria-label="' + esc(fdate(iso)) + ', ' + plural(here.length, 'blast', 'blasts') + '"' : 'tabindex="-1" disabled') + '>' + d +
        (here.length ? '<i>' + here.slice(0, 3).map(function () { return '<b class="plan"></b>'; }).join('') + '</i>' : '') + '</button>';
    }
    return h + '</div><div class="cbl-leg"><span><b class="plan"></b>Planned</span></div><p class="cbl-hint">Pick a day with a dot to open its blast. To move one, use Change day or time on the blast.</p></div>';
  }
  function listSide() {
    var bs = sorted(), rev = bs.filter(function (x) { return x.review === 'ok' || x.review === 'changes'; }).length;
    return '<div class="cbl-tabs cbl-card"><h3>Blasts</h3><div>' + bs.map(function (b) {
      return '<div class="cbl-tab' + (cur === b.id ? ' on' : '') + '"><a href="?view=novblasts" data-nvb="sel:' + esc(b.id) + '" style="padding-left:12px"><span>' + esc(b.data.short || b.data.title) + '</span><small>' + esc(fdate(b.data.date)) + ', ' + esc(fmtClock(clockMins(b))) + '</small></a>' +
        '<span class="cbl-dot ' + rcls(b.review) + '" title="' + lab(b.review) + '"></span></div>';
    }).join('') + '</div><p class="cbl-hint cbl-prog"><b>' + rev + ' of ' + bs.length + '</b> reviewed</p></div>';
  }
  function phoneHtml(text, d, b) {
    var body = String(text).replace(/\{\{1\}\}/g, 'Layla').replace(/\{\{2\}\}/g, 'Saadiyat').replace(/\{\{3\}\}/g, d.end || '30 November 2026').replace(/\. /g, '.\n\n').replace(/: /g, ':\n');
    return '<div class="cbl-phone-wrap"><div class="cbl-phone"><div class="cbl-screen">' +
      '<div class="cbl-status"><span>' + tclock(d.time, 2) + '</span><span class="ic">5G <span class="cbl-batt"></span></span></div>' +
      '<div class="cbl-chat-head"><span class="cbl-back">‹</span><span class="cbl-av"></span><span class="cbl-who">Tara Rose Salons<small>Business account</small></span><span class="cbl-dots">⋮</span></div>' +
      '<div class="cbl-thread"><span class="cbl-day">Today</span><div class="cbl-bub">' + (d.img ? '<img class="cbl-hdr" src="' + esc(d.img) + '" alt="Header image">' : (d.tkey ? '<div class="nvb-artph" role="img" aria-label="Artwork goes here"><b>Artwork goes here</b><span>Hanneh’s image, 1200 by 628 pixels</span></div>' : '')) +
      '<div class="cbl-body">' + esc(body) + '</div><div class="cbl-ftr">' + esc(d.footer) + '</div><div class="cbl-time">' + tclock(d.time, 0, true) + '</div></div>' + simHtml(b) + '</div>' +
      '<div class="cbl-compose"><span class="cbl-input">Message</span><span class="cbl-mic"></span></div></div></div></div>';
  }
  function laneHtml(label, grp, b, c) {
    var d = b.data, m = d.msg && d.msg[grp]; if (!m) return '';
    var n = c ? (grp === 'warm' ? c.warm : c.std) : null;
    var cnt = c ? num(n, d.title + ', ' + label.toLowerCase() + ' clients', { p_blast: b.id, p_group: grp }) : (liveErr ? '?' : '…');
    return '<div class="cbl-lane"><div class="cbl-lane-top"><h3>' + label + '</h3><span>' + cnt + ' clients</span></div>' +
      '<div class="w">' + (grp === 'warm' ? 'Last visit within 90 days' : 'Last visit 91 days to 6 months ago') + '</div>' + phoneHtml(m, d, b) + '</div>';
  }
  function blastMain(b) {
    var d = b.data, c = lv(b.id), rv = b.review, ed = canEdit(), tl = d.title, ids = sorted().map(function (x) { return x.id; }), i = ids.indexOf(b.id), pv = ids[i - 1], nx = ids[i + 1];
    var showWarm = c ? c.warm > 0 : true, lanes = (showWarm ? laneHtml('Warm', 'warm', b, c) : '') + laneHtml('Standard', 'std', b, c);
    var who = '<p>' + esc(d.who) + '</p>' +
      (b.id === 'E' && c ? '<p>Had colour in the last 12 months: <b>' + num(c.colour, tl + ', had colour', { p_blast: b.id, p_flag: 'colour' }) + '</b> · The rest: <b>' + fmtN(c.n - c.colour) + '</b></p>' : '') +
      (c && c.unchecked ? '<p class="nvb-wa-note"><b>WhatsApp check:</b> ' + fmtN(c.unchecked) + ' of these ' + fmtN(c.n) + ' have not been checked in respond.io yet. The overnight check does it; Count again tomorrow morning. Numbers that are landlines, invalid, or not found there are left out (SMS-only).</p>' : '') +
      '<p><b>No repeats.</b> Left out: anyone messaged in October’s Lost Clients blasts or Wellness Voucher blasts 3 and 4, by name and by phone number, anyone we wrote to on WhatsApp since 9 Oct, and every opt-out. Not checked: Wellness Voucher blasts 1 and 2 (August), their recipients are only in GHL.</p>';
    var facts = '<div class="nvb-facts"><div><b>Cost, at most</b>' + (c ? 'AED ' + fmtN(Math.round(c.n * RATE_AED)) : '…') + '</div><div><b>Target by 30 Nov</b>' + esc(d.gold) + '</div><div><b>Message test</b>' + esc(d.arms) + '</div><div><b>Valid until</b>' + esc(d.valid || '30 November 2026') + '</div></div>';
    return '<div class="cbl-pos"><a href="?view=novblasts" data-nvb="sel:' + esc(pv || b.id) + '"' + (pv ? '' : ' class="off"') + '>‹ Previous</a><span>Blast ' + (i + 1) + ' of ' + ids.length + '</span><a href="?view=novblasts" data-nvb="sel:' + esc(nx || b.id) + '"' + (nx ? '' : ' class="off"') + '>Next ›</a></div>' +
      '<div class="cbl-head"><div><div class="cbl-eyebrow">' + esc(fdate(d.date)) + ', ' + esc(fmtClock(clockMins(b))) + (aqDate(b) !== d.date ? '. Al Quoz: ' + esc(fdate(aqDate(b))) : '') + '</div><h2>' + esc(d.title) + '</h2></div><span class="cbl-chip ' + rcls(rv) + '">' + lab(rv) + '</span></div>' +
      '<div class="cbl-card cbl-nums"><div><small>Clients</small><b>' + (c ? num(c.n, tl + ', every client', { p_blast: b.id }) : (liveErr ? '?' : '…')) + '</b><span class="cbl-live">' + (ed ? 'Tap the number to see the clients.' : '') + '</span></div>' +
      '<div><small>Who</small>' + esc(d.who) + '</div><div><small>She gets</small>' + esc(d.gets || d.valid || '') + '</div></div>' +
      '<div class="cbl-card cbl-when cbl-kate"><h3>Kate: schedule</h3><div class="nvb-schrow">' + (schedHtml(b) || '<p class="nvb-small">Kate sets the day and time.</p>') + '</div></div>' +
      '<div class="cbl-phones" id="nvbPhones">' + lanes + '</div>' +
      '<div class="nvb-after nvb-afterrow">' + (d.tkey ? '<button type="button" class="nvb-btn" data-nvb="terms:' + esc(b.id) + '">Terms</button>' : '<span class="nvb-small nvb-noterms">No terms: no offer in this message.</span>') +
      '<button type="button" class="nvb-btn' + (sim[b.id] ? ' pri' : '') + '" data-nvb="sim:' + esc(b.id) + '" aria-pressed="' + (sim[b.id] ? 'true' : 'false') + '">If she replies</button></div>' +
      (sim[b.id] ? '<p class="nvb-small nvb-afterrow">What the call centre says, and the terms, are in <button type="button" class="nvb-lnk" data-nvb="reply:' + esc(b.id) + '">Replies</button>.</p>' : '') +
      '<p class="nvb-small nvb-afterrow">Warm: last visit in the last 90 days' + warmSince() + '. ' + WHY_SPLIT + '</p>' +
      '<div class="cbl-card cbl-rev" id="nvbReview"><div class="cbl-rev-top"><h3>Emma: review</h3>' + (ed
        ? '<div class="cbl-seg" role="group" aria-label="Review"><button type="button" data-nvb="rev:ok" class="ok' + (rv === 'ok' ? ' on' : '') + '">Approve</button><button type="button" data-nvb="rev:changes" class="changes' + (rv === 'changes' ? ' on' : '') + '">Needs changes</button></div>'
        : '<span class="cbl-chip ' + rcls(rv) + '">' + lab(rv) + '</span>') + '</div>' +
      (rv !== 'none' && b.review_by ? '<div class="cbl-by">' + (rv === 'ok' ? 'Approved' : 'Marked needs changes') + ' by ' + esc(b.review_by) + ', ' + esc(fat(b.review_at)) + (ed ? '. Tap the same button again to undo.' : '') + '</div>' : '') + '</div>' +
      '<div class="nvb-stack">' + fold('who', 'Who gets it, and who is left out', '', who) + fold('facts', 'Cost, target and test', '', facts) + planHtml() + octHtml() + '</div>';
  }
  function messagesHtml() {
    var b = blast(cur); if (!b) return '<div class="nvb-pane"><h2>Messages</h2><p class="lead">No blasts are set up.</p></div>';
    return '<div class="cbl"><div class="cbl-shell"><aside class="cbl-side' + (sideOpen ? ' open' : '') + '" id="nvbSide"><button type="button" class="cbl-side-toggle" data-nvb="side" aria-expanded="' + (sideOpen ? 'true' : 'false') + '"><span>Calendar and blasts</span><span>+</span></button>' +
      '<div class="cbl-side-body">' + calSide() + listSide() + '</div></aside><div class="cbl-main" id="nvbMain">' + blastMain(b) + '</div></div></div>';
  }
  function clockMins(b) { var t = (b.data.time || '11:30').split(':'); return +t[0] * 60 + +t[1]; }
  function dayWord(iso) { var g = parts(iso).getDay(); return g === 0 ? 'Sundays' : g === 1 ? 'Mondays' : DN[g] + 's'; }
  /* Move a blast: the day and the start time. Al Quoz follows on its own (shut Sundays and Mondays, so it waits for Tuesday); never a Friday (Kate, 21 Oct). Saved through nov_blast_schedule. */
  function fromIso(iso, plus) { var d = parts(iso); d.setDate(d.getDate() + plus); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function schedHtml(b) {
    if (!canEdit()) return '';
    if (!sched) return '<button type="button" class="nvb-btn nvb-sch-open" data-nvb="sched:open">Change day or time</button>';
    var d = b.data, days = '', times = '', i, iso, g, t, lab;
    for (i = 0; i < 25; i++) {
      iso = fromIso('2026-11-03', i + 1); g = parts(iso).getDay(); if (g === 5) continue;
      days += '<option value="' + iso + '"' + (iso === d.date ? ' selected' : '') + '>' + esc(fdate(iso)) + '</option>';
    }
    if (days.indexOf('value="' + d.date + '"') < 0) days = '<option value="' + esc(d.date) + '" selected>' + esc(fdate(d.date)) + '</option>' + days;
    for (t = 9 * 60; t <= 15 * 60 + 30; t += 30) { lab = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); times += '<option value="' + lab + '"' + (lab === d.time ? ' selected' : '') + '>' + esc(fmtClock(t)) + '</option>'; }
    return '<div class="nvb-sch"><label>Day<select id="nvbSchDay">' + days + '</select></label><label>Starts<select id="nvbSchTime">' + times + '</select></label>' +
      '<button type="button" class="nvb-btn pri" data-nvb="sched:save">Save</button><button type="button" class="nvb-btn" data-nvb="sched:close">Cancel</button>' +
      '<p class="nvb-small">Al Quoz is closed Sundays and Mondays, so its clients move to Tuesday on their own. No Fridays. Nothing is sent from here.</p></div>';
  }
  // The pace is the one October used: about 100 messages every 30 minutes from each salon's number, from 11:30 am. Past 4 pm is flagged.
  function planHtml() {
    if (!LIVE || !LIVE.blasts) return '';
    var days = {};
    var st = {};
    blasts().forEach(function (b) { var c = lv(b.id); BKEYS.forEach(function (k) { var iso = k === 'AQ' ? aqDate(b) : b.data.date; (days[iso] = days[iso] || {})[k] = ((days[iso] || {})[k] || 0) + (c[k] || 0); if (c[k]) st[iso + k] = Math.min(st[iso + k] || 1e9, clockMins(b)); }); });
    var keys = Object.keys(days).sort();
    var head = '<div class="nvb-pl-r h"><span>Salon</span>' + keys.map(function (iso) { return '<span>' + esc(fdate(iso)) + '</span>'; }).join('') + '</div>';
    var rows = BKEYS.map(function (k) {
      return '<div class="nvb-pl-r"><span>' + BR[k] + '</span>' + keys.map(function (iso) {
        var n = days[iso][k] || 0; if (!n) return '<span class="z">none</span>';
        var end = (st[iso + k] || 11 * 60 + 30) + Math.ceil(n / 100) * 30, over = end > 16 * 60;
        return '<span class="' + (over ? 'over' : '') + '"><b>' + fmtN(n) + '</b> by ' + fmtClock(end) + (over ? ', too late' : '') + '</span>';
      }).join('') + '</div>';
    }).join('');
    return fold('plan', 'Sending plan', 'about 100 every 30 minutes per salon, all done by 4 pm', head + rows + '<p>Each salon sends from its own number from the time set on its blast (11:30 am unless moved). Press Count again each morning before sending: it takes in any STOP replies and the opt-out sheet.</p>');
  }
  function octHtml() {
    var o = item('oct'); if (!o) return '';   // the figures live in the database (nov_blast_items 'oct'), not in this public file
    var d = o.data;
    return fold('oct', esc(d.title), esc(d.lead), '<div class="nvb-oct">' + (d.cards || []).map(function (c) { return '<div><span class="eyebrow">' + esc(c.k) + '</span><span class="big">' + esc(c.big) + '</span><p>' + esc(c.p) + '</p></div>'; }).join('') + '</div><p>' + esc(d.foot) + '</p>');
  }
  // How the November blasts differ from Campaign Blasts (Kate, 3 Nov 2026): the words live in the database (nov_blast_items 'diff'), not in this public file.
  function diffHtml() {
    var o = item('diff'); if (!o || !o.data) return '';
    var d = o.data;
    function rows(r) { return '<div class="nvb-dl">' + (r || []).map(function (x) { return '<div><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div>'; }
    function col(c) { return c ? '<div class="nvb-diffcol"><h3>' + esc(c.head) + '</h3><p>' + esc(c.intro) + '</p>' + rows(c.rows) + '</div>' : ''; }
    return fold('diff', esc(d.title), esc(d.lead), '<div class="nvb-diff">' + col(d.camp) + col(d.nov) + '</div>' + (d.why ? '<div class="nvb-diffwhy"><h3>' + esc(d.why.head) + '</h3><p>' + esc(d.why.intro) + '</p>' + rows(d.why.rows) + '</div>' : '') + '<p class="nvb-small">' + esc(d.foot) + '</p>');
  }

  /* ---------- lane 3: Before sending, Kate ---------- */
  function beforeHtml() {
    var all = tasks(), open = all.filter(function (t) { return !isDone(t.id); }), dn = all.filter(function (t) { return isDone(t.id); }), pre = item('pre'), rules = (pre && pre.data.rules) || [], ed = canEdit();
    function row(t) {
      var done = isDone(t.id), st = done ? 'done' : (t.state || 'open'), mo = more === t.id;
      return '<div class="nvb-row' + (done ? ' isdone' : '') + '"><div class="top"><span class="nvb-state ' + esc(st) + '" aria-hidden="true"></span><div><div class="t">' + esc(t.t) + '</div><div class="m">Owner <b>' + esc(t.owner) + '</b> · By <b>' + esc(t.due) + '</b>' + (st === 'wait' && t.wait ? ' · <span class="w">' + esc(t.wait) + '</span>' : '') + (st === 'later' ? ' · Not due yet' : '') + '</div></div>' +
        '<div class="acts"><button type="button" data-nvb="more:' + esc(t.id) + '" aria-expanded="' + mo + '">' + (mo ? 'Hide detail' : 'Detail') + '</button>' + (ed ? '<button type="button" data-nvb="done:' + esc(t.id) + '">' + (done ? 'Undo' : 'Mark done') + '</button>' : '') + '</div></div>' +
        (mo ? '<div class="more"><p>' + esc(t.d) + '</p></div>' : '') + '</div>';
    }
    return '<div class="nvb-pane"><h2>' + esc((pre && pre.data.title) || 'Before the first message goes out') + '</h2><p class="lead">' + esc((pre && pre.data.lead) || '') + ' ' + plural(open.length, 'thing', 'things') + ' still to do.</p>' +
      '<div class="nvb-list">' + open.map(row).join('') + dn.map(row).join('') + '</div>' +
      (rules.length ? '<div class="nvb-stack">' + fold('rules', 'Already settled', plural(rules.length, 'rule', 'rules') + ', nothing to do', '<div class="nvb-rules">' + rules.map(function (r) { return '<div><b>' + esc(r[0]) + '.</b> ' + esc(r[1]) + '</div>'; }).join('') + '</div>') + '</div>' : '') + '</div>';
  }

  /* ---------- lane 4: Replies, the call centre ---------- */
  // The simulation inside the phone (Kate, 3 Nov 2026, the same idea as Campaign Blasts): she types a reply, the call centre is told, and the script she gets back. The tap is only kept on this page.
  function simHtml(b) {
    if (!sim[b.id]) return '';
    var rp = item('reply'), script = rp && rp.data ? rp.data[b.id] : null, end = b.data.end || '30 November 2026', t0 = b.data.time;
    return '<div class="cbl-after"><b>She replies</b><span>for example</span></div><div class="cbl-out">Yes please, what times do you have this week?<span>' + tclock(t0, 5, true) + '</span></div>' +
      (script ? '<div class="cbl-bub cbl-rep"><div class="cbl-body">' + esc(String(script).replace(/\{\{1\}\}/g, 'Layla').replace(/\{\{2\}\}/g, 'Saadiyat').replace(/\{\{3\}\}/g, end).replace(/\. /g, '.\n\n')) + '</div><div class="cbl-time">' + tclock(t0, 6, true) + '</div></div>' : '') +
      '<div class="cbl-notify">Call centre notified in respond.io</div>' +
      (script ? '' : '<p class="nvb-small nvb-simnote">No reply script written yet for this blast. The call centre answers in the salon’s own warm words.</p>');
  }
  function repliesHtml() {
    var bs = blasts(), b = blast(rb), d = b.data, rp = item('reply'), tm = item('terms'), script = rp && rp.data ? rp.data[b.id] : null, terms = tm && d.tkey && tm.data ? tm.data[d.tkey] : null;
    var pick = '<div class="nvb-pick" role="group" aria-label="Which message did she get?">' + bs.map(function (x) { return '<button type="button" class="' + (b.id === x.id ? 'on' : '') + '" data-nvb="rb:' + esc(x.id) + '">' + esc(x.data.short || x.data.title) + '</button>'; }).join('') + '</div>';
    var say = script ? '<div class="nvb-card nvb-say"><span class="eyebrow">Say this, inside her 24 hours</span><div class="script">' + esc(script).replace(/\{\{1\}\}/g, '<mark>[first name]</mark>').replace(/\{\{2\}\}/g, '<mark>' + esc(BR.SAA) + '</mark>').replace(/\{\{3\}\}/g, '<mark>' + esc(d.end || '30 November 2026') + '</mark>') + '</div>' +
        '<div class="row"><button type="button" class="nvb-btn pri" data-nvb="copy">' + (copied ? 'Copied' : 'Copy reply') + '</button>' + (rp.data.note ? '<span class="nvb-small">' + esc(rp.data.note) + '</span>' : '') + '</div></div>'
      : '<div class="nvb-card nvb-gap"><b>No reply script written yet for ' + esc((d.short || d.title).toLowerCase()) + '.</b><br>Until there is one, answer in the salon’s own warm words, keep to what the message said, and ask for the days that suit her. Kate or Emma to write it.</div>';
    var know = '<div class="nvb-card nvb-box"><h3>Three things to know</h3><div class="nvb-rules"><div><b>She writes STOP.</b> Honour it at once. Do not reply with an offer.</div><div><b>Never resend inside 24 hours.</b> A message Meta held back is not charged and is not to be sent again.</div><div><b>Al Quoz is shut Sundays and Mondays.</b> Its clients go on Tuesday.</div></div></div>';
    var tx = terms ? '<details class="nvb-fold nvb-terms" data-fold="terms"' + (opened.terms ? ' open' : '') + '><summary><span>' + esc(terms.title) + ' <small>' + plural((terms.pts || []).length, 'point', 'points') + '</small></span></summary><div class="in"><p>' + esc(terms.intro) + '</p><ol>' +
        (terms.pts || []).map(function (p) { return '<li><b>' + esc(p[0]) + '</b> ' + esc(p[1]) + '</li>'; }).join('') + '</ol></div></details>'
      : '<div class="nvb-card nvb-gap">' + (d.tkey ? 'The terms are not loaded yet.' : 'No terms for this message: there is no offer in it.') + '</div>';
    return '<div class="nvb-pane"><h2>Replies</h2><p class="lead">For the call centre team. She wrote back: pick the message she got, say the reply, keep the terms to hand.</p>' + pick + '<div class="nvb-stack">' + say + tx + know + '</div></div>';
  }

  function render(keep) {
    var el = main(); if (!el) return;
    var y = window.scrollY;
    var body = tab === 'decide' && decs().length ? decideHtml() : tab === 'before' ? beforeHtml() : tab === 'replies' ? repliesHtml() : messagesHtml();
    el.innerHTML = '<div class="nvb"><header class="nvb-head"><div class="eyebrow">Tools · 2026</div><h1>November blasts</h1>' +
      '<div class="nvb-chipsrow"><span class="chip warn">Draft, nothing sent</span><span class="chip">Every message ends 30 November</span><span class="chip">UAE salons</span></div>' +
      (liveErr ? '<p class="nvb-err">The counts could not be read just now, so the numbers show a question mark. Open the page again in a minute.</p>' : '') +
      (errMsg ? '<p class="nvb-err">' + esc(errMsg) + '</p>' : '') + numsHtml() + '</header>' + nextHtml() + tabsHtml() + body + '</div>';
    if (keep) window.scrollTo({ top: y, behavior: 'instant' });   // the dashboard sets smooth scrolling, which would glide the page up
  }
  function toTop() { window.scrollTo({ top: 0, behavior: 'instant' }); }
  async function reload() { D = await rpc('nov_blast_get'); }
  async function loadLive() { try { LIVE = await rpc('nov_blast_audience'); liveErr = false; } catch (e) { console.error(e); liveErr = true; } }
  async function act(fn) {
    errMsg = '';
    try { await fn(); await reload(); } catch (e) { console.error(e); errMsg = 'That did not save: ' + (e.message || 'try again'); }
    render(true);
  }
  function bind() {
    var el = main(); if (!el || bound) return; bound = true;
    el.addEventListener('toggle', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-fold')) opened[t.getAttribute('data-fold')] = t.open; }, true);   // a fold stays as she left it when the page redraws
    el.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-nvb]'); if (!t || t.disabled || !D) return;
      if (t.tagName === 'A') e.preventDefault();
      var a = t.getAttribute('data-nvb').split(':'), k = a[0], v = a.slice(1).join(':');
      if (k === 'tab') { tab = v; render(); toTop(); syncUrl(); }
      else if (k === 'goto') { var q = v.split(':'); tab = q[0]; if (q[1] != null) dec = +q[1]; render(); toTop(); syncUrl(); }
      else if (k === 'go') { dec = +v; render(true); }
      else if (k === 'pick') { if (!canEdit()) return; act(function () { return rpc('nov_blast_decide', { p_idx: dec + 1, p_pick: +v }); }); }
      else if (k === 'clear') { act(function () { return rpc('nov_blast_decide', { p_idx: dec + 1, p_pick: null }); }); }
      else if (k === 'cal') { if (!cal) return; cal.m += v === 'next' ? 1 : -1; if (cal.m > 11) { cal.m = 0; cal.y++; } if (cal.m < 0) { cal.m = 11; cal.y--; } render(true); }
      else if (k === 'day') { var hit = sorted().filter(function (x) { return x.data.date === v || aqDate(x) === v; }); if (!hit.length) return; var at = hit.map(function (x) { return x.id; }).indexOf(cur); cur = hit[(at + 1) % hit.length].id; rb = cur; render(true); syncUrl(); }
      else if (k === 'side') { sideOpen = !sideOpen; render(true); }
      else if (k === 'sel') { cur = v; rb = v; var sb2 = blast(v); if (sb2) { var cd2 = parts(sb2.data.date); cal = { y: cd2.getFullYear(), m: cd2.getMonth() }; } sideOpen = false; render(true); syncUrl(); }   // stays where she is, so the picker works as a toggle and the message swaps in below
      else if (k === 'recount') { if (!canEdit() || counting) return; counting = true; render(true); rpc('nov_blast_audience', { p_recount: true }).then(function (r) { LIVE = r; liveErr = false; }).catch(function (e) { console.error(e); errMsg = 'Counting did not finish: ' + (e.message || 'try again'); }).then(function () { counting = false; render(true); }); }
      else if (k === 'sched') {
        if (!canEdit()) return;
        if (v === 'open') { sched = true; render(true); }
        else if (v === 'close') { sched = false; render(true); }
        else if (v === 'save') {
          var bs = blast(cur), dd = document.getElementById('nvbSchDay'), tt = document.getElementById('nvbSchTime'); if (!bs || !dd || !tt) return;
          sched = false;
          act(function () { return rpc('nov_blast_schedule', { p_id: bs.id, p_date: dd.value, p_time: tt.value }); });
        }
      }
      else if (k === 'sim') { sim[v] = !sim[v]; render(true); }
      else if (k === 'aud') { aud = v; render(true); }
      else if (k === 'len') { len = v; render(true); }
      else if (k === 'rev') { var b = blast(cur); if (!b || !canEdit()) return; act(function () { return rpc('nov_blast_review', { p_id: b.id, p_review: b.review === v ? 'none' : v }); }); }
      else if (k === 'reply') { rb = v; cur = v; opened.terms = false; tab = 'replies'; render(); toTop(); syncUrl(); }
      else if (k === 'terms') { rb = v; cur = v; opened.terms = true; tab = 'replies'; render(); toTop(); syncUrl(); }
      else if (k === 'rb') { rb = v; cur = v; opened.terms = false; copied = false; render(true); syncUrl(); }
      else if (k === 'more') { more = more === v ? '' : v; render(true); }
      else if (k === 'done') { if (!canEdit()) return; var was = isDone(v); act(function () { return rpc('nov_blast_check', { p_id: v, p_done: !was }); }); }
      else if (k === 'copy') {
        var rp = item('reply'), s2 = rp && rp.data ? rp.data[blast(rb).id] : null; if (!s2) return;
        var txt = s2.replace(/\{\{1\}\}/g, '[first name]').replace(/\{\{3\}\}/g, blast(rb).data.end || '30 November 2026');
        try { navigator.clipboard.writeText(txt).then(function () { copied = true; render(true); setTimeout(function () { copied = false; if (main() && tab === 'replies') render(true); }, 2000); }); } catch (err) { errMsg = 'Copying did not work here: select the text instead.'; render(true); }
      }
    });
  }
  document.addEventListener('visibilitychange', function () {   // come back to the tab and see what others chose
    if (document.visibilityState !== 'visible' || !D || !main() || main().offsetParent === null) return;
    Promise.all([reload(), loadLive()]).then(function () { render(true); }).catch(function () { /* keep what is on screen */ });
  });

  // Called by showView each time the page opens: read what the database says now, then draw.
  window.renderNovBlasts = async function () {
    var el = main(); if (!el) return;
    if (typeof TRS_LEVEL === 'undefined' || (TRS_LEVEL !== 3 && TRS_LEVEL !== 5) && !(typeof TRS_EXTRA !== 'undefined' && TRS_EXTRA.indexOf('campaignblasts') >= 0)) { notFound(); return; }
    if (firstOpen) { firstOpen = false; try { var q = new URLSearchParams(location.search); wantBlast = q.get('blast') || ''; wantTab = q.get('tab') || ''; } catch (e) { wantBlast = ''; wantTab = ''; } }
    errMsg = '';
    if (!D) el.innerHTML = '<div class="nvb"><header class="nvb-head"><h1>November blasts</h1></header><p class="slv-muted">Loading…</p></div>';
    try { await reload(); } catch (e) { console.error(e); notFound(); return; }
    if (wantBlast) { if (item(wantBlast) && isBlast(item(wantBlast))) { cur = wantBlast; rb = wantBlast; } wantBlast = ''; }
    if (wantTab) { if (TABS.indexOf(wantTab) >= 0) tab = wantTab; wantTab = ''; }
    if (!item(cur) || !isBlast(item(cur))) { cur = sorted()[0] ? sorted()[0].id : ''; rb = cur; }
    bind(); render(); syncUrl();
    loadLive().then(function () { if (main() && main().offsetParent !== null) render(true); });   // the counts come a moment after the page
  };
})();
