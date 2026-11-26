// Out of Stock (Kate, 23 Nov 2026, from the local mockup docs/mockups/out-of-stock.html in the cowork repo).
//
// What to order for the Monday order, salon by salon. It reads two things and keeps nothing of its own:
//   - oos_plan() (migrations/out_of_stock_access.sql, a gate-less copy of spend_plan() behind oos_access(), so the rules are the Weekly Product Plan's own): the products, their Priority, Type, supplier, brand, category, Min, Max, unit cost and the shelf count
//     ("in stock now"), all LIVE, never a copy. Gate: old Level 2 (coordinators) and up, or a spend viewer; anyone else sees the denied line. Only the fields this page needs come back, no price lists or edit log.
//   - oos_on_order() (migrations/out_of_stock_on_order.sql): the units on order and not arrived, one entry per order line. If the function is not there (or
//     refuses), the page still works with on order = 0 and says in one plain line that the on-order counts are not loaded yet, so nobody trusts a missing number.
//
// Kate's rule (23 Nov 2026), kept exactly:
//   rows       the Weekly Product Plan rows with Priority A (default) or A and B, Min above 0, the four open UAE salons only (Bahrain is not in the numbers)
//   shelf      "in stock now"; a negative shelf counts as 0 and the product window says so
//   on order   units on stock orders not yet arrived (the last 60 days)
//   Min        one week of use (the plan's Min); Max is the plan's Max; cost is the plan's unit cost
//   cover      2 weeks from 15 Nov to 31 Dec (the busy weeks), otherwise 1 week; worked out from today's date, and the reader can change it at the top
//   order when shelf + on order is under Min x cover; two orders (Kate, 26 Nov 2026: "dapat meron din minimum orders minimum amount"):
//     MINIMUM order = up to Min x cover (the order point), the least that gets the product back to cover; MAXIMUM order = up to the bigger of Max and Min x cover
//     AED = units to order x cost, for each of the two
//   status     out (nothing on the shelf), under 1 week (shelf + on order under Min), under N weeks (under the order point)
//
// The masthead's Branch drives the page (sel). Period does not apply: a shelf count has no period, so the masthead dims it and the page says so.
// Tables are the shared Sheets table (sheet-table.js), every figure opens what is behind it (drill.js, down to a single order line), the bars lift and answer (bar-hover.js),
// XLSX and CSV on every table and for the whole page (report-export.js, page-export.js), Why wall, On this page rail, first-time guide (page-guide.js reads this page by itself).
// Needs from dashboard.js (shared script scope): sb, sel; from drill.js TRSD; sheet-table.js TRSheet; report-export.js rexButtons; why-wall.js whyWall.
(function () {
  'use strict';
  const B = ['KCA', 'SAA', 'MC', 'AQ'];   // the masthead's order
  const BN = { KCA: 'Khalifa City A', SAA: 'Saadiyat', MC: 'Motor City', AQ: 'Al Quoz' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // a row from spend_plan(): [row_key, branch, category, product, type p|r, flag, units per month, priority, min, max, unit cost, unit cost before, stock list price, in stock now,
  //                           match status, price tag, brand, supplier]
  const K = 0, BR = 1, CAT = 2, NAME = 3, TYPE = 4, FLAG = 5, PRIO = 7, MIN = 8, MAX = 9, COST = 10, STK = 13, BRAND = 16, SUP = 17;
  const SALORD = { KCA: 0, SAA: 1, MC: 2, AQ: 3 }, STORD = { out: 0, u1: 1, ok: 2 };
  const PRIOS = { A: ['A'], AB: ['A', 'B'] };
  const S = { rows: null, lines: [], ordersOk: false, ordersAt: null, asof: {}, state: 'loading', loadedAt: 0, ver: 0, seq: 0, br: B.slice(),
    prio: 'A', cover: 0, filt: 'all', hk: 'qty', ak: 'rule', built: false, ro: null };
  let TO = null, TS = null, memoKey = '', memo = [];

  // ── small helpers ────────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = v => Math.round(+v || 0).toLocaleString('en-GB');
  const nu = v => (Math.round((+v || 0) * 100) / 100).toLocaleString('en-GB');
  const A = v => 'AED ' + n0(v);
  const wk = n => n + ' week' + (n === 1 ? '' : 's');
  const plural = (n, w) => n0(n) + ' ' + w + (n === 1 ? '' : 's');
  const sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
  const r1 = v => Math.round(v * 10) / 10;
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const dubaiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });   // 2026-11-23
  const isoD = s => new Date(s + 'T00:00:00');
  const fd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : ''; };   // 23 Nov 2026
  const daysBetween = (a, b) => Math.round((isoD(b) - isoD(a)) / 864e5);
  const brandOf = b => /^schwarzkopf/i.test(b) ? 'Schwarzkopf' : /authentic beauty/i.test(b) ? 'ABC' : String(b || '');
  const num = (html, spec) => (typeof TRSD !== 'undefined' && spec) ? TRSD.num(html, spec) : html;
  // Kate, 23 Nov 2026: 1 week of cover as a rule, 2 weeks from 15 Nov to 31 Dec (the busy weeks). Read from today's date (Dubai), never typed in.
  function seasonCover(iso) { const m = +iso.slice(5, 7), d = +iso.slice(8, 10); return (m === 12 || (m === 11 && d >= 15)) ? 2 : 1; }
  const cover = () => S.cover || seasonCover(dubaiToday());

  // ── THE MASTHEAD'S BRANCH ────────────────────────────────────────────────────────────
  function wantBranches() {
    try { const b = sel.branch; if (Array.isArray(b) && !b.includes('all')) { const x = B.filter(c => b.includes(c)); if (x.length) return x; } } catch (e) { /* All */ }
    return B.slice();
  }
  const scope = () => S.br.length === B.length ? 'UAE Branches' : S.br.map(c => BN[c]).join(' + ');
  const inSel = c => S.br.indexOf(c) >= 0;

  // ── DATA IN ──────────────────────────────────────────────────────────────────────────
  async function load(force) {
    if (!force && S.rows && Date.now() - S.loadedAt < 300000) return;
    const callPlan = sb.rpc('oos_plan');
    const callOrd = Promise.resolve(sb.rpc('oos_on_order')).then(r => r, e => ({ error: e }));   // the migration may not be applied yet
    const pr = await callPlan;
    if (pr.error) throw pr.error;
    const d = pr.data || {};
    if (d.denied) { S.state = 'denied'; return; }
    const or = await callOrd;
    const od = or && !or.error ? or.data : null;
    S.ordersOk = !!(od && !od.denied && Array.isArray(od.rows));
    S.lines = S.ordersOk ? od.rows : [];
    S.ordersAt = S.ordersOk ? od.loaded || null : null;
    S.asof = d.stock_asof || {};
    build(d.rows || []);
    S.loadedAt = Date.now(); S.ver++; S.state = 'ok';
  }
  // Match order lines to plan rows by salon + barcode (the first 12 digits, the last part of the plan row's key), else by salon + product name. A line is counted once.
  function build(plan) {
    const lines = S.lines.map((x, i) => ({ i, b: x[0], bc: String(x[1] || '').replace(/\D/g, '').slice(0, 12), p: String(x[2] || ''), u: +x[3] || 0, no: x[4] || '', od: x[5] || '', used: false }));
    const byBc = {}, byNm = {};
    lines.forEach(l => {
      if (l.bc.length >= 12) (byBc[l.b + '|' + l.bc] = byBc[l.b + '|' + l.bc] || []).push(l);
      const k = l.b + '|' + norm(l.p); (byNm[k] = byNm[k] || []).push(l);
    });
    const rows = [];
    plan.forEach(r => {
      const b = r[BR]; if (B.indexOf(b) < 0) return;
      const mn = +r[MIN]; if (!(mn > 0)) return;
      const key = String(r[K] || ''), parts = key.split('|');
      const bc = parts.length >= 4 ? parts[parts.length - 1].replace(/\D/g, '').slice(0, 12) : '';
      const orig = parts.length >= 4 ? parts.slice(2, -1).join('|') : '';
      let ls = bc.length >= 12 ? (byBc[b + '|' + bc] || []) : [];
      if (!ls.length) ls = (byNm[b + '|' + norm(orig)] || []).concat(norm(r[NAME]) === norm(orig) ? [] : (byNm[b + '|' + norm(r[NAME])] || []));
      ls = ls.filter(l => !l.used); ls.forEach(l => { l.used = true; });
      const stk = r[STK];
      rows.push({ id: rows.length, key, b, brand: brandOf(r[BRAND] || ''), name: String(r[NAME] || '').replace(/\s+/g, ' ').trim(), type: r[TYPE] === 'r' ? 'Retail' : 'Professional',
        s: Math.max(+stk || 0, 0), neg: stk != null && +stk < 0, noshelf: stk == null, mn, mx: +r[MAX] > 0 ? +r[MAX] : mn, c: +r[COST] || 0, nocost: r[COST] == null,
        sup: r[SUP] || 'DBD', cat: r[CAT] || '', prio: r[PRIO] || 'B', flag: r[FLAG] || 0, lines: ls, i: ls.reduce((a, l) => a + l.u, 0) });
    });
    S.rows = rows;
  }
  // trig = Min x cover, target = the bigger of Max and trig, have = shelf + on order. When have is under trig: maximum order q = target - have, minimum order qm = trig - have.
  function enrich(r, C) {
    const trig = r.mn * C, tgt = Math.max(r.mx, trig), have = r.s + r.i, q = have < trig ? tgt - have : 0, qm = have < trig ? trig - have : 0, st = r.s <= 0 ? 'out' : (have < r.mn ? 'u1' : 'ok');
    return Object.assign({}, r, { C, trig, tgt, have, q, aed: q * r.c, qm, am: qm * r.c, cov: have / r.mn, st });
  }
  function all() {
    const C = cover(), k = S.ver + '|' + S.prio + '|' + C;
    if (k !== memoKey) {
      memoKey = k;
      memo = (S.rows || []).filter(r => PRIOS[S.prio].indexOf(r.prio) >= 0).map(r => enrich(r, C))
        .sort((a, b) => SALORD[a.b] - SALORD[b.b] || STORD[a.st] - STORD[b.st] || b.aed - a.aed || a.name.localeCompare(b.name));
    }
    return memo;
  }
  const selRows = () => all().filter(r => inSel(r.b));
  const stTxt = r => r.st === 'out' ? (r.i > 0 ? 'Out, ' + nu(r.i) + ' on order' : 'Out now') : r.st === 'u1' ? 'Under 1 week' : 'Under ' + wk(r.C);
  function salTot(c) {
    const rs = all().filter(r => r.b === c), o = rs.filter(r => r.q > 0);
    return { n: o.length, out: rs.filter(r => r.s <= 0).length, u1: o.filter(r => r.s > 0 && r.have < r.mn).length, aed: sum(o, 'aed'), units: sum(o, 'q'), aedm: sum(o, 'am'), unitsm: sum(o, 'qm') };
  }
  // How fresh the shelf data is, from stock_asof (a date per salon): the oldest one picked decides.
  function fresh() {
    const known = S.br.filter(c => S.asof[c]).map(c => ({ c, d: String(S.asof[c]).slice(0, 10) }));
    if (!known.length) return { text: 'The date of the shelf lists is not known. Run the daily reports before the order goes out.', stale: true, days: null };
    const old = known.reduce((a, x) => x.d < a.d ? x : a), days = daysBetween(old.d, dubaiToday()), same = known.every(x => x.d === old.d);
    const when = same ? 'The shelf lists were read on ' + fd(old.d) : 'The oldest shelf list (' + BN[old.c] + ') was read on ' + fd(old.d);
    const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
    return { days, stale: days > 1, date: fd(old.d), text: when + ', ' + ago + '. Anything ordered or delivered since is not in these counts' + (days > 1 ? ', so run the daily reports before the order goes out.' : '.') };
  }
  const shelfDate = () => { const f = fresh(); return f.date || 'an unknown date'; };

  // ── WINDOWS (drill.js): what is behind a figure ──────────────────────────────────────
  // The products behind a figure. f = all (to order), out (nothing on the shelf), u1 (under a week left), sup (one supplier's order). sal = one salon, '' = the salons picked.
  function groupRows(f, sal, sup) {
    const rs = all().filter(r => sal ? r.b === sal : inSel(r.b));
    if (f === 'out') return rs.filter(r => r.s <= 0);
    if (f === 'u1') return rs.filter(r => r.q > 0 && r.s > 0 && r.have < r.mn);
    if (f === 'sup') return rs.filter(r => r.q > 0 && r.sup === sup);
    return rs.filter(r => r.q > 0);
  }
  const gTitle = (f, sal, sup) => { const L = sal ? BN[sal] : scope(); return f === 'out' ? 'Out now, ' + L : f === 'u1' ? 'Under 1 week left, ' + L : f === 'sup' ? sup + ' order, ' + L : 'Products to order, ' + L; };
  // a figure that opens the products behind it; plain when the list is empty
  const fig = (txt, f, sal, sup) => { const rs = groupRows(f, sal, sup); return rs.length ? num(txt, rowsSpec(gTitle(f, sal, sup), rs, slug('oos-' + f + (sal ? '-' + sal : '') + (sup ? '-' + sup : '')))) : txt; };
  // A list of products. Every product, number and the product name open the product's own window. The Total row adds up the rows listed.
  function rowsSpec(title, rows, sk) {
    const C = cover();
    return { title, sub: plural(rows.length, 'product') + ' · ' + A(sum(rows, 'am')) + ' minimum to ' + A(sum(rows, 'aed')) + ' maximum order · ' + wk(C) + ' of cover · shelf of ' + shelfDate(), cur: 'AED', sk,
      views: [{ id: 'products', label: 'Products', load: async () => ({
        cols: [{ k: 'p', l: 'Product' }, { k: 'br', l: 'Brand' }, { k: 's', l: 'Salon' }, { k: 'ty', l: 'Type' }, { k: 'pr', l: 'Priority' }, { k: 'st', l: 'Status' },
          { k: 'in', l: 'In stock', t: 'num' }, { k: 'on', l: 'On order', t: 'num' }, { k: 'mn', l: 'Min', t: 'num' }, { k: 'qm', l: 'Min order', t: 'num' }, { k: 'am', l: 'Min AED', t: 'aed' }, { k: 'q', l: 'Max order', t: 'num' }, { k: 'a', l: 'Max AED', t: 'aed' }],
        rows: rows.map(r => { const d = prodSpec(r, 'how'), o = prodSpec(r, 'orders');
          return { p: r.name, br: r.brand, s: BN[r.b], ty: r.type, pr: r.prio, st: stTxt(r), in: r.s, on: r.i, mn: r.mn, qm: r.qm, am: Math.round(r.am * 100) / 100, q: r.q, a: Math.round(r.aed * 100) / 100,
            _dn: Object.assign({ p: d, in: d, mn: d, qm: d, am: d, q: d, a: d }, r.lines.length ? { on: o } : {}) }; }),
        foot: { p: 'Total: ' + plural(rows.length, 'product'), qm: sum(rows, 'qm'), am: Math.round(sum(rows, 'am') * 100) / 100, q: sum(rows, 'q'), a: Math.round(sum(rows, 'aed') * 100) / 100 },
        note: 'Every product is listed with its real counts. Tap a number or a product to see how its order is worked out; On order opens the order lines.' + (S.ordersOk ? '' : ' On-order counts are not loaded yet, so On order shows 0.')
      }) }] };
  }
  // One product at one salon: how its order is worked out, and the order lines behind On order (the last step: a single order line has nothing behind it).
  function prodSpec(r, first) {
    const how = { id: 'how', label: 'How the order is worked out', load: async () => {
      const ordSpec = r.lines.length ? prodSpec(r, 'orders') : null;
      const steps = [
        ['On the shelf', nu(r.s) + (r.neg ? ' (the list shows a minus: stock was used before it was booked in, counted as none)' : '') + (r.noshelf ? ' (not on the Stock List now, counted as none)' : '')],
        ['On order, not arrived', S.ordersOk ? nu(r.i) + (r.i ? ' units on ' + plural(r.lines.length, 'order line') : '') : 'not loaded yet, counted as 0'],
        ['Shelf and on order together', nu(r.have)],
        ['Min in the Weekly Product Plan (one week of use)', nu(r.mn)],
        ['Max in the Weekly Product Plan', nu(r.mx)],
        ['Weeks left at that rate', r1(r.cov).toFixed(1)],
        ['Order when shelf and on order are under', nu(r.trig) + ' (Min x ' + r.C + ')'],
        ['Order up to', nu(r.tgt) + (r.tgt > r.mx ? ' (Min x ' + r.C + ', higher than Max)' : ' (Max)')],
        ['Minimum order', nu(r.qm) + ' units, up to ' + nu(r.trig) + ' (Min x ' + r.C + ')'],
        ['Maximum order', nu(r.q) + ' units, up to ' + nu(r.tgt)],
        ['Cost a unit, Stock List', r.nocost ? 'No cost on the plan yet, counted as 0' : 'AED ' + r.c.toFixed(2)]];
      return { cols: [{ k: 'step', l: 'Step' }, { k: 'fig', l: 'Figure' }],
        rows: steps.map((x, i) => ({ step: x[0], fig: x[1], _dn: i === 1 && ordSpec ? { fig: ordSpec } : null })),
        foot: { step: 'AED to order', fig: A(r.am) + ' minimum, ' + A(r.aed) + ' maximum' },
        note: 'This is the last step for these figures: one product at one salon has nothing behind it, except the order lines on the second tab. Which clients bought a retail product at the till is not on this page yet. Phorest does not record which client a professional product was used on.' };
    } };
    const orders = { id: 'orders', label: 'On order (' + r.lines.length + ')', load: async () => {
      if (!S.ordersOk) return { cols: [{ k: 'n', l: 'Order lines' }], rows: [], empty: 'On-order counts are not loaded yet.' };
      return { cols: [{ k: 'no', l: 'Order no' }, { k: 'od', l: 'Ordered', t: 'date' }, { k: 's', l: 'Salon' }, { k: 'u', l: 'Units', t: 'num' }],
        rows: r.lines.map(l => ({ no: l.no, od: l.od, s: BN[l.b] || l.b, u: l.u })),
        foot: r.lines.length ? { no: plural(r.lines.length, 'order line'), od: '', s: '', u: r.i } : null, empty: 'Nothing on order for this product.',
        note: 'This is the last step: a single order line has nothing behind it. Orders from the last 60 days that have not arrived, from Phorest\'s Stock Orders report' + (S.ordersAt ? ', read ' + fd(String(S.ordersAt).slice(0, 10)) : '') + '.' };
    } };
    return { title: r.name, cur: 'AED', sk: slug('oos-p-' + r.b + '-' + r.name),
      sub: r.brand + ' · ' + r.type.toLowerCase() + ' · ' + BN[r.b] + ' · Priority ' + r.prio + ' from the plan · supplier ' + r.sup,
      views: first === 'orders' ? [orders, how] : [how, orders] };
  }

  // ── THE PAGE (built once, then redrawn from the data) ────────────────────────────────
  function skeleton() {
    return `
    <div class="oos-ctl">
      <label for="oosPrio">Priority</label>
      <select id="oosPrio" aria-label="Which priority to show"><option value="A">A only</option><option value="AB">A and B</option></select>
      <label for="oosCover">Weeks of cover</label>
      <select id="oosCover" aria-label="Weeks of usual use to order up to"><option value="1">1 week</option><option value="2">2 weeks</option><option value="3">3 weeks</option><option value="4">4 weeks</option></select>
      <span class="oos-ctl-t" id="oosCoverT"></span>
    </div>
    <section class="oos-ans" aria-label="The answer in one line"><div class="oos-ans-k">The answer in one line</div><div class="oos-ans-t" id="oosAns"></div><div class="oos-ans-s" id="oosAns2"></div><div class="oos-ans-n" id="oosAns3"></div><div class="oos-ans-n" id="oosAns4" hidden></div></section>

    <section class="oos-sec" id="oos-1" data-jn="1 This week's order">
      <h3>1 This week's order</h3>
      <div class="oos-learn">
        <p><b>What is this?</b> For each salon, the products that are short, Priority A to start with, and what it costs to top them up: a minimum order (back to cover) and a maximum order (up to Max).</p>
        <p><b>Why it matters.</b> A colour that is out on a Thursday means a client is told no.</p>
        <p class="ex" id="oosEx"></p>
        <p class="watch"><b>What to watch.</b> <span id="oosW1"></span></p>
      </div>
      <div class="oos-fun" id="oosBars"></div>
    </section>

    <section class="oos-sec" id="oos-2" data-jn="2 The order list">
      <h3>2 The order list</h3>
      <div class="oos-learn">
        <p><b>What is this?</b> Every product to order, one line each, salon by salon.</p>
        <p><b>Why it matters.</b> One list for the Monday order, so nothing is ordered twice or missed.</p>
        <p class="watch"><b>What to watch.</b> <span id="oosW2"></span></p>
      </div>
      <div class="oos-bar" id="oosBar">
        <div class="sc-seg oos-seg" role="group" aria-label="Show"><button type="button" class="on" data-of="all" aria-pressed="true">All to order</button><button type="button" data-of="out" aria-pressed="false">Out now</button><button type="button" data-of="u1" aria-pressed="false">Under 1 week</button></div>
        <button type="button" class="cm-pill" id="oosMore" aria-pressed="false">All columns</button>
        <button type="button" class="cm-pill oos-phone" data-sxcm="oosOrder">Sort and filter</button>
        <span class="oos-sp"></span>
        <button type="button" class="cm-pill" id="oosClear" hidden>Clear filters</button>${typeof rexButtons === 'function' ? rexButtons('oosExportOrder') : ''}
      </div>
      <div class="oos-card oos-tcell"><table id="oosTbl"></table></div>
      <div class="oos-pager"><span id="oosPgTxt"></span><span class="oos-sp"></span><span class="slv-eyebrow">Rows</span><select id="oosRows" aria-label="Rows per page"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
        <button type="button" class="cm-pill" id="oosPrev">‹ Previous</button><span class="oos-pgn" id="oosPgN"></span><button type="button" class="cm-pill" id="oosNext">Next ›</button></div>
      <p class="oos-hint">The page shows 10 rows to start with; pick 20, 50 or 100. Every column has a heading menu: sort, filter by condition or tick the values you want.</p>
    </section>

    <details class="oos-sec oos-det" id="oos-3" data-jn="3 Order by supplier">
      <summary><h3>3 Order by supplier</h3></summary>
      <div class="oos-learn">
        <p><b>What is this?</b> The same order split by supplier, as the plan has it.</p>
        <p><b>Why it matters.</b> Each supplier is ordered separately.</p>
        <p class="watch"><b>What to watch.</b> <span id="oosW3"></span></p>
      </div>
      <div class="oos-bar oos-bar-plain"><button type="button" class="cm-pill" id="oosMore3" aria-pressed="false">All columns</button><button type="button" class="cm-pill oos-phone" data-sxcm="oosSup">Sort and filter</button><span class="oos-sp"></span>${typeof rexButtons === 'function' ? rexButtons('oosExportSup') : ''}</div>
      <div class="oos-card"><table id="oosSupTbl"></table></div>
    </details>

    <section class="oos-how" id="oosHow"><h3>How it is worked out</h3><div class="sc-seg oos-pick" id="oosHpick" role="group" aria-label="Which figure"></div><div class="oos-howcard" id="oosHcard"></div></section>
    <section class="oos-how" id="oosAbout"><h3>About this page</h3><div class="sc-seg oos-pick" id="oosApick" role="group" aria-label="About this page"></div><div class="oos-howcard" id="oosAcard"></div></section>`;
  }

  // the table's sticky offsets (under the masthead and, below 1100px, the chips), read from the page, never guessed
  function offsets() {
    const v = $('view-outofstock'); if (!v) return;
    const tb = $('topbar'), side = v.querySelector('.lg-side'), shell = $('oosShell'), st = v.style;
    let top = 0;
    if (tb && getComputedStyle(tb).position === 'fixed') top = Math.max(0, Math.round(tb.getBoundingClientRect().bottom));
    let chips = 0;
    if (side && shell && innerWidth > 760 && side.getClientRects().length && getComputedStyle(side).position === 'sticky' && side.offsetWidth > shell.offsetWidth * 0.5) chips = side.offsetHeight;
    const sx = (top + chips) + 'px';
    if (st.getPropertyValue('--sx-top') !== sx) st.setProperty('--sx-top', sx);
    v.querySelectorAll('.oos-sec').forEach(s => { const b = s.querySelector('.oos-bar:not(.oos-bar-plain)'), h = (b ? b.offsetHeight : 0) + 'px'; if (s.style.getPropertyValue('--bh') !== h) s.style.setProperty('--bh', h); });
  }

  function paintNote() {
    const C = cover(), usual = seasonCover(dubaiToday());
    $('oosCover').value = String(C); $('oosPrio').value = S.prio;
    $('oosCoverT').textContent = 'Order when under Min x weeks. ' + (C === usual ? 'The usual for today.' : 'Not the usual for today.') + ' 15 Nov to 31 Dec: 2 weeks. Rest of the year: 1 week.';
  }
  function paintAnswer() {
    const cs = S.br, T = cs.map(salTot), aed = sum(T, 'aed'), aedm = sum(T, 'aedm'), out = sum(T, 'out'), n = sum(T, 'n'), f = fresh();
    const a = $('oosAns'), a2 = $('oosAns2');
    if (!n) { a.textContent = 'Nothing to order for ' + scope() + ' on Priority ' + (S.prio === 'A' ? 'A' : 'A and B') + '.'; a2.innerHTML = fig(n0(out), 'out') + (out === 1 ? ' product is' : ' products are') + ' out on the shelf now.'; }
    else {
      a.innerHTML = 'Order between ' + fig(A(aedm), 'all') + ' (minimum) and ' + fig(A(aed), 'all') + ' (maximum) this week (Priority ' + (S.prio === 'A' ? 'A' : 'A and B') + ') to keep ' + (cs.length === 1 ? BN[cs[0]] : 'every salon') + ' covered for ' + wk(cover()) + '.';
      a2.innerHTML = cs.map((c, i) => BN[c] + ' ' + fig(A(T[i].aedm), 'all', c) + ' to ' + fig(A(T[i].aed), 'all', c)).join(', ') + '. ' + fig(n0(out), 'out') + (out === 1 ? ' product is' : ' products are') + ' out on the shelf now.';
    }
    $('oosAns3').textContent = f.text + ' The Period at the top does not apply to this page.';
    const w = $('oosAns4'); w.hidden = S.ordersOk; w.textContent = S.ordersOk ? '' : 'On-order counts are not loaded yet. On order shows 0 for every product, so something that is already on its way can still show as short.';
  }
  // the best example for the page: a product with something on the shelf and something to order, biggest AED first (a real row, never typed in)
  function exRow() {
    const rs = selRows().filter(r => r.q > 0);
    return rs.filter(r => r.s > 0 && r.i > 0).sort((a, b) => b.aed - a.aed)[0] || rs.filter(r => r.s > 0).sort((a, b) => b.aed - a.aed)[0] || rs.sort((a, b) => b.aed - a.aed)[0] || null;
  }
  function paintBars() {
    const cs = S.br, T = cs.map(salTot), mx = Math.max.apply(null, T.map(t => t.aed).concat([1])), total = sum(T, 'aed');
    $('oosBars').innerHTML = cs.map((c, i) => {
      const t = T[i], tip = BN[c] + ': ' + plural(t.n, 'product') + ' to order, ' + A(t.aedm) + ' minimum and ' + A(t.aed) + ' maximum' + (total ? ' (' + Math.round(100 * t.aed / total) + '% of the maximum order)' : '') + '. ' + n0(t.out) + ' out on the shelf now and ' + n0(t.u1) + ' more with under a week left. Tap a number to see the products.';
      return `<div class="oos-step" data-bh tabindex="0" data-tip="${esc(tip)}"><div class="oos-nm">${BN[c]}<small>${n0(t.n)} to order</small></div><div class="oos-fbar"><i data-bh-fill style="width:${(100 * t.aed / mx).toFixed(1)}%"></i></div>` +
        `<div class="oos-num"><b>${fig(A(t.aed), 'all', c)}</b> <span>maximum</span><span>·</span><span>${fig(A(t.aedm), 'all', c)} minimum</span><span>·</span><span>${fig(n0(t.n), 'all', c)} products</span><span>·</span><span>${fig(n0(t.out), 'out', c)} out now</span><span>·</span><span>${fig(n0(t.u1), 'u1', c)} under 1 week</span></div></div>`;
    }).join('');
    let hi = 0, lo = 0; T.forEach((t, i) => { if (t.aed > T[hi].aed) hi = i; if (t.aed < T[lo].aed) lo = i; });
    const w = $('oosW1');
    if (cs.length < 2) w.textContent = 'One salon is picked. Add the others in the header to compare them.';
    else w.innerHTML = BN[cs[hi]] + ' has the biggest maximum order (' + fig(A(T[hi].aed), 'all', cs[hi]) + ') and ' + BN[cs[lo]] + ' the smallest (' + fig(A(T[lo].aed), 'all', cs[lo]) + '). ' +
      (T[lo].out === 0 ? BN[cs[lo]] + ' has nothing out on the shelf: that is the shelf to copy.' : 'Look at what ' + BN[cs[lo]] + ' does differently.');
    const e = exRow(), ex = $('oosEx');
    ex.hidden = !e;
    if (e) ex.innerHTML = '<b>Example.</b> At ' + esc(BN[e.b]) + ' the ' + esc(e.name) + ' has ' + nu(e.s) + ' on the shelf and ' + (e.i ? nu(e.i) : 'none') + ' on order. The plan says Min ' + nu(e.mn) + ' and Max ' + nu(e.mx) + '. We order when under ' + nu(e.trig) + '. The minimum order goes up to ' + nu(e.trig) + ', which is ' + num(A(e.am), prodSpec(e, 'how')) + '. The maximum order goes up to ' + nu(e.tgt) + ', which is ' + num(A(e.aed), prodSpec(e, 'how')) + '.';
  }

  // ── 2 THE ORDER LIST ─────────────────────────────────────────────────────────────────
  function orderRows() {
    const rs = selRows();
    if (S.filt === 'out') return rs.filter(r => r.s <= 0);
    if (S.filt === 'u1') return rs.filter(r => r.q > 0 && r.s > 0 && r.have < r.mn);
    return rs.filter(r => r.q > 0);
  }
  function buildTables() {
    const nc = (k, l, get, x, first) => ({ k, l, t: 'num', x, raw: get, disp: r => nu(get(r)), cell: r => (first === 'orders' && !r.lines.length) ? nu(get(r)) : num(nu(get(r)), prodSpec(r, first || 'how')) });
    const tc = (k, l, get, x, cellf) => ({ k, l, t: 'txt', x, raw: get, disp: get, cell: cellf || (r => esc(get(r))) });
    TO = TRSheet.table({ id: 'oosOrder', el: '#oosTbl', limit: 10, rows: orderRows,
      cols: [
        tc('p', 'Product', r => r.name, 0, r => num('<b>' + esc(r.name) + '</b>', prodSpec(r, 'how')) + '<span class="oos-sub">' + esc(r.brand) + '</span>'),
        tc('s', 'Salon', r => BN[r.b]), tc('ty', 'Type', r => r.type), tc('pr', 'Priority', r => r.prio),
        tc('st', 'Status', stTxt, 0, r => '<span class="oos-st ' + r.st + '">' + esc(stTxt(r)) + '</span>'),
        nc('in', 'In stock', r => r.s), nc('qm', 'Min order', r => r.qm),
        { k: 'am', l: 'Min AED', t: 'num', raw: r => r.am, disp: r => n0(r.am), cell: r => num(n0(r.am), prodSpec(r, 'how')) },
        nc('q', 'Max order', r => r.q),
        { k: 'a', l: 'Max AED', t: 'num', raw: r => r.aed, disp: r => n0(r.aed), cell: r => num(n0(r.aed), prodSpec(r, 'how')) },
        nc('on', 'On order', r => r.i, 1, 'orders'), nc('mn', 'Min', r => r.mn, 1), nc('mx', 'Max', r => r.mx, 1), nc('tg', 'Order up to', r => r.tgt, 1),
        { k: 'cv', l: 'Weeks left', t: 'num', x: 1, raw: r => r1(r.cov), disp: r => r1(r.cov).toFixed(1), cell: r => num(r1(r.cov).toFixed(1), prodSpec(r, 'how')) },
        tc('su', 'Supplier', r => r.sup, 1), tc('ca', 'Category', r => r.cat, 1)],
      total: rs => { const sal = {}; rs.forEach(r => { sal[r.b] = 1; }); const ns = Object.keys(sal).length, sp = rowsSpec('Products in the list, ' + scope(), rs, 'oos-list');
        return { p: '<b>' + num('Total: ' + plural(rs.length, 'product'), sp) + '</b>', s: ns + ' salon' + (ns === 1 ? '' : 's'), qm: num(nu(sum(rs, 'qm')), sp), am: num(n0(sum(rs, 'am')), sp), q: num(nu(sum(rs, 'q')), sp), a: num(n0(sum(rs, 'aed')), sp) }; },
      after: (T, rows) => {
        const c = $('oosClear'); if (c) c.hidden = !T.active();
        const n = rows.length, pages = T.pages(n), from = n ? T.page * T.shown + 1 : 0, to = Math.min(n, (T.page + 1) * T.shown);
        $('oosPgTxt').textContent = from + ' to ' + to + ' of ' + plural(n, 'product');
        $('oosPrev').disabled = T.page <= 0; $('oosNext').disabled = T.page >= pages - 1; $('oosPgN').textContent = 'Page ' + (T.page + 1) + ' of ' + pages;
      } });
    TS = TRSheet.table({ id: 'oosSup', el: '#oosSupTbl', rows: supRows,
      cols: [
        { k: 'su', l: 'Supplier', t: 'txt', raw: r => r.sup, disp: r => r.sup, cell: r => '<b>' + esc(r.sup) + '</b>' },
        { k: 'n', l: 'Products', t: 'num', raw: r => r.n, disp: r => String(r.n), cell: r => fig(n0(r.n), 'sup', '', r.sup) },
        { k: 'am', l: 'Min AED', t: 'num', raw: r => r.am, disp: r => n0(r.am), cell: r => fig(n0(r.am), 'sup', '', r.sup) },
        { k: 'a', l: 'Max AED', t: 'num', raw: r => r.aed, disp: r => n0(r.aed), cell: r => fig(n0(r.aed), 'sup', '', r.sup) }
      ].concat(B.map(c => ({ k: 'c' + c, l: BN[c] + ' max', t: 'num', x: 1, hide: () => !inSel(c), raw: r => r.by[c] ? r.by[c].aed : 0, disp: r => n0(r.by[c] ? r.by[c].aed : 0), cell: r => r.by[c] ? fig(n0(r.by[c].aed), 'sup', c, r.sup) : '0' }))),
      total: rs => { const o = { su: '<b>Total</b>', n: fig(n0(sum(rs, 'n')), 'all'), am: n0(sum(rs, 'am')), a: n0(sum(rs, 'aed')) }; B.forEach(c => { o['c' + c] = n0(rs.reduce((a, r) => a + (r.by[c] ? r.by[c].aed : 0), 0)); }); return o; } });
  }
  function paintW2() {
    const rs = selRows().filter(r => r.s <= 0), none = rs.filter(r => r.i === 0);
    $('oosW2').innerHTML = fig(n0(rs.length), 'out') + (rs.length === 1 ? ' product has' : ' products have') + ' nothing on the shelf, and ' + (none.length === rs.length && rs.length ? 'none of them has anything' : n0(none.length) + ' of them have nothing') + ' on order either. Start the order with those.' + (S.ordersOk ? '' : ' (On order is not loaded yet, so this count is not reliable.)');
  }

  // ── 3 BY SUPPLIER ────────────────────────────────────────────────────────────────────
  function supRows() {
    const rs = selRows().filter(r => r.q > 0), m = {};
    rs.forEach(r => { const o = m[r.sup] || (m[r.sup] = { sup: r.sup, n: 0, aed: 0, am: 0, by: {} }); o.n++; o.aed += r.aed; o.am += r.am; const b = o.by[r.b] || (o.by[r.b] = { n: 0, aed: 0 }); b.n++; b.aed += r.aed; });
    return Object.keys(m).map(k => m[k]).sort((a, b) => b.aed - a.aed || a.sup.localeCompare(b.sup));
  }
  function paintW3() {
    const rs = supRows(), tot = sum(rs, 'aed');
    if (!rs.length) { $('oosW3').textContent = 'Nothing to order for the salons picked.'; return; }
    $('oosW3').innerHTML = esc(rs[0].sup) + ' is ' + Math.round(100 * rs[0].aed / (tot || 1)) + '% of the maximum order (AED ' + fig(n0(rs[0].aed), 'sup', '', rs[0].sup) + ' maximum, ' + fig(n0(rs[0].am), 'sup', '', rs[0].sup) + ' minimum). Send that order first.';
  }

  // ── HOW IT IS WORKED OUT, ABOUT: one card at a time ──────────────────────────────────
  const HOW = {
    qmin: ['Minimum order', 'Up to Min x weeks, less the shelf and what is on order. Only when under Min x weeks. The least that gets the product back to cover.', e => num(nu(e.qm), prodSpec(e, 'how')) + ' = ' + nu(e.trig) + ' − ' + nu(e.s) + ' − ' + nu(e.i), e => esc(e.name) + ', ' + BN[e.b] + '. Min ' + nu(e.mn) + ', weeks ' + e.C + '.'],
    qty: ['Maximum order', 'Up to Max (or Min x weeks if that is more), less the shelf and what is on order. Only when under Min x weeks.', e => num(nu(e.q), prodSpec(e, 'how')) + ' = ' + nu(e.tgt) + ' − ' + nu(e.s) + ' − ' + nu(e.i), e => esc(e.name) + ', ' + BN[e.b] + '. Min ' + nu(e.mn) + ', Max ' + nu(e.mx) + ', weeks ' + e.C + '.'],
    use: ['Min and Max', 'Min is one week of use. Max is Min plus 3, or the number set in the plan.', e => 'Min ' + num(nu(e.mn), prodSpec(e, 'how')) + ' · Max ' + num(nu(e.mx), prodSpec(e, 'how')), e => esc(e.name) + ', ' + BN[e.b] + '. The order starts under Min x weeks.'],
    cover: ['Weeks left', 'Shelf and on order together, divided by the Min.', e => '(' + nu(e.s) + ' + ' + nu(e.i) + ') ÷ ' + nu(e.mn) + ' = ' + num(r1(e.cov).toFixed(1), prodSpec(e, 'how')), e => esc(e.name) + ', ' + BN[e.b] + '. Under 1 week means urgent.'],
    aed: ['AED', 'Units to order times the cost a unit on the Stock List, for the minimum and for the maximum order.', e => nu(e.qm) + ' × AED ' + e.c.toFixed(2) + ' = ' + num(n0(e.am), prodSpec(e, 'how')) + ' minimum · ' + nu(e.q) + ' × AED ' + e.c.toFixed(2) + ' = ' + num(n0(e.aed), prodSpec(e, 'how')) + ' maximum', () => 'Prices change: check the supplier list before sending.']
  };
  function paintHow() {
    const e = exRow(), pick = $('oosHpick'), card = $('oosHcard');
    pick.innerHTML = Object.keys(HOW).map(k => `<button type="button" class="${k === S.hk ? 'on' : ''}" aria-pressed="${k === S.hk}" data-how="${k}">${HOW[k][0]}</button>`).join('');
    if (!e) { card.innerHTML = '<div class="oos-hc-m">Nothing to order for the salons picked, so there is no example to work out.</div>'; return; }
    const h = HOW[S.hk];
    card.innerHTML = `<div class="oos-hc-t">${h[0]}</div><div class="oos-hc-m">${h[1]}</div><div class="oos-hc-big">${h[2](e)}</div><div class="oos-hc-cv">${h[3](e)}</div>`;
  }
  const ABOUT = {
    rule: ['The order rule', 'Order when shelf and on order are under Min x weeks. The minimum order goes up to Min x weeks. The maximum order goes up to Max.', 'If Min x weeks is higher than Max, the maximum goes up to Min x weeks too, so the two orders are the same.'],
    plan: ['Priority and type', 'Both come from the Weekly Product Plan, read live. Change them there, not here.', 'A is the first 80% of spend, or what the plan marks A.'],
    cover: ['Weeks of cover', '1 week as a rule. 2 weeks from 15 Nov to 31 Dec, for the busy weeks.', 'It moves the order point: Min x weeks. Change it with the picker at the top.'],
    mov: ['Which products', 'Priority A by default. A and B is a switch at the top. Products with Min 0 never show here.', 'Only the four UAE salons: Bahrain is not in these numbers.'],
    min: ['Min and Max', 'Min is one week of use. Max is Min plus 3, unless the plan sets its own number.', 'Edit them in the Weekly Product Plan, not here.'],
    fresh: ['How fresh', 'Shelf counts come from the Phorest Stock List. The date is under the answer at the top.', 'Run the daily reports to refresh it. On order counts the last 60 days.'],
    who: ['Who sees it', 'Level 4 and up, and anyone the Weekly Product Plan lets in. It reads the same plan.', 'The database refuses everyone else, whatever this page does.']
  };
  function paintAbout() {
    $('oosApick').innerHTML = Object.keys(ABOUT).map(k => `<button type="button" class="${k === S.ak ? 'on' : ''}" aria-pressed="${k === S.ak}" data-about="${k}">${ABOUT[k][0]}</button>`).join('');
    const a = ABOUT[S.ak]; $('oosAcard').innerHTML = `<div class="oos-hc-t">${a[0]}</div><div class="oos-hc-m">${a[1]}</div><div class="oos-hc-cv">${a[2]}</div>`;
  }

  // ── DRAW ─────────────────────────────────────────────────────────────────────────────
  function msg(html) { const m = $('oosMsg'); if (m) { m.innerHTML = html; m.hidden = !html; } const b = $('oosBody'); if (b) b.hidden = !!html; }
  function draw() {
    S.br = wantBranches();
    if (!S.built) {
      $('oosBody').innerHTML = skeleton(); S.built = true;
      buildTables(); wire();
      if (window.ResizeObserver && $('topbar')) { S.ro = new ResizeObserver(() => offsets()); S.ro.observe($('topbar')); }
    }
    msg('');
    paintNote(); paintAnswer(); paintBars(); TO.draw(); paintW2(); TS.draw(); paintW3(); paintHow(); paintAbout();
    offsets();
  }
  function wire() {
    const host = $('outofstockContent');
    host.addEventListener('click', e => {
      const v = e.target.closest('[data-of]');
      if (v) { S.filt = v.dataset.of; host.querySelectorAll('[data-of]').forEach(b => { b.classList.toggle('on', b === v); b.setAttribute('aria-pressed', b === v); }); TO.page = 0; TO.draw(); paintW2(); offsets(); return; }
      if (e.target.closest('#oosMore')) { TO.toggleMore(); e.target.closest('#oosMore').classList.toggle('on', TO.more); e.target.closest('#oosMore').setAttribute('aria-pressed', TO.more); offsets(); return; }
      if (e.target.closest('#oosMore3')) { TS.toggleMore(); e.target.closest('#oosMore3').classList.toggle('on', TS.more); e.target.closest('#oosMore3').setAttribute('aria-pressed', TS.more); return; }
      if (e.target.closest('#oosClear')) { TO.clear(); TO.draw(); return; }
      if (e.target.closest('#oosPrev')) { if (TO.page > 0) { TO.page--; TO.draw(); } return; }
      if (e.target.closest('#oosNext')) { TO.page++; TO.draw(); return; }
      const h = e.target.closest('[data-how]'); if (h) { S.hk = h.dataset.how; paintHow(); return; }
      const a = e.target.closest('[data-about]'); if (a) { S.ak = a.dataset.about; paintAbout(); return; }
    });
    host.addEventListener('change', e => {
      const id = e.target.id;
      if (id === 'oosPrio') { S.prio = e.target.value; TO.clear(); TS.clear(); TO.page = 0; draw(); }
      else if (id === 'oosCover') { S.cover = +e.target.value; TO.clear(); TS.clear(); TO.page = 0; draw(); }
      else if (id === 'oosRows') { TO.shown = +e.target.value || 10; TO.page = 0; TO.draw(); offsets(); }
    });
    $('oos-3').addEventListener('toggle', () => { if ($('oos-3').open) TS.draw(); offsets(); });
  }
  window.renderOutOfStock = async function renderOutOfStock() {
    const host = $('outofstockContent'); if (!host) return;
    if (!$('oosMsg')) {
      host.innerHTML = '<div class="oos-msg" id="oosMsg"></div><div id="oosBody"></div>';
      const intro = $('outofstockIntro');
      if (intro) intro.innerHTML = `<section class="slv-intro"><h2>Out of stock: what to order this week</h2><p>The products each salon is short of, and what it costs to top them up for the Monday order, as a minimum and a maximum order. Priority A to start with. The Branch at the top picks the salons. The Period does not apply here: the shelf is counted as it is now.</p></section>`;
    }
    const seq = ++S.seq;
    if (!S.rows) msg('Loading the order list…');
    try {
      await load(false);
      if (seq !== S.seq) return;
      if (S.state === 'denied') { msg('This page is for coordinators and above. Ask Kate if you need it.'); return; }
      draw();
    } catch (e) {
      console.error(e);
      if (seq === S.seq) msg('The order list did not load. <button type="button" class="cm-pill" id="oosRetry">Try again</button>');
      const r = $('oosRetry'); if (r) r.onclick = () => { S.rows = null; window.renderOutOfStock(); };
    }
  };
  window.addEventListener('resize', () => { if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'outofstock') offsets(); });
  window.addEventListener('scroll', () => { if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'outofstock') offsets(); }, { passive: true });

  // ── DOWNLOADS (report-export.js draws the buttons; page-export.js puts one pair in the masthead) ──
  const r2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
  const subtitle = () => scope() + ' · Priority ' + (S.prio === 'A' ? 'A' : 'A and B') + ' · ' + wk(cover()) + ' of cover · shelf of ' + shelfDate() + (S.ordersOk ? '' : ' · on-order counts not loaded yet, on order shows 0');
  const fileName = part => ['out-of-stock', part, scope()].map(slug).join('-');
  function orderSheet() {
    if (!S.rows || !TO) return null;
    const rows = TO.rows(); if (!rows.length) return null;
    const cols = [{ key: 'b', label: 'Salon', fmt: 'text' }, { key: 'sup', label: 'Supplier', fmt: 'text' }, { key: 'brand', label: 'Brand', fmt: 'text' }, { key: 'p', label: 'Product', fmt: 'text' }, { key: 'ty', label: 'Stock type', fmt: 'text' },
      { key: 'cat', label: 'Category', fmt: 'text' }, { key: 'pr', label: 'Priority', fmt: 'text' }, { key: 'st', label: 'Status', fmt: 'text' }, { key: 'in', label: 'In stock', fmt: 'num' }, { key: 'on', label: 'On order', fmt: 'num' },
      { key: 'mn', label: 'Min', fmt: 'num' }, { key: 'mx', label: 'Max', fmt: 'num' }, { key: 'tg', label: 'Order up to (max)', fmt: 'num' }, { key: 'cv', label: 'Weeks left', fmt: 'num' }, { key: 'qm', label: 'Min order', fmt: 'num' }, { key: 'q', label: 'Max order', fmt: 'num' },
      { key: 'c', label: 'Cost a unit (AED)', fmt: 'aed' }, { key: 'am', label: 'Min AED', fmt: 'aed' }, { key: 'a', label: 'Max AED', fmt: 'aed' }];
    const lines = rows.map(r => ({ cells: [BN[r.b], r.sup, r.brand, r.name, r.type, r.cat, r.prio, stTxt(r), r.s, r.i, r.mn, r.mx, r.tgt, r1(r.cov), r.qm, r.q, r2(r.c), r2(r.am), r2(r.aed)] }));
    return { name: 'Order list', title: 'Out of Stock: the order list', subtitle: subtitle() + '.', blocks: [{ cols, rows: lines }],
      legend: [['Min order', 'Up to Min x weeks, less the shelf and what is on order. Only when shelf and on order are under Min x weeks.'], ['Max order', 'Up to Max (or Min x weeks, if that is more), less the shelf and what is on order. Only when shelf and on order are under Min x weeks.'], ['Min', 'One week of use, from the Weekly Product Plan.'], ['Weeks left', 'Shelf and on order together, divided by Min.'], ['On order', 'Units on stock orders from the last 60 days that have not arrived.']] };
  }
  function supSheet() {
    if (!S.rows || !TS) return null;
    const rows = TS.rows(); if (!rows.length) return null;
    const cols = [{ key: 'su', label: 'Supplier', fmt: 'text' }, { key: 'n', label: 'Products', fmt: 'num' }, { key: 'am', label: 'Min AED', fmt: 'aed' }, { key: 'a', label: 'Max AED', fmt: 'aed' }].concat(B.filter(inSel).map(c => ({ key: 'c' + c, label: BN[c] + ' (max AED)', fmt: 'aed' })));
    const lines = rows.map(r => ({ cells: [r.sup, r.n, r2(r.am), r2(r.aed)].concat(B.filter(inSel).map(c => r2(r.by[c] ? r.by[c].aed : 0))) }));
    return { name: 'By supplier', title: 'Out of Stock: by supplier', subtitle: subtitle() + '.', blocks: [{ cols, rows: lines }] };
  }
  window.oosExportOrder = () => { const s = orderSheet(); return s ? { name: fileName('order-list'), csv: 0, sheets: [s] } : null; };
  window.oosExportSup = () => { const s = supSheet(); return s ? { name: fileName('by-supplier'), csv: 0, sheets: [s] } : null; };
  // The whole page in one workbook: the order list, then by supplier. The CSV is the order list.
  window.oosExportPage = () => { const a = orderSheet(); if (!a) return null; const b = supSheet(); return { name: fileName('page'), csv: 0, sheets: [a].concat(b ? [b] : []) }; };
})();
