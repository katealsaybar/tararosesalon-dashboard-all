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
// The campaign row that is open (Kate, 6 Oct 2026: "each campaign should be clickable"),
// its chart and its loaded detail. One open at a time.
let gadsOpenId = null, gadsOpenChart = null, gadsOpenData = null;
let gadsDays = 30;
try { const v = localStorage.getItem('trs-gads-days'); if (v !== null && [7, 30, 90, 365, 0].includes(Number(v))) gadsDays = Number(v); } catch (e) {}
// Custom dates (Kate, 6 Oct 2026): gadsDays 0 reads gadsCustom, kept per browser like the rest.
let gadsCustom = { from: '', to: '' };
try { Object.assign(gadsCustom, JSON.parse(localStorage.getItem('trs-gads-custom') || '{}')); } catch (e) {}

const GADS_AREA = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz',
  AUH: 'Abu Dhabi, all', DXB: 'Dubai, all', BH: 'Bahrain', OTHER: 'Other' };
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
  // The From and To boxes sit in the pill bar, beside Custom (Kate, 6 Oct 2026).
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
  gadsOpenData = null;   // new dates: the open campaign reloads for them
  gadsPaint(el);
  if (gadsOpenId) gadsLoadOpen();
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
    const open = gadsOpenId === String(c.campaign_id);
    return `<tr class="mk-row${open ? ' mk-open' : ''}" tabindex="0" role="button" aria-expanded="${open}" onclick="gadsOpen('${gadsEsc(c.campaign_id)}')" onkeydown="if(event.key==='Enter')gadsOpen('${gadsEsc(c.campaign_id)}')"><td><span class="mk-chev" aria-hidden="true">›</span>${gadsEsc(c.campaign_name)}<div class="slv-note">${gadsEsc(GADS_AREA[c.area] || c.area)}${c.status === 'PAUSED' ? ', paused' : ''}${c.channel === 'PERFORMANCE_MAX' ? ', Performance Max' : ''}</div></td>
      <td>${gadsNum(cost)}</td><td>${gadsNum(clicks)}</td><td class="gads-pc">${gadsAed2(clicks ? cost / clicks : null)}</td>
      <td>${gadsNum(conv)}${odd ? ' <span class="slv-note" style="display:inline" title="More conversions than clicks: Google is counting something other than one booking per click">*</span>' : ''}</td></tr>
      ${open ? `<tr class="mk-detail"><td colspan="5" id="gadsDetail">${gadsDetailHtml(c)}</td></tr>` : ''}`;
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
        ${[[7, '<span class="mk-lg">Last </span>7 days'], [30, '<span class="mk-lg">Last </span>30 days'], [90, '<span class="mk-lg">Last </span>90 days'], [365, 'This year'], [0, 'Custom']].map(([k, l]) =>
          `<button type="button" class="${gadsDays === k ? 'on' : ''}" onclick="gadsSetDays(${k})">${l}</button>`).join('')}
      </div>
      ${gadsDays === 0 ? `<div class="mk-dates" role="group" aria-label="Custom dates">
        <input type="date" aria-label="From" value="${gadsEsc(gadsCustom.from)}" min="2025-01-01" max="${gadsIso(new Date())}" onchange="gadsSetCustom('from', this.value)">
        <span>to</span>
        <input type="date" aria-label="To" value="${gadsEsc(gadsCustom.to)}" min="2025-01-01" max="${gadsIso(new Date())}" onchange="gadsSetCustom('to', this.value)">
      </div>` : ''}
    </div>
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
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Spend ${gadsMode() === 'week' ? 'week by week' : 'day by day'}</div>
        ${mkModePills('gads', gadsMode(), 'gadsRepaint')}
        <span id="gadsQKey"></span>${mkSeriesKey(GADS_SPEC)}
      </div>
      <div style="position:relative;height:280px"><canvas id="gadsCanvas"></canvas></div>
      ${mkQuarterStrip(mkBuckets(d.days, w.from, w.to, 'day', ['cost']), { key: 'cost', label: 'spend', fmt: gadsAed })}` : '<p class="slv-muted">No ad spend in these dates.</p>'}
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
      <p class="slv-note">Tap a campaign for its weeks, the keywords it bids on and what people searched.</p>
    </section>` : ''}
    <p class="slv-muted">Conversions are whatever Google Ads counts as a conversion for this account. Some campaigns show more conversions than clicks (marked *), so they are not bookings. Spend is in AED as Google bills it.${synced ? ' Updated ' + gadsEsc(synced) + '.' : ''}${d.first_day ? ' Numbers start ' + gadsEsc(gadsDayY(d.first_day)) + '.' : ''}</p>`;
  gadsDraw(d.days);
}

// Spend bars by quarter shade, clicks as the line (as the Quarterly page's sales and clients).
const GADS_SPEC = {
  bar: { key: 'cost', label: 'Spend (AED)', fmt: v => 'AED ' + gadsNum(v) },
  line: { key: 'clicks', label: 'Clicks', fmt: v => gadsNum(v) },
};
const gadsMode = () => mkModeFor('gads', gadsData.win.from, gadsData.win.to);
function gadsRepaint() { if (gadsData) gadsPaint(document.getElementById('googleAdsContent')); }
function gadsDraw(days) {
  const w = gadsData.win, rows = mkBuckets(days, w.from, w.to, gadsMode(), ['cost', 'clicks']);
  const k = document.getElementById('gadsQKey');
  if (k) k.innerHTML = mkQKeyHtml(rows);
  gadsChart = mkDrawChart(document.getElementById('gadsCanvas'), rows, GADS_SPEC, gadsChart);
  if (gadsOpenId) gadsDrawOpen();
}

// ── One campaign, opened in place under its row.
function gadsOpen(id) {
  gadsOpenId = gadsOpenId === String(id) ? null : String(id);
  gadsOpenData = null;
  gadsRepaint();
  if (gadsOpenId) gadsLoadOpen();
}
async function gadsLoadOpen() {
  const id = gadsOpenId, w = gadsData.win;
  try {
    const { data, error } = await sb.rpc('google_ads_campaign', { p_campaign_id: id, p_from: w.from, p_to: w.to });
    if (error || !data) throw error || new Error('no data');
    if (gadsOpenId !== id) return;
    gadsOpenData = data;
  } catch (e) {
    console.error(e);
    gadsOpenData = { error: true };
  }
  const td = document.getElementById('gadsDetail');
  const c = gadsData.campaigns.find(x => String(x.campaign_id) === id);
  if (td && c) { td.innerHTML = gadsDetailHtml(c); gadsDrawOpen(); }
}
const GADS_MATCH = { EXACT: 'exact', PHRASE: 'phrase', BROAD: 'broad' };
function gadsDetailHtml(c) {
  const o = gadsOpenData;
  if (!o) return '<p class="slv-muted">Loading the campaign…</p>';
  if (o.error) return '<p class="slv-muted">This campaign didn’t load. Tap it again to retry.</p>';
  const pmax = c.channel === 'PERFORMANCE_MAX';
  const cost = Number(c.cost), clicks = Number(c.clicks);
  const kw = (o.keywords || []).map(k => `<tr><td>${gadsEsc(k.keyword)}<div class="slv-note">${gadsEsc(GADS_MATCH[k.match_type] || String(k.match_type).toLowerCase())} match</div></td>
    <td>${gadsNum(k.cost)}</td><td>${gadsNum(k.clicks)}</td><td class="gads-pc">${gadsAed2(Number(k.clicks) ? Number(k.cost) / Number(k.clicks) : null)}</td></tr>`).join('');
  const tm = (o.terms || []).map(t => `<tr><td>${gadsEsc(t.term)}</td><td>${gadsNum(t.clicks)}</td><td>${gadsNum(t.cost)}</td></tr>`).join('');
  const ran = o.first_day ? `ran ${gadsDayY(o.first_day)} to ${gadsDayY(o.last_day)}` : '';
  const state = c.status === 'PAUSED' ? 'paused' : c.status === 'ENABLED' ? 'running' : String(c.status || '').toLowerCase();
  return `<div class="mk-detail-in">
    <div class="slv-note">${gadsEsc(GADS_AREA[c.area] || c.area)}, ${pmax ? 'Performance Max' : 'Search'}, ${gadsEsc(state)}${ran ? ', ' + gadsEsc(ran) : ''}</div>
    <div class="w13-tiles" style="margin-top:10px">
      <div class="w13-tile"><div class="slv-eyebrow">Spend</div><div class="w13-val">${gadsAed(cost)}</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Clicks</div><div class="w13-val">${gadsNum(clicks)}</div><div class="slv-note">${Number(c.impressions) ? (100 * clicks / Number(c.impressions)).toFixed(1) + '% of ' + gadsNum(c.impressions) + ' views' : ''}</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Cost per click</div><div class="w13-val">${gadsAed2(clicks ? cost / clicks : null)}</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Conversions, Google’s count</div><div class="w13-val">${gadsNum(c.conversions)}</div></div>
    </div>
    <div class="mk-chart-head"><div class="slv-eyebrow">This campaign ${gadsMode() === 'week' ? 'week by week' : 'day by day'}</div><span id="gadsOpenQKey"></span></div>
    <div style="position:relative;height:220px"><canvas id="gadsOpenCanvas"></canvas></div>
    ${pmax ? '<p class="slv-note" style="margin-top:12px">Performance Max chooses its own searches and placements, so Google gives no keywords or search list for it.</p>' : `
    <div class="mk-two">
      <div><div class="slv-eyebrow" style="margin:16px 0 6px">Keywords it bids on</div>
        ${kw ? `<div class="slv-wrap"><table class="slv-table"><thead><tr><th>Keyword</th><th>Spend</th><th>Clicks</th><th class="gads-pc">Per click</th></tr></thead><tbody>${kw}</tbody></table></div>` : '<p class="slv-muted">No keyword had views in these dates.</p>'}</div>
      <div><div class="slv-eyebrow" style="margin:16px 0 6px">What people searched, and clicked</div>
        ${tm ? `<div class="slv-wrap"><table class="slv-table"><thead><tr><th>Search</th><th>Clicks</th><th>Spend</th></tr></thead><tbody>${tm}</tbody></table></div>` : '<p class="slv-muted">No clicked searches in these dates.</p>'}</div>
    </div>`}
  </div>`;
}
function gadsDrawOpen() {
  const o = gadsOpenData;
  if (!o || o.error) return;
  mkFitDetail();
  const w = gadsData.win, rows = mkBuckets(o.days, w.from, w.to, gadsMode(), ['cost', 'clicks']);
  const k = document.getElementById('gadsOpenQKey');
  if (k) k.innerHTML = mkQKeyHtml(rows);
  gadsOpenChart = mkDrawChart(document.getElementById('gadsOpenCanvas'), rows, GADS_SPEC, gadsOpenChart);
}

function gadsRedrawForTheme() {
  const v = document.getElementById('view-googleads');
  if (v && v.style.display !== 'none' && gadsData) gadsPaint(document.getElementById('googleAdsContent'));
}
