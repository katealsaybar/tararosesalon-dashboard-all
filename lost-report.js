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
// Booked since the message (lost_booked_since, migrations/lost_booked_since.sql): clients with a booking ahead plus the ones who already came in, so the
// count does not slide down as booked clients are seen. Null until the function is live: the tiles stay out.
let lrSince = null;
try { if (localStorage.getItem('lr-dep-view') === 'table') lrDepView = 'table'; } catch (e) {}
// Did our message arrive? (lost_delivery_report, migrations/lost_delivery_report.sql). Same: null until the function is live, the section stays out.
let lrDel = null, lrDelView = 'visual';
try { if (localStorage.getItem('lr-del-view') === 'table') lrDelView = 'table'; } catch (e) {}
// The money, by the same rule: null until lost_campaign_money is live (or for Level 2), the Spent card and the section stay out.
let lrMoney = null, lrMoneyView = 'visual';
// What it took to get a booking, day by day (Kate, 26 Oct 2026; lost_blast_record_get, migrations/lost_blast_record.sql, Level 3 and above). Null until the function is live.
let lrRec = null;
try { if (localStorage.getItem('lr-money-view') === 'table') lrMoneyView = 'table'; } catch (e) {}
let lrSel = { wave: 'all', branch: 'all', status: 'all', outcomes: [], after: 'all', q: '', page: 1, per: 10 };   // Kate, 23 Oct 2026: ten rows to start, then 20, 50, 100
// What came of each client (Kate, 26 Oct 2026, from Belle's review): the log's Outcome column and filter, and the names behind every number
// (lost_client_facts, lost_drill: migrations/lost_drill_outcomes.sql). Counts per outcome come back with every log page.
let lrOutcomes = {};
// The welcome-back terms (section 6): the appointment and the booking must both be on or before 31 Oct 2026. A client whose next appointment is later needs the exemption.
const LR_DEADLINE = '2026-10-31';
// The client's chat in respond.io (Kate, 26 Oct 2026): the contact id comes with each row (lost_wa_status). Space 250275.
const LR_RESP = 'https://app.respond.io/space/250275/inbox/';
// Name and number copy on click (Kate, 26 Oct 2026): the full number is shown, and clicking either one puts it on the clipboard.
const lrPhone = r => r.phone || ('…' + r.last4);
const lrWho = r => `<span class="lr-copy" role="button" tabindex="0" data-copy="${lcEsc(r.client)}" title="Click to copy the name" onclick="lrCopy(event,this)" onkeydown="lrCopyKey(event,this)">${lcEsc(r.client)}</span> <span class="lr-copy slv-note" role="button" tabindex="0" data-copy="${lcEsc(r.phone || '')}" title="Click to copy the number" onclick="lrCopy(event,this)" onkeydown="lrCopyKey(event,this)">${lcEsc(lrPhone(r))}</span>`;
async function lrCopy(e, el) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const txt = el.dataset.copy || '';
  if (!txt) return;
  let ok = false;
  // the old copy command first (it runs inside the click), then the clipboard API, which can wait on a permission and never answer
  try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (y) {}
  if (!ok) { try { await Promise.race([navigator.clipboard.writeText(txt), new Promise((_, no) => setTimeout(no, 800))]); ok = true; } catch (x) {} }
  const tip = document.createElement('div');
  tip.className = 'lr-tip'; tip.setAttribute('role', 'status'); tip.textContent = ok ? 'Copied: ' + txt : 'Could not copy';
  document.body.appendChild(tip);
  const r = el.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left)) + 'px';
  tip.style.top = Math.max(8, r.top - tip.offsetHeight - 6) + 'px';
  setTimeout(() => tip.remove(), 1300);
}
function lrCopyKey(e, el) { if (e.key === 'Enter' || e.key === ' ') lrCopy(e, el); }
const lrChat = cid => cid ? ` <a class="lr-chat" href="${LR_RESP}${+cid}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Open her chat in respond.io">Chat ↗</a>` : '';
const LR_OUT = { booked_nodep: ['Booked, no deposit needed', 'sent'], booked_dep: ['Booked, deposit needed', 'sent'], done: ['Done appointment', 'sent'],
  rescheduled: ['Rescheduled', ''], cancelled: ['Cancelled', 'lr-bad'], stop: ['STOP / opt out', 'lr-bad'] };
// The section in the address (Belle, 26 Oct 2026): the Performance report's sub-entries write #lr-money and so on, and a link that carries one opens there.
let lrCurSection = '';
const LR_HASH0 = (() => { try { return location.hash.replace(/^#/, ''); } catch (e) { return ''; } })();
let lrHashDone = false;
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
    const [s, l, dp, dl, mo, bs, rc] = await Promise.all([sb.rpc('lost_send_report_get', lrArgs()), lrFetchPage(), sb.rpc('lost_booked_deposits', lrArgs()), sb.rpc('lost_delivery_report', lrArgs()), sb.rpc('lost_campaign_money', lrArgs()), sb.rpc('lost_booked_since', lrArgs()), sb.rpc('lost_blast_record_get')]);
    if (s.error || !s.data) throw s.error || new Error('no report');
    lrSum = s.data;
    lrDep = (!dp.error && dp.data && dp.data.total) ? dp.data : null;   // optional: the report still draws without it
    if (dp.error) console.warn('lost_booked_deposits', dp.error);
    lrSince = (!bs.error && bs.data && bs.data.total) ? bs.data : null;   // optional too
    if (bs.error) console.warn('lost_booked_since', bs.error);
    lrDel = (!dl.error && dl.data && dl.data.total) ? dl.data : null;   // optional too
    if (dl.error) console.warn('lost_delivery_report', dl.error);
    lrMoney = (!mo.error && mo.data && mo.data.cost) ? mo.data : null;   // optional too
    if (mo.error && !/Level 3/.test(mo.error.message || '')) console.warn('lost_campaign_money', mo.error);
    lrRec = (!rc.error && rc.data && (rc.data.rows || []).length) ? rc.data : null;   // optional too
    if (rc.error && !/Level 3/.test(rc.error.message || '')) console.warn('lost_blast_record_get', rc.error);
    if (l.error || !l.data) throw l.error || new Error('no log');
    lrRowsPage = l.data.rows || []; lrTotal = l.data.total || 0; lrOutcomes = l.data.outcomes || {};
  } catch (e) { console.error(e); lrErr = 'The report did not load. Refresh to try again.'; }
  lrBusy = false;
}
function lrFetchPage(offset, limit) {
  return sb.rpc('lost_send_log_get', {
    p_wave: lrSel.wave === 'all' ? null : +lrSel.wave, p_branch: lrSel.branch, p_status: lrSel.status, p_q: lrSel.q.trim(),
    p_offset: offset != null ? offset : (lrSel.page - 1) * lrSel.per, p_limit: limit || lrSel.per, ...(lrType === 'all' ? {} : { p_type: lrType }),
    ...(lrSel.outcomes.length ? { p_outcome: lrSel.outcomes.join(',') } : {}),
    ...(lrSel.after === 'all' ? {} : { p_after: LR_DEADLINE, ...(lrSel.after === 'offer' ? { p_offer: true } : {}) }) });
}
async function lrRefreshLog() {
  const { data, error } = await lrFetchPage();
  if (error || !data) { console.error(error); lrNote('The log did not load. Try again.'); return; }
  lrRowsPage = data.rows || []; lrTotal = data.total || 0; lrOutcomes = data.outcomes || {};
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
// A number that opens the names behind it (Kate, 26 Oct 2026: "dapat pag ni click yung number mag ppop up yung details kung sinu sino sila"). The span carries what the
// number is (data-dm) and the row it sits in (wave, branch, message, day, type); lrDrillOpen asks lost_drill for the clients. Zero is plain text.
// ctx keys: w wave, b branch, t message (template key), d day, y message type.
function lrNum(n, metric, ctx, fmt) {
  const v = (fmt || lcNum)(n);
  if (!metric || !(+n > 0)) return v;
  const c = ctx || {};
  return `<span class="lr-num" role="button" tabindex="0" data-dm="${metric}"${['w', 'b', 't', 'd', 'y'].map(k => c[k] != null ? ` data-d${k}="${lcEsc(String(c[k]))}"` : '').join('')} title="See who">${v}</span>`;
}
function lrRow(label, m, ctx) {
  return `<tr><td>${label}</td><td>${lrNum(m.sent, 'sent', ctx)}</td><td>${lrNum(m.replied, 'replied', ctx)}</td><td>${lrPct(m.replied, m.sent)}</td><td>${lrNum(m.booked, 'booked', ctx)}</td>
    <td>${lrNum(m.stop, 'stop', ctx)}</td><td>${m.failed ? `<b class="lr-bad">${lrNum(m.failed, 'failed', ctx)}</b>` : '0'}</td><td>${lrNum(m.queued, 'queued', ctx)}</td><td class="lr-when">${lrTime(m.first)}</td><td class="lr-when">${lrTime(m.last)}</td></tr>`;
}
function lrTable(first, rows) {
  if (!rows.length) return '<p class="slv-muted">Nothing sent yet.</p>';
  return `<div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr><th>${first}</th>${LR_COLS.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function lrTiles(t) {
  const card = (n, ti, d, cls, met) => `<div class="ll-card lr-card${cls ? ' ' + cls : ''}"><div class="ll-t">${ti}</div><div class="ll-n">${typeof n === 'string' ? n : lrNum(n, met)}</div><div class="ll-d">${d}</div></div>`;
  const m = lrMoney, perBooked = m && m.booked && m.booked.clients ? ` (${lrAed(m.cost.aed / m.booked.clients)} per client booked)` : '';
  return `<div class="ll-cards lr-cards">
    ${card(t.sent, 'Sent', t.first ? `${lcEsc(lrTime(t.first))} to ${lcEsc(lrTime(t.last))}` : 'nothing sent yet', '', 'sent')}
    ${card(t.replied, 'Replied', `${lrPct(t.replied, t.sent)} of those sent wrote back. A STOP is counted under STOP, not here.`, '', 'replied')}
    ${lrDep ? card(lrDep.total.booked, 'Clients booked', 'Clients with an appointment from today on, each counted once.', '', 'booked')
      : card(t.booked, 'Booked', `${lrPct(t.booked, t.sent)} have a booking from today on`, '', 'booked')}
    ${lrDep && lrDep.total.appts != null ? card(lrDep.total.appts, 'Appointments booked', 'Appointments from today on. A client can book more than one, so this is higher than the number of clients.', '', 'appts')
      : ''}
    ${card(t.stop, 'STOP', `${lrPct(t.stop, t.sent)} asked us to stop. Aim to stay under 2%.`, t.sent && t.stop / t.sent > 0.02 ? 'lr-warn' : '', 'stop')}
    ${card(t.failed, 'Failed', `${lrPct(t.failed, t.n - t.queued)} of the messages we tried to send did not go through. Aim to stay under 5%.`, t.failed ? 'lr-warn' : '', 'failed')}
    ${card(t.queued, 'Still queued', 'waiting for the next send window', '', 'queued')}
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
  const card = (n, ti, ds, cls, met) => `<div class="ll-card lr-card${cls ? ' ' + cls : ''}"><div class="ll-t">${ti}</div><div class="ll-n">${lrNum(n, met)}</div><div class="ll-d">${ds}</div></div>`;
  const key = pol
    ? '<div class="lr-dkey"><span><i class="d-paid"></i>Deposit paid</span><span><i class="d-today"></i>Today, none needed</span><span><i class="d-none"></i>Short service, none needed</span><span><i class="d-need"></i>Likely needed, not paid</span></div>'
    : '<div class="lr-dkey"><span><i class="d-paid"></i>Deposit paid</span><span><i class="d-today"></i>Today, none needed</span><span><i class="d-unpaid"></i>Not paid yet</span></div>';
  const cards = pol
    ? `${card(t.booked, 'Clients booked', t.appts != null ? `${lcNum(t.appts)} appointments from today on` : 'clients with a booking from today on', '', 'booked')}
      ${card(t.paid, 'Deposit paid', lrPct(t.paid, t.booked) + ' of the booked', '', 'paid')}
      ${card(t.need, 'Deposit likely needed', 'not paid yet: balayage, foils, all over colour or a restyle', 'lr-need', 'need')}
      ${card(t.none + t.today, 'No deposit needed', `by policy: ${lcNum(t.none)} short service, ${lcNum(t.today)} come today`, '', 'nodep')}`
    : `${card(t.booked, 'Clients booked', t.appts != null ? `${lcNum(t.appts)} appointments from today on` : 'clients with a booking from today on', '', 'booked')}
      ${card(t.paid, 'Deposit paid', lrPct(t.paid, t.booked) + ' of the booked', '', 'paid')}
      ${card(t.unpaid, 'Not paid yet', 'no deposit in Phorest yet', '', 'unpaid')}
      ${card(t.today, 'Today', 'booked for today, no deposit needed', '', 'today')}`;
  return `<div class="ll-cards lr-cards">
      ${cards}
    </div>
    <div class="lr-dgrid">
      <div class="lr-dcard"><h4>By branch</h4>
        ${by.map(b => `<div class="lr-drow"><span>${lcEsc(LC_BRANCH[b.k] || b.k)}</span>${lrDepBar(b, 100 * b.booked / maxB)}<b>${lrNum(b.booked, 'booked', { b: b.k })}</b></div>`).join('') || '<p class="slv-muted">Nobody yet.</p>'}
        ${key}</div>
      <div class="lr-dcard"><h4>${pol ? 'Likely needed, not paid' : 'Not paid yet'}: how soon they come</h4>
        ${soon.map(s => `<div class="lr-drow"><span>${LR_SOON[s.k] || s.k}</span><span class="lr-dbar" style="width:${Math.max(4, 100 * s.n / maxS)}%">${lrSegI(pol ? 'd-need' : 'd-unpaid', pol ? 'Likely needed, not paid' : 'Not paid yet', s.n, 0, 100)}</span><b>${lcNum(s.n)}</b></div>`).join('') || `<p class="slv-muted">${pol ? 'Nobody is waiting on a deposit.' : 'Everyone has paid, or comes today.'}</p>`}
        <p class="slv-note">${pol ? 'These are the ones reception can chase today. Check at the chair first: a client who booked her next visit before leaving the salon does not need one.' : 'The ones coming tomorrow or the day after are the ones reception can chase today.'}</p></div>
    </div>`;
}
function lrDepTable(d) {
  const t = d.total, by = d.by_branch || [], who = d.who || [], pol = lrDepPol(d), ap = t.appts != null;
  const apH = ap ? '<th>Appointments</th>' : '', apC = (m, c) => ap ? `<td>${lrNum(m.appts, 'appts', c)}</td>` : '';
  const tag = (c, x) => `<span class="lr-dtag${c ? ' ' + c : ''}">${x}</span>`;
  const stTxt = w => w.status === 'paid' ? tag('paid', `Paid (AED ${lcNum(Math.round(w.deposit))})`) : w.status === 'today' ? tag('', 'Today, none needed')
    : !pol ? 'Not paid yet' : w.st === 'need' ? tag('need', 'Likely needed, not paid') : tag('', 'None needed, short service');
  const head = pol ? '<th>Branch</th><th>Clients booked</th>' + apH + '<th>Deposit paid</th><th>Likely needed, not paid</th><th>None needed, short service</th><th>Today, none needed</th>'
    : '<th>Branch</th><th>Clients booked</th>' + apH + '<th>Deposit paid</th><th>Today, none needed</th><th>Not paid yet</th>';
  const cells = (m, c) => pol ? `<td>${lrNum(m.booked, 'booked', c)}</td>${apC(m, c)}<td>${lrNum(m.paid, 'paid', c)}</td><td>${lrNum(m.need, 'need', c)}</td><td>${lrNum(m.none, 'none', c)}</td><td>${lrNum(m.today, 'today', c)}</td>`
    : `<td>${lrNum(m.booked, 'booked', c)}</td>${apC(m, c)}<td>${lrNum(m.paid, 'paid', c)}</td><td>${lrNum(m.today, 'today', c)}</td><td>${lrNum(m.unpaid, 'unpaid', c)}</td>`;
  return `<div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr>${head}</tr></thead><tbody>
      ${by.map(b => `<tr><td>${lcEsc(LC_BRANCH[b.k] || b.k)}</td>${cells(b, { b: b.k })}</tr>`).join('')}
      <tr><td><b>All</b></td>${cells(t).replace(/<td>(.*?)<\/td>/g, '<td><b>$1</b></td>')}</tr></tbody></table></div>
    <h4 class="lr-dh">Who</h4>
    <div class="lr-scroll"><table class="slv-table lr-tbl lr-logt"><thead><tr><th>Client</th><th>Branch</th><th>Next appointment</th>${ap ? '<th>Appointments</th>' : ''}${pol ? '<th>Service booked</th>' : ''}<th>Deposit</th>${pol ? '<th>Why</th>' : ''}</tr></thead><tbody>
      ${who.map(w => `<tr><td>${lcEsc(w.name || '')}</td><td>${lcEsc(LC_BRANCH[w.branch] || w.branch)}</td><td>${lcEsc(lrDay(w.next))}</td>${ap ? `<td>${lcNum(w.n)}</td>` : ''}${pol ? `<td class="lr-dsvc">${lcEsc(w.svc || '')}</td>` : ''}<td>${stTxt(w)}</td>${pol ? `<td>${w.st === 'need' ? lcEsc(lrDepWhy(w.svc || '')) : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
// Booked since the message (Kate, 26 Oct 2026): the Booked tiles below count a booking from today on, so a client leaves them once she has been in.
// This keeps her: booked ahead plus already came in (a sales line on or after our first message, deposits left out).
function lrSinceTiles(sc, tbl) {
  const t = sc.total, by = sc.by_branch || [];
  const card = (n, ti, ds, met) => `<div class="ll-card lr-card"><div class="ll-t">${ti}</div><div class="ll-n">${lrNum(n, met)}</div><div class="ll-d">${ds}</div></div>`;
  return `<div class="ll-cards lr-cards">
      ${card(t.since, 'Booked since the message', `${lrPct(t.since, t.sent)} of the ${lcNum(t.sent)} clients we messaged. Does not drop when they come in`, 'since')}
      ${card(t.ahead, 'Booked ahead', 'still has a booking from today on', 'ahead')}
      ${card(t.done, 'Already came in', 'visited since our message, nothing booked ahead', 'done')}
    </div>
    ${tbl ? `<div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr><th>Branch</th><th>Messaged</th><th>Booked since the message</th><th>Booked ahead</th><th>Already came in</th></tr></thead><tbody>
      ${by.map(b => `<tr><td>${lcEsc(LC_BRANCH[b.k] || b.k)}</td><td>${lcNum(b.sent)}</td><td>${lrNum(b.since, 'since', { b: b.k })}</td><td>${lrNum(b.ahead, 'ahead', { b: b.k })}</td><td>${lrNum(b.done, 'done', { b: b.k })}</td></tr>`).join('')}
      <tr><td><b>All</b></td><td><b>${lcNum(t.sent)}</b></td><td><b>${lcNum(t.since)}</b></td><td><b>${lcNum(t.ahead)}</b></td><td><b>${lcNum(t.done)}</b></td></tr></tbody></table></div>` : ''}
    <p class="slv-note">Counted per client from the first message sent to her (${lcEsc(lrDay(sc.first_send))} on). Came in means any sale line since then except a deposit, so it can include a walk-in who never booked ahead. Sales arrive with the nightly upload.</p>`;
}
function lrDepInner() {
  const d = lrDep;
  if (!d) return '';
  const tbl = lrDepView === 'table';
  return `<div class="lr-dhd"><h3>Booked: who has paid a deposit</h3>
      <div class="tp-seg" role="group" aria-label="View"><button type="button" class="${tbl ? '' : 'on'}" onclick="lrDepSet('visual')">Visual</button><button type="button" class="${tbl ? 'on' : ''}" onclick="lrDepSet('table')">Table</button></div></div>
    ${lrSince ? lrSinceTiles(lrSince, tbl) + '<h4 class="lr-dh">Booked ahead: who has paid a deposit</h4>' : ''}
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
    ${lrRecInner()}
    <p class="slv-note">What the bookings are worth, and what the messages cost.</p>
    <p class="slv-note"><b>Projected</b> is what the booked appointments should bring in. <b>Actual</b> is what the clients we messaged have paid so far. <b>Spent</b> is what the messages cost, an estimate at AED ${(+m.rate).toFixed(2)} each.</p>
    <p class="slv-note">A booking or a visit may not be because of our message: she may have booked before it, or been coming anyway.</p>
    <details class="lr-fold"><summary>How these are worked out</summary>
      <p class="slv-note"><b>Projected</b> prices each service on the booked appointments from today on at the median of what that service charged in the last 120 days, VAT included. ${unp ? `${lcNum(unp)} of the ${lcNum(b.svcs)} booked services have no price yet (a package or a free item) and count as 0, so it runs low.` : ''}</p>
      <p class="slv-note"><b>Actual</b> is everything the clients we messaged have paid since their first message, VAT included, refunds taken off, without deposits, vouchers and courses sold. It also counts clients who came in and have no booking left. Sales arrive with the nightly upload, so today shows tomorrow.</p>
    </details>`;
}
// What it took to get a booking: the day's totals saved each night, so the cost of a yes can be looked back on. "Booked since" counts a client once, her messages all count.
// How many messages each client was sent before she booked (or came in): the clients who booked since our message, split by how many messages she was sent.
function lrRecMsgs() {
  const m = (lrRec && lrRec.msgs || []).filter(x => x.n);
  const tot = m.reduce((a, x) => a + x.booked_since, 0);
  if (!tot) return '';
  const avg = m.reduce((a, x) => a + x.n * x.booked_since, 0) / tot;
  return `<h4 class="lr-dh">Messages before a yes</h4>
    <div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr><th>Messages she was sent</th><th>Clients</th><th>Booked or came in</th><th>Share who said yes</th></tr></thead><tbody>
      ${m.map(x => `<tr><td>${lcNum(x.n)} message${x.n === 1 ? '' : 's'}</td><td>${lcNum(x.clients)}</td><td>${lcNum(x.booked_since)}</td><td>${lrPct(x.booked_since, x.clients)}</td></tr>`).join('')}</tbody></table></div>
    <p class="slv-note">${lcNum(tot)} clients booked or came in since our message: on average ${avg.toFixed(2)} messages each. A client sent two messages is counted once, in the row for two. Her messages are the blast messages only, not what the team wrote to her afterwards.</p>`;
}
function lrRecInner() {
  const rows = lrRec && lrRec.rows || [];
  if (!rows.length) return '';
  const r = rows[0], f1 = v => v == null ? '–' : (+v).toFixed(1), aed2 = v => v == null ? '–' : 'AED ' + (+v).toFixed(2);
  const card = (n, ti, ds) => `<div class="ll-card lr-card"><div class="ll-t">${ti}</div><div class="ll-n">${n}</div><div class="ll-d">${ds}</div></div>`;
  return `<h4 class="lr-dh">What it took to get a booking</h4>
    <div class="ll-cards lr-cards">
      ${card(f1(r.messages_per_booking), 'Messages per booking', `${lcNum(r.sent)} messages sent for ${lcNum(r.booked_since)} clients who booked or came in since our message`)}
      ${card(aed2(r.cost_per_booking), 'Cost per booking', `${lrAed(r.cost_aed)} spent (estimate) over ${lcNum(r.booked_since)} clients`)}
      ${card(aed2(r.cost_per_ahead), 'Cost per booking ahead', `the same spend over the ${lcNum(r.booked_ahead)} clients with a booking from today on`)}
    </div>
    ${lrRecMsgs()}
    <div class="lr-scroll"><table class="slv-table lr-tbl"><thead><tr><th>Day</th><th>Messages sent</th><th>Spent (estimate)</th><th>Replied</th><th>STOP</th><th>Booked ahead</th><th>Booked since</th><th>Messages per booking</th><th>Cost per booking</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${lcEsc(lrDay(x.day))}</td><td>${lcNum(x.sent)}</td><td>${lrAed(x.cost_aed)}</td><td>${lcNum(x.replied)}</td><td>${lcNum(x.stop)}</td><td>${lcNum(x.booked_ahead)}</td><td>${lcNum(x.booked_since)}</td><td>${f1(x.messages_per_booking)}</td><td>${aed2(x.cost_per_booking)}</td></tr>`).join('')}</tbody></table></div>
    <p class="slv-note">Saved every night at midnight (Dubai), so you can see the cost of a booking come down as more clients say yes. Booked since is the clients with a booking from today on plus the ones who already came in after our message, each counted once. Spent is the estimate at AED ${(+r.rate).toFixed(2)} a message, and every message counts, including the second one some clients were sent.</p>`;
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
  const card = (n, ti, ds, cls, met) => `<div class="ll-card lr-card${cls ? ' ' + cls : ''}"><div class="ll-t">${ti}</div><div class="ll-n">${lrNum(n, met)}</div><div class="ll-d">${ds}</div></div>`;
  const key = `<div class="lr-dkey">${LR_DKEYS.map(([, l, c]) => `<span><i class="${c}"></i>${l}</span>`).join('')}</div>`;
  return `<div class="ll-cards lr-cards">
      ${card(t.seen, 'Seen', lrPct(t.seen, t.sent) + ' of the sent were read', '', 'seen')}
      ${card(t.delivered, 'Delivered only', lrPct(t.delivered, t.sent) + ', arrived but not read yet', '', 'delivered')}
      ${card(t.sent_only, 'Not delivered yet', 'accepted, no delivery report yet', '', 'sent_only')}
    </div>
    <div class="lr-dgrid">
      <div class="lr-dcard"><h4>By branch</h4>
        ${by.map(b => `<div class="lr-drow lr-drow2"><span>${lcEsc(LC_BRANCH[b.k] || b.k)}</span>${lrDelBar(b, 100)}<b>${lrNum(b.sent, 'sent', { b: b.k })} sent</b></div>`).join('') || '<p class="slv-muted">Nothing sent yet.</p>'}
        ${key}</div>
      <div class="lr-dcard"><h4>By day sent</h4>
        ${days.map(x => `<div class="lr-drow lr-drow2"><span>${lcEsc(lrDay(x.k))}</span>${lrDelBar(x, 100 * x.sent / maxD)}<b>${lrNum(x.sent, 'sent', { d: x.k })}</b></div>`).join('') || '<p class="slv-muted">Nothing sent yet.</p>'}
        <p class="slv-note">Each bar is a day: its length is how many went out, the colours are what happened to them. A blank part has no delivery result yet.</p></div>
    </div>`;
}
function lrDelTable(d) {
  const t = d.total, by = d.by_branch || [], days = d.by_day || [];
  const row = (label, m, bold, c) => { const b = v => bold ? `<b>${v}</b>` : v; return `<tr><td>${b(label)}</td><td>${b(lrNum(m.sent, 'sent', c))}</td><td>${b(lrNum(m.seen, 'seen', c))}</td><td>${b(lrNum(m.delivered, 'delivered', c))}</td><td>${b(lrNum(m.sent_only, 'sent_only', c))}</td></tr>`; };
  const head = first => `<thead><tr><th>${first}</th><th>Sent</th><th>Seen</th><th>Delivered only</th><th>Not delivered yet</th></tr></thead>`;
  return `<div class="lr-scroll"><table class="slv-table lr-tbl">${head('Branch')}<tbody>${by.map(b => row(lcEsc(LC_BRANCH[b.k] || b.k), b, false, { b: b.k })).join('')}${row('All', t, true)}</tbody></table></div>
    <h4 class="lr-dh">By day sent</h4>
    <div class="lr-scroll"><table class="slv-table lr-tbl">${head('Day')}<tbody>${days.map(x => row(lcEsc(lrDay(x.k)), x, false, { d: x.k })).join('')}</tbody></table></div>`;
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
  lrCurSection = '';
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
    // the address names the section she is reading (#lr-money), and is bare again at the very top
    const sec = window.scrollY < 120 ? '' : cur;
    if (sec !== lrCurSection) { lrCurSection = sec; if (typeof trSyncUrl === 'function') trSyncUrl(sec || null); }
  };
  lrSpy = spy;   // ten getBoundingClientRect reads per scroll event, cheap enough without a throttle
  window.addEventListener('scroll', lrSpy, { passive: true });
  // A link that names a section (#lr-money) opens there, once, after the first paint (the hash is read when this file loads: the boot rewrites the address)
  if (!lrHashDone) {
    lrHashDone = true;
    if (LR_HASH0 && subs.some(([id]) => id === LR_HASH0)) setTimeout(() => { lrGoSection(LR_HASH0); }, 150);
  }
  spy();
}
function lrPaint() {
  const host = document.getElementById('lqHost');
  if (!host) return;
  lrRailClear();
  if (lrErr || !lrSum) { host.innerHTML = `<p class="slv-muted">${lcEsc(lrErr || 'No report yet.')}</p>`; return; }
  const s = lrSum, t = s.totals || {}, byB = s.by_branch || [];
  const typeRows = LR_TYPES.map(([k, l]) => { const m = (s.by_type || []).find(x => x.k === k); return m ? lrRow(`<b>${lcEsc(l)}</b>`, m, { y: k }) : null; }).filter(Boolean);
  const waveRows = (s.by_wave || []).map(w => lrRow(`<b>Wave ${w.k || '?'}</b>`, w, { w: w.k || 0 }));
  const msgRows = (s.by_message || []).map(m => { const x = lrMsg(m.k); return lrRow(`${lcEsc(x.nm)} <span class="ll-tag">${lcEsc(x.arm)}</span>`, m, { t: m.k }); });
  const brRows = LR_BR.map(b => byB.find(x => x.k === b)).filter(Boolean).map(m => lrRow(lcEsc(LC_BRANCH[m.k] || m.k), m, { b: m.k }))
    .concat(byB.filter(x => !LR_BR.includes(x.k)).map(m => lrRow(lcEsc(m.k), m, { b: m.k })));
  const dayRows = (s.by_day || []).map(d => lrRow(lcEsc(lrDay(d.k)), d, { d: d.k }));
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
        <span class="lr-multi" id="lrOutWrap">${lrOutMulti()}</span>
        <select class="ll-sel" aria-label="Next appointment" onchange="lrSet('after',this.value)">${[['all', 'Any next appointment'], ['after', 'Next appointment after 31 Oct'], ['offer', 'After 31 Oct, got the offer']].map(([v, l]) => `<option value="${v}"${lrSel.after === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
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

// The Outcome filter, with how many clients are in each (counted for the other filters in force). Redrawn with every page of the log.
const LR_OUT_ORDER = ['booked_nodep', 'booked_dep', 'done', 'rescheduled', 'cancelled', 'stop'];
// Pick one outcome or several (Kate, 26 Oct 2026), "–" (no outcome yet) among them so it can be left out of a select-all. Nothing ticked = every outcome.
// The server takes the picks as a comma list; 'none' is the clients with no outcome yet.
let lrOutOpen = false;
const LR_OUT_ALL = LR_OUT_ORDER.concat(['none']);
const lrOutName = k => k === 'none' ? '– No outcome yet' : LR_OUT[k][0];
function lrOutMulti() {
  const pk = lrSel.outcomes, lab = !pk.length ? 'Every outcome' : pk.length === 1 ? lrOutName(pk[0]).replace(/^– /, '') : `${pk.length} outcomes`;
  const cnt = k => lrOutcomes[k] != null ? ` <span class="slv-note">${lcNum(lrOutcomes[k])}</span>` : '';
  return `<button type="button" class="ll-sel lr-multi-btn" aria-haspopup="true" aria-expanded="${lrOutOpen}" onclick="lrOutToggle(event)">${lcEsc(lab)}</button>
    ${lrOutOpen ? `<div class="lr-multi-pop" role="group" aria-label="Outcome">
      ${LR_OUT_ALL.map(k => `<label><input type="checkbox" ${pk.includes(k) ? 'checked' : ''} onchange="lrOutPick('${k}',this.checked)"> <span>${lcEsc(lrOutName(k))}</span>${cnt(k)}</label>`).join('')}
      <div class="lr-multi-ft"><button type="button" class="tglr lc-btn" onclick="lrOutAll()">Tick all</button><button type="button" class="tglr lc-btn" onclick="lrOutClear()">Clear</button></div></div>` : ''}`;
}
function lrOutDraw() { const w = document.getElementById('lrOutWrap'); if (w) w.innerHTML = lrOutMulti(); }
function lrOutToggle(e) { if (e) e.stopPropagation(); lrOutOpen = !lrOutOpen; lrOutDraw(); }
function lrOutChanged() { lrSel.page = 1; lrOpen = {}; lrOutDraw(); lrRefreshLog(); }
function lrOutPick(k, on) { lrSel.outcomes = LR_OUT_ALL.filter(x => x === k ? on : lrSel.outcomes.includes(x)); lrOutChanged(); }
function lrOutAll() { lrSel.outcomes = LR_OUT_ALL.slice(); lrOutChanged(); }
function lrOutClear() { lrSel.outcomes = []; lrOutChanged(); }
document.addEventListener('click', e => { if (lrOutOpen && !(e.target.closest && e.target.closest('#lrOutWrap'))) { lrOutOpen = false; lrOutDraw(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && lrOutOpen) { lrOutOpen = false; lrOutDraw(); } });
// Its own column (Kate, 26 Oct 2026): a red pill for every client whose next appointment is after 31 Oct, the date the welcome-back rate ends (terms, section 6:
// booked and scheduled on or before 31 Oct). The tooltip says whether her message carried the offer.
function lrLateCell(r) {
  if (!r.next || r.next <= LR_DEADLINE) return '<span class="slv-muted">–</span>';
  return `<span class="ll-tag lr-bad lr-late" title="Her next appointment is after 31 Oct, when the welcome-back rate ends${r.offer ? '' : '. Her messages had no offer'}">After 31 Oct</span>`;
}
function lrOutcomeCell(r) {
  const o = LR_OUT[r.outcome];
  if (!o) return '<span class="slv-muted">–</span>';
  const when = r.next && (r.outcome === 'booked_nodep' || r.outcome === 'booked_dep' || r.outcome === 'rescheduled') ? ` <span class="slv-note">${r.outcome === 'rescheduled' ? 'now ' : ''}${lcEsc(lrDay(r.next))}</span>` : '';
  return `<span class="ll-tag ${o[1]}">${o[0]}</span>${when}`;
}
function lrStatus(r) {
  if (r.status === 'sent') return '<span class="ll-tag sent">Sent</span>';
  if (r.status === 'queued' || r.status === 'sending') return '<span class="ll-tag">Queued</span>';
  return `<span class="ll-tag lr-bad" title="${lcEsc(r.error || '')}">${r.status === 'failed' ? 'Failed' : 'Skipped'}</span>`;
}
// The eight columns of the send log, shared with the pop-ups so a list opened from a number reads like the log under it (Kate, 26 Oct 2026):
// Branch (sticky), Client, Status, Outcome, After 31 Oct, Wave, Message, Sent, Messages to her (how many blast messages she was sent, 1 or 2).
function lrLogCells(r) {
  const m = lrMsg(r.tkey), when = r.d ? `${lcEsc(lrDay(r.d))} <span class="lr-t">${lcEsc(r.t)}</span>` : `<span class="slv-note">${r.qd ? 'queued ' + lcEsc(r.qd) : 'not sent yet'}</span>`;
  return `<td>${lcEsc(LC_BRANCH[r.branch] || r.branch)}</td><td>${lrWho(r)}${lrChat(r.cid)}</td><td>${lrStatus(r)}</td><td>${lrOutcomeCell(r)}</td>
      <td>${lrLateCell(r)}</td><td>${r.wave || '–'}</td><td>${lcEsc(m.nm)} <span class="ll-tag">${lcEsc(m.arm)}</span></td><td>${when}</td><td>${r.msgs || '–'}</td>`;
}
const LR_LOG_HEAD = '<th>Branch</th><th>Client</th><th>Status</th><th>Outcome</th><th>After 31 Oct</th><th>Wave</th><th>Message</th><th>Sent</th><th title="How many messages we sent her">Messages to her</th>';
function lrPaintLog() {
  const el = document.getElementById('lrLog');
  if (!el) return;
  const per = lrSel.per, pages = Math.max(1, Math.ceil(lrTotal / per)), p = Math.min(lrSel.page, pages);
  const rows = lrRowsPage.map(r => {
    const m = lrMsg(r.tkey), open = !!lrOpen[r.id], when = r.d ? `${lcEsc(lrDay(r.d))} <span class="lr-t">${lcEsc(r.t)}</span>` : `<span class="slv-note">queued ${lcEsc(r.qd || '')}</span>`;
    const flags = [r.replied ? 'Replied' : '', r.blocked ? 'Blocked' : ''].filter(Boolean).join(', ');
    return `<tr class="lr-row${open ? ' open' : ''}" onclick="lrToggle(${r.id})">${lrLogCells(r)}</tr>
      ${open ? `<tr class="lr-text"><td colspan="9"><div class="lq-bubble">${lcEsc(r.text || '')}</div>${r.error ? `<div class="slv-note lr-bad">${lcEsc(r.error)}</div>` : ''}<div class="slv-note">Template ${lcEsc(r.tkey)} · queued ${lcEsc(r.qd || '')}${r.by ? ' by ' + lcEsc(r.by) : ''}${r.message_id ? ' · respond.io message ' + lcEsc(r.message_id) : ''}${flags ? ' · ' + flags : ''}</div></td></tr>` : ''}`;
  }).join('');
  // Prev and Next only when there is more than one page; the rows-a-page choice whenever the log is longer than the shortest page.
  const perSel = lrTotal > 10 ? `<select class="ll-sel" aria-label="Rows a page" onchange="lrPer(this.value)">${[10, 20, 50, 100].map(n => `<option value="${n}"${lrSel.per === n ? ' selected' : ''}>${n} rows</option>`).join('')}</select>` : '';
  const pager = lrTotal > 10 ? `<div class="lr-pager">${pages > 1 ? `<button type="button" class="tglr lc-btn" ${p <= 1 ? 'disabled' : ''} onclick="lrGo(${p - 1})">‹ Prev</button>
    <span class="slv-note">Page ${lcNum(p)} of ${lcNum(pages)}</span><button type="button" class="tglr lc-btn" ${p >= pages ? 'disabled' : ''} onclick="lrGo(${p + 1})">Next ›</button>` : ''}${perSel}</div>` : '';
  lrOutDraw();
  const byClient = lrSel.outcomes.length > 0;
  el.innerHTML = `<p class="slv-note">${byClient ? `${lcNum(lrTotal)} client${lrTotal === 1 ? '' : 's'}, one row each (the latest message she was sent)` : `${lcNum(lrTotal)} message${lrTotal === 1 ? '' : 's'}`}${lrTotal ? `, newest first. Click a row to read what she was sent.` : ''}</p>
    ${lrTotal ? `<div class="lr-scroll"><table class="slv-table lr-tbl lr-logt"><thead><tr>${LR_LOG_HEAD}</tr></thead><tbody>${rows}</tbody></table></div>${pager}` : '<p class="slv-muted">Nothing matches these filters.</p>'}`;
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
  const head = ['Date sent', 'Time sent (Dubai)', 'Wave', 'Branch', 'Message', 'Version', 'Template', 'Client', 'Phone', 'Status', 'Error', 'Outcome', 'Next appointment', 'Got the offer', 'Replied', 'Booked', 'STOP', 'Blocked', 'Message sent', 'Queued at', 'Queued by', 'respond.io message', 'respond.io chat'];
  const yn = v => v ? 'Yes' : 'No';
  const lines = out.map(r => { const m = lrMsg(r.tkey);
    return [r.d || '', r.t || '', r.wave || '', LC_BRANCH[r.branch] || r.branch, m.nm, m.arm, r.tkey, r.client, r.phone || r.last4, r.status, r.error || '', (LR_OUT[r.outcome] || [''])[0], r.next || '', yn(r.offer), yn(r.replied), yn(r.booked), yn(r.stop), yn(r.blocked), r.text || '', r.qd || '', r.by || '', r.message_id || '', r.cid ? LR_RESP + r.cid : '']; });
  const built = lgxBuild({ sheets: [{ name: 'Send log', blocks: [{ cols: head.map(h => ({ label: h, fmt: 'text' })), rows: lines.map(l => ({ cells: l })) }] }] });
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = ['lost-clients-send-log', lrSel.wave !== 'all' ? 'wave-' + lrSel.wave : '', lrSel.branch !== 'all' ? slug(LC_BRANCH[lrSel.branch] || lrSel.branch) : '',
    lrType !== 'all' ? lrType : '', lrSel.status !== 'all' ? lrSel.status : '', lrSel.outcomes.length ? lrSel.outcomes.join('-').replace(/_/g, '-') : '', lrSel.after !== 'all' ? 'after-31-oct' + (lrSel.after === 'offer' ? '-offer' : '') : '', lrSel.q.trim() ? 'search' : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  lrNote(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}

// ── The names behind a number (Kate, 26 Oct 2026) ────────────────────────────────────────────────────────────────────────────────
// Any figure drawn by lrNum opens a list of the clients in it: lost_drill(metric, wave, branch, message, day, type) answers with the same
// filters as the row the figure sits in, and the page's own message pick (Which message) narrows it too. One row per message for the message
// counts (sent, replied, STOP, failed, seen ...), one row per client for the client counts (booked, deposit, came in, the outcomes).
const LR_DRILL = { sent: 'Sent', replied: 'Replied', booked: 'Clients booked', appts: 'Clients with an appointment booked', stop: 'STOP', failed: 'Failed', queued: 'Still queued',
  skipped: 'Skipped', blocked: 'Blocked', seen: 'Seen', delivered: 'Delivered, not read yet', sent_only: 'Not delivered yet', paid: 'Deposit paid',
  need: 'Deposit likely needed, not paid', none: 'No deposit needed, short service', today: 'Booked for today', nodep: 'No deposit needed', unpaid: 'Not paid yet',
  since: 'Booked since the message', ahead: 'Booked ahead', done: 'Already came in' };
let lrDrillEl = null, lrDrillFrom = null;
function lrDrillClose() {
  if (lrDrillEl) lrDrillEl.remove();
  lrDrillEl = null; document.body.classList.remove('lr-modal-open');
  if (lrDrillFrom && document.contains(lrDrillFrom)) lrDrillFrom.focus();
  lrDrillFrom = null;
}
function lrDrillTitle(d) {
  const bits = [LR_DRILL[d.dm] || d.dm];
  if (d.dw != null) bits.push(+d.dw ? 'Wave ' + d.dw : 'No wave');
  if (d.db) bits.push(LC_BRANCH[d.db] || d.db);
  if (d.dt) { const x = lrMsg(d.dt); bits.push(x.nm + ', ' + x.arm); }
  if (d.dd) bits.push(lrDay(d.dd));
  const ty = d.dy || (lrType !== 'all' ? lrType : ''), tn = (LR_TYPES.find(t => t[0] === ty) || [, ''])[1];
  if (tn) bits.push(tn);
  return bits.join(' · ');
}
function lrDrillBody(res) {
  const rows = res.rows || [];
  if (!rows.length) return '<p class="slv-muted">Nobody to show.</p>';
  return `<div class="lr-scroll"><table class="slv-table lr-tbl lr-logt"><thead><tr>${LR_LOG_HEAD}</tr></thead><tbody>${rows.map(r => `<tr>${lrLogCells(r)}</tr>`).join('')}</tbody></table></div>`;
}
async function lrDrillOpen(el) {
  const d = el.dataset;
  lrDrillClose();
  lrDrillFrom = el;
  const box = document.createElement('div');
  box.className = 'lr-modal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', lrDrillTitle(d));
  box.innerHTML = `<div class="lr-modal-box"><div class="lr-modal-hd"><div><h3>${lcEsc(lrDrillTitle(d))}</h3><p class="slv-note" id="lrDrillSub">Loading…</p></div>
    <button type="button" class="tglr lc-btn" data-lr-close>Close</button></div><div class="lr-modal-body" id="lrDrillBody"></div></div>`;
  box.addEventListener('click', e => { if (e.target === box || e.target.closest('[data-lr-close]')) lrDrillClose(); });
  document.body.appendChild(box); document.body.classList.add('lr-modal-open');
  lrDrillEl = box;
  const closeBtn = box.querySelector('[data-lr-close]'); if (closeBtn) closeBtn.focus();
  const ty = d.dy || (lrType !== 'all' ? lrType : null);
  const { data, error } = await sb.rpc('lost_drill', { p_metric: d.dm, p_wave: d.dw != null ? +d.dw : null, p_branch: d.db || 'all', p_tkey: d.dt || null, p_day: d.dd || null, p_type: ty });
  if (lrDrillEl !== box) return;   // closed, or another one opened, while it loaded
  const sub = box.querySelector('#lrDrillSub'), bd = box.querySelector('#lrDrillBody');
  if (error || !data) { console.error(error); sub.textContent = 'The list did not load. Close this and try again.'; return; }
  const n = data.total || 0, rows = (data.rows || []).length;
  sub.textContent = `${lcNum(n)} ${data.per_client ? 'client' : 'message'}${n === 1 ? '' : 's'}${n > rows ? `, the first ${lcNum(rows)} shown` : ''}${data.per_client ? '. A client who was sent more than one message is listed once.' : ''}`;
  bd.innerHTML = lrDrillBody(data);
}
document.addEventListener('click', e => { const n = e.target.closest && e.target.closest('.lr-num'); if (n) { e.stopPropagation(); lrDrillOpen(n); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lrDrillEl) { lrDrillClose(); return; }
  const n = e.target.closest && e.target.closest('.lr-num');
  if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); lrDrillOpen(n); }
});
