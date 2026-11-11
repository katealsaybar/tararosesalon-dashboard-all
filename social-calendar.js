// Social, Calendar tab (Kate, 11 Nov 2026): every post we made on Instagram, Facebook and TikTok on a calendar, so the content plan starts from
// what was really posted and how it did. Three views of the same posts: Week (hours down the side, a column a day), Month, and List.
// One platform shows by itself; two or more show together, one colour each.
//
// Where it reads from: the same social_report() the other Social tabs use (migrations/metricool_report_tabs.sql), asked a month at a time and
// kept for the visit, so moving between weeks inside a month costs nothing. Posts come from metricool_posts (nightly), and the blue behind the
// hours is Metricool's own "best time to post" for the last 30 days (metricool_snapshots, kind besttime, Dubai time). Level 3 and above, like the
// rest of Social.
//
// What is NOT here yet, and why (nothing is faked):
//   YouTube     Metricool gives YouTube daily totals only, no list of videos. The chip is there and says so.
//   Clicks      Metricool's post feed has no clicks per post; only the account-level website clicks, and Instagram returns none.
//   Tagged      the post feed has no tagged accounts.
//   Playing     we keep the post's picture and its link, not the video. The panel opens the post on its own app.
// A line a platform has no number for is left out of the panel, not shown as a dash.
//
// Prefix scal-, one global state object. Drawn from social.js (socPaint), after marketing-chart.js (mk* helpers) and social.js (socCols, SOC_NETS).
const SCAL_NETS = ['instagram', 'facebook', 'tiktok'];
const SCAL_CODE = { instagram: 'IG', facebook: 'FB', tiktok: 'TT', youtube: 'YT' };
// The first month Metricool holds posts for, a platform at a time (see project notes: FB Jan 2025, IG Aug 2025, TikTok Jun 2026).
const SCAL_START = { instagram: '2025-08', facebook: '2025-01', tiktok: '2026-06' };
const SCAL_FIRST = '2025-01';
const SCAL_KIND = { reel: 'reel', post: 'post', video: 'video', photo: 'photo post' };
const SCAL_MONTHS_NAMED = { '2025-01': 'January 2025', '2025-08': 'August 2025', '2026-06': 'June 2026' };

const scal = { view: 'week', ws: null, month: null, scope: 'month', on: { instagram: true, facebook: true, tiktok: true }, sel: null, q: '', sort: 'new', open: null, busy: false, err: false };
const scalCache = {};            // 'YYYY-MM' -> [post]
let scalSnaps = null, scalSync = null;
try {
  const s = JSON.parse(localStorage.getItem('trs-scal') || '{}');
  if (['week', 'month', 'list'].includes(s.view)) scal.view = s.view;
  if (s.on) SCAL_NETS.forEach(n => { if (typeof s.on[n] === 'boolean') scal.on[n] = s.on[n]; });
  if (!SCAL_NETS.some(n => scal.on[n])) SCAL_NETS.forEach(n => { scal.on[n] = true; });
} catch (e) {}
const scalSave = () => { try { localStorage.setItem('trs-scal', JSON.stringify({ view: scal.view, on: scal.on })); } catch (e) {} };

// ── Dates (all Dubai days, as ISO strings) ────────────────────────────────────────
const scalToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
const scalAdd = (iso, n) => { const d = mkD(iso); d.setDate(d.getDate() + n); return mkIso(d); };
const scalMon = iso => { const d = mkD(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return mkIso(d); };
const scalMonthEnd = key => { const [y, m] = key.split('-').map(Number); return key + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); };
const scalShiftMonth = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const scalLong = iso => mkD(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const scalShort = iso => mkD(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const scalMonthName = key => mkD(key + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
function scalTimeParts(iso) {
  if (!iso) return null;
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(iso));
    const g = t => Number((p.find(x => x.type === t) || {}).value);
    return { h: g('hour') % 24, m: g('minute') };
  } catch (e) { return null; }
}
const scalClock = (t, short) => { if (!t) return ''; const h = t.h % 12 || 12, ap = t.h >= 12 ? (short ? 'p' : 'pm') : (short ? 'a' : 'am'); return h + ':' + String(t.m).padStart(2, '0') + ap; };
const scalHour = h => (h % 12 || 12) + (h >= 12 ? 'pm' : 'am');
const scalN = v => (v === null || v === undefined || !isFinite(v)) ? null : Number(v);
const scalFmt = v => v === null ? 'n/a' : v >= 10000 ? (Math.round(v / 100) / 10) + 'k' : Math.round(v).toLocaleString('en-GB');
const scalHue = id => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % 360; };

// ── Posts ─────────────────────────────────────────────────────────────────────────
function scalPost(p, i, key) {
  const net = p.network, kind = SCAL_KIND[p.kind] ? p.kind : 'post';
  const reposts = net === 'instagram' ? scalN(p.extra && p.extra.reposts) : scalN(p.shares);
  return { id: key + '#' + i, net, kind, date: String(p.post_date || '').slice(0, 10), at: p.posted_at, t: scalTimeParts(p.posted_at),
    cap: String(p.caption || '').trim(), url: p.url || '', img: p.image_url || '',
    views: scalN(p.views), reach: scalN(p.reach), likes: scalN(p.likes), comments: scalN(p.comments), reposts, saves: scalN(p.saves),
    // Facebook posts report impressions in the views field; its reels and the other apps report plays.
    viewLabel: net === 'facebook' && kind === 'post' ? 'Impressions' : 'Views',
    repostLabel: net === 'instagram' ? 'Reposts' : 'Shares' };
}
const scalIsVideo = p => p.kind === 'reel' || p.kind === 'video';

async function scalLoad(key) {
  if (scalCache[key]) return;
  const { data, error } = await sb.rpc('social_report', { p_from: key + '-01', p_to: scalMonthEnd(key) });
  if (error || !data) throw error || new Error('no data');
  scalCache[key] = (data.posts || []).filter(p => SCAL_NETS.includes(p.network)).map((p, i) => scalPost(p, i, key))
    .sort((a, b) => (a.at || a.date) < (b.at || b.date) ? -1 : 1);
  scalSnaps = data.snapshots || scalSnaps;
  scalSync = data.sync || scalSync;
}

// The period on screen: a week (Week view, or the List opened from a week's count) or a month.
function scalPeriod() {
  const week = scal.view === 'week' || (scal.view === 'list' && scal.scope === 'week');
  if (week) {
    const from = scal.ws, to = scalAdd(from, 6), a = from.slice(0, 7), b = to.slice(0, 7);
    const d1 = mkD(from), d2 = mkD(to);
    const label = a === b ? `${d1.getDate()} to ${d2.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : `${d1.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${d2.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return { kind: 'week', from, to, label, months: a === b ? [a] : [a, b] };
  }
  return { kind: 'month', from: scal.month + '-01', to: scalMonthEnd(scal.month), label: scalMonthName(scal.month), months: [scal.month] };
}
const scalPosts = per => per.months.flatMap(k => scalCache[k] || []).filter(p => p.date >= per.from && p.date <= per.to && scal.on[p.net]);
const scalFind = id => { for (const k in scalCache) { const f = scalCache[k].find(p => p.id === id); if (f) return f; } return null; };

async function scalEnsure() {
  if (!scal.ws) { const t = scalToday(); scal.ws = scalMon(t); scal.month = t.slice(0, 7); }
  const per = scalPeriod(), need = per.months.filter(k => !scalCache[k]);
  if (!need.length) { scal.busy = false; scal.err = false; scalPaint(); return; }
  scal.busy = true; scalPaint();
  try { await Promise.all(need.map(scalLoad)); scal.err = false; }
  catch (e) { console.error(e); scal.err = true; }
  scal.busy = false; scalPaint();
}

// ── Best times: Metricool's last 30 days, summed over the platforms on show ─────────
function scalBest() {
  const nets = SCAL_NETS.filter(n => scal.on[n] && scalSnaps && scalSnaps[n] && scalSnaps[n].besttime && scalSnaps[n].besttime.v);
  if (!nets.length) return null;
  const sum = {};
  nets.forEach(n => { const v = scalSnaps[n].besttime.v, mx = Math.max(...Object.values(v).map(Number), 0) || 1;
    Object.entries(v).forEach(([k, x]) => { sum[k] = (sum[k] || 0) + Number(x) / mx; }); });
  // Key is '<day 1 Mon..7 Sun>-<hour 0..23>'. Metricool scores almost every daytime hour, so the shades are by rank, not by size:
  // the best tenth of the hours of the week is the darkest, the next quarter a middle shade, the next third a light one, the rest none.
  const all = Object.values(sum).sort((a, b) => b - a), at = f => all[Math.min(all.length - 1, Math.floor(all.length * f))];
  const c3 = at(.10), c2 = at(.35), c1 = at(.70);
  return (dow, h) => { const v = sum[(dow + 1) + '-' + h] || 0; return v >= c3 && v > 0 ? 3 : v >= c2 && v > 0 ? 2 : v >= c1 && v > 0 ? 1 : 0; };
}

// ── Little pieces ─────────────────────────────────────────────────────────────────
function scalBadgeFg(hex) { const n = parseInt(hex.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > .6 ? '#1A1A1A' : '#FFFFFF'; }
const scalStyle = (p, cols) => `--c:${cols[p.net]};--bf:${scalBadgeFg(cols[p.net])};--g:linear-gradient(155deg,hsl(${scalHue(p.id)} 45% 62%),hsl(${(scalHue(p.id) + 30) % 360} 35% 38%))`;
const SCAL_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const scalImg = p => p.img ? `<img src="${mkEsc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
const scalLabel = p => `${SOC_NETS[p.net]} ${SCAL_KIND[p.kind]}, ${scalClock(p.t) || 'time not known'}, ${p.cap.slice(0, 80)}, ${scalFmt(p.likes)} likes`;
const scalCap = p => mkEsc(p.cap || '(no caption)');
const scalStats = p => `<b>${scalFmt(p.likes)}</b> likes · <b>${scalFmt(p.views)}</b> ${p.viewLabel === 'Impressions' ? 'impressions' : 'views'}`;

function scalTile(p, cols, cls) {
  const cur = scal.sel === p.id ? ' aria-current="true"' : '';
  return `<button type="button" class="scal-${cls}" data-id="${mkEsc(p.id)}" style="${scalStyle(p, cols)}" aria-label="${mkEsc(scalLabel(p))}"${cur} onclick="scalOpen(this.dataset.id)">
    <span class="scal-th">${scalImg(p)}${scalIsVideo(p) ? SCAL_PLAY : ''}</span>
    ${cls === 'wc' ? '<span class="bd">' : ''}<span class="scal-r1"><span class="scal-bb" aria-hidden="true">${SCAL_CODE[p.net]}</span>${scalClock(p.t) || 'Time not known'}</span>
    <span class="scal-cp">${scalCap(p)}</span><span class="scal-st">${scalStats(p)}</span>${cls === 'wc' ? '</span>' : ''}</button>`;
}

// ── The tab ───────────────────────────────────────────────────────────────────────
function socCalHtml() { return '<div id="scalRoot" class="scal"></div>'; }
function socCalMount() { scalEnsure(); }

function scalPaint() {
  const root = document.getElementById('scalRoot'); if (!root) return;
  const cols = socCols(), per = scalPeriod(), posts = scalPosts(per), today = scalToday();
  const nOn = SCAL_NETS.filter(n => scal.on[n]).length, allOn = nOn === SCAL_NETS.length;
  const best = posts.length ? posts.reduce((a, b) => (b.views || 0) > (a.views || 0) ? b : a) : null;
  const atMin = per.kind === 'week' ? scal.ws <= scalMon(SCAL_FIRST + '-01') : scal.month <= SCAL_FIRST;
  const atMax = per.kind === 'week' ? scal.ws >= scalMon(today) : scal.month >= today.slice(0, 7);
  const late = SCAL_NETS.filter(n => scal.on[n] && per.from.slice(0, 7) < SCAL_START[n]);
  const stale = !scalSync || !scalSync.last_ok_at;
  const synced = scalSync && scalSync.last_ok_at ? new Date(scalSync.last_ok_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  const chips = `<button type="button" class="scal-plat all" aria-pressed="${allOn}" onclick="scalPlat('all')">Show all</button>` +
    SCAL_NETS.map(n => `<button type="button" class="scal-plat" style="--c:${cols[n]};--bf:${scalBadgeFg(cols[n])}" aria-pressed="${!!scal.on[n]}" onclick="scalPlat('${n}')"><span class="scal-b" aria-hidden="true">${SCAL_CODE[n]}</span>${SOC_NETS[n]}</button>`).join('') +
    `<span class="scal-plat off" title="YouTube is not on the calendar yet. Metricool gives us daily totals for it, not a list of videos."><span class="scal-b" aria-hidden="true">YT</span>YouTube <em>not yet</em></span>`;

  let answer;
  if (scal.busy && !posts.length) answer = 'Loading the posts…';
  else if (scal.err) answer = 'The posts did not load. Refresh to try again.';
  else if (!posts.length) answer = `No posts in <b>${mkEsc(per.label)}</b> with these platforms.`;
  else answer = `<b>${mkEsc(per.label)}</b>: <button type="button" class="scal-link" onclick="scalShowList()">${posts.length} post${posts.length === 1 ? '' : 's'}</button>. Most viewed: <button type="button" class="scal-link" data-id="${mkEsc(best.id)}" onclick="scalOpen(this.dataset.id)">the ${SOC_NETS[best.net]} ${SCAL_KIND[best.kind]} on ${scalShort(best.date)}</button>, ${scalFmt(best.views)} ${best.viewLabel.toLowerCase()}.`;

  const hint = nOn === 1 ? 'Showing one platform. Tap another to add it.' : allOn ? 'Showing everything. Tap one platform to see just that one.' : `Showing ${nOn} platforms together, one colour each.`;
  const viewBtns = [['week', 'Week'], ['month', 'Month'], ['list', 'List']].map(([k, l]) => `<button type="button" class="${scal.view === k ? 'on' : ''}" aria-pressed="${scal.view === k}" onclick="scalView('${k}')">${l}</button>`).join('');

  let body = '';
  if (scal.view === 'week') body = scalWeekHtml(posts, cols, per, today);
  else if (scal.view === 'month') body = scalMonthHtml(posts, cols, per, today);
  else body = scalListHtml(posts, cols, per);

  root.innerHTML = `
    <div class="scal-bar">
      <div class="scal-month">
        <button type="button" class="scal-icon" aria-label="Previous" onclick="scalNav(-1)" ${atMin ? 'disabled' : ''}>‹</button>
        <h3>${mkEsc(per.label)}</h3>
        <button type="button" class="scal-icon" aria-label="Next" onclick="scalNav(1)" ${atMax ? 'disabled' : ''}>›</button>
        <button type="button" class="sc-btn" onclick="scalToToday()">Today</button>
        <div class="sc-seg scal-seg" role="group" aria-label="View">${viewBtns}</div>
      </div>
      <div class="scal-plats" role="group" aria-label="Platforms">${chips}</div>
    </div>
    <p class="scal-hint">${hint}</p>
    <section class="scal-answer" aria-live="polite"><div>${answer}</div>${typeof rexButtons === 'function' ? rexButtons('scalExport') : ''}</section>
    ${late.length ? `<p class="scal-note">${late.map(n => `${SOC_NETS[n]} has no posts on record before ${SCAL_MONTHS_NAMED[SCAL_START[n]] || SCAL_START[n]}`).join('. ')}.</p>` : ''}
    <div class="scal-layout${scal.sel ? ' open' : ''}">
      <div class="scal-cal">${body}</div>
      ${scal.sel ? scalPanelHtml(scalFind(scal.sel), cols, posts) : ''}
    </div>
    <p class="slv-muted">Posts from Metricool, updated nightly${synced ? ', last ' + mkEsc(synced) : ''}${stale ? ' (no update recorded yet)' : ''}. The apps report a day or two late, so the last days can be thin. Instagram, Facebook and TikTok only for now; stories are not on the calendar.</p>`;
  if (scal.sel) { const c = root.querySelector('.scal-close'); if (c && scal.focusPanel) { c.focus(); scal.focusPanel = false; } }
}

// Week: hours down the side, a column a day. Posts in the same hour stack inside their cell, so nothing is squashed side by side.
function scalWeekHtml(posts, cols, per, today) {
  const best = scalBest(), days = Array.from({ length: 7 }, (_, i) => scalAdd(per.from, i));
  const known = posts.filter(p => p.t), unknown = posts.filter(p => !p.t);
  const hrs = known.map(p => p.t.h), h0 = Math.min(8, ...hrs), h1 = Math.max(22, ...hrs);
  const cell = {}; known.forEach(p => { (cell[p.date + '|' + p.t.h] = cell[p.date + '|' + p.t.h] || []).push(p); });
  let g = '<div class="scal-dh c0"></div>' + days.map(d => `<div class="scal-dh${d === today ? ' today' : ''}"><b>${mkD(d).toLocaleDateString('en-GB', { weekday: 'short' })}</b><span class="n">${mkD(d).getDate()}</span></div>`).join('');
  if (unknown.length) g += '<div class="scal-hl">Time not known</div>' + days.map(d => `<div class="scal-hc l0">${unknown.filter(p => p.date === d).map(p => scalTile(p, cols, 'tc')).join('')}</div>`).join('');
  for (let h = h0; h <= h1; h++) {
    g += `<div class="scal-hl">${scalHour(h)}</div>` + days.map((d, i) => `<div class="scal-hc l${best ? best(i, h) : 0}">${(cell[d + '|' + h] || []).map(p => scalTile(p, cols, 'tc')).join('')}</div>`).join('');
  }
  // Phone: one block a day, no hour grid.
  const stacked = days.map(d => { const list = posts.filter(p => p.date === d);
    return `<div class="scal-wcol${d > today ? ' future' : ''}${d === today ? ' today' : ''}"><div class="scal-wh"><b>${mkD(d).toLocaleDateString('en-GB', { weekday: 'short' })}</b><span class="n">${mkD(d).getDate()}</span></div>${list.length ? list.map(p => scalTile(p, cols, 'wc')).join('') : `<div class="scal-empty">${d > today ? 'Not yet' : 'No posts'}</div>`}</div>`; }).join('');
  const legend = best ? '<p class="scal-legend"><span>Blue behind the hours:</span><i class="a"></i><i class="b"></i><i class="c"></i><span>darker is a better time to post, from Metricool, last 30 days.</span></p>' : '';
  return `${legend}<div class="scal-tgrid">${g}</div><div class="scal-wstack">${stacked}</div>`;
}

// Month: a pill a post for two or more platforms, a picture a post for one. On a phone, dots and the chosen day's list underneath.
function scalMonthHtml(posts, cols, per, today) {
  const first = mkD(per.from), lead = (first.getDay() + 6) % 7, nd = mkD(per.to).getDate(), total = Math.ceil((lead + nd) / 7) * 7;
  const solo = SCAL_NETS.filter(n => scal.on[n]).length === 1, by = {};
  posts.forEach(p => { (by[p.date] = by[p.date] || []).push(p); });
  const pill = p => { const cur = scal.sel === p.id ? ' aria-current="true"' : '';
    return solo
      ? `<button type="button" class="scal-tile" data-id="${mkEsc(p.id)}" style="${scalStyle(p, cols)}" aria-label="${mkEsc(scalLabel(p))}"${cur} onclick="scalOpen(this.dataset.id)"><span class="scal-th">${scalImg(p)}${scalIsVideo(p) ? SCAL_PLAY : ''}</span><span class="tm">${scalClock(p.t, true)}</span></button>`
      : `<button type="button" class="scal-pill" data-id="${mkEsc(p.id)}" style="${scalStyle(p, cols)}" aria-label="${mkEsc(scalLabel(p))}"${cur} onclick="scalOpen(this.dataset.id)"><span class="scal-bb" aria-hidden="true">${SCAL_CODE[p.net]}</span><span class="t">${scalClock(p.t, true)}</span><span class="c">${scalCap(p)}</span></button>`; };
  let cells = '';
  for (let i = 0; i < total; i++) {
    const day = i - lead + 1, inM = day >= 1 && day <= nd, iso = inM ? per.from.slice(0, 8) + String(day).padStart(2, '0') : '';
    const list = inM ? (by[iso] || []) : [], max = solo ? 4 : 3, open = scal.open === iso, shown = open ? list : list.slice(0, max);
    cells += `<div class="scal-cell${inM ? '' : ' out'}${inM && iso > today ? ' future' : ''}${iso === today ? ' today' : ''}${iso && scal.day === iso ? ' sel' : ''}" ${iso ? `data-day="${iso}" onclick="scalDay('${iso}')"` : ''}>
      <div class="scal-dn">${inM ? day : ''}</div>
      ${solo ? `<div class="scal-tiles">${shown.map(pill).join('')}</div>` : shown.map(pill).join('')}
      ${!open && list.length > max ? `<button type="button" class="scal-more" onclick="event.stopPropagation();scalMore('${iso}')">+${list.length - max} more</button>` : ''}
      <div class="scal-dots">${list.map(p => `<span class="dot" style="--c:${cols[p.net]}"></span>`).join('')}</div></div>`;
  }
  const dayList = scal.day && scal.day.slice(0, 7) === per.from.slice(0, 7) ? (by[scal.day] || []) : null;
  return `<div class="scal-dow">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div>${d}</div>`).join('')}</div><div class="scal-grid">${cells}</div>
    <div class="scal-agenda">${scal.day ? `<h4>${scalLong(scal.day)}</h4>${dayList && dayList.length ? dayList.map(p => scalTile(p, cols, 'wc')).join('') : '<div class="scal-empty">No posts this day.</div>'}` : '<div class="scal-empty">Tap a day to see its posts.</div>'}</div>`;
}

// List: the same posts as rows, to search and sort. Numbers read across.
function scalListRowsHtml(posts, cols) {
  const q = scal.q.toLowerCase().trim();
  let l = posts.filter(p => !q || p.cap.toLowerCase().includes(q));
  const f = scal.sort === 'likes' ? (a, b) => (b.likes || 0) - (a.likes || 0) : scal.sort === 'views' ? (a, b) => (b.views || 0) - (a.views || 0) : (a, b) => (b.at || b.date) < (a.at || a.date) ? -1 : 1;
  l = l.slice().sort(f);
  return `<div class="scal-lcount">${l.length} post${l.length === 1 ? '' : 's'}${q ? ` match “${mkEsc(scal.q.trim())}”` : ''}</div>` + (l.length ? l.map(p => {
    const cur = scal.sel === p.id ? ' aria-current="true"' : '';
    return `<button type="button" class="scal-lrow" data-id="${mkEsc(p.id)}" style="${scalStyle(p, cols)}" aria-label="${mkEsc(scalLabel(p))}"${cur} onclick="scalOpen(this.dataset.id)">
      <span class="d"><b>${scalShort(p.date)}</b><span>${scalClock(p.t) || 'Time not known'}</span></span>
      <span class="pc"><span class="scal-th">${scalImg(p)}${scalIsVideo(p) ? SCAL_PLAY : ''}</span><span class="tx"><span class="cp">${scalCap(p)}</span><span class="mini">${SOC_NETS[p.net]} · ${scalFmt(p.likes)} likes · ${scalFmt(p.views)} ${p.viewLabel.toLowerCase()}</span></span></span>
      <span class="pl"><span class="scal-bb" aria-hidden="true">${SCAL_CODE[p.net]}</span>${SOC_NETS[p.net]}</span>
      <span class="n">${scalFmt(p.likes)}</span><span class="n">${scalFmt(p.reposts)}</span><span class="n">${scalFmt(p.comments)}</span><span class="n">${scalFmt(p.views)}</span></button>`;
  }).join('') : '<div class="scal-empty" style="padding:16px 4px">No posts match.</div>');
}
function scalListHtml(posts, cols, per) {
  return `<div class="scal-list">
    <div class="scal-ltool">
      <input type="search" id="scalQ" placeholder="Search captions" aria-label="Search captions" value="${mkEsc(scal.q)}" oninput="scalSearch(this.value)">
      <select id="scalSort" aria-label="Sort by" onchange="scalSortBy(this.value)">${[['new', 'Newest first'], ['likes', 'Most likes'], ['views', 'Most views']].map(([k, l]) => `<option value="${k}"${scal.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${scal.view === 'list' && scal.scope === 'week' ? `<button type="button" class="sc-btn" onclick="scalWholeMonth()">Show the whole month</button>` : ''}
    </div>
    <div class="scal-lh"><span>Date</span><span>Post</span><span>Platform</span><span class="r">Likes</span><span class="r">Reposts</span><span class="r">Comments</span><span class="r">Views or impressions</span></div>
    <div id="scalRows">${scalListRowsHtml(posts, cols)}</div></div>`;
}

// The panel: one post. Verdict first, then the picture and the numbers it has.
function scalPanelHtml(p, cols, posts) {
  if (!p) return '';
  const mates = posts.filter(x => x.net === p.net && x.likes !== null), avg = mates.length >= 3 ? mates.reduce((a, x) => a + x.likes, 0) / mates.length : 0;
  let verdict = '';
  if (avg && p.likes !== null) { const r = p.likes / avg;
    verdict = r >= 1.5 ? `<div class="scal-verdict up">Did well: ${(Math.round(r * 10) / 10)} times the usual likes for ${SOC_NETS[p.net]} in this period.</div>`
      : r >= .8 ? `<div class="scal-verdict">About the usual likes for ${SOC_NETS[p.net]} in this period.</div>`
      : `<div class="scal-verdict down">Quieter than usual for ${SOC_NETS[p.net]} in this period.</div>`; }
  const nums = [['Likes', p.likes], [p.repostLabel, p.reposts], [p.viewLabel, p.views], ['Reach', p.reach], ['Comments', p.comments], ['Saves', p.saves]].filter(([, v]) => v !== null);
  const verb = p.net === 'instagram' ? 'Instagram' : p.net === 'facebook' ? 'Facebook' : 'TikTok';
  return `<aside class="scal-panel" role="dialog" aria-label="Post details" style="${scalStyle(p, cols)}">
    <div class="scal-ph"><span class="scal-b" aria-hidden="true">${SCAL_CODE[p.net]}</span>
      <div class="when"><b>${scalLong(p.date)}${p.t ? ', ' + scalClock(p.t) : ''}</b><span>${SOC_NETS[p.net]} ${SCAL_KIND[p.kind]}</span></div>
      <button type="button" class="scal-icon scal-close" aria-label="Close" onclick="scalClose()">×</button></div>
    <div class="scal-pb">
      ${verdict}
      <div class="scal-pic" ${p.img ? '' : 'style="min-height:160px"'}>${scalImg(p)}${scalIsVideo(p) ? `<span class="scal-vid">${SCAL_PLAY}</span>` : ''}</div>
      ${p.url ? `<a class="sc-btn scal-open" href="${mkEsc(p.url)}" target="_blank" rel="noopener">${scalIsVideo(p) ? 'Watch' : 'Open'} on ${verb}</a>` : ''}
      <p class="scal-pcap">${scalCap(p)}</p>
      <div><div class="scal-sec">How it did</div><div class="scal-nums">${nums.map(([l, v]) => `<div class="scal-num"><div class="v">${scalFmt(v)}</div><div class="l">${l}</div></div>`).join('')}</div></div>
    </div></aside><div class="scal-scrim" onclick="scalClose()"></div>`;
}

// ── Doing things ──────────────────────────────────────────────────────────────────
function scalOpen(id) { scal.sel = id; scal.focusPanel = true; scalPaint(); }
function scalClose() { scal.sel = null; scalPaint(); }
function scalPlat(n) {
  const allOn = SCAL_NETS.every(x => scal.on[x]);
  if (n === 'all') SCAL_NETS.forEach(x => { scal.on[x] = true; });
  else if (allOn) SCAL_NETS.forEach(x => { scal.on[x] = x === n; });
  else { const cnt = SCAL_NETS.filter(x => scal.on[x]).length; if (scal.on[n] && cnt === 1) return; scal.on[n] = !scal.on[n]; }
  scal.sel = null; scalSave(); scalPaint();
}
function scalView(v) {
  if (v === scal.view) return;
  const from = scal.view;
  if (v === 'week') scal.ws = scal.month === scalToday().slice(0, 7) ? scalMon(scalToday()) : scalMon(scal.month + '-01');
  else if (from === 'week') scal.month = scalAdd(scal.ws, 3).slice(0, 7);
  scal.scope = 'month'; scal.view = v; scal.sel = null; scal.day = null; scal.open = null; scalSave(); scalEnsure();
}
function scalNav(d) {
  if (scalPeriod().kind === 'week') scal.ws = scalAdd(scal.ws, 7 * d); else scal.month = scalShiftMonth(scal.month, d);
  scal.sel = null; scal.day = null; scal.open = null; scalEnsure();
}
function scalToToday() { const t = scalToday(); scal.ws = scalMon(t); scal.month = t.slice(0, 7); scal.sel = null; scal.day = null; scal.open = null; scalEnsure(); }
// The post count opens the posts behind it, for the same stretch of time.
function scalShowList() { scal.scope = scalPeriod().kind; scal.view = 'list'; scal.sel = null; scalSave(); scalEnsure(); }
function scalWholeMonth() { scal.month = scal.ws.slice(0, 7); scal.scope = 'month'; scalEnsure(); }
function scalDay(iso) { scal.day = iso; scalPaint(); }
function scalMore(iso) { scal.open = iso; scalPaint(); }
function scalSearch(v) {
  scal.q = v; const per = scalPeriod(), el = document.getElementById('scalRows');
  if (el) el.innerHTML = scalListRowsHtml(scalPosts(per), socCols());
}
function scalSortBy(v) { scal.sort = v; scalPaint(); }

// The page redraws for a theme change through socRepaint; the colours are read at draw time, so nothing else is needed here.
document.addEventListener('keydown', e => { if (e.key === 'Escape' && scal.sel && document.getElementById('scalRoot')) scalClose(); });

// ── Download (report-export.js): the posts on screen, XLSX and CSV ─────────────────────
function scalExport() {
  if (!scal.ws) return null;
  const per = scalPeriod(), posts = scalPosts(per).slice().sort((a, b) => (a.at || a.date) < (b.at || b.date) ? -1 : 1);
  if (!posts.length) return null;
  const rows = posts.map(p => ({ cells: [p.date, scalClock(p.t) || '', SOC_NETS[p.net], SCAL_KIND[p.kind], p.cap.replace(/\s+/g, ' ').slice(0, 300), p.likes, p.reposts, p.views, p.viewLabel, p.reach, p.comments, p.saves, p.url] }));
  return { name: ['social-posts', per.from, 'to', per.to].join('-'), csv: 0, sheets: [{ name: 'Posts', title: 'Social posts', subtitle: `${per.from} to ${per.to} · ${SCAL_NETS.filter(n => scal.on[n]).map(n => SOC_NETS[n]).join(', ')} · Dubai time. A blank is a number the app does not give for that post. Facebook posts report impressions; reels and the other apps report plays.`,
    blocks: [{ cols: [{ key: 'd', label: 'Date', fmt: 'text' }, { key: 't', label: 'Time', fmt: 'text' }, { key: 'n', label: 'Platform', fmt: 'text' }, { key: 'k', label: 'Type', fmt: 'text' }, { key: 'c', label: 'Caption', fmt: 'text' },
      { key: 'l', label: 'Likes', fmt: 'num' }, { key: 'r', label: 'Reposts or shares', fmt: 'num' }, { key: 'v', label: 'Views or impressions', fmt: 'num' }, { key: 'vl', label: 'Which one', fmt: 'text' }, { key: 'rc', label: 'Reach', fmt: 'num' },
      { key: 'cm', label: 'Comments', fmt: 'num' }, { key: 's', label: 'Saves', fmt: 'num' }, { key: 'u', label: 'Link', fmt: 'text' }], rows }] }] };
}
