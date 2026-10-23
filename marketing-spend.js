// Marketing Spend (Kate, 23 Oct 2026). What Google ads, Meta ads, the agency (Leaders in Digital) and the WhatsApp and CRM tools cost each
// month, beside the new clients the salons got: the CAC (what winning a new client costs) and the LTV (what a new client is worth in their
// first year). One call to marketing_spend_report (migrations/marketing_spend*.sql). Level 3 and above: pages.js holds the level and the
// function refuses below it too.
//
// The months shown follow the masthead's Period (Kate, 23 Oct 2026: "use the global sticky header filter"): a month is in view when any
// day of it falls inside the Period, and All time shows every month. The Branch row is hidden here (ads are not bought per salon).
// A month's CAC needs Meta running through it (the Drive invoices start 25 Sep 2025), the agency's invoice in and the clients counted;
// otherwise it shows a dash. Content, influencers, commissions and staff time are not in it.
//
// Borrows the Products page's card, tile and table styles (slv-*, w13-*), like google-ads.js.
let mspendData = null, mspendChart = null;

const MSPEND_META_FULL_FROM = '2025-10-01';   // the first month with Meta spend all the way through (Drive starts 25 Sep 2025)
const mspendEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mspendNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const mspendAed = v => 'AED ' + mspendNum(v);
const mspendMonth = mo => new Date(mo + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const mspendIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// '2025-01 to 2025-09' as 'Jan to Sep 2025'.
const mspendCohort = c => {
  const m = /^(\d{4})-(\d\d) to (\d{4})-(\d\d)$/.exec(c || '');
  if (!m) return c || '';
  const mon = (y, n) => new Date(Number(y), Number(n) - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
  return m[1] === m[3] ? `${mon(m[1], m[2])} to ${mon(m[3], m[4])} ${m[1]}` : `${mon(m[1], m[2])} ${m[1]} to ${mon(m[3], m[4])} ${m[3]}`;
};
const mspendLastDay = mo => { const d = new Date(mo + 'T00:00:00'); return mspendIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

// The masthead Period as { from, to } (ISO days), or null for All time (or before the window is known).
function mspendWindow() {
  try {
    if (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') return null;
    if (typeof dateFrom !== 'undefined' && dateFrom && dateTo) return { from: mspendIso(dateFrom), to: mspendIso(dateTo) };
  } catch (e) {}
  return null;
}

// A Branch or Period change redraws from the data already loaded (dashboard.js NOPULSE_REDRAW).
function mspendRefresh() {
  const el = document.getElementById('marketingSpendContent');
  if (mspendData && el) { mspendPaint(el); return Promise.resolve(); }
  return renderMarketingSpend();
}

async function renderMarketingSpend() {
  const el = document.getElementById('marketingSpendContent');
  if (!el) return;
  el.innerHTML = '<p class="slv-muted">Loading Marketing Spend…</p>';
  // The Period is only known once the dashboard has worked out its window (a direct link can open this page first).
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
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

// The months in view, each with its totals and whether it has a CAC.
function mspendRows() {
  const now = new Date(), cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const all = (mspendData.months || []).map(m => {
    const google = Number(m.google) || 0, meta = Number(m.meta) || 0, nc = Number(m.new_clients) || 0;
    const agency = m.agency === null || m.agency === undefined ? null : Number(m.agency);
    const metaFull = m.mo >= MSPEND_META_FULL_FROM;
    const other = m.other === null || m.other === undefined ? 0 : Number(m.other);
    const total = google + meta + (agency || 0) + other;
    // A CAC needs Meta running through the month, the agency's invoice in, and the clients counted.
    return { ...m, google, meta, agency, other, nc, total, metaFull, partial: m.mo === cur,
      cac: metaFull && agency !== null && nc ? total / nc : null };
  });
  // Months before any ad spend was recorded add nothing to look at.
  const from = all.findIndex(r => r.total > 0);
  const live = from < 0 ? [] : all.slice(from);
  const w = mspendWindow();
  return w ? live.filter(r => r.mo <= w.to && mspendLastDay(r.mo) >= w.from) : live;
}

function mspendPaint(el) {
  const d = mspendData, rows = mspendRows(), ltv = d.ltv || {};
  const priced = rows.filter(r => r.cac !== null);
  const spend = rows.reduce((a, r) => a + r.total, 0);
  const pSpend = priced.reduce((a, r) => a + r.total, 0), pNew = priced.reduce((a, r) => a + r.nc, 0);
  const cac = pNew ? pSpend / pNew : null;
  const year1 = Number(ltv.avg_net_12m) || null;
  const ratio = year1 && cac ? year1 / cac : null;
  const ceiling = year1 ? year1 / 3 : null;
  const nMonths = n => n + ' month' + (n === 1 ? '' : 's');

  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  const hasOther = rows.some(r => r.other > 0);
  const body = rows.slice().reverse().map(r => `<tr>
      <td>${mspendEsc(mspendMonth(r.mo))}${r.partial ? '<div class="slv-note">so far</div>' : ''}</td>
      <td>${r.google ? mspendNum(r.google) : '–'}</td>
      <td>${r.meta ? mspendNum(r.meta) : '–'}</td>
      <td>${r.agency !== null ? mspendNum(r.agency) : '–'}${r.agency === null && r.metaFull ? '<div class="slv-note">not invoiced yet</div>' : ''}</td>
      ${hasOther ? `<td>${r.other ? mspendNum(r.other) : '–'}</td>` : ''}
      <td><b>${mspendNum(r.total)}</b></td>
      <td>${mspendNum(r.nc)}</td>
      <td>${r.cac !== null ? mspendAed(r.cac) : '–'}</td></tr>`).join('');

  el.innerHTML = `
    <section class="slv-intro">
      <h2>Marketing Spend</h2>
      <p>What Google ads, Meta ads, the agency and the WhatsApp and CRM tools cost each month, what that comes to for every new client the salons got (the CAC), and what a new client is worth in their first year (the LTV). Shows every month that falls in the Period at the top.</p>
    </section>
    ${stale ? `<p class="slv-muted" style="color:#b42318">Meta spend from Metricool is paused${s && s.last_error ? ': ' + mspendEsc(s.last_error) : ''}. Last good update: ${synced ? mspendEsc(synced) : 'never'}.</p>` : ''}
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">CAC and LTV</div><h3>What a new client costs, and what one is worth</h3></div>
        <p>${rows.length ? mspendEsc(mspendMonth(rows[0].mo)) + (rows.length > 1 ? ' to ' + mspendEsc(mspendMonth(rows[rows.length - 1].mo)) : '') : ''}</p>
      </div>
      ${rows.length ? `
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Marketing spend</div><div class="w13-val">${mspendAed(spend)}</div><div class="slv-note">Google, Meta, agency and tools, ${nMonths(rows.length)}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">CAC</div><div class="w13-val">${cac !== null ? mspendAed(cac) : '–'}</div><div class="slv-note">${cac !== null ? 'Cost to win one new client: spend ÷ new clients, over the ' + nMonths(priced.length) + ' with every cost in' : 'No month in view has every cost in yet'}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">LTV</div><div class="w13-val">${year1 ? mspendAed(year1) : '–'}</div><div class="slv-note">${year1 ? 'What a new client spends in their first 12 months, on average (net sales)' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">LTV ÷ CAC</div><div class="w13-val">${ratio ? ratio.toFixed(1) + ' to 1' : '–'}</div><div class="slv-note">3 to 1 or better is the usual target</div></div>
      </div>` : '<p class="slv-muted">No marketing spend in these dates. Change the Period at the top.</p>'}
    </section>
    ${rows.length ? `
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">How it is worked out</div><h3>The sums behind CAC, LTV and the ratio</h3></div></div>
      <ul class="slv-notes" style="margin:0;padding-left:18px;line-height:1.6">
        <li><b>CAC</b> (customer acquisition cost) = Google + Meta + agency + tools, divided by the new clients. ${cac !== null ? `For the months in view that have every cost in: <b>${mspendAed(pSpend)} ÷ ${mspendNum(pNew)} new clients = ${mspendAed(cac)}</b>.` : 'No month in view has every cost in yet, so there is no CAC.'} A month counts only when Meta runs through it (from Oct 2025) and the agency’s invoice is in. A new client is a client’s first sale at any salon, Bahrain included, matched by name.</li>
        <li><b>LTV</b> (lifetime value, here the first 12 months) = the average net sales a new client brings in the 12 months after their first visit. ${year1 ? `Measured on the <b>${mspendNum(ltv.clients)} clients who first came ${mspendEsc(mspendCohort(ltv.cohort))}</b> (so their year is complete): <b>${mspendAed(year1)}</b> each on average; half spent less than ${mspendAed(ltv.median_net_12m)}, and ${ltv.pct_returned}% came back.` : ''} Voucher and deposit lines are left out. It is sales, not profit.</li>
        <li><b>LTV ÷ CAC</b> = ${year1 && cac ? `<b>${mspendAed(year1)} ÷ ${mspendAed(cac)} = ${ratio.toFixed(1)} to 1</b>` : 'LTV divided by CAC'}. ${ceiling ? `At 3 to 1 the most a new client can cost is LTV ÷ 3 = <b>${mspendAed(ceiling)}</b>. Because that is sales, not profit, the real ceiling is lower.` : ''}</li>
        <li><b>How to read it.</b> CAC divides by <i>every</i> new client, including the many who came without an ad (a friend, walking past, searching Google), so it shows what marketing costs per client we win, not what a client who came from an ad costs. It is also a total over many months, so a month with a big top-up or invoice moves its own CAC.</li>
      </ul>
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">Month by month</div><h3>Spend and CAC</h3></div></div>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Spend by month, with the CAC</div>
        <span class="w13-skey" aria-label="Chart key">
          <span><i class="bar" style="background:#A78BFA"></i>Google</span>
          <span><i class="bar" style="background:#E07A5F"></i>Meta</span>
          <span><i class="bar" style="background:#94A3B8"></i>Agency</span>
          ${hasOther ? '<span><i class="bar" style="background:#5FB3A8"></i>Tools</span>' : ''}
          <span><i class="line" style="--c:#0F6E56"></i>CAC</span>
        </span>
      </div>
      <div style="position:relative;height:300px"><canvas id="mspendCanvas"></canvas></div>
      <div class="slv-wrap" style="margin-top:14px"><table class="slv-table">
        <thead><tr><th>Month</th><th>Google (AED)</th><th>Meta (AED)</th><th>Agency (AED)</th>${hasOther ? '<th>Tools (AED)</th>' : ''}<th>Total (AED)</th><th>New clients</th><th>CAC (AED)</th></tr></thead>
        <tbody>${body}</tbody></table></div>
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">Read this before quoting a number</div><h3>What is and is not in these numbers</h3></div></div>
      <ul class="slv-notes" style="margin:0;padding-left:18px;line-height:1.55">
        <li><b>Agency.</b> Leaders in Digital’s monthly fee for the UAE salons and Bahrain, before VAT, until they were taken off in October 2026. Bahrain’s website build (AED 20,000) has not been billed, so it is not in. A month shows “not invoiced yet” until its invoice is in, and has no CAC until then.</li>
        <li><b>Tools.</b> What was paid each month for respond.io (the plan and the WhatsApp top ups, not the balance still unused) and GoHighLevel (the plan, the add-ons and the wallet recharges). respond.io is billed in dollars, so its dirham figure uses the rate the card was charged, about 3.81. They also serve clients we already have, so part of this is not about winning new ones.</li>
        <li><b>Meta.</b> Includes the small Instagram boosts paid from a second Meta account in Dec 2025 and Aug 2026. Meta before Oct 2025 is not available, so those months show Google only and no CAC.</li>
        <li><b>Not here.</b> Content, influencer fees, commissions and staff time, which have no figures kept, and Phorest, which will show under Tools once its total is in. Add those before calling this the whole cost of winning a client.</li>
        <li><b>New clients.</b> The count runs a little high, and the CAC a little low, because a name spelt differently counts again. The till history starts in May 2021, and the current month is as of last night.</li>
      </ul>
      <p class="slv-muted">${synced ? 'Meta updated ' + mspendEsc(synced) + '.' : ''}</p>
    </section>` : ''}`;
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
        { type: 'bar', order: 2, label: 'Meta', data: rows.map(r => Math.round(r.meta)), yAxisID: 'y', stack: 's', backgroundColor: '#E07A5F', maxBarThickness: 48 },
        { type: 'bar', order: 2, label: 'Agency', data: rows.map(r => Math.round(r.agency || 0)), yAxisID: 'y', stack: 's', backgroundColor: '#94A3B8', maxBarThickness: 48 },
        { type: 'bar', order: 2, label: 'Tools', data: rows.map(r => Math.round(r.other || 0)), yAxisID: 'y', stack: 's', backgroundColor: '#5FB3A8', maxBarThickness: 48, borderRadius: 4 },
        { type: 'line', order: 1, label: 'CAC', data: rows.map(r => r.cac === null ? null : Math.round(r.cac * 10) / 10), yAxisID: 'y1',
          borderColor: lineCol, backgroundColor: lineCol, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: lineCol, pointBorderWidth: 2,
          tension: 0.3, spanGaps: false },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: AED ${Number(c.raw).toLocaleString('en-GB')}` } },
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
