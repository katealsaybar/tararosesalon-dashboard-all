// Social (Kate, 6 Oct 2026), the third page of the Marketing group: Instagram, TikTok
// and the Facebook page in one place, from Metricool. One call to social_report
// (migrations/create_metricool.sql) over the tables the metricool-sync edge function
// fills nightly. Level 3 and above, like Google Ads: index.html hides it below that
// and social_report refuses them too.
//
// The apps report late (TikTok about two days, Instagram one), so the last days of
// any window can be thin; the page says up to which day each one has numbers.
// Instagram views and TikTok views are the account's views that day; Facebook has no
// daily page views in Metricool, so its bars are its posts' and reels' views on the
// day they went out.
//
// Own window control (7, 30, 90 days, this year or custom dates), as google-ads.js,
// and the same card, tile and table styles (slv-*, w13-*, mk-*).
let socData = null, socChart = null;
let socDays = 30, socNet = 'all', socAll = false;
try { const v = localStorage.getItem('trs-soc-days'); if (v !== null && [7, 30, 90, 365, 0].includes(Number(v))) socDays = Number(v); } catch (e) {}
let socCustom = { from: '', to: '' };
try { Object.assign(socCustom, JSON.parse(localStorage.getItem('trs-soc-custom') || '{}')); } catch (e) {}

const SOC_NETS = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook' };
const SOC_KIND = { post: 'post', reel: 'reel', video: 'video', photo: 'photo post' };
// Platform colours, one set a theme (the chart is drawn in JS, so it reads the theme at draw time).
const socCols = () => document.documentElement.getAttribute('data-theme') === 'dark'
  ? { instagram: '#FF9B9B', tiktok: '#99F6E4', facebook: '#C4B5FD' }
  : { instagram: '#C2416A', tiktok: '#1A1A1A', facebook: '#3B5BA9' };
const socNum = v => (v === null || v === undefined) ? '–' : Math.round(Number(v) || 0).toLocaleString('en-GB');
const socSigned = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('en-GB');
const socDayY = d => mkD(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function socWindow() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const to = new Date(t); to.setDate(t.getDate() - 1);
  const from = new Date(to);
  if (socDays === 0 && socCustom.from && socCustom.to) {
    const a = socCustom.from, b = socCustom.to;
    return a <= b ? { from: a, to: b, custom: true } : { from: b, to: a, custom: true };
  }
  if (socDays === 365) from.setMonth(0, 1); else from.setDate(to.getDate() - (socDays || 30) + 1);
  return { from: mkIso(from), to: mkIso(to) };
}

function socSetDays(n) {
  if (n === 0 && !(socCustom.from && socCustom.to)) {
    const w = socWindow(); socCustom = { from: w.from, to: w.to };
    try { localStorage.setItem('trs-soc-custom', JSON.stringify(socCustom)); } catch (e) {}
  }
  socDays = n;
  try { localStorage.setItem('trs-soc-days', String(n)); } catch (e) {}
  renderSocial();
}
function socSetCustom(k, v) {
  if (!v) return;
  socCustom[k] = v;
  try { localStorage.setItem('trs-soc-custom', JSON.stringify(socCustom)); } catch (e) {}
  renderSocial();
}
function socSetNet(n) { socNet = n; socAll = false; socRepaint(); }
function socShowAll() { socAll = true; socRepaint(); }

async function renderSocial() {
  const el = document.getElementById('socialContent');
  if (!el) return;
  const w = socWindow();
  el.innerHTML = '<p class="slv-muted">Loading Social…</p>';
  try {
    const { data, error } = await sb.rpc('social_report', { p_from: w.from, p_to: w.to });
    if (error || !data) throw error || new Error('no data');
    socData = { ...data, win: w };
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Social didn’t load. Refresh to try again.</p>';
    return;
  }
  socPaint(el);
}

// Adds up the window: per network, metric totals and the last day with numbers.
function socTotals(d) {
  const t = {}, last = {};
  d.days.forEach(r => {
    const k = r.network + '.' + r.metric;
    t[k] = (t[k] || 0) + Number(r.value);
    if (!last[r.network] || r.date > last[r.network]) last[r.network] = r.date;
  });
  const posts = { instagram: [], tiktok: [], facebook: [] };
  d.posts.forEach(p => { (posts[p.network] = posts[p.network] || []).push(p); });
  const sum = (arr, f) => arr.reduce((a, p) => a + (Number(p[f]) || 0), 0);
  return { t, last, posts, sum };
}

function socPaint(el) {
  const d = socData, w = d.win, { t, last, posts, sum } = socTotals(d);
  const f = d.followers || {}, cols = socCols();
  const fol = net => {
    const x = f[net];
    if (!x || x.end === null || x.end === undefined) return '<div class="w13-val">–</div>';
    const chg = x.start !== null && x.start !== undefined ? Number(x.end) - Number(x.start) : null;
    return `<div class="w13-val">${socNum(x.end)}${chg !== null ? ` <span class="svc-d ${chg > 0 ? 'up' : chg < 0 ? 'down' : ''}">${socSigned(chg)}</span>` : ''}</div>`;
  };
  const count = (arr, kinds) => kinds.map(([k, l]) => { const n = arr.filter(p => p.kind === k).length; return n ? `${n} ${l}${n === 1 ? '' : 's'}` : ''; }).filter(Boolean).join(', ') || 'none';
  // A line Metricool has no numbers for (Instagram profile visits, at times) is left out, not shown as a dash.
  const kv = rows => `<div class="soc-kv">${rows.filter(([, v]) => v !== '–').map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>`;
  const upTo = net => last[net] ? `<div class="slv-note">Numbers up to ${mkDay(last[net])}</div>` : '';
  const ig = posts.instagram, tt = posts.tiktok, fb = posts.facebook;

  const card = (net, eyebrow, body) => `<div class="w13-tile soc-plat">
      <div class="soc-plat-top"><i style="background:${cols[net]}"></i>${SOC_NETS[net]}</div>
      <div class="slv-eyebrow">${eyebrow}</div>${body}</div>`;

  // Stale: same 36-hour rule as Google Ads and the Instagram tags.
  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  // Top posts: most viewed first, one platform or all.
  const list = d.posts.filter(p => socNet === 'all' || p.network === socNet)
    .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
  const shown = socAll ? list : list.slice(0, 15);
  const postRows = shown.map(p => {
    const cap = String(p.caption || '').split('\n').map(x => x.trim()).find(Boolean) || '(no caption)';
    return `<tr><td><div class="soc-post">
        ${p.image_url ? `<img src="${mkEsc(p.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        <div><span class="soc-pill" style="color:${cols[p.network]}">${SOC_NETS[p.network]} ${SOC_KIND[p.kind] || p.kind}</span> <span class="slv-note" style="display:inline">${mkDay(p.post_date)}</span>
        <div class="soc-cap">${p.url ? `<a href="${mkEsc(p.url)}" target="_blank" rel="noopener">${mkEsc(cap)}</a>` : mkEsc(cap)}</div></div></div></td>
      <td>${socNum(p.views)}</td><td>${socNum(p.reach)}</td><td>${socNum(p.interactions)}</td><td class="soc-sm">${socNum(p.saves)}</td></tr>`;
  }).join('');

  el.innerHTML = `
    <section class="slv-intro">
      <h2>Social</h2>
      <p>Instagram, TikTok and the Facebook page in one place: how many people follow us, how many saw us and which posts worked. From Metricool; the apps report a day or two late.</p>
    </section>
    <div class="sc-bar w13-bar">
      <div class="sc-seg" role="group" aria-label="Window">
        ${[[7, '<span class="mk-lg">Last </span>7 days'], [30, '<span class="mk-lg">Last </span>30 days'], [90, '<span class="mk-lg">Last </span>90 days'], [365, 'This year'], [0, 'Custom']].map(([k, l]) =>
          `<button type="button" class="${socDays === k ? 'on' : ''}" onclick="socSetDays(${k})">${l}</button>`).join('')}
      </div>
      ${socDays === 0 ? `<div class="mk-dates" role="group" aria-label="Custom dates">
        <input type="date" aria-label="From" value="${mkEsc(socCustom.from)}" min="2025-01-01" max="${mkIso(new Date())}" onchange="socSetCustom('from', this.value)">
        <span>to</span>
        <input type="date" aria-label="To" value="${mkEsc(socCustom.to)}" min="2025-01-01" max="${mkIso(new Date())}" onchange="socSetCustom('to', this.value)">
      </div>` : ''}
    </div>
    ${stale ? `<p class="slv-muted" style="color:#b42318">Social numbers are paused${s && s.last_error ? ': ' + mkEsc(s.last_error) : ''}. Last good update: ${synced ? mkEsc(synced) : 'never'}.</p>` : ''}
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">@tararosesalon</div><h3>At a glance</h3></div>
        <p>${mkEsc(socDayY(w.from))} to ${mkEsc(socDayY(w.to))}</p>
      </div>
      <div class="soc-plats">
        ${card('instagram', 'Followers', fol('instagram') + kv([
          ['Gained, lost', `${socNum(t['instagram.followers_gained'])}, ${socNum(t['instagram.followers_lost'])}`],
          ['Views', socNum(t['instagram.views'])],
          ['People reached', socNum(t['instagram.reach'])],
          ['Profile visits', socNum(t['instagram.profile_views'])],
          ['Website taps', socNum(t['instagram.website_clicks'])],
          ['Posted', count(ig, [['post', 'post'], ['reel', 'reel']])],
          ['Likes, comments, shares', socNum(sum(ig, 'interactions'))],
        ]) + upTo('instagram'))}
        ${card('tiktok', 'Followers', fol('tiktok') + kv([
          ['Video views', socNum(t['tiktok.video_views'])],
          ['Profile visits', socNum(t['tiktok.profile_views'])],
          ['Posted', count(tt, [['video', 'video'], ['photo', 'photo post']])],
          ['Views a post', tt.length ? socNum(sum(tt, 'views') / tt.length) : '–'],
          ['Likes, comments, shares', socNum((t['tiktok.likes'] || 0) + (t['tiktok.comments'] || 0) + (t['tiktok.shares'] || 0))],
        ]) + upTo('tiktok'))}
        ${card('facebook', 'Page followers', fol('facebook') + kv([
          ['Followed, unfollowed', `${socNum(t['facebook.page_daily_follows_unique'])}, ${socNum(t['facebook.page_daily_unfollows_unique'])}`],
          ['Posted', count(fb, [['post', 'post'], ['reel', 'reel']])],
          ['Reel plays', socNum(sum(fb.filter(p => p.kind === 'reel'), 'views'))],
          ['Post views', socNum(sum(fb.filter(p => p.kind === 'post'), 'views'))],
          ['Likes, comments, shares', socNum(sum(fb, 'interactions'))],
        ]) + upTo('facebook'))}
      </div>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Views ${socMode() === 'week' ? 'week by week' : 'day by day'}</div>
        ${mkModePills('soc', socMode(), 'socRepaint')}
        <span class="soc-key">${Object.keys(SOC_NETS).map(k => `<span><i style="background:${cols[k]}"></i>${SOC_NETS[k]}</span>`).join('')}</span>
      </div>
      <div style="position:relative;height:280px"><canvas id="socCanvas"></canvas></div>
      <p class="slv-note">Instagram and TikTok are the account's views that day. Facebook has no daily page views, so its bars are its posts' and reels' views on the day they went out.</p>
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head">
        <div><div class="slv-eyebrow">What worked</div><h3>Top posts</h3></div>
        <div class="sc-seg" role="group" aria-label="Platform">
          ${[['all', 'All'], ...Object.entries(SOC_NETS)].map(([k, l]) => `<button type="button" class="${socNet === k ? 'on' : ''}" onclick="socSetNet('${k}')">${l}</button>`).join('')}
        </div>
      </div>
      ${list.length ? `<div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Post</th><th>Views</th><th>Reach</th><th>Likes, comments, shares</th><th class="soc-sm">Saves</th></tr></thead>
        <tbody>${postRows}</tbody></table></div>
      ${list.length > shown.length ? `<p style="margin:12px 0 0"><button type="button" class="sc-btn" onclick="socShowAll()">Show all ${list.length}</button></p>` : ''}
      <p class="slv-note">Posted in these dates, most viewed first. A post's numbers keep growing for a few weeks, and are re-read every night. Tap a caption to open the post.</p>`
      : '<p class="slv-muted">Nothing posted in these dates.</p>'}
    </section>
    <p class="slv-muted">From Metricool, updated nightly${synced ? ', last ' + mkEsc(synced) : ''}.${d.first_day ? ' Numbers start ' + mkEsc(socDayY(d.first_day)) + ', when the accounts were connected to Metricool.' : ''} Facebook Ads are left out for now; Google Ads has its own page.</p>`;
  socDraw();
}

const socMode = () => mkModeFor('soc', socData.win.from, socData.win.to);
function socRepaint() { if (socData) socPaint(document.getElementById('socialContent')); }
function socRedrawForTheme() {
  const v = document.getElementById('view-social');
  if (v && v.style.display !== 'none' && socData) socRepaint();
}

// Stacked bars, one colour a platform.
function socDraw() {
  const d = socData, w = d.win, by = {};
  const put = (date, k, v) => { (by[date] = by[date] || { date })[k] = (by[date][k] || 0) + (Number(v) || 0); };
  d.days.forEach(r => {
    if (r.network === 'instagram' && r.metric === 'views') put(r.date, 'instagram', r.value);
    if (r.network === 'tiktok' && r.metric === 'video_views') put(r.date, 'tiktok', r.value);
  });
  d.posts.forEach(p => { if (p.network === 'facebook' && p.post_date) put(p.post_date, 'facebook', p.views); });
  const rows = mkBuckets(Object.values(by), w.from, w.to, socMode(), Object.keys(SOC_NETS));
  if (socChart) socChart.destroy();
  const cv = document.getElementById('socCanvas');
  if (!cv || !window.Chart) return;
  const css = getComputedStyle(document.documentElement), muted = css.getPropertyValue('--muted').trim(), border = css.getPropertyValue('--border').trim();
  const cols = socCols(), daily = socMode() !== 'week';
  socChart = new Chart(cv, {
    type: 'bar',
    data: { labels: rows.map(r => r.label), datasets: Object.keys(SOC_NETS).map(k => ({
      label: SOC_NETS[k], data: rows.map(r => r[k]), backgroundColor: cols[k], stack: 'v',
      borderRadius: daily ? (rows.length <= 31 ? 3 : 1) : 4, maxBarThickness: 48 })) },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        title: items => rows[items[0].dataIndex].tip,
        label: c => `${c.dataset.label}: ${socNum(c.raw)}`,
        footer: items => 'All: ' + socNum(items.reduce((a, i) => a + (Number(i.raw) || 0), 0)),
      } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { stacked: true, beginAtZero: true, grid: { color: border }, border: { display: false },
          ticks: { color: muted, callback: v => v >= 1000 ? (v / 1000) + 'k' : v } },
      },
    },
  });
}
