// Organisation Pulse downloads (Kate, 10 Nov 2026: every report gets an XLSX and a CSV button). Loaded on the first click, with report-export.js (group px).
// renderDashboard() leaves what the page was drawn from in window._pulseExport (the window's summary, the previous period's, the scored targets, the branch columns
// and the client funnel's counts), so this file only lays it out; nothing is fetched and nothing is worked out a second way.
//   Headline  the headline figures for the period and the one before it, with the change (this tab is the CSV)
//   Targets   every scored benchmark: the combined figure, hair and beauty, the target, the share of it reached, hit or below
//   Branches  the Branch Performance card: net take, visits and average bill for each branch, with its share of the group
//   Funnel    the Client Funnel's counts, ledger and Phorest, hair and beauty
// Branch and Period are the masthead's, so the file is the page as it stands.
function pulseExportModel() {
  const X = window._pulseExport;
  if (!X || !X.s) return null;
  const s = X.s, p = X.prevS || null;
  const nz = v => (v == null || !Number.isFinite(+v)) ? null : Math.round(+v * 100) / 100;
  const door = typeof doorOn === 'function' && doorOn(s);
  const reqRate = x => {
    const bd = b => b ? { ask: (b.req || 0) + (b.ncr || 0), all: (b.req || 0) + (b.salon || 0) + (b.new || 0) + (b.ncr || 0) } : { ask: 0, all: 0 };
    const h = bd(x.hairBreakdown), b = bd(x.beautyBreakdown);
    return (h.all + b.all) > 0 && !x._phorestOnly ? (h.ask + b.ask) / (h.all + b.all) * 100 : null;
  };
  // [group, name, how it reads, kind, getter]; kind aed | n | avg | pct
  const M = [
    ['Revenue', 'Net take', '', 'aed', x => x.netTake], ['Revenue', 'Hair revenue', 'incl. treatments and courses', 'aed', x => x.hairServicesIncl], ['Revenue', 'Hair treatments', '', 'aed', x => x.treatmentSales],
    ['Revenue', 'Beauty services', '', 'aed', x => x.beautyServicesTotal], ['Revenue', 'Retail', '', 'aed', x => x.retailTotal], ['Revenue', 'Hair retail', '', 'aed', x => x.hairRetailOnly], ['Revenue', 'Beauty retail', '', 'aed', x => x.beautyRetailOnly],
    ['Clients', 'Clients', door ? 'through the door (Phorest)' : 'per staff (ledgers)', 'n', x => (typeof clientsOf === 'function' ? clientsOf(x) : x.totalClients)],
    ['Clients', 'Handled by staff', 'ledgers, per staff', 'n', x => x.totalClients], ['Clients', 'Hair clients', 'per staff (ledgers)', 'n', x => x.hairTotalClients], ['Clients', 'Beauty clients', 'per staff (ledgers)', 'n', x => x.beautyTotalClients],
    ['Clients', 'Request clients', 'per staff (ledgers)', 'n', x => x.requestClientTotal], ['Clients', 'Salon clients', 'per staff (ledgers)', 'n', x => x.salonClientTotal],
    ['Clients', 'New clients', 'per staff (ledgers)', 'n', x => x.newClientsTotal], ['Clients', 'Rebooked', 'per staff (ledgers)', 'n', x => x.totalRebooked],
    ['Averages', 'Average bill', door ? 'per client through the door' : 'per staff count', 'avg', x => (typeof avgBillOf === 'function' ? avgBillOf(x) : x.avgBill)],
    ['Averages', 'Hair average bill', 'per staff count', 'avg', x => x.hairAvgBill], ['Averages', 'Beauty average bill', 'per staff count', 'avg', x => (x.beautyTotalClients ? x.beautyAvgBill : null)],
    ['Benchmarks', 'NCR', 'hair + beauty, per staff', 'n', x => (typeof ncrCountOf === 'function' ? ncrCountOf(x) : null)],
    ['Benchmarks', 'Rebooking %', 'per staff (ledgers)', 'pct', x => x.rebookPct], ['Benchmarks', 'Request rate', 'asked for her stylist, per staff', 'pct', reqRate],
    ['Benchmarks', 'Treatment %', 'of hair revenue', 'pct', x => (x._phorestOnly || !x.hairServicesIncl) ? null : (x.treatmentSales || 0) / x.hairServicesIncl * 100],
    ['Benchmarks', 'Retail %', 'of services', 'pct', x => { const svc = (x.netTake || 0) - (x.retailTotal || 0); return svc ? (x.retailTotal || 0) / svc * 100 : null; }],
    ['Benchmarks', 'Utilisation %', 'hair and beauty teams, target 85', 'pct', x => x.utilPct], ['Benchmarks', 'Hair utilisation %', '', 'pct', x => x.hairUtilPct], ['Benchmarks', 'Beauty utilisation %', '', 'pct', x => x.beautyUtilPct],
  ];
  const fmt = k => k === 'pct' ? 'pct' : k === 'n' ? 'num' : 'aed';
  const hrows = [];
  M.forEach(([g, name, how, k, get]) => {
    const a = nz(get(s)), b = p ? nz(get(p)) : null;
    if (a == null && b == null) return;
    const pts = k === 'pct';
    hrows.push({ cells: [g, name, how, { v: a, fmt: fmt(k) }, { v: b, fmt: fmt(k) },
      { v: (a != null && b != null) ? nz(a - b) : null, fmt: pts ? 'pts' : fmt(k), f: A => `IF(AND(ISNUMBER(${A('now')}),ISNUMBER(${A('prev')})),${A('now')}-${A('prev')},"")` },
      pts ? null : { v: (a != null && b != null && b) ? nz((a - b) / Math.abs(b) * 100) : null, fmt: 'pct', f: A => `IF(AND(ISNUMBER(${A('now')}),ISNUMBER(${A('prev')})),IF(${A('prev')}<>0,(${A('now')}-${A('prev')})/ABS(${A('prev')})*100,""),"")` }] });
  });
  if (!hrows.length) return null;
  const sheets = [{ name: 'Headline', title: 'Organisation Pulse, ' + X.branchLabel,
    subtitle: `${X.rangeLabel}${p ? ' against ' + X.prevLabel : ''}. Money is AED, ex VAT, takings before staff cost. Rates change in points.`,
    blocks: [{ cols: [{ key: 'g', label: 'Group', fmt: 'text' }, { key: 'name', label: 'Measure', fmt: 'text' }, { key: 'how', label: 'Detail', fmt: 'text' },
      { key: 'now', label: 'This period', fmt: 'num' }, { key: 'prev', label: p ? 'Previous period' : 'Previous period (none)', fmt: 'num' }, { key: 'd', label: 'Change', fmt: 'num' }, { key: 'pc', label: 'Change %', fmt: 'pct' }], rows: hrows }],
    legend: [['Clients', door ? 'Each client once a day, through the door (Phorest Sales Transactions); the per staff counts are the ledgers’, where a client seen by two staff counts for each.' : 'Per staff, from the ledgers; this window has no through-the-door count.'],
      ['Previous period', X.prevLabel ? 'The window of the same length straight before this one, worked out the same way.' : 'No earlier window to set this against.']] }];

  const bench = (X.bench || []);
  if (bench.length) sheets.push({ name: 'Targets', title: 'Targets, scored',
    subtitle: `${X.rangeLabel} · ${bench.filter(r => r.met).length} of ${bench.filter(r => !r.why).length} hit`,
    blocks: [{ cols: [{ label: 'Measure', fmt: 'text' }, { label: 'Target', fmt: 'text' }, { label: 'Combined', fmt: 'num' }, { label: 'Hair', fmt: 'num' }, { label: 'Beauty', fmt: 'num' }, { label: 'Share of target', fmt: 'pct' }, { label: 'Result', fmt: 'text' }, { label: 'Short', fmt: 'text' }],
      rows: bench.map(r => ({ cells: [r.name, String(r.sub || '').replace(/^target\s*/i, ''), nz(r.combined), nz(r.hair), nz(r.beauty), r.why ? null : nz((r.att || 0) * 100), r.why ? 'Not scored: ' + r.why : (r.met ? 'Hit' : 'Below target'),
        (r.short || []).map(x => x.dept).join(' and ')] })) }],
    legend: [['Share of target', 'The combined figure over its target. Utilisation is a band (85 to 100 is on target), so past 100 the share falls again.'], ['Short', 'A department under its own bar makes the row a miss even when the combined figure is above it.']] });

  const br = X.brCols || [];
  if (br.length) {
    const tot = br.reduce((a, b) => a + b.rev, 0);
    sheets.push({ name: 'Branches', title: 'Branch Performance', subtitle: `${X.rangeLabel} · net revenue by branch, ${X.brDoor ? 'visits through the door (Phorest)' : 'visits per staff (ledgers)'}`,
      blocks: [{ cols: [{ key: 'b', label: 'Branch', fmt: 'text' }, { key: 'net', label: 'Net take', fmt: 'aed' }, { key: 'share', label: 'Share of the group', fmt: 'pct' }, { key: 'vis', label: X.brDoor ? 'Visits through the door' : 'Visits per staff', fmt: 'num' }, { key: 'avg', label: 'Average bill', fmt: 'aed' }],
        rows: br.map(b => ({ cells: [b.name, nz(b.rev), { v: tot ? nz(b.rev / tot * 100) : null, fmt: 'pct', f: A => { const r = A.col('net', 'first', 'last'); return r ? `IF(SUM(${r})>0,${A('net')}/SUM(${r})*100,"")` : null; } }, nz(b.visits), { v: b.visits ? nz(b.rev / b.visits) : null, fmt: 'aed', f: A => `IF(N(${A('vis')})>0,${A('net')}/${A('vis')},"")` }] })) }] });
    const rws = sheets[sheets.length - 1].blocks[0].rows; rws[0].key = 'first'; rws[rws.length - 1].key = 'last';
  }

  const F = X.fn;
  if (F && F.ledger) {
    const side = (src, name, o) => o ? ['hair', 'beauty'].filter(t => t === 'hair' || X.hasBeauty).map(t => ({ cells: [name, t === 'hair' ? 'Hair' : 'Beauty', nz(o[t].t), nz(o[t].req), nz(o[t].salon), nz(o[t].nw), nz(o[t].ncr), nz(o[t].reb), nz(o[t].svc)] })) : [];
    const fr = side('l', 'Ledger (per staff)', F.ledger).concat(side('p', 'Phorest', F.phorest));
    if (fr.length) sheets.push({ name: 'Funnel', title: 'Client Funnel', subtitle: `${X.rangeLabel} · the branch ledger's counts beside Phorest's. Phorest has no salon or NCR split, and its rebooked count comes from the Staff Performance Tracker.`,
      blocks: [{ cols: [{ label: 'Source', fmt: 'text' }, { label: 'Team', fmt: 'text' }, { label: 'Clients', fmt: 'num' }, { label: 'Requests', fmt: 'num' }, { label: 'Salon', fmt: 'num' }, { label: 'New clients', fmt: 'num' }, { label: 'NCR', fmt: 'num' }, { label: 'Rebooked', fmt: 'num' }, { label: 'Phorest services (AED)', fmt: 'aed' }], rows: fr }] });
  }
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { name: ['organisation-pulse', slug(X.branchLabel), X.fromIso, X.fromIso ? 'to' : '', X.toIso].filter(Boolean).join('-'), csv: 0, sheets };
}
