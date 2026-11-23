// Social > Overview > How it is doing (Kate, 23 Nov 2026). Built from docs/mockups/social-overview.html in the cowork repo.
// Posts and stories side by side: one answer line, four tiles, average views by kind, views by week, scheduled against by hand,
// and the five that did best. Every figure opens the lines behind it (TRSD, js/drill.js) down to a single post or story.
//
// Where the numbers come from (read only, nothing is written):
//   posts            social_report (d.posts), the Social page's own call. The window before it is a second social_report call.
//   stories          content_calendar_story_stats(from, to): one row a story with views, reach, replies and taps. It answers 93 days at most,
//                    so a longer Period shows the story totals social_report already holds and the figures stay plain.
// "Scheduled or by hand" is the Content Calendar's own record (Kate, 23 Nov 2026: "we literally have the content calendar as basis"): metricool_posts.source,
// manual = posted by hand, metricool = scheduled in Metricool, and every story is posted live in the app so it counts as by hand. Metricool began telling us on
// 12 Aug 2026; older posts have no record and are left out of the two groups, never guessed.
// Facebook stories have no numbers in Metricool, so they are not here. YouTube has no post list.
let sgTab = 'posts', sgData = null, sgReq = 0, sgTipEl = null, sgTipT = null;
try { if (localStorage.getItem('trs-soc-glance-tab') === 'stories') sgTab = 'stories'; } catch (e) {}

const SG_PN = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
const SG_BD = { instagram: 'IG', facebook: 'FB', tiktok: 'TT' };
const SG_KL = { reel: 'Reel', post: 'Post', photo: 'Photo', video: 'Video' };
const SG_GROUPS = [['instagram', 'reel', 'Instagram reels'], ['instagram', 'post', 'Instagram posts'], ['facebook', 'post', 'Facebook posts'], ['facebook', 'reel', 'Facebook reels'], ['tiktok', 'video', 'TikTok videos'], ['tiktok', 'photo', 'TikTok photos']];
const sgN = v => Math.round(Number(v) || 0).toLocaleString('en-GB');
const sgSum = (a, f) => a.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const sgP100 = (a, b) => b ? Math.round(100 * a / b) : 0;
const sgTz = { timeZone: 'Asia/Dubai' };
const sgDayOf = at => new Date(at).toLocaleDateString('en-CA', sgTz);
const sgTimeOf = at => new Date(at).toLocaleTimeString('en-GB', { ...sgTz, hour: '2-digit', minute: '2-digit' });
const sgDays = (a, b) => Math.round((mkD(b) - mkD(a)) / 864e5) + 1;
const sgAdd = (iso, n) => { const d = mkD(iso); d.setDate(d.getDate() + n); return mkIso(d); };
const sgMon = iso => { const d = mkD(iso); return sgAdd(iso, -((d.getDay() + 6) % 7)); };
const sgRange = (a, b) => `${socDayY(a)} to ${socDayY(b)}`;
const sgPct = (cur, prev) => !prev ? null : Math.round((cur - prev) * 100 / prev);
const sgChgT = (cur, prev) => { const p = sgPct(cur, prev); return p === null ? 'none before' : p > 0 ? `up ${p}%` : p < 0 ? `down ${Math.abs(p)}%` : 'level'; };
const sgChg = (cur, prev) => { const p = sgPct(cur, prev); return p === null ? '<span class="sg-d">new</span>'
  : `<span class="sg-d ${p > 0 ? 'up' : p < 0 ? 'down' : ''}">${p > 0 ? '&#9650; up ' + p + '%' : p < 0 ? '&#9660; down ' + Math.abs(p) + '%' : 'level'}</span> <span>(was ${sgN(prev)})</span>`; };

function sgShapePosts(arr, srcMap) {
  const rows = (arr || []).filter(p => SG_PN[p.network] && p.kind !== 'story').map(p => {
    const kind = p.network === 'instagram' ? (p.kind === 'reel' ? 'reel' : 'post') : p.kind, at = Date.parse(p.posted_at) || 0;
    const l = Number(p.interactions) || 0, sv = Number(p.saves) || 0;
    return { net: p.network, kind, cap: String(p.caption || '').trim(), img: p.image_url || '', g: p.network + '_' + kind, src: srcMap ? (srcMap[p.url || (p.network + '|' + p.posted_at)] || null) : (p.source || null), d: p.post_date || sgDayOf(at), t: at ? sgTimeOf(at) : '', at, url: p.url,
      v: Number(p.views) || 0, r: Number(p.reach) || 0, l: Number(p.likes) || 0, c: Number(p.comments) || 0, s: Number(p.shares) || 0, sv, it: l + sv };
  });
  return rows;
}
// How a post went out: the same field the Content Calendar reads (metricool_posts.source). Older posts have none, so they are neither group.
function sgHow(rows) { rows.forEach(p => { p.sch = p.src === 'metricool'; p.man = p.src === 'manual'; }); return rows; }
const sgHowName = p => p.sch ? 'Scheduled in Metricool' : p.man ? 'Posted by hand' : 'Not recorded';
// How each post went out, and the stories, from the two calls the Content Calendar itself makes (content_calendar_posts and content_calendar_stories, 93 days at a time).
// The Social report's own post list does not carry the source. { src: { post url: 'manual' | 'metricool' }, stories: [{ net, d }] }.
let sgHowSrc = null, sgHowKey = null, sgHowBusy = null;
// Overview's Scheduled or by hand block can be one platform at a time (Kate, 23 Nov 2026): sgHowPart(net) draws it, sgHowSet(net) swaps it in place.
let sgHowPart = null, sgHowNet = 'all';
function sgHowSet(net) {
  sgHowNet = net;
  const box = document.getElementById('sgHowBox'); if (!box || !sgHowPart) return;
  const h = sgHowPart(net); box.innerHTML = h.html; h.wire(box);
}
const sgHowReady = () => (sgHowSrc && socData && sgHowKey === socData.win.from + '|' + socData.win.to) ? sgHowSrc : null;
function sgHowLoad() {
  const w = socData.win, key = w.from + '|' + w.to;
  if (sgHowReady()) return Promise.resolve(sgHowSrc);
  if (sgHowBusy && sgHowBusy.key === key) return sgHowBusy.p;
  const p = (async () => {
    const src = {}, stories = [];
    for (let a = w.from; a <= w.to;) {
      const b = sgAdd(a, 92) < w.to ? sgAdd(a, 92) : w.to;
      const [po, st] = await Promise.all([sb.rpc('content_calendar_posts', { p_from: a, p_to: b }), sb.rpc('content_calendar_stories', { p_from: a, p_to: b })]);
      if (po.error || st.error || !po.data) throw po.error || st.error || new Error('no data');
      (po.data.posts || []).forEach(x => { src[x.url || (x.network + '|' + x.posted_at)] = x.source || null; });
      (st.data || []).forEach(x => stories.push({ net: x.network, d: String(x.post_date).slice(0, 10), at: Date.parse(x.posted_at) || 0, img: x.image_url || '' }));
      a = sgAdd(b, 1);
    }
    const out = { src, stories };
    if (socData && socData.win.from + '|' + socData.win.to === key) { sgHowSrc = out; sgHowKey = key; }
    return out;
  })();
  sgHowBusy = { key, p };
  const done = () => { if (sgHowBusy && sgHowBusy.p === p) sgHowBusy = null; };
  p.then(done, done);
  return p;
}
function sgShapeStories(arr) {
  return (arr || []).filter(s => s.network === 'instagram').map(s => { const at = Date.parse(s.posted_at) || 0;
    return { d: sgDayOf(at), t: sgTimeOf(at), at, url: s.url, v: Number(s.views) || 0, r: Number(s.reach) || 0, tf: Number(s.taps_forward) || 0, tb: Number(s.taps_back) || 0, ex: Number(s.exits) || 0, rp: Number(s.replies) || 0 }; });
}
const sgAgg = rows => ({ n: rows.length, v: sgSum(rows, x => x.v), r: sgSum(rows, x => x.r), it: sgSum(rows, x => x.it) });
const sgStAgg = rows => ({ n: rows.length, v: sgSum(rows, x => x.v), r: sgSum(rows, x => x.r), tf: sgSum(rows, x => x.tf), tb: sgSum(rows, x => x.tb), ex: sgSum(rows, x => x.ex), rp: sgSum(rows, x => x.rp) });
const sgStTot = st => st ? { n: Number(st.n) || 0, v: Number(st.views) || 0, r: Number(st.reach) || 0, tf: Number(st.taps_forward) || 0, tb: Number(st.taps_back) || 0, ex: Number(st.exits) || 0, rp: Number(st.replies) || 0 } : { n: 0, v: 0, r: 0, tf: 0, tb: 0, ex: 0, rp: 0 };

// ── the windows a figure opens (TRSD): rows carry _dn = { column: the window it opens }, down to one post or one story ──
const sgSpec = (sk, title, sub, cols, rows, foot, note) => ({ sk, title, sub, views: [{ id: 'all', label: 'List', load: async () => ({ cols, rows, foot, note }) }] });
const SG_POSTCOLS = [{ k: 'd', l: 'Date', t: 'date' }, { k: 't', l: 'Time' }, { k: 'pl', l: 'Platform' }, { k: 'kd', l: 'Kind' }, { k: 'how', l: 'Went out' },
  { k: 'v', l: 'Views', t: 'num' }, { k: 'r', l: 'Reach', t: 'num' }, { k: 'l', l: 'Likes', t: 'num' }, { k: 'c', l: 'Comments', t: 'num' }, { k: 's', l: 'Shares', t: 'num' }, { k: 'sv', l: 'Saves', t: 'num' }, { k: 'u', l: 'Post', t: 'html' }];
const sgLink = (url, w) => url ? `<a href="${mkEsc(url)}" target="_blank" rel="noopener">Open ${w}</a>` : '';
function sgPostsSpec(sk, title, sub, rows) {
  const lines = rows.slice().sort((a, b) => b.at - a.at).map(p => ({ d: p.d, t: p.t, pl: SG_PN[p.net], kd: SG_KL[p.kind] || p.kind, how: sgHowName(p), v: p.v, r: p.r, l: p.l, c: p.c, s: p.s, sv: p.sv, u: sgLink(p.url, 'post') }));
  const foot = { d: 'Total', v: sgSum(rows, x => x.v), r: sgSum(rows, x => x.r), l: sgSum(rows, x => x.l), c: sgSum(rows, x => x.c), s: sgSum(rows, x => x.s), sv: sgSum(rows, x => x.sv) };
  return sgSpec(sk, title, sub, SG_POSTCOLS, lines, foot, 'This is the last step: a single post has nothing behind it.');
}
function sgGroupsSpec(sk, title, sub, rows) {
  const gs = SG_GROUPS.map(([n, k, name]) => { const a = rows.filter(p => p.net === n && p.kind === k); return a.length ? { name, a, ag: sgAgg(a) } : null; }).filter(Boolean);
  const dn = (name, a) => sgPostsSpec(sk + '.' + name.toLowerCase().replace(/\s+/g, '-'), name, sub + ', ' + a.length + ' posts', a);
  const lines = gs.map(g => { const s = dn(g.name, g.a); return { name: g.name, n: g.ag.n, v: g.ag.v, avg: Math.round(g.ag.v / g.ag.n), it: g.ag.it, _dn: { n: s, v: s, avg: s, it: s } }; });
  const T = sgAgg(rows), all = sgPostsSpec(sk + '.all', 'All posts', sub + ', ' + rows.length + ' posts', rows);
  return sgSpec(sk, title, sub + ', by platform and kind', [{ k: 'name', l: 'Platform and kind' }, { k: 'n', l: 'Posts', t: 'num' }, { k: 'v', l: 'Views', t: 'num' }, { k: 'avg', l: 'Average views', t: 'num' }, { k: 'it', l: 'Likes, comments, shares, saves', t: 'num' }],
    lines, { name: 'All posts', n: T.n, v: T.v, avg: T.n ? Math.round(T.v / T.n) : 0, it: T.it, _dn: { n: all, v: all, avg: all, it: all } });
}
const SG_STCOLS = [{ k: 'd', l: 'Day', t: 'date' }, { k: 't', l: 'Time' }, { k: 'v', l: 'Views', t: 'num' }, { k: 'r', l: 'Reach', t: 'num' }, { k: 'tf', l: 'Tapped forward', t: 'num' }, { k: 'tb', l: 'Tapped back', t: 'num' }, { k: 'ex', l: 'Left', t: 'num' }, { k: 'rp', l: 'Replies', t: 'num' }, { k: 'u', l: 'Story', t: 'html' }];
function sgStoriesSpec(sk, title, sub, rows) {
  const lines = rows.slice().sort((a, b) => a.at - b.at).map(s => ({ d: s.d, t: s.t, v: s.v, r: s.r, tf: s.tf, tb: s.tb, ex: s.ex, rp: s.rp, u: sgLink(s.url, 'story') }));
  const T = sgStAgg(rows);
  return sgSpec(sk, title, sub, SG_STCOLS, lines, { d: 'Total', v: T.v, r: T.r, tf: T.tf, tb: T.tb, ex: T.ex, rp: T.rp }, 'This is the last step: a single story has nothing behind it.');
}
function sgDaysSpec(sk, title, sub, rows, from, to) {
  const list = [];
  for (let d = from; d <= to; d = sgAdd(d, 1)) { const r = rows.filter(s => s.d === d), T = sgStAgg(r); list.push({ day: d, rows: r, T }); }
  const dn = x => x.rows.length ? sgStoriesSpec(sk + '.' + x.day, socDayY(x.day), x.rows.length + ' stories', x.rows) : null;
  const lines = list.map(x => { const s = dn(x); const line = { d: x.day, n: x.T.n, v: x.T.v, avg: x.T.n ? Math.round(x.T.v / x.T.n) : 0, tf: x.T.tf, tb: x.T.tb, ex: x.T.ex, rp: x.T.rp }; line._dn = s ? Object.fromEntries(['n', 'v', 'avg', 'tf', 'tb', 'ex', 'rp'].filter(k => line[k]).map(k => [k, s])) : null; return line; });
  const T = sgStAgg(rows), all = sgStoriesSpec(sk + '.all', title, sub, rows);
  return sgSpec(sk, title, sub, [{ k: 'd', l: 'Day', t: 'date' }, { k: 'n', l: 'Stories', t: 'num' }, { k: 'v', l: 'Views', t: 'num' }, { k: 'avg', l: 'Average views', t: 'num' }, { k: 'tf', l: 'Tapped forward', t: 'num' }, { k: 'tb', l: 'Tapped back', t: 'num' }, { k: 'ex', l: 'Left', t: 'num' }, { k: 'rp', l: 'Replies', t: 'num' }],
    lines, { d: 'Total', n: T.n, v: T.v, avg: T.n ? Math.round(T.v / T.n) : 0, tf: T.tf, tb: T.tb, ex: T.ex, rp: T.rp, _dn: { n: all, v: all, avg: all, tf: all, tb: all, ex: all, rp: all } });
}
// A figure with nothing behind it (zero, or no list for this Period) stays plain.
const sgNum = (txt, spec, n) => (spec && Number(n) !== 0) ? TRSD.num(txt, spec) : txt;

// ── the answer card a row gives on hover or focus (a tap on a phone) ──
function sgTip(el, fn) {
  el.setAttribute('tabindex', '0');
  const show = ev => { if (!sgTipEl) { sgTipEl = document.createElement('div'); sgTipEl.className = 'sg-tip'; sgTipEl.setAttribute('role', 'status'); document.body.appendChild(sgTipEl); }
    sgTipEl.innerHTML = fn(); sgTipEl.style.borderColor = getComputedStyle(el).getPropertyValue('--c') || ''; sgTipEl.hidden = false;
    if (innerWidth <= 760 || matchMedia('(hover:none)').matches) { sgTipEl.classList.add('tap'); clearTimeout(sgTipT); sgTipT = setTimeout(sgHideTip, 5000); return; }
    sgTipEl.classList.remove('tap');
    const r = el.getBoundingClientRect(), w = sgTipEl.offsetWidth, h = sgTipEl.offsetHeight; let x = (ev ? ev.clientX : r.left + r.width / 2) - w / 2, y = r.bottom + 10;
    x = Math.max(10, Math.min(x, innerWidth - w - 10)); if (y + h > innerHeight - 10) y = r.top - h - 10; sgTipEl.style.left = x + 'px'; sgTipEl.style.top = Math.max(10, y) + 'px'; };
  if (matchMedia('(hover:hover)').matches) { el.addEventListener('mouseenter', e => { el.classList.add('lit'); show(e); }); el.addEventListener('mousemove', e => { if (innerWidth > 760) show(e); }); el.addEventListener('mouseleave', () => { el.classList.remove('lit'); sgHideTip(); }); }
  el.addEventListener('focus', () => { el.classList.add('lit'); show(); }); el.addEventListener('blur', () => { el.classList.remove('lit'); sgHideTip(); });
  el.addEventListener('click', e => { if (e.target.closest('.dn,a,.sg-mini') || !(innerWidth <= 760 || matchMedia('(hover:none)').matches)) return; document.querySelectorAll('.sg .lit').forEach(x => x.classList.remove('lit')); el.classList.add('lit'); show(); });
}
function sgHideTip() { if (sgTipEl) sgTipEl.hidden = true; clearTimeout(sgTipT); }
document.addEventListener('click', e => { if (!e.target.closest('.sg-row,.sg-col,.sg-item,.sg-seg2')) { sgHideTip(); document.querySelectorAll('.sg .lit').forEach(x => x.classList.remove('lit')); } });

// ── loading: the Period before, and the stories one by one (at most two calls at a time) ──
async function sgLoad() {
  const w = socData.win, len = sgDays(w.from, w.to), pv = { from: sgAdd(w.from, -len), to: sgAdd(w.from, -1) }, key = w.from + '|' + w.to;
  if (sgData && sgData.key === key) return sgData;
  const ok = async p => { try { const r = await p; return r && !r.error ? r.data : null; } catch (e) { return null; } };
  const how = await sgHowLoad().catch(e => { console.error(e); return null; });
  const cur = sgHow(sgShapePosts(socData.posts, how && how.src));
  const [prevRep, curSt] = await Promise.all([ok(sb.rpc('social_report', { p_from: pv.from, p_to: pv.to })), len <= 93 ? ok(sb.rpc('content_calendar_story_stats', { p_from: w.from, p_to: w.to })) : null]);
  const prevSt = len <= 93 ? await ok(sb.rpc('content_calendar_story_stats', { p_from: pv.from, p_to: pv.to })) : null;
  const D = { key, w, pv, len, cur, howOk: !!how, howStories: how ? how.stories : [], prev: sgHow(sgShapePosts(prevRep && prevRep.posts)), prevOk: !!prevRep,
    st: curSt ? sgShapeStories(curSt) : null, stPrev: prevSt ? sgShapeStories(prevSt) : null,
    stTot: sgStTot((socData.stories || {}).instagram), stPrevTot: sgStTot(prevRep && (prevRep.stories || {}).instagram) };
  sgData = D; return D;
}

function socGlanceHtml() {
  return `<section class="slv-card sg" id="sgRoot" data-bh-own style="margin-bottom:14px"><p class="slv-muted">Loading how posts and stories are doing…</p></section>`;
}
async function socGlanceMount() {
  const root = document.getElementById('sgRoot'); if (!root) return;
  const my = ++sgReq;
  try { const D = await sgLoad(); if (my !== sgReq || !document.getElementById('sgRoot')) return; sgDraw(D); }
  catch (e) { console.error(e); if (my === sgReq && document.getElementById('sgRoot')) root.innerHTML = '<p class="slv-muted">How posts and stories are doing didn’t load. Refresh to try again.</p>'; }
}
function sgSetTab(t) { sgTab = t; try { localStorage.setItem('trs-soc-glance-tab', t); } catch (e) {} if (sgData) sgDraw(sgData); }

// bars by week (or by month when the Period is long)
function sgBuckets(from, to) {
  const days = sgDays(from, to), out = [];
  if (days <= 112) { for (let s = sgMon(from); s <= to; s = sgAdd(s, 7)) out.push({ from: s < from ? from : s, to: sgAdd(s, 6) > to ? to : sgAdd(s, 6), label: mkD(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), full: 'Week of ' + socDayY(s) }); }
  else { const a = mkD(from); for (let d = new Date(a.getFullYear(), a.getMonth(), 1); mkIso(d) <= to; d.setMonth(d.getMonth() + 1)) { const s = mkIso(d), e = mkIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    out.push({ from: s < from ? from : s, to: e > to ? to : e, label: d.toLocaleDateString('en-GB', { month: 'short' }), full: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }); } }
  return out;
}
function sgBars(b, rowsOf, valOf, openOf, said) {
  const vals = b.map(x => valOf(rowsOf(x))), max = Math.max(1, ...vals);
  const cols = b.map((x, i) => `<button type="button" class="sg-col" data-i="${i}" style="--c:var(--sg-ig)"><span class="sg-cv">${sgN(vals[i])}</span><span class="sg-cb" style="height:${Math.max(1, Math.round(vals[i] * 100 / max))}%"></span><span class="sg-cl">${mkEsc(x.label)}</span></button>`).join('');
  const rows = b.map((x, i) => `<div class="sg-row" data-i="${i}" style="--c:var(--sg-ig)"><span class="sg-nm">${mkEsc(x.full)}</span><span class="sg-trk"><span class="sg-fill" style="width:${Math.max(1, Math.round(vals[i] * 100 / max))}%"></span></span>${sgNum(sgN(vals[i]), openOf(x, rowsOf(x)), vals[i])}<span class="sg-n"></span></div>`).join('');
  return { html: `<div class="sg-cols" style="grid-template-columns:repeat(${Math.min(b.length, 16)},minmax(0,1fr))" role="group" aria-label="Views by week">${cols}</div><div class="sg-weekrows">${rows}</div>`,
    wire(root) { root.querySelectorAll('.sg-col,.sg-weekrows .sg-row').forEach(el => { const i = +el.dataset.i, x = b[i]; sgTip(el, () => said(x, rowsOf(x), vals[i]));
      if (el.classList.contains('sg-col')) el.addEventListener('click', () => { if (vals[i]) TRSD.open(openOf(x, rowsOf(x))); }); }); } };
}

function sgDraw(D) {
  const root = document.getElementById('sgRoot'); if (!root) return;
  const w = D.w, cols = socCols(), stRows = D.st, hasRows = !!stRows;
  document.documentElement.style.setProperty('--sg-ig', cols.instagram);
  const tabs = `<div class="sc-seg" role="group" aria-label="Posts or stories">${[['posts', 'Posts'], ['stories', 'Stories']].map(([k, l]) => `<button type="button" class="${sgTab === k ? 'on' : ''}" onclick="sgSetTab('${k}')">${l}</button>`).join('')}</div>`;
  const head = `<div class="slv-head"><div><div class="slv-eyebrow">Last ${D.len} days · against the ${D.len} before</div><h3>Overview</h3></div><div class="sg-tools">${tabs}${typeof rexButtons === 'function' ? rexButtons('sgExport') : ''}</div></div>
    <p class="slv-note" style="margin-top:0">${mkEsc(sgRange(w.from, w.to))}, against ${mkEsc(sgRange(D.pv.from, D.pv.to))}.</p>`;
  const body = sgTab === 'posts' ? sgPostsHtml(D, cols) : sgStoriesHtml(D, cols);
  root.innerHTML = head + body.html;
  body.wire(root);
}

// ── POSTS ──
function sgPostsHtml(D, cols) {
  const w = D.w, cur = D.cur, prv = D.prev, A = sgAgg(cur), B = sgAgg(prv), sub = sgRange(w.from, w.to), nets = ['instagram', 'facebook', 'tiktok'];
  if (!cur.length) return { html: '<p class="slv-muted">Nothing was posted in these dates.</p>', wire() {} };
  const byNet = Object.fromEntries(nets.map(n => [n, cur.filter(x => x.net === n)]));
  const lead = nets.slice().sort((a, b) => sgAgg(byNet[b]).v - sgAgg(byNet[a]).v)[0], share = sgP100(sgAgg(byNet[lead]).v, A.v);
  const top = cur.slice().sort((a, b) => b.v - a.v)[0], topShare = A.v ? top.v / A.v : 0, wo = (A.v - top.v) / Math.max(1, A.n - 1);
  const ans = `<b>${SG_PN[lead]} brought ${share} of every 100 views</b> that our posts got on Instagram, Facebook and TikTok. Together ${A.n} post${A.n === 1 ? '' : 's'} got ${sgN(A.v)} views. ` +
    (topShare > .25 && A.n > 3 ? `One ${(SG_KL[top.kind] || top.kind).toLowerCase()} (${socDayY(top.d)}) took ${sgN(top.v)} of them, but reached only ${sgN(top.r)} accounts.` : `The best one was the ${SG_PN[top.net]} ${(SG_KL[top.kind] || top.kind).toLowerCase()} on ${socDayY(top.d)}, ${sgN(top.v)} views.`);
  const ask = topShare > .25 && A.n > 3 ? `Worth asking: without that one, the other ${A.n - 1} posts averaged ${sgN(wo)} views each. Which of the rest do you want to repeat?` : 'Worth asking: which of these do you want to repeat next week?';
  const specAll = sgPostsSpec('glance-posts', 'Posts published', sub, cur), g = (sk, t) => sgGroupsSpec(sk, t, sub, cur);
  const vSpec = g('glance-views', 'Views'), aSpec = g('glance-average', 'Average views a post'), iSpec = g('glance-likes', 'Likes, comments, shares and saves');
  const tile = (l, v, txt, spec, c, extra) => `<div class="sg-tile"><span class="sg-l">${l}</span><span class="sg-v">${sgNum(txt, spec, v)}</span><span class="sg-c">${c}</span>${extra ? `<span class="sg-c">${extra}</span>` : ''}</div>`;
  const tiles = `<div class="sg-tiles">${tile('Posts published', A.n, sgN(A.n), specAll, D.prevOk ? sgChg(A.n, B.n) : '', `Instagram ${byNet.instagram.length}, Facebook ${byNet.facebook.length}, TikTok ${byNet.tiktok.length}`)}
    ${tile('Views', A.v, sgN(A.v), vSpec, D.prevOk ? sgChg(A.v, B.v) : '')}${tile('Average views a post', A.n, sgN(A.v / A.n), aSpec, D.prevOk && B.n ? sgChg(A.v / A.n, B.v / B.n) : '')}${tile('Likes, comments, shares, saves', A.it, sgN(A.it), iSpec, D.prevOk ? sgChg(A.it, B.it) : '')}</div>`;
  // average views by kind, a tick for the Period before
  const gs = SG_GROUPS.map(([n, k, name]) => { const a = cur.filter(x => x.net === n && x.kind === k), b = prv.filter(x => x.net === n && x.kind === k); if (!a.length) return null; const ag = sgAgg(a), bg = sgAgg(b);
    return { n, name, rows: a, cnt: ag.n, avg: ag.v / ag.n, pavg: b.length ? bg.v / bg.n : null, pn: b.length, best: a.slice().sort((x, y) => y.v - x.v)[0] }; }).filter(Boolean).sort((x, y) => y.avg - x.avg);
  const mx = Math.max(1, ...gs.map(x => Math.max(x.avg, x.pavg || 0)));
  const kindRows = gs.map(x => { const sp = sgPostsSpec('glance-' + x.name.toLowerCase().replace(/\s+/g, '-'), x.name, `${sub}, ${x.cnt} posts`, x.rows);
    return `<div class="sg-row" data-g="${mkEsc(x.name)}" style="--c:${cols[x.n]}"><span class="sg-nm">${socLogo(x.n, cols[x.n])}${x.name}</span><span class="sg-trk"><span class="sg-fill" style="width:${Math.round(x.avg * 100 / mx)}%"></span>${x.pavg != null ? `<span class="sg-tick" style="left:${Math.round(x.pavg * 100 / mx)}%"></span>` : ''}</span>${sgNum(sgN(x.avg), sp, x.avg)}<span class="sg-n">${sgNum(x.cnt + ' posts', sp, x.cnt)}</span></div>`; }).join('');
  // views each week
  const bk = sgBuckets(w.from, w.to), inB = x => cur.filter(p => p.d >= x.from && p.d <= x.to);
  const WB = sgBars(bk, inB, rs => sgSum(rs, p => p.v), (x, rs) => rs.length ? sgPostsSpec('glance-' + x.from, x.full, rs.length + ' posts', rs) : null,
    (x, rs, v) => `<b>${mkEsc(x.full)}</b>${rs.length ? `${rs.length} posts, ${sgN(v)} views, ${sgN(v / rs.length)} a post.` : 'No posts in these dates.'}`);
  // scheduled or by hand: the Content Calendar's own record; older posts have none and stay out of both
  const med = a => { const s = a.map(x => x.v).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[(n >> 1) - 1] + s[n >> 1]) / 2) : 0; };
  const avgV = a => a.length ? sgAgg(a).v / a.length : 0, avgI = a => a.length ? sgAgg(a).it / a.length : 0;
  const MS = [['Median views a post', med], ['Average views a post', avgV], ['Average likes, comments, shares, saves', avgI]];
  const hp = net => {
    const pc = net === 'all' ? cur : cur.filter(x => x.net === net);
    const Sx = pc.filter(x => x.sch), Mx = pc.filter(x => x.man), Ux = pc.filter(x => !x.sch && !x.man);
    const stN = D.howStories.filter(x => net === 'all' || x.net === net).length;
    const seg = `<div class="sc-seg sg-pf" role="group" aria-label="Platform">${[['all', 'All'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']].map(([k, l]) => `<button type="button" class="${net === k ? 'on' : ''}" aria-pressed="${net === k}" onclick="sgHowSet('${k}')">${l}</button>`).join('')}</div>`;
    if (net === 'youtube') return { html: `${seg}<p class="sg-hint">YouTube has no post list in Metricool, only the channel’s numbers, so there is nothing to split into scheduled and by hand.</p>`, wire() {} };
    const small = Math.min(Sx.length, Mx.length) < 10, who = net === 'all' ? '' : ` on ${SG_PN[net]}`;
    const cmp = MS.map(([h, f], mi) => { const a = f(Sx), b = f(Mx), m2 = Math.max(a, b) || 1;
      return `<div><div class="sg-mh">${h}</div>${[['s', 'Scheduled in Metricool', Sx, a, sgSchedC().s], ['m', 'Posted by hand', Mx, b, sgSchedC().h]].map(([k, n, rs, v, c]) => { const sp = sgPostsSpec('glance-' + (k === 's' ? 'scheduled' : 'by-hand') + (net === 'all' ? '' : '-' + net), n + ' posts', `${sub}, ${rs.length} posts (${n.toLowerCase()}${who})`, rs);
        return `<div class="sg-row sg-r2" data-m="${mi}${k}" style="--c:${c}"><span class="sg-nm">${n}</span><span class="sg-trk"><span class="sg-fill" style="width:${Math.round(v * 100 / m2)}%"></span></span>${sgNum(sgN(v), sp, v)}<span class="sg-n">${sgNum(rs.length + ' posts', sp, rs.length)}</span></div>`; }).join('')}</div>`; }).join('');
    const hint = D.howOk ? `How a post went out is the Content Calendar's own record. Metricool began telling us on 12 Aug 2026, so ${Ux.length ? `${Ux.length} older ${Ux.length === 1 ? 'post is' : 'posts are'} left out` : 'no post here is older'}. ${stN ? `${sgN(stN)} ${net === 'all' ? '' : SG_PN[net] + ' '}${stN === 1 ? 'story was' : 'stories were'} posted live in the app, so ${stN === 1 ? 'it counts' : 'they all count'} as posted by hand.` : ''}` : 'Could not read how the posts went out just now. Refresh to try again.';
    return { html: `${seg}<p class="sg-hint">${hint}</p>
      ${small ? `<p class="sg-hint"><span class="sg-tag warn">Small group</span> Only ${Math.min(Sx.length, Mx.length)} ${Sx.length < Mx.length ? 'scheduled' : 'by hand'} posts, too few to say which is better.</p>` : ''}
      <p class="sg-hint"><b>${Sx.length} scheduled in Metricool, ${Mx.length} posted by hand${who}.</b> Median views a post: ${sgN(med(Sx))} scheduled, ${sgN(med(Mx))} by hand.</p><div class="sg-grid sg-g3">${cmp}</div>`,
    wire(r) {
      r.querySelectorAll('.sg-r2').forEach(el => { const id = el.dataset.m, f = MS[+id[0]][1], h = MS[+id[0]][0], s = id[1] === 's';
        sgTip(el, () => `<b>${s ? 'Scheduled in Metricool' : 'Posted by hand'}</b>${(s ? Sx : Mx).length} posts. ${h}: ${sgN(f(s ? Sx : Mx))}, against ${sgN(f(s ? Mx : Sx))} for ${s ? 'posts by hand' : 'scheduled posts'}.`); });
    } };
  };
  sgHowPart = hp;
  const hpNow = hp(sgHowNet);
  // did best
  const tops = cur.slice().sort((a, b) => b.v - a.v).slice(0, 5), gavg = {}; SG_GROUPS.forEach(([n, k]) => { const a = cur.filter(x => x.net === n && x.kind === k); if (a.length) gavg[n + '_' + k] = sgAgg(a).v / a.length; });
  const best = tops.map((p, i) => `<div class="sg-item" data-p="${i}" style="--c:${cols[p.net]}"><span class="sg-bd" role="img" aria-label="${SG_PN[p.net]}">${socLogo(p.net)}</span><div><div class="sg-it">${SG_KL[p.kind] || p.kind}, ${mkEsc(socDayY(p.d))} at ${p.t} <span class="sg-tag">${sgHowName(p)}</span></div>
      <div class="sg-is">${sgN(p.l)} likes · ${sgN(p.c)} comments · ${sgN(p.s)} shares · ${sgN(p.sv)} saves · reach ${sgN(p.r)}</div>${p.r > 0 && p.v / p.r >= 8 ? `<div class="sg-flag"><span class="sg-tag warn">Views are ${Math.round(p.v / p.r)} times the reach</span></div>` : ''}</div>
      <div class="sg-go"><span class="sg-big2">${sgN(p.v)}</span>${p.url ? `<a class="sc-btn sg-mini" href="${mkEsc(p.url)}" target="_blank" rel="noopener">Open post</a>` : ''}</div></div>`).join('');
  const html = `<div class="sg-ans"><div class="slv-eyebrow">The answer in one line</div><div class="sg-big">${ans}</div><p class="sg-ask">${ask}</p></div>${tiles}
    <div class="sg-grid"><div class="sg-card"><h4>Average views a post, by kind</h4><p class="sg-hint">The thin line marks the Period before. Hover a row for the answer.</p>${kindRows}</div>
      <div class="sg-card"><h4>Views each ${bk.length && sgDays(w.from, w.to) > 112 ? 'month' : 'week'}</h4><p class="sg-hint">Tap a bar to see its posts.</p>${WB.html}</div></div>
    <div class="sg-sec"><div class="slv-eyebrow">Scheduled or by hand</div><h3>Scheduled or by hand</h3><div id="sgHowBox">${hpNow.html}</div></div>
    <div class="sg-sec"><h3>Did best</h3><p class="sg-hint">The five posts with the most views in these dates.</p>${best}</div>
    <p class="slv-note">Not here: YouTube (Metricool gives totals only, not a list of videos). Facebook reels have no reach figure. How a post went out is the Content Calendar's own record.</p>`;
  return { html, wire(r) {
    r.querySelectorAll('.sg-card .sg-row[data-g]').forEach(el => { const x = gs.find(q => q.name === el.dataset.g);
      sgTip(el, () => `<b>${x.name}</b>${x.cnt} posts, ${sgN(x.avg)} views each on average, ${x.pavg != null ? sgChgT(x.avg, x.pavg) + ` (before: ${sgN(x.pavg)} each, ${x.pn} posts)` : 'none in the Period before'}. Best: ${socDayY(x.best.d)}, ${sgN(x.best.v)} views.`); });
    WB.wire(r);
    hpNow.wire(r);
    r.querySelectorAll('.sg-item').forEach(el => { const p = tops[+el.dataset.p], key = p.net + '_' + p.kind, ratio = p.v / gavg[key];
      sgTip(el, () => `<b>${SG_PN[p.net]} ${(SG_KL[p.kind] || p.kind).toLowerCase()}, ${mkEsc(socDayY(p.d))}</b>${sgN(p.v)} views, ${ratio >= 1.2 ? ratio.toFixed(1) + ' times' : ratio >= .8 ? 'about' : 'less than'} the usual for ${SG_PN[p.net].toLowerCase()} ${(SG_KL[p.kind] || p.kind).toLowerCase()}s (${sgN(gavg[key])}).${p.r > 0 && p.v / p.r >= 8 ? ` Only ${sgN(p.r)} accounts were reached, so most views are not different people.` : ''}`); });
  } };
}

// ── STORIES ──
function sgStoriesHtml(D, cols) {
  const w = D.w, sub = sgRange(w.from, w.to), rows = D.st, has = !!rows;
  const A = has ? sgStAgg(rows) : D.stTot, B = D.stPrev ? sgStAgg(D.stPrev) : D.stPrevTot;
  if (!A.n) return { html: '<p class="slv-muted">No Instagram stories in these dates.</p>', wire() {} };
  const days = []; if (has) for (let d = w.from; d <= w.to; d = sgAdd(d, 1)) { const r = rows.filter(s => s.d === d); days.push({ d, rows: r, n: r.length, v: sgSum(r, s => s.v), tf: sgSum(r, s => s.tf), ex: sgSum(r, s => s.ex) }); }
  const busy = days.filter(x => x.n >= 15), quiet = days.filter(x => x.n > 0 && x.n <= 8);
  const avgOf = l => l.length ? sgSum(l, x => x.v) / sgSum(l, x => x.n) : 0;
  const ans = `<b>${sgN(A.n)} Instagram stories</b>, ${sgChgT(A.n, B.n)} on the Period before. Each got about ${sgN(A.v / A.n)} views. ${sgP100(A.tf, A.v)} in every 100 views tapped forward and ${sgP100(A.ex, A.v)} in every 100 left.`;
  const ask = busy.length && quiet.length ? `Worth asking: on the ${busy.length} days with 15 or more stories, each story averaged ${sgN(avgOf(busy))} views. On the ${quiet.length} days with 8 or fewer, ${sgN(avgOf(quiet))}. Is the longer run worth it?` : 'Worth asking: which of these stories do you want to make more of?';
  const dspec = (sk, t) => has ? sgDaysSpec(sk, t, sub, rows, w.from, w.to) : null;
  const tile = (l, v, txt, spec, c) => `<div class="sg-tile"><span class="sg-l">${l}</span><span class="sg-v">${sgNum(txt, spec, v)}</span><span class="sg-c">${c}</span></div>`;
  const hasPrev = D.stPrev || D.prevOk;
  const tiles = `<div class="sg-tiles">${tile('Stories posted', A.n, sgN(A.n), dspec('glance-stories', 'Stories posted'), hasPrev ? sgChg(A.n, B.n) : '')}${tile('Views', A.v, sgN(A.v), dspec('glance-story-views', 'Story views'), hasPrev ? sgChg(A.v, B.v) : '')}
    ${tile('Average views a story', A.n, sgN(A.v / A.n), dspec('glance-story-average', 'Average views a story'), hasPrev && B.n ? sgChg(A.v / A.n, B.v / B.n) : '')}${tile('Replies', A.rp, sgN(A.rp), dspec('glance-story-replies', 'Story replies'), hasPrev ? sgChg(A.rp, B.rp) : '')}</div>`;
  const oth = Math.max(0, A.v - A.tf - A.tb - A.ex), poth = Math.max(0, B.v - B.tf - B.tb - B.ex);
  const PARTS = [{ k: 'tf', c: cols.instagram, name: 'Tapped forward', sub: 'moved on to the next story', n: A.tf, p: B.tf, says: 'They moved on to the next story.' },
    { k: 'ex', c: socDark() ? '#FF9D7A' : '#B5532E', name: 'Left the stories', sub: 'closed it or swiped to another account', n: A.ex, p: B.ex, says: 'They closed it or swiped to another account.' },
    { k: 'tb', c: socDark() ? '#8FB8FF' : '#2F62B5', name: 'Tapped back', sub: 'went back to the one before', n: A.tb, p: B.tb, says: 'They went back to watch the one before.' },
    { k: 'ot', c: socDark() ? '#9A97A6' : '#8A847B', name: 'No tap counted', sub: 'Instagram gave no tap for these', n: oth, p: poth, says: 'Instagram did not count a tap for these views.' }];
  const parts = `<div class="sg-stack" role="img" aria-label="What viewers did">${PARTS.map(x => `<span class="sg-seg2" data-k="${x.k}" style="--n:${x.n};--c:${x.c}"></span>`).join('')}</div>` +
    PARTS.map(x => `<div class="sg-row" data-k="${x.k}" style="--c:${x.c}"><span class="sg-nm">${x.name}<small>${x.sub}</small></span><span class="sg-trk"><span class="sg-fill" style="width:${sgP100(x.n, A.v)}%"></span></span>${sgNum(sgN(x.n), dspec('glance-' + x.k, x.name), x.n)}<span class="sg-n">${sgP100(x.n, A.v)}%</span></div>`).join('');
  let weeks = '<p class="sg-hint">Views by week need a Period of 93 days or less, so the stories can be listed one by one.</p>', WB = null;
  if (has) { const bk = sgBuckets(w.from, w.to), inB = x => rows.filter(s => s.d >= x.from && s.d <= x.to);
    WB = sgBars(bk, inB, rs => sgSum(rs, s => s.v), (x, rs) => rs.length ? sgDaysSpec('glance-' + x.from, x.full, rs.length + ' stories, ' + sgN(sgSum(rs, s => s.v)) + ' views', rs, x.from, x.to) : null,
      (x, rs, v) => `<b>${mkEsc(x.full)}</b>${rs.length} stories, ${sgN(v)} views, ${rs.length ? sgN(v / rs.length) : 0} a story, ${sgSum(rs, s => s.rp)} replies.`);
    weeks = '<p class="sg-hint">Tap a bar to see its days.</p>' + WB.html; }
  // many stories or few
  const groups = [['15 or more a day', busy, cols.instagram], ['8 or fewer a day', quiet, cols.tiktok]].filter(g => g[1].length);
  const MS = [['Average views a story', l => avgOf(l)], ['Tapped forward, in every 100 views', l => 100 * sgSum(l, x => x.tf) / sgSum(l, x => x.v)], ['Left, in every 100 views', l => 100 * sgSum(l, x => x.ex) / sgSum(l, x => x.v)]];
  const cmp = groups.length === 2 ? `<div class="sg-grid sg-g3">${MS.map(([h, f], mi) => { const m2 = Math.max(...groups.map(g => f(g[1]))) || 1;
    return `<div><div class="sg-mh">${h}</div>${groups.map(([n, l, c], gi) => { const sp = has ? sgDaysSpec('glance-' + (gi ? 'quiet' : 'busy'), n, `${sub}, ${l.length} days`, l.reduce((a, d) => a.concat(d.rows), []), w.from, w.to) : null;
      return `<div class="sg-row sg-r2" data-m="${mi}${gi}" style="--c:${c}"><span class="sg-nm">${n}</span><span class="sg-trk"><span class="sg-fill" style="width:${Math.round(f(l) * 100 / m2)}%"></span></span>${sgNum(sgN(f(l)), sp, f(l))}<span class="sg-n">${sgNum(l.length + ' days', sp, l.length)}</span></div>`; }).join('')}</div>`; }).join('')}</div>` : '<p class="sg-hint">Not enough busy and quiet days in these dates to compare. Pick a longer Period.</p>';
  const tops = has ? rows.slice().sort((a, b) => b.v - a.v).slice(0, 5) : [];
  const best = tops.map((s, i) => { const taps = s.tf + s.tb + s.ex, few = taps < s.v * .5;
    return `<div class="sg-item" data-i="${i}" style="--c:${cols.instagram}"><span class="sg-bd" role="img" aria-label="Instagram">${socLogo('instagram')}</span><div><div class="sg-it">Story, ${mkEsc(socDayY(s.d))} at ${s.t}</div><div class="sg-is">${sgN(s.tf)} tapped forward · ${sgN(s.tb)} back · ${sgN(s.ex)} left · ${sgN(s.rp)} replies · reach ${sgN(s.r)}</div>${few ? `<div class="sg-flag"><span class="sg-tag warn">Few taps counted: ${sgN(taps)} of ${sgN(s.v)} views</span></div>` : ''}</div>
      <div class="sg-go"><span class="sg-big2">${sgN(s.v)}</span>${s.url ? `<a class="sc-btn sg-mini" href="${mkEsc(s.url)}" target="_blank" rel="noopener">Open story</a>` : ''}</div></div>`; }).join('');
  const html = `<div class="sg-ans"><div class="slv-eyebrow">The answer in one line</div><div class="sg-big">${ans}</div><p class="sg-ask">${ask}</p></div>${tiles}
    <div class="sg-grid"><div class="sg-card"><h4>What viewers did</h4><p class="sg-hint">Out of ${sgN(A.v)} views. Hover a part for the answer.</p>${parts}</div>
      <div class="sg-card"><h4>Views each ${has && sgDays(w.from, w.to) > 112 ? 'month' : 'week'}</h4>${weeks}</div></div>
    <div class="sg-sec"><h3>Many stories or few</h3><p class="sg-hint">Days with a long run of stories next to days with only a few. Stories are posted live in the app, so they all count as posted by hand.</p>${cmp}</div>
    ${has ? `<div class="sg-sec"><h3>Did best</h3><p class="sg-hint">The five stories with the most views in these dates.</p>${best}</div>` : ''}
    <p class="slv-note">Not here: Facebook stories (Metricool gives no numbers for them). Taps are counted for most views, not all.${has ? '' : ' The stories could not be listed one by one for this Period, so the figures are plain.'}</p>`;
  return { html, wire(r) {
    r.querySelectorAll('.sg-card [data-k]').forEach(el => { const x = PARTS.find(q => q.k === el.dataset.k);
      el.addEventListener('mouseenter', () => r.querySelectorAll(`.sg-card [data-k="${x.k}"]`).forEach(q => q.classList.add('lit'))); el.addEventListener('mouseleave', () => r.querySelectorAll(`.sg-card [data-k="${x.k}"]`).forEach(q => q.classList.remove('lit')));
      sgTip(el, () => `<b>${x.name}</b>${sgN(x.n)} of ${sgN(A.v)} views, ${sgP100(x.n, A.v)} in every 100 (before: ${sgP100(x.p, B.v)} in every 100). ${x.says}`); });
    if (WB) WB.wire(r);
    r.querySelectorAll('.sg-r2').forEach(el => { const g = groups[+el.dataset.m[1]]; sgTip(el, () => `<b>${g[0]}</b>${g[1].length} days, ${sgSum(g[1], d => d.n)} stories, ${sgN(avgOf(g[1]))} views each on average.`); });
    r.querySelectorAll('.sg-item').forEach(el => { const s = tops[+el.dataset.i]; sgTip(el, () => `<b>Story, ${mkEsc(socDayY(s.d))} at ${s.t}</b>${sgN(s.v)} views, ${(s.v / (A.v / A.n)).toFixed(1)} times the usual ${sgN(A.v / A.n)}. ${s.tf + s.tb + s.ex < s.v * .5 ? `Only ${sgN(s.tf + s.tb + s.ex)} taps were counted, so most views did not tap through.` : 'Most viewers tapped through.'}`); });
  } };
}

// The section's own download: what is on screen, as a workbook (Posts or Stories, whichever is open), added to the Social page's workbook too.
function sgExport() {
  const D = sgData; if (!D) return null;
  const sub = sgRange(D.w.from, D.w.to) + '.';
  if (sgTab === 'posts') {
    const rows = D.cur.slice().sort((a, b) => b.at - a.at); if (!rows.length) return null;
    return { name: ['social-posts', D.w.from, 'to', D.w.to].join('-'), csv: 0, sheets: [{ name: 'Posts', title: 'How the posts did', subtitle: sub + ' How it went out is the Content Calendar\'s own record; posts before 12 Aug 2026 are not recorded.',
      blocks: [{ cols: [{ label: 'Date', fmt: 'text' }, { label: 'Time', fmt: 'text' }, { label: 'Platform', fmt: 'text' }, { label: 'Kind', fmt: 'text' }, { label: 'Went out', fmt: 'text' }, { label: 'Views', fmt: 'num' }, { label: 'Reach', fmt: 'num' }, { label: 'Likes', fmt: 'num' }, { label: 'Comments', fmt: 'num' }, { label: 'Shares', fmt: 'num' }, { label: 'Saves', fmt: 'num' }],
        rows: rows.map(p => ({ cells: [p.d, p.t, SG_PN[p.net], SG_KL[p.kind] || p.kind, sgHowName(p), p.v, p.r, p.l, p.c, p.s, p.sv] })) }] }] };
  }
  const rows = D.st; if (!rows || !rows.length) return null;
  return { name: ['social-stories', D.w.from, 'to', D.w.to].join('-'), csv: 0, sheets: [{ name: 'Stories', title: 'How the Instagram stories did', subtitle: sub,
    blocks: [{ cols: [{ label: 'Date', fmt: 'text' }, { label: 'Time', fmt: 'text' }, { label: 'Views', fmt: 'num' }, { label: 'Reach', fmt: 'num' }, { label: 'Tapped forward', fmt: 'num' }, { label: 'Tapped back', fmt: 'num' }, { label: 'Left', fmt: 'num' }, { label: 'Replies', fmt: 'num' }],
      rows: rows.slice().sort((a, b) => a.at - b.at).map(s => ({ cells: [s.d, s.t, s.v, s.r, s.tf, s.tb, s.ex, s.rp] })) }] }] };
}

// ── Platform tabs: scheduled or by hand (Kate, 23 Nov 2026: "for each soc med graph add another graph for scheduled vs manual posting") ──
// One more chart under Views on Instagram, TikTok and Facebook: posts a day (or a week, as the toggle above) split into scheduled in Metricool and posted by hand, the Content Calendar's own record
// (see the top of this file), with the stories a day beside them: stories are posted live in the app, so they are by hand. YouTube has no post list in Metricool, so it says so.
let sgSchedSrc = null, sgSchedRows = null;
// All | Stories | Posts (Kate, 23 Nov 2026): the stories are so many that they hide the posts, so the chart can show either one alone. TikTok has no stories, so it has no switch.
let sgSchedView = 'all';
// Scheduled in Metricool is the brand yellow, posted by hand the brand violet (Kate, 23 Nov 2026). The dark theme uses the brand tokens themselves (butter #EEF3C7, lavender #C4B5FD);
// the light theme uses their deeper partners so the bars still show on white (the dashboard's gold #C99A2E and violet #7C5CD4).
// Posts as a whole are the brand blue (turquoise, like the Reach line) and stories the brand pink (coral), Kate, 23 Nov 2026.
const sgSchedC = () => (socDark() ? { s: '#EEF3C7', h: '#C4B5FD', p: '#99F6E4', t: '#FF9B9B' } : { s: '#C99A2E', h: '#7C5CD4', p: '#0F6E56', t: '#E0707A' });
function sgSchedSet(v) {
  sgSchedView = v;
  const box = document.getElementById('socSchedBox'); if (!box || typeof socTab === 'undefined') return;
  if (socCharts.sched) { socCharts.sched.destroy(); socCharts.sched = null; }
  box.innerHTML = sgSchedInner(socTab, socCols());
  sgSchedDraw(socTab);
}
function sgSchedPosts() {
  const how = sgHowReady(); if (!how) return [];
  if (sgSchedSrc !== how) { sgSchedRows = sgHow(sgShapePosts(socData.posts, how.src)); sgSchedSrc = how; }
  return sgSchedRows;
}
// The stories a platform had in these dates (Instagram and Facebook; TikTok has none), from the Content Calendar's own call.
function sgSchedStories(net) { const how = sgHowReady(); return how ? how.stories.filter(x => x.net === net) : []; }
function sgSchedInner(net, cols) {
  const mode = socMode();
  const mine = sgSchedPosts().filter(p => p.net === net), S = mine.filter(p => p.sch), M = mine.filter(p => p.man), U = mine.filter(p => !p.sch && !p.man), sto = sgSchedStories(net);
  const v = sto.length ? sgSchedView : 'posts', showP = v !== 'stories', showS = v !== 'posts' && sto.length > 0;
  const avg = a => a.length ? sgN(sgSum(a, x => x.v) / a.length) : '–';
  const small = showP && mine.length && Math.min(S.length, M.length) < 5;
  const seg = sto.length ? `<div class="sc-seg" role="group" aria-label="Show">${[['all', 'All'], ['stories', 'Stories'], ['posts', 'Posts']].map(([k, l]) => `<button type="button" class="${v === k ? 'on' : ''}" aria-pressed="${v === k}" onclick="sgSchedSet('${k}')">${l}</button>`).join('')}</div>` : '';
  const has = showP ? (mine.length || showS) : showS;
  const said = !showP ? `<b>${sgN(sto.length)} stories (posted live in the app, so by hand).</b> This is the Content Calendar's own record. Click a bar to see the stories.`
    : `<b>${S.length} scheduled in Metricool, ${M.length} posted by hand${showS ? `, ${sgN(sto.length)} stories (posted live in the app, so by hand)` : ''}.</b> Average views a post: ${avg(S)} scheduled, ${avg(M)} by hand. This is the Content Calendar's own record. Click a bar${showS ? ' or a point' : ''} to see which ${showS ? 'posts and stories' : 'posts'} they are.${showS ? ' Stories are the bars (left scale), posts the line (right scale).' : ''}${U.length ? ` ${U.length} ${U.length === 1 ? 'post' : 'posts'} before 12 Aug 2026 ${U.length === 1 ? 'has' : 'have'} no record, so ${U.length === 1 ? 'it is' : 'they are'} not in the bars.` : ''}${small ? ' <span class="sg-tag warn">Small group</span> Too few to say which is better.' : ''}`;
  return `<div class="mk-chart-head">
      <div class="slv-eyebrow">Posts scheduled or by hand ${mode === 'week' ? 'week by week' : 'day by day'}</div>
      ${seg}
      <span class="soc-key">${showP && showS ? `<span><i style="background:${sgSchedC().t}"></i>Stories a day (bars, left)</span><span><i style="background:${sgSchedC().p};width:16px;height:3px;border-radius:2px"></i>Posts a day (line, right)</span>`
        : showP ? `<span><i style="background:${sgSchedC().s}"></i>Scheduled in Metricool</span><span><i style="background:${sgSchedC().h}"></i>Posted by hand</span>`
        : `<span><i style="background:${sgSchedC().t}"></i>Stories, posted live</span>`}</span>
    </div>
    ${has ? `<div style="position:relative;height:200px"><canvas id="socSched"></canvas></div>
    <p class="slv-note">${said}</p>`
      : '<p class="slv-note">No posts in these dates.</p>'}`;
}
function sgSchedHtml(net, cols) {
  const mode = socMode();
  if (net === 'youtube') return `<div class="mk-chart-head"><div class="slv-eyebrow">Posts scheduled or by hand</div></div><p class="slv-note">YouTube has no post list in Metricool, only the channel’s numbers, so there is nothing to split into scheduled and by hand.</p>`;
  if (!sgHowReady()) {
    sgHowLoad().then(() => sgSchedFill(net), e => { console.error(e); sgSchedFill(net, true); });
    return `<div id="socSchedBox"><div class="mk-chart-head"><div class="slv-eyebrow">Posts scheduled or by hand ${mode === 'week' ? 'week by week' : 'day by day'}</div></div><p class="slv-note">Reading how each post went out…</p></div>`;
  }
  return `<div id="socSchedBox">${sgSchedInner(net, cols)}</div>`;
}
// The record arrived after the page was drawn: fill the box and draw the chart.
function sgSchedFill(net, failed) {
  if (typeof socTab === 'undefined' || socTab !== net) return;
  const box = document.getElementById('socSchedBox'); if (!box) return;
  if (failed) { box.innerHTML = '<div class="mk-chart-head"><div class="slv-eyebrow">Posts scheduled or by hand</div></div><p class="slv-note">Could not read how the posts went out just now. Refresh to try again.</p>'; return; }
  if (!sgHowReady()) return;
  box.innerHTML = sgSchedInner(net, socCols());
  sgSchedDraw(net);
}
function sgSchedDraw(net) {
  if (net === 'youtube' || !sgHowReady()) return;
  const cv = document.getElementById('socSched'); if (!cv) return;
  const w = socData.win, mode = socMode(), cols = socCols(), by = {};
  const sto = sgSchedStories(net), v = sto.length ? sgSchedView : 'posts', showP = v !== 'stories', showS = v !== 'posts' && sto.length > 0;
  if (showP) sgSchedPosts().filter(p => p.net === net && (p.sch || p.man)).forEach(p => { const r = (by[p.d] = by[p.d] || { date: p.d }), k = p.sch ? 'sched' : 'hand'; r[k] = (r[k] || 0) + 1; });
  if (showS) sto.forEach(p => { const r = (by[p.d] = by[p.d] || { date: p.d }); r.story = (r.story || 0) + 1; });
  const rows = mkBuckets(Object.values(by), w.from, w.to, mode, ['sched', 'hand', 'story']);
  const both = showP && showS, C = sgSchedC();
  const datasets = both ? [
    { sk: 'story', label: 'Stories, posted live', data: rows.map(r => r.story), backgroundColor: C.t },
    { sk: 'post', type: 'line', yAxisID: 'y1', label: 'Posts', data: rows.map(r => (r.sched || 0) + (r.hand || 0)), borderColor: C.p, backgroundColor: C.p, borderWidth: 3, pointRadius: rows.length > 45 ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: C.p, tension: .25 },
  ] : [
    ...(showP ? [{ sk: 'sched', label: 'Scheduled in Metricool', data: rows.map(r => r.sched), backgroundColor: C.s, stack: 's' }, { sk: 'hand', label: 'Posted by hand', data: rows.map(r => r.hand), backgroundColor: C.h, stack: 's' }] : []),
    ...(showS ? [{ sk: 'story', label: 'Stories, posted live', data: rows.map(r => r.story), backgroundColor: C.t, stack: 's' }] : []),
  ];
  const c = socCharts.sched = socBarChart(cv, rows, datasets, !both, both);
  if (c && both) {
    // two scales, so a few posts a day are not lost beside many stories: stories on the left (pink), posts on the right (blue)
    const y1 = c.options.scales.y1; y1.beginAtZero = true; y1.grace = 0; y1.ticks.precision = 0; y1.ticks.color = C.p;   // set one by one: spreading a ticks object twice throws in Chart.js
    c.options.scales.y.ticks.color = C.t;
    const lab = c.options.plugins.tooltip.callbacks.label;
    c.options.plugins.tooltip.callbacks.label = x => x.dataset.label === 'Posts' ? `Posts: ${socNum(x.raw)} (scheduled ${socNum(rows[x.dataIndex].sched || 0)}, by hand ${socNum(rows[x.dataIndex].hand || 0)})` : lab(x);
  }
  if (c) {
    c.options.scales.y.ticks = { ...(c.options.scales.y.ticks || {}), precision: 0 };
    // A click on a bar or a point opens the posts and stories behind it (Kate, 23 Nov 2026). Off a bar, a click inside the day still opens that day.
    sgPopAttach(c, rows, net, { showP, showS, rec: true });
  }
}

// ── The popup behind a bar or a point (Kate, 23 Nov 2026) ─────────────────────────────────────────────────────────────────
// Click a bar or a line point on the Scheduled or by hand chart and the posts and stories behind it open in a window. Its look is the Content Calendar's post panel
// (social-calendar.css: the platform badge and date head, the picture, Open on the app, the number tiles), as a centred window, and a sheet from the bottom on a phone.
// Posts come from the rows the chart already holds; stories from the Content Calendar's own call (picture and time), and their numbers (views, reach, replies, taps)
// are asked for only for the day or week that was clicked, through content_calendar_story_stats. Nothing is written.
let sgPopS = null, sgPopEl = null, sgPopFocus = null;
const sgPopStatsCache = {};
function sgPopHit(ch, e) {
  const a = ch.chartArea; if (!a || e.x < a.left || e.x > a.right || e.y < a.top || e.y > a.bottom) return null;
  return ch.getElementsAtEventForMode(e, 'index', { intersect: false }, false)[0] || null;
}
// Hooks a chart: a click on a bar or a point opens the window, the pointer shows which days have something to open.
// o = { showP, showS, rec, note }: posts and stories the chart counts, rec = only posts the Content Calendar has a record for, note = a line shown at the top of the window.
function sgPopAttach(c, rows, net, o) {
  if (!c || net === 'youtube') return;   // YouTube has no post list in Metricool
  let lastI = -1, lastOn = false;
  c.options.onClick = (e, _els, ch) => sgPopFromClick(ch, e, rows, net, o);
  c.options.onHover = (e, _els, ch) => {
    const ix = sgPopHit(ch, e), i = ix ? ix.index : -1;
    if (i !== lastI) { lastI = i; const s = { net, from: i >= 0 ? rows[i].from : '', to: i >= 0 ? rows[i].to : '', ...o }; const it = i >= 0 ? sgPopItems(s, 'all') : null; lastOn = !!it && (it.posts.length + it.stories.length) > 0; }
    ch.canvas.style.cursor = lastOn ? 'pointer' : 'default';
  };
  c.update();
}
async function sgPopFromClick(ch, e, rows, net, o) {
  const near = ch.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false)[0];
  const ix = near || sgPopHit(ch, e); if (!ix) return;
  const row = rows[ix.index]; if (!row) return;
  // a bar or point opens what it stands for; a click inside the day but off a bar opens everything that day
  const sk = near ? ch.data.datasets[near.datasetIndex].sk : null;
  const view = sk === 'story' ? 'stories' : sk === 'sched' ? 'sched' : sk === 'hand' ? 'hand' : sk === 'post' ? 'posts' : 'all';
  const s = { net, from: row.from, to: row.to, week: socMode() === 'week', ...o, view };
  // the stories' pictures and times come with the Content Calendar's record; wait for it if it has not arrived yet
  if (s.showS && !sgHowReady()) { try { await sgHowLoad(); } catch (err) { console.error(err); return; } }
  const items = sgPopItems(s, 'all'); if (!items.posts.length && !items.stories.length) return;
  sgPopOpen(s);
}
// Every post the Social report holds, labelled with how it went out once the Content Calendar's record has arrived.
const sgPopAllPosts = () => sgHowReady() ? sgSchedPosts() : sgHow(sgShapePosts(socData.posts, null));
function sgPopItems(s, view) {
  const inDay = d => d >= s.from && d <= s.to;
  let posts = s.showP ? sgPopAllPosts().filter(p => p.net === s.net && (!s.rec || p.sch || p.man) && inDay(p.d)) : [];
  let stories = s.showS ? sgSchedStories(s.net).filter(x => inDay(x.d)) : [];
  if (view === 'sched') posts = posts.filter(p => p.sch);
  if (view === 'hand') posts = posts.filter(p => p.man);
  if (view === 'posts' || view === 'sched' || view === 'hand') stories = [];
  if (view === 'stories') posts = [];
  return { posts: posts.slice().sort((a, b) => a.at - b.at), stories: stories.slice().sort((a, b) => a.at - b.at) };
}
function sgPopOpen(s) {
  sgPopClose(true);
  sgPopS = s; sgPopFocus = document.activeElement;
  const el = sgPopEl = document.createElement('div');
  el.className = 'sgp-root';
  document.body.appendChild(el);
  document.addEventListener('keydown', sgPopKey);
  sgPopPaint(true);
  sgPopStats(s);
}
function sgPopClose(quiet) {
  document.removeEventListener('keydown', sgPopKey);
  if (sgPopEl) { sgPopEl.remove(); sgPopEl = null; }
  sgPopS = null;
  if (!quiet && sgPopFocus && sgPopFocus.focus && document.contains(sgPopFocus)) { try { sgPopFocus.focus(); } catch (e) {} }
  if (!quiet) sgPopFocus = null;
}
function sgPopKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); sgPopClose(); return; }
  if (e.key !== 'Tab' || !sgPopEl) return;
  const f = [...sgPopEl.querySelectorAll('button:not([disabled]),a[href]')]; if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (!sgPopEl.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function sgPopView(v) { if (!sgPopS) return; sgPopS.view = v; sgPopPaint(false); const b = sgPopEl && sgPopEl.querySelector('.sgp-seg .on'); if (b) b.focus(); }
// The numbers for the stories on show, once, for the day or week clicked. A failed call leaves the stories with their picture and time only.
async function sgPopStats(s) {
  if (!s.showS) return;
  const key = s.net + '|' + s.from + '|' + s.to;
  if (sgPopStatsCache[key] === undefined) {
    try {
      const r = await sb.rpc('content_calendar_story_stats', { p_from: s.from, p_to: s.to });
      if (r.error) throw r.error;
      const by = {}; (r.data || []).forEach(x => { if (x.network === s.net) by[Date.parse(x.posted_at) || 0] = x; });
      sgPopStatsCache[key] = by;
    } catch (e) { console.error(e); sgPopStatsCache[key] = null; }
  }
  if (sgPopS === s) { s.stats = sgPopStatsCache[key]; s.statsDone = true; sgPopPaint(false); }
}
const sgClock12 = at => at ? new Date(at).toLocaleTimeString('en-US', { ...sgTz, hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '') : '';
const sgPopDay = (at, week) => {
  const t = sgClock12(at);
  return (week && at ? new Date(at).toLocaleDateString('en-GB', { ...sgTz, weekday: 'short', day: 'numeric', month: 'short' }) + (t ? ', ' : '') : '') + (t || 'Time not known');
};
const sgPopNum = (l, v) => `<div class="sgp-num"><div class="v">${sgN(v)}</div><div class="l">${mkEsc(l)}</div></div>`;
function sgPopThumb(img, key) {
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; h %= 360;
  return `<span class="sgp-th" style="--g:linear-gradient(155deg,hsl(${h} 45% 62%),hsl(${(h + 30) % 360} 35% 38%))">${img ? `<img src="${mkEsc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
}
function sgPopPostHtml(p, s, one) {
  const video = p.kind === 'reel' || p.kind === 'video', app = SG_PN[p.net];
  const nums = [sgPopNum('Likes', p.l), sgPopNum('Comments', p.c), sgPopNum(p.net === 'facebook' && p.kind === 'post' ? 'Impressions' : 'Views', p.v),
    p.r ? sgPopNum('Reach', p.r) : '', p.s ? sgPopNum(p.net === 'instagram' ? 'Reposts' : 'Shares', p.s) : '', p.sv ? sgPopNum('Saves', p.sv) : ''].join('');
  return `<article class="sgp-card${one ? ' one' : ''}">${sgPopThumb(p.img, p.d + p.t + p.net)}
    <div class="sgp-cb"><div class="sgp-r1"><b>${mkEsc(sgPopDay(p.at, s.week))}</b><span>${mkEsc(app)} ${mkEsc((SG_KL[p.kind] || p.kind).toLowerCase())}</span>${p.sch || p.man ? `<span class="sg-tag">${mkEsc(sgHowName(p))}</span>` : ''}</div>
      <p class="sgp-cap">${mkEsc(p.cap || '(no caption)')}</p>
      <div class="sgp-nums">${nums}</div>
      ${p.url ? `<a class="sc-btn sgp-open" href="${mkEsc(p.url)}" target="_blank" rel="noopener">${video ? 'Watch' : 'Open'} on ${mkEsc(app)}</a>` : ''}</div></article>`;
}
function sgPopStoryHtml(x, s, one) {
  const st = s.stats && s.stats[x.at], app = SG_PN[s.net], n = v => (v === null || v === undefined) ? null : Number(v);
  let nums = '';
  if (st) {
    const list = [['Views', n(st.views)], ['Reach', n(st.reach)], ['Replies', n(st.replies)], ['Taps forward', n(st.taps_forward)], ['Taps back', n(st.taps_back)], ['Exits', n(st.exits)]]
      .filter(([l, v]) => v !== null && (v > 0 || l === 'Views' || l === 'Reach'));
    if (list.some(([, v]) => v > 0)) nums = `<div class="sgp-nums">${list.map(([l, v]) => sgPopNum(l, v)).join('')}</div>`;
  }
  if (!nums) nums = `<p class="sgp-none">${!s.statsDone ? 'Reading the numbers…' : s.net === 'facebook' ? 'Metricool gives no numbers for Facebook stories.' : s.stats === null ? 'The numbers did not load just now.' : 'No numbers for this story yet.'}</p>`;
  return `<article class="sgp-card story${one ? ' one' : ''}">${sgPopThumb(x.img, 'story' + x.at)}
    <div class="sgp-cb"><div class="sgp-r1"><b>${mkEsc(sgPopDay(x.at, s.week))}</b><span>${mkEsc(app)} story</span><span class="sg-tag">Posted live in the app</span></div>${nums}</div></article>`;
}
function sgPopPaint(first) {
  const s = sgPopS, el = sgPopEl; if (!s || !el) return;
  const net = s.net, bg = socCols()[net] || '#888888', fg = typeof scalBadgeFg === 'function' && /^#[0-9a-f]{6}$/i.test(bg) ? scalBadgeFg(bg) : '#FFFFFF';
  const all = sgPopItems(s, 'all'), now = sgPopItems(s, s.view);
  const nP = all.posts.length, nS = all.stories.length, nSch = all.posts.filter(p => p.sch).length, nHand = all.posts.filter(p => p.man).length;
  const opts = s.showP && s.showS ? (nP && nS ? [['all', 'All', nP + nS], ['posts', 'Posts', nP], ['stories', 'Stories', nS]] : [])
    : (s.rec && nSch && nHand ? [['all', 'All posts', nP], ['sched', 'Scheduled', nSch], ['hand', 'By hand', nHand]] : []);
  const seg = opts.length ? `<div class="sc-seg sgp-seg" role="group" aria-label="Show">${opts.map(([k, l, c]) => `<button type="button" class="${s.view === k ? 'on' : ''}" aria-pressed="${s.view === k}" onclick="sgPopView('${k}')">${l} <span>${c}</span></button>`).join('')}</div>` : '';
  const dl = iso => new Date(iso + 'T00:00:00');
  const title = s.week ? 'Week of ' + dl(s.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : dl(s.from).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const count = (np, ns) => [np ? `${np} post${np === 1 ? '' : 's'}` : '', ns ? `${ns} stor${ns === 1 ? 'y' : 'ies'}` : ''].filter(Boolean).join(' and ');
  const one = now.posts.length + now.stories.length === 1;
  const body = now.posts.map(p => sgPopPostHtml(p, s, one)).join('') + now.stories.map(x => sgPopStoryHtml(x, s, one)).join('');
  el.innerHTML = `<div class="sgp-scrim" onclick="sgPopClose()"></div>
    <div class="sgp" role="dialog" aria-modal="true" aria-labelledby="sgpT" style="--c:${bg};--bf:${fg}">
      <div class="sgp-ph"><span class="sgp-b" aria-hidden="true">${SG_BD[net]}</span>
        <div class="when"><b id="sgpT">${mkEsc(title)}</b><span>${mkEsc(SG_PN[net])}: ${mkEsc(count(now.posts.length, now.stories.length) || 'nothing')}${s.week ? ' · ' + mkEsc(socDayY(s.from)) + ' to ' + mkEsc(socDayY(s.to)) : ''}</span></div>
        <button type="button" class="sgp-x" aria-label="Close" onclick="sgPopClose()">×</button></div>
      <div class="sgp-pb">${s.note ? `<p class="sgp-note">${mkEsc(s.note)}</p>` : ''}${seg}${body || '<p class="sgp-none">Nothing here.</p>'}</div></div>`;
  if (first) { const c = el.querySelector('.sgp-x'); if (c) c.focus(); }
}
