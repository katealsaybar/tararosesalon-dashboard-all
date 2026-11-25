// Site Traffic (Kate, 25 Nov 2026), built from the local mockup docs/mockups/site-traffic.html in the cowork repo.
//
// Who opens trk-salon-os.com, which pages they use and how long they stay: visits, visitors, page views and time per visit, for the team (signed in) and for clients
// (the campaign pages). The numbers come from our own tracker (js/site-track.js writes site_page_views through site_track_open and site_track_time) and are read here with
// site_traffic_summary (totals, days, pages, people, where from, device) and site_traffic_list (the lists behind every figure), migrations/site_traffic.sql.
// Level 6 only (dashboard_users.level 5 in the database); both read functions refuse everyone else, because the lists carry the team's names.
//
// Kate's rulings applied (the standing components): the masthead's Period drives the page (dateFrom, dateTo); Why wall, "On this page" (data-jn), first-time guide
// (page-guide.js reads this page by itself), Google Sheets heading menus on every table (sheet-table.js), every figure opens what is behind it (drill.js) down to one
// visit, XLSX and CSV, phone cards, bars that lift, glow and answer on hover (and on a tap).
// NOT IN THIS FIRST VERSION: a salon split. dashboard_users has no salon for a person, so the masthead's Branch does not change these numbers and the page says so.
// Needs from dashboard.js (shared script scope): sb, dateFrom, dateTo, dateToIso, TRS_LEVEL; drill.js TRSD; sheet-table.js TRSheet; why-wall.js whyWall.
const TRF = { aud: 'all', sm: 'src', hk: 'tpv', n: 10, wn: 10, more: false };
let trfData = null, trfPrev = null, trfSeq = 0, trfBusy = false, trfT = null, trfTW = null, trfTS = null, trfErr = '';
const trfCache = {};
const TRF_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TRF_DAY = 864e5;

const trfEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trfN = v => Math.round(+v || 0).toLocaleString('en-GB');
const trfPf = (a, b) => b ? (Math.round(1000 * a / b) / 10).toFixed(1) + '%' : '0.0%';
const trfSgn = p => (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0) + '%';
const trfChg = (c, p) => p > 0 ? 100 * (c - p) / p : null;
const trfNum = (html, spec) => (typeof TRSD !== 'undefined' && spec) ? TRSD.num(html, spec) : html;
const trfPl = (n, a, b) => trfN(n) + ' ' + (n === 1 ? a : b);
function trfFmt(s) {
  s = Math.round(+s || 0);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return m + ' min' + (r ? ' ' + r + ' s' : '');
  return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}
const trfIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const trfD = iso => new Date(iso + 'T00:00:00');
const trfDay = iso => { const d = trfD(iso); return d.getDate() + ' ' + TRF_MON[d.getMonth()] + ' ' + d.getFullYear(); };
function trfWhen(t) {   // Dubai time, 17 Nov 2026, 14:30
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).forEach(x => { p[x.type] = x.value; });
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`;
}
const trfLastDay = t => { const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(new Date(t)).forEach(x => { p[x.type] = x.value; }); return `${p.day} ${p.month} ${p.year}`; };
const trfWho = r => r.aud === 'T' ? (r.who || 'Team member') : 'Visitor ' + String(r.vid || '').slice(-4).toUpperCase();
const trfWhoSub = r => r.aud === 'T' ? 'Team, signed in' : 'Client, anonymous';

// ── THE WINDOW (the masthead's Period) AND THE ONE BEFORE IT ───────────────────────────
function trfRange() {
  const t = trfIso(new Date());
  let a = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : t.slice(0, 8) + '01';
  let b = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : t;
  if (b > t) b = t;
  if (b < a) b = a;
  return [a, b];
}
function trfPrevRange() {
  const [a, b] = trfRange(), len = Math.round((trfD(b) - trfD(a)) / TRF_DAY) + 1;
  const pb = trfIso(new Date(trfD(a).getTime() - TRF_DAY)), pa = trfIso(new Date(trfD(a).getTime() - len * TRF_DAY));
  const first = trfData && trfData.first_day;
  return first && pa >= first ? [pa, pb] : null;
}
const trfPeriodText = (r) => { r = r || trfRange(); return trfDay(r[0]) + ' to ' + trfDay(r[1]); };
function trfInP() {
  const [a, b] = trfRange(), t = trfIso(new Date()), d = trfD(a), e = trfD(b), last = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  if (a.slice(0, 7) === t.slice(0, 7) && a.endsWith('-01') && b >= t) return 'so far this month';
  if (d.getDate() === 1 && e.getDate() === last && d.getMonth() === e.getMonth() && d.getFullYear() === e.getFullYear()) return 'in ' + TRF_MON[d.getMonth()] + ' ' + d.getFullYear();
  return 'between ' + trfDay(a) + ' and ' + trfDay(b);
}

// ── THE CALLS ─────────────────────────────────────────────────────────────────────────
function trfCall(fn, args) {
  const key = fn + JSON.stringify(args);
  if (!trfCache[key]) {
    trfCache[key] = Promise.resolve(sb.rpc(fn, args)).then(r => {
      if (r.error) { delete trfCache[key]; throw r.error; }
      return r.data;
    }, e => { delete trfCache[key]; throw e; });
    setTimeout(() => { delete trfCache[key]; }, 120000);   // a fresh read after two minutes: the tracker keeps writing
  }
  return trfCache[key];
}
const trfSummary = r => trfCall('site_traffic_summary', { p_from: r[0], p_to: r[1], p_aud: null });

// ── THE NUMBERS OF A WINDOW FOR THE CHOSEN AUDIENCE ─────────────────────────────────────
const trfAuds = () => TRF.aud === 'all' ? ['T', 'C'] : [TRF.aud];
function trfTot(d, auds) {
  const o = { visits: 0, visitors: 0, views: 0, secs: 0, quick: 0 };
  ((d && d.tot) || []).forEach(x => { if ((auds || trfAuds()).includes(x.aud)) { o.visits += x.visits; o.visitors += x.visitors; o.views += x.views; o.secs += x.secs; o.quick += x.quick; } });
  o.avg = o.visits ? o.secs / o.visits : 0;
  return o;
}
// ── THE LISTS BEHIND A FIGURE (TRSD windows) ──────────────────────────────────────────
// d = { kind: 'visits' | 'views' | 'people' | 'visit', aud?, vid?, paths?, src?, dev?, quick?, entry?, sort?, range?, visit? }; range = [from, to], the Period when it is left out.
function trfArgs(d) {
  const r = d.range || trfRange();
  return { p_kind: d.kind, p_from: r[0], p_to: r[1], p_aud: d.aud || (TRF.aud === 'all' ? null : TRF.aud), p_vid: d.vid || null, p_paths: d.paths || null, p_src: d.src || null, p_dev: d.dev || null,
    p_quick: !!d.quick, p_entry: d.entry || null, p_visit: d.visit || null, p_sort: d.sort || null, p_limit: 500 };
}
function trfWhat(d) {
  const o = [];
  if (d.who) o.push('by ' + d.who);
  if (d.pageName) o.push('to ' + d.pageName);
  if (d.entryName) o.push('that began on ' + d.entryName);
  if (d.src) o.push('from ' + d.src);
  if (d.dev) o.push('on a ' + d.dev.toLowerCase());
  if (d.quick) o.push('that were quick leavers');
  return o.join(' ');
}
function trfSpec(d) {
  const r = d.range || trfRange(), name = { visits: 'Visits', views: 'Page views', people: d.aud === 'T' ? 'People' : 'Visitors', visit: 'One visit' }[d.kind];
  const title = d.title || ((name + ' ' + trfWhat(d)).trim() + (d.kind === 'people' && !d.aud && TRF.aud === 'T' ? '' : ''));
  const scope = (d.aud ? (d.aud === 'T' ? 'team' : 'clients') + ' · ' : (TRF.aud === 'all' ? '' : (TRF.aud === 'T' ? 'team' : 'clients') + ' · ')) + trfPeriodText(r);
  const keep = o => Object.assign({}, d, { sort: null, title: null }, o);
  return { title, sub: scope, sk: 'traffic-' + d.kind + '-' + String(d.vid || d.src || d.dev || (d.paths || [])[0] || d.entry || d.visit || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + (d.quick ? '-quick' : '') + (d.sort ? '-' + d.sort : '') + '-' + r[0],
    views: [{ id: d.kind, label: name, load: async () => {
      const res = await trfCall('site_traffic_list', trfArgs(d));
      const rows = res.rows || [];
      if (d.kind === 'visit') {
        return { cols: [{ k: 's', l: 'Step', t: 'num' }, { k: 'o', l: 'Opened at' }, { k: 'p', l: 'Page' }, { k: 't', l: 'Time on page' }],
          rows: rows.map((x, i) => ({ s: i + 1, o: trfWhen(x.t).split(', ')[1], p: x.page_name + ' (' + x.path + ')', t: trfFmt(x.seconds) })),
          foot: rows.length ? { s: '', o: '', p: 'All ' + rows.length + ' pages', t: trfFmt(rows.reduce((s, x) => s + x.seconds, 0)) } : null,
          note: 'This is the last step: a single visit has nothing behind it. ' + (rows[0] ? trfWho(rows[0]) + ', ' + (rows[0].device || '').toLowerCase() + ', ' + (rows[0].aud === 'T' ? 'signed in' : 'from ' + rows[0].src) + '.' : '') };
      }
      const cap = (res.total || 0) > rows.length ? 'Showing ' + (d.sort === 'time' ? 'the longest ' : 'the latest ') + trfN(rows.length) + ' of ' + trfN(res.total) + '. ' : '';
      if (d.kind === 'visits') {
        return { cols: [{ k: 'w', l: 'When' }, { k: 'who', l: 'Who' }, { k: 'p', l: 'Pages', t: 'num' }, { k: 'd', l: 'Time' }, { k: 'dv', l: 'Device' }, { k: 'f', l: 'From' }],
          rows: rows.map(x => ({ w: trfWhen(x.t), who: trfWho(x), p: x.pages, d: trfFmt(x.dur), dv: x.device, f: x.src,
            _dn: Object.assign({ p: trfSpec({ kind: 'visit', visit: x.visit_id, range: r }), d: trfSpec({ kind: 'visit', visit: x.visit_id, range: r }) }, d.vid ? {} : { who: trfSpec(keep({ kind: 'visits', vid: x.vid, who: trfWho(x) })) }) })),
          foot: { w: 'All ' + trfN(res.total) + ' visits', who: '', p: trfN(res.pages), d: trfFmt(res.secs), dv: '', f: '' }, note: cap + trfN(res.people) + ' ' + (d.aud === 'T' ? 'people' : 'visitors') + '. Names are for Level 6 only.' };
      }
      if (d.kind === 'views') {
        return { cols: [{ k: 'w', l: 'Opened' }, { k: 'who', l: 'Who' }, { k: 'p', l: 'Page' }, { k: 'd', l: 'Time on page' }],
          rows: rows.map(x => ({ w: trfWhen(x.t), who: trfWho(x), p: x.page_name, d: trfFmt(x.seconds),
            _dn: Object.assign({ p: trfSpec({ kind: 'visits', paths: [x.path], pageName: x.page_name, range: r, aud: d.aud }), d: trfSpec({ kind: 'visit', visit: x.visit_id, range: r }) }, d.vid ? {} : { who: trfSpec(keep({ kind: 'visits', vid: x.vid, who: trfWho(x) })) }) })),
          foot: { w: 'All ' + trfN(res.total) + ' page views', who: '', p: '', d: trfFmt(res.secs) }, note: cap + trfN(res.people) + ' ' + (d.aud === 'T' ? 'people' : 'visitors') + '. Time on page counts only while the page is open and on screen.' };
      }
      return { cols: [{ k: 'who', l: 'Who' }, { k: 'v', l: 'Visits', t: 'num' }, { k: 'p', l: 'Pages', t: 'num' }, { k: 'd', l: 'Time in total' }, { k: 'l', l: 'Last seen' }],
        rows: rows.map(x => ({ who: trfWho(x) + ' · ' + trfWhoSub(x), v: x.visits, p: x.pages, d: trfFmt(x.secs), l: trfLastDay(x.last),
          _dn: { v: trfSpec(keep({ kind: 'visits', vid: x.vid, who: trfWho(x) })), p: trfSpec(keep({ kind: 'views', vid: x.vid, who: trfWho(x) })), d: trfSpec(keep({ kind: 'visits', vid: x.vid, who: trfWho(x), sort: 'time' })) } })),
        foot: { who: 'All ' + trfN(res.total), v: trfN(res.visits), p: '', d: '', l: '' }, note: cap + 'Client visitors are anonymous. Names are for Level 6 only.' };
    } }] };
}
const trfSp = d => Object.assign({}, d);
const trfLink = (html, d, n) => (n === undefined || n) ? trfNum(html, trfSpec(d)) : html;

// ── DRAW ──────────────────────────────────────────────────────────────────────────────
function trfShell() {
  return `
    <section class="slv-intro">
      <h2>Site Traffic</h2>
      <p>Who opens trk-salon-os.com, which pages they use and how long they stay. Team visits are signed in. Client visits are to the campaign pages we send them. Tap any figure to see what adds up to it.</p>
    </section>
    ${whyWall([
      ['Why this page', 'We cannot see who opens the dashboard, which pages carry the team, or whether clients read the campaign pages we send them.'],
      ['Why now', 'The Wellness Voucher runs to 31 Dec and the November blasts are out, so how long clients stay on a page matters this month.'],
      ['If we do nothing', 'We keep guessing which pages get used and which campaign pages work, and we build more of the ones nobody opens.']])}
    <div id="trfBody"><p class="slv-muted" style="margin-top:16px">Loading the traffic…</p></div>`;
}
async function renderSiteTraffic() {
  const el = document.getElementById('siteTrafficContent');
  if (!el) return;
  el.innerHTML = trfShell();
  trfData = null; trfPrev = null; trfErr = '';
  trfBuildTables();
  trfLoad();
}
async function trfLoad() {
  const seq = ++trfSeq, cur = trfRange();
  trfBusy = true; trfPaintBusy();
  try {
    const d = await trfSummary(cur);
    if (seq !== trfSeq) return;
    trfData = d; trfPrev = null; trfBusy = false; trfPaint();
    const pr = trfPrevRange();
    if (pr) { try { const p = await trfSummary(pr); if (seq !== trfSeq) return; trfPrev = p; trfPaint(); } catch (e) { console.error('Site Traffic, the days before', e); } }
  } catch (e) {
    console.error(e);
    if (seq !== trfSeq) return;
    trfBusy = false; trfErr = (e && e.message) || '';
    const b = document.getElementById('trfBody'); if (!b) return;
    const lvl = /Level 6/.test(trfErr), missing = /site_traffic_summary|does not exist|schema cache/i.test(trfErr);
    b.innerHTML = `<p class="trf-empty"><b>${lvl ? 'Site Traffic is for Level 6 only.' : missing ? 'Nothing is being counted yet.' : 'The traffic did not load.'}</b> ${missing ? 'The counting has not been switched on. It starts the day the database part is applied.' : lvl ? '' : '<button type="button" class="cm-pill" onclick="trfLoad()">Try again</button>'}</p>`;
  }
}
function trfPaintBusy() { const b = document.getElementById('trfBody'); if (b) b.classList.toggle('cm-busy', trfBusy); }

function trfPaint() {
  trfPaintBusy();
  const d = trfData; if (!d) return;
  const body = document.getElementById('trfBody'); if (!body) return;
  if (!d.first_day) { body.innerHTML = '<p class="trf-empty"><b>Nothing has been counted yet.</b> The counting is on, and the first visit will show here.</p>'; delete body.dataset.drawn; return; }
  if (!body.dataset.drawn) {
    body.dataset.drawn = '1';
    body.innerHTML = `
      <section class="trf-ans" aria-label="The answer in one line"><div class="trf-ans-k">The answer in one line</div><div class="trf-ans-t" id="trfAns"></div><div class="trf-ans-s" id="trfAns2"></div></section>
      <section class="trf-sec" data-jn="The numbers">
        <h3>The numbers</h3>
        <div class="trf-learn"><p><b>What is this?</b> Every visit in the Period. A visit is one stretch of use, and a new one starts after 30 minutes of quiet.</p>
          <p class="watch"><b>What to watch.</b> <span id="trfW1"></span></p></div>
        <div class="trf-bar trf-bar-plain"><span class="slv-eyebrow">Who</span><div class="sc-seg" role="group" aria-label="Who"><button type="button" class="on" data-trf-aud="all" onclick="trfPickAud('all')">Everyone</button><button type="button" data-trf-aud="T" onclick="trfPickAud('T')">Team</button><button type="button" data-trf-aud="C" onclick="trfPickAud('C')">Clients</button></div>
          <span class="trf-hint">Traffic is for the whole site: a salon pick at the top does not change these numbers.</span></div>
        <div class="trf-tiles" id="trfTiles"></div>
        <div class="slv-eyebrow" style="margin:18px 0 6px">Team or clients</div>
        <div class="trf-arl" id="trfArl" role="list"></div>
      </section>
      <section class="trf-sec" data-jn="Visits by day">
        <h3>Visits by day</h3>
        <div class="trf-learn"><p><b>What is this?</b> One column for each day of the Period. A long Period, or a phone, shows one column for each week.</p>
          <p class="watch"><b>What to watch.</b> <span id="trfW2"></span></p></div>
        <div class="trf-chartcard"><div class="trf-legend" id="trfLg"></div><div class="trf-dchart" id="trfChart" role="group" aria-label="Visits by day"></div><div class="trf-dlbl" id="trfLbl" aria-hidden="true"></div></div>
        <p class="trf-hint" id="trfHintChart"></p>
      </section>
      <section class="trf-sec" data-jn="Top pages" id="trfTopSec">
        <h3>Top pages</h3>
        <div class="trf-learn"><p><b>What is this?</b> One row for each page that was opened. Time on page counts only while the page is open and on screen.</p>
          <p class="watch"><b>What to watch.</b> <span id="trfW3"></span></p></div>
        <div class="trf-bar" id="trfBar">
          <button type="button" class="cm-pill" id="trfMore" onclick="trfToggleMore('pg')">All columns</button>
          <button type="button" class="cm-pill trf-phone" data-sxcm="trfpg">Sort and filter</button>
          <span class="trf-sp"></span>
          <button type="button" class="cm-pill" id="trfClear" hidden onclick="trfT.clear();trfT.draw()">Clear filters</button>${typeof rexButtons === 'function' ? rexButtons('trfExportPages') : ''}
        </div>
        <div class="trf-card"><table id="trfTbl"></table></div>
        <div class="trf-pager"><span id="trfPgTxt"></span><span class="trf-sp"></span><span class="slv-eyebrow">Rows</span><select id="trfPgSel" aria-label="Rows to show" onchange="trfRowsPick('pg', +this.value)"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
          <button type="button" class="cm-pill" id="trfPgPrev" onclick="trfPage('pg', -1)">‹ Previous</button><span class="trf-pgn" id="trfPgN"></span><button type="button" class="cm-pill" id="trfPgNext" onclick="trfPage('pg', 1)">Next ›</button></div>
        <p class="trf-hint" id="trfHintPg"></p>
      </section>
      <section class="trf-sec" data-jn="Who is using it">
        <h3>Who is using it</h3>
        <div class="trf-learn"><p><b>What is this?</b> One row for each person on the team who signed in. Client visits are anonymous, so they are not here.</p>
          <p class="watch"><b>What to watch.</b> <span id="trfW4"></span></p></div>
        <div class="trf-bar trf-bar-plain"><button type="button" class="cm-pill" onclick="trfToggleMore('who')">All columns</button><button type="button" class="cm-pill trf-phone" data-sxcm="trfwho">Sort and filter</button><span class="trf-sp"></span>${typeof rexButtons === 'function' ? rexButtons('trfExportWho') : ''}</div>
        <div class="trf-card"><table id="trfWhoTbl"></table></div>
        <div class="trf-pager"><span id="trfWTxt"></span><span class="trf-sp"></span><span class="slv-eyebrow">Rows</span><select id="trfWSel" aria-label="Rows to show" onchange="trfRowsPick('who', +this.value)"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
          <button type="button" class="cm-pill" id="trfWPrev" onclick="trfPage('who', -1)">‹ Previous</button><span class="trf-pgn" id="trfWN"></span><button type="button" class="cm-pill" id="trfWNext" onclick="trfPage('who', 1)">Next ›</button></div>
        <p class="trf-hint">Names are for Level 6 only.</p>
      </section>
      <section class="trf-sec" data-jn="Where from and device" id="trfSrcSec">
        <details class="trf-sdet" id="trfSrcDet"><summary><h3>Where from and device</h3></summary>
          <div class="trf-learn" style="margin-top:8px"><p><b>What is this?</b> How visitors got here, or what they used. Quick leavers opened one page and left within 10 seconds.</p>
            <p class="watch"><b>What to watch.</b> <span id="trfW5"></span></p></div>
          <div class="trf-bar trf-bar-plain"><div class="sc-seg" role="group" aria-label="Show"><button type="button" class="on" data-trf-sm="src" onclick="trfPickSm('src')">Where from</button><button type="button" data-trf-sm="dev" onclick="trfPickSm('dev')">Device</button></div><span class="trf-sp"></span>${typeof rexButtons === 'function' ? rexButtons('trfExportSrc') : ''}</div>
          <div class="trf-card"><table id="trfSrcTbl"></table></div>
        </details>
      </section>
      <section class="trf-how" id="trfHow"><h3>How it is worked out</h3><div class="sc-seg trf-pick" id="trfPick" role="group" aria-label="Which figure"></div><div class="trf-howcard" id="trfHowCard"></div></section>
      <div class="trf-foot">
        <details class="trf-fd"><summary>About these numbers</summary><ul>
          <li>A small script on each page writes one line when it opens, and adds the seconds on it.</li>
          <li>It is kept in our own database. No other company sees it.</li>
          <li>Team visits carry the signed-in person. Client visits carry a random id, no name, phone or email.</li>
          <li>Counting started on ${trfDay(d.first_day)}. Only trk-salon-os.com is counted.</li>
          <li>Names are for Level 6 only.</li></ul></details>
      </div>`;
    const ps = document.getElementById('trfPgSel'); if (ps) ps.value = String(TRF.n);
    const ws = document.getElementById('trfWSel'); if (ws) ws.value = String(TRF.wn);
    trfHoverInit();
  }
  document.querySelectorAll('[data-trf-aud]').forEach(b => b.classList.toggle('on', b.dataset.trfAud === TRF.aud));
  document.querySelectorAll('[data-trf-sm]').forEach(b => b.classList.toggle('on', b.dataset.trfSm === TRF.sm));
  trfPaintAnswer(); trfPaintNumbers(); trfPaintChart(); trfPaintPages(); trfPaintWho(); trfPaintSrc(); trfPaintHow();
}

function trfPickAud(a) { TRF.aud = a; trfT.clear(); trfTW.clear(); trfT.page = 0; trfTW.page = 0; trfPaint(); }
function trfPickSm(m) { TRF.sm = m; trfTS.clear(); trfPaint(); }
function trfRowsPick(w, n) { if (w === 'pg') { TRF.n = n; trfT.shown = n; trfT.page = 0; trfT.draw(); } else { TRF.wn = n; trfTW.shown = n; trfTW.page = 0; trfTW.draw(); } }
function trfPage(w, d) { const T = w === 'pg' ? trfT : trfTW; T.page += d; T.draw(); }
function trfToggleMore(w) { const T = w === 'pg' ? trfT : trfTW; T.toggleMore(); const b = w === 'pg' ? document.getElementById('trfMore') : null; if (b) b.classList.toggle('on', T.more); }

function trfPaintAnswer() {
  const d = trfData, all = trfTot(d), t = trfTot(d, ['T']), c = trfTot(d, ['C']), a = document.getElementById('trfAns'), a2 = document.getElementById('trfAns2');
  const [ra] = [trfRange()];
  if (!all.visits) { a.textContent = 'No visits ' + trfInP() + ' for this pick.'; a2.textContent = 'Counting started on ' + trfDay(d.first_day) + '.'; return; }
  a.innerHTML = trfLink(trfN(all.visits), { kind: 'visits' }) + ' visits ' + trfEsc(trfInP()) + (TRF.aud === 'all' ? ': ' + trfLink(trfN(t.visits), { kind: 'visits', aud: 'T' }, t.visits) + ' from the team and ' + trfLink(trfN(c.visits), { kind: 'visits', aud: 'C' }, c.visits) + ' to client pages.' : '.') +
    (t.visits && TRF.aud !== 'C' ? ' A team visit lasts ' + trfLink(trfFmt(t.avg), { kind: 'visits', aud: 'T', sort: 'time' }) + '.' : '') + (c.visits && TRF.aud !== 'T' ? ' A client visit lasts ' + trfLink(trfFmt(c.avg), { kind: 'visits', aud: 'C', sort: 'time' }) + '.' : '');
  a2.textContent = trfPeriodText(ra) + '. Counting started on ' + trfDay(d.first_day) + '.';
}
function trfPaintNumbers() {
  const d = trfData, s = trfTot(d), p = trfPrev ? trfTot(trfPrev) : null, pr = trfPrevRange();
  const days = pr ? Math.round((trfD(pr[1]) - trfD(pr[0])) / TRF_DAY) + 1 : 0, ptxt = pr ? 'the ' + trfPl(days, 'day', 'days') + ' before' : '';
  const chg = (c, pv, kind, extra) => { if (!pr) return null; if (!trfPrev) return 'comparing…'; const x = trfChg(c, pv); return x === null ? 'nothing to compare with' : trfNum(`<span class="trf-chg ${x >= 0.05 ? 'up' : x <= -0.05 ? 'dn' : ''}">${trfSgn(x)}</span>`, trfSpec(Object.assign({ kind, range: pr }, extra || {}))) + ' on ' + ptxt; };
  const tile = (k, v, n) => `<div class="trf-tile"><div class="trf-tk">${k}</div><div class="trf-tv">${v}</div><div class="trf-tn">${n}</div></div>`;
  document.getElementById('trfTiles').innerHTML =
    tile('Visits', trfLink(trfN(s.visits), { kind: 'visits' }, s.visits), (p && chg(s.visits, p.visits, 'visits')) || (pr ? 'comparing…' : 'no earlier days were counted')) +
    tile('Visitors', trfLink(trfN(s.visitors), { kind: 'people' }, s.visitors), (p && chg(s.visitors, p.visitors, 'people')) || (pr ? 'comparing…' : 'team logins and client browsers')) +
    tile('Page views', trfLink(trfN(s.views), { kind: 'views' }, s.views), (p && chg(s.views, p.views, 'views')) || (pr ? 'comparing…' : 'pages opened in those visits')) +
    tile('Time per visit', trfLink(s.visits ? trfFmt(s.avg) : '0 s', { kind: 'visits', sort: 'time' }, s.visits), (p && chg(s.avg, p.avg, 'visits', { sort: 'time' })) || (pr ? 'comparing…' : 'page open and on screen'));
  const rows = [['T', 'Team', 'signed in', 'var(--k-team)'], ['C', 'Clients', 'campaign pages', 'var(--k-cli)']], tots = rows.map(r => trfTot(d, [r[0]])), mx = Math.max(1, ...tots.map(x => x.visits)), tv = tots[0].visits + tots[1].visits;
  document.getElementById('trfArl').innerHTML = rows.map((r, i) => {
    const st = tots[i], tip = r[1] + ': ' + trfN(st.visits) + ' visits from ' + trfN(st.visitors) + (r[0] === 'T' ? ' people' : ' visitors') + ', ' + (st.visits ? trfFmt(st.avg) : '0 s') + ' each. ' + (tv ? Math.round(100 * st.visits / tv) : 0) + '% of the visits shown.';
    return `<div class="trf-ar${TRF.aud === r[0] ? ' on' : ''}" role="listitem" data-tip="${trfEsc(tip)}"><button type="button" class="trf-an" onclick="trfPickAud('${TRF.aud === r[0] ? 'all' : r[0]}')"><i style="background:${r[3]}"></i>${r[1]} <small>${r[2]}</small></button><span class="trf-fbw"><i style="width:${100 * st.visits / mx}%;background:${r[3]}"></i></span><span class="trf-av">${trfLink(trfN(st.visits), { kind: 'visits', aud: r[0] }, st.visits)} visits<em>${trfLink(trfN(st.visitors), { kind: 'people', aud: r[0] }, st.visitors)} ${r[0] === 'T' ? 'people' : 'visitors'}</em></span><span class="trf-at">${trfLink(st.visits ? trfFmt(st.avg) : '0 s', { kind: 'visits', aud: r[0], sort: 'time' }, st.visits)} a visit</span></div>`;
  }).join('');
  const c = trfTot(d, ['C']), w = document.getElementById('trfW1');
  w.innerHTML = c.visits ? trfN(c.quick) + ' of ' + trfN(c.visits) + ' client visits (' + trfPf(c.quick, c.visits) + ') ' + trfLink('left within 10 seconds', { kind: 'visits', aud: 'C', quick: true }, c.quick) + ' of opening one page. What is the first thing they see on a phone?' : 'No client visits in this Period.';
}

// visits by day: stacked columns; every column answers on hover and, on a phone, on a tap
function trfPaintChart() {
  const d = trfData, [a, b] = trfRange(), A = trfD(a).getTime(), B = trfD(b).getTime(), days = Math.round((B - A) / TRF_DAY) + 1, phone = innerWidth <= 760;
  const wk = days > 31 || (phone && days > 14), step = wk ? 7 : 1, n = Math.ceil(days / step), touch = matchMedia('(hover:none)').matches, byDay = {};
  (d.days || []).forEach(x => { (byDay[x.d] = byDay[x.d] || {})[x.aud] = x; });
  const cols = []; let mx = 1;
  for (let i = 0; i < n; i++) {
    let t = 0, c = 0, secs = 0;
    for (let j = 0; j < step && i * step + j < days; j++) {
      const iso = trfIso(new Date(A + (i * step + j) * TRF_DAY)), row = byDay[iso] || {};
      if (TRF.aud !== 'C' && row.T) { t += row.T.visits; secs += row.T.secs; }
      if (TRF.aud !== 'T' && row.C) { c += row.C.visits; secs += row.C.secs; }
    }
    const s = trfIso(new Date(A + i * step * TRF_DAY)), e = trfIso(new Date(Math.min(B, A + (i * step + step - 1) * TRF_DAY)));
    cols.push({ s, e, t, c, secs }); mx = Math.max(mx, t + c);
  }
  document.getElementById('trfChart').style.gridTemplateColumns = document.getElementById('trfLbl').style.gridTemplateColumns = 'repeat(' + n + ',minmax(0,1fr))';
  document.getElementById('trfChart').innerHTML = cols.map(x => {
    const tot = x.t + x.c, lab = wk ? 'Week from ' + trfDay(x.s) + (x.e !== x.s ? ' to ' + trfDay(x.e) : '') : trfDay(x.s);
    const tip = lab + ': ' + (tot ? trfPl(tot, 'visit', 'visits') + (TRF.aud === 'all' ? ', ' + x.t + ' from the team and ' + x.c + ' to client pages' : '') + '. An average visit lasts ' + trfFmt(x.secs / tot) + '.' : 'no visits.');
    const spec = trfSpec({ kind: 'visits', range: [x.s, x.e], title: 'Visits, ' + (wk ? 'the week from ' + trfDay(x.s) + (x.e !== x.s ? ' to ' + trfDay(x.e) : '') : trfDay(x.s)) });
    const id = typeof TRSD !== 'undefined' && tot ? TRSD.reg(spec) : '';
    return `<button type="button" class="trf-dcol${tot ? ' dn-cell' : ' empty'}" ${id && !touch ? `data-dn="${id}"` : ''} data-tip="${trfEsc(tip)}" ${id && touch ? `data-tipdn="${id}"` : ''} aria-label="${trfEsc(tip)}"><span class="trf-stk" style="height:${tot ? Math.max(2, 100 * tot / mx) : 1}%"><i class="t" style="flex:${x.t}"></i><i class="c" style="flex:${x.c}"></i></span></button>`;
  }).join('');
  document.getElementById('trfLbl').innerHTML = cols.map((x, j) => `<span>${wk ? 'Wk ' + (j + 1) : trfD(x.s).getDate()}</span>`).join('');
  document.getElementById('trfLg').innerHTML = (TRF.aud === 'C' ? '' : '<span><i class="k1"></i>Team (signed in)</span>') + (TRF.aud === 'T' ? '' : '<span><i class="k2"></i>Clients (campaign pages)</span>') + '<span>' + (wk ? 'One column is one week.' : 'One column is one day.') + '</span>';
  document.getElementById('trfHintChart').textContent = 'Tap a column to see the visits in it. ' + (wk ? 'Weeks start on the first day of the Period.' : '');
  const best = cols.slice().sort((x, y) => (y.t + y.c) - (x.t + x.c))[0], w = document.getElementById('trfW2');
  w.innerHTML = best && best.t + best.c ? 'Busiest ' + (wk ? 'week' : 'day') + ': ' + trfNum(trfEsc(wk ? trfDay(best.s) : trfDay(best.s)), trfSpec({ kind: 'visits', range: [best.s, best.e] })) + ' with ' + trfN(best.t + best.c) + ' visits. Was a message sent or a blast out around then?' : 'No visits in this Period.';
}

// ── TABLES ────────────────────────────────────────────────────────────────────────────
function trfPager(T, rows, tx, nn, pv, nx, what) {
  const n = rows.length, pages = T.pages(n), from = n ? T.page * T.shown + 1 : 0, to = Math.min(n, (T.page + 1) * T.shown);
  const g = id => document.getElementById(id);
  if (g(tx)) g(tx).textContent = from + ' to ' + to + ' of ' + n + ' ' + what;
  if (g(nn)) g(nn).textContent = 'Page ' + (T.page + 1) + ' of ' + pages;
  if (g(pv)) g(pv).disabled = T.page <= 0;
  if (g(nx)) g(nx).disabled = T.page >= pages - 1;
}
const trfPageRows = () => {
  const d = trfData; if (!d) return [];
  const rows = (d.pages || []).filter(x => trfAuds().includes(x.aud)), tv = rows.reduce((s, x) => s + x.views, 0);
  return rows.map(x => ({ path: x.path, name: x.name, aud: x.aud, views: x.views, vis: x.visitors, secs: x.secs, avg: x.views ? x.secs / x.views : 0, ent: x.entries, sh: tv ? x.views / tv : 0 }))
    .sort((a, b) => b.views - a.views).map((r, i) => Object.assign(r, { rk: i + 1 }));
};
const trfWhoRows = () => TRF.aud === 'C' || !trfData ? [] : (trfData.people || []).map(x => ({ vid: x.vid, name: x.name || 'Team member', n: x.visits, pv: x.pages, tt: x.secs, avg: x.visits ? x.secs / x.visits : 0, last: x.last }));
const trfSrcRows = () => {
  if (!trfData) return [];
  const map = {};
  (trfData[TRF.sm] || []).filter(x => trfAuds().includes(x.aud)).forEach(x => { const m = map[x.k] || (map[x.k] = { k: x.k, n: 0, u: 0, tt: 0, q: 0, cn: 0 }); m.n += x.visits; m.u += x.visitors; m.tt += x.secs; m.q += x.quick; if (x.aud === 'C') m.cn += x.visits; });
  return Object.keys(map).map(k => Object.assign(map[k], { avg: map[k].n ? map[k].tt / map[k].n : 0 })).sort((a, b) => b.n - a.n);
};
function trfBuildTables() {
  const col = (key, l, raw, disp, cell, extra) => Object.assign({ k: key, l, t: 'num', raw, disp, cell }, extra || {});
  const txt = (key, l, raw, cell, extra) => Object.assign({ k: key, l, t: 'txt', raw, disp: raw, cell: cell || (r => trfEsc(raw(r))) }, extra || {});
  const pspec = (r, extra) => Object.assign({ paths: [r.path], pageName: r.name, aud: r.aud }, extra || {});
  trfT = TRSheet.table({ id: 'trfpg', el: '#trfTbl', rows: trfPageRows, limit: TRF.n,
    cols: [
      txt('n', 'Page', r => r.name, r => `<span class="trf-stf"><span class="trf-rk">${r.rk}</span><span class="trf-sv">${trfLink(`<b>${trfEsc(r.name)}</b>`, Object.assign({ kind: 'visits' }, pspec(r)), r.views)}<em>${trfEsc(r.path)}</em></span></span>`),
      txt('a', 'Who opens it', r => r.aud === 'T' ? 'Team' : 'Clients', r => `<span class="trf-tm ${r.aud === 'T' ? 'hair' : 'beauty'}">${r.aud === 'T' ? 'Team' : 'Clients'}</span>`),
      col('views', 'Page views', r => r.views, r => trfN(r.views), r => trfLink(trfN(r.views), Object.assign({ kind: 'views' }, pspec(r)), r.views)),
      col('vis', 'Visitors', r => r.vis, r => trfN(r.vis), r => trfLink(trfN(r.vis), Object.assign({ kind: 'people' }, pspec(r)), r.vis)),
      col('avg', 'Time on page', r => r.avg, r => trfFmt(r.avg), r => trfLink(trfFmt(r.avg), Object.assign({ kind: 'views', sort: 'time' }, pspec(r)), r.views), { sub: 'on average' }),
      col('sh', 'Share of views', r => Math.round(r.sh * 1000) / 10, r => trfPf(r.sh, 1), r => trfLink(trfPf(r.sh, 1), Object.assign({ kind: 'views' }, pspec(r)), r.views), { x: 1 }),
      col('tt', 'Time in total', r => r.secs, r => trfFmt(r.secs), r => trfLink(trfFmt(r.secs), Object.assign({ kind: 'views', sort: 'time' }, pspec(r)), r.views), { x: 1 }),
      col('ent', 'Opened first', r => r.ent, r => trfN(r.ent), r => trfLink(trfN(r.ent), { kind: 'visits', entry: r.path, entryName: r.name, aud: r.aud }, r.ent), { x: 1, sub: 'visits that began here' })
    ],
    total: rows => { let v = 0, tt = 0, en = 0, sh = 0; rows.forEach(r => { v += r.views; tt += r.secs; en += r.ent; sh += r.sh; }); const paths = [...new Set(rows.map(r => r.path))];
      return { n: 'All ' + rows.length + ' pages shown', views: trfLink(trfN(v), { kind: 'views', paths }, v), vis: '', avg: v ? trfFmt(tt / v) : '0 s', sh: trfPf(sh, 1), tt: trfFmt(tt), ent: trfLink(trfN(en), { kind: 'visits', paths }, en) }; },
    after: (T, rows) => { const c = document.getElementById('trfClear'); if (c) c.hidden = !T.active(); trfPager(T, rows, 'trfPgTxt', 'trfPgN', 'trfPgPrev', 'trfPgNext', 'pages'); }
  });
  trfTW = TRSheet.table({ id: 'trfwho', el: '#trfWhoTbl', rows: trfWhoRows, limit: TRF.wn,
    cols: [
      txt('name', 'Person', r => r.name, r => `<span class="trf-sv">${trfLink(`<b>${trfEsc(r.name)}</b>`, { kind: 'visits', vid: r.vid, aud: 'T', who: r.name }, r.n)}</span>`),
      col('n', 'Visits', r => r.n, r => trfN(r.n), r => trfLink(trfN(r.n), { kind: 'visits', vid: r.vid, aud: 'T', who: r.name }, r.n)),
      col('pv', 'Pages', r => r.pv, r => trfN(r.pv), r => trfLink(trfN(r.pv), { kind: 'views', vid: r.vid, aud: 'T', who: r.name }, r.pv)),
      col('avg', 'Time per visit', r => r.avg, r => trfFmt(r.avg), r => trfLink(trfFmt(r.avg), { kind: 'visits', vid: r.vid, aud: 'T', who: r.name, sort: 'time' }, r.n)),
      { k: 'last', l: 'Last seen', t: 'txt', sk: r => +new Date(r.last), raw: r => r.last, disp: r => trfLastDay(r.last), cell: r => trfLink(trfLastDay(r.last), { kind: 'visits', vid: r.vid, aud: 'T', who: r.name }, r.n) },
      col('tt', 'Time in total', r => r.tt, r => trfFmt(r.tt), r => trfLink(trfFmt(r.tt), { kind: 'visits', vid: r.vid, aud: 'T', who: r.name, sort: 'time' }, r.n), { x: 1 })
    ],
    total: rows => { let n = 0, pv = 0, tt = 0; rows.forEach(r => { n += r.n; pv += r.pv; tt += r.tt; }); return { name: trfPl(rows.length, 'person', 'people'), n: trfN(n), pv: trfN(pv), avg: n ? trfFmt(tt / n) : '0 s', tt: trfFmt(tt) }; },
    after: (T, rows) => trfPager(T, rows, 'trfWTxt', 'trfWN', 'trfWPrev', 'trfWNext', 'people')
  });
  const sp = r => TRF.sm === 'src' ? { src: r.k } : { dev: r.k };
  trfTS = TRSheet.table({ id: 'trfsrc', el: '#trfSrcTbl', rows: trfSrcRows,
    cols: [
      txt('k', 'Name', r => r.k, r => trfLink(trfEsc(r.k), Object.assign({ kind: 'visits' }, sp(r)), r.n)),
      col('n', 'Visits', r => r.n, r => trfN(r.n), r => trfLink(trfN(r.n), Object.assign({ kind: 'visits' }, sp(r)), r.n)),
      col('u', 'Visitors', r => r.u, r => trfN(r.u), r => trfLink(trfN(r.u), Object.assign({ kind: 'people' }, sp(r)), r.u)),
      col('avg', 'Time per visit', r => r.avg, r => trfFmt(r.avg), r => trfLink(trfFmt(r.avg), Object.assign({ kind: 'visits', sort: 'time' }, sp(r)), r.n)),
      col('q', 'Quick leavers', r => r.cn ? Math.round(1000 * r.q / r.cn) / 10 : 0, r => r.cn ? trfPf(r.q, r.cn) : 'none', r => r.cn ? trfLink(trfPf(r.q, r.cn), Object.assign({ kind: 'visits', quick: true }, sp(r)), r.q) : '<span class="dn-zero">none</span>', { sub: 'client visits' })
    ],
    total: rows => { let n = 0; rows.forEach(r => { n += r.n; }); return { k: 'All shown', n: trfLink(trfN(n), { kind: 'visits' }, n) }; }
  });
}
function trfPaintPages() {
  trfT.page = 0; trfT.draw();
  const rows = trfPageRows(), top = rows[0], long = rows.slice().sort((a, b) => b.avg - a.avg)[0];
  document.getElementById('trfW3').innerHTML = top ? 'Most opened: ' + trfLink(trfEsc(top.name), { kind: 'visits', paths: [top.path], pageName: top.name, aud: top.aud }, top.views) + ' (' + trfN(top.views) + ' views). Longest stay: ' + trfLink(trfEsc(long.name), { kind: 'views', paths: [long.path], pageName: long.name, aud: long.aud, sort: 'time' }, long.views) + ' (' + trfFmt(long.avg) + ' on average). Is a long stay people reading, or people stuck?' : 'No page was opened in this Period.';
  document.getElementById('trfHintPg').textContent = 'A page opened twice in one visit counts as two page views and one visitor. The biggest 500 pages by views are listed.';
}
function trfPaintWho() {
  trfTW.page = 0; trfTW.draw();
  const rows = trfWhoRows(), cut = Date.now() - 7 * TRF_DAY, quiet = rows.filter(r => +new Date(r.last) < cut).length, w = document.getElementById('trfW4');
  w.textContent = TRF.aud === 'C' ? 'Client visits are anonymous, so this list is empty. Pick Everyone or Team.' : rows.length ? trfN(rows.length) + ' people signed in. ' + (quiet ? trfPl(quiet, 'person has', 'people have') + ' not opened it in the last 7 days. A hello from their coordinator helps more than a reminder.' : 'Everyone who signed in did so in the last 7 days.') : 'Nobody on the team signed in in this Period.';
}
function trfPaintSrc() {
  trfTS.draw();
  const rows = trfSrcRows(), top = rows[0], tot = rows.reduce((s, r) => s + r.n, 0), cl = rows.filter(r => r.cn).sort((a, b) => b.q / b.cn - a.q / a.cn)[0], sp = r => TRF.sm === 'src' ? { src: r.k } : { dev: r.k };
  document.getElementById('trfW5').innerHTML = top ? 'Biggest group: ' + trfLink(trfEsc(top.k), Object.assign({ kind: 'visits' }, sp(top)), top.n) + ' (' + trfPf(top.n, tot) + ' of the visits).' + (cl ? ' Most quick leavers: ' + trfLink(trfEsc(cl.k), Object.assign({ kind: 'visits', quick: true }, sp(cl)), cl.q) + ' (' + trfPf(cl.q, cl.cn) + '). What is different about how they arrive?' : '') : 'No visits in this Period.';
}

// ── HOW IT IS WORKED OUT ─────────────────────────────────────────────────────────────
const TRF_HOWS = [['tpv', 'Time per visit'], ['vis', 'Visits and visitors'], ['pv', 'Page views'], ['ql', 'Quick leavers']];
function trfPaintHow() {
  document.getElementById('trfPick').innerHTML = TRF_HOWS.map(h => `<button type="button"${h[0] === TRF.hk ? ' class="on"' : ''} onclick="TRF.hk='${h[0]}';trfPaintHow()">${h[1]}</button>`).join('');
  const s = trfTot(trfData), c = trfTot(trfData, ['C']);
  let m, big, cv;
  if (TRF.hk === 'tpv') { m = 'How long one visit lasts, counting only the time a page is open and on screen.'; big = s.visits ? trfN(Math.round(s.secs / 60)) + ' min ÷ ' + trfN(s.visits) + ' visits = ' + trfFmt(s.avg) : 'No visits in this Period'; cv = 'The clock stops when the tab is hidden, or after 30 seconds with no tap or scroll.'; }
  else if (TRF.hk === 'vis') { m = 'A visit is one stretch of use. A new one starts after 30 minutes of quiet.'; big = trfN(s.visits) + ' visits by ' + trfN(s.visitors) + ' ' + (TRF.aud === 'C' ? 'visitors' : TRF.aud === 'T' ? 'people' : 'people and browsers'); cv = 'A client on two phones counts twice. Clearing the browser makes a returning client look new.'; }
  else if (TRF.hk === 'pv') { m = 'Every time a page is opened inside a visit.'; big = s.visits ? trfN(s.views) + ' page views ÷ ' + trfN(s.visits) + ' visits = ' + (s.views / s.visits).toFixed(1) + ' pages a visit' : 'No visits in this Period'; cv = 'Opening the same page twice in one visit counts as two page views and one visitor.'; }
  else { m = 'Client visits that opened one page and left within 10 seconds.'; big = c.visits ? trfN(c.quick) + ' ÷ ' + trfN(c.visits) + ' = ' + trfPf(c.quick, c.visits) : 'No client visits in this Period'; cv = 'Often a link tapped by mistake, or a slow page on a phone. Not bad on its own.'; }
  const term = TRF_HOWS.filter(h => h[0] === TRF.hk)[0][1];
  document.getElementById('trfHowCard').innerHTML = `<div class="trf-hc-t">${term}</div><p class="trf-hc-m">${m}</p><div class="trf-hc-big">${big}</div><div class="trf-hc-cv">${cv}</div>`;
}

// ── THE HOVER CARD (component 42): a bar lifts, glows and says what it means; on a phone a tap does the same ─────────────────
let trfHovT = 0;
function trfHoverInit() {
  if (window._trfHov) return; window._trfHov = 1;
  const hc = document.createElement('div'); hc.id = 'trfHov'; hc.hidden = true; document.body.appendChild(hc);
  const inPage = el => el && el.closest && el.closest('#siteTrafficContent');
  const hide = () => { hc.hidden = true; hc.classList.remove('tap'); };
  function show(el, x, tap) {
    const t = el.getAttribute('data-tip'); if (!t) return;
    const id = el.getAttribute('data-tipdn');
    hc.innerHTML = trfEsc(t) + (tap && id ? '<br><span class="dn" role="button" tabindex="0" data-dn="' + id + '">Open the visits</span>' : '');
    hc.classList.toggle('tap', !!tap); hc.hidden = false;
    if (tap) return;
    const rc = el.getBoundingClientRect(), w = hc.offsetWidth, h = hc.offsetHeight;
    hc.style.left = Math.max(10, Math.min(innerWidth - w - 10, (x == null ? rc.left : x) - w / 2)) + 'px'; hc.style.top = (rc.top - h - 8 < 10 ? rc.bottom + 8 : rc.top - h - 8) + 'px';
  }
  document.addEventListener('mouseover', e => { if (!matchMedia('(hover:hover)').matches) return; const el = e.target.closest && e.target.closest('[data-tip]'); if (!el || !inPage(el) || e.target.closest('.dn,.trf-an')) { hide(); return; } show(el, e.clientX); });
  document.addEventListener('mouseout', e => { const to = e.relatedTarget; if (!to || !to.closest || !to.closest('[data-tip]')) hide(); });
  document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && inPage(el) && e.target.matches(':focus-visible')) show(el, null); });
  document.addEventListener('focusout', () => { if (!hc.classList.contains('tap')) hide(); });
  document.addEventListener('click', e => {
    if (!matchMedia('(hover:none)').matches) return;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && inPage(el) && !e.target.closest('.dn,.trf-an')) { show(el, null, true); clearTimeout(trfHovT); trfHovT = setTimeout(hide, 5000); e.stopPropagation(); e.preventDefault(); }
    else if (!e.target.closest('#trfHov')) hide();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}

// ── DOWNLOADS ─────────────────────────────────────────────────────────────────────────
const trfR2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
function trfSubtitle() { return `${trfPeriodText()} · ${TRF.aud === 'all' ? 'team and clients' : TRF.aud === 'T' ? 'team' : 'clients'} · Dubai days`; }
function trfExportTable(kind) {
  if (!trfData) return null;
  const sub = trfSubtitle(), legend = [['Page views', 'Each time a page is opened inside a visit.'], ['Time', 'Only while the page is open and on screen; the clock stops after 30 seconds with no tap or scroll.'], ['Visit', 'One stretch of use; a new one starts after 30 minutes of quiet.']];
  let rows, cols, lines, title, base;
  if (kind === 'pg') {
    rows = trfT.rows(); title = 'Top pages'; base = 'site-traffic-top-pages';
    cols = [{ key: 'name', label: 'Page', fmt: 'text' }, { key: 'path', label: 'Address', fmt: 'text' }, { key: 'aud', label: 'Who opens it', fmt: 'text' }, { key: 'views', label: 'Page views', fmt: 'num' }, { key: 'vis', label: 'Visitors', fmt: 'num' }, { key: 'avg', label: 'Average seconds on page', fmt: 'num' }, { key: 'sh', label: 'Share of views %', fmt: 'pct' }, { key: 'tt', label: 'Seconds in total', fmt: 'num' }, { key: 'ent', label: 'Visits that began here', fmt: 'num' }];
    lines = rows.map(r => ({ cells: [r.name, r.path, r.aud === 'T' ? 'Team' : 'Clients', r.views, r.vis, trfR2(r.avg), trfR2(100 * r.sh), r.secs, r.ent] }));
  } else if (kind === 'who') {
    rows = trfTW.rows(); title = 'Who is using it'; base = 'site-traffic-team';
    cols = [{ key: 'name', label: 'Person', fmt: 'text' }, { key: 'n', label: 'Visits', fmt: 'num' }, { key: 'pv', label: 'Pages', fmt: 'num' }, { key: 'avg', label: 'Average seconds a visit', fmt: 'num' }, { key: 'last', label: 'Last seen', fmt: 'text' }, { key: 'tt', label: 'Seconds in total', fmt: 'num' }];
    lines = rows.map(r => ({ cells: [r.name, r.n, r.pv, trfR2(r.avg), trfLastDay(r.last), r.tt] }));
  } else {
    rows = trfTS.rows(); title = TRF.sm === 'src' ? 'Where from' : 'Device'; base = 'site-traffic-' + (TRF.sm === 'src' ? 'where-from' : 'device');
    cols = [{ key: 'k', label: 'Name', fmt: 'text' }, { key: 'n', label: 'Visits', fmt: 'num' }, { key: 'u', label: 'Visitors', fmt: 'num' }, { key: 'avg', label: 'Average seconds a visit', fmt: 'num' }, { key: 'q', label: 'Quick leavers (client visits)', fmt: 'num' }];
    lines = rows.map(r => ({ cells: [r.k, r.n, r.u, trfR2(r.avg), r.q] }));
  }
  if (!rows.length) return null;
  const [a, b] = trfRange();
  return { name: [base, a, 'to', b].join('-'), csv: 0, sheets: [{ name: title.slice(0, 31), title: 'Site Traffic: ' + title, subtitle: sub, blocks: [{ cols, rows: lines }], legend }] };
}
const trfExportPages = () => trfExportTable('pg');
const trfExportWho = () => trfExportTable('who');
const trfExportSrc = () => trfExportTable('src');
// The whole page in one workbook (js/page-export.js): Top pages, Who is using it, Where from and device. The CSV is the first tab.
function trfExportPage() {
  const main = trfExportTable('pg'); if (!main) return null;
  const tab = (m, name) => m && m.sheets && m.sheets[0] ? [Object.assign({}, m.sheets[0], { name })] : [];
  const [a, b] = trfRange();
  return { name: ['site-traffic', a, 'to', b].join('-'), csv: 0, sheets: tab(main, 'Top pages').concat(tab(trfExportTable('who'), 'Who is using it'), tab(trfExportTable('src'), TRF.sm === 'src' ? 'Where from' : 'Device')) };
}

try { NOPULSE_REDRAW.sitetraffic = 'renderSiteTraffic'; } catch (e) {}   // the header's Period changed: redraw this page alone (registered here so dashboard.js is untouched)
try { if (typeof jnAdd === 'function' && !window._trfJn) { window._trfJn = 1; jnAdd('sitetraffic', { sel: '#siteTrafficContent [data-jn]' }); } } catch (e) {}
