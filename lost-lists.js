// Lost Clients, campaign lists (Kate, 9 Oct 2026). Coach Emma sent five lists to pull for
// outreach (smoothing lost, smoothing not back, colour, everyone 6 months+ on WhatsApp,
// other services); this is the tab that draws them. The numbers come from lost_lists_summary
// (the cards) and lost_lists (one list's rows), both in migrations/lost_lists.sql, built from
// the same Sales Transactions as the rest of the page, with each client's WhatsApp status
// from respond.io (edge function respond-status-sync, nightly) and her future booking from
// client_bookings, read live.
//
// Who sees what: Level 2 and above open the tab (the page's own rule); phone numbers are
// Level 3 and above (Kate, 9 Oct 2026), the server leaves them out for Level 2 and the Phone
// column and Copy numbers are not drawn.
//
// "Messaged" is not a tick (Kate, 9 Oct 2026: a tick would be manual all over again). The nightly
// respond.io check already keeps the last message we sent each number, and a client counts as
// messaged when that is on or after lost_lists_config.campaign_from (the day the lists were
// handed over). So a client messaged on any list, from respond.io, stays off the others by itself.
// Only messages sent through respond.io are seen; a text sent from another system is not.
//
// Its own page, Lost Clients (index.html view 'lostlists', ?view=lost-clients), apart from Client's Last Visit
// (Kate, 9 Oct 2026: they are different jobs). renderLostListsPage draws it. Borrows Client's Last Visit's row panel (lcToggleDetail), staff links (lcTeam,
// lcStylist), phone cell (lcPhone), pager look and the XLSX writer (lgx*), so a client opens
// the same way and the files look the same.
const LL_ST = {
  act:       ['ll-act', 'WhatsApp active', 'Wrote to one of our WhatsApp numbers in the last 12 months'],
  r18:       ['ll-18',  'Replied 12-18 months ago', 'Last wrote to us 12 to 18 months ago'],
  noreply:   ['ll-no',  'No reply seen', 'A respond.io contact, but no reply in their last 50 messages'],
  unchecked: ['ll-no',  'Not checked yet', 'Added since the last nightly check'],
  text:      ['ll-txt', 'Text only', 'Not a contact in respond.io, so a text message'],
  nonum:     ['ll-num', 'No number', 'No usable phone number in Phorest'],
  blocked:   ['ll-num', 'Blocked', 'Blocked in respond.io'],
};
const LL_ST_ORDER = ['act', 'r18', 'noreply', 'unchecked', 'text', 'nonum', 'blocked'];
const LL_LISTS = [
  { id: '1', t: 'Smoothing, lost', d: 'Lost 6+ months, had smoothing May 2025 to May 2026', ch: 'WhatsApp + text', svc: 'Last smoothing',
    def: '<b>In:</b> no visit of any kind since 9 Apr 2026, and a smoothing (keratin or Supreme Straighten) between May 2025 and May 2026. <b>Booked:</b> a client with a booking stays on the table with the date, and is left out of Copy numbers, files and To message.' },
  { id: '2', t: 'Smoothing, not back', d: 'Last smoothing 6+ months ago', ch: 'WhatsApp + text', svc: 'Last smoothing',
    def: '<b>In:</b> everyone in group 1, plus clients who still come in for other services but have not had smoothing since. "Still visiting" tells them apart. <b>Booked:</b> a client with a booking stays on the table with the date, and is left out of Copy numbers, files and To message.' },
  { id: '3', t: 'Colour', d: 'Lost 6+ months, hair colour or toner in the window', ch: 'Text (25% off) + WhatsApp', svc: 'Last colour',
    def: '<b>In:</b> lost clients with colouring, highlights, balayage, bleach or toner (tagged "Toner only") between May 2025 and May 2026. Use the area switch for Dubai (Motor City, Al Quoz) or Abu Dhabi (Saadiyat, Khalifa City A). <b>Booked:</b> a client with a booking stays on the table with the date, and is left out of Copy numbers, files and To message.' },
  { id: '4', t: 'All 6m+, WhatsApp', d: 'Everyone due, WhatsApp only', ch: 'WhatsApp only', svc: 'Services in window',
    def: '<b>In:</b> every lost client who is a respond.io contact, from visits since Jan 2025. <b>Out:</b> text-only, no number. <b>Booked:</b> stays on the table with the date, left out of Copy numbers, files and To message. Clients who last came before 2025 are not in yet.' },
  { id: '5', t: 'Other services', d: 'Lost 6+ months, no hair colour', ch: 'WhatsApp + text', svc: 'Services in window',
    def: '<b>In:</b> lost clients who had a cut, treatment, beauty, nails or extensions between May 2025 and May 2026 and <b>no</b> hair colour or toner. <b>Booked:</b> stays on the table with the date, left out of Copy numbers, files and To message. <b>Out:</b> visits that were only retail.' },
];
const LL_PER = [10, 20, 50, 100];
let llSel = { list: '1', area: 'all', off: ['nonum'], hideSent: true, hideBooked: false, blast: 'all', per: 20, sort: 'recent' };   // hideSent: hide anyone messaged since the campaign start
try { Object.assign(llSel, JSON.parse(localStorage.getItem('trs-lost-lists') || '{}')); } catch (e) {}
// Kate, 9 Oct 2026: "default exclude those with no number, what is the point". A client with no usable number cannot be
// messaged, so the WhatsApp heading starts with No number unticked (tick it to see them). Once for a browser that
// already saved a choice, so the new default reaches it too.
if (!llSel.nonumHidden) { llSel.nonumHidden = 1; if (!(llSel.off || []).includes('nonum')) llSel.off = (llSel.off || []).concat('nonum'); try { localStorage.setItem('trs-lost-lists', JSON.stringify(llSel)); } catch (e) {} }
let llHost = null, llSum = null, llRows = {}, llErr = '', llPage = 1, llQuery = '', llShown = [], llBusy = false;
const llSave = () => { try { localStorage.setItem('trs-lost-lists', JSON.stringify(llSel)); } catch (e) {} };
const llPhones = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3;
// "Group 1: Smoothing, lost": the number is the group's name everywhere (Kate, 9 Oct 2026), so nobody has to guess what a bare 1 to 5 means.
const llName = l => `Group ${l.id}: ${l.t}`;
const llList = () => LL_LISTS.find(l => l.id === llSel.list) || LL_LISTS[0];
// Short date for the table (no year in this year), the full one for chips, cards and files.
const llDayS = d => { if (!d) return ''; const x = new Date(String(d).slice(0, 10) + 'T00:00:00'); return x.toLocaleDateString('en-GB', x.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' }); };
const llDay = d => d ? lcDayY(String(d).slice(0, 10)) : '';
// Kate, 12 Oct 2026: a client with a booking stays on her group, with the date of her next appointment, so nobody has to
// wonder where she went. She is never in Copy numbers, the files or To message: those take only clients without one.
// booked_on is her next booking from today (client_bookings, pulled up to 90 days ahead, so never more than 3 months away).
const llBooked = r => !!r.booked_on;
// Kate, 12 Oct 2026, from the coordinators' meeting: the coordinators and reception take clients out of the blast before it
// goes (already visiting, known to a stylist, do not contact). A client taken out (excluded, with a reason, who and when,
// lost_excluded in migrations/lost_review.sql) is out of every group, like a booked one: not in Copy numbers, the files or To message.
const LL_REASONS = ['Visiting regularly', 'Stylist knows her', 'Do not contact', 'Wrong number', 'Other'];
const llOut = r => !!r.excluded;
const llGone = r => llBooked(r) || llOut(r);
const llDaysTo = d => d ? Math.round((new Date(String(d).slice(0, 10) + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 864e5) : null;
function llNextCell(r) {
  if (!r.booked_on) return llDash;
  const n = llDaysTo(r.booked_on);
  return `${lcEsc(llDayS(r.booked_on))}<div class="slv-note">${n <= 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + lcNum(n) + ' days'}</div>`;
}
const llDaysOld = d => d ? Math.floor((Date.now() - new Date(String(d).slice(0, 10) + 'T00:00:00').getTime()) / 864e5) : null;

async function llFetch(id) {
  if (llRows[id]) return llRows[id];
  const { data, error } = await sb.rpc('lost_lists', { p_list: id });
  if (error || !Array.isArray(data)) throw error || new Error('no data');
  return (llRows[id] = data);
}

// The page: its heading, then the lists.
function renderLostListsPage() {
  const el = document.getElementById('lostListsContent');
  if (!el || !(typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2)) return;
  el.innerHTML = `<section class="slv-intro"><h2>Lost Clients</h2>
    <p>Coach Emma's outreach lists: who is lost, who is ready on WhatsApp and who is text only.</p></section>
    ${typeof lqTabsHtml === 'function' ? lqTabsHtml() : ''}<div id="llHost"></div><div id="lqHost" hidden></div>`;
  renderLostLists(document.getElementById('llHost'));
  // Level 3+ also gets the To message and Templates tabs (lost-queue.js); this opens the one she left on.
  if (typeof lqAfterRender === 'function') lqAfterRender();
}

async function renderLostLists(host) {
  llHost = host;
  lcDetailCtx = { branch: () => null, html: d => lcDetailHtml(d, { allBranches: true }) };
  host.innerHTML = '<p class="slv-muted">Loading the lists…</p>';
  try {
    const [s] = await Promise.all([sb.rpc('lost_lists_summary'), llFetch(llSel.list)]);
    if (s.error || !s.data) throw s.error || new Error('no summary');
    llSum = s.data; llErr = '';
  } catch (e) {
    console.error(e);
    llErr = 'The lists did not load. Refresh to try again.';
  }
  llPaint();
}

function llPick(id) {
  llClosePop();
  llSel.list = id; llSel.off = ['nonum']; llSel.area = 'all'; llSel.also = []; llPage = 1; llQuery = ''; llSave();
  llHost.querySelectorAll('.ll-card').forEach(b => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  llBusy = true; llPaintPanel();
  llFetch(id).then(() => { llBusy = false; llPaint(); }, e => { console.error(e); llBusy = false; llErr = 'That list did not load. Try again.'; llPaint(); });
}
// A change from a heading menu repaints the table and keeps the menu open, so several can be ticked.
function llRefresh() { llPage = 1; llSave(); llPaintTable(); llFillPop(); }
function llSet(k, v) { llSel[k] = v; llRefresh(); }
function llToggleSt(s) {
  const i = llSel.off.indexOf(s);
  if (i >= 0) llSel.off.splice(i, 1); else llSel.off.push(s);
  llRefresh();
}
function llToggleAlso(g) {
  const a = (llSel.also || []).slice(), i = a.indexOf(g);
  if (i >= 0) a.splice(i, 1); else a.push(g);
  llSel.also = a; llRefresh();
}
function llSendReady() { llSel.off = LL_ST_ORDER.filter(s => s !== 'act' && s !== 'r18'); llRefresh(); }
function llAllSt() { llSel.off = []; llRefresh(); }

// What the filters leave of the list on screen.
// id: which group (the open one by default). `full` is false for the all-groups download, which keeps the Area, WhatsApp
// and Messaged filters but not the search box or Also in, which belong to the group on screen.
function llFiltered(id, full = true) {
  const rows = llRows[id || llSel.list] || [], q = full ? llQuery.trim().toLowerCase() : '';
  let out = rows.filter(r => !llSel.off.includes(r.wa)
    && (llSel.area === 'all' || r.area === llSel.area)
    && !(llSel.hideSent && r.messaged)
    && !(llSel.hideBooked && llBooked(r))
    && (llSel.blast === 'in' ? !llGone(r) : llSel.blast === 'out' ? llGone(r) : true)
    && (!full || (llSel.also || []).every(g => (r.also_on || []).includes(g)))
    && (!q || (r.client_name + ' ' + (r.stylist || '') + ' ' + (r.also_saw || '')).toLowerCase().includes(q)));
  const by = { recent: (a, b) => (a.days_since - b.days_since), oldest: (a, b) => (b.days_since - a.days_since),
    name: (a, b) => a.client_name.localeCompare(b.client_name) }[llSel.sort] || null;
  return by ? out.slice().sort(by) : out;
}

// ── HEADING MENUS (Kate, 9 Oct 2026: toggling and filtering belong on the headings) ──────────
// Client (area), Last visit (sort), WhatsApp (which statuses) and Messaged (hide the messaged)
// open a small menu under their heading; a heading that is filtering is marked.
let llPopFor = null;
function llClosePop() { const p = document.getElementById('llPop'); if (p) p.remove(); llPopFor = null; }
function llMenu(ev, k) {
  ev.stopPropagation();
  if (llPopFor === k) { llClosePop(); return; }
  llClosePop();
  const r = ev.currentTarget.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.id = 'llPop'; pop.className = 'll-pop'; pop.setAttribute('role', 'dialog');
  pop.style.top = (r.bottom + 4) + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 270)) + 'px';
  document.body.appendChild(pop);
  llPopFor = k; llFillPop();
}
function llFillPop() {
  const pop = document.getElementById('llPop');
  if (!pop || !llPopFor) return;
  // To message (lost-queue.js) has headings with menus too: its keys start with q-.
  if (String(llPopFor).indexOf('q-') === 0 && typeof lqFillPop === 'function') { pop.innerHTML = lqFillPop(llPopFor); return; }
  const all = llRows[llSel.list] || [];
  const opt = (on, label, fn, n) => `<button type="button" class="ll-opt${on ? ' on' : ''}" onclick="${fn}"><span class="ll-tick" aria-hidden="true">${on ? '✓' : ''}</span>${label}${n != null ? ` <em>${n}</em>` : ''}</button>`;
  let h = '';
  if (llPopFor === 'client') {
    h = '<div class="ll-pt">Area</div>' + [['all', 'All areas'], ['Dubai', 'Dubai'], ['Abu Dhabi', 'Abu Dhabi']].map(([v, l]) =>
      opt(llSel.area === v, l, `llSet('area','${v}')`, lcNum(all.filter(r => v === 'all' || r.area === v).length))).join('')
      + '<div class="ll-pt">Sort</div>' + opt(llSel.sort === 'name', 'Name A to Z', `llSet('sort','${llSel.sort === 'name' ? 'recent' : 'name'}')`);
  } else if (llPopFor === 'last') {
    h = '<div class="ll-pt">Sort</div>' + [['recent', 'Lost most recently first'], ['oldest', 'Lost longest first']].map(([v, l]) => opt(llSel.sort === v, l, `llSet('sort','${v}')`)).join('');
  } else if (llPopFor === 'wa') {
    const counts = {}; all.forEach(r => { counts[r.wa] = (counts[r.wa] || 0) + 1; });
    h = '<div class="ll-pt">Show</div>' + LL_ST_ORDER.filter(s => counts[s]).map(s => opt(!llSel.off.includes(s), lcEsc(LL_ST[s][1]), `llToggleSt('${s}')`, lcNum(counts[s]))).join('')
      + '<div class="ll-pf"><button type="button" class="lc-more" onclick="llSendReady()">Send-ready only</button><button type="button" class="lc-more" onclick="llAllSt()">All</button></div>';
  } else if (llPopFor === 'groups') {
    // Kate, 9 Oct 2026: the groups are chosen in this heading, not on the cards. Show group opens another list; Also in
    // narrows this one to the clients who are in those groups too (every group ticked), for the ones in more than one.
    const lists = ((llSum || {}).lists) || {}, also = llSel.also || [];
    h = '<div class="ll-pt">Show group</div>' + LL_LISTS.map(l => opt(l.id === llSel.list, lcEsc(llName(l)), `llPick('${l.id}')`, lcNum((lists[l.id] || {}).n || 0))).join('')
      + '<div class="ll-pt">Also in</div>' + LL_LISTS.filter(l => l.id !== llSel.list).map(l => opt(also.includes(l.id), 'Group ' + l.id, `llToggleAlso('${l.id}')`, lcNum(all.filter(r => (r.also_on || []).includes(l.id)).length))).join('')
      + '<div class="ll-pf"><button type="button" class="lc-more" onclick="llSel.also=[];llRefresh()">Clear</button></div>'
      + '<div class="ll-pt ll-pn">Also in shows the clients on this list who are in every group ticked.</div>';
  } else if (llPopFor === 'blast') {
    const nIn = all.filter(r => !llGone(r)).length, nOut = all.length - nIn;
    h = '<div class="ll-pt">Show</div>' + [['all', 'Everyone', all.length], ['in', 'Still in the blast', nIn], ['out', 'Taken out or booked', nOut]].map(([v, l, n]) => opt(llSel.blast === v, l, `llSet('blast','${v}')`, lcNum(n))).join('')
      + '<div class="ll-pt ll-pn">Take a client out on her row. She is out of every group, and of To message, Copy numbers and the files.</div>';
  } else if (String(llPopFor).indexOf('blast:') === 0) {
    const bi = +String(llPopFor).slice(6), r = llShown[bi];
    if (!r) { pop.remove(); return; }
    const noteIn = `<div class="ll-pt">Note, if it helps the team</div><input id="llNoteIn" class="ll-search ll-notein" maxlength="200" placeholder="Why (optional)" value="${lcEsc(r.excluded_note || '')}" onclick="event.stopPropagation()">`;
    h = r.excluded
      ? `<div class="ll-pt">Out: ${lcEsc(r.excluded)}</div>` + opt(false, 'Put back in the blast', `llBlastPut(${bi})`)
        + noteIn + '<div class="ll-pt">Change the reason</div>' + LL_REASONS.map(x => opt(x === r.excluded, lcEsc(x), `llBlastTake(${bi},'${x}')`)).join('')
      : noteIn + '<div class="ll-pt">Take her out because</div>' + LL_REASONS.map(x => opt(false, lcEsc(x), `llBlastTake(${bi},'${x}')`)).join('');
  } else if (llPopFor === 'next') {
    const nb = all.filter(llBooked).length;
    h = opt(!llSel.hideBooked, 'Show clients who are booked', `llSet('hideBooked',${!llSel.hideBooked})`, lcNum(nb))
      + '<div class="ll-pt ll-pn">Booked clients are never in Copy numbers, the files or To message.</div>';
  } else if (llPopFor === 'msg') {
    h = opt(llSel.hideSent, 'Hide anyone already messaged', `llSet('hideSent',${!llSel.hideSent})`)
      + '<div class="ll-pt ll-pn">Messaged = respond.io shows a message was sent to the number since the groups were handed over, in any group.</div>';
  }
  pop.innerHTML = h;
}
// An option click repaints the menu, so its button is gone by the time the click reaches here: that is not a click outside.
document.addEventListener('click', e => { if (!e.target.isConnected) return; if (!e.target.closest('#llPop') && !e.target.closest('.ll-thb')) llClosePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') llClosePop(); });
window.addEventListener('scroll', () => { if (llPopFor) llClosePop(); }, { passive: true });

// The In blast switch on a row. Taking her out or putting her back is one call (lost_exclude / lost_include, Level 2 and
// above); every row of hers in every group already loaded is updated at once, then the cards are refetched.
function llSetOut(key, reason, note) {
  Object.keys(llRows).forEach(id => (llRows[id] || []).forEach(x => {
    if (x.client_key !== key) return;
    x.excluded = reason || null; x.excluded_note = reason && note ? note : null;
    x.excluded_by = reason ? 'you' : null; x.excluded_at = reason ? new Date().toISOString() : null;
  }));
}
async function llBlastCall(i, reason) {
  const r = llShown[i];
  if (!r) return;
  const ni = document.getElementById('llNoteIn'), note = reason && ni ? ni.value.trim().slice(0, 200) : '';
  llClosePop();
  const { error } = reason ? await sb.rpc('lost_exclude', { p_keys: [r.client_key], p_reason: reason, p_note: note || null }) : await sb.rpc('lost_include', { p_keys: [r.client_key] });
  if (error) { console.error(error); llNote('That did not save. Try again.'); return; }
  llSetOut(r.client_key, reason, note);
  llPaintTable();
  llNote(reason ? `${r.client_name} is out of the blast` : `${r.client_name} is back in`);
  llReloadSum();
}
const llBlastTake = (i, reason) => llBlastCall(i, reason);
const llBlastPut = i => llBlastCall(i, null);
// The cards and the review strip after a change (the table keeps its place; only the numbers above it are redrawn).
async function llReloadSum() {
  try {
    const { data, error } = await sb.rpc('lost_lists_summary');
    if (error || !data) return;
    llSum = data;
    const c = document.querySelector('#llHost .ll-cards'); if (c) c.innerHTML = LL_LISTS.map(l => llCard(l)).join('');
    llPaintReview();
  } catch (e) { console.error(e); }
}
function llBlastCell(r, i) {
  if (r.booked_on) return '<span class="ll-tag" title="She has a booking, so she is not messaged">Booked</span>';
  if (r.excluded) return `<button type="button" class="ll-blast out" onclick="llMenu(event,'blast:${i}')" aria-haspopup="dialog" title="Click to put her back or change the reason">Out: ${lcEsc(r.excluded)}</button>`
    + `<div class="slv-note">${lcEsc(r.excluded_by || '')}${r.excluded_at ? ' · ' + lcEsc(llDayS(r.excluded_at)) : ''}</div>`
    + (r.excluded_note ? `<div class="slv-note ll-bnote" title="${lcEsc(r.excluded_note)}">${lcEsc(r.excluded_note)}</div>` : '');
  return `<button type="button" class="ll-blast in" onclick="llMenu(event,'blast:${i}')" aria-haspopup="dialog" title="In the blast. Click to take her out">✓ In</button>`;
}
// Branch review: each coordinator marks her branch reviewed once she has taken out who should not be messaged.
async function llReviewSet(br, on) {
  const { error } = await sb.rpc('lost_review_set', { p_branch: br, p_signed: on });
  if (error) { console.error(error); llNote('That did not save. Try again.'); return; }
  llSum.review = llSum.review || {};
  if (on) llSum.review[br] = { by: 'you', at: new Date().toISOString() }; else delete llSum.review[br];
  llPaintReview();
}
function llReviewHtml() {
  const rv = (llSum && llSum.review) || {};
  const done = Object.keys(LC_BRANCH).filter(b => rv[b]).length;
  return `<div class="ll-review"><div class="ll-rv-h"><b>Branch review</b> <span class="slv-note">Take out anyone already visiting, known to a stylist or not to be contacted, then mark your branch reviewed. ${done} of 4 done.</span></div>`
    + Object.keys(LC_BRANCH).map(b => rv[b]
      ? `<span class="ll-chip ok"><b>${lcEsc(LC_BRANCH[b])}</b> reviewed by ${lcEsc(rv[b].by || '')}, ${lcEsc(llDayS(rv[b].at))} <button type="button" class="ll-rv-btn" onclick="llReviewSet('${b}',false)">Undo</button></span>`
      : `<span class="ll-chip warn"><b>${lcEsc(LC_BRANCH[b])}</b> not reviewed <button type="button" class="ll-rv-btn" onclick="llReviewSet('${b}',true)">Mark reviewed</button></span>`).join('')
    + '</div>';
}
function llPaintReview() { const e = document.getElementById('llReview'); if (e) e.innerHTML = llReviewHtml(); }

function llPaint() {
  if (!llHost) return;
  if (llErr) { llHost.innerHTML = `<p class="slv-muted">${lcEsc(llErr)}</p>`; return; }
  const F = (llSum && llSum.fresh) || {};
  const wa = F.wa_checked ? new Date(F.wa_checked) : null;
  const waOld = wa ? (Date.now() - wa.getTime()) / 36e5 : null;
  const bkOld = llDaysOld(F.bookings_pulled);
  const chip = (txt, warn) => `<span class="ll-chip${warn ? ' warn' : ''}">${txt}</span>`;
  const held = ((llSum.lists || {}).held || {}).n || 0;
  llHost.innerHTML = `
    <div class="ll-fresh">
      ${chip(`Sales through <b>${lcEsc(llDay(F.sales_to) || '?')}</b>`)}
      ${chip(wa ? `WhatsApp status checked <b>${lcEsc(wa.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + wa.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</b>` : 'WhatsApp status <b>not checked yet</b>', !wa || waOld > 36)}
      ${chip(F.bookings_pulled ? `Bookings pulled <b>${lcEsc(llDay(F.bookings_pulled))}</b>${bkOld > 2 ? ` (${bkOld} days old, a booked client may look lost; run /daily-reports)` : ''}` : 'Bookings <b>not loaded</b>', !F.bookings_pulled || bkOld > 2)}
    </div>
    <div id="llReview">${llReviewHtml()}</div>
    <div class="ll-cards">${LL_LISTS.map(l => llCard(l)).join('')}</div>
    <p class="ll-explain"><b>Ready on WhatsApp</b> = wrote to one of our numbers in the last 18 months. <b>No reply seen</b> = in respond.io, but no reply in their last 50 messages. <b>Text only</b> = not in respond.io; <b>no number</b> = nothing usable in Phorest.</p>
    ${held ? `<p class="slv-note">${lcNum(held)} lost clients already have a booking. They stay on their groups with the date of their next appointment, and are left out of Copy numbers, the files and To message.</p>` : ''}
    <section class="slv-card ll-panel" id="llPanel"></section>`;
  llPaintPanel();
}

// A card says its numbers in words (no colour to decode): how many are ready on WhatsApp, how many are
// contacts with no reply seen, how many are text only or have no number, and one plain bar for the
// ready share.
function llCard(l) {
  const S = ((llSum.lists || {})[l.id]) || { n: 0, wa: {} };
  const wa = S.wa || {}, n = S.n || 0;
  const ready = (wa.act || 0) + (wa.r18 || 0), unsure = (wa.noreply || 0) + (wa.unchecked || 0), none = (wa.text || 0) + (wa.nonum || 0) + (wa.blocked || 0);
  const pct = n ? Math.round(100 * ready / n) : 0;
  // Kate, 9 Oct 2026: the cards pick the list again (click or Enter), as well as the Show group menu in the In groups heading. The ring marks the open one.
  return `<div class="ll-card${l.id === llSel.list ? ' on' : ''}" data-id="${l.id}" role="button" tabindex="0" aria-pressed="${l.id === llSel.list}"
      title="Show Group ${l.id}" onclick="llPick('${l.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();llPick('${l.id}')}">
      <div class="ll-g">Group ${l.id}</div><div class="ll-t">${lcEsc(l.t)}</div><div class="ll-n">${lcNum(n)}</div>
      <div class="ll-d">${lcEsc(l.d)}</div>
      <div class="ll-ch">${lcEsc(l.ch)}${l.id === '3' ? `<br>Dubai ${lcNum(S.dubai)} · Abu Dhabi ${lcNum(S.abu_dhabi)}` : ''}</div>
      <div class="ll-bot">
        <dl class="ll-mix">
          <div><dt>Ready on WhatsApp</dt><dd>${lcNum(ready)}</dd></div>
          <div><dt>No reply seen</dt><dd>${lcNum(unsure)}</dd></div>
          <div><dt>Text only or no number</dt><dd>${lcNum(none)}</dd></div>
        </dl>
        <div class="ll-bar" role="img" aria-label="${pct}% ready on WhatsApp"><i style="width:${pct}%"></i></div>
        <div class="ll-pct">${pct}% ready on WhatsApp</div>
      </div>
    </div>`;
}

// Kate, 9 Oct 2026: "+4 columns", and most of all for the clients who sit in more than one group. The one service
// column that changed with the group is four fixed ones: last smoothing, last colour, last toner and the services
// she had in the window, so a client in groups 1, 3 and 4 shows all of it on whichever list you are looking at.
const llDash = '<span class="slv-muted">–</span>';
const llDateCell = d => d ? lcEsc(llDayS(d)) : llDash;
// Kate, 9 Oct 2026: "toner is under colour". One colouring date: the later of her last colour (colouring, highlights,
// balayage, bleach) and her last toner, so a client who only had a toner still shows when.
const llColourDate = r => [r.last_colour, r.last_toner].filter(Boolean).sort().pop() || '';
// The date of her last service of any kind (a cut, a treatment, beauty, as well as smoothing and colouring), sent by
// lost_lists() as last_service (migrations/lost_lists_last_service.sql, 9 Oct 2026). Until a page has the new function,
// the latest of the dates it does have.
const llServiceDate = r => r.last_service || [r.last_keratin, r.last_colour, r.last_toner, r.last_other].filter(Boolean).sort().pop() || '';
// The phone card has no columns, so the same four become one line of what she has: Smoothing 12 Jul · Colour 3 Aug ...
function llSvcLine(r) {
  return [['Smoothing', r.last_keratin], ['Colouring', llColourDate(r)], ['Service', llServiceDate(r)]].filter(x => x[1])
    .map(x => `${x[0]} ${lcEsc(llDayS(x[1]))}`).join(' · ') || '–';
}
function llAlso(r) {
  const tags = (r.also_on || []).filter(x => x !== llSel.list).map(x => `<span class="ll-tag" title="Also in group ${x}">${x}</span>`);
  return tags.join('') || '<span class="slv-muted">–</span>';
}
function llStatus(r) {
  const s = LL_ST[r.wa] || LL_ST.text;
  const note = r.last_in ? `replied ${lcEsc(llDayS(r.last_in))}` : '';
  return `<span class="ll-pill ${s[0]}" title="${lcEsc(s[2])}">${lcEsc(s[1])}</span>${note ? `<div class="slv-note">${note}</div>` : ''}`;
}
// Messaged, from respond.io: the last message we sent that number. Green once it is on or after the
// campaign start, grey (the date only) when it is older.
function llSentCell(r) {
  if (r.messaged) return `<span class="ll-tag sent" title="A message was sent to this number through respond.io since the lists were handed over">Messaged ${lcEsc(llDayS(r.last_out))}</span>`;
  return r.last_out ? `<span class="slv-note">last ${lcEsc(llDayS(r.last_out))}</span>` : '<span class="slv-muted">–</span>';
}

function llPaintPanel() {
  const box = document.getElementById('llPanel');
  if (!box) return;
  const L = llList();
  if (llBusy) { box.innerHTML = `<div class="slv-head"><div><div class="slv-eyebrow">${lcEsc(L.ch)}</div><h3>${lcEsc(llName(L))}</h3></div></div><p class="slv-muted">Loading…</p>`; return; }
  const ph = llPhones();
  box.innerHTML = `
    <div class="slv-head">
      <div><div class="slv-eyebrow">${lcEsc(L.ch)}</div><h3>${lcEsc(llName(L))}</h3><p id="llCount"></p></div>
    </div>
    <div class="ll-def">${L.def}</div>
    <div class="lc-tools ll-tools">
      <input type="search" id="llSearch" placeholder="Search name or stylist" value="${lcEsc(llQuery)}" oninput="llQuery=this.value;llPage=1;llPaintTable()"
        class="ll-search">
      <span style="flex:1"></span>
      <span class="ll-btns">
      <button type="button" class="tglr lc-btn" onclick="lrfMenu(event)" title="An Excel file of a branch's lost clients with Take out? and Note columns to fill in, then upload it back">Review file</button>
      <button type="button" class="tglr lc-btn" onclick="lrfPick()" title="Upload a filled-in review file: you see what changes before anything does">Upload review file</button>
      <input type="file" id="lrfFile" accept=".xlsx,.csv" hidden onchange="lrfOnFile(this)">
      ${ph ? '<button type="button" class="tglr lc-btn" onclick="llCopy()" title="Copy the numbers of the clients shown">Copy numbers</button>' : ''}
      <button type="button" class="tglr lc-btn" onclick="llSaveFile('xlsx')" title="Download what is shown as Excel, with each client's visits">XLSX</button>
      <button type="button" class="tglr lc-btn" onclick="llSaveAll()" title="One Excel file with a sheet for each of the five groups, with this table's Area, WhatsApp and Messaged filters">XLSX · all groups</button>
      <button type="button" class="tglr lc-btn" onclick="llSaveFile('csv')" title="Download what is shown as CSV">CSV</button>
      </span>
      <span id="llNote" class="slv-note" style="display:inline"></span>
    </div>
    <div id="lrfPanel"></div>
    <div id="llTable"></div>
    <p class="slv-muted ll-foot">Lost means no visit of any kind for 6 months, at any branch. WhatsApp status and Messaged come from respond.io, checked every night (a text sent from another system is not seen). ${ph ? '' : 'Phone numbers are for Level 3 and above. '}Next appointment is from Phorest's Staff Appointments, pulled six times a day, up to 3 months ahead; a client with a booking, or taken out on her row, is left out of Copy numbers, the files and To message, and the list is only as fresh as the last pull. Click Client, In blast, Last visit, Next appointment, WhatsApp or Messaged to filter or sort.</p>`;
  llPaintTable();
}

// The table and the count line; the search box calls this alone so typing keeps its focus.
function llPaintTable() {
  const L = llList(), all = llRows[L.id] || [], ph = llPhones();
  const rows = llFiltered(), per = LL_PER.includes(llSel.per) ? llSel.per : 20;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  llPage = Math.min(Math.max(1, llPage), pages);
  const shown = rows.slice((llPage - 1) * per, llPage * per);
  llShown = shown; lcShown = shown;
  const ready = rows.filter(r => !llGone(r) && (r.wa === 'act' || r.wa === 'r18')).length, sentN = all.filter(r => r.messaged).length, bookedN = all.filter(llBooked).length, outN = all.filter(r => llOut(r) && !llBooked(r)).length;
  const cnt = document.getElementById('llCount');
  if (cnt) cnt.textContent = `${lcNum(rows.length)} shown of ${lcNum(all.length)}${ready ? ` · ${lcNum(ready)} ready on WhatsApp` : ''}${sentN ? ` · ${lcNum(sentN)} already messaged` : ''}${bookedN ? ` · ${lcNum(bookedN)} booked` : ''}${outN ? ` · ${lcNum(outN)} taken out` : ''}`;
  const two = r => r.n_numbers > 1 ? ' <span class="lc-2nums" tabindex="0" title="This name matches more than one client in Phorest, so the number may be someone else\'s. Check before you send.">2 numbers?</span>' : '';
  const cols = ['Client', 'In blast', 'Last visit', 'Last smoothing', 'Last colouring', 'Last service', 'Next appointment', 'Usual team'].concat(ph ? ['Phone'] : [], ['WhatsApp', 'Also on', 'Messaged']);
  const th = (label, k, marked) => k ? `<th><button type="button" class="ll-thb${marked ? ' on' : ''}" onclick="llMenu(event,'${k}')" aria-haspopup="dialog" title="Filter or sort">${lcEsc(label)} <span aria-hidden="true">▾</span></button></th>` : `<th>${lcEsc(label)}</th>`;
  const heads = th('Client', 'client', llSel.area !== 'all') + th('In blast', 'blast', llSel.blast !== 'all') + th('Last visit', 'last', llSel.sort === 'oldest') + th('Last smoothing') + th('Last colouring') + th('Last service') + th('Next appointment', 'next', llSel.hideBooked) + th('Usual team')
    + (ph ? th('Phone') : '') + th('WhatsApp', 'wa', llSel.off.length > 0) + th('In groups', 'groups', (llSel.also || []).length > 0) + th('Messaged', 'msg', llSel.hideSent);
  // Usual team: her usual stylist and usual beautician, one line each (the row panel has everyone else).
  const team = r => { const t = lcTeam(r); const w = [t.hair[0], t.beauty[0]].filter(Boolean); return w.length ? w.map(n => `<div>${lcStylist(n)}</div>`).join('') : '<span class="slv-muted">–</span>'; };
  const tr = shown.map((r, i) => `<tr class="lc-row" title="Click to see what she came in for, what she took home and who looked after her" onclick="lcToggleDetail(event,${i})">
      <td>${lcEsc(r.client_name)}${two(r)}<div class="slv-note">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · ${lcEsc(r.area)}</div><span class="lc-hint" aria-hidden="true">See her visits ›</span></td>
      <td class="ll-nw ll-bl">${llBlastCell(r, i)}</td>
      <td class="ll-nw">${lcEsc(llDayS(r.last_visit))}<div class="slv-note">${lcNum(r.days_since)} days</div></td>
      <td class="ll-nw">${llDateCell(r.last_keratin)}${r.still ? '<div><span class="ll-tag">Still visiting</span></div>' : ''}</td>
      <td class="ll-nw">${llDateCell(llColourDate(r))}${r.toner_only ? '<div><span class="ll-tag" title="Toner only, no colouring in the window">Toner only</span></div>' : ''}</td>
      <td class="ll-nw">${llDateCell(llServiceDate(r))}</td>
      <td class="ll-nw">${llNextCell(r)}</td>
      <td class="lc-stc ll-team">${team(r)}</td>
      ${ph ? `<td class="ll-ph">${lcPhone(r)}</td>` : ''}
      <td>${llStatus(r)}</td><td>${llAlso(r)}</td><td>${llSentCell(r)}</td></tr>`).join('');
  const cards = shown.map((r, i) => `<li class="prd-card lc-row" onclick="lcToggleDetail(event,${i})"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}${two(r)}</span><span>${llStatus(r)}</span></div>
      <div class="prd-meta">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · last ${lcEsc(llDay(r.last_visit))} (${lcNum(r.days_since)} days) · ${llSvcLine(r)}</div>
      ${r.booked_on ? `<div class="prd-meta lc-also-line"><span class="ll-tag">Booked</span> Next appointment ${lcEsc(llDay(r.booked_on))}</div>` : ''}
      <div class="prd-meta ll-bl" style="margin-top:4px">In blast: ${llBlastCell(r, i)}</div>
      ${['hair', 'beauty'].map(t => { const l = lcTeam(r)[t]; return l.length ? `<div class="prd-meta lc-also-line">${t === 'hair' ? 'Stylist' : 'Beautician'} ${lcStylist(l[0])}</div>` : ''; }).join('')}
      ${ph && r.mobile ? `<div class="prd-meta" style="margin-top:4px">${lcPhone(r)}</div>` : ''}
      <div class="prd-meta" style="margin-top:4px">Also on ${llAlso(r)} · ${llSentCell(r)}</div>
      <div class="lc-hint-m">Tap for her visits ›</div></div></li>`).join('');
  const box = document.getElementById('llTable');
  if (!box) return;
  const from = (llPage - 1) * per + 1;
  box.innerHTML = `<div class="slv-wrap prd-desk lc-wrap ll-wrap"><table class="slv-table"><thead><tr>${heads}</tr></thead>
      <tbody>${tr || `<tr><td colspan="${cols.length}" class="slv-muted">No one on this list matches those filters.</td></tr>`}</tbody></table></div>
      <ol class="prd-cards">${cards || '<li class="slv-muted">No one on this list matches those filters.</li>'}</ol>
      ${rows.length ? `<div class="lc-pager">
        <div class="lc-pg-size"><span class="slv-note">Show</span><div class="sc-seg" role="group" aria-label="Rows per page">${LL_PER.map(v => `<button type="button" class="${v === per ? 'on' : ''}" onclick="llSet('per',${v})">${v}</button>`).join('')}</div></div>
        <div class="lc-pg-nav"><span class="lc-pg-txt">Page <b>${llPage}</b> of <b>${lcNum(pages)}</b><span class="slv-note"> · ${lcNum(from)}–${lcNum(from + shown.length - 1)} of ${lcNum(rows.length)}</span></span>
          <button type="button" class="tglr" onclick="llGo(-1)"${llPage <= 1 ? ' disabled' : ''}>‹ Prev</button>
          <button type="button" class="tglr" onclick="llGo(1)"${llPage >= pages ? ' disabled' : ''}>Next ›</button></div></div>` : ''}`;
}
function llGo(d) {
  llPage += d; llPaintTable();
  const box = document.getElementById('llTable');
  if (box && box.getBoundingClientRect().top < 0) scrollTo({ top: scrollY + box.getBoundingClientRect().top - 180 });
}

function llNote(t) { const n = document.getElementById('llNote'); if (n) n.textContent = t; }

// ── COPY AND FILES ─────────────────────────────────────────────────────────
// Copy numbers: the first number of every client shown, except a name that matches more than
// one client in Phorest (the number may be someone else's); those are counted, not copied.
async function llCopy() {
  const rows = llFiltered().filter(r => r.mobile && !llGone(r));
  const ok = rows.filter(r => r.n_numbers === 1);
  try { await navigator.clipboard.writeText(ok.map(r => r.mobile).join('\n')); }
  catch (e) { llNote('The browser would not copy. Use the file instead.'); return; }
  llNote(`Copied ${lcNum(ok.length)} numbers${rows.length > ok.length ? `, left out ${lcNum(rows.length - ok.length)} names that match more than one client` : ''}`);
}
function llLines(id, rows) {
  const L = (id && LL_LISTS.find(l => l.id === id)) || llList(); rows = (rows || llFiltered()).filter(r => !llGone(r)); const ph = llPhones();
  const since = llSum && llSum.fresh && llSum.fresh.campaign_from ? ' ' + llDay(llSum.fresh.campaign_from) : '';
  // The three service dates, as on screen (kept as dates, not mixed with words): smoothing, colouring, any service.
  const svc = r => [r.last_keratin || '', llColourDate(r), llServiceDate(r)];
  const type = L.id === '2' ? ['Type', r => r.still ? 'Still visiting' : 'Lost']
    : L.id === '3' ? ['Colour type', r => r.toner_only ? 'Toner only' : 'Colour, highlights, balayage or bleach'] : null;
  const head = ['Client', 'Area', 'Last branch', 'Last visit', 'Days since', 'Last smoothing', 'Last colouring', 'Last service'].concat(type ? [type[0]] : [],
    ['Usual stylist', 'Usual beautician', 'Also saw'], ph ? ['Phone', 'Numbers matched'] : [],
    ['WhatsApp status', 'Last wrote to us', 'Last we messaged', 'Also in other groups', 'Messaged since' + since]);
  const lines = rows.map(r => {
    const t = lcTeam(r);
    return [r.client_name, r.area, LC_BRANCH[r.branch] || r.branch, r.last_visit, r.days_since].concat(svc(r), type ? [type[1](r)] : [],
      [t.hair[0] || '', t.beauty[0] || '', t.hair.slice(1).concat(t.beauty.slice(1)).join(', ')], ph ? [r.mobile || '', r.n_numbers] : [],
      [(LL_ST[r.wa] || [])[1] || r.wa, r.last_in || '', r.last_out || '', (r.also_on || []).filter(x => x !== L.id).sort().join(', '), r.messaged ? 'Yes' : '']);
  });
  return { head, lines, rows };
}
// Kate, 12 Oct 2026: "it must show" her visits in the file, as the panel a click opens does. lost_clients_visits_bulk
// (migrations/lost_clients_visits_bulk.sql) gives each client's visit count since Jan 2025 and her latest 10 visits (date,
// branch, services, AED, who), 400 clients a call, three calls side by side; kept by name so a second save is instant.
const llVisCache = {};
async function llFetchVisits(names) {
  const need = [...new Set(names.filter(n => !(n in llVisCache)))];
  const chunks = [];
  for (let i = 0; i < need.length; i += 400) chunks.push(need.slice(i, i + 400));
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const part = chunks[next++];
      const { data, error } = await sb.rpc('lost_clients_visits_bulk', { p_clients: part });
      if (error) throw error;
      part.forEach(n => { llVisCache[n] = null; });
      (data || []).forEach(d => { llVisCache[d.client_name] = d; });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
async function llAddVisits(parts) {
  await llFetchVisits(parts.rows.map(r => r.client_name));
  parts.head.push('Visits since Jan 2025', 'Recent visits (latest 10)');
  parts.rows.forEach((r, i) => { const d = llVisCache[r.client_name] || {}; parts.lines[i].push(Number(d.visits) || 0, d.recent || ''); });
  return parts;
}
// Kate, 9 Oct 2026: "an option to download xlsx for all groups, separated by each sheet". One workbook, a sheet per
// group, each built like the single-group file. It fetches the groups not yet loaded (group 4 is the big one).
async function llSaveAll() {
  if (typeof lgxBuild !== 'function') return;
  llNote('Getting all five groups…');
  try { await Promise.all(LL_LISTS.map(l => llFetch(l.id))); } catch (e) { console.error(e); llNote('A group did not load. Try again.'); return; }
  const nums = new Set(['Days since', 'Numbers matched', 'Visits since Jan 2025']);
  let total = 0;
  const parts = LL_LISTS.map(l => llLines(l.id, llFiltered(l.id, false)));
  llNote(`Adding her visits to ${lcNum(parts.reduce((n, p) => n + p.rows.length, 0))} rows…`);
  try { await llFetchVisits(parts.flatMap(p => p.rows.map(r => r.client_name))); await Promise.all(parts.map(p => llAddVisits(p))); }
  catch (e) { console.error(e); llNote('Her visits did not load, so the file was not saved. Try again.'); return; }
  const sheets = LL_LISTS.map((l, li) => {
    const { head, lines } = parts[li];
    total += lines.length;
    return { name: ('Group ' + l.id + ' - ' + l.t).slice(0, 31), blocks: [{ cols: head.map(h => ({ label: h, fmt: nums.has(h) ? 'num' : 'text' })), rows: lines.map(x => ({ cells: x })) }] };
  });
  const name = ['lost-clients-all-groups', llSel.area !== 'all' ? llSel.area.toLowerCase().replace(' ', '-') : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  lgxSave(lgxXlsxBlob(lgxBuild({ sheets })), name + '.xlsx');
  llNote(`Saved ${lcNum(total)} rows on ${sheets.length} sheets`);
}
async function llSaveFile(kind) {
  if (typeof lgxBuild !== 'function') return;
  const parts = llLines();
  llNote(`Adding her visits to ${lcNum(parts.rows.length)} rows…`);
  try { await llAddVisits(parts); } catch (e) { console.error(e); llNote('Her visits did not load, so the file was not saved. Try again.'); return; }
  const { head, lines } = parts;
  const nums = new Set(['Days since', 'Numbers matched', 'Visits since Jan 2025']);
  const cols = head.map(h => ({ label: h, fmt: nums.has(h) ? 'num' : 'text' }));
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' && pi >= 0 ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;   // as lost-clients.js: Excel would show 9.72E+11
  const built = lgxBuild({ sheets: [{ name: ('Group ' + llList().id + ' - ' + llList().t).slice(0, 31)   /* the app's "Group 1: Smoothing, lost"; Excel does not allow a colon in a sheet name, so a dash */, blocks: [{ cols, rows: out.map(l => ({ cells: l })) }] }] });
  const name = ['lost-clients-list', llSel.list, llSel.area !== 'all' ? llSel.area.toLowerCase().replace(' ', '-') : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  llNote(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}
