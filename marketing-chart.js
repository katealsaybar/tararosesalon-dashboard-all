// The Marketing pages' charts (Kate, 6 Oct 2026: "divided like Staff's Quarterly
// Performance, you can see Q1 Q2 Q3 Q4"). Shared by google-ads.js and website.js.
// Calendar quarters (Q1 Jan to Mar ... Q4 Oct to Dec), each in its own shade of the
// Quarterly page's lavender, with a faint wash behind its bars, a line where it meets
// the next and its name printed above. Daily or weekly bars (Monday to Sunday); a
// window longer than 92 days opens weekly. Also the quarter strip (one tile a
// quarter) and the open-row detail both pages use.
const MK_SHADES = ['#DDD6FE', '#C4B5FD', '#A78BFA', '#8B5CF6'];   // Q1..Q4, as staff-weeks.js Hair
const MK_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mkIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mkD = s => new Date(s + 'T00:00:00');
const mkDay = s => mkD(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const mkQ = s => Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1;          // '2026-04-01' → 2
const mkQKey = s => s.slice(0, 4) + '-Q' + mkQ(s);                            // '2026-Q2'
const mkQName = (k, withYear) => { const [y, q] = k.split('-Q'); return `Q${q}${withYear ? ' ' + y : ''}`; };
const mkQMonths = k => { const q = Number(k.split('-Q')[1]); return `${MK_MON[(q - 1) * 3]}–${MK_MON[(q - 1) * 3 + 2]}`; };
const mkEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The Period row at the top of each Marketing page (Kate, 6 Oct 2026: "like Org Pulse,
// but simpler"), in the masthead filters' look: text chips, Custom opening two date
// boxes beside them. p is the page's prefix (gads, web, soc); it calls <p>SetDays(n)
// and <p>SetCustom('from'|'to', date). days 0 = Custom; custom = { from, to }.
function mkPeriodRow(p, days, custom) {
  const PER = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'This year'], [0, 'Custom']];
  return `<div class="filters mk-period">
      <div class="f-row">
        <span class="f-lbl" id="${p}PerLbl">Period</span>
        <div class="chipset" role="group" aria-labelledby="${p}PerLbl">${PER.map(([k, l]) =>
          `<button type="button" class="chip" aria-pressed="${days === k}" onclick="${p}SetDays(${k})">${l}</button>`).join('<span class="sep">·</span>')}</div>
        ${days === 0 ? `<div class="f-dates">
          <input type="date" aria-label="From" value="${mkEsc(custom.from)}" min="2025-01-01" max="${mkIso(new Date())}" onchange="${p}SetCustom('from', this.value)">
          <span>to</span>
          <input type="date" aria-label="To" value="${mkEsc(custom.to)}" min="2025-01-01" max="${mkIso(new Date())}" onchange="${p}SetCustom('to', this.value)">
        </div>` : ''}
      </div>
    </div>`;
}

// Daily or weekly mode, per page, kept per browser. 'auto' = weekly past 92 days.
const mkMode = {};
try { Object.assign(mkMode, JSON.parse(localStorage.getItem('trs-mk-mode') || '{}')); } catch (e) {}
function mkModeFor(page, from, to) {
  const m = mkMode[page];
  if (m === 'day' || m === 'week') return m;
  return (mkD(to) - mkD(from)) / 864e5 > 92 ? 'week' : 'day';
}
function mkSetMode(page, m, redraw) {
  mkMode[page] = m;
  try { localStorage.setItem('trs-mk-mode', JSON.stringify(mkMode)); } catch (e) {}
  if (typeof window[redraw] === 'function') window[redraw]();
}
function mkModePills(page, mode, redraw) {
  return `<div class="sc-seg" role="group" aria-label="Daily or weekly">${[['day', 'Daily'], ['week', 'Weekly']].map(([k, l]) =>
    `<button type="button" class="${mode === k ? 'on' : ''}" onclick="mkSetMode('${page}','${k}','${redraw}')">${l}</button>`).join('')}</div>`;
}

// Every day from..to (zero where nothing came in), then grouped into weeks if asked.
// fields: the numeric keys to add up. A week sits in the quarter of its Thursday.
function mkBuckets(days, from, to, mode, fields) {
  const have = {}; (days || []).forEach(r => { have[r.date] = r; });
  const out = [];
  for (let t = mkD(from); mkIso(t) <= to; t.setDate(t.getDate() + 1)) {
    const k = mkIso(t), r = have[k] || {};
    const row = { date: k, from: k, to: k };
    fields.forEach(f => { row[f] = Number(r[f]) || 0; });
    out.push(row);
  }
  if (mode !== 'week') return out.map(r => ({ ...r, q: mkQKey(r.date), label: mkDay(r.date), tip: mkD(r.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) }));
  const weeks = [];
  out.forEach(r => {
    const d = mkD(r.date), mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = mkIso(mon), last = weeks[weeks.length - 1];
    if (last && last.week === k) { fields.forEach(f => { last[f] += r[f]; }); last.to = r.date; last.n++; }
    else weeks.push({ week: k, from: r.date, to: r.date, n: 1, ...Object.fromEntries(fields.map(f => [f, r[f]])) });
  });
  return weeks.map(w => {
    const thu = mkD(w.week); thu.setDate(thu.getDate() + 3);
    // Labelled by its first day inside the dates, so the year's first bar reads 1 Jan, not 29 Dec.
    return { ...w, date: w.week, q: mkQKey(mkIso(thu)), label: mkDay(w.from),
      tip: `Week of ${mkDay(w.week)}${w.n < 7 ? ` (${w.n} day${w.n === 1 ? '' : 's'} in these dates)` : ''}` };
  });
}

// The Q1..Q4 key beside a chart's title, only the quarters it shows.
function mkQKeyHtml(rows) {
  const qs = [...new Set(rows.map(r => r.q))], years = new Set(qs.map(k => k.slice(0, 4)));
  return `<span class="w13-qkey" aria-label="Quarter colours">${qs.map(k =>
    `<span><i style="background:${MK_SHADES[Number(k.split('-Q')[1]) - 1]}"></i>${mkQName(k, years.size > 1)}</span>`).join('')}</span>`;
}

// One tile a quarter: its total, and its daily average against the quarter before
// (averages, so a quarter still running or cut by the dates compares fairly).
// m: { key, label, fmt } of the measure to total.
function mkQuarterStrip(dayRows, m) {
  const by = {};
  dayRows.forEach(r => { const o = by[r.q] = by[r.q] || { sum: 0, n: 0, from: r.date, to: r.date }; o.sum += r[m.key]; o.n++; o.to = r.date; });
  const ks = Object.keys(by).sort();
  if (ks.length < 2) return '';
  const years = new Set(ks.map(k => k.slice(0, 4)));
  return `<div class="w13-tiles" style="margin-top:14px">${ks.map((k, i) => {
    const o = by[k], prev = i ? by[ks[i - 1]] : null;
    const avg = o.sum / o.n, pAvg = prev ? prev.sum / prev.n : null;
    const chg = pAvg ? Math.round(100 * (avg - pAvg) / pAvg) : null;
    const qEnd = new Date(Number(k.slice(0, 4)), Number(k.split('-Q')[1]) * 3, 0);
    const part = o.to < mkIso(qEnd) || mkD(o.from).getDate() !== 1 || mkD(o.from).getMonth() % 3 !== 0;
    return `<div class="w13-tile" style="border-top:3px solid ${MK_SHADES[Number(k.split('-Q')[1]) - 1]}">
      <div class="slv-eyebrow">${mkQName(k, years.size > 1)} · ${mkQMonths(k)}</div>
      <div class="w13-val">${m.fmt(o.sum)}</div>
      <div class="slv-note">${part ? `${mkDay(o.from)} to ${mkDay(o.to)}` : `${m.label}, full quarter`}${chg !== null ? `<br>${chg >= 0 ? '+' : ''}${chg}% a day on ${mkQName(ks[i - 1], years.size > 1)}` : ''}</div>
    </div>`; }).join('')}</div>`;
}

// Bars by quarter shade with the quarter bands behind; an optional line on a right axis.
// spec: { bar: { key, label, fmt }, line?: { key, label, fmt, reverse? } }
function mkDrawChart(cv, rows, spec, old) {
  if (old) old.destroy();
  if (!cv || !window.Chart) return null;
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted').trim(), border = css.getPropertyValue('--border').trim();
  const lineCol = '#0F6E56';
  const years = new Set(rows.map(r => r.q.slice(0, 4)));
  const bands = {
    id: 'mkQBands',
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
        ctx.fillStyle = MK_SHADES[Number(run.q.split('-Q')[1]) - 1] + '26';
        ctx.fillRect(l, a.top, rgt - l, a.bottom - a.top);
        if (k > 0) { ctx.strokeStyle = muted || '#888'; ctx.globalAlpha = .45; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l, a.top); ctx.lineTo(l, a.bottom); ctx.stroke(); ctx.globalAlpha = 1; }
        const long = `${mkQName(run.q, years.size > 1)} · ${mkQMonths(run.q)}`;
        ctx.font = "600 12px Inter, system-ui, sans-serif";
        const txt = ctx.measureText(long).width + 8 < rgt - l ? long : mkQName(run.q, false);
        if (ctx.measureText(txt).width + 4 < rgt - l) {
          ctx.fillStyle = muted || '#888'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(txt, (l + rgt) / 2, a.top - 6);
        }
      });
      ctx.restore();
    },
  };
  const daily = rows.length && rows[0].week === undefined;
  return new Chart(cv, {
    plugins: [bands],
    data: {
      labels: rows.map(r => r.label),
      datasets: [
        { type: 'bar', order: 2, label: spec.bar.label, data: rows.map(r => Math.round(r[spec.bar.key] * 100) / 100), yAxisID: 'y',
          backgroundColor: rows.map(r => MK_SHADES[Number(r.q.split('-Q')[1]) - 1]), borderRadius: daily ? (rows.length <= 31 ? 4 : 2) : 5, maxBarThickness: 48 },
        ...(spec.line ? [{ type: 'line', order: 1, label: spec.line.label, data: rows.map(r => r[spec.line.key] === null ? null : Math.round(r[spec.line.key] * 10) / 10), yAxisID: 'y1',
          borderColor: lineCol, backgroundColor: lineCol, borderWidth: daily ? 1.5 : 2, pointRadius: rows.length <= 31 ? 3 : rows.length <= 60 ? 2 : 0,
          pointHoverRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: lineCol, pointBorderWidth: 2, tension: 0.4, cubicInterpolationMode: 'monotone', spanGaps: true }] : []),
      ],
    },
    options: {
      maintainAspectRatio: false,
      layout: { padding: { top: 26 } },   // room for the quarter names above the bands
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: items => rows[items[0].dataIndex].tip,
          label: c => {
            const s = c.datasetIndex === 0 ? spec.bar : spec.line;
            return `${s.label}: ${s.fmt(c.raw)}`;
          } } },
      },
      scales: {
        y: { beginAtZero: true, grace: '10%', ticks: { color: muted }, grid: { color: border } },
        ...(spec.line ? { y1: { position: 'right', reverse: !!spec.line.reverse, beginAtZero: !spec.line.reverse, grace: '10%', ticks: { color: muted }, grid: { display: false } } } : {}),
        x: { ticks: { color: muted, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
      },
    },
  });
}

// The chart's key: a bar swatch and, when there is one, the line, as on the Quarterly page.
function mkSeriesKey(spec) {
  return `<span class="w13-skey" aria-label="Chart key">
    <span><i class="bar" style="background:${MK_SHADES[1]}"></i>${mkEsc(spec.bar.label)}</span>
    ${spec.line ? `<span><i class="line" style="--c:#0F6E56"></i>${mkEsc(spec.line.label)}</span>` : ''}
  </span>`;
}

// An open row's detail sits in a table cell, and a responsive chart in a cell widens
// the table it is in, which widens the chart again. So the detail is pinned to the
// width of the table's scroll box (the card), and re-pinned when the window resizes.
function mkFitDetail() {
  document.querySelectorAll('.mk-detail-in').forEach(el => {
    const wrap = el.closest('.slv-wrap');
    if (wrap) el.style.width = Math.max(240, wrap.clientWidth - 30) + 'px';
  });
}
window.addEventListener('resize', () => { clearTimeout(mkFitDetail.t); mkFitDetail.t = setTimeout(mkFitDetail, 120); });
