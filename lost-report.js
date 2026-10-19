// Lost Clients, Performance report tab (Kate, 16 Oct 2026): the record of what the site sent through respond.io, when, and what came of it.
// Numbers from lost_send_report_get() and the log from lost_send_log_get() (migrations/lost_send_report.sql), Level 3 and above.
// Replied, STOP and blocked come from lost_wa_status, which respond-status-sync refreshes each night, so they run up to a day behind; booked is a booking
// from today on in client_bookings. The page keeps its own copy only while it is open: Refresh asks again.
//
// Drawn by lqShowTab('perf') in lost-queue.js, into #lqHost. Borrows lcEsc, lcNum, LC_BRANCH (lost-clients.js), LQ_TYPES (lost-queue.js) and the
// XLSX writer (lgx*), so it must load after both.
let lrSum = null, lrRowsPage = [], lrTotal = 0, lrErr = '', lrBusy = false, lrOpen = {}, lrQTimer = null;
// The Booked card split by deposit (lost_booked_deposits, migrations/lost_booked_deposits.sql). Null until the function is live: the section stays out.
let lrDep = null, lrDepView = 'visual';
try { if (localStorage.getItem('lr-dep-view') === 'table') lrDepView = 'table'; } catch (e) {}
// Did our message arrive? (lost_delivery_report, migrations/lost_delivery_report.sql). Same: null until the function is live, the section stays out.
let lrDel = null, lrDelView = 'visual';
try { if (localStorage.getItem('lr-del-view') === 'table') lrDelView = 'table'; } catch (e) {}
let lrSel = { wave: 'all', branch: 'all', status: 'all', q: '', page: 1, per: 50 };
// One message at a time (Kate, 19 Oct 2026): the whole report, the Booked and deposit and delivery sections and the log can be cut to Smoothing,
// Colour or Due (migrations/lost_report_by_type.sql). 'all' sends no argument, so the page still works before that migration is live.
let lrType = 'all';
const LR_TYPES = [['smoothing', 'Smoothing'], ['colour', 'Colour'], ['due', 'Due (the reminder)']];
const lrArgs = () => lrType === 'all' ? undefined : { p_type: lrType };
const lrTypeName = () => (LR_TYPES.find(t => t[0] === lrType) || [, ''])[1];

const LR_BR = ['SAA', 'KCA', 'MC', 'AQ'];
const lrPct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';
const lrDay = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return d; } };
const lrTime = iso => { if (!iso) return '–'; try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return '–'; } };
// "colour_story" -> Colour, story (1b);  "due_v2" -> Due, standard;  "colour_v2_stop" -> Colour, standard + STOP line
function lrMsg(tkey) {
  const t = String(tkey || '').replace(/_(story|v2_stop|v2)$/, ''), arm = /_story$/.test(tkey) ? 'story' : /_v2_stop$/.test(tkey) ? 'standard + STOP line' : 'standard';
  const nm = (typeof LQ_TYPES !== 'undefined' && LQ_TYPES[t]) ? LQ_TYPES[t][0] : t;
  return { nm, arm };
}

async function lrRenderPerf(force) {
  const host = document.getElementById('lqHost');
  if (!host || lqSel.tab !== 'perf') return;
  if (!lrSum || force) {
    host.innerHTML = '<p class="slv-muted">Loading the report…</p>';
    await lrLoad();
  }
  lrPaint();
}
async function lrLoad() {
  if (lrBusy) return;
  lrBusy = true; lrErr = '';
  try {
    const [s, l, dp, dl] = await Promise.all([sb.rpc('lost_send_report_get', lrArgs()), lrFetchPage(), sb.rpc('lost_booked_deposits', lrArgs()), sb.rpc('lost_delivery_report', lrArgs())]);
    if (s.error || !s.data) throw s.error || new Error('no report');
    lrSum = s.data;
    lrDep = (!dp.error && dp.data && dp.data.total) ? dp.data : null;   // optional: the report still draws without it
    if (dp.error) console.warn('lost_booked_deposits', dp.error);
    lrDel = (!dl.error && dl.data && dl.data.total) ? dl.data : null;   // optional too
    if (dl.error) console.warn('lost_delivery_report', dl.error);
    if (l.error || !l.data) throw l.error || new Error('no log');
    lrRowsPage = l.data.rows || []; lrTotal = l.data.total || 0;
  } catch (e) { console.error(e); lrErr = 'The report did not load. Refresh to try again.'; }
  lrBusy = false;
}
function lrFetchPage(offset, limit) {
  return sb.rpc('lost_send_log_get', {
    p_wave: lrSel.wave === 'all' ? null : +lrSel.wave, p_branch: lrSel.branch, p_status: lrSel.status, p_q: lrSel.q.trim(),
    p_offset: offset != null ? offset : (lrSel.page - 1) * lrSel.per, p_limit: limit || lrSel.per, ...(lrType === 'all' ? {} : { p_type: lrType }) });
}
async function lrRefreshLog() {
  const { data, error } = await lrFetchPage();
  if (error || !data) { console.error(error); lrNote('The log did not load. Try again.'); return; }
  lrRowsPage = data.rows || []; lrTotal = data.total || 0;
  lrPaintLog();
}
function lrSetType(v) {
  lrType = LR_TYPES.some(t => t[0] === v) ? v : 'all';
  lrSel.page = 1; lrOpen = {};
  lrRenderPerf(true);
}
function lrSet(k, v) { lrSel[k] = v; lrSel.page = 1; lrOpen = {}; lrRefreshLog(); }
function lrSearch(v) { lrSel.q = v; lrSel.page = 1; clearTimeout(lrQTimer); lrQTimer = setTimeout(lrRefreshLog, 350); }
function lrGo(p) { lrSel.page = p; lrOpen = {}; lrRefreshLog(); }
function lrToggle(id) { lrOpen[id] = !lrOpen[id]; lrPaintLog(); }
function lrNote(t) { const n = document.getElementById('lrNote'); if (n) n.textContent = t; }

const LR_COLS = [['sent', 'Sent'], ['replied', 'Replied'], ['rate', 'Reply rate'], ['booked', 'Booked'], ['stop', 'STOP'], ['failed', 'Failed'], ['queued', 'Queued'], ['first', 'First sent'], ['last', 'Last sent']];
function lrRow(label, m) {
  return `<tr><td>${label}</td><td>${lcNum(m.sent)}</td><td>${lcNum(m.replied)}</td><td>${lrPct(m.replied, m.sent)}</td><td>${lcNum(m.booked)}</td>
    <td>${lcNum(m.stop)}</td><td>${m.failed ? `<b class="lr-bad">${lcNum(m.failed)}</b>` : '0'}</td><td>${lcNum(m.queued)}</td><td class="lr-when">${lrTime(m.first)}</td><td class="lr-when">${lrTime(m.last)}</td></tr>`;
}
function lrTable(first, rows) {
  if (!rows.length) return '<p class="slv-muted">Nothing sent yet.</p>';
  return `<div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr><th>${first}</th>${LR_COLS.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function lrTiles(t) {
  const card = (n, ti, d, cls) => `<div class="ll-card lr-card${cls ? ' ' + cls : ''}"><div class="ll-t">${ti}</div><div class="ll-n">${lcNum(n)}</div><div class="ll-d">${d}</div></div>`;
  return `<div class="ll-cards lr-cards">
    ${card(t.sent, 'Sent', t.first ? `${lcEsc(lrTime(t.first))} to ${lcEsc(lrTime(t.last))}` : 'nothing sent yet')}
    ${card(t.replied, 'Replied', `${lrPct(t.replied, t.sent)} of the sent, wrote in after our message (a STOP is counted under STOP, not here)`)}
    ${card(t.booked, 'Booked', `${lrPct(t.booked, t.sent)} have a booking from today on`)}
    ${card(t.stop, 'STOP', `${lrPct(t.stop, t.sent)} opted out since (suggested limit 2%)`, t.sent && t.stop / t.sent > 0.02 ? 'lr-warn' : '')}
    ${card(t.failed, 'Failed', `${lrPct(t.failed, t.n - t.queued)} of those tried (suggested limit 5%)`, t.failed ? 'lr-warn' : '')}
    ${card(t.queued, 'Still queued', 'waiting for the next send window')}
  </div>`;
}
// Booked, by deposit (Kate, 18 Oct 2026): of the clients who booked after our message, who has paid a deposit, who has not, and who
// comes today (no deposit needed). Visual by default, Table beside it like Comparison. Colours are the page's own: paid = --good,
// not paid yet = --accent, today = --muted2. Counted per client, so it can run under the Booked tile, which counts messages.
const LR_SOON = { 1: 'Tomorrow', 2: 'In 2 to 3 days', 3: 'In 4 to 7 days', 4: 'In 8 to 14 days', 5: 'Later' };
function lrDepBar(m, scale) {
  const w = k => m.booked ? (100 * (m[k] || 0) / m.booked) : 0;
  return `<span class="lr-dbar" style="width:${Math.max(4, scale)}%"><i class="d-paid" style="width:${w('paid')}%"></i><i class="d-today" style="width:${w('today')}%"></i><i class="d-unpaid" style="width:${w('unpaid')}%"></i></span>`;
}
function lrDepVisual(d) {
  const t = d.total, by = d.by_branch || [], soon = d.soon || [], maxB = Math.max(1, ...by.map(b => b.booked)), maxS = Math.max(1, ...soon.map(s => s.n));
  const card = (n, ti, ds) => `<div class="ll-card lr-card"><div class="ll-t">${ti}</div><div class="ll-n">${lcNum(n)}</div><div class="ll-d">${ds}</div></div>`;
  const key = '<div class="lr-dkey"><span><i class="d-paid"></i>Deposit paid</span><span><i class="d-today"></i>Today, none needed</span><span><i class="d-unpaid"></i>Not paid yet</span></div>';
  return `<div class="ll-cards lr-cards">
      ${card(t.booked, 'Booked', 'clients with a booking from today on')}
      ${card(t.paid, 'Deposit paid', lrPct(t.paid, t.booked) + ' of the booked')}
      ${card(t.unpaid, 'Not paid yet', 'no deposit in Phorest yet')}
      ${card(t.today, 'Today', 'booked for today, no deposit needed')}
    </div>
    <div class="lr-dgrid">
      <div class="lr-dcard"><h4>By branch</h4>
        ${by.map(b => `<div class="lr-drow"><span>${lcEsc(LC_BRANCH[b.k] || b.k)}</span>${lrDepBar(b, 100 * b.booked / maxB)}<b>${lcNum(b.booked)}</b></div>`).join('') || '<p class="slv-muted">Nobody yet.</p>'}
        ${key}</div>
      <div class="lr-dcard"><h4>Not paid yet: how soon they come</h4>
        ${soon.map(s => `<div class="lr-drow"><span>${LR_SOON[s.k] || s.k}</span><span class="lr-dbar" style="width:${Math.max(4, 100 * s.n / maxS)}%"><i class="d-unpaid" style="width:100%"></i></span><b>${lcNum(s.n)}</b></div>`).join('') || '<p class="slv-muted">Everyone has paid, or comes today.</p>'}
        <p class="slv-note">The ones coming tomorrow or the day after are the ones reception can chase today.</p></div>
    </div>`;
}
function lrDepTable(d) {
  const t = d.total, by = d.by_branch || [], who = d.who || [];
  const stTxt = w => w.status === 'paid' ? `Paid (AED ${lcNum(Math.round(w.deposit))})` : w.status === 'today' ? 'Today, none needed' : 'Not paid yet';
  return `<div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr><th>Branch</th><th>Booked</th><th>Deposit paid</th><th>Today, none needed</th><th>Not paid yet</th></tr></thead><tbody>
      ${by.map(b => `<tr><td>${lcEsc(LC_BRANCH[b.k] || b.k)}</td><td>${lcNum(b.booked)}</td><td>${lcNum(b.paid)}</td><td>${lcNum(b.today)}</td><td>${lcNum(b.unpaid)}</td></tr>`).join('')}
      <tr><td><b>All</b></td><td><b>${lcNum(t.booked)}</b></td><td><b>${lcNum(t.paid)}</b></td><td><b>${lcNum(t.today)}</b></td><td><b>${lcNum(t.unpaid)}</b></td></tr></tbody></table></div>
    <h4 class="lr-dh">Who</h4>
    <div class="lr-scroll"><table class="slv-table lr-tbl lr-logt"><thead><tr><th>Client</th><th>Branch</th><th>Next appointment</th><th>Deposit</th></tr></thead><tbody>
      ${who.map(w => `<tr><td>${lcEsc(w.name || '')}</td><td>${lcEsc(LC_BRANCH[w.branch] || w.branch)}</td><td>${lcEsc(lrDay(w.next))}</td><td>${lcEsc(stTxt(w))}</td></tr>`).join('')}</tbody></table></div>`;
}
function lrDepInner() {
  const d = lrDep;
  if (!d) return '';
  const tbl = lrDepView === 'table';
  return `<div class="lr-dhd"><h3>Booked: who has paid a deposit</h3>
      <div class="tp-seg" role="group" aria-label="View"><button type="button" class="${tbl ? '' : 'on'}" onclick="lrDepSet('visual')">Visual</button><button type="button" class="${tbl ? 'on' : ''}" onclick="lrDepSet('table')">Table</button></div></div>
    ${d.total.booked ? (tbl ? lrDepTable(d) : lrDepVisual(d)) : '<p class="slv-muted">Nobody has booked from today on yet.</p>'}
    <p class="slv-note">A deposit is Phorest's Deposit item, net of refunds, in the last 90 days, matched on the client's name. Deposits arrive with the nightly sales upload, so one paid today shows tomorrow. Counted per client.</p>`;
}
function lrDepSet(v) {
  lrDepView = v === 'table' ? 'table' : 'visual';
  try { localStorage.setItem('lr-dep-view', lrDepView); } catch (e) {}
  const el = document.getElementById('lr-deposits');
  if (el) el.innerHTML = lrDepInner();
}
// Did our message arrive? (Kate, 18 Oct 2026). respond.io's delivery status of each message we sent, kept by the nightly sync: seen (read),
// delivered but not read, accepted but not delivered yet, or failed (WhatsApp refused it, so she never got it). Visual by default, Table beside it.
// Colours are the page's own: seen = --good, delivered = --accent, not yet = --muted2, failed = --bad. Counted per message sent.
const LR_DKEYS = [['seen', 'Seen', 'd-seen'], ['delivered', 'Delivered only', 'd-delivered'], ['sent_only', 'Not delivered yet', 'd-sentonly'], ['failed', 'Failed to deliver', 'd-failed']];
function lrDelBar(m, scale) {
  const w = k => m.sent ? (100 * (m[k] || 0) / m.sent) : 0;
  return `<span class="lr-dbar" style="width:${Math.max(4, scale)}%">${LR_DKEYS.map(([k, , c]) => `<i class="${c}" style="width:${w(k)}%"></i>`).join('')}</span>`;
}
function lrDelVisual(d) {
  const t = d.total, by = d.by_branch || [], days = d.by_day || [], maxD = Math.max(1, ...days.map(x => x.sent));
  const card = (n, ti, ds, cls) => `<div class="ll-card lr-card${cls ? ' ' + cls : ''}"><div class="ll-t">${ti}</div><div class="ll-n">${lcNum(n)}</div><div class="ll-d">${ds}</div></div>`;
  const key = `<div class="lr-dkey">${LR_DKEYS.map(([, l, c]) => `<span><i class="${c}"></i>${l}</span>`).join('')}</div>`;
  return `<div class="ll-cards lr-cards">
      ${card(t.seen, 'Seen', lrPct(t.seen, t.sent) + ' of the sent were read')}
      ${card(t.delivered, 'Delivered only', lrPct(t.delivered, t.sent) + ', arrived but not read yet')}
      ${card(t.failed, 'Failed to deliver', lrPct(t.failed, t.sent) + ', WhatsApp refused them', t.sent && t.failed / t.sent > 0.05 ? 'lr-warn' : '')}
      ${card(t.sent_only, 'Not delivered yet', 'accepted, no delivery report yet')}
    </div>
    <div class="lr-dgrid">
      <div class="lr-dcard"><h4>By branch</h4>
        ${by.map(b => `<div class="lr-drow lr-drow2"><span>${lcEsc(LC_BRANCH[b.k] || b.k)}</span>${lrDelBar(b, 100)}<b>${lrPct(b.failed, b.sent)} failed</b></div>`).join('') || '<p class="slv-muted">Nothing sent yet.</p>'}
        ${key}</div>
      <div class="lr-dcard"><h4>By day sent</h4>
        ${days.map(x => `<div class="lr-drow lr-drow2"><span>${lcEsc(lrDay(x.k))}</span>${lrDelBar(x, 100 * x.sent / maxD)}<b>${lcNum(x.sent)}</b></div>`).join('') || '<p class="slv-muted">Nothing sent yet.</p>'}
        <p class="slv-note">Bar length is how many went out that day; the colours are what happened to them.</p></div>
    </div>`;
}
function lrDelTable(d) {
  const t = d.total, by = d.by_branch || [], days = d.by_day || [];
  const row = (label, m, bold) => { const b = v => bold ? `<b>${v}</b>` : v; return `<tr><td>${b(label)}</td><td>${b(lcNum(m.sent))}</td><td>${b(lcNum(m.seen))}</td><td>${b(lcNum(m.delivered))}</td><td>${b(lcNum(m.sent_only))}</td><td>${b(lcNum(m.failed))}</td><td>${b(lrPct(m.failed, m.sent))}</td></tr>`; };
  const head = first => `<thead><tr><th>${first}</th><th>Sent</th><th>Seen</th><th>Delivered only</th><th>Not delivered yet</th><th>Failed</th><th>Failed %</th></tr></thead>`;
  return `<div class="lr-scroll"><table class="slv-table lr-tbl">${head('Branch')}<tbody>${by.map(b => row(lcEsc(LC_BRANCH[b.k] || b.k), b)).join('')}${row('All', t, true)}</tbody></table></div>
    <h4 class="lr-dh">By day sent</h4>
    <div class="lr-scroll"><table class="slv-table lr-tbl">${head('Day')}<tbody>${days.map(x => row(lcEsc(lrDay(x.k)), x)).join('')}</tbody></table></div>`;
}
function lrDelInner() {
  const d = lrDel;
  if (!d) return '';
  const tbl = lrDelView === 'table', unk = d.total.unknown || 0;
  return `<div class="lr-dhd"><h3>Did the message arrive?</h3>
      <div class="tp-seg" role="group" aria-label="View"><button type="button" class="${tbl ? '' : 'on'}" onclick="lrDelSet('visual')">Visual</button><button type="button" class="${tbl ? 'on' : ''}" onclick="lrDelSet('table')">Table</button></div></div>
    ${d.total.sent ? (tbl ? lrDelTable(d) : lrDelVisual(d)) : '<p class="slv-muted">Nothing sent yet.</p>'}
    <p class="slv-note">From respond.io's delivery report for each message, read each night, so a message sent today shows its result tomorrow. A client who replied still counts by what happened to the message.${unk ? ` ${lcNum(unk)} sent message${unk === 1 ? ' has' : 's have'} no report yet and ${unk === 1 ? 'is' : 'are'} left out of the bars.` : ''}</p>`;
}
function lrDelSet(v) {
  lrDelView = v === 'table' ? 'table' : 'visual';
  try { localStorage.setItem('lr-del-view', lrDelView); } catch (e) {}
  const el = document.getElementById('lr-delivery');
  if (el) el.innerHTML = lrDelInner();
}
// Half-hour slots, one block per day: how the pace actually ran.
function lrSlots(slots) {
  if (!slots.length) return '<p class="slv-muted">Nothing sent yet.</p>';
  const days = {}; slots.forEach(s => { (days[s.d] = days[s.d] || []).push(s); });
  const max = Math.max(1, ...slots.map(s => s.n));
  return Object.keys(days).sort().map(d => {
    const rows = days[d], tot = rows.reduce((a, s) => a + s.n, 0);
    return `<div class="lr-day"><div class="lr-dayh"><b>${lcEsc(lrDay(d))}</b> <span class="slv-note">${lcNum(tot)} sent in ${rows.length} half-hour slot${rows.length === 1 ? '' : 's'}</span></div>
      ${rows.map(s => `<div class="lr-slot"><span class="lr-st">${s.t}</span><span class="lr-bar"><i style="width:${Math.max(2, 100 * s.n / max)}%"></i></span><span class="lr-sn">${lcNum(s.n)}</span></div>`).join('')}</div>`;
  }).join('');
}

function lrPaint() {
  const host = document.getElementById('lqHost');
  if (!host) return;
  if (lrErr || !lrSum) { host.innerHTML = `<p class="slv-muted">${lcEsc(lrErr || 'No report yet.')}</p>`; return; }
  const s = lrSum, t = s.totals || {}, byB = s.by_branch || [];
  const typeRows = LR_TYPES.map(([k, l]) => { const m = (s.by_type || []).find(x => x.k === k); return m ? lrRow(`<b>${lcEsc(l)}</b>`, m) : null; }).filter(Boolean);
  const waveRows = (s.by_wave || []).map(w => lrRow(`<b>Wave ${w.k || '?'}</b>`, w));
  const msgRows = (s.by_message || []).map(m => { const x = lrMsg(m.k); return lrRow(`${lcEsc(x.nm)} <span class="ll-tag">${lcEsc(x.arm)}</span>`, m); });
  const brRows = LR_BR.map(b => byB.find(x => x.k === b)).filter(Boolean).map(m => lrRow(lcEsc(LC_BRANCH[m.k] || m.k), m))
    .concat(byB.filter(x => !LR_BR.includes(x.k)).map(m => lrRow(lcEsc(m.k), m)));
  const dayRows = (s.by_day || []).map(d => lrRow(lcEsc(lrDay(d.k)), d));
  host.innerHTML = `
    <div class="ll-fresh">
      <span class="ll-chip">Real sends only, test messages are left out</span>
      <span class="ll-chip">Replies, STOP and blocked are read <b>each night</b></span>
      <span class="ll-chip">Report made <b>${lcEsc(lrTime(s.at))}</b></span>
      <button type="button" class="ll-chip lq-refresh" onclick="lrRenderPerf(true)" title="Ask again">Refresh</button>
    </div>
    <section class="lr-sec" id="lr-type"><div class="lr-dhd"><h3>Which message</h3>
      <div class="tp-seg" role="group" aria-label="Message">${[['all', 'All messages']].concat(LR_TYPES).map(([k, l]) => `<button type="button" class="${lrType === k ? 'on' : ''}" onclick="lrSetType('${k}')">${l}</button>`).join('')}</div></div>
      ${lrType === 'all' ? `${lrTable('Message', typeRows)}<p class="slv-note">Pick one above to see every number on this page for that message alone. Smoothing is groups 1 and 2, Colour is group 3, Due is everyone else. A client who was sent two different messages is counted under each.</p>`
        : `<p class="slv-note">Showing <b>${lcEsc(lrTypeName())}</b> only, everything below. Pick All messages to see the three together.</p>`}
    </section>
    <section class="lr-sec" id="lr-totals"><h3>The campaign so far${lrType === 'all' ? '' : `: ${lcEsc(lrTypeName())}`}</h3>${lrTiles(t)}</section>
    ${lrDel ? `<section class="lr-sec" id="lr-delivery">${lrDelInner()}</section>` : ''}
    ${lrDep ? `<section class="lr-sec" id="lr-deposits">${lrDepInner()}</section>` : ''}
    <section class="lr-sec" id="lr-waves"><h3>By wave</h3>${lrTable('Wave', waveRows)}</section>
    <section class="lr-sec" id="lr-messages"><h3>By message</h3>${lrTable('Message', msgRows)}</section>
    <section class="lr-sec" id="lr-branches"><h3>By branch</h3>${lrTable('Branch', brRows)}</section>
    <section class="lr-sec" id="lr-days"><h3>By day</h3>${lrTable('Day', dayRows)}</section>
    <section class="lr-sec" id="lr-slots"><h3>Send times</h3><p class="slv-note">How many went out in each half hour (Dubai time). The pace is set in Pace on the To message tab.</p>${lrSlots(s.by_slot || [])}</section>
    <section class="lr-sec" id="lr-log"><h3>Send log</h3>
      <div class="lc-tools ll-tools">
        <select class="ll-sel" aria-label="Wave" onchange="lrSet('wave',this.value)">${[['all', 'All waves'], ['1', 'Wave 1'], ['2', 'Wave 2'], ['3', 'Wave 3'], ['4', 'Wave 4']].map(([v, l]) => `<option value="${v}"${lrSel.wave === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <select class="ll-sel" aria-label="Branch" onchange="lrSet('branch',this.value)"><option value="all">All branches</option>${LR_BR.map(b => `<option value="${b}"${lrSel.branch === b ? ' selected' : ''}>${lcEsc(LC_BRANCH[b] || b)}</option>`).join('')}</select>
        <select class="ll-sel" aria-label="Status" onchange="lrSet('status',this.value)">${[['all', 'Every status'], ['sent', 'Sent'], ['queued', 'Queued'], ['failed', 'Failed'], ['skipped', 'Skipped']].map(([v, l]) => `<option value="${v}"${lrSel.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input type="search" class="ll-search" placeholder="Search name or last 4 digits" value="${lcEsc(lrSel.q)}" oninput="lrSearch(this.value)">
        <span style="flex:1"></span>
        <span class="lq-btns">
          <button type="button" class="tglr lc-btn" onclick="lrSaveLog('xlsx')" title="Download the log for these filters, with the message for each">XLSX</button>
          <button type="button" class="tglr lc-btn" onclick="lrSaveLog('csv')" title="Download the log for these filters, with the message for each">CSV</button>
        </span>
        <span id="lrNote" class="slv-note" style="display:inline"></span>
      </div>
      <div id="lrLog"></div>
    </section>`;
  lrPaintLog();
}

function lrStatus(r) {
  if (r.status === 'sent') return '<span class="ll-tag sent">Sent</span>';
  if (r.status === 'queued' || r.status === 'sending') return '<span class="ll-tag">Queued</span>';
  return `<span class="ll-tag lr-bad" title="${lcEsc(r.error || '')}">${r.status === 'failed' ? 'Failed' : 'Skipped'}</span>`;
}
function lrPaintLog() {
  const el = document.getElementById('lrLog');
  if (!el) return;
  const per = lrSel.per, pages = Math.max(1, Math.ceil(lrTotal / per)), p = Math.min(lrSel.page, pages);
  const rows = lrRowsPage.map(r => {
    const m = lrMsg(r.tkey), open = !!lrOpen[r.id], when = r.d ? `${lcEsc(lrDay(r.d))} <span class="lr-t">${lcEsc(r.t)}</span>` : `<span class="slv-note">queued ${lcEsc(r.qd || '')}</span>`;
    const flags = [r.replied ? '<span class="ll-tag sent">Replied</span>' : '', r.booked ? '<span class="ll-tag sent">Booked</span>' : '', r.stop ? '<span class="ll-tag lr-bad">STOP</span>' : '', r.blocked ? '<span class="ll-tag lr-bad">Blocked</span>' : ''].join('');
    return `<tr class="lr-row${open ? ' open' : ''}" onclick="lrToggle(${r.id})"><td>${when}</td><td>${r.wave || '–'}</td><td>${lcEsc(LC_BRANCH[r.branch] || r.branch)}</td>
      <td>${lcEsc(m.nm)} <span class="ll-tag">${lcEsc(m.arm)}</span></td><td>${lcEsc(r.client)} <span class="slv-note">…${lcEsc(r.last4)}</span></td><td>${lrStatus(r)}</td><td>${flags || '<span class="slv-muted">–</span>'}</td></tr>
      ${open ? `<tr class="lr-text"><td colspan="7"><div class="lq-bubble">${lcEsc(r.text || '')}</div>${r.error ? `<div class="slv-note lr-bad">${lcEsc(r.error)}</div>` : ''}<div class="slv-note">Template ${lcEsc(r.tkey)} · queued ${lcEsc(r.qd || '')}${r.by ? ' by ' + lcEsc(r.by) : ''}${r.message_id ? ' · respond.io message ' + lcEsc(r.message_id) : ''}</div></td></tr>` : ''}`;
  }).join('');
  const pager = pages > 1 ? `<div class="lr-pager"><button type="button" class="tglr lc-btn" ${p <= 1 ? 'disabled' : ''} onclick="lrGo(${p - 1})">‹ Prev</button>
    <span class="slv-note">Page ${lcNum(p)} of ${lcNum(pages)}</span><button type="button" class="tglr lc-btn" ${p >= pages ? 'disabled' : ''} onclick="lrGo(${p + 1})">Next ›</button></div>` : '';
  el.innerHTML = `<p class="slv-note">${lcNum(lrTotal)} message${lrTotal === 1 ? '' : 's'}${lrTotal ? `, newest first. Click a row to read what she was sent.` : ''}</p>
    ${lrTotal ? `<div class="lr-scroll"><table class="slv-table lr-tbl lr-logt"><thead><tr><th>Sent</th><th>Wave</th><th>Branch</th><th>Message</th><th>Client</th><th>Status</th><th>Since</th></tr></thead><tbody>${rows}</tbody></table></div>${pager}` : '<p class="slv-muted">Nothing matches these filters.</p>'}`;
}

// The whole log for the current filters, 500 at a time, with the text of each message.
async function lrSaveLog(kind) {
  if (typeof lgxBuild !== 'function') return;
  lrNote('Getting the log…');
  const out = [];
  for (let off = 0; ; off += 500) {
    const { data, error } = await lrFetchPage(off, 500);
    if (error || !data) { console.error(error); lrNote('The log did not download. Try again.'); return; }
    out.push(...(data.rows || []));
    lrNote(`Getting the log… ${lcNum(out.length)} of ${lcNum(data.total)}`);
    if (!data.rows || data.rows.length < 500 || out.length >= data.total) break;
  }
  const head = ['Date sent', 'Time sent (Dubai)', 'Wave', 'Branch', 'Message', 'Version', 'Template', 'Client', 'Phone (last 4)', 'Status', 'Error', 'Replied', 'Booked', 'STOP', 'Blocked', 'Message sent', 'Queued at', 'Queued by', 'respond.io message'];
  const yn = v => v ? 'Yes' : 'No';
  const lines = out.map(r => { const m = lrMsg(r.tkey);
    return [r.d || '', r.t || '', r.wave || '', LC_BRANCH[r.branch] || r.branch, m.nm, m.arm, r.tkey, r.client, r.last4, r.status, r.error || '', yn(r.replied), yn(r.booked), yn(r.stop), yn(r.blocked), r.text || '', r.qd || '', r.by || '', r.message_id || '']; });
  const built = lgxBuild({ sheets: [{ name: 'Send log', blocks: [{ cols: head.map(h => ({ label: h, fmt: 'text' })), rows: lines.map(l => ({ cells: l })) }] }] });
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = ['lost-clients-send-log', lrSel.wave !== 'all' ? 'wave-' + lrSel.wave : '', lrSel.branch !== 'all' ? slug(LC_BRANCH[lrSel.branch] || lrSel.branch) : '',
    lrType !== 'all' ? lrType : '', lrSel.status !== 'all' ? lrSel.status : '', lrSel.q.trim() ? 'search' : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  lrNote(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}
