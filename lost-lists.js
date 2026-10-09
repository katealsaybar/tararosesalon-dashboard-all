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
    def: '<b>In:</b> no visit of any kind since 9 Apr 2026, and a smoothing (keratin or Supreme Straighten) between May 2025 and May 2026. <b>Out:</b> anyone with a booking.' },
  { id: '2', t: 'Smoothing, not back', d: 'Last smoothing 6+ months ago, no booking', ch: 'WhatsApp + text', svc: 'Last smoothing',
    def: '<b>In:</b> everyone in group 1, plus clients who still come in for other services but have not had smoothing since. "Still visiting" tells them apart. <b>Out:</b> anyone with a booking.' },
  { id: '3', t: 'Colour', d: 'Lost 6+ months, hair colour or toner in the window', ch: 'Text (25% off) + WhatsApp', svc: 'Last colour',
    def: '<b>In:</b> lost clients with colouring, highlights, balayage, bleach or toner (tagged "Toner only") between May 2025 and May 2026. Use the area switch for Dubai (Motor City, Al Quoz) or Abu Dhabi (Saadiyat, Khalifa City A). <b>Out:</b> anyone with a booking.' },
  { id: '4', t: 'All 6m+, WhatsApp', d: 'Everyone due, WhatsApp only', ch: 'WhatsApp only', svc: 'Services in window',
    def: '<b>In:</b> every lost client who is a respond.io contact and has no booking, from visits since Jan 2025. <b>Out:</b> text-only, no number, booked. Clients who last came before 2025 are not in yet.' },
  { id: '5', t: 'Other services', d: 'Lost 6+ months, no hair colour', ch: 'WhatsApp + text', svc: 'Services in window',
    def: '<b>In:</b> lost clients who had a cut, treatment, beauty, nails or extensions between May 2025 and May 2026 and <b>no</b> hair colour or toner. <b>Out:</b> anyone with a booking; visits that were only retail.' },
];
const LL_PER = [10, 20, 50, 100];
let llSel = { list: '1', area: 'all', off: [], hideSent: true, per: 20, sort: 'recent' };   // hideSent: hide anyone messaged since the campaign start
try { Object.assign(llSel, JSON.parse(localStorage.getItem('trs-lost-lists') || '{}')); } catch (e) {}
let llHost = null, llSum = null, llRows = {}, llErr = '', llPage = 1, llQuery = '', llShown = [], llBusy = false;
const llSave = () => { try { localStorage.setItem('trs-lost-lists', JSON.stringify(llSel)); } catch (e) {} };
const llPhones = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3;
// "Group 1: Smoothing, lost": the number is the group's name everywhere (Kate, 9 Oct 2026), so nobody has to guess what a bare 1 to 5 means.
const llName = l => `Group ${l.id}: ${l.t}`;
const llList = () => LL_LISTS.find(l => l.id === llSel.list) || LL_LISTS[0];
// Short date for the table (no year in this year), the full one for chips, cards and files.
const llDayS = d => { if (!d) return ''; const x = new Date(String(d).slice(0, 10) + 'T00:00:00'); return x.toLocaleDateString('en-GB', x.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' }); };
const llDay = d => d ? lcDayY(String(d).slice(0, 10)) : '';
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
    <p>Coach Emma's outreach lists: who is lost, who is ready on WhatsApp and who is text only.</p></section><div id="llHost"></div>`;
  renderLostLists(document.getElementById('llHost'));
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
  llSel.list = id; llSel.off = []; llSel.area = 'all'; llPage = 1; llQuery = ''; llSave();
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
function llSendReady() { llSel.off = LL_ST_ORDER.filter(s => s !== 'act' && s !== 'r18'); llRefresh(); }
function llAllSt() { llSel.off = []; llRefresh(); }

// What the filters leave of the list on screen.
function llFiltered() {
  const rows = llRows[llSel.list] || [], q = llQuery.trim().toLowerCase();
  let out = rows.filter(r => !llSel.off.includes(r.wa)
    && (llSel.area === 'all' || r.area === llSel.area)
    && !(llSel.hideSent && r.messaged)
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
    <div class="ll-cards">${LL_LISTS.map(l => llCard(l)).join('')}</div>
    <p class="ll-explain"><b>Ready on WhatsApp</b> = wrote to one of our numbers in the last 18 months. <b>No reply seen</b> = in respond.io, but no reply in their last 50 messages. <b>Text only</b> = not in respond.io; <b>no number</b> = nothing usable in Phorest.</p>
    ${held ? `<p class="slv-note">${lcNum(held)} more are already booked and are kept off every group.</p>` : ''}
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
  // Kate, 9 Oct 2026: the tab row under the cards is gone, so the cards pick the list (they only reported before).
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

const llCats = c => String(c || '').split(', ').filter(Boolean).map(x => x.toLowerCase().replace(/\b\w/g, m => m.toUpperCase()).replace(/ Trt$/i, '')).join(', ');
// Kate, 9 Oct 2026: "+4 columns", and most of all for the clients who sit in more than one group. The one service
// column that changed with the group is four fixed ones: last smoothing, last colour, last toner and the services
// she had in the window, so a client in groups 1, 3 and 4 shows all of it on whichever list you are looking at.
const llDash = '<span class="slv-muted">–</span>';
const llDateCell = d => d ? lcEsc(llDayS(d)) : llDash;
// The phone card has no columns, so the same four become one line of what she has: Smoothing 12 Jul · Colour 3 Aug ...
function llSvcLine(r) {
  const bits = [['Smoothing', r.last_keratin], ['Colour', r.last_colour], ['Toner', r.last_toner]].filter(x => x[1]).map(x => `${x[0]} ${lcEsc(llDayS(x[1]))}`);
  const cats = llCats(r.cats);
  return bits.concat(cats ? [lcEsc(cats)] : []).join(' · ') || '–';
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
      ${ph ? '<button type="button" class="tglr lc-btn" onclick="llCopy()" title="Copy the numbers of the clients shown">Copy numbers</button>' : ''}
      <button type="button" class="tglr lc-btn" onclick="llSaveFile('xlsx')" title="Download what is shown as Excel">XLSX</button>
      <button type="button" class="tglr lc-btn" onclick="llSaveFile('csv')" title="Download what is shown as CSV">CSV</button>
      <span id="llNote" class="slv-note" style="display:inline"></span>
    </div>
    <div id="llTable"></div>
    <p class="slv-muted ll-foot">Lost means no visit of any kind for 6 months, at any branch. WhatsApp status and Messaged come from respond.io, checked every night (a text sent from another system is not seen). ${ph ? '' : 'Phone numbers are for Level 3 and above. '}Clients with a booking are kept off the lists, and the booking list is only as fresh as the last time it was pulled. Click Client, Last visit, WhatsApp or Messaged to filter or sort.</p>`;
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
  const ready = rows.filter(r => r.wa === 'act' || r.wa === 'r18').length, sentN = all.filter(r => r.messaged).length;
  const cnt = document.getElementById('llCount');
  if (cnt) cnt.textContent = `${lcNum(rows.length)} shown of ${lcNum(all.length)}${ready ? ` · ${lcNum(ready)} ready on WhatsApp` : ''}${sentN ? ` · ${lcNum(sentN)} already messaged` : ''}`;
  const two = r => r.n_numbers > 1 ? ' <span class="lc-2nums" tabindex="0" title="This name matches more than one client in Phorest, so the number may be someone else\'s. Check before you send.">2 numbers?</span>' : '';
  const cols = ['Client', 'Last visit', 'Last smoothing', 'Last colour', 'Last toner', 'Services', 'Usual team'].concat(ph ? ['Phone'] : [], ['WhatsApp', 'Also on', 'Messaged']);
  const th = (label, k, marked) => k ? `<th><button type="button" class="ll-thb${marked ? ' on' : ''}" onclick="llMenu(event,'${k}')" aria-haspopup="dialog" title="Filter or sort">${lcEsc(label)} <span aria-hidden="true">▾</span></button></th>` : `<th>${lcEsc(label)}</th>`;
  const heads = th('Client', 'client', llSel.area !== 'all') + th('Last visit', 'last', llSel.sort === 'oldest') + th('Last smoothing') + th('Last colour') + th('Last toner') + th('Services') + th('Usual team')
    + (ph ? th('Phone') : '') + th('WhatsApp', 'wa', llSel.off.length > 0) + th('In groups') + th('Messaged', 'msg', llSel.hideSent);
  // Usual team: her usual stylist and usual beautician, one line each (the row panel has everyone else).
  const team = r => { const t = lcTeam(r); const w = [t.hair[0], t.beauty[0]].filter(Boolean); return w.length ? w.map(n => `<div>${lcStylist(n)}</div>`).join('') : '<span class="slv-muted">–</span>'; };
  const tr = shown.map((r, i) => `<tr class="lc-row" title="Click to see what she came in for, what she took home and who looked after her" onclick="lcToggleDetail(event,${i})">
      <td>${lcEsc(r.client_name)}${two(r)}<div class="slv-note">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · ${lcEsc(r.area)}</div><span class="lc-hint" aria-hidden="true">See her visits ›</span></td>
      <td class="ll-nw">${lcEsc(llDayS(r.last_visit))}<div class="slv-note">${lcNum(r.days_since)} days</div></td>
      <td class="ll-nw">${llDateCell(r.last_keratin)}${r.still ? '<div><span class="ll-tag">Still visiting</span></div>' : ''}</td>
      <td class="ll-nw">${llDateCell(r.last_colour)}</td>
      <td class="ll-nw">${llDateCell(r.last_toner)}</td>
      <td class="ll-svcs">${llCats(r.cats) ? `<div class="ll-clamp" title="${lcEsc(llCats(r.cats))}">${lcEsc(llCats(r.cats))}</div>` : llDash}</td>
      <td class="lc-stc ll-team">${team(r)}</td>
      ${ph ? `<td class="ll-ph">${lcPhone(r)}</td>` : ''}
      <td>${llStatus(r)}</td><td>${llAlso(r)}</td><td>${llSentCell(r)}</td></tr>`).join('');
  const cards = shown.map((r, i) => `<li class="prd-card lc-row" onclick="lcToggleDetail(event,${i})"><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}${two(r)}</span><span>${llStatus(r)}</span></div>
      <div class="prd-meta">${lcEsc(LC_BRANCH[r.branch] || r.branch)} · last ${lcEsc(llDay(r.last_visit))} (${lcNum(r.days_since)} days) · ${llSvcLine(r)}</div>
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
  const rows = llFiltered().filter(r => r.mobile);
  const ok = rows.filter(r => r.n_numbers === 1);
  try { await navigator.clipboard.writeText(ok.map(r => r.mobile).join('\n')); }
  catch (e) { llNote('The browser would not copy. Use the file instead.'); return; }
  llNote(`Copied ${lcNum(ok.length)} numbers${rows.length > ok.length ? `, left out ${lcNum(rows.length - ok.length)} names that match more than one client` : ''}`);
}
function llLines() {
  const L = llList(), rows = llFiltered(), ph = llPhones();
  const since = llSum && llSum.fresh && llSum.fresh.campaign_from ? ' ' + llDay(llSum.fresh.campaign_from) : '';
  // The four service columns, as on screen: three dates (kept as dates, not mixed with words) and the services.
  const svc = r => [r.last_keratin || '', r.last_colour || '', r.last_toner || '', llCats(r.cats)];
  const type = L.id === '2' ? ['Type', r => r.still ? 'Still visiting' : 'Lost']
    : L.id === '3' ? ['Colour type', r => r.toner_only ? 'Toner only' : 'Colour, highlights, balayage or bleach'] : null;
  const head = ['Client', 'Area', 'Last branch', 'Last visit', 'Days since', 'Last smoothing', 'Last colour', 'Last toner', 'Services'].concat(type ? [type[0]] : [],
    ['Usual stylist', 'Usual beautician', 'Also saw'], ph ? ['Phone', 'Numbers matched'] : [],
    ['WhatsApp status', 'Last wrote to us', 'Last we messaged', 'Also in other groups', 'Messaged since' + since]);
  const lines = rows.map(r => {
    const t = lcTeam(r);
    return [r.client_name, r.area, LC_BRANCH[r.branch] || r.branch, r.last_visit, r.days_since].concat(svc(r), type ? [type[1](r)] : [],
      [t.hair[0] || '', t.beauty[0] || '', t.hair.slice(1).concat(t.beauty.slice(1)).join(', ')], ph ? [r.mobile || '', r.n_numbers] : [],
      [(LL_ST[r.wa] || [])[1] || r.wa, r.last_in || '', r.last_out || '', (r.also_on || []).filter(x => x !== L.id).sort().join(', '), r.messaged ? 'Yes' : '']);
  });
  return { head, lines };
}
function llSaveFile(kind) {
  if (typeof lgxBuild !== 'function') return;
  const { head, lines } = llLines();
  const nums = new Set(['Days since', 'Numbers matched']);
  const cols = head.map(h => ({ label: h, fmt: nums.has(h) ? 'num' : 'text' }));
  const pi = head.indexOf('Phone');
  const out = kind === 'csv' && pi >= 0 ? lines.map(l => l.map((v, j) => j === pi && v ? `="${v}"` : v)) : lines;   // as lost-clients.js: Excel would show 9.72E+11
  const built = lgxBuild({ sheets: [{ name: ('Group ' + llList().id + ' ' + llList().t.replace(/,/g, '')).slice(0, 31), blocks: [{ cols, rows: out.map(l => ({ cells: l })) }] }] });
  const name = ['lost-clients-list', llSel.list, llSel.area !== 'all' ? llSel.area.toLowerCase().replace(' ', '-') : '', new Date().toISOString().slice(0, 10)].filter(Boolean).join('-');
  if (kind === 'xlsx') lgxSave(lgxXlsxBlob(built), name + '.xlsx');
  else lgxSave(new Blob(['﻿' + lgxCsv(built[0])], { type: 'text/csv;charset=utf-8' }), name + '.csv');
  llNote(`Saved ${lcNum(lines.length)} rows as ${kind.toUpperCase()}`);
}
