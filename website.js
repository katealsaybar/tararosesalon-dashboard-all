// Website & Search (Kate, 6 Oct 2026), the second page of the Marketing group. One call
// to website_report (migrations/create_website_daily.sql) over the GA4 and Search
// Console tables the website-sync edge function fills nightly. Level 3 and above:
// index.html hides the group and refuses the view below that, and website_report
// refuses them too.
//
// Visits are GA4 sessions on tararosesalon.com (UAE and Bahrain pages together; the
// pages list says which is which). "Stayed to look" is GA4's engaged session: 10
// seconds or more, two pages or more, or a key event. GA4's key events are left out
// on purpose, see the migration.
//
// Search Console runs 2 to 3 days behind, so its half says up to which day.
// Own window control like Google Ads (7, 30, 90 days, this year or custom dates), masthead filters
// hidden. Borrows the Products page's card, tile and table styles (slv-*, w13-*).
let webData = null, webChart = null;
let webDays = 30;
try { const v = localStorage.getItem('trs-web-days'); if (v !== null && [7, 30, 90, 365, 0].includes(Number(v))) webDays = Number(v); } catch (e) {}
// Custom dates (Kate, 6 Oct 2026): webDays 0 reads webCustom, kept per browser like the rest.
let webCustom = { from: '', to: '' };
try { Object.assign(webCustom, JSON.parse(localStorage.getItem('trs-web-custom') || '{}')); } catch (e) {}

// GA4's channel names, said plainly.
const WEB_CHANNEL = {
  'Paid Social': 'Paid social (Meta ads)', 'Organic Search': 'Google search, unpaid',
  'Direct': 'Typed in or saved link', 'Paid Search': 'Google Ads',
  'Organic Social': 'Social posts, unpaid', 'Referral': 'Other websites',
  'AI Assistant': 'AI assistants (ChatGPT and others)', 'Paid Other': 'Other paid links',
  'Unassigned': 'Not known', 'Cross-network': 'Google Performance Max', 'Display': 'Google display ads',
  'Email': 'Email', 'Organic Video': 'Video, unpaid', 'Paid Video': 'Video ads', 'SMS': 'SMS',
};
const WEB_BAR = '#0F6E56';
const webEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const webNum = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const webPct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
const webIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const webDay = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const webDayY = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// A page address read as words: /en/ae/locations/dubai/motor-city/ → "Locations › Dubai › Motor City".
function webPage(p) {
  const bh = /^\/en\/bh(\/|$)/.test(p);
  const parts = p.replace(/^\/en\/(ae|bh)/, '').split('/').filter(Boolean)
    .map(s => decodeURIComponent(s).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  return { name: parts.length ? parts.join(' › ') : 'Home page', where: bh ? 'Bahrain' : (/^\/en\/ae(\/|$)/.test(p) ? 'UAE' : '') };
}

// Up to yesterday: today's visits are still filling in.
function webWindow() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const to = new Date(t); to.setDate(t.getDate() - 1);
  const from = new Date(to);
  if (webDays === 0 && webCustom.from && webCustom.to) {
    const a = webCustom.from, b = webCustom.to;
    return a <= b ? { from: a, to: b, custom: true } : { from: b, to: a, custom: true };
  }
  if (webDays === 365) from.setMonth(0, 1); else from.setDate(to.getDate() - (webDays || 30) + 1);
  return { from: webIso(from), to: webIso(to) };
}

function webSetDays(n) {
  // Custom opens on the dates already on screen, so there is something to adjust.
  if (n === 0 && !(webCustom.from && webCustom.to)) {
    const w = webWindow(); webCustom = { from: w.from, to: w.to };
    try { localStorage.setItem('trs-web-custom', JSON.stringify(webCustom)); } catch (e) {}
  }
  webDays = n;
  try { localStorage.setItem('trs-web-days', String(n)); } catch (e) {}
  renderWebsite();
}

function webSetCustom(k, v) {
  if (!v) return;
  webCustom[k] = v;
  try { localStorage.setItem('trs-web-custom', JSON.stringify(webCustom)); } catch (e) {}
  renderWebsite();
}

async function renderWebsite() {
  const el = document.getElementById('websiteContent');
  if (!el) return;
  const w = webWindow();
  el.innerHTML = '<p class="slv-muted">Loading website and search…</p>';
  try {
    const { data, error } = await sb.rpc('website_report', { p_from: w.from, p_to: w.to });
    if (error || !data) throw error || new Error('no data');
    webData = { ...data, win: w };
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Website and search didn’t load. Refresh to try again.</p>';
    return;
  }
  webPaint(el);
}

function webPaint(el) {
  const d = webData, w = d.win;
  const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const visits = sum(d.days, 'sessions'), people = sum(d.days, 'users'), fresh = sum(d.days, 'new_users'), engaged = sum(d.days, 'engaged_sessions');
  const sClicks = sum(d.search_days, 'clicks'), sShown = sum(d.search_days, 'impressions');
  const sPos = sShown ? d.search_days.reduce((a, r) => a + Number(r.position) * Number(r.impressions), 0) / sShown : null;
  const chTotal = sum(d.channels, 'sessions');
  const paid = sum(d.channels.filter(c => /^(Paid|Cross-network|Display)/.test(c.channel)), 'sessions');

  const chRows = d.channels.map(c => `<tr><td>${webEsc(WEB_CHANNEL[c.channel] || c.channel)}</td>
    <td>${webNum(c.sessions)}</td><td>${webPct(c.sessions, chTotal)}</td><td>${webPct(c.engaged_sessions, c.sessions)}</td></tr>`).join('');
  const pgRows = d.pages.map((p, i) => { const x = webPage(p.page);
    return `<tr><td>${i + 1}</td><td>${webEsc(x.name)}<div class="slv-note">${x.where ? webEsc(x.where) + ', ' : ''}${webEsc(p.page)}</div></td><td>${webNum(p.views)}</td></tr>`; }).join('');
  const qRows = d.queries.map(q => `<tr><td>${webEsc(q.query)}</td><td>${webNum(q.clicks)}</td><td>${webNum(q.impressions)}</td>
    <td class="web-st">${q.position !== null ? Number(q.position).toFixed(1) : '–'}</td></tr>`).join('');

  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const sTo = d.search_last_day && d.search_last_day < w.to ? d.search_last_day : w.to;

  el.innerHTML = `
    <section class="slv-intro">
      <h2>Website &amp; Search</h2>
      <p>Who comes to tararosesalon.com, where they come from and what they look at, and what people type into Google to find us. Up to yesterday.</p>
    </section>
    <div class="sc-bar w13-bar">
      <div class="sc-seg" role="group" aria-label="Window">
        ${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'This year'], [0, 'Custom']].map(([k, l]) =>
          `<button type="button" class="${webDays === k ? 'on' : ''}" onclick="webSetDays(${k})">${l}</button>`).join('')}
      </div>
    </div>
    ${webDays === 0 ? `<div class="cmp-dates" style="max-width:420px;margin:12px 0 4px">
      <label class="cmp-f"><span>From</span><input type="date" value="${webEsc(webCustom.from)}" min="2025-01-01" max="${webIso(new Date())}" onchange="webSetCustom('from', this.value)"></label>
      <label class="cmp-f"><span>To</span><input type="date" value="${webEsc(webCustom.to)}" min="2025-01-01" max="${webIso(new Date())}" onchange="webSetCustom('to', this.value)"></label>
    </div>` : ''}
    ${stale ? `<p class="slv-muted" style="color:#b42318">Website numbers are paused${s && s.last_error ? ': ' + webEsc(s.last_error) : ''}. Last good update: ${synced ? webEsc(synced) : 'never'}.</p>` : ''}
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">tararosesalon.com, Google Analytics</div><h3>Visits</h3></div>
        <p>${webEsc(webDayY(w.from))} to ${webEsc(webDayY(w.to))}</p>
      </div>
      ${d.days.length ? `
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Visits</div><div class="w13-val">${webNum(visits)}</div><div class="slv-note">${webNum(visits / d.days.length)} a day</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">People</div><div class="w13-val">${webNum(people)}</div><div class="slv-note">${webPct(fresh, people)} first time on the site</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Stayed to look</div><div class="w13-val">${webPct(engaged, visits)}</div><div class="slv-note">10 seconds or 2 pages or more</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">From ads</div><div class="w13-val">${webPct(paid, visits)}</div><div class="slv-note">${webNum(paid)} visits from paid ads</div></div>
      </div>
      <div class="slv-eyebrow" style="margin:18px 0 6px">Visits day by day</div>
      <div style="position:relative;height:240px"><canvas id="webCanvas"></canvas></div>` : '<p class="slv-muted">No visits in these dates.</p>'}
    </section>
    ${chRows ? `
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">Where visits came from</div><h3>By source</h3></div></div>
      <div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Source</th><th>Visits</th><th>Share</th><th>Stayed to look</th></tr></thead>
        <tbody>${chRows}</tbody></table></div>
      <p class="slv-note">A low "stayed to look" means people arrive and leave within seconds: worth checking the ad or post that sends them.</p>
    </section>` : ''}
    ${pgRows ? `
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head"><div><div class="slv-eyebrow">What they looked at</div><h3>Top pages</h3></div></div>
      <div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>#</th><th>Page</th><th>Views</th></tr></thead>
        <tbody>${pgRows}</tbody></table></div>
    </section>` : ''}
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head">
        <div><div class="slv-eyebrow">Google search, unpaid, Search Console</div><h3>How people find us on Google</h3></div>
        <p>${webEsc(webDayY(w.from))} to ${webEsc(webDayY(sTo))}</p>
      </div>
      ${d.search_days.length ? `
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Clicks</div><div class="w13-val">${webNum(sClicks)}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Times we showed up</div><div class="w13-val">${webNum(sShown)}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Clicked</div><div class="w13-val">${sShown ? (100 * sClicks / sShown).toFixed(1) + '%' : '–'}</div><div class="slv-note">of the times we showed up</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Average place</div><div class="w13-val">${sPos !== null ? sPos.toFixed(1) : '–'}</div><div class="slv-note">1 is the top result</div></div>
      </div>
      ${qRows ? `<div class="slv-eyebrow" style="margin:18px 0 6px">What they searched</div>
      <div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Search</th><th>Clicks</th><th>Showed up</th><th class="web-st">Place</th></tr></thead>
        <tbody>${qRows}</tbody></table></div>` : ''}` : '<p class="slv-muted">No search numbers for these dates yet.</p>'}
    </section>
    <p class="slv-muted">Visits count the UAE and Bahrain pages together. Search Console runs 2 to 3 days behind and leaves out searches Google keeps private, so the searches listed add up to less than the clicks.${synced ? ' Updated ' + webEsc(synced) + '.' : ''}</p>`;
  webDraw(d.days);
}

function webDraw(days) {
  const cv = document.getElementById('webCanvas');
  if (!cv || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted'), border = css.getPropertyValue('--border');
  if (webChart) webChart.destroy();
  webChart = new Chart(cv, {
    type: 'bar',
    data: {
      labels: days.map(r => webDay(r.date)),
      datasets: [{ label: 'Visits', data: days.map(r => Number(r.sessions)), backgroundColor: WEB_BAR, borderRadius: 3, maxBarThickness: 28 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => { const r = days[c.dataIndex];
          return [`Visits: ${webNum(r.sessions)}`, `People: ${webNum(r.users)}`]; } } },
      },
      scales: {
        y: { beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
        x: { ticks: { color: muted, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
      },
    },
  });
}

function webRedrawForTheme() {
  const v = document.getElementById('view-website');
  if (v && v.style.display !== 'none' && webData) webPaint(document.getElementById('websiteContent'));
}
