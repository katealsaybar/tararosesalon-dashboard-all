// Staff Dashboards downloads (Kate, 10 Nov 2026: every report gets an XLSX and a CSV button). The page is an iframe (performance/index.html, performance.js),
// so the two buttons live in the dashboard's own bar (index.html, #spfBar) and this file, loaded on the first click with report-export.js (group rx),
// reads what the frame has on screen through performance.js's perfSnapshot() (no second fetch, no redraw), and hands report-export.js a model.
//   Team grid      one sheet: everyone for the month and team picked, every figure of her My Numbers page, one column each.
//   One person     her month against her level (the minimum and aim as the page scores it, a status for each), then the weeks, the days and the past months.
// The CSV is the first sheet. Nothing here is private that the page does not already show the person who has it open.
const SDX_FMT = f => f === 'aed' ? 'aed' : f === 'pct' ? 'pct' : f === 'rep' ? 'aed2' : 'num';
const SDX_BR = { KCA: 'Khalifa City A', SAA: 'Saadiyat', MC: 'Motor City', AQ: 'Al Quoz' };
const sdxQ = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? null : Math.round(Number(v) * 100) / 100;
const sdxSlug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sdxMonth = d => String((d && d.month) || '').slice(0, 7);

function spfExportModel() {
  const fr = document.getElementById('spfFrame'), w = fr && fr.contentWindow;
  let snap = null;
  try { snap = w && typeof w.perfSnapshot === 'function' ? w.perfSnapshot() : null; } catch (e) { snap = null; }
  if (!snap || !snap.d) return null;
  return snap.view === 'team' ? sdxTeam(snap) : sdxStylist(snap);
}

function sdxTeam(snap) {
  const d = snap.d, K = snap.kpis, dept = snap.dept;
  const people = (d.staff || []).filter(s => dept === 'all' || s.dept === dept)
    .sort((a, b) => (SDX_BR[a.branch] || a.branch).localeCompare(SDX_BR[b.branch] || b.branch) || String(a.dept).localeCompare(String(b.dept)) || a.name.localeCompare(b.name));
  if (!people.length) return null;
  const cols = [{ label: 'Name', fmt: 'text' }, { label: 'Team', fmt: 'text' }, { label: 'Branch', fmt: 'text' }, { label: 'Position', fmt: 'text' }];
  K.forEach(k => cols.push({ label: k.k === 'rebooking_pct' ? 'Rebooking % (branch sheet)' : k.label, fmt: SDX_FMT(k.fmt) }));
  cols.push({ label: 'Rebooking % (Phorest)', fmt: 'pct' }, { label: 'Rebooked', fmt: 'num' }, { label: 'Requests', fmt: 'num' }, { label: 'Salon clients', fmt: 'num' }, { label: 'New clients', fmt: 'num' },
    { label: 'Hours booked', fmt: 'aed2' }, { label: 'Hours available', fmt: 'aed2' }, { label: 'Notes', fmt: 'num' });
  const rows = people.map(s => {
    const n = s.numbers || {}, b = snap.rb(n);
    return { cells: [s.name, s.dept, SDX_BR[s.branch] || s.branch, s.level || s.dept]
      .concat(K.map(k => sdxQ(n[k.k])), [sdxQ(b.ph), sdxQ(n.rebooked), sdxQ(n.req), sdxQ(n.salon), sdxQ(n.new_clients), sdxQ(n.booked_hours), sdxQ(n.available_hours), s.notes || 0]) };
  });
  const m = sdxMonth(d);
  return { name: ['staff-dashboards', m, dept === 'all' ? '' : dept.toLowerCase()].filter(Boolean).join('-'),
    sheets: [{ name: 'Team ' + m, title: 'Staff Dashboards, the team in ' + snap.monthLabel(d.month),
      subtitle: `${dept === 'all' ? 'Hair and beauty' : dept} · ${people.length} ${people.length === 1 ? 'person' : 'people'}. Sales are services before VAT, retail not included. Amounts in AED.`,
      blocks: [{ cols, rows }],
      legend: [['Client numbers', 'Per staff, from the branch ledgers: a client who saw two people counts for each.'],
        ['Rebooking %', 'Branch sheet: rebooked over the ledger’s clients. Phorest: rebooked over the Staff Performance Tracker’s visits, blank where the tracker has none for her (it starts 1 Jul 2026).'],
        ['Blank cell', 'A figure she has none of in the month, or one that needs more data (Reputation needs 3 Google reviews in 90 days).'],
        ['Notes', 'How many notes a leader has written on her page.']] }] };
}

function sdxStylist(snap) {
  const d = snap.d, K = snap.kpis, s = d.staff || {}, n = d.numbers || {}, bm = d.benchmarks || {}, nx = d.next_benchmarks || {}, rb = snap.rb;
  const m = sdxMonth(d), nxLevel = d.next_level || '';
  const status = (v, b) => {
    if (v === null || v === undefined || !b || b.target === null || b.target === undefined) return '';
    if (v >= b.target) return 'At aim';
    const floor = b.min !== null && b.min !== undefined ? b.min : b.target * 0.85;
    return v >= floor ? 'Close to aim' : 'Below';
  };
  const rows = [];
  K.forEach(k => {
    const v = sdxQ(n[k.k]), b = bm[k.k], nb = nx[k.k], f = SDX_FMT(k.fmt);
    if (v === null && !b) return;
    rows.push({ cells: [k.label, { v, fmt: f }, { v: b ? sdxQ(b.min) : null, fmt: f }, { v: b ? sdxQ(b.target) : null, fmt: f }, status(n[k.k], b), { v: nb ? sdxQ(nb.target) : null, fmt: f }] });
  });
  const r = rb(snap.rawNumbers || n);
  rows.push({ cells: ['Rebooking % (Phorest)', { v: sdxQ(r.ph), fmt: 'pct' }, null, null, '', null] },
    { cells: ['Rebooking % (branch sheet)', { v: sdxQ(r.led), fmt: 'pct' }, null, null, '', null] });
  const cols = [{ label: 'Measure', fmt: 'text' }, { label: 'This month', fmt: 'num' }, { label: 'Minimum', fmt: 'num' }, { label: 'Aim', fmt: 'num' }, { label: 'Status', fmt: 'text' }, { label: (nxLevel ? nxLevel + ' aim' : 'Next level aim'), fmt: 'num' }];
  const sheets = [{ name: (s.name || 'Staff') + ' ' + m, title: `${s.name || 'Staff'}, ${snap.monthLabel(d.month)}`,
    subtitle: `${s.level || s.dept || ''} · ${SDX_BR[s.branch] || s.branch || ''}. ${snap.src === 'phorest' ? 'Figures from Phorest.' : 'Figures from the branch ledger.'} Minimum and aim are cut to the days worked where the month is part-worked, as on her page.`,
    blocks: [{ cols, rows }],
    legend: [['Status', 'At aim: reached the aim. Close to aim: at or above the minimum. Below: under it. Blank: no aim set.']] }];

  // A table of the same figures for each week, each past month: a column only where something has a value.
  const table = (label, list, head) => {
    const used = K.filter(k => list.some(x => sdxQ((x.numbers || {})[k.k]) !== null));
    if (!list.length || !used.length) return null;
    return { name: label, title: label, blocks: [{ cols: [{ label: head, fmt: 'text' }].concat(used.map(k => ({ label: k.label, fmt: SDX_FMT(k.fmt) }))),
      rows: list.map(x => ({ cells: [x.__label].concat(used.map(k => sdxQ((x.numbers || {})[k.k]))) })) }] };
  };
  const wk = (d.weeks || []).map(x => Object.assign({}, x, { __label: String(x.week_start || '').slice(0, 10) }));
  const hs = (d.history || []).map(x => Object.assign({}, x, { __label: snap.monthLabel(x.month) }));
  const weeks = table('Weeks', wk, 'Week starting');
  if (weeks) sheets.push(weeks);
  const days = d.days || [];
  if (days.length) sheets.push({ name: 'Days', title: 'Day by day',
    blocks: [{ cols: [{ label: 'Date', fmt: 'text' }, { label: 'Total revenue', fmt: 'aed' }, { label: 'Clients', fmt: 'num' }],
      rows: days.map(x => ({ cells: [String(x.date).slice(0, 10), sdxQ(x.total_revenue), sdxQ(x.clients)] })) }] });
  const past = table('Past months', hs, 'Month');
  if (past) sheets.push(past);
  return { name: ['staff-dashboard', sdxSlug(s.name || 'staff'), m].join('-'), csv: 0, sheets };
}
