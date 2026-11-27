// Products > All products and Order by supplier (Kate, 27 Nov 2026), built from the local mockup docs/mockups/products-and-suppliers.html in the cowork repo.
//
// Two tabs next to "Stock spend" (products.js draws the tab strip and the three boxes, this fills the other two):
//   All products       every product on a salon's Phorest list with the supplier it was last ordered from, cost, price, stock and units ordered in the Period,
//                      grouped by supplier (a heading row each) when the list is sorted by Supplier, which it is to start with.
//   Order by supplier  one row a supplier in the shape of Out of Stock's "4 Order by supplier": Products, Min AED, Max AED, In stock AED and Order now.
//                      Order now is on for DBD only so far (the only supplier with an email and forms set up) and opens Out of Stock's supplier order.
// The data is ONE snapshot of Phorest (migrations/products_catalog.sql, catalog_get, filled by "phorest data export/catalog/sync_catalog.py"). Phorest holds
// no supplier on a product, so the supplier of a product is the NEWEST order that had it. Supplier names are folded: one supplier, one name.
// Snapshot: asof, loaded_at, and, with month = (year - 2021) * 12 + month - 1 and salons in the order SAA KCA MC AQ:
//   PR [name, brand, type, barcode, cost, price, supplier, supplier last ordered, lines from that supplier, [[supplier, lines, last]...], [[stock, min, max] | null per salon]]
//   SU [name, orders, last order, first order, products, [salon index...], [other spellings], contact, phone, email, note]
//   TU [product, month, salon, supplier, units, lines]      SO [supplier, month, salon, orders]       (supplier and product are positions in SU and PR; -1 = none)
// Kate's rulings applied: the masthead's Branch and Period drive it (Bahrain is not in), every table has the Sheets heading menus (sheet-table.js), every figure opens
// what is behind it (drill.js), pages of 10, 20, 50 or 100, XLSX and CSV, the mini nav and a pinned toolbar that follow the page (product-spend.js psOffsets).
// Until the database update is applied the two tabs say so and the page works as before.
// Needs from products.js and dashboard.js (shared script scope): sb, prdData, prdEsc, prdNum, prdDayY, PRD_BRANCH; drill.js TRSD; sheet-table.js TRSheet;
// report-export.js rexButtons; product-spend.js psOffsets.
const PCG_SALONS = ['SAA', 'KCA', 'MC', 'AQ'];
const PCG_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let pcgD = null, pcgPromise = null, pcgTab = 'spend', pcgType = 'A', pcgHas = 'A', pcgShow = 'A', pcgQ = '', pcgN = 10, pcgHK = 'sup', pcgAK = 'src', pcgSeq = 0;
let pcgPRO = [], pcgSUP = [], pcgPT = null, pcgST = null;
try { const s = JSON.parse(localStorage.getItem('trs-products-catalog') || '{}'); if ([10, 20, 50, 100].includes(s.n)) pcgN = s.n; if (['spend', 'prod', 'sup'].includes(s.tab)) pcgTab = s.tab; } catch (e) {}
const pcgSave = () => { try { localStorage.setItem('trs-products-catalog', JSON.stringify({ n: pcgN, tab: pcgTab })); } catch (e) {} };

const pcgNum = (html, spec) => (typeof TRSD !== 'undefined' && spec) ? TRSD.num(html, spec) : html;
const pcgSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pcgN0 = v => Math.round(+v || 0).toLocaleString('en-GB');
const pcgMoney = v => v == null ? '–' : (v >= 10 ? pcgN0(v) : (Math.round(v * 10) / 10).toFixed(1));
const pcgPct = (a, b) => b ? Math.round(100 * a / b) : 0;
const pcgDay = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? +m[3] + ' ' + PCG_MON[+m[2] - 1] + ' ' + m[1] : ''; };
const pcgMonthName = m => PCG_MON[m % 12] + ' ' + (2021 + Math.floor(m / 12));
const pcgWin = () => prdData && prdData.win;
const pcgBs = () => { const w = pcgWin(), bs = (w ? w.branches : PCG_SALONS).map(c => PCG_SALONS.indexOf(c)).filter(i => i >= 0); return bs.length ? bs : [0, 1, 2, 3]; };
const pcgSalon = i => PRD_BRANCH[PCG_SALONS[i]] || PCG_SALONS[i];
const pcgScope = () => { const bs = pcgBs(); return bs.length === 4 ? 'UAE Branches' : bs.map(pcgSalon).join(' + '); };
const pcgPeriod = () => { const w = pcgWin(); return w ? prdDayY(w.from) + ' to ' + prdDayY(w.to) : ''; };
const pcgTy = t => `<span class="ps-ty ${t === 'retail' ? 'retail' : 'professional'}">${t === 'retail' ? 'Retail' : t === 'colour' ? 'Colour' : 'Professional'}</span>`;
const pcgMissing = e => /could not find the function|does not exist|schema cache/i.test((e && e.message) || '');
const pcgCanOrder = name => name === 'DBD';   // only DBD has an email and forms set up so far (Out of Stock)
function pcgMonths() {
  const w = pcgWin(), out = {}; if (!w) return out;
  let y = +w.from.slice(0, 4), m = +w.from.slice(5, 7) - 1; const ey = +w.to.slice(0, 4), em = +w.to.slice(5, 7) - 1;
  while (y < ey || (y === ey && m <= em)) { out[(y - 2021) * 12 + m] = 1; if (++m > 11) { m = 0; y++; } }
  return out;
}

// ── THE DATA: one read, kept ─────────────────────────────────────────────────────────
function pcgLoad() {
  if (!pcgPromise) {
    pcgPromise = Promise.resolve(sb.rpc('catalog_get')).then(r => {
      if (r.error) throw r.error;
      if (!r.data || r.data.empty) { const e = new Error('empty'); e.empty = true; throw e; }
      pcgD = r.data; return pcgD;
    }).catch(e => { pcgPromise = null; throw e; });
  }
  return pcgPromise;
}

// ── TABS: products.js draws the strip and three boxes, this shows one and fills it ────
function pcgTabsHtml() {
  const t = (k, l) => `<button type="button" class="${pcgTab === k ? 'on' : ''}" aria-pressed="${pcgTab === k}" onclick="pcgSetTab('${k}')">${l}</button>`;
  return `<div class="sc-seg pcg-tabs" id="pcgTabs" role="group" aria-label="Products view">${t('spend', 'Stock spend')}${t('prod', 'All products')}${t('sup', 'Order by supplier')}</div>`;
}
function pcgSetTab(k) {
  pcgTab = k; pcgSave(); pcgQ = '';
  pcgShow2();
  if (k !== 'spend') pcgMount();
}
function pcgShow2() {
  const box = { spend: 'prdTabSpend', prod: 'prdTabProd', sup: 'prdTabSup' };
  Object.keys(box).forEach(k => { const e = document.getElementById(box[k]); if (e) e.hidden = pcgTab !== k; });
  document.querySelectorAll('#pcgTabs button').forEach((b, i) => { const on = ['spend', 'prod', 'sup'][i] === pcgTab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if (typeof psOffsets === 'function') psOffsets();
}
// called by products.js each time it draws the page
function pcgMount() {
  pcgShow2();
  if (pcgTab === 'spend') return;
  const el = document.getElementById(pcgTab === 'prod' ? 'prdTabProd' : 'prdTabSup'), seq = ++pcgSeq; if (!el) return;
  const other = document.getElementById(pcgTab === 'prod' ? 'prdTabSup' : 'prdTabProd'); if (other) other.innerHTML = '';
  if (!pcgD) el.innerHTML = '<p class="slv-muted" style="margin-top:16px">Loading products and suppliers…</p>';
  pcgLoad().then(() => { if (seq !== pcgSeq) return; pcgBuild(el); pcgPaintAll(); })
    .catch(e => {
      if (seq !== pcgSeq) return;
      console.error('Products catalog', e);
      el.innerHTML = `<p class="slv-muted" style="margin-top:16px">${e && e.empty ? 'The products and suppliers have not been read from Phorest yet.' : pcgMissing(e) ? 'This tab needs a small database update that has not been applied yet.' : 'The products and suppliers did not load. Refresh to try again.'}</p>`;
    });
}

// ── THE NUMBERS for the Branch, Period and filters picked ───────────────────────────────
function pcgLevels(i, bs) {
  const p = pcgD.PR[i], c = p[4] == null ? 0 : p[4], o = { st: 0, mn: 0, mx: 0 };
  bs.forEach(b => { const q = p[10][b]; if (!q) return; o.st += q[0] || 0; o.mn += q[1] || 0; o.mx += q[2] || 0; });
  o.stA = o.st * c; o.mnA = o.mn * c; o.mxA = o.mx * c; return o;
}
function pcgCompute() {
  const D = pcgD, bs = pcgBs(), inB = {}, inM = pcgMonths(); bs.forEach(b => { inB[b] = 1; });
  const ou = {}, ol = {};
  D.TU.forEach(t => { if (!inM[t[1]] || !inB[t[2]]) return; ou[t[0]] = (ou[t[0]] || 0) + t[4]; ol[t[0]] = (ol[t[0]] || 0) + t[5]; });
  const all = [];
  D.PR.forEach((p, i) => {
    if (!bs.some(b => p[10][b] != null)) return;
    const lv = pcgLevels(i, bs);
    all.push({ i, name: p[0], brand: p[1], type: p[2], bc: p[3], cost: p[4], price: p[5], sup: p[6], supLast: p[7], supN: p[8], sups: p[9], stock: p[10], st: lv.st, mn: lv.mn, mx: lv.mx, stA: lv.stA, mnA: lv.mnA, mxA: lv.mxA, ou: ou[i] || 0, ol: ol[i] || 0 });
  });
  const q = pcgQ.trim().toLowerCase();
  pcgPRO = all.filter(r => {
    if (pcgType !== 'A' && r.type !== pcgType) return false;
    if (pcgHas === 'yes' && r.sup < 0) return false; if (pcgHas === 'no' && r.sup >= 0) return false;
    return !q || (r.name + ' ' + r.brand + ' ' + r.bc + ' ' + (r.sup >= 0 ? D.SU[r.sup][0] : '')).toLowerCase().indexOf(q) >= 0;
  });
  pcgPRO.total = all.length; pcgPRO.withSup = all.filter(r => r.sup >= 0).length;
  const so = {}, agg = {};
  D.SO.forEach(x => { if (inM[x[1]] && inB[x[2]]) so[x[0]] = (so[x[0]] || 0) + x[3]; });
  all.forEach(r => { if (r.sup < 0) return; const a = agg[r.sup] || (agg[r.sup] = { n: 0, mn: 0, mx: 0, st: 0 }); a.n++; a.mn += r.mnA; a.mx += r.mxA; a.st += r.stA; });
  pcgSUP = D.SU.map((s, i) => { const a = agg[i] || { n: 0, mn: 0, mx: 0, st: 0 }; return { i, name: s[0], orders: so[i] || 0, last: s[2], first: s[3], prods: a.n, mnA: a.mn, mxA: a.mx, stA: a.st, salons: s[5], also: s[6], contact: s[7], phone: s[8], email: s[9], note: s[10] }; })
    .filter(r => {
      if (bs.length < 4 && !r.salons.some(b => inB[b])) return false;
      if (pcgShow === 'act' && !r.orders) return false;
      return !q || (r.name + ' ' + r.also.join(' ') + ' ' + r.contact + ' ' + r.email).toLowerCase().indexOf(q) >= 0;
    });
  pcgSUP.totalOrders = Object.keys(so).reduce((a, k) => a + so[k], 0);
  pcgSUP.active = pcgSUP.filter(r => r.orders > 0).length;
  pcgSUP.nContact = D.SU.filter(s => s[7] || s[8] || s[9]).length;
}
const pcgHasContact = r => r.contact || r.phone || r.email;
const pcgSupRank = (() => { let map = null, ref = null; return i => { if (ref !== pcgD) { ref = pcgD; map = {}; pcgD.SU.map((x, k) => [x[0].toLowerCase(), k]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).forEach((x, r) => { map[x[1]] = r; }); } return map[i]; }; })();

// ── THE BOXES ────────────────────────────────────────────────────────────────────────
function pcgBuild(el) {
  const prod = pcgTab === 'prod', id = prod ? 'prdTabProd' : 'prdTabSup';
  const how = `<section class="ps-how" data-jn="How it is worked out"><h3>How it is worked out</h3><div class="sc-seg ps-pick" id="pcgPick" role="group" aria-label="Which figure"></div><div class="ps-howcard" id="pcgHowCard"></div></section>
    <section class="ps-how" data-jn="About this page"><h3>About this page</h3><div class="sc-seg ps-pick" id="pcgApick" role="group" aria-label="About this page"></div><div class="ps-howcard" id="pcgAcard"></div></section>`;
  const pager = `<div class="ps-pager"><span id="pcgPgTxt"></span><span class="ps-sp"></span><span class="slv-eyebrow">Rows</span><select id="pcgPgSel" aria-label="Rows to show" onchange="pcgRowsPick(+this.value)"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
    <button type="button" class="cm-pill" id="pcgPrev" onclick="pcgPage(-1)">‹ Previous</button><span class="ps-pgn" id="pcgPgN"></span><button type="button" class="cm-pill" id="pcgNext" onclick="pcgPage(1)">Next ›</button></div>`;
  el.innerHTML = `
    <section class="ps-sec" data-jn="${prod ? 'All products' : 'Order by supplier'}">
      <section class="ps-ans" aria-label="The answer in one line"><div class="ps-ans-k">The answer in one line</div><div class="ps-ans-t" id="pcgAns"></div><div class="ps-ans-s" id="pcgAns2"></div></section>
      <h3>${prod ? 'All products' : 'Order by supplier'}</h3>
      <div class="ps-learn">${prod
        ? '<p><b>What is this?</b> Every product on a salon’s Phorest list, with the supplier it was last ordered from.</p><p><b>Why it matters.</b> Whoever orders can see the supplier, the cost and the stock in one row.</p>'
        : '<p><b>What is this?</b> The same products, split by supplier. Names are folded from the four Phorest salons.</p><p><b>Why it matters.</b> Each supplier is ordered separately. Order now opens that supplier’s order in Out of Stock.</p>'}
        <p class="watch"><b>What to watch.</b> <span id="pcgWatch"></span></p></div>
      <div class="ps-bar" id="psBar2">
        <div class="sc-seg" role="group" aria-label="${prod ? 'Type' : 'Show'}" id="pcgSegs"></div>
        <label class="pcg-find"><input type="search" id="pcgQ" placeholder="${prod ? 'Find a product, brand, barcode or supplier' : 'Find a supplier or contact'}" aria-label="Find" oninput="pcgFind(this.value)"></label>
        <button type="button" class="cm-pill" id="pcgMore" onclick="pcgToggleMore()">All columns</button>
        <button type="button" class="cm-pill ps-phone" data-sxcm="${prod ? 'pcgp' : 'pcgs'}">Sort and filter</button>
        <span class="ps-sp"></span>
        <button type="button" class="cm-pill" id="pcgClear" hidden onclick="pcgClear()">Clear filters</button>${typeof rexButtons === 'function' ? rexButtons('pcgExport') : ''}
      </div>
      <div class="ps-card"><table id="pcgTbl"></table></div>
      ${pager}
    </section>${how}`;
  document.getElementById('pcgPgSel').value = String(pcgN);
  pcgBuildTable();
  if (typeof psWatch === 'function') psWatch();
}
function pcgCurT() { return pcgTab === 'prod' ? pcgPT : pcgST; }
function pcgPaintAll() {
  if (!pcgD || pcgTab === 'spend') return;
  pcgCompute(); pcgPaintAnswer(); pcgPaintSegs();
  const T = pcgCurT(); if (T) T.draw();
  pcgPaintHow(); pcgPaintAbout();
  if (typeof psOffsets === 'function') psOffsets();
}
function pcgPaintSegs() {
  const seg = document.getElementById('pcgSegs'); if (!seg) return;
  const opts = pcgTab === 'prod' ? [['type', 'A', 'All types', pcgType], ['type', 'retail', 'Retail', pcgType], ['type', 'professional', 'Professional', pcgType], ['has', 'yes', 'With supplier', pcgHas], ['has', 'no', 'No supplier', pcgHas]]
    : [['show', 'A', 'All suppliers', pcgShow], ['show', 'act', 'Ordered in the Period', pcgShow]];
  seg.innerHTML = opts.map(o => `<button type="button" class="${o[3] === o[1] ? 'on' : ''}" onclick="pcgPick('${o[0]}','${o[1]}')">${o[2]}</button>`).join('');
}
function pcgPick(k, v) { if (k === 'type') pcgType = v; else if (k === 'has') pcgHas = v; else pcgShow = v; const T = pcgCurT(); if (T) T.page = 0; pcgPaintAll(); }
function pcgFind(v) { pcgQ = v; const T = pcgCurT(); if (T) T.page = 0; pcgCompute(); pcgPaintAnswer(); T.draw(); }
function pcgClear() { pcgType = 'A'; pcgHas = 'A'; pcgShow = 'A'; pcgQ = ''; const q = document.getElementById('pcgQ'); if (q) q.value = ''; const T = pcgCurT(); T.clear(); T.sort = pcgTab === 'prod' ? { k: 'sup', dir: 1 } : { k: 'mx', dir: -1 }; pcgPaintAll(); }
function pcgToggleMore() { const T = pcgCurT(); T.toggleMore(); const b = document.getElementById('pcgMore'); if (b) b.classList.toggle('on', T.more); if (typeof psOffsets === 'function') psOffsets(); }
function pcgRowsPick(n) { pcgN = n; pcgSave(); [pcgPT, pcgST].forEach(T => { if (T) { T.shown = n; T.page = 0; } }); const T = pcgCurT(); if (T) T.draw(); }
function pcgPage(d) { const T = pcgCurT(); T.page += d; T.draw(); const s = document.getElementById('psBar2'); if (s && s.getBoundingClientRect().top < 0) s.scrollIntoView({ block: 'start' }); }
function pcgPager(T, rows, noun) {
  const pages = T.pages(rows.length), from = rows.length ? T.page * T.shown + 1 : 0, to = Math.min(rows.length, (T.page + 1) * T.shown);
  const set = (id, f) => { const e = document.getElementById(id); if (e) f(e); };
  set('pcgPgTxt', e => { e.textContent = from + ' to ' + to + ' of ' + pcgN0(rows.length) + ' ' + noun + (rows.length === 1 ? '' : 's'); });
  set('pcgPrev', e => { e.disabled = T.page <= 0; }); set('pcgNext', e => { e.disabled = T.page >= pages - 1; }); set('pcgPgN', e => { e.textContent = 'Page ' + (T.page + 1) + ' of ' + pages; });
  set('pcgClear', e => { const dflt = pcgTab === 'prod' ? (T.sort && T.sort.k === 'sup' && T.sort.dir === 1) : (T.sort && T.sort.k === 'mx' && T.sort.dir === -1); e.hidden = !(Object.keys(T.f).length || !dflt || pcgType !== 'A' || pcgHas !== 'A' || pcgShow !== 'A' || pcgQ); });
}

function pcgPaintAnswer() {
  const a = document.getElementById('pcgAns'), a2 = document.getElementById('pcgAns2'), w = document.getElementById('pcgWatch'); if (!a) return;
  const D = pcgD;
  if (pcgTab === 'prod') {
    a.innerHTML = '<b>' + pcgN0(pcgPRO.withSup) + '</b> of ' + pcgN0(pcgPRO.total) + ' products have a supplier we can name from past Phorest orders.';
    a2.textContent = pcgN0(pcgPRO.total - pcgPRO.withSup) + ' have no order we could match: new, never ordered through Phorest, or named differently on the order. ' + pcgScope() + '. The Period sets the Ordered column.';
  } else {
    const top = pcgSUP.slice().sort((x, y) => y.mxA - x.mxA)[0], tm = pcgSUP.reduce((s, r) => s + r.mxA, 0), nw = pcgSUP.filter(r => r.prods > 0).length;
    a.innerHTML = top && top.mxA ? '<b>' + prdEsc(top.name) + '</b> is ' + pcgPct(top.mxA, tm) + '% of the AED ' + pcgN0(tm) + ' our shelves hold at the Max level.' : 'No supplier has products on the shelves for these salons.';
    a2.textContent = pcgN0(nw) + ' suppliers have products on the shelf. Only ' + pcgSUP.nContact + ' have a contact saved in Phorest, and Order now is on for DBD only so far. ' + pcgScope() + '.';
    if (w) w.textContent = top && top.mxA ? top.name + ' is the biggest at AED ' + pcgN0(top.mxA) + ' at the Max level. Send that order first.' : 'Nothing on the shelves for these salons.';
  }
  void D;
}

// ── THE TABLES ───────────────────────────────────────────────────────────────────────
function pcgBuildTable() {
  const D = pcgD, col = (k, l, raw, disp, cell, extra) => Object.assign({ k, l, t: 'num', raw, disp, cell }, extra || {});
  const supName = r => r.sup >= 0 ? D.SU[r.sup][0] : '';
  if (pcgTab === 'prod') {
    const salcol = (i, c) => col('b' + i, pcgSalon(i), r => { const s = r.stock[i]; return s && s[0] != null ? s[0] : -1; }, r => { const s = r.stock[i]; return s && s[0] != null ? pcgN0(s[0]) : '–'; }, r => { const s = r.stock[i]; return s && s[0] != null ? pcgN0(s[0]) : '–'; }, { x: 1 });
    pcgPT = TRSheet.table({ id: 'pcgp', el: '#pcgTbl', rows: () => pcgPRO, limit: pcgN, group: { k: 'sup', key: r => r.sup,
        head: (g, r, n) => g < 0 ? '<b>No supplier yet</b><span class="pcg-gn">' + pcgN0(n) + ' product' + (n === 1 ? '' : 's') + ' in this list. Ask the coordinator who they order these from.</span>'
          : '<b>' + pcgNum(prdEsc(D.SU[g][0]), pcgSupSpec(g, 'products')) + '</b><span class="pcg-gn">' + pcgN0(n) + ' product' + (n === 1 ? '' : 's') + ' in this list</span>' },
      cols: [
        { k: 'name', l: 'Product', t: 'txt', raw: r => r.name, disp: r => r.name, cell: r => `<span class="ps-pn"><b>${prdEsc(r.name)}</b><em>${prdEsc(r.brand)} · ${pcgTy(r.type)}</em></span>` },
        col('cost', 'Cost (AED)', r => r.cost == null ? -1 : r.cost, r => pcgMoney(r.cost), r => pcgMoney(r.cost)),
        col('price', 'Price (AED)', r => r.price == null ? -1 : r.price, r => r.type === 'retail' ? pcgMoney(r.price) : '–', r => r.type === 'retail' ? pcgMoney(r.price) : '–'),
        col('st', 'In stock', r => r.st, r => pcgN0(r.st), r => pcgNum(pcgN0(r.st), pcgStockSpec(r.i)), { sub: 'salons picked' }),
        col('ou', 'Ordered', r => r.ou, r => pcgN0(r.ou), r => pcgNum(pcgN0(r.ou), r.ou ? pcgOrdSpec(r.i, null, false) : null), { sub: 'units in the Period' }),
        { k: 'sup', l: 'Supplier', sub: 'newest order that had it', t: 'txt', sk: r => r.sup < 0 ? 9999 : pcgSupRank(r.sup), raw: supName, disp: r => r.sup < 0 ? 'No supplier yet' : supName(r),
          cell: r => r.sup < 0 ? '<span class="pcg-none">No supplier yet</span>' : pcgNum(prdEsc(supName(r)), pcgSupSpec(r.sup, 'products')) + (r.sups.length > 1 ? ` <span class="pcg-also">${pcgNum('+' + (r.sups.length - 1) + ' more', pcgProdSupSpec(r.i))}</span>` : '') },
        { k: 'ty', l: 'Type', t: 'txt', x: 1, raw: r => r.type, disp: r => r.type === 'retail' ? 'Retail' : r.type === 'colour' ? 'Colour' : 'Professional', cell: r => pcgTy(r.type) },
        { k: 'bd', l: 'Brand', t: 'txt', x: 1, raw: r => r.brand, disp: r => r.brand || '(blank)', cell: r => prdEsc(r.brand) },
        { k: 'bc', l: 'Barcode', t: 'txt', x: 1, raw: r => r.bc, disp: r => r.bc || '(none)', cell: r => prdEsc(r.bc || '–') },
        { k: 'last', l: 'Last ordered', t: 'date', x: 1, raw: r => r.supLast || '', disp: r => r.supLast ? pcgDay(r.supLast) : 'never', cell: r => r.supLast ? pcgDay(r.supLast) : '–' },
        col('times', 'Times ordered', r => r.supN, r => pcgN0(r.supN), r => pcgNum(pcgN0(r.supN), r.supN ? pcgProdSupSpec(r.i) : null), { x: 1, sub: 'all time' })
      ].concat([0, 1, 2, 3].map(i => salcol(i))),
      total: rows => { let s = 0, u = 0; rows.forEach(r => { s += r.st; u += r.ou; }); return { name: 'Total of ' + pcgN0(rows.length) + ' product' + (rows.length === 1 ? '' : 's'), st: pcgN0(s), ou: pcgN0(u) }; },
      after: (T, rows) => {
        pcgPager(T, rows, 'product');
        const none = rows.filter(r => r.sup < 0).length, w = document.getElementById('pcgWatch');
        if (w) w.textContent = none ? pcgN0(none) + ' of the ' + pcgN0(rows.length) + ' products in this list have no supplier. Sort Supplier to bring them together, then ask the coordinator who they order them from.' : 'Every product in this list has a supplier.';
      } });
    pcgPT.sort = { k: 'sup', dir: 1 };   // ordered by supplier A to Z, no supplier last; inside a supplier the most ordered comes first
  } else {
    const aed = (k, l, sub) => col(k === 'mnA' ? 'mn' : k === 'mxA' ? 'mx' : 'st', l, r => r[k], r => pcgN0(r[k]), r => pcgNum(pcgN0(r[k]), r.prods ? pcgSupSpec(r.i, 'products') : null), { sub });
    pcgST = TRSheet.table({ id: 'pcgs', el: '#pcgTbl', rows: () => pcgSUP, limit: pcgN,
      cols: [
        { k: 'name', l: 'Supplier', t: 'txt', raw: r => r.name, disp: r => r.name, cell: r => `<span class="ps-pn"><b>${pcgNum(prdEsc(r.name), pcgSupSpec(r.i, r.prods ? 'products' : 'orders'))}</b>${r.also.length ? '<em>' + pcgNum('Also spelled ' + (r.also.length + 1) + ' ways', pcgNamesSpec(r.i)) + '</em>' : ''}</span>` },
        col('pr', 'Products', r => r.prods, r => pcgN0(r.prods), r => pcgNum(pcgN0(r.prods), r.prods ? pcgSupSpec(r.i, 'products') : null), { sub: 'newest order was from them' }),
        aed('mnA', 'Min AED', 'shelves at the Min level'), aed('mxA', 'Max AED', 'shelves at the Max level'), aed('stA', 'In stock AED', 'on the shelf now, at cost'),
        { k: 'act', l: 'Order', t: 'txt', raw: r => pcgCanOrder(r.name) ? 'Order now' : 'Not yet', disp: r => pcgCanOrder(r.name) ? 'Order now' : 'Not yet',
          cell: r => `<button type="button" class="cm-pill pcg-ord" ${pcgCanOrder(r.name) ? `onclick="pcgOrderNow('${prdEsc(r.name)}')"` : 'disabled'}>Order now</button>` },
        col('or', 'Orders', r => r.orders, r => pcgN0(r.orders), r => pcgNum(pcgN0(r.orders), r.orders ? pcgSupSpec(r.i, 'orders') : null), { x: 1, sub: 'in the Period' }),
        { k: 'ct', l: 'Contact', sub: 'saved in Phorest', t: 'txt', x: 1, raw: r => (r.contact + ' ' + r.phone + ' ' + r.email).trim(), disp: r => pcgHasContact(r) ? (r.contact || r.phone || r.email) : 'None in Phorest',
          cell: r => pcgHasContact(r) ? `<span class="ps-pn"><b>${prdEsc(r.contact || 'No name')}</b><em>${prdEsc([r.phone, r.email].filter(Boolean).join(' · '))}</em></span>` : '<span class="pcg-none">None in Phorest</span>' },
        { k: 'last', l: 'Last order', t: 'date', x: 1, raw: r => r.last || '', disp: r => r.last ? pcgDay(r.last) : 'never', cell: r => r.last ? pcgDay(r.last) : '–' },
        { k: 'first', l: 'First order', t: 'date', x: 1, raw: r => r.first || '', disp: r => r.first ? pcgDay(r.first) : 'never', cell: r => r.first ? pcgDay(r.first) : '–' },
        { k: 'sal', l: 'Salons that order', t: 'txt', x: 1, raw: r => r.salons.map(b => PCG_SALONS[b]).join(' '), disp: r => r.salons.length ? r.salons.map(pcgSalon).join(', ') : 'none', cell: r => r.salons.length ? prdEsc(r.salons.map(pcgSalon).join(', ')) : '–' },
        { k: 'nt', l: 'Note in Phorest', t: 'txt', x: 1, raw: r => r.note, disp: r => r.note || '(blank)', cell: r => prdEsc(r.note || '–') }
      ],
      total: rows => { let p = 0, o = 0, a = 0, b = 0, c = 0; rows.forEach(r => { p += r.prods; o += r.orders; a += r.mnA; b += r.mxA; c += r.stA; }); return { name: 'Total', pr: pcgN0(p), mn: pcgN0(a), mx: pcgN0(b), st: pcgN0(c), or: pcgN0(o) }; },
      after: (T, rows) => pcgPager(T, rows, 'supplier') });
    pcgST.sort = { k: 'mx', dir: -1 };   // biggest supplier first, as in Out of Stock
  }
}
// Order now: only DBD so far. Out of Stock's supplier order is a window opened from its own page, so this goes there.
function pcgOrderNow(name) { try { if (typeof showView === 'function') showView('outofstock'); else location.href = '/?view=out-of-stock'; } catch (e) { location.href = '/?view=out-of-stock'; } void name; }

// ── WINDOWS (drill.js): what is behind a figure, level after level, to a single line ────────
const pcgLast = 'This is the last step: each row is a month, salon and supplier. The order numbers are in Phorest.';
function pcgStockSpec(p) {
  const pr = pcgD.PR[p];
  return { title: pr[0] + ', in stock', sub: pcgScope(), cur: 'AED', sk: 'stock-' + pcgSlug(pr[0]), views: [{ id: 'salons', label: 'Salons', load: async () => {
    const rows = pcgBs().filter(b => pr[10][b]).map(b => { const s = pr[10][b]; return { s: pcgSalon(b), q: s[0] || 0, mn: s[1] || 0, mx: s[2] || 0 }; });
    const sum = k => rows.reduce((a, r) => a + r[k], 0);
    return { cols: [{ k: 's', l: 'Salon' }, { k: 'q', l: 'In stock', t: 'num' }, { k: 'mn', l: 'Min', t: 'num' }, { k: 'mx', l: 'Max', t: 'num' }], rows, foot: { s: 'Total', q: sum('q'), mn: sum('mn'), mx: sum('mx') },
      sub: pcgN0(sum('q')) + ' in stock across ' + rows.length + ' salon' + (rows.length === 1 ? '' : 's') + ' · ' + pr[1] + '. Min and Max are the levels set in Phorest.', note: 'This is the last step: a salon’s count has nothing behind it, so its figures stay plain.' };
  } }] };
}
// the months, salons and suppliers behind a product's units. sup = one supplier, all = every month and salon (not just the Period)
function pcgOrdSpec(p, sup, all) {
  const pr = pcgD.PR[p];
  return { title: pr[0] + ', ordered' + (sup != null ? ' from ' + pcgD.SU[sup][0] : ''), sub: all ? 'All time, all salons' : pcgScope() + ' · ' + pcgPeriod(), cur: 'AED', sk: 'ord-' + pcgSlug(pr[0]) + (sup != null ? '-' + pcgSlug(pcgD.SU[sup][0]) : '') + (all ? '-all' : ''),
    views: [{ id: 'ord', label: 'Orders', load: async () => {
      const inM = pcgMonths(), inB = {}; pcgBs().forEach(b => { inB[b] = 1; }); const by = {};
      pcgD.TU.forEach(t => { if (t[0] !== p || (sup != null && t[3] !== sup) || (!all && (!inM[t[1]] || !inB[t[2]]))) return; const k = t[1] + '|' + t[2] + '|' + t[3], a = by[k] || (by[k] = { m: t[1], b: t[2], s: t[3], u: 0, l: 0 }); a.u += t[4]; a.l += t[5]; });
      const rows = Object.keys(by).map(k => by[k]).sort((a, b) => b.m - a.m || a.b - b.b), u = rows.reduce((a, r) => a + r.u, 0), l = rows.reduce((a, r) => a + r.l, 0);
      return { cols: [{ k: 'm', l: 'Month' }, { k: 'b', l: 'Salon' }, { k: 's', l: 'Supplier' }, { k: 'u', l: 'Units', t: 'num' }, { k: 'l', l: 'Order lines', t: 'num' }],
        rows: rows.map(r => ({ m: pcgMonthName(r.m), b: pcgSalon(r.b), s: pcgD.SU[r.s][0], u: r.u, l: r.l, _dn: { s: pcgSupSpec(r.s, 'products') } })), foot: { m: 'Total', b: '', s: '', u, l },
        sub: pcgN0(rows.length) + ' row' + (rows.length === 1 ? '' : 's') + ' (month, salon, supplier) · ' + pcgN0(u) + ' units on ' + pcgN0(l) + ' order line' + (l === 1 ? '' : 's') + '.', note: pcgLast };
    } }] };
}
// the suppliers that have had one product on an order
function pcgProdSupSpec(p) {
  const pr = pcgD.PR[p];
  return { title: pr[0] + ', suppliers', sub: 'All time, all salons', cur: 'AED', sk: 'psup-' + pcgSlug(pr[0]), views: [{ id: 'sups', label: 'Suppliers', load: async () => {
    const rows = pr[9].map(x => ({ s: pcgD.SU[x[0]][0], n: x[1], last: x[2], _dn: { s: pcgSupSpec(x[0], 'products'), n: pcgOrdSpec(p, x[0], true) } })), n = rows.reduce((a, r) => a + r.n, 0);
    return { cols: [{ k: 's', l: 'Supplier' }, { k: 'n', l: 'Order lines', t: 'num' }, { k: 'last', l: 'Last ordered', t: 'date' }], rows, foot: { s: rows.length + ' supplier' + (rows.length === 1 ? '' : 's'), n, last: '' },
      sub: rows.length + ' supplier' + (rows.length === 1 ? '' : 's') + ' have had this product on an order · ' + pcgN0(n) + ' order lines in all.', note: 'The newest is the one the Supplier column shows.' };
  } }] };
}
// ONE supplier: its products (with the AED behind each figure) and its orders by month and salon. first = the tab that opens first.
function pcgSupSpec(s, first) {
  const D = pcgD, su = D.SU[s], ct = [su[7], su[8], su[9]].filter(Boolean).join(' · ') || 'No contact saved in Phorest';
  const products = { id: 'products', label: 'Products', load: async () => {
    const bs = pcgBs(), rows = [];
    D.PR.forEach((p, i) => { if (p[6] !== s || !bs.some(b => p[10][b] != null)) return; const lv = pcgLevels(i, bs), n = (p[9].filter(x => x[0] === s)[0] || [0, 0])[1];
      rows.push({ p: p[0], last: p[7], n, st: lv.st, mn: lv.mn, mx: lv.mx, mnA: Math.round(lv.mnA), mxA: Math.round(lv.mxA), stA: Math.round(lv.stA), _lv: lv, _dn: { n: pcgOrdSpec(i, s, true), st: pcgStockSpec(i), mn: pcgStockSpec(i), mx: pcgStockSpec(i), mnA: pcgStockSpec(i), mxA: pcgStockSpec(i), stA: pcgStockSpec(i) } }); });
    rows.sort((a, b) => b.n - a.n);
    const sum = k => rows.reduce((a, r) => a + (k === 'mnA' || k === 'mxA' || k === 'stA' ? r._lv[k] : r[k]), 0);
    return { cols: [{ k: 'p', l: 'Product' }, { k: 'last', l: 'Last ordered', t: 'date' }, { k: 'n', l: 'Order lines', t: 'num' }, { k: 'st', l: 'In stock', t: 'num' }, { k: 'mn', l: 'Min', t: 'num' }, { k: 'mx', l: 'Max', t: 'num' }, { k: 'mnA', l: 'Min AED', t: 'num' }, { k: 'mxA', l: 'Max AED', t: 'num' }, { k: 'stA', l: 'In stock AED', t: 'num' }],
      rows, foot: { p: pcgN0(rows.length) + ' product' + (rows.length === 1 ? '' : 's'), last: '', n: sum('n'), st: sum('st'), mn: sum('mn'), mx: sum('mx'), mnA: Math.round(sum('mnA')), mxA: Math.round(sum('mxA')), stA: Math.round(sum('stA')) },
      sub: pcgN0(rows.length) + ' product' + (rows.length === 1 ? '' : 's') + ' whose newest order was from ' + su[0] + ' · ' + pcgScope() + ' · ' + ct + '. AED is the level times the cost of one unit.', note: 'Tap a figure to go down: order lines, then the salons.' };
  } };
  const orders = { id: 'orders', label: 'Orders', load: async () => {
    const inM = pcgMonths(), inB = {}; pcgBs().forEach(b => { inB[b] = 1; }); const by = {};
    D.SO.forEach(x => { if (x[0] !== s || !inM[x[1]] || !inB[x[2]]) return; const k = x[1] + '|' + x[2], a = by[k] || (by[k] = { m: x[1], b: x[2], n: 0 }); a.n += x[3]; });
    const rows = Object.keys(by).map(k => by[k]).sort((a, b) => b.m - a.m || a.b - b.b), n = rows.reduce((a, r) => a + r.n, 0);
    if (!rows.length) return { cols: [{ k: 'm', l: 'Month' }], rows: [], note: 'No orders to ' + su[0] + ' in ' + pcgScope() + ', ' + pcgPeriod() + '. Pick a wider Period.' };
    return { cols: [{ k: 'm', l: 'Month' }, { k: 'b', l: 'Salon' }, { k: 'n', l: 'Orders', t: 'num' }], rows: rows.map(r => ({ m: pcgMonthName(r.m), b: pcgSalon(r.b), n: r.n })), foot: { m: 'Total', b: '', n },
      sub: pcgN0(n) + ' order' + (n === 1 ? '' : 's') + ' to ' + su[0] + ' · ' + pcgScope() + ', ' + pcgPeriod() + ' · ' + ct + '.', note: 'This is the last step: each row is a month and a salon. The order numbers are in Phorest.' };
  } };
  return { title: su[0], sub: pcgScope() + ' · ' + pcgPeriod(), cur: 'AED', sk: 'supplier-' + pcgSlug(su[0]), views: first === 'orders' ? [orders, products] : [products, orders] };
}
function pcgNamesSpec(s) {
  const su = pcgD.SU[s], names = [su[0]].concat(su[6]);
  return { title: su[0] + ', spellings in Phorest', sub: 'The four salons keep their own supplier lists', sk: 'names-' + pcgSlug(su[0]), views: [{ id: 'names', label: 'Names', load: async () => ({
    cols: [{ k: 'n', l: 'Name in Phorest' }, { k: 'w', l: '' }], rows: names.map((n, i) => ({ n, w: i === 0 ? 'shown here' : '' })), foot: { n: names.length + ' names', w: '' },
    sub: names.length + ' spellings of one supplier, shown as ' + su[0] + '.', note: 'This is the last step: a spelling has nothing behind it.' }) }] };
}

// ── HOW IT IS WORKED OUT, ABOUT THIS PAGE: centred, one short idea per card ──────────────
function pcgPaintHow() {
  const pick = document.getElementById('pcgPick'), card = document.getElementById('pcgHowCard'); if (!pick || !card) return;
  const D = pcgD, first = pcgPRO.filter(x => x.sup >= 0 && x.sups.length > 1)[0] || pcgPRO.filter(x => x.sup >= 0)[0], topS = pcgSUP.slice().sort((a, b) => b.orders - a.orders)[0], stk = pcgPRO.filter(x => x.st > 0 && pcgBs().filter(b => x.stock[b]).length > 1)[0];
  const HOW = {
    sup: ['Supplier of a product', 'Phorest keeps no supplier on a product. We take the newest order that had it on.', first ? prdEsc(first.name) + ': last on an order on ' + pcgDay(first.supLast) + ' from ' + pcgNum(prdEsc(D.SU[first.sup][0]), pcgProdSupSpec(first.i)) : 'Nothing in this list.', 'A product never ordered through Phorest has none.'],
    one: ['One name for a supplier', 'Each salon keeps its own supplier list in Phorest, so one supplier has several spellings. We show them as one.', D.SU.length && D.SU[0][6].length ? D.SU[0][6].slice(0, 2).map(prdEsc).join(' + ') + ' + ' + prdEsc(D.SU[0][0]) + ' = ' + pcgNum(prdEsc(D.SU[0][0]), pcgNamesSpec(0)) : 'Nothing to fold.', 'A name folded wrongly is fixed once and holds everywhere.'],
    ord: ['Orders in the Period', 'Phorest orders placed in the Period, added across the salons you picked.', topS && topS.orders ? prdEsc(topS.name) + ': ' + pcgN0(topS.orders) + ' orders in ' + prdEsc(pcgPeriod()) + ' = ' + pcgNum(pcgN0(topS.orders), pcgSupSpec(topS.i, 'orders')) : 'No orders in these dates.', 'One order can carry many products.'],
    stock: ['In stock', 'The count Phorest holds, added across the salons you picked.', stk ? prdEsc(stk.name) + ': ' + pcgBs().filter(b => stk.stock[b]).map(b => pcgSalon(b) + ' ' + pcgN0(stk.stock[b][0] || 0)).join(' + ') + ' = ' + pcgNum(pcgN0(stk.st), pcgStockSpec(stk.i)) : 'Nothing in this list.', 'A count is only as fresh as the last stock take.']
  };
  if (!HOW[pcgHK]) pcgHK = 'sup';
  pick.innerHTML = Object.keys(HOW).map(k => `<button type="button" class="${k === pcgHK ? 'on' : ''}" onclick="pcgHK='${k}';pcgPaintHow()">${HOW[k][0]}</button>`).join('');
  const h = HOW[pcgHK]; card.innerHTML = `<div class="ps-hc-t">${h[0]}</div><p class="ps-hc-m">${h[1]}</p><div class="ps-hc-big">${h[2]}</div><div class="ps-hc-cv">${h[3]}</div>`;
}
function pcgPaintAbout() {
  const pick = document.getElementById('pcgApick'), card = document.getElementById('pcgAcard'); if (!pick || !card) return;
  const ABOUT = {
    src: ['Where it comes from', 'Products and stock come from Phorest, all four UAE salons. Suppliers and orders too.', 'Read on ' + (pcgD.asof ? pcgDay(pcgD.asof) : 'an earlier day') + '.'],
    lnk: ['Supplier on a product', 'Phorest has no supplier on a product, so it comes from the newest order that had it.', pcgN0(pcgPRO.total - pcgPRO.withSup) + ' products have no order we could match.'],
    ctc: ['Contacts', 'A contact is shown only when Phorest has one saved.', 'Only ' + pcgSUP.nContact + ' of ' + pcgD.SU.length + ' suppliers have one.'],
    mm: ['Min and Max', 'Min and Max are the levels set in Phorest. AED is the level times the cost of one unit.', 'A blank Max counts as 0, so some suppliers show Min above Max.'],
    inn: ['What is in', 'Products on a salon’s Phorest list. Bahrain is not in yet.', 'Archived products are left out.']
  };
  if (!ABOUT[pcgAK]) pcgAK = 'src';
  pick.innerHTML = Object.keys(ABOUT).map(k => `<button type="button" class="${k === pcgAK ? 'on' : ''}" onclick="pcgAK='${k}';pcgPaintAbout()">${ABOUT[k][0]}</button>`).join('');
  const a = ABOUT[pcgAK]; card.innerHTML = `<div class="ps-hc-t">${a[0]}</div><p class="ps-hc-m">${a[1]}</p><div class="ps-hc-cv">${a[2]}</div>`;
}

// ── DOWNLOADS: the list on the tab, every column, the rows the heading filters leave ──────────────
function pcgExport() {
  const T = pcgCurT(); if (!T || !pcgD) return null;
  const rows = T.rows(); if (!rows.length) return null;
  const r2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100, D = pcgD, prod = pcgTab === 'prod';
  if (prod) {
    const cols = [{ key: 'p', label: 'Product', fmt: 'text' }, { key: 'b', label: 'Brand', fmt: 'text' }, { key: 't', label: 'Type', fmt: 'text' }, { key: 'bc', label: 'Barcode', fmt: 'text' }, { key: 'sup', label: 'Supplier', fmt: 'text' }, { key: 'last', label: 'Last ordered', fmt: 'text' },
      { key: 'cost', label: 'Cost (AED)', fmt: 'aed' }, { key: 'price', label: 'Price (AED)', fmt: 'aed' }, { key: 'st', label: 'In stock', fmt: 'num' }, { key: 'mn', label: 'Min', fmt: 'num' }, { key: 'mx', label: 'Max', fmt: 'num' }, { key: 'ou', label: 'Ordered in the Period (units)', fmt: 'num' }]
      .concat(PCG_SALONS.map((c, i) => ({ key: 's' + c, label: pcgSalon(i) + ' in stock', fmt: 'num' })));
    const lines = rows.map(r => ({ cells: [r.name, r.brand, r.type, r.bc, r.sup >= 0 ? D.SU[r.sup][0] : '', r.supLast || '', r2(r.cost), r2(r.type === 'retail' ? r.price : null), r2(r.st), r2(r.mn), r2(r.mx), r2(r.ou)].concat(PCG_SALONS.map((c, i) => r.stock[i] && r.stock[i][0] != null ? r.stock[i][0] : null)) }));
    return { name: ['all-products', pcgScope()].map(pcgSlug).join('-'), csv: 0, sheets: [{ name: 'All products', title: 'All products', subtitle: pcgScope() + ' · ordered in ' + pcgPeriod(), blocks: [{ cols, rows: lines }], legend: [['Supplier', 'The supplier of the newest Phorest order that had the product on it.'], ['Ordered', 'Units on Phorest orders in the Period, for the salons picked.']] }] };
  }
  const cols = [{ key: 'n', label: 'Supplier', fmt: 'text' }, { key: 'p', label: 'Products', fmt: 'num' }, { key: 'mn', label: 'Min AED', fmt: 'aed' }, { key: 'mx', label: 'Max AED', fmt: 'aed' }, { key: 'st', label: 'In stock AED', fmt: 'aed' }, { key: 'o', label: 'Orders in the Period', fmt: 'num' },
    { key: 'c', label: 'Contact', fmt: 'text' }, { key: 'ph', label: 'Phone', fmt: 'text' }, { key: 'em', label: 'Email', fmt: 'text' }, { key: 'l', label: 'Last order', fmt: 'text' }, { key: 'f', label: 'First order', fmt: 'text' }, { key: 'sa', label: 'Salons that order', fmt: 'text' }];
  const lines = rows.map(r => ({ cells: [r.name, r.prods, r2(r.mnA), r2(r.mxA), r2(r.stA), r.orders, r.contact, r.phone, r.email, r.last || '', r.first || '', r.salons.map(pcgSalon).join(', ')] }));
  return { name: ['order-by-supplier', pcgScope()].map(pcgSlug).join('-'), csv: 0, sheets: [{ name: 'Order by supplier', title: 'Order by supplier', subtitle: pcgScope() + ' · orders in ' + pcgPeriod(), blocks: [{ cols, rows: lines }], legend: [['Min AED / Max AED', 'The Min or Max level set in Phorest times the cost of one unit, added up for the supplier’s products.'], ['In stock AED', 'What is on the shelf now times the cost of one unit.']] }] };
}
