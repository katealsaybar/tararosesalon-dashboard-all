// 13-Week Report (Kate, 29 Sep 2026, Emma's ask): the Staff Benchmarks page cuts its
// week-by-week chart at the month, so it only ever shows 4 or 5 weeks. This is one
// stylist's last thirteen full weeks, Monday to Sunday, so the quarter's ups and
// downs show. Numbers come from perf_weeks (migrations/create_perf_weeks.sql), which
// runs perf_core per week, so a week here matches the same week on her own page.
// Same key as Staff Benchmarks (spfGet): the viewer key is enough, the roster it
// returns has names only.
//
// Kate, 29 Sep 2026: opens on the team grid (everyone's 13 weeks as small cards), not a
// 48-name dropdown; tap a card for her report, "All stylists" goes back.
let w13Data = null;       // last perf_weeks reply for one stylist
let w13Team = null;       // perf_weeks reply with no stylist: the grid
// Fixed cycles (Emma, 29 Sep 2026): Week 1 is the first week of January and the year is
// Weeks 1-13, 14-26, 27-39, 40-52. null = the default, the cycle holding the last
// complete week; otherwise the Monday the picked cycle starts on.
let w13Start = null;
let w13Chart = null;
let w13Pick = null;       // null = the grid
let w13Dept = 'all';
// Chart grain, Daily or Weekly like the Staff Benchmarks chart. Always opens on Weekly
// (Kate, 29 Sep 2026), so it is not remembered.
let w13Mode = 'week';
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
  takings: { label: 'Takings',  cmp: (a, b) => w13N((b.numbers || {}).total_revenue) - w13N((a.numbers || {}).total_revenue) },
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
// A cycle is a quarter of the year's weeks: Q1 = Weeks 1-13 ... Q4 = Weeks 40-52.
const w13CycleName = c => `Q${c.no} ${c.year} · Weeks ${c.week_first}–${c.week_last}`;
// Two pills, Year then Quarter (Kate, 29 Sep 2026), shared by the grid and her report.
// Selects dressed as the Staff Benchmarks pill; each quarter's dates ride in its label.
function w13CyclePick(d) {
  const all = d.cycles || [], cur = d.cycle;
  const years = [...new Set(all.map(c => c.year))];
  const qs = all.filter(c => c.year === cur.year).sort((a, b) => a.no - b.no);
  return `<span class="spf-dd"><select id="w13Year" aria-label="Year" onchange="w13SetYear(+this.value)">
    ${years.map(y => `<option value="${y}"${y === cur.year ? ' selected' : ''}>${y}</option>`).join('')}
  </select></span>
  <span class="spf-dd"><select id="w13Cycle" aria-label="Quarter" onchange="w13SetCycle(this.value)">
    ${qs.map(c => `<option value="${w13Esc(c.start)}"${c.from === cur.from ? ' selected' : ''}>Q${c.no} · Weeks ${c.week_first}–${c.week_last} · ${w13Esc(w13Day(c.from))} – ${w13Esc(w13Day(c.to))}</option>`).join('')}
  </select></span>`;
}
// A new year keeps the same quarter when that year has it, else its latest one.
function w13SetYear(y) {
  const d = w13Team || w13Data; if (!d) return;
  const qs = d.cycles.filter(c => c.year === y);
  const pick = qs.find(c => c.no === d.cycle.no) || qs[0];
  if (pick) w13SetCycle(pick.start);
}
function w13SetCycle(start) {
  const latest = (w13Team || w13Data || {}).cycles;
  w13Start = (latest && latest[0] && latest[0].start === start) ? null : start;
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
  const { data, error } = await sb.rpc('perf_weeks', { p_admin: typeof spfGet === 'function' ? spfGet() : null, p_staff_id: staffId || null, p_start: w13Start });
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
function w13Spark(weekly, cur) {
  const v = (weekly || []).map(Number);
  if (cur !== null && cur !== undefined) v.push(Number(cur));
  const last = (cur !== null && cur !== undefined) ? v.length - 1 : -1, max = Math.max(1, ...v);
  const bw = 7, gap = 3, h = 34;
  return `<svg class="w13-spark" viewBox="0 0 ${v.length * (bw + gap) - gap} ${h}" preserveAspectRatio="none" aria-hidden="true">${v.map((x, i) => {
    const bh = x > 0 ? Math.max(2, Math.round(h * x / max)) : 2;
    return `<rect x="${i * (bw + gap)}" y="${h - bh}" width="${bw}" height="${bh}" rx="1.5" class="${x > 0 ? 'on' : ''}${i === last ? ' cur' : ''}"/>`;
  }).join('')}</svg>`;
}

async function renderStaffWeeks() {
  const el = document.getElementById('staffWeeksContent');
  if (!w13Pick) return w13RenderTeam(el);
  if (!w13Data || !w13Data.staff || w13Data.staff.id !== w13Pick) {
    el.innerHTML = '<p class="slv-muted">Loading her 13 weeks…</p>';
    try { w13Data = await w13Load(w13Pick); }
    catch (e) { el.innerHTML = '<p class="slv-muted">The 13-week report didn\'t load. Refresh to try again.</p>'; return; }
  }
  const d = w13Data, s = d.staff;
  if (!s) { w13Pick = null; return w13RenderTeam(el); }

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

  const rows = weeks.map((w, i) => {
    const n = w.numbers;
    const fill = n.available_hours > 0 ? Math.round(100 * n.booked_hours / n.available_hours) + '%' : '–';
    return `<tr${n.total_revenue > 0 || n.clients > 0 ? '' : ' class="w13-off"'}>
      <td><b>${w13Wk(w.week_no)}</b><div class="slv-note">${w13Esc(w13Range(w.week_start))}</div></td>
      <td>${w13Num(n.total_revenue)}</td><td>${w13Num(n.clients)}</td>
      <td class="slv-aim">${w13Rebook(n.rebooked, n.clients)}</td>
      <td>${w13Num(n.avg_bill)}</td><td>${w13Num(n.retail)}</td><td>${fill}</td></tr>`;
  }).join('');
  const totFill = tot.ah > 0 ? Math.round(100 * tot.uh / tot.ah) + '%' : '–';
  const curRow = curWk ? (() => {
    const n = curWk.numbers, fill = n.available_hours > 0 ? Math.round(100 * n.booked_hours / n.available_hours) + '%' : '–';
    return `<tr class="w13-cur"><td><b>${w13Wk(curWk.week_no)}</b> <span class="slv-note" style="display:inline">so far</span><div class="slv-note">${curWk.week_start === d.data_through ? w13Esc(w13Day(d.data_through)) : `${w13Esc(w13Day(curWk.week_start))} to ${w13Esc(w13Day(d.data_through))}`}</div></td>
      <td>${w13Num(n.total_revenue)}</td><td>${w13Num(n.clients)}</td><td class="slv-aim">${w13Rebook(n.rebooked, n.clients)}</td>
      <td>${w13Num(n.avg_bill)}</td><td>${w13Num(n.retail)}</td><td>${fill}</td></tr>`;
  })() : '';

  el.innerHTML = `
    <section class="slv-intro">
      <h2>13-Week Report</h2>
      <p>Thirteen-week quarters, Monday to Sunday, counted from the first week of January: Q1 is Weeks 1–13, Q2 14–26, Q3 27–39, Q4 40–52. Only complete weeks count in the totals; the week still being traded shows on the end as "so far". Sales are services before VAT, retail not included.</p>
    </section>
    <div class="sc-bar w13-bar" style="margin-bottom:14px">
      <button type="button" class="sc-btn" onclick="w13Set(null)">← All stylists</button>
      ${w13CyclePick(d)}
    </div>
    <section class="slv-card">
      <div class="slv-head">
        <div class="w13-who">${ph ? `<img class="w13-hero" src="${ph}" alt="" onerror="this.remove()">` : ''}<div><div class="slv-eyebrow">${w13Esc(s.level || s.dept)} · ${w13Esc(W13_BRANCH[s.branch] || s.branch)}</div><h3>${w13Esc(s.name)}</h3></div></div>
        <p>${w13Esc(w13CycleName(d.cycle))} · ${w13Esc(w13Day(d.cycle.from))} to ${w13Esc(w13Day(d.to))} · ${worked} of ${weeks.length} weeks with clients${weeks.length < 13 ? ` (${weeks.length} complete so far)` : ''}</p>
      </div>
      ${(d.branches || []).length > 1 ? `<div class="w13-branches"><span class="slv-eyebrow">Worked at</span> ${d.branches.map(x =>
        `<span class="w13-br"><b>${w13Esc(W13_BRANCH[x.branch] || x.branch)}</b> ${w13Aed(x.sales)} · ${w13Num(x.clients)} clients</span>`).join('')}<div class="slv-note">Every branch is counted in the totals below, including cover days away from ${w13Esc(W13_BRANCH[s.branch] || s.branch)}.</div></div>` : ''}
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Sales</div><div class="w13-val">${w13Aed(tot.sales)}</div><div class="slv-note">${worked ? w13Aed(tot.sales / worked) + ' a week worked' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Clients</div><div class="w13-val">${w13Num(tot.clients)}</div><div class="slv-note">${tot.clients ? 'Average bill ' + w13Aed(tot.sales / tot.clients) : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Rebooking</div><div class="w13-val">${tot.clients ? Math.round(100 * tot.rebooked / tot.clients) + '%' : '–'}</div><div class="slv-note">${tot.clients ? `${w13Num(tot.rebooked)} of ${w13Num(tot.clients)} clients rebooked` : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Column fill</div><div class="w13-val">${totFill}</div><div class="slv-note">${tot.ah ? `${w13Num(tot.uh)} of ${w13Num(tot.ah)} hours booked` : ''}</div></div>
      </div>
      <div class="w13-chart-head">
        <div class="slv-eyebrow" id="w13ChartTitle">${w13Mode === 'day' ? 'Day by day' : 'Week by week'} · sales (bars) and clients (line)</div>
        ${(d.days || []).length ? `<div class="sc-seg" role="group" aria-label="Chart" style="display:inline-flex">
          <button type="button" data-m="day" class="${w13Mode === 'day' ? 'on' : ''}" onclick="w13SetMode('day')">Daily</button>
          <button type="button" data-m="week" class="${w13Mode === 'week' ? 'on' : ''}" onclick="w13SetMode('week')">Weekly</button>
        </div>` : ''}
      </div>
      <div style="position:relative;height:280px"><canvas id="w13Canvas"></canvas></div>
      <div class="slv-wrap" style="margin-top:14px"><table class="slv-table w13-table">
        <thead><tr><th>Week</th><th>Sales (AED)</th><th>Clients</th><th>Rebooked</th><th>Avg bill</th><th>Retail</th><th>Column fill</th></tr></thead>
        <tbody>${rows}
          <tr class="w13-tot"><td>${w13Esc(`Weeks ${d.cycle.week_first}–${weeks.length ? weeks[weeks.length - 1].week_no : d.cycle.week_last}`)}</td><td>${w13Num(tot.sales)}</td><td>${w13Num(tot.clients)}</td><td class="slv-aim">${w13Rebook(tot.rebooked, tot.clients)}</td>
            <td>${tot.clients ? w13Num(tot.sales / tot.clients) : '–'}</td><td>${w13Num(tot.retail)}</td><td>${totFill}</td></tr>
          ${curRow}
        </tbody>
      </table></div>
      <p class="slv-muted">Sales to ${w13Esc(w13Day(d.data_through))}. The totals are the complete weeks only; the week still being traded joins them once Sunday closes. Weeks with no clients stay in as zeros so the gaps show (leave, days off, or a week not uploaded yet).</p>
    </section>`;
  if (typeof spfDD === 'function') { spfDD(document.getElementById('w13Year')); spfDD(document.getElementById('w13Cycle')); }
  w13Draw();
}

async function w13RenderTeam(el) {
  if (w13Chart) { w13Chart.destroy(); w13Chart = null; }
  if (!w13Team) {
    el.innerHTML = '<p class="slv-muted">Loading the team\'s 13 weeks…</p>';
    try { w13Team = await w13Load(null); }
    catch (e) { el.innerHTML = '<p class="slv-muted">The 13-week report didn\'t load. Refresh to try again.</p>'; return; }
  }
  const t = w13Team;
  const list = t.roster.filter(r => w13Dept === 'all' || r.dept === w13Dept);
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
      ${w13Spark(r.weekly, r.current)}
    </button>`;
  };
  el.innerHTML = `
    <section class="slv-intro">
      <h2>13-Week Report</h2>
      <p>Everyone's ${w13Esc(w13CycleName(t.cycle))}, ${w13Esc(w13Day(t.cycle.from))} to ${w13Esc(w13Day(t.to))}. Quarters run from the first week of January: Q1 is Weeks 1–13, Q2 14–26, Q3 27–39, Q4 40–52. The small bars are her sales week by week${t.current_week_no ? `, with Week ${t.current_week_no} so far as the paler one on the end` : ''}. Tap a stylist for her full report.</p>
    </section>
    <div class="sc-bar w13-bar">
      <div class="sc-seg" role="group" aria-label="Team">
        ${[['all', 'All'], ['Hair', 'Hair'], ['Beauty', 'Beauty']].map(([k, l]) =>
          `<button type="button" class="${w13Dept === k ? 'on' : ''}" onclick="w13SetDept('${k}')">${l}</button>`).join('')}
      </div>
      ${w13CyclePick(t)}
      <span class="spf-dd"><select id="w13Sort" aria-label="Sort by" onchange="w13SetSort(this.value, false)">
        ${Object.entries(W13_SORTS).map(([k, v]) => `<option value="${k}"${k === w13Sort ? ' selected' : ''}>Sort: ${v.label}</option>`).join('')}
      </select></span>
      <button type="button" class="sc-btn" title="Reverse the order" onclick="w13SetSort(null, true)">${['branch', 'name'].includes(w13Sort) ? (w13Rev ? 'Z–A' : 'A–Z') : (w13Rev ? 'Lowest first' : 'Highest first')} ⇅</button>
    </div>
    ${w13Body(list, flip, byTakings, grid, head)}
    <p class="slv-muted">Sales are services before VAT, retail not included. A grey bar is a week with no sales (leave, days off, or not uploaded yet).</p>`;
  if (typeof spfDD === 'function') { spfDD(document.getElementById('w13Sort')); spfDD(document.getElementById('w13Year')); spfDD(document.getElementById('w13Cycle')); }
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
  const rows = daily
    ? w13Data.days.map(x => ({ label: w13Day(x.date), sales: x.total_revenue, clients: x.clients }))
    : w13Data.weeks.map((w, i) => ({ label: w.current ? [w13Wk(w.week_no), 'so far'] : [w13Wk(w.week_no), w13Range(w.week_start)], cur: !!w.current, sales: w.numbers.total_revenue, clients: w.numbers.clients }));
  // Same colours as her Staff Benchmarks chart: hair violet bars and a green line,
  // beauty pink bars and a deep violet line (Kate, 29 Sep 2026).
  const pal = (w13Data.staff && w13Data.staff.dept === 'Beauty') ? { bar: '#F9A8D4', line: '#6D28D9' } : { bar: '#C4B5FD', line: '#0F6E56' };
  if (w13Chart) w13Chart.destroy();
  w13Chart = new Chart(cv, {
    data: {
      labels: rows.map(r => r.label),
      datasets: [
        // Same look as the stylist page's chart. Lower order draws on top.
        { type: 'bar', order: 2, label: 'Sales (AED)', data: rows.map(r => r.sales), backgroundColor: rows.map(r => r.cur ? pal.bar + '73' : pal.bar), yAxisID: 'y', borderRadius: daily ? 2 : 6, maxBarThickness: 60 },
        { type: 'line', order: 1, label: 'Clients', data: rows.map(r => r.clients), borderColor: pal.line, borderWidth: daily ? 1.5 : 2.5, backgroundColor: pal.line,
          pointRadius: daily ? 2 : 4, pointHoverRadius: daily ? 4 : 6, pointBackgroundColor: '#fff', pointBorderColor: pal.line, pointBorderWidth: 2, yAxisID: 'y1', tension: 0 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: muted, usePointStyle: true, pointStyle: 'circle', boxHeight: 8 } },
                 tooltip: { callbacks: { title: items => { const l = items[0].chart.data.labels[items[0].dataIndex]; return Array.isArray(l) ? l.join(' · ') : l; } } } },
      scales: {
        y: { beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
        y1: { position: 'right', beginAtZero: true, grace: '10%', ticks: { color: muted, precision: 0 }, grid: { display: false } },
        // A phone has room for all thirteen only as W01..W13; the tooltip and the table
        // below still give "Week 01" and its dates. Desktop shows both lines.
        x: { ticks: { color: muted, autoSkip: true, maxRotation: 0,
               callback(v) { const l = this.getLabelForValue(v); return (!daily && Array.isArray(l) && this.chart.width < 560) ? ('W' + l[0].slice(5)) : l; } },
             grid: { display: false } },
      },
    },
  });
}
function w13RedrawForTheme() {
  const v = document.getElementById('view-staffweeks');
  if (v && v.style.display !== 'none') w13Draw();
}
function w13SetMode(m) {
  if (m === w13Mode) return;
  w13Mode = m;
  document.querySelectorAll('.w13-chart-head .sc-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  const t = document.getElementById('w13ChartTitle');
  if (t) t.textContent = (m === 'day' ? 'Day by day' : 'Week by week') + ' · sales (bars) and clients (line)';
  w13Draw();
}
function w13Set(id) {
  w13Pick = id || null;
  w13Mode = 'week';
  window.scrollTo(0, 0);
  renderStaffWeeks();
}
