// Products (Kate, 29 Sep 2026): what we spend on stock each week, per branch,
// retail against professional. One call to get_product_spend
// (migrations/create_get_product_spend.sql) over stock_order_lines, which
// "phorest data export/stock orders" fills from Phorest's Stock Orders report
// priced against its Stock List. Spend is dated by the day stock arrived.
// Reads the masthead's Branch and Period like Top Clients; with no range set
// it shows the last 13 full weeks. Borrows the 13-Week Report's card, tiles
// and table styles (slv-*, w13-*) rather than adding new ones.
let prdData = null;
let prdChart = null;
// Kate, 30 Sep 2026: All / Hair / Beauty, same pill as the 13-Week Report's
// Team toggle. stock_order_lines.dept is read off the brand
// (migrations/add_stock_order_lines_dept.sql). Remembered per browser.
let prdDept = 'all';
try { prdDept = localStorage.getItem('trs-prd-dept') || 'all'; } catch (e) {}

const PRD_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };
const PRD_RETAIL = '#C4B5FD', PRD_PROF = '#0F6E56';
const prdEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const prdNum = v => (v === null || v === undefined) ? '–' : Math.round(Number(v)).toLocaleString('en-GB');
const prdAed = v => (v === null || v === undefined) ? '–' : 'AED ' + prdNum(v);
const prdDay = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const prdDayY = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
// Local-time ISO date; toISOString() would slip a day in UAE time.
const prdIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function prdWindow() {
  // UAE only on "all", Group included: stock orders are costed in each country's own
  // currency and this page prints AED. Bahrain reads through its own chip.
  const branches = (!sel.branch || sel.branch.includes('all')) ? UAE_ACTIVE.slice() : sel.branch.filter(b => b !== 'FRT');   // Fratelli's stock orders were never loaded
  if (dateFrom && dateTo) return { branches, from: prdIso(dateFrom), to: prdIso(dateTo), ranged: true };
  // No range: the last 13 full weeks, Monday to Sunday, plus the week so far.
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 13 * 7);
  return { branches, from: prdIso(mon), to: prdIso(t), ranged: false };
}

async function renderProducts() {
  const el = document.getElementById('productsContent');
  if (!el) return;
  const w = prdWindow();
  if (!w.branches.length) { el.innerHTML = '<p class="slv-muted">Fratelli\'s stock orders were never loaded, so Products has nothing for it.</p>'; return; }
  el.innerHTML = '<p class="slv-muted">Loading product spend…</p>';
  try {
    const [{ data, error }, sold] = await Promise.all([
      sb.rpc('get_product_spend', { p_branches: w.branches, p_from: w.from, p_to: w.to, p_dept: prdDept }),
      prdRetailSold(w).catch(e => { console.warn('Products: retail sold did not load', e); return null; }),
    ]);
    if (error || !data) throw error || new Error('no data');
    prdData = { ...data, win: w, sold };
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Product spend didn\'t load. Refresh to try again.</p>';
    return;
  }
  prdPaint(el);
}

// Retail sold over the same window and branches, so the stock bought has something
// to be read against (Kate, 1 Oct 2026; Comet PD1). Phorest's daily TOTAL line per
// branch (phorest_staff_daily, is_total), products ex VAT: the same figure the other
// pages' retail comes from. Paged, because a long custom range passes PostgREST's
// 1000-row cap. Returns { aed, days } or null.
async function prdRetailSold(w) {
  let aed = 0, days = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('phorest_staff_daily')
      .select('products_ex_vat').eq('is_total', true).in('branch', w.branches)
      .gte('date', w.from).lte('date', w.to).range(from, from + 999);
    if (error) throw error;
    (data || []).forEach(r => { aed += Number(r.products_ex_vat) || 0; days++; });
    if (!data || data.length < 1000) break;
  }
  return days ? { aed, days } : null;
}
// "For every AED 100 of retail sold, AED X of retail stock came in." Shown on All only:
// Phorest does not split retail sold by team, and beauty stock against all retail
// sold would read as a figure it is not.
function prdSoldStrip(d, retailBought) {
  if (!d.sold) return '';
  if (prdDept !== 'all') return `<div class="w13-tile prd-sold"><div class="slv-note">Retail sold is not split by team in Phorest, so stock bought against retail sold shows on All.</div></div>`;
  const per100 = d.sold.aed ? Math.round(100 * retailBought / d.sold.aed) : null;
  return `<div class="w13-tile prd-sold">
    <div class="slv-eyebrow">Retail stock bought against retail sold</div>
    <div class="prd-sold-row">
      <span><b class="w13-val">${prdAed(d.sold.aed)}</b><span class="slv-note">retail sold, ex VAT (Phorest)</span></span>
      <span><b class="w13-val">${prdAed(retailBought)}</b><span class="slv-note">retail stock bought, at cost</span></span>
      ${per100 !== null ? `<span><b class="w13-val">AED ${per100}</b><span class="slv-note">of stock in for every AED 100 sold</span></span>` : ''}
    </div>
  </div>`;
}

function prdSetDept(k) {
  prdDept = k;
  try { localStorage.setItem('trs-prd-dept', k); } catch (e) {}
  renderProducts();
}

function prdPaint(el) {
  const d = prdData, w = d.win;
  // Weeks across the selected branches, oldest first.
  const byWeek = {};
  d.weeks.forEach(r => {
    const k = r.week_start;
    byWeek[k] = byWeek[k] || { retail: 0, professional: 0, branches: {} };
    byWeek[k].retail += Number(r.retail); byWeek[k].professional += Number(r.professional);
    byWeek[k].branches[r.branch] = (Number(r.retail) + Number(r.professional));
  });
  const weeks = Object.keys(byWeek).sort();
  const tot = weeks.reduce((a, k) => ({ retail: a.retail + byWeek[k].retail, professional: a.professional + byWeek[k].professional }), { retail: 0, professional: 0 });
  const all = tot.retail + tot.professional;
  const shown = w.branches.filter(b => PRD_BRANCH[b]);
  const unLines = d.unmatched.reduce((a, r) => a + Number(r.lines), 0);
  // Averaged over the whole window, not just the weeks stock arrived: Beauty has
  // deliveries in a few weeks only, and dividing by those overstated it 4x.
  const winWeeks = (new Date(w.to + 'T00:00:00') - new Date(w.from + 'T00:00:00')) / (7 * 864e5) + 1 / 7;
  const perWeek = weeks.length ? all / winWeeks : null;

  const head = shown.length > 1
    ? shown.map(b => `<th>${prdEsc(PRD_BRANCH[b])}</th>`).join('') : '';
  // The week today falls in is still open; say so, or it reads as a slump.
  const openWeek = k => new Date(k + 'T00:00:00').getTime() + 7 * 864e5 > Date.now();
  const rows = weeks.slice().reverse().map(k => {
    const x = byWeek[k];
    return `<tr><td>${prdEsc(prdDay(k))}${openWeek(k) ? ' <span class="slv-note" style="display:inline">so far</span>' : ''}</td><td>${prdNum(x.retail)}</td><td>${prdNum(x.professional)}</td>
      <td><b>${prdNum(x.retail + x.professional)}</b></td>
      ${shown.length > 1 ? shown.map(b => `<td>${prdNum(x.branches[b] || 0)}</td>`).join('') : ''}</tr>`;
  }).join('');
  const branchTot = b => d.weeks.filter(r => r.branch === b).reduce((a, r) => a + Number(r.retail) + Number(r.professional), 0);

  const products = d.products.map((p, i) => `<tr><td>${i + 1}</td><td>${prdEsc(p.product)}<div class="slv-note">${prdEsc(p.brand || '')}</div></td>
    <td>${p.type === 'retail' ? 'Retail' : 'Professional'}</td><td>${prdNum(p.units)}</td><td>${prdNum(p.spend)}</td></tr>`).join('');
  // Kate, 30 Sep 2026: five columns crushed on a phone, so under 760px the same
  // list is one card per product (name first, spend on the right, a bar against
  // the top product in its type's colour) and the table is hidden.
  const topSpend = d.products.length ? Math.max(...d.products.map(p => Number(p.spend) || 0)) : 0;
  const productCards = d.products.map((p, i) => `<li class="prd-card">
      <span class="prd-rank">${i + 1}</span>
      <div class="prd-body">
        <div class="prd-top"><span class="prd-name">${prdEsc(p.product)}</span><span class="prd-spend">AED ${prdNum(p.spend)}</span></div>
        <div class="prd-meta">${p.type === 'retail' ? 'Retail' : 'Professional'} · ${prdNum(p.units)} unit${Number(p.units) === 1 ? '' : 's'}${p.brand ? ' · ' + prdEsc(p.brand) : ''}</div>
        <div class="prd-bar"><i style="width:${topSpend ? Math.max(2, Math.round(100 * (Number(p.spend) || 0) / topSpend)) : 0}%;background:${p.type === 'retail' ? PRD_RETAIL : PRD_PROF}"></i></div>
      </div></li>`).join('');

  const unmatched = d.unmatched.length ? `
      <details style="margin-top:14px"><summary class="slv-eyebrow" style="cursor:pointer">${prdNum(unLines)} arrived line${unLines === 1 ? '' : 's'} with no cost, not in the totals</summary>
        <p class="slv-muted">These products are on a stock order but not on today's Phorest Stock List (renamed, discontinued or typed differently), so there is no cost to price them with.</p>
        <div class="slv-wrap"><table class="slv-table"><thead><tr><th>Product</th><th>Branch</th><th>Units</th></tr></thead><tbody>
        ${d.unmatched.slice(0, 40).map(r => `<tr><td>${prdEsc(r.product)}</td><td>${prdEsc(PRD_BRANCH[r.branch] || r.branch)}</td><td>${prdNum(r.units)}</td></tr>`).join('')}
        </tbody></table></div></details>` : '';

  // Kate, 9 Oct 2026: orders from 2021 to 2024 are in, priced at today's Stock List cost
  // (Phorest keeps no cost history), so any window reaching before 2025 gets this notice.
  const olderYears = w.from < '2025-01-01' ? `
    <div style="margin:0 0 14px;padding:12px 14px;border:1px solid var(--border);border-left:3px solid var(--warn);border-radius:10px;background:var(--warn-bg)">
      <div class="slv-eyebrow" style="color:var(--warn)">Older years are an estimate</div>
      <p class="slv-muted" style="margin:4px 0 0">Orders before January 2025 are priced at today's Phorest Stock List cost, not what was paid at the time, and anything no longer on the Stock List has no cost and is left out of the totals. Spend here can read differently from the real invoices, and low where products were dropped. Units and arrival dates are real, so use units to compare years and the AED as a guide.</p>
    </div>` : '';

  el.innerHTML = `
    <section class="slv-intro">
      <h2>Products</h2>
      <p>What we spend on stock, week by week, split into retail (to sell) and professional (used on clients). Counted the day the order arrived.</p>
    </section>
    ${olderYears}
    <div class="sc-bar w13-bar">
      <div class="sc-seg" role="group" aria-label="Team">
        ${[['all', 'All'], ['Hair', 'Hair'], ['Beauty', 'Beauty']].map(([k, l]) =>
          `<button type="button" class="${prdDept === k ? 'on' : ''}" onclick="prdSetDept('${k}')">${l}</button>`).join('')}
      </div>
    </div>
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">${prdEsc(shown.length === ACTIVE_BRANCHES.length ? 'All branches' : shown.map(b => PRD_BRANCH[b]).join(' · '))}</div><h3>${prdDept === 'all' ? 'Stock spend' : prdEsc(prdDept) + ' stock spend'}</h3></div>
        <p>${prdEsc(prdDayY(w.from))} to ${prdEsc(prdDayY(w.to))}${w.ranged ? '' : ', the last 13 weeks'}</p>
      </div>
      ${weeks.length ? `
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Total spend</div><div class="w13-val">${prdAed(all)}</div><div class="slv-note">${perWeek !== null ? prdAed(perWeek) + ' a week' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Retail</div><div class="w13-val">${prdAed(tot.retail)}</div><div class="slv-note">${all ? Math.round(100 * tot.retail / all) + '% of spend' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Professional</div><div class="w13-val">${prdAed(tot.professional)}</div><div class="slv-note">${all ? Math.round(100 * tot.professional / all) + '% of spend' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">On order now</div><div class="w13-val">${prdAed(d.on_order.spend)}</div><div class="slv-note">${prdNum(d.on_order.lines)} line${Number(d.on_order.lines) === 1 ? '' : 's'} not arrived yet</div></div>
        ${prdSoldStrip(d, tot.retail)}
      </div>
      <div class="slv-eyebrow" style="margin:18px 0 6px">Week by week, retail and professional</div>
      <div style="position:relative;height:280px"><canvas id="prdCanvas"></canvas></div>
      <div class="slv-wrap" style="margin-top:14px"><table class="slv-table prd-wk">
        <thead><tr><th>Week of</th><th>Retail</th><th>Pro<span class="prd-lg">fessional</span></th><th>Total<span class="prd-lg"> (AED)</span></th>${head}</tr></thead>
        <tbody>${rows}
          <tr class="w13-tot"><td>${weeks.length} week${weeks.length === 1 ? '' : 's'}</td><td>${prdNum(tot.retail)}</td><td>${prdNum(tot.professional)}</td><td>${prdNum(all)}</td>
          ${shown.length > 1 ? shown.map(b => `<td>${prdNum(branchTot(b))}</td>`).join('') : ''}</tr>
        </tbody>
      </table></div>` : '<p class="slv-muted">No stock arrived in these dates.</p>'}
      ${unmatched}
    </section>
    ${d.products.length ? `
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">Where the money went</div><h3>Top products by spend</h3></div></div>
      <div class="slv-wrap prd-desk"><table class="slv-table">
        <thead><tr><th>#</th><th>Product</th><th>Type</th><th>Units</th><th>Spend (AED)</th></tr></thead>
        <tbody>${products}</tbody></table></div>
      <ol class="prd-cards">${productCards}</ol>
    </section>` : ''}
    <p class="slv-muted">Costs are Phorest's Stock List cost${d.priced_on ? ' as of ' + prdEsc(prdDayY(d.priced_on)) : ''}, not the price on the day each order went in. Igora Royal, Colour stock and hair extensions count as professional even where Phorest types them otherwise. Beauty is skin, lashes, nails and lip (Matis, Image, PCA, Xitronix, Nouveau, IOlite, OPI, Kinetics, Alessandro, LUK); every other brand is Hair.</p>`;
  prdDraw(weeks, byWeek);
}

function prdDraw(weeks, byWeek) {
  const cv = document.getElementById('prdCanvas');
  if (!cv || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted'), border = css.getPropertyValue('--border');
  if (prdChart) prdChart.destroy();
  prdChart = new Chart(cv, {
    type: 'bar',
    data: {
      labels: weeks.map(k => prdDay(k) + (new Date(k + 'T00:00:00').getTime() + 7 * 864e5 > Date.now() ? ' (so far)' : '')),
      datasets: [
        { label: 'Retail', data: weeks.map(k => Math.round(byWeek[k].retail)), backgroundColor: PRD_RETAIL, borderRadius: 4, maxBarThickness: 48, stack: 's' },
        { label: 'Professional', data: weeks.map(k => Math.round(byWeek[k].professional)), backgroundColor: PRD_PROF, borderRadius: 4, maxBarThickness: 48, stack: 's' },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: muted, usePointStyle: true, pointStyle: 'circle', boxHeight: 8 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: AED ${prdNum(c.raw)}` } },
      },
      scales: {
        y: { stacked: true, beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
        x: { stacked: true, ticks: { color: muted, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
      },
    },
  });
}

function prdRedrawForTheme() {
  const v = document.getElementById('view-products');
  if (v && v.style.display !== 'none' && prdData) prdPaint(document.getElementById('productsContent'));
}
