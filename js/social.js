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
// The Period comes from the masthead (dateFrom and dateTo), as Marketing Spend does (Kate, 23 Nov 2026: "bat walang global sticky header filter"), so there is no Period row of its own,
// and the same card, tile and table styles (slv-*, w13-*, mk-*).
let socData = null, socCharts = {};
let socNet = 'all', socTab = 'overview';
// Two sets of accounts (Kate, 23 Nov 2026): 'UAE' is the group's own (@tararosesalon, its Facebook page, TikTok and the podcast's YouTube), 'BAH' is Bahrain's own Instagram and Facebook.
let socBranch = 'UAE';
try { if (localStorage.getItem('trs-soc-branch') === 'BAH') socBranch = 'BAH'; } catch (e) {}
const socFold = {};                          // section id: true open / false closed; unset = its default
const socSort = {};                          // per table: { key, dir }
try { const v = localStorage.getItem('trs-soc-tab'); if (v) socTab = v; } catch (e) {}

// The apps' own marks (Kate, 23 Nov 2026: "use real ig/tk/yt/fb logos in social"), the same paths the Content Calendar's badges use (smm_board_approvals calendar.js SCAL_ICO).
// Drawn in currentColor, so a caller sets the colour: the platform colour on a plain background, white or dark on a platform-coloured tile.
const SOC_ICO = {
  instagram: '<path fill="none" stroke="currentColor" stroke-width="2.2" d="M8.2 3h7.6A5.2 5.2 0 0 1 21 8.2v7.6a5.2 5.2 0 0 1-5.2 5.2H8.2A5.2 5.2 0 0 1 3 15.8V8.2A5.2 5.2 0 0 1 8.2 3z"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17.4" cy="6.6" r="1.35" fill="currentColor"/>',
  facebook: '<path fill="currentColor" d="M13.5 21.5v-8.3h2.8l.5-3.3h-3.3V7.8c0-.9.4-1.7 1.8-1.7h1.6V3.3c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.5H7.4v3.3h2.8v8.3h3.3z"/>',
  tiktok: '<path fill="currentColor" d="M12.5.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
  youtube: '<path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/>'
};
const socLogo = (net, color) => SOC_ICO[net] ? `<span class="soc-lg"${color ? ` style="color:${color}"` : ''} aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${SOC_ICO[net]}</svg></span>` : '';
// Instagram and Facebook sit next to each other (Kate, 23 Nov 2026): the tab row, the cards, the key and the stacked bars all follow this order.
const SOC_NETS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };
// Kate, 23 Nov 2026: Calendar is no longer a tab drawn here; it opens the Content Calendar page (index.html calTabsDraw), so a remembered 'calendar' falls back to Overview.
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
// Reach is the line over the Views bars, in the brand turquoise (Kate, 23 Nov 2026: "views vs reach isnt very clear, make it blue for reach, combo graph", then "not this blue, brand blue natin"):
// the same mint as Gained and --good in the dark theme (#99F6E4), its deep teal in the light theme (#0F6E56).
const socReachColour = () => (socDark() ? '#99F6E4' : '#0F6E56');
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

const socIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The masthead Period as { from, to }. All time starts when Metricool did (Jan 2025). Before the dashboard knows its window: the last 30 days.
function socWindow() {
  try {
    if (typeof activePeriodKey === 'function' && activePeriodKey() === 'All time') return { from: '2025-01-01', to: socIso(new Date()) };
    if (typeof dateFrom !== 'undefined' && dateFrom && dateTo) return { from: socIso(dateFrom), to: socIso(dateTo) };
  } catch (e) {}
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const to = new Date(t); to.setDate(t.getDate() - 1);
  const from = new Date(to); from.setDate(to.getDate() - 29);
  return { from: socIso(from), to: socIso(to) };
}
// A Period change in the masthead (dashboard.js NOPULSE_REDRAW): load the new dates, or redraw when they are the dates already on screen.
function socMastRefresh() {
  const w = socWindow();
  if (socData && socData.win && socData.win.from === w.from && socData.win.to === w.to && socData.branch === socBranch) { socRepaint(); return Promise.resolve(); }
  return renderSocial();
}
function socSetTab(t) {
  if (t === 'calendar') { showView('contentcalendar', document.querySelector("#sidebar .nav-sub[onclick*=\"showView('social'\"]")); return; }
  socTab = t;
  try { localStorage.setItem('trs-soc-tab', t); } catch (e) {}
  socRepaint();
  const el = document.getElementById('socialContent');
  if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
}
function socSetNet(n) { socNet = n; if (socTbls.soctop) socTbls.soctop.clear(); socRepaint(); }

// ── UAE | Bahrain (Kate, 23 Nov 2026) ──
// social_report, the story stats and the stories list all take the same p_branch, so the Bahrain view never holds the UAE account's numbers. Metricool is not per salon,
// so the masthead's Branch row stays hidden here; this switch is the only branch control. Bahrain has no TikTok and no YouTube of its own, and the Calendar is the UAE account's.
const socBr = () => (socBranch === 'BAH' ? { p_branch: 'BAH' } : {});
function socNetsOn() {
  const all = Object.keys(SOC_NETS);
  if (socBranch !== 'BAH' || !socData) return all;
  const d = socData;
  return all.filter(n => (d.days || []).some(r => r.network === n) || (d.posts || []).some(p => p.network === n) || ((d.followers || {})[n]));
}
function socBranchSeg() {
  return `<div class="sc-seg soc-br" role="group" aria-label="Accounts">${[['UAE', 'UAE'], ['BAH', 'Bahrain']].map(([k, l]) =>
    `<button type="button" class="${socBranch === k ? 'on' : ''}" aria-pressed="${socBranch === k}" onclick="socSetBranch('${k}')">${l}</button>`).join('')}</div>`;
}
function socSetBranch(b) {
  if (b === socBranch) return;
  socBranch = b;
  try { localStorage.setItem('trs-soc-branch', b); } catch (e) {}
  socData = null; socNet = 'all';
  if (typeof sgData !== 'undefined') sgData = null;
  if (socTab === 'calendar') socTab = 'overview';
  renderSocial();
}

// ── Every table on Social is the shared Google Sheets table (js/sheet-table.js), Kate 23 Nov 2026 ──
// Top posts, each platform's Reels / Posts / Videos, Stories and Hashtags: every heading has Sort, Filter by condition and Filter by values,
// 10 rows with pages (Rows 10, 20, 50, 100), Clear filters, and on a phone a card per row with a Sort and filter button.
const socTbls = {}, socDefs = {};
let socTblFor = null;
const socCap1 = p => String(p.caption || '').split('\n').map(x => x.trim()).find(Boolean) || (p.kind === 'story' ? 'Story' : '(no caption)');
const socNumCol = (k, l, get) => { const v = p => (get ? get(p) : p[k]); return { k, l, t: 'num', raw: p => Number(v(p)) || 0, disp: p => socNum(v(p)), cell: p => socNum(v(p)) }; };
const socPostCol = (l, withNet) => ({ k: 'post', l, t: 'txt', raw: p => socCap1(p), disp: p => socCap1(p), cell: p => socPostCell(p, withNet) });
// The markup for one table: toolbar, the table, the pager. cfg = { rows, cols, unit }; socTblMount draws it once the page is in the document.
function socTblHtml(id, cfg) {
  socDefs[id] = cfg;
  return `<div class="soc-tbar"><button type="button" class="cm-pill soc-phone" data-sxcm="${id}" aria-label="Sort and filter">Sort and filter</button><span class="soc-sp"></span><button type="button" class="cm-pill" id="socC-${id}" hidden onclick="socTblClear('${id}')">Clear filters</button></div>
    <div class="slv-wrap"><table id="socT-${id}"></table></div>
    <div class="soc-pager"><span id="socTx-${id}"></span><span class="soc-sp"></span><span class="slv-eyebrow">Rows</span><select id="socTs-${id}" aria-label="Rows to show" onchange="socTblPick('${id}', +this.value)"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
      <button type="button" class="cm-pill" id="socTp-${id}" onclick="socTblPage('${id}', -1)">‹ Previous</button><span class="soc-pgn" id="socTn-${id}"></span><button type="button" class="cm-pill" id="socTq-${id}" onclick="socTblPage('${id}', 1)">Next ›</button></div>`;
}
function socTblMount() {
  if (!window.TRSheet) return;
  if (socTblFor !== socData) { socTblFor = socData; Object.values(socTbls).forEach(t => t.clear()); }   // new data (new dates), so the old heading filters go
  Object.keys(socDefs).forEach(id => {
    if (!document.getElementById('socT-' + id)) return;
    const d = socDefs[id], sig = d.cols.map(c => c.k).join();
    let T = socTbls[id];
    if (!T || T.sig !== sig) {
      T = socTbls[id] = TRSheet.table({ id, el: '#socT-' + id, rows: () => socDefs[id].rows, limit: 10, cols: d.cols,
        after: (T, rows) => {
          const g = k => document.getElementById('soc' + k + '-' + id), c = g('C');
          if (c) c.hidden = !T.active();
          const pages = T.pages(rows.length), from = rows.length ? T.page * T.shown + 1 : 0, to = Math.min(rows.length, (T.page + 1) * T.shown);
          if (g('Tx')) g('Tx').textContent = from + ' to ' + to + ' of ' + rows.length + ' ' + (socDefs[id].unit || 'rows');
          if (g('Tp')) g('Tp').disabled = T.page <= 0;
          if (g('Tq')) g('Tq').disabled = T.page >= pages - 1;
          if (g('Tn')) g('Tn').textContent = 'Page ' + (T.page + 1) + ' of ' + pages;
          if (g('Ts') && +g('Ts').value !== T.shown) g('Ts').value = String(T.shown);
        } });
      T.sig = sig;
    }
    T.draw();
  });
}
function socTblPick(id, n) { const T = socTbls[id]; if (!T) return; T.shown = n; T.page = 0; T.draw(); }
function socTblPage(id, d) { const T = socTbls[id]; if (!T) return; T.page += d; T.draw(); }
function socTblClear(id) { const T = socTbls[id]; if (!T) return; T.clear(); T.draw(); }
function socToggle(id, open) { socFold[id] = open; if (open && socTbls[id]) socTbls[id].draw(); }   // a table drawn inside a closed section has no width yet: draw it again on opening
function socSortBy(table, key) {
  const s = socSort[table] || {};
  socSort[table] = { key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' };
  socRepaint();
}

// ── ON THIS PAGE rail (Kate, 23 Nov 2026: the mini side nav every page carries; the same shell as Website & Search and Google Ads) ────
// Overview only: the platform tabs and the Calendar are one report each. Gutter above 1100px, a row of chips below it.
// A third item is what the entry does instead of jumping down the page: Calendar (Kate, 23 Nov 2026: "calendar is supposed to appear sa mini side bar navi") opens the Calendar tab, so it is always listed.
const SOC_RAIL = [['sgRoot', 'Overview'], ['soc-glance', 'At a glance'], ['soc-web', 'From social to the website'], ['soc-top', 'Top posts'], ['soc-calendar', 'Calendar', "socSetTab('calendar');return false;"]];
// A platform tab (Instagram, TikTok, Facebook, YouTube) lists its own parts (Kate, 23 Nov 2026: "bakit wala nang sidebar navi pag ig/fb/tk/yt tabs na"):
// Overview and Calendar open those tabs, the report card and each folded section (Reels, Posts, Audience, Best time, Hashtags...) jump down the page and open it first.
function socRailList() {
  if (socTab === 'overview') return SOC_RAIL.filter(r => socBranch !== 'BAH' || r[0] !== 'soc-calendar');
  const secs = [...document.querySelectorAll('#socialContent details.soc-sec[id]')].map(d => { const t = d.querySelector('.soc-sec-t'); return [d.id, t ? t.textContent.trim() : '']; }).filter(r => r[1]);
  return [['sgRoot', 'Overview', "socSetTab('overview');return false;"], ['soc-plat', SOC_NETS[socTab] + ' report'], ...secs, ...(socBranch === 'BAH' ? [] : [['soc-calendar', 'Calendar', "socSetTab('calendar');return false;"]])];
}
function socRail(on) {
  const shell = document.getElementById('scShell'), side = document.getElementById('scSide');
  if (!shell || !side) return;
  shell.classList.toggle('rv-norail', !on);
  const nav = side.querySelector('.side-nav');
  if (nav && on) {
    const live = socRailList().filter(r => r[2] || document.getElementById(r[0])), sig = socTab + ':' + live.map(r => r[0] + r[1]).join();
    if (nav.dataset.sig !== sig) {
      nav.dataset.sig = sig;
      nav.innerHTML = '<div class="side-k">On this page</div>' + live.map(r => `<a href="#${r[0]}" onclick="${r[2] || `lgJump(event,'${r[0]}')`}">${r[1]}</a>`).join('');
    }
  }
  if (typeof spy === 'function') spy();
}

async function renderSocial() {
  const el = document.getElementById('socialContent');
  if (!el) return;
  socRail(false);
  el.innerHTML = '<p class="slv-muted">Loading Social…</p>';
  // The Period is only known once the dashboard has worked out its window (a direct link can open this page first).
  try { if (window.trsWindowReady) await window.trsWindowReady; } catch (e) {}
  const w = socWindow();
  try {
    const { data, error } = await sb.rpc('social_report', { p_from: w.from, p_to: w.to, ...socBr() });
    if (error || !data) throw error || new Error('no data');
    // series arrive compact ({"network|subject|metric": [[date, value], ...]}); unpack to rows.
    const days = [];
    Object.entries(data.series || {}).forEach(([k, arr]) => { const [network, subject, metric] = k.split('|');
      arr.forEach(([date, value]) => days.push({ date, network, subject, metric, value })); });
    socData = { ...data, days, win: w, branch: socBranch };
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

// The 3Ws are different on every tab (Kate, 23 Nov 2026: "iba iba dapat ang laman 3Ws per tab"). Calendar's own set is in socPaint.
const SOC_WHY = {
  overview: [
    ['Why this page', 'This is what we post on each app and how many women it reaches, so we see what to make more of.'],
    ['What to watch', 'If reach falls two weeks in a row on one app, the posts there have stopped landing.'],
    ['What to do', 'Tell Hanneh and Coach Emma which app, and they check the content plan.']],
  instagram: [
    ['Why this page', 'Instagram is where most of our views come from. This is every reel and post, and who it reached.'],
    ['What to watch', 'Reach next to views. A reel with big views but few accounts reached was one lucky post, not a pattern. Followers lost matter too.'],
    ['What to do', 'Take the reel that reached the most women and ask Hanneh and Coach Emma for a new take on it. Post it in the Best time hours.']],
  tiktok: [
    ['Why this page', 'This shows how many people watch our TikToks, and whether they stay to the end.'],
    ['What to watch', '“Watched to the end” and average watch. If people leave in the first seconds, the opening is the problem, not the topic.'],
    ['What to do', 'Pick the video with the lowest “Watched to the end” and ask Hanneh to film a new first three seconds for it.']],
  facebook: [
    ['Why this page', 'This is our Facebook page: who follows it, and what our posts and reels reach there.'],
    ['What to watch', 'Followed against unfollowed, and reel plays against post views. Reels usually travel further than posts.'],
    ['What to do', 'If unfollowed beats followed this period, tell Coach Emma. Share our best Instagram reel here as a Facebook reel.']],
  youtube: [
    ['Why this page', 'This is The Tara Rose Podcast channel: views, watch time and subscribers.'],
    ['What to watch', 'Watch time next to views. Many views with short watch time means people click and leave. Also subscribers lost.'],
    ['What to do', 'Find the week watch time dropped and tell Hanneh and Coach Emma. The video list is in Metricool, not here.']]
};

function socPaint(el) {
  Object.values(socCharts).forEach(c => c && c.destroy()); socCharts = {};
  const d = socData, w = d.win, cols = socCols();
  // a tab that this set of accounts does not have goes back to Overview (Bahrain has no TikTok, YouTube or Calendar)
  if (socTab !== 'overview' && (socTab === 'calendar' ? socBranch === 'BAH' : !socNetsOn().includes(socTab))) socTab = 'overview';
  const s = d.sync;
  const stale = !s || !s.last_ok_at || (Date.now() - new Date(s.last_ok_at).getTime()) > 36 * 3600e3;
  const synced = s && s.last_ok_at ? new Date(s.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const T = socTotals(d);
  // The tab row is shared by every tab. Calendar (social-calendar.js, 11 Nov 2026) has its own week / month / list controls, so it skips the Period row.
  const tabsBar = `<div class="sc-bar w13-bar soc-bar">
      <div class="sc-seg soc-tabs" role="tablist" aria-label="Report">
        ${[['overview', 'Overview'], ...(socBranch === 'BAH' ? [] : [['calendar', 'Calendar']]), ...Object.entries(SOC_NETS).filter(([k]) => socNetsOn().includes(k))].map(([k, l]) =>
          `<button type="button" role="tab" aria-selected="${socTab === k}" class="${socTab === k ? 'on' : ''}" onclick="socSetTab('${k}')">${k !== 'overview' && k !== 'calendar' ? socLogo(k, cols[k]) : ''}${l}</button>`).join('')}
      </div>
      ${socBranchSeg()}
    </div>`;
  if (socTab === 'calendar' && typeof socCalHtml === 'function') {
    el.innerHTML = `
    <section class="slv-intro">
      <h2>Social</h2>
      <p>The posts we made on Instagram, Facebook and TikTok, on a calendar. Open one to see how it did.</p>
    </section>
    ${whyWall([
      ['Why this page', 'This is what we really posted and when, with how each one did, so next month’s plan starts from what worked.'],
      ['What to watch', 'The blue hours Metricool suggests, and the posts marked “Did well” on each app.'],
      ['What to do', 'Pick one post that did well and plan a new take on it for next month. Tell Hanneh and Coach Emma which one.']])}
    ${tabsBar}
    ${socCalHtml()}`;
    socCalMount();
    socRail(false);
    return;
  }
  el.innerHTML = `
    <section class="slv-intro">
      <h2>Social</h2>
      ${socBranch === 'BAH' ? '<p>Tara Rose Salon Bahrain’s own Instagram and Facebook, from Metricool. Overview for the quick look; each platform’s tab has its full report. The apps report a day or two late, and Bahrain’s numbers start when each account was connected.</p>' : '<p>Instagram, TikTok, the Facebook page and YouTube in one place. Overview for the quick look; each platform\'s tab has its full report, as in Metricool. The apps report a day or two late.</p>'}
    </section>
    ${whyWall(SOC_WHY[socTab] || SOC_WHY.overview)}
    ${tabsBar}
    ${stale ? `<p class="slv-muted" style="color:#b42318">Social numbers are paused${s && s.last_error ? ': ' + mkEsc(s.last_error) : ''}. Last good update: ${synced ? mkEsc(synced) : 'never'}.</p>` : ''}
    ${socTab === 'overview' ? socOverviewHtml(T) : socPlatformHtml(socTab, T)}
    <p class="slv-muted">From Metricool, updated nightly${synced ? ', last ' + mkEsc(synced) : ''}. Numbers start when each account was connected to Metricool. Facebook Ads are not here; Google Ads and Meta Ads each have their own page.</p>`;
  if (socTab === 'overview') { socDrawOverview(T); if (typeof socGlanceMount === 'function') socGlanceMount(); } else socDrawPlatform(socTab, T);
  socTblMount();
  socRail(true);
}

// ── Overview ──────────────────────────────────────────────────────────────────────
function socOverviewHtml(T) {
  const d = socData, w = d.win, cols = socCols(), { t, last, posts } = T;
  const count = (arr, kinds) => kinds.map(([k, l]) => { const n = arr.filter(p => p.kind === k).length; return n ? `${n} ${l}${n === 1 ? '' : 's'}` : ''; }).filter(Boolean).join(', ') || 'none';
  // A line Metricool has no numbers for is left out, not shown as a dash.
  const kv = rows => `<div class="soc-kv">${rows.filter(([, v]) => v !== '–').map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>`;
  const upTo = net => last[net] ? `<div class="slv-note">Numbers up to ${mkDay(last[net])}</div>` : '';
  const card = (net, body) => { const f = socFollowers(net); return `<button type="button" class="w13-tile soc-plat" onclick="socSetTab('${net}')">
      <div class="soc-plat-top"><span>${socLogo(net, cols[net])}${SOC_NETS[net]}</span></div>
      <div class="slv-eyebrow">${SOC_PLAT[net].label}</div><div class="w13-val">${socNum(f.end)}${socChg(f.chg)}</div>${body}
      <div class="soc-plat-foot">${upTo(net)}<em>Full report ›</em></div></button>`; };
  const ig = posts.instagram.filter(p => p.kind !== 'story'), tt = posts.tiktok, fb = posts.facebook.filter(p => p.kind !== 'story');

  const nets = Object.keys(SOC_NETS).filter(n => d.posts.some(p => p.network === n && p.kind !== 'story'));
  if (socNet !== 'all' && !nets.includes(socNet)) socNet = 'all';
  const list = d.posts.filter(p => p.kind !== 'story' && (socNet === 'all' || p.network === socNet))
    .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));

  const web = d.web || {}, ch = {}; (web.channels || []).forEach(c => { ch[c.channel] = c; });
  const org = ch['Organic Social'] || { sessions: 0, engaged: 0 }, paid = ch['Paid Social'] || { sessions: 0, engaged: 0 };
  const social = Number(org.sessions) + Number(paid.sessions), total = Number(web.total) || 0;
  const stay = c => Number(c.sessions) ? 100 * Number(c.engaged) / Number(c.sessions) : null;

  return `
    ${typeof socGlanceHtml === 'function' ? socGlanceHtml() : ''}
    <section class="slv-card" id="soc-glance">
      <div class="slv-head">
        <div><div class="slv-eyebrow">${socBranch === 'BAH' ? '@tararosesalonbahrain' : '@tararosesalon'}</div><h3>At a glance</h3></div>
        <p>${mkEsc(socDayY(w.from))} to ${mkEsc(socDayY(w.to))}</p>
      </div>
      <div class="soc-plats">
        ${socNetsOn().includes('instagram') ? card('instagram', kv([
          ['Views', socNum(t['instagram.views'])],
          ['Reach (added up day by day)', socNum(t['instagram.reach'])],
          ['Posted', count(ig, [['post', 'post'], ['reel', 'reel']])],
        ])) : ''}
        ${socNetsOn().includes('facebook') ? card('facebook', kv([
          ['Reel plays', socNum(socSum(fb.filter(p => p.kind === 'reel'), 'views'))],
          ['Post views', socNum(socSum(fb.filter(p => p.kind === 'post'), 'views'))],
          ['Posted', count(fb, [['post', 'post'], ['reel', 'reel']])],
        ])) : ''}
        ${socNetsOn().includes('tiktok') ? card('tiktok', kv([
          ['Video views', socNum(t['tiktok.video_views'])],
          ['Profile visits', socNum(t['tiktok.profile_views'])],
          ['Posted', count(tt, [['video', 'video'], ['photo', 'photo']])],
        ])) : ''}
        ${socNetsOn().includes('youtube') ? card('youtube', kv([
          ['Views', socNum(t['youtube.views'])],
          ['Watch time', socMins(t['youtube.estimatedMinutesWatched'])],
          ['Likes', socNum(t['youtube.likes'])],
        ])) : ''}
      </div>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">Views ${socMode() === 'week' ? 'week by week' : 'day by day'}</div>
        ${mkModePills('soc', socMode(), 'socRepaint')}
        <span class="soc-key">${socNetsOn().map(k => `<span><i style="background:${cols[k]}"></i>${SOC_NETS[k]}</span>`).join('')}</span>
      </div>
      <div style="position:relative;height:280px"><canvas id="socCanvas"></canvas></div>
      <p class="slv-note">Instagram, TikTok and YouTube are the account's views that day. Facebook has no daily page views, so its bars are its posts' and reels' views on the day they went out.</p>
    </section>
    ${socBranch === 'BAH' ? '' : `    <section class="slv-card" id="soc-web" style="margin-top:14px">
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
    </section>`}
    <section class="slv-card" id="soc-top" style="margin-top:14px">
      <div class="slv-head">
        <div><div class="slv-eyebrow">What worked</div><h3>Top posts</h3></div>
        ${nets.length > 1 ? `<div class="sc-seg" role="group" aria-label="Platform">
          ${[['all', 'All'], ...nets.map(n => [n, SOC_NETS[n]])].map(([k, l]) => `<button type="button" class="${socNet === k ? 'on' : ''}" onclick="socSetNet('${k}')">${l}</button>`).join('')}
        </div>` : ''}
      </div>
      ${list.length ? `${socTblHtml('soctop', { rows: list, unit: 'posts', cols: [socPostCol('Post', true), socNumCol('views', 'Views'), socNumCol('reach', 'Reach'), socNumCol('interactions', 'Likes, comments, shares'), socNumCol('saves', 'Saves')] })}
      <p class="slv-note">Posted in these dates, most viewed first. Tap a heading's funnel to sort or filter. A post's numbers keep growing for a few weeks, and are re-read every night. Tap a caption to open the post.</p>`
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
  const rows = mkBuckets(Object.values(by), w.from, w.to, socMode(), socNetsOn());
  const cols = socCols();
  socCharts.overview = socBarChart(document.getElementById('socCanvas'), rows,
    socNetsOn().map(k => ({ label: SOC_NETS[k], data: rows.map(r => r[k]), backgroundColor: cols[k], stack: 'v' })), true);
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
      if (st && st.n) sections.push(socSection(net + '-story', 'Stories', `${socNum(st.n)} stories · ${socNum(st.reach / st.n)} people each on average`, socStoriesHtml(st, days, net + '-story'), !sections.length));
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
  if (P.hashtags) { const h = socHashtagsHtml(feed, net + '-tags'); if (h) sections.push(socSection(net + '-tags', 'Hashtags', h.summary, h.html)); }
  if (P.competitors) sections.push(socSection(net + '-comp', 'Competitors', 'None set up yet',
    '<p class="slv-muted" style="margin:0">No competitors are set up in Metricool. Add the salons we watch there (Analytics › Competitors) and they show here side by side: followers, posts and engagement.</p>'));

  return `
    <section class="slv-card" id="soc-plat">
      <div class="slv-head">
        <div><div class="slv-eyebrow"><i class="soc-dot" style="background:${cols[net]}"></i>${SOC_NETS[net]}${net === 'youtube' ? ' · The Tara Rose Podcast' : socBranch === 'BAH' ? ' · Tara Rose Salon Bahrain' : ' · @tararosesalon'}</div><h3>${SOC_NETS[net]} report</h3></div>
        <p>${mkEsc(socDayY(w.from))} to ${mkEsc(socDayY(w.to))}${last[net] ? ` · numbers up to ${mkDay(last[net])}` : ''}</p>
      </div>
      <div class="w13-tiles soc-tiles">${tiles}</div>
      <div class="mk-chart-head">
        <div class="slv-eyebrow">${P.label} ${socMode() === 'week' ? 'week by week' : 'day by day'}</div>
        ${mkModePills('soc', socMode(), 'socRepaint')}
        <span class="soc-key"><span><i style="background:var(--good)"></i>${net === 'tiktok' ? 'Up' : 'Gained'}</span><span><i style="background:var(--bad)"></i>${net === 'tiktok' ? 'Down' : 'Lost'}</span><span><i style="background:var(--text)"></i>Total</span></span>
      </div>
      <div style="position:relative;height:240px"><canvas id="socFollow"></canvas></div>
      ${net === 'instagram' ? `<div id="socViewsBox">${socViewsInner(net, cols)}</div>` : `<div class="mk-chart-head">
        <div class="slv-eyebrow">Views ${socMode() === 'week' ? 'week by week' : 'day by day'}</div>
      </div>
      <div style="position:relative;height:240px"><canvas id="socViews"></canvas></div>`}
      ${typeof sgSchedHtml === 'function' ? sgSchedHtml(net, cols) : ''}
      ${viewsNote && net !== 'instagram' ? `<p class="slv-note">${viewsNote}</p>` : ''}
    </section>
    <section class="slv-card soc-secs" style="margin-top:14px">${sections.join('')}</section>`;
}

// Folded sections: the first one (the platform's posts) opens by default, the rest closed,
// and each remembers what it was set to while the page is open.
function socSection(id, title, summary, body, first) {
  const open = socFold[id] === undefined ? !!first : socFold[id];
  return `<details class="soc-sec" id="soc-s-${id}"${open ? ' open' : ''} ontoggle="socToggle('${id}', this.open)">
    <summary><span class="soc-sec-t">${title}</span><span class="soc-sec-s">${summary}</span></summary>
    <div class="soc-sec-b">${body}</div></details>`;
}

function socPostsTable(id, net, kind, arr) {
  const cols = [['views', 'Views'], ['reach', 'Reach'], ['likes', net === 'facebook' ? 'Reactions' : 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves']]
    .filter(([k]) => arr.some(p => p[k] !== null && p[k] !== undefined));
  const sec = v => v ? (Math.round(v * 10) / 10) + 's' : '–';
  const extra = [];
  if (kind === 'reel' && net === 'instagram') extra.push(['avg_watch', 'Avg watch', sec]);
  if (net === 'tiktok') extra.push(['avg_watch', 'Avg watch', sec], ['full_watch', 'Watched to the end', v => v !== null && v !== undefined ? socPct(100 * v) : '–']);
  const rows = [...arr].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
  const tc = [socPostCol(kind === 'reel' ? 'Reel' : kind === 'video' ? 'Video' : 'Post', false), ...cols.map(([k, l]) => socNumCol(k, l)),
    ...extra.map(([k, l, fmt]) => ({ k, l, t: 'num', raw: p => Number((p.extra || {})[k]) || 0, disp: p => fmt((p.extra || {})[k]), cell: p => fmt((p.extra || {})[k]) }))];
  return `${socTblHtml(id, { rows, unit: kind === 'reel' ? 'reels' : kind === 'video' ? 'videos' : 'posts', cols: tc })}
    <p class="slv-note">Tap a heading's funnel to sort or filter. Tap a caption to open the post.</p>`;
}

// st: social_report's story totals for one platform, with its 20 most seen.
function socStoriesHtml(st, days, id) {
  const fwd = Number(st.taps_forward) || 0, exits = Number(st.exits) || 0, back = Number(st.taps_back) || 0, replies = Number(st.replies) || 0;
  const top = (st.top || []).map(p => ({ ...p, kind: 'story' }));
  return `<div class="w13-tiles soc-tiles">
      <div class="w13-tile"><div class="slv-eyebrow">Stories</div><div class="w13-val">${socNum(st.n)}</div><div class="slv-note">${socNum(st.n / days)} a day</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Reached each</div><div class="w13-val">${socNum(st.reach / st.n)}</div><div class="slv-note">on average</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Tapped forward</div><div class="w13-val">${socNum(fwd)}</div><div class="slv-note">skipped to the next</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Left stories</div><div class="w13-val">${socNum(exits)}</div><div class="slv-note">swiped away</div></div>
      <div class="w13-tile"><div class="slv-eyebrow">Replies</div><div class="w13-val">${socNum(replies)}</div><div class="slv-note">${socNum(back)} tapped back</div></div>
    </div>
    <div style="margin-top:12px">${socTblHtml(id, { rows: top, unit: 'stories', cols: [socPostCol('Most seen stories', false), socNumCol('reach', 'Reached'), socNumCol('taps_forward', 'Tapped forward', p => (p.extra || {}).taps_forward), socNumCol('exits', 'Left', p => (p.extra || {}).exits), socNumCol('replies', 'Replies', p => (p.extra || {}).replies)] })}</div>`;
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
function socHashtagsHtml(feed, id) {
  const by = {};
  feed.forEach(p => {
    // social_report reads the tags off the full caption (the caption it sends is cut to 300 characters).
    const tags = new Set(p.tags || (String(p.caption || '').toLowerCase().match(/#[\p{L}\p{N}_]+/gu) || []));
    tags.forEach(t => { const o = by[t] = by[t] || { n: 0, views: 0, inter: 0 }; o.n++; o.views += Number(p.views) || 0; o.inter += Number(p.interactions) || 0; });
  });
  const rows = Object.entries(by).sort((a, b) => b[1].views - a[1].views).slice(0, 15);
  if (!rows.length) return null;
  return { summary: 'Top: ' + rows.slice(0, 3).map(r => r[0]).join(', '),
    html: socTblHtml(id, { rows: rows.map(([t, o]) => ({ tag: t, n: o.n, views: o.views, inter: o.inter })), unit: 'hashtags', cols: [{ k: 'tag', l: 'Hashtag', t: 'txt', raw: r => r.tag, disp: r => r.tag, cell: r => mkEsc(r.tag) }, socNumCol('n', 'Posts'), socNumCol('views', 'Views'), socNumCol('inter', 'Likes, comments, shares')] }) + `
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
  // A click on a bar or the line opens that day (or week): the follower numbers, and what went out then. Followers cannot be traced to one post or story, and the window says so.
  if (typeof sgPopAttach === 'function') {
    const up = net === 'tiktok' ? 'Up' : 'Gained', dn = net === 'tiktok' ? 'Down' : 'Lost';
    sgPopAttach(socCharts.follow, rows, net, { showP: true, showS: net !== 'tiktok', note: 'Followers cannot be traced to a single post or story. Shown here: what went out then.',
      sum: r => [[up, r.gained || 0], [dn, Math.abs(r.lost || 0)], ['Followers', r.total ?? null]] });
  }
  socViewsDraw(net, rows);
  if (typeof sgSchedDraw === 'function') sgSchedDraw(net);
}

// ── Instagram Views chart: All | Stories | Posts (Kate, 23 Nov 2026) ──
// All is the account's views each day (Metricool's daily series). Stories and Posts are counted on the day each one went out: a story's views (content_calendar_story_stats, 93 days a call) and a post's or reel's views so far.
// The two are not the same days as All, and the note under the chart says so.
let socViewsMode = 'all', socViewsBase = null, socStoryViews = null, socStoryKey = null, socStoryBusy = null;
function socViewsNote() {
  if (socViewsMode === 'stories') return "Each story's views and reach, counted on the day it was posted (a story is up for 24 hours). Not the same days as All, which counts views on the day they happened.";
  if (socViewsMode === 'posts') return "Each post's and reel's views and reach so far, counted on the day it went out. They keep growing for a few weeks. Not the same days as All, which counts views on the day they happened.";
  return 'Views of everything on the account each day (posts, reels and stories together), with the people reached as the line.';
}
function socViewsInner(net, cols) {
  const by = socMode() === 'week' ? 'week by week' : 'day by day', v = socViewsMode, K = v === 'stories' ? 'Story ' : v === 'posts' ? 'Post ' : '';
  const title = v === 'stories' ? `Instagram story views ${by}, by the day posted` : v === 'posts' ? `Instagram post and reel views ${by}, by the day posted` : `Instagram views ${by}, all content`;
  const seg = `<div class="sc-seg" role="group" aria-label="Show">${[['all', 'All'], ['stories', 'Stories'], ['posts', 'Posts']].map(([k, l]) => `<button type="button" class="${v === k ? 'on' : ''}" aria-pressed="${v === k}" onclick="socViewsSet('${k}')">${l}</button>`).join('')}</div>`;
  return `<div class="mk-chart-head">
      <div class="slv-eyebrow">${title}</div>
      ${seg}
      <span class="soc-key"><span><i style="background:${cols[net]}"></i>${K}views (bars)</span><span><i style="background:${socReachColour()};width:16px;height:3px;border-radius:2px"></i>${K}reach (line)</span></span>
    </div>
    <div style="position:relative;height:240px"><canvas id="socViews"></canvas></div>
    <p class="slv-note" id="socViewsNote">${socViewsNote()}</p>`;
}
function socStoryRows() { const w = socData.win; return socStoryViews && socStoryKey === w.from + '|' + w.to + '|' + socBranch ? socStoryViews : null; }
function socStoryLoad() {
  const w = socData.win, key = w.from + '|' + w.to + '|' + socBranch;
  if (socStoryBusy && socStoryBusy.key === key) return socStoryBusy.p;
  const p = (async () => {
    const out = [];
    for (let a = w.from; a <= w.to;) {
      const e = new Date(a + 'T00:00:00'); e.setDate(e.getDate() + 92);
      const b = socIso(e) < w.to ? socIso(e) : w.to;
      const r = await sb.rpc('content_calendar_story_stats', { p_from: a, p_to: b, ...socBr() });
      if (r.error) throw r.error;
      (r.data || []).forEach(x => { if (x.network === 'instagram') out.push({ d: new Date(x.posted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }), views: x.views, reach: x.reach }); });
      const n = new Date(b + 'T00:00:00'); n.setDate(n.getDate() + 1); a = socIso(n);
    }
    if (socData && socData.win.from + '|' + socData.win.to + '|' + socBranch === key) { socStoryViews = out; socStoryKey = key; }
    return out;
  })();
  socStoryBusy = { key, p };
  const done = () => { if (socStoryBusy && socStoryBusy.p === p) socStoryBusy = null; };
  p.then(done, done);
  return p;
}
function socViewsDraw(net, baseRows) {
  const cv = document.getElementById('socViews'); if (!cv) return;
  if (net === 'instagram') socViewsBase = baseRows;
  const w = socData.win, mode = socMode(), cols = socCols(), P = SOC_PLAT[net], note = document.getElementById('socViewsNote');
  let rows = baseRows, bars = 'Views', line = 'Reach (added up day by day)';
  if (net === 'instagram' && socViewsMode !== 'all') {
    const by = {}, put = (d, v, r) => { const x = (by[d] = by[d] || { date: d }); x.views = (x.views || 0) + (Number(v) || 0); x.reach = (x.reach || 0) + (Number(r) || 0); };
    if (socViewsMode === 'posts') socData.posts.forEach(p => { if (p.network === 'instagram' && p.kind !== 'story' && p.post_date) put(p.post_date, p.views, p.reach); });
    else {
      const st = socStoryRows();
      if (!st) {
        if (note) note.textContent = 'Reading the stories…';
        socStoryLoad().then(() => { if (socViewsMode === 'stories' && document.getElementById('socViews')) socViewsDraw(net, socViewsBase); },
          e => { console.error(e); if (note) note.textContent = 'Could not read the stories just now. Refresh to try again.'; });
        return;
      }
      st.forEach(x => put(x.d, x.views, x.reach));
    }
    rows = mkBuckets(Object.values(by), w.from, w.to, mode, ['views', 'reach']);
    bars = socViewsMode === 'stories' ? 'Story views' : 'Post views';
    line = socViewsMode === 'stories' ? 'Story reach' : 'Post reach';
  }
  if (note) note.textContent = socViewsNote();
  if (socCharts.views) { socCharts.views.destroy(); socCharts.views = null; }
  socCharts.views = socBarChart(cv, rows, [
    { label: bars, data: rows.map(r => r.views), backgroundColor: cols[net] },
    ...(P.reach ? [{ type: 'line', label: line, data: rows.map(r => r.reach), borderColor: socReachColour(), backgroundColor: socReachColour(), borderWidth: 3, pointRadius: rows.length > 45 ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: socReachColour(), tension: .3 }] : []),
  ], false);
  // A click on a bar or a point opens the posts and stories behind it (social-glance.js). Facebook's bars and Instagram's Posts and Stories views are those very posts or stories;
  // Instagram's All and TikTok's bars count everything that happened that day, so the window says it shows what went out that day.
  if (typeof sgPopAttach === 'function') {
    const ig = net === 'instagram', m = socViewsMode, nt = 'The bar counts every view of the account that day, older posts too, so these only add up to part of it. Shown here: what went out that day.';
    sgPopAttach(socCharts.views, rows, net, ig ? (m === 'stories' ? { showP: false, showS: true } : m === 'posts' ? { showP: true, showS: false } : { showP: true, showS: true, note: nt })
      : net === 'tiktok' ? { showP: true, showS: false, note: nt } : { showP: true, showS: false });
  }
}
function socViewsSet(v) {
  socViewsMode = v;
  const box = document.getElementById('socViewsBox'); if (!box) return;
  if (socCharts.views) { socCharts.views.destroy(); socCharts.views = null; }
  box.innerHTML = socViewsInner('instagram', socCols());
  socViewsDraw('instagram', socViewsBase);
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
