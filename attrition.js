// Staff Attrition (Kate, 19 Oct 2026): stylists and beauticians who left, how fast, and after how long.
//
// Everything comes from one function, attrition_people() (migrations/attrition.sql), which joins the Phorest roster (who they
// are, archived or not) to the ledger (first and last day with sales). The leave date is the LAST SALE, not the roster's
// archive date: Phorest archives are tidied months after people go. Level 3 and up; the function returns nothing below that.
//
//   left      archived in Phorest, leave date = last sale
//   stopped   not archived but nothing sold for 60+ days (probably gone or on long leave): counted as a leaver, flagged
//   closure   last sale was the closing fortnight of Marasy or Fratelli: the branch closing, not someone leaving; listed apart
//   nosales   on the roster with no ledger sales: cannot be dated, counted in the note only
//
// Own controls (department, branch, period), so the masthead filters are hidden here, as on Client Mix.
// Headcount on a day = people whose first sale is on or before it and whose last sale (if they left) is after it.
// Rate = leavers in the window / average headcount over the window (month starts), so it reads as "of every 100 on the
// floor, this many left". A window that is not 12 months also shows the yearly pace.
const AT_STORE = 'trs-attrition';
const AT = { dept: 'all', branch: 'all', period: '12m' };
try {
  const s = JSON.parse(localStorage.getItem(AT_STORE) || '{}');
  for (const k of ['dept', 'branch', 'period']) if (typeof s[k] === 'string') AT[k] = s[k];
} catch (e) {}
const atSave = () => { try { localStorage.setItem(AT_STORE, JSON.stringify(AT)); } catch (e) {} };
let atData = null, atBusy = false, atStamp = 0;

const AT_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', BAH: 'Bahrain', MRY: 'Marasy', FRT: 'Fratelli' };
const AT_PERIODS = [['12m', 'Last 12 months'], ['ytd', 'This year'], ['ly', 'Last year'], ['2y', 'Last 2 years'], ['all', 'Since 2021']];
const AT_WHEN = { '12m': 'the last 12 months', ytd: 'this year so far', ly: 'last year', '2y': 'the last 2 years', all: 'the whole ledger (Dec 2020 on)' };
const AT_DEPTS = [['all', 'Both'], ['Hair', 'Stylists'], ['Beauty', 'Beauticians']];
const atEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const atD = iso => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const atIso = d => d.toISOString().slice(0, 10);
const atDay = 86400000;
const atFmt = iso => iso ? atD(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const atMon = d => d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const atPct = n => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '') + '%';
function atTenure(months) {
  if (months == null) return '';
  if (months < 1) return 'under 1 month';
  if (months < 12) return Math.round(months) + (Math.round(months) === 1 ? ' month' : ' months');
  const y = Math.floor(months / 12), m = Math.round(months - y * 12);
  return y + (y === 1 ? ' yr' : ' yrs') + (m ? ' ' + m + ' mo' : '');
}

function atWindow() {
  const asof = atD(atData.asof), y = asof.getUTCFullYear();
  const first = atD(atData.ledger_from);
  let from, to = asof;
  if (AT.period === 'ytd') from = new Date(Date.UTC(y, 0, 1));
  else if (AT.period === 'ly') { from = new Date(Date.UTC(y - 1, 0, 1)); to = new Date(Date.UTC(y - 1, 11, 31)); }
  else if (AT.period === '2y') from = new Date(asof.getTime() - 730 * atDay);
  else if (AT.period === 'all') from = first;
  else from = new Date(asof.getTime() - 365 * atDay);
  if (from < first) from = first;
  return { from, to };
}

// Everyone with a date to stand on: a first sale, and either still here or a last sale.
function atPeople() {
  return (atData.people || []).filter(p => p.start && p.status !== 'nosales').map(p => ({
    ...p, s: atD(p.start), e: p.status === 'active' ? null : atD(p.last),
    leaver: p.status === 'left' || p.status === 'stopped',
  }));
}
const atHere = (p, d) => p.s <= d && (!p.e || p.e > d);

function atCompute() {
  const { from, to } = atWindow();
  const all = atPeople().filter(p => (AT.dept === 'all' || p.dept === AT.dept) && (AT.branch === 'all' || p.last_branch === AT.branch));
  // month starts across the window, plus its last day, for the average
  const pts = [];
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) pts.push(d < from ? from : d);
  pts.push(to);
  const avg = list => pts.length ? pts.reduce((a, d) => a + list.filter(p => atHere(p, d)).length, 0) / pts.length : 0;
  const inWin = p => p.e && p.e >= from && p.e <= to;
  const leavers = all.filter(p => p.leaver && inWin(p));
  const closures = all.filter(p => p.status === 'closure' && inWin(p));
  const joined = all.filter(p => p.s >= from && p.s <= to && p.first_exact);
  const days = Math.max(1, Math.round((to - from) / atDay) + 1);
  const long = days > 400;   // over a year the plain share only grows with the window, so the headline is the yearly pace
  const rate = (n, hc) => hc ? 100 * n / hc * (long ? 365 / days : 1) : null;
  const hc = avg(all);
  const rows = key => {
    const by = {};
    all.forEach(p => { const k = key(p); (by[k] = by[k] || []).push(p); });
    return Object.entries(by).map(([k, ps]) => {
      const n = ps.filter(p => p.leaver && inWin(p)).length, h = avg(ps);
      return { k, n, hc: h, rate: rate(n, h) };
    }).filter(r => r.hc > 0 || r.n > 0).sort((a, b) => b.n - a.n);
  };
  const tenures = leavers.filter(p => p.first_exact).map(p => (p.e - p.s) / atDay / 30.44).sort((a, b) => a - b);
  const medianT = tenures.length ? tenures[Math.floor(tenures.length / 2)] : null;
  // buckets: months when the window is two years or less, else years
  const yearly = days > 800, buckets = [];
  if (yearly) for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) buckets.push({ a: new Date(Date.UTC(y, 0, 1)), b: new Date(Date.UTC(y, 11, 31)), l: String(y) });
  else for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) buckets.push({ a: d, b: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)), l: atMon(d) });
  buckets.forEach(b => {
    b.n = all.filter(p => p.leaver && p.e >= b.a && p.e <= b.b && p.e >= from && p.e <= to).length;
    b.hc = all.filter(p => atHere(p, b.b > to ? to : b.b)).length;
  });
  const T = [['Under 3 months', 0, 3], ['3 to 6 months', 3, 6], ['6 to 12 months', 6, 12], ['1 to 2 years', 12, 24], ['2 years or more', 24, 9999]];
  const tb = T.map(([l, a, b]) => ({ l, n: tenures.filter(t => t >= a && t < b).length }));
  const nodate = leavers.filter(p => !p.first_exact).length;
  buckets.splice(0, buckets.length, ...buckets.slice(buckets.findIndex(b => b.n || b.hc)));
  return { from, to, days, long, all, leavers, closures, joined, hc, rate: rate(leavers.length, hc), medianT,
    avgT: tenures.length ? tenures.reduce((a, b) => a + b, 0) / tenures.length : null,
    buckets, tb, nodate, byBranch: rows(p => p.last_branch), byDept: rows(p => p.dept),
    nowHere: all.filter(p => p.status === 'active').length };
}

function atShell() {
  const chips = (list, cur, key) => list.map(([k, l]) => `<button type="button" class="at-chip${cur === k ? ' on' : ''}" onclick="atPick('${key}','${k}')">${atEsc(l)}</button>`).join('');
  const branches = [['all', 'All branches'], ...['SAA', 'KCA', 'MC', 'AQ', 'BAH', 'MRY', 'FRT'].map(c => [c, AT_BRANCH[c]])];
  return `<style>
    .at h1{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:28px;margin:6px 0 4px}
    .at .at-sub{color:var(--muted);font-size:13px;margin:0 0 18px;max-width:760px;line-height:1.5}
    .at-bar{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;margin-bottom:18px}
    .at-grp{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .at-chip{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}
    .at-chip.on{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
    .at-sel{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:999px;padding:5px 12px;font:inherit;font-size:13px}
    .at-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px}
    .at-kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:14px 16px}
    .at-kpi b{display:block;font-size:28px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.1}
    .at-kpi span{display:block;color:var(--muted);font-size:12px;margin-top:4px;line-height:1.35}
    .at-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);padding:16px 18px;margin-bottom:16px}
    .at-card h2{font-size:15px;font-weight:600;margin:0 0 4px}
    .at-card p.n{color:var(--muted);font-size:12px;margin:0 0 12px;line-height:1.45}
    .at-cols{display:flex;align-items:flex-end;gap:4px;height:150px;padding-top:18px}
    .at-col{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
    .at-col i{display:block;width:100%;max-width:34px;background:var(--bad);border-radius:4px 4px 0 0;min-height:2px}
    .at-col em{font-style:normal;font-size:11px;font-variant-numeric:tabular-nums;margin-bottom:2px}
    .at-labs{display:flex;gap:4px;margin-top:6px}
    .at-labs div{flex:1;min-width:0;text-align:center;font-size:10px;color:var(--muted);line-height:1.2}
    .at-labs div small{display:block;color:var(--muted2)}
    .at-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
    table.at-t{width:100%;border-collapse:collapse;font-size:13px}
    .at-t th{text-align:left;font-size:11px;font-weight:600;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--border)}
    .at-t td{padding:8px;border-bottom:1px solid var(--border2);vertical-align:top}
    .at-t .r{text-align:right;font-variant-numeric:tabular-nums}
    .at-pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;background:var(--surface2);color:var(--muted)}
    .at-pill.warn{background:var(--warn-bg);color:var(--warn)}
    .at-pill.hair{background:var(--surface2);color:var(--hair)}.at-pill.beauty{background:var(--surface2);color:var(--beauty)}
    .at-bars div{display:grid;grid-template-columns:120px 1fr 28px;gap:8px;align-items:center;font-size:13px;margin:6px 0}
    .at-bars i{display:block;height:10px;border-radius:5px;background:var(--bad)}
    .at-note{color:var(--muted);font-size:12px;line-height:1.5;margin:10px 0 0}
    .at details{margin-top:10px}.at summary{cursor:pointer;color:var(--muted);font-size:12px}
    @media (max-width:640px){.at-bars div{grid-template-columns:96px 1fr 24px}.at-t .hm{display:none}.at h1{font-size:24px}}
  </style>
  <div class="at">
    <h1>Staff attrition</h1>
    <p class="at-sub">Stylists and beauticians who left, from the Phorest roster and the ledger. The leave date is the last day she had sales, because Phorest archives are tidied long after people go. Assistants, reception and admin are not counted.</p>
    <div class="at-bar">
      <div class="at-grp">${chips(AT_DEPTS, AT.dept, 'dept')}</div>
      <select class="at-sel" onchange="atPick('branch',this.value)" aria-label="Branch">${branches.map(([k, l]) => `<option value="${k}"${AT.branch === k ? ' selected' : ''}>${atEsc(l)}</option>`).join('')}</select>
      <div class="at-grp">${chips(AT_PERIODS, AT.period, 'period')}</div>
    </div>
    <div id="atBody"><p class="at-note">Loading…</p></div>
  </div>`;
}
function atPick(k, v) {
  AT[k] = v; atSave();
  const el = document.getElementById('atContent');
  if (el) { el.innerHTML = atShell(); atPaint(); }
}

function atPaint() {
  const body = document.getElementById('atBody');
  if (!body || !atData) return;
  const c = atCompute();
  const per = AT_WHEN[AT.period];
  const plain = c.hc ? atPct(100 * c.leavers.length / c.hc) : null;
  const yearly = !c.long && Math.abs(c.days - 365) > 10 && c.days > 30 && c.rate != null ? atPct(c.rate * 365 / c.days) : null;
  const max = Math.max(1, ...c.buckets.map(b => b.n));
  const kpi = (v, l) => `<div class="at-kpi"><b>${v}</b><span>${l}</span></div>`;
  const branchRows = c.byBranch.map(r => `<tr><td>${atEsc(AT_BRANCH[r.k] || r.k)}</td><td class="r">${r.n}</td><td class="r">${Math.round(r.hc * 10) / 10}</td><td class="r">${r.rate == null ? '' : atPct(r.rate)}</td></tr>`).join('');
  const deptRows = c.byDept.map(r => `<tr><td>${r.k === 'Hair' ? 'Stylists' : 'Beauticians'}</td><td class="r">${r.n}</td><td class="r">${Math.round(r.hc * 10) / 10}</td><td class="r">${r.rate == null ? '' : atPct(r.rate)}</td></tr>`).join('');
  const tmax = Math.max(1, ...c.tb.map(t => t.n));
  const list = c.leavers.slice().sort((a, b) => b.e - a.e);
  const nosales = (atData.people || []).filter(p => p.status === 'nosales' && (AT.dept === 'all' || p.dept === AT.dept));
  body.innerHTML = `
    <div class="at-kpis">
      ${kpi(c.leavers.length, `left in ${atEsc(per)}`)}
      ${kpi(c.rate == null ? '–' : atPct(c.rate), c.long ? `attrition a year: ${c.leavers.length} leavers on an average of ${Math.round(c.hc * 10) / 10} on the floor, per year (${plain} over the whole window)` : `attrition: leavers ÷ average headcount (${Math.round(c.hc * 10) / 10})${yearly ? `<br>${yearly} a year at this pace` : ''}`)}
      ${kpi(c.medianT == null ? '–' : atTenure(c.medianT), `median time with us before leaving${c.avgT == null ? '' : ` (average ${atTenure(c.avgT)})`}`)}
      ${kpi(c.joined.length, `joined in ${atEsc(per)}`)}
      ${kpi(c.nowHere, `selling now (last sale within 60 days)`)}
    </div>
    <div class="at-card"><h2>Who left, ${c.days > 800 ? 'by year' : 'by month'}</h2>
      <p class="n">Number of leavers in each ${c.days > 800 ? 'year' : 'month'}; the small figure under each bar is how many were on the floor at its end.</p>
      <div class="at-cols">${c.buckets.map(b => `<div class="at-col" title="${atEsc(b.l)}: ${b.n} left, ${b.hc} on the floor"><em>${b.n || ''}</em><i style="height:${Math.round(100 * b.n / max)}%"></i></div>`).join('')}</div>
      <div class="at-labs">${c.buckets.map(b => `<div>${atEsc(b.l)}<small>${b.hc}</small></div>`).join('')}</div>
    </div>
    <div class="at-two">
      <div class="at-card"><h2>By branch</h2><p class="n">A person counts at the branch where she last sold.</p>
        <table class="at-t"><tr><th>Branch</th><th class="r">Left</th><th class="r">Avg headcount</th><th class="r">${c.long ? 'Rate a year' : 'Rate'}</th></tr>${branchRows || '<tr><td colspan="4">No one in this view.</td></tr>'}</table></div>
      <div class="at-card"><h2>Stylists and beauticians</h2><p class="n">Same window, same branch choice.</p>
        <table class="at-t"><tr><th>Team</th><th class="r">Left</th><th class="r">Avg headcount</th><th class="r">${c.long ? 'Rate a year' : 'Rate'}</th></tr>${deptRows || '<tr><td colspan="4">No one in this view.</td></tr>'}</table></div>
    </div>
    <div class="at-card"><h2>How long they stayed</h2><p class="n">Time from first sale to last sale, for the ${c.leavers.length - c.nodate} leaver${c.leavers.length - c.nodate === 1 ? '' : 's'} whose first day is on file.${c.nodate ? ` ${c.nodate} more were already here when the ledger starts (Dec 2020), so their stay is longer than we can show.` : ''}</p>
      <div class="at-bars">${c.tb.map(t => `<div><span>${t.l}</span><i style="width:${Math.round(100 * t.n / tmax)}%"></i><b>${t.n}</b></div>`).join('')}</div></div>
    <div class="at-card"><h2>The leavers</h2><p class="n">Most recent first. "Stopped selling" means still on the Phorest roster but no sales for 60+ days: confirm with the branch.</p>
      <div style="overflow-x:auto"><table class="at-t"><tr><th>Name</th><th class="hm">Team</th><th>Last branch</th><th class="hm">Started</th><th>Last day</th><th>Stayed</th><th></th></tr>
      ${list.map(p => `<tr><td>${atEsc(p.name)}<div class="at-note" style="margin:0">${atEsc(p.position)}</div></td><td class="hm"><span class="at-pill ${p.dept === 'Hair' ? 'hair' : 'beauty'}">${p.dept === 'Hair' ? 'Stylist' : 'Beautician'}</span></td><td>${atEsc(AT_BRANCH[p.last_branch] || p.last_branch || '')}</td><td class="hm">${p.first_exact ? atFmt(p.start) : 'before Dec 2020'}</td><td>${atFmt(p.last)}</td><td>${p.first_exact ? atTenure((p.e - p.s) / atDay / 30.44) : atTenure((p.e - p.s) / atDay / 30.44).replace(/^/, 'over ')}</td><td>${p.status === 'stopped' ? '<span class="at-pill warn">Stopped selling</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="7">No one left in this view.</td></tr>'}</table></div>
      ${c.closures.length ? `<details><summary>${c.closures.length} ${c.closures.length === 1 ? 'person' : 'people'} not counted: their branch closed</summary><p class="at-note">${c.closures.map(p => `${atEsc(p.name)} (${atEsc(AT_BRANCH[p.last_branch] || '')}, last sale ${atFmt(p.last)})`).join('; ')}.</p></details>` : ''}
      ${nosales.length ? `<details><summary>${nosales.length} on the roster with no sales to date them</summary><p class="at-note">${nosales.map(p => atEsc(p.name)).join(', ')}. Not in any figure above.</p></details>` : ''}
    </div>
    <p class="at-note">Sources: Phorest staff roster (14 Oct 2026) and the ledger up to ${atFmt(atData.asof)}. A person is her first name within a department, because the ledger carries first names only; two people sharing a first name in the same team count as one.</p>`;
}

async function renderAttrition() {
  const el = document.getElementById('atContent');
  if (!el) return;
  el.innerHTML = atShell();
  if (!atData || Date.now() - atStamp > 600000) {
    if (atBusy) return;
    atBusy = true;
    try {
      const { data, error } = await sb.rpc('attrition_people');
      if (error) throw error;
      atData = data; atStamp = Date.now();
    } catch (e) {
      console.error(e);
      document.getElementById('atBody').innerHTML = '<p class="at-note">The staff list did not load. Refresh to try again.</p>';
      atBusy = false; return;
    }
    atBusy = false;
  }
  if (!atData) { document.getElementById('atBody').innerHTML = '<p class="at-note">This page is for Level 3 and up, signed in to all branches.</p>'; return; }
  atPaint();
}
