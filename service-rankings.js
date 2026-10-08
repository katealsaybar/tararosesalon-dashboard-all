// Service Rankings (Kate, 8 Oct 2026), rebuilt on the Client Mix footing: client-mix.js (loads first;
// its CM_FAMS and cmFam are reused) and lost-clients.js (lcEsc, lcNum, lcDayY, LC_BRANCH).
//
// One call, service_rankings (migrations/service_rankings.sql), over sales_transaction_lines from
// Jan 2025, sorted by Phorest's own service categories (item_classes, the Service roster tab of
// Client Mix). So the sizes of one service (MD, L/T, F/S, the old "(Med)") are ONE row, a keratin's
// Application and Ironing are one treatment, package lines count as their service, and every row
// carries Phorest's category and the family it belongs to. Revenue is net (ex VAT) like Top
// Clients, units are sales lines. The previous window is asked for separately, in parallel, so the
// ranking does not wait for it. Retail is on Products, deposits and vouchers are not services.
//
// Own controls (branch, period, rank by), so the masthead filters are hidden here, as on Top Clients.
// The old page (get_top_services, "Per Branch / Combined") stays in dashboard.js, unused.
const SR_STORE = 'trs-service-rankings';
const SR = { branch: 'all', period: 'last', month: '', pfrom: '', pto: '', fam: 'all', cat: null, rank: 'rev' };
let srData = null, srPrev = null, srSeq = 0, srShowN = 25, srOpen = null, srRows = [], srBusy = false;
const srCache = {};
const SR_FIRST = '2025-01-01';
try {
  const s = JSON.parse(localStorage.getItem(SR_STORE) || '{}');
  for (const k of ['branch', 'period', 'month', 'pfrom', 'pto', 'rank', 'fam']) if (typeof s[k] === 'string') SR[k] = s[k];
} catch (e) {}
const srSave = () => { try { localStorage.setItem(SR_STORE, JSON.stringify({ branch: SR.branch, period: SR.period, month: SR.month, pfrom: SR.pfrom, pto: SR.pto, rank: SR.rank, fam: SR.fam })); } catch (e) {} };
const SR_PERIODS = [['this', 'This month'], ['last', 'Last month'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom']];
const SR_BR = ['SAA', 'KCA', 'MC', 'AQ'];

// ── THE WINDOW (and the one before it) ──────────────────────────────────────
const srIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const srToday = () => srIso(new Date());
const srLastDay = ym => { const [y, m] = ym.split('-').map(Number); return srIso(new Date(y, m, 0)); };
function srRange() {
  const today = srToday(), now = new Date(), y = now.getFullYear(), pad = n => String(n).padStart(2, '0');
  let a, b;
  if (SR.period === 'this') { a = `${y}-${pad(now.getMonth() + 1)}-01`; b = today; }
  else if (SR.period === 'last') { const ym = srIso(new Date(y, now.getMonth() - 1, 1)).slice(0, 7); a = ym + '-01'; b = srLastDay(ym); }
  else if (SR.period === 'month') { const ym = /^\d{4}-\d{2}$/.test(SR.month) ? SR.month : today.slice(0, 7); a = ym + '-01'; b = srLastDay(ym); }
  else if (SR.period === 'custom') { a = SR.pfrom || `${y}-01-01`; b = SR.pto || today; }
  else { a = `${y}-01-01`; b = today; }
  if (a < SR_FIRST) a = SR_FIRST;
  if (b > today) b = today;
  if (b < a) b = a;
  return [a, b];
}
const srD = iso => new Date(iso + 'T00:00:00');
function srPrevRange() {   // [from, to, label] or null when there is no data that far back
  const [a, b] = srRange();
  let pa, pb, label;
  if (SR.period === 'this' || SR.period === 'last' || SR.period === 'month') {
    const da = srD(a), prevStart = new Date(da.getFullYear(), da.getMonth() - 1, 1);
    pa = srIso(prevStart);
    if (SR.period === 'this') {   // same number of days into the month before
      const days = Math.round((srD(b) - da) / 864e5);
      pb = srIso(new Date(prevStart.getFullYear(), prevStart.getMonth(), 1 + days));
      if (pb > srLastDay(pa.slice(0, 7))) pb = srLastDay(pa.slice(0, 7));
    } else pb = srLastDay(pa.slice(0, 7));
    label = new Date(pa + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } else if (SR.period === 'year') {
    const da = srD(a), db = srD(b);
    pa = srIso(new Date(da.getFullYear() - 1, da.getMonth(), da.getDate()));
    pb = srIso(new Date(db.getFullYear() - 1, db.getMonth(), db.getDate()));
    label = String(da.getFullYear() - 1);
  } else {
    const len = Math.round((srD(b) - srD(a)) / 864e5) + 1;
    pb = srIso(new Date(srD(a).getTime() - 864e5)); pa = srIso(new Date(srD(a).getTime() - len * 864e5));
    label = 'the period before';
  }
  if (pa < SR_FIRST) return null;
  return [pa, pb, label];
}
const srBranchArg = () => SR.branch === 'all' ? null : SR.branch;
const srBranchTxt = () => SR.branch === 'all' ? 'All branches' : (LC_BRANCH[SR.branch] || SR.branch);
function srArgs(range) {
  return { p_from: range[0], p_to: range[1], p_pfrom: null, p_pto: null, p_branch: srBranchArg(),
    p_fam: SR.fam === 'all' ? null : SR.fam, p_cat: SR.cat, p_limit: 400 };
}
function srCall(args) {
  const key = JSON.stringify(args);
  if (!srCache[key]) {
    srCache[key] = Promise.resolve(sb.rpc('service_rankings', args)).then(r => {
      if (r.error) { delete srCache[key]; throw r.error; }
      return r.data;
    }, e => { delete srCache[key]; throw e; });
  }
  return srCache[key];
}

// ── CONTROLS ────────────────────────────────────────────────────────────────
function srSet(k, v) {
  SR[k] = v;
  if (k === 'pfrom' && SR.pto && SR.pto < v) SR.pto = v;
  if (k === 'pto' && SR.pfrom && SR.pfrom > v) SR.pfrom = v;
  srSave();
  if (k === 'rank') { srPaint(); return; }
  srShowN = 25; srOpen = null; renderServiceRankings();
}
function srPickFam(f) { SR.fam = f; SR.cat = null; srSave(); srShowN = 25; srOpen = null; srLoad(); }
function srPickCat(c) { SR.cat = c || null; srShowN = 25; srOpen = null; srLoad(); }
function srMore() { srShowN += 25; srPaintTable(); }
function srToggle(i) { const r = srRows[i]; if (!r) return; const k = r.stem + '|' + r.category; srOpen = srOpen === k ? null : k; srPaintTable(); }

function srShell() {
  const seg = (key, opts) => `<div class="sc-seg" role="group">${opts.map(([k, l]) =>
    `<button type="button" class="${String(SR[key]) === String(k) ? 'on' : ''}" onclick="srSet('${key}','${k}')">${l}</button>`).join('')}</div>`;
  let sub = '';
  if (SR.period === 'month') sub += `<div class="lc-cust"><span>Month</span><select aria-label="Month" onchange="srSet('month', this.value)">${cmMonths().map(m =>
    `<option value="${m}"${srRange()[0].slice(0, 7) === m ? ' selected' : ''}>${cmMonthLabel(m)}</option>`).join('')}</select></div>`;
  if (SR.period === 'custom') { const [a, b] = srRange(); sub += `<div class="lc-cust"><span>From</span><input type="date" style="width:auto" value="${a}" min="${SR_FIRST}" max="${srToday()}" aria-label="From date" onchange="srSet('pfrom', this.value)"><span>to</span><input type="date" style="width:auto" value="${b}" min="${SR_FIRST}" max="${srToday()}" aria-label="To date" onchange="srSet('pto', this.value)"></div>`; }
  return `
    <section class="slv-intro">
      <h2>Service Rankings</h2>
      <p>The services clients book most, by revenue or by units. Every size of a service is one row, and each service carries Phorest's own category. Click a row to see its sizes.</p>
    </section>
    <div class="sc-bar w13-bar lc-bar tc-bar cm-bar">
      <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Branch</div>${seg('branch', [['all', 'All']].concat(SR_BR.map(k => [k, k])))}</div>
      <div class="lc-grp lc-grp-branch"><div class="slv-eyebrow">Period</div>${seg('period', SR_PERIODS)}</div>
      <div class="lc-grp"><div class="slv-eyebrow">Rank by</div>${seg('rank', [['rev', 'Revenue'], ['units', 'Units']])}</div>
    </div>
    ${sub}
    <div class="cm-pcats" id="srFams"></div>
    <div class="cm-pcats" id="srCats"></div>
    <div id="srBody"><p class="slv-muted" style="margin-top:16px">Loading services…</p></div>`;
}

// ── DRAW ────────────────────────────────────────────────────────────────────
async function renderServiceRankings() {
  const el = document.getElementById('serviceRankingsContent');
  if (!el) return;
  el.innerHTML = srShell();
  srData = null; srPrev = null;
  srLoad();
}
async function srLoad() {
  const seq = ++srSeq;
  srBusy = true; srPaintBusy();
  const cur = srRange(), prev = srPrevRange();
  const prevP = prev ? srCall(srArgs(prev)).catch(e => { console.error(e); return null; }) : Promise.resolve(null);
  try {
    const d = await srCall(srArgs(cur));
    if (seq !== srSeq) return;
    srData = d; srPrev = null; srBusy = false;
    srPaint();
    prevP.then(p => { if (seq === srSeq && p) { srPrev = p; srPaint(); } });
  } catch (e) {
    console.error(e);
    if (seq === srSeq) { srBusy = false; const b = document.getElementById('srBody'); if (b) b.innerHTML = '<p class="slv-muted" style="margin-top:16px">The ranking did not load. Refresh to try again.</p>'; }
  }
}
function srPaintBusy() { const b = document.getElementById('srBody'); if (b) b.classList.toggle('cm-busy', srBusy); }

const srAed = n => 'AED ' + lcNum(n);
const srPct = (cur, prev) => prev > 0 ? (100 * (cur - prev) / prev) : null;
function srDelta(cur, prev) {
  const p = srPct(cur, prev);
  if (p === null) return '';
  const up = p >= 0.05, down = p <= -0.05;
  return `<span class="sr-d ${up ? 'up' : down ? 'down' : ''}">${up ? '+' : ''}${p.toFixed(Math.abs(p) < 10 ? 1 : 0)}%</span>`;
}
function srPaint() {
  srPaintBusy();
  const d = srData;
  if (!d) return;
  // family and category pills
  const fp = document.getElementById('srFams'), cp = document.getElementById('srCats');
  const by = {}; (d.fams || []).forEach(f => { by[f.family] = f; });
  const key = SR.rank === 'units' ? 'units' : 'rev';
  const fams = CM_FAMS.filter(f => by[f.k] && (by[f.k].rev > 0 || by[f.k].units > 0) && f.k !== 'retail');
  const allV = fams.reduce((t, f) => t + (by[f.k][key] || 0), 0);
  if (fp) fp.innerHTML = `<span class="slv-eyebrow">Family</span><div class="sc-seg cm-seg" role="group"><button type="button" class="${SR.fam === 'all' ? 'on' : ''}" onclick="srPickFam('all')">All</button>` +
    fams.map(f => `<button type="button" class="${SR.fam === f.k ? 'on' : ''}" onclick="srPickFam('${f.k}')">${f.name} <em>${allV ? Math.round(100 * (by[f.k][key] || 0) / allV) : 0}%</em></button>`).join('') + `</div>`;
  if (cp) cp.innerHTML = SR.fam === 'all' ? '' : `<span class="slv-eyebrow">Phorest category</span><div class="sc-seg cm-seg" role="group"><button type="button" class="${SR.cat ? '' : 'on'}" onclick="srPickCat('')">All</button>` +
    (d.cats || []).slice().sort((a, b) => b[key] - a[key]).map(c => `<button type="button" class="${SR.cat === c.category ? 'on' : ''}" data-c="${lcEsc(c.category)}" onclick="srPickCat(this.dataset.c)">${lcEsc(c.category)} <em>${lcNum(c[key])}</em></button>`).join('') + `</div>`;

  const body = document.getElementById('srBody');
  if (!body) return;
  const [a, b] = srRange(), prev = srPrevRange();
  const tr = Number(d.total_rev) || 0, tu = Number(d.total_units) || 0;
  const pr = srPrev ? Number(srPrev.total_rev) || 0 : null, pu = srPrev ? Number(srPrev.total_units) || 0 : null;
  const tile = (k, v, n) => `<div class="w13-tile"><div class="slv-eyebrow">${k}</div><div class="w13-val">${v}</div><div class="slv-note">${n}</div></div>`;
  const vs = (c, p) => !prev ? 'no earlier data to compare' : p === null ? 'comparing…' : (srDelta(c, p) || '–') + ' vs ' + lcEsc(prev[2]);
  body.innerHTML = `
    <section class="slv-card" style="margin-top:16px">
      <div class="slv-head"><div><div class="slv-eyebrow">${lcEsc(srBranchTxt())}${SR.fam !== 'all' ? ' · ' + lcEsc(cmFam(SR.fam).name) : ''}${SR.cat ? ' · ' + lcEsc(SR.cat) : ''}</div>
        <h3>Top services by ${SR.rank === 'units' ? 'units' : 'revenue'}</h3><p>${lcEsc(lcDayY(a))} to ${lcEsc(lcDayY(b))}</p></div>
        <button type="button" class="cm-pill" id="srCopy" onclick="srCopy()">Copy list for Sheets</button></div>
      <div class="w13-tiles lc-tiles">
        ${tile('Revenue, ex VAT', srAed(tr), vs(tr, pr))}
        ${tile('Units', lcNum(tu), vs(tu, pu))}
        ${tile('Services sold', lcNum((d.rows || []).length), 'different services in this window')}
        ${tile('Clients', lcNum(d.total_clients), 'different people, any of these services')}
      </div>
      <div id="srTable" style="margin-top:14px"></div>
    </section>
    <p class="slv-muted cm-foot">From Phorest's Sales Transactions, which starts in January 2025. Each sale is sorted by Phorest's own service category (the Service roster tab on Client Mix), so a service's sizes are one row. Revenue is ex VAT. Units are sales lines; the second half of a keratin counts as the same treatment. Retail is on Products; deposits, vouchers, refunds and prepaid courses are left out.</p>`;
  srPaintTable();
}
function srPaintTable() {
  const box = document.getElementById('srTable'), d = srData;
  if (!box || !d) return;
  const key = SR.rank === 'units' ? 'units' : 'rev';
  const pm = {}; if (srPrev) (srPrev.rows || []).forEach(r => { pm[r.stem + '|' + r.category] = r; });
  const hasPrev = !!srPrev;
  srRows = (d.rows || []).slice().sort((x, y) => (y[key] - x[key]) || (y.rev - x.rev)).map(r => Object.assign({ _p: pm[r.stem + '|' + r.category] || null }, r));
  const total = Number(key === 'rev' ? d.total_rev : d.total_units) || 0;
  const mx = Math.max(1, ...srRows.slice(0, srShowN).map(r => r[key]));
  const shown = srRows.slice(0, srShowN), color = SR.fam === 'all' ? 'var(--accent)' : cmFam(SR.fam).color;
  const one = SR.branch !== 'all';
  const avg = r => r.units ? r.rev / r.units : 0;
  const chg = r => hasPrev ? (r._p ? srDelta(r[key], r._p[key]) : '<span class="sr-d new">new</span>') : '';
  const sizes = r => {
    const v = r.v || [];
    const brs = !one && r.bu ? SR_BR.filter(b => r.bu[b]).map(b => `<span>${b} <b>${lcNum(r.bu[b])}</b></span>`).join('') : '';
    return `<div class="sr-open">
      ${v.length > 1 || (v[0] && v[0].item !== r.stem) ? `<div class="slv-eyebrow">Sizes and names behind this row</div><ul class="sr-sizes">${v.map(x => `<li><span>${lcEsc(x.item)}</span><b>${lcNum(x.units)} · ${srAed(x.rev)}</b></li>`).join('')}</ul>` : ''}
      ${brs ? `<div class="slv-eyebrow" style="margin-top:10px">Units by branch</div><div class="sr-br">${brs}</div>` : ''}
      ${hasPrev && r._p ? `<p class="slv-note" style="margin-top:10px">Before: ${srAed(r._p.rev)}, ${lcNum(r._p.units)} units.</p>` : ''}
    </div>`;
  };
  const rowHtml = shown.map((r, i) => {
    const open = srOpen === r.stem + '|' + r.category;
    const share = total ? 100 * r[key] / total : 0;
    return `<tr class="sr-row${open ? ' sr-on' : ''}" onclick="srToggle(${i})"><td><span class="top3-rank ${_rankCls(i)}">${i + 1}</span></td>
      <td class="lc-l"><span class="tc-name">${lcEsc(r.stem)}</span><div class="cm-cell-cat">${lcEsc(r.category)}${(r.v || []).length > 1 ? ' · ' + (r.v || []).length + ' names' : ''}</div></td>
      <td class="sr-n">${lcNum(r.rev)}</td><td>${lcNum(r.units)}</td><td>${lcNum(avg(r))}</td><td>${lcNum(r.clients)}</td>
      <td><div class="sr-share"><div class="cm-bar1" style="--c:${color}"><i style="width:${Math.round(100 * r[key] / mx)}%"></i></div><span>${share.toFixed(1)}%</span></div></td>
      ${hasPrev ? `<td>${chg(r)}</td>` : ''}</tr>${open ? `<tr class="sr-det"><td colspan="${hasPrev ? 8 : 7}">${sizes(r)}</td></tr>` : ''}`;
  }).join('');
  const cards = shown.map((r, i) => {
    const open = srOpen === r.stem + '|' + r.category;
    return `<li class="prd-card sr-row${open ? ' sr-on' : ''}" onclick="srToggle(${i})"><div class="prd-body">
      <div class="prd-top"><span class="prd-name"><span class="top3-rank ${_rankCls(i)}">${i + 1}</span> ${lcEsc(r.stem)}</span><span class="prd-spend">${key === 'rev' ? srAed(r.rev) : lcNum(r.units) + ' units'}</span></div>
      <div class="prd-meta">${lcEsc(r.category)} · ${key === 'rev' ? lcNum(r.units) + ' units' : srAed(r.rev)} · avg ${lcNum(avg(r))} · ${lcNum(r.clients)} client${Number(r.clients) === 1 ? '' : 's'}${hasPrev ? ' · ' + (chg(r) || '–') : ''}</div>
      ${open ? sizes(r) : ''}</div></li>`;
  }).join('');
  const more = srRows.length > shown.length ? `<p style="margin:10px 0 0"><button type="button" class="cm-pill" onclick="srMore()">Show ${Math.min(25, srRows.length - shown.length)} more</button> <span class="slv-note">${lcNum(shown.length)} of ${lcNum(srRows.length)}</span></p>` : '';
  const empty = 'No services for these filters in this window.';
  box.innerHTML = `<div class="slv-wrap prd-desk"><table class="slv-table sr-t"><thead><tr><th>#</th><th class="lc-l">Service</th><th>Revenue (AED)</th><th>Units</th><th>Avg / unit</th><th>Clients</th><th>Share${SR.rank === 'units' ? ' of units' : ''}</th>${hasPrev ? '<th>vs before</th>' : ''}</tr></thead>
    <tbody>${rowHtml || `<tr><td colspan="8" class="slv-muted">${empty}</td></tr>`}</tbody></table></div>
    <ol class="prd-cards">${cards || `<li class="slv-muted">${empty}</li>`}</ol>${more}`;
}
async function srCopy() {
  const btn = document.getElementById('srCopy');
  const say = t => { if (btn) btn.textContent = t; setTimeout(() => { if (btn) btn.textContent = 'Copy list for Sheets'; }, 2400); };
  try {
    const head = ['Rank', 'Service', 'Phorest category', 'Revenue ex VAT', 'Units', 'Avg per unit', 'Clients'].concat(SR.branch === 'all' ? SR_BR.map(b => 'Units ' + b) : []);
    const rows = srRows.map((r, i) => [i + 1, r.stem, r.category, r.rev, r.units, r.units ? Math.round(r.rev / r.units) : 0, r.clients]
      .concat(SR.branch === 'all' ? SR_BR.map(b => (r.bu && r.bu[b]) || 0) : []));
    await navigator.clipboard.writeText([head].concat(rows).map(r => r.map(v => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n'));
    say(`Copied ${lcNum(rows.length)}, paste into Sheets`);
  } catch (e) { console.error(e); say('Copy did not work here'); }
}
