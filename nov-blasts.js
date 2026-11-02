/* November Blasts (Kate, 2 Nov 2026), a dashboard page in Tools (?view=novblasts), so the main sidebar stays. The database blasts for November,
   planned from the 2 Nov Zoom with Coach Emma: who gets which message, the Monday it goes out, the seven decisions to settle, and her review.
   Reads and writes only through nov_blast_* (migrations/nov_blasts.sql), which check the level again (old Levels 3 and 5 edit; a person opened
   for Campaign Blasts reads). Counts are LIVE from the till. Nothing here sends a message. Needs only sb (the Supabase client), TRS_LEVEL, TRSD. */
(function () {
  function main() { return document.getElementById('novBlastsContent'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtN(n) { return Number(n || 0).toLocaleString('en-GB'); }
  var BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' }, BKEYS = ['SAA', 'KCA', 'MC', 'AQ'];
  var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var RATE_AED = 0.21;   // one delivered marketing message: October measured USD 0.044 to 0.055 and Meta raised UAE rates on 1 Oct 2026, so the higher figure; undelivered ones are not charged
  var D = null, LIVE = null, liveErr = false, counting = false, cur = 'D', ver = 'v2', aud = 'warm', len = 'long', dec = 0, errMsg = '', wantBlast = '', firstOpen = true, bound = false;
  window.nvbUrlParts = function () { var id = D ? cur : (wantBlast || 'D'); return id && id !== 'D' ? ['blast=' + encodeURIComponent(id)] : []; };
  function syncUrl() { try { if (typeof trSyncUrl === 'function' && typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'novblasts') trSyncUrl(null); } catch (e) { /* fine without it */ } }
  function notFound() { var el = main(); if (el) el.innerHTML = '<p class="slv-muted">This page isn’t open to your account yet. Ask Kate to open it for you.</p>'; }
  async function rpc(name, args) { var r = await sb.rpc(name, args || {}); if (r.error) throw new Error(r.error.message); return r.data; }
  function canEdit() { return !D || D.editor !== false; }
  function isBlast(i) { return i.id.indexOf('dec') !== 0 && i.id !== 'oct' && i.id !== 'pre'; }
  function blasts() { return D.items.filter(isBlast); }
  function decs() { return D.items.filter(function (i) { return i.id.indexOf('dec') === 0; }); }
  function item(id) { return D.items.filter(function (i) { return i.id === id; })[0]; }
  function pickOf(n) { var r = (D.decisions || []).filter(function (d) { return d.idx === n; })[0]; return r && r.pick != null ? r.pick : null; }
  function parts(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function fdate(iso) { var d = parts(iso); return DN[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()]; }
  function fat(iso) { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)); } catch (e) { return iso; } }
  function aqDate(b) { return b.data.aq_date || b.data.date; }
  function dayLabel(iso) { var d = parts(iso); return DN[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()]; }
  function fmtClock(mins) { var h = Math.floor(mins / 60), m = mins % 60; return (h > 12 ? h - 12 : h) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); }
  function lv(id) { return LIVE && LIVE.blasts ? (LIVE.blasts[id] || { n: 0, warm: 0, std: 0, SAA: 0, KCA: 0, MC: 0, AQ: 0, ext: 0, blonde: 0, colour: 0 }) : null; }

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
  function live(f, fallback) { return LIVE && LIVE.blasts ? f() : (liveErr ? (fallback || '?') : '…'); }

  /* ---------- pieces ---------- */
  function numsHtml() {
    var total = LIVE && LIVE.blasts ? blasts().reduce(function (a, b) { return a + (lv(b.id).n || 0); }, 0) : null;
    var done = (D.decisions || []).filter(function (d) { return d.pick != null; }).length;
    var tot = total == null ? (liveErr ? '?' : '…') : num(total, 'November blasts, every client', {}, true);
    var cost = total == null ? '…' : 'AED ' + fmtN(Math.round(total * RATE_AED));
    var likely = total == null ? '' : 'Likely less: a message that is not delivered is not charged.';
    var days = {}; blasts().forEach(function (b) { days[b.data.date] = 1; days[aqDate(b)] = 1; });
    var dl = Object.keys(days).sort(), nd = dl.length;
    return '<div class="nvb-card nvb-nums">' +
      '<div><div class="big">' + tot + '</div><div class="lab">messages, ' + blasts().length + ' blasts</div></div>' +
      '<div><div class="big">' + cost + '</div><div class="lab">at most, one message per client. ' + esc(likely) + '</div></div>' +
      '<div><div class="big">' + nd + ' send days</div><div class="lab">' + dl.map(dayLabel).join(' and ') + ', 11:30 am to 4 pm. Offers end 30 Nov.</div></div>' +
      '<div><div class="big">' + done + ' of ' + decs().length + '</div><div class="lab">decisions made</div></div></div>' + countedHtml();
  }
  // When the clients were counted (the count is kept for up to an hour because counting takes about 20 seconds), and a way to count again.
  function countedHtml() {
    if (counting) return '<p class="nvb-small nvb-counted">Counting the clients again, about 20 seconds…</p>';
    if (!LIVE || !LIVE.at) return '';
    return '<p class="nvb-small nvb-counted">Clients counted ' + esc(fat(LIVE.at)) + ', Dubai time, from our sales records. ' + (canEdit() ? '<button type="button" class="nvb-link" data-nvb="recount">Count again</button>' : '') + '</p>';
  }
  function decHtml() {
    var ds = decs(); if (!ds.length) return '';
    if (dec >= ds.length) dec = ds.length - 1;
    var d = ds[dec], p = pickOf(dec + 1), o = d.data.o || [], ed = canEdit();
    return '<div class="nvb-card nvb-dec"><div class="nvb-dec-top"><span class="eyebrow">Decision ' + (dec + 1) + ' of ' + ds.length + '</span><div class="nvb-dots">' +
      ds.map(function (x, i) { var dn = pickOf(i + 1) != null; return '<button type="button" class="' + (i === dec ? 'cur ' : '') + (dn ? 'done' : '') + '" data-nvb="go:' + i + '" aria-label="Decision ' + (i + 1) + '">' + (dn ? '✓' : (i + 1)) + '</button>'; }).join('') + '</div></div>' +
      '<h3>' + esc(d.data.q) + '</h3><p class="why">' + esc(d.data.why) + '</p>' +
      '<div class="nvb-opts">' + o.map(function (x, i) {
        return '<button type="button" class="nvb-opt' + (p === i ? ' sel' : '') + '"' + (ed ? ' data-nvb="pick:' + i + '"' : ' disabled') + '><b>' + esc(x[0]) + (x[2] ? ' <span class="chip rec">Suggested</span>' : '') + '</b><span>' + esc(x[1]) + '</span></button>';
      }).join('') + '</div>' +
      (p != null ? '<div class="nvb-by">' + (function () { var r = (D.decisions || []).filter(function (z) { return z.idx === dec + 1; })[0]; return r ? 'Chosen by ' + esc(r.by) + ', ' + esc(fat(r.at)) + '. ' + (ed ? '<button type="button" class="nvb-link" data-nvb="clear">Undo</button>' : '') : ''; })() + '</div>' : '') +
      '<div class="nvb-dec-nav"><button type="button" class="nvb-btn" ' + (dec === 0 ? 'disabled' : 'data-nvb="go:' + (dec - 1) + '"') + '>Back</button><button type="button" class="nvb-btn pri" ' + (dec === ds.length - 1 ? 'disabled' : 'data-nvb="go:' + (dec + 1) + '"') + '>Next</button></div></div>';
  }
  function calHtml() {
    var bs = blasts(); if (!bs.length) return '';
    // a card per send day. A blast sits on its own day for every salon but Al Quoz; Al Quoz clients go on aq_date (the salon is shut Sundays and Mondays).
    var days = {};
    bs.forEach(function (b) {
      var c = lv(b.id), aq = c ? c.AQ : null, same = aqDate(b) === b.data.date;
      (days[b.data.date] = days[b.data.date] || { main: [], aq: [] }).main.push({ b: b, n: c ? (same ? c.n : c.n - c.AQ) : null });
      if (!same) (days[aqDate(b)] = days[aqDate(b)] || { main: [], aq: [] }).aq.push({ b: b, n: aq });
    });
    var keys = Object.keys(days).sort();
    var cards = keys.map(function (iso) {
      var dn = parts(iso), d = days[iso];
      var h = '<div class="nvb-card day"><div class="d"><small>' + (dn.getDay() === 1 ? 'Monday' : DN[dn.getDay()] === 'Tue' ? 'Tuesday' : DN[dn.getDay()]) + '</small>' + dn.getDate() + ' ' + MN[dn.getMonth()] + '</div>';
      h += d.main.map(function (x) {
        var notAq = aqDate(x.b) !== x.b.data.date;
        return '<button type="button" class="nvb-bl' + (cur === x.b.id ? ' sel' : '') + '" data-nvb="sel:' + esc(x.b.id) + '"><b>' + esc(x.b.data.short || x.b.data.title) + '</b><span class="n">' + (x.n == null ? (liveErr ? '?' : '…') : fmtN(x.n)) + ' clients' + (notAq ? ', not Al Quoz' : '') + '</span></button>';
      }).join('');
      if (d.aq.length) h += '<div class="nvb-aq"><b>Al Quoz, ' + d.aq.map(function (x) { return esc(x.b.data.short || x.b.data.title).toLowerCase(); }).join(', ') + '</b><span class="n">' + fmtN(d.aq.reduce(function (a, x) { return a + (x.n || 0); }, 0)) + ' clients. The salon is closed on Mondays, so replies are not left waiting.</span></div>';
      return h + '</div>';
    });
    cards.push('<div class="nvb-card day none"><div class="d"><small>Monday</small>30 Nov</div><p>Offers end. Last day to book and have the appointment. Nothing is sent after the second send day.</p></div>');
    return '<div class="nvb-cal">' + cards.join('') + '</div>';
  }
  // The pace is the one October used: about 100 messages every 30 minutes from each salon's number, from 11:30 am. Past 4 pm is flagged.
  function planHtml() {
    var bs = blasts(); if (!LIVE || !LIVE.blasts) return '';
    var days = {};
    bs.forEach(function (b) {
      var c = lv(b.id);
      BKEYS.forEach(function (k) {
        var iso = k === 'AQ' ? aqDate(b) : b.data.date;
        (days[iso] = days[iso] || {})[k] = ((days[iso] || {})[k] || 0) + (c[k] || 0);
      });
    });
    var keys = Object.keys(days).sort();
    var head = '<div class="nvb-pl-r h"><span>Salon</span>' + keys.map(function (iso) { return '<span>' + esc(dayLabel(iso)) + '</span>'; }).join('') + '</div>';
    var rows = BKEYS.map(function (k) {
      return '<div class="nvb-pl-r"><span>' + BR[k] + '</span>' + keys.map(function (iso) {
        var n = days[iso][k] || 0; if (!n) return '<span class="z">none</span>';
        var end = 11 * 60 + 30 + Math.ceil(n / 100) * 30, over = end > 16 * 60;
        return '<span class="' + (over ? 'over' : '') + '"><b>' + fmtN(n) + '</b> done by ' + fmtClock(end) + (over ? ', too late' : '') + '</span>';
      }).join('') + '</div>';
    }).join('');
    return '<div class="nvb-card nvb-box nvb-plan"><h3>Sending plan</h3>' + head + rows + '<p>About 100 messages every 30 minutes from each salon’s own number, starting 11:30 am, all finished by 4 pm. Run Count again each morning before sending: it takes in any STOP replies and the opt-out sheet.</p></div>';
  }
  function waHtml(b) {
    var d = b.data, lenOk = !!d.short_msg, useShort = lenOk && len === 'short', src = useShort ? d.short_msg : d.msg, m = d.versions ? src[ver] : src, c = lv(b.id), hasWarm = c ? c.warm > 0 : !!m.warm;
    var a = (aud === 'warm' && hasWarm && m.warm) ? 'warm' : 'std';
    var t = esc(m[a] || m.std || m.warm).replace(/\{\{1\}\}/g, '<mark>Layla</mark>').replace(/\{\{2\}\}/g, '<mark>Saadiyat</mark>').replace(/\{\{3\}\}/g, '<mark>' + esc(d.end || '30 November 2026') + '</mark>');
    return '<div class="nvb-card nvb-phone">' +
      (d.versions ? '<div class="nvb-tog" aria-label="Wording">' + Object.keys(d.versions).map(function (k) { return '<button type="button" class="' + (ver === k ? 'on' : '') + '" data-nvb="ver:' + k + '">' + esc(d.versions[k]) + '</button>'; }).join('') + '</div>' : '') +
      (lenOk ? '<div class="nvb-tog" aria-label="Length"><button type="button" class="' + (!useShort ? 'on' : '') + '" data-nvb="len:long">Long</button><button type="button" class="' + (useShort ? 'on' : '') + '" data-nvb="len:short">Short</button></div>' : '') +
      '<div class="nvb-tog" aria-label="Audience">' + (hasWarm && m.warm ? '<button type="button" class="' + (a === 'warm' ? 'on' : '') + '" data-nvb="aud:warm">Warm</button>' : '') + '<button type="button" class="' + (a === 'std' ? 'on' : '') + '" data-nvb="aud:std">Standard</button></div>' +
      '<div class="nvb-wa"><div class="nvb-wa-top"><i>TR</i>Tara Rose Salons</div><div class="nvb-wa-body"><div class="nvb-bub">' + t + '<span class="ft">' + esc(d.footer) + '</span><span class="tm">11:02</span></div></div></div>' +
      '<p class="nvb-small">' + (a === 'warm' ? 'Warm: last visit in the last 90 days.' : 'Standard: last visit 91 days to 6 months' + (b.id === 'E' ? ' (nobody here is warmer).' : '.')) + '</p></div>';
  }
  function detailHtml() {
    var b = item(cur) && isBlast(item(cur)) ? item(cur) : blasts()[0]; if (!b) return '';
    var d = b.data, c = lv(b.id), tl = d.title, mx = c ? Math.max(c.SAA, c.KCA, c.MC, c.AQ, 1) : 1;
    var rv = b.review, ed = canEdit();
    var warmStd = c ? (c.warm > 0 ? num(c.warm, tl + ', warm clients', { p_blast: b.id, p_group: 'warm' }) + ' / ' + num(c.std, tl + ', standard clients', { p_blast: b.id, p_group: 'std' }) : num(c.std, tl + ', standard clients', { p_blast: b.id, p_group: 'std' })) : (liveErr ? '?' : '…');
    var extra = '';
    if (c && b.id === 'D') extra = '<div class="nvb-chips">Had extensions in the last 12 months: <b>' + num(c.ext, tl + ', had extensions', { p_blast: b.id, p_flag: 'ext' }) + '</b> · Had blonde work: <b>' + num(c.blonde, tl + ', had blonde work', { p_blast: b.id, p_flag: 'blonde' }) + '</b></div>';
    if (c && b.id === 'E') extra = '<div class="nvb-chips">Had colour in the last 12 months: <b>' + num(c.colour, tl + ', had colour', { p_blast: b.id, p_flag: 'colour' }) + '</b> · The rest: <b>' + fmtN(c.n - c.colour) + '</b></div>';
    var cost = c ? 'AED ' + fmtN(Math.round(c.n * RATE_AED)) : '…';
    return '<div class="nvb-det-head"><div><div class="eyebrow">' + esc(fdate(d.date)) + ', from ' + esc(fmtClock(+d.time.split(':')[0] * 60 + +d.time.split(':')[1])) + (aqDate(b) !== d.date ? '. Al Quoz: ' + esc(fdate(aqDate(b))) : '') + '</div><h2>' + esc(d.title) + '</h2></div><span class="chip ' + esc(d.brand[0]) + '">' + esc(d.brand[1]) + '</span></div>' +
      '<div class="nvb-det">' + waHtml(b) + '<div class="nvb-info">' +
      '<div class="nvb-card nvb-split"><div><div class="big">' + (c ? num(c.n, tl + ', every client', { p_blast: b.id }) : (liveErr ? '?' : '…')) + '</div><div class="lab">clients get this</div></div><div><div class="big">' + warmStd + '</div><div class="lab">' + (c && c.warm > 0 ? 'warm / standard' : 'all standard') + '</div></div></div>' +
      '<div class="nvb-card nvb-box"><h3>By salon</h3>' + BKEYS.map(function (k) {
        var n = c ? c[k] : null;
        return '<div class="nvb-br"><span>' + BR[k] + '</span><span class="bar"><i style="width:' + (n == null ? 0 : n / mx * 100) + '%"></i></span><span class="v">' + (n == null ? '…' : num(n, tl + ', ' + BR[k], { p_blast: b.id, p_branch: k })) + '</span></div>';
      }).join('') + '<p>Each client is messaged from her last salon’s number.</p></div>' +
      '<div class="nvb-card nvb-box"><h3>Who gets it</h3><p>' + esc(d.who) + '</p>' + extra +
      (c && c.unchecked ? '<p class="nvb-wa-note"><b>WhatsApp check:</b> ' + fmtN(c.unchecked) + ' of these ' + fmtN(c.n) + ' have not been checked in respond.io yet. The overnight check does it; Count again tomorrow morning. Numbers that are landlines, invalid, or not found there are left out (SMS-only).</p>' : '') +
      '<p><b>No repeats.</b> Left out: anyone messaged in October’s Lost Clients blasts or Wellness Voucher blasts 3 and 4, by name and by phone number, anyone we wrote to on WhatsApp since 9 Oct, and every opt-out. Not checked: Wellness Voucher blasts 1 and 2 (August), their recipients are only in GHL.</p>' +
      '<div class="nvb-facts"><div><b>Cost, at most</b>' + cost + '</div><div><b>Target by 30 Nov</b>' + esc(d.gold) + '</div><div><b>Message test</b>' + esc(d.arms) + '</div><div><b>Valid until</b>' + esc(d.valid || '30 November 2026') + '</div><div><b>Terms</b>' + (d.terms ? '<u>' + esc(d.terms) + '</u>' : 'None, no rate in this message') + '</div></div></div>' +
      '<div class="nvb-card nvb-box"><h3>Coach Emma’s review</h3><div class="nvb-rev"><button type="button" class="nvb-btn' + (rv === 'ok' ? ' pri' : '') + '"' + (ed ? ' data-nvb="rev:ok"' : ' disabled') + '>Approve</button><button type="button" class="nvb-btn' + (rv === 'changes' ? ' pri' : '') + '"' + (ed ? ' data-nvb="rev:changes"' : ' disabled') + '>Needs changes</button>' +
      (rv === 'ok' || rv === 'changes' ? '<span class="chip ' + (rv === 'ok' ? 'good' : 'warn') + '">' + (rv === 'ok' ? 'Approved' : 'Needs changes') + ' by ' + esc(b.review_by) + ', ' + esc(fat(b.review_at)) + '</span>' : '<span class="chip">Not reviewed yet</span>') + '</div></div></div></div>';
  }
  // Kate's list of things to settle before the first message (nov_blast_items 'pre', in the database, not in this public file).
  function preHtml() {
    var o = item('pre'); if (!o) return '';
    var d = o.data;
    return '<section class="nvb-sec"><h2>' + esc(d.title) + '</h2><p class="lead">' + esc(d.lead) + '</p><div class="nvb-card nvb-pre">' +
      (d.checks || []).map(function (c, i) { return '<div class="nvb-pre-r"><span class="n">' + (i + 1) + '</span><div><b>' + esc(c[0]) + '</b><p>' + esc(c[1]) + '</p></div></div>'; }).join('') + '</div></section>';
  }
  function octHtml() {
    var o = item('oct'); if (!o) return '';   // the figures live in the database (nov_blast_items 'oct'), not in this public file
    var d = o.data;
    return '<section class="nvb-sec"><h2>' + esc(d.title) + '</h2><p class="lead">' + esc(d.lead) + '</p><div class="nvb-oct">' +
      (d.cards || []).map(function (c) { return '<div class="nvb-card"><div class="eyebrow">' + esc(c.k) + '</div><div class="big">' + esc(c.big) + '</div><p>' + esc(c.p) + '</p></div>'; }).join('') +
      '</div><p class="nvb-foot">' + esc(d.foot) + '</p></section>';
  }
  function render(keep) {
    var el = main(); if (!el) return;
    var y = window.scrollY;
    el.innerHTML = '<div class="nvb"><header class="nvb-head"><div class="eyebrow">Tools · 2026</div><h1>November blasts</h1>' +
      '<div class="nvb-chipsrow"><span class="chip warn">Draft, nothing sent</span><span class="chip">Every message ends 30 November</span><span class="chip">UAE salons, 11:30 am to 4 pm</span></div>' +
      '<p>Database blasts, not campaign promotions: who we have not spoken to yet, and what they might want next. Each client gets one message in November.</p>' +
      (liveErr ? '<p class="nvb-err">The counts could not be read just now, so the numbers show a question mark. Open the page again in a minute.</p>' : '') +
      (errMsg ? '<p class="nvb-err">' + esc(errMsg) + '</p>' : '') + numsHtml() + '</header>' +
      '<section class="nvb-sec"><h2>Decide first</h2><p class="lead">Seven calls before anything goes to Meta. One at a time.</p>' + decHtml() + '</section>' +
      '<section class="nvb-sec"><h2>When it goes out</h2><p class="lead">Tap a blast to see the message, who gets it and what it costs.</p>' + calHtml() + '<div style="height:12px"></div>' + planHtml() + '</section>' +
      '<section class="nvb-sec" id="nvb-detail">' + detailHtml() + '</section>' + preHtml() + octHtml() + '</div>';
    if (keep) window.scrollTo({ top: y, behavior: 'instant' });   // the dashboard sets smooth scrolling, which would glide the page up
  }
  async function reload() { D = await rpc('nov_blast_get'); }
  async function loadLive() { try { LIVE = await rpc('nov_blast_audience'); liveErr = false; } catch (e) { console.error(e); liveErr = true; } }
  async function act(fn) {
    errMsg = '';
    try { await fn(); await reload(); } catch (e) { console.error(e); errMsg = 'That did not save: ' + (e.message || 'try again'); }
    render(true);
  }
  function bind() {
    var el = main(); if (!el || bound) return; bound = true;
    el.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-nvb]'); if (!t || t.disabled || !D) return;
      var a = t.getAttribute('data-nvb').split(':'), k = a[0], v = a.slice(1).join(':');
      if (k === 'go') { dec = +v; render(true); }
      else if (k === 'pick') { if (!canEdit()) return; act(function () { return rpc('nov_blast_decide', { p_idx: dec + 1, p_pick: +v }); }); }
      else if (k === 'clear') { act(function () { return rpc('nov_blast_decide', { p_idx: dec + 1, p_pick: null }); }); }
      else if (k === 'sel') { cur = v; render(true); syncUrl(); var s = document.getElementById('nvb-detail'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'start', behavior: 'instant' }); }
      else if (k === 'recount') { if (!canEdit() || counting) return; counting = true; render(true); rpc('nov_blast_audience', { p_recount: true }).then(function (r) { LIVE = r; liveErr = false; }).catch(function (e) { console.error(e); errMsg = 'Counting did not finish: ' + (e.message || 'try again'); }).then(function () { counting = false; render(true); }); }
      else if (k === 'ver') { ver = v; render(true); }
      else if (k === 'aud') { aud = v; render(true); }
      else if (k === 'len') { len = v; render(true); }
      else if (k === 'rev') { var b = item(cur); if (!b || !canEdit()) return; act(function () { return rpc('nov_blast_review', { p_id: b.id, p_review: b.review === v ? 'none' : v }); }); }
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
    if (firstOpen) { firstOpen = false; try { wantBlast = new URLSearchParams(location.search).get('blast') || ''; } catch (e) { wantBlast = ''; } }
    errMsg = '';
    if (!D) el.innerHTML = '<div class="nvb"><header class="nvb-head"><h1>November blasts</h1></header><p class="slv-muted">Loading…</p></div>';
    try { await reload(); } catch (e) { console.error(e); notFound(); return; }
    if (wantBlast) { if (item(wantBlast) && isBlast(item(wantBlast))) cur = wantBlast; wantBlast = ''; }
    if (!item(cur)) cur = blasts()[0] ? blasts()[0].id : 'D';
    bind(); render(); syncUrl();
    loadLive().then(function () { if (main() && main().offsetParent !== null) render(true); });   // the counts come a moment after the page
  };
})();
