// Staff's Quarterly Performance, named 13-Week Report until 1 Oct 2026 (Kate: 13 weeks is a
// quarter, four of them make the year, and the page already totals by quarter).
// Built 29 Sep 2026, Emma's ask: the Staff Benchmarks page cuts its
// week-by-week chart at the month, so it only ever shows 4 or 5 weeks. This is one
// stylist's last thirteen full weeks, Monday to Sunday, so the quarter's ups and
// downs show. Numbers come from perf_weeks (migrations/create_perf_weeks.sql), which
// runs perf_core per week, so a week here matches the same week on her own page.
// Same key as Staff Benchmarks (spfGet): the viewer key is enough, the roster it
// returns has names only.
//
// Kate, 29 Sep 2026: opens on the team grid (everyone's 13 weeks as small cards), not a
// 48-name dropdown; tap a card for her report, the back button (All staff / Hair team / Beauty team, whichever filter you came from) goes back.
let w13Data = null;       // last perf_weeks reply for one stylist
let w13Team = null;       // perf_weeks reply with no stylist: the grid
// Fixed cycles (Emma, 29 Sep 2026): Week 1 is the first week of January and the year is
// Weeks 1-13, 14-26, 27-39, 40-52. null = the default, the cycle holding the last
// complete week; otherwise the Monday the picked cycle starts on.
let w13Year = null;       // null = the year the latest complete week sits in
// The address bar carries who is open (Kate, 29 Sep 2026), same slug as Staff
// Benchmarks: ?view=staffweeks&staff=kate-siryk, plus &year= when it is not the
// latest. Read once at load; trSyncUrl() in index.html writes it back.
const w13SlugOf = n => String(n).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let w13WantSlug = null;
try {
  const q = new URLSearchParams(location.search);
  if (q.get('view') === 'staffweeks') {
    w13WantSlug = q.get('staff') || null;
    const y = parseInt(q.get('year'), 10);
    if (y >= 2025 && y <= 2100) w13Year = y;
  }
} catch (e) { /* no address to read */ }
// What trSyncUrl() adds for this page.
function w13UrlParts() {
  const parts = [];
  const d = w13Pick ? w13Data : w13Team;
  if (w13Pick && d && d.staff) parts.push('staff=' + w13SlugOf(d.staff.name));
  else if (w13Pick && w13WantSlug) parts.push('staff=' + w13WantSlug);
  if (w13Year) parts.push('year=' + w13Year);
  return parts;
}
const w13Sync = () => { if (typeof trSyncUrl === 'function') trSyncUrl(null); };
// One long list (Emma, 29 Sep 2026: "the point is seeing all together on one big
// list"): every complete week of the year, Week 1 onwards, with the quarters as
// subtotal rows inside it. perf_year_weeks (migrations/create_perf_year_weeks.sql).
let w13Chart = null;
let w13Pick = null;       // null = the grid
let w13Dept = 'all';
// Kate, 1 Oct 2026 (Comet 13W2): the page hides the dashboard's filter bar, so a
// branch picked on any other page did not follow you here and the grid always
// showed every branch. Same answer as Google Reviews (GR3): the dashboard's branch
// is the starting point, the Branch pill on the page changes it. A seed is only
// applied when the dashboard's branch has changed since the last one, so a pick
// made here survives a trip to another page and back. null = every branch.
// Filters on each person's home branch; her cover days elsewhere stay in her totals.
let w13Branch = null, w13BranchSeed = null;
function w13SeedBranch() {
  if (typeof sel === 'undefined' || !sel.branch) return;
  const codes = sel.branch.filter(c => W13_BRANCH[c]);
  const key = codes.join(',');
  if (key === w13BranchSeed) return;
  w13BranchSeed = key;
  w13Branch = codes.length ? codes : null;
}
function w13SetBranch(v) {
  w13Branch = v === 'all' ? null : v.split(',');
  renderStaffWeeks();
}
function w13BranchPick() {
  const cur = w13Branch ? w13Branch.join(',') : 'all';
  const opts = [['all', 'All branches']].concat(Object.entries(W13_BRANCH));
  // A multi-branch seed from the dashboard keeps its own entry so the pill can show it.
  if (w13Branch && w13Branch.length > 1) opts.push([cur, w13Branch.map(c => W13_BRANCH[c]).join(' + ')]);
  return `<span class="spf-dd"><select id="w13Branch" aria-label="Branch" onchange="w13SetBranch(this.value)">
    ${opts.map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${w13Esc(l)}</option>`).join('')}
  </select></span>`;
}
// Chart grain, Daily or Weekly like the Staff Benchmarks chart. Always opens on Weekly
// (Kate, 29 Sep 2026), so it is not remembered.
let w13Mode = 'week';
// Daily zoom (Kate, 29 Sep 2026): a year of days is ~270 hair-thin bars, so Daily opens
// on the last month and zooms with chips (2 weeks, 1 month, 3 months, All); the arrows
// and a swipe on the chart move the window. w13Win is days shown (0 = all), w13Off how
// many days back from the latest the window ends.
let w13Win = 28, w13Off = 0;
// Kate, 1 Oct 2026 (Comet 13W3): "sales" on this page is total_revenue, which is
// services before VAT with retail left out, so every label says Service sales.
// Which measure is the bars. Sales, always: a Sales / Clients swap toggle was tried and
// taken off the same evening (Kate, 29 Sep 2026, too chunky beside the other controls).
const w13Bars = 'sales';
let w13QOpen = null;       // quarters open in her table; null = only the latest one
const w13ChartTitleText = () => (w13Mode === 'day' ? 'Day by day' : 'Week by week') + ' · ' +
  (w13Bars === 'clients' ? 'clients (bars) and sales (line)' : 'sales (bars) and clients (line)');
const W13_WINS = [[14, '2 weeks'], [28, '1 month'], [91, '3 months'], [0, 'All']];
try { w13Dept = localStorage.getItem('w13-dept') || 'all'; } catch (e) {}
// The same bar as Staff Benchmarks (Kate, 29 Sep 2026): All / Hair / Beauty, a Sort,
// and a direction. Remembered in this browser, on its own key so the two pages can
// sit on different sorts.
let w13Sort = 'branch', w13Rev = false;
try { const v = JSON.parse(localStorage.getItem('w13-sort') || 'null'); if (v && v.k) { w13Sort = v.k; w13Rev = !!v.rev; } } catch (e) {}
const W13_LADDER = ['Style Director', 'Senior Stylist', 'Stylist', 'Junior Stylist', 'Blow-Dry Specialist'];
const w13Rank = r => { const i = W13_LADDER.indexOf(r.level); return i < 0 ? -1 : W13_LADDER.length - i; };
const w13N = v => (v === null || v === undefined || Number.isNaN(Number(v))) ? -Infinity : Number(v);
const w13RebookPct = r => (r.numbers && r.numbers.clients) ? r.numbers.rebooked / r.numbers.clients : null;
const W13_SORTS = {
  level:   { label: 'Position' },
  branch:  { label: 'Branch' },
  name:    { label: 'Name',     cmp: (a, b) => a.name.localeCompare(b.name) },
  takings: { label: 'Service sales',  cmp: (a, b) => w13N((b.numbers || {}).total_revenue) - w13N((a.numbers || {}).total_revenue) },
  clients: { label: 'Clients',  cmp: (a, b) => w13N((b.numbers || {}).clients) - w13N((a.numbers || {}).clients) },
  rebook:  { label: 'Rebook %', cmp: (a, b) => w13N(w13RebookPct(b)) - w13N(w13RebookPct(a)) },
};
if (!W13_SORTS[w13Sort]) w13Sort = 'branch';

const w13Esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const w13Num = v => (v === null || v === undefined) ? '–' : Math.round(Number(v)).toLocaleString('en-GB');
const w13Aed = v => (v === null || v === undefined) ? '–' : 'AED ' + w13Num(v);
const w13Day = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
// The Sunday of a week, built in local time (toISOString would slip a day in UAE time).
const w13DayEnd = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 6); return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
// Kate, 29 Sep 2026: weeks read as Week 01 to Week 13, with the dates they cover under
// the number, on the chart and in the table alike.
// The year's own week number, Week 1 being the first week of January.
const w13Wk = no => 'Week ' + String(no).padStart(2, '0');
// Quarters inside the year: Q1 = Weeks 1-13, Q2 14-26, Q3 27-39, Q4 40-52 (and 53).
const w13Q = no => Math.min(4, Math.floor((no - 1) / 13) + 1);
// Each quarter its own shade, light to dark (Kate, 29 Sep 2026), so the 13-week blocks
// read at a glance. Hair on the brand lavender, beauty on the brand coral; the brand
// colour itself is one of the four. Index 0 = Q1.
const W13_SHADES = {
  Hair:   ['#DDD6FE', '#C4B5FD', '#A78BFA', '#8B5CF6'],
  Beauty: ['#FFD1D1', '#FFB5B5', '#FF9B9B', '#F47C7C'],
};
const w13Shades = dept => W13_SHADES[dept === 'Beauty' ? 'Beauty' : 'Hair'];
// Quarter of a date inside the loaded year (days since its Week 1 Monday).
const w13QOfDate = (date, from) => Math.min(4, Math.floor(Math.round((new Date(date + 'T00:00:00') - new Date(from + 'T00:00:00')) / 864e5) / 91) + 1);
// What the bars and the line are (Kate, 29 Sep 2026): a bar swatch for Sales and a
// line-with-dot for Clients, in the same small labelled style as the quarter key.
function w13SeriesKey(dept) {
  const beauty = dept === 'Beauty', bar = beauty ? '#FF9B9B' : '#C4B5FD', line = beauty ? '#6D28D9' : '#0F6E56';
  return `<span class="w13-skey" aria-label="Chart key">
    <span><i class="bar" style="background:${bar}"></i>Service sales (AED)</span>
    <span><i class="line" style="--c:${line}"></i>Clients</span>
  </span>`;
}
// The Q1-Q4 key beside the chart title, only for quarters the chart has.
function w13QKey(dept, qs) {
  const sh = w13Shades(dept);
  return `<span class="w13-qkey" aria-label="Quarter colours">${[1, 2, 3, 4].filter(q => qs.includes(q)).map(q =>
    `<span><i style="background:${sh[q - 1]}"></i>Q${q}</span>`).join('')}</span>`;
}
// The Year pill, shared by the grid and her report, dressed as the Staff Benchmarks pill.
function w13YearPick(d) {
  return `<span class="spf-dd"><select id="w13Year" aria-label="Year" onchange="w13SetYear(+this.value)">
    ${(d.years || [d.year]).map(y => `<option value="${y}"${y === d.year ? ' selected' : ''}>${y}</option>`).join('')}
  </select></span>`;
}
function w13SetYear(y) {
  const latest = ((w13Team || w13Data || {}).years || [])[0];
  w13Year = y === latest ? null : y;
  w13Team = null; w13Data = null;
  renderStaffWeeks();
}
// "6–12 Jul" inside one month, "27 Jul – 2 Aug" across two, so the chart labels stay short.
const w13Range = d => {
  const a = w13Day(d), b = w13DayEnd(d), am = a.split(' ')[1], bm = b.split(' ')[1];
  return am === bm ? a.split(' ')[0] + '–' + b : a + ' – ' + b;
};
const W13_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };

// "10 of 20 · 50%" — Emma's ask for rebooking everywhere: the count, not just the rate.
function w13Rebook(rebooked, clients) {
  if (!clients) return '–';
  return `${w13Num(rebooked)} of ${w13Num(clients)} · ${Math.round(100 * rebooked / clients)}%`;
}

async function w13Load(staffId) {
  const { data, error } = await sb.rpc('perf_year_weeks', { p_admin: typeof spfGet === 'function' ? spfGet() : null, p_staff_id: staffId || null, p_year: w13Year });
  if (error || !data) throw error || new Error('no data');
  return data;
}

function w13Photo(keys) {
  if (typeof STAFF_PROFILES === 'undefined') return null;
  for (const k of keys || []) {
    const p = STAFF_PROFILES[String(k).toUpperCase()];
    if (p && p.photoFull) return encodeURI(p.photoFull);
    if (p && p.photo) return 'assets/staff/' + encodeURIComponent(p.photo);
  }
  return null;
}
// Thirteen small bars, one a week, scaled to her own best week, so a card shows the
// shape of her quarter at a glance. Grey where the week had nothing.
// The week still being traded rides on the end as a paler bar (Kate, 29 Sep 2026).
function w13Spark(weekly, cur, dept) {
  const sh = w13Shades(dept);
  const v = (weekly || []).map(Number);
  if (cur !== null && cur !== undefined) v.push(Number(cur));
  const last = (cur !== null && cur !== undefined) ? v.length - 1 : -1, max = Math.max(1, ...v);
  const bw = 7, gap = 3, h = 34;
  return `<svg class="w13-spark" viewBox="0 0 ${v.length * (bw + gap) - gap} ${h}" preserveAspectRatio="none" aria-hidden="true">${v.map((x, i) => {
    const bh = x > 0 ? Math.max(2, Math.round(h * x / max)) : 2;
    return `<rect x="${i * (bw + gap)}" y="${h - bh}" width="${bw}" height="${bh}" rx="1.5" class="${x > 0 ? 'on' : ''}${i === last ? ' cur' : ''}"${x > 0 ? ` style="fill:${sh[Math.min(3, Math.floor(i / 13))]}"` : ''}/>`;
  }).join('')}</svg>`;
}

async function renderStaffWeeks() {
  const el = document.getElementById('staffWeeksContent');
  w13SeedBranch();
  // A link that names a stylist opens straight on her report.
  if (!w13Pick && w13WantSlug) {
    if (!w13Team) {
      el.innerHTML = '<p class="slv-muted">Loading…</p>';
      try { w13Team = await w13Load(null); } catch (e) { w13WantSlug = null; }
    }
    const hit = w13Team && w13Team.roster.find(r => w13SlugOf(r.name) === w13WantSlug);
    w13WantSlug = null;
    if (hit) w13Pick = hit.id;
  }
  if (!w13Pick) { await w13RenderTeam(el); w13Sync(); return; }
  if (!w13Data || !w13Data.staff || w13Data.staff.id !== w13Pick) {
    el.innerHTML = '<p class="slv-muted">Loading her quarters…</p>';
    try { w13Data = await w13Load(w13Pick); }
    catch (e) { el.innerHTML = '<p class="slv-muted">Staff’s Quarterly Performance didn\'t load. Refresh to try again.</p>'; return; }
  }
  const d = w13Data, s = d.staff;
  if (!s) { w13Pick = null; await w13RenderTeam(el); w13Sync(); return; }
  w13Sync();

  // Thirteen complete Mon-Sun weeks carry every total; the week still being traded
  // (current) is shown after them so its growth is visible, never added in.
  const weeks = d.weeks.filter(w => !w.current);
  const curWk = d.weeks.find(w => w.current);
  // Her photo, as on her Staff Benchmarks page (Kate, 29 Sep 2026). The roster carries
  // her ledger names, which is what STAFF_PROFILES is keyed on.
  const me = (d.roster || []).find(r => r.id === s.id);
  const ph = w13Photo(me && me.keys);
  const sum = k => weeks.reduce((a, w) => a + (Number(w.numbers[k]) || 0), 0);
  const tot = { sales: sum('total_revenue'), clients: sum('clients'), rebooked: sum('rebooked'), retail: sum('retail'),
                uh: sum('booked_hours'), ah: sum('available_hours') };
  const worked = weeks.filter(w => w.numbers.total_revenue > 0 || w.numbers.clients > 0).length;

  // One block per quarter: the quarter's totals on top, its weeks under it. Kate,
  // 29 Sep 2026: each quarter folds away, so a full year is four lines to read and
  // one tap to open. The quarter the latest week sits in starts open, the rest
  // closed; whatever you open or close is kept while you move between stylists.
  const fillOf = n => n.ah > 0 ? Math.round(100 * n.uh / n.ah) + '%' : '–';
  const sumOf = ws => ws.reduce((a, w) => { const n = w.numbers;
    a.sales += +n.total_revenue || 0; a.clients += +n.clients || 0; a.rebooked += +n.rebooked || 0;
    a.retail += +n.retail || 0; a.uh += +n.booked_hours || 0; a.ah += +n.available_hours || 0; return a; },
    { sales: 0, clients: 0, rebooked: 0, retail: 0, uh: 0, ah: 0 });
  const qs = [...new Set(weeks.map(w => w13Q(w.week_no)))];
  if (!w13QOpen) w13QOpen = new Set(qs.slice(-1));
  let rows = '';
  qs.forEach(q => {
    const qw = weeks.filter(x => w13Q(x.week_no) === q), t = sumOf(qw), open = w13QOpen.has(q);
    const done = qw.length < 13 && q < 4 ? ` (${qw.length} of 13 weeks)` : '';
    rows += `<tbody class="w13-q${open ? ' open' : ''}" data-q="${q}">
      <tr class="w13-sub w13-qhead" onclick="w13ToggleQ(${q})"><td><button type="button" class="w13-qbtn" aria-expanded="${open}"
        onclick="event.stopPropagation();w13ToggleQ(${q})"><span class="w13-chev" aria-hidden="true"></span>${w13Esc(`Q${q} · Weeks ${qw[0].week_no}–${qw[qw.length - 1].week_no}${done}`)}</button></td>
      <td>${w13Num(t.sales)}</td><td>${w13Num(t.clients)}</td>
      <td class="slv-aim">${w13Rebook(t.rebooked, t.clients)}</td><td>${t.clients ? w13Num(t.sales / t.clients) : '–'}</td><td>${w13Num(t.retail)}</td><td>${fillOf(t)}</td></tr>`;
    qw.forEach(w => {
      const n = w.numbers;
      const fill = n.available_hours > 0 ? Math.round(100 * n.booked_hours / n.available_hours) + '%' : '–';
      rows += `<tr class="w13-wk${n.total_revenue > 0 || n.clients > 0 ? '' : ' w13-off'}">
      <td><b>${w13Wk(w.week_no)}</b><div class="slv-note">${w13Esc(w13Range(w.week_start))}</div></td>
      <td>${w13Num(n.total_revenue)}</td><td>${w13Num(n.clients)}</td>
      <td class="slv-aim">${w13Rebook(n.rebooked, n.clients)}</td>
      <td>${w13Num(n.avg_bill)}</td><td>${w13Num(n.retail)}</td><td>${fill}</td></tr>`;
    });
    rows += '</tbody>';
  });
  const totFill = tot.ah > 0 ? Math.round(100 * tot.uh / tot.ah) + '%' : '–';
  // The quarter strip (Kate, 29 Sep 2026): one card per quarter with its sales, clients
  // and rebooking, and how its weekly average compares with the quarter before, so the
  // "is she growing?" answer is in plain numbers above the chart. Weekly average, not
  // the total, so a quarter still in progress compares fairly.
  const qShade = w13Shades(s.dept);   // qs (the quarters present) is defined above, with the fold state
  let prevAvg = null;
  const qCards = qs.map(q => {
    const qw = weeks.filter(w => w13Q(w.week_no) === q), t = sumOf(qw), avg = t.sales / qw.length;
    let chg = '';
    if (prevAvg) {
      const pct = Math.round(100 * (avg - prevAvg) / prevAvg);
      chg = `<div class="w13-q-chg ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}">${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}% vs Q${q - 1} <span>· weekly average</span></div>`;
    } else chg = `<div class="w13-q-chg"><span>first quarter of ${d.year}</span></div>`;
    prevAvg = avg;
    return `<div class="w13-qcard" style="border-top-color:${qShade[q - 1]}">
      <div class="slv-eyebrow">Q${q} · Weeks ${qw[0].week_no}–${qw[qw.length - 1].week_no}${qw.length < 13 && q < 4 ? ` <span class="w13-q-part">${qw.length} of 13</span>` : ''}</div>
      <div class="w13-q-val">${w13Aed(t.sales)}</div>
      <div class="slv-note">${w13Num(t.clients)} clients · ${t.clients ? `${w13Num(t.rebooked)} of ${w13Num(t.clients)} rebooked (${Math.round(100 * t.rebooked / t.clients)}%)` : 'no clients'}</div>
      ${chg}
    </div>`;
  }).join('');
  const curRow = curWk ? (() => {
    const n = curWk.numbers, fill = n.available_hours > 0 ? Math.round(100 * n.booked_hours / n.available_hours) + '%' : '–';
    return `<tr class="w13-cur"><td><b>${w13Wk(curWk.week_no)}</b> <span class="slv-note" style="display:inline">so far</span><div class="slv-note">${curWk.week_start === d.data_through ? w13Esc(w13Day(d.data_through)) : `${w13Esc(w13Day(curWk.week_start))} to ${w13Esc(w13Day(d.data_through))}`}</div></td>
      <td>${w13Num(n.total_revenue)}</td><td>${w13Num(n.clients)}</td><td class="slv-aim">${w13Rebook(n.rebooked, n.clients)}</td>
      <td>${w13Num(n.avg_bill)}</td><td>${w13Num(n.retail)}</td><td>${fill}</td></tr>`;
  })() : '';

  el.innerHTML = `
    <section class="slv-intro">
      <h2>Staff&rsquo;s Quarterly Performance</h2>
      <p>Every week of the year in one list, Monday to Sunday from the first week of January, with each 13-week quarter totalled as you go: Q1 is Weeks 1–13, Q2 14–26, Q3 27–39, Q4 40–52. Only complete weeks count in the totals; the week still being traded shows on the end as "so far". Sales are services before VAT, retail not included.</p>
    </section>
    <div class="sc-bar w13-bar" style="margin-bottom:14px">
      <button type="button" class="sc-btn" onclick="w13Set(null)">← ${w13Dept === 'Hair' ? 'Hair team' : w13Dept === 'Beauty' ? 'Beauty team' : 'All staff'}</button>
      ${w13YearPick(d)}
    </div>
    <section class="slv-card">
      <div class="slv-head">
        <div class="w13-who">${ph ? `<img class="w13-hero" src="${ph}" alt="" onerror="this.remove()">` : ''}<div><div class="slv-eyebrow">${w13Esc(s.level || s.dept)} · ${w13Esc(W13_BRANCH[s.branch] || s.branch)}</div><h3>${w13Esc(s.name)}</h3></div></div>
        <p>${d.year}${weeks.length ? ` · Weeks 1–${weeks[weeks.length - 1].week_no}` : ''} · ${w13Esc(w13Day(d.from))} to ${w13Esc(w13Day(d.to))} · ${worked} of ${weeks.length} weeks with clients</p>
      </div>
      ${(d.branches || []).length > 1 ? `<div class="w13-branches"><span class="slv-eyebrow">Worked at</span> ${d.branches.map(x =>
        `<span class="w13-br"><b>${w13Esc(W13_BRANCH[x.branch] || x.branch)}</b> ${w13Aed(x.sales)} · ${w13Num(x.clients)} clients</span>`).join('')}<div class="slv-note">Every branch is counted in the totals below, including cover days away from ${w13Esc(W13_BRANCH[s.branch] || s.branch)}.</div></div>` : ''}
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Service sales (ex retail)</div><div class="w13-val">${w13Aed(tot.sales)}</div><div class="slv-note">${worked ? w13Aed(tot.sales / worked) + ' a week worked' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Clients</div><div class="w13-val">${w13Num(tot.clients)}</div><div class="slv-note">${tot.clients ? 'Average bill ' + w13Aed(tot.sales / tot.clients) : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Rebooking</div><div class="w13-val">${tot.clients ? Math.round(100 * tot.rebooked / tot.clients) + '%' : '–'}</div><div class="slv-note">${tot.clients ? `${w13Num(tot.rebooked)} of ${w13Num(tot.clients)} clients rebooked` : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Column fill</div><div class="w13-val">${totFill}</div><div class="slv-note">${tot.ah ? `${w13Num(tot.uh)} of ${w13Num(tot.ah)} hours booked` : ''}</div></div>
      </div>
      ${qCards ? `<div class="w13-qstrip">${qCards}</div>` : ''}
      <div class="w13-chart-head">
        <div class="slv-eyebrow" id="w13ChartTitle">${w13ChartTitleText()}</div>
        <div class="w13-chart-ctl">
        ${w13SeriesKey(s.dept)}
        ${w13QKey(s.dept, [...new Set(d.weeks.map(w => w13Q(w.week_no)))])}
        ${(d.days || []).length ? `<div class="sc-seg" role="group" aria-label="Chart" style="display:inline-flex">
          <button type="button" data-m="day" class="${w13Mode === 'day' ? 'on' : ''}" onclick="w13SetMode('day')">Daily</button>
          <button type="button" data-m="week" class="${w13Mode === 'week' ? 'on' : ''}" onclick="w13SetMode('week')">Weekly</button>
        </div>` : ''}
        </div>
      </div>
      <div class="w13-zoom" id="w13Zoom"></div>
      <div style="position:relative;height:320px;margin-top:14px"><canvas id="w13Canvas"></canvas></div>
      <div class="slv-wrap" style="margin-top:14px"><table class="slv-table w13-table">
        <thead><tr><th>Week</th><th>Service sales (AED)</th><th>Clients</th><th>Rebooked</th><th>Avg bill</th><th>Retail</th><th>Column fill</th></tr></thead>
        ${rows}
        <tbody>
          <tr class="w13-tot"><td>${w13Esc(`${d.year} · Weeks 1–${weeks.length ? weeks[weeks.length - 1].week_no : 0}`)}</td><td>${w13Num(tot.sales)}</td><td>${w13Num(tot.clients)}</td><td class="slv-aim">${w13Rebook(tot.rebooked, tot.clients)}</td>
            <td>${tot.clients ? w13Num(tot.sales / tot.clients) : '–'}</td><td>${w13Num(tot.retail)}</td><td>${totFill}</td></tr>
          ${curRow}
        </tbody>
      </table></div>
      <p class="slv-muted">Sales to ${w13Esc(w13Day(d.data_through))}. The totals are the complete weeks only; the week still being traded joins them once Sunday closes. Weeks with no clients stay in as zeros so the gaps show (leave, days off, or a week not uploaded yet).</p>
    </section>`;
  if (typeof spfDD === 'function') spfDD(document.getElementById('w13Year'));
  w13Draw();
}

async function w13RenderTeam(el) {
  if (w13Chart) { w13Chart.destroy(); w13Chart = null; }
  if (!w13Team) {
    el.innerHTML = '<p class="slv-muted">Loading the team\'s quarters…</p>';
    try { w13Team = await w13Load(null); }
    catch (e) { el.innerHTML = '<p class="slv-muted">Staff’s Quarterly Performance didn\'t load. Refresh to try again.</p>'; return; }
  }
  const t = w13Team;
  const list = t.roster.filter(r => (w13Dept === 'all' || r.dept === w13Dept) && (!w13Branch || w13Branch.includes(r.branch)));
  const flip = w13Rev ? -1 : 1;
  const byTakings = (a, b) => w13N((b.numbers || {}).total_revenue) - w13N((a.numbers || {}).total_revenue);
  const grid = rs => `<div class="w13-grid">${rs.map(card).join('')}</div>`;
  const head = (txt, sub) => `<div class="slv-eyebrow" style="margin:${sub ? '10px' : '22px'} 0 10px${sub ? ';opacity:.75' : ''}">${w13Esc(txt)}</div>`;
  const card = r => {
    const n = r.numbers || {}, ph = w13Photo(r.keys);
    return `<button type="button" class="w13-card${r.dept === 'Beauty' ? ' beauty' : ''}" onclick="w13Set('${w13Esc(r.id)}')">
      <div class="w13-card-top">
        ${ph ? `<img src="${ph}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <div><div class="w13-card-name">${w13Esc(r.name)}</div><div class="slv-note">${w13Esc(r.level || r.dept)}${w13Sort === 'branch' ? '' : ' · ' + w13Esc(W13_BRANCH[r.branch] || r.branch)}</div></div>
      </div>
      <div class="w13-card-val">${w13Aed(n.total_revenue)}</div>
      <div class="slv-note">${w13Num(n.clients)} clients · ${n.clients ? `${w13Num(n.rebooked)} of ${w13Num(n.clients)} rebooked` : 'no clients'}</div>
      ${w13Spark(r.weekly, r.current, r.dept)}
    </button>`;
  };
  el.innerHTML = `
    <section class="slv-intro">
      <h2>Staff&rsquo;s Quarterly Performance</h2>
      <p>Everyone's ${t.year} so far, week by week from the first week of January: ${w13Esc(w13Day(t.from))} to ${w13Esc(w13Day(t.to))}. The small bars are her sales, one a week${t.current_week_no ? `, with Week ${t.current_week_no} so far as the paler one on the end` : ''}. Tap anyone for her full list, with each 13-week quarter totalled.</p>
    </section>
    <div class="sc-bar w13-bar">
      <div class="sc-seg" role="group" aria-label="Team">
        ${[['all', 'All'], ['Hair', 'Hair'], ['Beauty', 'Beauty']].map(([k, l]) =>
          `<button type="button" class="${w13Dept === k ? 'on' : ''}" onclick="w13SetDept('${k}')">${l}</button>`).join('')}
      </div>
      ${w13BranchPick()}
      ${w13YearPick(t)}
      <span class="spf-dd"><select id="w13Sort" aria-label="Sort by" onchange="w13SetSort(this.value, false)">
        ${Object.entries(W13_SORTS).map(([k, v]) => `<option value="${k}"${k === w13Sort ? ' selected' : ''}>Sort: ${v.label}</option>`).join('')}
      </select></span>
      <button type="button" class="sc-btn" title="Reverse the order" onclick="w13SetSort(null, true)">${['branch', 'name'].includes(w13Sort) ? (w13Rev ? 'Z–A' : 'A–Z') : (w13Rev ? 'Lowest first' : 'Highest first')} ⇅</button>
    </div>
    ${list.length ? w13Body(list, flip, byTakings, grid, head) : '<p class="slv-muted" style="margin-top:22px">No one on this team at this branch.</p>'}
    <p class="slv-muted">Sales are services before VAT, retail not included. A grey bar is a week with no sales (leave, days off, or not uploaded yet).</p>`;
  if (typeof spfDD === 'function') { spfDD(document.getElementById('w13Sort')); spfDD(document.getElementById('w13Year')); spfDD(document.getElementById('w13Branch')); }
}
// Branch and Position keep headed groups (busiest first inside each); the rest are
// one flat grid with the branch on each card. Same rules as Staff Benchmarks.
function w13Body(list, flip, byTakings, grid, head) {
  if (w13Sort === 'branch') {
    const bs = [...new Set(list.map(r => r.branch))].sort((a, b) => flip * (W13_BRANCH[a] || a).localeCompare(W13_BRANCH[b] || b));
    return bs.map(b => head(W13_BRANCH[b] || b) + ['Hair', 'Beauty'].filter(dp => list.some(r => r.branch === b && r.dept === dp)).map(dp =>
      (w13Dept === 'all' ? head(dp, true) : '') + grid(list.filter(r => r.branch === b && r.dept === dp).sort(byTakings))).join('')).join('');
  }
  if (w13Sort === 'level') {
    const groups = {};
    list.forEach(r => (groups[r.level || r.dept] ||= []).push(r));
    return Object.keys(groups).sort((a, b) => flip * (w13Rank(groups[b][0]) - w13Rank(groups[a][0])))
      .map(g => head(g) + grid(groups[g].sort(byTakings))).join('');
  }
  const cmp = W13_SORTS[w13Sort].cmp;
  return `<div style="margin-top:18px">${grid(list.slice().sort((a, b) => flip * cmp(a, b)))}</div>`;
}
function w13SetSort(k, flipIt) {
  if (flipIt) w13Rev = !w13Rev; else { w13Sort = k; w13Rev = false; }
  try { localStorage.setItem('w13-sort', JSON.stringify({ k: w13Sort, rev: w13Rev })); } catch (e) {}
  renderStaffWeeks();
}
function w13SetDept(k) {
  w13Dept = k;
  try { localStorage.setItem('w13-dept', k); } catch (e) {}
  renderStaffWeeks();
}

function w13Draw() {
  const cv = document.getElementById('w13Canvas');
  if (!cv || !w13Data || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted'), border = css.getPropertyValue('--border');
  const daily = w13Mode === 'day' && (w13Data.days || []).length;
  const all = w13Data.days || [];
  const win = daily && w13Win && w13Win < all.length ? w13Win : all.length;
  w13Off = Math.max(0, Math.min(w13Off, all.length - win));
  const shown = daily ? all.slice(all.length - w13Off - win, all.length - w13Off) : [];
  w13PaintZoom(daily, all.length, win, shown);
  const rows = daily
    ? shown.map(x => ({ label: win <= 31 ? [new Date(x.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }), w13Day(x.date)] : w13Day(x.date),
        tip: new Date(x.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), q: w13QOfDate(x.date, w13Data.from), sales: x.total_revenue, clients: x.clients }))
    : w13Data.weeks.map((w, i) => ({ label: w.current ? [w13Wk(w.week_no), 'so far'] : [w13Wk(w.week_no), w13Range(w.week_start)], cur: !!w.current, q: w13Q(w.week_no), no: w.week_no, sales: w.numbers.total_revenue, clients: w.numbers.clients }));
  const shades = w13Shades(w13Data.staff && w13Data.staff.dept);
  // Same colours as her Staff Benchmarks chart: hair violet bars and a green line,
  // beauty pink bars and a deep violet line (Kate, 29 Sep 2026). The pink is the brand's
  // coral pillar accent, #FF9B9B (trs-brand-guardian palette), as the lavender is.
  const pal = (w13Data.staff && w13Data.staff.dept === 'Beauty') ? { bar: '#FF9B9B', line: '#6D28D9' } : { bar: '#C4B5FD', line: '#0F6E56' };
  const barKey = w13Bars === 'clients' ? 'clients' : 'sales', lineKey = barKey === 'sales' ? 'clients' : 'sales';
  const LBL = { sales: 'Service sales (AED)', clients: 'Clients' }, barLbl = LBL[barKey], lineLbl = LBL[lineKey];
  // Quarter bands (Kate, 29 Sep 2026: the dashed line was too quiet for the untrained
  // eye). Each quarter gets a faint wash of its own shade behind its bars, a firm line
  // where it meets the next, and its name printed above it: "Q2 · Weeks 14–26".
  const qBands = {
    id: 'w13QBands',
    beforeDatasetsDraw(chart) {
      const x = chart.scales.x, a = chart.chartArea, ctx = chart.ctx, n = rows.length;
      if (!n) return;
      const mid = (i, k) => (x.getPixelForValue(i) + x.getPixelForValue(k)) / 2;
      const runs = [];
      rows.forEach((r, i) => { const last = runs[runs.length - 1]; if (last && last.q === r.q) last.to = i; else runs.push({ q: r.q, from: i, to: i }); });
      ctx.save();
      runs.forEach((run, k) => {
        const l = run.from === 0 ? a.left : mid(run.from - 1, run.from);
        const rgt = run.to === n - 1 ? a.right : mid(run.to, run.to + 1);
        ctx.fillStyle = (shades[(run.q || 1) - 1] || '#999999') + '26';
        ctx.fillRect(l, a.top, rgt - l, a.bottom - a.top);
        if (k > 0) { ctx.strokeStyle = muted || '#888'; ctx.globalAlpha = .45; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l, a.top); ctx.lineTo(l, a.bottom); ctx.stroke(); ctx.globalAlpha = 1; }
        // The name above the band, shortened when the band is narrow.
        const wk = daily ? null : rows.slice(run.from, run.to + 1).map(r => r.no).filter(Boolean);
        const long = `Q${run.q}${wk && wk.length ? (wk.length === 1 ? ` · Week ${wk[0]}` : ` · Weeks ${wk[0]}–${wk[wk.length - 1]}`) : ''}`;
        ctx.font = "600 12px Inter, system-ui, sans-serif";
        const txt = ctx.measureText(long).width + 8 < rgt - l ? long : `Q${run.q}`;
        if (ctx.measureText(txt).width + 4 < rgt - l) {
          ctx.fillStyle = muted || '#888'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(txt, (l + rgt) / 2, a.top - 6);
        }
      });
      ctx.restore();
    },
  };
  if (w13Chart) w13Chart.destroy();
  w13Chart = new Chart(cv, {
    plugins: [qBands],
    data: {
      labels: rows.map(r => r.label),
      datasets: [
        // Same look as the stylist page's chart. Lower order draws on top.
        { type: 'bar', order: 2, label: barLbl, data: rows.map(r => r[barKey]), backgroundColor: rows.map(r => { const c = shades[(r.q || 1) - 1] || pal.bar; return r.cur ? c + '73' : c; }), yAxisID: 'y', borderRadius: daily ? (win <= 31 ? 4 : 2) : 6, maxBarThickness: 60 },
        { type: 'line', order: 1, label: lineLbl, data: rows.map(r => r[lineKey]), borderColor: pal.line, borderWidth: daily ? 1.5 : 2.5, backgroundColor: pal.line,
          pointRadius: daily ? (win <= 31 ? 3 : win <= 91 ? 2 : 0) : 4, pointHoverRadius: daily ? 4 : 6, pointBackgroundColor: '#fff', pointBorderColor: pal.line, pointBorderWidth: 2, yAxisID: 'y1', tension: 0.4, cubicInterpolationMode: 'monotone' },   // smooth, never overshoots (Kate, 29 Sep 2026)
      ],
    },
    options: {
      maintainAspectRatio: false,
      layout: { padding: { top: 30 } },   // room for the quarter names above the bands
      interaction: { mode: 'index', intersect: false },
      // The Sales / Clients key lives in the controls row (w13SeriesKey), so the quarter
      // names have the top of the chart to themselves.
      plugins: { legend: { display: false },
                 tooltip: { callbacks: { title: items => { const r = rows[items[0].dataIndex]; if (r && r.tip) return r.tip; const l = items[0].chart.data.labels[items[0].dataIndex]; return Array.isArray(l) ? l.join(' · ') : l; } } } },
      scales: {
        // Left axis is always the bars, right axis the line, whichever measure each is.
        y: { beginAtZero: true, grace: '10%', ticks: { color: muted, precision: barKey === 'clients' ? 0 : undefined }, grid: { color: border } },
        y1: { position: 'right', beginAtZero: true, grace: '10%', ticks: { color: muted, precision: lineKey === 'clients' ? 0 : undefined }, grid: { display: false } },
        // A phone has room for all thirteen only as W01..W13; the tooltip and the table
        // below still give "Week 01" and its dates. Desktop shows both lines.
        x: { ticks: { color: muted, autoSkip: true, maxRotation: 0,
               callback(v) { const l = this.getLabelForValue(v); return (!daily && Array.isArray(l) && this.chart.width < 560) ? ('W' + l[0].slice(5)) : l; } },
             grid: { display: false } },
      },
    },
  });
  // Swipe the chart sideways to move a zoomed Daily window (phone), same as the arrows.
  if (!cv._w13Swipe) {
    cv._w13Swipe = true;
    let x0 = null;
    cv.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    cv.addEventListener('touchend', e => {
      if (x0 === null || w13Mode !== 'day' || !w13Win) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) w13Pan(dx > 0 ? 1 : -1);
    }, { passive: true });
  }
}
// The zoom row under the chart heading: chips, the range shown, and back/forward.
function w13PaintZoom(daily, n, win, shown) {
  const z = document.getElementById('w13Zoom');
  if (!z) return;
  if (!daily) { z.innerHTML = ''; z.style.display = 'none'; return; }
  z.style.display = '';
  const back = w13Off + win < n, fwd = w13Off > 0;
  z.innerHTML = `<div class="sc-seg" role="group" aria-label="Zoom">${W13_WINS.map(([k, l]) =>
      `<button type="button" class="${(w13Win || 0) === k ? 'on' : ''}" onclick="w13Zoom(${k})">${l}</button>`).join('')}</div>
    <div class="w13-pan">
      <button type="button" class="sc-btn" aria-label="Earlier" onclick="w13Pan(1)"${back ? '' : ' disabled'}>‹</button>
      <span class="slv-note">${shown.length ? `${w13Esc(w13Day(shown[0].date))} – ${w13Esc(w13Day(shown[shown.length - 1].date))}` : ''}</span>
      <button type="button" class="sc-btn" aria-label="Later" onclick="w13Pan(-1)"${fwd ? '' : ' disabled'}>›</button>
    </div>`;
}
function w13Zoom(k) { w13Win = k; w13Off = 0; w13Draw(); }
// Move by half a window: 1 = earlier, -1 = later.
function w13Pan(dir) { if (!w13Win) return; w13Off += dir * Math.max(1, Math.round(w13Win / 2)); w13Draw(); }
function w13RedrawForTheme() {
  const v = document.getElementById('view-staffweeks');
  if (v && v.style.display !== 'none') w13Draw();
}
function w13SetMode(m) {
  if (m === w13Mode) return;
  w13Mode = m;
  document.querySelectorAll('.w13-chart-head .sc-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  const t = document.getElementById('w13ChartTitle');
  if (t) t.textContent = w13ChartTitleText();
  w13Draw();
}
// Fold or open one quarter of her table, in place: no redraw, the chart stays put.
function w13ToggleQ(q) {
  if (!w13QOpen) w13QOpen = new Set();
  const open = !w13QOpen.has(q);
  if (open) w13QOpen.add(q); else w13QOpen.delete(q);
  const tb = document.querySelector(`#staffWeeksContent .w13-q[data-q="${q}"]`);
  if (!tb) return;
  tb.classList.toggle('open', open);
  const b = tb.querySelector('.w13-qbtn');
  if (b) b.setAttribute('aria-expanded', open);
}
function w13Set(id) {
  w13Pick = id || null;
  w13Mode = 'week'; w13Win = 28; w13Off = 0;
  window.scrollTo(0, 0);
  renderStaffWeeks();
}
