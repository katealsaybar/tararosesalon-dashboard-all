// Money Five stylist pages (Kate, 25 Sep 2026).
//   ?t=<staff token>            one stylist's own page, what the monthly email links to
//   ?admin=<admin token>        team grid for Tara / Emma / Kate
//   ?t=..&admin=..              a stylist's page opened from the team grid, with notes editable
//   &m=YYYY-MM                  month (defaults to this month)
// Every number comes from Supabase (see migrations/create_performance.sql). The
// anon key here can't read any perf_ table, only call the token-checked functions.

const SUPA_URL = 'https://gvijxenafoowajqktqvd.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2aWp4ZW5hZm9vd2FqcWt0cXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTA1OTksImV4cCI6MjA5MTI4NjU5OX0.GL3YXupXOBGfN4FCyelbQWraUw12VJNJu-wUB3zR7Zw';

// The live address a stylist's own link points at, whatever this page was opened from.
// The employment-model brochures (GHL page); ?b= picks one. Flex has an Abu Dhabi
// and a Dubai version, chosen by the stylist's branch.
const BROCHURE = 'https://promo.tararosesalon.com/employment-models?b=';
// A review's branch → that branch's Google Maps listing, where its reviews can
// be read in full. A search link, not a place ID, by Kate's choice (25 Sep 2026).
const mapsFor = branch => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Tara Rose Salon ' + branch);
const PUBLIC_PAGE = 'https://trk-salon-os.com/performance/';
const qs = new URLSearchParams(location.search);
let TOKEN = qs.get('t');
const STAFF_SLUG = qs.get('staff');   // dashboard address: ?view=staffperf&staff=andrea-gladstone
const ADMIN = qs.get('admin');
// sid: a person opened from the team grid by staff id. The dashboard's built-in
// viewer key never gets staff tokens (those open payslips), so its links use
// this instead; leader keys still link by token.
let SID = qs.get('sid');
let ROLE = null;   // 'leader' | 'viewer', from the server
const canEdit = () => !!ADMIN && !!TOKEN && ROLE !== 'viewer';
// embed=1: framed inside the dashboard's Staff Performance view. No brand bar,
// transparent background, and the page tells the dashboard how tall it is.
const EMBED = qs.get('embed') === '1';
let DEPT = ['Hair', 'Beauty'].includes(qs.get('dept')) ? qs.get('dept') : 'all';
const keep = EMBED ? '&embed=1' : '';
// Team grid sort, remembered per browser.
let SORT = 'branch', SORT_REV = false;
// Sales chart: 'week' or 'day', remembered per browser.
let CHART_MODE = 'week';
try { if (localStorage.getItem('perf-chart') === 'day') CHART_MODE = 'day'; } catch (e) {}
try { const v = JSON.parse(localStorage.getItem('perf-sort') || 'null'); if (v) { SORT = v.k; SORT_REV = !!v.rev; } } catch (e) {}
function postHeight() {
  if (EMBED) parent.postMessage({ type: 'perf-height', h: Math.ceil(document.body.getBoundingClientRect().height) + 8 }, '*');
}
if (EMBED) {
  document.body.classList.add('embed');
  window.perfResize = new ResizeObserver(postHeight);   // held globally so it isn't collected
  window.perfResize.observe(document.body);
  addEventListener('load', postHeight);
  addEventListener('message', e => {
    // The dashboard's sticky Hair / Beauty bar.
    if (e.data && e.data.type === 'perf-dept') {
      DEPT = ['Hair', 'Beauty'].includes(e.data.dept) ? e.data.dept : 'all';
      // On someone's page, the bar takes you back to the team grid, filtered.
      if (TOKEN || SID) { location.search = `?admin=${encodeURIComponent(ADMIN)}&m=${MONTH}${keep}&dept=${DEPT}`; return; }
      renderTeam();
    }
    // The dashboard's sort, in the same bar.
    if (e.data && e.data.type === 'perf-sort') {
      SORT = e.data.k; SORT_REV = !!e.data.rev;
      if (!TOKEN) renderTeam();
      return;
    }
    // The dashboard's month picker, in the same bar.
    if (e.data && e.data.type === 'perf-month' && /^\d{4}-\d{2}$/.test(e.data.m)) {
      qs.set('m', e.data.m); location.search = qs.toString(); return;
    }
    if (e.data && e.data.type === 'trs-theme') { document.documentElement.dataset.theme = e.data.theme === 'dark' ? 'dark' : 'light'; if (typeof perfPaintTheme === 'function') perfPaintTheme(); }
  });
}
const app = document.getElementById('app');
const slugOf = name => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Tell the dashboard which person is open, so its address carries the slug.
const tellParent = slug => { if (EMBED) parent.postMessage({ type: 'perf-nav', staff: slug || null }, '*'); };

// kpi key → how to show it. sum: adds up over the month, so mid-month it is
// judged on pace. untracked: no data source yet. unscored: shown, not counted.
const KPIS = [
  { k: 'total_revenue',   label: 'Total revenue',          fmt: 'aed', sum: true },
  { k: 'hair_services',   label: 'Hair services',          fmt: 'aed', sum: true },
  { k: 'treatments',      label: 'Treatments',             fmt: 'aed', sum: true },
  { k: 'treatments_pct',  label: 'Treatments %',           fmt: 'pct' },
  { k: 'retail',          label: 'Retail',                 fmt: 'aed', sum: true },
  { k: 'retail_pct',      label: 'Retail %',               fmt: 'pct' },
  { k: 'avg_bill',        label: 'Average bill',           fmt: 'aed' },
  { k: 'rebooking_pct',   label: 'Rebooking %',            fmt: 'pct' },
  { k: 'retention_pct',   label: 'Retention %',            fmt: 'pct' },
  { k: 'clients',         label: 'Client numbers',         fmt: 'num', sum: true },
  { k: 'ncr',             label: 'New client requests',    fmt: 'num', sum: true },
  { k: 'request_pct',     label: 'Request rate %',         fmt: 'pct' },
  { k: 'conversion_pct',  label: 'Conversion %',           fmt: 'pct' },
  { k: 'column_fill_pct', label: 'Column fill %',          fmt: 'pct' },
  { k: 'colour_pct',      label: 'Colour %',               fmt: 'pct' },
  { k: 'reputation',      label: 'Reputation score',       fmt: 'rep', unscored: 'Formula being finalised with Tara' },
  { k: 'google_reviews',  label: 'Google reviews',         fmt: 'num', sum: true },
  { k: 'social_feed',     label: 'Social posts (feed)',    fmt: 'num', untracked: true },
  { k: 'social_workdays', label: 'Social posts (workdays)', fmt: 'num', untracked: true },
];
const KPI = Object.fromEntries(KPIS.map(x => [x.k, x]));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
function fmt(v, f) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (f === 'aed') return 'AED ' + nf.format(v);
  if (f === 'pct') return (Math.round(v * 10) / 10) + '%';
  if (f === 'rep') return (Math.round(v * 10) / 10) + '/5';
  return nf.format(v);
}
const dayLabel = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–';
// Staff photo from staff-profiles.js (the same cutouts Staff Cards uses), matched
// on the person's ledger names. Shown at its own shape, never cropped to a circle.
function photoFor(keys) {
  if (typeof STAFF_PROFILES === 'undefined') return null;
  for (const k of keys || []) {
    const p = STAFF_PROFILES[String(k).toUpperCase()];
    if (p && p.photoFull) return '../' + encodeURI(p.photoFull);
    if (p && p.photo) return '../assets/staff/' + encodeURIComponent(p.photo);
  }
  return null;
}
const monthLabel = m => new Date(m + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

async function rpc(fn, args) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

// ── month picker ─────────────────────────────────────────────────────────
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const MONTH = /^\d{4}-\d{2}$/.test(qs.get('m') || '') ? qs.get('m') : thisMonth;
(function buildMonths() {
  const sel = document.getElementById('monthSel');
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    sel.add(new Option(d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), v, false, v === MONTH));
  }
  sel.onchange = () => { qs.set('m', sel.value); location.search = qs.toString(); };
  pillMenu(sel);
})();

// The dashboard's soft pill menu over a hidden <select> (a port of spfDD in index.html):
// the select keeps the value and fires its own change event.
function pillMenu(sel) {
  const wrap = sel.parentNode;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pdd-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
  const menu = document.createElement('div');
  menu.className = 'pdd-menu'; menu.setAttribute('role', 'listbox');
  wrap.append(btn, menu);
  const close = () => { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  const cur = sel.options[sel.selectedIndex];
  btn.innerHTML = esc(cur ? cur.text : '') + '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  [...sel.options].forEach(o => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = o.text; b.setAttribute('role', 'option');
    if (o.value === sel.value) { b.className = 'on'; b.setAttribute('aria-selected', 'true'); }
    b.onclick = () => { close(); if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change')); } };
    menu.append(b);
  });
  btn.onclick = e => {
    e.stopPropagation();
    const open = !wrap.classList.contains('open');
    wrap.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open));
    if (open) (menu.querySelector('.on') || menu.firstChild).focus();
  };
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); btn.focus(); } });
}

// ── scoring ──────────────────────────────────────────────────────────────
// Share of the month the data covers, so a sum KPI on 12 Sep is judged on pace.
function paceFactor(d) {
  const m1 = new Date(d.month + 'T00:00:00');
  const days = new Date(m1.getFullYear(), m1.getMonth() + 1, 0).getDate();
  const last = d.numbers.last_date ? new Date(d.numbers.last_date + 'T00:00:00') : null;
  if (!last || last.getMonth() !== m1.getMonth()) return 1;
  return Math.min(1, last.getDate() / days);
}
function judged(k, n, pace) {
  const v = n[k];
  if (v === null || v === undefined) return null;
  return KPI[k]?.sum && pace < 1 ? v / pace : v;
}
function paceNote(k, n, pace) {
  if (!KPI[k]?.sum || pace >= 1 || n[k] === null || n[k] === undefined) return '';
  return `On pace for ${fmt(n[k] / pace, KPI[k].fmt)}`;
}
// good = at or above target, warn = at or above minimum (or within 15% of the
// target when the PDF sets no minimum), bad = below that.
function status(v, b) {
  if (v === null || v === undefined || !b || b.target === null || b.target === undefined) return '';
  if (v >= b.target) return 'good';
  const floor = b.min !== null && b.min !== undefined ? b.min : b.target * 0.85;
  return v >= floor ? 'warn' : 'bad';
}
// ── stylist page ─────────────────────────────────────────────────────────
function tile(k, label, d, pace, extra = '') {
  const b = d.benchmarks?.[k];
  const st = status(judged(k, d.numbers, pace), b);
  const f = KPI[k].fmt;
  const aim = b ? (b.min !== null && b.min !== undefined && b.min !== b.target
    ? `Minimum ${fmt(b.min, f)} · aim ${fmt(b.target, f)}` : `Aim ${fmt(b.target, f)}`) : '';
  return `<div class="tile ${st}"><div class="lbl"><span class="dot"></span>${esc(label)}</div>
    <div class="val">${fmt(d.numbers[k], f)}</div><div class="aim">${esc(aim)}${paceNote(k, d.numbers, pace) ? '<br>' + esc(paceNote(k, d.numbers, pace)) : ''}${extra}</div></div>`;
}

function lever(d) {
  const n = d.numbers, b = d.benchmarks || {};
  const retailPct = b.retail_pct?.target ?? 12;
  const treatPct = b.treatments_pct?.target ?? 20;
  const opts = [];
  if (n.total_revenue > 0) opts.push({ aed: retailPct / 100 * n.total_revenue - n.retail,
    txt: `Bringing retail up to ${retailPct}% of your services` });
  if (d.staff.dept === 'Hair' && n.hair_services > 0) opts.push({ aed: treatPct / 100 * n.hair_services - n.treatments,
    txt: `Adding treatments until they reach ${treatPct}% of your hair services` });
  if (n.clients > 0 && n.avg_bill) opts.push({ aed: 0.05 * n.clients * n.avg_bill,
    txt: `Rebooking 5% more of your clients before they leave` });
  if (b.avg_bill && n.avg_bill && n.avg_bill < b.avg_bill.target) opts.push({ aed: (b.avg_bill.target - n.avg_bill) * n.clients,
    txt: `Lifting your average bill to AED ${nf.format(b.avg_bill.target)}` });
  const best = opts.filter(o => o.aed > 50).sort((a, c) => c.aed - a.aed)[0];
  if (!best) return `<p class="lever">Nothing standing out right now. You're hitting the aims set for your level.</p>`;
  return `<p class="lever">${esc(best.txt)} is worth about <strong>AED ${nf.format(best.aed)}</strong> more in sales this month.</p>`;
}

function kpiRows(n, bm, pace, keys) {
  return keys.filter(k => bm?.[k]).map(k => {
    const x = KPI[k], b = bm[k];
    if (x.untracked) return `<div class="row untracked"><span>${esc(x.label)}</span><span class="r-val"><small>Not tracked yet · aim ${fmt(b.target, x.fmt)}</small></span></div>`;
    const st = x.unscored ? '' : status(judged(k, n, pace), b);
    const pn = paceNote(k, n, pace);
    const tail = x.unscored ? `<small>${esc(x.unscored)}</small>` : `<small>/ ${fmt(b.target, x.fmt)}${pn ? ' · ' + esc(pn.toLowerCase()) : ''}</small>`;
    return `<div class="row"><span>${esc(x.label)}</span><span class="r-val">${fmt(n[k], x.fmt)} ${tail}<span class="dot ${st}"></span></span></div>`;
  }).join('');
}

function scoreLine(n, bm, pace) {
  const keys = KPIS.filter(x => !x.untracked && !x.unscored && bm?.[x.k] && n[x.k] !== null && n[x.k] !== undefined).map(x => x.k);
  const hit = keys.filter(k => judged(k, n, pace) >= bm[k].target).length;
  return { hit, of: keys.length };
}

async function renderStylist() {
  const d = TOKEN
    ? await rpc('perf_dashboard', { p_token: TOKEN, p_month: MONTH + '-01' })
    : await rpc('perf_dashboard_by_id', { p_admin: ADMIN, p_staff_id: SID, p_month: MONTH + '-01' });
  if (!d) { app.innerHTML = `<p class="err">This link isn't active. Ask your salon manager for a new one.</p>`; return; }
  if (d.role) ROLE = d.role; else if (ADMIN && TOKEN && !ROLE) ROLE = 'leader';
  const n = d.numbers, s = d.staff, pace = paceFactor(d);
  const isHair = s.dept === 'Hair';
  const midMonth = pace < 1;
  document.title = `${s.name} · My Numbers`;
  tellParent(slugOf(s.name));

  const six = [
    tile('avg_bill', isHair ? 'Average bill' : 'Beauty average bill', d, pace,
      `<br>With retail: ${fmt(n.avg_bill_retail, 'aed')}`),
    isHair ? tile('treatments_pct', 'Treatment %', d, pace) : tile('request_pct', 'Request rate', d, pace),
    tile('retail_pct', 'Retail %', d, pace),
    tile('rebooking_pct', 'Rebooking %', d, pace),
    tile('clients', 'Total clients', d, pace),
    tile('column_fill_pct', 'Column fill', d, pace, `<br>${fmt(n.booked_hours, 'num')} of ${fmt(n.available_hours, 'num')} hours booked`),
  ].join('');

  const pct = v => n.clients > 0 ? ` · ${Math.round(100 * v / n.clients)}%` : '';
  const clientTiles = [['Request', n.req], ['Salon', n.salon], ['New', n.new_clients], ['New client request', n.ncr]]
    .map(([l, v]) => `<div class="tile"><div class="lbl">${esc(l)}</div><div class="val">${fmt(v, 'num')}</div><div class="aim">${fmt(v, 'num')} of ${fmt(n.clients, 'num')}${pct(v)}</div></div>`).join('');

  const allKeys = KPIS.map(x => x.k);
  const own = d.benchmarks ? scoreLine(n, d.benchmarks, pace) : null;
  const next = d.next_benchmarks ? scoreLine(n, d.next_benchmarks, pace) : null;

  const weeks = d.weeks.filter(w => w.numbers.total_revenue > 0 || w.numbers.clients > 0);
  // Daily: every day from the 1st to the last day with any sales or clients, days off
  // left in as zeros so the gaps show.
  const allDays = d.days || [];
  let lastDay = -1;
  allDays.forEach((x, i) => { if (x.total_revenue > 0 || x.clients > 0) lastDay = i; });
  const days = allDays.slice(0, lastDay + 1);
  const hist = (d.history || []).map(h => `<tr><td>${esc(monthLabel(h.month))}</td><td>${fmt(h.numbers.total_revenue, 'aed')}</td><td>${fmt(h.numbers.clients, 'num')}</td><td>${fmt(h.numbers.rebooking_pct, 'pct')}</td><td>${fmt(h.numbers.avg_bill, 'aed')}</td></tr>`).join('');

  const cw = n.conversion_weeks || {};
  const notes = (d.notes || []).map(x => `<div class="note">${esc(x.note)}<div class="by">${esc(x.author)} · ${new Date(x.at).toLocaleDateString('en-GB')}${canEdit() ? `<button data-del="${x.id}">remove</button>` : ''}</div></div>`).join('');

  app.innerHTML = `
    ${ADMIN ? `<div class="admin-bar"><a class="back" href="?admin=${encodeURIComponent(ADMIN)}&m=${MONTH}${keep}&dept=${DEPT}">← Your team</a>
      ${canEdit() ? `<button class="btn small" id="copyLink">Copy ${esc(s.name.split(' ')[0])}'s link</button>` : ''}</div>` : ''}
    <section class="card hero">
      ${photoFor(s.keys) ? `<img class="hero-photo" src="${photoFor(s.keys)}" alt="" onerror="this.remove()">` : ''}
      <h1>${esc(s.name)}</h1>
      <div class="level">${esc(s.level || (isHair ? 'Hair team' : 'Beauty team'))} · ${esc(s.branch)} · ${esc(monthLabel(d.month))}</div>
      <div class="intro">Your month in pictures: the quickest way to earn more, and where you are against the next step up. One page with your own numbers and your leader's notes, nothing about anyone else.</div>
    </section>

    <section class="card">
      <div class="eyebrow">${midMonth ? 'This month so far' : 'Your month'}</div>
      <h2>The six numbers.</h2>
      ${midMonth ? `<p class="sub">Money numbers are judged on pace for the full month, with data up to ${esc(dayLabel(n.last_date))}.</p>` : ''}
      <div class="grid three">${six}</div>
      <p class="legend">${d.benchmarks ? 'Green means at or above your aim, amber means close, red means under.' : 'Benchmarks for the beauty team are still being set, so these show your numbers only.'}</p>
    </section>

    <section class="card">
      <div class="eyebrow">The quickest way to earn more</div>
      ${lever(d)}
    </section>

    <section class="card">
      <h2>Your client numbers</h2>
      <p class="sub">Who sat in your chair this month.</p>
      <div class="grid">${clientTiles}</div>
    </section>

    ${weeks.length ? `<section class="card"><div class="card-head"><h2 id="wkTitle">${CHART_MODE === 'day' ? 'Day by day' : 'Week by week'}</h2>${days.length ? `<div class="dept-seg chart-seg" id="wkSeg"><button type="button" data-m="day"${CHART_MODE === 'day' ? ' class="on"' : ''}>Daily</button><button type="button" data-m="week"${CHART_MODE === 'week' ? ' class="on"' : ''}>Weekly</button></div>` : ''}</div><p class="sub">Sales (bars) and clients (line).</p><div class="chart-wrap"><canvas id="wk"></canvas></div></section>` : ''}

    ${d.benchmarks ? `<section class="card">
      <div class="eyebrow">Your level · ${esc(s.level)}</div>
      <h2>Holding your level</h2>
      <p class="score">You're at or above target on <strong>${own.hit} of ${own.of}</strong>.</p>
      <div class="rows">${kpiRows(n, d.benchmarks, pace, allKeys)}</div>
    </section>` : ''}

    ${d.next_benchmarks ? `<section class="card">
      <div class="eyebrow">Ready for ${esc(d.next_level)}?</div>
      <h2>Your next step up</h2>
      <p class="score">These are the aims for ${esc(d.next_level)}. You're there on <strong>${next.hit} of ${next.of}</strong>.</p>
      <div class="rows">${kpiRows(n, d.next_benchmarks, pace, allKeys)}</div>
    </section>` : ''}

    <section class="card">
      <div class="eyebrow">Your Google reviews</div>
      ${(n.review_list || []).length ? `<p class="sub">${n.google_reviews} this month${n.review_stars ? ` · average ${n.review_stars} stars` : ''}.</p>
        ${n.review_list.map(r => `<div class="note"><span class="stars">${'★'.repeat(r.stars || 0)}</span> ${r.comment ? esc(r.comment) : '<i class="muted">Rating only, no written comment</i>'}<div class="by">${esc(dayLabel(r.date))}${r.how === 'client' ? ' · from your client, who didn\'t name anyone' : ''}${r.branch ? ` · <a class="rv-link" href="${mapsFor(r.branch)}" target="_blank" rel="noopener">Read on Google ↗</a>` : ''}</div></div>`).join('')}`
        : `<p class="muted">No Google reviews for you yet this month. Ask happy clients to mention you by name.</p>`}
    </section>

    <section class="card">
      <div class="eyebrow">Notes from Tara and Emma</div>
      ${notes || `<p class="muted">No notes yet for this month. They appear here once a leader has written them.</p>`}
      ${canEdit() ? `<textarea id="noteText" placeholder="Write a note for ${esc(s.name)}…"></textarea><button class="btn" id="noteSave">Add note</button>` : ''}
    </section>

    <section class="card">
      <div class="eyebrow">New clients and returning clients</div>
      <p class="sub">The ${fmt(n.conversion_n, 'num')} new clients whose first visit was with you 3 to 6 months ago, and when they came back.</p>
      <div class="rows">
        <div class="row"><span>Back within 4 weeks</span><span class="r-val">${fmt(cw.w4, 'num')}</span></div>
        <div class="row"><span>5 to 6 weeks</span><span class="r-val">${fmt(cw.w6, 'num')}</span></div>
        <div class="row"><span>7 to 8 weeks</span><span class="r-val">${fmt(cw.w8, 'num')}</span></div>
        <div class="row"><span>9 to 12 weeks</span><span class="r-val">${fmt(cw.w12, 'num')}</span></div>
        <div class="row"><span>Not back yet</span><span class="r-val">${fmt(cw.not_yet, 'num')}</span></div>
      </div>
      <p class="legend">Conversion ${fmt(n.conversion_pct, 'pct')} of ${fmt(n.conversion_n, 'num')} new clients · Retention ${fmt(n.retention_pct, 'pct')} of ${fmt(n.retention_n, 'num')} regulars. Client history runs to ${esc(dayLabel(n.asof))}.</p>
    </section>

    ${hist ? `<section class="card"><h2>The last three months</h2>
      <table class="hist"><tr><th>Month</th><th>Revenue</th><th>Clients</th><th>Rebook</th><th>Avg bill</th></tr>${hist}</table></section>` : ''}

    <section class="card">
      <div class="eyebrow">Payslip · ${esc(monthLabel(d.month))}</div>
      <div id="payslipBox">${TOKEN ? '<p class="muted">Checking for your payslip…</p>' : `<p class="muted">Payslips are private. Only ${esc(s.name.split(' ')[0])} can open hers, from her own link.</p>`}</div>
    </section>
    ${isHair ? `
    <section class="card">
      <div class="eyebrow">Your three paths at Tara Rose</div>
      <div class="paths">
        <div class="path"><b>The Employed Stylist</b>Commission on your quota with a guaranteed income while you build. Tara Rose brings the clients, colour, visa and health cover.<a class="path-link" href="${BROCHURE}employed" target="_blank" rel="noopener">Read the brochure →</a></div>
        <div class="path"><b>The Flex Stylist</b>A higher commission split and more say over your schedule, with the full Tara Rose support behind you.<a class="path-link" href="${BROCHURE}${/^(SAA|KCA)$|saadiyat|khalifa/i.test(s.branch || '') ? 'flex-abudhabi' : 'flex-dubai'}" target="_blank" rel="noopener">Read the brochure →</a></div>
        <div class="path"><b>Rent-a-Chair</b>Pay a monthly chair fee and keep your own clients and bookings.<a class="path-link" href="${BROCHURE}chair" target="_blank" rel="noopener">Read the brochure →</a></div>
      </div>
      <p class="legend"><a href="${BROCHURE}overview" target="_blank" rel="noopener">See all three paths side by side</a>. If you need more details, ask Tara or your manager about each path.</p>
    </section>` : ''}`;

  if (TOKEN) loadPayslip();
  document.getElementById('foot').textContent =
    `Reviews to ${dayLabel(d.data_through.reviews)} · sales to ${dayLabel(d.data_through.revenue)} · clients to ${dayLabel(d.data_through.clients)} · column fill to ${dayLabel(d.data_through.column_fill)} · client history to ${dayLabel(d.data_through.client_history)}. Revenue is ex VAT.`;

  let wkChart = null;
  const drawChart = () => {
    const css = getComputedStyle(document.documentElement);
    const daily = CHART_MODE === 'day' && days.length;
    const rows = daily
      ? days.map(x => ({ label: new Date(x.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), sales: x.total_revenue, clients: x.clients }))
      : weeks.map(w => ({ label: new Date(w.week_start + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sales: w.numbers.total_revenue, clients: w.numbers.clients }));
    if (wkChart) wkChart.destroy();
    wkChart = new Chart(document.getElementById('wk'), {
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          // Lower order draws on top, so the line sits over the bars instead of vanishing behind them.
          { type: 'bar', order: 2, label: 'Sales (AED)', data: rows.map(r => r.sales), backgroundColor: '#C4B5FD', yAxisID: 'y', borderRadius: daily ? 3 : 6, maxBarThickness: 120 },
          { type: 'line', order: 1, label: 'Clients', data: rows.map(r => r.clients), borderColor: '#0F6E56', borderWidth: daily ? 2 : 2.5, backgroundColor: '#0F6E56',
            pointRadius: daily ? 3 : 5, pointHoverRadius: daily ? 5 : 7, pointBackgroundColor: '#fff', pointBorderColor: '#0F6E56', pointBorderWidth: 2, yAxisID: 'y1', tension: 0 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: css.getPropertyValue('--muted'), usePointStyle: true, pointStyle: 'circle', boxHeight: 8 } } },
        scales: {
          // Both axes start at zero with headroom, so a short week doesn't look like a cliff and the tallest bar doesn't hit the ceiling.
          y: { beginAtZero: true, grace: '10%', ticks: { color: css.getPropertyValue('--muted') }, grid: { color: css.getPropertyValue('--border') } },
          y1: { position: 'right', beginAtZero: true, grace: '10%', ticks: { color: css.getPropertyValue('--muted'), precision: 0 }, grid: { display: false } },
          x: { ticks: { color: css.getPropertyValue('--muted'), autoSkip: true, maxRotation: 0 }, grid: { display: false } },
        },
      },
    });
  };
  if (weeks.length && window.Chart) {
    drawChart();
    const seg = document.getElementById('wkSeg');
    if (seg) seg.onclick = (e) => {
      const b = e.target.closest('button[data-m]');
      if (!b || b.dataset.m === CHART_MODE) return;
      CHART_MODE = b.dataset.m;
      try { localStorage.setItem('perf-chart', CHART_MODE); } catch (err) {}
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      document.getElementById('wkTitle').textContent = CHART_MODE === 'day' ? 'Day by day' : 'Week by week';
      drawChart();
    };
  }

  if (canEdit()) {
    // Their own link: no admin key, no month, so it always opens on the current month.
    document.getElementById('copyLink').onclick = async (e) => {
      const link = PUBLIC_PAGE + '?t=' + TOKEN;
      try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copied'; }
      catch (err) { prompt('Copy this link:', link); }
    };
    document.getElementById('noteSave').onclick = async () => {
      const t = document.getElementById('noteText').value;
      if (!t.trim()) return;
      await rpc('perf_add_note', { p_admin: ADMIN, p_token: TOKEN, p_month: MONTH + '-01', p_note: t });
      renderStylist();
    };
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Remove this note?')) return;
      await rpc('perf_delete_note', { p_admin: ADMIN, p_note_id: Number(b.dataset.del) });
      renderStylist();
    });
  }
}

// Her own payslip for the month, from the private bucket through the payslips
// edge function. The link it hands back is signed and lasts ten minutes, so it
// is fetched fresh on the click rather than baked into the page.
const PAYSLIP_FN = SUPA_URL + '/functions/v1/payslips';
async function payslipMine() {
  const r = await fetch(PAYSLIP_FN, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'mine', token: TOKEN, month: MONTH }),
  });
  if (!r.ok) throw new Error('payslip ' + r.status);
  return r.json();
}
async function loadPayslip() {
  const box = document.getElementById('payslipBox');
  if (!box) return;
  try {
    const p = await payslipMine();
    if (!p.exists) {
      box.innerHTML = `<p class="muted">Your payslip for this month isn't up yet. It appears here, and comes attached to your monthly email, once the accounts team has uploaded it.</p>`;
      return;
    }
    box.innerHTML = `<p>Your payslip is ready. Only you can open it.</p>
      <button class="btn" id="payslipOpen">Open your payslip (PDF)</button>`;
    document.getElementById('payslipOpen').onclick = async () => {
      const w = window.open('', '_blank');
      try { const q = await payslipMine(); if (q.url) w.location = q.url; else w.close(); }
      catch (e) { w.close(); alert("Couldn't open it just now. Try again in a minute."); }
    };
  } catch (e) {
    box.innerHTML = `<p class="muted">Couldn't check for your payslip just now.</p>`;
  }
  postHeight();
}

// ── team view ────────────────────────────────────────────────────────────
async function renderTeam() {
  const d = await rpc('perf_team', { p_admin: ADMIN, p_month: MONTH + '-01' });
  if (!d) { app.innerHTML = `<p class="err">This team link isn't valid.</p>`; return; }
  ROLE = d.role || 'leader';
  // Opened from a dashboard address with &staff=<slug>: go straight to that person.
  const hit = STAFF_SLUG && d.staff.find(s => slugOf(s.name) === STAFF_SLUG);
  if (hit) { if (hit.token) TOKEN = hit.token; else SID = hit.id; return renderStylist(); }
  tellParent(null);
  const BR = { KCA: 'Khalifa City A', SAA: 'Saadiyat', MC: 'Motor City', AQ: 'Al Quoz' };
  // The standalone page carries its own Hair / Beauty switch; in the dashboard
  // the sticky bar above the frame does it.
  const shown = d.staff.filter(s => DEPT === 'all' || s.dept === DEPT);
  const initials = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  // Branch keeps the grouped layout; any other sort is one flat grid with the
  // branch on each card. Names and branches run A–Z first, numbers high first.
  const num = v => (v === null || v === undefined || Number.isNaN(v)) ? -Infinity : v;
  // Position: the hair ladder, top first (same order as perf_benchmarks.level_order).
  // Beauty has no level set, so it sits after the ladder as one group.
  const LADDER = ['Style Director', 'Senior Stylist', 'Stylist', 'Junior Stylist', 'Blow-Dry Specialist'];
  const rankOf = s => { const i = LADDER.indexOf(s.level); return i < 0 ? -1 : LADDER.length - i; };
  const posOf = s => s.level || s.dept;
  const SORTS = {
    branch:  { label: 'Branch' },
    name:    { label: 'Name',    cmp: (a, b) => a.name.localeCompare(b.name) },
    takings: { label: 'Takings', cmp: (a, b) => num(b.numbers.total_revenue) - num(a.numbers.total_revenue) },
    clients: { label: 'Clients', cmp: (a, b) => num(b.numbers.clients) - num(a.numbers.clients) },
    rebook:  { label: 'Rebook %', cmp: (a, b) => num(b.numbers.rebooking_pct) - num(a.numbers.rebooking_pct) },
    level:   { label: 'Position', cmp: (a, b) => rankOf(b) - rankOf(a) },
  };
  if (!SORTS[SORT]) SORT = 'branch';
  const flip = SORT_REV ? -1 : 1;
  const card = s => `
        <a class="member" href="?${s.token ? 't=' + encodeURIComponent(s.token) : 'sid=' + encodeURIComponent(s.id)}&admin=${encodeURIComponent(ADMIN)}&m=${MONTH}${keep}&dept=${DEPT}&staff=${slugOf(s.name)}">
          ${photoFor(s.keys)
            ? `<img class="photo" src="${photoFor(s.keys)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;ini&quot;>${esc(initials(s.name))}</div>'">`
            : `<div class="ini">${esc(initials(s.name))}</div>`}
          <div class="nm">${esc(s.name)}</div>
          <div class="lv">${esc(s.level || s.dept)}${SORT === 'branch' ? '' : ` · ${esc(BR[s.branch] || s.branch)}`}</div>
          <div class="mini">${fmt(s.numbers.total_revenue, 'aed')} · ${fmt(s.numbers.clients, 'num')} clients<br>Rebook ${fmt(s.numbers.rebooking_pct, 'pct')}</div>
          ${s.notes ? `<div class="lv">${s.notes} note${s.notes > 1 ? 's' : ''}</div>` : ''}
          ${!s.has_email ? `<div class="flag">No email on file</div>` : (!s.send_email ? `<div class="flag">Email paused</div>` : '')}
        </a>`;
  let body;
  if (SORT === 'branch') {
    const groups = {};
    shown.forEach(s => (groups[s.branch] ||= []).push(s));
    body = Object.keys(groups).sort((a, b) => flip * (BR[a] || a).localeCompare(BR[b] || b)).map(b => `
      <div class="branch-h">${esc(BR[b] || b)}</div>
      ${['Hair', 'Beauty'].filter(dp => groups[b].some(s => s.dept === dp)).map(dp => `
      ${DEPT === 'all' ? `<div class="dept-h">${dp}</div>` : ''}
      <div class="team-grid">${groups[b].filter(s => s.dept === dp).map(card).join('')}</div>`).join('')}`).join('');
  } else if (SORT === 'level') {
    // Grouped like Branch: one heading per position, branch on each card.
    const groups = {};
    shown.forEach(s => (groups[posOf(s)] ||= []).push(s));
    body = Object.keys(groups).sort((a, b) => flip * (rankOf(groups[b][0]) - rankOf(groups[a][0]))).map(g => `
      <div class="branch-h">${esc(g)}</div>
      <div class="team-grid">${groups[g].sort((a, b) => a.name.localeCompare(b.name)).map(card).join('')}</div>`).join('');
  } else {
    const cmp = SORTS[SORT].cmp;
    body = `<div class="team-grid flat">${[...shown].sort((a, b) => flip * cmp(a, b) || a.name.localeCompare(b.name)).map(card).join('')}</div>`;
  }
  app.innerHTML = `
    <section class="card hero">
      <div class="eyebrow">Your team · ${esc(monthLabel(d.month))}</div>
      <p class="sub">Every number fills itself: sales from Phorest, client numbers counted once each from the ledgers. Tap a person to see their page${ROLE === 'viewer' ? '' : ' and leave a note'}.</p>
    </section>
    ${EMBED ? '' : `<div class="dept-seg" role="group" aria-label="Team">${['all', 'Hair', 'Beauty'].map(x =>
      `<button type="button" data-dept="${x}" class="${DEPT === x ? 'on' : ''}">${x === 'all' ? 'All' : x}</button>`).join('')}</div>`}
    ${EMBED ? '' : `<div class="sort-bar">
      <label>Sort by <select id="sortSel">${Object.entries(SORTS).map(([k, o]) =>
        `<option value="${k}"${k === SORT ? ' selected' : ''}>${o.label}</option>`).join('')}</select></label>
      <button type="button" class="sort-dir" id="sortDir" title="Reverse the order">${['branch', 'name'].includes(SORT) ? (SORT_REV ? 'Z–A' : 'A–Z') : (SORT_REV ? 'Lowest first' : 'Highest first')} ⇅</button>
    </div>`}
    ${body}`;
  app.querySelectorAll('.dept-seg [data-dept]').forEach(b => b.onclick = () => { DEPT = b.dataset.dept; renderTeam(); });
  const saveSort = () => { try { localStorage.setItem('perf-sort', JSON.stringify({ k: SORT, rev: SORT_REV })); } catch (e) {} renderTeam(); };
  if (!EMBED) {
    document.getElementById('sortSel').onchange = e => { SORT = e.target.value; SORT_REV = false; saveSort(); };
    document.getElementById('sortDir').onclick = () => { SORT_REV = !SORT_REV; saveSort(); };
  }
}

(async () => {
  try {
    if (TOKEN || (SID && ADMIN)) await renderStylist();
    else if (ADMIN) await renderTeam();
    else app.innerHTML = `<p class="err">Open this page from the link in your performance email.</p>`;
    requestAnimationFrame(postHeight);
    setTimeout(postHeight, 300);   // rAF and ResizeObserver pause in a hidden tab; timers still run
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="err">Couldn't load the numbers just now. Try again in a minute.</p>`;
  }
})();
