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
   turns Live on. No tags are written to respond.io from here. 4 Nov 2026 (Kate: "build na"): a Results pill under All blasts opens how the blasts did (?blast=RESULTS, read live from nov_results(), migrations/nov_results.sql, counts only), and the
   Blasts list became a pill that starts closed. Needs only sb (the Supabase client), TRS_LEVEL, TRSD. */
(function () {
  function main() { return document.getElementById('novBlastsContent'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtN(n) { return Number(n || 0).toLocaleString('en-GB'); }
  var BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' }, BKEYS = ['SAA', 'KCA', 'MC', 'AQ'];
  /* Calendar and All blasts fold into pills (Kate, 4 Nov 2026: "calendar and all blasts, minimise to pills", "expandable, hideable when clicked"). Closed by default so the Blasts
     list sits high; what she opens is remembered in this browser only (localStorage, in try/catch: the page works with storage blocked). Front end only, no data touched. */
  var PILL_KEY = 'nvb-pills-v1', pills = { cal: false, all: false, bl: false };   // bl = the Blasts list (Kate, 4 Nov 2026: "minimise na tong BLASTS"), closed by default
  try { var ps0 = JSON.parse(localStorage.getItem(PILL_KEY) || '{}'); pills.cal = ps0.cal === true; pills.all = ps0.all === true; pills.bl = ps0.bl === true; } catch (e) {}
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
  var RESID = 'RESULTS', RES = null, resErr = false, resTimer = null;   // the Results view (Kate, 4 Nov 2026): how the blasts did, read live from nov_results()
  var SND = null, LOCKI = null, sndM = null, sndTyped = '', sndImg = '', sndPhone = '', sndPrev = null, sndTest = null, sndErr = '', sndBusy = false, sndTimer = null, sndAt = { on: false, v: '' }, sndPrevTok = 0, RWHEN = {};   // the send control (Level 5); sndAt = the Resend failed time (Dubai, 'YYYY-MM-DDTHH:MM'), RWHEN = when a scheduled resend goes, per blast
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
    var bs = sorted(), rev = bs.filter(function (x) { return x.review === 'ok' || x.review === 'changes'; }).length, o = pills.bl;
    var card = '<div class="cbl-tabs cbl-card"><div>' + bs.map(function (b) {
      return '<div class="cbl-tab' + (cur === b.id ? ' on' : '') + '"><a href="?view=novblasts" data-nvb="sel:' + esc(b.id) + '" style="padding-left:12px"><span>' + esc(b.data.short || b.data.title) + '</span><small>' + esc(fdate(b.data.date)) + ', ' + esc(fmtClock(clockMins(b))) + '</small></a>' +
        '<span class="cbl-dot ' + rcls(b.review) + '" title="' + lab(b.review) + '"></span></div>';
    }).join('') + '</div><p class="cbl-hint cbl-prog"><b>' + rev + ' of ' + bs.length + '</b> reviewed</p></div>';
    return '<div class="nvb-pwrap">' + pillBtn('bl', 'Blasts', rev + ' of ' + bs.length + ' reviewed', o, '', blast(cur) && cur !== ALLID && cur !== RESID && !o) + (o ? card : '') + '</div>';
  }
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  function resultsSide() {   // the Results pill sits under Blasts (the last pill) and opens the report in the main panel, like All blasts
    var a = RA(), n = 0; resRows().forEach(function (x) { n += x.audience || 0; });
    // "sent" means sent and not failed, the same figure as the All blasts pill (PG, from nov_send_info); the report's own count of everything respond.io took is called accepted
    var sub = PG.any ? Math.round(PG.s * 100 / (PG.t || 1)) + '% sent' : (a && n ? Math.round((a.sent - a.failed) * 100 / n) + '% sent' : (resErr ? '?' : '…'));
    return '<div class="nvb-pwrap"><button type="button" class="nvb-pill go' + (cur === RESID ? ' on' : '') + '" data-nvb="sel:' + RESID + '" title="Open the results of the November blasts"><span class="pt">Results</span><span class="ps num">' + esc(sub) + '</span>' + ARROW + '</button></div>';
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
      '<div class="cbl-chat-head"><span class="cbl-back">‹</span><span class="cbl-av"></span><span class="cbl-who">Tara Rose Salons UAE<small>Business account</small></span><span class="cbl-dots">⋮</span></div>' +
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
  var LEFTWHY = [['sent', 'Already sent this blast (not left out)'], ['nophone', 'No mobile number on file'], ['notwa', 'A number WhatsApp cannot reach (landline, invalid or not found)'], ['optout', 'Opted out or marked do not contact'],
    ['nochat', 'No chat with us on record in respond.io'],
    ['done', 'Already messaged (October blasts, or written to on WhatsApp since 9 Oct)'], ['booked', 'Already booked in'], ['dup', 'Shares a number with another client who gets it']];
  function leftSpec(b, reason, label) {
    return { title: (b.data.short || b.data.title) + (reason === 'sent' ? ', already sent' : ', left out: ' + label.toLowerCase()), cur: 'AED', sub: 'Clients who fit this blast but are not sent it, and why.',
      views: [{ id: 'clients', label: 'Clients', load: async function () {
        var r = await rpc('nov_blast_leftout_clients', { p_blast: b.id, p_reason: reason });
        var rows = (r.rows || []).map(function (x) { return { c: x.c, b: BR[x.b] || x.b, lv: x.lv, s: x.s }; });
        return { cols: [{ k: 'c', l: 'Client' }, { k: 'b', l: 'Salon' }, { k: 'lv', l: 'Last visit', t: 'date' }, { k: 's', l: 'Spent this year', t: 'aed' }], rows: rows, empty: 'Nobody.', note: r.total > rows.length ? 'Showing the ' + fmtN(rows.length) + ' who spent most, of ' + fmtN(r.total) + '.' : '' };
      } }] };
  }
  function leftHtml(b) {
    var r = LEFT && LEFT.blasts && LEFT.blasts[b.id]; if (!r) return '';
    var fit = 0, out = 0; Object.keys(r).forEach(function (k) { fit += r[k]; if (k !== 'in' && k !== 'sent') out += r[k]; });
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
  function termsText(b) {
    var tm = item('terms'), T = b && b.data.tkey && tm && tm.data ? tm.data[b.data.tkey] : null; if (!T) return '';
    return T.title + '\n\n' + T.intro + '\n\n' + (T.pts || []).map(function (p, i) { return (i + 1) + '. ' + p[0] + ' ' + p[1]; }).join('\n');
  }
  function copyTerms(id) {
    var b = item(id), txt = termsText(b), n = document.getElementById('nvbTcNote');
    var done = function () { if (n) n.textContent = 'Copied.'; }, fb = function () { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { if (n) n.textContent = 'Select the text and copy it.'; } ta.parentNode.removeChild(ta); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fb); else fb(); } catch (e) { fb(); }
  }
  /* The flow in words, from the same data the phone plays (nov_blast_items data.flow): what she does, what we send. */
  function flowSteps(b) {
    var d = b.data, f = d.flow, say = function (s) { return esc(String(s).replace(/\{\{1\}\}/g, 'Layla').replace(/\{\{2\}\}/g, 'Saadiyat').replace(/\{\{3\}\}/g, d.end || '30 November 2026')).replace(/\n/g, '<br>'); };
    var steps = [];
    if (!f || !f.root || !f.root.length) {
      steps = [['Template goes out', 'No buttons on this one, only the footer line.', ''], ['She types a reply', 'It goes to the call centre team, who answer her in respond.io.', '']];
    } else {
      steps.push(['Template goes out', 'The message and these buttons: ' + f.root.map(function (x) { return x.l; }).join(', ') + '.', '']);
      var seen = {}, q = f.root.slice();
      while (q.length) {
        var x = q.shift(), n = f.nodes && f.nodes[x.to]; if (!n || seen[x.to]) continue; seen[x.to] = 1;
        var sub = n.call ? 'Her answer goes to the call centre team, who are told.' : (n.b && n.b.length ? 'Then these buttons: ' + n.b.map(function (y) { return y.l; }).join(', ') + '.' : '');
        var txt = n.t + (n.fu ? '\nNo answer after 1 hour: ' + n.fu : '');
        steps.push(['She taps ' + x.l, sub, txt]); (n.b || []).forEach(function (y) { q.push(y); });
      }
      steps.push(['She types a message instead', 'It goes to the call centre team.', '']);
    }
    steps.push(['She types STOP', 'She is marked as opted out and left out of every later send.', '']);
    return '<ol class="nvb-flowsteps">' + steps.map(function (s) { return '<li><b>' + esc(s[0]) + '</b>' + (s[1] ? '<span>' + esc(s[1]) + '</span>' : '') + (s[2] ? '<div class="nvb-say">' + say(s[2]) + '</div>' : '') + '</li>'; }).join('') + '</ol>';
  }
  function tplDetails(b) {
    var d = b.data, m = d.msg && (d.msg.warm || d.msg.std) || '', vs = [], nm = { 1: 'first name', 2: 'salon', 3: 'end date' };
    m.replace(/\{\{(\d)\}\}/g, function (a, n) { if (vs.indexOf(n) < 0) vs.push(n); return a; });
    var btn = (d.flow && d.flow.root || []).map(function (x) { return x.l; }), row = function (k, v) { return '<div><small>' + esc(k) + '</small><span>' + v + '</span></div>'; };
    return '<div class="nvb-kvs">' + row('Category and language', 'Marketing, English (UK)') + row('Variables', vs.length ? vs.map(function (n) { return '{{' + n + '}} ' + (nm[n] || ''); }).join(', ') : 'None') +
      row('Header image', d.tkey || d.img ? 'Yes' : 'No') + row('Footer', d.footer ? esc(d.footer) : 'None') + row('Buttons', btn.length ? esc(btn.join(', ')) : 'None') + '</div>';
  }
  function termsSection(b) {
    var tm = item('terms'), T = b.data.tkey && tm && tm.data ? tm.data[b.data.tkey] : null;
    if (!T) return '<p class="nvb-small nvb-noterms">No terms: no offer in this message.</p>';
    return '<h4 class="nvb-h4">' + esc(T.title) + '</h4><p class="nvb-small">' + esc(T.intro) + '</p><ol class="nvb-tcl">' + (T.pts || []).map(function (p) { return '<li><b>' + esc(p[0]) + '</b> ' + esc(p[1]) + '</li>'; }).join('') + '</ol>' +
      '<div class="nvb-sbtns"><button type="button" class="nvb-btn" data-nvb="copyterms:' + esc(b.id) + '">Copy the terms</button><span class="nvb-small" id="nvbTcNote"></span></div>';
  }
  function whenSection(b, d) {
    var rows = [['Day and time', esc(fdateY(d.date)) + ', ' + esc(fmtClock(clockMins(b)))]];
    if (aqDate(b) !== d.date) rows.push(['Al Quoz', esc(fdateY(aqDate(b)))]);
    var pre = item('pre'), snd = pre && pre.data && pre.data.sender; if (snd) rows.push(['Who sends', 'The call centre, from ' + esc(snd.waba) + (snd.number ? ', ' + esc(snd.number) : '')]);
    return '<div class="nvb-kvs">' + rows.map(function (r) { return '<div><small>' + esc(r[0]) + '</small><span>' + r[1] + '</span></div>'; }).join('') + '</div>' + (isL5() && SND ? (lockedNow() ? lockDisable(paceHtml()) : paceHtml()) : '');
  }
  function blastMain(b) {
    var d = b.data, c = lv(b.id), rv = b.review, ed = canEdit(), tl = d.title, ids = sorted().map(function (x) { return x.id; }), i = ids.indexOf(b.id), pv = ids[i - 1], nx = ids[i + 1];
    var ln = lanesOf(b, c);
    var who = (d.who_b && d.who_b.length ? whoHtml(d) : '<p>' + esc(d.who) + '</p>') +
      (b.id === 'E' && c ? '<p>Had colour in the last 12 months: <b>' + num(c.colour, tl + ', had colour', { p_blast: b.id, p_flag: 'colour' }) + '</b> · The rest: <b>' + fmtN(c.n - c.colour) + '</b></p>' : '') +
      (c && c.unchecked ? '<p class="nvb-wa-note"><b>WhatsApp check:</b> ' + fmtN(c.unchecked) + ' of these ' + fmtN(c.n) + ' have not been checked in respond.io yet. The overnight check does it; Count again tomorrow morning. Numbers that are landlines, invalid, or not found there are left out (SMS-only).</p>' : '') +
      '<p><b>No repeats.</b> Left out: anyone messaged in October’s Lost Clients blasts or Wellness Voucher blasts 3 and 4, by name and by phone number, anyone we wrote to on WhatsApp since 9 Oct, and every opt-out. Not checked: Wellness Voucher blasts 1 and 2 (August), their recipients are only in GHL.</p>';
    var facts = '<div class="nvb-facts"><div><b>Cost, at most</b>' + (c ? calcNum('AED ' + fmtN(Math.round(c.n * RATE_AED)), 'cost', b.id) : '…') + '</div><div><b>Target by 30 Nov</b>' + esc(d.gold) + '</div><div><b>Message test</b>' + esc(d.arms) + '</div><div><b>Valid until</b>' + esc(d.valid || '30 November 2026') + '</div></div>';
    var posHead = '<div class="cbl-pos"><a href="?view=novblasts" data-nvb="sel:' + esc(pv || b.id) + '"' + (pv ? '' : ' class="off"') + '>‹ Previous</a><span>Blast ' + (i + 1) + ' of ' + ids.length + '</span><a href="?view=novblasts" data-nvb="sel:' + esc(nx || b.id) + '"' + (nx ? '' : ' class="off"') + '>Next ›</a></div>' +
      '<div class="cbl-head"><div><div class="cbl-eyebrow">' + esc(fdateY(d.date)) + ', ' + esc(fmtClock(clockMins(b))) + (aqDate(b) !== d.date ? '. Al Quoz: ' + esc(fdateY(aqDate(b))) : '') + '</div><h2>' + esc(d.title) + '</h2></div><span class="cbl-chip ' + rcls(rv) + '">' + lab(rv) + '</span></div>';
    var s1 = rsSec('1. Who gets it', 'Which clients are in this blast, and how many?',
      '<div class="nvb-bigno">' + (c ? num(c.n, tl + ', every client', { p_blast: b.id }) : (liveErr ? '?' : '…')) + '</div><p class="nvb-small">' + (c && c.sent_here ? fmtN(c.sent_here) + ' sent, ' + fmtN(c.unsent || 0) + ' not sent yet. ' : '') + (ed ? 'Tap the number to see the clients.' : '') + '</p>' + leftHtml(b) + who);
    var s2 = rsSec('2. The message', 'What does she read on her phone, and what happens when she taps?',
      '<div class="cbl-flowbar"><button type="button" class="cbl-bigbtn" data-nvb="flowbig">' + FLOWICON + 'See the flow bigger</button></div>' +
      '<div class="cbl-phones' + (ln.one ? ' nvb-onephone' : '') + '" id="nvbPhones">' + ln.html + '</div>' +
      '<div class="nvb-after nvb-afterrow">' + (d.tkey ? '<a class="nvb-btn" href="#nvbTerms">Terms and conditions</a>' : '<span class="nvb-small nvb-noterms">No terms: no offer in this message.</span>') +
      '<button type="button" class="nvb-btn' + (sim[b.id] ? ' pri' : '') + '" data-nvb="sim:' + esc(b.id) + '" aria-pressed="' + (sim[b.id] ? 'true' : 'false') + '">If she replies</button></div>' +
      (isSplit(b) ? '<p class="nvb-small nvb-afterrow">Warm: last visit in the last 90 days' + warmSince() + '. ' + WHY_SPLIT + '</p>' : ''));
    var s3 = rsSec('3. Template in respond.io', 'What exactly is in the template?', tplHtml(b).replace('nvb-tplbox', 'nvb-tplbox nvb-tplnb') + tplDetails(b));
    var s4 = rsSec('4. If she replies', 'What happens in WhatsApp when she taps or types?', flowSteps(b));
    var s5 = '<span id="nvbTerms"></span>' + rsSec('5. Terms and conditions', 'What are the terms that go with this blast?', termsSection(b));
    var s6 = isL5() && SND ? rsSec('6. Sending', 'Is sending on, how far did it get, and what can be sent again?', sendBarHtml() + sendCardHtml(b)) : '';
    var s7 = rsSec('7. When it goes out', 'When did it go out, and how?', whenSection(b, d));
    return posHead + s1 + s2 + s3 + s4 + s5 + s6 + s7 + reviewHtml(b, rv, ed) +
      '<div class="nvb-stack">' + fold('facts', 'Cost, target and test', '', facts) + planHtml() + octHtml() + knowHtml() + '</div>';
  }
  /* The All blasts view (Kate, 3 Nov 2026): the whole picture across the blasts in the main panel. Numbers, one row per blast (day, time, clients, review), what was left out in total and by
     reason, cost and sending time, the sending plan, and every client who gets a blast with the blast she is in. Every figure opens its rows. */
  function leftTotals() {
    if (!LEFT || !LEFT.blasts) return null;
    var tot = {}; blasts().forEach(function (b) { var r = LEFT.blasts[b.id] || {}; Object.keys(r).forEach(function (k) { tot[k] = (tot[k] || 0) + r[k]; }); });
    return tot;
  }
  function leftAllSpec(reason, label) {
    return { title: reason === 'sent' ? 'All blasts, already sent' : 'All blasts, left out: ' + label.toLowerCase(), cur: 'AED', sub: 'Clients who fit a blast but are not sent it, and why, across every blast.',
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
    var fit = 0, out = 0; Object.keys(r).forEach(function (k) { fit += r[k]; if (k !== 'in' && k !== 'sent') out += r[k]; });
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
  /* The Results view (Kate, 4 Nov 2026, mockup docs/mockups/nov-blasts-results.html in the cowork repo): how the November blasts did, the same shape as the October Lost Clients report.
     Everything is read live from nov_results() (migrations/nov_results.sql), counts only, no client name or phone number. A part that cannot be read yet says so and the reason; it fills in on
     its own when the data lands (the view reads again every minute while it is open). Nothing here is typed in, so nothing here can be made up. */
  function RA() { return RES && RES.blasts ? RES.blasts.filter(function (x) { return x.id === 'ALL'; })[0] || null : null; }
  function resRows() { return RES && RES.blasts ? RES.blasts.filter(function (x) { return x.id !== 'ALL'; }) : []; }
  function pc1(a, n) { return n ? (Math.round(a * 1000 / n) / 10).toFixed(1) + '%' : '0%'; }
  function money2(n) { return Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(n) { return Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 }); }
  function dubaiDay(iso) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } }
  function dubaiHm(iso) { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); } catch (e) { return ''; } }
  function resState() {
    var a = RA(), fd = RES && RES.first_send ? dubaiDay(RES.first_send) : '', sd = RES && RES.sales_to || '', bd = RES && RES.bookings_pulled || '', sent = a ? a.sent : 0, wa = a ? a.wa_after : 0;
    var stl = RES && RES.stale || {}, staleS = !!stl.sales, staleB = !!stl.bookings;
    return { fd: fd, replies: sent > 0 && wa >= sent * 0.9 ? 'ok' : (wa > 0 ? 'part' : 'no'), sales: !!(sd && fd && sd >= fd) && !staleS, bookings: !!(bd && fd && bd > fd) && !staleB, staleS: staleS, staleB: staleB };
  }
  function whyReplies() { return 'The WhatsApp status check that reads replies last ran ' + fat(RES.wa_check) + (RES.first_send && RES.wa_check < RES.first_send ? ', before the first message went out (' + fat(RES.first_send) + ')' : '') + '. It fills in once that check runs again on the clients we sent to.'; }
  function whySales(st) { if (st.staleS) return 'Sales are only in to ' + fdate(RES.sales_to) + ', ' + fmtN(RES.sales_age_days) + ' days behind. Paid at the till, Came in and Cost per booking hold until the daily Phorest upload catches up, so they do not show a number that is too low.'; return 'Sales are in to ' + fdate(RES.sales_to) + ', and the first message went out ' + fdate(st.fd) + ', so no till sale after a message is in yet.'; }
  function whyBookings(st) { if (st.staleB) return 'The bookings list was last pulled ' + fdate(RES.bookings_pulled) + ', ' + fmtN(RES.bookings_age_days) + ' days ago (it normally refreshes six times a day). Booked ahead, Cost per booking and Projected hold until it is fresh, so they do not show a number that is too low.'; return 'The bookings list is the one pulled ' + fdate(RES.bookings_pulled) + ', the day the first message went out, and it has no booked-on date, so it cannot tell a new booking from an old one. A list pulled the next day is readable.'; }
  function rsCell(label, val, note) { return '<div><small>' + esc(label) + '</small><b>' + val + '</b><span class="cbl-live">' + note + '</span></div>'; }
  function rsWait(label, why) { return '<div class="wait"><small>' + esc(label) + '</small><b>Not readable yet</b><span class="cbl-live">' + esc(why) + '</span></div>'; }
  function rsTable(heads, rows) {   // heads: [label, css]; rows: [{ t: total row, c: [html] }]
    return '<div class="nvb-rs-tw"><table class="nvb-rs-t"><thead><tr>' + heads.map(function (h) { return '<th' + (h[1] ? ' class="' + h[1] + '"' : '') + '>' + esc(h[0]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.t ? ' class="tot"' : '') + '>' + r.c.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function rsSec(title, lead, inner, note) { return '<div class="cbl-card nvb-rs-sec"><h3>' + esc(title) + '</h3>' + (lead ? '<p class="nvb-rs-lead">' + esc(lead) + '</p>' : '') + inner + (note ? '<p class="nvb-small nvb-rs-note">' + note + '</p>' : '') + '</div>'; }
  /* 5 Nov 2026 (Kate: "saan clickable values? lalo na tong 7 clients booked ahead", "walang projected spend vs actual spend", "kung anong meron sa oct blasts na info dapat meron din dito sa nov blasts", "except warm vs standard"):
     the Results view carries what October's Lost Client Blasts Performance page has. Every count opens the clients behind it (nov_drill, migrations/nov_results_parity.sql, the same shape as
     October's lost_drill: name and number copy on click, a Chat link to respond.io), Money from the bookings is projected vs actual spend (nov_campaign_money), delivery by blast, branch and
     day, by day, and a send log with filters and XLSX / CSV (nov_send_log_get). Results count a client's LATEST message only (a resent message replaces the first). No deposit section: none of
     the November offers asks for a deposit (buy one get one beauty, 25% off a first hair visit, two reminders). */
  var MON = null, monBusy = false, monErr = false, rsV = { money: 'visual', del: 'visual' };
  var LOG = { rows: [], total: 0, loaded: false, busy: false, err: false, sel: { blast: '', branch: 'all', status: 'all', outcome: 'all', q: '', page: 1, per: 10 }, open: {} };
  try { if (localStorage.getItem('nvb-money-view') === 'table') rsV.money = 'table'; if (localStorage.getItem('nvb-del-view') === 'table') rsV.del = 'table'; } catch (e) { /* fine without storage */ }
  var NV_DRILL = { sent: 'Accepted by respond.io', reached: 'Delivered or read', read: 'Read', delivered: 'Delivered, not read yet', unconfirmed: 'Not confirmed yet', failed: 'Failed', checked: 'Status-checked',
    never_checked: 'Not status-checked yet', stop: 'STOP', replied: 'Wrote back', queued: 'Still queued', ahead: 'Booked ahead', appts: 'Booked ahead, with their appointments', came_in: 'Already came in, nothing booked',
    paid: 'Paid at the till since the message', since: 'Booked since the message or came in', bsince: 'Booked since the message', dep_paid: 'Booked ahead, deposit paid', dep_today: 'Booked for today, no deposit needed', dep_need: 'Booked ahead, deposit likely needed, not paid', dep_none: 'Booked ahead, short service, no deposit needed', dep_nodep: 'Booked ahead, no deposit needed', dep_need_1: 'Deposit likely needed, today or tomorrow', dep_need_2: 'Deposit likely needed, in 2 to 3 days', dep_need_3: 'Deposit likely needed, in 4 to 7 days', dep_need_4: 'Deposit likely needed, in 8 to 14 days', dep_need_5: 'Deposit likely needed, later',
    sent_ok: 'Sent', failed_any: 'Failed', skipped: 'Dropped just before sending', notgone: 'Did not go', again: 'Sent again', again_delivered: 'Sent again, delivered or read', again_failed: 'Sent again, failed', again_queued: 'Sent again, still to go' };
  var NV_BUCKET = { '1': 'Wrote to us in the last 30 days', '2': 'Wrote to us 31 to 90 days ago', '3': 'Wrote to us 91 to 180 days ago', '4': 'Wrote to us over 180 days ago', '5': 'Never wrote to us' };
  var NV_SPLIT = [['hair_services', 'Hair services (colour, cut, extensions)'], ['hair_treat', 'Hair treatments'], ['beauty_services', 'Beauty and nails'], ['retail_hair', 'Retail, hair'], ['retail_beauty', 'Retail, beauty'], ['other', 'Other']];
  var DM = null, DMFrom = null, logQT = null;
  // A number that opens the clients behind it. ctx keys: b blast, br branch, d day or half-hour slot, r failed reason ('~none' = none saved yet), k how recently she wrote to us (1 to 5). Zero stays plain text.
  function nn(n, metric, ctx, fmt) {
    var v = (fmt || fmtN)(n);
    if (!metric || !(+n > 0)) return v;
    var c = ctx || {};
    return '<span class="nvb-num" role="button" tabindex="0" data-nm="' + metric + '"' + (c.b && c.b !== 'ALL' ? ' data-nb="' + esc(c.b) + '"' : '') + (c.br ? ' data-nbr="' + esc(c.br) + '"' : '') + (c.d ? ' data-nd="' + esc(c.d) + '"' : '') +
      (c.r != null ? ' data-nr="' + esc(c.r) + '"' : '') + (c.k ? ' data-nk="' + esc(c.k) + '"' : '') + ' title="See who">' + v + '</span>';
  }
  function blastName(id) { var r = RES && RES.blasts ? RES.blasts.filter(function (x) { return x.id === id; })[0] : null; return r ? r.name : id; }
  function nvDay(d) { try { return d && d.length === 10 ? fdate(d) : (d ? fdate(d.slice(0, 10)) + ' ' + d.slice(11) : ''); } catch (e) { return d; } }
  function dmTitle(d) {
    var bits = [NV_DRILL[d.nm] || d.nm];
    if (d.nb) bits.push(blastName(d.nb));
    if (d.nbr) bits.push(BR[d.nbr] || d.nbr);
    if (d.nd) bits.push(nvDay(d.nd));
    if (d.nr != null) bits.push(d.nr === '~none' ? 'no reason saved yet' : d.nr);
    if (d.nk) bits.push(NV_BUCKET[d.nk] || '');
    return bits.join(' · ');
  }
  function nvWho(r) {
    return '<span class="lr-copy nvb-copy" role="button" tabindex="0" data-copy="' + esc(r.client) + '" title="Click to copy the name">' + esc(r.client) + '</span> <span class="lr-copy nvb-copy nvb-ph" role="button" tabindex="0" data-copy="' + esc(r.phone || '') + '" title="Click to copy the number">' + esc(r.phone || ('…' + r.last4)) + '</span>' +
      (r.cid ? ' <a class="nvb-chat" href="https://app.respond.io/space/250275/inbox/' + (+r.cid) + '" target="_blank" rel="noopener" title="Open her chat in respond.io">Chat ↗</a>' : '');
  }
  function nvStatus(r) {
    if (r.status === 'queued' || r.status === 'sending') return '<span class="nvb-tag">Queued</span>';
    if (r.status !== 'sent') return '<span class="nvb-tag bad">' + esc(r.status) + '</span>';
    if (r.delivery === 'read') return '<span class="nvb-tag good">Read</span>';
    if (r.delivery === 'delivered') return '<span class="nvb-tag good">Delivered</span>';
    if (r.delivery === 'failed') return '<span class="nvb-tag bad" title="' + esc(r.reason || 'Meta did not deliver it') + '">Failed</span>';
    return '<span class="nvb-tag">Not confirmed</span>';
  }
  function nvOut(r) {
    var o = r.outcome;
    if (!o) return '<span class="slv-muted">–</span>';
    if (o === 'stop') return '<span class="nvb-tag bad">STOP / opt out</span>';
    if (o === 'booked') return '<span class="nvb-tag good">Booked ahead</span>';
    return '<span class="nvb-tag good">Came in</span>' + (r.spent ? ' <span class="slv-note">AED ' + money0(r.spent) + '</span>' : '');
  }
  function nvNext(r) { return r.next ? esc(fdate(r.next)) + (r.svc ? ' <span class="slv-note">' + esc(r.svc) + '</span>' : '') : '<span class="slv-muted">–</span>'; }
  function nvSent(r) { return r.d ? esc(fdate(r.d)) + ' <span class="nvb-t">' + esc(r.t) + '</span>' : '<span class="slv-note">not sent yet</span>'; }
  var NV_HEAD = '<th>Branch</th><th>Client</th><th>Blast</th><th>Status</th><th>Outcome</th><th title="A WhatsApp message from her after our message, as read by the WhatsApp status check. A booking does not need one.">Wrote back on WhatsApp</th><th>Sent</th><th>Next appointment</th>';
  function nvCells(r) {
    return '<td>' + esc(BR[r.branch] || r.branch || '') + '</td><td>' + nvWho(r) + '</td><td>' + esc(blastName(r.blast)) + '</td><td>' + nvStatus(r) + '</td><td>' + nvOut(r) + '</td><td>' + (r.replied ? '<span class="nvb-tag good">Yes</span>' : '<span class="slv-muted">–</span>') + '</td><td>' + nvSent(r) + '</td><td>' + nvNext(r) + '</td>';
  }
  function dmClose() {
    if (DM) DM.remove();
    DM = null; document.body.classList.remove('lr-modal-open');
    if (DMFrom && document.contains(DMFrom)) DMFrom.focus();
    DMFrom = null;
  }
  async function dmOpen(el) {
    var d = el.dataset;
    dmClose(); DMFrom = el;
    var box = document.createElement('div');
    box.className = 'lr-modal nvb-md'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', dmTitle(d));
    box.innerHTML = '<div class="lr-modal-box"><div class="lr-modal-hd"><div><h3>' + esc(dmTitle(d)) + '</h3><p class="slv-note" id="nvDmSub">Loading…</p></div><button type="button" class="tglr lc-btn" data-nvr="dmx">Close</button></div><div class="lr-modal-body" id="nvDmBody"></div></div>';
    document.body.appendChild(box); document.body.classList.add('lr-modal-open');
    DM = box;
    var cb = box.querySelector('[data-nvr="dmx"]'); if (cb) cb.focus();
    var data = null, bad = false;
    try { data = await rpc('nov_drill', { p_metric: d.nm, p_blast: d.nb || null, p_branch: d.nbr || 'all', p_day: d.nd || null, p_reason: d.nr != null ? d.nr : null, p_bucket: d.nk || null }); } catch (e) { console.error(e); bad = true; }
    if (DM !== box) return;   // closed, or another one opened, while it loaded
    var sub = box.querySelector('#nvDmSub'), bd = box.querySelector('#nvDmBody');
    if (bad || !data) { sub.textContent = 'The list did not load. Close this and try again.'; return; }
    var n = data.total || 0, rows = data.rows || [];
    sub.textContent = fmtN(n) + (data.per_client ? ' client' : ' message') + (n === 1 ? '' : 's') + (n > rows.length ? ', the first ' + fmtN(rows.length) + ' shown' : '') + '. Click a name or number to copy it.' + (data.per_client ? ' Wrote back on WhatsApp is only a WhatsApp message from her after ours, so a client can be booked with a dash there: she may have booked by phone, on the website or at the salon.' : '');
    bd.innerHTML = rows.length ? '<div class="nvb-dw"><table class="nvb-dt"><thead><tr>' + NV_HEAD + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + nvCells(r) + '</tr>'; }).join('') + '</tbody></table></div>' : '<p class="slv-muted">Nobody to show.</p>';
  }
  async function nvCopy(el) {
    var txt = el.getAttribute('data-copy') || '';
    if (!txt) return;
    var ok = false;
    try { var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (y) { /* try the clipboard API */ }
    if (!ok) { try { await Promise.race([navigator.clipboard.writeText(txt), new Promise(function (_, no) { setTimeout(no, 800); })]); ok = true; } catch (x) { /* shown below */ } }
    var tip = document.createElement('div');
    tip.className = 'lr-tip'; tip.setAttribute('role', 'status'); tip.textContent = ok ? 'Copied: ' + txt : 'Could not copy';
    document.body.appendChild(tip);
    var r = el.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left)) + 'px';
    tip.style.top = Math.max(8, r.top - tip.offsetHeight - 6) + 'px';
    setTimeout(function () { tip.remove(); }, 1300);
  }
  /* The send log (Kate, 5 Nov 2026): every real message, latest per client, with the filters October's log has (blast, branch, status, outcome, search) and XLSX / CSV of whatever the filters show. */
  function logArgs(off, lim) { var s = LOG.sel; return { p_blast: s.blast || null, p_branch: s.branch, p_status: s.status, p_outcome: s.outcome, p_q: s.q.trim(), p_offset: off, p_limit: lim }; }
  async function loadLog() {
    if (LOG.busy) return;
    LOG.busy = true;
    try { var d = await rpc('nov_send_log_get', logArgs((LOG.sel.page - 1) * LOG.sel.per, LOG.sel.per)); LOG.rows = d.rows || []; LOG.total = d.total || 0; LOG.loaded = true; LOG.err = false; } catch (e) { console.error(e); LOG.err = true; }
    LOG.busy = false; paintLog();
  }
  function paintLog() { var el = document.getElementById('nvLog'); if (el) el.innerHTML = logInner(); }
  function logSet(k, v) { LOG.sel[k] = k === 'per' ? ([10, 20, 50, 100].indexOf(+v) >= 0 ? +v : 10) : v; LOG.sel.page = 1; LOG.open = {}; loadLog(); }
  function logInner() {
    if (LOG.err && !LOG.loaded) return '<p class="slv-muted">The log did not load. Open the page again in a minute.</p>';
    if (!LOG.loaded) return '<p class="slv-muted">Loading the log…</p>';
    var s = LOG.sel, per = s.per, pages = Math.max(1, Math.ceil(LOG.total / per)), p = Math.min(s.page, pages);
    var rows = LOG.rows.map(function (r) {
      var open = !!LOG.open[r.id];
      return '<tr class="nvb-lrow' + (open ? ' open' : '') + '" data-nvr="logrow:' + r.id + '">' + nvCells(r) + '</tr>' +
        (open ? '<tr class="nvb-ltext"><td colspan="8"><div class="lq-bubble">' + esc(r.text || '') + '</div>' + (r.reason ? '<div class="slv-note nvb-lbad">Failed: ' + esc(r.reason) + '</div>' : '') +
          '<div class="slv-note">' + (r.svc ? 'Booked for ' + esc(r.svc) + ' · ' : '') + 'queued by ' + esc(r.by || '–') + (r.message_id ? ' · respond.io message ' + esc(r.message_id) : '') + '</div></td></tr>' : '');
    }).join('');
    var perSel = LOG.total > 10 ? '<select class="nvb-sel" aria-label="Rows a page" data-nlg="per">' + [10, 20, 50, 100].map(function (n) { return '<option value="' + n + '"' + (per === n ? ' selected' : '') + '>' + n + ' rows</option>'; }).join('') + '</select>' : '';
    var pager = LOG.total > 10 ? '<div class="nvb-pager">' + (pages > 1 ? '<button type="button" class="tglr lc-btn" ' + (p <= 1 ? 'disabled ' : '') + 'data-nvr="logpage:' + (p - 1) + '">‹ Prev</button><span class="slv-note">Page ' + fmtN(p) + ' of ' + fmtN(pages) + '</span><button type="button" class="tglr lc-btn" ' + (p >= pages ? 'disabled ' : '') + 'data-nvr="logpage:' + (p + 1) + '">Next ›</button>' : '') + perSel + '</div>' : '';
    return '<p class="slv-note">' + fmtN(LOG.total) + ' message' + (LOG.total === 1 ? '' : 's') + (LOG.total ? ', newest first. Click a row to read what she was sent.' : '') + '</p>' +
      (LOG.total ? '<div class="nvb-dw"><table class="nvb-dt nvb-lt"><thead><tr>' + NV_HEAD + '</tr></thead><tbody>' + rows + '</tbody></table></div>' + pager : '<p class="slv-muted">Nothing matches these filters.</p>');
  }
  function logSec(rows) {
    var s = LOG.sel, sel = function (key, label, opts) { return '<select class="nvb-sel" aria-label="' + label + '" data-nlg="' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(s[key]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; };
    var bar = '<div class="nvb-tools">' + sel('blast', 'Blast', [['', 'All blasts']].concat(rows.map(function (x) { return [x.id, x.name]; }))) + sel('branch', 'Branch', [['all', 'All branches']].concat(BKEYS.map(function (b) { return [b, BR[b]]; }))) +
      sel('status', 'Status', [['all', 'Every status'], ['reached', 'Delivered or read'], ['read', 'Read'], ['delivered', 'Delivered, not read'], ['unconfirmed', 'Not confirmed yet'], ['failed', 'Failed'], ['queued', 'Queued']]) +
      sel('outcome', 'Outcome', [['all', 'Any outcome'], ['booked', 'Booked ahead'], ['done', 'Came in'], ['replied', 'Wrote back'], ['stop', 'STOP'], ['none', 'No outcome yet']]) +
      '<input type="search" class="nvb-q" id="nvLogQ" data-nlg="q" placeholder="Search name or last 4 digits" value="' + esc(s.q) + '">' +
      '<span class="nvb-spacer"></span><button type="button" class="tglr lc-btn" data-nvr="logsave:xlsx" title="Download the log for these filters, with the message for each">XLSX</button><button type="button" class="tglr lc-btn" data-nvr="logsave:csv" title="Download the log for these filters, with the message for each">CSV</button><span id="nvLogNote" class="slv-note"></span></div>';
    return rsSec('9. Send log', 'Every real message, her latest one if she was sent more than one. Name and number copy on click; Chat opens her conversation in respond.io.', bar + '<div id="nvLog">' + logInner() + '</div>');
  }
  async function logSave(kind) {
    var note = document.getElementById('nvLogNote'), say = function (t) { if (note) note.textContent = t; };
    if (typeof lgxBuild !== 'function') { say('The spreadsheet writer is not loaded yet. Reload the page.'); return; }
    say('Getting the log…');
    var out = [];
    for (var off = 0; ; off += 500) {
      var d; try { d = await rpc('nov_send_log_get', logArgs(off, 500)); } catch (e) { console.error(e); say('The log did not download. Try again.'); return; }
      out = out.concat(d.rows || []); say('Getting the log… ' + fmtN(out.length) + ' of ' + fmtN(d.total));
      if (!d.rows || d.rows.length < 500 || out.length >= d.total) break;
    }
    var head = ['Date sent', 'Time sent (Dubai)', 'Blast', 'Branch', 'Client', 'Phone', 'Status', 'Delivery', 'Failed reason', 'Outcome', 'Wrote back', 'STOP', 'Next appointment', 'Booked for', 'Message sent', 'Queued by', 'respond.io message', 'respond.io chat'];
    var dl = { read: 'Read', delivered: 'Delivered', sent: 'Not confirmed yet', failed: 'Failed' }, oc = { stop: 'STOP', booked: 'Booked ahead', done: 'Came in' }, yn = function (v) { return v ? 'Yes' : 'No'; };
    var lines = out.map(function (r) { return [r.d || '', r.t || '', blastName(r.blast), BR[r.branch] || r.branch, r.client, r.phone || r.last4, r.status, dl[r.delivery] || '', r.reason || '', oc[r.outcome] || '', yn(r.replied), yn(r.stop), r.next || '', r.svc || '', r.text || '', r.by || '', r.message_id || '', r.cid ? 'https://app.respond.io/space/250275/inbox/' + r.cid : '']; });
    var built = lgxBuild({ sheets: [{ name: 'Send log', blocks: [{ cols: head.map(function (h) { return { label: h, fmt: 'text' }; }), rows: lines.map(function (l) { return { cells: l }; }) }] }] });
    var s = LOG.sel, slug = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
    var name = ['november-blasts-send-log', s.blast ? slug(blastName(s.blast)) : '', s.branch !== 'all' ? slug(BR[s.branch] || s.branch) : '', s.status !== 'all' ? s.status : '', s.outcome !== 'all' ? s.outcome : '', s.q.trim() ? 'search' : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
    if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
    else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
    say('Saved ' + fmtN(lines.length) + ' rows as ' + kind.toUpperCase());
  }
  async function loadMoney() {
    if (monBusy) return;
    monBusy = true;
    for (var i = 0; i < 2; i++) {
      try { MON = await rpc('nov_campaign_money'); monErr = false; break; } catch (e) { console.error(e); monErr = true; await new Promise(function (res) { setTimeout(res, 900); }); }
    }
    monBusy = false;
    if (cur === RESID && main() && main().offsetParent !== null && !sndM && !typing()) render(true);
  }
  function typing() { var a = document.activeElement; return !!(a && a.id === 'nvLogQ'); }
  function rsAct(v, t) {
    var a = v.split(':'), k = a[0], x = a.slice(1).join(':');
    if (k === 'dmx') dmClose();
    else if (k === 'money') { rsV.money = x === 'table' ? 'table' : 'visual'; try { localStorage.setItem('nvb-money-view', rsV.money); } catch (e) { /* fine */ } render(true); }
    else if (k === 'del') { rsV.del = x === 'table' ? 'table' : 'visual'; try { localStorage.setItem('nvb-del-view', rsV.del); } catch (e) { /* fine */ } render(true); }
    else if (k === 'logrow') { LOG.open[x] = !LOG.open[x]; paintLog(); }
    else if (k === 'logpage') { LOG.sel.page = Math.max(1, +x || 1); LOG.open = {}; loadLog(); }
    else if (k === 'logsave') logSave(x);
  }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var n = t.closest('.nvb-num'); if (n) { e.preventDefault(); dmOpen(n); return; }
    var c = t.closest('.nvb-copy'); if (c) { e.preventDefault(); nvCopy(c); return; }
    var x = t.closest('[data-nvr]'); if (x && (x.closest('#novBlastsContent') || x.closest('.nvb-md'))) { rsAct(x.getAttribute('data-nvr'), x); return; }
    if (DM && t === DM) dmClose();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && DM) { dmClose(); return; }
    var t = e.target; if (!t || !t.closest || (e.key !== 'Enter' && e.key !== ' ')) return;
    var n = t.closest('.nvb-num'); if (n) { e.preventDefault(); dmOpen(n); return; }
    var c = t.closest('.nvb-copy'); if (c) { e.preventDefault(); nvCopy(c); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t || !t.getAttribute) return;
    var k = t.getAttribute('data-nlg'); if (!k || k === 'q' || !t.closest('#novBlastsContent')) return;
    logSet(k, t.value);
  });
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t || !t.getAttribute || t.getAttribute('data-nlg') !== 'q' || !t.closest('#novBlastsContent')) return;
    clearTimeout(logQT); logQT = setTimeout(function () { logSet('q', t.value); }, 350);
  });

  function rsBar(r, ctx) {
    var n = r.sent || 0, d = (r.read || 0) + (r.delivered || 0), f = r.failed || 0, u = r.unconfirmed || 0;
    var w = function (x) { return n ? (Math.round(x * 1000 / n) / 10) : 0; };
    return '<div class="nvb-rs-bar"><span>' + esc(r.name) + '</span><div class="nvb-rs-track" role="img" aria-label="' + esc(r.name) + ': ' + d + ' delivered or read, ' + f + ' failed, ' + u + ' not confirmed yet, of ' + n + ' accepted"><i class="d" style="width:' + w(d) + '%"></i><i class="x" style="width:' + w(f) + '%"></i><i class="w" style="width:' + w(u) + '%"></i></div><span>' + (ctx ? nn(n, 'sent', ctx) : fmtN(n)) + ' accepted</span></div>';
  }
  var BAR_LEG = '<div class="nvb-rs-leg"><span><b class="d"></b>Delivered or read</span><span><b class="x"></b>Failed</span><span><b class="w"></b>Not confirmed yet</span></div>';
  function gline(cls, label, v, max) { var w = max > 0 ? Math.max(v > 0 ? 1 : 0, Math.round(1000 * v / max) / 10) : 0; return '<div class="nvb-gl"><div class="nvb-gt" role="img" aria-label="' + esc(label) + ': AED ' + money0(v) + '"><i class="' + cls + '" style="width:' + w + '%"></i></div><b>AED ' + money0(v) + '</b></div>'; }
  function grow(label, sub, lines) { return '<div class="nvb-gr"><div class="nvb-glab">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</div><div class="nvb-gls">' + lines + '</div></div>'; }

  // The October Lost Clients sections on the November Results (Kate, 9 Nov 2026): The campaign so far, Booked ahead who has paid a deposit, What it took to get a booking, By first send day.
  var DEP_SOON = { 1: 'Today or tomorrow', 2: 'In 2 to 3 days', 3: 'In 4 to 7 days', 4: 'In 8 to 14 days', 5: 'Later' };
  function depSec(st, a, bkok) {
    var lead = 'Clients we messaged who now have a visit booked, and whether a deposit is in. The deposit policy is the one October used: balayage, foils or highlights, all over colour, a restyle or extensions ask for one; a short service does not; the same day never does.';
    if (!bkok) return rsSec('3. Booked ahead: who has paid a deposit', lead, '<div class="nvb-rs-nums">' + rsWait('Booked ahead', whyBookings(st)) + '</div>');
    var D = RES.deposits || {}, t = D.total || {}, by = D.by_branch || [], sn = D.soon_need || [], m = a.money || {};
    var cards = rsCell('Clients booked', nn(t.booked, 'ahead'), nn(m.appts, 'appts') + ' appointments from today on') +
      rsCell('Deposit paid', nn(t.paid, 'dep_paid'), pc1(t.paid, t.booked) + ' of the booked') +
      rsCell('Deposit likely needed', nn(t.need, 'dep_need'), 'not paid yet: balayage, foils, all over colour, restyle or extension') +
      rsCell('No deposit needed', nn((t.none || 0) + (t.today || 0), 'dep_nodep'), 'by policy: ' + nn(t.none, 'dep_none') + ' short service, ' + nn(t.today, 'dep_today') + ' come today');
    var maxB = Math.max.apply(null, by.map(function (x) { return x.booked; }).concat([1]));
    var seg = function (cls, n, tot, label) { return n > 0 ? '<i class="' + cls + '" style="width:' + Math.round(1000 * n / tot) / 10 + '%" title="' + esc(label) + ': ' + n + '"></i>' : ''; };
    var brRows = by.map(function (x) {
      var cx = { br: x.k };
      return grow(esc(BR[x.k] || x.k), '', '<div class="nvb-gl"><div class="nvb-gt"><div class="stk" style="width:' + Math.max(4, Math.round(1000 * x.booked / maxB) / 10) + '%">' + seg('pd', x.paid, x.booked, 'Deposit paid') + seg('td', x.today, x.booked, 'Today, none needed') + seg('sd', x.none, x.booked, 'Short service, none needed') + seg('nd', x.need, x.booked, 'Likely needed, not paid') + '</div></div><b>' + nn(x.booked, 'ahead', cx) + '</b></div>');
    }).join('') || '<p class="slv-muted">Nobody booked yet.</p>';
    var leg = '<div class="nvb-rs-leg"><span><b class="pd"></b>Deposit paid</span><span><b class="td"></b>Today, none needed</span><span><b class="sd"></b>Short service, none needed</span><span><b class="nd"></b>Likely needed, not paid</span></div>';
    var sm = {}; sn.forEach(function (x) { sm[x.k] = x.n; });
    var maxS = Math.max.apply(null, [1, 2, 3, 4, 5].map(function (k) { return sm[k] || 0; }).concat([1]));
    var soon = [1, 2, 3, 4, 5].map(function (k) { var n = sm[k] || 0; return grow(esc(DEP_SOON[k]), '', '<div class="nvb-gl"><div class="nvb-gt"><i class="p" style="width:' + (n ? Math.max(4, Math.round(1000 * n / maxS) / 10) : 0) + '%"></i></div><b>' + nn(n, 'dep_need_' + k) + '</b></div>'); }).join('');
    var body = '<div class="nvb-rs-nums">' + cards + '</div><div class="nvb-g2"><div class="nvb-gp"><h4 class="nvb-h4">By branch</h4>' + brRows + leg + '</div>' +
      '<div class="nvb-gp"><h4 class="nvb-h4">Likely needed, not paid: how soon they come</h4>' + soon + '<p class="nvb-small">These are the ones reception can chase today. Check at the chair first: a client who booked her next visit before leaving the salon does not need one.</p></div></div>';
    return rsSec('3. Booked ahead: who has paid a deposit', lead, body, 'Deposits arrive with the nightly sales upload, so one paid today shows tomorrow. For example: a client has balayage booked for Thursday and no deposit shows in Phorest. She reads Likely needed, so reception messages her before then.');
  }
  function tookSec(st, a, bkok, slok, r2, reached) {
    var m = a.money || {};
    if (!(bkok && slok)) return rsSec('What it took to get a booking', '', '<div class="nvb-rs-nums">' + rsWait('Cost per booking', !bkok ? whyBookings(st) : whySales(st)) + '</div>');
    if (!(m.booked_or_in > 0)) return rsSec('What it took to get a booking', '', '<p class="slv-muted">Nobody has booked or come in yet.</p>');
    var cost = a.sent * r2, costD = reached * r2, cells = rsCell('Messages per booking', (a.sent / m.booked_or_in).toFixed(1), fmtN(a.sent) + ' messages accepted for ' + nn(m.booked_or_in, 'since') + ' clients who booked or came in since our message') +
      rsCell('Cost per booking', 'AED ' + money2(costD / m.booked_or_in), 'AED ' + money0(costD) + ' for the ' + fmtN(reached) + ' delivered over ' + nn(m.booked_or_in, 'since') + ' clients. AED ' + money2(cost / m.booked_or_in) + ' if every accepted message is charged') +
      (m.ahead > 0 ? rsCell('Cost per booking ahead', 'AED ' + money2(costD / m.ahead), 'the same delivered spend over the ' + nn(m.ahead, 'ahead') + ' clients with a booking from today on') : '');
    return rsSec('What it took to get a booking', 'Booked or came in = a booking from today on, a booking first seen after her first message, or a till sale since. A ceiling, not proof the message caused it.', '<div class="nvb-rs-nums">' + cells + '</div>');
  }
  function bookDaysSec(st, a, bkok, slok) {
    var rows = RES.bookdays || [], m = a.money || {};
    if (!rows.length || !(bkok || slok)) return '';
    var head = [['Day', ''], ['Clients', 'n']].concat(bkok ? [['Booked ahead', 'n'], ['Booked since', 'n']] : [], slok ? [['Came in', 'n']] : [], bkok && slok ? [['Booked or came in', 'n']] : []);
    var line = function (x, cx, tot, label) {
      return { t: tot, c: [esc(label), tot ? fmtN(x.clients) : nn(x.clients, 'sent', cx)].concat(bkok ? [nn(x.ahead, 'ahead', cx), nn(x.booked_since, 'bsince', cx)] : [], slok ? [nn(x.came_in, 'came_in', cx)] : [], bkok && slok ? [nn(x.booked_or_in, 'since', cx)] : []) };
    };
    var body = rows.map(function (x) { return line(x, { d: x.d }, false, fdate(x.d)); });
    body.push(line({ clients: m.clients, ahead: m.ahead, booked_since: m.booked_since, came_in: m.came_in, booked_or_in: m.booked_or_in }, {}, true, 'All'));
    return rsSec('By first send day', 'One row for each day a client was first messaged (Dubai time). Booked since is the running count, so it does not fall when an appointment date passes.', rsTable(head, body));
  }
  // Money from the bookings (Kate, 5 Nov 2026): what the messages cost, what the booked appointments should bring in (projected) and what the clients we messaged have paid since (actual).
  function rt(x) { return x >= 10 ? money0(x) : money2(x); }
  function moneySec(st, a, bkok, slok, r2) {
    var lead = 'What the bookings are worth, and what the messages cost. Same method as October: projected prices each booked service at the median of what it charged in the last 120 days, actual is what the clients we messaged have paid since their first message.';
    if (!MON) return rsSec('4. Money from the bookings', lead, '<p class="slv-muted">' + (monErr ? 'The money could not be read just now. It tries again in a minute.' : 'Loading…') + '</p>');
    var al = MON.all || {}, by = MON.by_branch || [], bb = MON.by_blast || [], sp = (al.sent || 0) * r2, spD = (al.reached || 0) * r2, tbl = rsV.money === 'table';
    var toggle = '<div class="tp-seg nvb-seg" role="group" aria-label="View"><button type="button" class="' + (tbl ? '' : 'on') + '" data-nvr="money:visual">Graph</button><button type="button" class="' + (tbl ? 'on' : '') + '" data-nvr="money:table">Table</button></div>';
    var waitP = '<span class="nvb-rs-dash">Not readable yet</span>', body;
    if (tbl) {
      var line = function (label, x, ctx, bold) {
        var f = function (v) { return bold ? '<b>' + v + '</b>' : v; }, cost = (x.sent || 0) * r2;
        return { t: !!bold, c: [esc(label), nn(x.sent, 'sent', ctx), money2(cost), bkok ? nn(x.ahead, 'ahead', ctx) : 'Not yet', bkok ? nn(x.appts, 'appts', ctx) : 'Not yet', bkok ? money2(x.proj) : 'Not yet', bkok && x.ahead ? money2(x.proj / x.ahead) : '–',
          slok ? nn(x.visited, 'paid', ctx) : 'Not yet', slok ? money2(x.actual) : 'Not yet', slok && cost > 0 && x.actual > 0 ? 'AED ' + rt(x.actual / cost) : '–'] };
      };
      var heads = [['', ''], ['Accepted by respond.io', 'n'], ['Spent, estimate at ' + r2, 'n'], ['Clients booked ahead', 'n'], ['Appointments', 'n'], ['Projected spend', 'n'], ['Projected per client', 'n'], ['Came in and paid', 'n'], ['Actual spend', 'n'], ['AED back per AED 1', 'n']];
      var h1 = heads.slice(); h1[0] = ['Blast', ''];
      var h2 = heads.slice(); h2[0] = ['Branch', ''];
      body = rsTable(h1, bb.map(function (x) { return line(blastName(x.k), x, { b: x.k }); }).concat([line('All', al, {}, true)])) +
        '<h4 class="nvb-h4">By branch</h4>' + rsTable(h2, by.map(function (x) { return line(BR[x.k] || x.k, x, { br: x.k }); }).concat([line('All', al, {}, true)])) +
        '<h4 class="nvb-h4">Actual spend, by what they bought</h4>' + rsTable([['What', ''], ['Actual spend', 'n'], ['Share', 'n']], NV_SPLIT.map(function (p) { return { c: [esc(p[1]), money2(al[p[0]]), al.actual ? pc1(al[p[0]], al.actual) : '–'] }; }).concat([{ t: true, c: ['All', money2(al.actual), al.actual ? '100.0%' : '–'] }]));
    } else {
      var mx = Math.max(1, al.proj || 0, al.actual || 0, sp), bmx = Math.max(1, Math.max.apply(null, by.concat(bb).map(function (x) { return Math.max(x.proj || 0, x.actual || 0); })));
      var ratio = sp > 0 && al.actual > 0 ? al.actual / sp : 0, ratioD = spD > 0 && al.actual > 0 ? al.actual / spD : 0;
      var key = '<div class="nvb-rs-leg"><span><b class="p"></b>Projected (booked ahead)</span><span><b class="d"></b>Actual (paid since our message)</span></div>';
      var panel1 = '<div class="nvb-gp"><h4 class="nvb-h4">What we spent, and what it is worth</h4><p class="nvb-small">All on one scale. AED, VAT included.</p>' +
        grow('Spent on messages', nn(al.sent, 'sent') + ' accepted at AED ' + r2 + ' (estimate)', gline('s', 'Spent on messages', sp, mx)) +
        grow('If only delivered are charged', nn(al.reached, 'reached') + ' delivered or read, at AED ' + r2, gline('s', 'Spent if only delivered messages are charged', spD, mx)) +
        grow('Projected', bkok ? nn(al.ahead, 'ahead') + ' clients booked ahead, ' + nn(al.appts, 'appts') + ' appointments from today on' : 'Bookings not readable yet', bkok ? gline('p', 'Projected spend', al.proj || 0, mx) : waitP) +
        grow('Actual so far', slok ? nn(al.visited, 'paid') + ' of the ' + fmtN(al.sent) + ' we messaged have paid' : 'Sales not readable yet', slok ? gline('d', 'Actual spend so far', al.actual || 0, mx) : waitP) +
        '<p class="nvb-gcall">' + (ratio ? 'For every <b>AED 1</b> the messages cost, the clients we messaged have spent <b>AED ' + rt(ratio) + '</b> since' + (ratioD ? ' (<b>AED ' + rt(ratioD) + '</b> if only the delivered messages are charged)' : '') + '. ' : '') +
        (bkok && al.ahead ? 'Average projected per booked client <b>AED ' + money0(al.proj / al.ahead) + '</b> (AED ' + money0(al.appts ? al.proj / al.appts : 0) + ' per appointment). Cost per booked client <b>AED ' + money2(sp / al.ahead) + '</b>, or AED ' + money2(spD / al.ahead) + ' if only delivered are charged. ' : '') +
        '<span class="nvb-gnote">Some of them may have booked before our message or been coming anyway, so read it as a ceiling, not proof the message did it.</span></p></div>';
      var split = function (list, key2) {
        return list.slice().sort(function (p, q) { return (q.actual || 0) - (p.actual || 0) || (q.proj || 0) - (p.proj || 0); }).map(function (x) {
          var ctx = key2 === 'b' ? { b: x.k } : { br: x.k };
          return grow(esc(key2 === 'b' ? blastName(x.k) : (BR[x.k] || x.k)), (bkok ? nn(x.ahead, 'ahead', ctx) + ' booked' : 'bookings not readable yet') + (slok ? ', ' + nn(x.visited, 'paid', ctx) + ' came in and paid' : ''),
            (bkok ? gline('p', 'Projected', x.proj || 0, bmx) : '') + (slok ? gline('d', 'Actual', x.actual || 0, bmx) : ''));
        }).join('') || '<p class="slv-muted">Nobody yet.</p>';
      };
      var panel2 = '<div class="nvb-gp"><h4 class="nvb-h4">By branch: projected and actual</h4><p class="nvb-small">Biggest actual first, then biggest projected.</p>' + split(by, 'br') + key + '</div>';
      var panel3 = '<div class="nvb-gp"><h4 class="nvb-h4">By blast: projected and actual</h4><p class="nvb-small">Same scale as the branches.</p>' + split(bb, 'b') + key + '</div>';
      var panel4 = '<div class="nvb-gp"><h4 class="nvb-h4">Actual spend, by what they bought</h4>' + (slok && al.actual > 0 ? '<p class="nvb-small">AED ' + money0(al.actual) + ' in all.</p>' + NV_SPLIT.filter(function (p) { return al[p[0]] > 0; }).map(function (p) {
        return grow(esc(p[1]), '', '<div class="nvb-gl"><div class="nvb-gt"><i class="d" style="width:' + Math.max(1, Math.round(1000 * al[p[0]] / al.actual) / 10) + '%"></i></div><b>AED ' + money0(al[p[0]]) + ' <em>' + pc1(al[p[0]], al.actual) + '</em></b></div>'); }).join('') : '<p class="slv-muted">' + (slok ? 'Nobody we messaged has paid at the till since the message yet.' : 'Sales after the message are not readable yet.') + '</p>') + '</div>';
      body = '<div class="nvb-g2">' + panel1 + panel2 + '</div><div class="nvb-g2">' + panel3 + panel4 + '</div>';
    }
    var unp = al.unpriced || 0;
    return '<div class="cbl-card nvb-rs-sec"><div class="nvb-hd"><h3>4. Money from the bookings</h3>' + toggle + '</div><p class="nvb-rs-lead">' + esc(lead) + '</p>' + body +
      '<p class="nvb-small nvb-rs-note"><b>Projected</b> is what the booked appointments should bring in. <b>Actual</b> is what the clients we messaged have paid so far. <b>Spent</b> is what the messages cost, an estimate at AED ' + r2 + ' each (the sender has no billing data). Booked ahead, appointments, accepted, delivered and came in and paid open their clients; the AED figures add up services and have no list behind them.</p>' +
      '<details class="nvb-fold" data-fold="money-how"' + (opened['money-how'] ? ' open' : '') + '><summary>How these are worked out</summary><p class="nvb-small"><b>Projected</b> prices each service on the booked appointments from today on at the median of what that exact service charged in the last 120 days, VAT included. ' +
      (unp ? fmtN(unp) + ' of the ' + fmtN(al.svcs) + ' booked services have no price yet (a package or a new name) and count as 0, so it runs low. ' : '') + 'The Phorest bookings report has no booked-on date, so since 9 Nov we log the first day each booking was seen at every bookings pull (from 4 Nov, the send day). <b>Booked since the message</b> counts a booking first seen on or after the first message day of that client, and it stays counted after the appointment date passes, so Cost per booking no longer shrinks as days go by. A booking first seen on 4 Nov may pre-date the message by a few hours. <b>Booked ahead</b> is only the snapshot of bookings from today on. When the bookings list is more than 1 day old, or sales are more than 2 days behind, the figures that depend on them hold and say why. <b>Actual</b> is everything the clients we messaged have paid since the day of their first message, VAT included, refunds taken off, without deposits, vouchers sold and prepaid courses, the same lines as Paid at the till in the headline. Sales arrive with the daily upload, so today shows tomorrow.</p></details></div>';
  }
  function delSec(rows, all2, a, st) {
    var tbl = rsV.del === 'table', bar = (RES.branches || []).map(function (x) { return { name: BR[x.branch] || x.branch || 'Unknown', sent: x.sent, read: x.reached, delivered: 0, failed: x.failed, unconfirmed: x.unconfirmed, k: x.branch }; });
    var days = (RES.days || []).map(function (x) { return { name: fdate(x.d), sent: x.sent, read: x.reached, delivered: 0, failed: x.failed, unconfirmed: x.unconfirmed, k: x.d }; });
    var toggle = '<div class="tp-seg nvb-seg" role="group" aria-label="View"><button type="button" class="' + (tbl ? '' : 'on') + '" data-nvr="del:visual">Visual</button><button type="button" class="' + (tbl ? 'on' : '') + '" data-nvr="del:table">Table</button></div>';
    var cards = '<div class="nvb-rs-nums">' + rsCell('Read', nn(a.read, 'read'), pc1(a.read, a.sent) + ' of accepted') + rsCell('Delivered, not read yet', nn(a.delivered, 'delivered'), pc1(a.delivered, a.sent) + ' arrived') +
      rsCell('Not confirmed yet', nn(a.unconfirmed, 'unconfirmed'), 'accepted, no delivery report yet') + rsCell('Failed', '<span class="f">' + nn(a.failed, 'failed') + '</span>', pc1(a.failed, a.sent) + ' of accepted, never counted as delivered') + '</div>';
    var inner;
    if (tbl) {
      var head = function (first) { return [[first, ''], ['Accepted', 'n'], ['Read', 'n'], ['Delivered only', 'n'], ['Not confirmed', 'n'], ['Failed', 'n']]; };
      var row = function (label, x, ctx, tot) { return { t: !!tot, c: [esc(label), nn(x.sent, 'sent', ctx), nn(x.read, 'read', ctx), nn(x.delivered, 'delivered', ctx), nn(x.unconfirmed, 'unconfirmed', ctx), '<span class="f">' + nn(x.failed, 'failed', ctx) + '</span>'] }; };
      inner = rsTable(head('Blast'), all2.map(function (x) { return row(x.id === 'ALL' ? 'All' : x.name, x, { b: x.id }, x.id === 'ALL'); })) +
        '<h4 class="nvb-h4">By branch</h4>' + rsTable(head('Branch'), (RES.branches || []).map(function (x) { return row(BR[x.branch] || x.branch, { sent: x.sent, read: x.reached, delivered: 0, unconfirmed: x.unconfirmed, failed: x.failed }, { br: x.branch }); }).concat([row('All', a, {}, true)])) +
        '<h4 class="nvb-h4">By day sent</h4>' + rsTable(head('Day'), (RES.days || []).map(function (x) { return row(fdate(x.d), x, { d: x.d }); }));
    } else {
      inner = '<div class="nvb-rs-two"><div><h4>By branch</h4><div class="nvb-rs-bars">' + bar.map(function (x) { return rsBar(x, { br: x.k }); }).join('') + '</div></div><div><h4>By day sent</h4><div class="nvb-rs-bars">' + days.map(function (x) { return rsBar(x, { d: x.k }); }).join('') + '</div></div></div>' + BAR_LEG;
    }
    return '<div class="cbl-card nvb-rs-sec"><div class="nvb-hd"><h3>2. Did the message arrive?</h3>' + toggle + '</div><p class="nvb-rs-lead">Whether the messages reached the phones: read, delivered, not confirmed yet, or failed. The by-blast bars are under section 2.</p>' + cards + inner +
      '<p class="nvb-small nvb-rs-note">From respond.io\'s delivery report for each message, read again every few minutes while the statuses arrive; Meta keeps updating a status for 24 hours. A client who wrote back still counts by what happened to the message.</p></div>';
  }
  function resultsMain() {
    if (!RES) return '<div class="cbl-head"><div><div class="cbl-eyebrow">Database blasts, November 2026</div><h2>Results</h2></div></div><p class="slv-muted">' + (resErr ? 'The results could not be read just now. Open the page again in a minute.' : 'Loading…') + '</p>';
    var a = RA(), rows = resRows(), st = resState(), r1 = RES.rates.oct, r2 = RES.rates.nov;
    if (!a) return '<div class="cbl-head"><div><div class="cbl-eyebrow">Database blasts, November 2026</div><h2>Results</h2></div></div><p class="slv-muted">Nothing has been sent yet.</p>';
    if (!MON && !monBusy && !monErr) setTimeout(loadMoney, 0);
    if (!LOG.loaded && !LOG.busy && !LOG.err) setTimeout(loadLog, 0);
    var reached = a.read + a.delivered, aud = 0, checked = reached + a.failed; rows.forEach(function (x) { aud += x.audience || 0; });
    var qd = RES.still_queued, fin = qd === 0;
    var chips = '<span class="cbl-chip ok">As of ' + esc(fat(RES.at)) + '</span>' + (fin ? '<span class="cbl-chip ok">Sending finished ' + esc(fat(RES.last_send)) + '</span>' : '<span class="cbl-chip warn">Still sending: ' + fmtN(qd) + ' queued</span>') +
      (a.never_checked > 0 ? '<span class="cbl-chip warn">Delivery statuses still arriving: ' + nn(a.never_checked, 'never_checked') + ' not checked yet</span>' : '') +
      (RES.gate && RES.gate.paused ? '<span class="cbl-chip bad">Paused by the gate</span>' : '') + (st.staleB ? '<span class="cbl-chip warn">Bookings last pulled ' + esc(fdate(RES.bookings_pulled)) + ': not up to date</span>' : '') + (st.staleS ? '<span class="cbl-chip warn">Sales only in to ' + esc(fdate(RES.sales_to)) + ': not up to date</span>' : '') + '<span class="cbl-chip">Sales in to ' + esc(fdate(RES.sales_to)) + '</span><span class="cbl-chip">Offers run to 30 November</span>';
    var out = '<div class="cbl-head"><div><div class="cbl-eyebrow">Database blasts, November 2026 · Results</div><h2>How the November blasts did</h2></div></div><div class="nvb-rs-chips">' + chips + '</div>';
    out += '<p class="nvb-rs-intro">Same nine sections, in the same order, as the October Lost Clients report. One message per client, and a client counts once, by her latest message. Read live from the database and it moves while delivery statuses and sales come in. Every count opens the clients behind it: click a figure with a dotted underline.</p>';

    // 1 headline
    var repl = st.replies === 'ok' ? rsCell('Wrote back', nn(a.replied, 'replied'), pc1(a.replied, reached) + ' of the ' + fmtN(reached) + ' reached') : st.replies === 'part' ? rsCell('Wrote back', nn(a.replied, 'replied'), 'so far, the check has covered ' + fmtN(a.wa_after) + ' of ' + fmtN(a.sent) + ' accepted') : rsWait('Wrote back', whyReplies());
    var m = a.money || {}, bkok = st.bookings, slok = st.sales, al = MON && MON.all ? MON.all : null;
    var ahead = bkok ? rsCell('Booked ahead', nn(m.ahead, 'ahead'), nn(m.appts, 'appts') + ' appointments, from today on. A snapshot: it drops a booking once its date passes') : rsWait('Booked ahead', whyBookings(st));
    var bsince = bkok ? rsCell('Booked since the message', nn(m.booked_since, 'bsince'), 'a booking first seen on or after her first message day, kept after the date passes. Counted from 4 Nov') : rsWait('Booked since the message', whyBookings(st));
    var paid = slok ? rsCell('Paid at the till since the message', 'AED ' + money0(m.paid_aed), nn(m.paid_clients, 'paid') + ' clients. A ceiling, not proof the message caused it') : rsWait('Paid at the till since the message', whySales(st));
    var cpb = (bkok && slok && m.booked_or_in > 0) ? rsCell('Cost per booking', 'AED ' + money2(reached * r2 / m.booked_or_in), 'delivered messages at ' + r2 + ' divided by ' + nn(m.booked_or_in, 'since') + ' booked since the message or came in') : rsWait('Cost per booking', (bkok && slok) ? 'Nobody has booked or come in yet.' : 'Needs bookings and sales after the message, see Booked ahead and Paid.');
    var bci = bkok && slok ? rsCell('Booked or came in', nn(m.booked_or_in, 'since'), 'a booking from today on, a booking first seen after her first message, or a till sale since') : rsWait('Booked or came in', !bkok ? whyBookings(st) : whySales(st));
    out += rsSec('1. The campaign so far', 'How many went out, what came back and what it cost. What cannot be read yet says why.',
      '<div class="nvb-rs-nums">' +
      rsCell('Accepted by respond.io', nn(a.sent, 'sent'), esc(fat(RES.first_send) + ' to ' + fat(RES.last_send))) +
      rsCell('Delivered or read', nn(reached, 'reached'), pc1(reached, a.sent) + ' of accepted. ' + nn(a.read, 'read') + ' read') +
      rsCell('Failed, Meta did not deliver', '<span class="f">' + nn(a.failed, 'failed') + '</span>', pc1(a.failed, a.sent) + ' of accepted, ' + pc1(a.failed, checked) + ' of the ' + nn(checked, 'checked') + ' checked') +
      rsCell('Still queued', qd ? nn(qd, 'queued') : '0', qd ? 'waiting for the next send window' : 'nothing waiting') +
      repl +
      rsCell('STOP', nn(a.stop, 'stop'), pc1(a.stop, a.sent) + ' of accepted. Limit ' + (RES.gate ? RES.gate.stop_pct : 2) + '%' + (a.never_checked ? '. Partial, not every message is checked yet' : '')) +
      ahead + bsince + bci + paid + cpb +
      rsCell('Spent (estimate)', 'AED ' + money0(a.sent * r2), fmtN(a.sent) + ' accepted at AED ' + r2 + ' each. AED ' + money0(reached * r2) + ' if only the ' + fmtN(reached) + ' delivered are charged. At AED ' + r1 + ': AED ' + money0(a.sent * r1) + ' and AED ' + money0(reached * r1)) + '</div>',
      'Rate: October used AED ' + r1 + ' a message (about USD 0.046, measured). The page assumes AED ' + r2 + ' (about USD 0.058, one vendor source). Both are shown until the Meta invoice or the respond.io usage report replaces them. WhatsApp does not charge failed messages, so delivered only is the likelier bill, and Cost per booking uses it.<br>October for comparison: 6,283 sent, 57.9% delivered or seen, about 30% of first sends never delivered, 92 booked or came in, AED 42,918 paid, cost AED 1,068 on every message accepted.');

    // 3 did the message arrive
    out += delSec(rows, all2, a, st);

    out += depSec(st, a, bkok);

    // 7 money
    out += moneySec(st, a, bkok, slok, r2);
    out += tookSec(st, a, bkok, slok, r2, reached);
    // 2 by blast
    var head2 = [['Blast', ''], ['Audience', 'n'], ['Accepted by respond.io', 'n'], ['Delivered or read', 'n'], ['Read', 'n'], ['Not confirmed', 'n'], ['Failed', 'n'], ['Failed % of accepted', 'n'], ['Failed % of checked', 'n'], ['STOP', 'n'], ['Wrote back', 'n']];
    var all2 = rows.concat([a]);
    var body2 = all2.map(function (x) {
      var rd = x.read + x.delivered, ck = rd + x.failed, tot = x.id === 'ALL', cx = { b: x.id };
      return { t: tot, c: [esc(tot ? 'All' : x.name), tot ? fmtN(aud) : fmtN(x.audience), nn(x.sent, 'sent', cx), nn(rd, 'reached', cx), nn(x.read, 'read', cx), nn(x.unconfirmed, 'unconfirmed', cx), '<span class="f">' + nn(x.failed, 'failed', cx) + '</span>', pc1(x.failed, x.sent), ck ? pc1(x.failed, ck) : 'none checked', nn(x.stop, 'stop', cx), st.replies === 'no' ? '<span class="nvb-rs-dash" title="Not readable yet">Not yet</span>' : nn(x.replied, 'replied', cx)] };
    });
    var bars = '<div class="nvb-rs-bars">' + rows.map(function (x) { return rsBar(x, { b: x.id }); }).join('') + '</div>' + BAR_LEG;
    var head3 = [['AED spent', ''], ['Every message accepted, ' + r1, 'n'], ['Every message accepted, ' + r2, 'n'], ['Delivered or read, ' + r1, 'n'], ['Delivered or read, ' + r2, 'n']].concat(bkok && slok ? [['Booked or came in', 'n'], ['Cost per booking, delivered ' + r2, 'n']] : []);
    var body3 = all2.map(function (x) {
      var rd = x.read + x.delivered, tot = x.id === 'ALL', mm = x.money || {};
      return { t: tot, c: [esc(tot ? 'All' : x.name), money2(x.sent * r1), money2(x.sent * r2), money2(rd * r1), money2(rd * r2)].concat(bkok && slok ? [nn(mm.booked_or_in, 'since', { b: x.id }), mm.booked_or_in > 0 ? money2(rd * r2 / mm.booked_or_in) : 'none yet'] : []) };
    });
    out += rsSec('5. By blast', 'One message per client, so clients and messages are the same number. Failed is shown on its own, never counted as delivered.', rsTable(head2, body2) +
      '<p class="nvb-small nvb-rs-note">Not confirmed means respond.io took it and nothing more has been read yet (' + fmtN(a.never_checked) + ' of ' + fmtN(a.unconfirmed) + ' have never been status-checked). ' + (st.replies === 'no' ? 'Wrote back is not readable yet, see section 5.' : '') + '</p>' + bars) +
      rsSec('Cost by blast, AED', 'Every message accepted is the page\'s own cost basis. Delivered or read is the likelier bill. Low delivered figures on a blast mostly mean its messages are not status-checked yet.', rsTable(head3, body3));


    // 8 branch
    var head9 = [['Branch', ''], ['Accepted by respond.io', 'n'], ['Delivered or read', 'n'], ['Not confirmed', 'n'], ['Failed', 'n'], ['Failed % of accepted', 'n'], ['STOP', 'n'], ['Wrote back', 'n']].concat(bkok ? [['Booked ahead', 'n']] : [], slok ? [['Came in', 'n'], ['Paid clients', 'n'], ['Paid AED', 'n']] : []);
    var brRow = function (x, bx) {
      var cx = bx ? { br: bx } : {}, tot = !bx, mm = tot ? (a.money || {}) : x;
      return { t: tot, c: [esc(tot ? 'All' : (BR[x.branch] || x.branch || 'Unknown')), nn(x.sent, 'sent', cx), nn(tot ? reached : x.reached, 'reached', cx), nn(x.unconfirmed, 'unconfirmed', cx), '<span class="f">' + nn(x.failed, 'failed', cx) + '</span>', pc1(x.failed, x.sent), nn(x.stop, 'stop', cx), st.replies === 'no' ? 'Not yet' : nn(x.replied, 'replied', cx)]
        .concat(bkok ? [nn(mm.ahead, 'ahead', cx)] : [], slok ? [nn(mm.came_in, 'came_in', cx), nn(mm.paid_clients, 'paid', cx), money0(mm.paid_aed)] : []) };
    };
    var body9 = (RES.branches || []).map(function (x) { return brRow(x, x.branch); });
    body9.push(brRow(a, ''));
    out += rsSec('6. By branch', 'Which salon got the most out of it?', rsTable(head9, body9), 'Motor City only gets Due, hair. Al Quoz offers end 28 November.');

    // 9 by day
    var head12 = [['Day sent', ''], ['Accepted by respond.io', 'n'], ['Delivered or read', 'n'], ['Not confirmed', 'n'], ['Failed', 'n'], ['STOP', 'n'], ['Wrote back', 'n'], ['First', 'n'], ['Last', 'n']];
    var body12 = (RES.days || []).map(function (x) { var cx = { d: x.d }; return { c: [esc(fdate(x.d)), nn(x.sent, 'sent', cx), nn(x.reached, 'reached', cx), nn(x.unconfirmed, 'unconfirmed', cx), '<span class="f">' + nn(x.failed, 'failed', cx) + '</span>', nn(x.stop, 'stop', cx), st.replies === 'no' ? 'Not yet' : nn(x.replied, 'replied', cx), esc(dubaiHm(x.first_at)), esc(dubaiHm(x.last_at))] }; });
    out += rsSec('7. By day sent', 'One row for each day messages went out (Dubai time). A blast moved to another day shows up here as a new row.', rsTable(head12, body12));
    out += bookDaysSec(st, a, bkok, slok);

    // 10 pace
    var head10 = [['Half-hour (Dubai)', ''], ['Accepted by respond.io', 'n'], ['Status-checked', 'n'], ['Failed of checked', 'n']];
    var body10 = (RES.pace || []).map(function (x) { var d0 = x.slot.slice(0, 10), t0 = x.slot.slice(11); return { c: [esc(fdate(d0) + ' ' + t0), nn(x.sent, 'sent', { d: x.slot }), nn(x.checked, 'checked', { d: x.slot }), x.checked ? nn(x.failed, 'failed', { d: x.slot }) + ' (' + pc1(x.failed, x.checked) + ')' : 'not checked yet'] }; });
    var wins = rows.map(function (x) { return esc(x.name) + ' ' + esc(dubaiHm(x.first)) + (x.last && dubaiHm(x.last) !== dubaiHm(x.first) ? ' to ' + esc(dubaiHm(x.last)) : ''); }).join(', ');
    out += rsSec('8. Send times', 'When the messages went out, in half hours (Dubai time).', rsTable(head10, body10), 'Send windows (Dubai time): ' + wins + '. October ran about 400 messages per half-hour; a failed share that stays level across the half-hours points to the client, not the pace.');

    // 11 log
    out += logSec(rows);

    return '<div class="nvb-rs">' + out + '</div>';
  }
  async function loadResults() {
    try { RES = await rpc('nov_results'); resErr = false; } catch (e) { console.error(e); resErr = true; }
    if (cur === RESID) { if (!monBusy) loadMoney(); if (!LOG.busy) loadLog(); }   // read the money and the log again with the numbers
  }
  function resPoll() {   // while Results is open and the tab is showing: read it again every minute (delivery statuses and sales keep arriving)
    if (resTimer) return;
    resTimer = setInterval(function () {
      if (cur !== RESID || !main() || main().offsetParent === null || document.visibilityState !== 'visible' || sndM || sndBusy || DM || typing()) return;
      loadResults().then(function () { if (cur === RESID && !sndM) render(true); });
    }, 60000);
  }
  function messagesHtml() {
    var b = blast(cur); if (!b) return '<div class="nvb-pane"><h2>Messages</h2><p class="lead">No blasts are set up.</p></div>';
    return '<div class="cbl"><div class="cbl-shell"><aside class="cbl-side' + (sideOpen ? ' open' : '') + '" id="nvbSide"><button type="button" class="cbl-side-toggle" data-nvb="side" aria-expanded="' + (sideOpen ? 'true' : 'false') + '"><span>Calendar and blasts</span><span>+</span></button>' +
      '<div class="cbl-side-body">' + calSide() + totalSide() + listSide() + resultsSide() + '</div></aside><div class="cbl-main" id="nvbMain">' + ((cur === ALLID || cur === RESID) ? sendBarHtml() : '') + (cur === ALLID ? allMain() : cur === RESID ? resultsMain() : blastMain(b)) + '</div></div></div>';
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
  function lockedNow() { return !!(LOCKI && LOCKI.locked); }   // sending locks by itself once every blast has finished (migrations/nov_send_lock.sql); Level 5 unlocks it by typing UNLOCK
  function lockDisable(h) { return h.replace(/<button type="button" class="nvb-btn/g, '<button type="button" disabled aria-disabled="true" class="nvb-btn').replace(/<(input|select) id="nvbP/g, '<$1 disabled id="nvbP'); }
  function isL5() { return typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL === 5; }
  var IMGS = [['', 'No header image'], ['assets/nov-blasts/nov-hair-to-beauty-4x5.png', 'Hair to beauty artwork, 4:5'], ['assets/nov-blasts/nov-beauty-to-hair-4x5.png', 'Beauty to hair artwork, 4:5']];
  function tplOf(b) { var t = b.data.tpl || {}, g = ['warm', 'std'].filter(function (x) { return t[x] && t[x].n; })[0]; return g ? { n: t[g].n, s: t[g].s || 'todo' } : null; }
  function sendOf(b) { return SND && SND.blasts ? (SND.blasts[b.id] || null) : null; }
  function defImg(b) { var im = b && b.data.img || ''; return IMGS.some(function (x) { return x[0] === im; }) ? im : ''; }
  function activeRun(x) { return !!x && (x.state === 'running' || x.state === 'paused') && !!x.counts && x.counts.queued > 0; }
  function pctOf(a, n) { return n ? (Math.round(a * 1000 / n) / 10) + '%' : '0%'; }
  function showSend(b) { var t = tplOf(b); return isL5() && !!SND && ((t && t.s === 'approved') || !!sendOf(b)); }
  function kick() { try { var r = sb.functions.invoke('nov-send-worker', { body: {} }); if (r && r.then) r.then(function () {}, function () {}); } catch (e) { /* the cron picks it up */ } }
  async function loadSend() { if (!isL5()) return; try { SND = await rpc('nov_send_info'); } catch (e) { console.error(e); SND = null; } try { LOCKI = await rpc('nov_send_lock_info'); } catch (e) { LOCKI = null; } try { RWHEN = (await rpc('nov_send_resend_when')) || {}; } catch (e) { RWHEN = {}; } }
  /* Resend failed at a set time (Kate, 5 Nov 2026: "scheduled time toggle to send this out"). The time is Dubai time, typed in a datetime-local box; the database queues the messages now with that time as
     their turn (migrations/nov_send_resend_schedule.sql), and the worker only takes them once it comes, inside the send window. Cancel on the card stops them like any queued message. */
  function sndAtIso() { if (!sndAt.on || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sndAt.v)) return null; var d = new Date(sndAt.v + ':00+04:00'); return isNaN(d.getTime()) ? null : d.toISOString(); }
  function sndAtLocal(d) { return dubaiDay(d.toISOString()) + 'T' + dubaiHm(d.toISOString()); }
  function sndAtFloor(d) { return sndAtLocal(new Date(Math.floor(d.getTime() / 300000) * 300000)); }   // the box steps in 5 minutes from its min, so min and max sit on :00, :05, :10 and the picker lists clean minutes
  function sndAtOk() { var iso = sndAtIso(); if (!iso) return false; var t = new Date(iso).getTime(); return t >= Date.now() - 60000 && t <= Date.now() + 7 * 864e5; }
  function sndAtDefault(prev) {   // the first time any of them is ready, or in 30 minutes, to the next 5 minutes, and not before the window opens
    var t = Date.now() + 30 * 60000;
    if (prev && prev.next_ready) t = Math.max(t, new Date(prev.next_ready).getTime() + 5 * 60000);
    t = Math.ceil(t / 300000) * 300000;
    var d = new Date(t), h = +dubaiHm(d.toISOString()).slice(0, 2), from = SND && SND.hour_from != null ? SND.hour_from : 9;
    if (h < from) d = new Date(new Date(dubaiDay(d.toISOString()) + 'T' + String(from).padStart(2, '0') + ':00:00+04:00').getTime());
    return sndAtLocal(d);
  }
  function sndRsPreview() {   // read what a Resend would do at the time chosen (or right now)
    if (!sndM || sndM.kind !== 'resend') return;
    var id = sndM.id, tok = ++sndPrevTok, at = sndAtIso();
    if (sndAt.on && !sndAtOk()) { sndPrev = null; render(true); return; }
    sndPrev = null; render(true);
    rpc('nov_send_resend_preview', at ? { p_blast: id, p_at: at } : { p_blast: id }).then(function (r) { if (tok === sndPrevTok && sndM && sndM.id === id && sndM.kind === 'resend') { sndPrev = r; if (sndAt.on && !sndAt.v) sndAt.v = sndAtDefault(r); render(true); } })
      .catch(function (e) { console.error(e); if (tok === sndPrevTok && sndM && sndM.id === id) { sndPrev = { err: e.message || 'try again' }; render(true); } });
  }
  function sndOk() {
    if (!sndM || !SND) return false;
    if (sndM.kind === 'unlock') return sndTyped.trim().toUpperCase() === 'UNLOCK' && !sndBusy;
    if (sndM.kind === 'live') return sndTyped.trim().toUpperCase() === 'LIVE';
    if (sndM.kind === 'test') return sndPhone.replace(/\D/g, '').length >= 9 && !(sndTest && sndTest.busy);
    if (sndM.kind === 'resend') return (!sndAt.on || sndAtOk()) && !!sndPrev && !sndPrev.err && sndPrev.ok > 0 && !SND.dry_run && !!SND.enabled && sndTyped.trim().toUpperCase() === 'RESEND ' + sndM.id.toUpperCase() && !sndBusy;
    var live = !SND.dry_run;
    return !!sndPrev && !sndPrev.err && sndPrev.ok > 0 && (!live || sndTyped.trim().toUpperCase() === 'SEND ' + sndM.id.toUpperCase()) && !sndBusy;
  }
  function imgSelect() { return '<select id="nvbSndImg">' + IMGS.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === sndImg ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'; }
  function paceHtml() {
    if (!isL5() || !SND) return '';
    var from = SND.hour_from, to = SND.hour_to, cap = SND.slot_cap, mins = SND.slot_minutes, left = 0;
    Object.keys(SND.blasts || {}).forEach(function (k) { var z = SND.blasts[k]; if (z && z.counts) left += (z.counts.queued || 0); });
    var hrs = function (sel) { var o = ''; for (var h = 0; h <= 24; h++) o += '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + esc(fmtClock(h * 60)) + '</option>'; return o; };
    var ms = [10, 15, 20, 30, 45, 60].map(function (m) { return '<option value="' + m + '"' + (m === mins ? ' selected' : '') + '>' + m + ' minutes</option>'; }).join('');
    var slots = to > from ? Math.floor((to - from) * 60 / mins) : 0, day = slots * cap;
    return '<div class="nvb-pace"><h4 class="nvb-h4">Pace</h4><p class="nvb-small">How many messages go out, how often and inside which hours (Dubai time). It applies to messages that have not gone yet.</p>' +
      '<div class="nvb-pg"><label>Messages<input id="nvbPcap" type="number" min="1" max="1000" step="10" value="' + cap + '"></label>' +
      '<label>Every<select id="nvbPmin">' + ms + '</select></label>' +
      '<label>Window starts<select id="nvbPfrom">' + hrs(from) + '</select></label>' +
      '<label>Window ends<select id="nvbPto">' + hrs(to) + '</select></label></div>' +
      '<p class="nvb-small" id="nvbPsum">Up to <b>' + fmtN(day) + '</b> a day. Still to send: <b>' + fmtN(left) + '</b>' + (left > 0 && day > 0 ? ', about ' + (left <= day ? 'one day' : Math.ceil(left / day) + ' days') + ' at this pace' : ', nothing is waiting') + '.</p>' +
      '<div class="nvb-sbtns"><button type="button" class="nvb-btn" data-nvb="snd:pace"' + (sndBusy ? ' disabled' : '') + '>Save pace</button></div></div>';
  }
  function lockBoxHtml() {
    return '<div class="nvb-lockbox" role="status"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' +
      '<div><b>Locked: every blast has finished</b><span>Nobody can send, resend, test, switch sending on or change the pace. The counts below stay. Only Level 5 can unlock it, by typing UNLOCK. The next message queued puts the lock back on.</span></div>' +
      '<button type="button" class="nvb-btn" data-nvb="snd:unlock">Unlock…</button></div>';
  }
  function sendBarHtml() {
    var h = sendBarCore(); if (!lockedNow()) return h;
    return lockBoxHtml() + lockDisable(h);
  }
  function sendBarCore() {
    if (!isL5() || !SND) return '';
    var g = SND.gate || {}, d = g.sent || 0, f = g.failed || 0, so = g.stop || 0;
    var st = lockedNow() ? ['warn', 'Locked'] : SND.paused ? ['bad', 'Paused'] : !SND.enabled ? ['', 'Sending is off'] : SND.dry_run ? ['warn', 'On, dry run'] : ['good', 'On, live'];
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
  function sendCardHtml(b) { var h = sendCardCore(b); return lockedNow() ? lockDisable(h) : h; }
  function sendCardCore(b) {
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
        '<div class="nvb-sc"><div><b>' + nn(c.queued || 0, 'queued', { b: b.id }) + '</b><span>Queued</span></div><div><b>' + nn(c.sent || 0, 'sent_ok', { b: b.id }) + '</b><span>Sent</span></div>' +
        '<div><b>' + (x.dry ? '–' : nn(c.delivered || 0, 'reached', { b: b.id })) + '</b><span>Delivered or read</span></div><div class="' + (c.failed ? 'bad' : '') + '"><b>' + nn(c.failed || 0, 'failed_any', { b: b.id }) + '</b><span>Failed' + (sent ? ' · ' + pctOf(c.failed || 0, sent) : '') + '</span></div>' +
        '<div class="' + (c.stop ? 'bad' : '') + '"><b>' + (x.dry ? '–' : nn(c.stop || 0, 'stop', { b: b.id })) + '</b><span>STOP' + (!x.dry && sent ? ' · ' + pctOf(c.stop || 0, sent) : '') + '</span></div></div>' +
        (x.dry ? '<p class="nvb-small">A dry run: the messages went through the queue and the pace, but nothing was posted, so delivered and STOP stay empty.</p>' : '<p class="nvb-small">Delivered and STOP come from respond.io a few minutes after each send, then again at 30 minutes, 2, 8 and 24 hours.</p>') +
        (c.again ? '<p class="nvb-small nvb-again"><b>Sent again: ' + nn(c.again, 'again', { b: b.id }) + '</b> · ' + nn(c.again_delivered || 0, 'again_delivered', { b: b.id }) + ' delivered or read, ' + nn(c.again_failed || 0, 'again_failed', { b: b.id }) + ' failed, ' + nn(c.again_queued || 0, 'again_queued', { b: b.id }) + ' still to go' + (RWHEN[b.id] ? ', scheduled: the rest go from ' + esc(fat(RWHEN[b.id])) + ' Dubai time' : '') + '. A client Meta refused is sent once more after 24 hours, never a third time; the Failed number above no longer counts the ones sent again.</p>' : '') +
        (skipN || c.skipped ? '<details class="nvb-fold nvb-sk"><summary><span>Left out when it was queued <small>' + fmtN(skipN) + '</small>' + (c.skipped ? ' · skipped since ' + nn(c.skipped, 'skipped', { b: b.id }) : '') + '</span></summary><div class="in">' +
          Object.keys(sk).map(function (k) { return '<div class="nvb-lf"><span>' + esc(SKIPWHY[k] || k) + '</span><b>' + fmtN(sk[k]) + '</b></div>'; }).join('') + '</div></details>' : '') +
        (er.length ? '<details class="nvb-fold nvb-sk" open><summary><span>Why some did not go</span></summary><div class="in">' + er.map(function (e) { return '<div class="nvb-lf"><span>' + esc(e.e) + '</span><b>' + nn(e.n, 'notgone', { b: b.id, r: String(e.e).replace(/\+?\d{8,}/g, '[number]') }) + '</b></div>'; }).join('') + '</div></details>' : '');
    }
    h += '<div class="nvb-sbtns"><button type="button" class="nvb-btn pri" data-nvb="snd:open:' + esc(b.id) + '"' + ((t && t.s === 'approved' && !act && !sndBusy) ? '' : ' disabled') + '>' + (x && !act ? 'Send to anyone not sent yet…' : 'Send…') + '</button>' +
      (x && !act && c.failed > 0 && t && t.s === 'approved' ? '<button type="button" class="nvb-btn" data-nvb="snd:resend:' + esc(b.id) + '"' + (sndBusy ? ' disabled' : '') + '>Resend failed…</button>' : '') +
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
    } else if (m.kind === 'unlock') {
      head = 'Unlock sending?';
      body = '<p>Every blast has finished, so sending locked by itself. Unlocking lets the next message be queued. The lock goes back on as soon as that message is queued and every blast has finished again.</p>' +
        '<label class="nvb-sl" for="nvbSndTyped">Type <b>UNLOCK</b> to unlock</label><input id="nvbSndTyped" type="text" autocomplete="off" autocapitalize="characters">' +
        (sndErr ? '<p class="nvb-err nvb-small" role="alert">' + esc(sndErr) + '</p>' : '');
      foot = '<button type="button" class="nvb-btn pri" id="nvbSndGo" data-nvb="snd:unlock2"' + (sndOk() ? '' : ' disabled') + '>Unlock</button>';
    } else if (m.kind === 'test') {
      var tb = item(m.id), tt = tplOf(tb), r = sndTest && sndTest.r;
      head = 'Test ' + esc(tb.data.short || tb.data.title) + ' to one number';
      body = '<p>Sends <b>one</b> message, the real template <code>' + esc(tt.n) + '</code>, to the number you type, from ' + esc(SND.channel) + '. ' + (SND.dry_run ? 'Dry run is on, so nothing is sent: it only goes through the queue.' : '<b>Dry run is off: this really sends.</b>') + '</p>' +
        '<label class="nvb-sl" for="nvbSndPhone">Number, with country code</label><input id="nvbSndPhone" type="tel" inputmode="tel" placeholder="+971 50 000 0000" autocomplete="off">' +
        '<label class="nvb-sl" for="nvbSndImg">Header image</label>' + imgSelect() +
        (sndTest ? '<p class="nvb-small nvb-tres">' + (sndTest.err ? '<span class="nvb-err">' + esc(sndTest.err) + '</span>' : sndTest.busy ? 'Queued, waiting for the worker…' : r ? 'Status: <b>' + esc(r.status) + '</b>' + (r.dry ? ' (dry run, nothing was posted)' : '') + (r.delivery ? ', ' + esc(r.delivery) : '') + (r.error ? '. ' + esc(r.error) : '') : '') + '</p>' : '');
      foot = '<button type="button" class="nvb-btn pri" id="nvbSndGo" data-nvb="snd:dotest"' + (sndOk() ? '' : ' disabled') + '>Send the test</button>';
    } else if (m.kind === 'resend') {
      var rb2 = item(m.id), rp = sndPrev, rsk = rp && !rp.err ? (rp.skip || {}) : {}, rn = rp && !rp.err ? rp.ok : null, rlive = !SND.dry_run && !!SND.enabled;
      var rwait = rsk['Waiting: 24 hours have not passed yet'] || 0, rother = 0;
      Object.keys(rsk).forEach(function (k) { if (k.indexOf('Waiting') !== 0) rother += rsk[k]; });
      var rcodes = rp && !rp.err ? rp.codes || {} : {}, rcl = Object.keys(rcodes).map(function (k) { return rcodes[k] + ' × ' + (k === '131049' ? 'Meta marketing limit (131049)' : k === '130472' ? 'held out of an experiment (130472)' : esc(k)); }).join(', ');
      var rlots = rn == null ? null : Math.ceil(rn / SND.slot_cap), rmins = rlots == null ? null : rlots * SND.slot_minutes;
      head = 'Resend failed · ' + esc(rb2.data.short || rb2.data.title);
      body = '<div class="nvb-sbanner ' + (rlive ? 'bad' : 'warn') + '">' + (SND.dry_run ? 'Dry run is on. Resend works on a live send only: go live first.' : !SND.enabled ? 'Sending is switched off. Switch sending on first, then come back.' : 'LIVE: this sends real WhatsApp messages to real clients.') + '</div>' +
        '<div class="nvb-srows">' + sndRow('Blast', esc(rb2.data.title)) +
        sndRow('Failed in the first send', rp ? (rp.err ? '<span class="nvb-err">Could not check: ' + esc(rp.err) + '</span>' : fmtN(rp.total)) : 'Checking…') +
        sndRow('Ready to send again', rn == null ? '…' : '<b>' + fmtN(rn) + '</b>' + (rcl ? '<small> · ' + rcl + '</small>' : '')) +
        sndRow(sndAt.on ? 'Not yet, 24 hours will not have passed' : 'Not yet, 24 hours have not passed', rp && !rp.err ? fmtN(rwait) + (rwait && rp.next_ready ? '<small> · the first is ready ' + esc(fat(rp.next_ready)) + ' Dubai time</small>' : '') : '…') +
        sndRow('Left out', rp && !rp.err ? fmtN(rother) + (rother ? '<small> · ' + Object.keys(rsk).filter(function (k) { return k.indexOf('Waiting') !== 0; }).map(function (k) { return rsk[k] + ' ' + esc(k.toLowerCase()); }).join(', ') + '</small>' : '') : '…') +
        sndRow('Same message', 'The same words, template and artwork as the first send, to the number she has now.') +
        sndRow('Cost, at most', rn == null ? '…' : 'AED ' + fmtN(Math.round(rn * RATE_AED)) + '<small> · an undelivered message is not charged</small>') +
        sndRow('Sending time', rn == null ? '…' : (rmins >= 120 ? (Math.round(rmins / 6) / 10) + ' hours' : rmins + ' minutes') + '<small> · ' + SND.slot_cap + ' every ' + SND.slot_minutes + ' minutes, inside the send window</small>') +
        sndRow('Send at', '<label class="nvb-sch"><input type="checkbox" id="nvbSchOn"' + (sndAt.on ? ' checked' : '') + '> Send at a set time instead of now</label>' +
          (sndAt.on ? '<div class="nvb-schat"><input type="datetime-local" id="nvbSchAt" step="300" min="' + sndAtFloor(new Date()) + '" max="' + sndAtFloor(new Date(Date.now() + 7 * 864e5)) + '"> <small>Dubai time. Up to 7 days ahead.</small></div>' +
            (sndAt.v && !sndAtOk() ? '<small class="nvb-err">Pick a time from now to 7 days ahead.</small>' : '') +
            (sndAtOk() && SND.hour_from != null && (+sndAt.v.slice(11, 13) < SND.hour_from || +sndAt.v.slice(11, 13) >= SND.hour_to) ? '<small>Outside the send window (' + SND.hour_from + ':00 to ' + SND.hour_to + ':00 Dubai time): they wait for it to open.</small>' : '') +
            '<small>The messages are queued now and held until then. Cancel on the card stops them. Anyone who books, writes back or opts out before then is still left out.</small>' : '<small>Off: they go as soon as you confirm.</small>')) +
        sndRow('From', esc(SND.channel)) + '</div>' +
        (rlive ? '<label class="nvb-sl" for="nvbSndTyped">Type <b>RESEND ' + esc(m.id) + '</b> to confirm</label><input id="nvbSndTyped" type="text" autocomplete="off" autocapitalize="characters">' : '') +
        '<p class="nvb-small">Only a message Meta refused with its marketing limit or an experiment hold, after 24 hours, and never a third time. Not sent: a number WhatsApp cannot reach, STOP, an opt-out, an appointment from today on, a reply since, or another message already queued or sent. The limit can refuse again, and a refused message is not charged. The gate watches this resend on its own numbers.</p>' +
        (sndErr ? '<p class="nvb-err nvb-small" role="alert">' + esc(sndErr) + '</p>' : '');
      foot = '<button type="button" class="nvb-btn pri" id="nvbSndGo" data-nvb="snd:resendgo"' + (sndOk() ? '' : ' disabled') + '>' + (sndAt.on ? 'Schedule ' : 'Resend ') + (rn == null ? '' : fmtN(rn) + ' messages') + (sndAt.on && sndAtOk() ? ' for ' + esc(nvDay(sndAt.v.replace('T', ' '))) : '') + '</button>';
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
    var so = document.getElementById('nvbSchOn'), sa = document.getElementById('nvbSchAt');
    if (so) so.onchange = function () { sndAt.on = so.checked; if (so.checked && !sndAt.v) sndAt.v = sndAtDefault(sndPrev); sndRsPreview(); };
    if (sa) { sa.value = sndAt.v; sa.onchange = function () { sndAt.v = sa.value; sndRsPreview(); }; }
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
    else if (w === 'resend') {
      if (!b) return;
      sndM = { kind: 'resend', id: id }; sndTyped = ''; sndPrev = null; sndErr = ''; sndAt = { on: false, v: '' }; ++sndPrevTok; render(true);
      sndRsPreview();
    }
    else if (w === 'resendgo') {
      if (!sndOk()) return;
      var rid = sndM.id, rtyp = sndTyped, rat = sndAtIso(); sndM = null; sndTyped = '';
      sndCall('nov_send_resend', rat ? { p_blast: rid, p_confirm: rtyp, p_at: rat } : { p_blast: rid, p_confirm: rtyp }, sndAfterQueue);
    }
    else if (w === 'test') { if (!b) return; sndM = { kind: 'test', id: id }; sndImg = defImg(b); sndTest = null; render(true); }
    else if (w === 'golive') { sndM = { kind: 'live' }; sndTyped = ''; render(true); }
    else if (w === 'golive2') { if (!sndOk()) return; sndM = null; sndTyped = ''; sndCall('nov_send_config_set', { p_patch: { dry_run: false } }); }
    else if (w === 'unlock') { sndM = { kind: 'unlock' }; sndTyped = ''; sndErr = ''; render(true); }
    else if (w === 'unlock2') { if (!sndOk()) return; var utyp = sndTyped; sndM = null; sndTyped = ''; sndCall('nov_send_unlock', { p_confirm: utyp }); }
    else if (w === 'pace') {
      var g = function (id) { var e = document.getElementById(id); return e ? +e.value : NaN; }, pc = g('nvbPcap'), pm = g('nvbPmin'), pf = g('nvbPfrom'), pt = g('nvbPto');
      if (!(pc >= 1 && pc <= 1000) || !(pm >= 5 && pm <= 120) || !(pt > pf)) { sndErr = 'Check the pace: messages from 1 to 1000, and the window has to end after it starts.'; render(true); return; }
      sndCall('nov_send_config_set', { p_patch: { slot_cap: pc, slot_minutes: pm, hour_from: pf, hour_to: pt } });
    }
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
      (errMsg ? '<p class="nvb-err">' + esc(errMsg) + '</p>' : '') + numsHtml() + '</header>' + tabsHtml() + body + (big && tab === 'messages' ? bigCalHtml() : '') + (bigflow && tab === 'messages' && cur !== ALLID && cur !== RESID && blast(cur) ? flowBigHtml(blast(cur)) : '') + (termsFor && tab === 'messages' ? termsModalHtml() : '') + (sndM && tab === 'messages' ? sndModalHtml() : '') + '</div>';
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
      else if (k === 'copyterms') { copyTerms(v); }
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
    Promise.all([reload(), loadLive(), loadSend(), loadResults()]).then(function () { if (!sndM) render(true); }).catch(function () { /* keep what is on screen */ });
  });

  // Called by showView each time the page opens: read what the database says now, then draw.
  window.renderNovBlasts = async function () {
    var el = main(); if (!el) return;
    if (typeof TRS_LEVEL === 'undefined' || (TRS_LEVEL !== 3 && TRS_LEVEL !== 5) && !(typeof TRS_EXTRA !== 'undefined' && TRS_EXTRA.indexOf('campaignblasts') >= 0)) { notFound(); return; }
    if (firstOpen) { firstOpen = false; try { var q = new URLSearchParams(location.search); wantBlast = q.get('blast') || ''; wantTab = q.get('tab') || ''; } catch (e) { wantBlast = ''; wantTab = ''; } }
    errMsg = '';
    if (!D) el.innerHTML = '<div class="nvb"><header class="nvb-head"><h1>November blasts</h1></header><p class="slv-muted">Loading…</p></div>';
    try { await reload(); } catch (e) { console.error(e); notFound(); return; }
    if (wantBlast) { if (wantBlast === ALLID || wantBlast === RESID || (item(wantBlast) && isBlast(item(wantBlast)))) { cur = wantBlast; rb = wantBlast; } wantBlast = ''; }
    if (wantTab) { if (TABS.indexOf(wantTab) >= 0) tab = wantTab; wantTab = ''; }
    if (cur !== ALLID && cur !== RESID && (!item(cur) || !isBlast(item(cur)))) { cur = sorted()[0] ? sorted()[0].id : ''; rb = cur; }
    bind(); render(); syncUrl();
    loadLive().then(function () { if (main() && main().offsetParent !== null) render(true); });   // the counts come a moment after the page
    loadResults().then(function () { if (main() && main().offsetParent !== null && !sndM) render(true); }); resPoll();   // the Results pill and view (nov_results, counts only)
    if (isL5()) { loadSend().then(function () { if (main() && main().offsetParent !== null && !sndM) render(true); }); sndStartPoll(); progPoll(); }   // the send control (Level 5) reads its own state
  };
})();
