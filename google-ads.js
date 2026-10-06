// Google Ads (Kate, 6 Oct 2026), the first page of the Marketing group. One call to
// google_ads_report (migrations/create_google_ads_daily.sql) over google_ads_daily,
// which the google-ads-sync edge function fills nightly from the Tara Rose Salon
// ad account. Level 3 and above: index.html hides the group and refuses the view
// below that, and google_ads_report refuses them too.
//
// "Conversions" is Google's own count, not bookings. On 6 Oct some campaigns had
// more conversions than clicks, so the page says "Google's count" until Kate knows
// what is being counted.
//
// Own window control (7, 30, 90 days, this year or custom dates), so the masthead filters are
// hidden here. Borrows the Products page's card, tile and table styles (slv-*, w13-*).
let gadsData = null, gadsChart = null;
let gadsDays = 30;
try { const v = localStorage.getItem('trs-gads-days'); if (v !== null && [7, 30, 90, 365, 0].includes(Number(v))) gadsDays = Number(v); } catch (e) {}
// Custom dates (Kate, 6 Oct 2026): gadsDays 0 reads gadsCustom, kept per browser like the rest.
let gadsCustom = { from: '', to: '' };
try { Object.assign(gadsCustom, JSON.parse(localStorage.getItem('trs-gads-custom') || '{}')); } catch (e) {}

const GADS_AREA = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz',
  AUH: 'Abu Dhabi, all', DXB: 'Dubai, all', BH: 'Bahrain', OTHER: 'Other' };
const GADS_BAR = '#0F6E56';
const gadsEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gadsNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const gadsAed = v => 'AED ' + gadsNum(v);
const gadsAed2 = v => (v === null || !isFinite(v)) ? '–' : 'AED ' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gadsIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const gadsDay = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const gadsDayY = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Up to yesterday: today's numbers are still filling in.
function gadsWindow() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const to = new Date(t); to.setDate(t.getDate() - 1);
  const from = new Date(to);
  if (gadsDays === 0 && gadsCustom.from && gadsCustom.to) {
    const a = gadsCustom.from, b = gadsCustom.to;
    return a <= b ? { from: a, to: b, custom: true } : { from: b, to: a, custom: true };
  }
  if (gadsDays === 365) from.setMonth(0, 1); else from.setDate(to.getDate() - (gadsDays || 30) + 1);
  return { from: gadsIso(from), to: gadsIso(to) };
}

function gadsSetDays(n) {
  // Custom opens on the dates already on screen, so there is something to adjust.
  if (n === 0 && !(gadsCustom.from && gadsCustom.to)) {
    const w = gadsWindow(); gadsCustom = { from: w.from, to: w.to };
    try { localStorage.setItem('trs-gads-custom', JSON.stringify(gadsCustom)); } catch (e) {}
  }
  gadsDays = n;
  try { localStorage.setItem('trs-gads-days', String(n)); } catch (e) {}
  renderGoogleAds();
}

function gadsSetCustom(k, v) {
  if (!v) return;
  gadsCustom[k] = v;
  try { localStorage.setItem('trs-gads-custom', JSON.stringify(gadsCustom)); } catch (e) {}
  renderGoogleAds();
}

async function renderGoogleAds() {
  const el = document.getElementById('googleAdsContent');
  if (!el) return;
  const w = gadsWindow();
  el.innerHTML = '<p class="slv-muted">Loading Google Ads…</p>';
  try {
    const { data, error } = await sb.rpc('google_ads_report', { p_from: w.from, p_to: w.to });
    if (error || !data) throw error || new Error('no data');
    // Every day in the window, zero where nothing ran, so a day the ads stopped
    // (17 and 18 Sep 2026 had no spend at all) shows as a gap in the chart.
    const have = {}; (data.days || []).forEach(r => { have[r.date] = r; });
    const days = [];
    if ((data.days || []).length) for (let t = new Date(w.from + 'T00:00:00'); gadsIso(t) <= w.to; t.setDate(t.getDate() + 1)) {
      const k = gadsIso(t);
      days.push(have[k] || { date: k, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
    }
    gadsData = { ...data, days, ran: (data.days || []).length, win: w };
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Google Ads didn’t load. Refresh to try again.</p>';
    return;
  }
  gadsPaint(el);
}

function gadsPaint(el) {
  const d = gadsData, w = d.win;
  const tot = d.days.reduce((a, r) => ({ cost: a.cost + Number(r.cost), clicks: a.clicks + Number(r.clicks),
    impressions: a.impressions + Number(r.impressions), conv: a.conv + Number(r.conversions) }), { cost: 0, clicks: 0, impressions: 0, conv: 0 });
  const perDay = d.days.length ? tot.cost / d.days.length : null;

  // Spend per salon, the city-wide campaigns on their own lines.
  const byArea = {};
  d.campaigns.forEach(c => {
    const a = byArea[c.area] = byArea[c.area] || { cost: 0, clicks: 0, conv: 0 };
    a.cost += Number(c.cost); a.clicks += Number(c.clicks); a.conv += Number(c.conversions);
  });
  const areaRows = ['SAA', 'KCA', 'MC', 'AQ', 'AUH', 'DXB', 'BH', 'OTHER'].filter(k => byArea[k]).map(k => {
    const a = byArea[k];
    return `<tr><td>${gadsEsc(GADS_AREA[k])}</td><td>${gadsNum(a.cost)}</td><td>${gadsNum(a.clicks)}</td>
      <td class="gads-pc">${gadsAed2(a.clicks ? a.cost / a.clicks : null)}</td><td>${gadsNum(a.conv)}</td></tr>`;
  }).join('');

  const campRows = d.campaigns.map(c => {
    const cost = Number(c.cost), clicks = Number(c.clicks), conv = Number(c.conversions);
    const odd = conv > clicks && clicks > 0;
    return `<tr><td>${gadsEsc(c.campaign_name)}<div class="slv-note">${gadsEsc(GADS_AREA[c.area] || c.area)}${c.status === 'PAUSED' ? ', paused' : ''}${c.channel === 'PERFORMANCE_MAX' ? ', Performance Max' : ''}</div></td>
      <td>${gadsNum(cost)}</td><td>${gadsNum(clicks)}</td><td class="gads-pc">${gadsAed2(clicks ? cost / clicks : null)}</td>
      <td>${gadsNum(conv)}${odd ? ' <span class="slv-note" style="display:inline" title="More conversions than clicks: Google is counting something other than one booking per click">*</span>' : ''}</td></tr>`;
  }).join('');

  // Same 36-hour rule as the Instagram counts on Staff Benchmarks.
  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  el.innerHTML = `
    <section class="slv-intro">
      <h2>Google Ads</h2>
      <p>What we spend on Google search ads, the clicks it brings, and where the money goes by salon. Up to yesterday; today is still filling in.</p>
    </section>
    <div class="sc-bar w13-bar">
      <div class="sc-seg" role="group" aria-label="Window">
        ${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'This year'], [0, 'Custom']].map(([k, l]) =>
          `<button type="button" class="${gadsDays === k ? 'on' : ''}" onclick="gadsSetDays(${k})">${l}</button>`).join('')}
      </div>
    </div>
    ${gadsDays === 0 ? `<div class="cmp-dates" style="max-width:420px;margin:12px 0 4px">
      <label class="cmp-f"><span>From</span><input type="date" value="${gadsEsc(gadsCustom.from)}" min="2025-01-01" max="${gadsIso(new Date())}" onchange="gadsSetCustom('from', this.value)"></label>
      <label class="cmp-f"><span>To</span><input type="date" value="${gadsEsc(gadsCustom.to)}" min="2025-01-01" max="${gadsIso(new Date())}" onchange="gadsSetCustom('to', this.value)"></label>
    </div>` : ''}
    ${stale ? `<p class="slv-muted" style="color:#b42318">Google Ads numbers are paused${s && s.last_error ? ': ' + gadsEsc(s.last_error) : ''}. Last good update: ${synced ? gadsEsc(synced) : 'never'}.</p>` : ''}
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">Tara Rose Salon ad account</div><h3>Spend and clicks</h3></div>
        <p>${gadsEsc(gadsDayY(w.from))} to ${gadsEsc(gadsDayY(w.to))}</p>
      </div>
      ${d.days.length ? `
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Spend</div><div class="w13-val">${gadsAed(tot.cost)}</div><div class="slv-note">${perDay !== null ? gadsAed(perDay) + ' a day' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Clicks</div><div class="w13-val">${gadsNum(tot.clicks)}</div><div class="slv-note">${tot.impressions ? (100 * tot.clicks / tot.impressions).toFixed(1) + '% of ' + gadsNum(tot.impressions) + ' views' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Cost per click</div><div class="w13-val">${gadsAed2(tot.clicks ? tot.cost / tot.clicks : null)}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Conversions, Google’s count</div><div class="w13-val">${gadsNum(tot.conv)}</div><div class="slv-note">Not bookings, see the note below</div></div>
      </div>
      <div class="slv-eyebrow" style="margin:18px 0 6px">Spend day by day</div>
      <div style="position:relative;height:260px"><canvas id="gadsCanvas"></canvas></div>` : '<p class="slv-muted">No ad spend in these dates.</p>'}
    </section>
    ${areaRows ? `
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">Where the money went</div><h3>By salon</h3></div></div>
      <div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Salon</th><th>Spend (AED)</th><th>Clicks</th><th class="gads-pc">Per click</th><th>Conv.</th></tr></thead>
        <tbody>${areaRows}</tbody></table></div>
      <p class="slv-note">“Abu Dhabi, all” and “Dubai, all” are the brand and hair services campaigns, which advertise every salon in that city.</p>
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">Every campaign that ran</div><h3>By campaign</h3></div></div>
      <div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Campaign</th><th>Spend (AED)</th><th>Clicks</th><th class="gads-pc">Per click</th><th>Conv.</th></tr></thead>
        <tbody>${campRows}</tbody></table></div>
    </section>` : ''}
    <p class="slv-muted">Conversions are whatever Google Ads counts as a conversion for this account. Some campaigns show more conversions than clicks (marked *), so they are not bookings. Spend is in AED as Google bills it.${synced ? ' Updated ' + gadsEsc(synced) + '.' : ''}${d.first_day ? ' Numbers start ' + gadsEsc(gadsDayY(d.first_day)) + '.' : ''}</p>`;
  gadsDraw(d.days);
}

function gadsDraw(days) {
  const cv = document.getElementById('gadsCanvas');
  if (!cv || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted'), border = css.getPropertyValue('--border');
  if (gadsChart) gadsChart.destroy();
  gadsChart = new Chart(cv, {
    type: 'bar',
    data: {
      labels: days.map(r => gadsDay(r.date)),
      datasets: [{ label: 'Spend', data: days.map(r => Math.round(Number(r.cost))), backgroundColor: GADS_BAR, borderRadius: 3, maxBarThickness: 28 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => { const r = days[c.dataIndex];
          return [`Spend: AED ${gadsNum(r.cost)}`, `Clicks: ${gadsNum(r.clicks)}`]; } } },
      },
      scales: {
        y: { beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
        x: { ticks: { color: muted, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
      },
    },
  });
}

function gadsRedrawForTheme() {
  const v = document.getElementById('view-googleads');
  if (v && v.style.display !== 'none' && gadsData) gadsPaint(document.getElementById('googleAdsContent'));
}
