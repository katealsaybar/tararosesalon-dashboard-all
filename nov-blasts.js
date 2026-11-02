/* November Blasts (Kate, 2 Nov 2026), a dashboard page in Tools (?view=novblasts), so the main sidebar stays. The database blasts for November, planned from the 2 Nov Zoom
   with Coach Emma. Four lanes, one per reader: Decisions (Coach Emma), Messages (everyone, Emma approves here), Before sending (Kate's list) and Replies (the call centre:
   what to say when she writes back, and the terms). A next-action card sits above them. Redesigned 2 Nov 2026 (docs/mockups/nov-blasts-redesign.html in the cowork repo).
   Reads and writes only through nov_blast_* (migrations/nov_blasts.sql and nov_blasts_v2.sql), which check the level again (old Levels 3 and 5 edit; a person opened
   for Campaign Blasts reads). Counts are LIVE from the till. All words (messages, decisions, checklist, replies, terms) live in the database, none here. Nothing here
   sends a message. Needs only sb (the Supabase client), TRS_LEVEL, TRSD. */
(function () {
  function main() { return document.getElementById('novBlastsContent'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtN(n) { return Number(n || 0).toLocaleString('en-GB'); }
  var BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' }, BKEYS = ['SAA', 'KCA', 'MC', 'AQ'];
  var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TABS = ['decide', 'messages', 'before', 'replies'];
  var RATE_AED = 0.21;   // one delivered marketing message: October measured USD 0.044 to 0.055 and Meta raised UAE rates on 1 Oct 2026, so the higher figure; undelivered ones are not charged
  var D = null, LIVE = null, liveErr = false, counting = false, tab = 'decide', cur = 'D', rb = 'D', len = 'long', aud = 'warm', dec = null, more = '', opened = {}, copied = false;
  var errMsg = '', wantBlast = '', wantTab = '', firstOpen = true, bound = false;
  window.nvbUrlParts = function () {
    var p = [], b = D ? cur : (wantBlast || 'D'), t = D ? tab : (wantTab || 'decide');
    if (t && t !== 'decide') p.push('tab=' + encodeURIComponent(t));
    if (b && b !== 'D') p.push('blast=' + encodeURIComponent(b));
    return p;
  };
  function syncUrl() { try { if (typeof trSyncUrl === 'function' && typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'novblasts') trSyncUrl(null); } catch (e) { /* fine without it */ } }
  function notFound() { var el = main(); if (el) el.innerHTML = '<p class="slv-muted">This page isn’t open to your account yet. Ask Kate to open it for you.</p>'; }
  async function rpc(name, args) { var r = await sb.rpc(name, args || {}); if (r.error) throw new Error(r.error.message); return r.data; }
  function canEdit() { return !D || D.editor !== false; }
  function isBlast(i) { return i.id.indexOf('dec') !== 0 && ['oct', 'pre', 'reply', 'terms'].indexOf(i.id) < 0; }
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
    var t = [['decide', 'Decisions', 'Coach Emma', openDecs().length], ['messages', 'Messages', 'Everyone', 0], ['before', 'Before sending', 'Kate', openTasks().length], ['replies', 'Replies', 'Call centre', 0]];
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
  function calHtml() {
    var bs = blasts(); if (!bs.length) return '';
    // a card per send day. A blast sits on its own day for every salon but Al Quoz; Al Quoz clients go on aq_date (the salon is shut Sundays and Mondays).
    var days = {};
    bs.forEach(function (b) {
      var c = lv(b.id), same = aqDate(b) === b.data.date;
      (days[b.data.date] = days[b.data.date] || { main: [], aq: [] }).main.push({ b: b, n: c ? (same ? c.n : c.n - c.AQ) : null, na: !same });
      if (!same) (days[aqDate(b)] = days[aqDate(b)] || { main: [], aq: [] }).aq.push({ b: b, n: c ? c.AQ : null });
    });
    return '<div class="nvb-days">' + Object.keys(days).sort().map(function (iso) {
      var dn = parts(iso), o = days[iso];
      return '<div class="nvb-card nvb-day"><div class="d"><small>' + (dn.getDay() === 1 ? 'Monday' : dn.getDay() === 2 ? 'Tuesday' : DN[dn.getDay()]) + '</small>' + dn.getDate() + ' ' + MN[dn.getMonth()] + '</div>' +
        o.main.map(function (x) { return '<button type="button" class="nvb-bl' + (cur === x.b.id ? ' sel' : '') + '" data-nvb="sel:' + esc(x.b.id) + '"><b>' + esc(x.b.data.short || x.b.data.title) + '</b><span class="n">' + (x.n == null ? (liveErr ? '?' : '…') : fmtN(x.n)) + ' clients' + (x.na ? ', not Al Quoz' : '') + '</span></button>'; }).join('') +
        (o.aq.length ? '<div class="nvb-aqnote"><b>Al Quoz</b>, ' + o.aq.map(function (x) { return esc(x.b.data.short || x.b.data.title).toLowerCase(); }).join(', ') + ': ' + fmtN(o.aq.reduce(function (a, x) { return a + (x.n || 0); }, 0)) + ' clients. Closed Mondays, so these wait for Tuesday.</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  // The pace is the one October used: about 100 messages every 30 minutes from each salon's number, from 11:30 am. Past 4 pm is flagged.
  function planHtml() {
    if (!LIVE || !LIVE.blasts) return '';
    var days = {};
    blasts().forEach(function (b) { var c = lv(b.id); BKEYS.forEach(function (k) { var iso = k === 'AQ' ? aqDate(b) : b.data.date; (days[iso] = days[iso] || {})[k] = ((days[iso] || {})[k] || 0) + (c[k] || 0); }); });
    var keys = Object.keys(days).sort();
    var head = '<div class="nvb-pl-r h"><span>Salon</span>' + keys.map(function (iso) { return '<span>' + esc(fdate(iso)) + '</span>'; }).join('') + '</div>';
    var rows = BKEYS.map(function (k) {
      return '<div class="nvb-pl-r"><span>' + BR[k] + '</span>' + keys.map(function (iso) {
        var n = days[iso][k] || 0; if (!n) return '<span class="z">none</span>';
        var end = 11 * 60 + 30 + Math.ceil(n / 100) * 30, over = end > 16 * 60;
        return '<span class="' + (over ? 'over' : '') + '"><b>' + fmtN(n) + '</b> by ' + fmtClock(end) + (over ? ', too late' : '') + '</span>';
      }).join('') + '</div>';
    }).join('');
    return fold('plan', 'Sending plan', 'about 100 every 30 minutes per salon, all done by 4 pm', head + rows + '<p>Each salon sends from its own number from 11:30 am. Press Count again each morning before sending: it takes in any STOP replies and the opt-out sheet.</p>');
  }
  function octHtml() {
    var o = item('oct'); if (!o) return '';   // the figures live in the database (nov_blast_items 'oct'), not in this public file
    var d = o.data;
    return fold('oct', esc(d.title), esc(d.lead), '<div class="nvb-oct">' + (d.cards || []).map(function (c) { return '<div><span class="eyebrow">' + esc(c.k) + '</span><span class="big">' + esc(c.big) + '</span><p>' + esc(c.p) + '</p></div>'; }).join('') + '</div><p>' + esc(d.foot) + '</p>');
  }
  function detailHtml() {
    var b = blast(cur); if (!b) return '';
    var d = b.data, c = lv(b.id), tl = d.title, mx = c ? Math.max(c.SAA, c.KCA, c.MC, c.AQ, 1) : 1, rv = b.review, ed = canEdit();
    var lenOk = !!d.short_msg, useShort = lenOk && len === 'short', src = useShort ? d.short_msg : d.msg, m = src;
    var hasWarm = c ? c.warm > 0 && !!m.warm : !!m.warm, a = (aud === 'warm' && hasWarm) ? 'warm' : 'std';
    var warmStd = c ? (c.warm > 0 ? num(c.warm, tl + ', warm clients', { p_blast: b.id, p_group: 'warm' }) + ' / ' + num(c.std, tl + ', standard clients', { p_blast: b.id, p_group: 'std' }) : num(c.std, tl + ', standard clients', { p_blast: b.id, p_group: 'std' })) : (liveErr ? '?' : '…');
    var extra = '';
    if (c && b.id === 'D') extra = '<p>Had extensions in the last 12 months: <b>' + num(c.ext, tl + ', had extensions', { p_blast: b.id, p_flag: 'ext' }) + '</b> · Had blonde work: <b>' + num(c.blonde, tl + ', had blonde work', { p_blast: b.id, p_flag: 'blonde' }) + '</b></p>';
    if (c && b.id === 'E') extra = '<p>Had colour in the last 12 months: <b>' + num(c.colour, tl + ', had colour', { p_blast: b.id, p_flag: 'colour' }) + '</b> · The rest: <b>' + fmtN(c.n - c.colour) + '</b></p>';
    var cost = c ? 'AED ' + fmtN(Math.round(c.n * RATE_AED)) : '…';
    var who = '<p>' + esc(d.who) + '</p>' + extra +
      (c && c.unchecked ? '<p class="nvb-wa-note"><b>WhatsApp check:</b> ' + fmtN(c.unchecked) + ' of these ' + fmtN(c.n) + ' have not been checked in respond.io yet. The overnight check does it; Count again tomorrow morning. Numbers that are landlines, invalid, or not found there are left out (SMS-only).</p>' : '') +
      '<p><b>No repeats.</b> Left out: anyone messaged in October’s Lost Clients blasts or Wellness Voucher blasts 3 and 4, by name and by phone number, anyone we wrote to on WhatsApp since 9 Oct, and every opt-out. Not checked: Wellness Voucher blasts 1 and 2 (August), their recipients are only in GHL.</p>';
    var facts = '<div class="nvb-facts"><div><b>Cost, at most</b>' + cost + '</div><div><b>Target by 30 Nov</b>' + esc(d.gold) + '</div><div><b>Message test</b>' + esc(d.arms) + '</div><div><b>Valid until</b>' + esc(d.valid || '30 November 2026') + '</div></div>';
    var rvChip = rv === 'ok' || rv === 'changes' ? '<span class="chip ' + (rv === 'ok' ? 'good' : 'warn') + '">' + (rv === 'ok' ? 'Approved' : 'Needs changes') + ' by ' + esc(b.review_by) + ', ' + esc(fat(b.review_at)) + '</span>' : '<span class="chip">Not reviewed yet</span>';
    return '<div class="nvb-det-head" id="nvb-detail"><div><span class="eyebrow">' + esc(fdate(d.date)) + ', from ' + esc(fmtClock(+d.time.split(':')[0] * 60 + +d.time.split(':')[1])) + (aqDate(b) !== d.date ? '. Al Quoz: ' + esc(fdate(aqDate(b))) : '') + '</span><h2>' + esc(d.title) + '</h2></div>' + rvChip + '</div>' +
      '<div class="nvb-det"><div class="nvb-card nvb-phone">' +
      (lenOk ? '<div class="nvb-tog" aria-label="Length"><button type="button" class="' + (!useShort ? 'on' : '') + '" data-nvb="len:long">Long</button><button type="button" class="' + (useShort ? 'on' : '') + '" data-nvb="len:short">Short</button></div>' : '') +
      '<div class="nvb-tog" aria-label="Audience">' + (hasWarm ? '<button type="button" class="' + (a === 'warm' ? 'on' : '') + '" data-nvb="aud:warm">Warm</button>' : '') + '<button type="button" class="' + (a === 'std' ? 'on' : '') + '" data-nvb="aud:std">Standard</button></div>' +
      '<div class="nvb-wa"><div class="nvb-wa-top"><i>TR</i>Tara Rose Salons</div><div class="nvb-wa-body"><div class="nvb-bub">' + sub(m[a] || m.std || m.warm, d.end) + '<span class="ft">' + esc(d.footer) + '</span><span class="tm">11:02</span></div></div></div>' +
      '<p class="nvb-small">' + (a === 'warm' ? 'Warm: last visit in the last 90 days.' : 'Standard: last visit 91 days to 6 months' + (b.id === 'E' ? ' (nobody here is warmer).' : '.')) + '</p>' +
      '<div class="nvb-after">' + (d.tkey ? '<button type="button" class="nvb-btn" data-nvb="terms:' + esc(b.id) + '">Terms</button>' : '<span class="nvb-small nvb-noterms">No terms: no offer in this message.</span>') + '<button type="button" class="nvb-btn" data-nvb="reply:' + esc(b.id) + '">If she replies</button></div>' +
      '<div class="nvb-after"><button type="button" class="nvb-btn' + (rv === 'ok' ? ' pri' : '') + '"' + (ed ? ' data-nvb="rev:ok"' : ' disabled') + '>Approve</button><button type="button" class="nvb-btn' + (rv === 'changes' ? ' pri' : '') + '"' + (ed ? ' data-nvb="rev:changes"' : ' disabled') + '>Needs changes</button></div></div>' +
      '<div class="nvb-info"><div class="nvb-card nvb-split"><div><div class="big">' + (c ? num(c.n, tl + ', every client', { p_blast: b.id }) : (liveErr ? '?' : '…')) + '</div><div class="lab">clients get this</div></div><div><div class="big">' + warmStd + '</div><div class="lab">' + (c && c.warm > 0 ? 'warm / standard' : 'all standard') + '</div></div></div>' +
      '<div class="nvb-card nvb-box"><h3>By salon</h3>' + BKEYS.map(function (k) {
        var n = c ? c[k] : null;
        return '<div class="nvb-br"><span>' + BR[k] + '</span><span class="bar"><i style="width:' + (n == null ? 0 : n / mx * 100) + '%"></i></span><span class="v">' + (n == null ? '…' : num(n, tl + ', ' + BR[k], { p_blast: b.id, p_branch: k })) + '</span></div>';
      }).join('') + '<p>Each client is messaged from her last salon’s number.</p></div>' +
      fold('who', 'Who gets it, and who is left out', '', who) + fold('facts', 'Cost, target and test', '', facts) + '</div></div>';
  }
  function messagesHtml() {
    return '<div class="nvb-pane"><h2>Messages</h2><p class="lead">Pick a blast to see the message as the client reads it. Emma approves here.</p>' + calHtml() + detailHtml() + '<div class="nvb-stack">' + planHtml() + octHtml() + '</div></div>';
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
    var body = tab === 'decide' ? decideHtml() : tab === 'messages' ? messagesHtml() : tab === 'before' ? beforeHtml() : repliesHtml();
    el.innerHTML = '<div class="nvb"><header class="nvb-head"><div class="eyebrow">Tools · 2026</div><h1>November blasts</h1>' +
      '<div class="nvb-chipsrow"><span class="chip warn">Draft, nothing sent</span><span class="chip">Every message ends 30 November</span><span class="chip">UAE salons, 11:30 am to 4 pm</span></div>' +
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
      var a = t.getAttribute('data-nvb').split(':'), k = a[0], v = a.slice(1).join(':');
      if (k === 'tab') { tab = v; render(); toTop(); syncUrl(); }
      else if (k === 'goto') { var q = v.split(':'); tab = q[0]; if (q[1] != null) dec = +q[1]; render(); toTop(); syncUrl(); }
      else if (k === 'go') { dec = +v; render(true); }
      else if (k === 'pick') { if (!canEdit()) return; act(function () { return rpc('nov_blast_decide', { p_idx: dec + 1, p_pick: +v }); }); }
      else if (k === 'clear') { act(function () { return rpc('nov_blast_decide', { p_idx: dec + 1, p_pick: null }); }); }
      else if (k === 'sel') { cur = v; rb = v; render(true); syncUrl(); }   // stays where she is, so the picker works as a toggle and the message swaps in below
      else if (k === 'recount') { if (!canEdit() || counting) return; counting = true; render(true); rpc('nov_blast_audience', { p_recount: true }).then(function (r) { LIVE = r; liveErr = false; }).catch(function (e) { console.error(e); errMsg = 'Counting did not finish: ' + (e.message || 'try again'); }).then(function () { counting = false; render(true); }); }
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
    if (!item(cur) || !isBlast(item(cur))) { cur = blasts()[0] ? blasts()[0].id : 'D'; rb = cur; }
    bind(); render(); syncUrl();
    loadLive().then(function () { if (main() && main().offsetParent !== null) render(true); });   // the counts come a moment after the page
  };
})();
