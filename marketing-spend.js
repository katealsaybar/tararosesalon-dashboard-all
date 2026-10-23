// Marketing Spend (Kate, 23 Oct 2026). What paid media costs each month, Google and Meta side by side, against the
// new clients the salons got, so the page can say what a new client costs (paid media only) and what one is worth in
// their first year. One call to marketing_spend_report (migrations/marketing_spend.sql). Level 3 and above: pages.js
// holds the level and the function refuses below it too.
//
// Where the numbers come from is on the page itself (the notes under the table), because the sources differ by month:
// Google from its monthly statement where there is one, else the API; Meta from the Paid invoices in Drive up to
// 31 Jul 2026 and Metricool after (meta-ads-sync, nightly). It is paid media only: the agency, content, influencers
// and staff time are not in it, so this is not a full CAC.
//
// Borrows the Products page's card, tile and table styles (slv-*, w13-*), like google-ads.js.
let mspendData = null, mspendChart = null;
let mspendRange = 12;   // months shown; 0 = everything since Jan 2025
try { const v = localStorage.getItem('trs-mspend-range'); if (v !== null && [6, 12, 0].includes(Number(v))) mspendRange = Number(v); } catch (e) {}

const MSPEND_META_FULL_FROM = '2025-10-01';   // the first month with Meta spend all the way through (Drive starts 25 Sep 2025)
const mspendEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mspendNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const mspendAed = v => 'AED ' + mspendNum(v);
const mspendMonth = mo => new Date(mo + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

function mspendSetRange(n) {
  mspendRange = n;
  try { localStorage.setItem('trs-mspend-range', String(n)); } catch (e) {}
  if (mspendData) mspendPaint(document.getElementById('marketingSpendContent')); else renderMarketingSpend();
}

async function renderMarketingSpend() {
  const el = document.getElementById('marketingSpendContent');
  if (!el) return;
  el.innerHTML = '<p class="slv-muted">Loading Marketing Spend…</p>';
  try {
    const { data, error } = await sb.rpc('marketing_spend_report');
    if (error || !data) throw error || new Error('no data');
    mspendData = data;
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Marketing Spend didn’t load. Refresh to try again.</p>';
    return;
  }
  mspendPaint(el);
}

// The months in view, each with its totals and whether it has a cost per new client.
function mspendRows() {
  const all = (mspendData.months || []).map(m => {
    const google = Number(m.google) || 0, meta = Number(m.meta) || 0, nc = Number(m.new_clients) || 0;
    const metaFull = m.mo >= MSPEND_META_FULL_FROM;
    const total = google + meta;
    const now = new Date(), cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return { ...m, google, meta, nc, total, metaFull, partial: m.mo === cur,
      cac: metaFull && nc ? total / nc : null,
      metaSrc: m.meta_invoice_days && m.meta_metricool_days ? 'invoices, then Metricool' : m.meta_invoice_days ? 'invoices' : m.meta_metricool_days ? 'Metricool' : '',
      googleSrc: m.google_is_statement ? 'statement' : (google ? 'Google API' : '') };
  });
  // Months before any ad spend was recorded add nothing to look at.
  const from = all.findIndex(r => r.total > 0);
  const live = from < 0 ? [] : all.slice(from);
  return mspendRange ? live.slice(-mspendRange) : live;
}

function mspendPaint(el) {
  const d = mspendData, rows = mspendRows(), ltv = d.ltv || {};
  const priced = rows.filter(r => r.cac !== null);
  const spend = rows.reduce((a, r) => a + r.total, 0);
  const pSpend = priced.reduce((a, r) => a + r.total, 0), pNew = priced.reduce((a, r) => a + r.nc, 0);
  const cac = pNew ? pSpend / pNew : null;
  const year1 = Number(ltv.avg_net_12m) || null, ceiling = year1 ? year1 / 3 : null;

  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  const body = rows.slice().reverse().map(r => `<tr>
      <td>${mspendEsc(mspendMonth(r.mo))}${r.partial ? '<div class="slv-note">so far</div>' : ''}</td>
      <td>${r.google ? mspendNum(r.google) : '–'}<div class="slv-note">${mspendEsc(r.googleSrc)}</div></td>
      <td>${r.meta ? mspendNum(r.meta) : '–'}<div class="slv-note">${mspendEsc(r.metaSrc)}</div></td>
      <td><b>${mspendNum(r.total)}</b></td>
      <td>${mspendNum(r.nc)}</td>
      <td>${r.cac !== null ? mspendAed(r.cac) : '–'}${!r.metaFull ? '<div class="slv-note">Meta not in Drive</div>' : ''}</td></tr>`).join('');

  el.innerHTML = `
    <div class="filters mk-period"><div class="f-row">
      <span class="f-lbl" id="mspendPerLbl">Months</span>
      <div class="chipset" role="group" aria-labelledby="mspendPerLbl">${[[6, 'Last 6'], [12, 'Last 12'], [0, 'All']].map(([k, l]) =>
        `<button type="button" class="chip" aria-pressed="${mspendRange === k}" onclick="mspendSetRange(${k})">${l}</button>`).join('<span class="sep">·</span>')}</div>
    </div></div>
    <section class="slv-intro">
      <h2>Marketing Spend</h2>
      <p>What Google and Meta ads cost each month, and what that comes to for every new client the salons got. Paid media only: the agency, content, influencers and staff time are not in these numbers.</p>
    </section>
    ${stale ? `<p class="slv-muted" style="color:#b42318">Meta spend from Metricool is paused${s && s.last_error ? ': ' + mspendEsc(s.last_error) : ''}. Last good update: ${synced ? mspendEsc(synced) : 'never'}.</p>` : ''}
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">Google Ads and Meta Ads</div><h3>Spend and cost per new client</h3></div>
        <p>${rows.length ? mspendEsc(mspendMonth(rows[0].mo)) + ' to ' + mspendEsc(mspendMonth(rows[rows.length - 1].mo)) : ''}</p>
      </div>
      ${rows.length ? `
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Paid media spend</div><div class="w13-val">${mspendAed(spend)}</div><div class="slv-note">Google and Meta together</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Cost per new client</div><div class="w13-val">${cac !== null ? mspendAed(cac) : '–'}</div><div class="slv-note">${priced.length ? 'Paid media spend over every new client, whatever brought them, ' + priced.length + ' month' + (priced.length === 1 ? '' : 's') + ' with both ads' : 'Needs a month with both ads'}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">A new client in year one</div><div class="w13-val">${year1 ? mspendAed(year1) : '–'}</div><div class="slv-note">${year1 ? `Average sales over 12 months, ${mspendNum(ltv.clients)} clients first seen ${mspendEsc(ltv.cohort || '')}. Half spent less than ${mspendAed(ltv.median_net_12m)}.` : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Most a new client can cost</div><div class="w13-val">${ceiling ? mspendAed(ceiling) : '–'}</div><div class="slv-note">One third of year one. That is sales, not profit, so the real ceiling is lower.</div></div>
      </div>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Spend by month, with the cost per new client</div>
        <span class="w13-skey" aria-label="Chart key">
          <span><i class="bar" style="background:#A78BFA"></i>Google</span>
          <span><i class="bar" style="background:#E07A5F"></i>Meta</span>
          <span><i class="line" style="--c:#0F6E56"></i>Cost per new client</span>
        </span>
      </div>
      <div style="position:relative;height:300px"><canvas id="mspendCanvas"></canvas></div>
      <div class="slv-wrap" style="margin-top:14px"><table class="slv-table">
        <thead><tr><th>Month</th><th>Google (AED)</th><th>Meta (AED)</th><th>Total (AED)</th><th>New clients</th><th>Per new client</th></tr></thead>
        <tbody>${body}</tbody></table></div>` : '<p class="slv-muted">No ad spend recorded yet.</p>'}
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">Read this before quoting a number</div><h3>Where it comes from</h3></div></div>
      <ul class="slv-notes" style="margin:0;padding-left:18px;line-height:1.55">
        <li><b>Google.</b> The month’s Google statement (what the card was charged, after Google’s credits for invalid clicks) for Nov 2025 to Jul 2026, and Google’s own daily numbers for the other months. No Google spend is recorded for Apr, May and Aug to Oct 2025, so those months show Meta only or nothing.</li>
        <li><b>Meta.</b> The Paid invoices in Drive up to 31 Jul 2026, each spread over the days it covers, and Metricool’s daily spend from 1 Aug 2026 (it matched the invoices within about 1 percent for May to Jul). Failed and pending payments are not counted: a paid retry carries the same spend. Meta spend before 25 Sep 2025 is not in Drive, so earlier months show Google only and no cost per client.</li>
        <li><b>New clients.</b> A client’s first sale at any salon, by name. A name spelt differently counts again, so the count runs a little high and the cost per client a little low. The till history starts in May 2021.</li>
        <li><b>Not here.</b> The agency (Leaders in Digital), content, influencer fees, commissions, staff time, and a second Meta account that sent one small top-up receipt in Aug 2026. Add those before calling this the cost of winning a client.</li>
        <li><b>Year one.</b> Net sales from a client in the 12 months after their first visit, for clients who first came Jan to Sep 2025. Voucher and deposit lines are left out. It is sales, not profit.</li>
      </ul>
      <p class="slv-muted">${synced ? 'Meta updated ' + mspendEsc(synced) + '. ' : ''}${d.meta_invoice_last_day ? 'Invoices run to ' + mspendEsc(new Date(d.meta_invoice_last_day + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })) + '.' : ''}</p>
    </section>`;
  if (rows.length) mspendDraw(rows);
}

function mspendDraw(rows) {
  if (mspendChart) { mspendChart.destroy(); mspendChart = null; }
  const cv = document.getElementById('mspendCanvas');
  if (!cv || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted').trim(), border = css.getPropertyValue('--border').trim();
  const lineCol = '#0F6E56';
  mspendChart = new Chart(cv, {
    data: {
      labels: rows.map(r => new Date(r.mo + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })),
      datasets: [
        { type: 'bar', order: 2, label: 'Google', data: rows.map(r => Math.round(r.google)), yAxisID: 'y', stack: 's', backgroundColor: '#A78BFA', maxBarThickness: 48 },
        { type: 'bar', order: 2, label: 'Meta', data: rows.map(r => Math.round(r.meta)), yAxisID: 'y', stack: 's', backgroundColor: '#E07A5F', maxBarThickness: 48, borderRadius: 4 },
        { type: 'line', order: 1, label: 'Cost per new client', data: rows.map(r => r.cac === null ? null : Math.round(r.cac * 10) / 10), yAxisID: 'y1',
          borderColor: lineCol, backgroundColor: lineCol, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: lineCol, pointBorderWidth: 2,
          tension: 0.3, spanGaps: false },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.dataset.label === 'Cost per new client' ? `Cost per new client: AED ${Number(c.raw).toLocaleString('en-GB')}` : `${c.dataset.label}: AED ${Number(c.raw).toLocaleString('en-GB')}` } },
      },
      scales: {
        x: { stacked: true, ticks: { color: muted, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
        y1: { position: 'right', beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { display: false } },
      },
    },
  });
}

function mspendRedrawForTheme() {
  const v = document.getElementById('view-marketingspend');
  if (v && v.style.display !== 'none' && mspendData) mspendPaint(document.getElementById('marketingSpendContent'));
}
