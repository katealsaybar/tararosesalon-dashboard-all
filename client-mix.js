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
// Branch and period are the GLOBAL sticky header filter's (sel.branch, dateFrom and dateTo, Kate 29 Oct 2026), the same as Discounts and
// Vouchers: this page draws no Branch or Period bar of its own, only Show (clients or units). Several cards can be picked at once: the
// first one picked leads (its items and units), the rest are "also had", so the list is the clients who had ALL the picked cards.
// Everyone signed in sees counts and names; only Level 2 and above can open a client (the same
// lost_client_detail panel as Top Clients); only Level 4 and above can change the roster.
const CM_STORE = 'trs-client-mix';
const CM = { mode: 'clients', fams: ['colour'], cats: [], item: null, tri: {}, tab: 'mix', n: 10, any: false };
let cmCards = null, cmDetail = null, cmRoster = null, cmSeqC = 0, cmSeqD = 0, cmStamp = 0, cmBusy = false, cmWinKey = '';
const cmCache = {};
let cmItemsAll = false;
const CM_FIRST = '2021-08-01';   // sales_transaction_lines starts here (Aug 2021 at Khalifa City and Saadiyat)
const cmIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cmToday = () => cmIso(new Date());
try {
  const s = JSON.parse(localStorage.getItem(CM_STORE) || '{}');
  if (s.mode === 'clients' || s.mode === 'visits' || s.mode === 'units' || s.mode === 'revenue') CM.mode = s.mode;
  const f = Array.isArray(s.fams) ? s.fams : (typeof s.fam === 'string' ? [s.fam] : []);
  if (f.length && f.every(x => typeof x === 'string')) CM.fams = f;
} catch (e) {}
function cmSave() { try { localStorage.setItem(CM_STORE, JSON.stringify({ mode: CM.mode, fams: CM.fams })); } catch (e) {} }
const cmLead = () => CM.fams[0];
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
// The address carries the picks (Kate, 29 Oct 2026), beside the header's branch and period: ?view=clientmix&branch=AQ&period=last-month&mix=colour,nails&show=revenue&out=beauty&cat=...&item=...&n=20
try {
  const q = new URLSearchParams(location.search), keys = CM_FAMS.map(f => f.k).filter(k => k !== 'unmapped');
  const mix = (q.get('mix') || '').split(',').filter(k => keys.includes(k));
  if (mix.length) CM.fams = mix;
  CM.any = q.get('any') === '1' && CM.fams.length > 1;
  const sh = q.get('show'); if (['clients', 'visits', 'units', 'revenue'].includes(sh)) CM.mode = sh;
  CM.tri = {}; (q.get('out') || '').split(',').filter(k => keys.includes(k) && !CM.fams.includes(k)).forEach(k => { CM.tri[k] = 'without'; });
  CM.cats = q.getAll('cat').filter(Boolean); CM.item = q.get('item') || null;
  const n = Number(q.get('n')); if ([10, 20, 50, 100].includes(n)) CM.n = n;
} catch (e) {}
function cmUrlParts() {   // index.html trSyncUrl() calls this on this page
  const p = ['mix=' + CM.fams.join(',')];
  if (CM.mode !== 'clients') p.push('show=' + CM.mode);
  const out = Object.keys(CM.tri); if (out.length) p.push('out=' + out.join(','));
  CM.cats.forEach(c => p.push('cat=' + encodeURIComponent(c)));
  if (CM.item) p.push('item=' + encodeURIComponent(CM.item));
  if (CM.any && CM.fams.length > 1) p.push('any=1');
  if (CM.n !== 10) p.push('n=' + CM.n);
  return p;
}
const cmSync = () => { try { if (typeof trSyncUrl === 'function' && typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'clientmix') trSyncUrl(null); } catch (e) {} };

// ── THE WINDOW ──────────────────────────────────────────────────────────────
// The header's Period is dateFrom to dateTo (null both = All time), clamped to where the sales lines start and to today.
function cmRange() {
  const today = cmToday();
  let a = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : CM_FIRST;
  let b = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : today;
  if (a < CM_FIRST) a = CM_FIRST;
  if (b > today) b = today;
  if (b < a) b = a;
  return [a, b];
}
const cmPeriodTxt = () => { const r = cmRange(); return r[0] === r[1] ? lcDayY(r[0]) : lcDayY(r[0]) + ' to ' + lcDayY(r[1]); };
// The header's Branch: ['all'] is the four open UAE branches (null to the RPCs); otherwise the codes picked, which the RPCs take as a
// comma list. Bahrain has no lines here (its chip is struck out on this page).
function cmCodes() {
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return null;
  const c = sel.branch.filter(b => typeof BH_BRANCHES === 'undefined' || !BH_BRANCHES.includes(b));
  return !c.length || (typeof UAE_ACTIVE !== 'undefined' && UAE_ACTIVE.every(b => c.includes(b))) ? null : c;
}
const cmBranchArg = () => { const c = cmCodes(); return c ? c.join(',') : null; };
const cmBranchTxt = () => { const c = cmCodes(); return c ? c.map(lcBranchName).join(' + ') : 'All branches'; };
function cmArgs(extra) {
  const [a, b] = cmRange();
  return Object.assign({ p_from: a, p_to: b, p_branch: cmBranchArg() }, extra || {});
}
function cmDetailArgs(limit) {
  return cmArgs({ p_fam: cmLead(), p_with: CM.fams.slice(1), p_without: Object.keys(CM.tri), p_cat: CM.cats.length ? CM.cats.join('|') : null, p_item: CM.item, p_limit: limit || 300, p_any: CM.any && CM.fams.length > 1 });
}
// "colour", "colour and nails", "colour, nails and beauty"
// Phorest writes its categories in capitals; shown in words, matched by the raw name (data-c).
const cmTitle = t => String(t || '').toLowerCase().replace(/(^|[\s\-(\/])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\s(And|Of|The)\s/g, x => x.toLowerCase());
const cmWord = () => CM.any && CM.fams.length > 1 ? 'or' : 'and';   // Any of them reads "colour or nails"
const cmJoin = (a, w = cmWord()) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' ' + w + ' ' + a[a.length - 1];
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
  cmSave(); cmSync();
  if (k === 'mode') {
    document.querySelectorAll('.cm-bar .sc-seg button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });   // the highlight follows the click
    cmPaintCards(); cmPaintDetail(); return;
  }
  renderClientMix();
}
// A card toggles. The first one picked leads; the rest are "also had". The last one left cannot be switched off.
function cmPickFam(k) {
  if (k === 'unmapped') { cmTab('roster'); return; }
  const i = CM.fams.indexOf(k);
  if (i >= 0) { if (CM.fams.length < 2) return; CM.fams.splice(i, 1); if (CM.fams.length < 2) CM.any = false; }
  else { CM.fams.push(k); delete CM.tri[k]; }
  CM.cats = []; CM.item = null; cmItemsAll = false; cmSave(); cmSync();
  cmPaintCards(); cmPaintSel(); cmLoadDetail();
}
// A chip under the cards leaves out the clients who had that family.
function cmTri(k) {
  if (CM.tri[k]) delete CM.tri[k]; else CM.tri[k] = 'without';
  CM.item = null; cmSync(); cmPaintNarrow(); cmLoadDetail();
}
// Categories toggle: none picked is All, several picked are added together.
function cmPickCat(c) {
  if (!c) CM.cats = [];
  else { const i = CM.cats.indexOf(c); if (i >= 0) CM.cats.splice(i, 1); else CM.cats.push(c); }
  CM.item = null; cmItemsAll = false; cmSync(); cmLoadDetail(); }
function cmPickItem(i) {
  const it = cmDetail && cmDetail.items[i];
  if (!it) return;
  CM.item = CM.item === it.stem ? null : it.stem; cmSync(); cmLoadDetail();
}
function cmSetN(n) { CM.n = n; cmSync(); cmPaintList(); }
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
    `<button type="button" class="${String(CM[key]) === String(k) ? 'on' : ''}" data-v="${k}" aria-pressed="${String(CM[key]) === String(k)}" onclick="cmSet('${key}','${k}')">${l}</button>`).join('')}</div>`;
  return `
    <section class="slv-intro">
      <h2>Client Mix</h2>
      <p>How many different clients had colour, hair treatments, nails or beauty, or bought retail, and how many units that came to. Click a card, then see exactly who they were. Click more than one card to see the clients who had all of them.</p>
    </section>
    <div class="cm-tabs" role="tablist">
      <button type="button" class="cm-tab${CM.tab === 'mix' ? ' on' : ''}" data-t="mix" onclick="cmTab('mix')">Client Mix</button>
      <button type="button" class="cm-tab${CM.tab === 'roster' ? ' on' : ''}" data-t="roster" onclick="cmTab('roster')">Service roster</button>
    </div>
    <div id="cmPageMix"${CM.tab === 'mix' ? '' : ' style="display:none"'}>
      <div class="sc-bar w13-bar lc-bar tc-bar cm-bar">
        <div class="lc-grp"><div class="slv-eyebrow">Show</div>${seg('mode', [['clients', 'Clients'], ['visits', 'Visits'], ['units', 'Units'], ['revenue', 'Revenue']])}</div>
      </div>
      <p class="cm-def"><b>Clients</b> are different people, each counted once however often she came. <b>Visits</b> are days she came in (one day at one branch is one visit). <b>Units</b> are what was rung up: every service or add-on on the till is a unit, so one manicure with a gel polish add-on is two units. <b>Revenue</b> is what was paid for those lines in AED, after discounts, with refunds left out.</p>
      <div class="cm-cards" id="cmCards"><p class="slv-muted">Counting clients…</p></div>
      <section class="cm-sel" id="cmSel" hidden></section>
      <section class="slv-card cm-refine">
        <div class="cm-over" id="cmOver"></div>
        <div class="cm-narrow" id="cmNarrow"></div>
        <div class="cm-pcats" id="cmPcats"></div>
      </section>
      <p class="cm-summary" id="cmSummary"></p>
      <div class="cm-two">
        <section class="slv-card"><div class="slv-eyebrow" id="cmItemsTitle"></div><div id="cmItems"></div></section>
        <section class="slv-card"><div class="cm-tools"><div class="slv-eyebrow" id="cmListTitle"></div>
          <button type="button" class="cm-pill" id="cmCopy" onclick="cmCopy()">Copy list for Sheets</button></div>
          <div id="cmList"></div></section>
      </div>
      <p class="slv-muted cm-foot">From Phorest's Sales Transactions, whose data starts in May 2021 at Saadiyat and Khalifa City A, December 2022 at Motor City and September 2023 at Al Quoz; this page reads from August 2021 on. Each sale is sorted by Phorest's own service categories (see the Service roster tab). A client is counted once per family however many times she came. A unit is one sales line (a service or an add-on); the second half of a keratin counts as the same treatment. Deposits, vouchers, refunds, prepaid courses and walk-ins are left out.</p>
    </div>
    <div id="cmPageRoster"${CM.tab === 'roster' ? '' : ' style="display:none"'}><p class="slv-muted" style="margin-top:16px">Loading the roster…</p></div>`;
}

// ── DRAW ────────────────────────────────────────────────────────────────────
async function renderClientMix() {
  const el = document.getElementById('clientMixContent');
  if (!el) return;
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
  const wk = cmBranchArg() + '|' + cmRange().join();   // the header's Branch or Period moved: the picked item and category belonged to the old window
  if (wk !== cmWinKey) { const first = !cmWinKey; cmWinKey = wk; if (!first) { CM.item = null; CM.cats = []; } cmItemsAll = false; }   // the first draw keeps what the address named
  if (Date.now() - cmStamp > 600000) { cmForget(); cmStamp = Date.now(); cmRoster = null; }
  lcDetailCtx = { branch: () => cmBranchArg(), html: d => lcDetailHtml(d, { allBranches: CM.branch === 'all' && ((d && d.branches) || []).length > 1 }) };
  el.innerHTML = cmShell();
  cmCards = null; cmDetail = null;
  cmLoadCards().then(() => { if (!cmCards) return; cmEnsureFam(); cmPaintCards(); cmLoadDetail(); });
  if (CM.tab === 'roster') cmLoadRoster();
}
function cmEnsureFam() {
  const have = (cmCards.fams || []).filter(f => f.family !== 'skip' && f.clients > 0);
  const keep = CM.fams.filter(k => have.some(h => h.family === k));   // a family nobody had in this window drops out of the picks
  if (keep.length !== CM.fams.length || !keep.length) {
    const first = CM_FAMS.find(f => f.k !== 'unmapped' && have.some(h => h.family === f.k));
    CM.fams = keep.length ? keep : (first ? [first.k] : CM.fams);
    CM.cats = []; CM.item = null;
  }
  Object.keys(CM.tri).forEach(k => { if (CM.fams.includes(k) || !have.some(h => h.family === k)) delete CM.tri[k]; });
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
    cmDetail = d; cmDetail._any = !!(CM.any && CM.fams.length > 1); cmBusy = false;
  } catch (e) {
    console.error(e);
    if (seq === cmSeqD) { cmBusy = false; cmDetail = null; const b = document.getElementById('cmList'); if (b) b.innerHTML = '<p class="slv-muted">The client list did not load. Refresh to try again.</p>'; }
    return;
  }
  cmPaintDetail();
}
function cmShowBusy() {
  ['cmItems', 'cmList', 'cmSel', 'cmOver'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.toggle('cm-busy', cmBusy); });
}

function cmPaintCards() {
  const box = document.getElementById('cmCards');
  if (!box || !cmCards) return;
  const total = Number(cmCards.total_clients) || 0;
  const by = {}; (cmCards.fams || []).forEach(f => { by[f.family] = f; });
  const fams = CM_FAMS.filter(f => (by[f.k] && by[f.k].clients > 0) && (f.k !== 'unmapped' || true));
  if (!fams.length) { box.innerHTML = '<p class="slv-muted">No sales in this period.</p>'; return; }
  const m = ['units', 'visits', 'revenue'].includes(CM.mode) ? CM.mode : 'clients';
  const one = { clients: 'client', visits: 'visit', units: 'unit' };
  const cnt = (d, k) => k === 'revenue' ? 'AED ' + lcNum(d.revenue) : `${lcNum(d[k])} ${d[k] === 1 ? one[k] : k}`;
  box.innerHTML = fams.map(f => {
    const d = by[f.k];
    const oi = CM.fams.indexOf(f.k), ord = CM.fams.length > 1 && oi >= 0 ? `<span class="cm-ord">${oi + 1}</span>` : '';
    const others = ['clients', 'visits', 'units', 'revenue'].filter(k => k !== m).map(k => cnt(d, k)).join(' · ');
    const sub = f.k === 'unmapped' ? 'needs a family in the roster' : `${others}<br>${total ? Math.round(100 * d.clients / total) : 0}% of all clients`;
    return `<button type="button" class="cm-cat${f.k === 'unmapped' ? ' un' : ''}${CM.fams.includes(f.k) ? ' on' : ''}" aria-pressed="${CM.fams.includes(f.k)}" style="--c:${f.color}" onclick="cmPickFam('${f.k}')">
      ${ord}<div class="cm-nm">${f.name}</div><div class="cm-n">${lcNum(d[m])}</div><div class="cm-u">${m === 'revenue' ? 'AED revenue' : m}</div><div class="cm-k">${sub}</div></button>`;
  }).join('');
  cmPaintNarrow();
}
function cmPaintNarrow() {
  const box = document.getElementById('cmNarrow');
  if (!box || !cmCards) return;
  const others = CM_FAMS.filter(f => !CM.fams.includes(f.k) && f.k !== 'unmapped' && (cmCards.fams || []).some(x => x.family === f.k && x.clients > 0));
  box.innerHTML = `<span class="slv-eyebrow">Leave out</span><div class="cm-row">` + others.map(f => {
    const t = CM.tri[f.k] || '';
    return `<button type="button" class="cm-chip ${t}" aria-pressed="${!!t}" onclick="cmTri('${f.k}')">${lcEsc(t ? 'No ' + f.name : f.name)}</button>`;
  }).join('') + `</div><span class="slv-note">click a family to leave out the clients who had it</span>`;
}
function cmPaintDetail() {
  cmShowBusy();
  const d = cmDetail;
  const sum = document.getElementById('cmSummary');
  if (!d || !sum) return;
  const f = cmFam(cmLead());
  // Phorest category pills (counts are for the family as narrowed, not for the pill picked).
  const pc = document.getElementById('cmPcats');
  if (pc) {
    const cats = (d.cats || []).slice().sort((a, b) => b.clients - a.clients);
    pc.innerHTML = `<span class="slv-eyebrow">Phorest category</span><div class="cm-row" role="group">` +
      `<button type="button" class="cm-chip${CM.cats.length ? '' : ' on'}" aria-pressed="${!CM.cats.length}" onclick="cmPickCat('')">All</button>` +
      cats.map(c => { const on = CM.cats.includes(c.category); return `<button type="button" class="cm-chip${on ? ' on' : ''}" aria-pressed="${on}" data-c="${lcEsc(c.category)}" onclick="cmPickCat(this.dataset.c)">${lcEsc(cmTitle(c.category))} <em>${lcNum(c.clients)}</em></button>`; }).join('') +
      `</div><span class="slv-note">pick one or more; the number is the clients in that category</span>`;
  }
  const narrowTxt = Object.keys(CM.tri).map(k => 'no ' + cmFam(k).name.toLowerCase()).join(', ');
  const multi = CM.fams.length > 1 && d.sel;
  const picked = cmJoin(CM.fams.map((k, i) => cmFam(k).name.toLowerCase() + (i === 0 && CM.cats.length ? ' (' + CM.cats.map(cmTitle).join(' + ') + ')' : '')));
  sum.innerHTML = `<b>${lcNum(d.clients)} client${Number(d.clients) === 1 ? '' : 's'}</b> had ${lcEsc(picked)}${narrowTxt ? ', with ' + lcEsc(narrowTxt) : ''}, for <b>${lcNum(multi ? d.sel.units : d.units)} ${multi ? '' : lcEsc(f.name.toLowerCase()) + ' '}unit${Number(multi ? d.sel.units : d.units) === 1 ? '' : 's'}</b> and <b>AED ${lcNum(multi ? d.sel.revenue : d.revenue)}</b>. ${lcEsc(cmBranchTxt())}, ${lcEsc(cmPeriodTxt())}.`;
  cmPaintItems();
  cmPaintList();
  cmPaintSel();
  cmPaintOver();
}
// The selection box: with two or more cards picked, the totals for the clients who had all of them, and what each card came to.
function cmClearSel() {
  CM.fams = [cmLead()]; CM.any = false; CM.cats = []; CM.item = null; cmItemsAll = false; cmSave(); cmSync();
  cmPaintCards(); cmPaintSel(); cmLoadDetail();
}
// All of them (the clients who had every picked card) or Any of them (at least one).
function cmSetAny(v) {
  CM.any = !!v; CM.item = null; cmItemsAll = false; cmSync();
  document.querySelectorAll('#cmSel .sc-seg button').forEach(b => { const on = (b.dataset.v === 'any') === CM.any; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  cmPaintOver(); cmLoadDetail();
}
function cmPaintSel() {
  const box = document.getElementById('cmSel');
  if (!box) return;
  const s = cmDetail && cmDetail.sel, n = CM.fams.length;
  const fresh = s && Array.isArray(s.fams) && s.fams.length === n && CM.fams.every(k => s.fams.some(f => f.family === k));   // not the totals of the cards picked a moment ago
  if (n < 2 || !fresh) { box.hidden = true; return; }
  if (!!cmDetail._any !== (CM.any && n > 1)) return;   // the toggle was just pressed: the old totals stay, dimmed, until the new ones arrive
  box.hidden = false;
  const c = Number(cmDetail.clients) || 0, total = cmCards ? Number(cmCards.total_clients) || 0 : 0;
  const each = (v, dp) => c ? (v / c).toFixed(dp).replace(/\.0$/, '') : '0';
  const names = CM.fams.map(k => cmFam(k).name);
  const all = n === 2 ? 'both' : n === 3 ? 'all three' : 'all ' + n;
  const left = Object.keys(CM.tri).map(k => cmFam(k).name.toLowerCase());
  const mode = ['visits', 'units', 'revenue'].includes(CM.mode) ? CM.mode : 'clients';
  const tile = (k, label, val, sub) => `<div class="cm-sel-tile${mode === k ? ' lead' : ''}"><div class="k">${label}</div><div class="v">${val}</div><div class="s">${sub}</div></div>`;
  const rev = Number(s.revenue) || 0, rsum = s.fams.reduce((a, f) => a + (Number(f.revenue) || 0), 0) || 1;
  const rows = CM.fams.map(k => { const f = s.fams.find(x => x.family === k) || {}; return { k, f }; });
  box.innerHTML = `<div class="cm-sel-top"><div class="cm-sel-t"><span class="cm-sel-dots">${CM.fams.map(k => `<i style="--c:${cmFam(k).color}"></i>`).join('')}</span>${lcEsc(names.join(CM.any ? ' or ' : ' + '))}
      <small>The ${lcNum(c)} client${c === 1 ? '' : 's'} who had ${CM.any ? cmJoin(names.map(x => x.toLowerCase()), 'or') : all}${left.length ? ', without ' + lcEsc(left.join(' or ')) : ''}. ${lcEsc(cmBranchTxt())}, ${lcEsc(cmPeriodTxt())}.</small></div>
      <div class="cm-sel-act"><div class="sc-seg" role="group" aria-label="All or any of the picked cards"><button type="button" class="${CM.any ? '' : 'on'}" data-v="all" aria-pressed="${!CM.any}" onclick="cmSetAny(false)">All of them</button><button type="button" class="${CM.any ? 'on' : ''}" data-v="any" aria-pressed="${CM.any}" onclick="cmSetAny(true)">Any of them</button></div>
      <button type="button" class="cm-pill" onclick="cmClearSel()">Clear to one card</button></div></div>
    <div class="cm-sel-tiles">
      ${tile('clients', 'Clients', lcNum(c), total ? Math.round(100 * c / total) + '% of all clients' : '')}
      ${tile('visits', 'Visits', lcNum(s.visits), each(s.visits, 1) + ' each')}
      ${tile('units', 'Units', lcNum(s.units), each(s.units, 1) + ' each')}
      ${tile('revenue', 'Revenue', 'AED ' + lcNum(rev), 'AED ' + lcNum(c ? rev / c : 0) + ' each')}
    </div>
    <div class="cm-sel-split"><div class="slv-eyebrow">What those ${lcNum(c)} client${c === 1 ? '' : 's'} spent, by card</div>
      <div class="cm-sel-row hd${CM.any ? ' any' : ''}"><b>Card</b>${CM.any ? '<span>Clients</span>' : ''}<span>Visits</span><span>Units</span><span>AED</span><span>Share</span></div>
      ${rows.map(r => `<div class="cm-sel-row${CM.any ? ' any' : ''}" style="--c:${cmFam(r.k).color}"><b><i></i>${lcEsc(cmFam(r.k).name)}</b>${CM.any ? `<span data-k="Clients">${lcNum(r.f.clients)}</span>` : ''}<span data-k="Visits">${lcNum(r.f.visits)}</span><span data-k="Units">${lcNum(r.f.units)}</span><span data-k="AED">${lcNum(r.f.revenue)}</span><span data-k="Share">${Math.round(100 * (Number(r.f.revenue) || 0) / rsum)}%</span></div>`).join('')}
    </div>
    <p class="cm-sel-note">${CM.any ? 'A client who had at least one of the picked cards is counted once, however many she had.' : 'Only clients who had every picked card are counted.'} A visit with more than one card counts once in the totals. The items and the client list below cover all the picked cards.</p>`;
}
// Of the clients in view, how many ALSO had each other card. A chip adds that card to the picks (the clients who had it too).
function cmPaintOver() {
  const box = document.getElementById('cmOver'), d = cmDetail;
  if (!box || !d) return;
  const c = Number(d.clients) || 0;
  const ov = (d.overlap || []).filter(o => o.family !== 'unmapped' && o.family !== 'skip' && !CM.fams.includes(o.family) && !CM.tri[o.family]);
  if (!c || !ov.length || (CM.any && CM.fams.length > 1)) { box.innerHTML = ''; box.hidden = true; return; }   // under Any of them, adding a card would only widen the pick
  box.hidden = false;
  const who = CM.fams.length > 1 ? 'who had ' + cmJoin(CM.fams.map(k => cmFam(k).name.toLowerCase())) : 'who had ' + cmFam(cmLead()).name.toLowerCase();
  box.innerHTML = `<span class="slv-eyebrow">Also had</span><div class="cm-row">` + ov.map(o => {
    const f = cmFam(o.family);
    return `<button type="button" class="cm-chip" onclick="cmPickFam('${o.family}')" title="Show only the clients ${lcEsc(who)} and ${lcEsc(f.name.toLowerCase())}"><i class="cm-fdot" style="--c:${f.color}"></i>${lcEsc(f.name)} <em>${lcNum(o.clients)} client${o.clients === 1 ? '' : 's'} · ${Math.round(100 * o.clients / c)}% · AED ${lcNum(o.revenue)}</em></button>`;
  }).join('') + `</div><span class="slv-note">of the ${lcNum(c)} client${c === 1 ? '' : 's'} ${lcEsc(who)}; click one to list just the clients who had it too</span>`;
}
function cmPaintItems() {
  const d = cmDetail, box = document.getElementById('cmItems');
  if (!d || !box) return;
  document.getElementById('cmItemsTitle').textContent = cmJoin(CM.fams.map(k => cmFam(k).name)) + ', by item';
  const multiF = CM.fams.length > 1;
  const key = CM.mode === 'units' ? 'units' : CM.mode === 'revenue' ? 'revenue' : 'clients';   // the items table has no visits column, so Visits shows clients
  const items = (d.items || []).map((x, i) => Object.assign({ _i: i }, x)).sort((a, b) => b[key] - a[key] || b.clients - a.clients);
  const mx = Math.max(1, ...items.map(x => x[key]));
  const color = cmFam(cmLead()).color;
  const shownItems = (cmItemsAll || !window.matchMedia('(max-width:760px)').matches) ? items : items.slice(0, 8);
  box.innerHTML = items.length ? `<div class="slv-wrap"><table class="slv-table cm-items"><thead><tr><th class="lc-l">Item</th><th>Clients</th><th>Units</th><th>AED</th></tr></thead><tbody>${shownItems.map(x =>
    `<tr class="cm-item${CM.item === x.stem ? ' sel' : ''}" onclick="cmPickItem(${x._i})"><td class="lc-l"><span class="tc-name">${lcEsc(x.stem)}</span><div class="cm-cell-cat">${multiF ? `<i class="cm-fdot" style="--c:${cmFam(x.family).color}"></i>${lcEsc(cmFam(x.family).name)} · ` : ''}${lcEsc(cmTitle(x.category))}</div><div class="cm-bar1" style="--c:${multiF ? cmFam(x.family).color : color}"><i style="width:${Math.round(100 * x[key] / mx)}%"></i></div></td><td>${lcNum(x.clients)}</td><td>${lcNum(x.units)}</td><td>${lcNum(x.revenue)}</td></tr>`).join('')}</tbody></table></div>
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
  const shown = (CM.mode === 'revenue' ? rows.slice().sort((a, b) => (b.revenue || 0) - (a.revenue || 0)) : rows).slice(0, CM.n);   // Revenue sorts the loaded clients by what they paid
  const tags = (r, max) => (r.bought || []).slice(0, max).map(b => `<span class="cm-tag" style="--c:${cmFam(b.f).color}">${lcEsc(b.s)}${b.u > 1 ? ' x' + b.u : ''}</span>`).join('');
  const tr = shown.map((r, i) => `<tr class="${cls}"${open ? ' title="Click to see everything she came in for"' : ''}${click(i)}>
      <td class="lc-stc"><span class="tc-name">${lcEsc(r.client_name)}</span>${open ? '<span class="lc-hint" aria-hidden="true">See her visits ›</span>' : ''}<div class="slv-note">${lcEsc(r.branch || '')} · ${lcNum(r.visits)} visit${Number(r.visits) === 1 ? '' : 's'}</div></td>
      <td class="lc-l cm-bought">${tags(r, 10)}</td><td>${lcNum(r.units)}</td><td>${lcNum(r.revenue)}</td></tr>`).join('');
  const cards = shown.map((r, i) => `<li class="prd-card ${cls}"${click(i)}><div class="prd-body">
      <div class="prd-top"><span class="prd-name">${lcEsc(r.client_name)}</span><span class="prd-spend">AED ${lcNum(r.revenue)}</span></div>
      <div class="prd-meta">${lcEsc(r.branch ? lcBranchName(r.branch) : '')} · ${lcNum(r.visits)} visit${Number(r.visits) === 1 ? '' : 's'} · ${lcNum(r.units)} unit${Number(r.units) === 1 ? '' : 's'}</div>
      <div class="prd-meta" style="margin-top:4px">${tags(r, 6)}</div>
      ${open ? '<div class="lc-hint-m">Tap for her visits ›</div>' : ''}</div></li>`).join('');
  const sizes = [10, 20, 50, 100].map(n => `<button type="button" class="cm-chip${CM.n === n ? ' on' : ''}" aria-pressed="${CM.n === n}" onclick="cmSetN(${n})">${n}</button>`).join('');
  const more = matched > 10 || rows.length > 10 ? `<div class="cm-pager"><span class="slv-eyebrow">Show</span>${sizes}<span class="slv-note">${lcNum(shown.length)} of ${lcNum(matched)}${matched > rows.length ? ' (the top ' + lcNum(rows.length) + ' are loaded)' : ''}</span></div>` : '';
  const empty = 'No one matches those filters. Try a wider period, or clear a filter.';
  box.innerHTML = `<div class="slv-wrap prd-desk lc-wrap tc-wrap"><table class="slv-table"><thead><tr><th class="lc-l">Client</th><th class="lc-l">Bought</th><th>${CM.item || CM.cats.length ? 'Units here' : CM.fams.length > 1 ? 'Units, all picked' : 'Units'}</th><th>AED</th></tr></thead>
      <tbody>${tr || `<tr><td colspan="4" class="slv-muted">${empty}</td></tr>`}</tbody></table></div>
    <ol class="prd-cards">${cards || `<li class="slv-muted">${empty}</li>`}</ol>${more}
    <p class="slv-note" style="margin-top:8px">Sorted by ${CM.mode === 'revenue' ? 'what they paid' : 'units'} in ${lcEsc(cmJoin(CM.fams.map(k => cmFam(k).name.toLowerCase())))}${CM.cats.length ? ', ' + lcEsc(CM.cats.map(cmTitle).join(' + ')) : ''}. Tags are what she bought in this period, her ${lcEsc(cmJoin(CM.fams.map(k => cmFam(k).name.toLowerCase())))} first.</p>`;
}

// Copy for Sheets: asks again for everyone, not just the 300 on screen.
async function cmCopy() {
  const btn = document.getElementById('cmCopy');
  const say = t => { if (btn) btn.textContent = t; setTimeout(() => { if (btn) btn.textContent = 'Copy list for Sheets'; }, 2400); };
  try {
    if (btn) btn.textContent = 'Getting everyone…';
    const d = await cmCall('client_mix_detail', cmDetailArgs(5000));
    const rows = (d && d.rows) || [];
    const head = ['Client', 'Branch', 'Visits', 'Units', 'AED', 'Bought'];
    const tsv = [head.join('\t')].concat(rows.map(r => [r.client_name, r.branch || '', r.visits, r.units, r.revenue || 0,
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
      ${unm.length ? `<div class="cm-warn"><b>${unm.length} Phorest categor${unm.length === 1 ? 'y has' : 'ies have'} no family yet:</b> ${unm.map(c => lcEsc(c.category)).join(', ')}. Their clients show on the Client Mix tab as Unmapped until ${edit ? 'you pick one below' : 'a Level 5 login picks one'}.</div>` : ''}
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
      ${edit ? '' : '<p class="slv-note" style="margin-top:8px">Only a Level 5 login can change these.</p>'}
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
