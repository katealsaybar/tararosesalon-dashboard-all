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
  const branches = (!sel.branch || sel.branch.includes('all')) ? ACTIVE_BRANCHES.slice() : sel.branch.slice();
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
  el.innerHTML = '<p class="slv-muted">Loading product spend…</p>';
  try {
    const { data, error } = await sb.rpc('get_product_spend', { p_branches: w.branches, p_from: w.from, p_to: w.to });
    if (error || !data) throw error || new Error('no data');
    prdData = { ...data, win: w };
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Product spend didn\'t load. Refresh to try again.</p>';
    return;
  }
  prdPaint(el);
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
  const perWeek = weeks.length ? all / weeks.length : null;

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

  const unmatched = d.unmatched.length ? `
      <details style="margin-top:14px"><summary class="slv-eyebrow" style="cursor:pointer">${prdNum(unLines)} arrived line${unLines === 1 ? '' : 's'} with no cost, not in the totals</summary>
        <p class="slv-muted">These products are on a stock order but not on today's Phorest Stock List (renamed, discontinued or typed differently), so there is no cost to price them with.</p>
        <div class="slv-wrap"><table class="slv-table"><thead><tr><th>Product</th><th>Branch</th><th>Units</th></tr></thead><tbody>
        ${d.unmatched.slice(0, 40).map(r => `<tr><td>${prdEsc(r.product)}</td><td>${prdEsc(PRD_BRANCH[r.branch] || r.branch)}</td><td>${prdNum(r.units)}</td></tr>`).join('')}
        </tbody></table></div></details>` : '';

  el.innerHTML = `
    <section class="slv-intro">
      <h2>Products</h2>
      <p>What we spend on stock, week by week, split into retail (to sell) and professional (used on clients). Counted the day the order arrived.</p>
    </section>
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">${prdEsc(shown.length === ACTIVE_BRANCHES.length ? 'All branches' : shown.map(b => PRD_BRANCH[b]).join(' · '))}</div><h3>Stock spend</h3></div>
        <p>${prdEsc(prdDayY(w.from))} to ${prdEsc(prdDayY(w.to))}${w.ranged ? '' : ' · last 13 weeks'}</p>
      </div>
      ${weeks.length ? `
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Total spend</div><div class="w13-val">${prdAed(all)}</div><div class="slv-note">${perWeek !== null ? prdAed(perWeek) + ' a week' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Retail</div><div class="w13-val">${prdAed(tot.retail)}</div><div class="slv-note">${all ? Math.round(100 * tot.retail / all) + '% of spend' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Professional</div><div class="w13-val">${prdAed(tot.professional)}</div><div class="slv-note">${all ? Math.round(100 * tot.professional / all) + '% of spend' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">On order now</div><div class="w13-val">${prdAed(d.on_order.spend)}</div><div class="slv-note">${prdNum(d.on_order.lines)} lines not arrived yet</div></div>
      </div>
      <div class="slv-eyebrow" style="margin:18px 0 6px">Week by week · retail and professional</div>
      <div style="position:relative;height:280px"><canvas id="prdCanvas"></canvas></div>
      <div class="slv-wrap" style="margin-top:14px"><table class="slv-table">
        <thead><tr><th>Week of</th><th>Retail</th><th>Professional</th><th>Total (AED)</th>${head}</tr></thead>
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
      <div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>#</th><th>Product</th><th>Type</th><th>Units</th><th>Spend (AED)</th></tr></thead>
        <tbody>${products}</tbody></table></div>
    </section>` : ''}
    <p class="slv-muted">Costs are Phorest's Stock List cost${d.priced_on ? ' as of ' + prdEsc(prdDayY(d.priced_on)) : ''}, not the price on the day each order went in. Igora Royal, Colour stock and hair extensions count as professional even where Phorest types them otherwise.</p>`;
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
