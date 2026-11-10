// Marketing downloads (Kate, 10 Nov 2026: every report gets an XLSX and a CSV button). One file for the six Marketing pages, loaded with the group after
// report-export.js. Each page draws rexButtons('<prefix>Export') (the four with a Period row get it from mkPeriodRow in marketing-chart.js; Marketing Spend and
// Tool Spend put theirs in their intro) and each export reads the data the page was last drawn from, so nothing is fetched and nothing is worked out a second way.
// The CSV is the first tab in every case. Money is AED as the page shows it.
const mkxQ = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? null : Math.round(Number(v) * 100) / 100;
const mkxSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const mkxDay = s => String(s || '').slice(0, 10);
// Cost per click and the like: a formula in the sheet where the two columns are there.
const mkxDiv = (num, den, times) => A => `IF(N(${A(den)})>0,${times ? times + '*' : ''}${A(num)}/${A(den)},"")`;

// ── Google Ads ─────────────────────────────────────────────────────────────────
function gadsExport() {
  const d = typeof gadsData !== 'undefined' ? gadsData : null;
  if (!d || !d.days || !d.days.length) return null;
  const w = d.win;
  const dayRows = d.days.map(r => ({ cells: [r.date, mkxQ(r.cost), Number(r.clicks) || 0, Number(r.impressions) || 0, Number(r.conversions) || 0,
    { v: Number(r.clicks) ? mkxQ(r.cost / r.clicks) : null, fmt: 'aed2', f: mkxDiv('cost', 'clicks') },
    { v: Number(r.impressions) ? mkxQ(100 * r.clicks / r.impressions) : null, fmt: 'pct', f: mkxDiv('clicks', 'impr', 100) }] }));
  const camp = (d.campaigns || []).map(c => ({ cells: [c.campaign_name, GADS_AREA[c.area] || c.area, c.channel === 'PERFORMANCE_MAX' ? 'Performance Max' : 'Search',
    c.status === 'PAUSED' ? 'Paused' : c.status === 'ENABLED' ? 'Running' : String(c.status || ''), mkxQ(c.cost), Number(c.clicks) || 0, Number(c.impressions) || 0, Number(c.conversions) || 0,
    { v: Number(c.clicks) ? mkxQ(c.cost / c.clicks) : null, fmt: 'aed2', f: mkxDiv('cost', 'clicks') }] }));
  const area = {}; (d.campaigns || []).forEach(c => { const a = area[c.area] = area[c.area] || { cost: 0, clicks: 0, conv: 0 }; a.cost += Number(c.cost) || 0; a.clicks += Number(c.clicks) || 0; a.conv += Number(c.conversions) || 0; });
  const sub = `${w.from} to ${w.to} · Tara Rose Salon ad account · up to yesterday. Conversions are Google's own count, not bookings.`;
  const sheets = [{ name: 'By day', title: 'Google Ads, day by day', subtitle: sub,
    blocks: [{ cols: [{ key: 'date', label: 'Date', fmt: 'text' }, { key: 'cost', label: 'Spend (AED)', fmt: 'aed2' }, { key: 'clicks', label: 'Clicks', fmt: 'num' }, { key: 'impr', label: 'Impressions', fmt: 'num' },
      { key: 'conv', label: 'Conversions (Google’s count)', fmt: 'num' }, { key: 'cpc', label: 'Cost per click (AED)', fmt: 'aed2' }, { key: 'ctr', label: 'Click rate', fmt: 'pct' }], rows: dayRows }],
    legend: [['Days', 'Every day in the window, with zeros where nothing ran, so a day the ads stopped shows as a gap.'], ['Conversions', 'Whatever Google Ads counts as a conversion for this account. Some campaigns show more conversions than clicks, so they are not bookings.']] }];
  if (camp.length) sheets.push({ name: 'By campaign', title: 'Google Ads, by campaign', subtitle: sub,
    blocks: [{ cols: [{ key: 'n', label: 'Campaign', fmt: 'text' }, { key: 'a', label: 'Salon or area', fmt: 'text' }, { key: 'ty', label: 'Type', fmt: 'text' }, { key: 's', label: 'Status', fmt: 'text' }, { key: 'cost', label: 'Spend (AED)', fmt: 'aed2' },
      { key: 'clicks', label: 'Clicks', fmt: 'num' }, { key: 'impr', label: 'Impressions', fmt: 'num' }, { key: 'conv', label: 'Conversions (Google’s count)', fmt: 'num' }, { key: 'cpc', label: 'Cost per click (AED)', fmt: 'aed2' }], rows: camp }] });
  const ar = Object.keys(area);
  if (ar.length) sheets.push({ name: 'By salon', title: 'Google Ads, by salon', subtitle: sub + ' “Abu Dhabi, all” and “Dubai, all” are the brand and hair services campaigns, which advertise every salon in that city.',
    blocks: [{ cols: [{ key: 'a', label: 'Salon or area', fmt: 'text' }, { key: 'cost', label: 'Spend (AED)', fmt: 'aed2' }, { key: 'clicks', label: 'Clicks', fmt: 'num' }, { key: 'cpc', label: 'Cost per click (AED)', fmt: 'aed2' }, { key: 'conv', label: 'Conversions (Google’s count)', fmt: 'num' }],
      rows: ['SAA', 'KCA', 'MC', 'AQ', 'AUH', 'DXB', 'BH', 'OTHER'].filter(k => area[k]).map(k => ({ cells: [GADS_AREA[k], mkxQ(area[k].cost), area[k].clicks,
        { v: area[k].clicks ? mkxQ(area[k].cost / area[k].clicks) : null, fmt: 'aed2', f: mkxDiv('cost', 'clicks') }, area[k].conv] })) }] });
  return { name: ['google-ads', w.from, 'to', w.to].join('-'), csv: 0, sheets };
}

// ── Meta Ads ───────────────────────────────────────────────────────────────────
function madsExport() {
  const d = typeof madsData !== 'undefined' ? madsData : null;
  if (!d || !d.days || !d.days.length) return null;
  const w = d.win, fm = d.first_metric_day;
  const dayRows = d.days.map(r => { const m = fm && r.date >= fm;
    return { cells: [r.date, mkxQ(r.cost), m ? Number(r.clicks) || 0 : null, m ? Number(r.impressions) || 0 : null, m ? Number(r.reach) || 0 : null,
      { v: m && Number(r.clicks) ? mkxQ(r.cost / r.clicks) : null, fmt: 'aed2', f: mkxDiv('cost', 'clicks') }] }; });
  const camp = (d.campaigns || []).map(c => ({ cells: [c.campaign_name, c.status === 'PAUSED' ? 'Paused' : c.status === 'ACTIVE' ? 'Running' : String(c.status || ''), mkxDay(c.first_day), mkxDay(c.last_day),
    mkxQ(c.cost), Number(c.clicks) || 0, { v: Number(c.clicks) ? mkxQ(c.cost / c.clicks) : null, fmt: 'aed2', f: mkxDiv('cost', 'clicks') }, c.results ? Number(c.results) : null, c.results ? madsLabel(c.results_label) : ''] }));
  const by = {};
  d.days.forEach(r => { const k = r.date.slice(0, 7), m = by[k] = by[k] || { cost: 0, clicks: 0, costM: 0, hasM: false }; m.cost += Number(r.cost) || 0;
    if (fm && r.date >= fm) { m.clicks += Number(r.clicks) || 0; m.costM += Number(r.cost) || 0; m.hasM = true; } });
  const sub = `${w.from} to ${w.to} · Tara Rose Salon ad account · up to yesterday.${fm ? ` Clicks and views exist from ${fm}; a blank before that is not zero.` : ''} Results are Meta's own count for what each campaign was set to get, not bookings.`;
  const sheets = [{ name: 'By day', title: 'Meta Ads, day by day', subtitle: sub,
    blocks: [{ cols: [{ key: 'date', label: 'Date', fmt: 'text' }, { key: 'cost', label: 'Spend (AED)', fmt: 'aed2' }, { key: 'clicks', label: 'Clicks', fmt: 'num' }, { key: 'impr', label: 'Impressions', fmt: 'num' }, { key: 'reach', label: 'Reach', fmt: 'num' }, { key: 'cpc', label: 'Cost per click (AED)', fmt: 'aed2' }], rows: dayRows }],
    legend: [['Spend', 'In AED as Meta bills it. Before August 2026 it comes from Meta’s own payment invoices, spread over the days each campaign ran.']] }];
  if (camp.length) sheets.push({ name: 'By campaign', title: 'Meta Ads, by campaign', subtitle: sub,
    blocks: [{ cols: [{ key: 'n', label: 'Campaign', fmt: 'text' }, { key: 's', label: 'Status', fmt: 'text' }, { key: 'f', label: 'First day', fmt: 'text' }, { key: 'l', label: 'Last day', fmt: 'text' }, { key: 'cost', label: 'Spend (AED)', fmt: 'aed2' },
      { key: 'clicks', label: 'Clicks', fmt: 'num' }, { key: 'cpc', label: 'Cost per click (AED)', fmt: 'aed2' }, { key: 'res', label: 'Results (Meta’s count)', fmt: 'num' }, { key: 'rl', label: 'What a result is', fmt: 'text' }], rows: camp }] });
  sheets.push({ name: 'By month', title: 'Meta Ads, month by month', subtitle: sub,
    blocks: [{ cols: [{ key: 'm', label: 'Month', fmt: 'text' }, { key: 'cost', label: 'Spend (AED)', fmt: 'aed2' }, { key: 'clicks', label: 'Clicks', fmt: 'num' }, { key: 'cpc', label: 'Cost per click (AED)', fmt: 'aed2' }],
      rows: Object.keys(by).sort().map(k => ({ cells: [k, mkxQ(by[k].cost), by[k].hasM ? by[k].clicks : null, { v: by[k].hasM && by[k].clicks ? mkxQ(by[k].costM / by[k].clicks) : null, fmt: 'aed2' }] })) }] });
  return { name: ['meta-ads', w.from, 'to', w.to].join('-'), csv: 0, sheets };
}

// ── Website & Search ───────────────────────────────────────────────────────────
function webExport() {
  const d = typeof webData !== 'undefined' ? webData : null;
  if (!d || !d.days) return null;
  const w = d.win, sub = `${w.from} to ${w.to} · tararosesalon.com, Google Analytics (UAE and Bahrain pages together) and Search Console (2 to 3 days behind).`;
  const sheets = [{ name: 'Visits by day', title: 'Website visits, day by day', subtitle: sub,
    blocks: [{ cols: [{ key: 'date', label: 'Date', fmt: 'text' }, { key: 's', label: 'Visits', fmt: 'num' }, { key: 'u', label: 'Visitors (counted each day)', fmt: 'num' }, { key: 'n', label: 'New visitors', fmt: 'num' }, { key: 'e', label: 'Stayed to look', fmt: 'num' },
      { key: 'p', label: 'Stayed to look %', fmt: 'pct' }], rows: d.days.map(r => ({ cells: [r.date, Number(r.sessions) || 0, Number(r.users) || 0, Number(r.new_users) || 0, Number(r.engaged_sessions) || 0,
        { v: Number(r.sessions) ? mkxQ(100 * r.engaged_sessions / r.sessions) : null, fmt: 'pct', f: mkxDiv('e', 's', 100) }] })) }],
    legend: [['Stayed to look', 'Google’s engaged visit: 10 seconds or more, two pages or more, or a key event.'], ['Visitors', 'Counted each day: a woman who visits on three different days counts three times.']] }];
  const ch = d.channels || [], tot = ch.reduce((a, c) => a + (Number(c.sessions) || 0), 0);
  if (ch.length) sheets.push({ name: 'By source', title: 'Where visits came from', subtitle: sub,
    blocks: [{ cols: [{ key: 'c', label: 'Source', fmt: 'text' }, { key: 'g', label: 'GA4 channel', fmt: 'text' }, { key: 's', label: 'Visits', fmt: 'num' }, { key: 'sh', label: 'Share of visits', fmt: 'pct' }, { key: 'e', label: 'Stayed to look', fmt: 'num' }, { key: 'p', label: 'Stayed to look %', fmt: 'pct' }],
      rows: ch.map(c => ({ cells: [WEB_CHANNEL[c.channel] || c.channel, c.channel, Number(c.sessions) || 0, tot ? mkxQ(100 * c.sessions / tot) : null, Number(c.engaged_sessions) || 0,
        { v: Number(c.sessions) ? mkxQ(100 * c.engaged_sessions / c.sessions) : null, fmt: 'pct', f: mkxDiv('e', 's', 100) }] })) }] });
  const pg = d.pages || [];
  if (pg.length) sheets.push({ name: 'Top pages', title: 'What they looked at', subtitle: sub,
    blocks: [{ cols: [{ label: 'Rank', fmt: 'num' }, { label: 'Page', fmt: 'text' }, { label: 'Market', fmt: 'text' }, { label: 'Address', fmt: 'text' }, { label: 'Views', fmt: 'num' }],
      rows: pg.map((p, i) => { const x = webPage(p.page); return { cells: [i + 1, x.name, x.where, p.page, Number(p.views) || 0] }; }) }] });
  if ((d.search_days || []).length) sheets.push({ name: 'Google search by day', title: 'How people find us on Google, day by day', subtitle: sub + ` Search numbers run up to ${d.search_last_day || w.to}.`,
    blocks: [{ cols: [{ key: 'date', label: 'Date', fmt: 'text' }, { key: 'c', label: 'Clicks', fmt: 'num' }, { key: 'i', label: 'Times we showed up', fmt: 'num' }, { key: 'r', label: 'Click rate', fmt: 'pct' }, { key: 'pos', label: 'Average place (1 is the top)', fmt: 'aed2' }],
      rows: d.search_days.map(r => ({ cells: [r.date, Number(r.clicks) || 0, Number(r.impressions) || 0, { v: Number(r.impressions) ? mkxQ(100 * r.clicks / r.impressions) : null, fmt: 'pct', f: mkxDiv('c', 'i', 100) }, r.position == null ? null : mkxQ(r.position)] })) }] });
  if ((d.queries || []).length) sheets.push({ name: 'Searches', title: 'What people searched', subtitle: sub + ' Search Console leaves out searches Google keeps private, so these add up to less than the clicks.',
    blocks: [{ cols: [{ label: 'Search', fmt: 'text' }, { label: 'Clicks', fmt: 'num' }, { label: 'Times we showed up', fmt: 'num' }, { label: 'Average place', fmt: 'aed2' }],
      rows: d.queries.map(q => ({ cells: [q.query, Number(q.clicks) || 0, Number(q.impressions) || 0, q.position == null ? null : mkxQ(q.position)] })) }] });
  return { name: ['website-and-search', w.from, 'to', w.to].join('-'), csv: 0, sheets };
}

// ── Social ─────────────────────────────────────────────────────────────────────
function socExport() {
  const d = typeof socData !== 'undefined' ? socData : null;
  if (!d || !d.win) return null;
  const w = d.win, net = k => SOC_NETS[k] || k, sub = `${w.from} to ${w.to} · from Metricool, updated nightly. The apps report a day or two late, so the last days can be thin.`;
  const sheets = [];
  const days = (d.days || []).slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.network + a.metric < b.network + b.metric ? -1 : 1));
  if (days.length) sheets.push({ name: 'Daily numbers', title: 'Social, day by day', subtitle: sub + ' One row for each platform, metric and day Metricool kept.',
    blocks: [{ cols: [{ label: 'Date', fmt: 'text' }, { label: 'Platform', fmt: 'text' }, { label: 'Account', fmt: 'text' }, { label: 'Metric', fmt: 'text' }, { label: 'Value', fmt: 'num' }],
      rows: days.map(r => ({ cells: [r.date, net(r.network), r.subject, r.metric, Number(r.value)] })) }] });
  const posts = (d.posts || []).slice().sort((a, b) => String(b.post_date || b.posted_at || '') < String(a.post_date || a.posted_at || '') ? -1 : 1);
  if (posts.length) sheets.push({ name: 'Posts', title: 'Everything posted in these dates', subtitle: sub + ' A post’s numbers keep growing for a few weeks and are re-read every night.',
    blocks: [{ cols: [{ label: 'Posted', fmt: 'text' }, { label: 'Platform', fmt: 'text' }, { label: 'Kind', fmt: 'text' }, { label: 'Caption', fmt: 'text' }, { label: 'Views', fmt: 'num' }, { label: 'Reach', fmt: 'num' },
      { label: 'Likes, comments, shares', fmt: 'num' }, { label: 'Saves', fmt: 'num' }, { label: 'Link', fmt: 'text' }],
      rows: posts.map(p => ({ cells: [mkxDay(p.post_date || p.posted_at), net(p.network), (typeof SOC_KIND !== 'undefined' && SOC_KIND[p.kind]) || p.kind, String(p.caption || '').trim(), Number(p.views) || 0, Number(p.reach) || 0, Number(p.interactions) || 0, Number(p.saves) || 0, p.url || ''] })) }] });
  const fl = Object.entries(d.followers || {});
  if (fl.length) sheets.push({ name: 'Followers', title: 'Followers by platform', subtitle: sub,
    blocks: [{ cols: [{ key: 'p', label: 'Platform', fmt: 'text' }, { key: 's', label: 'At the start', fmt: 'num' }, { key: 'e', label: 'At the end', fmt: 'num' }, { key: 'c', label: 'Change', fmt: 'num' }],
      rows: fl.map(([k, x]) => ({ cells: [net(k), x.start == null ? null : Number(x.start), x.end == null ? null : Number(x.end),
        { v: x.start != null && x.end != null ? Number(x.end) - Number(x.start) : null, fmt: 'num', f: A => `IF(AND(ISNUMBER(${A('s')}),ISNUMBER(${A('e')})),${A('e')}-${A('s')},"")` }] })) }] });
  const web = d.web || {};
  if ((web.channels || []).length) sheets.push({ name: 'To the website', title: 'From social to the website', subtitle: sub + ' Visits to tararosesalon.com by source, from Google Analytics; all visits for the window are ' + (Number(web.total) || 0) + '.',
    blocks: [{ cols: [{ label: 'Source', fmt: 'text' }, { label: 'Visits', fmt: 'num' }, { label: 'Stayed to look', fmt: 'num' }], rows: web.channels.map(c => ({ cells: [c.channel, Number(c.sessions) || 0, Number(c.engaged) || 0] })) }] });
  if (!sheets.length) return null;
  return { name: ['social', w.from, 'to', w.to].join('-'), csv: 0, sheets };
}

// ── Marketing Spend ────────────────────────────────────────────────────────────
function mspendExport() {
  if (typeof mspendData === 'undefined' || !mspendData) return null;
  const rows = mspendRows();
  if (!rows.length) return null;
  const hasOther = rows.some(r => r.other > 0), w = mspendWindow();
  const mrows = rows.map(r => ({ cells: [r.mo.slice(0, 7), mkxQ(r.google), mkxQ(r.meta), r.agency == null ? null : mkxQ(r.agency), hasOther ? mkxQ(r.other) : null, mkxQ(r.by.ads), mkxQ(r.by.agency), mkxQ(r.by.all),
    r.nc, r.priced ? mkxQ(mspendCacOf(r, 'ads')) : null, r.priced ? mkxQ(mspendCacOf(r, 'agency')) : null, r.priced ? mkxQ(mspendCacOf(r, 'all')) : null,
    r.priced ? 'Yes' : (!r.metaFull ? 'No: Meta not through the month' : r.agency == null ? 'No: agency not invoiced yet' : 'No: no new clients counted'), r.partial ? 'Month in progress' : ''] }));
  const cols = [{ key: 'm', label: 'Month', fmt: 'text' }, { key: 'g', label: 'Google ads (AED)', fmt: 'aed' }, { key: 'me', label: 'Meta ads (AED)', fmt: 'aed' }, { key: 'ag', label: 'Agency (AED)', fmt: 'aed' }, { key: 'ot', label: 'Tools: respond.io and GoHighLevel (AED)', fmt: 'aed' },
    { key: 'sa', label: 'Spend, ads only (AED)', fmt: 'aed' }, { key: 'sg', label: 'Spend, ads and the agency (AED)', fmt: 'aed' }, { key: 'sl', label: 'Spend, everything we can measure (AED)', fmt: 'aed' }, { key: 'nc', label: 'New clients', fmt: 'num' },
    { key: 'ca', label: 'CAC, ads only (AED)', fmt: 'aed' }, { key: 'cg', label: 'CAC, ads and the agency (AED)', fmt: 'aed' }, { key: 'cl', label: 'CAC, everything (AED)', fmt: 'aed' }, { key: 'pr', label: 'CAC counted', fmt: 'text' }, { key: 'pa', label: 'Note', fmt: 'text' }];
  // The answer, for each definition of cost, over the months that can be priced.
  const priced = rows.filter(r => r.priced), pNew = priced.reduce((a, r) => a + r.nc, 0), ltv = mspendData.ltv || {}, year1 = Number(ltv.avg_net_12m) || null, mg = mspendMargin();
  const ltgp = year1 && mg ? year1 * mg.margin : null;
  const ans = MSPEND_DEFS.map(df => { const spend = priced.reduce((a, r) => a + r.by[df.k], 0), cac = pNew ? spend / pNew : null;
    return { cells: [df.label, df.sub, mkxQ(spend), pNew, cac == null ? null : mkxQ(cac), ltgp == null ? null : mkxQ(ltgp), cac && ltgp ? mkxQ(ltgp / cac) : null] }; });
  const sub = `${w ? w.from + ' to ' + w.to : 'All time'} · the months the masthead's Period touches.`;
  const sheets = [{ name: 'By month', title: 'Marketing Spend, month by month', subtitle: sub + ' CAC is what winning a new client costs; a month shows a dash until Meta runs through it, the agency’s invoice is in and the clients are counted.',
    blocks: [{ cols, rows: mrows }],
    legend: [['CAC', 'Spend divided by the new clients of the months that have everything in. It divides by every new client, including those who came without an ad.'], ['Tools', 'respond.io (plan and WhatsApp top ups) and GoHighLevel (plan, add-ons and wallet recharges).'],
      ['Not in it', 'Content, influencers, commissions and staff time.']] },
    { name: 'The answer', title: 'CAC and LTGP', subtitle: sub + ` Months with a CAC: ${priced.length}. LTGP is the first-year revenue of a new client times the gross margin of the months that have every cost in; the target is LTGP : CAC of ${MSPEND_TARGET} to 1.`,
      blocks: [{ cols: [{ label: 'What counts as cost', fmt: 'text' }, { label: 'What it adds', fmt: 'text' }, { label: 'Spend in those months (AED)', fmt: 'aed' }, { label: 'New clients', fmt: 'num' }, { label: 'CAC (AED)', fmt: 'aed' }, { label: 'LTGP (AED)', fmt: 'aed' }, { label: 'LTGP ÷ CAC', fmt: 'aed2' }], rows: ans }] }];
  return { name: ['marketing-spend', w ? w.from : 'all-time', w ? 'to' : '', w ? w.to : ''].filter(Boolean).join('-'), csv: 0, sheets };
}

// ── Tool Spend ─────────────────────────────────────────────────────────────────
function tsExport() {
  if (typeof tsData === 'undefined' || !tsData || !tsData.lines) return null;
  const w = tsWindow(), tools = Object.keys(TS_TOOLS);
  const monthRows = [];
  tools.forEach(k => tsMonths(k, w).forEach(m => monthRows.push({ k, m })));
  const T = k => TS_TOOLS[k].name;
  const mrows = monthRows.sort((a, b) => a.m.mo < b.m.mo ? -1 : a.m.mo > b.m.mo ? 1 : tools.indexOf(a.k) - tools.indexOf(b.k))
    .map(({ k, m }) => ({ cells: [m.mo.slice(0, 7), T(k), mkxQ(m.aed), TS_TOOLS[k].cur, mkxQ(m.u), mkxQ(m.overdue)] }));
  if (!mrows.length) return null;
  const lines = tsData.lines.filter(l => tsInView(l.mo, w)).slice().sort((a, b) => String(a.d || a.mo) < String(b.d || b.mo) ? -1 : 1);
  const sub = `${w ? w.from + ' to ' + w.to : 'All time'} · the months the masthead's Period touches. Only paid, invoiced and overdue lines are added up.`;
  const sheets = [{ name: 'By month', title: 'Tool Spend, month by month', subtitle: sub,
    blocks: [{ cols: [{ key: 'm', label: 'Month', fmt: 'text' }, { key: 't', label: 'Tool', fmt: 'text' }, { key: 'a', label: 'Total (AED)', fmt: 'aed' }, { key: 'c', label: 'Tool’s own currency', fmt: 'text' }, { key: 'u', label: 'Total (own currency)', fmt: 'aed2' }, { key: 'o', label: 'Overdue (own currency)', fmt: 'aed2' }], rows: mrows }],
    legend: [['Counted', 'GoHighLevel and respond.io are what was paid. Phorest is what it invoiced, not what the card was charged. Usage drawn from a respond.io balance, unknown months, memos and notes are shown on the Lines tab but never counted.'], ['Euro column', 'A line Phorest billed in AED is shown in euros at ' + TS_EUR_AED + '.']] }];
  sheets.push({ name: 'Lines', title: 'Every payment, invoice and statement line', subtitle: sub,
    blocks: [{ cols: [{ label: 'Month', fmt: 'text' }, { label: 'Date', fmt: 'text' }, { label: 'Tool', fmt: 'text' }, { label: 'Kind', fmt: 'text' }, { label: 'Category', fmt: 'text' }, { label: 'Item', fmt: 'text' }, { label: 'Branch', fmt: 'text' },
      { label: 'AED', fmt: 'aed2' }, { label: 'Own currency', fmt: 'text' }, { label: 'Amount (own currency)', fmt: 'aed2' }, { label: 'Counted in the totals', fmt: 'text' }],
      rows: lines.map(l => ({ cells: [String(l.mo).slice(0, 7), mkxDay(l.d), TS_TOOLS[l.t] ? T(l.t) : l.t, l.k || '', l.c || '', l.i || '', l.b || '', mkxQ(l.a), l.cur || '', mkxQ(tsU(l)), (l.n && TS_SUM_KINDS.has(l.k)) ? 'Yes' : 'No'] })) }] });
  return { name: ['tool-spend', w ? w.from : 'all-time', w ? 'to' : '', w ? w.to : ''].filter(Boolean).join('-'), csv: 0, sheets };
}
