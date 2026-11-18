// Service Rankings (Kate, 8 Oct 2026, revamped 18 Nov 2026 from the local mockup docs/mockups/service-rankings.html in the cowork repo).
//
// One call per salon group, service_rankings (migrations/service_rankings.sql), over sales_transaction_lines, sorted by Phorest's own service
// categories (item_classes): the sizes of one service are ONE row, a keratin's Application and Ironing are one treatment, package lines count as
// their service, and every row carries Phorest's category and its family. Revenue is net (ex VAT) like Top Clients, units are sales lines.
// Retail is on Products, deposits and vouchers are not services. The period before is asked for separately, in parallel, so the ranking does not wait.
//
// Kate's rulings applied here (18 Nov 2026):
//   - the masthead's Branch and Period drive the page (sel, dateFrom, dateTo); the page keeps only Rank by, Family and Category of its own.
//   - Bahrain is a salon of its own: its own Phorest business, in BHD (BHD | AED in the masthead), never added into the UAE totals.
//   - every table has the Google Sheets heading menus (sheet-table.js), every figure opens what is behind it (drill.js), and a tap on Units or
//     Clients opens WHO had the service (drill_service_clients, migrations/drill_service_clients.sql, Level 3 and up).
//   - the table shows 10 rows and the reader picks 10, 20, 50 or 100; the total row carries the change on the period before.
//   - Why wall, "On this page" (data-jn), first-time guide (page-guide.js reads this page by itself), XLSX and CSV, phone cards.
// Needs from dashboard.js (shared script scope): sb, sel, dateFrom, dateTo, dateToIso, BH_BRANCHES, UAE_ACTIVE, BRANCH_INFO, isBahrainView, bahInAed,
// BHD_TO_AED, TRS_LEVEL; from lost-clients.js lcEsc, lcNum, lcDayY; from client-mix.js CM_FAMS, cmFam; from drill.js TRSD; sheet-table.js TRSheet; why-wall.js whyWall.
const SR_STORE = 'trs-service-rankings';
const SR = { fam: 'all', cat: null, rank: 'rev', n: 10 };
let srPrevState = 'none', srData = null, srPrev = null, srSal = null, srSeq = 0, srBusy = false, srT = null, srTS = null, srTF = null, srHK = 'chg';
const srCache = {};
const SR_FIRST = '2021-08-01';
const SR_LIMIT = 1000;
const SR_SALONS = ['SAA', 'KCA', 'MC', 'AQ'];
const SR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
try {
  const s = JSON.parse(localStorage.getItem(SR_STORE) || '{}');
  if (s.rank === 'units') SR.rank = 'units';
  if ([10, 20, 50, 100].includes(s.n)) SR.n = s.n;
} catch (e) {}
const srSave = () => { try { localStorage.setItem(SR_STORE, JSON.stringify({ rank: SR.rank, n: SR.n })); } catch (e) {} };

// The address (audit 18 Oct 2026, P5-12): rank, family, category and rows, written in full so a link says what it shows. The masthead writes the branch and
// period itself. trSyncUrl() in index.html calls srUrlParts().
function srUrlParts() {
  const p = ['svc_rank=' + (SR.rank === 'units' ? 'units' : 'rev')];
  if (SR.fam !== 'all') p.push('svc_family=' + encodeURIComponent(SR.fam));
  if (SR.cat) p.push('svc_category=' + encodeURIComponent(SR.cat));
  if (SR.n !== 10) p.push('svc_rows=' + SR.n);
  return p;
}
(function srReadUrl() {   // a link beats what this browser remembered
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('view') !== 'services') return;
    const r = q.get('svc_rank'); if (r === 'rev' || r === 'units') SR.rank = r;
    const f = q.get('svc_family'); if (f) SR.fam = f;
    const c = q.get('svc_category'); if (c) SR.cat = c;
    const n = +q.get('svc_rows'); if ([10, 20, 50, 100].includes(n)) SR.n = n;
  } catch (e) {}
})();

// ── THE WINDOW (the masthead's Period) AND THE ONE BEFORE IT ─────────────────────────
const srIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const srD = iso => new Date(iso + 'T00:00:00');
function srRange() {
  const t = srIso(new Date());
  let a = typeof dateFrom !== 'undefined' && dateFrom ? dateToIso(dateFrom) : t.slice(0, 8) + '01';
  let b = typeof dateTo !== 'undefined' && dateTo ? dateToIso(dateTo) : t;
  if (a < SR_FIRST) a = SR_FIRST;
  if (b > t) b = t;
  if (b < a) b = a;
  return [a, b];
}
// [from, to, label, short] or null when there is no data that far back. A whole month or whole months are set against the months before; this month so far against
// the same days of the month before; anything else against the same number of days just before it.
function srPrevRange() {
  const [a, b] = srRange(), da = srD(a), db = srD(b);
  const lastDay = new Date(db.getFullYear(), db.getMonth() + 1, 0).getDate();
  let pa, pb, label, short;
  const monthName = d => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (da.getDate() === 1 && db.getDate() === lastDay) {
    const months = (db.getFullYear() - da.getFullYear()) * 12 + db.getMonth() - da.getMonth() + 1;
    const ps = new Date(da.getFullYear(), da.getMonth() - months, 1), pe = new Date(da.getFullYear(), da.getMonth(), 0);
    pa = srIso(ps); pb = srIso(pe);
    if (months === 1) { label = monthName(ps); short = SR_MON[ps.getMonth()]; }
    else if (months === 12 && da.getMonth() === 0) { label = String(ps.getFullYear()); short = label; }
    else { label = 'the ' + months + ' months before'; short = 'prior period'; }
  } else if (da.getDate() === 1 && da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) {
    const ps = new Date(da.getFullYear(), da.getMonth() - 1, 1), days = Math.round((db - da) / 864e5);
    const pe = new Date(ps.getFullYear(), ps.getMonth(), 1 + days), end = new Date(ps.getFullYear(), ps.getMonth() + 1, 0);
    pa = srIso(ps); pb = srIso(pe > end ? end : pe); label = monthName(ps); short = SR_MON[ps.getMonth()];
  } else {
    const len = Math.round((db - da) / 864e5) + 1;
    pb = srIso(new Date(da.getTime() - 864e5)); pa = srIso(new Date(da.getTime() - len * 864e5)); label = 'the period before'; short = 'prior period';
  }
  if (pa < SR_FIRST) return null;
  return [pa, pb, label, short];
}

// ── WHICH SALONS, WHICH CURRENCY ─────────────────────────────────────────────────────
// null = the four open UAE salons in one call; otherwise the codes the masthead has picked. Bahrain is its own view (isBahrainView): ['BAH'].
function srCodes() {
  if (typeof isBahrainView === 'function' && isBahrainView()) return ['BAH'];
  if (typeof sel === 'undefined' || !sel.branch || sel.branch.includes('all')) return null;
  const c = sel.branch.filter(b => typeof BH_BRANCHES === 'undefined' || !BH_BRANCHES.includes(b));
  return !c.length || (typeof UAE_ACTIVE !== 'undefined' && UAE_ACTIVE.every(b => c.includes(b))) ? null : c;
}
const srBah = () => typeof isBahrainView === 'function' && isBahrainView();
const srName = c => (typeof BRANCH_INFO !== 'undefined' && BRANCH_INFO[c] && BRANCH_INFO[c].name) || c;
const srScope = () => { const c = srCodes(); return c ? c.map(srName).join(' + ') : 'UAE Branches'; };
const srSalonCodes = () => srCodes() || (typeof UAE_ACTIVE !== 'undefined' ? UAE_ACTIVE : SR_SALONS);
const srInAed = () => srBah() && typeof bahInAed === 'function' && bahInAed();
const srCur = () => srBah() && !srInAed() ? 'BHD' : 'AED';
const srFx = () => srInAed() ? BHD_TO_AED : 1;

const srAed = n => srCur() + ' ' + lcNum(n);
const srPct = (cur, prev) => prev > 0 ? (100 * (cur - prev) / prev) : null;
const srSgn = p => (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0) + '%';
const srPf = (a, b) => b ? (Math.round(1000 * a / b) / 10).toFixed(1) + '%' : '0.0%';
const srNum = (html, spec) => (typeof TRSD !== 'undefined' && spec) ? TRSD.num(html, spec) : html;
const srCanClients = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 2;
const srPeriodText = () => { const [a, b] = srRange(); return lcDayY(a) + ' to ' + lcDayY(b); };

// ── THE CALLS ────────────────────────────────────────────────────────────────────────
function srCall(range, code) {
  const args = { p_from: range[0], p_to: range[1], p_pfrom: null, p_pto: null, p_branch: code, p_fam: null, p_cat: null, p_limit: SR_LIMIT };
  const key = JSON.stringify(args);
  if (!srCache[key]) {
    srCache[key] = Promise.resolve(sb.rpc('service_rankings', args)).then(r => {
      if (r.error) { delete srCache[key]; throw r.error; }
      return r.data;
    }, e => { delete srCache[key]; throw e; });
  }
  return srCache[key];
}
// Several salons picked: one call each, added together. A client at two salons counts once in each, the page says so.
function srMerge(list) {
  const o = { rows: [], total_rev: 0, total_units: 0, total_clients: 0, fams: [], cats: [] };
  const rows = {}, fams = {}, cats = {};
  list.forEach(d => {
    o.total_rev += Number(d.total_rev) || 0; o.total_units += Number(d.total_units) || 0; o.total_clients += Number(d.total_clients) || 0;
    (d.rows || []).forEach(r => {
      const k = r.stem + '|' + r.category, a = rows[k] || (rows[k] = { stem: r.stem, category: r.category, family: r.family, rev: 0, units: 0, clients: 0, bu: {}, v: {} });
      a.rev += Number(r.rev) || 0; a.units += r.units || 0; a.clients += r.clients || 0;
      Object.keys(r.bu || {}).forEach(b => { a.bu[b] = (a.bu[b] || 0) + r.bu[b]; });
      (r.v || []).forEach(x => { const v = a.v[x.item] || (a.v[x.item] = { item: x.item, units: 0, rev: 0 }); v.units += x.units; v.rev += Number(x.rev) || 0; });
    });
    (d.fams || []).forEach(f => { const a = fams[f.family] || (fams[f.family] = { family: f.family, rev: 0, units: 0 }); a.rev += Number(f.rev) || 0; a.units += f.units || 0; });
    (d.cats || []).forEach(c => { const a = cats[c.category] || (cats[c.category] = { category: c.category, rev: 0, units: 0 }); a.rev += Number(c.rev) || 0; a.units += c.units || 0; });
  });
  o.rows = Object.keys(rows).map(k => { const r = rows[k]; r.v = Object.keys(r.v).map(i => r.v[i]).sort((x, y) => y.units - x.units); return r; });
  o.fams = Object.keys(fams).map(k => fams[k]); o.cats = Object.keys(cats).map(k => cats[k]);
  return o;
}
function srFetch(range, codes) {
  if (!codes || codes.length === 1) return srCall(range, codes ? codes[0] : null);
  return Promise.all(codes.map(c => srCall(range, c))).then(srMerge);
}

// ── CONTROLS ─────────────────────────────────────────────────────────────────────────
function srPickFam(f) { SR.fam = f || 'all'; SR.cat = null; srT.clear(); srT.shown = SR.n; srPaintTop(); srPaintFams(); srSync(); }
function srPickCat(c) { SR.cat = c || null; srT.clear(); srT.shown = SR.n; srPaintTop(); srSync(); }
function srSync() { if (typeof trSyncUrl === 'function' && typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'services') trSyncUrl(null); }
function srRankBy(k) { SR.rank = k === 'units' ? 'units' : 'rev'; srSave(); srT.clear(); srPaint(); srSync(); }
function srRowsPick(n) { SR.n = n; srSave(); srT.shown = n; srT.page = 0; srT.draw(); srOffsets(); srSync(); }
function srPage(d) { srT.page += d; srT.draw(); srOffsets(); const s = document.getElementById('srBar'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'start' }); }

function srShell() {
  return `
    <section class="slv-intro">
      <h2>Service Rankings</h2>
      <p>The services clients book most, by revenue or by units. Every size of a service is one row, and each service carries Phorest's own category. Tap any figure to see what adds up to it.</p>
    </section>
    ${whyWall([
      ['Why this page', 'Which services clients book most, by revenue or by units, with every size of a service counted as one row.'],
      ['Why now', 'It follows the Branch and Period at the top, so on last month you see what carried a month that has just closed.'],
      ['If we do nothing', 'We plan time, stock and promotions on a guess, and the services clients love most get no extra push.']],
      'Coach Emma reads the top three services by revenue and asks each salon coordinator if the diary has room for them next week. No date yet: it waits for Kate\'s yes on this page.')}
    <div id="srBody"><p class="slv-muted" style="margin-top:16px">Loading services…</p></div>`;
}

// ── DRAW ─────────────────────────────────────────────────────────────────────────────
async function renderServiceRankings() {
  const el = document.getElementById('serviceRankingsContent');
  if (!el) return;
  el.innerHTML = srShell();
  srData = null; srPrev = null; srSal = null;
  srBuildTables();
  srLoad();
}
async function srLoad() {
  const seq = ++srSeq, cur = srRange(), prev = srPrevRange(), codes = srCodes();
  if (typeof trSyncUrl === 'function' && typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'services') trSyncUrl(null);
  srBusy = true; srPrevState = prev ? 'loading' : 'none'; srPaintBusy();
  const prevP = prev ? srFetch(prev, codes).catch(e => { console.error('Service Rankings, the period before', e); return null; }) : Promise.resolve(null);
  try {
    const d = await srFetch(cur, codes);
    if (seq !== srSeq) return;
    srData = d; srPrev = null; srSal = null; srBusy = false;
    srPaint();
    const p = await prevP;
    if (seq !== srSeq) return;
    srPrev = p; srPrevState = p ? 'ok' : (prev ? 'failed' : 'none'); srPaint();
    // By salon: one call per salon, two at a time (ten heavy calls at once on a long window made the comparison time out), the current period first
    const list = srSalonCodes();
    if (!srBah() && list.length > 1) await srSalonLoad(seq, cur, prev, list);
  } catch (e) {
    console.error(e);
    if (seq === srSeq) { srBusy = false; const b = document.getElementById('srBody'); if (b) b.innerHTML = '<p class="slv-muted" style="margin-top:16px">The ranking did not load. <button type="button" class="cm-pill" onclick="srLoad()">Try again</button></p>'; }
  }
}
async function srSalonLoad(seq, cur, prev, list) {
  const out = list.map(c => ({ c, a: null, p: null }));
  const run = async tasks => { for (let i = 0; i < tasks.length; i += 2) { await Promise.all(tasks.slice(i, i + 2).map(f => f())); if (seq !== srSeq) return false; } return true; };
  if (!await run(out.map(s => async () => { try { s.a = await srCall(cur, s.c); } catch (e) { console.error('Service Rankings, ' + s.c, e); } }))) return;
  srSal = out.filter(s => s.a); srPaintSalon();
  if (prev) { if (!await run(out.map(s => async () => { try { s.p = await srCall(prev, s.c); } catch (e) { s.p = null; } }))) return; srSal = out.filter(s => s.a); srPaintSalon(); }
}
function srPaintBusy() { const b = document.getElementById('srBody'); if (b) b.classList.toggle('cm-busy', srBusy); }

// ── THE NUMBERS ──────────────────────────────────────────────────────────────────────
function srTot() {
  const d = srData, fx = srFx(), p = srPrev;
  return { rev: (Number(d.total_rev) || 0) * fx, u: Number(d.total_units) || 0, cl: Number(d.total_clients) || 0, n: (d.rows || []).length,
    pr: p ? (Number(p.total_rev) || 0) * fx : null, pu: p ? Number(p.total_units) || 0 : null, hasPrev: !!p };
}
function srFams() {
  const fx = srFx(), pm = {}; if (srPrev) (srPrev.fams || []).forEach(f => { pm[f.family] = f; });
  return (srData.fams || []).map(f => ({ k: f.family, rev: (Number(f.rev) || 0) * fx, u: f.units || 0, pr: srPrev ? ((pm[f.family] ? Number(pm[f.family].rev) : 0) * fx) : null, pu: srPrev ? (pm[f.family] ? pm[f.family].units : 0) : null }))
    .filter(f => f.rev > 0 || f.u > 0).sort((a, b) => b.rev - a.rev);
}
// every service in the picture, joined to the period before
function srAll() {
  const fx = srFx(), pm = {}; if (srPrev) (srPrev.rows || []).forEach(r => { pm[r.stem + '|' + r.category] = r; });
  const k = SR.rank === 'units' ? 'u' : 'rev';
  const out = (srData.rows || []).map(r => {
    const p = pm[r.stem + '|' + r.category];
    return { key: r.stem + '|' + r.category, name: r.stem, cat: r.category, fam: r.family, rev: (Number(r.rev) || 0) * fx, u: r.units || 0, cl: r.clients || 0,
      pr: p ? (Number(p.rev) || 0) * fx : 0, pu: p ? p.units : 0, hasPrev: !!srPrev, bu: r.bu || {}, v: r.v || [] };
  });
  out.sort((a, b) => (b[k] - a[k]) || (b.rev - a.rev));
  return out;
}
function srRows() {
  const rows = srAll().filter(r => (SR.fam === 'all' || r.fam === SR.fam) && (!SR.cat || r.cat === SR.cat));
  rows.forEach((r, i) => { r.rk = i + 1; });
  return rows;
}
const srChgV = r => !r.hasPrev ? undefined : SR.rank === 'units' ? srPct(r.u, r.pu) : srPct(r.rev, r.pr);
const srPrevMsg = () => srPrevState === 'loading' ? 'comparing…' : srPrevState === 'failed' ? 'the comparison did not load' : 'no earlier data to compare';
const srShort = () => { const p = srPrevRange(); return p ? p[3] : 'prior period'; };
function srChgCell(p, spec) {
  if (p === undefined) return '<span class="sr-d">–</span>';
  if (p === null) return srNum('<span class="sr-d new">new</span>', spec);
  return srNum(`<span class="sr-d ${p >= 0.05 ? 'up' : p <= -0.05 ? 'down' : ''}">${srSgn(p)}</span>`, spec);
}

// ── WINDOWS (drill.js): what is behind a figure ──────────────────────────────────────
const srSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// WHO had it: drill_service_clients. f = { stem, category, fam, item, branch }; branch overrides the masthead's salons for one salon column.
function srClientsView(f, label) {
  return { id: 'clients', label: label || 'Clients', load: async () => {
    const [a, b] = srRange(), codes = f.branch ? [f.branch] : srCodes();
    const r = await sb.rpc('drill_service_clients', { p_from: a, p_to: b, p_branch: codes ? codes.join(',') : null, p_stem: f.stem || null, p_category: f.category || null,
      p_fam: f.fam || null, p_item: f.item || null, p_limit: 500 });
    if (r.error) {
      if (/could not find the function|does not exist|schema cache/i.test(r.error.message || '')) return { cols: [{ k: 'n', l: 'Clients' }], rows: [], note: 'This list needs a small database update that has not been applied yet.' };
      throw r.error;
    }
    const d = r.data || {}, rows = d.rows || [];
    return {
      cols: [{ k: 'client', l: 'Client' }, { k: 'salon', l: 'Salon' }, { k: 'units', l: 'Units', t: 'num' }, { k: 'visits', l: 'Visits', t: 'num' }, { k: 'last', l: 'Last visit', t: 'date' }, { k: 'items', l: 'Service names' }],
      rows: rows.map(x => { const dates = srDatesSpec(x, (x.items || '').split(' · ').concat(f.names || []), f.item || f.stem || (f.fam ? cmFam(f.fam).name : 'services'));
        return { client: x.client_name, salon: srName(x.branch), units: x.units, visits: x.visits, last: x.last_day, items: x.items,
          _dn: { client: (typeof PD !== 'undefined' && PD.clientHistory) ? PD.clientHistory({ cur: srCur(), label: 'Service Rankings' }, { client: x.client_name, cid: x.client_id }) : null, units: dates, visits: dates } }; }),   // her name opens her own window: visits, bookings, and phone and email at Level 5 (pulse-drill.js)
      sub: lcNum(d.total_clients) + ' different people · ' + lcNum(d.total_units) + ' units · ' + srPeriodText(),
      note: (rows.length >= 500 ? 'The first 500 people are listed, most units first. ' : '') + (d.walkin_units ? lcNum(d.walkin_units) + ' units were walk-ins and are not listed.' : '')
    };
  } };
}
// WHICH DATES: this client's lines for the service, from drill_client_lines (the one the Spent windows use), kept to the names of the service (Kate, 18 Nov 2026:
// "when i click units it should show which dates"). Units and Visits in the clients list open it.
function srDatesSpec(x, names, title) {
  const [a, b] = srRange(), clean = s => String(s || '').replace(/\s*\(Refund\)\s*$/i, '').trim().toLowerCase();
  const set = new Set(names.filter(Boolean).map(clean));
  return { title: x.client_name + ', ' + title, sub: srName(x.branch) + ' · ' + srPeriodText(), cur: srCur(), sk: srSlug(x.client_name + ' ' + title + ' dates'), views: [{ id: 'dates', label: 'Dates', load: async () => {
    const r = await sb.rpc('drill_client_lines', { p_from: a, p_to: b, p_branches: [x.branch], p_client: x.client_name, p_employees: null, p_ckey: x.client_id || null });
    if (r.error) throw r.error;
    const rows = (r.data.rows || []).filter(l => !l.r && set.has(clean(l.i)));
    return { cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Salon' }, { k: 'i', l: 'Service name' }, { k: 'n', l: 'Net', t: 'aed' }],
      rows: rows.map(l => ({ d: l.d, b: srName(l.b), i: l.i, n: (Number(l.n) || 0) * srFx() })),
      foot: rows.length ? { d: '', b: '', i: lcNum(rows.length) + ' line' + (rows.length === 1 ? '' : 's'), n: rows.reduce((s, l) => s + (Number(l.n) || 0) * srFx(), 0) } : null,
      empty: 'No lines found for these names.', note: 'From Phorest’s sales lines, the newest 500 of her lines in the Period. One line is one unit.' };
  } }] };
}
// A row of the table: its names, who, how it is worked out, against the period before. First = the view that opens first.
function srSvcSpec(r, first) {
  const t = srTot(), pv = srPrevRange(), can = srCanClients();
  const views = {
    names: { id: 'names', label: 'Sizes and names', load: async () => {
      const vsum = r.v.reduce((s, v) => s + v.units, 0), vrev = r.v.reduce((s, v) => s + (Number(v.rev) || 0), 0) * srFx(), rest = r.u - vsum, restRev = r.rev - vrev;
      const rows = r.v.map(v => ({ item: v.item, units: v.units, rev: (Number(v.rev) || 0) * srFx(), _dn: can ? { units: { title: v.item, sub: r.name + ' · ' + srPeriodText(), sk: srSlug(r.name + ' ' + v.item), views: [srClientsView({ stem: r.name, category: r.cat, item: v.item, names: [v.item] })] } } : null }));
      if (rest > 0) rows.push({ item: 'Other names', units: rest, rev: Math.max(0, restRev) });
      return { cols: [{ k: 'item', l: 'Item name in Phorest' }, { k: 'units', l: 'Units', t: 'num' }, { k: 'rev', l: 'Revenue', t: 'aed' }], rows,
        foot: { item: r.name + ', ' + srScope(), units: r.u, rev: r.rev }, note: 'Every size and package line of this service is one row. A package line shows no revenue of its own.' };
    } },
    salon: { id: 'salon', label: 'By salon', load: async () => {
      const codes = Object.keys(r.bu || {}).filter(c => r.bu[c] > 0).sort((a, b) => r.bu[b] - r.bu[a]);
      return { cols: [{ k: 'salon', l: 'Salon' }, { k: 'units', l: 'Units', t: 'num' }, { k: 'share', l: 'Share of units', t: 'pct' }],
        rows: codes.map(c => ({ salon: srName(c), units: r.bu[c], share: r.u ? 100 * r.bu[c] / r.u : 0, _dn: can ? { units: { title: srName(c), sub: r.name + ' · ' + srPeriodText(), sk: srSlug(r.name + ' ' + c), views: [srClientsView({ stem: r.name, category: r.cat, branch: c, names: r.v.map(v => v.item) })] } } : null })),
        foot: { salon: 'All salons', units: r.u, share: 100 } };
    } },
    sep: { id: 'sep', label: 'Against ' + (pv ? pv[3] : 'before'), load: async () => {
      if (!r.hasPrev) return { cols: [{ k: 'n', l: 'Against the period before' }], rows: [], note: 'There is no earlier data to compare with.' };
      const pc = srPct(r.rev, r.pr), pcu = srPct(r.u, r.pu);
      return { cols: [{ k: 'm', l: 'Measure' }, { k: 'now', l: 'Now', t: 'num' }, { k: 'before', l: pv ? pv[2] : 'Before', t: 'num' }, { k: 'chg', l: 'Change', t: 'pct' }],
        rows: [{ m: 'Revenue (' + srCur() + ')', now: Math.round(r.rev), before: Math.round(r.pr), chg: pc }, { m: 'Units', now: r.u, before: r.pu, chg: pcu }],
        note: pc === null ? 'It had no sales in the period before, so it shows as new.' : '' };
    } },
    how: { id: 'how', label: 'Worked out', load: async () => {
      const pc = srPct(r.rev, r.pr), n = x => lcNum(x);
      return { cols: [{ k: 'm', l: 'Figure' }, { k: 'w', l: 'Worked out' }],
        rows: [{ m: 'Share of revenue', w: n(r.rev) + ' ÷ ' + n(t.rev) + ' = ' + srPf(r.rev, t.rev) }, { m: 'Average per unit', w: n(r.rev) + ' ÷ ' + n(r.u) + ' units = ' + srCur() + ' ' + n(r.u ? r.rev / r.u : 0) },
          { m: 'Change on ' + (pv ? pv[3] : 'before'), w: !r.hasPrev ? 'no earlier data' : pc === null ? 'new, no sales in the period before' : '(' + n(r.rev) + ' − ' + n(r.pr) + ') ÷ ' + n(r.pr) + ' = ' + srSgn(pc) }].map(x => Object.assign(x, {})),
        note: 'Revenue is ex VAT.' };
    } }
  };
  views.clients = can ? srClientsView({ stem: r.name, category: r.cat, names: r.v.map(v => v.item) }, 'Clients') : null;
  const order = first === 'clients' && can ? ['clients', 'names', 'salon', 'sep', 'how'] : first === 'sep' ? ['sep', 'names', 'salon', 'how', 'clients'] : first === 'how' ? ['how', 'names', 'salon', 'sep', 'clients'] : ['names', 'clients', 'salon', 'sep', 'how'];
  const single = srSalonCodes().length < 2 || srBah();
  return { title: r.name, sub: lcNum(r.u) + ' units · ' + srAed(r.rev) + ' · ' + r.cat + ' · ' + srPeriodText(), cur: srCur(), sk: srSlug(r.name),
    views: order.filter(k => views[k] && !(k === 'salon' && single)).map(k => views[k]) };
}
// A group of services: every service (all), a family, a salon. Its services first, then who.
function srGroupSpec(o) {
  const can = srCanClients(), fx = srFx();
  const services = { id: 'services', label: 'Services', load: async () => {
    let rows;
    if (o.salon) { const s = (srSal || []).find(x => x.c === o.salon); rows = s ? (s.a.rows || []).map(r => ({ key: r.stem + '|' + r.category, name: r.stem, cat: r.category, u: r.units, cl: r.clients, rev: (Number(r.rev) || 0) * fx })) : []; }
    else rows = srAll().filter(r => !o.fam || o.fam === 'all' || r.fam === o.fam);
    rows = rows.slice().sort((a, b) => b.rev - a.rev);
    return { cols: [{ k: 'svc', l: 'Service' }, { k: 'rev', l: 'Revenue', t: 'aed' }, { k: 'units', l: 'Units', t: 'num' }, { k: 'cl', l: 'Clients', t: 'num' }],
      rows: rows.slice(0, 300).map(r => ({ svc: r.name, rev: r.rev, units: r.u, cl: r.cl,
        _dn: can ? { units: { title: r.name, sub: o.title, sk: srSlug(r.name), views: [srClientsView({ stem: r.name, category: r.cat, branch: o.salon })] }, cl: { title: r.name, sub: o.title, sk: srSlug(r.name + '-c'), views: [srClientsView({ stem: r.name, category: r.cat, branch: o.salon })] } } : null })),
      note: rows.length > 300 ? 'The biggest 300 are listed.' : '' };
  } };
  const views = [services];
  if (can) views.push(srClientsView({ fam: o.fam && o.fam !== 'all' ? o.fam : null, branch: o.salon }, 'Clients'));
  if (can && o.first === 'clients') views.reverse();
  return { title: o.title, sub: o.sub || srPeriodText(), cur: srCur(), sk: srSlug(o.title), views };
}
const srAllSpec = first => srGroupSpec({ title: 'All services, ' + srScope(), fam: 'all', first });
const srFamSpec = (f, first) => srGroupSpec({ title: cmFam(f).name + ', ' + srScope(), fam: f, first });
const srSalSpec = (c, first) => srGroupSpec({ title: srName(c), salon: c, first });

// ── THE TOP OF THE PAGE: answer, tiles, family list ──────────────────────────────────
function srPaint() {
  srPaintBusy();
  const d = srData; if (!d) return;
  const body = document.getElementById('srBody'); if (!body) return;
  if (!body.dataset.drawn) {
    body.dataset.drawn = '1';
    body.innerHTML = `
      <section class="sr-ans" aria-label="The answer in one line"><div class="sr-ans-k">The answer in one line</div><div class="sr-ans-t" id="srAns"></div><div class="sr-ans-s" id="srAns2"></div></section>
      <section class="sr-sec" data-jn="The numbers">
        <h3>The numbers</h3>
        <div class="sr-learn"><p><b>What is this?</b> Everything the chosen salons made from services in the Period, set against the period before. Retail, deposits, vouchers and refunds are not in it.</p>
          <p class="watch"><b>What to watch.</b> <span id="srW1"></span></p></div>
        <div class="sr-tiles" id="srTiles"></div>
        <div class="slv-eyebrow" style="margin:16px 0 6px">Where the money came from, by family</div>
        <div class="sr-famlist" id="srFamList" role="list"></div>
        <p class="sr-hint">Tap a family to see its services in the table below.</p>
      </section>
      <section class="sr-sec" data-jn="Top services" id="srTopSec">
        <h3>Top services</h3>
        <div class="sr-learn"><p><b>What is this?</b> One row per service. Every size of a service (MD, L/T, F/S) counts in its row, and the row carries Phorest's own category.</p>
          <p><b>Why it matters.</b> These are the services the diary is really built on, so this is where time, stock and a push pay back first.</p>
          <p class="watch"><b>What to watch.</b> <span id="srW2"></span></p></div>
        <div class="sr-bar" id="srBar">
          <span class="slv-eyebrow">Family</span><select id="srFamSel" aria-label="Family" onchange="srPickFam(this.value)"></select>
          <span id="srCatWrap" hidden><span class="slv-eyebrow">Category</span><select id="srCatSel" aria-label="Phorest category" onchange="srPickCat(this.value)"></select></span>
          <span class="slv-eyebrow">Rank by</span>
          <div class="sc-seg" role="group" aria-label="Rank by"><button type="button" class="on" data-sr-rank="rev" onclick="srRankBy('rev')">Revenue</button><button type="button" data-sr-rank="units" onclick="srRankBy('units')">Units</button></div>
          <button type="button" class="cm-pill" id="srMore" onclick="srToggleMore()">All columns</button>
          <button type="button" class="cm-pill sr-phone" data-sxcm="svc">Sort and filter</button>
          <span class="sr-sp"></span>
          <button type="button" class="cm-pill" id="srClear" hidden onclick="srT.clear();srT.draw()">Clear filters</button>
          <button type="button" class="cm-pill" id="srCopy" onclick="srCopy()">Copy list for Sheets</button>${typeof rexButtons === 'function' ? rexButtons('srExport') : ''}
        </div>
        <div class="sr-card"><table id="srTbl"></table></div>
        <div class="sr-pager"><span id="srPgTxt"></span><span class="sr-sp"></span><span class="slv-eyebrow">Rows</span><select id="srPgSel" aria-label="Rows to show" onchange="srRowsPick(+this.value)"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
          <button type="button" class="cm-pill" id="srPrev" onclick="srPage(-1)">‹ Previous</button><span class="sr-pgn" id="srPgN"></span><button type="button" class="cm-pill" id="srNext" onclick="srPage(1)">Next ›</button></div>
        <p class="sr-hint" id="srHint"></p>
      </section>
      <section class="sr-sec" data-jn="By salon" id="srSalSec" hidden>
        <h3>By salon</h3>
        <div class="sr-learn"><p><b>What is this?</b> The same figures for each salon, plus the service each salon sells most.</p>
          <p><b>Why it matters.</b> A salon that sells a service well already knows how. The others can ask it what it does at the desk.</p>
          <p class="watch"><b>What to watch.</b> <span id="srW3"></span></p></div>
        <div class="sr-bar sr-bar-plain"><button type="button" class="cm-pill" onclick="srToggleMore('sal')">All columns</button><button type="button" class="cm-pill sr-phone" data-sxcm="sal">Sort and filter</button>
          <span class="sr-hint">A client who visits two salons counts once in each salon, so salon clients do not add up to the total.</span></div>
        <div class="sr-card"><table id="srSalTbl"></table></div>
      </section>
      <section class="sr-sec" data-jn="By family">
        <h3>By family</h3>
        <div class="sr-learn"><p><b>What is this?</b> The same figures for each family of services (Colour, Cut &amp; style, Hair treatments and so on), counting every service in it.</p>
          <p><b>Why it matters.</b> It shows which part of the menu carries the month and which part is moving.</p>
          <p class="watch"><b>What to watch.</b> <span id="srW4"></span></p></div>
        <div class="sr-bar sr-bar-plain"><button type="button" class="cm-pill" onclick="srToggleMore('fam')">All columns</button><button type="button" class="cm-pill sr-phone" data-sxcm="fam">Sort and filter</button></div>
        <div class="sr-card"><table id="srFamTbl"></table></div>
      </section>
      <section class="sr-how" id="srHow"><h3>How it is worked out</h3><div class="sc-seg sr-pick" id="srPick" role="group" aria-label="Which figure"></div><div class="sr-howcard" id="srHowCard"></div></section>
      <div class="sr-foot">
        <details class="sr-fd"><summary>About these numbers</summary><ul>
          <li>Revenue is ex VAT. Units are sales lines.</li><li>All sizes, packages and "(Treat)" lines of a service are one row.</li>
          <li>Retail, deposits, vouchers, refunds and prepaid courses are left out.</li><li>Phorest is the only source. It starts in May 2021 at Saadiyat and Khalifa City A, December 2022 at Motor City and September 2023 at Al Quoz; this page reads from August 2021 on. Bahrain starts on 13 Aug 2026.</li>
          <li>Bahrain is its own Phorest business, in BHD. It is never added into the UAE totals.</li>
          <li>Client lists are for Level 3 and up. Level 2 sees the same figures as plain text.</li></ul></details>
      </div>`;
    document.getElementById('srPgSel').value = String(SR.n);
    document.querySelectorAll('[data-sr-rank]').forEach(b => b.classList.toggle('on', b.dataset.srRank === SR.rank));
  }
  document.querySelectorAll('[data-sr-rank]').forEach(b => b.classList.toggle('on', b.dataset.srRank === SR.rank));
  srPaintAnswer(); srPaintFams(); srPaintTop(); srPaintFamilyTable(); srPaintHow(); srPaintSalon();
  document.getElementById('srSalSec').hidden = srBah() || srSalonCodes().length < 2;
  srOffsets();
}
function srPaintAnswer() {
  const t = srTot(), fm = srFams().filter(f => f.k !== 'consult' && f.k !== 'unmapped'), f = fm[0], rows = srAll().slice().sort((a, b) => b.rev - a.rev), top = rows[0];
  const a = document.getElementById('srAns'), a2 = document.getElementById('srAns2');
  if (!f || !top) { a.textContent = 'No services in these filters.'; a2.textContent = ''; return; }
  a.innerHTML = lcEsc(cmFam(f.k).name) + ' paid for ' + Math.round(100 * f.rev / t.rev) + ' in every 100 ' + (srCur() === 'AED' ? 'dirhams' : 'dinars') + ' in ' + lcEsc(srPeriodText()) + '. ' + srNum(lcEsc(top.name), srSvcSpec(top, 'names')) + ' was the top service at ' + srCur() + ' ' + srNum(lcNum(top.rev), srSvcSpec(top, 'names')) + '.';
  const p = t.hasPrev ? srPct(t.rev, t.pr) : null;
  a2.innerHTML = lcEsc(srScope()) + ': ' + srCur() + ' ' + srNum(lcNum(t.rev), srAllSpec('services')) + ' ex VAT across ' + srNum(lcNum(t.u), srAllSpec('clients')) + ' units' + (p === null ? '' : ', ' + srChgCell(p, srAllSpec('services')) + ' on ' + lcEsc((srPrevRange() || [])[2] || 'the period before')) + '.';
}
function srPaintFams() {
  const t = srTot(), fm = srFams(), box = document.getElementById('srFamList'); if (!box) return;
  const show = fm.filter(f => t.rev > 0 && f.rev / t.rev >= 0.005), mx = Math.max.apply(null, show.map(f => f.rev).concat([1]));
  box.innerHTML = show.map(f => { const p = t.hasPrev ? srPct(f.rev, f.pr) : undefined;
    return `<button type="button" class="sr-fr${SR.fam === f.k ? ' on' : ''}" role="listitem" onclick="srFamFromList('${f.k}')"><span class="sr-fn">${lcEsc(cmFam(f.k).name)}</span><span class="sr-fbw"><i style="width:${100 * f.rev / mx}%"></i></span><span class="sr-fv">${srCur()} ${lcNum(f.rev)}<em>${srPf(f.rev, t.rev)}</em></span><span class="sr-fch ${p === undefined ? '' : p === null ? 'nw' : p >= 0.05 ? 'up' : p <= -0.05 ? 'dn' : ''}">${p === undefined ? '' : p === null ? 'new' : srSgn(p)}</span></button>`; }).join('');
  const tiles = [['Revenue, ex VAT', srCur() + ' ' + srNum(lcNum(t.rev), srAllSpec('services')), t.hasPrev ? vs(srPct(t.rev, t.pr)) : srPrevMsg()],
    ['Units', srNum(lcNum(t.u), srAllSpec('clients')), t.hasPrev ? vs(srPct(t.u, t.pu)) : ''],
    ['Services sold', srNum(lcNum(t.n) + (t.n >= SR_LIMIT ? '+' : ''), srAllSpec('services')), 'different services in the period'],
    ['Clients', srNum(lcNum(t.cl), srAllSpec('clients')), (srCodes() || []).length > 1 ? 'counted once per salon, so a client at two salons counts twice' : 'different people, any of these services']];
  function vs(p) { return p === null ? 'no sales in the period before' : srChgCell(p, srAllSpec('services')) + ' on ' + lcEsc((srPrevRange() || [])[2] || 'the period before'); }
  document.getElementById('srTiles').innerHTML = tiles.map(x => `<div class="sr-tile"><div class="sr-tk">${x[0]}</div><div class="sr-tv">${x[1]}</div><div class="sr-tn">${x[2]}</div></div>`).join('');
  // what to watch: the biggest riser and drop among services that mattered in the period before
  const rows = srAll().filter(r => r.hasPrev && r.pr > 0 && r.pr >= (t.pr || 0) * 0.003).map(r => ({ r, p: srPct(r.rev, r.pr) })).sort((a, b) => b.p - a.p), w = document.getElementById('srW1');
  if (rows.length > 1) { const up = rows[0], dn = rows[rows.length - 1];
    w.innerHTML = 'Biggest riser on ' + lcEsc((srPrevRange() || [])[2] || 'the period before') + ': ' + srNum(lcEsc(up.r.name), srSvcSpec(up.r, 'sep')) + ' (' + srSgn(up.p) + ', ' + srCur() + ' ' + lcNum(up.r.pr) + ' to ' + lcNum(up.r.rev) + '). Biggest drop: ' + srNum(lcEsc(dn.r.name), srSvcSpec(dn.r, 'sep')) + ' (' + srSgn(dn.p) + '). What do you notice about the diary behind them?'; }
  else w.textContent = 'Not enough services with an earlier period to compare here.';
}
function srFamFromList(k) { srPickFam(SR.fam === k ? 'all' : k); const s = document.getElementById('srTopSec'); if (s && s.scrollIntoView) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// ── TOP SERVICES ─────────────────────────────────────────────────────────────────────
function srBuildTables() {
  const k = () => SR.rank === 'units' ? 'u' : 'rev';
  const col = (key, l, raw, disp, cell, extra) => Object.assign({ k: key, l, t: 'num', raw, disp, cell }, extra || {});
  const oneSalon = () => srBah() || (srCodes() || []).length === 1;
  srT = TRSheet.table({ id: 'svc', el: '#srTbl', rows: srRows, limit: SR.n,
    cols: [
      { k: 'svc', l: 'Service', t: 'txt', raw: r => r.name, disp: r => r.name, cell: r => `<span class="sr-stf"><span class="sr-rk">${r.rk}</span><span class="sr-sv">${srNum(`<b>${lcEsc(r.name)}</b>`, srSvcSpec(r, 'names'))}<em>${lcEsc(r.cat)}</em></span></span>` },
      col('rev', () => 'Revenue (' + srCur() + ')', r => r.rev, r => lcNum(r.rev), r => srNum(lcNum(r.rev), srSvcSpec(r, 'names'))),
      col('u', 'Units', r => r.u, r => lcNum(r.u), r => srNum(lcNum(r.u), srSvcSpec(r, 'clients'))),
      col('chg', () => 'Change on ' + srShort(), r => { const p = srChgV(r); return p === undefined ? -100000 : p === null ? 100000 : p; }, r => { const p = srChgV(r); return p === undefined ? '' : p === null ? 'new' : srSgn(p); }, r => srChgCell(srChgV(r), srSvcSpec(r, 'sep')), { sub: () => SR.rank === 'units' ? 'units' : 'revenue' }),
      col('share', 'Share', r => 100 * r[k()] / (srTot()[k()] || 1), r => srPf(r[k()], srTot()[k()]), r => srNum(srPf(r[k()], srTot()[k()]), srSvcSpec(r, 'how')), { x: 1 }),
      col('avg', 'Avg per unit', r => r.u ? r.rev / r.u : 0, r => lcNum(r.u ? r.rev / r.u : 0), r => srNum(lcNum(r.u ? r.rev / r.u : 0), srSvcSpec(r, 'how')), { x: 1 }),
      col('cl', 'Clients', r => r.cl, r => lcNum(r.cl), r => srNum(lcNum(r.cl), srSvcSpec(r, 'clients')), { x: 1 }),
      { k: 'cat', l: 'Phorest category', t: 'txt', x: 1, raw: r => r.cat, disp: r => r.cat, cell: r => lcEsc(r.cat) },
      { k: 'fam', l: 'Family', t: 'txt', x: 1, raw: r => cmFam(r.fam).name, disp: r => cmFam(r.fam).name, cell: r => lcEsc(cmFam(r.fam).name) }
    ].concat(SR_SALONS.map(c => ({ k: 'b' + c, l: () => 'Units ' + c, t: 'num', x: 1, hide: () => srBah() || oneSalon(), raw: r => r.bu[c] || 0, disp: r => lcNum(r.bu[c] || 0),
      cell: r => srNum(lcNum(r.bu[c] || 0), (r.bu[c] && srCanClients()) ? { title: r.name + ', ' + srName(c), sub: srPeriodText(), sk: srSlug(r.name + ' ' + c), views: [srClientsView({ stem: r.name, category: r.cat, branch: c })] } : null) }))),
    total: rows => { let a = 0, u = 0, p = 0, pu = 0; rows.forEach(r => { a += r.rev; u += r.u; p += r.pr; pu += r.pu; });
      const has = rows.some(r => r.hasPrev), x = !has ? undefined : SR.rank === 'units' ? srPct(u, pu) : srPct(a, p), sp = srGroupSpec({ title: (SR.fam === 'all' ? 'All services' : cmFam(SR.fam).name) + ', ' + srScope(), fam: SR.fam, first: 'services' });
      return { svc: 'Total of ' + rows.length + ' services', rev: srNum(lcNum(a), sp), u: srNum(lcNum(u), srGroupSpec({ title: (SR.fam === 'all' ? 'All services' : cmFam(SR.fam).name) + ', ' + srScope(), fam: SR.fam, first: 'clients' })), chg: x === undefined ? '' : srChgCell(x, sp), avg: srNum(lcNum(u ? a / u : 0), sp) }; },
    after: (T, rows, all) => {
      const c = document.getElementById('srClear'); if (c) c.hidden = !T.active();
      const pages = T.pages(rows.length), from = rows.length ? T.page * T.shown + 1 : 0, to = Math.min(rows.length, (T.page + 1) * T.shown), pg = document.getElementById('srPgTxt');
      if (pg) pg.textContent = from + ' to ' + to + ' of ' + rows.length + ' services' + (srData && (srData.rows || []).length >= SR_LIMIT ? ' (the biggest ' + lcNum(SR_LIMIT) + ' by revenue)' : '');
      const pv = document.getElementById('srPrev'), nx = document.getElementById('srNext'), pn = document.getElementById('srPgN');
      if (pv) pv.disabled = T.page <= 0; if (nx) nx.disabled = T.page >= pages - 1; if (pn) pn.textContent = 'Page ' + (T.page + 1) + ' of ' + pages;
    } });
  srTS = TRSheet.table({ id: 'sal', el: '#srSalTbl', rows: srSalRows,
    cols: [
      { k: 'name', l: 'Salon', t: 'txt', raw: r => r.name, disp: r => r.name, cell: r => '<b>' + srNum(lcEsc(r.name), srSalSpec(r.c, 'services')) + '</b>' },
      col('rev', () => 'Revenue (' + srCur() + ')', r => r.rev, r => lcNum(r.rev), r => srNum(lcNum(r.rev), srSalSpec(r.c, 'services'))),
      col('u', 'Units', r => r.u, r => lcNum(r.u), r => srNum(lcNum(r.u), srSalSpec(r.c, 'clients'))),
      col('chg', () => 'Change on ' + srShort(), r => { const p = srPct(r.rev, r.pr); return r.pr === null ? -100000 : p === null ? 100000 : p; }, r => { const p = srPct(r.rev, r.pr); return r.pr === null ? '' : p === null ? 'new' : srSgn(p); }, r => r.pr === null ? '' : srChgCell(srPct(r.rev, r.pr), srSalSpec(r.c, 'services')), { sub: 'revenue' }),
      col('cl', 'Clients', r => r.cl, r => lcNum(r.cl), r => srNum(lcNum(r.cl), srSalSpec(r.c, 'clients')), { x: 1 }),
      col('avg', 'Avg per unit', r => r.u ? r.rev / r.u : 0, r => lcNum(r.u ? r.rev / r.u : 0), r => lcNum(r.u ? r.rev / r.u : 0), { x: 1 }),
      { k: 'top', l: 'Top service here', t: 'txt', x: 1, raw: r => r.top ? r.top.name : '', disp: r => r.top ? r.top.name : '', cell: r => r.top ? lcEsc(r.top.name) : '' },
      col('colour', 'Colour share', r => r.colourShare, r => r.colourShare.toFixed(1) + '%', r => r.colourShare.toFixed(1) + '%', { x: 1 })
    ],
    total: rows => { let a = 0, u = 0, p = 0, has = true; rows.forEach(r => { a += r.rev; u += r.u; if (r.pr === null) has = false; else p += r.pr; });
      const x = has ? srPct(a, p) : undefined, sp = srAllSpec('services'); return { name: rows.length === srSalonCodes().length ? srScope() : 'Rows shown', rev: srNum(lcNum(a), sp), u: srNum(lcNum(u), srAllSpec('clients')), chg: x === undefined ? '' : srChgCell(x, sp), avg: lcNum(u ? a / u : 0), cl: !srCodes() && srData ? srNum(lcNum(srData.total_clients), srAllSpec('clients')) : '' }; } });
  srTF = TRSheet.table({ id: 'fam', el: '#srFamTbl', rows: srFams,
    cols: [
      { k: 'name', l: 'Family', t: 'txt', raw: r => cmFam(r.k).name, disp: r => cmFam(r.k).name, cell: r => '<b>' + srNum(lcEsc(cmFam(r.k).name), srFamSpec(r.k, 'services')) + '</b>' },
      col('rev', () => 'Revenue (' + srCur() + ')', r => r.rev, r => lcNum(r.rev), r => srNum(lcNum(r.rev), srFamSpec(r.k, 'services'))),
      col('u', 'Units', r => r.u, r => lcNum(r.u), r => srNum(lcNum(r.u), srFamSpec(r.k, 'clients'))),
      col('chg', () => 'Change on ' + srShort(), r => { const p = r.pr === null ? undefined : srPct(r.rev, r.pr); return p === undefined ? -100000 : p === null ? 100000 : p; }, r => { const p = r.pr === null ? undefined : srPct(r.rev, r.pr); return p === undefined ? '' : p === null ? 'new' : srSgn(p); }, r => r.pr === null ? '' : srChgCell(srPct(r.rev, r.pr), srFamSpec(r.k, 'services')), { sub: 'revenue' }),
      col('share', 'Share', r => 100 * r.rev / (srTot().rev || 1), r => srPf(r.rev, srTot().rev), r => srPf(r.rev, srTot().rev), { x: 1 }),
      col('avg', 'Avg per unit', r => r.u ? r.rev / r.u : 0, r => lcNum(r.u ? r.rev / r.u : 0), r => lcNum(r.u ? r.rev / r.u : 0), { x: 1 })
    ],
    total: rows => { let a = 0, u = 0, p = 0, has = true; rows.forEach(r => { a += r.rev; u += r.u; if (r.pr === null) has = false; else p += r.pr; });
      const x = has ? srPct(a, p) : undefined, sp = srAllSpec('services'); return { name: 'All services', rev: srNum(lcNum(a), sp), u: srNum(lcNum(u), srAllSpec('clients')), chg: x === undefined ? '' : srChgCell(x, sp), share: '100.0%', avg: lcNum(u ? a / u : 0) }; } });
}
function srToggleMore(w) {
  const T = w === 'sal' ? srTS : w === 'fam' ? srTF : srT; if (!T) return;
  T.toggleMore(); if (!w) { const b = document.getElementById('srMore'); if (b) b.classList.toggle('on', T.more); } srOffsets();
}
function srPaintTop() {
  if (!srData) return;
  // family and category dropdowns (the families the period really has; a chosen one that is gone falls back to All)
  const fm = srFams(), by = {}; fm.forEach(f => { by[f.k] = f; });
  if (SR.fam !== 'all' && !by[SR.fam]) { SR.fam = 'all'; SR.cat = null; }
  const key = SR.rank === 'units' ? 'u' : 'rev', sum = fm.reduce((s, f) => s + f[key], 0) || 1;
  const fs = document.getElementById('srFamSel'); if (!fs) return;
  const order = CM_FAMS.map(f => f.k).filter(k => by[k] && k !== 'retail');
  fs.innerHTML = '<option value="all">All families</option>' + order.map(k => `<option value="${k}">${lcEsc(cmFam(k).name)} (${Math.round(100 * by[k][key] / sum)}%)</option>`).join('');
  fs.value = SR.fam;
  const cw = document.getElementById('srCatWrap'), cs = document.getElementById('srCatSel');
  if (SR.fam === 'all') { cw.hidden = true; SR.cat = null; }
  else {
    const cats = {}; srAll().filter(r => r.fam === SR.fam).forEach(r => { cats[r.cat] = (cats[r.cat] || 0) + r[key]; });
    const names = Object.keys(cats).sort((a, b) => cats[b] - cats[a]);
    if (SR.cat && !cats[SR.cat]) SR.cat = null;
    cs.innerHTML = '<option value="">All categories</option>' + names.map(c => `<option value="${lcEsc(c)}">${lcEsc(c)} (${lcNum(cats[c])})</option>`).join(''); cs.value = SR.cat || '';
    cw.hidden = false;
  }
  srT.shown = SR.n; srT.draw();
  const t = srTot();
  document.getElementById('srHint').textContent = (t.n >= SR_LIMIT ? 'The biggest ' + lcNum(SR_LIMIT) + ' services by revenue. ' : '') + 'Rank by ' + (SR.rank === 'units' ? 'units' : 'revenue') + (SR.fam === 'all' ? '' : ', ' + cmFam(SR.fam).name) + (SR.cat ? ', ' + SR.cat : '') + '.'
    + (srBah() ? ' Bahrain\'s size names (Fine, Medium, Long or Thick) are not merged into one row yet, so one service can show up more than once.' : '');
  const t3 = srAll().slice().sort((a, b) => b.rev - a.rev).slice(0, 3), w = document.getElementById('srW2');
  w.innerHTML = t3.length ? 'The top three: ' + t3.map(r => { const best = srBah() ? null : Object.keys(r.bu).sort((a, b) => r.bu[b] - r.bu[a])[0];
    return srNum(lcEsc(r.name), srSvcSpec(r, 'clients')) + (best && r.bu[best] ? ' (' + lcEsc(srName(best)) + ' sells the most, ' + lcNum(r.bu[best]) + ' units)' : ' (' + lcNum(r.u) + ' units)'); }).join('; ') + '. '
    + (srBah() || (srCodes() || []).length === 1 ? 'Which sizes do clients book, and do they come back for them?' : 'Which salon does each one best, and what does it do at the desk?') : 'No services in these filters.';
  srOffsets();
}

// ── BY SALON ─────────────────────────────────────────────────────────────────────────
function srSalRows() {
  if (!srSal) return [];
  const fx = srFx();
  return srSal.map(s => { const d = s.a, rs = (d.rows || []).slice().sort((a, b) => b.rev - a.rev), top = rs[0] ? { name: rs[0].stem } : null, col = (d.fams || []).find(f => f.family === 'colour');
    return { c: s.c, name: srName(s.c), rev: (Number(d.total_rev) || 0) * fx, u: Number(d.total_units) || 0, cl: Number(d.total_clients) || 0,
      pr: s.p ? (Number(s.p.total_rev) || 0) * fx : null, pu: s.p ? Number(s.p.total_units) || 0 : null, top, colourShare: col && d.total_rev ? 100 * col.rev / d.total_rev : 0 }; })
    .sort((a, b) => b.rev - a.rev);
}
function srPaintSalon() {
  const sec = document.getElementById('srSalSec'); if (!sec) return;
  const show = !srBah() && srSalonCodes().length > 1; sec.hidden = !show;
  if (!show) return;
  if (!srSal) { document.getElementById('srSalTbl').innerHTML = '<tbody><tr><td class="slv-muted">Loading the salons…</td></tr></tbody>'; document.getElementById('srW3').textContent = ''; return; }
  srTS.draw();
  const rows = srSalRows(), w = document.getElementById('srW3');
  const grew = rows.filter(r => r.pr).slice().sort((a, b) => srPct(b.rev, b.pr) - srPct(a.rev, a.pr))[0];
  const tops = srAll().slice().sort((a, b) => b.rev - a.rev).slice(0, 2).map(r => { const best = Object.keys(r.bu).sort((a, b) => r.bu[b] - r.bu[a])[0]; return best ? srNum(lcEsc(srName(best)), srSvcSpec(r, 'salon')) + ' sells the most ' + lcEsc(r.name) + ' (' + lcNum(r.bu[best]) + ' units)' : ''; }).filter(Boolean);
  w.innerHTML = (grew ? srNum(lcEsc(grew.name), srSalSpec(grew.c, 'services')) + ' grew most on ' + lcEsc((srPrevRange() || [])[2] || 'the period before') + ' (' + srSgn(srPct(grew.rev, grew.pr)) + '). ' : '') + tops.join(' and ') + (tops.length ? '. Ask them what they do at the desk.' : '');
}
function srPaintFamilyTable() {
  if (!srTF) return;
  srTF.draw();
  const t = srTot(), rows = srFams().filter(f => f.pr !== null && f.pr >= (t.pr || 0) * 0.02 && f.k !== 'consult' && f.k !== 'unmapped').map(f => ({ f, p: srPct(f.rev, f.pr) })).sort((a, b) => b.p - a.p), w = document.getElementById('srW4');
  let html = rows.length > 1 ? srNum(lcEsc(cmFam(rows[0].f.k).name), srFamSpec(rows[0].f.k, 'services')) + ' moved most up (' + srSgn(rows[0].p) + ') and ' + srNum(lcEsc(cmFam(rows[rows.length - 1].f.k).name), srFamSpec(rows[rows.length - 1].f.k, 'services')) + ' most down (' + srSgn(rows[rows.length - 1].p) + '). Which is the diary, and which is the price?' : 'Not enough families with an earlier period to compare here.';
  const um = srFams().find(f => f.k === 'unmapped');
  if (um && t.rev && um.rev / t.rev >= 0.1) html += ' ' + Math.round(100 * um.rev / t.rev) + '% of the revenue sits in ' + srNum('Unmapped', srFamSpec('unmapped', 'services')) + ': those service names are not matched to a Phorest category yet.';
  w.innerHTML = html;
}

// ── HOW IT IS WORKED OUT: one figure at a time ───────────────────────────────────────
function srPaintHow() {
  const pick = document.getElementById('srPick'); if (!pick || !srData) return;
  const HOWS = [['chg', 'Change on ' + srShort()], ['share', 'Share'], ['avg', 'Average per unit'], ['cl', 'Clients']];
  pick.innerHTML = HOWS.map(h => `<button type="button" class="${h[0] === srHK ? 'on' : ''}" onclick="srHK='${h[0]}';srPaintHow()">${lcEsc(h[1])}</button>`).join('');
  const rows = srAll().slice().sort((a, b) => b.rev - a.rev), r = rows[0], t = srTot(), card = document.getElementById('srHowCard');
  if (!r) { card.innerHTML = ''; return; }
  const n = lcNum; let m, big, cv;
  if (srHK === 'chg') { const p = r.hasPrev ? srPct(r.rev, r.pr) : undefined; m = 'How much more or less this service made than in the period before.'; big = p === undefined ? srPrevMsg() : p === null ? lcEsc(r.name) + ' had no sales in the period before' : '(' + n(r.rev) + ' − ' + n(r.pr) + ') ÷ ' + n(r.pr) + ' = ' + srSgn(p); cv = 'Shown for ' + lcEsc(r.name) + ', ' + lcEsc(srScope()) + '. Revenue is ex VAT. "new" means it had no sales in the period before. Rank by Units changes the column to units.'; }
  else if (srHK === 'share') { m = 'This service\'s part of everything made from services.'; big = n(r.rev) + ' ÷ ' + n(t.rev) + ' = ' + srPf(r.rev, t.rev); cv = 'Shown for ' + lcEsc(r.name) + '. The total is every service. With Rank by Units it is a share of units.'; }
  else if (srHK === 'avg') { m = 'What one sale of this service brings in on average, sizes and all.'; big = n(r.rev) + ' ÷ ' + n(r.u) + ' units = ' + srCur() + ' ' + n(r.u ? r.rev / r.u : 0); cv = 'Shown for ' + lcEsc(r.name) + '. A package line counts as a unit with no revenue of its own, which pulls the average down a little.'; }
  else { m = 'How many different people had this service, counted once each.'; big = n(r.cl) + ' people, ' + n(r.u) + ' units'; cv = 'Shown for ' + lcEsc(r.name) + '. One person can have it more than once, so units are higher than clients. Across salons one person can count twice.'; }
  card.innerHTML = `<div class="sr-hc-t">${lcEsc(HOWS.find(h => h[0] === srHK)[1])}</div><p class="sr-hc-m">${m}</p><div class="sr-hc-big">${big}</div><div class="sr-hc-cv">${cv}</div>`;
}

// the table's sticky offsets (under the masthead and the "On this page" chips), read from the page, never guessed
function srOffsets() {
  const jn = document.querySelector('#view-services .jn-rail'), root = document.documentElement.style;
  const top = jn ? parseFloat(getComputedStyle(jn).top) || 0 : 0;
  root.setProperty('--sx-top', (top + (jn ? jn.offsetHeight : 0)) + 'px');
  document.querySelectorAll('#serviceRankingsContent .sr-sec').forEach(s => { const b = s.querySelector('.sr-bar:not(.sr-bar-plain)'); s.style.setProperty('--bh', (b ? b.offsetHeight : 0) + 'px'); });
}
window.addEventListener('resize', () => { if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'services') srOffsets(); });

// ── COPY AND DOWNLOADS ───────────────────────────────────────────────────────────────
async function srCopy() {
  const btn = document.getElementById('srCopy');
  const say = t => { if (btn) btn.textContent = t; setTimeout(() => { if (btn) btn.textContent = 'Copy list for Sheets'; }, 2400); };
  try {
    const rows = srT.rows(), many = !srBah() && (srCodes() || []).length !== 1;
    const head = ['Rank', 'Service', 'Phorest category', 'Revenue ex VAT (' + srCur() + ')', 'Units', 'Avg per unit', 'Clients'].concat(many ? SR_SALONS.map(b => 'Units ' + b) : []);
    const lines = rows.map(r => [r.rk, r.name, r.cat, Math.round(r.rev), r.u, r.u ? Math.round(r.rev / r.u) : 0, r.cl].concat(many ? SR_SALONS.map(b => r.bu[b] || 0) : []));
    await navigator.clipboard.writeText([head].concat(lines).map(r => r.map(v => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n'));
    say(`Copied ${lcNum(lines.length)}, paste into Sheets`);
  } catch (e) { console.error(e); say('Copy did not work here'); }
}
/* ── DOWNLOADS (Kate, 10 Nov 2026: every report gets an XLSX and a CSV button; report-export.js draws the buttons and saves the file) ──
   The whole list for the picks on the page (not only the rows shown: Rows is a page of the same list), in the order of Rank by, with the period before beside it
   when it has loaded. Tab 2, Sizes, is what each row is made of. The CSV is the ranking. */
function srExport() {
  if (!srData) return null;
  const rows = srT.rows(); if (!rows.length) return null;
  const key = SR.rank === 'units' ? 'u' : 'rev', hasPrev = !!srPrev, many = !srBah() && (srCodes() || []).length !== 1;
  const tr = srTot(), total = key === 'rev' ? tr.rev : tr.u, cur = srCur();
  const r2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
  const [a, b] = srRange(), prev = srPrevRange();
  const cols = [{ key: 'rank', label: 'Rank', fmt: 'num' }, { key: 'svc', label: 'Service', fmt: 'text' }, { key: 'cat', label: 'Phorest category', fmt: 'text' }, { key: 'names', label: 'Names rolled into this row', fmt: 'num' },
    { key: 'rev', label: 'Revenue (' + cur + ', ex VAT)', fmt: 'aed' }, { key: 'units', label: 'Units', fmt: 'num' }, { key: 'avg', label: 'Average per unit (' + cur + ')', fmt: 'aed' }, { key: 'clients', label: 'Clients', fmt: 'num' },
    { key: 'share', label: 'Share of ' + (key === 'rev' ? 'revenue' : 'units'), fmt: 'pct' }]
    .concat(many ? SR_SALONS.map(c => ({ key: 'u_' + c, label: 'Units ' + c, fmt: 'num' })) : [])
    .concat(hasPrev ? [{ key: 'prev', label: 'Revenue, ' + (prev ? prev[2] : 'before'), fmt: 'aed' }, { key: 'pu', label: 'Units, ' + (prev ? prev[2] : 'before'), fmt: 'num' }, { key: 'chg', label: 'Change in ' + (key === 'rev' ? 'revenue' : 'units') + ' %', fmt: 'pct' }] : []);
  const lines = rows.map(r => {
    const cells = [r.rk, r.name, r.cat, r.v.length || 1, r2(r.rev), r2(r.u),
      { v: r.u ? r2(r.rev / r.u) : null, fmt: 'aed', f: A => `IF(N(${A('units')})>0,${A('rev')}/${A('units')},"")` }, r2(r.cl), total ? r2(100 * r[key] / total) : null];
    if (many) SR_SALONS.forEach(c => cells.push(r.bu[c] || 0));
    if (hasPrev) cells.push(r.pr ? r2(r.pr) : null, r.pu ? r2(r.pu) : null, r.hasPrev ? r2(srPct(r[key], key === 'rev' ? r.pr : r.pu)) : null);
    return { cells };
  });
  const sheets = [{ name: 'Service Rankings', title: 'Service Rankings' + (SR.fam !== 'all' ? ', ' + cmFam(SR.fam).name : '') + (SR.cat ? ', ' + SR.cat : ''),
    subtitle: `${srScope()} · ${a} to ${b} · ranked by ${key === 'rev' ? 'revenue' : 'units'}${hasPrev && prev ? ' · set against ' + prev[2] : ''}${srData.rows.length >= SR_LIMIT ? ` · the top ${SR_LIMIT} by revenue` : ''}. Revenue is ex VAT.`,
    blocks: [{ cols, rows: lines }],
    legend: [['Service', 'Every size of a service is one row; a keratin’s Application and Ironing count as one treatment, and package lines count as their service.'], ['Units', 'Sales lines.'],
      ['Revenue', 'Ex VAT. Retail is on Products; deposits, vouchers, refunds and prepaid courses are left out.'], ['Phorest category', 'Phorest’s own service category (the Service roster tab on Client Mix).']] }];
  const sz = [];
  rows.forEach(r => (r.v || []).forEach(x => sz.push({ cells: [r.rk, r.name, r.cat, x.item, r2(x.units), r2((Number(x.rev) || 0) * srFx())] })));
  if (sz.length) sheets.push({ name: 'Sizes', title: 'The sizes and names behind each row', subtitle: `${srScope()} · ${a} to ${b}`,
    blocks: [{ cols: [{ label: 'Rank', fmt: 'num' }, { label: 'Service', fmt: 'text' }, { label: 'Phorest category', fmt: 'text' }, { label: 'Item name in Phorest', fmt: 'text' }, { label: 'Units', fmt: 'num' }, { label: 'Revenue (' + cur + ', ex VAT)', fmt: 'aed' }], rows: sz }] });
  return { name: ['service-rankings', srScope(), a, 'to', b, SR.fam !== 'all' ? SR.fam : '', SR.cat || '', SR.rank === 'units' ? 'by-units' : ''].filter(Boolean).map(srSlug).join('-'), csv: 0, sheets };
}
