/* ══════════════════════════════════════════════════════════════
   DAILY PERFORMANCE: THE REPORTS BORROWED FROM BRANCH PERFORMANCE
   Kate, 15 Oct 2026. Branch Performance and Daily Performance showed the same numbers twice, so Branch Performance is being
   folded into this page. Daily keeps everything it has and takes only the reports it lacked: Revenue mix, Clients and Staff
   performance, and all three follow the Measure menu (Kate, 16 Oct 2026: that is what the menu is for; only the radar ignores it).
   A Growth card went in first (this period against the one before) and came out again on 16 Oct 2026 at Kate's
   word, so nothing here compares two periods and no earlier window is fetched.

   Loaded after daily-performance.js, which calls daMoreCards() from dpDraw. Nothing here runs on load.

   All three cards read one aggregate for the page's window (daLoadWindow): the rows the masthead's period covers, added up by
   aggDailyData, the same function Branch Performance uses, so the two pages agree to the dirham for the same dates. Clients
   are per staff, from the ledgers, like Daily's Clients measure: the through-the-door count is not on this page.
   ══════════════════════════════════════════════════════════════ */
let daData = null, daBusy = '';

function daCss() {
  if (document.getElementById('daCss')) return;
  const st = document.createElement('style'); st.id = 'daCss';
  st.textContent = `
  .dpf .da-stack{display:grid;grid-template-columns:120px 1fr auto;gap:10px;align-items:center;padding:6px 0;font-size:14px}
  .dpf .da-stack .trk{display:flex;height:24px;border-radius:6px;overflow:hidden}
  .dpf .da-stack .trk i{display:block;height:100%}
  .dpf .da-stack .v{text-align:right;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
  .dpf .da-leg{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:10px 0 4px}
  .dpf .da-leg span{display:inline-flex;align-items:center;gap:6px}
  .dpf .da-leg i{width:12px;height:12px;border-radius:3px;display:inline-block}
  .dpf .da-det{margin-top:12px}
  .dpf .da-det>summary{cursor:pointer;font-weight:600;font-size:13.5px;padding:6px 0}
  .dpf .da-br{margin:0 0 10px}
  .dpf .da-br>summary{cursor:pointer;font-weight:600;padding:6px 0}
  .dpf .da-sub2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);margin:10px 0 4px;font-weight:600}
  .dpf .da-fig{margin-top:8px}
  .dpf .da-hl{font-weight:700;color:var(--text);background:color-mix(in srgb,var(--accent) 16%,transparent);padding:2px 6px;border-radius:5px}
  .dpf .da-hlh{color:var(--text);border-bottom:2px solid var(--accent);padding-bottom:1px}
  .dpf .da-stack.da-c3{grid-template-columns:120px 1fr 170px}
  @media(max-width:760px){.dpf .da-stack,.dpf .da-stack.da-c3{grid-template-columns:1fr auto;gap:4px 10px}.dpf .da-stack>div:nth-child(1){grid-column:1;grid-row:1}.dpf .da-stack>div:nth-child(3){grid-column:2;grid-row:1}.dpf .da-stack>.trk{grid-column:1/-1;grid-row:2}}
  `;
  document.head.appendChild(st);
}

const daKey = win => dpYmd(win.from) + '|' + dpYmd(win.to);

// One fetch and one aggregate per branch for the page's window, cached against it: the branch pick changes which cards are
// drawn and not what was fetched. No trimming to the last synced day: Branch Performance reads the whole window too, and
// aggDailyData reads a day the ledger has not reached from Phorest alone.
async function daLoadWindow(win) {
  const key = daKey(win);
  if (daData && daData.key === key) return daData;
  const codes = DPD ? DPD.codes : dpCodes();
  // The page's own load already holds these rows (a long window is tens of thousands of them), so cut them from it when it covers the window.
  const f = dpYmd(win.from), t = dpYmd(win.to), inWin = r => { const d = String(r.date).slice(0, 10); return d >= f && d <= t; };
  const held = DPD && DPD.rowsB && DPD.from <= f && DPD.to >= t;
  const [rowsB, rowsP] = held ? [DPD.rowsB.filter(inWin), DPD.rowsP.filter(inWin)]
    : await Promise.all([loadBranchStaffDailyRange(win.from, win.to), loadPhorestStaffDailyRange(win.from, win.to)]);
  const byCode = {};
  let any = false;
  codes.forEach(code => {
    const bb = (rowsB || []).filter(r => r.branch === code), pp = (rowsP || []).filter(r => r.branch === code);
    const full = (bb.length || pp.length) ? aggDailyData([], bb, pp) : null;
    if (full) any = true;
    byCode[code] = { full };
  });
  // Kate, 3 Nov 2026: the rows stay with the aggregate, so a figure on these cards can open the staff behind it (daCtx).
  return (daData = any ? { key, byCode, rowsB: rowsB || [], rowsP: rowsP || [], from: f, to: t, range: `${dpDayLabel(win.from)} to ${dpDayLabel(win.to)}` } : { key, byCode, none: 'There are no ledger figures in this window yet.' });
}

// Fetch if this window is not cached or already on its way, then fill the three cards in place if the page still shows it.
function daEnsure(win) {
  const key = daKey(win);
  if ((daData && daData.key === key) || daBusy === key) return;
  daBusy = key;
  daLoadWindow(win).then(g => g, e => ({ key, byCode: {}, none: 'Could not load these figures: ' + ((e && e.message) || e) + '. Try Refresh.' })).then(g => {
    if (daBusy === key) daBusy = '';
    if (document.getElementById('daStaff') && daKey(dpWindow()) === key) daFillAll(g);
  });
}

/* ══════════════════════════════════════════════════════════════
   REVENUE MIX, CLIENTS, STAFF PERFORMANCE
   Kate, 16 Oct 2026, built from Downloads/mockup-daily-performance-remaining-addons.html. The three reports Branch
   Performance had and Daily did not. They follow the masthead's Branch and Period filters and ignore the Measure menu,
   and read one aggregate (daLoadWindow), so the page counts every figure once.

   The figures are Branch Performance's own lines, added up with the same aggDailyData. Where a line has a Daily measure,
   its target is Daily's: the daily target added up over the open days (dpCell), so it works for any window and not only
   a calendar month. Lines with no Daily measure say "no target" rather than invent one.
   ══════════════════════════════════════════════════════════════ */
const daSummary = (g, code) => (g.byCode[code] && g.byCode[code].full) ? g.byCode[code].full.summary : null;
const daSumFn = (g, codes, fn) => codes.reduce((a, c) => { const s = daSummary(g, c); return a + (s ? (Number(fn(s)) || 0) : 0); }, 0);

// Daily's own target for a measure, over the open days of the window and the branches picked: null when none is keyed.
function daTarget(mk, codes, idxs) {
  let t = 0, any = false;
  codes.forEach(code => idxs.forEach(i => { const c = dpCell(mk, code, i); if (c.state === 'ok' && c.t != null) { t += c.t; any = true; } }));
  return any ? t : null;
}

function daNone(g) { return `<p class="dp-sub">${dpEsc(g.none || 'No figures for the branches picked in this window.')}</p>`; }

/* ══════════════════════════════════════════════════════════════
   EVERY FIGURE OPENS THE ROWS BEHIND IT (Kate, 3 Nov 2026: "all clickable values")
   The three cards read one aggregate, so the lists read the same rows (daData.rowsB, rowsP) through the lists the Pulse and Comparison use (PD.spec, pulse-drill.js)
   and add up to the card's figure by construction: the context's summary IS the card's summary (one branch) or the branches' summaries added up (several). A figure that
   is a rate, or a count nobody keeps names for, opens the staff or the days behind it and says so; zero and missing figures stay plain. Level 2 opens the page but not
   the lists (the same rule as the tiles).
   ══════════════════════════════════════════════════════════════ */
const daCan = () => typeof TRSD !== 'undefined' && typeof PD !== 'undefined' && !dpL2();
const daNum = (html, sp) => (sp && daCan()) ? TRSD.num(html, sp) : html;
const daBand = sp => (sp && daCan()) ? ` data-dn="${TRSD.reg(sp)}" class="dn-cell" role="button" tabindex="0"` : '';
function daCtx(g, codes) {
  const key = codes.slice().sort().join(',');
  g._ctx = g._ctx || {};
  if (key in g._ctx) return g._ctx[key];
  const list = codes.map(c => daSummary(g, c)).filter(Boolean);
  if (!list.length) return (g._ctx[key] = null);
  let s2;
  if (list.length === 1) s2 = Object.assign({}, list[0]);
  else {
    s2 = {};
    list.forEach(s => Object.keys(s).forEach(k => { if (typeof s[k] === 'number' && isFinite(s[k])) s2[k] = (s2[k] || 0) + s[k]; }));
    Object.assign(s2, lgRollup(list));   // the rates and derived figures, worked out from the added-up parts
    if (list.some(s => s.ph)) {
      s2.ph = {};
      ['hair', 'beauty'].forEach(d => { const o = s2.ph[d] = {}; list.forEach(s => { if (s.ph && s.ph[d]) Object.keys(s.ph[d]).forEach(k => { if (typeof s.ph[d][k] === 'number') o[k] = (o[k] || 0) + s.ph[d][k]; }); }); });
    }
  }
  const L = g.rowsB.filter(r => codes.includes(r.branch)), P = g.rowsP.filter(r => codes.includes(r.branch));
  const days = Math.round((new Date(g.to) - new Date(g.from)) / 864e5) + 1;
  const who = codes.length === DPD.codes.length ? 'All branches' : codes.map(dpName).join(' + ');
  return (g._ctx[key] = PD.snapSide(s2, { rows: { ledger: L, phorest: P }, from: g.from, to: g.to, days, label: `${who}, ${g.range}`, range: g.range, codes, cur: 'AED' }));
}
const daSpecOf = (g, codes, kind, o) => { if (!daCan() || !codes.length) return null; const ctx = daCtx(g, codes); return ctx ? PD.spec(kind, ctx, o || {}) : null; };
// A Hair or Beauty line whose list the Pulse only has for both departments together: the same list cut to that department, its total brought to the card's figure.
function daDeptSpec(g, codes, kind, o, dept, want) {
  const sp = daSpecOf(g, codes, kind, o);
  if (!sp) return null;
  const side = dept === 'hair' ? 'Hair' : 'Beauty';
  sp.views.forEach(v => {
    const load = v.load;
    v.load = async function () {
      const res = await load.apply(this, arguments);
      if (!res || !res.rows || !res.cols) return res;
      const rows = res.rows.filter(r => r.dp === side), foot = Object.assign({}, res.foot || {}), sumOf = k => rows.reduce((a, r) => a + (+r[k] || 0), 0);
      res.cols.forEach(c => { if (c.k !== 'v' && (c.t === 'num' || c.t === 'aed') && Object.prototype.hasOwnProperty.call(foot, c.k)) foot[c.k] = sumOf(c.k); });
      const got = sumOf('v');
      if (want != null && Math.abs(got - want) >= 0.5) rows.push({ b: '', n: 'Not matched to a branch row', dp: '', v: want - got, _cls: 'dr-muted' });
      foot.v = want != null ? want : got;
      return Object.assign({}, res, { rows, foot, sub: (res.sub || '') + ` Only ${side.toLowerCase()} staff are listed.` });
    };
  });
  return sp;
}
// A line of a card's table against its target: one branch opens its days (against each day's target), several open a By branch list whose figures open each branch's staff
// (the Actual) or days (the Target). o = { title, key: the Daily measure the target belongs to, fn: summary to figure, t: 'aed' | 'num', actual: codes to the Actual's list }.
function daBranchSpec(g, codes, idxs, o) {
  if (!daCan() || !o.key || !DP_M[o.key]) return null;
  if (codes.length === 1) return dpSpecFor(o.key, codes[0], idxs);
  const t = o.t || 'aed';
  return { title: `${o.title} · by branch`, cur: 'AED', views: [{ id: 'br', label: 'By branch', load: async () => {
    const rows = codes.filter(c => daSummary(g, c)).map(c => {
      const a = Number(o.fn(daSummary(g, c))) || 0, tg = daTarget(o.key, [c], idxs), row = { b: dpName(c), v: a, t: tg, d: tg != null ? a - tg : null, p: tg > 0 ? a / tg * 100 : null, r: tg != null ? Math.max(tg - a, 0) : null };
      row._dn = {};
      if (a) row._dn.v = o.actual([c]);
      if (tg != null) row._dn.t = dpSpecFor(o.key, c, idxs);
      return row;
    });
    const A = rows.reduce((x, r) => x + r.v, 0), withT = rows.filter(r => r.t != null), T = withT.length ? withT.reduce((x, r) => x + r.t, 0) : null;
    return { cols: [{ k: 'b', l: 'Branch' }, { k: 'v', l: 'Actual', t }, { k: 't', l: 'Target', t }, { k: 'd', l: 'Variance', t }, { k: 'p', l: '% done', t: 'pct' }, { k: 'r', l: 'Remaining', t }], rows,
      foot: { b: 'Total', v: A, t: T, d: T != null ? A - T : null, p: T > 0 ? A / T * 100 : null, r: T != null ? Math.max(T - A, 0) : null },
      sub: `${TRSD.esc(g.range)}. The card's line branch by branch: the Actual opens the staff behind it, the Target opens that branch's days against each day's target. The target is Daily's own, each day's target added up over the days the branch was open.` };
  } }] };
}
// What each line of the Revenue mix opens (the same lists the Comparison rows and the Pulse figures open).
const DA_SPEC = { total: ['net', {}], services: ['field', { key: 'servicesTotal' }], retail: ['field', { key: 'retail' }], hair: ['field', { key: 'hairSvc' }], hairEx: ['field', { key: 'hairSvcEx' }],
  treat: ['field', { key: 'treatments' }], treatUnits: ['field', { key: 'treatUnits' }], courses: ['field', { key: 'hairCourses' }], hairRetail: ['field', { key: 'hairRetail' }],
  hairRetailUnits: ['field', { key: 'hairRetailUnitsH' }], beauty: ['field', { key: 'beautySvc' }], beautyRetail: ['field', { key: 'beautyRetail' }], beautyRetailUnits: ['field', { key: 'beautyRetailUnitsB' }] };

// ── REVENUE MIX ─────────────────────────────────────────────
// What a money measure is made of. Each of the six revenue measures in the Measure menu has its own breakdown; the others (clients,
// rates, utilisation) are not made of parts, so this card is only drawn for these six.
const DA_LINES = {
  total: [() => LG_TOTAL_LABEL, 'sales', s => lgTotalRevenue(s), 0, 1],
  services: [() => LG_SERVICES_LABEL, 'services', s => lgServicesTotal(s)],
  retail: [() => LG_RETAIL_LABEL, 'retail', s => s.retailTotal],
  hair: ['Hair revenue (incl. treatments and courses)', 'hair', s => s.hairServicesIncl],
  hairEx: ['Hair services (excl. treatments and courses)', null, s => s.hairServicesExcl],
  treat: ['Hair treatments revenue', 'treat', s => s.treatmentSales],
  treatUnits: ['# hair treatments sold', null, s => s.hairTreatmentUnits, 1],
  courses: ['Hair courses revenue (performed)', null, s => s.hairCourses],
  hairRetail: ['Hair retail revenue', null, s => s.hairRetailOnly],
  hairRetailUnits: ['# hair retail sold', null, s => s.hairRetailUnits, 1],
  beauty: ['Beauty services revenue', 'beauty', s => s.beautyServicesTotal],
  beautyRetail: ['Beauty retail revenue', null, s => s.beautyRetailOnly],
  beautyRetailUnits: ['# beauty retail sold', null, s => s.beautyRetailUnits, 1],
};
const DA_PART = {
  hairEx: ['Hair services', '#C4B5FD', s => s.hairServicesExcl], treat: ['Treatments', '#99F6E4', s => s.treatmentSales], courses: ['Hair courses', '#FDBA74', s => s.hairCourses],
  beauty: ['Beauty services', '#FFD4D9', s => s.beautyServicesTotal], retail: ['Retail', '#EEF3C7', s => s.retailTotal],
  hairRetail: ['Hair retail', '#C4B5FD', s => s.hairRetailOnly], beautyRetail: ['Beauty retail', '#FFD4D9', s => s.beautyRetailOnly],
};
const DA_MIX = {
  sales: { title: 'Revenue mix: where the money came from', why: 'What each branch\u2019s net take was made of, so you can see whether a good period was hair, beauty or retail. Hover a band for the figure.',
    parts: ['hairEx', 'treat', 'courses', 'beauty', 'retail'], lines: ['total', 'services', 'retail', 'hair', 'hairEx', 'treat', 'treatUnits', 'courses', 'hairRetail', 'hairRetailUnits', 'beauty', 'beautyRetail', 'beautyRetailUnits'] },
  services: { title: 'Services: hair against beauty', why: 'How each branch\u2019s services revenue splits between hair (treatments and courses taken out) and beauty. No retail.',
    parts: ['hairEx', 'beauty'], lines: ['services', 'hairEx', 'beauty'] },
  retail: { title: 'Retail: hair against beauty', why: 'Where each branch\u2019s retail was sold, in the hair chair or in the beauty room.',
    parts: ['hairRetail', 'beautyRetail'], lines: ['retail', 'hairRetail', 'hairRetailUnits', 'beautyRetail', 'beautyRetailUnits'] },
  hair: { title: 'Hair revenue: services, treatments and courses', why: 'What each branch\u2019s hair revenue was made of.',
    parts: ['hairEx', 'treat', 'courses'], lines: ['hair', 'hairEx', 'treat', 'treatUnits', 'courses'] },
  beauty: { title: 'Beauty services by branch', why: 'Beauty services revenue for each branch with a Beauty team.', parts: ['beauty'], lines: ['beauty'] },
  treat: { title: 'Treatments by branch', why: 'Hair treatments revenue for each branch, with the number sold.', parts: ['treat'], lines: ['treat', 'treatUnits'] },
};
const daShowsMix = () => !!DA_MIX[DP.measure];
function daMixInner(g, codes, idxs) {
  const cfg = DA_MIX[DP.measure];
  if (!cfg) return '';
  const parts = cfg.parts.map(k => DA_PART[k]);
  const tot = c => parts.reduce((a, p) => a + (Number(p[2](daSummary(g, c))) || 0), 0);
  const have = codes.filter(c => daSummary(g, c) && tot(c) > 0);
  if (g.none || !have.length) return g.none ? daNone(g) : `<p class="dp-sub">No ${dpEsc(DP_M[DP.measure].label)} figures for the branches picked in this window.</p>`;
  const totals = have.map(tot), mx = Math.max(...totals, 1);
  // Kate, 3 Nov 2026: a branch's total opens the staff behind the measure, each band the staff behind that part (the same lists as the lines under "Show the figures").
  const lineSpec = (id, cs) => DA_SPEC[id] ? daSpecOf(g, cs, DA_SPEC[id][0], DA_SPEC[id][1]) : null;
  const bars = have.map((c, k) => `<div class="da-stack"><div><span class="dot" style="background:${dpCol(c)}"></span> ${dpEsc(dpName(c))}</div>
    <div class="trk" style="width:${totals[k] / mx * 100}%">${parts.map((p, pi) => { const v = Number(p[2](daSummary(g, c))) || 0; return v > 0 ? `<i style="width:${v / (totals[k] || 1) * 100}%;background:${p[1]}" title="${dpEsc(p[0])}: ${dpMoney(v)}"${daBand(lineSpec(cfg.parts[pi], [c]))}></i>` : ''; }).join('')}</div>
    <div class="v">${daNum(dpMoney(totals[k]), lineSpec(cfg.lines[0], [c]))}</div></div>`).join('');
  const missing = codes.filter(c => daSummary(g, c) && !(tot(c) > 0));
  const leg = '<div class="da-leg">' + (parts.length > 1 ? parts.map(p => `<span><i style="background:${p[1]}"></i>${p[0]}</span>`).join('') : '')
    + (missing.length ? `<span>${missing.map(c => dpEsc(dpName(c))).join(', ')}: nothing in this measure.</span>` : '') + '</div>';
  const cols = [{ label: 'Metric' }, { label: 'Actual', align: 'r' }, { label: 'Target', align: 'r' }, { label: 'Variance', align: 'r' }, { label: '% done', align: 'r', w: '116px' }, { label: 'Remaining', align: 'r' }];
  const rows = cfg.lines.map(id => {
    const [label, key, fn, isCount, isTotal] = DA_LINES[id];
    const lab = typeof label === 'function' ? label() : label, f = isCount ? lgNum : lgAed, a = daSumFn(g, have, fn);
    const t = key ? daTarget(key, have, idxs) : null;
    // Kate, 3 Nov 2026: the Actual opens the staff behind it; the Target, the Variance, the % done and the Remaining open the branch's days against their targets (one
    // branch), or the branches side by side (several), since they are all made of the Actual and the target.
    const act = daNum(f(a), a ? lineSpec(id, have) : null);
    if (t == null || !(t > 0)) { const cells = [lab, act, '<span class="lg-na">no target</span>', '\u2014', '\u2014', '\u2014']; return isTotal ? { total: cells } : cells; }
    const br = daBranchSpec(g, have, idxs, { title: lab, key, fn, t: isCount ? 'num' : 'aed', actual: cs => lineSpec(id, cs) }), dt = h => daNum(h, br);
    const bar = lgDoneBar(a / t * 100).replace(/(<span class="lg-done-n tabular">)([^<]*)(<\/span>)/, (m, x, y, z) => x + dt(y) + z);
    const cells = [lab, act, dt(f(t)), dt(lgDelta(a - t, f)), bar, dt(f(Math.max(t - a, 0)))];
    return isTotal ? { total: cells } : cells;
  });
  return `${bars}${leg}<details class="da-det"><summary>Show the figures</summary><div class="da-fig">${lgTable(cols, rows)}</div></details>
    <div class="note dp-sub" style="margin-top:8px">The target is Daily's own: each day's target added up over the days the branch was open in this period.</div>`;
}

// ── CLIENTS ─────────────────────────────────────────────────
// Drawn for the client measures and Rebooking %, which are about who came in and who booked again.
const DA_CLIENT_MK = ['clients', 'newc', 'ncr', 'ncrp', 'rebookn', 'rebook'];
const daShowsClients = () => DA_CLIENT_MK.includes(DP.measure);
function daCliInner(g, codes, idxs) {
  const have = codes.filter(c => daSummary(g, c));
  if (g.none || !have.length) return daNone(g);
  const rows = have.map(c => { const s = daSummary(g, c); const tot = Number(s.totalClients) || 0, nw = Math.min(Number(s.newClientsTotal) || 0, tot); return { c, tot, nw, rt: tot - nw, rb: Number(s.totalRebooked) || 0 }; });
  const mx = Math.max(...rows.map(r => r.tot), 1);
  // Kate, 3 Nov 2026: a branch's clients open the staff behind them (Phorest's clients each handled sit one click further), the new band the new clients, the rebooked figure the
  // staff who rebooked. The returning band is what is left of the total after the new ones, so there is no list of its own and it stays plain.
  const sp = (cs, kind, o) => daSpecOf(g, cs, kind, o);
  const bars = rows.map(r => `<div class="da-stack da-c3"><div><span class="dot" style="background:${dpCol(r.c)}"></span> ${dpEsc(dpName(r.c))}</div>
    <div class="trk" style="width:${r.tot / mx * 100}%"><i style="width:${r.tot ? r.nw / r.tot * 100 : 0}%;background:var(--mint,#99F6E4)" title="New: ${Math.round(r.nw)}"${r.nw ? daBand(sp([r.c], 'field', { key: 'newc' })) : ''}></i><i style="width:${r.tot ? r.rt / r.tot * 100 : 0}%;background:var(--lavender,#C4B5FD)" title="Returning: ${Math.round(r.rt)}"></i></div>
    <div class="v" style="font-size:13px">${daNum(lgNum(r.tot), r.tot ? sp([r.c], 'clients', {}) : null)} <span style="color:var(--muted);font-weight:400">\u00B7 ${daNum(lgNum(r.rb), r.rb ? sp([r.c], 'field', { key: 'rebooked' }) : null)} rebooked</span></div></div>`).join('');
  const leg = '<div class="da-leg"><span><i style="background:var(--mint,#99F6E4)"></i>New</span><span><i style="background:var(--lavender,#C4B5FD)"></i>Returning</span></div>';
  const S = fn => daSumFn(g, have, fn);
  const anyPh = have.some(c => daSummary(g, c).ph), anyPhB = have.some(c => daSummary(g, c).ph && daSummary(g, c).ph.beauty && daSummary(g, c).ph.beauty.t);
  const anyBeauty = have.some(c => (daSummary(g, c).beautyTotalClients || 0) > 0);
  const phv = (dept, k) => daSumFn(g, have, s => (s.ph && s.ph[dept]) ? s.ph[dept][k] : 0);
  // Kate, 3 Nov 2026: every Actual opens the staff behind it (the Hair and Beauty lines are the same lists cut to that department, brought to the card's figure); the Target and
  // what is made of it (Variance, % done, Remaining) open the days against their targets, or the branches side by side. Counts reception types into the ledger have no client
  // names behind them, so those lists are per staff and the window says so; Phorest's own counts (new clients, requests) are per staff too, from its staff reports.
  // spf: codes to the list the Actual opens, fn: the figure out of a branch's summary (for the By branch list).
  const line = (label, v, key, spf, fn) => {
    const t = key ? daTarget(key, have, idxs) : null, act = daNum(lgNum(v), v && spf ? spf(have) : null);
    if (t == null || !(t > 0)) return [label, act, '<span class="lg-na">no target</span>', '—', '—', '—'];
    const br = daBranchSpec(g, have, idxs, { title: label, key, fn, t: 'num', actual: cs => spf(cs) }), dt = h => daNum(h, br);
    const bar = lgDoneBar(v / t * 100).replace(/(<span class="lg-done-n tabular">)([^<]*)(<\/span>)/, (m, x, y, z) => x + dt(y) + z);
    return [label, act, dt(lgNum(t)), dt(lgDelta(v - t, lgNum)), bar, dt(lgNum(Math.max(t - v, 0)))];
  };
  const dept = (d, kind, o, want) => cs => daDeptSpec(g, cs, kind, o, d, want(cs));
  const W = fn => cs => daSumFn(g, cs, fn);
  const body = [{ group: 'Hair' },
    line('Hair Total Clients', S(s => s.hairTotalClients), null, cs => sp(cs, 'clients', { dept: 'hair' })),
    line('Hair New Clients', S(s => s.hairNewClients), null, dept('hair', 'field', { key: 'newc' }, W(s => s.hairNewClients))),
    line('Hair NCR', S(s => s.hairNCR), null, cs => sp(cs, 'bench', { name: 'NCR', dept: 'hair' })),
    line('Hair Rebooked', S(s => s.hairRebookedCount), null, dept('hair', 'field', { key: 'rebooked' }, W(s => s.hairRebookedCount))),
    ...(anyPh ? [line('Hair new clients (Phorest)', phv('hair', 'nw'), null, dept('hair', 'phall', { row: 'nw' }, cs => daSumFn(g, cs, s => (s.ph && s.ph.hair) ? s.ph.hair.nw : 0))),
      line('Hair requests, RQ (Phorest)', phv('hair', 'req'), null, dept('hair', 'phall', { row: 'req' }, cs => daSumFn(g, cs, s => (s.ph && s.ph.hair) ? s.ph.hair.req : 0)))] : []),
    ...(anyBeauty ? [{ group: 'Beauty' },
      line('Beauty Total Clients', S(s => s.beautyTotalClients), null, cs => sp(cs, 'clients', { dept: 'beauty' })),
      line('Beauty New Clients', S(s => s.beautyNewClients), null, dept('beauty', 'field', { key: 'newc' }, W(s => s.beautyNewClients))),
      line('Beauty NCR', S(s => s.beautyNCR), null, cs => sp(cs, 'bench', { name: 'NCR', dept: 'beauty' })),
      line('Beauty Rebooked', S(s => s.beautyRebookedCount), null, cs => sp(cs, 'field', { key: 'beautyRebooked' })),
      ...(anyPhB ? [line('Beauty new clients (Phorest)', phv('beauty', 'nw'), null, dept('beauty', 'phall', { row: 'nw' }, cs => daSumFn(g, cs, s => (s.ph && s.ph.beauty) ? s.ph.beauty.nw : 0))),
        line('Beauty requests, RQ (Phorest)', phv('beauty', 'req'), null, dept('beauty', 'phall', { row: 'req' }, cs => daSumFn(g, cs, s => (s.ph && s.ph.beauty) ? s.ph.beauty.req : 0)))] : [])] : []),
    { group: 'Combined' },
    line('Rebooked', S(s => s.totalRebooked), null, cs => sp(cs, 'field', { key: 'rebooked' })),
    line('Total Clients', S(s => s.totalClients), 'clients', cs => sp(cs, 'clients', {}), s => s.totalClients),
    line('New Clients', S(s => s.newClientsTotal), 'newc', cs => sp(cs, 'field', { key: 'newc' }), s => s.newClientsTotal),
    line('NCR', S(s => s.ncrTotal), 'ncr', cs => sp(cs, 'bench', { name: 'NCR' }), s => s.ncrTotal),
    ...(anyPh ? [line('New clients (Phorest)', phv('hair', 'nw') + phv('beauty', 'nw'), null, cs => sp(cs, 'phall', { row: 'nw' })), line('Requests, RQ (Phorest)', phv('hair', 'req') + phv('beauty', 'req'), null, cs => sp(cs, 'phall', { row: 'req' }))] : []),
  ];
  const cols = [{ label: 'Metric' }, { label: 'Actual', align: 'r' }, { label: 'Target', align: 'r' }, { label: 'Variance', align: 'r' }, { label: '% done', align: 'r', w: '116px' }, { label: 'Remaining', align: 'r' }];
  return `${bars}${leg}<details class="da-det"><summary>Show the figures: hair, beauty and combined</summary><div class="da-fig">${lgTable(cols, body)}</div></details>`;
}

// ── STAFF PERFORMANCE ───────────────────────────────────────
// Ranked by the measure picked, with that measure's column marked and every other column kept for context. Hair columns are
// 0 name, 1 services excl. tx and courses, 2 treatments, 3 retail, 4 net take, 5 clients, 6 new, 7 NCR, 8 rebooked, 9 rebook %, 10 avg bill,
// 11 visits (Phorest), 12 avg bill (Phorest); beauty 0 name, 1 services, 2 retail, 3 net take, 4 clients, 5 new, 6 NCR, 7 rebooked, 8 rebook %,
// 9 avg bill, 10 visits, 11 avg bill (Phorest). Utilisation is not held per person here, so it falls back to net take and says so.
const daN = v => Number(v) || 0;
const daRatio = (a, b) => b ? a / b : null;
const DA_STAFF = {
  sales:   { dept: 'both', hair: st => daN(st.netSalonTake), hhl: [4], beauty: st => daN(st.netSalonTake), bhl: [3] },
  services: { dept: 'both', hair: st => daN(st.hairServicesExcl), hhl: [1], beauty: st => daN(st.beautySales), bhl: [1] },
  retail:  { dept: 'both', hair: st => daN(st.retail), hhl: [3], beauty: st => daN(st.retail), bhl: [2] },
  hair:    { dept: 'hair', hair: st => st.hairSalesNet != null ? daN(st.hairSalesNet) : daN(st.hairServicesExcl) + daN(st.treatments), hhl: [1, 2] },
  beauty:  { dept: 'beauty', beauty: st => daN(st.beautySales), bhl: [1] },
  treat:   { dept: 'hair', hair: st => daN(st.treatments), hhl: [2] },
  clients: { dept: 'both', hair: st => daN(st.total), hhl: [5], beauty: st => daN(st.total), bhl: [4] },
  newc:    { dept: 'both', hair: st => daN(st.newC != null ? st.newC : st.newClients), hhl: [6], beauty: st => daN(st.newC != null ? st.newC : st.newClients), bhl: [5] },
  ncr:     { dept: 'both', hair: st => daN(st.newClientReq), hhl: [7], beauty: st => daN(st.newClientReq), bhl: [6] },
  ncrp:    { dept: 'both', hair: st => daRatio(daN(st.newClientReq), daN(st.total)), hhl: [7, 5], beauty: st => daRatio(daN(st.newClientReq), daN(st.total)), bhl: [6, 4], note: 'NCR as a share of the person\u2019s clients.' },
  rebookn: { dept: 'both', hair: st => daN(st.rebooked), hhl: [8], beauty: st => daN(st.rebooked), bhl: [7] },
  rebook:  { dept: 'both', hair: st => daN(st.rebookPct), hhl: [9], beauty: st => daN(st.rebookPct), bhl: [8] },
  treatp:  { dept: 'hair', hair: st => daRatio(daN(st.treatments), st.hairSalesNet != null ? daN(st.hairSalesNet) : daN(st.hairServicesExcl) + daN(st.treatments)), hhl: [2], note: 'Treatments as a share of the stylist\u2019s hair revenue.' },
  retailp: { dept: 'both', hair: st => daRatio(daN(st.retail), daN(st.netSalonTake)), hhl: [3], beauty: st => daRatio(daN(st.retail), daN(st.netSalonTake)), bhl: [2], note: 'Retail as a share of the person\u2019s net take.' },
  hairbill: { dept: 'hair', hair: st => daN(st.avgBill), hhl: [10] },
  beautybill: { dept: 'beauty', beauty: st => daN(st.avgBill), bhl: [9] },
  util:    { dept: 'both', hair: st => daN(st.netSalonTake), hhl: [], beauty: st => daN(st.netSalonTake), bhl: [], note: 'Utilisation is not held per person on this page yet, so these are in net take order.' },
};
// Kate, 3 Nov 2026: every figure in a person's row opens her days (or months, over a long window) for that column, ending on the figure in the row. Net take, Clients and New
// clients open the Pulse's own list for a person (PD 'person': her net take, clients, requests and new clients per day, each one further to the sales lines or the clients
// Phorest recorded); the other columns are read here from the same rows, one day or month at a time through aggDailyData, the way that list does.
//   vals: the parts of the figure for one day (a ratio keeps its two parts so the last line is worked out from the sums, never an average of days)
//   der: the ratio worked out from those parts, card: the figure the row shows, add: true when the days add up to it.
const DA_PCOL = {
  svc:    { title: 'Services', cols: [['v', 'Services', 'aed']], vals: (s, side) => ({ v: side === 'beauty' ? s.beautySales : s.hairServicesExcl }), card: (s, side) => side === 'beauty' ? s.beautySales : s.hairServicesExcl, add: true,
            why: 'Services without treatments and courses (a beauty therapist’s are all services), from Phorest matched to the ledger by staff and day.' },
  treat:  { title: 'Treatments', cols: [['v', 'Treatments', 'aed']], vals: s => ({ v: s.treatments }), card: s => s.treatments, add: true, why: 'Treatment takings, a ledger column (hair only).' },
  retail: { title: 'Retail', cols: [['v', 'Retail', 'aed']], vals: s => ({ v: s.retail }), card: s => s.retail, add: true, why: 'Retail credited to her.' },
  ncr:    { title: 'New client requests', cols: [['v', 'New client requests', 'num']], vals: s => ({ v: s.newClientReq }), card: s => s.newClientReq, add: true, why: 'New clients who asked for her by name on their first visit, typed into the ledger by reception, so there are no client names.' },
  reb:    { title: 'Rebooked', cols: [['v', 'Rebooked', 'num']], vals: s => ({ v: s.rebooked }), card: s => s.rebooked, add: true, why: 'Clients who booked their next visit before leaving, typed into the ledger by reception, so there are no client names.' },
  rebpct: { title: 'Rebook %', cols: [['rb', 'Rebooked', 'num'], ['base', 'Clients', 'num'], ['pc', 'Rebook %', 'pct']], vals: s => ({ rb: s.rebooked, base: s.ledgerClients != null ? s.ledgerClients : s.total }),
            der: r => ({ pc: r.base ? r.rb / r.base * 100 : null }), card: s => s.rebookPct, why: 'Rebooked over the clients the ledger typed for her, worked out from the sums of the days, not an average of the daily percentages.' },
  avg:    { title: 'Avg bill', cols: [['svc', 'Services', 'aed'], ['cl', 'Clients', 'num'], ['av', 'Avg bill', 'aed']], vals: (s, side) => ({ svc: side === 'beauty' ? s.beautySales : s.hairSalesNet, cl: s.total }),
            der: r => ({ av: r.cl ? r.svc / r.cl : null }), card: s => s.avgBill, why: 'Her services (with treatments and courses) over the clients counted for her, worked out from the sums of the days.' },
  vis:    { title: 'Visits (Phorest)', cols: [['v', 'Visits', 'num']], vals: s => ({ v: s.ph ? s.ph.t : 0 }), card: s => s.ph ? s.ph.t : 0, add: true, why: 'Her visits in Phorest’s staff reports: a client seen by two staff is two visits.' },
  phavg:  { title: 'Avg bill (Phorest)', cols: [['svc', 'Services', 'aed'], ['t', 'Visits', 'num'], ['av', 'Avg bill', 'aed']], vals: s => ({ svc: s.ph ? s.ph.svc : 0, t: s.ph ? s.ph.t : 0 }),
            der: r => ({ av: r.t ? r.svc / r.t : null }), card: s => (s.ph && s.ph.t) ? s.ph.svc / s.ph.t : null, why: 'Her services over her Phorest visits, worked out from the sums of the days.' },
};
function daPersonSpec(g, code, side, st, col) {
  const C = DA_PCOL[col];
  if (!daCan() || !C) return null;
  const who = (typeof lgPersonNamePlain === 'function') ? lgPersonNamePlain(st.name) : st.name;
  const days = Math.round((new Date(g.to) - new Date(g.from)) / 864e5) + 1, byDay = days <= 92;
  if (days < 2) return null;   // Kate, 3 Nov 2026: one day's list would be her figure again
  return { title: `${who} · ${C.title}`, cur: 'AED', views: [{ id: 'days', label: byDay ? 'By day' : 'By month', load: async () => {
    const key = staffMapKey(st.name), bk = new Map(), kf = r => { const d = String(r.date).slice(0, 10); return byDay ? d : d.slice(0, 7); };
    const at = k => bk.get(k) || (bk.set(k, { L: [], P: [] }), bk.get(k));
    g.rowsB.forEach(r => { if (r.branch === code) at(kf(r)).L.push(r); });
    g.rowsP.forEach(r => { if (r.branch === code) at(kf(r)).P.push(r); });
    const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const rows = [];
    [...bk.keys()].sort().reverse().forEach(k => {
      const d = aggDailyData([], bk.get(k).L, bk.get(k).P);
      const s2 = d && ((side === 'beauty' ? d.beautyStaff : d.hairStaff) || []).find(p => staffMapKey(p.name) === key);
      if (!s2) return;
      const r = Object.assign({ w: byDay ? TRSD.fmt.day(k) : MON[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) }, C.vals(s2, side));
      Object.keys(r).forEach(x => { if (x !== 'w') r[x] = Number(r[x]) || 0; });
      if (C.der) Object.assign(r, C.der(r));
      if (C.cols.some(c => c[2] !== 'pct' && r[c[0]])) rows.push(r);
    });
    const sum = k => rows.reduce((a, r) => a + (+r[k] || 0), 0), foot = { w: 'Total' };
    C.cols.forEach(c => { if (!(C.der && k_isDerived(C, c[0]))) foot[c[0]] = sum(c[0]); });
    if (C.der) Object.assign(foot, C.der(foot));
    const cardV = C.card(st, side), sub = `${TRSD.esc(who)}, ${TRSD.esc(dpName(code))}, ${TRSD.esc(g.range)}. ${C.why}`;
    let note = '';
    if (C.add) {
      const diff = (Number(cardV) || 0) - foot.v;
      if (Math.abs(diff) >= 0.5) { rows.push({ w: 'Not matched to a ' + (byDay ? 'day' : 'month'), v: diff, _cls: 'dr-muted' }); foot.v = Number(cardV) || 0; note = 'The grey line is the difference between the figure in the row, which works the whole window out at once, and the rows above, which work it out one ' + (byDay ? 'day' : 'month') + ' at a time.'; }
    } else {
      const k = C.cols[C.cols.length - 1][0];
      if (cardV != null && foot[k] != null && Math.abs(foot[k] - cardV) > 0.05) note = `<b>These rows work out to ${Math.round(foot[k] * 10) / 10}, the card shows ${Math.round(cardV * 10) / 10}.</b> The card works the whole window out at once.`;
    }
    return { cols: [{ k: 'w', l: byDay ? 'Day' : 'Month' }, ...C.cols.map(c => ({ k: c[0], l: c[1], t: c[2] }))], rows, foot, sub, note };
  } }] };
}
const k_isDerived = (C, k) => { const probe = C.der({}); return Object.prototype.hasOwnProperty.call(probe, k); };
function daPersonDn(g, code, side, st, what) {
  if (!daCan() || g.from === g.to) return null;   // one day's list would be her figure again
  const ctx = daCtx(g, [code]);
  return ctx ? PD.spec('person', ctx, { name: st.name, dept: side, what, card: { net: st.netSalonTake, total: st.total, req: st.req, newC: st.newC } }) : null;
}
function daStaffInner(g, codes) {
  if (g.none) return daNone(g);
  const cfg = DA_STAFF[DP.measure] || DA_STAFF.sales;
  const ctx = { applies: false };   // the per-person monthly target belongs to the Ledgers, not to a daily window
  const keep = st => !(typeof isResignedStaff === 'function' && isResignedStaff(st.name) && !(st.total || 0) && !(st.netSalonTake || 0));
  const hl = (cells, set) => cells.map((c, i) => set.includes(i) ? `<span class="da-hl">${c}</span>` : c);
  const cols = (labels, set) => labels.map((label, i) => ({ label: set.includes(i) ? `<span class="da-hlh">${label}</span>` : label, align: i ? 'r' : undefined }));
  const hairLabels = ['Stylist', 'Services excl. tx & courses', 'Treatments', 'Retail', 'Net take', 'Clients (ledger)', 'New', 'NCR', 'Rebooked', 'Rebook %', 'Avg bill', 'Visits (Phorest)', 'Avg bill (Phorest)'];
  const beautyLabels = ['Therapist', 'Services', 'Retail', 'Net take', 'Clients (ledger)', 'New', 'NCR', 'Rebooked', 'Rebook %', 'Avg bill', 'Visits (Phorest)', 'Avg bill (Phorest)'];
  const rank = (arr, key) => arr.slice().sort((a, b) => (key(b) == null ? -Infinity : key(b)) - (key(a) == null ? -Infinity : key(a)));
  const blocks = codes.filter(c => g.byCode[c] && g.byCode[c].full).map((code, k) => {
    const f = g.byCode[code].full;
    // Kate, 3 Nov 2026: a figure in her row opens her days for that column (daPersonSpec); a zero or a dash stays plain.
    const pc = (side, st, col, html, v) => v ? daNum(html, daPersonSpec(g, code, side, st, col)) : html;
    const pn = (side, st, what, html, v) => v ? daNum(html, daPersonDn(g, code, side, st, what)) : html;
    const hair = cfg.dept === 'beauty' ? [] : rank((f.hairStaff || []).filter(keep), cfg.hair).map(st => hl([
      lgStaffName(code, 'HAIR', st, ctx), pc('hair', st, 'svc', lgAed(st.hairServicesExcl), st.hairServicesExcl), pc('hair', st, 'treat', lgAed(st.treatments), st.treatments), pc('hair', st, 'retail', lgAed(st.retail), st.retail),
      pn('hair', st, 'Net take', lgAed(st.netSalonTake), st.netSalonTake),
      pn('hair', st, 'Clients', lgNum(st.total), st.total), pn('hair', st, 'New clients', lgNum(st.newC != null ? st.newC : st.newClients), st.newC != null ? st.newC : st.newClients),
      pc('hair', st, 'ncr', lgNum(st.newClientReq), st.newClientReq), pc('hair', st, 'reb', lgNum(st.rebooked), st.rebooked), pc('hair', st, 'rebpct', lgPct(st.rebookPct), st.rebookPct),
      pc('hair', st, 'avg', lgAed(st.avgBill), st.avgBill),
      st.ph ? pc('hair', st, 'vis', lgNum(st.ph.t), st.ph.t) : '\u2014', st.ph && st.ph.t ? pc('hair', st, 'phavg', lgAed(st.ph.svc / st.ph.t), st.ph.svc) : '\u2014'], cfg.hhl || []));
    const beauty = cfg.dept === 'hair' ? [] : rank((f.beautyStaff || []).filter(keep), cfg.beauty).map(st => hl([
      lgStaffName(code, 'BEAUTY', st, ctx), pc('beauty', st, 'svc', lgAed(st.beautySales), st.beautySales), pc('beauty', st, 'retail', lgAed(st.retail), st.retail),
      pn('beauty', st, 'Net take', lgAed(st.netSalonTake), st.netSalonTake),
      pn('beauty', st, 'Clients', lgNum(st.total), st.total), pn('beauty', st, 'New clients', lgNum(st.newC != null ? st.newC : st.newClients), st.newC != null ? st.newC : st.newClients),
      pc('beauty', st, 'ncr', lgNum(st.newClientReq), st.newClientReq), pc('beauty', st, 'reb', lgNum(st.rebooked), st.rebooked), pc('beauty', st, 'rebpct', lgPct(st.rebookPct), st.rebookPct),
      pc('beauty', st, 'avg', lgAed(st.avgBill), st.avgBill),
      st.ph ? pc('beauty', st, 'vis', lgNum(st.ph.t), st.ph.t) : '\u2014', st.ph && st.ph.t ? pc('beauty', st, 'phavg', lgAed(st.ph.svc / st.ph.t), st.ph.svc) : '\u2014'], cfg.bhl || []));
    if (!hair.length && !beauty.length) return '';
    return `<details class="da-br"${k === 0 ? ' open' : ''}><summary><span class="dot" style="background:${dpCol(code)}"></span> ${dpEsc(dpName(code))}
      <span class="dp-sub" style="margin-left:8px;font-weight:400">${hair.length ? hair.length + ' hair' : ''}${hair.length && beauty.length ? ', ' : ''}${beauty.length ? beauty.length + ' beauty' : ''}</span></summary>
      ${hair.length ? `<div class="da-sub2">Hair</div>${lgTable(cols(hairLabels, cfg.hhl || []), hair, { compact: true })}` : ''}
      ${beauty.length ? `<div class="da-sub2">Beauty</div>${lgTable(cols(beautyLabels, cfg.bhl || []), beauty, { compact: true })}` : ''}</details>`;
  }).join('');
  return (cfg.note ? `<p class="dp-sub" style="margin:0 0 8px">${dpEsc(cfg.note)}</p>` : '') + (blocks || `<p class="dp-sub">No ${dpEsc(DP_M[DP.measure].label)} figures for the branches picked in this window.</p>`);
}

// ── THE CARDS THAT FOLLOW THE MEASURE, AND FILLING THEM ──────
function daCard(id, title, why, innerId, cached, fill) {
  return `<div class="dp-card dp-jt" id="${id}"><div class="dp-head"><div><h2>${title}</h2><p class="dp-why">${why}</p></div></div>
    <div id="${innerId}">${cached ? fill() : '<div class="loading">Loading...</div>'}</div></div>`;
}
function daMoreCards(win, idxs) {
  daCss(); daEnsure(win);
  const cached = !!(daData && daData.key === daKey(win)), g = daData, codes = dpSel(), mk = DP.measure, M = DP_M[mk];
  let out = '';
  if (daShowsMix()) out += daCard('dpCardM', DA_MIX[mk].title, DA_MIX[mk].why, 'daMix', cached, () => daMixInner(g, codes, idxs));
  if (daShowsClients()) out += daCard('dpCardCl', 'Clients: new against returning, hair against beauty', 'A rebooking problem is almost always one department\u2019s, so the split is under the figures. Per staff, from the ledgers: a client seen by two staff counts twice. The through-the-door count is on the Organisation Pulse.', 'daCli', cached, () => daCliInner(g, codes, idxs));
  out += daCard('dpCardS', `Staff performance: ${dpEsc(M.label)}`, `Per stylist and therapist for this period, ranked by ${dpEsc(M.noun)} with that column marked and the rest kept beside it. Hover or tap a name for the card, stats and more.`, 'daStaff', cached, () => daStaffInner(g, codes));
  return out;
}
function daFillAll(g) {
  const codes = dpSel(), idxs = dpIdx(dpWindow());
  [['daMix', () => daMixInner(g, codes, idxs)], ['daCli', () => daCliInner(g, codes, idxs)], ['daStaff', () => daStaffInner(g, codes)]].forEach(([id, fn]) => {
    const host = document.getElementById(id);
    if (host) { host.innerHTML = fn(); if (typeof lgWatchScroll === 'function') lgWatchScroll(host); }
  });
}
