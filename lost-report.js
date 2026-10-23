// Lost Clients, Performance report tab (Kate, 16 Oct 2026): the record of what the site sent through respond.io, when, and what came of it.
// Numbers from lost_send_report_get() and the log from lost_send_log_get() (migrations/lost_send_report.sql), Level 2 and above (migrations/lost_performance_report_level2.sql, 19 Oct 2026).
// Replied, STOP and blocked come from lost_wa_status, which respond-status-sync refreshes each night, so they run up to a day behind; booked is a booking
// from today on in client_bookings. The page keeps its own copy only while it is open: Refresh asks again.
//
// The money (Kate, 22 Oct 2026): a Spent card in The campaign so far and the Money from the bookings section, both from lost_campaign_money()
// (migrations/lost_campaign_money.sql, Level 3 and above, so a Level 2 reader gets no card and no section). Spend on the blast is an estimate
// (messages sent times a rate), projected spend prices each booked service at what it really charged lately, actual spend is what the clients
// we messaged have paid since.
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
// The money, by the same rule: null until lost_campaign_money is live (or for Level 2), the Spent card and the section stay out.
let lrMoney = null, lrMoneyView = 'visual';
try { if (localStorage.getItem('lr-money-view') === 'table') lrMoneyView = 'table'; } catch (e) {}
let lrSel = { wave: 'all', branch: 'all', status: 'all', q: '', page: 1, per: 10 };   // Kate, 23 Oct 2026: ten rows to start, then 20, 50, 100
// One message at a time (Kate, 19 Oct 2026): the whole report, the Booked and deposit and delivery sections and the log can be cut to Smoothing,
// Colour or Due (migrations/lost_report_by_type.sql). 'all' sends no argument, so the page still works before that migration is live.
let lrType = 'all';
const LR_TYPES = [['smoothing', 'Smoothing'], ['colour', 'Colour'], ['due', 'Due (the reminder)']];
const lrArgs = () => lrType === 'all' ? undefined : { p_type: lrType };
const lrTypeName = () => (LR_TYPES.find(t => t[0] === lrType) || [, ''])[1];

const LR_BR = ['SAA', 'KCA', 'MC', 'AQ'];
const lrPct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';
const lrAed = n => 'AED ' + lcNum(Math.round(+n || 0));
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
    const [s, l, dp, dl, mo] = await Promise.all([sb.rpc('lost_send_report_get', lrArgs()), lrFetchPage(), sb.rpc('lost_booked_deposits', lrArgs()), sb.rpc('lost_delivery_report', lrArgs()), sb.rpc('lost_campaign_money', lrArgs())]);
    if (s.error || !s.data) throw s.error || new Error('no report');
    lrSum = s.data;
    lrDep = (!dp.error && dp.data && dp.data.total) ? dp.data : null;   // optional: the report still draws without it
    if (dp.error) console.warn('lost_booked_deposits', dp.error);
    lrDel = (!dl.error && dl.data && dl.data.total) ? dl.data : null;   // optional too
    if (dl.error) console.warn('lost_delivery_report', dl.error);
    lrMoney = (!mo.error && mo.data && mo.data.cost) ? mo.data : null;   // optional too
    if (mo.error && !/Level 3/.test(mo.error.message || '')) console.warn('lost_campaign_money', mo.error);
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
function lrPer(v) { lrSel.per = [10, 20, 50, 100].includes(+v) ? +v : 10; lrSel.page = 1; lrOpen = {}; lrRefreshLog(); }
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
  const card = (n, ti, d, cls) => `<div class="ll-card lr-card${cls ? ' ' + cls : ''}"><div class="ll-t">${ti}</div><div class="ll-n">${typeof n === 'string' ? n : lcNum(n)}</div><div class="ll-d">${d}</div></div>`;
  const m = lrMoney, perBooked = m && m.booked && m.booked.clients ? ` (${lrAed(m.cost.aed / m.booked.clients)} per client booked)` : '';
  return `<div class="ll-cards lr-cards">
    ${card(t.sent, 'Sent', t.first ? `${lcEsc(lrTime(t.first))} to ${lcEsc(lrTime(t.last))}` : 'nothing sent yet')}
    ${card(t.replied, 'Replied', `${lrPct(t.replied, t.sent)} of those sent wrote back. A STOP is counted under STOP, not here.`)}
    ${lrDep ? card(lrDep.total.booked, 'Clients booked', 'Clients with an appointment from today on, each counted once.')
      : card(t.booked, 'Booked', `${lrPct(t.booked, t.sent)} have a booking from today on`)}
    ${lrDep && lrDep.total.appts != null ? card(lrDep.total.appts, 'Appointments booked', 'Appointments from today on. A client can book more than one, so this is higher than the number of clients.')
      : ''}
    ${card(t.stop, 'STOP', `${lrPct(t.stop, t.sent)} asked us to stop. Aim to stay under 2%.`, t.sent && t.stop / t.sent > 0.02 ? 'lr-warn' : '')}
    ${card(t.failed, 'Failed', `${lrPct(t.failed, t.n - t.queued)} of the messages we tried to send did not go through. Aim to stay under 5%.`, t.failed ? 'lr-warn' : '')}
    ${card(t.queued, 'Still queued', 'waiting for the next send window')}
    ${m ? card(lrAed(m.cost.aed), 'Spent (estimate)', `${lcNum(m.cost.sent)} messages at AED ${(+m.rate).toFixed(2)} each${perBooked}. Meta's invoice has the exact figure.`) : ''}
  </div>${lrDep ? '<p class="slv-note">These are clients we messaged who have an appointment from today on. She may have booked before our message or at the chair; Phorest does not record that.</p>' : ''}`;
}
// Booked, by deposit (Kate, 18 Oct 2026): of the clients who booked after our message, who has paid a deposit, who has not, and who
// comes today (no deposit needed). Visual by default, Table beside it like Comparison. Colours are the page's own: paid = --good,
// not paid yet = --accent, today = --muted2. Counted per client, so it can run under the Booked tile, which counts messages.
const LR_SOON = { 1: 'Tomorrow', 2: 'In 2 to 3 days', 3: 'In 4 to 7 days', 4: 'In 8 to 14 days', 5: 'Later' };
// Not paid yet, split by the deposit policy (Kate, 21 Oct 2026; migrations/lost_booked_deposits_policy.sql): need = the next appointment has a
// service the policy asks a deposit for (balayage, foils or highlights, all over colour, a restyle), none = a short service. Before that
// migration is live the function sends only unpaid, and the section draws as it did: pol is false.
const lrDepPol = d => d && d.total && d.total.need != null;
function lrDepWhy(svc) {
  const w = [];
  if (/balayage/i.test(svc)) w.push('Balayage');
  if (/foil|highlight/i.test(svc)) w.push('Foils');
  if (/all over colo/i.test(svc)) w.push('All over colour');
  if (/restyle/i.test(svc)) w.push('Restyle');
  if (/extension/i.test(svc)) w.push('Extensions');
  return w.join(', ');
}
// Every bar segment can be clicked, tapped or tabbed to for its value (Kate, 22 Oct 2026): a small label above it, "Khalifa City A: Deposit paid: 5 of 17 (29.4%)".
// The row's own name (branch, day, how soon) is read from the row when the label opens, so a segment only carries what it is and its count.
// Hover shows it too on a mouse; a click or tap keeps it open until the next click, a scroll or Escape.
function lrSegI(cls, label, n, tot, w, fmt) {
  const f = fmt || lcNum, tip = `${label}: ${f(n)}${tot ? ` of ${f(tot)} (${lrPct(n, tot)})` : ''}`;
  return `<i class="${cls}" style="width:${w}%" data-tip="${lcEsc(tip)}" tabindex="0" role="button" aria-label="${lcEsc(tip)}"></i>`;
}
let lrTipEl = null, lrTipPinned = null;
function lrTipHide() { if (lrTipEl) lrTipEl.remove(); lrTipEl = null; lrTipPinned = null; }
function lrTipShow(seg) {
  lrTipHide();
  const row = seg.closest('.lr-drow'), who = row && row.firstElementChild ? row.firstElementChild.textContent.trim() : '';
  const el = document.createElement('div');
  el.className = 'lr-tip'; el.setAttribute('role', 'status');
  el.textContent = (who ? who + ': ' : '') + seg.dataset.tip;
  document.body.appendChild(el);
  const r = seg.getBoundingClientRect(), tw = el.offsetWidth, th = el.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
  el.style.left = left + 'px';
  el.style.top = (r.top - th - 8 < 8 ? r.bottom + 8 : r.top - th - 8) + 'px';
  lrTipEl = el;
}
document.addEventListener('click', e => {
  const seg = e.target.closest && e.target.closest('.lr-dbar i[data-tip]');
  if (!seg) { lrTipHide(); return; }
  if (lrTipPinned === seg) { lrTipHide(); return; }
  lrTipShow(seg); lrTipPinned = seg;
});
document.addEventListener('mouseover', e => { const seg = e.target.closest && e.target.closest('.lr-dbar i[data-tip]'); if (seg && !lrTipPinned) lrTipShow(seg); });
document.addEventListener('mouseout', e => { if (!lrTipPinned && e.target.closest && e.target.closest('.lr-dbar i[data-tip]')) lrTipHide(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { lrTipHide(); return; }
  const seg = e.target.closest && e.target.closest('.lr-dbar i[data-tip]');
  if (seg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (lrTipPinned === seg) lrTipHide(); else { lrTipShow(seg); lrTipPinned = seg; } }
});
window.addEventListener('scroll', lrTipHide, { passive: true });
function lrDepBar(m, scale) {
  const w = k => m.booked ? (100 * (m[k] || 0) / m.booked) : 0, seg = (cls, k, label) => lrSegI(cls, label, m[k] || 0, m.booked, w(k));
  const tail = m.need != null ? seg('d-none', 'none', 'Short service, none needed') + seg('d-need', 'need', 'Likely needed, not paid') : seg('d-unpaid', 'unpaid', 'Not paid yet');
  return `<span class="lr-dbar" style="width:${Math.max(4, scale)}%">${seg('d-paid', 'paid', 'Deposit paid')}${seg('d-today', 'today', 'Today, none needed')}${tail}</span>`;
}
function lrDepVisual(d) {
  const t = d.total, by = d.by_branch || [], pol = lrDepPol(d), soon = (pol ? d.soon_need : d.soon) || [], maxB = Math.max(1, ...by.map(b => b.booked)), maxS = Math.max(1, ...soon.map(s => s.n));
  const card = (n, ti, ds, cls) => `<div class="ll-card lr-card${cls ? ' ' + cls : ''}"><div class="ll-t">${ti}</div><div class="ll-n">${lcNum(n)}</div><div class="ll-d">${ds}</div></div>`;
  const key = pol
    ? '<div class="lr-dkey"><span><i class="d-paid"></i>Deposit paid</span><span><i class="d-today"></i>Today, none needed</span><span><i class="d-none"></i>Short service, none needed</span><span><i class="d-need"></i>Likely needed, not paid</span></div>'
    : '<div class="lr-dkey"><span><i class="d-paid"></i>Deposit paid</span><span><i class="d-today"></i>Today, none needed</span><span><i class="d-unpaid"></i>Not paid yet</span></div>';
  const cards = pol
    ? `${card(t.booked, 'Clients booked', t.appts != null ? `${lcNum(t.appts)} appointments from today on` : 'clients with a booking from today on')}
      ${card(t.paid, 'Deposit paid', lrPct(t.paid, t.booked) + ' of the booked')}
      ${card(t.need, 'Deposit likely needed', 'not paid yet: balayage, foils, all over colour or a restyle', 'lr-need')}
      ${card(t.none + t.today, 'No deposit needed', `by policy: ${lcNum(t.none)} short service, ${lcNum(t.today)} come today`)}`
    : `${card(t.booked, 'Clients booked', t.appts != null ? `${lcNum(t.appts)} appointments from today on` : 'clients with a booking from today on')}
      ${card(t.paid, 'Deposit paid', lrPct(t.paid, t.booked) + ' of the booked')}
      ${card(t.unpaid, 'Not paid yet', 'no deposit in Phorest yet')}
      ${card(t.today, 'Today', 'booked for today, no deposit needed')}`;
  return `<div class="ll-cards lr-cards">
      ${cards}
    </div>
    <div class="lr-dgrid">
      <div class="lr-dcard"><h4>By branch</h4>
        ${by.map(b => `<div class="lr-drow"><span>${lcEsc(LC_BRANCH[b.k] || b.k)}</span>${lrDepBar(b, 100 * b.booked / maxB)}<b>${lcNum(b.booked)}</b></div>`).join('') || '<p class="slv-muted">Nobody yet.</p>'}
        ${key}</div>
      <div class="lr-dcard"><h4>${pol ? 'Likely needed, not paid' : 'Not paid yet'}: how soon they come</h4>
        ${soon.map(s => `<div class="lr-drow"><span>${LR_SOON[s.k] || s.k}</span><span class="lr-dbar" style="width:${Math.max(4, 100 * s.n / maxS)}%">${lrSegI(pol ? 'd-need' : 'd-unpaid', pol ? 'Likely needed, not paid' : 'Not paid yet', s.n, 0, 100)}</span><b>${lcNum(s.n)}</b></div>`).join('') || `<p class="slv-muted">${pol ? 'Nobody is waiting on a deposit.' : 'Everyone has paid, or comes today.'}</p>`}
        <p class="slv-note">${pol ? 'These are the ones reception can chase today. Check at the chair first: a client who booked her next visit before leaving the salon does not need one.' : 'The ones coming tomorrow or the day after are the ones reception can chase today.'}</p></div>
    </div>`;
}
function lrDepTable(d) {
  const t = d.total, by = d.by_branch || [], who = d.who || [], pol = lrDepPol(d), ap = t.appts != null;
  const apH = ap ? '<th>Appointments</th>' : '', apC = m => ap ? `<td>${lcNum(m.appts)}</td>` : '';
  const tag = (c, x) => `<span class="lr-dtag${c ? ' ' + c : ''}">${x}</span>`;
  const stTxt = w => w.status === 'paid' ? tag('paid', `Paid (AED ${lcNum(Math.round(w.deposit))})`) : w.status === 'today' ? tag('', 'Today, none needed')
    : !pol ? 'Not paid yet' : w.st === 'need' ? tag('need', 'Likely needed, not paid') : tag('', 'None needed, short service');
  const head = pol ? '<th>Branch</th><th>Clients booked</th>' + apH + '<th>Deposit paid</th><th>Likely needed, not paid</th><th>None needed, short service</th><th>Today, none needed</th>'
    : '<th>Branch</th><th>Clients booked</th>' + apH + '<th>Deposit paid</th><th>Today, none needed</th><th>Not paid yet</th>';
  const cells = m => pol ? `<td>${lcNum(m.booked)}</td>${apC(m)}<td>${lcNum(m.paid)}</td><td>${lcNum(m.need)}</td><td>${lcNum(m.none)}</td><td>${lcNum(m.today)}</td>`
    : `<td>${lcNum(m.booked)}</td>${apC(m)}<td>${lcNum(m.paid)}</td><td>${lcNum(m.today)}</td><td>${lcNum(m.unpaid)}</td>`;
  return `<div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr>${head}</tr></thead><tbody>
      ${by.map(b => `<tr><td>${lcEsc(LC_BRANCH[b.k] || b.k)}</td>${cells(b)}</tr>`).join('')}
      <tr><td><b>All</b></td>${cells(t).replace(/<td>(.*?)<\/td>/g, '<td><b>$1</b></td>')}</tr></tbody></table></div>
    <h4 class="lr-dh">Who</h4>
    <div class="lr-scroll"><table class="slv-table lr-tbl lr-logt"><thead><tr><th>Client</th><th>Branch</th><th>Next appointment</th>${ap ? '<th>Appointments</th>' : ''}${pol ? '<th>Service booked</th>' : ''}<th>Deposit</th>${pol ? '<th>Why</th>' : ''}</tr></thead><tbody>
      ${who.map(w => `<tr><td>${lcEsc(w.name || '')}</td><td>${lcEsc(LC_BRANCH[w.branch] || w.branch)}</td><td>${lcEsc(lrDay(w.next))}</td>${ap ? `<td>${lcNum(w.n)}</td>` : ''}${pol ? `<td class="lr-dsvc">${lcEsc(w.svc || '')}</td>` : ''}<td>${stTxt(w)}</td>${pol ? `<td>${w.st === 'need' ? lcEsc(lrDepWhy(w.svc || '')) : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
function lrDepInner() {
  const d = lrDep;
  if (!d) return '';
  const tbl = lrDepView === 'table';
  return `<div class="lr-dhd"><h3>Booked: who has paid a deposit</h3>
      <div class="tp-seg" role="group" aria-label="View"><button type="button" class="${tbl ? '' : 'on'}" onclick="lrDepSet('visual')">Visual</button><button type="button" class="${tbl ? 'on' : ''}" onclick="lrDepSet('table')">Table</button></div></div>
    <p class="slv-note">Clients we messaged who now have a visit booked, and whether her deposit is in.</p>
    ${d.total.booked ? (tbl ? lrDepTable(d) : lrDepVisual(d)) : '<p class="slv-muted">Nobody has booked from today on yet.</p>'}
    <p class="slv-note">For example: a client has balayage booked for Thursday and no deposit shows in Phorest. She reads Likely needed, so reception messages her before then.</p>
    <p class="slv-note">Deposits arrive with the nightly sales upload, so one paid today shows tomorrow.</p>
    <details class="lr-fold"><summary>How this is worked out</summary>
      <p class="slv-note">Paid: the Deposit item in Phorest, after refunds, in the last 90 days, matched on the client's name. Counted once per client.</p>
      ${lrDepPol(d) ? '<p class="slv-note">Likely needed: the Booking and Deposit policy (existing client) asks for a deposit on balayage, foils or highlights, an all over colour or a restyle. If her next appointment has one of those and no deposit is in Phorest, she reads Likely needed. Any other service reads None needed.</p><p class="slv-note">Phorest cannot show an appointment over two hours, several guests, a missed or changed visit, or a next visit booked at the chair (that one needs no deposit). Check those at the desk.</p>' : ''}
    </details>`;
}
function lrDepSet(v) {
  lrDepView = v === 'table' ? 'table' : 'visual';
  try { localStorage.setItem('lr-dep-view', lrDepView); } catch (e) {}
  const el = document.getElementById('lr-deposits');
  if (el) el.innerHTML = lrDepInner();
}
// Money from the bookings (Kate, 22 Oct 2026): what the blast cost, what the clients who booked are worth, and what the clients we messaged have really spent
// since. Visual by default, Table beside it. Projected = --accent, actual = --good (the page's own, like the deposit bars). All AED, VAT included.
// lost_campaign_money explains each number; the notes under the section say the same in plain words.
const LR_SPLIT = [['hair_services', 'Hair services', 'colour, cut and extensions'], ['hair_treat', 'Hair treatments', 'treatments'], ['beauty_services', 'Beauty services', 'beauty and nails'], ['retail_hair', 'Hair retail', 'shampoo, treatments, styling and tools'], ['retail_beauty', 'Beauty retail', 'skincare, lashes and nails'], ['retail', 'Retail', 'products, hair and beauty together'], ['other', 'Other', 'consultations and anything not sorted yet']];
// Retail is two lines (Hair retail, Beauty retail) once lost_campaign_money gives retail_hair; before that it is the one Retail line.
const lrSplitRows = a => LR_SPLIT.filter(([k]) => k === 'other' ? a.other : k === 'retail' ? a.retail_hair == null : (k === 'retail_hair' || k === 'retail_beauty') ? a.retail_hair != null : true);
function lrMoneyVisual(m) {
  const b = m.booked, a = m.actual, by = m.by_branch || [];
  const maxP = Math.max(1, ...by.map(x => x.proj)), maxA = Math.max(1, ...by.map(x => x.actual));
  const card = (n, ti, ds) => `<div class="ll-card lr-card"><div class="ll-t">${ti}</div><div class="ll-n">${n}</div><div class="ll-d">${ds}</div></div>`;
  const key = '<div class="lr-dkey"><span><i class="d-unpaid"></i>Projected (booked from today on)</span><span><i class="d-paid"></i>Actual (spent since our message)</span></div>';
  const brow = (x, k, max, cls) => `<div class="lr-drow lr-drow2"><span>${lcEsc(LC_BRANCH[x.k] || x.k)}</span><span class="lr-dbar" style="width:${Math.max(4, 100 * x[k] / max)}%">${lrSegI(cls, k === 'proj' ? 'Projected' : 'Actual', x[k], 0, 100, lrAed)}</span><b>${lrAed(x[k])}</b></div>`;
  return `<div class="ll-cards lr-cards">
      ${card(lrAed(b.proj), 'Projected spend', `${lcNum(b.clients)} clients booked, ${lcNum(b.appts)} appointments from today on`)}
      ${card(lrAed(b.clients ? b.proj / b.clients : 0), 'Average projected per client', `${lrAed(b.appts ? b.proj / b.appts : 0)} per appointment`)}
      ${card(lrAed(a.total), 'Actual spend so far', `${lcNum(a.visited)} of the ${lcNum(a.messaged)} we messaged have paid for something since`)}
    </div>
    <h4 class="lr-dh">Actual spend, by what they bought</h4>
    <div class="ll-cards lr-cards">
      ${lrSplitRows(a).map(([k, l, d]) => card(lrAed(a[k]), l, `${a.total ? lrPct(a[k], a.total) + ' of the actual, ' : ''}${d}`)).join('')}
    </div>
    <div class="lr-dgrid">
      <div class="lr-dcard"><h4>Projected spend by branch</h4>${by.filter(x => x.booked).map(x => brow(x, 'proj', maxP, 'd-unpaid')).join('') || '<p class="slv-muted">Nobody yet.</p>'}</div>
      <div class="lr-dcard"><h4>Actual spend by branch</h4>${by.filter(x => x.visited).map(x => brow(x, 'actual', maxA, 'd-paid')).join('') || '<p class="slv-muted">Nobody yet.</p>'}${key}</div>
    </div>`;
}
function lrMoneyTable(m) {
  const b = m.booked, a = m.actual, by = m.by_branch || [];
  const row = (label, x, bold) => { const f = v => bold ? `<b>${v}</b>` : v; return `<tr><td>${f(label)}</td><td>${f(lcNum(x.sent))}</td><td>${f(lrAed(x.cost))}</td><td>${f(lcNum(x.booked))}</td><td>${f(lcNum(x.appts))}</td><td>${f(lrAed(x.proj))}</td><td>${f(x.booked ? lrAed(x.proj / x.booked) : '–')}</td><td>${f(lcNum(x.visited))}</td><td>${f(lrAed(x.actual))}</td></tr>`; };
  const all = { sent: m.cost.sent, cost: m.cost.aed, booked: b.clients, appts: b.appts, proj: b.proj, visited: a.visited, actual: a.total };
  return `<div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr><th>Branch</th><th>Sent</th><th>Spent (estimate)</th><th>Clients booked</th><th>Appointments</th><th>Projected spend</th><th>Projected per client</th><th>Came in</th><th>Actual spend</th></tr></thead><tbody>
      ${by.map(x => row(lcEsc(LC_BRANCH[x.k] || x.k), x)).join('')}${row('All', all, true)}</tbody></table></div>
    <h4 class="lr-dh">Actual spend, by what they bought</h4>
    <div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr><th>What</th><th>Actual spend</th><th>Share</th></tr></thead><tbody>
      ${lrSplitRows(a).map(([k, l]) => `<tr><td>${l}</td><td>${lrAed(a[k])}</td><td>${lrPct(a[k], a.total)}</td></tr>`).join('')}
      <tr><td><b>All</b></td><td><b>${lrAed(a.total)}</b></td><td><b>${a.total ? '100.0%' : '–'}</b></td></tr></tbody></table></div>`;
}
function lrMoneyInner() {
  const m = lrMoney;
  if (!m) return '';
  const tbl = lrMoneyView === 'table', b = m.booked, unp = b.unpriced || 0;
  return `<div class="lr-dhd"><h3>Money from the bookings</h3>
      <div class="tp-seg" role="group" aria-label="View"><button type="button" class="${tbl ? '' : 'on'}" onclick="lrMoneySet('visual')">Visual</button><button type="button" class="${tbl ? 'on' : ''}" onclick="lrMoneySet('table')">Table</button></div></div>
    ${tbl ? lrMoneyTable(m) : lrMoneyVisual(m)}
    <p class="slv-note">What the bookings are worth, and what the messages cost.</p>
    <p class="slv-note"><b>Projected</b> is what the booked appointments should bring in. <b>Actual</b> is what the clients we messaged have paid so far. <b>Spent</b> is what the messages cost, an estimate at AED ${(+m.rate).toFixed(2)} each.</p>
    <p class="slv-note">A booking or a visit may not be because of our message: she may have booked before it, or been coming anyway.</p>
    <details class="lr-fold"><summary>How these are worked out</summary>
      <p class="slv-note"><b>Projected</b> prices each service on the booked appointments from today on at the median of what that service charged in the last 120 days, VAT included. ${unp ? `${lcNum(unp)} of the ${lcNum(b.svcs)} booked services have no price yet (a package or a free item) and count as 0, so it runs low.` : ''}</p>
      <p class="slv-note"><b>Actual</b> is everything the clients we messaged have paid since their first message, VAT included, refunds taken off, without deposits, vouchers and courses sold. It also counts clients who came in and have no booking left. Sales arrive with the nightly upload, so today shows tomorrow.</p>
    </details>`;
}
function lrMoneySet(v) {
  lrMoneyView = v === 'table' ? 'table' : 'visual';
  try { localStorage.setItem('lr-money-view', lrMoneyView); } catch (e) {}
  const el = document.getElementById('lr-money');
  if (el) el.innerHTML = lrMoneyInner();
}
// Did our message arrive? (Kate, 18 Oct 2026). respond.io's delivery status of each message we sent, kept by the nightly sync: seen (read),
// delivered but not read, or accepted but not delivered yet. The failed count is left off the page on purpose (Kate, 21 Oct 2026): it read like our send had
// failed when it is WhatsApp's own status on a message we did send. Visual by default, Table beside it.
// Colours are the page's own: seen = --good, delivered = --accent, not yet = --muted2. Counted per message sent.
const LR_DKEYS = [['seen', 'Seen', 'd-seen'], ['delivered', 'Delivered only', 'd-delivered'], ['sent_only', 'Not delivered yet', 'd-sentonly']];
function lrDelBar(m, scale) {
  const w = k => m.sent ? (100 * (m[k] || 0) / m.sent) : 0;
  return `<span class="lr-dbar" style="width:${Math.max(4, scale)}%">${LR_DKEYS.map(([k, l, c]) => lrSegI(c, l, m[k] || 0, m.sent, w(k))).join('')}</span>`;
}
function lrDelVisual(d) {
  const t = d.total, by = d.by_branch || [], days = d.by_day || [], maxD = Math.max(1, ...days.map(x => x.sent));
  const card = (n, ti, ds, cls) => `<div class="ll-card lr-card${cls ? ' ' + cls : ''}"><div class="ll-t">${ti}</div><div class="ll-n">${lcNum(n)}</div><div class="ll-d">${ds}</div></div>`;
  const key = `<div class="lr-dkey">${LR_DKEYS.map(([, l, c]) => `<span><i class="${c}"></i>${l}</span>`).join('')}</div>`;
  return `<div class="ll-cards lr-cards">
      ${card(t.seen, 'Seen', lrPct(t.seen, t.sent) + ' of the sent were read')}
      ${card(t.delivered, 'Delivered only', lrPct(t.delivered, t.sent) + ', arrived but not read yet')}
      ${card(t.sent_only, 'Not delivered yet', 'accepted, no delivery report yet')}
    </div>
    <div class="lr-dgrid">
      <div class="lr-dcard"><h4>By branch</h4>
        ${by.map(b => `<div class="lr-drow lr-drow2"><span>${lcEsc(LC_BRANCH[b.k] || b.k)}</span>${lrDelBar(b, 100)}<b>${lcNum(b.sent)} sent</b></div>`).join('') || '<p class="slv-muted">Nothing sent yet.</p>'}
        ${key}</div>
      <div class="lr-dcard"><h4>By day sent</h4>
        ${days.map(x => `<div class="lr-drow lr-drow2"><span>${lcEsc(lrDay(x.k))}</span>${lrDelBar(x, 100 * x.sent / maxD)}<b>${lcNum(x.sent)}</b></div>`).join('') || '<p class="slv-muted">Nothing sent yet.</p>'}
        <p class="slv-note">Each bar is a day: its length is how many went out, the colours are what happened to them. A blank part has no delivery result yet.</p></div>
    </div>`;
}
function lrDelTable(d) {
  const t = d.total, by = d.by_branch || [], days = d.by_day || [];
  const row = (label, m, bold) => { const b = v => bold ? `<b>${v}</b>` : v; return `<tr><td>${b(label)}</td><td>${b(lcNum(m.sent))}</td><td>${b(lcNum(m.seen))}</td><td>${b(lcNum(m.delivered))}</td><td>${b(lcNum(m.sent_only))}</td></tr>`; };
  const head = first => `<thead><tr><th>${first}</th><th>Sent</th><th>Seen</th><th>Delivered only</th><th>Not delivered yet</th></tr></thead>`;
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
    <p class="slv-note">Whether the messages reached the phones: seen, delivered, or not delivered yet.</p>
    ${d.total.sent ? (tbl ? lrDelTable(d) : lrDelVisual(d)) : '<p class="slv-muted">Nothing sent yet.</p>'}
    <details class="lr-fold"><summary>How this is counted</summary><p class="slv-note">From respond.io's delivery report for each message, read each night, so a message sent today shows its result tomorrow. A client who replied still counts by what happened to the message.${unk ? ` ${lcNum(unk)} sent message${unk === 1 ? ' has' : 's have'} no report yet and ${unk === 1 ? 'is' : 'are'} left out of the bars.` : ''}</p></details>`;
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

// Sub-entries under Performance report in the "On this page" rail (Kate, 21 Oct 2026): the report runs for several screens, so each of its
// sections gets a link under the Performance report entry. Drawn only in the sidebar rail (lost-queue.css shows them from 1400px; below
// that the rail is a row of chips), removed when another tab opens (lqShowTab) and redrawn on every paint, so a section that is not
// there (no delivery or deposit data yet) has no link. The lit entry follows the scroll.
const LR_SUBS = [['lr-type', 'Which message'], ['lr-totals', 'The campaign so far'], ['lr-delivery', 'Did the message arrive?'], ['lr-deposits', 'Bookings and deposits'], ['lr-money', 'Money from the bookings'],
  ['lr-waves', 'By wave'], ['lr-messages', 'By message'], ['lr-branches', 'By branch'], ['lr-days', 'By day'], ['lr-slots', 'Send times'], ['lr-log', 'Send log']];
let lrSpy = null;
function lrRailClear() {
  document.querySelectorAll('#lostListsContent .side-sub').forEach(n => n.remove());
  if (lrSpy) { window.removeEventListener('scroll', lrSpy); lrSpy = null; }
}
function lrGoSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function lrRailSubs() {
  lrRailClear();
  const a = document.querySelector('#lostListsContent .side-nav a[data-t="perf"]');
  const subs = LR_SUBS.filter(([id]) => document.getElementById(id));
  if (!a || !subs.length) return;
  const nav = document.createElement('div');
  nav.className = 'side-sub'; nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'Performance report sections');
  nav.innerHTML = subs.map(([id, l]) => `<a href="#${id}" data-s="${id}" onclick="event.preventDefault();lrGoSection('${id}')">${l}</a>`).join('');
  a.insertAdjacentElement('afterend', nav);
  // the lit entry is the last section whose top has passed just under the pinned header
  const spy = () => {
    let cur = subs[0][0];
    subs.forEach(([id]) => { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= 150) cur = id; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = subs[subs.length - 1][0];   // the end of the page lights the last one
    nav.querySelectorAll('a').forEach(x => x.classList.toggle('on', x.dataset.s === cur));
  };
  lrSpy = spy;   // ten getBoundingClientRect reads per scroll event, cheap enough without a throttle
  window.addEventListener('scroll', lrSpy, { passive: true });
  spy();
}
function lrPaint() {
  const host = document.getElementById('lqHost');
  if (!host) return;
  lrRailClear();
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
      <div class="tp-seg" role="group" aria-label="Message">${[['all', 'All']].concat(LR_TYPES.map(([k, l]) => [k, k === 'due' ? 'Due' : l])).map(([k, l]) => `<button type="button" class="${lrType === k ? 'on' : ''}" onclick="lrSetType('${k}')">${l}</button>`).join('')}</div></div>
      ${lrType === 'all' ? `<p class="slv-note">How the three messages compare. Pick one to see every number on this page for that message alone.</p>${lrTable('Message', typeRows)}<details class="lr-fold"><summary>How the three are made</summary><p class="slv-note">Smoothing is groups 1 and 2, Colour is group 3, Due is everyone else. A client who was sent two different messages is counted under each.</p></details>`
        : `<p class="slv-note">Showing <b>${lcEsc(lrTypeName())}</b> only, everything below. Pick All to see the three together.</p>`}
    </section>
    <section class="lr-sec" id="lr-totals"><h3>The campaign so far${lrType === 'all' ? '' : `: ${lcEsc(lrTypeName())}`}</h3><p class="slv-note">How many we sent and what came back.</p>${lrTiles(t)}</section>
    ${lrDel ? `<section class="lr-sec" id="lr-delivery">${lrDelInner()}</section>` : ''}
    ${lrDep ? `<section class="lr-sec" id="lr-deposits">${lrDepInner()}</section>` : ''}
    ${lrMoney ? `<section class="lr-sec" id="lr-money">${lrMoneyInner()}</section>` : ''}
    <section class="lr-sec" id="lr-waves"><h3>By wave</h3>${lrTable('Wave', waveRows)}</section>
    <section class="lr-sec" id="lr-messages"><h3>By message</h3>${lrTable('Message', msgRows)}</section>
    <section class="lr-sec" id="lr-branches"><h3>By branch</h3>${lrTable('Branch', brRows)}</section>
    <section class="lr-sec" id="lr-days"><h3>By day</h3>${lrTable('Day', dayRows)}</section>
    <section class="lr-sec" id="lr-slots"><h3>Send times</h3><p class="slv-note">When the messages went out, in half hours (Dubai time). To change the pace, use Pace on the To message tab.</p>${lrSlots(s.by_slot || [])}</section>
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
  lrRailSubs();
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
  // Prev and Next only when there is more than one page; the rows-a-page choice whenever the log is longer than the shortest page.
  const perSel = lrTotal > 10 ? `<select class="ll-sel" aria-label="Rows a page" onchange="lrPer(this.value)">${[10, 20, 50, 100].map(n => `<option value="${n}"${lrSel.per === n ? ' selected' : ''}>${n} rows</option>`).join('')}</select>` : '';
  const pager = lrTotal > 10 ? `<div class="lr-pager">${pages > 1 ? `<button type="button" class="tglr lc-btn" ${p <= 1 ? 'disabled' : ''} onclick="lrGo(${p - 1})">‹ Prev</button>
    <span class="slv-note">Page ${lcNum(p)} of ${lcNum(pages)}</span><button type="button" class="tglr lc-btn" ${p >= pages ? 'disabled' : ''} onclick="lrGo(${p + 1})">Next ›</button>` : ''}${perSel}</div>` : '';
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
