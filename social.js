// Social (Kate, 6 Oct 2026), the third page of the Marketing group: Instagram, TikTok,
// the Facebook page and YouTube in one place, from Metricool. One call to social_report
// (migrations/create_metricool.sql) over the tables the metricool-sync edge function
// fills nightly. Level 3 and above, like Google Ads: index.html hides it below that
// and social_report refuses them too.
//
// Tabs (Kate, 6 Oct 2026: "whatever reporting Metricool has should show here too", but
// not crowded): Overview for the quick look (a card a platform, views by platform, top
// posts, and visits from social to the website from GA4), then one tab a platform with
// Metricool's report for it. In a platform tab the tiles and two charts are always open;
// posts, reels, stories, audience, best time, hashtags and competitors fold.
//
// The apps report late (TikTok about two days, Instagram one), so the last days of any
// window can be thin; the cards say up to which day each one has numbers. Audience and
// best time are Metricool's last-30-days snapshot, refreshed nightly, whatever the dates.
// Facebook has no daily page views in Metricool, so its views are its posts' and reels'
// on the day they went out. YouTube is the salon's channel, The Tara Rose Podcast; in
// Metricool it happens to be connected on the Bahrain brand (Kate, 6 Oct 2026), which the
// sync doesn't mind. If it is moved to another brand, clear the old brand's youtube rows
// in metricool_daily first, or the report counts both.
//
// Own window control (7, 30, 90 days, this year or custom dates), as google-ads.js,
// and the same card, tile and table styles (slv-*, w13-*, mk-*).
let socData = null, socCharts = {};
let socDays = 30, socNet = 'all', socAll = false, socTab = 'overview';
const socFold = {};                          // section id: true open / false closed; unset = its default
const socSort = {};                          // per table: { key, dir }
try { const v = localStorage.getItem('trs-soc-days'); if (v !== null && [7, 30, 90, 365, 0].includes(Number(v))) socDays = Number(v); } catch (e) {}
try { const v = localStorage.getItem('trs-soc-tab'); if (v) socTab = v; } catch (e) {}
let socCustom = { from: '', to: '' };
try { Object.assign(socCustom, JSON.parse(localStorage.getItem('trs-soc-custom') || '{}')); } catch (e) {}

const SOC_NETS = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube' };
if (!SOC_NETS[socTab] && socTab !== 'overview') socTab = 'overview';
const SOC_KIND = { post: 'post', reel: 'reel', video: 'video', photo: 'photo post', story: 'story' };
// What each platform's numbers are called in metricool_daily.
const SOC_PLAT = {
  instagram: { follow: 'followers', gained: 'followers_gained', lost: 'followers_lost', views: 'views', reach: 'reach', label: 'Followers',
    kinds: [['post', 'Posts'], ['reel', 'Reels'], ['story', 'Stories']], hashtags: true, competitors: true },
  tiktok: { follow: 'followers_count', delta: 'followers_delta_count', views: 'video_views', label: 'Followers',
    kinds: [['video', 'Videos'], ['photo', 'Photo posts']] },
  facebook: { follow: 'pageFollows', gained: 'page_daily_follows_unique', lost: 'page_daily_unfollows_unique', label: 'Page followers',
    kinds: [['post', 'Posts'], ['reel', 'Reels'], ['story', 'Stories']], competitors: true },
  youtube: { follow: 'totalSubscribers', gained: 'subscribersGained', lost: 'subscribersLost', views: 'views', label: 'Subscribers', kinds: [] },
};
// Platform colours, one set a theme (the charts are drawn in JS, so they read the theme at draw time).
const socDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
const socCols = () => socDark()
  ? { instagram: '#FF9B9B', tiktok: '#99F6E4', facebook: '#C4B5FD', youtube: '#EEF3C7' }   // YouTube butter: the pink was the selector's own colour
  : { instagram: '#C2416A', tiktok: '#1A1A1A', facebook: '#3B5BA9', youtube: '#C4302B' };
const socRgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const socNum = v => (v === null || v === undefined || !isFinite(v)) ? '–' : Math.round(Number(v) || 0).toLocaleString('en-GB');
const socPct = v => (v === null || v === undefined || !isFinite(v)) ? '–' : (Math.round(v * 10) / 10) + '%';
const socSigned = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('en-GB');
const socDayY = d => mkD(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const socMins = m => !isFinite(m) ? '–' : m >= 90 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
const socSum = (arr, f) => arr.reduce((a, p) => a + (Number(p[f]) || 0), 0);
let socRegion = null;
try { socRegion = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
const socCountry = k => { if (k === 'AE') return 'UAE'; if (k === 'GB') return 'UK'; if (k === 'US') return 'USA'; try { return /^[A-Z]{2}$/.test(k) && socRegion ? socRegion.of(k) : k; } catch (e) { return k; } };

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
function socSetTab(t) {
  socTab = t;
  try { localStorage.setItem('trs-soc-tab', t); } catch (e) {}
  socRepaint();
  const el = document.getElementById('socialContent');
  if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
}
function socSetNet(n) { socNet = n; socAll = false; socRepaint(); }
function socShowAll() { socAll = true; socRepaint(); }
function socToggle(id, open) { socFold[id] = open; }
function socSortBy(table, key) {
  const s = socSort[table] || {};
  socSort[table] = { key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' };
  socRepaint();
}

async function renderSocial() {
  const el = document.getElementById('socialContent');
  if (!el) return;
  const w = socWindow();
  el.innerHTML = '<p class="slv-muted">Loading Social…</p>';
  try {
    const { data, error } = await sb.rpc('social_report', { p_from: w.from, p_to: w.to });
    if (error || !data) throw error || new Error('no data');
    // series arrive compact ({"network|subject|metric": [[date, value], ...]}); unpack to rows.
    const days = [];
    Object.entries(data.series || {}).forEach(([k, arr]) => { const [network, subject, metric] = k.split('|');
      arr.forEach(([date, value]) => days.push({ date, network, subject, metric, value })); });
    socData = { ...data, days, win: w };
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="slv-muted">Social didn’t load. Refresh to try again.</p>';
    return;
  }
  socPaint(el);
}

// Adds up the window: per network and metric, totals, day maps and the last day with numbers.
function socTotals(d) {
  const t = {}, last = {}, byDay = {};
  d.days.forEach(r => {
    const k = r.network + '.' + r.metric, v = Number(r.value);
    t[k] = (t[k] || 0) + v;
    (byDay[k] = byDay[k] || {})[r.date] = v;
    if (!last[r.network] || r.date > last[r.network]) last[r.network] = r.date;
  });
  const posts = { instagram: [], tiktok: [], facebook: [], youtube: [] };
  d.posts.forEach(p => { (posts[p.network] = posts[p.network] || []).push(p); });
  return { t, last, byDay, posts };
}

function socFollowers(net) {
  const x = (socData.followers || {})[net];
  if (!x || x.end === null || x.end === undefined) return { end: null, chg: null };
  return { end: Number(x.end), chg: x.start !== null && x.start !== undefined ? Number(x.end) - Number(x.start) : null };
}
const socChg = c => c === null ? '' : ` <span class="svc-d ${c > 0 ? 'up' : c < 0 ? 'down' : ''}">${socSigned(c)}</span>`;

function socPaint(el) {
  Object.values(socCharts).forEach(c => c && c.destroy()); socCharts = {};
  const d = socData, w = d.win, cols = socCols();
  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const T = socTotals(d);
  el.innerHTML = `
    ${mkPeriodRow('soc', socDays, socCustom)}
    <section class="slv-intro">
      <h2>Social</h2>
      <p>Instagram, TikTok, the Facebook page and YouTube in one place. Overview for the quick look; each platform's tab has its full report, as in Metricool. The apps report a day or two late.</p>
    </section>
    <div class="sc-bar w13-bar soc-bar">
      <div class="sc-seg soc-tabs" role="tablist" aria-label="Report">
        ${[['overview', 'Overview'], ...Object.entries(SOC_NETS)].map(([k, l]) =>
          `<button type="button" role="tab" aria-selected="${socTab === k}" class="${socTab === k ? 'on' : ''}" onclick="socSetTab('${k}')">${k !== 'overview' ? `<i style="background:${cols[k]}"></i>` : ''}${l}</button>`).join('')}
      </div>
    </div>
    ${stale ? `<p class="slv-muted" style="color:#b42318">Social numbers are paused${s && s.last_error ? ': ' + mkEsc(s.last_error) : ''}. Last good update: ${synced ? mkEsc(synced) : 'never'}.</p>` : ''}
    ${socTab === 'overview' ? socOverviewHtml(T) : socPlatformHtml(socTab, T)}
    <p class="slv-muted">From Metricool, updated nightly${synced ? ', last ' + mkEsc(synced) : ''}. Numbers start when each account was connected to Metricool. Facebook Ads are left out for now; Google Ads has its own page.</p>`;
  if (socTab === 'overview') socDrawOverview(T); else socDrawPlatform(socTab, T);
}

// ── Overview ──────────────────────────────────────────────────────────────────────
function socOverviewHtml(T) {
  const d = socData, w = d.win, cols = socCols(), { t, last, posts } = T;
  const count = (arr, kinds) => kinds.map(([k, l]) => { const n = arr.filter(p => p.kind === k).length; return n ? `${n} ${l}${n === 1 ? '' : 's'}` : ''; }).filter(Boolean).join(', ') || 'none';
  // A line Metricool has no numbers for is left out, not shown as a dash.
  const kv = rows => `<div class="soc-kv">${rows.filter(([, v]) => v !== '–').map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>`;
  const upTo = net => last[net] ? `<div class="slv-note">Numbers up to ${mkDay(last[net])}</div>` : '';
  const card = (net, body) => { const f = socFollowers(net); return `<button type="button" class="w13-tile soc-plat" onclick="socSetTab('${net}')">
      <div class="soc-plat-top"><span><i style="background:${cols[net]}"></i>${SOC_NETS[net]}</span></div>
      <div class="slv-eyebrow">${SOC_PLAT[net].label}</div><div class="w13-val">${socNum(f.end)}${socChg(f.chg)}</div>${body}
      <div class="soc-plat-foot">${upTo(net)}<em>Full report ›</em></div></button>`; };
  const ig = posts.instagram.filter(p => p.kind !== 'story'), tt = posts.tiktok, fb = posts.facebook.filter(p => p.kind !== 'story');

  const nets = Object.keys(SOC_NETS).filter(n => d.posts.some(p => p.network === n && p.kind !== 'story'));
  if (socNet !== 'all' && !nets.includes(socNet)) socNet = 'all';
  const list = d.posts.filter(p => p.kind !== 'story' && (socNet === 'all' || p.network === socNet))
    .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
  const shown = socAll ? list : list.slice(0, 15);

  const web = d.web || {}, ch = {}; (web.channels || []).forEach(c => { ch[c.channel] = c; });
  const org = ch['Organic Social'] || { sessions: 0, engaged: 0 }, paid = ch['Paid Social'] || { sessions: 0, engaged: 0 };
  const social = Number(org.sessions) + Number(paid.sessions), total = Number(web.total) || 0;
  const stay = c => Number(c.sessions) ? 100 * Number(c.engaged) / Number(c.sessions) : null;

  return `
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">@tararosesalon</div><h3>At a glance</h3></div>
        <p>${mkEsc(socDayY(w.from))} to ${mkEsc(socDayY(w.to))}</p>
      </div>
      <div class="soc-plats">
        ${card('instagram', kv([
          ['Views', socNum(t['instagram.views'])],
          ['Reach (added up day by day)', socNum(t['instagram.reach'])],
          ['Posted', count(ig, [['post', 'post'], ['reel', 'reel']])],
        ]))}
        ${card('tiktok', kv([
          ['Video views', socNum(t['tiktok.video_views'])],
          ['Profile visits', socNum(t['tiktok.profile_views'])],
          ['Posted', count(tt, [['video', 'video'], ['photo', 'photo']])],
        ]))}
        ${card('facebook', kv([
          ['Reel plays', socNum(socSum(fb.filter(p => p.kind === 'reel'), 'views'))],
          ['Post views', socNum(socSum(fb.filter(p => p.kind === 'post'), 'views'))],
          ['Posted', count(fb, [['post', 'post'], ['reel', 'reel']])],
        ]))}
        ${card('youtube', kv([
          ['Views', socNum(t['youtube.views'])],
          ['Watch time', socMins(t['youtube.estimatedMinutesWatched'])],
          ['Likes', socNum(t['youtube.likes'])],
        ]))}
      </div>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Views ${socMode() === 'week' ? 'week by week' : 'day by day'}</div>
        ${mkModePills('soc', socMode(), 'socRepaint')}
        <span class="soc-key">${Object.keys(SOC_NETS).map(k => `<span><i style="background:${cols[k]}"></i>${SOC_NETS[k]}</span>`).join('')}</span>
      </div>
      <div style="position:relative;height:280px"><canvas id="socCanvas"></canvas></div>
      <p class="slv-note">Instagram, TikTok and YouTube are the account's views that day. Facebook has no daily page views, so its bars are its posts' and reels' views on the day they went out.</p>
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head">
        <div><div class="slv-eyebrow">Website · from Google Analytics</div><h3>From social to the website</h3></div>
        <p>Visits to tararosesalon.com that came from social</p>
      </div>
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">All website visits</div><div class="w13-val">${socNum(total)}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">From social</div><div class="w13-val">${socNum(social)}</div><div class="slv-note">${total ? socPct(100 * social / total) + ' of all visits' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">From our posts</div><div class="w13-val">${socNum(org.sessions)}</div><div class="slv-note">${stay(org) !== null ? socPct(stay(org)) + ' stayed and looked around' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">From paid social ads</div><div class="w13-val">${socNum(paid.sessions)}</div><div class="slv-note">${stay(paid) !== null ? socPct(stay(paid)) + ' stayed and looked around' : ''}</div></div>
      </div>
      <p class="slv-note">"Stayed and looked around" is Google's engaged visit: 10 seconds or more, a second page, or a booking. The full breakdown is on Website &amp; Search.</p>
    </section>
    <section class="slv-card" style="margin-top:14px">
      <div class="slv-head">
        <div><div class="slv-eyebrow">What worked</div><h3>Top posts</h3></div>
        ${nets.length > 1 ? `<div class="sc-seg" role="group" aria-label="Platform">
          ${[['all', 'All'], ...nets.map(n => [n, SOC_NETS[n]])].map(([k, l]) => `<button type="button" class="${socNet === k ? 'on' : ''}" onclick="socSetNet('${k}')">${l}</button>`).join('')}
        </div>` : ''}
      </div>
      ${list.length ? `<div class="slv-wrap"><table class="slv-table">
        <thead><tr><th>Post</th><th>Views</th><th>Reach</th><th>Likes, comments, shares</th><th class="soc-sm">Saves</th></tr></thead>
        <tbody>${shown.map(p => `<tr><td>${socPostCell(p, true)}</td><td>${socNum(p.views)}</td><td>${socNum(p.reach)}</td><td>${socNum(p.interactions)}</td><td class="soc-sm">${socNum(p.saves)}</td></tr>`).join('')}</tbody></table></div>
      ${list.length > shown.length ? `<p style="margin:12px 0 0"><button type="button" class="sc-btn" onclick="socShowAll()">Show all ${list.length}</button></p>` : ''}
      <p class="slv-note">Posted in these dates, most viewed first. A post's numbers keep growing for a few weeks, and are re-read every night. Tap a caption to open the post.</p>`
      : '<p class="slv-muted">Nothing posted in these dates.</p>'}
    </section>`;
}

function socPostCell(p, withNet) {
  const cols = socCols();
  const cap = String(p.caption || '').split('\n').map(x => x.trim()).find(Boolean) || (p.kind === 'story' ? 'Story' : '(no caption)');
  return `<div class="soc-post">
      ${p.image_url ? `<img src="${mkEsc(p.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div>${withNet ? `<span class="soc-pill" style="color:${cols[p.network]}">${SOC_NETS[p.network]} ${SOC_KIND[p.kind] || p.kind}</span> ` : ''}<span class="slv-note" style="display:inline">${mkDay(p.post_date)}</span>
      <div class="soc-cap">${p.url ? `<a href="${mkEsc(p.url)}" target="_blank" rel="noopener">${mkEsc(cap)}</a>` : mkEsc(cap)}</div></div></div>`;
}

function socDrawOverview(T) {
  const d = socData, w = d.win, by = {};
  const put = (date, k, v) => { (by[date] = by[date] || { date })[k] = (by[date][k] || 0) + (Number(v) || 0); };
  d.days.forEach(r => {
    if (r.network === 'instagram' && r.metric === 'views') put(r.date, 'instagram', r.value);
    if (r.network === 'tiktok' && r.metric === 'video_views') put(r.date, 'tiktok', r.value);
    if (r.network === 'youtube' && r.metric === 'views' && r.subject === 'account') put(r.date, 'youtube', r.value);
  });
  d.posts.forEach(p => { if (p.network === 'facebook' && p.kind !== 'story' && p.post_date) put(p.post_date, 'facebook', p.views); });
  const rows = mkBuckets(Object.values(by), w.from, w.to, socMode(), Object.keys(SOC_NETS));
  const cols = socCols();
  socCharts.overview = socBarChart(document.getElementById('socCanvas'), rows,
    Object.keys(SOC_NETS).map(k => ({ label: SOC_NETS[k], data: rows.map(r => r[k]), backgroundColor: cols[k], stack: 'v' })), true);
}

// ── One platform ──────────────────────────────────────────────────────────────────
function socPlatformHtml(net, T) {
  const d = socData, w = d.win, P = SOC_PLAT[net], { t, last, posts } = T, cols = socCols();
  const days = Math.max(1, (mkD(w.to) - mkD(w.from)) / 864e5 + 1);
  const all = posts[net] || [], feed = all.filter(p => p.kind !== 'story'), stories = all.filter(p => p.kind === 'story');
  const f = socFollowers(net);
  const eng = (arr, base) => { const b = socSum(arr, base); return b ? 100 * socSum(arr, 'interactions') / b : null; };
  const tile = (label, val, note) => `<div class="w13-tile"><div class="slv-eyebrow">${label}</div><div class="w13-val">${val}</div>${note ? `<div class="slv-note">${note}</div>` : ''}</div>`;
  const perDay = v => isFinite(v) && v ? socNum(v / days) + ' a day' : '';
  let tiles = '';
  if (net === 'instagram') tiles = tile(P.label, socNum(f.end) + socChg(f.chg)) +
    tile('Gained · lost', `${socNum(t['instagram.followers_gained'])} · ${socNum(t['instagram.followers_lost'])}`) +
    tile('Views', socNum(t['instagram.views']), perDay(t['instagram.views'])) +
    tile('Reach (added up day by day)', socNum(t['instagram.reach']), perDay(t['instagram.reach'])) +
    tile('Engagement', socPct(eng(feed, 'reach')), 'of people reached liked, commented, shared or saved');
  if (net === 'tiktok') tiles = tile(P.label, socNum(f.end) + socChg(f.chg)) +
    tile('Video views', socNum(t['tiktok.video_views']), perDay(t['tiktok.video_views'])) +
    tile('Profile visits', socNum(t['tiktok.profile_views'])) +
    tile('Likes · comments · shares', `${socNum(t['tiktok.likes'])} · ${socNum(t['tiktok.comments'])} · ${socNum(t['tiktok.shares'])}`) +
    tile('Engagement', socPct(eng(feed, 'views')), 'of views liked, commented or shared');
  if (net === 'facebook') tiles = tile(P.label, socNum(f.end) + socChg(f.chg)) +
    tile('Followed · unfollowed', `${socNum(t['facebook.page_daily_follows_unique'])} · ${socNum(t['facebook.page_daily_unfollows_unique'])}`) +
    tile('Post views', socNum(socSum(feed.filter(p => p.kind === 'post'), 'views'))) +
    tile('Reel plays', socNum(socSum(feed.filter(p => p.kind === 'reel'), 'views'))) +
    tile('Engagement', socPct(eng(feed.filter(p => p.kind === 'post'), 'reach')), 'of people reached by posts reacted, commented or shared');
  if (net === 'youtube') tiles = tile(P.label, socNum(f.end) + socChg(f.chg)) +
    tile('Gained · lost', `${socNum(t['youtube.subscribersGained'])} · ${socNum(t['youtube.subscribersLost'])}`) +
    tile('Views', socNum(t['youtube.views']), perDay(t['youtube.views'])) +
    tile('Watch time', socMins(t['youtube.estimatedMinutesWatched'])) +
    tile('Likes · comments', `${socNum(t['youtube.likes'])} · ${socNum(t['youtube.comments'])}`);

  const viewsNote = net === 'facebook' ? "Facebook has no daily page views: these are posts' and reels' views on the day they went out."
    : net === 'instagram' ? 'Views every day, with the people they reached as the line.' : '';
  const sections = [];
  for (const [kind, title] of P.kinds) {
    if (kind === 'story') {
      const st = (d.stories || {})[net];
      if (st && st.n) sections.push(socSection(net + '-story', 'Stories', `${socNum(st.n)} stories · ${socNum(st.reach / st.n)} people each on average`, socStoriesHtml(st, days), !sections.length));
      continue;
    }
    const arr = all.filter(p => p.kind === kind);
    if (!arr.length) continue;
    else sections.push(socSection(net + '-' + kind, title, `${arr.length} · ${socNum(socSum(arr, 'views'))} views${kind === 'reel' || kind === 'video' ? ` · ${socNum(socSum(arr, 'shares'))} shares` : ''}`, socPostsTable(net + '-' + kind, net, kind, arr), !sections.length));
  }
  if (!P.kinds.length) sections.push(socSection(net + '-videos', 'Videos', 'Not in Metricool’s API',
    '<p class="slv-muted" style="margin:0">Metricool doesn’t hand out the YouTube video list through its API, only the channel’s numbers above. The videos are in Metricool itself.</p>'));
  const aud = socAudienceHtml(net);
  if (aud) sections.push(socSection(net + '-aud', 'Audience', aud.summary, aud.html));
  const bt = socBestTimeHtml(net);
  if (bt) sections.push(socSection(net + '-best', 'Best time to post', bt.summary, bt.html));
  if (P.hashtags) { const h = socHashtagsHtml(feed); if (h) sections.push(socSection(net + '-tags', 'Hashtags', h.summary, h.html)); }
  if (P.competitors) sections.push(socSection(net + '-comp', 'Competitors', 'None set up yet',
    '<p class="slv-muted" style="margin:0">No competitors are set up in Metricool. Add the salons we watch there (Analytics › Competitors) and they show here side by side: followers, posts and engagement.</p>'));

  return `
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow"><i class="soc-dot" style="background:${cols[net]}"></i>${SOC_NETS[net]}${net === 'youtube' ? ' · The Tara Rose Podcast' : ' · @tararosesalon'}</div><h3>${SOC_NETS[net]} report</h3></div>
        <p>${mkEsc(socDayY(w.from))} to ${mkEsc(socDayY(w.to))}${last[net] ? ` · numbers up to ${mkDay(last[net])}` : ''}</p>
      </div>
      <div class="w13-tiles soc-tiles">${tiles}</div>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">${P.label} ${socMode() === 'week' ? 'week by week' : 'day by day'}</div>
        ${mkModePills('soc', socMode(), 'socRepaint')}
        <span class="soc-key"><span><i style="background:var(--good)"></i>${net === 'tiktok' ? 'Up' : 'Gained'}</span><span><i style="background:var(--bad)"></i>${net === 'tiktok' ? 'Down' : 'Lost'}</span><span><i style="background:var(--text)"></i>Total</span></span>
      </div>
      <div style="position:relative;height:240px"><canvas id="socFollow"></canvas></div>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Views ${socMode() === 'week' ? 'week by week' : 'day by day'}</div>
        ${net === 'instagram' ? `<span class="soc-key"><span><i style="background:${cols[net]}"></i>Views</span><span><i style="background:${socRgba(socCols().instagram, .45)}"></i>Reach</span></span>` : ''}
      </div>
      <div style="position:relative;height:240px"><canvas id="socViews"></canvas></div>
      ${viewsNote ? `<p class="slv-note">${viewsNote}</p>` : ''}
    </section>
    <section class="slv-card soc-secs" style="margin-top:14px">${sections.join('')}</section>`;
}

// Folded sections: the first one (the platform's posts) opens by default, the rest closed,
// and each remembers what it was set to while the page is open.
function socSection(id, title, summary, body, first) {
  const open = socFold[id] === undefined ? !!first : socFold[id];
  return `<details class="soc-sec"${open ? ' open' : ''} ontoggle="socToggle('${id}', this.open)">
    <summary><span class="soc-sec-t">${title}</span><span class="soc-sec-s">${summary}</span></summary>
    <div class="soc-sec-b">${body}</div></details>`;
}

function socPostsTable(id, net, kind, arr) {
  const cols = [['views', 'Views'], ['reach', 'Reach'], ['likes', net === 'facebook' ? 'Reactions' : 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves']]
    .filter(([k]) => arr.some(p => p[k] !== null && p[k] !== undefined));
  const extra = [];
  if (kind === 'reel' && net === 'instagram') extra.push(['avg_watch', 'Avg watch', v => v ? (Math.round(v * 10) / 10) + 's' : '–']);
  if (net === 'tiktok') extra.push(['avg_watch', 'Avg watch', v => v ? (Math.round(v * 10) / 10) + 's' : '–'], ['full_watch', 'Watched to the end', v => v !== null && v !== undefined ? socPct(100 * v) : '–']);
  const s = socSort[id] || { key: 'views', dir: 'desc' };
  const val = (p, k) => extra.some(([e]) => e === k) ? Number((p.extra || {})[k]) || 0 : Number(p[k]) || 0;
  const rows = [...arr].sort((a, b) => s.key === 'date' ? (a.posted_at < b.posted_at ? -1 : 1) * (s.dir === 'asc' ? 1 : -1) : (val(a, s.key) - val(b, s.key)) * (s.dir === 'asc' ? 1 : -1));
  const th = (k, l, cls = '') => `<th class="soc-th${cls}${s.key === k ? ' on' : ''}" onclick="socSortBy('${id}','${k}')">${l}${s.key === k ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`;
  return `<div class="slv-wrap"><table class="slv-table">
    <thead><tr>${th('date', kind === 'reel' ? 'Reel' : kind === 'video' ? 'Video' : 'Post')}${cols.map(([k, l], i) => th(k, l, i > 2 ? ' soc-sm' : '')).join('')}${extra.map(([k, l]) => th(k, l, ' soc-sm')).join('')}</tr></thead>
    <tbody>${rows.map(p => `<tr><td>${socPostCell(p, false)}</td>${cols.map(([k], i) => `<td${i > 2 ? ' class="soc-sm"' : ''}>${socNum(p[k])}</td>`).join('')}${extra.map(([k, , fmt]) => `<td class="soc-sm">${fmt((p.extra || {})[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="slv-note">Tap a heading to sort. Tap a caption to open the post.</p>`;
}

// st: social_report's story totals for one platform, with its 20 most seen.
function socStoriesHtml(st, days) {
  const fwd = Number(st.taps_forward) || 0, exits = Number(st.exits) || 0, back = Number(st.taps_back) || 0, replies = Number(st.replies) || 0;
  const top = (st.top || []).map(p => ({ ...p, kind: 'story' }));
  return `<div class="w13-tiles soc-tiles">
      <div class="w13-tile"><div class="slv-eyebrow">Stories</div><div class="w13-val">${socNum(st.n)}</div><div class="slv-note">${socNum(st.n / days)} a day</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Reached each</div><div class="w13-val">${socNum(st.reach / st.n)}</div><div class="slv-note">on average</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Tapped forward</div><div class="w13-val">${socNum(fwd)}</div><div class="slv-note">skipped to the next</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Left stories</div><div class="w13-val">${socNum(exits)}</div><div class="slv-note">swiped away</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Replies</div><div class="w13-val">${socNum(replies)}</div><div class="slv-note">${socNum(back)} tapped back</div></div>
    </div>
    <div class="slv-wrap" style="margin-top:12px"><table class="slv-table">
      <thead><tr><th>Most seen stories</th><th>Reached</th><th>Tapped forward</th><th class="soc-sm">Left</th><th class="soc-sm">Replies</th></tr></thead>
      <tbody>${top.map(p => `<tr><td>${socPostCell(p, false)}</td><td>${socNum(p.reach)}</td><td>${socNum((p.extra || {}).taps_forward)}</td><td class="soc-sm">${socNum((p.extra || {}).exits)}</td><td class="soc-sm">${socNum((p.extra || {}).replies)}</td></tr>`).join('')}</tbody></table></div>`;
}

// Audience and best time: {network: {kind: {to, v: {key: value}}}} from social_report.
function socSnap(net, kind) { const k = ((socData.snapshots || {})[net] || {})[kind]; return k ? Object.entries(k.v || {}).map(([key, value]) => ({ key, value: Number(value), to: k.to })) : []; }
function socBars(rows, col) {
  const mx = Math.max(...rows.map(r => r[1]), 1);
  return rows.map(([k, v]) => `<div class="soc-hrow"><span>${mkEsc(k)}</span><span class="soc-hb"><b style="width:${100 * v / mx}%;background:${col}"></b></span><span class="soc-hn">${socPct(v)}</span></div>`).join('');
}
function socAudienceHtml(net) {
  const col = socCols()[net], AGE = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const age = socSnap(net, 'age').sort((a, b) => AGE.indexOf(a.key) - AGE.indexOf(b.key)).map(s => [s.key === '65+' ? '65 and over' : s.key.replace('-', ' to '), Number(s.value)]);
  const gName = { F: 'Women', M: 'Men', U: 'Not known' };
  const gender = socSnap(net, 'gender').filter(s => Number(s.value) > 0).sort((a, b) => b.value - a.value).map(s => [gName[s.key] || s.key, Number(s.value)]);
  const top = (kind, name) => socSnap(net, kind).filter(s => s.key !== 'OTHERS').sort((a, b) => b.value - a.value).slice(0, 8).map(s => [name(s.key), Number(s.value)]);
  const country = top(net === 'facebook' ? 'followersByCountry' : 'country', socCountry);
  const city = top(net === 'facebook' ? 'followersByCity' : 'city', k => k.split(',')[0].trim());
  if (!age.length && !gender.length && !country.length && !city.length) return null;
  const snap = [...age.length ? socSnap(net, 'age') : [], ...socSnap(net, 'gender'), ...socSnap(net, 'country'), ...socSnap(net, 'followersByCountry')][0];
  const block = (title, rows) => rows.length ? `<div class="slv-eyebrow" style="margin:14px 0 6px">${title}</div>${socBars(rows, col)}` : '';
  const ageTop = [...age].sort((a, b) => b[1] - a[1])[0];
  const summary = [ageTop ? `Mostly ${ageTop[0]}` : '', country[0] ? `${country[0][0]} first` : '', city[0] ? `${city[0][0]} the top city` : ''].filter(Boolean).join(', ');
  const gU = gender.find(g => g[0] === 'Not known');
  return { summary, html: `<div class="soc-two">
      <div>${block('Age', age)}${block('Gender', gender)}${gU && gU[1] > 30 ? `<p class="slv-note">${SOC_NETS[net]} doesn’t know the gender of ${socPct(gU[1])} of followers.</p>` : ''}</div>
      <div>${block('Top countries', country)}${block('Top cities', city)}</div></div>
    <p class="slv-note">${net === 'facebook' ? 'Page followers' : 'Followers'}, as of the last 30 days${snap && snap.to ? ` to ${mkDay(snap.to)}` : ''}; it doesn’t change with the dates above.</p>` };
}
function socBestTimeHtml(net) {
  const rows = socSnap(net, 'besttime');
  if (!rows.length) return null;
  const v = {}; rows.forEach(r => { v[r.key] = Number(r.value); });
  const vals = Object.values(v), lo = Math.min(...vals), hi = Math.max(...vals), col = socCols()[net];
  const hr = h => h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p';
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let best = null;
  Object.entries(v).forEach(([k, x]) => { if (!best || x > best[1]) best = [k, x]; });
  // Hours whose average across the week is within 5% of the best hour: the "window".
  const byHour = Array.from({ length: 24 }, (_, h) => DAYS.reduce((a, _, d) => a + (v[`${d + 1}-${h}`] || 0), 0) / 7);
  const top = Math.max(...byHour), win = byHour.map((x, h) => x >= top * .95 ? h : -1).filter(h => h >= 0);
  let html = '<div class="soc-heat"><div></div>';
  for (let h = 0; h < 24; h++) html += `<div class="soc-heat-h">${h % 3 === 0 ? hr(h) : ''}</div>`;
  DAYS.forEach((dn, d) => {
    html += `<div class="soc-heat-d">${dn}</div>`;
    for (let h = 0; h < 24; h++) { const x = v[`${d + 1}-${h}`] || 0, a = hi > lo ? .06 + .94 * Math.pow((x - lo) / (hi - lo), 2) : .3;
      html += `<div class="soc-heat-c" title="${dn} ${hr(h)} · ${socNum(x)}" style="background:${socRgba(col, a.toFixed(2))}"></div>`; }
  });
  html += '</div>';
  const summary = win.length ? `${hr(win[0])} to ${hr((win[win.length - 1] + 1) % 24)}, most days` : '';
  return { summary, html: html + `<p class="slv-note">When followers are online, by day and hour, Dubai time; darker is more. Metricool’s last 30 days.</p>` };
}
function socHashtagsHtml(feed) {
  const by = {};
  feed.forEach(p => {
    // social_report reads the tags off the full caption (the caption it sends is cut to 300 characters).
    const tags = new Set(p.tags || (String(p.caption || '').toLowerCase().match(/#[\p{L}\p{N}_]+/gu) || []));
    tags.forEach(t => { const o = by[t] = by[t] || { n: 0, views: 0, inter: 0 }; o.n++; o.views += Number(p.views) || 0; o.inter += Number(p.interactions) || 0; });
  });
  const rows = Object.entries(by).sort((a, b) => b[1].views - a[1].views).slice(0, 15);
  if (!rows.length) return null;
  return { summary: 'Top: ' + rows.slice(0, 3).map(r => r[0]).join(', '),
    html: `<div class="slv-wrap"><table class="slv-table"><thead><tr><th>Hashtag</th><th>Posts</th><th>Views</th><th class="soc-sm">Likes, comments, shares</th></tr></thead>
      <tbody>${rows.map(([t, o]) => `<tr><td>${mkEsc(t)}</td><td>${o.n}</td><td>${socNum(o.views)}</td><td class="soc-sm">${socNum(o.inter)}</td></tr>`).join('')}</tbody></table></div>
      <p class="slv-note">From the captions of posts and reels in these dates; views are those posts' views added up.</p>` };
}

function socDrawPlatform(net) {
  const d = socData, w = d.win, P = SOC_PLAT[net], cols = socCols(), mode = socMode();
  const day = {}, lvl = {};
  const put = (date, k, v) => { (day[date] = day[date] || { date })[k] = (day[date][k] || 0) + (Number(v) || 0); };
  d.days.forEach(r => {
    if (r.network !== net) return;
    if (net === 'youtube' && r.subject === 'all' && r.metric === 'views') return;
    if (r.metric === P.gained) put(r.date, 'gained', r.value);
    if (r.metric === P.lost) put(r.date, 'lost', -Number(r.value));
    if (r.metric === P.delta) { put(r.date, Number(r.value) >= 0 ? 'gained' : 'lost', r.value); }
    if (r.metric === P.views) put(r.date, 'views', r.value);
    if (r.metric === P.reach) put(r.date, 'reach', r.value);
  });
  // Total line: the follower count itself (a level) at the end of each day or week; where
  // a day has none yet, the last one before it.
  const f = socFollowers(net);
  d.days.forEach(r => { if (r.network === net && r.metric === P.follow) lvl[r.date] = Number(r.value); });
  if (net === 'facebook') d.posts.forEach(p => { if (p.network === 'facebook' && p.kind !== 'story' && p.post_date) put(p.post_date, 'views', p.views); });
  const rows = mkBuckets(Object.values(day), w.from, w.to, mode, ['gained', 'lost', 'views', 'reach']);
  const lvDates = Object.keys(lvl).sort();
  rows.forEach(r => { let v = null; for (const k of lvDates) { if (k <= r.to) v = lvl[k]; else break; } r.total = v; });
  const css = getComputedStyle(document.documentElement);
  socCharts.follow = socBarChart(document.getElementById('socFollow'), rows, [
    { label: net === 'tiktok' ? 'Up' : 'Gained', data: rows.map(r => r.gained), backgroundColor: css.getPropertyValue('--good').trim(), stack: 'f' },
    { label: net === 'tiktok' ? 'Down' : 'Lost', data: rows.map(r => r.lost), backgroundColor: css.getPropertyValue('--bad').trim(), stack: 'f' },
    { type: 'line', label: 'Total', data: rows.map(r => r.total ?? null), borderColor: css.getPropertyValue('--text').trim(), backgroundColor: css.getPropertyValue('--text').trim(),
      borderWidth: 2, pointRadius: 0, tension: .3, yAxisID: 'y1' },
  ], true, true);
  socCharts.views = socBarChart(document.getElementById('socViews'), rows, [
    { label: 'Views', data: rows.map(r => r.views), backgroundColor: cols[net] },
    ...(P.reach ? [{ type: 'line', label: 'Reach (added up day by day)', data: rows.map(r => r.reach), borderColor: socRgba(cols[net], .55), backgroundColor: socRgba(cols[net], .55), borderWidth: 2, pointRadius: 0, tension: .3 }] : []),
  ], false);
}

const socMode = () => mkModeFor('soc', socData.win.from, socData.win.to);
function socRepaint() { if (socData) socPaint(document.getElementById('socialContent')); }
function socRedrawForTheme() {
  const v = document.getElementById('view-social');
  if (v && v.style.display !== 'none' && socData) socRepaint();
}

// Bar chart in the page's style; stacked bars, an optional line on its own right axis.
function socBarChart(cv, rows, datasets, stacked, rightAxis) {
  if (!cv || !window.Chart) return null;
  const css = getComputedStyle(document.documentElement), muted = css.getPropertyValue('--muted').trim(), border = css.getPropertyValue('--border').trim();
  const daily = rows.length && rows[0].week === undefined;
  return new Chart(cv, {
    type: 'bar',
    data: { labels: rows.map(r => r.label), datasets: datasets.map(ds => ds.type === 'line' ? { order: 0, spanGaps: true, ...ds }
      : { order: 1, borderRadius: daily ? (rows.length <= 31 ? 3 : 1) : 4, maxBarThickness: 48, ...ds }) },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        title: items => rows[items[0].dataIndex].tip,
        label: c => `${c.dataset.label}: ${c.raw === null ? '–' : socNum(Math.abs(c.raw))}`,
        ...(stacked && !rightAxis ? { footer: items => 'All: ' + socNum(items.reduce((a, i) => a + (Number(i.raw) || 0), 0)) } : {}),
      } } },
      scales: {
        x: { stacked: !!stacked, grid: { display: false }, ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { stacked: !!stacked, beginAtZero: true, grid: { color: border }, border: { display: false },
          ticks: { color: muted, callback: v => Math.abs(v) >= 1000 ? (v / 1000) + 'k' : v } },
        ...(rightAxis ? { y1: { position: 'right', beginAtZero: false, grace: '10%', grid: { display: false }, border: { display: false }, ticks: { color: muted, callback: v => Math.abs(v) >= 1000 ? (Math.round(v / 100) / 10) + 'k' : v } } } : {}),
      },
    },
  });
}
