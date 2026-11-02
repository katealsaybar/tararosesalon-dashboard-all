// Meta Ads (Kate, 2 Nov 2026), the page after Google Ads in the Content group: "separate Meta Ads dashboard,
// like Google Ads". One call to meta_ads_report (migrations/meta_ads_page.sql) over meta_ads_daily (spend, the
// Drive invoices and Metricool), meta_ads_metrics_daily (views and clicks) and meta_ads_campaign_daily (one row
// per campaign per day), which the meta-ads-sync edge function fills nightly from the Tara Rose Salon ad account
// through Metricool. Level 3 and above: index.html hides the group and refuses the view below that, and
// meta_ads_report refuses them too.
//
// "Results" is Meta's own count for what the campaign was set to get (for the Leads campaigns, a form sent in the
// chat widget), not bookings, so the page says "Meta's count" until Kate knows what is being counted.
// Views and clicks only exist from 22 Apr 2026 (when Metricool joined the ad account); spend goes back to Oct 2025
// from the invoices, so a longer window shows clicks and cost per click for the days that have them.
//
// Own window control (7, 30, 90 days, this year or custom dates), so the masthead filters are hidden here.
// Borrows the Google Ads page's look (slv-*, w13-*, mk-*) and marketing-chart.js.
let madsData = null, madsChart = null;
// The campaign row that is open, its chart and its loaded detail. One open at a time.
let madsOpenId = null, madsOpenChart = null, madsOpenData = null;
let madsDays = 30;
try { const v = localStorage.getItem('trs-mads-days'); if (v !== null && [7, 30, 90, 365, 0].includes(Number(v))) madsDays = Number(v); } catch (e) {}
// True while the page is still on a range it remembered (not Last 30 days) and nobody has picked one this visit.
let madsRestored = madsDays !== 30;
let madsCustom = { from: '', to: '' };
try { Object.assign(madsCustom, JSON.parse(localStorage.getItem('trs-mads-custom') || '{}')); } catch (e) {}

const madsEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const madsNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const madsAed = v => 'AED ' + madsNum(v);
const madsAed2 = v => (v === null || !isFinite(v)) ? '–' : 'AED ' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const madsIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const madsDayY = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const madsMonth = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const madsLabel = l => String(l || '').replace(/_/g, ' ');

// Up to yesterday: today's numbers are still filling in.
function madsWindow() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const to = new Date(t); to.setDate(t.getDate() - 1);
  const from = new Date(to);
  if (madsDays === 0 && madsCustom.from && madsCustom.to) {
    const a = madsCustom.from, b = madsCustom.to;
    return a <= b ? { from: a, to: b, custom: true } : { from: b, to: a, custom: true };
  }
  if (madsDays === 365) from.setMonth(0, 1); else from.setDate(to.getDate() - (madsDays || 30) + 1);
  return { from: madsIso(from), to: madsIso(to) };
}

function madsSetDays(n) {
  // Custom opens on the dates already on screen, so there is something to adjust.
  if (n === 0 && !(madsCustom.from && madsCustom.to)) {
    const w = madsWindow(); madsCustom = { from: w.from, to: w.to };
    try { localStorage.setItem('trs-mads-custom', JSON.stringify(madsCustom)); } catch (e) {}
  }
  madsDays = n; madsRestored = false;
  try { localStorage.setItem('trs-mads-days', String(n)); } catch (e) {}
  renderMetaAds();
}

function madsSetCustom(k, v) {
  if (!v) return;
  madsCustom[k] = v; madsRestored = false;
  try { localStorage.setItem('trs-mads-custom', JSON.stringify(madsCustom)); } catch (e) {}
  renderMetaAds();
}

async function renderMetaAds() {
  const el = document.getElementById('metaAdsContent');
  if (!el) return;
  const w = madsWindow();
  el.innerHTML = '<p class="slv-muted">Loading Meta Ads…</p>';
  try {
    const { data, error } = await sb.rpc('meta_ads_report', { p_from: w.from, p_to: w.to });
    if (error || !data) throw error || new Error('no data');
    // Every day in the window, zero where nothing ran, so a day the ads stopped shows as a gap in the chart.
    const have = {}; (data.days || []).forEach(r => { have[r.date] = r; });
    const days = [];
    if ((data.days || []).length) for (let t = new Date(w.from + 'T00:00:00'); madsIso(t) <= w.to; t.setDate(t.getDate() + 1)) {
      const k = madsIso(t);
      days.push(have[k] || { date: k, cost: 0, clicks: 0, impressions: 0, reach: 0 });
    }
    madsData = { ...data, days, win: w };
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Meta Ads didn’t load. Refresh to try again.</p>';
    return;
  }
  madsOpenData = null;   // new dates: the open campaign reloads for them
  madsPaint(el);
  if (madsOpenId) madsLoadOpen();
}

function madsPaint(el) {
  const d = madsData, w = d.win;
  const fm = d.first_metric_day;   // clicks and views exist from this day
  const tot = d.days.reduce((a, r) => {
    const m = fm && r.date >= fm;
    return { cost: a.cost + Number(r.cost), clicks: a.clicks + Number(r.clicks), impressions: a.impressions + Number(r.impressions),
      costM: a.costM + (m ? Number(r.cost) : 0) };
  }, { cost: 0, clicks: 0, impressions: 0, costM: 0 });
  const perDay = d.days.length ? tot.cost / d.days.length : null;
  const results = d.campaigns.reduce((s, c) => s + Number(c.results || 0), 0);
  const partial = fm && w.from < fm;      // the window starts before clicks and views were kept
  const noMetrics = !fm || w.to < fm;     // ... or ends before

  // Month by month, from the days (spend by the same rule as Marketing Spend).
  const byMonth = {};
  d.days.forEach(r => {
    const k = r.date.slice(0, 7), m = byMonth[k] = byMonth[k] || { cost: 0, clicks: 0, costM: 0, hasM: false };
    m.cost += Number(r.cost);
    if (fm && r.date >= fm) { m.clicks += Number(r.clicks); m.costM += Number(r.cost); m.hasM = true; }
  });
  const monthRows = Object.keys(byMonth).sort().reverse().map(k => {
    const m = byMonth[k];
    return `<tr><td>${madsEsc(madsMonth(k))}</td><td>${madsNum(m.cost)}</td><td>${m.hasM ? madsNum(m.clicks) : '–'}</td>
      <td class="gads-pc">${m.hasM && m.clicks ? madsAed2(m.costM / m.clicks) : '–'}</td></tr>`;
  }).join('');

  const campRows = d.campaigns.map(c => {
    const cost = Number(c.cost), clicks = Number(c.clicks), res = Number(c.results || 0);
    const open = madsOpenId === String(c.campaign_id);
    const state = c.status === 'PAUSED' ? 'paused' : c.status === 'ACTIVE' ? 'running' : String(c.status || '').toLowerCase();
    return `<tr class="mk-row${open ? ' mk-open' : ''}" tabindex="0" role="button" aria-expanded="${open}" onclick="madsOpen('${madsEsc(c.campaign_id)}')" onkeydown="if(event.key==='Enter')madsOpen('${madsEsc(c.campaign_id)}')"><td><span class="mk-chev" aria-hidden="true">›</span>${madsEsc(c.campaign_name)}<div class="slv-note">${madsEsc(state)}${c.first_day ? ', ran ' + madsEsc(madsDayY(c.first_day)) + ' to ' + madsEsc(madsDayY(c.last_day)) : ''}</div></td>
      <td>${madsNum(cost)}</td><td>${madsNum(clicks)}</td><td class="gads-pc">${madsAed2(clicks ? cost / clicks : null)}</td>
      <td>${res ? madsNum(res) + `<div class="slv-note">${madsEsc(madsLabel(c.results_label))}</div>` : '–'}</td></tr>
      ${open ? `<tr class="mk-detail"><td colspan="5" id="madsDetail">${madsDetailHtml(c)}</td></tr>` : ''}`;
  }).join('');

  // Same 36-hour rule as the Google Ads page.
  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  // Ads that have stopped say so, rather than a chart that just ends.
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const idle = d.last_spend_day && d.last_spend_day < madsIso(new Date(yest.getTime() - 864e5));   // nothing on at least the last two days
  const allPaused = d.campaigns.length && d.campaigns.every(c => c.status === 'PAUSED');

  el.innerHTML = `
    ${mkPeriodRow('mads', madsDays, madsCustom, madsRestored ? w : null)}
    <section class="slv-intro">
      <h2>Meta Ads</h2>
      <p>What we spend on Facebook and Instagram ads, the clicks it brings, and which campaign the money went to. Up to yesterday; today is still filling in.</p>
    </section>
    ${whyWall([
      ['Why this page', 'This is the money we put into Facebook and Instagram, and the quickest place to see what it brought to the door.'],
      ['What to watch', 'If cost per click goes up while clicks stay flat, we are paying more for the same visitors. If the spend line stops, the ads have stopped.'],
      ['What to do', 'Tell Kate which campaign, and she checks the budget with Tara.']])}
    ${stale ? `<p class="slv-muted" style="color:#b42318">Meta Ads numbers are paused${s && s.last_error ? ': ' + madsEsc(s.last_error) : ''}. Last good update: ${synced ? madsEsc(synced) : 'never'}.</p>` : ''}
    ${idle ? `<p class="slv-muted" style="color:#b42318">No Meta ad spend since ${madsEsc(madsDayY(d.last_spend_day))}.${allPaused ? ' The campaigns that ran in these dates are all paused.' : ''}</p>` : ''}
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">Tara Rose Salon ad account</div><h3>Spend and clicks</h3></div>
        <p>${madsEsc(madsDayY(w.from))} to ${madsEsc(madsDayY(w.to))}</p>
      </div>
      ${d.days.length ? `
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Spend</div><div class="w13-val">${madsAed(tot.cost)}</div><div class="slv-note">${perDay !== null ? madsAed(perDay) + ' a day' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Clicks</div><div class="w13-val">${noMetrics ? '–' : madsNum(tot.clicks)}</div><div class="slv-note">${!noMetrics && tot.impressions ? (100 * tot.clicks / tot.impressions).toFixed(1) + '% of ' + madsNum(tot.impressions) + ' views' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Cost per click</div><div class="w13-val">${madsAed2(!noMetrics && tot.clicks ? tot.costM / tot.clicks : null)}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Results, Meta’s count</div><div class="w13-val">${d.campaigns.length ? madsNum(results) : '–'}</div><div class="slv-note">Not bookings, see the note below</div></div>
      </div>
      ${partial ? `<p class="slv-note" style="margin-top:10px">Clicks and views start ${madsEsc(madsDayY(fm))}, so clicks and cost per click cover that day onwards; spend covers every day.</p>` : ''}
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Spend ${madsMode() === 'week' ? 'week by week' : 'day by day'}</div>
        ${mkModePills('mads', madsMode(), 'madsRepaint')}
        <span id="madsQKey"></span>${mkSeriesKey(MADS_SPEC)}
      </div>
      <div style="position:relative;height:280px"><canvas id="madsCanvas"></canvas></div>
      ${mkQuarterStrip(mkBuckets(d.days, w.from, w.to, 'day', ['cost']), { key: 'cost', label: 'spend', fmt: madsAed })}` : '<p class="slv-muted">No ad spend in these dates.</p>'}
    </section>
    ${monthRows ? `
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">What we spent</div><h3>Month by month</h3></div></div>
      <div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Month</th><th>Spend (AED)</th><th>Clicks</th><th class="gads-pc">Per click</th></tr></thead>
        <tbody>${monthRows}</tbody></table></div>
    </section>` : ''}
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">Each campaign, biggest spend first</div><h3>By campaign</h3></div></div>
      ${campRows ? `<div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Campaign</th><th>Spend (AED)</th><th>Clicks</th><th class="gads-pc">Per click</th><th>Results</th></tr></thead>
        <tbody>${campRows}</tbody></table></div>
      <p class="slv-note">Tap a campaign for its days. Results are what Meta counted for that campaign, named under the number.</p>` : '<p class="slv-muted">No campaign had spend in these dates.</p>'}
    </section>
    <p class="slv-muted">Spend is in AED as Meta bills it, for the Tara Rose Salon ad account. Before August 2026 it comes from Meta’s own payment invoices, spread over the days each campaign ran; after that it is read from Metricool each night. The second Meta account (Instagram boosts) is not in these numbers; Marketing Spend adds it. Results are whatever Meta counts for the campaign’s goal, so they are not bookings.${synced ? ' Updated ' + madsEsc(synced) + '.' : ''}${d.first_day ? ' Spend starts ' + madsEsc(madsDayY(d.first_day)) + '.' : ''}</p>`;
  madsDraw(d.days);
}

// Spend bars by quarter shade, clicks as the line (as the Google Ads page).
const MADS_SPEC = {
  bar: { key: 'cost', label: 'Spend (AED)', fmt: v => 'AED ' + madsNum(v) },
  line: { key: 'clicks', label: 'Clicks', fmt: v => madsNum(v) },
};
const madsMode = () => mkModeFor('mads', madsData.win.from, madsData.win.to);
function madsRepaint() { if (madsData) madsPaint(document.getElementById('metaAdsContent')); }
function madsDraw(days) {
  const w = madsData.win, rows = mkBuckets(days, w.from, w.to, madsMode(), ['cost', 'clicks']);
  const k = document.getElementById('madsQKey');
  if (k) k.innerHTML = mkQKeyHtml(rows);
  madsChart = mkDrawChart(document.getElementById('madsCanvas'), rows, MADS_SPEC, madsChart);
  if (madsOpenId) madsDrawOpen();
}

// ── One campaign, opened in place under its row.
function madsOpen(id) {
  madsOpenId = madsOpenId === String(id) ? null : String(id);
  madsOpenData = null;
  madsRepaint();
  if (madsOpenId) madsLoadOpen();
}
async function madsLoadOpen() {
  const id = madsOpenId, w = madsData.win;
  try {
    const { data, error } = await sb.rpc('meta_ads_campaign', { p_campaign_id: id, p_from: w.from, p_to: w.to });
    if (error || !data) throw error || new Error('no data');
    if (madsOpenId !== id) return;
    madsOpenData = data;
  } catch (e) {
    console.error(e);
    madsOpenData = { error: true };
  }
  const td = document.getElementById('madsDetail');
  const c = madsData.campaigns.find(x => String(x.campaign_id) === id);
  if (td && c) { td.innerHTML = madsDetailHtml(c); madsDrawOpen(); }
}
function madsDetailHtml(c) {
  const o = madsOpenData;
  if (!o) return '<p class="slv-muted">Loading the campaign…</p>';
  if (o.error) return '<p class="slv-muted">This campaign didn’t load. Tap it again to retry.</p>';
  const cost = Number(c.cost), clicks = Number(c.clicks), res = Number(c.results || 0);
  const ran = o.first_day ? `ran ${madsDayY(o.first_day)} to ${madsDayY(o.last_day)}` : '';
  const state = c.status === 'PAUSED' ? 'paused' : c.status === 'ACTIVE' ? 'running' : String(c.status || '').toLowerCase();
  const goal = String(c.objective || '').replace(/^OUTCOME_/, '').toLowerCase();
  return `<div class="mk-detail-in">
    <div class="slv-note">${goal ? madsEsc(goal) + ' campaign, ' : ''}${madsEsc(state)}${ran ? ', ' + madsEsc(ran) : ''}</div>
    <div class="w13-tiles" style="margin-top:10px">
      <div class="w13-tile"><div class="slv-eyebrow">Spend</div><div class="w13-val">${madsAed(cost)}</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Clicks</div><div class="w13-val">${madsNum(clicks)}</div><div class="slv-note">${Number(c.impressions) ? (100 * clicks / Number(c.impressions)).toFixed(1) + '% of ' + madsNum(c.impressions) + ' views' : ''}</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Cost per click</div><div class="w13-val">${madsAed2(clicks ? cost / clicks : null)}</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Results, Meta’s count</div><div class="w13-val">${res ? madsNum(res) : '–'}</div><div class="slv-note">${res ? madsEsc(madsLabel(c.results_label)) : ''}</div></div>
    </div>
    <div class="mk-chart-head"><div class="slv-eyebrow">This campaign ${madsMode() === 'week' ? 'week by week' : 'day by day'}</div><span id="madsOpenQKey"></span></div>
    <div style="position:relative;height:220px"><canvas id="madsOpenCanvas"></canvas></div>
  </div>`;
}
function madsDrawOpen() {
  const o = madsOpenData;
  if (!o || o.error) return;
  mkFitDetail();
  const w = madsData.win, rows = mkBuckets(o.days, w.from, w.to, madsMode(), ['cost', 'clicks']);
  const k = document.getElementById('madsOpenQKey');
  if (k) k.innerHTML = mkQKeyHtml(rows);
  madsOpenChart = mkDrawChart(document.getElementById('madsOpenCanvas'), rows, MADS_SPEC, madsOpenChart);
}

function madsRedrawForTheme() {
  const v = document.getElementById('view-metaads');
  if (v && v.style.display !== 'none' && madsData) madsPaint(document.getElementById('metaAdsContent'));
}
