// Client Mix (Kate, 8 Oct 2026), built from Downloads/client-mix-mockup.html on the same footing
// as Top Clients (top-clients.js) and Client's Last Visit (lost-clients.js, which loads first and
// whose helpers lcEsc, lcNum, lcDayY, lcToggleDetail and lcDetailHtml this reuses).
//
// How many DIFFERENT clients had colour, hair treatments, nails or beauty, or bought retail, how
// many units that came to, and which clients they were. Everything is read from
// sales_transaction_lines (Jan 2025 on) through migrations/client_mix.sql:
//   client_mix_cards    one number per family, for the cards
//   client_mix_detail   one family, narrowed by "also had" / "did not have", a Phorest category
//                       and an item: the items table, the category pills and the client list
//   service_roster      the Service roster tab: Phorest's own categories, which family each
//                       belongs to, and what could not be sorted
// A sales line only has the item NAME, so each item is sorted by Phorest's Services list
// (Manager > Services > Export all services), kept in service_catalog; retired names from before
// the Nov 2025 menu rename are sorted by name rules and listed on the roster tab.
//
// Own controls (branch, period), so the masthead filters are hidden here, as on Top Clients.
// Everyone signed in sees counts and names; only Level 2 and above can open a client (the same
// lost_client_detail panel as Top Clients); only Level 4 and above can change the roster.
const CM_STORE = 'trs-client-mix';
const CM = { branch: 'all', period: 'last', month: '', year: '', pfrom: '', pto: '', mode: 'clients', fam: 'colour',
  cat: null, item: null, tri: {}, tab: 'mix' };
let cmCards = null, cmDetail = null, cmRoster = null, cmSeqC = 0, cmSeqD = 0, cmShowN = 25, cmStamp = 0, cmBusy = false;
const cmCache = {};
let cmItemsAll = false;
const CM_FIRST = '2021-08-01';   // sales_transaction_lines starts here (Aug 2021 at Khalifa City and Saadiyat)
const cmIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cmToday = () => cmIso(new Date());
try {
  const s = JSON.parse(localStorage.getItem(CM_STORE) || '{}');
  for (const k of ['branch', 'period', 'month', 'year', 'pfrom', 'pto', 'mode', 'fam']) if (typeof s[k] === 'string') CM[k] = s[k];
} catch (e) {}
function cmSave() { try { localStorage.setItem(CM_STORE, JSON.stringify({ branch: CM.branch, period: CM.period, month: CM.month, year: CM.year, pfrom: CM.pfrom, pto: CM.pto, mode: CM.mode, fam: CM.fam })); } catch (e) {} }

const CM_PERIODS = [['this', 'This month'], ['last', 'Last month'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom']];
// Families: how the dashboard groups Phorest's categories. 'unmapped' is a Phorest category nobody
// has given a family yet; 'skip' (deposits, vouchers, packages, no-shows) is never counted.
const CM_FAMS = [
  { k: 'colour', name: 'Colour', color: '#7C5CD4' },
  { k: 'treat', name: 'Hair treatments', color: '#0F8F7A' },
  { k: 'cut', name: 'Cut & style', color: '#2F7DB5' },
  { k: 'nails', name: 'Nails', color: '#D9822B' },
  { k: 'beauty', name: 'Beauty', color: '#C2416A' },
  { k: 'retail', name: 'Retail', color: '#B7791F' },
  { k: 'extensions', name: 'Hair extensions', color: '#A0522D' },
  { k: 'consult', name: 'Consultations', color: '#5B6B8C' },
  { k: 'other', name: 'Other', color: '#7A7A7A' },
  { k: 'unmapped', name: 'Unmapped', color: '#999999' },
];
const cmFam = k => CM_FAMS.find(f => f.k === k) || CM_FAMS[CM_FAMS.length - 1];
const cmCanEdit = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 4;
const cmCanOpen = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;

// ── THE WINDOW ──────────────────────────────────────────────────────────────
function cmYears() {   // newest first, back to the first year with sales lines
  const out = [];
  for (let y = new Date().getFullYear(); y >= Number(CM_FIRST.slice(0, 4)); y--) out.push(String(y));
  return out;
}
function cmMonths() {   // newest first, back to Aug 2021
  const out = [], now = new Date();
  for (let y = now.getFullYear(), m = now.getMonth(); y > 2021 || (y === 2021 && m >= 7);) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    if (--m < 0) { m = 11; y--; }
  }
  return out;
}
const cmMonthLabel = ym => new Date(ym + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
function cmRange() {
  const today = cmToday(), now = new Date(), y = now.getFullYear(), pad = n => String(n).padStart(2, '0');
  const lastDay = ym => { const [yy, mm] = ym.split('-').map(Number); return cmIso(new Date(yy, mm, 0)); };
  let a, b;
  if (CM.period === 'this') { a = `${y}-${pad(now.getMonth() + 1)}-01`; b = today; }
  else if (CM.period === 'last') { const p = new Date(y, now.getMonth() - 1, 1); const ym = cmIso(p).slice(0, 7); a = ym + '-01'; b = lastDay(ym); }
  else if (CM.period === 'month') { const ym = /^\d{4}-\d{2}$/.test(CM.month) ? CM.month : today.slice(0, 7); a = ym + '-01'; b = lastDay(ym); }
  else if (CM.period === 'custom') { a = CM.pfrom || `${y}-01-01`; b = CM.pto || today; }
  else { const yy = /^\d{4}$/.test(CM.year) ? Number(CM.year) : y; a = `${yy}-01-01`; b = yy === y ? today : `${yy}-12-31`; }
  if (a < CM_FIRST) a = CM_FIRST;
  if (b > today) b = today;
  if (b < a) b = a;
  return [a, b];
}
const cmPeriodTxt = () => { const r = cmRange(); return lcDayY(r[0]) + ' to ' + lcDayY(r[1]); };
const cmBranchArg = () => CM.branch === 'all' ? null : CM.branch;
const cmBranchTxt = () => CM.branch === 'all' ? 'All branches' : lcBranchName(CM.branch);
function cmArgs(extra) {
  const [a, b] = cmRange();
  return Object.assign({ p_from: a, p_to: b, p_branch: cmBranchArg() }, extra || {});
}
function cmDetailArgs(limit) {
  const w = [], wo = [];
  Object.keys(CM.tri).forEach(k => (CM.tri[k] === 'with' ? w : wo).push(k));
  return cmArgs({ p_fam: CM.fam, p_with: w, p_without: wo, p_cat: CM.cat, p_item: CM.item, p_limit: limit || 300 });
}
// One ask per distinct question, kept ten minutes (a changed pill asks again, a changed-back one does not).
function cmCall(name, args) {
  const key = name + JSON.stringify(args || {});
  if (!cmCache[key]) {
    cmCache[key] = Promise.resolve(sb.rpc(name, args || {})).then(r => {
      if (r.error) { delete cmCache[key]; throw r.error; }
      return r.data;
    }, e => { delete cmCache[key]; throw e; });
  }
  return cmCache[key];
}
const cmForget = () => Object.keys(cmCache).forEach(k => delete cmCache[k]);

// ── CONTROLS ────────────────────────────────────────────────────────────────
function cmSet(k, v) {
  CM[k] = v;
  if (k === 'pfrom' && CM.pto && CM.pto < v) CM.pto = v;
  if (k === 'pto' && CM.pfrom && CM.pfrom > v) CM.pfrom = v;
  if (k === 'branch' || k === 'period' || k === 'month' || k === 'year' || k === 'pfrom' || k === 'pto') { CM.item = null; cmShowN = 25; }
  cmSave();
  if (k === 'mode') { cmPaintCards(); cmPaintDetail(); return; }
  renderClientMix();
}
function cmPickFam(k) {
  if (k === 'unmapped') { cmTab('roster'); return; }
  CM.fam = k; CM.cat = null; CM.item = null; CM.tri = {}; cmShowN = 25; cmItemsAll = false; cmSave();
  cmPaintCards(); cmLoadDetail();
}
function cmTri(k) {
  const t = CM.tri[k];
  if (!t) CM.tri[k] = 'with'; else if (t === 'with') CM.tri[k] = 'without'; else delete CM.tri[k];
  CM.item = null; cmShowN = 25; cmPaintNarrow(); cmLoadDetail();
}
function cmPickCat(c) { CM.cat = c || null; CM.item = null; cmShowN = 25; cmItemsAll = false; cmLoadDetail(); }
function cmPickItem(i) {
  const it = cmDetail && cmDetail.items[i];
  if (!it) return;
  CM.item = CM.item === it.stem ? null : it.stem; cmShowN = 25; cmLoadDetail();
}
function cmMore() { cmShowN += 25; cmPaintList(); }
function cmAllItems() { cmItemsAll = true; cmPaintItems(); }
function cmTab(t) {
  CM.tab = t;
  document.getElementById('cmPageMix').style.display = t === 'mix' ? '' : 'none';
  document.getElementById('cmPageRoster').style.display = t === 'roster' ? '' : 'none';
  document.querySelectorAll('.cm-tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if (t === 'roster') cmLoadRoster();
}

function cmShell() {
  const seg = (key, opts) => `<div class="sc-seg" role="group">${opts.map(([k, l]) =>
    `<button type="button" class="${String(CM[key]) === String(k) ? 'on' : ''}" onclick="cmSet('${key}','${k}')">${l}</button>`).join('')}</div>`;
  let sub = '';
  if (CM.period === 'year') sub += `<div class="lc-cust"><span>Year</span><select aria-label="Year" onchange="cmSet('year', this.value)">${cmYears().map(y =>
    `<option value="${y}"${cmRange()[0].slice(0, 4) === y ? ' selected' : ''}>${y}</option>`).join('')}</select></div>`;
  if (CM.period === 'month') sub += `<div class="lc-cust"><span>Month</span><select aria-label="Month" onchange="cmSet('month', this.value)">${cmMonths().map(m =>
    `<option value="${m}"${cmRange()[0].slice(0, 7) === m ? ' selected' : ''}>${cmMonthLabel(m)}</option>`).join('')}</select></div>`;
  if (CM.period === 'custom') { const [a, b] = cmRange(); sub += `<div class="lc-cust"><span>From</span><input type="date" style="width:auto" value="${a}" min="${CM_FIRST}" max="${cmToday()}" aria-label="From date" onchange="cmSet('pfrom', this.value)"><span>to</span><input type="date" style="width:auto" value="${b}" min="${CM_FIRST}" max="${cmToday()}" aria-label="To date" onchange="cmSet('pto', this.value)"></div>`; }
  return `
    <section class="slv-intro">
      <h2>Client Mix</h2>
      <p>How many different clients had colour, hair treatments, nails or beauty, or bought retail, and how many units that came to. Click a card, then see exactly who they were.</p>
    </section>
    <div class="cm-tabs" role="tablist">
      <button type="button" class="cm-tab${CM.tab === 'mix' ? ' on' : ''}" data-t="mix" onclick="cmTab('mix')">Client Mix</button>
      <button type="button" class="cm-tab${CM.tab === 'roster' ? ' on' : ''}" data-t="roster" onclick="cmTab('roster')">Service roster</button>
    </div>
    <div id="cmPageMix"${CM.tab === 'mix' ? '' : ' style="display:none"'}>
      <div class="sc-bar w13-bar lc-bar tc-bar cm-bar">
        <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Branch</div>${seg('branch', [['all', 'All']].concat(lcBranchKeys(cmRange()[1]).map(k => [k, k])))}</div>
        <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Period</div>${seg('period', CM_PERIODS)}</div>
        <div class="lc-grp"><div class="slv-eyebrow">Show</div>${seg('mode', [['clients', 'Clients'], ['units', 'Units']])}</div>
      </div>
      ${sub}
      <div class="cm-cards" id="cmCards"><p class="slv-muted">Counting clients…</p></div>
      <div class="cm-narrow" id="cmNarrow"></div>
      <div class="cm-pcats" id="cmPcats"></div>
      <p class="cm-summary" id="cmSummary"></p>
      <div class="cm-two">
        <section class="slv-card"><div class="slv-eyebrow" id="cmItemsTitle"></div><div id="cmItems"></div></section>
        <section class="slv-card"><div class="cm-tools"><div class="slv-eyebrow" id="cmListTitle"></div>
          <button type="button" class="cm-pill" id="cmCopy" onclick="cmCopy()">Copy list for Sheets</button></div>
          <div id="cmList"></div></section>
      </div>
      <p class="slv-muted cm-foot">From Phorest's Sales Transactions, which starts in August 2021. Each sale is sorted by Phorest's own service categories (see the Service roster tab). A client is counted once per family however many times she came. Units are sales lines; the second half of a keratin counts as the same treatment. Deposits, vouchers, refunds, prepaid courses and walk-ins are left out.</p>
    </div>
    <div id="cmPageRoster"${CM.tab === 'roster' ? '' : ' style="display:none"'}><p class="slv-muted" style="margin-top:16px">Loading the roster…</p></div>`;
}

// ── DRAW ────────────────────────────────────────────────────────────────────
async function renderClientMix() {
  const el = document.getElementById('clientMixContent');
  if (!el) return;
  if (CM.branch === 'FRT' && cmRange()[1] > LC_FRT_LAST) { CM.branch = 'all'; cmSave(); }   // Fratelli goes with windows past 22 May 2026
  if (Date.now() - cmStamp > 600000) { cmForget(); cmStamp = Date.now(); cmRoster = null; }
  lcDetailCtx = { branch: () => cmBranchArg(), html: d => lcDetailHtml(d, { allBranches: CM.branch === 'all' && ((d && d.branches) || []).length > 1 }) };
  el.innerHTML = cmShell();
  cmCards = null; cmDetail = null;
  cmLoadCards().then(() => { if (!cmCards) return; cmEnsureFam(); cmPaintCards(); cmLoadDetail(); });
  if (CM.tab === 'roster') cmLoadRoster();
}
function cmEnsureFam() {
  const have = (cmCards.fams || []).filter(f => f.family !== 'skip');
  if (!have.some(f => f.family === CM.fam) && have.length) {
    const first = CM_FAMS.find(f => f.k !== 'unmapped' && have.some(h => h.family === f.k));
    if (first) CM.fam = first.k;
  }
}
async function cmLoadCards() {
  const seq = ++cmSeqC;
  try {
    const d = await cmCall('client_mix_cards', cmArgs());
    if (seq !== cmSeqC) return;
    cmCards = d || { fams: [], total_clients: 0 };
  } catch (e) {
    console.error(e);
    if (seq === cmSeqC) { const b = document.getElementById('cmCards'); if (b) b.innerHTML = '<p class="slv-muted">The client counts did not load. Refresh to try again.</p>'; }
  }
}
async function cmLoadDetail() {
  const seq = ++cmSeqD;
  cmBusy = true; cmShowBusy();
  try {
    const d = await cmCall('client_mix_detail', cmDetailArgs());
    if (seq !== cmSeqD) return;
    cmDetail = d; cmBusy = false;
  } catch (e) {
    console.error(e);
    if (seq === cmSeqD) { cmBusy = false; cmDetail = null; const b = document.getElementById('cmList'); if (b) b.innerHTML = '<p class="slv-muted">The client list did not load. Refresh to try again.</p>'; }
    return;
  }
  cmPaintDetail();
}
function cmShowBusy() {
  ['cmItems', 'cmList'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.toggle('cm-busy', cmBusy); });
}

function cmPaintCards() {
  const box = document.getElementById('cmCards');
  if (!box || !cmCards) return;
  const total = Number(cmCards.total_clients) || 0;
  const by = {}; (cmCards.fams || []).forEach(f => { by[f.family] = f; });
  const fams = CM_FAMS.filter(f => (by[f.k] && by[f.k].clients > 0) && (f.k !== 'unmapped' || true));
  if (!fams.length) { box.innerHTML = '<p class="slv-muted">No sales in this period.</p>'; return; }
  const units = CM.mode === 'units';
  box.innerHTML = fams.map(f => {
    const d = by[f.k];
    const big = units ? d.units : d.clients, other = units ? `${lcNum(d.clients)} clients` : `${lcNum(d.units)} units`;
    const sub = f.k === 'unmapped' ? 'needs a family in the roster' : `${other} · ${total ? Math.round(100 * d.clients / total) : 0}% of clients in this view`;
    return `<button type="button" class="cm-cat${f.k === 'unmapped' ? ' un' : ''}${CM.fam === f.k ? ' on' : ''}" style="--c:${f.color}" onclick="cmPickFam('${f.k}')">
      <div class="cm-nm">${f.name}</div><div class="cm-n">${lcNum(big)}</div><div class="cm-k">${sub}</div></button>`;
  }).join('');
  cmPaintNarrow();
}
function cmPaintNarrow() {
  const box = document.getElementById('cmNarrow');
  if (!box || !cmCards) return;
  const others = CM_FAMS.filter(f => f.k !== CM.fam && f.k !== 'unmapped' && (cmCards.fams || []).some(x => x.family === f.k && x.clients > 0));
  box.innerHTML = `<span class="slv-eyebrow">Narrow it down</span><div class="cm-row">` + others.map(f => {
    const t = CM.tri[f.k] || '';
    const label = t === 'with' ? 'Also had ' + f.name : t === 'without' ? 'No ' + f.name : f.name;
    return `<button type="button" class="cm-chip ${t}" onclick="cmTri('${f.k}')">${lcEsc(label)}</button>`;
  }).join('') + `</div><span class="slv-note">once = also had, twice = did not have</span>`;
}
function cmPaintDetail() {
  cmShowBusy();
  const d = cmDetail;
  const sum = document.getElementById('cmSummary');
  if (!d || !sum) return;
  const f = cmFam(CM.fam);
  // Phorest category pills (counts are for the family as narrowed, not for the pill picked).
  const pc = document.getElementById('cmPcats');
  if (pc) {
    const cats = (d.cats || []).slice().sort((a, b) => b.clients - a.clients);
    pc.innerHTML = `<span class="slv-eyebrow">Phorest category</span><div class="sc-seg cm-seg" role="group">` +
      `<button type="button" class="${CM.cat ? '' : 'on'}" onclick="cmPickCat('')">All</button>` +
      cats.map(c => `<button type="button" class="${CM.cat === c.category ? 'on' : ''}" data-c="${lcEsc(c.category)}" onclick="cmPickCat(this.dataset.c)">${lcEsc(c.category)} <em>${lcNum(c.clients)}</em></button>`).join('') + `</div>`;
  }
  const narrowTxt = Object.keys(CM.tri).map(k => (CM.tri[k] === 'with' ? 'also had ' : 'no ') + cmFam(k).name.toLowerCase()).join(', ');
  sum.innerHTML = `<b>${lcNum(d.clients)} client${Number(d.clients) === 1 ? '' : 's'}</b> had ${lcEsc(f.name.toLowerCase())}${CM.cat ? ' (' + lcEsc(CM.cat) + ')' : ''}${narrowTxt ? ' and ' + lcEsc(narrowTxt) : ''}, for <b>${lcNum(d.units)} unit${Number(d.units) === 1 ? '' : 's'}</b>. ${lcEsc(cmBranchTxt())}, ${lcEsc(cmPeriodTxt())}.`;
  cmPaintItems();
  cmPaintList();
}
function cmPaintItems() {
  const d = cmDetail, box = document.getElementById('cmItems');
  if (!d || !box) return;
  document.getElementById('cmItemsTitle').textContent = cmFam(CM.fam).name + ', by item';
  const key = CM.mode === 'units' ? 'units' : 'clients';
  const items = (d.items || []).map((x, i) => Object.assign({ _i: i }, x)).sort((a, b) => b[key] - a[key] || b.clients - a.clients);
  const mx = Math.max(1, ...items.map(x => x[key]));
  const color = cmFam(CM.fam).color;
  const shownItems = (cmItemsAll || !window.matchMedia('(max-width:760px)').matches) ? items : items.slice(0, 8);
  box.innerHTML = items.length ? `<div class="slv-wrap"><table class="slv-table cm-items"><thead><tr><th class="lc-l">Item</th><th>Clients</th><th>Units</th></tr></thead><tbody>${shownItems.map(x =>
    `<tr class="cm-item${CM.item === x.stem ? ' sel' : ''}" onclick="cmPickItem(${x._i})"><td class="lc-l"><span class="tc-name">${lcEsc(x.stem)}</span><div class="cm-cell-cat">${lcEsc(x.category)}</div><div class="cm-bar1" style="--c:${color}"><i style="width:${Math.round(100 * x[key] / mx)}%"></i></div></td><td>${lcNum(x.clients)}</td><td>${lcNum(x.units)}</td></tr>`).join('')}</tbody></table></div>
    <p class="slv-note" style="margin-top:8px">Click an item to list only the clients who had it.${(d.items || []).length >= 80 ? ' Showing the 80 most common.' : ''}</p>${shownItems.length < items.length ? `<p style="margin:8px 0 0"><button type="button" class="cm-pill" onclick="cmAllItems()">Show all ${items.length} items</button></p>` : ''}`
    : '<p class="slv-muted">Nothing here for these filters.</p>';
}
function cmPaintList() {
  const d = cmDetail, box = document.getElementById('cmList');
  if (!d || !box) return;
  const rows = d.rows || [], matched = Number(d.matched) || rows.length;
  document.getElementById('cmListTitle').textContent = `${lcNum(matched)} client${matched === 1 ? '' : 's'}${CM.item ? ' who had ' + CM.item : ''}`;
  lcShown = rows;
  const open = cmCanOpen(), cls = open ? 'lc-row' : 'tc-flat';
  const click = i => open ? ` onclick="lcToggleDetail(event,${i})"` : '';
  const shown = rows.slice(0, cmShowN);
  const tags = (r, max) => (r.bought || []).slice(0, max).map(b => `<span class="cm-tag" style="--c:${cmFam(b.f).color}">${lcEsc(b.s)}${b.u > 1 ? ' x' + b.u : ''}</span>`).join('');
  const tr = shown.map((r, i) => `<tr class="${cls}"${open ? ' title="Click to see everything she came in for"' : ''}${click(i)}>
      <td class="lc-stc"><span class="tc-name">${lcEsc(r.client_name)}</span>${open ? '<span class="lc-hint" aria-hidden="true">See her visits ›</span>' : ''}<div class="slv-note">${lcEsc(r.branch || '')} · ${lcNum(r.visits)} visit${Number(r.visits) === 1 ? '' : 's'}</div></td>
      <td class="lc-l cm-bought">${tags(r, 10)}</td><td>${lcNum(r.units)}</td></tr>`).join('');
  const cards = shown.map((r, i) => `<li class="prd-card ${cls}"${click(i)}><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}</span><span class="prd-spend">${lcNum(r.units)} unit${Number(r.units) === 1 ? '' : 's'}</span></div>
      <div class="prd-meta">${lcEsc(r.branch ? lcBranchName(r.branch) : '')} · ${lcNum(r.visits)} visit${Number(r.visits) === 1 ? '' : 's'}</div>
      <div class="prd-meta" style="margin-top:4px">${tags(r, 6)}</div>
      ${open ? '<div class="lc-hint-m">Tap for her visits ›</div>' : ''}</div></li>`).join('');
  const more = rows.length > shown.length ? `<p style="margin:10px 0 0"><button type="button" class="cm-pill" onclick="cmMore()">Show ${Math.min(25, rows.length - shown.length)} more</button> <span class="slv-note">${lcNum(shown.length)} of ${lcNum(matched)}${matched > rows.length ? ' (the top ' + lcNum(rows.length) + ' are loaded)' : ''}</span></p>` : '';
  const empty = 'No one matches those filters. Try a wider period, or clear a filter.';
  box.innerHTML = `<div class="slv-wrap prd-desk lc-wrap tc-wrap"><table class="slv-table"><thead><tr><th class="lc-l">Client</th><th class="lc-l">Bought</th><th>${CM.item || CM.cat ? 'Units here' : 'Units'}</th></tr></thead>
      <tbody>${tr || `<tr><td colspan="3" class="slv-muted">${empty}</td></tr>`}</tbody></table></div>
    <ol class="prd-cards">${cards || `<li class="slv-muted">${empty}</li>`}</ol>${more}
    <p class="slv-note" style="margin-top:8px">Sorted by units in ${lcEsc(cmFam(CM.fam).name.toLowerCase())}${CM.cat ? ', ' + lcEsc(CM.cat) : ''}. Tags are what she bought in this period, her ${lcEsc(cmFam(CM.fam).name.toLowerCase())} first.</p>`;
}

// Copy for Sheets: asks again for everyone, not just the 300 on screen.
async function cmCopy() {
  const btn = document.getElementById('cmCopy');
  const say = t => { if (btn) btn.textContent = t; setTimeout(() => { if (btn) btn.textContent = 'Copy list for Sheets'; }, 2400); };
  try {
    if (btn) btn.textContent = 'Getting everyone…';
    const d = await cmCall('client_mix_detail', cmDetailArgs(5000));
    const rows = (d && d.rows) || [];
    const head = ['Client', 'Branch', 'Visits', 'Units', 'Bought'];
    const tsv = [head.join('\t')].concat(rows.map(r => [r.client_name, r.branch || '', r.visits, r.units,
      (r.bought || []).map(b => b.s + (b.u > 1 ? ' x' + b.u : '')).join('; ')].map(v => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t'))).join('\n');
    await navigator.clipboard.writeText(tsv);
    say(`Copied ${lcNum(rows.length)}, paste into Sheets`);
  } catch (e) { console.error(e); say('Copy did not work here'); }
}

// ── THE SERVICE ROSTER TAB ──────────────────────────────────────────────────
async function cmLoadRoster() {
  const box = document.getElementById('cmPageRoster');
  if (!box) return;
  if (!cmRoster) {
    box.innerHTML = '<p class="slv-muted" style="margin-top:16px">Loading the roster…</p>';
    try { cmRoster = await cmCall('service_roster'); }
    catch (e) { console.error(e); box.innerHTML = '<p class="slv-muted" style="margin-top:16px">The roster did not load. Refresh to try again.</p>'; return; }
  }
  cmPaintRoster();
}
function cmPaintRoster() {
  const box = document.getElementById('cmPageRoster'), r = cmRoster;
  if (!box || !r) return;
  const edit = cmCanEdit();
  const lp = Number(r.lines_phorest) || 0, lr = Number(r.lines_rule) || 0, ln = Number(r.lines_none) || 0, tot = lp + lr + ln || 1;
  const pct = v => (100 * v / tot).toFixed(1).replace(/\.0$/, '');
  const upd = r.catalog_updated ? lcDayY(String(r.catalog_updated).slice(0, 10)) : 'never';
  const cats = r.categories || [];
  const unm = cats.filter(c => c.family === 'unmapped');
  const famOpts = sel => CM_FAMS.filter(f => f.k !== 'unmapped').map(f => `<option value="${f.k}"${sel === f.k ? ' selected' : ''}>${f.name}</option>`).join('')
    + `<option value="skip"${sel === 'skip' ? ' selected' : ''}>Not counted</option>` + (sel === 'unmapped' ? '<option value="" selected disabled>Pick a family…</option>' : '');
  const list = (arr, withCat) => arr && arr.length ? `<div class="slv-wrap"><table class="slv-table"><thead><tr><th class="lc-l">Item in sales</th>${withCat ? '<th class="lc-l">Sorted as</th>' : ''}<th>Lines</th></tr></thead><tbody>${arr.map(x =>
    `<tr><td class="lc-l">${lcEsc(x.item)}</td>${withCat ? `<td class="lc-l cm-cell-cat">${lcEsc(x.category)}</td>` : ''}<td>${lcNum(x.lines)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="slv-muted">None.</p>';
  box.innerHTML = `
    <section class="slv-card" style="margin-top:16px">
      <div class="slv-eyebrow">Service roster</div>
      <p class="slv-note" style="font-size:14px;margin-top:6px;max-width:760px">Every service Phorest lists, with Phorest's own category. The four branches share one menu, so there is one roster. You only decide which <b>family</b> each category belongs to; sales never change, they are sorted by this list.</p>
      <div class="w13-tiles lc-tiles" style="margin-top:14px">
        <div class="w13-tile"><div class="slv-eyebrow">Services in the roster</div><div class="w13-val">${lcNum(r.catalog_count)}</div><div class="slv-note">refreshed ${lcEsc(upd)}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Matched by Phorest's list</div><div class="w13-val">${pct(lp)}%</div><div class="slv-note">${lcNum(lp)} sales lines since Aug 2021</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Matched by name</div><div class="w13-val">${pct(lr)}%</div><div class="slv-note">retired names, ${lcNum(lr)} lines</div></div>
        <div class="w13-tile${ln ? ' warn' : ''}"><div class="slv-eyebrow">Not sorted</div><div class="w13-val">${pct(ln)}%</div><div class="slv-note">${lcNum(ln)} lines, shown below</div></div>
      </div>
      ${unm.length ? `<div class="cm-warn"><b>${unm.length} Phorest categor${unm.length === 1 ? 'y has' : 'ies have'} no family yet:</b> ${unm.map(c => lcEsc(c.category)).join(', ')}. Their clients show on the Client Mix tab as Unmapped until ${edit ? 'you pick one below' : 'a Level 4 login picks one'}.</div>` : ''}
    </section>
    ${edit ? `<section class="slv-card" style="margin-top:14px">
      <div class="slv-eyebrow">Refresh from Phorest</div>
      <p class="slv-note" style="font-size:14px;margin:6px 0 10px;max-width:760px">In Phorest, open Manager &gt; Services and press <b>Export all services</b>, then pick the file here (pick all four branches together if you like; repeats are merged). It replaces the roster only and never touches sales.</p>
      <input type="file" id="cmFile" accept=".csv,text/csv" multiple onchange="cmRefresh(this)">
      <p class="slv-note" id="cmRefreshMsg" style="margin-top:8px"></p>
    </section>` : ''}
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-eyebrow">Phorest categories and their family</div>
      <div class="slv-wrap prd-desk"><table class="slv-table"><thead><tr><th class="lc-l">Phorest category</th><th>Services</th><th>Sales lines</th><th class="lc-l">Family</th></tr></thead><tbody>${cats.map(c =>
        `<tr class="${c.family === 'unmapped' ? 'cm-unm' : ''}"><td class="lc-l">${lcEsc(c.category)}${c.family === 'unmapped' ? ' <b>(new)</b>' : ''}</td><td>${lcNum(c.services)}</td><td>${lcNum(c.lines)}</td>
         <td class="lc-l"><select data-c="${lcEsc(c.category)}" onchange="cmSetFamily(this)"${edit ? '' : ' disabled'}>${famOpts(c.family)}</select></td></tr>`).join('')}</tbody></table></div>
      <ol class="prd-cards">${cats.map(c => `<li class="prd-card${c.family === 'unmapped' ? ' cm-unm-card' : ''}"><div class="prd-body">
        <div class="prd-top"><span class="prd-name">${lcEsc(c.category)}${c.family === 'unmapped' ? ' <b>(new)</b>' : ''}</span><span class="prd-spend">${lcNum(c.lines)} lines</span></div>
        <div class="prd-meta">${lcNum(c.services)} service${Number(c.services) === 1 ? '' : 's'}</div>
        <select class="cm-sel-m" data-c="${lcEsc(c.category)}" onchange="cmSetFamily(this)"${edit ? '' : ' disabled'}>${famOpts(c.family)}</select></div></li>`).join('')}</ol>
      ${edit ? '' : '<p class="slv-note" style="margin-top:8px">Only a Level 4 login can change these.</p>'}
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-eyebrow">Not sorted yet</div>
      <p class="slv-note" style="margin:6px 0 8px">Items in sales that are not on Phorest's list and no name rule covers. They count under Unmapped. Most are polish colours and accessories.</p>
      ${list(r.unmapped, false)}
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-eyebrow">Sorted by name rule</div>
      <details><summary class="slv-note" style="cursor:pointer;margin-top:6px">Retired or renamed items, matched by the words in the name (${lcNum(lr)} lines). Check these look right.</summary>${list(r.by_rule, true)}</details>
    </section>`;
}
async function cmSetFamily(sel) {
  const cat = sel.dataset.c, fam = sel.value;
  if (!fam) return;
  sel.disabled = true;
  try {
    const { error } = await sb.rpc('service_set_family', { p_category: cat, p_family: fam });
    if (error) throw error;
    cmForget(); cmRoster = null; cmCards = null;
    await renderClientMix();
  } catch (e) { console.error(e); sel.disabled = false; alert('That did not save: ' + (e.message || e)); cmRoster = null; cmLoadRoster(); }
}

// A small CSV reader (quoted fields, doubled quotes, CRLF).
function cmParseCsv(text) {
  const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') out.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); out.push(row); }
  return out;
}
async function cmRefresh(inp) {
  const msg = document.getElementById('cmRefreshMsg');
  const say = t => { if (msg) msg.textContent = t; };
  const files = [...(inp.files || [])];
  if (!files.length) return;
  try {
    const rows = [];
    for (const f of files) {
      const t = (await f.text()).replace(/^﻿/, '');
      const tab = cmParseCsv(t), head = (tab[0] || []).map(h => h.trim().toLowerCase());
      const ni = head.indexOf('service_name'), ci = head.indexOf('category_name');
      if (ni < 0 || ci < 0) throw new Error(`${f.name} is not Phorest's services export (no service_name / category_name columns)`);
      tab.slice(1).forEach(r => { if ((r[ni] || '').trim() && (r[ci] || '').trim()) rows.push({ service_name: r[ni], category: r[ci] }); });
    }
    say(`Sending ${lcNum(rows.length)} services…`);
    const { data, error } = await sb.rpc('service_catalog_replace', { p_rows: rows });
    if (error) throw error;
    const nc = (data && data.new_categories) || [];
    cmForget(); cmRoster = null; cmCards = null;
    await renderClientMix();
    const m = document.getElementById('cmRefreshMsg');
    if (m) m.textContent = `Done: ${lcNum(data.services)} services.` + (nc.length ? ` ${nc.length} new categor${nc.length === 1 ? 'y' : 'ies'} need a family: ${nc.join(', ')}.` : ' No new categories.');
  } catch (e) { console.error(e); say('That did not work: ' + (e.message || e)); }
}
