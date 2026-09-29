// 13-Week Report (Kate, 29 Sep 2026, Emma's ask): the Staff Benchmarks page cuts its
// week-by-week chart at the month, so it only ever shows 4 or 5 weeks. This is one
// stylist's last thirteen full weeks, Monday to Sunday, so the quarter's ups and
// downs show. Numbers come from perf_weeks (migrations/create_perf_weeks.sql), which
// runs perf_core per week, so a week here matches the same week on her own page.
// Same key as Staff Benchmarks (spfGet): the viewer key is enough, the roster it
// returns has names only.
let w13Data = null;       // last perf_weeks reply
let w13Chart = null;
let w13Pick = null;
try { w13Pick = localStorage.getItem('w13-staff'); } catch (e) {}

const w13Esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const w13Num = v => (v === null || v === undefined) ? '–' : Math.round(Number(v)).toLocaleString('en-GB');
const w13Aed = v => (v === null || v === undefined) ? '–' : 'AED ' + w13Num(v);
const w13Day = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
// The Sunday of a week, built in local time (toISOString would slip a day in UAE time).
const w13DayEnd = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + 6); return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const W13_BRANCH = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz' };

// "10 of 20 · 50%" — Emma's ask for rebooking everywhere: the count, not just the rate.
function w13Rebook(rebooked, clients) {
  if (!clients) return '–';
  return `${w13Num(rebooked)} of ${w13Num(clients)} · ${Math.round(100 * rebooked / clients)}%`;
}

async function w13Load(staffId) {
  const { data, error } = await sb.rpc('perf_weeks', { p_admin: typeof spfGet === 'function' ? spfGet() : null, p_staff_id: staffId || null });
  if (error || !data) throw error || new Error('no data');
  return data;
}

async function renderStaffWeeks() {
  const el = document.getElementById('staffWeeksContent');
  if (!w13Data || (w13Pick && (!w13Data.staff || w13Data.staff.id !== w13Pick))) {
    el.innerHTML = '<p class="slv-muted">Loading the 13 weeks…</p>';
    try {
      w13Data = await w13Load(w13Pick);
      // A remembered person who has since left: fall back to the first on the list.
      if (!w13Data.staff && w13Data.roster.length) {
        w13Pick = w13Data.roster[0].id;
        w13Data = await w13Load(w13Pick);
      }
    } catch (e) {
      el.innerHTML = '<p class="slv-muted">The 13-week report didn\'t load. Refresh to try again.</p>';
      return;
    }
  }
  const d = w13Data, s = d.staff;
  if (!s) { el.innerHTML = '<p class="slv-muted">No active staff to show.</p>'; return; }

  const weeks = d.weeks;
  const thisWeek = weeks.length ? weeks[weeks.length - 1].week_start : null;
  // The week the latest data sits in is still being traded.
  const partial = thisWeek && (new Date(thisWeek + 'T00:00:00').getTime() + 6 * 864e5) > new Date(d.data_through + 'T00:00:00').getTime();
  const sum = k => weeks.reduce((a, w) => a + (Number(w.numbers[k]) || 0), 0);
  const tot = { sales: sum('total_revenue'), clients: sum('clients'), rebooked: sum('rebooked'), retail: sum('retail'),
                uh: sum('booked_hours'), ah: sum('available_hours') };
  const worked = weeks.filter(w => w.numbers.total_revenue > 0 || w.numbers.clients > 0).length;

  // The picker: grouped by branch, same order as the team grid.
  const groups = {};
  d.roster.forEach(r => { (groups[r.branch] = groups[r.branch] || []).push(r); });
  const opts = Object.keys(groups).map(b => groups[b].map(r =>
    `<option value="${w13Esc(r.id)}"${r.id === s.id ? ' selected' : ''}>${w13Esc(r.name)} · ${w13Esc(b)}</option>`).join('')).join('');

  const rows = weeks.map(w => {
    const n = w.numbers, now = partial && w.week_start === thisWeek;
    const fill = n.available_hours > 0 ? Math.round(100 * n.booked_hours / n.available_hours) + '%' : '–';
    return `<tr${n.total_revenue > 0 || n.clients > 0 ? '' : ' class="w13-off"'}>
      <td>${w13Esc(w13Day(w.week_start))} – ${w13Esc(w13DayEnd(w.week_start))}${now ? ' <span class="slv-note" style="display:inline">so far</span>' : ''}</td>
      <td>${w13Num(n.total_revenue)}</td><td>${w13Num(n.clients)}</td>
      <td class="slv-aim">${w13Rebook(n.rebooked, n.clients)}</td>
      <td>${w13Num(n.avg_bill)}</td><td>${w13Num(n.retail)}</td><td>${fill}</td></tr>`;
  }).join('');
  const totFill = tot.ah > 0 ? Math.round(100 * tot.uh / tot.ah) + '%' : '–';

  el.innerHTML = `
    <section class="slv-intro">
      <h2>13-Week Report</h2>
      <p>The last thirteen full weeks, Monday to Sunday, so you can see the run of the quarter and not just one month. Sales are services before VAT, retail not included.</p>
    </section>
    <div class="sc-bar" style="margin-bottom:14px">
      <span class="spf-dd"><select id="w13Staff" aria-label="Stylist" onchange="w13Set(this.value)">${opts}</select></span>
    </div>
    <section class="slv-card">
      <div class="slv-head">
        <div><div class="slv-eyebrow">${w13Esc(s.level || s.dept)} · ${w13Esc(W13_BRANCH[s.branch] || s.branch)}</div><h3>${w13Esc(s.name)}</h3></div>
        <p>${w13Esc(w13Day(weeks[0].week_start))} to ${w13Esc(w13Day(d.data_through))} · ${worked} of ${weeks.length} weeks with clients</p>
      </div>
      <div class="w13-tiles">
        <div class="w13-tile"><div class="slv-eyebrow">Sales</div><div class="w13-val">${w13Aed(tot.sales)}</div><div class="slv-note">${worked ? w13Aed(tot.sales / worked) + ' a week worked' : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Clients</div><div class="w13-val">${w13Num(tot.clients)}</div><div class="slv-note">${tot.clients ? 'Average bill ' + w13Aed(tot.sales / tot.clients) : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Rebooking</div><div class="w13-val">${tot.clients ? Math.round(100 * tot.rebooked / tot.clients) + '%' : '–'}</div><div class="slv-note">${tot.clients ? `${w13Num(tot.rebooked)} of ${w13Num(tot.clients)} clients rebooked` : ''}</div></div>
        <div class="w13-tile"><div class="slv-eyebrow">Column fill</div><div class="w13-val">${totFill}</div><div class="slv-note">${tot.ah ? `${w13Num(tot.uh)} of ${w13Num(tot.ah)} hours booked` : ''}</div></div>
      </div>
      <div class="slv-eyebrow" style="margin:18px 0 6px">Week by week · sales (bars) and clients (line)</div>
      <div style="position:relative;height:280px"><canvas id="w13Canvas"></canvas></div>
      <div class="slv-wrap" style="margin-top:14px"><table class="slv-table">
        <thead><tr><th>Week</th><th>Sales (AED)</th><th>Clients</th><th>Rebooked</th><th>Avg bill</th><th>Retail</th><th>Column fill</th></tr></thead>
        <tbody>${rows}
          <tr class="w13-tot"><td>13 weeks</td><td>${w13Num(tot.sales)}</td><td>${w13Num(tot.clients)}</td><td class="slv-aim">${w13Rebook(tot.rebooked, tot.clients)}</td>
            <td>${tot.clients ? w13Num(tot.sales / tot.clients) : '–'}</td><td>${w13Num(tot.retail)}</td><td>${totFill}</td></tr>
        </tbody>
      </table></div>
      <p class="slv-muted">Sales to ${w13Esc(w13Day(d.data_through))}. Weeks with no clients stay in as zeros so the gaps show (leave, days off, or a week not uploaded yet).</p>
    </section>`;
  if (typeof spfDD === 'function') spfDD(document.getElementById('w13Staff'));
  w13Draw();
}

function w13Draw() {
  const cv = document.getElementById('w13Canvas');
  if (!cv || !w13Data || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted'), border = css.getPropertyValue('--border');
  const weeks = w13Data.weeks;
  if (w13Chart) w13Chart.destroy();
  w13Chart = new Chart(cv, {
    data: {
      labels: weeks.map(w => w13Day(w.week_start)),
      datasets: [
        // Same look as the stylist page's chart. Lower order draws on top.
        { type: 'bar', order: 2, label: 'Sales (AED)', data: weeks.map(w => w.numbers.total_revenue), backgroundColor: '#C4B5FD', yAxisID: 'y', borderRadius: 6, maxBarThickness: 60 },
        { type: 'line', order: 1, label: 'Clients', data: weeks.map(w => w.numbers.clients), borderColor: '#0F6E56', borderWidth: 2.5, backgroundColor: '#0F6E56',
          pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderColor: '#0F6E56', pointBorderWidth: 2, yAxisID: 'y1', tension: 0 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: muted, usePointStyle: true, pointStyle: 'circle', boxHeight: 8 } } },
      scales: {
        y: { beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
        y1: { position: 'right', beginAtZero: true, grace: '10%', ticks: { color: muted, precision: 0 }, grid: { display: false } },
        x: { ticks: { color: muted, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
      },
    },
  });
}
function w13RedrawForTheme() {
  const v = document.getElementById('view-staffweeks');
  if (v && v.style.display !== 'none') w13Draw();
}
function w13Set(id) {
  w13Pick = id;
  try { localStorage.setItem('w13-staff', id); } catch (e) {}
  renderStaffWeeks();
}
