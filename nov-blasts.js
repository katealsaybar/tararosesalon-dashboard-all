/* November Blasts (Kate, 2 Nov 2026), a dashboard page in Tools (?view=novblasts), so the main sidebar stays. The database blasts for November, planned from the 2 Nov Zoom
   with Coach Emma. Three lanes, one per reader: Messages (everyone, Emma approves here), Before sending (Kate's list) and Replies (the call centre:
   what to say when she writes back, and the terms). A next-action card sits above them. Redesigned 2 Nov 2026 (docs/mockups/nov-blasts-redesign.html in the cowork repo).
   3 Nov 2026 (Kate): Decisions are gone (Emma and Kate met), and Messages is laid out like Campaign Blasts: calendar and blast list on the left, the Warm and the Standard
   phone side by side. It reuses the cbl- classes of campaign-blasts.css, which index.html loads for every page.
   4 Nov 2026 (Coach Emma): no warm and standard split, one message per blast for everyone. A blast whose data.msg carries one key draws ONE phone and ONE template with no
   Warm or Standard label, no 90 day wording and no sub-count (isSplit below); a row that still carries both keys draws the old two phones.
   Reads and writes only through nov_blast_* (migrations/nov_blasts.sql and nov_blasts_v2.sql), which check the level again (old Levels 3 and 5 edit; a person opened
   for Campaign Blasts reads). Counts are LIVE from the till. All words (messages, decisions, checklist, replies, terms) live in the database, none here.
   4 Nov 2026 (Kate: "sa site pls, similar to what we did for oct 2026 blast"): Level 5 (Kate only) gets a Send control per blast whose template is approved, a sending bar with the
   switches and the gate, a confirm that shows the numbers and asks for a typed word, a Test to one number, and live counts on the blast (queued, sent, delivered, failed, STOP).
   It queues through nov_send_* (migrations/nov_send.sql); the nov-send-worker edge function posts to respond.io. Dry run is the default: nothing reaches a client until Kate
   turns Live on. No tags are written to respond.io from here. Needs only sb (the Supabase client), TRS_LEVEL, TRSD. */
(function () {
  function main() { return document.getElementById('novBlastsContent'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtN(n) { return Number(n || 0).toLocaleString('en-GB'); }
  var BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' }, BKEYS = ['SAA', 'KCA', 'MC', 'AQ'];
  /* Calendar and All blasts fold into pills (Kate, 4 Nov 2026: "calendar and all blasts, minimise to pills", "expandable, hideable when clicked"). Closed by default so the Blasts
     list sits high; what she opens is remembered in this browser only (localStorage, in try/catch: the page works with storage blocked). Front end only, no data touched. */
  var PILL_KEY = 'nvb-pills-v1', pills = { cal: false, all: false };
  try { var ps0 = JSON.parse(localStorage.getItem(PILL_KEY) || '{}'); pills.cal = ps0.cal === true; pills.all = ps0.all === true; } catch (e) {}
  function savePills() { try { localStorage.setItem(PILL_KEY, JSON.stringify(pills)); } catch (e) {} }
  var CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  /* Sending progress (Kate, 4 Nov 2026: "overall percentage sent", "999/1001"): read only, from the same nov_send_info the Send card uses (SND, Level 5 only). Sent = status sent and
     delivery not failed; failed = status failed or delivery failed (Meta can fail a send after respond.io took it). Total = what was queued when a live run exists, else the audience. */
  var PG = { s: 0, f: 0, t: 0, any: false }, progTimer = null;
  function progOf(b) {
    if (!SND || !SND.blasts) return null;
    var x = sendOf(b), c = x && x.counts, live = !!c && !x.dry, a = lv(b.id), t = live && x.queued_n != null ? x.queued_n : (a ? (a.n || 0) : null);
    return t == null ? null : { sent: live ? (c.sent || 0) : 0, failed: live ? (c.failed || 0) : 0, total: t };
  }
  function progBar(p) { var pc = p.total ? Math.min(100, Math.round(p.sent * 1000 / p.total) / 10) : 0; return '<span class="nvb-prog sm" role="img" aria-label="' + p.sent + ' of ' + p.total + ' sent"><i style="width:' + pc + '%"></i></span>'; }
  function progRow(b) {
    var p = progOf(b); if (!p) return '';
    PG.any = true; PG.s += p.sent; PG.f += p.failed; PG.t += p.total;
    return '<span class="nvb-trp"><span class="nvb-trt"><span><b>' + fmtN(p.sent) + ' / ' + fmtN(p.total) + '</b> sent</span>' + (p.failed ? '<em>' + fmtN(p.failed) + ' failed</em>' : '') + '</span>' + progBar(p) + '</span>';
  }
  function progTop() {
    if (!PG.any) return '';
    var p = { sent: PG.s, failed: PG.f, total: PG.t };
    return '<div class="nvb-ovp"><span class="nvb-trt"><span><b>' + fmtN(p.sent) + ' / ' + fmtN(p.total) + '</b> sent, ' + pctOf(p.sent, p.total) + '</span>' + (p.failed ? '<em>' + fmtN(p.failed) + ' failed</em>' : '') + '</span>' + progBar(p) + '</div>';
  }
  function progPoll() {   // while the All blasts card is open and the tab is showing: read the counts again every 30 seconds (the send poll already does it every 15 while a blast is going out)
    if (progTimer || !isL5()) return;
    progTimer = setInterval(function () {
      if (!pills.all || !SND || sndM || sndBusy || !main() || main().offsetParent === null || document.visibilityState !== 'visible') return;
      if (Object.keys(SND.blasts || {}).some(function (k) { return activeRun(SND.blasts[k]); })) return;
      loadSend().then(function () { if (!sndM && pills.all) render(true); });
    }, 30000);
  }
  function pillBtn(key, title, sub, open, subCls, on, pre) {
    return '<button type="button" class="nvb-pill' + (open ? ' open' : '') + (on ? ' on' : '') + '" data-nvb="pill:' + key + '" aria-expanded="' + (open ? 'true' : 'false') + '" title="' + (open ? 'Hide ' : 'Show ') + esc(title) + '">' +
      '<span class="pt">' + esc(title) + '</span>' + (pre || '') + (sub ? '<span class="ps' + (subCls ? ' ' + subCls : '') + '">' + esc(sub) + '</span>' : '') + CHEV + '</button>';
  }
  var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TABS = ['messages', 'before'];
  var RATE_AED = 0.21;   // one delivered marketing message: October measured USD 0.044 to 0.055 and Meta raised UAE rates on 1 Oct 2026, so the higher figure; undelivered ones are not charged
  var D = null, LIVE = null, LEFT = null, liveErr = false, counting = false, tab = 'messages', cur = '', rb = '', dec = null, more = '', opened = {}, copied = false, sched = false, sim = {}, cal = null, sideOpen = false, big = false, fl = {}, flowScroll = null, termsFor = '', draft = {};
  var errMsg = '', wantBlast = '', wantTab = '', firstOpen = true, bound = false;
  var SND = null, sndM = null, sndTyped = '', sndImg = '', sndPhone = '', sndPrev = null, sndTest = null, sndErr = '', sndBusy = false, sndTimer = null;   // the send control (Level 5)
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
  function fdateY(iso) { return fdate(iso) + ' ' + parts(iso).getFullYear(); }   // the label above a blast or section title carries the year (Kate, 4 Nov 2026)
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
  // One message for everyone (Coach Emma, 4 Nov 2026): a blast is "split" only when its data.msg carries both a warm and a std message. Otherwise it has one phone, no group labels.
  function msgKeys(b) { var m = b && b.data && b.data.msg || {}; return ['warm', 'std'].filter(function (g) { return m[g]; }); }
  function isSplit(b) { return msgKeys(b).length > 1; }
  function anySplit() { return blasts().some(isSplit); }

  /* the clients behind a number (Kate's rule, 27 Oct: every figure with a value opens its rows), the shared list window of drill.js */
  function drillSpec(title, args, showBlast) {
    return {
      title: title, cur: 'AED', sub: 'Who is in this blast right now, counted from our sales records.',
      views: [{ id: 'clients', label: 'Clients', load: async function () {
        var r = await rpc('nov_blast_clients', args);
        var names = {}; blasts().forEach(function (b) { names[b.id] = b.data.short || b.data.title; });
        var showGroup = args && args.p_blast ? isSplit(item(args.p_blast)) : anySplit();
        var rows = (r.rows || []).map(function (x) { return { c: x.c, b: BR[x.b] || x.b, k: names[x.k] || x.k, g: isSplit(item(x.k)) ? (x.g === 'warm' ? 'Warm' : 'Standard') : '', lv: x.lv, s: x.s }; });
        var cols = [{ k: 'c', l: 'Client' }, { k: 'b', l: 'Salon' }];
        if (showBlast) cols.push({ k: 'k', l: 'Blast' });
        if (showGroup) cols.push({ k: 'g', l: 'Group' });
        cols.push({ k: 'lv', l: 'Last visit', t: 'date' }, { k: 's', l: 'Spent this year', t: 'aed' });
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
  /* No longer drawn (Kate, 4 Nov 2026: "remove na"). The data (nov_blast_items 'pre' next) stays in the database. */
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
    var cost = total == null ? '…' : calcNum('AED ' + fmtN(Math.round(total * RATE_AED)), 'cost');
    return '<p class="nvb-small nvb-lines"><b>' + tot + '</b> messages in ' + blasts().length + ' blasts, one per client, on ' + esc(dl.join(' and ')) + '. At most <b>' + cost + '</b>: a message that is not delivered is not charged.</p>' + countedHtml();
  }
  // When the clients were counted (the count is kept for up to an hour because counting takes about 20 seconds), and a way to count again.
  function countedHtml() {
    if (counting) return '<p class="nvb-small nvb-counted">Counting the clients again, about 20 seconds…</p>';
    if (!LIVE || !LIVE.at) return '';
    return '<p class="nvb-small nvb-counted">Clients counted ' + esc(fat(LIVE.at)) + ', Dubai time, from our sales records. ' + (canEdit() ? '<button type="button" class="nvb-link" data-nvb="recount">Count again</button>' : '') + '</p>';
  }
  function tabsHtml() {
    var t = [['decide', 'Decisions', 'Coach Emma', openDecs().length], ['messages', 'Messages', 'Everyone', 0], ['before', 'Before sending', 'Kate', openTasks().length]].filter(function (x) { return x[0] !== 'decide' || decs().length; });
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
    var b = blast(cur), o = pills.cal;
    if (!cal) { var cd0 = b ? parts(b.data.date) : new Date(); cal = { y: cd0.getFullYear(), m: cd0.getMonth() }; }
    return '<div class="nvb-pwrap">' + pillBtn('cal', 'Calendar', MN[cal.m] + ' ' + cal.y, o) + (o ? calCard() : '') + '</div>';
  }
  function calCard() {
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
    return h + '</div><div class="cbl-leg"><span><b class="plan"></b>Planned</span></div><p class="cbl-hint">Pick a day with a dot to open its blast.</p><button type="button" class="cbl-bigbtn" data-nvb="big">Bigger calendar</button></div>';
  }
  // The same month, large, in a pop-up (Kate, 3 Nov 2026: "I should be able to view the calendar bigger"): every blast is a chip on its day, click it to open it.
  function bigCalHtml() {
    var y = cal.y, mo = cal.m, off = (new Date(y, mo, 1).getDay() + 6) % 7, n = new Date(y, mo + 1, 0).getDate(), today = dubaiToday(), bs = sorted();
    var h = '<div class="cbl"><div class="cbl-modal" data-nvb="close"><div class="cbl-bigcal cbl-card" role="dialog" aria-modal="true" aria-label="Calendar of blasts"><div class="cbl-big-h">' +
      '<button type="button" data-nvb="cal:prev" aria-label="Previous month">‹</button><b>' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mo] + ' ' + y + '</b>' +
      '<button type="button" data-nvb="cal:next" aria-label="Next month">›</button><button type="button" class="cbl-big-x" data-nvb="close">Close</button></div>' +
      '<p class="cbl-hint">Click a blast to open it.</p><div class="cbl-big-g">';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { h += '<span class="hd">' + d + '</span>'; });
    for (var i = 0; i < off; i++) h += '<span class="pad"></span>';
    for (var d = 1; d <= n; d++) {
      var iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var chips = bs.filter(function (x) { return x.data.date === iso || aqDate(x) === iso; }).map(function (x) {
        return '<a class="cbl-bc ' + rcls(x.review) + '" href="?view=novblasts" data-nvb="sel:' + esc(x.id) + '" title="' + esc(x.data.title) + '"><span>' + esc(x.data.short || x.data.title) + '</span><small>' + esc(fmtClock(clockMins(x))) + '</small></a>';
      }).join('');
      h += '<div class="cbl-bd' + (iso === today ? ' today' : '') + '"><b>' + d + '</b>' + chips + '</div>';
    }
    var pre = y + '-' + String(mo + 1).padStart(2, '0'), inMonth = bs.filter(function (x) { return x.data.date.indexOf(pre) === 0; });
    // On a phone the chips are too small for a name, so the same blasts are listed under the grid.
    var list = inMonth.length ? '<div class="cbl-big-l">' + inMonth.map(function (x) { return '<a href="?view=novblasts" data-nvb="sel:' + esc(x.id) + '"><span class="cbl-chip ' + rcls(x.review) + '">' + lab(x.review) + '</span> <b>' + esc(x.data.title) + '</b><small>' + esc(fdate(x.data.date)) + ', ' + esc(fmtClock(clockMins(x))) + '</small></a>'; }).join('') + '</div>' : '';
    return h + '</div>' + list + '</div></div></div>';
  }
  /* What the cost and the sending time are worked out from (Kate, 3 Nov 2026: every figure explains itself on tap): one row per blast, then the total.
     only = one blast id, or nothing for all of them. Same window as the client lists. */
  function calcRows(only) {
    var bs = sorted().filter(function (b) { return !only || b.id === only; }), rows = [], tn = 0, ts = 0;
    bs.forEach(function (b) { var c = lv(b.id), n = c ? (c.n || 0) : 0, sl = Math.ceil(n / PACE); tn += n; ts += sl; rows.push({ b: b.data.short || b.data.title, n: n, aed: n * RATE_AED, usd: n * RATE_USD, sl: sl, mins: sl * 30, hrs: sl / 2 }); });
    if (bs.length > 1) rows.push({ b: 'All blasts', n: tn, aed: tn * RATE_AED, usd: tn * RATE_USD, sl: ts, mins: ts * 30, hrs: ts / 2 });
    return rows;
  }
  function calcSpec(kind, only) {
    var cost = kind === 'cost';
    return { title: cost ? 'Cost, at most' : 'Sending time', cur: 'AED', sub: cost ? 'Clients x AED ' + RATE_AED + ' (about USD ' + RATE_USD + ') a delivered message. A message that is not delivered is not charged, so this is the most it can cost.' : 'Clients sent in lots of ' + PACE + ' every 30 minutes from the one call centre number, blast after blast.',
      views: [{ id: 'calc', label: 'How it is worked out', load: async function () {
        var rows = calcRows(only);
        return { cols: cost ? [{ k: 'b', l: 'Blast' }, { k: 'n', l: 'Clients', t: 'num' }, { k: 'aed', l: 'At AED ' + RATE_AED, t: 'aed' }, { k: 'usd', l: 'About USD ' + RATE_USD, t: 'num' }]
          : [{ k: 'b', l: 'Blast' }, { k: 'n', l: 'Clients', t: 'num' }, { k: 'sl', l: 'Lots of ' + PACE, t: 'num' }, { k: 'mins', l: 'Minutes', t: 'num' }, { k: 'hrs', l: 'Hours', t: 'num' }], rows: rows, empty: 'Nothing to work out yet.', note: '' };
      } }] };
  }
  function calcNum(t, kind, only) { return (typeof TRSD !== 'undefined' && canEdit() && LIVE && LIVE.blasts) ? TRSD.num(t, calcSpec(kind, only)) : t; }
  /* The total across all the blasts (Kate, 3 Nov 2026: "wala tayong total blast count"), between the calendar and the list: clients in all blasts, how many blasts, each blast's count,
     the most it can cost and how long the sending takes at the page's pace. Live, from the same counts as each blast, so it moves when a count changes. */
  var bigflow = false;   // the phones of one blast, large (Kate, 3 Nov 2026, the same See the flow bigger as Campaign Blasts)
  var FLOWICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  var ALLID = 'ALL';   // the All blasts view (Kate, 3 Nov 2026): picking the All blasts card opens the whole picture in the main panel, like picking a blast
  var RATE_USD = 0.058;   // roughly one delivered marketing message in the UAE (see the Before sending top-up task)
  function totalSide() {
    var bs = sorted(), tot = 0, slots = 0, rows = '';
    PG = { s: 0, f: 0, t: 0, any: false };
    bs.forEach(function (b) {
      var c = lv(b.id), n = c ? (c.n || 0) : null; if (n != null) { tot += n; slots += Math.ceil(n / PACE); }
      rows += '<div><span>' + esc(b.data.short || b.data.title) + '</span><b>' + (c ? num(n, (b.data.short || b.data.title) + ', every client', { p_blast: b.id }) : (liveErr ? '?' : '…')) + '</b>' + progRow(b) + '</div>';
    });
    var ready = !!(LIVE && LIVE.blasts), hrs = slots / 2;
    var card = '<div class="cbl-tabs cbl-card nvb-tot' + (cur === ALLID ? ' on' : '') + '" data-nvb="sel:' + ALLID + '" title="Open the whole picture across the blasts"><h3><a href="?view=novblasts&blast=' + ALLID + '" data-nvb="sel:' + ALLID + '">Open the whole picture</a></h3><div class="nvb-tot-big"><b>' + (ready ? num(tot, 'November blasts, every client', {}, true) : (liveErr ? '?' : '…')) + '</b><span>clients in ' + plural(bs.length, 'blast', 'blasts') + '</span></div>' +
      progTop() + '<div class="nvb-tot-rows">' + rows + '</div>' +
      (ready ? '<p class="cbl-hint">At most <b>' + calcNum('AED ' + fmtN(Math.round(tot * RATE_AED)), 'cost') + '</b> (about ' + calcNum('USD ' + fmtN(Math.round(tot * RATE_USD)), 'cost') + '). About <b>' + calcNum((hrs % 1 ? hrs.toFixed(1) : hrs) + ' hours', 'time') + '</b> of sending at ' + PACE + ' every 30 minutes.</p>' : '') + '</div>';
    var o = pills.all;
    return '<div class="nvb-pwrap">' + pillBtn('all', 'All blasts', ready ? fmtN(tot) : (liveErr ? '?' : '…'), o, 'num', cur === ALLID, PG.any && PG.s + PG.f > 0 ? '<span class="pp">' + Math.round(PG.s * 100 / (PG.t || 1)) + '% sent</span>' : '') + (o ? card : '') + '</div>';
  }
  function listSide() {
    var bs = sorted(), rev = bs.filter(function (x) { return x.review === 'ok' || x.review === 'changes'; }).length;
    return '<div class="cbl-tabs cbl-card"><h3>Blasts</h3><div>' + bs.map(function (b) {
      return '<div class="cbl-tab' + (cur === b.id ? ' on' : '') + '"><a href="?view=novblasts" data-nvb="sel:' + esc(b.id) + '" style="padding-left:12px"><span>' + esc(b.data.short || b.data.title) + '</span><small>' + esc(fdate(b.data.date)) + ', ' + esc(fmtClock(clockMins(b))) + '</small></a>' +
        '<span class="cbl-dot ' + rcls(b.review) + '" title="' + lab(b.review) + '"></span></div>';
    }).join('') + '</div><p class="cbl-hint cbl-prog"><b>' + rev + ' of ' + bs.length + '</b> reviewed</p></div>';
  }
  /* The template of each blast in respond.io and where it has got to (Kate, 3 Nov 2026). The names and the status live in the database (nov_blast_items data.tpl, one entry per
     group: n the template name, s todo | filled | submitted | approved | rejected), so a status change is a data edit, not a deploy. */
  var TPL_ST = { todo: 'Not made yet', filled: 'Filled in, waiting for Submit', submitted: 'Submitted to Meta', approved: 'Approved by Meta', rejected: 'Rejected by Meta' };
  /* Sits under the Who list (Kate, 4 Nov 2026: the red rectangle goes into that blank space); it used to be a full width card between the Clients box and the Send card. */
  function tplHtml(b) {
    var t = b.data.tpl; if (!t) return '';
    var pre = item('pre'), snd = pre && pre.data && pre.data.sender, gs = ['warm', 'std'].filter(function (g) { return t[g]; }), rows = gs.map(function (g) {
      var x = t[g], st = TPL_ST[x.s] ? x.s : 'todo';
      return '<div class="nvb-tp">' + (gs.length > 1 ? '<span class="g">' + (g === 'warm' ? 'Warm' : 'Standard') + '</span>' : '') + '<code>' + esc(x.n) + '</code><span class="nvb-tps ' + st + '">' + esc(TPL_ST[st]) + '</span></div>';
    }).join('');
    return '<div class="nvb-tplbox"><small>Template in respond.io</small>' + rows +
      (snd ? '<p class="nvb-small">Account: ' + esc(snd.waba) + (snd.channel ? ', channel ' + esc(snd.channel) : '') + '. Sent from the call centre number' + (snd.number ? ' ' + esc(snd.number) : '') + '.</p>' : '') + '</div>';
  }
  /* The template buttons and what follows a tap (Kate, 3 Nov 2026): Tell me more sends the offer and the Terms and Conditions picture, then Book now and Help me out. The
     call centre only takes over on Book now or Help me out (or if she types). The same tap-through as Campaign Blasts. The words live in the database (nov_blast_items data.flow). */
  function repBub(b, node, min) {
    var d = b.data, body = String(node.t).replace(/\{\{1\}\}/g, 'Layla').replace(/\{\{2\}\}/g, 'Saadiyat').replace(/\{\{3\}\}/g, d.end || '30 November 2026').replace(/\. /g, '.\n\n').replace(/: /g, ':\n');
    var img = node.src ? '<a class="nvb-tcpic" href="' + esc(node.src) + '" target="_blank" rel="noopener" title="Open the picture full size"><img src="' + esc(node.src) + '" alt="' + esc(node.img || 'Terms and Conditions') + '"><span>Tap to open full size</span></a>' : node.img ? '<div class="nvb-tcimg" role="img" aria-label="' + esc(node.img) + '"><span class="lg">TARA ROSE</span><span class="sl">SALONS</span><b>' + esc(String(node.img).split(': ')[1] || node.img) + '</b><span class="ln"></span><span class="ln"></span><span class="ln s"></span><span class="ln"></span><span class="ln s"></span><em>Terms picture, sent with this message</em></div>' : '';
    return '<div class="cbl-bub cbl-rep">' + img + '<div class="cbl-body">' + esc(body) + '</div><div class="cbl-time">' + tclock(d.time, min, true) + '</div></div>';
  }
  function flowHtml(b, grp) {
    var f = b.data.flow; if (!f || !f.root) return '';
    var key = b.id + ':' + grp, path = fl[key] || [], btns = f.root, step = 0, h = '';
    for (;;) {
      var pick = path[step], at = step;
      h += btns.map(function (x, i) {
        return pick == null ? '<button type="button" class="cbl-fb" data-nvb="flow:' + esc(key) + ':' + at + ':' + i + '">' + esc(x.l) + '</button>' : '<div class="cbl-fb ' + (pick === i ? 'tapped' : 'dim') + '">' + esc(x.l) + '</div>';
      }).join('');
      if (pick == null) break;
      var ch = btns[pick]; if (!ch) break;
      h += '<div class="cbl-out">' + esc(ch.l) + '<span>' + tclock(b.data.time, 3 + step * 2, true) + '</span></div>';
      var node = f.nodes && f.nodes[ch.to]; if (!node) break;
      h += repBub(b, node, 4 + step * 2);
      // Book now asks for a day and time: she types it (shown as an example), and if she has not answered in an hour the follow-up goes on its own (node.ask, node.fu).
      if (node.ask) h += '<div class="cbl-after"><b>She types a day and time</b><span>for example</span></div><div class="cbl-out">' + esc(node.ask) + '<span>' + tclock(b.data.time, 6 + step * 2, true) + '</span></div>';
      if (node.fu) h += '<div class="cbl-after"><b>No answer after 1 hour</b><span>sent on its own</span></div>' + repBub(b, { t: node.fu }, 66 + step * 2);
      if (node.call) { h += '<div class="cbl-notify">Call centre notified in respond.io</div>'; break; }
      btns = node.b || []; step++;
      if (!btns.length) break;
    }
    if (path.length) h += '<button type="button" class="cbl-restart" data-nvb="flowreset:' + esc(key) + '">Start again</button>';
    return h;
  }
  function phoneHtml(text, d, b, grp) {
    var body = String(text).replace(/\{\{1\}\}/g, 'Layla').replace(/\{\{2\}\}/g, 'Saadiyat').replace(/\{\{3\}\}/g, d.end || '30 November 2026').replace(/\. /g, '.\n\n').replace(/: /g, ':\n');
    return '<div class="cbl-phone-wrap"><div class="cbl-phone"><div class="cbl-screen">' +
      '<div class="cbl-status"><span>' + tclock(d.time, 2) + '</span><span class="ic">5G <span class="cbl-batt"></span></span></div>' +
      '<div class="cbl-chat-head"><span class="cbl-back">‹</span><span class="cbl-av"></span><span class="cbl-who">Tara Rose Salons<small>Business account</small></span><span class="cbl-dots">⋮</span></div>' +
      '<div class="cbl-thread" data-key="' + esc(b.id + ':' + grp) + '"><span class="cbl-day">Today</span><div class="cbl-bub">' + (d.img ? '<img class="cbl-hdr" src="' + esc(d.img) + '" alt="Header image">' : (d.tkey ? '<div class="nvb-artph" role="img" aria-label="Artwork goes here"><b>Artwork goes here</b><span>Hanneh’s image, 1080 by 1350 pixels</span></div>' : '')) +
      '<div class="cbl-body">' + esc(body) + '</div><div class="cbl-ftr">' + esc(d.footer) + '</div><div class="cbl-time">' + tclock(d.time, 0, true) + '</div></div>' + flowHtml(b, grp) + simHtml(b) + '</div>' +
      '<div class="cbl-compose"><span class="cbl-input">Message</span><span class="cbl-mic"></span></div></div></div></div>';
  }
  function laneHtml(label, grp, b, c) {
    var d = b.data, m = d.msg && d.msg[grp]; if (!m) return '';
    if (!isSplit(b)) return '<div class="cbl-lane">' + phoneHtml(m, d, b, grp) + '</div>';   // one message for everyone: one phone, no label, no group count
    var n = c ? (grp === 'warm' ? c.warm : c.std) : null;
    var cnt = c ? num(n, d.title + ', ' + label.toLowerCase() + ' clients', { p_blast: b.id, p_group: grp }) : (liveErr ? '?' : '…');
    return '<div class="cbl-lane"><div class="cbl-lane-top"><h3>' + label + '</h3><span>' + cnt + ' clients</span></div>' +
      '<div class="w">' + (grp === 'warm' ? 'Last visit within 90 days' : (b.id === 'E' || b.id === 'E2') ? 'Last visit from 17 April to about 6 months ago' : 'Last visit more than 90 days ago, back to 1 Jan 2026') + '</div>' + phoneHtml(m, d, b, grp) + '</div>';
  }
  // The phones of a blast: one for a one-message blast, the old Warm and Standard pair when a row still carries both. one = a single phone is drawn.
  function lanesOf(b, c) {
    if (!isSplit(b)) { var g = msgKeys(b)[0]; return { html: g ? laneHtml('', g, b, c) : '', one: true }; }
    var showWarm = c ? c.warm > 0 : true;
    return { html: (showWarm ? laneHtml('Warm', 'warm', b, c) : '') + laneHtml('Standard', 'std', b, c), one: !showWarm };
  }
  /* Who was left out of this blast, and why (Kate, 3 Nov 2026: "add mo rin dito alin yung ni exclude natin sa blasts"). Counted with the clients (nov_blast_leftout); each number opens the clients. */
  var LEFTWHY = [['nophone', 'No mobile number on file'], ['notwa', 'A number WhatsApp cannot reach (landline, invalid or not found)'], ['optout', 'Opted out or marked do not contact'],
    ['nochat', 'No chat with us on record in respond.io'],
    ['done', 'Already messaged (October blasts, or written to on WhatsApp since 9 Oct)'], ['booked', 'Already booked in'], ['dup', 'Shares a number with another client who gets it']];
  function leftSpec(b, reason, label) {
    return { title: (b.data.short || b.data.title) + ', left out: ' + label.toLowerCase(), cur: 'AED', sub: 'Clients who fit this blast but are not sent it, and why.',
      views: [{ id: 'clients', label: 'Clients', load: async function () {
        var r = await rpc('nov_blast_leftout_clients', { p_blast: b.id, p_reason: reason });
        var rows = (r.rows || []).map(function (x) { return { c: x.c, b: BR[x.b] || x.b, lv: x.lv, s: x.s }; });
        return { cols: [{ k: 'c', l: 'Client' }, { k: 'b', l: 'Salon' }, { k: 'lv', l: 'Last visit', t: 'date' }, { k: 's', l: 'Spent this year', t: 'aed' }], rows: rows, empty: 'Nobody.', note: r.total > rows.length ? 'Showing the ' + fmtN(rows.length) + ' who spent most, of ' + fmtN(r.total) + '.' : '' };
      } }] };
  }
  function leftHtml(b) {
    var r = LEFT && LEFT.blasts && LEFT.blasts[b.id]; if (!r) return '';
    var fit = 0, out = 0; Object.keys(r).forEach(function (k) { fit += r[k]; if (k !== 'in') out += r[k]; });
    var rows = LEFTWHY.filter(function (x) { return r[x[0]]; }).map(function (x) {
      var n = fmtN(r[x[0]]);
      return '<div class="nvb-lf"><span>' + esc(x[1]) + '</span><b>' + ((typeof TRSD !== 'undefined' && canEdit()) ? TRSD.num(n, leftSpec(b, x[0], x[1])) : n) + '</b></div>';
    }).join('');
    return '<div class="nvb-left"><span class="nvb-lefth"><b>Left out: ' + fmtN(out) + '</b> of the ' + fmtN(fit) + ' who fit this blast</span>' + rows + '<span class="nvb-small">Counted ' + esc(fat(LEFT.at)) + ', Dubai time.</span></div>';
  }
  /* Review and comments (Kate, 3 Nov 2026: "anyone can leave a comment"): anyone who can open this page can comment; Approve and Needs changes stay with the editors. Same as Campaign Blasts. */
  function reviewHtml(b, rv, ed) {
    var cm = (D.comments || []).filter(function (c) { return c.blast === b.id; }), lv5 = D.level === 5;
    var thread = cm.length ? cm.map(function (c) {
      return '<div class="cbl-cm' + (/^emma/i.test(c.by) ? ' emma' : '') + '"><div class="cbl-cm-h"><b>' + esc(c.by) + '</b><span>' + esc(fat(c.at)) + ((c.mine || lv5) ? ' <button type="button" data-nvb="cdel:' + c.id + '">Delete</button>' : '') + '</span></div><p>' + esc(c.body) + '</p></div>';
    }).join('') : '<p class="cbl-none">No comments yet. Say what you noticed.</p>';
    return '<div class="cbl-card cbl-rev" id="nvbReview"><div class="cbl-rev-top"><h3>Review and comments</h3>' + (ed
        ? '<div class="cbl-seg" role="group" aria-label="Review"><button type="button" data-nvb="rev:ok" class="ok' + (rv === 'ok' ? ' on' : '') + '">Approve</button><button type="button" data-nvb="rev:changes" class="changes' + (rv === 'changes' ? ' on' : '') + '">Needs changes</button></div>'
        : '<span class="cbl-chip ' + rcls(rv) + '">' + lab(rv) + '</span>') + '</div>' +
      (ed ? '' : '<p class="cbl-note">You can read the messages and leave comments. Approving is for Coach Emma and Kate.</p>') +
      (rv !== 'none' && b.review_by ? '<div class="cbl-by">' + (rv === 'ok' ? 'Approved' : 'Marked needs changes') + ' by ' + esc(b.review_by) + ', ' + esc(fat(b.review_at)) + (ed ? '. Tap the same button again to undo.' : '') + '</div>' : '') +
      '<div class="cbl-thr">' + thread + '</div>' +
      '<label class="cbl-q" for="nvbCmt">What did you notice? Would this make you reply? What would you change, and why?</label>' +
      '<textarea id="nvbCmt" maxlength="2000" placeholder="Write what you noticed"></textarea>' +
      (errMsg ? '<p class="cbl-err" role="alert">' + esc(errMsg) + '</p>' : '') +
      '<div class="cbl-row"><button type="button" class="cbl-pill" data-nvb="post">Post comment</button><span class="cbl-chip">Posting as ' + esc(D.me) + '</span></div></div>';
  }
  function knowHtml() {
    return fold('know', 'For the call centre: three things to know', '', '<div class="nvb-rules"><div><b>She writes STOP.</b> Honour it at once. Do not reply with an offer.</div><div><b>Never resend inside 24 hours.</b> A message Meta held back is not charged and is not to be sent again.</div><div><b>Al Quoz is shut Sundays and Mondays.</b> Its end date is Sat 28 Nov.</div></div>');
  }
  // The Terms and Conditions of a blast, in a pop-up (they used to sit in a Replies lane, which the phones made redundant).
  function termsModalHtml() {
    var b = item(termsFor), tm = item('terms'), t = b && b.data.tkey && tm && tm.data ? tm.data[b.data.tkey] : null; if (!t) return '';
    return '<div class="cbl"><div class="cbl-modal" data-nvb="termsx"><div class="cbl-bigcal cbl-card nvb-tcm" role="dialog" aria-modal="true" aria-label="' + esc(t.title) + '"><div class="cbl-big-h"><b>' + esc(t.title) + '</b><button type="button" class="cbl-big-x" data-nvb="termsx">Close</button></div>' +
      '<p class="cbl-hint">' + esc(t.intro) + '</p><ol class="nvb-tcl">' + (t.pts || []).map(function (p) { return '<li><b>' + esc(p[0]) + '</b> ' + esc(p[1]) + '</li>'; }).join('') + '</ol></div></div></div>';
  }
  /* The Kate: schedule card (Change day or time) is gone from the blast pages (Kate, 4 Nov 2026); schedHtml and the sched: handler stay unused, nov_blast_schedule and the data are untouched. */
  function blastMain(b) {
    var d = b.data, c = lv(b.id), rv = b.review, ed = canEdit(), tl = d.title, ids = sorted().map(function (x) { return x.id; }), i = ids.indexOf(b.id), pv = ids[i - 1], nx = ids[i + 1];
    var ln = lanesOf(b, c);
    var who = (d.who_b && d.who_b.length ? whoHtml(d) : '<p>' + esc(d.who) + '</p>') +
      (b.id === 'E' && c ? '<p>Had colour in the last 12 months: <b>' + num(c.colour, tl + ', had colour', { p_blast: b.id, p_flag: 'colour' }) + '</b> · The rest: <b>' + fmtN(c.n - c.colour) + '</b></p>' : '') +
      (c && c.unchecked ? '<p class="nvb-wa-note"><b>WhatsApp check:</b> ' + fmtN(c.unchecked) + ' of these ' + fmtN(c.n) + ' have not been checked in respond.io yet. The overnight check does it; Count again tomorrow morning. Numbers that are landlines, invalid, or not found there are left out (SMS-only).</p>' : '') +
      '<p><b>No repeats.</b> Left out: anyone messaged in October’s Lost Clients blasts or Wellness Voucher blasts 3 and 4, by name and by phone number, anyone we wrote to on WhatsApp since 9 Oct, and every opt-out. Not checked: Wellness Voucher blasts 1 and 2 (August), their recipients are only in GHL.</p>';
    var facts = '<div class="nvb-facts"><div><b>Cost, at most</b>' + (c ? calcNum('AED ' + fmtN(Math.round(c.n * RATE_AED)), 'cost', b.id) : '…') + '</div><div><b>Target by 30 Nov</b>' + esc(d.gold) + '</div><div><b>Message test</b>' + esc(d.arms) + '</div><div><b>Valid until</b>' + esc(d.valid || '30 November 2026') + '</div></div>';
    return '<div class="cbl-pos"><a href="?view=novblasts" data-nvb="sel:' + esc(pv || b.id) + '"' + (pv ? '' : ' class="off"') + '>‹ Previous</a><span>Blast ' + (i + 1) + ' of ' + ids.length + '</span><a href="?view=novblasts" data-nvb="sel:' + esc(nx || b.id) + '"' + (nx ? '' : ' class="off"') + '>Next ›</a></div>' +
      '<div class="cbl-head"><div><div class="cbl-eyebrow">' + esc(fdateY(d.date)) + ', ' + esc(fmtClock(clockMins(b))) + (aqDate(b) !== d.date ? '. Al Quoz: ' + esc(fdateY(aqDate(b))) : '') + '</div><h2>' + esc(d.title) + '</h2></div><span class="cbl-chip ' + rcls(rv) + '">' + lab(rv) + '</span></div>' +
      '<div class="cbl-card cbl-nums"><div><small>Clients</small><b>' + (c ? num(c.n, tl + ', every client', { p_blast: b.id }) : (liveErr ? '?' : '…')) + '</b><span class="cbl-live">' + (ed ? 'Tap the number to see the clients.' : '') + '</span>' + leftHtml(b) + '</div>' +
      '<div><small>Who</small>' + whoHtml(d) + tplHtml(b) + '</div><div><small>She gets</small>' + esc(d.gets || d.valid || '') + '</div></div>' +
      sendCardHtml(b) +
      '<div class="cbl-flowbar"><button type="button" class="cbl-bigbtn" data-nvb="flowbig">' + FLOWICON + 'See the flow bigger</button></div>' +
      '<div class="cbl-phones' + (ln.one ? ' nvb-onephone' : '') + '" id="nvbPhones">' + ln.html + '</div>' +
      '<div class="nvb-after nvb-afterrow">' + (d.tkey ? '<button type="button" class="nvb-btn" data-nvb="terms:' + esc(b.id) + '">Terms</button>' : '<span class="nvb-small nvb-noterms">No terms: no offer in this message.</span>') +
      '<button type="button" class="nvb-btn' + (sim[b.id] ? ' pri' : '') + '" data-nvb="sim:' + esc(b.id) + '" aria-pressed="' + (sim[b.id] ? 'true' : 'false') + '">If she replies</button></div>' +
      (isSplit(b) ? '<p class="nvb-small nvb-afterrow">Warm: last visit in the last 90 days' + warmSince() + '. ' + WHY_SPLIT + '</p>' : '') +
      reviewHtml(b, rv, ed) +
      '<div class="nvb-stack">' + fold('who', 'Who gets it, and who is left out', '', who) + fold('facts', 'Cost, target and test', '', facts) + planHtml() + octHtml() + knowHtml() + '</div>';
  }
  /* The All blasts view (Kate, 3 Nov 2026): the whole picture across the blasts in the main panel. Numbers, one row per blast (day, time, clients, review), what was left out in total and by
     reason, cost and sending time, the sending plan, and every client who gets a blast with the blast she is in. Every figure opens its rows. */
  function leftTotals() {
    if (!LEFT || !LEFT.blasts) return null;
    var tot = {}; blasts().forEach(function (b) { var r = LEFT.blasts[b.id] || {}; Object.keys(r).forEach(function (k) { tot[k] = (tot[k] || 0) + r[k]; }); });
    return tot;
  }
  function leftAllSpec(reason, label) {
    return { title: 'All blasts, left out: ' + label.toLowerCase(), cur: 'AED', sub: 'Clients who fit a blast but are not sent it, and why, across every blast.',
      views: [{ id: 'clients', label: 'Clients', load: async function () {
        var bs = blasts(), names = {}; bs.forEach(function (b) { names[b.id] = b.data.short || b.data.title; });
        var rs = await Promise.all(bs.map(function (b) { return rpc('nov_blast_leftout_clients', { p_blast: b.id, p_reason: reason }); })), rows = [], total = 0;
        rs.forEach(function (r, i) { total += r.total || 0; (r.rows || []).forEach(function (x) { rows.push({ c: x.c, b: BR[x.b] || x.b, k: names[bs[i].id], lv: x.lv, s: x.s }); }); });
        rows.sort(function (a, b) { return (b.s || 0) - (a.s || 0); });
        return { cols: [{ k: 'c', l: 'Client' }, { k: 'b', l: 'Salon' }, { k: 'k', l: 'Blast' }, { k: 'lv', l: 'Last visit', t: 'date' }, { k: 's', l: 'Spent this year', t: 'aed' }], rows: rows, empty: 'Nobody.', note: total > rows.length ? 'Showing the ' + fmtN(rows.length) + ' who spent most, of ' + fmtN(total) + '.' : '' };
      } }] };
  }
  function leftAllHtml() {
    var r = leftTotals(); if (!r) return '';
    var fit = 0, out = 0; Object.keys(r).forEach(function (k) { fit += r[k]; if (k !== 'in') out += r[k]; });
    var rows = LEFTWHY.filter(function (x) { return r[x[0]]; }).map(function (x) {
      var n = fmtN(r[x[0]]);
      return '<div class="nvb-lf"><span>' + esc(x[1]) + '</span><b>' + ((typeof TRSD !== 'undefined' && canEdit()) ? TRSD.num(n, leftAllSpec(x[0], x[1])) : n) + '</b></div>';
    }).join('');
    return '<div class="cbl-card nvb-allcard"><h3>Left out</h3><div class="nvb-left"><span class="nvb-lefth"><b>Left out: ' + fmtN(out) + '</b> of the ' + fmtN(fit) + ' who fit a blast</span>' + rows + '<span class="nvb-small">Counted ' + esc(fat(LEFT.at)) + ', Dubai time.</span></div></div>';
  }
  function allMain() {
    var bs = sorted(), ready = !!(LIVE && LIVE.blasts), tot = 0, dates = [];
    bs.forEach(function (b) { var c = lv(b.id); tot += c ? (c.n || 0) : 0; dates.push(b.data.date, aqDate(b)); });
    dates.sort();
    var last = calcRows().slice(-1)[0], hours = last ? last.hrs : 0, ph = '…';
    var totHtml = ready ? num(tot, 'November blasts, every client', {}, true) : (liveErr ? '?' : '…');
    var sp = anySplit();   // the Warm and Standard columns only while some blast still carries two messages
    var rows = '<div class="nvb-ab-r h' + (sp ? '' : ' one') + '"><span>Blast</span><span>Day</span><span>Clients</span>' + (sp ? '<span>Warm</span><span>Standard</span>' : '') + '<span>Review</span></div>' + bs.map(function (b) {
      var c = lv(b.id), t = b.data.short || b.data.title, bsp = isSplit(b);
      return '<div class="nvb-ab-r' + (sp ? '' : ' one') + '"><span><a href="?view=novblasts&blast=' + esc(b.id) + '" data-nvb="sel:' + esc(b.id) + '">' + esc(t) + '</a></span><span>' + esc(fdate(b.data.date)) + ', ' + esc(fmtClock(clockMins(b))) + (aqDate(b) !== b.data.date ? '<small>Al Quoz: ' + esc(fdate(aqDate(b))) + '</small>' : '') + '</span>' +
        '<span><b>' + (c ? num(c.n, t + ', every client', { p_blast: b.id }) : ph) + '</b></span>' + (sp ? '<span>' + (bsp ? (c ? num(c.warm, t + ', warm clients', { p_blast: b.id, p_group: 'warm' }) : ph) : '') + '</span><span>' + (bsp ? (c ? num(c.std, t + ', standard clients', { p_blast: b.id, p_group: 'std' }) : ph) : '') + '</span>' : '') + '<span><i class="cbl-chip ' + rcls(b.review) + '">' + lab(b.review) + '</i></span></div>';
    }).join('');
    return '<div class="cbl-head"><div><div class="cbl-eyebrow">' + (dates.length ? (dates[dates.length - 1] !== dates[0] ? esc(fdate(dates[0])) + ' to ' + esc(fdateY(dates[dates.length - 1])) : esc(fdateY(dates[0]))) : '') + '</div><h2>All blasts</h2></div><span class="cbl-chip ' + (approved() === bs.length && bs.length ? 'ok' : '') + '">' + approved() + ' of ' + bs.length + ' reviewed</span></div>' +
      '<div class="cbl-card nvb-allnums"><div><small>Clients</small><b>' + totHtml + '</b><span class="cbl-live">in ' + plural(bs.length, 'blast', 'blasts') + ', one message each. Tap a number to see the clients.</span></div>' +
      '<div><small>Cost, at most</small><b>' + (ready ? calcNum('AED ' + fmtN(Math.round(tot * RATE_AED)), 'cost') : '…') + '</b><span class="cbl-live">' + (ready ? 'about ' + calcNum('USD ' + fmtN(Math.round(tot * RATE_USD)), 'cost') : '') + '</span></div>' +
      '<div><small>Sending time</small><b>' + (ready ? calcNum((hours % 1 ? hours.toFixed(1) : hours) + ' hours', 'time') : '…') + '</b><span class="cbl-live">' + PACE + ' every 30 minutes, one number</span></div></div>' +
      '<div class="cbl-card nvb-allcard"><h3>By blast</h3><div class="nvb-ab">' + rows + '</div></div>' + leftAllHtml() +
      '<div class="nvb-stack">' + planHtml() + '</div>';
  }
  // The two phones of one blast, large, in an overlay (Kate, 3 Nov 2026: the same as Campaign Blasts): both phones side by side, a Close button, and the hint. The taps play the same flow as the page.
  function flowBigHtml(b) {
    var c = lv(b.id), ln = lanesOf(b, c);
    return '<div class="cbl"><div class="cbl-modal" data-nvb="flowx"><div class="cbl-flowbig cbl-card" role="dialog" aria-modal="true" aria-label="The flow, large"><div class="cbl-big-h">' +
      '<b>' + esc(b.data.title) + '</b><button type="button" class="cbl-big-x" data-nvb="flowx">Close</button></div>' +
      '<p class="cbl-hint">Tap a button to see what she gets next. If she types a question instead, it goes to the call centre.</p>' +
      '<div class="cbl-fm-phones' + (ln.one ? ' nvb-onephone' : '') + '">' + ln.html + '</div></div></div></div>';
  }
  function whoHtml(d) {
    if (d.who_b && d.who_b.length) return '<ul class="nvb-wl">' + d.who_b.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    return esc(d.who);
  }
  function messagesHtml() {
    var b = blast(cur); if (!b) return '<div class="nvb-pane"><h2>Messages</h2><p class="lead">No blasts are set up.</p></div>';
    return '<div class="cbl"><div class="cbl-shell"><aside class="cbl-side' + (sideOpen ? ' open' : '') + '" id="nvbSide"><button type="button" class="cbl-side-toggle" data-nvb="side" aria-expanded="' + (sideOpen ? 'true' : 'false') + '"><span>Calendar and blasts</span><span>+</span></button>' +
      '<div class="cbl-side-body">' + calSide() + totalSide() + listSide() + '</div></aside><div class="cbl-main" id="nvbMain">' + sendBarHtml() + (cur === ALLID ? allMain() : blastMain(b)) + '</div></div></div>';
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
  // One number sends everything (Belle, 3 Nov 2026: "samin i-send, kami din sasagot": the call centre sends and answers), so this is a queue on one number, blast after blast,
  // at about 200 every 30 minutes (Kate, 3 Nov). Past 9 pm is flagged: the call centre has to answer the replies that day.
  var PACE = 200;
  function planHtml() {
    if (!LIVE || !LIVE.blasts) return '';
    var byDay = {}, pre2 = item('pre'), snd2 = pre2 && pre2.data && pre2.data.sender;
    sorted().forEach(function (b) { var c = lv(b.id); (byDay[b.data.date] = byDay[b.data.date] || []).push({ b: b, n: c ? c.n : 0 }); });
    var rows = '<div class="nvb-pl-r nvb-pl3 h"><span>Blast</span><span>Clients</span><span>Sent between</span></div>';
    Object.keys(byDay).sort().forEach(function (iso) {
      var t = null, tot = 0;
      byDay[iso].forEach(function (x) {
        if (!x.n) return;
        var start = t == null ? clockMins(x.b) : t, end = start + Math.ceil(x.n / PACE) * 30;
        t = end; tot += x.n;
        rows += '<div class="nvb-pl-r nvb-pl3"><span>' + esc(fdate(iso)) + ', ' + esc(x.b.data.short || x.b.data.title) + '</span><span><b>' + num(x.n, (x.b.data.short || x.b.data.title) + ', every client', { p_blast: x.b.id }) + '</b></span><span>' + esc(fmtClock(start)) + ' to ' + esc(fmtClock(end)) + '</span></div>';
      });
      if (t != null) { var over = t > 21 * 60; rows += '<div class="nvb-pl-r nvb-pl3"><span><b>All done</b></span><span><b>' + fmtN(tot) + '</b></span><span class="' + (over ? 'over' : '') + '"><b>' + esc(fmtClock(t)) + '</b>' + (over ? ', too late for replies' : '') + '</span></div>'; }
    });
    return fold('plan', 'Sending plan', 'one number, about ' + PACE + ' every 30 minutes', rows + '<p>The call centre sends every blast from the call centre WhatsApp number' + (snd2 && snd2.number ? ' (' + esc(snd2.number) + (snd2.channel ? ', channel ' + esc(snd2.channel) : '') + ')' : '') + ', one after the other, from the time set on the first blast of the day (noon unless moved), and answers the replies. At 100 every 30 minutes it would take twice as long. Press Count again before sending: it takes in any STOP replies and the opt-out sheet.</p>');
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

  /* ---------- Send from the site (Level 5, Kate only; migrations/nov_send.sql, supabase/functions/nov-send-worker) ----------
     One number, about 200 every 30 minutes, blast after blast. Dry run is the default: a dry run goes through the whole queue and pace and is counted, but nothing is posted to respond.io.
     Everything that decides who is sent to (the booked and opt-out re-check, 24 hours, no retry of a failed message, the gate) is in the database; this is the control and the counts. */
  function isL5() { return typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL === 5; }
  var IMGS = [['', 'No header image'], ['assets/nov-blasts/nov-hair-to-beauty-4x5.png', 'Hair to beauty artwork, 4:5'], ['assets/nov-blasts/nov-beauty-to-hair-4x5.png', 'Beauty to hair artwork, 4:5']];
  function tplOf(b) { var t = b.data.tpl || {}, g = ['warm', 'std'].filter(function (x) { return t[x] && t[x].n; })[0]; return g ? { n: t[g].n, s: t[g].s || 'todo' } : null; }
  function sendOf(b) { return SND && SND.blasts ? (SND.blasts[b.id] || null) : null; }
  function defImg(b) { var im = b && b.data.img || ''; return IMGS.some(function (x) { return x[0] === im; }) ? im : ''; }
  function activeRun(x) { return !!x && (x.state === 'running' || x.state === 'paused') && !!x.counts && x.counts.queued > 0; }
  function pctOf(a, n) { return n ? (Math.round(a * 1000 / n) / 10) + '%' : '0%'; }
  function showSend(b) { var t = tplOf(b); return isL5() && !!SND && ((t && t.s === 'approved') || !!sendOf(b)); }
  function kick() { try { var r = sb.functions.invoke('nov-send-worker', { body: {} }); if (r && r.then) r.then(function () {}, function () {}); } catch (e) { /* the cron picks it up */ } }
  async function loadSend() { if (!isL5()) return; try { SND = await rpc('nov_send_info'); } catch (e) { console.error(e); SND = null; } }
  function sndOk() {
    if (!sndM || !SND) return false;
    if (sndM.kind === 'live') return sndTyped.trim().toUpperCase() === 'LIVE';
    if (sndM.kind === 'test') return sndPhone.replace(/\D/g, '').length >= 9 && !(sndTest && sndTest.busy);
    var live = !SND.dry_run;
    return !!sndPrev && !sndPrev.err && sndPrev.ok > 0 && (!live || sndTyped.trim().toUpperCase() === 'SEND ' + sndM.id.toUpperCase()) && !sndBusy;
  }
  function imgSelect() { return '<select id="nvbSndImg">' + IMGS.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === sndImg ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'; }
  function sendBarHtml() {
    if (!isL5() || !SND) return '';
    var g = SND.gate || {}, d = g.sent || 0, f = g.failed || 0, so = g.stop || 0;
    var st = SND.paused ? ['bad', 'Paused'] : !SND.enabled ? ['', 'Sending is off'] : SND.dry_run ? ['warn', 'On, dry run'] : ['good', 'On, live'];
    return '<div class="cbl-card nvb-sbar"><div class="nvb-sbar-top"><h3>Sending from the site</h3><span class="chip ' + st[0] + '">' + st[1] + '</span>' +
      (SND.dry_run ? '<span class="chip warn">Dry run: nothing goes to any client</span>' : '<span class="chip bad">Live: real messages</span>') + '</div>' +
      '<p class="nvb-small">One number: ' + esc(SND.channel) + '. About ' + SND.slot_cap + ' every ' + SND.slot_minutes + ' minutes, ' + esc(fmtClock(SND.hour_from * 60)) + ' to ' + esc(fmtClock(SND.hour_to * 60)) +
      ' Dubai time, blast after blast in the order they were queued. A failed message is never retried and nobody is written to twice inside 24 hours.</p>' +
      '<p class="nvb-small nvb-gate">The gate pauses everything if STOP replies pass ' + SND.stop_pct + '% or failed messages pass ' + SND.fail_pct + '% of what has been sent (judged once ' + SND.gate_min + ' have gone). So far: <b>' +
      fmtN(d) + '</b> sent, <b>' + fmtN(f) + '</b> failed (' + pctOf(f, d) + '), <b>' + fmtN(so) + '</b> STOP (' + pctOf(so, d) + ').</p>' +
      (SND.paused ? '<p class="nvb-err nvb-small" role="alert"><b>' + esc(SND.paused_reason || 'Paused') + '.</b> Look at the STOP and failed counts before you resume.</p>' : '') +
      (sndErr && !sndM ? '<p class="nvb-err nvb-small" role="alert">' + esc(sndErr) + '</p>' : '') +
      '<div class="nvb-sbtns"><button type="button" class="nvb-btn" data-nvb="snd:onoff"' + (sndBusy ? ' disabled' : '') + '>' + (SND.enabled ? 'Switch sending off' : 'Switch sending on') + '</button>' +
      (SND.dry_run ? '<button type="button" class="nvb-btn" data-nvb="snd:golive">Go live…</button>' : '<button type="button" class="nvb-btn" data-nvb="snd:dry">Back to dry run</button>') +
      (SND.paused ? '<button type="button" class="nvb-btn pri" data-nvb="snd:resume">Resume all</button>' : '<button type="button" class="nvb-btn" data-nvb="snd:pause">Pause all</button>') +
      '<button type="button" class="nvb-btn" data-nvb="snd:run">Run now</button></div></div>';
  }
  var SKIPWHY = { 'Has an appointment booked': 'Booked since the list was made' };
  function sendCardHtml(b) {
    if (!showSend(b)) return '';
    var t = tplOf(b), x = sendOf(b), c = x && x.counts || {}, h = '<div class="cbl-card cbl-when nvb-send"><h3>Send from the site</h3>', act = activeRun(x);
    if (!x) h += '<p class="nvb-small">Not queued yet. The template is approved in respond.io, so this blast can be sent.</p>';
    else {
      var total = x.queued_n || 0, done = (c.sent || 0) + (c.failed || 0) + (c.skipped || 0), skipN = 0, sk = x.skip || {}, er = x.errors || [];
      Object.keys(sk).forEach(function (k) { skipN += sk[k]; });
      var stLab = { running: 'Running', paused: 'Paused', cancelled: 'Cancelled' }[x.state] || x.state, sent = (c.sent || 0) + (c.failed || 0);
      h += '<div class="nvb-sstate"><span class="chip ' + (x.state === 'running' ? 'good' : x.state === 'paused' ? 'warn' : '') + '">' + esc(stLab) + '</span><span class="chip ' + (x.dry ? 'warn' : 'bad') + '">' + (x.dry ? 'Dry run' : 'Live') + '</span>' +
        '<span class="nvb-small">Queued ' + esc(fat(x.at)) + ' by ' + esc(x.by) + (x.image ? ', with the artwork' : ', no header image') + '</span></div>' +
        '<div class="nvb-prog" role="img" aria-label="' + done + ' of ' + total + ' done"><i style="width:' + (total ? Math.min(100, Math.round(done * 100 / total)) : 0) + '%"></i></div>' +
        '<div class="nvb-sc"><div><b>' + fmtN(c.queued || 0) + '</b><span>Queued</span></div><div><b>' + fmtN(c.sent || 0) + '</b><span>Sent</span></div>' +
        '<div><b>' + (x.dry ? '–' : fmtN(c.delivered || 0)) + '</b><span>Delivered or read</span></div><div class="' + (c.failed ? 'bad' : '') + '"><b>' + fmtN(c.failed || 0) + '</b><span>Failed' + (sent ? ' · ' + pctOf(c.failed || 0, sent) : '') + '</span></div>' +
        '<div class="' + (c.stop ? 'bad' : '') + '"><b>' + (x.dry ? '–' : fmtN(c.stop || 0)) + '</b><span>STOP' + (!x.dry && sent ? ' · ' + pctOf(c.stop || 0, sent) : '') + '</span></div></div>' +
        (x.dry ? '<p class="nvb-small">A dry run: the messages went through the queue and the pace, but nothing was posted, so delivered and STOP stay empty.</p>' : '<p class="nvb-small">Delivered and STOP come from respond.io a few minutes after each send, then again at 30 minutes, 2, 8 and 24 hours.</p>') +
        (skipN || c.skipped ? '<details class="nvb-fold nvb-sk"><summary><span>Left out when it was queued <small>' + fmtN(skipN) + '</small>' + (c.skipped ? ' · skipped since ' + fmtN(c.skipped) : '') + '</span></summary><div class="in">' +
          Object.keys(sk).map(function (k) { return '<div class="nvb-lf"><span>' + esc(SKIPWHY[k] || k) + '</span><b>' + fmtN(sk[k]) + '</b></div>'; }).join('') + '</div></details>' : '') +
        (er.length ? '<details class="nvb-fold nvb-sk" open><summary><span>Why some did not go</span></summary><div class="in">' + er.map(function (e) { return '<div class="nvb-lf"><span>' + esc(e.e) + '</span><b>' + fmtN(e.n) + '</b></div>'; }).join('') + '</div></details>' : '');
    }
    h += '<div class="nvb-sbtns"><button type="button" class="nvb-btn pri" data-nvb="snd:open:' + esc(b.id) + '"' + ((t && t.s === 'approved' && !act && !sndBusy) ? '' : ' disabled') + '>' + (x && !act ? 'Send again…' : 'Send…') + '</button>' +
      (x && x.state === 'running' && act ? '<button type="button" class="nvb-btn" data-nvb="snd:bpause:' + esc(b.id) + '">Pause this blast</button>' : '') +
      (x && x.state === 'paused' && act ? '<button type="button" class="nvb-btn" data-nvb="snd:bresume:' + esc(b.id) + '">Resume this blast</button>' : '') +
      (x && act ? '<button type="button" class="nvb-btn" data-nvb="snd:cancel:' + esc(b.id) + '">Cancel the rest</button>' : '') +
      (t && t.s === 'approved' ? '<button type="button" class="nvb-btn" data-nvb="snd:test:' + esc(b.id) + '">Test to one number…</button>' : '') + '</div></div>';
    return h;
  }
  function sndRow(l, v) { return '<div class="nvb-sr"><span>' + l + '</span><b>' + v + '</b></div>'; }
  function sndModalHtml() {
    if (!sndM || !SND) return '';
    var m = sndM, head, body, foot;
    if (m.kind === 'live') {
      head = 'Go live?';
      body = '<p>Right now every message sent from here is a <b>dry run</b>: nothing reaches a client. Going live means the next blast you queue sends real WhatsApp messages to real clients, from ' + esc(SND.channel) + '.</p>' +
        '<label class="nvb-sl" for="nvbSndTyped">Type <b>LIVE</b> to go live</label><input id="nvbSndTyped" type="text" autocomplete="off" autocapitalize="characters">' +
        '<p class="nvb-small">Sending also has to be switched on, and each blast still asks for its own typed confirmation.</p>';
      foot = '<button type="button" class="nvb-btn pri" id="nvbSndGo" data-nvb="snd:golive2"' + (sndOk() ? '' : ' disabled') + '>Go live</button>';
    } else if (m.kind === 'test') {
      var tb = item(m.id), tt = tplOf(tb), r = sndTest && sndTest.r;
      head = 'Test ' + esc(tb.data.short || tb.data.title) + ' to one number';
      body = '<p>Sends <b>one</b> message, the real template <code>' + esc(tt.n) + '</code>, to the number you type, from ' + esc(SND.channel) + '. ' + (SND.dry_run ? 'Dry run is on, so nothing is sent: it only goes through the queue.' : '<b>Dry run is off: this really sends.</b>') + '</p>' +
        '<label class="nvb-sl" for="nvbSndPhone">Number, with country code</label><input id="nvbSndPhone" type="tel" inputmode="tel" placeholder="+971 50 000 0000" autocomplete="off">' +
        '<label class="nvb-sl" for="nvbSndImg">Header image</label>' + imgSelect() +
        (sndTest ? '<p class="nvb-small nvb-tres">' + (sndTest.err ? '<span class="nvb-err">' + esc(sndTest.err) + '</span>' : sndTest.busy ? 'Queued, waiting for the worker…' : r ? 'Status: <b>' + esc(r.status) + '</b>' + (r.dry ? ' (dry run, nothing was posted)' : '') + (r.delivery ? ', ' + esc(r.delivery) : '') + (r.error ? '. ' + esc(r.error) : '') : '') + '</p>' : '');
      foot = '<button type="button" class="nvb-btn pri" id="nvbSndGo" data-nvb="snd:dotest"' + (sndOk() ? '' : ' disabled') + '>Send the test</button>';
    } else {
      var b = item(m.id), c = lv(b.id), tp = tplOf(b), pv = sndPrev, live = !SND.dry_run, n = pv && !pv.err ? pv.ok : (c ? c.n : null), hasEnd = /\{\{3\}\}/.test(((b.data.msg || {}).warm || (b.data.msg || {}).std || ''));
      var ahead = 0; Object.keys(SND.blasts || {}).forEach(function (k) { var z = SND.blasts[k]; if (k !== b.id && activeRun(z)) ahead += z.counts.queued; });
      var lots = n == null ? null : Math.ceil((n + ahead) / SND.slot_cap), mins = lots == null ? null : lots * SND.slot_minutes, hrs = mins == null ? '…' : (mins >= 120 ? (Math.round(mins / 6) / 10) + ' hours' : mins + ' minutes');
      var dropped = '';
      if (pv && !pv.err) { var dk = Object.keys(pv.skip || {}); dropped = dk.length ? ' · dropped now: ' + dk.map(function (k) { return pv.skip[k] + ' ' + esc((SKIPWHY[k] || k).toLowerCase()); }).join(', ') : ' · nobody dropped'; }
      head = 'Send ' + esc(b.data.short || b.data.title);
      body = '<div class="nvb-sbanner ' + (live ? 'bad' : 'warn') + '">' + (live ? 'LIVE: this sends real WhatsApp messages to real clients.' : 'Dry run: nothing goes to any client. It only runs the queue and the pace.') + '</div>' +
        '<div class="nvb-srows">' + sndRow('Blast', esc(b.data.title)) +
        sndRow('Clients on the page', c ? fmtN(c.n) : '…') +
        sndRow('After the re-check', pv ? (pv.err ? '<span class="nvb-err">Could not check: ' + esc(pv.err) + '</span>' : fmtN(pv.ok) + ' will be queued' + '<small>' + dropped + '</small>') : 'Checking appointments from today and the opt-out lists…') +
        sndRow('Template', '<code>' + esc(tp.n) + '</code>') +
        (hasEnd ? sndRow('End date {{3}}', esc((pv && pv.end) || b.data.end || '30 November 2026') + '<small> · Al Quoz clients: ' + esc((pv && pv.aq_end) || SND.aq_end) + '</small>') : '') +
        sndRow('Header image', imgSelect()) +
        sndRow('Cost, at most', n == null ? '…' : 'AED ' + fmtN(Math.round(n * RATE_AED)) + '<small> · about USD ' + fmtN(Math.round(n * RATE_USD)) + '; an undelivered message is not charged</small>') +
        sndRow('Sending time', n == null ? '…' : esc(hrs) + '<small> · ' + SND.slot_cap + ' every ' + SND.slot_minutes + ' minutes' + (ahead ? ', after the ' + fmtN(ahead) + ' already queued' : '') + '</small>') +
        sndRow('From', esc(SND.channel)) + '</div>' +
        (live ? '<label class="nvb-sl" for="nvbSndTyped">Type <b>SEND ' + esc(b.id) + '</b> to confirm</label><input id="nvbSndTyped" type="text" autocomplete="off" autocapitalize="characters">' : '') +
        '<p class="nvb-small">Anyone with an appointment booked from today on, on an opt-out list, written to in the last 24 hours, or whose last message failed, is dropped again at queue time and once more just before their message goes.</p>' +
        (sndErr ? '<p class="nvb-err nvb-small" role="alert">' + esc(sndErr) + '</p>' : '');
      foot = '<button type="button" class="nvb-btn pri" id="nvbSndGo" data-nvb="snd:go"' + (sndOk() ? '' : ' disabled') + '>' + (live ? 'Send ' : 'Dry run ') + (n == null ? '' : fmtN(n) + ' messages') + '</button>';
    }
    return '<div class="cbl"><div class="cbl-modal" data-nvb="sndx"><div class="cbl-bigcal cbl-card nvb-sm" role="dialog" aria-modal="true" aria-label="' + esc(head) + '"><div class="cbl-big-h"><b>' + head + '</b><button type="button" class="cbl-big-x" data-nvb="sndx">Close</button></div>' +
      '<div class="nvb-sbody">' + body + '</div><div class="nvb-sfoot"><button type="button" class="nvb-btn" data-nvb="sndx">Cancel</button>' + foot + '</div></div></div></div>';
  }
  function sndBindInputs() {
    var ti = document.getElementById('nvbSndTyped'), si = document.getElementById('nvbSndImg'), pi = document.getElementById('nvbSndPhone');
    function gate() { var bt = document.getElementById('nvbSndGo'); if (bt) bt.disabled = !sndOk(); }
    if (ti) { ti.value = sndTyped; ti.oninput = function () { sndTyped = ti.value; gate(); }; }
    if (si) { si.value = sndImg; si.onchange = function () { sndImg = si.value; }; }
    if (pi) { pi.value = sndPhone; pi.oninput = function () { sndPhone = pi.value; gate(); }; }
  }
  // a call that changes the sending state: draw busy, run it, take the new state from the answer (or read it again), draw
  async function sndCall(fn, args, after) {
    sndErr = ''; sndBusy = true; render(true);
    try { var r = await rpc(fn, args); if (r && r.blasts && r.dry_run != null) SND = r; else await loadSend(); if (after) after(r); }
    catch (e) { console.error(e); sndErr = e.message || 'That did not work, try again'; }
    sndBusy = false; render(true);
  }
  function sndAfterQueue() { kick(); setTimeout(function () { loadSend().then(function () { if (main() && main().offsetParent !== null && !sndM) render(true); }); }, 4000); }
  async function sndDoTest() {
    var id = sndM && sndM.id; if (!id) return;
    sndTest = { busy: true }; render(true);
    try {
      var jid = await rpc('nov_send_test', { p_blast: id, p_phone: sndPhone, p_image: sndImg || null, p_first: null });
      kick();
      for (var i = 0; i < 8; i++) {
        await new Promise(function (r) { setTimeout(r, 3000); });
        if (!sndM || sndM.kind !== 'test') return;
        var r = await rpc('nov_send_test_get', { p_id: jid });
        sndTest = { id: jid, r: r }; render(true);
        if (r && r.status !== 'queued' && r.status !== 'sending') return;
        kick();
      }
    } catch (e) { console.error(e); sndTest = { err: e.message || 'The test did not go' }; }
    render(true);
  }
  function sndAct(v) {
    if (!isL5() || !SND) return;
    var a = v.split(':'), w = a[0], id = a[1], b = id ? item(id) : null;
    if (w === 'open') {
      if (!b) return;
      sndM = { kind: 'send', id: id }; sndTyped = ''; sndImg = defImg(b); sndPrev = null; sndErr = ''; render(true);
      rpc('nov_send_preview', { p_blast: id }).then(function (r) { if (sndM && sndM.id === id) { sndPrev = r; render(true); } }).catch(function (e) { console.error(e); if (sndM && sndM.id === id) { sndPrev = { err: e.message || 'try again' }; render(true); } });
    }
    else if (w === 'test') { if (!b) return; sndM = { kind: 'test', id: id }; sndImg = defImg(b); sndTest = null; render(true); }
    else if (w === 'golive') { sndM = { kind: 'live' }; sndTyped = ''; render(true); }
    else if (w === 'golive2') { if (!sndOk()) return; sndM = null; sndTyped = ''; sndCall('nov_send_config_set', { p_patch: { dry_run: false } }); }
    else if (w === 'dry') { sndCall('nov_send_config_set', { p_patch: { dry_run: true } }); }
    else if (w === 'onoff') { sndCall('nov_send_config_set', { p_patch: { enabled: !SND.enabled } }); }
    else if (w === 'pause') { sndCall('nov_send_pause', { p_blast: null }); }
    else if (w === 'resume') { if (confirm('Resume sending? The gate starts counting again from now, so look at the STOP and failed counts first.')) sndCall('nov_send_resume', { p_blast: null }); }
    else if (w === 'bpause') { sndCall('nov_send_pause', { p_blast: id }); }
    else if (w === 'bresume') { sndCall('nov_send_resume', { p_blast: id }); }
    else if (w === 'cancel') { if (confirm('Cancel the messages of this blast that have not gone yet? The ones already sent stay sent.')) sndCall('nov_send_cancel', { p_blast: id }); }
    else if (w === 'run') { kick(); setTimeout(function () { loadSend().then(function () { if (main() && !sndM) render(true); }); }, 2500); }
    else if (w === 'dotest') { if (sndOk()) sndDoTest(); }
    else if (w === 'go') {
      if (!sndOk()) return;
      var bid = sndM.id, img = sndImg, typ = sndTyped; sndM = null; sndTyped = '';
      sndCall('nov_send_enqueue', { p_blast: bid, p_image: img || null, p_confirm: typ }, sndAfterQueue);
    }
  }
  // the counts move while a blast goes out: read them again every 15 seconds while one is queued and this page is open and no pop-up is up
  function sndStartPoll() {
    if (sndTimer || !isL5()) return;
    sndTimer = setInterval(function () {
      if (!SND || sndM || sndBusy || !main() || main().offsetParent === null || document.visibilityState !== 'visible') return;
      var live = Object.keys(SND.blasts || {}).some(function (k) { return activeRun(SND.blasts[k]); });
      if (live) loadSend().then(function () { if (!sndM) render(true); });
    }, 15000);
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

  // The simulation inside the phone (Kate, 3 Nov 2026, the same idea as Campaign Blasts): she types a reply, the call centre is told, and the script she gets back. The tap is only kept on this page.
  function simHtml(b) {
    if (!sim[b.id]) return '';
    var rp = item('reply'), script = rp && rp.data ? rp.data[b.id] : null, end = b.data.end || '30 November 2026', t0 = b.data.time;
    return '<div class="cbl-after"><b>She replies</b><span>for example</span></div><div class="cbl-out">Yes please, what times do you have this week?<span>' + tclock(t0, 5, true) + '</span></div>' +
      (script ? '<div class="cbl-bub cbl-rep"><div class="cbl-body">' + esc(String(script).replace(/\{\{1\}\}/g, 'Layla').replace(/\{\{2\}\}/g, 'Saadiyat').replace(/\{\{3\}\}/g, end).replace(/\. /g, '.\n\n')) + '</div><div class="cbl-time">' + tclock(t0, 6, true) + '</div></div>' : '') +
      '<div class="cbl-notify">Call centre notified in respond.io</div>' +
      (script ? '' : '<p class="nvb-small nvb-simnote">No reply script written yet for this blast. The call centre answers in the salon’s own warm words.</p>');
  }
  function render(keep) {
    var el = main(); if (!el) return;
    var y = window.scrollY, thY = {}; [].forEach.call(document.querySelectorAll('.cbl-thread[data-key]'), function (t) { thY[t.getAttribute('data-key')] = t.scrollTop; });
    var body = tab === 'decide' && decs().length ? decideHtml() : tab === 'before' ? beforeHtml() : messagesHtml();
    el.innerHTML = '<div class="nvb"><header class="nvb-head"><div class="eyebrow">Tools · 2026</div><h1>November blasts</h1>' +
      '<div class="nvb-chipsrow">' + (isL5() && SND && SND.enabled && !SND.dry_run ? '<span class="chip bad">Live sending is on</span>' : '<span class="chip warn">Draft, nothing sent</span>') + '<span class="chip">Every message ends 30 November</span><span class="chip">UAE salons</span></div>' +
      (liveErr ? '<p class="nvb-err">The counts could not be read just now, so the numbers show a question mark. Open the page again in a minute.</p>' : '') +
      (errMsg ? '<p class="nvb-err">' + esc(errMsg) + '</p>' : '') + numsHtml() + '</header>' + tabsHtml() + body + (big && tab === 'messages' ? bigCalHtml() : '') + (bigflow && tab === 'messages' && cur !== ALLID && blast(cur) ? flowBigHtml(blast(cur)) : '') + (termsFor && tab === 'messages' ? termsModalHtml() : '') + (sndM && tab === 'messages' ? sndModalHtml() : '') + '</div>';
    sndBindInputs();
    var cta = document.getElementById('nvbCmt'); if (cta) { cta.value = draft[cur] || ''; cta.oninput = function () { draft[cur] = cta.value; }; }
    [].forEach.call(document.querySelectorAll('.cbl-thread[data-key]'), function (t) {
      var k = t.getAttribute('data-key'); t.scrollTop = thY[k] || 0;
      if (flowScroll === k) { var outs = t.querySelectorAll('.cbl-out'), last = outs[outs.length - 1]; if (last) t.scrollTop += last.getBoundingClientRect().top - t.getBoundingClientRect().top - 10; }
    });
    flowScroll = null;
    if (keep) window.scrollTo({ top: y, behavior: 'instant' });   // the dashboard sets smooth scrolling, which would glide the page up
  }
  function toTop() { window.scrollTo({ top: 0, behavior: 'instant' }); }
  async function reload() { D = await rpc('nov_blast_get'); }
  async function loadLive() {
    try { LIVE = await rpc('nov_blast_audience'); liveErr = false; } catch (e) { console.error(e); liveErr = true; }
    try { LEFT = await rpc('nov_blast_leftout'); } catch (e) { LEFT = null; }   // who was left out and why; the page works without it
  }
  async function act(fn) {
    errMsg = '';
    try { await fn(); await reload(); } catch (e) { console.error(e); errMsg = 'That did not save: ' + (e.message || 'try again'); }
    render(true);
  }
  function bind() {
    var el = main(); if (!el || bound) return; bound = true;
    el.addEventListener('toggle', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-fold')) opened[t.getAttribute('data-fold')] = t.open; }, true);   // a fold stays as she left it when the page redraws
    el.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.dn')) return;   // a figure opens its own rows (drill.js), not the card it sits in
      var t = e.target.closest && e.target.closest('[data-nvb]'); if (!t || t.disabled || !D) return;
      if (t.tagName === 'A') e.preventDefault();
      var a = t.getAttribute('data-nvb').split(':'), k = a[0], v = a.slice(1).join(':');
      if (k === 'tab') { tab = v; render(); toTop(); syncUrl(); }
      else if (k === 'goto') { var q = v.split(':'); tab = q[0]; if (q[1] != null) dec = +q[1]; render(); toTop(); syncUrl(); }
      else if (k === 'go') { dec = +v; render(true); }
      else if (k === 'pick') { if (!canEdit()) return; act(function () { return rpc('nov_blast_decide', { p_idx: dec + 1, p_pick: +v }); }); }
      else if (k === 'clear') { act(function () { return rpc('nov_blast_decide', { p_idx: dec + 1, p_pick: null }); }); }
      else if (k === 'pill') { if (!(v in pills)) return; pills[v] = !pills[v]; savePills(); render(true); if (v === 'all' && pills.all && isL5()) { progPoll(); loadSend().then(function () { if (!sndM && pills.all && main() && main().offsetParent !== null) render(true); }); } }
      else if (k === 'cal') { if (!cal) return; cal.m += v === 'next' ? 1 : -1; if (cal.m > 11) { cal.m = 0; cal.y++; } if (cal.m < 0) { cal.m = 11; cal.y--; } render(true); }
      else if (k === 'day') { var hit = sorted().filter(function (x) { return x.data.date === v || aqDate(x) === v; }); if (!hit.length) return; var at = hit.map(function (x) { return x.id; }).indexOf(cur); cur = hit[(at + 1) % hit.length].id; rb = cur; render(true); syncUrl(); }
      else if (k === 'flow') { var fp = v.split(':'), fk = fp[0] + ':' + fp[1], fs = +fp[2], fi = +fp[3], pp = (fl[fk] || []).slice(0, fs); pp[fs] = fi; fl[fk] = pp; flowScroll = fk; render(true); }
      else if (k === 'flowreset') { delete fl[v]; render(true); }
      else if (k === 'side') { sideOpen = !sideOpen; render(true); }
      else if (k === 'big') { big = true; render(true); }
      else if (k === 'flowbig') { bigflow = true; render(true); }
      else if (k === 'close' || k === 'termsx' || k === 'flowx' || k === 'sndx') { if (t.classList.contains('cbl-modal') && e.target !== t) return; if (k === 'sndx' && sndBusy) return; big = false; bigflow = false; termsFor = ''; sndM = null; sndTest = null; render(true); }
      else if (k === 'snd') { sndAct(v); }
      else if (k === 'sel') { cur = v; rb = v; var sb2 = blast(v); if (sb2) { var cd2 = parts(sb2.data.date); cal = { y: cd2.getFullYear(), m: cd2.getMonth() }; } sideOpen = false; big = false; bigflow = false; render(true); syncUrl(); }   // stays where she is, so the picker works as a toggle and the message swaps in below
      else if (k === 'recount') { if (!canEdit() || counting) return; counting = true; render(true); rpc('nov_blast_audience', { p_recount: true }).then(function (r) { LIVE = r; liveErr = false; return rpc('nov_blast_leftout', { p_recount: true }).then(function (l) { LEFT = l; }).catch(function (e) { console.error(e); }); }).catch(function (e) { console.error(e); errMsg = 'Counting did not finish: ' + (e.message || 'try again'); }).then(function () { counting = false; render(true); }); }
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
      else if (k === 'terms') { termsFor = v; render(true); }
      else if (k === 'post') { var ta = document.getElementById('nvbCmt'), body = ta ? ta.value : '', bid = cur; if (!String(body).trim()) { errMsg = 'Write a comment first'; render(true); return; } draft[bid] = ''; act(function () { return rpc('nov_blast_comment', { p_id: bid, p_body: body }); }); }
      else if (k === 'cdel') { act(function () { return rpc('nov_blast_comment_delete', { p_comment_id: +v }); }); }
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
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (big || bigflow || termsFor || sndM) && main() && main().offsetParent !== null) { big = false; bigflow = false; termsFor = ''; sndM = null; sndTest = null; render(true); } });
  document.addEventListener('visibilitychange', function () {   // come back to the tab and see what others chose
    if (document.visibilityState !== 'visible' || !D || !main() || main().offsetParent === null) return;
    Promise.all([reload(), loadLive(), loadSend()]).then(function () { if (!sndM) render(true); }).catch(function () { /* keep what is on screen */ });
  });

  // Called by showView each time the page opens: read what the database says now, then draw.
  window.renderNovBlasts = async function () {
    var el = main(); if (!el) return;
    if (typeof TRS_LEVEL === 'undefined' || (TRS_LEVEL !== 3 && TRS_LEVEL !== 5) && !(typeof TRS_EXTRA !== 'undefined' && TRS_EXTRA.indexOf('campaignblasts') >= 0)) { notFound(); return; }
    if (firstOpen) { firstOpen = false; try { var q = new URLSearchParams(location.search); wantBlast = q.get('blast') || ''; wantTab = q.get('tab') || ''; } catch (e) { wantBlast = ''; wantTab = ''; } }
    errMsg = '';
    if (!D) el.innerHTML = '<div class="nvb"><header class="nvb-head"><h1>November blasts</h1></header><p class="slv-muted">Loading…</p></div>';
    try { await reload(); } catch (e) { console.error(e); notFound(); return; }
    if (wantBlast) { if (wantBlast === ALLID || (item(wantBlast) && isBlast(item(wantBlast)))) { cur = wantBlast; rb = wantBlast; } wantBlast = ''; }
    if (wantTab) { if (TABS.indexOf(wantTab) >= 0) tab = wantTab; wantTab = ''; }
    if (cur !== ALLID && (!item(cur) || !isBlast(item(cur)))) { cur = sorted()[0] ? sorted()[0].id : ''; rb = cur; }
    bind(); render(); syncUrl();
    loadLive().then(function () { if (main() && main().offsetParent !== null) render(true); });   // the counts come a moment after the page
    if (isL5()) { loadSend().then(function () { if (main() && main().offsetParent !== null && !sndM) render(true); }); sndStartPoll(); progPoll(); }   // the send control (Level 5) reads its own state
  };
})();
