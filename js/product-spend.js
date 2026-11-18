// Products · Top products by spend (Kate, 18 Nov 2026), built from the local mockup docs/mockups/top-products-by-spend.html in the cowork repo.
//
// Replaces the old top 15 card. The page keeps its Team toggle, tiles, weekly chart and Why wall (products.js); this draws the rest from three read-only calls
// (migrations/product_spend_report.sql): product_spend_rows (every product that arrived in the Period, with the total of ALL stock beside it so a share is a true
// share), product_stock_lines (the order lines of one product) and product_sales_lines (the till lines of one product with the client, Level 3 and up).
//
// Kate's rulings applied here (18 Nov 2026):
//   - the masthead's Branch and Period drive it; the page's Team toggle too. Bahrain is not in these numbers (its stock is costed in its own currency).
//   - every table has the Google Sheets heading menus (sheet-table.js); every figure opens what is behind it (drill.js), level after level, to a single line:
//     product > deliveries (month and salon) > order lines, and product > clients who bought it > her till lines. Units opens the CLIENTS first.
//   - the table pages (10, 20, 50 or 100 a page), XLSX and CSV, a toolbar pinned under the masthead that follows it (ResizeObserver, component 37).
//   - How it is worked out and About this page are centred, one short idea per card (component 36).
// Until the migration is applied the card shows the old top 15 and says so (the page never breaks).
// Needs from products.js and dashboard.js (shared script scope): sb, prdData, prdDept, prdSetDept, prdEsc, prdNum, prdAed, prdDayY, PRD_BRANCH, TRS_LEVEL, CURRENT_VIEW;
// from drill.js TRSD; sheet-table.js TRSheet; report-export.js rexButtons; pulse-drill.js PD.
const PS_LIMIT = 2000;
const PS_SALONS = ['SAA', 'KCA', 'MC', 'AQ'];
const PS_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let psD = null, psR = [], psTotal = 0, psSeq = 0, psT = null, psType = 'A', psN = 10, psHK = 'share', psAK = 'src', psRO = null, psMO = null, psRaf = 0;
const psCache = {};
try { const s = JSON.parse(localStorage.getItem('trs-products-top') || '{}'); if ([10, 20, 50, 100].includes(s.n)) psN = s.n; } catch (e) {}
const psSave = () => { try { localStorage.setItem('trs-products-top', JSON.stringify({ n: psN })); } catch (e) {} };

const psNum = (html, spec) => (typeof TRSD !== 'undefined' && spec) ? TRSD.num(html, spec) : html;
const psCan = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const psSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const psPf = (a, b) => b ? (Math.round(1000 * a / b) / 10).toFixed(1) + '%' : '0.0%';
const psMoney = v => v >= 10 ? prdNum(v) : (Math.round(v * 10) / 10).toFixed(1);
const psSalon = c => PRD_BRANCH[c] || c;
const psMonthName = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? PS_MON[+m[2] - 1] + ' ' + m[1] : ''; };
const psTeamText = () => (prdDept === 'all' ? '' : prdDept + ' ') + (psType === 'A' ? '' : psType + ' ');
const psWin = () => prdData && prdData.win;
const psScope = () => { const w = psWin(); return !w ? '' : (w.branches.length === PS_SALONS.length ? 'UAE Branches' : w.branches.map(psSalon).join(' + ')); };
const psPeriod = () => { const w = psWin(); return w ? prdDayY(w.from) + ' to ' + prdDayY(w.to) : ''; };
const psTy = t => `<span class="ps-ty ${t}">${t === 'retail' ? 'Retail' : 'Professional'}</span>`;

function psCall(fn, args) {
  const key = fn + JSON.stringify(args);
  if (!psCache[key]) {
    psCache[key] = Promise.resolve(sb.rpc(fn, args)).then(r => { if (r.error) { delete psCache[key]; throw r.error; } return r.data; }, e => { delete psCache[key]; throw e; });
  }
  return psCache[key];
}
const psMissing = e => /could not find the function|does not exist|schema cache/i.test((e && e.message) || '');

// ── MOUNT: called by products.js once the page is drawn ──────────────────────────────
async function psMount(d) {
  const root = document.getElementById('psRoot'); if (!root) return;
  const w = d.win, seq = ++psSeq;
  psD = null; psT = null;
  root.innerHTML = '<p class="slv-muted" style="margin-top:16px">Loading products…</p>';
  try {
    const data = await psCall('product_spend_rows', { p_branches: w.branches, p_from: w.from, p_to: w.to, p_limit: PS_LIMIT });
    if (seq !== psSeq) return;
    psD = data; psBuild(root); psPaintAll();
  } catch (e) {
    if (seq !== psSeq) return;
    console.error('Products, top products', e);
    root.innerHTML = psFallback(d, psMissing(e));
  }
}
// the old card: the top 15 by spend, until the small database update is applied
function psFallback(d, missing) {
  if (!d.products || !d.products.length) return '';
  const top = Math.max(...d.products.map(p => Number(p.spend) || 0));
  const rows = d.products.map((p, i) => `<tr><td>${i + 1}</td><td>${prdEsc(p.product)}<div class="slv-note">${prdEsc(p.brand || '')}</div></td><td>${p.type === 'retail' ? 'Retail' : 'Professional'}</td><td>${prdNum(p.units)}</td><td>${prdNum(p.spend)}</td></tr>`).join('');
  const cards = d.products.map((p, i) => `<li class="prd-card"><span class="prd-rank">${i + 1}</span><div class="prd-body"><div class="prd-top"><span class="prd-name">${prdEsc(p.product)}</span><span class="prd-spend">AED ${prdNum(p.spend)}</span></div>
    <div class="prd-meta">${p.type === 'retail' ? 'Retail' : 'Professional'} · ${prdNum(p.units)} unit${Number(p.units) === 1 ? '' : 's'}${p.brand ? ' · ' + prdEsc(p.brand) : ''}</div><div class="prd-bar"><i style="width:${top ? Math.max(2, Math.round(100 * (Number(p.spend) || 0) / top)) : 0}%;background:${p.type === 'retail' ? PRD_RETAIL : PRD_PROF}"></i></div></div></li>`).join('');
  return `<section class="slv-card" style="margin-top:14px"><div class="slv-head"><div><div class="slv-eyebrow">Where the money went</div><h3>Top products by spend</h3></div></div>
    <div class="slv-wrap prd-desk"><table class="slv-table"><thead><tr><th>#</th><th>Product</th><th>Type</th><th>Units</th><th>Spend (AED)</th></tr></thead><tbody>${rows}</tbody></table></div><ol class="prd-cards">${cards}</ol>
    <p class="slv-muted">${missing ? 'The full list, the clients who bought each product and the order lines need a small database update that has not been applied yet.' : 'The full list did not load. Refresh to try again.'}</p></section>`;
}

// ── THE NUMBERS for the Team and Type picked ─────────────────────────────────────────
function psCompute() {
  const rows = (psD.rows || []).filter(r => (prdDept === 'all' || r.dept === prdDept) && (psType === 'A' || r.type === psType));
  psTotal = (psD.totals || []).filter(t => (prdDept === 'all' || t.dept === prdDept) && (psType === 'A' || t.type === psType)).reduce((a, t) => a + (Number(t.spend) || 0), 0);
  let c = 0;
  psR = rows.map((r, i) => { const sp = Number(r.spend) || 0, u = Number(r.units) || 0; c += sp;
    return { p: r.product, brand: r.brand || '', type: r.type, team: r.dept || 'Hair', sp, u, l: r.lines || 0, nm: r.months || 0, br: r.br || {}, rk: i + 1, cum: c, cu: u ? sp / u : 0, share: psTotal ? 100 * sp / psTotal : 0, cumShare: psTotal ? 100 * c / psTotal : 0 }; });
}
const psTop = n => { const k = Math.min(n, psR.length); let s = 0; for (let i = 0; i < k; i++) s += psR[i].sp; return { n: k, sp: s }; };

// ── THE CARD ─────────────────────────────────────────────────────────────────────────
function psBuild(root) {
  root.innerHTML = `
    <section class="ps-sec" data-jn="Top products by spend">
      <div class="slv-eyebrow">Where the money went</div>
      <h3>Top products by spend</h3>
      <div class="ps-filters">
        <div class="sc-seg" role="group" aria-label="Team">${[['all', 'All teams'], ['Hair', 'Hair'], ['Beauty', 'Beauty']].map(([k, l]) => `<button type="button" class="${prdDept === k ? 'on' : ''}" onclick="prdSetDept('${k}')">${l}</button>`).join('')}</div>
        <div class="sc-seg" role="group" aria-label="Type">${[['A', 'All types'], ['retail', 'Retail'], ['professional', 'Professional']].map(([k, l]) => `<button type="button" class="${psType === k ? 'on' : ''}" data-ps-type="${k}" onclick="psSetType('${k}')">${l}</button>`).join('')}</div>
      </div>
      <section class="ps-ans" aria-label="The answer in one line"><div class="ps-ans-k">The answer in one line</div><div class="ps-ans-t" id="psAns"></div><div class="ps-ans-s" id="psAns2"></div></section>
      <div class="ps-learn"><p><b>What is this?</b> The 10 products that took the most stock money in the Period, biggest first. The bar shows how big each is next to the top one.</p>
        <p><b>Why it matters.</b> A product that takes a big share of the budget should earn its place: it sells, or it gets used on clients.</p>
        <p class="ex" id="psEx"></p><p class="watch"><b>What to watch.</b> <span id="psW1"></span></p></div>
      <div class="ps-vis" id="psVis"></div>
      <div class="ps-legend"><span><i class="retail"></i>Retail, bought to sell</span><span><i class="professional"></i>Professional, used on clients</span></div>
      <div class="ps-conc" id="psConc"></div>
    </section>
    <section class="ps-sec" data-jn="Every product" id="psEvery">
      <h3>Every product</h3>
      <div class="ps-learn"><p><b>What is this?</b> The same list as a sheet, biggest first. Tap the funnel in a heading to sort or filter it.</p>
        <p><b>Why it matters.</b> Sorting by Units or Cost a unit shows what moves most and what is dear, which spend alone hides.</p>
        <p class="watch"><b>What to watch.</b> <span id="psW2"></span></p></div>
      <div class="ps-bar" id="psBar">
        <button type="button" class="cm-pill" id="psMore" onclick="psToggleMore()">All columns</button>
        <button type="button" class="cm-pill ps-phone" data-sxcm="prd">Sort and filter</button>
        <span class="ps-sp"></span>
        <button type="button" class="cm-pill" id="psClear" hidden onclick="psT.clear();psT.draw()">Clear filters</button>${typeof rexButtons === 'function' ? rexButtons('psExport') : ''}
      </div>
      <div class="ps-card"><table id="psTbl"></table></div>
      <div class="ps-pager"><span id="psPgTxt"></span><span class="ps-sp"></span><span class="slv-eyebrow">Rows</span><select id="psPgSel" aria-label="Rows to show" onchange="psRowsPick(+this.value)"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
        <button type="button" class="cm-pill" id="psPrev" onclick="psPage(-1)">‹ Previous</button><span class="ps-pgn" id="psPgN"></span><button type="button" class="cm-pill" id="psNext" onclick="psPage(1)">Next ›</button></div>
    </section>
    <section class="ps-how" data-jn="How it is worked out"><h3>How it is worked out</h3><div class="sc-seg ps-pick" id="psPick" role="group" aria-label="Which figure"></div><div class="ps-howcard" id="psHowCard"></div></section>
    <section class="ps-how" data-jn="About this page"><h3>About this page</h3><div class="sc-seg ps-pick" id="psApick" role="group" aria-label="About this page"></div><div class="ps-howcard" id="psAcard"></div></section>`;
  document.getElementById('psPgSel').value = String(psN);
  psBuildTable();
}
function psSetType(k) { psType = k; document.querySelectorAll('[data-ps-type]').forEach(b => b.classList.toggle('on', b.dataset.psType === k)); psT.page = 0; psPaintAll(); }

function psPaintAll() {
  if (!psD) return;
  psCompute(); psPaintTop(); psT.draw(); psPaintHow(); psPaintAbout(); psWatch(); psOffsets();
}
function psPaintTop() {
  const t = psTop(10), what = psTeamText(), a = document.getElementById('psAns'), a2 = document.getElementById('psAns2');
  if (!psR.length) { a.textContent = 'No ' + what + 'stock arrived in these dates.'; a2.textContent = 'Pick a wider Period or another salon.'; document.getElementById('psVis').innerHTML = ''; document.getElementById('psConc').innerHTML = ''; document.getElementById('psEx').textContent = ''; document.getElementById('psW1').textContent = 'Nothing to read yet: widen the Period.'; return; }
  const ret = psR.slice(0, t.n).filter(r => r.type === 'retail').length, top = psR[0];
  a.innerHTML = '<b>' + Math.round(100 * t.sp / psTotal) + '</b> in every 100 AED of ' + what + 'stock went on the ' + t.n + ' biggest products.';
  a2.innerHTML = 'The biggest, ' + psNum(prdEsc(top.p), psProdSpec(top, 'deliveries')) + ', took AED ' + prdNum(top.sp) + ' (' + psPf(top.sp, psTotal) + '). ' + ret + ' of the top ' + t.n + ' ' + (ret === 1 ? 'is' : 'are') + ' retail and ' + (t.n - ret) + ' professional. ' + prdEsc(psScope()) + ', ' + prdEsc(psPeriod()) + '.';
  const mx = psR[0].sp;
  document.getElementById('psVis').innerHTML = psR.slice(0, 10).map(r => { const sp = psProdSpec(r, 'deliveries');
    return `<div class="ps-vr"><span class="ps-vk">${r.rk}</span><div class="ps-vn">${psNum(prdEsc(r.p), sp)}<em>${prdEsc(r.brand)} · ${psTy(r.type)} · ${r.team}</em></div><div class="ps-vb"><i class="${r.type}" style="width:${Math.max(2, Math.round(100 * r.sp / mx))}%"></i></div><div class="ps-vv"><b>AED</b> <span class="ps-fp">${psNum(prdNum(r.sp), sp)}<span class="ps-pcs">${psNum(psPf(r.sp, psTotal), sp)}</span></span></div></div>`; }).join('');
  document.getElementById('psConc').innerHTML = [3, 10, 25].map(n => { const c = psTop(n), sp = psTopSpec(n);
    return `<div class="ps-nb"><span>The top ${psR.length && psR.length < n ? 'all ' + psR.length : n} together</span><b>${psNum(psPf(c.sp, psTotal), sp)}</b><small>AED ${psNum(prdNum(c.sp), sp)} of AED ${prdNum(psTotal)}</small></div>`; }).join('');
  const nb = Object.keys(top.br).filter(c => Number(top.br[c]) > 0).length;
  document.getElementById('psEx').innerHTML = `<b>Example (real row).</b> ${prdEsc(top.p)}: ${prdNum(top.u)} unit${top.u === 1 ? '' : 's'} arrived in ${top.nm} month${top.nm === 1 ? '' : 's'} across ${nb} salon${nb === 1 ? '' : 's'}, AED ${prdNum(top.sp)} in all. Tap the amount to see each delivery.`;
  const top10 = psR.slice(0, 10), rets = top10.filter(r => r.type === 'retail');
  document.getElementById('psW1').textContent = rets.length ? rets.length + ' of the top ' + top10.length + ' ' + (rets.length === 1 ? 'is' : 'are') + ' retail, bought to sell. Read ' + (rets.length === 1 ? 'it' : 'them') + ' against what sold, not against spend alone.' : 'All of the top ' + top10.length + ' are professional, used on clients. Check they are being used up, not stored.';
}

// ── THE TABLE ────────────────────────────────────────────────────────────────────────
function psBuildTable() {
  const col = (k, l, raw, disp, cell, extra) => Object.assign({ k, l, t: 'num', raw, disp, cell }, extra || {});
  const oneSalon = () => (psWin() ? psWin().branches.length : 4) < 2;
  const brCell = c => r => psNum(prdNum(r.br[c] || 0), (r.br[c] && Number(r.br[c]) > 0) ? psProdSpec(r, 'deliveries', c) : null);
  psT = TRSheet.table({ id: 'prd', el: '#psTbl', rows: () => psR, limit: psN,
    cols: [
      { k: 'p', l: 'Product', t: 'txt', raw: r => r.p, disp: r => r.p, cell: r => `<span class="ps-stf"><span class="ps-rk">${r.rk}</span><span class="ps-pn"><b>${psNum(prdEsc(r.p), psProdSpec(r, 'deliveries'))}</b><em>${prdEsc(r.brand)} · ${psTy(r.type)} · ${r.team}</em></span></span>` },
      col('sp', 'Spend (AED)', r => r.sp, r => prdNum(r.sp), r => { const s = psProdSpec(r, 'deliveries'); return `<span class="ps-fp">${psNum(prdNum(r.sp), s)}<span class="ps-pcs">${psNum(psPf(r.sp, psTotal), s)}</span></span>`; }, { sub: 'and share of all stock spend' }),
      col('u', 'Units', r => r.u, r => prdNum(r.u), r => psNum(prdNum(r.u), psProdSpec(r, 'clients'))),
      col('cu', 'Cost a unit (AED)', r => r.cu, r => psMoney(r.cu), r => psMoney(r.cu)),
      { k: 'ty', l: 'Type', t: 'txt', x: 1, raw: r => r.type, disp: r => r.type === 'retail' ? 'Retail' : 'Professional', cell: r => psTy(r.type) },
      { k: 'tm', l: 'Team', t: 'txt', x: 1, raw: r => r.team, disp: r => r.team, cell: r => r.team },
      { k: 'bd', l: 'Brand', t: 'txt', x: 1, raw: r => r.brand, disp: r => r.brand || '(blank)', cell: r => prdEsc(r.brand) },
      col('cum', 'Running share', r => r.cumShare, r => psPf(r.cum, psTotal), r => psNum(psPf(r.cum, psTotal), psTopSpec(r.rk)), { x: 1 })
    ].concat(PS_SALONS.map(c => col('b' + c, () => psSalon(c), r => Number(r.br[c]) || 0, r => prdNum(r.br[c] || 0), brCell(c), { x: 1, hide: oneSalon })))
     .concat([col('nm', 'Months bought', r => r.nm, r => String(r.nm), r => String(r.nm), { x: 1 }), col('l', 'Order lines', r => r.l, r => prdNum(r.l), r => psNum(prdNum(r.l), psProdSpec(r, 'deliveries')), { x: 1 })]),
    total: rows => { let s = 0, u = 0; rows.forEach(r => { s += r.sp; u += r.u; });
      return { p: 'Total of ' + prdNum(rows.length) + ' product' + (rows.length === 1 ? '' : 's'), sp: `<span class="ps-fp"><b>${prdNum(s)}</b><span class="ps-pcs">${psPf(s, psTotal)}</span></span>`, u: prdNum(u), cu: u ? psMoney(s / u) : '' }; },
    after: (T, rows) => {
      const c = document.getElementById('psClear'); if (c) c.hidden = !T.active();
      const pages = T.pages(rows.length), from = rows.length ? T.page * T.shown + 1 : 0, to = Math.min(rows.length, (T.page + 1) * T.shown), pg = document.getElementById('psPgTxt');
      if (pg) pg.textContent = from + ' to ' + to + ' of ' + prdNum(rows.length) + ' products' + (psD && psD.n_products > (psD.rows || []).length ? ' (the biggest ' + prdNum(PS_LIMIT) + ' by spend)' : '');
      const pv = document.getElementById('psPrev'), nx = document.getElementById('psNext'), pn = document.getElementById('psPgN');
      if (pv) pv.disabled = T.page <= 0; if (nx) nx.disabled = T.page >= pages - 1; if (pn) pn.textContent = 'Page ' + (T.page + 1) + ' of ' + pages;
      const cu = rows.filter(r => r.u > 0).map(r => r.cu), w = document.getElementById('psW2');
      if (w) w.textContent = cu.length ? 'Cost a unit runs from AED ' + psMoney(Math.min.apply(null, cu)) + ' to AED ' + psMoney(Math.max.apply(null, cu)) + ' in this list. The dear ones are worth a look even when the spend is small.' : 'Nothing to read yet: widen the Period.';
    } });
}
function psToggleMore() { psT.toggleMore(); const b = document.getElementById('psMore'); if (b) b.classList.toggle('on', psT.more); psOffsets(); }
function psRowsPick(n) { psN = n; psSave(); psT.shown = n; psT.page = 0; psT.draw(); psOffsets(); }
function psPage(d) { psT.page += d; psT.draw(); psOffsets(); const s = document.getElementById('psBar'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'start' }); }

// ── WINDOWS (drill.js): what is behind a figure, level after level, to a single line ─────────
function psStockLines(r) { const w = psWin(); return psCall('product_stock_lines', { p_branches: w.branches, p_from: w.from, p_to: w.to, p_product: r.p, p_limit: 3000 }); }
function psSalesLines(r) { const w = psWin(); return psCall('product_sales_lines', { p_branches: w.branches, p_from: w.from, p_to: w.to, p_item: r.p, p_limit: 3000 }); }

// DELIVERIES: one row a month and salon; each figure opens that row's order lines
function psDeliveriesView(r, only) {
  return { id: 'deliveries', label: 'Deliveries', load: async () => {
    const d = await psStockLines(r), lines = (d.rows || []).filter(x => !only || x.branch === only), by = {};
    lines.forEach(x => { const k = (x.arrived_date || '').slice(0, 7) + '|' + x.branch, a = by[k] || (by[k] = { ym: (x.arrived_date || '').slice(0, 7), b: x.branch, units: 0, spend: 0, n: 0 }); a.units += Number(x.units) || 0; a.spend += Number(x.spend) || 0; a.n++; });
    const rows = Object.keys(by).map(k => by[k]).sort((a, b) => b.ym.localeCompare(a.ym) || PS_SALONS.indexOf(a.b) - PS_SALONS.indexOf(b.b));
    const u = rows.reduce((s, x) => s + x.units, 0), sp = rows.reduce((s, x) => s + x.spend, 0), n = rows.reduce((s, x) => s + x.n, 0);
    return { cols: [{ k: 'm', l: 'Month arrived' }, { k: 's', l: 'Salon' }, { k: 'u', l: 'Units', t: 'num' }, { k: 'a', l: 'Spend', t: 'aed' }, { k: 'l', l: 'Order lines', t: 'num' }],
      rows: rows.map(x => { const sp2 = psLinesSpec(r, x.ym, x.b); return { m: psMonthName(x.ym + '-01'), s: psSalon(x.b), u: x.units, a: x.spend, l: x.n, _dn: { u: sp2, a: sp2, l: sp2 } }; }),
      foot: { m: 'Total', s: '', u, a: sp, l: n },
      sub: prdNum(rows.length) + ' delivery lines (month and salon) · ' + prdNum(u) + ' units bought · AED ' + prdNum(sp) + ' · ' + psScope() + ', ' + psPeriod() + '. ' + psPf(sp, psTotal) + ' of the AED ' + prdNum(psTotal) + ' all ' + psTeamText() + 'stock cost.',
      note: 'Tap a figure to see its order lines. Costs are the Phorest Stock List cost, not the price paid on the day.' };
  } };
}
// THE LAST STEP of the stock side: one order line, nothing behind it
function psLinesSpec(r, ym, b) {
  return { title: r.p + ', ' + psSalon(b) + ', ' + psMonthName(ym + '-01'), sub: psScope() + ' · ' + psPeriod(), cur: 'AED', sk: psSlug(r.p + ' ' + b + ' ' + ym), views: [{ id: 'lines', label: 'Order lines', load: async () => {
    const d = await psStockLines(r), lines = (d.rows || []).filter(x => x.branch === b && (x.arrived_date || '').slice(0, 7) === ym);
    return { cols: [{ k: 'o', l: 'Order no' }, { k: 'od', l: 'Ordered', t: 'date' }, { k: 'ad', l: 'Arrived', t: 'date' }, { k: 'u', l: 'Units', t: 'num' }, { k: 'c', l: 'Cost a unit', t: 'aed' }, { k: 'a', l: 'Spend', t: 'aed' }],
      rows: lines.map(x => ({ o: x.order_no, od: x.order_date, ad: x.arrived_date, u: Number(x.units) || 0, c: Number(x.unit_cost) || 0, a: Number(x.spend) || 0 })),
      foot: { o: prdNum(lines.length) + ' line' + (lines.length === 1 ? '' : 's'), od: '', ad: '', u: lines.reduce((s, x) => s + (Number(x.units) || 0), 0), c: '', a: lines.reduce((s, x) => s + (Number(x.spend) || 0), 0) },
      note: 'This is the last step: a single order line has nothing behind it, so its figures stay plain.' };
  } }] };
}
// CLIENTS who bought it at the till (Level 3 and up), one row a client; her name, items and spend open her own till lines
function psClientsView(r, only) {
  return { id: 'clients', label: 'Clients who bought it', load: async () => {
    let d;
    try { d = await psSalesLines(r); } catch (e) {
      if (psMissing(e)) return { cols: [{ k: 'n', l: 'Clients' }], rows: [], note: 'This list needs a small database update that has not been applied yet.' };
      throw e;
    }
    const lines = (d.rows || []).filter(x => !only || x.branch === only), by = {}, order = [];
    lines.forEach((x, i) => {
      const nm = (x.client_name || '').trim(), real = nm && !/^\s*walk[\s-]*in/i.test(nm);
      const k = x.client_id ? 'i' + x.client_id : real ? 'n' + nm.toLowerCase() : 'x' + i;
      let a = by[k]; if (!a) { a = by[k] = { k, name: real ? nm : 'No client on the line', cid: x.client_id || null, real, n: 0, net: 0, last: '', bs: {}, lines: [] }; order.push(a); }
      a.n++; a.net += Number(x.net) || 0; if (!a.last || x.date > a.last) a.last = x.date; a.bs[x.branch] = 1; a.lines.push(x);
    });
    const rows = order.sort((a, b) => b.net - a.net), items = rows.reduce((s, x) => s + x.n, 0), net = rows.reduce((s, x) => s + x.net, 0), w = psWin();
    const units = (psR.find(x => x.p === r.p) || r).u;
    if (!rows.length) return { cols: [{ k: 'n', l: 'Clients' }], rows: [], note: 'No client bought it at the till in ' + psScope() + ', ' + psPeriod() + '. It is stock we use on clients rather than sell, and Phorest does not record which client a product was used on. The Deliveries tab shows what we bought.' };
    return { cols: [{ k: 'client', l: 'Client' }, { k: 'salon', l: 'Salon' }, { k: 'n', l: 'Items bought', t: 'num' }, { k: 'last', l: 'Last bought', t: 'date' }, { k: 'net', l: 'Spend', t: 'aed' }],
      rows: rows.map(x => { const sp = psSalesSpec(r, x);
        return { client: x.name, salon: Object.keys(x.bs).map(psSalon).join(', '), n: x.n, last: x.last, net: x.net,
          _dn: { client: x.real && typeof PD !== 'undefined' && PD.clientHistory ? PD.clientHistory({ cur: 'AED', label: 'Products' }, { client: x.name, cid: x.cid }) : null, n: sp, net: sp } }; }),
      foot: { client: prdNum(rows.length) + ' client' + (rows.length === 1 ? '' : 's'), salon: '', n: items, last: '', net },
      sub: prdNum(rows.length) + ' client' + (rows.length === 1 ? '' : 's') + ' bought it at the till · ' + prdNum(items) + ' item' + (items === 1 ? '' : 's') + ' · AED ' + prdNum(net) + ' ex VAT · ' + psScope() + ', ' + psPeriod() + '. We bought ' + prdNum(units) + ' units of it in the same Period.',
      note: (d.n > (d.rows || []).length ? 'The newest ' + prdNum((d.rows || []).length) + ' till lines are listed. ' : '') + 'One till line is one item. Stock bought and items sold are different things, so the two counts do not match.' };
  } };
}
// THE LAST STEP of the client side: her own till lines for this product
function psSalesSpec(r, g) {
  return { title: g.name + ', ' + r.p, sub: psScope() + ' · ' + psPeriod(), cur: 'AED', sk: psSlug(g.name + ' ' + r.p + ' till'), views: [{ id: 'till', label: 'Till lines', load: async () => {
    const lines = g.lines.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'i', l: 'Item' }, { k: 'n', l: 'Net', t: 'aed' }],
      rows: lines.map(x => ({ d: x.date, b: psSalon(x.branch), i: r.p, n: Number(x.net) || 0 })),
      foot: { d: prdNum(lines.length) + ' line' + (lines.length === 1 ? '' : 's'), b: '', i: '', n: lines.reduce((s, x) => s + (Number(x.net) || 0), 0) },
      note: 'This is the last step: a single till line has nothing behind it, so its figures stay plain. Net is ex VAT.' };
  } }] };
}
// A PRODUCT: who bought it and what we bought. first = the tab that opens first ('clients' for Units, 'deliveries' for the money)
function psProdSpec(r, first, only) {
  const views = { deliveries: psDeliveriesView(r, only), clients: psCan() ? psClientsView(r, only) : null };
  const order = first === 'clients' && psCan() ? ['clients', 'deliveries'] : ['deliveries', 'clients'];
  return { title: r.p, sub: prdNum(r.u) + ' units bought · AED ' + prdNum(r.sp) + ' · ' + (r.type === 'retail' ? 'Retail' : 'Professional') + ' · ' + r.brand + ' · ' + psScope() + ', ' + psPeriod(), cur: 'AED', sk: psSlug(r.p) + (only ? '-' + only.toLowerCase() : ''),
    views: order.map(k => views[k]).filter(Boolean) };
}
// A top N window: the products, each one opens its own window
function psTopSpec(n) {
  const k = Math.min(n, psR.length), rows = psR.slice(0, k), sp = rows.reduce((s, x) => s + x.sp, 0);
  return { title: 'Top ' + k + ' products by spend, ' + psScope(), sub: psPeriod(), cur: 'AED', sk: 'top-' + k + '-products', views: [{ id: 'top', label: 'Products', load: async () => ({
    cols: [{ k: 'n', l: '#', t: 'num' }, { k: 'p', l: 'Product' }, { k: 't', l: 'Type' }, { k: 'u', l: 'Units', t: 'num' }, { k: 'a', l: 'Spend', t: 'aed' }, { k: 'h', l: 'Share', t: 'pct' }],
    rows: rows.map(x => ({ n: x.rk, p: x.p, t: x.type === 'retail' ? 'Retail' : 'Professional', u: x.u, a: x.sp, h: x.share, _dn: { p: psProdSpec(x, 'deliveries'), u: psProdSpec(x, 'clients'), a: psProdSpec(x, 'deliveries'), h: psProdSpec(x, 'deliveries') } })),
    foot: { n: '', p: prdNum(k) + ' products', t: '', u: rows.reduce((s, x) => s + x.u, 0), a: sp, h: psTotal ? 100 * sp / psTotal : 0 },
    sub: k + ' products · AED ' + prdNum(sp) + ' = ' + psPf(sp, psTotal) + ' of the AED ' + prdNum(psTotal) + ' stock cost · ' + psScope() + ', ' + psPeriod() + '.', note: 'Tap a product or a figure to see who bought it and what we bought.' }) }] };
}

// ── HOW IT IS WORKED OUT, ABOUT THIS PAGE: centred, one short idea per card (component 36) ──
const PS_HOW = {
  share: ['Share of all stock spend', 'This product’s spend divided by all stock spend for your picks.', 'The total counts every product, so shares are true shares.'],
  spend: ['Spend', 'Units that arrived, times the cost of one unit.', 'Cost is today’s Stock List cost, not the price paid.'],
  cum: ['Running share', 'Add the shares from the biggest product down.', 'It follows spend order, even when the table is sorted another way.'],
  unit: ['Cost a unit', 'Spend divided by units: what one pack costs us on average.', 'A ratio has no rows behind it, so it stays plain.']
};
function psPaintHow() {
  const pick = document.getElementById('psPick'), card = document.getElementById('psHowCard'); if (!pick || !card) return;
  pick.innerHTML = Object.keys(PS_HOW).map(k => `<button type="button" class="${k === psHK ? 'on' : ''}" onclick="psHK='${k}';psPaintHow()">${PS_HOW[k][0]}</button>`).join('');
  const r = psR[0], h = PS_HOW[psHK]; if (!r) { card.innerHTML = ''; return; }
  const sp = psProdSpec(r, 'deliveries'); let big;
  if (psHK === 'share') big = psNum('AED ' + prdNum(r.sp), sp) + ' of AED ' + prdNum(psTotal) + ' = ' + psNum(psPf(r.sp, psTotal), sp);
  else if (psHK === 'spend') big = psNum(prdNum(r.u), psProdSpec(r, 'clients')) + ' units × AED ' + psMoney(r.cu) + ' = ' + psNum('AED ' + prdNum(r.sp), sp);
  else if (psHK === 'cum') { const k = Math.min(3, psR.length), s = psR.slice(0, k).reduce((a, x) => a + x.sp, 0); big = psR.slice(0, k).map(x => psPf(x.sp, psTotal)).join(' + ') + ' = ' + psNum(psPf(s, psTotal), psTopSpec(k)); }
  else big = 'AED ' + prdNum(r.sp) + ' ÷ ' + prdNum(r.u) + ' = AED ' + psMoney(r.cu);
  card.innerHTML = `<div class="ps-hc-t">${h[0]}</div><p class="ps-hc-m">${h[1]}</p><div class="ps-hc-big">${big}</div><div class="ps-hc-cv">${h[2]}</div>`;
}
const PS_ABOUT = {
  src: ['Where it comes from', 'Phorest stock orders, priced from the Stock List.', 'The daily reports refresh it each morning.'],
  cnt: ['What counts', 'Stock that has arrived, counted on the day it arrived.', 'Orders still on the way, and Bahrain, are not in. Before 2025 the cost is today’s, so AED is an estimate.'],
  typ: ['Retail or pro', 'Retail is stock we sell, professional is used on clients.', 'Igora Royal, colour and hair extensions count as professional.'],
  who: ['Client names', 'Clients who bought a product are for Level 3 and up.', 'Everyone else sees the same figures as plain text.']
};
function psPaintAbout() {
  const pick = document.getElementById('psApick'), card = document.getElementById('psAcard'); if (!pick || !card) return;
  pick.innerHTML = Object.keys(PS_ABOUT).map(k => `<button type="button" class="${k === psAK ? 'on' : ''}" onclick="psAK='${k}';psPaintAbout()">${PS_ABOUT[k][0]}</button>`).join('');
  const a = PS_ABOUT[psAK]; card.innerHTML = `<div class="ps-hc-t">${a[0]}</div><p class="ps-hc-m">${a[1]}</p><div class="ps-hc-cv">${a[2]}</div>`;
}

// ── STICKY OFFSETS: the toolbar follows the masthead and the chip row as they really are (component 37) ──
function psOffsets() {
  const jn = document.querySelector('#view-products .jn-rail'), root = document.documentElement.style;
  const top = jn ? parseFloat(getComputedStyle(jn).top) || 0 : 0;
  root.setProperty('--sx-top', (top + (jn ? jn.offsetHeight : 0)) + 'px');
  document.querySelectorAll('#productsContent .ps-sec').forEach(s => { const b = s.querySelector('.ps-bar'); s.style.setProperty('--bh', (b ? b.offsetHeight : 0) + 'px'); });
}
const psOnProducts = () => typeof CURRENT_VIEW === 'undefined' || CURRENT_VIEW === 'products';
function psWatch() {
  if (psRO) psRO.disconnect();
  if (psMO) psMO.disconnect();
  const mast = document.getElementById('topbar'), jn = document.querySelector('#view-products .jn-rail'), bar = document.getElementById('psBar');
  if (typeof ResizeObserver !== 'undefined') { psRO = new ResizeObserver(() => { if (psOnProducts()) psOffsets(); }); [mast, jn, bar].forEach(e => { if (e) psRO.observe(e); }); }
  if (typeof MutationObserver !== 'undefined' && jn) { psMO = new MutationObserver(() => { if (psOnProducts()) psOffsets(); }); psMO.observe(jn, { attributes: true, attributeFilter: ['style', 'class'] }); }
}
window.addEventListener('resize', () => { if (psOnProducts()) psOffsets(); });
window.addEventListener('scroll', () => { if (psRaf || !psOnProducts()) return; psRaf = requestAnimationFrame(() => { psRaf = 0; if (!psMO && document.querySelector('#view-products .jn-rail')) psWatch(); psOffsets(); }); }, { passive: true });

// ── DOWNLOADS: the whole list for the picks on the page, every column, the rows the heading filters leave ──
function psExport() {
  if (!psD || !psT) return null;
  const rows = psT.rows(); if (!rows.length) return null;
  const r2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100, w = psWin();
  const cols = [{ key: 'rank', label: 'Rank', fmt: 'num' }, { key: 'p', label: 'Product', fmt: 'text' }, { key: 'brand', label: 'Brand', fmt: 'text' }, { key: 'type', label: 'Type', fmt: 'text' }, { key: 'team', label: 'Team', fmt: 'text' },
    { key: 'sp', label: 'Spend (AED)', fmt: 'aed' }, { key: 'share', label: 'Share of all stock spend', fmt: 'pct' }, { key: 'u', label: 'Units', fmt: 'num' }, { key: 'cu', label: 'Cost a unit (AED)', fmt: 'aed' }, { key: 'cum', label: 'Running share', fmt: 'pct' }]
    .concat(PS_SALONS.map(c => ({ key: 's_' + c, label: psSalon(c) + ' (AED)', fmt: 'aed' }))).concat([{ key: 'nm', label: 'Months bought', fmt: 'num' }, { key: 'l', label: 'Order lines', fmt: 'num' }]);
  const lines = rows.map(r => ({ cells: [r.rk, r.p, r.brand, r.type === 'retail' ? 'Retail' : 'Professional', r.team, r2(r.sp), r2(r.share), r2(r.u), r2(r.cu), r2(r.cumShare)].concat(PS_SALONS.map(c => r2(Number(r.br[c]) || 0)), [r.nm, r.l]) }));
  return { name: ['top-products-by-spend', psScope(), w.from, 'to', w.to].map(psSlug).join('-'), csv: 0, sheets: [{ name: 'Top products', title: 'Top products by spend', subtitle: psScope() + ' · ' + w.from + ' to ' + w.to + ' · ' + (prdDept === 'all' ? 'all teams' : prdDept) + ' · ' + (psType === 'A' ? 'all types' : psType) + '. Costs are the Phorest Stock List cost.',
    blocks: [{ cols, rows: lines }], legend: [['Spend', 'Units that arrived times the Stock List cost, counted on the day the stock arrived.'], ['Share', 'Spend divided by all stock spend for the same Branch, Period, Team and Type.'], ['Running share', 'The shares added up from the biggest product down.']] }] };
}
