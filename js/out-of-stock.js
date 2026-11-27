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
//     MINIMUM order = up to Min x cover (the order point), the least that gets the product back to cover; MAXIMUM order = up to the order point + (Max - Min), the plan's cushion above Min (Kate, 26 Nov 2026,
//     "yes" to the one rule proposed when Min x weeks went above Max and both orders came out equal). At 1 week a normal-week product has order point = Min, so Maximum = Max exactly as before.
//     AED = units to order x cost, for each of the two
//   status     out (nothing on the shelf), under 1 week (shelf + on order under Min), under N weeks (under the order point)
//
// Next week's bookings (Kate, 26 Nov 2026: "dapat ang bilang ng order ay base sa next week, Monday to Sunday, ayon sa future appointments"), from the local mockup docs/mockups/out-of-stock-demand.html:
//   - oos_demand() (migrations/out_of_stock_demand.sql): the colour services booked for next Monday to Sunday (Phorest Staff Appointments, kept fresh by the Phorest sync) and the last 12 finished weeks
//     (colour services done, and how many of them were booked by the same day of the week before). If it is missing or refuses, the page works as before on a normal week and says so.
//   - what is MEASURED: the bookings, the weeks before, the shelf, the orders on the way. What is ESTIMATED: how many colour services next week will end at. Pickup = done / booked-by-then over the 12 weeks;
//     pace = booked now x pickup; expected = half pace + half a normal week (the average of the 12 weeks). Factor = expected / a normal week. (Tried on 11 weeks leaving one out: a normal week alone missed 16%
//     on average per salon, this missed 7%.) NOT KNOWN: which client a tube was used on (Phorest does not record it, the usage report is a storeroom list), cancellations, holidays.
//   - the factor applies to COLOUR products only (the plan categories IGORA Vibrance, Royal, Zero Amm, Color 10, BLONDME, Vario, Color Expert); everything else stays on Min of a normal week.
//   - order point = Min x (the colour weeks counted, see below); Min order goes up to the order point, Max order to the order point + (Max - Min).
//   - the picker "Order for" turns it off (a normal week).
//   - WEEKS AFTER NEXT WEEK (Kate, 26 Nov 2026: "if naka x4 ibase mo pa rin sa succeeding next weeks"): cover of N weeks counts weeks 1 to N ahead, each with its own expected size. oos_demand() gives the four weeks
//     ahead, each with the history cut at that week's own lead (week 2 is 8 to 14 days away, week 3 15 to 21, week 4 22 to 28). Backtested 26 Nov 2026 on 11 weeks, leaving one out, per salon: a normal week alone
//     missed 16.1%; weeks 1 to 4 with a share w on the booking pace: w 0.5 missed 7.1% (week 1), w 0.5 8.2% (week 2), w 0.5 10.1% (week 3), w 0.25 10.6% (week 4; 0.5 was 11.4%). WTS below are those weights.
//     Colour order point = Min x (f1 + f2 + ... + fN), fk = expected colour services in week k / a normal week. Before this it was Min x (f1 + (N - 1)): the weeks after next week at a normal week.
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
  const S = { rows: null, lines: [], po: [], poOn: false, ordersOk: false, ordersAt: null, asof: {}, stockAt: {}, stamp: '', planAt: null, refreshedAt: null, state: 'loading', loadedAt: 0, ver: 0, seq: 0, br: B.slice(),
    prio: 'A', cover: 0, filt: 'all', hk: 'qty', ak: 'rule', built: false, ro: null, dem: null, demInfo: null, dm: 'book', ai: {}, demAll: null,
    refreshing: false, refMsg: '', edits: {}, skips: {}, counts: {}, verified: {}, editWho: {}, canEdit: false, editDay: '', eds: 0, edSig: '', dirty: false, bulk: null, bulkOff: false, bulkSig: '', edFail: false };   // edits / skips: what was typed in or ticked off for this order day, by plan row key (oos_order_edits_get)
  let TO = null, TS = null, TB = null, memoM = {};

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
  // Exact date and time in Dubai, for "last sync" (Kate, 26 Nov 2026: "put exact date and time for last sync"): 26 Nov 2026, 10:07 am
  const fdt = ts => {
    if (!ts) return '';
    const d = new Date(ts); if (isNaN(d)) return '';
    const day = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }), t = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai', hour: 'numeric', minute: '2-digit', hour12: true });
    return fd(day) + ', ' + t.replace(/\s?([ap])m/i, (m, x) => ' ' + x.toLowerCase() + 'm');
  };
  const ln = h => '<span class="oos-ln">' + h + '</span>';   // one idea a line
  const daysBetween = (a, b) => Math.round((isoD(b) - isoD(a)) / 864e5);
  // Supplier by brand, from the Orders and Receipts page (Kate, 26 Nov 2026: "magbase na sa orders and receipts dashboard"). The Weekly Product Plan only names DBD, Eideal and Madi, and
  // every product with no supplier of its own counted as DBD. The names here are the suppliers of the Orders and Receipts page, spelled the same (DBD, MADI, EIDEAL, NEU, BS PRO, VIVANDI,
  // APOTHECA, H2O). Which brand goes to which was read off that page's own mail on 26 Nov 2026 (mail_documents, Jan 2024 to Nov 2026): item lines of DBD orders and invoices (Schwarzkopf, ABC,
  // Caviar, Fibre Clinix, STMNT), BS PRO invoices (Beauty Works, Celebrity Choice); the orders, statements and messages of NEU (Evo Fab Pro), EIDEAL (Olaplex), VIVANDI (Vivandi, Malibu),
  // APOTHECA (Philip B) and H2O (Pure Blue). MADI and its brands (Kevin Murphy, K18, Orly, Cloud Nine) come from the 13 Nov stock meeting: MADI sends statements with no item list. Bellami and Matis
  // are named in DBD's mail only (no item lines), so they are the weakest links. A brand with no supplier on that page shows as "Not linked yet", never as DBD. A supplier the plan names itself is kept.
  const SUPPLIERS = [
    ['MADI', /kevin murphy|\bk-?18\b|\borly\b|reflectosil|\bmadi\b|cloud ?nine|styling tool/i],
    ['EIDEAL', /eideal|olaplex|amazon|^keratin$/i],
    ['NEU', /\bevo\b|fabuloso|fab pro/i],
    ['BS PRO', /beauty ?works|celebrity choice/i],
    ['VIVANDI', /vivandi|malibu/i],
    ['APOTHECA', /philip b\b/i],
    ['H2O', /pure blue/i],
    ['DBD', /schwar[sz]k|authentic beauty|\babc\b|caviar|alterna|fibre clinix|stmnt|bellami|^matis/i]];
  const NOSUP = 'Not linked yet';
  function supplierOf(planSup, brand, name) {
    // Since 26 Nov 2026 the Weekly Product Plan carries this same map itself (plan_scope, migrations/plan_scope_suppliers.sql), so what it names is used as it is. A plan that still says DBD
    // only because DBD was its default goes through the brand map below, so this page is right before and after that change reaches the database.
    if (planSup && /^not linked yet$/i.test(planSup)) return NOSUP;
    if (planSup && !/^dbd$/i.test(planSup)) return String(planSup).toUpperCase();   // the plan named one itself: spelled as the Orders and Receipts page spells it
    const b = String(brand || '');
    for (const [n, re] of SUPPLIERS) if (re.test(b)) return n;
    if (planSup) {   // the plan says DBD only because that is its default: look at the product name too
      for (const [n, re] of SUPPLIERS) if (re.test(name || '')) return n;
    }
    return NOSUP;
  }
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
    // Kate, 26 Nov 2026: whatever ate Tine changes in the Weekly Product Plan (Priority A or B, Min, Max, type) must show here ASAP. The data is read live from the plan's own function every time,
    // so the only delay was this page's 5 minute memory. It is 15 seconds now (just to avoid a double read), and the page asks for the plan's change stamp every 45 seconds while it is open (see checkStamp).
    if (!force && S.rows && Date.now() - S.loadedAt < 15000) return;
    const callStamp = Promise.resolve(sb.rpc('oos_plan_stamp')).then(r => r, e => ({ error: e }));   // asked first: an edit that lands during the read is caught by the next check
    const callPlan = sb.rpc('oos_plan');
    const callOrd = Promise.resolve(sb.rpc('oos_on_order')).then(r => r, e => ({ error: e }));   // the migration may not be applied yet
    const callDem = Promise.resolve(sb.rpc('oos_demand')).then(r => r, e => ({ error: e }));
    const callEd = Promise.resolve(sb.rpc('oos_order_edits_get')).then(r => r, e => ({ error: e }));   // the migration may not be applied yet: then the Order column cannot be typed in
    const callBulk = Promise.resolve(sb.rpc('oos_bulk_get')).then(r => r, e => ({ error: e }));   // the open bulk order (BO number), its ticks and locked numbers; the migration may not be applied yet
    const callPO = fetchPO();   // confirmed supplier orders (after a look for new DBD replies); the migration may not be applied yet
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
    S.stockAt = d.stock_loaded || {};
    const dr = await callDem, dd = dr && !dr.error ? dr.data : null;
    if (dd && !dd.denied && dd.salons) { S.dem = demandOf(dd); S.demAll = dd.all || null; S.demInfo = { from: dd.week_from, to: dd.week_to, lead: dd.lead, synced: dd.synced, weeks: dd.weeks || [] }; } else { S.dem = null; S.demAll = null; S.demInfo = null; }
    const sr = await callStamp, sd = sr && !sr.error ? sr.data : null;
    S.stamp = sd && !sd.denied ? JSON.stringify(sd) : ''; S.planAt = sd && !sd.denied ? sd.plan || null : null;
    const er = await callEd, bkr = await callBulk;
    applyBulk(bkr);
    // 27 Nov 2026 (Kate: "everytime na eexit nawawala", ticks and amounts back to the defaults): a read that failed (the database was slow) used to be treated as "nothing saved" and drew the defaults.
    // Now a failed read keeps what was on screen and says so; the 45 second check reads again and puts the saved ticks and amounts back by itself.
    if (er && !er.error) { applyEdits(er.data); S.edFail = false; } else { S.edFail = true; if (!S.edSig) applyEdits(null); }
    setPO(await callPO);
    memoM = {};
    build(d.rows || []);
    S.loadedAt = Date.now(); S.ver++; S.state = 'ok';
  }
  // The amounts typed in for the order, and the products ticked off it (Kate, 26 Nov 2026: "pwede rin dapat mag edit ng amount to order para yun yung lalabas na oorderin", "pwede rin x or check
  // for products para mawala or i include sa order"). Kept in oos_order_edits per order day (the Monday the order goes out), the same for everyone who opens the page; only those who may edit the
  // Weekly Product Plan can change them. Quantity = the amount typed in, else the MINIMUM order (Kate with ate Tine, 26 Nov 2026: it starts at the minimum and she adjusts); a product ticked off counts as 0 in the order (what was typed is kept in case it is put back).
  function applyEdits(d) {
    if (d && !d.denied) { S.edits = d.edits || {}; S.skips = d.skips || {}; S.counts = d.counts || {}; S.verified = d.verified || {}; S.editWho = d.who || {}; S.canEdit = !!d.can_edit; S.editDay = d.day || ''; }
    else { S.edits = {}; S.skips = {}; S.counts = {}; S.verified = {}; S.editWho = {}; S.canEdit = false; S.editDay = ''; }
    S.edSig = JSON.stringify([S.editDay, S.edits, S.skips, S.counts, S.verified]);
  }
  const whoTxt = k => { const w = S.editWho[k]; return !w ? '' : w === 'you' ? 'you' : String(w).split('@')[0]; };
  // ov = the amount in the box, sk = ticked off, o = what counts in the order
  // lockQ: while a bulk order (BO number) is open, a quantity nobody typed stays at the figure it had when the numbers were locked, so a stock refresh does not move it. It only applies for the
  // Priority, weeks of cover and Order for the numbers were locked with (a different setting is a different order: the live figure shows).
  const lockSig = () => S.prio + '|' + cover() + '|' + S.dm;
  const NOLOCK = {};
  const lockQ = () => { const b = S.bulk; return b && b.lock && b.lock.q && b.lock.sig === lockSig() ? b.lock.q : NOLOCK; };
  function ordOf(key, q) { const ed = S.edits[key], lk = lockQ()[key], oe = ed != null, sk = !!S.skips[key], ov = oe ? +ed : (lk != null ? +lk : q); return { oe, sk, ov, o: sk ? 0 : ov }; }
  // a whole number, 0 or more; '' = put the calculated amount back (null); NaN = not a number
  function parseQty(t) { t = String(t == null ? '' : t).trim(); if (t === '') return null; const n = Math.round(+t); return (isFinite(n) && n >= 0 && n <= 100000) ? n : NaN; }
  const sigNow = () => { S.edSig = JSON.stringify([S.editDay, S.edits, S.skips, S.counts, S.verified]); };
  async function commitSkip(key, skip) {
    if (!!S.skips[key] === !!skip) return false;
    const r = await sb.rpc('oos_order_skip_set', { p_key: key, p_skip: !!skip });
    if (r.error) throw r.error;
    if (r.data && r.data.denied) throw new Error('not allowed');
    if (skip) S.skips[key] = true; else delete S.skips[key];
    S.editWho[key] = 'you'; S.eds++; memoM = {}; sigNow(); S.dirty = true;
    return true;
  }
  // returns true when something was saved. An amount typed for a product that was ticked off puts it back in the order.
  async function commitEdit(key, v) {
    const cur = all().filter(r => r.key === key)[0];
    if (cur) {
      if (v == null && !cur.oe) return false;
      if (v != null && cur.oe && v === cur.ov) return false;
      if (v != null && !cur.oe && v === (lockQ()[key] != null ? +lockQ()[key] : cur.qm)) return false;   // the same as the minimum order (or the locked figure): nothing to keep
    }
    const r = await sb.rpc('oos_order_edit_set', { p_key: key, p_qty: v });
    if (r.error) throw r.error;
    if (r.data && r.data.denied) throw new Error('not allowed');
    if (v == null) delete S.edits[key]; else S.edits[key] = v;
    S.editWho[key] = 'you'; S.eds++; memoM = {}; sigNow(); S.dirty = true;
    if (v != null && S.skips[key]) await commitSkip(key, false);
    return true;
  }
  // The shelf figure can be counted and verified (Kate, 26 Nov 2026: ate Tine says the stock shown is not always accurate, "need sya i verify lagi"): Counted = the number really on the shelf, used instead of the Stock List
  // figure for this order (typing one also verifies the product); Verified = someone checked the figure, with who and when. Kept per order day in oos_stock_counts. Nothing in Phorest's data is changed.
  const vfWho = v => !v ? '' : v.by === 'you' ? ' by you' : v.by ? ' by ' + String(v.by).split('@')[0] : '';
  const vfTip = r => { const v = S.verified[r.key]; return v ? 'Verified' + vfWho(v) + (v.at ? ', ' + fdt(v.at) : '') : 'Not verified yet. Tick when the shelf figure has been checked.'; };
  async function commitCount(key, v) {
    const cur = all().filter(r => r.key === key)[0];
    if (cur && ((v == null && !cur.cn) || (v != null && cur.cn && v === cur.s && cur.vf))) return false;
    const r = await sb.rpc('oos_count_set', { p_key: key, p_counted: v });
    if (r.error) throw r.error;
    if (r.data && r.data.denied) throw new Error('not allowed');
    if (v == null) delete S.counts[key]; else { S.counts[key] = v; S.verified[key] = { by: 'you', at: new Date().toISOString() }; }
    S.eds++; memoM = {}; sigNow(); S.dirty = true;
    return true;
  }
  async function commitVerify(key, on) {
    if (!!S.verified[key] === !!on) return false;
    const r = await sb.rpc('oos_verify_set', { p_key: key, p_verified: !!on });
    if (r.error) throw r.error;
    if (r.data && r.data.denied) throw new Error('not allowed');
    if (on) S.verified[key] = { by: 'you', at: new Date().toISOString() }; else delete S.verified[key];
    S.eds++; memoM = {}; sigNow(); S.dirty = true;
    return true;
  }
  const vfLine = () => { const lr = orderRows(), nv = lr.filter(r => r.vf).length; return '<b>Shelf figures verified:</b> ' + n0(nv) + ' of ' + n0(lr.length) + ' on this list. The rest are the Stock List as it was read: check them before the order goes out.'; };
  // Refresh stock now (Kate, 26 Nov 2026, after ate Tine found the shelf figure can be hours old: "bantayan lang tlga na tama"). The edge function oos-stock-refresh reads the salons picked straight from
  // Phorest's API (about 15 seconds a salon) and updates today's shelf figures in place (migrations/out_of_stock_stock_apply.sql); then the page reads everything again. Counted and Verified are kept.
  async function refreshStock() {
    if (S.refreshing || !S.br.length) return;
    S.refreshing = true; S.refMsg = 'Reading ' + S.br.map(c => BN[c]).join(', ') + ' from Phorest. About 15 seconds.'; paintAnswer();
    try {
      const r = await sb.functions.invoke('oos-stock-refresh', { body: { salons: S.br } });
      if (r.error) { let m = ''; try { m = (await r.error.context.json()).error; } catch (e) { /* no body */ } throw new Error(m || 'Phorest could not be read just now.'); }
      const d = r.data || {}; if (d.error) throw new Error(d.error);
      const rs = d.results || [], bad = rs.filter(x => !x.ok), skip = rs.filter(x => x.ok && x.skipped), good = rs.filter(x => x.ok && !x.skipped);
      await load(true); S.refreshedAt = new Date().toISOString(); draw();
      const parts = [];
      if (good.length) parts.push('Read from Phorest at ' + fdt(S.refreshedAt).replace(/^.*, /, '') + ': ' + good.map(x => BN[x.salon] + ' ' + n0(x.changed) + ' changed').join(', ') + '.');
      if (skip.length) parts.push(skip.map(x => BN[x.salon]).join(', ') + ' was read less than 30 seconds ago.');
      if (bad.length) parts.push(bad.map(x => BN[x.salon] + ': ' + x.error).join(' '));
      S.refMsg = parts.join(' ') || 'Nothing to read.';
    } catch (e) { console.error(e); S.refMsg = (e && e.message) || 'Phorest could not be read just now.'; }
    S.refreshing = false; paintAnswer();
  }
  // a figure that is 0 is faded, in the cells and in a Quantity box (Kate, 26 Nov 2026: "yung mga naka 0, faded color dapat para ndi nakakalito"); the total row is left alone
  function fadeZeros(sel) {
    document.querySelectorAll(sel + ' tbody tr:not(.sx-tot) td.r').forEach(td => { const i = td.querySelector('input[type=number]'), t = (i ? i.value : td.textContent).replace(/[^0-9.\-]/g, ''); td.classList.toggle('oos-zero', t !== '' && +t === 0 && !/[1-9]/.test(t)); });
  }
  function refreshLists() { S.dirty = false; if (!TO || !S.built) return; TO.draw(); paintW2(); TS.draw(); paintW3(); }
  const edMsg = t => { const m = $('oosEdMsg'); if (m) { m.textContent = t || ''; m.hidden = !t; } };
  const tipOf = (r, f) => f.sk ? 'Taken out of the order. Tick it to put it back.' : f.oe ? 'Typed in' + (whoTxt(r.key) ? ' by ' + whoTxt(r.key) : '') + '. The minimum order is ' + nu(r.qm) + '. Clear it to go back.' : 'Starts as the minimum order. Type the amount you will order (up to the maximum if you want more).';
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
      const mn = +r[MIN] > 0 ? +r[MIN] : 0;   // 27 Nov 2026 (Kate, ate Tine: "dapat nandyan pa rin lahat"): a plan row with no Min is kept too, so a quantity can still be typed for it; it stays out of every count and the order list until it is typed or ticked (see all())
      const key = String(r[K] || ''), parts = key.split('|');
      const bc = parts.length >= 4 ? parts[parts.length - 1].replace(/\D/g, '').slice(0, 12) : '';
      const orig = parts.length >= 4 ? parts.slice(2, -1).join('|') : '';
      let ls = bc.length >= 12 ? (byBc[b + '|' + bc] || []) : [];
      if (!ls.length) ls = (byNm[b + '|' + norm(orig)] || []).concat(norm(r[NAME]) === norm(orig) ? [] : (byNm[b + '|' + norm(r[NAME])] || []));
      ls = ls.filter(l => !l.used); ls.forEach(l => { l.used = true; });
      const stk = r[STK];
      rows.push({ id: rows.length, key, b, brand: brandOf(r[BRAND] || ''), name: String(r[NAME] || '').replace(/\s+/g, ' ').trim(), type: r[TYPE] === 'r' ? 'Retail' : 'Professional',
        s: Math.max(+stk || 0, 0), neg: stk != null && +stk < 0, noshelf: stk == null, mn, nomin: !(mn > 0), mx: +r[MAX] > 0 ? +r[MAX] : mn, c: +r[COST] || 0, nocost: r[COST] == null,
        sup: supplierOf(r[SUP], r[BRAND], r[NAME]), cat: r[CAT] || '', prio: r[PRIO] || 'B', flag: r[FLAG] || 0, lines: ls, i: ls.reduce((a, l) => a + l.u, 0) });
    });
    S.rows = rows;
  }
  // ── NEXT WEEK'S BOOKINGS: the colour factor per salon ───────────────────────────────
  const COLC = ['igora vibrance', 'igora royal', 'igora zero amm', 'igora color 10', 'blondme', 'vario', 'color expert'];   // the plan categories that follow the colour services
  const isCol = cat => COLC.indexOf(norm(cat)) >= 0;
  const r2f = x => Math.round(x * 100) / 100;
  const pctUp = f => (f >= 1 ? '+' : '') + Math.round((f - 1) * 100) + '%';
  // d = the oos_demand() answer: per salon now_k (booked for each of the four weeks ahead), hist [[week, done, booked by the lead of week 1, 2, 3, 4]] (last 12 finished weeks), grp_k [[kind, n]] per week.
  // The old answer (now, hist as [week, done, booked], grp) is read too, as week 1 only.
  const CAPX = 1.2;   // a week cannot be more than 20% above the busiest of the last 12 weeks (the chairs are limited; December booking far ahead made weeks 2 and 3 double a normal week)
  const WTS = [0.5, 0.5, 0.5, 0.25];   // the share put on the booking pace for week 1 to 4 ahead (backtest above); the rest goes on a normal week
  function demandOf(d) {
    const out = {}, wi = (d.weeks && d.weeks.length) ? d.weeks : [{ k: 1, from: d.week_from, to: d.week_to, lead: d.lead }];
    B.forEach(c => {
      const x = (d.salons || {})[c] || {}, h = x.hist || [], n = h.length, nk = x.now_k || [+x.now || 0];
      const sc = h.reduce((a, y) => a + (+y[1] || 0), 0), typ = n ? sc / n : 0, cap = Math.round(CAPX * h.reduce((a, y) => Math.max(a, +y[1] || 0), 0));
      const wk = wi.map((w, i) => {
        const has = n > 0 && h.every(y => y.length > 2 + i), sbk = has ? h.reduce((a, y) => a + (+y[2 + i] || 0), 0) : 0, pick = sbk > 0 ? sc / sbk : 0, usual = has && n ? sbk / n : 0, now = +nk[i] || 0, pace = pick * now;
        const ok = has && n >= 4 && typ > 0 && pick > 0 && i < WTS.length, g = ok ? WTS[i] : 0, exp0 = ok ? Math.round(g * pace + (1 - g) * typ) : Math.round(typ), capped = ok && cap > 0 && exp0 > cap, exp = capped ? cap : exp0, f = ok ? r2f(exp / typ) : 1;
        return { k: i + 1, from: w.from, to: w.to, lead: w.lead, now, cl: +((x.cl_k || [])[i]) || 0, usual, pick, pace, exp, f, ok, g, capped, cap, grp: (x.grp_k && x.grp_k[i]) || (i === 0 ? (x.grp || []) : []) };
      });
      const w1 = wk[0] || { now: 0, cl: 0, usual: 0, pick: 0, pace: 0, exp: 0, f: 1, ok: false, grp: [] };
      out[c] = { hist: h, n, typ, wk, cum: x.cl_cum || [], gcum: x.grp_cum || [], now: w1.now, usual: w1.usual, pick: w1.pick, pace: w1.pace, exp: w1.exp, f: w1.f, ok: w1.ok, grp: w1.grp };
    });
    return out;
  }
  // the colour weeks counted for a cover of C weeks: f1 + f2 + ... + fC (a week with no figure counts as a normal week, 1)
  const fSum = (bk, C) => { let t = 0; for (let k = 0; k < C; k++) t += (bk.wk[k] && bk.wk[k].ok) ? bk.wk[k].f : 1; return t; };
  const demOn = () => !!(S.dem && S.dm === 'book');
  function rangeOf(w) {
    const a = String(w.from).slice(0, 10), z = String(w.to).slice(0, 10);
    return (+a.slice(8)) + (a.slice(5, 7) === z.slice(5, 7) ? '' : ' ' + MON[+a.slice(5, 7) - 1]) + ' to ' + fd(z).replace(/ \d{4}$/, '') + ' ' + z.slice(0, 4);
  }
  function rangeTxt(k) {
    const i = S.demInfo; if (!i) return 'next week';
    return rangeOf((i.weeks && i.weeks[(k || 1) - 1]) || { from: i.from, to: i.to });
  }
  const demTxt = r => (r.col && S.dm === 'book') ? 'x ' + (r.fw / r.C).toFixed(2) + ' booked' : 'Normal week';
  // trig = the order point. Colour: Min x (f1 + f2 + ... + fC), each week ahead at its own expected size. Everything else, and colour when bookings are off: Min x C.
  // Orders are whole units: when the colour weeks make the order point fractional it is rounded to the nearest whole unit (so a Min of 1 does not jump to 3).
  // target = trig + the plan's cushion (Max - Min, never below 0), have = shelf + on order. When have is under trig: maximum order q = target - have, minimum order qm = trig - have.
  // So Max is never below Min x weeks and the gap stays what the plan sets. At 1 week for a product that is not scaled, trig = Min and the target is Max, as it always was.
  function enrich(r, C, dm) {
    const cn = S.counts[r.key];   // counted on the shelf: used instead of the Stock List figure
    if (cn != null) r = Object.assign({}, r, { s0: r.s, s: +cn, neg: false, noshelf: false });
    const bk = S.dem && S.dem[r.b], col = !!(bk && bk.ok && isCol(r.cat)), on = dm === 'book' && col, f = on ? bk.f : 1, fw = on ? fSum(bk, C) : C;
    const raw = r.mn * fw, trig = on ? Math.round(raw) : raw, cush = Math.max(r.mx - r.mn, 0), tgt = trig + cush, have = r.s + r.i, q = have < trig ? tgt - have : 0, qm = have < trig ? trig - have : 0, st = r.s <= 0 ? 'out' : (have < r.mn ? 'u1' : 'ok');
    const od = ordOf(r.key, qm);   // Quantity: the amount typed in, else the maximum order; 0 when the product is ticked off
    return Object.assign({}, r, { C, col, f, fw, trig, cush, tgt, have, q, aed: q * r.c, qm, am: qm * r.c, cov: r.mn > 0 ? have / r.mn : (have > 0 ? 99 : 0), st, ov: od.ov, o: od.o, oa: od.o * r.c, oe: od.oe, sk: od.sk, cn: cn != null, s0: cn != null ? r.s0 : r.s, vf: !!S.verified[r.key] });
  }
  // allX = every plan row (Min or not); all = the rows that count: with a Min, or a quantity typed in, or ticked off. The "Every product" view of the order list reads allX.
  function allX(dm) {
    dm = dm || S.dm;
    const C = cover(), k = S.ver + '|' + S.eds + '|' + S.prio + '|' + C + '|' + dm;
    if (!memoM[k]) {
      if (Object.keys(memoM).length > 24) memoM = {};
      memoM[k] = (S.rows || []).filter(r => PRIOS[S.prio].indexOf(r.prio) >= 0).map(r => enrich(r, C, dm))
        .sort((a, b) => SALORD[a.b] - SALORD[b.b] || a.cat.localeCompare(b.cat, undefined, { sensitivity: 'base' }) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));   // Kate, 26 Nov 2026: the default order is A to Z by category (ate Tine found the old order, urgent first, mixed up)
    }
    return memoM[k];
  }
  function all(dm) {
    dm = dm || S.dm;
    const k = S.ver + '|' + S.eds + '|' + S.prio + '|' + cover() + '|' + dm + '|v';
    if (!memoM[k]) memoM[k] = allX(dm).filter(r => !r.nomin || r.oe || r.sk);
    return memoM[k];
  }
  const selRows = () => all().filter(r => inSel(r.b));
  const selRowsX = () => allX().filter(r => inSel(r.b));
  const listed = r => r.q > 0 || r.oe || r.sk;   // in the order list: it needs one, or an amount was typed in for it, or it was ticked off (so it can be put back)
  const stX = r => (r.q > 0 || r.s <= 0) ? stTxt(r) : r.nomin ? 'No Min in the plan' : (r.s <= r.mn ? 'Low stock' : 'Not due');   // Low stock = the shelf is at or under Min but the rule does not order it
  const lowOf = r => r.s > 0 && r.s <= r.mn && !listed(r);
  const stTxt = r => r.st === 'out' ? (r.noshelf ? 'Not on Stock List, check shelf' : r.neg ? 'Minus on the list, check shelf' : r.i > 0 ? 'Out, ' + nu(r.i) + ' on order' : 'Out now') : r.st === 'u1' ? 'Under 1 week' : r.nomin ? 'No Min in the plan' : 'Under ' + wk(r.C);
  function salTot(c) {
    const rs = all().filter(r => r.b === c), o = rs.filter(r => r.q > 0);
    return { n: o.length, out: rs.filter(r => r.s <= 0).length, u1: o.filter(r => r.s > 0 && r.have < r.mn).length, aed: sum(o, 'aed'), units: sum(o, 'q'), aedm: sum(o, 'am'), unitsm: sum(o, 'qm') };
  }
  // How fresh the shelf data is, from stock_asof (a date per salon): the oldest one picked decides.
  function fresh() {
    const known = S.br.filter(c => S.asof[c]).map(c => ({ c, d: String(S.asof[c]).slice(0, 10), t: S.stockAt[c] || null }));
    if (!known.length) return { text: ln('<b>Shelf counts:</b> date not known. Run the daily reports before the order goes out.'), stale: true, days: null };
    const old = known.reduce((a, x) => x.d < a.d ? x : a), days = daysBetween(old.d, dubaiToday()), same = known.every(x => x.d === old.d);
    const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
    const oldT = known.filter(x => x.t).reduce((a, x) => !a || x.t < a ? x.t : a, null);   // the oldest salon decides
    const when = oldT ? fdt(oldT) : fd(old.d);
    const who = same ? '' : ' (oldest: ' + BN[old.c] + ')';
    return { days, stale: days > 1, date: fd(old.d), at: oldT ? fdt(oldT) : '', text: ln('<b>Shelf counts:</b> ' + when + who + ', ' + ago) + (days > 1 ? ln('<b>Old.</b> Run the daily reports before the order goes out.') : '') };
  }
  const shelfDate = () => { const f = fresh(); return f.date || 'an unknown date'; };

  // ── WINDOWS (drill.js): what is behind a figure ──────────────────────────────────────
  // The products behind a figure. f = all (to order), out (nothing on the shelf), u1 (under a week left), sup (one supplier's order). sal = one salon, '' = the salons picked.
  function groupRows(f, sal, sup) {
    const rs = all().filter(r => sal ? r.b === sal : inSel(r.b));
    if (f === 'out') return rs.filter(r => r.s <= 0);
    if (f === 'u1') return rs.filter(r => r.q > 0 && r.s > 0 && r.have < r.mn);
    if (f === 'sup') return rs.filter(r => listed(r) && r.sup === sup);
    return rs.filter(listed);
  }
  const gTitle = (f, sal, sup) => { const L = sal ? BN[sal] : scope(); return f === 'out' ? 'Out now, ' + L : f === 'u1' ? 'Under 1 week left, ' + L : f === 'sup' ? sup + ' order, ' + L : 'Products to order, ' + L; };
  // a figure that opens the products behind it; plain when the list is empty
  // One supplier's order window. Its title is a dropdown of every supplier with products to order for the same salons, so the person can move between suppliers without closing it (Kate, 27 Nov 2026).
  function supSpec(sup, sal) {
    const rs = groupRows('sup', sal, sup); if (!rs.length) return null;
    const sp = rowsSpec(gTitle('sup', sal, sup), rs, slug('oos-sup' + (sal ? '-' + sal : '') + '-' + sup), true, all().filter(r => (sal ? r.b === sal : inSel(r.b)) && r.sup === sup && lowOf(r)), sup);
    const tot = {}; all().filter(r => (sal ? r.b === sal : inSel(r.b)) && listed(r)).forEach(r => { tot[r.sup] = (tot[r.sup] || 0) + (+r.aed || 0); });
    const names = Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
    if (names.length > 1) sp.titleSwitch = { label: 'Supplier', value: sup, options: names.map(n => ({ value: n, label: n + ' order' })), suffix: ', ' + (sal ? BN[sal] : scope()), pick: v => supSpec(v, sal) };
    return sp;
  }
  const fig = (txt, f, sal, sup) => { if (f === 'sup') { const sp = supSpec(sup, sal); return sp ? num(txt, sp) : txt; } const rs = groupRows(f, sal, sup); return rs.length ? num(txt, rowsSpec(gTitle(f, sal, sup), rs, slug('oos-' + f + (sal ? '-' + sal : '')), false, null, '')) : txt; };
  // Email the order to the supplier (Kate, 26 Nov 2026: "lagyan mo ng email to dbd beh hanapin mo na lang emails ng dbd"). The addresses are the ones the Tara Rose info@ mailbox really sent the DBD orders to in
  // Nov 2026 (ORDER FOR SAADIYAT / MOTORCITY / KHALIFA CITY A BRANCH, Al Quoz Branch - Order Forms): Margie Jala (invoicing since Reina left, 3 Jun 2026), Mohamed Abassi, Bassam Moujalli and Jonnah Rodilla;
  // ate Tine (Cristine) copied as she was on the Saadiyat orders. Mandy Loewigt (account manager) was added after the 26 Nov meeting with ate Tine, who sends every order to Bassam, Mandy, Mohamed (Abasi), Margie (Marcy) and Jonnah (Jona) and copies her own work Gmail so she sees the replies away from the salon; Asmaa she adds only sometimes, so she is not in the default. The button OPENS a Gmail draft
  // from info@ for the person to read and send; the page never sends anything. The order is read from the page at the click, so typed quantities and ticked-off products are in it.
  // (the old free-form Email to DBD is gone, replaced by the standard email below, 26 Nov 2026)
  const SUP_MAIL = { DBD: { from: 'info@tararosesalon.com', to: ['bassam.m@dbdholding.com', 'mandy.l@dbdholding.com', 'mohamed.a@dbdholding.com', 'margie.j@dbdholding.com', 'jonnah.r@dbdholding.com'], cc: ['cristine.tararose@gmail.com'] } };
  // Confirm order (Kate, 26 Nov 2026: "put confirm order button ... we must have our own internal order number"; step 1 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md).
  // One confirm = one order per salon, numbered TRS-PO-<YY>-<0001..> by the database (oos_order_confirm). The lines are copied in as they are now (typed quantities and ticked-off products included).
  // Nothing is sent to the supplier by this: Email to DBD is still a Gmail draft a person sends. Needs out_of_stock_supplier_orders.sql applied; until then the button says so.
  const setPO = r => { const d = r && !r.error ? r.data : null; S.poOn = !!(d && !d.denied && Array.isArray(d.orders)); S.po = S.poOn ? d.orders : []; };
  // DBD's out-of-stock replies are looked for first (oos_replies_scan, safe to repeat), then the orders are read
  async function fetchPO() { try { await sb.rpc('oos_sent_scan'); await sb.rpc('oos_replies_scan'); } catch (e) { /* not applied yet, or no access: the orders are still read */ } return Promise.resolve(sb.rpc('oos_orders_get')).then(r => r, e => ({ error: e })); }
  async function loadPO() { setPO(await fetchPO()); }
  const openOrders = (sup, sals) => S.po.filter(o => o.supplier === sup && o.status !== 'cancelled' && o.day === S.editDay && sals.indexOf(o.branch) >= 0);
  const PO_ST = { confirmed: 'confirmed', sent: 'sent to DBD', oos_reply: 'DBD replied', oos_confirmed: 'out of stock confirmed with DBD', on_the_way: 'on the way', invoiced: 'invoiced' };
  const poFmt = o => o.order_no + ' (' + BN[o.branch] + ', ' + plural(o.n_lines, 'product') + ', ' + (PO_ST[o.status] || o.status) + (o.status === 'invoiced' && o.invoice_amount ? ', invoice ' + A(o.invoice_amount) : '') + (o.status === 'oos_reply' ? ': <b>' + plural(o.oos_items || 0, 'item') + ' out of stock' + (o.oos_decided ? ', decision saved' : ', needs a decision') + '</b>' : '') + ')';
  const poOff = e => /oos_order|schema cache|does not exist|Could not find/i.test(String(e && (e.message || e)) + String(e && e.code || '')) ? 'Confirm order is not switched on yet: the database step (out_of_stock_supplier_orders.sql) is waiting to be applied.' : 'That did not work: ' + String(e && e.message || e);
  async function confirmOrder(sup, keys, quiet) {
    if (!S.canEdit) return 'Only people who may edit the Weekly Product Plan can confirm an order.';
    const rs = all().filter(r => keys[r.key] && r.o > 0); if (!rs.length) return 'Nothing to confirm: every Quantity is 0.';
    const by = {}; rs.forEach(r => { (by[r.b] = by[r.b] || []).push(r); });
    const sals = B.filter(c => by[c]);
    const sum = c => by[c].reduce((a, r) => a + r.o * r.c, 0);
    if (!quiet && !window.confirm('Confirm the ' + sup + ' order?\n\n' + sals.map(c => BN[c] + ': ' + plural(by[c].length, 'product') + ', ' + A(sum(c))).join('\n') + '\n\nEach salon gets its own order number. Nothing is sent to ' + sup + ' yet.')) return 'Not confirmed.';
    const done = [], was = [];
    for (const c of sals) {
      const lines = by[c].map(r => ({ key: r.key, brand: r.brand, fam: r.brand === 'Schwarzkopf' ? 'SKP' : String(r.brand).toUpperCase(), type: r.type, cat: r.cat, name: r.name, q: r.o, c: Math.round(r.c * 100) / 100 }));
      let res; try { res = await sb.rpc('oos_order_confirm', { p_supplier: sup, p_branch: c, p_lines: lines, p_extras: null }); } catch (e) { res = { error: e }; }
      if (res.error) return (done.length ? done.join(', ') + ' confirmed. ' : '') + poOff(res.error);
      const d = res.data || {};
      if (d.denied) return 'Only people who may edit the Weekly Product Plan can confirm an order.';
      if (d.exists) was.push(BN[c] + ' was already confirmed as ' + d.order_no); else done.push(d.order_no + ' ' + BN[c]);
    }
    await loadPO();
    return (done.length ? 'Confirmed: ' + done.join(', ') + '. ' : '') + (was.length ? was.join('; ') + '. ' : '') + (quiet ? '' : 'Close and open this window to see it on the sheet.');
  }
  async function cancelOrders(sup, sals) {
    if (!S.canEdit) return 'Only people who may edit the Weekly Product Plan can cancel an order.';
    const mine = openOrders(sup, sals).filter(o => o.status === 'confirmed');
    if (!mine.length) return 'No confirmed order to cancel here (one already sent to ' + sup + ' cannot be cancelled on this page).';
    if (!window.confirm('Cancel ' + mine.map(o => o.order_no + ' ' + BN[o.branch]).join(', ') + '?\n\nThe number is not used again. The order can be changed and confirmed again.')) return 'Not cancelled.';
    const out = [];
    for (const o of mine) { let res; try { res = await sb.rpc('oos_order_cancel', { p_order_no: o.order_no }); } catch (e) { res = { error: e }; } if (res.error) return poOff(res.error); out.push(o.order_no); }
    await loadPO();
    return 'Cancelled ' + out.join(', ') + '.';
  }

  // The DBD order form of a confirmed order (Kate, 26 Nov 2026, step 2 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md: "create order form for dbd (see email for formats for different brands)").
  // DBD's own forms are Excel price lists, one per brand family and stock type, columns Category | Sub-category | Code | Description | Size | WSP (AED) | Suggested RSP | Order Qty. | Total | EAN | Status.
  // This makes the same thing from the confirmed order: one list per brand family and stock type, the DBD Code and EAN found from the product (oos_order_form_get: barcode, then name), the quantity
  // and the total at the price list price. A line DBD's list does not have yet gets no code and says CODE NEEDED: nothing is dropped. One Excel file per order, one tab per list.
  const FCOLS = [{ k: 'cat', l: 'Category', t: 'txt' }, { k: 'sub', l: 'Sub-category', t: 'txt' }, { k: 'code', l: 'Code', t: 'txt' }, { k: 'd', l: 'Description', t: 'txt' }, { k: 'size', l: 'Size', t: 'txt' },
                 { k: 'wsp', l: 'WSP (AED)', t: 'txt' }, { k: 'q', l: 'Order Qty.', t: 'num' }, { k: 'tot', l: 'Total (AED)', t: 'aed2' }, { k: 'ean', l: 'EAN', t: 'txt' }, { k: 'how', l: 'Matched by', t: 'txt' }];
  const DBD_HOW = { ean: 'barcode', code: 'item code', name: 'name', saved: 'saved by hand' };
  const f2 = v => v == null || v === '' ? '' : (+v).toFixed(2);
  async function loadForms(sup, sals) {
    const mine = openOrders(sup, sals); if (!mine.length) return { err: 'Confirm the order first: the order form is made from the confirmed order.' };
    const forms = [];
    for (const o of mine) {
      let r; try { r = await sb.rpc('oos_order_form_get', { p_order_no: o.order_no }); } catch (e) { r = { error: e }; }
      if (r.error) return { err: /oos_order_form|schema cache|Could not find/i.test(String(r.error.message || r.error)) ? 'The order form is not switched on yet (out_of_stock_order_form.sql).' : 'That did not work: ' + String(r.error.message || r.error) };
      if (!r.data || r.data.denied || r.data.missing || !Array.isArray(r.data.lines)) return { err: 'The order form could not be read.' };
      forms.push(r.data);
    }
    return { forms };
  }
  // one line of the form as a row: DBD's own columns, Status Active (found), Saved (a code typed in by hand) or Needs code. A product with no code yet shows our own name.
  const rowOf = l => ({ cat: l.cat || '', sub: l.sub || '', code: l.code || '', d: l.desc || l.name, size: l.size || '', wsp: f2(l.wsp), q: +l.q || 0, tot: l.wsp != null ? f2(l.wsp * l.q) : '', ean: l.ean || '',
    how: l.code ? DBD_HOW[l.how] || '' : '', st: !l.code ? 'Needs code' : l.how === 'saved' ? 'Saved' : 'Active', p: l.desc || l.name, _need: !l.code, _ro: !!l.code && l.how !== 'saved', _cls: l.code ? '' : 'oos-need', _ek: l.key, _l: l,
    _tip: l.code ? (l.how === 'saved' ? 'Saved by hand. Clear the box to go back to the automatic match.' : 'Found by ' + (DBD_HOW[l.how] || 'name') + '.') : 'Type the DBD code, or pick one from the list.' });
  // the lists of one order: one per brand family and stock type, matched lines A to Z by category then name, lines needing a code last
  function listsOf(fm) {
    const g = {}, order = [];
    fm.lines.forEach(l => { const k = (l.fam || String(l.brand || '').toUpperCase()) + ' ' + (l.type === 'Retail' ? 'Retail' : 'Professional'); if (!g[k]) { g[k] = []; order.push(k); } g[k].push(l); });
    order.sort((a, b) => a.localeCompare(b));
    return order.map(k => {
      const rows = g[k].map(rowOf);
      rows.sort((a, b) => (a._need - b._need) || a.cat.localeCompare(b.cat, undefined, { sensitivity: 'base' }) || a.sub.localeCompare(b.sub, undefined, { sensitivity: 'base' }) || a.d.localeCompare(b.d, undefined, { sensitivity: 'base' }));
      return { label: k, rows, need: rows.filter(r => r._need).length, units: rows.reduce((a, r) => a + r.q, 0), aed: rows.reduce((a, r) => a + (r.tot === '' ? 0 : +r.tot), 0) };
    });
  }
  async function saveForms(forms) {
    try { if (typeof lgxBuild !== 'function') await window.trsLazy('lgx'); } catch (e) { return 'The file could not be made. Try again.'; }
    if (typeof lgxBuild !== 'function') return 'The file could not be made. Try again.';
    let n = 0;
    forms.forEach(fm => {
      const ls = listsOf(fm); if (!ls.length) return;
      const cols = FCOLS.slice(0, 9).concat([{ k: 'st', l: 'Status', t: 'txt' }]);
      const built = lgxBuild({ sheets: ls.map(L => ({ name: L.label, blocks: [{ cols: cols.map(c => ({ label: c.l, fmt: c.k === 'q' ? 'num' : c.k === 'wsp' || c.k === 'tot' ? 'aed2' : 'text' })),
        rows: L.rows.map(r => ({ cells: cols.map(c => c.k === 'st' ? (r._need ? 'CODE NEEDED' : '') : c.k === 'wsp' || c.k === 'tot' ? (r[c.k] === '' ? '' : +r[c.k]) : r[c.k]) })).concat([{ total: true, cells: cols.map(c => c.k === 'd' ? 'Total' : c.k === 'q' ? L.units : c.k === 'tot' ? L.aed : '') }]) }] })) });
      lgxSave(lgxXlsxBlob(built), fm.order_no + ' ' + BN[fm.branch] + '.xlsx'); n++;
    });
    return n ? 'Saved ' + plural(n, 'file') + ' (one per order, one tab per list).' : 'Nothing to save.';
  }

  // The standard email to DBD (Kate, 26 Nov 2026, step 3 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md: "email must be standardised, we must have our own internal order number: subject, body, sign off").
  // One email per order (one salon): subject "TRS-PO-26-0001 | ORDER | SAADIYAT | 30 Nov 2026", the same body every time, the same sign-off whoever sends it. DBD keeps the subject when it replies,
  // so the order number is how its out-of-stock list and its invoice are matched back (steps 4 and 5). It OPENS a Gmail draft from info@ and saves the order form file to attach: the page never sends.
  // There is no Mark as sent button (Kate, 27 Nov 2026: "dapat autodetect to eh"): once the mail is sent from info@ the hourly mail read stores it, and the database (oos_sent_scan, every 10 minutes) turns the order to "sent" (it can no longer be cancelled here).
  const drafted = {};
  const mailEdits = {};   // order number -> the email body as edited in the preview window (Kate, 27 Nov 2026: "make the email editable"); kept until the page is reloaded
  const dFmt = d => { const t = new Date(String(d || '').slice(0, 10) + 'T00:00:00'); return isNaN(t) ? String(d || '') : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const pcs = n => nu(n) + (n === 1 ? ' PC' : ' PCS');
  const COORD = { SAA: 'Cristine', KCA: 'Jhoana', MC: 'Shiela', AQ: 'Frances' };   // the salon coordinators who sign DBD orders (Frances and Shiela are on the real ones in info@ Sent)
  function stdMail(fm, o) {
    const sal = BN[fm.branch], SAL = sal.toUpperCase(), lists = listsOf(fm), units = lists.reduce((a, L) => a + L.units, 0);
    const subject = fm.order_no + ' | ORDER | ' + SAL + ' | ' + dFmt(o.day);
    const head = 'Hello DBD Team,\n\nPlease find our order for the ' + SAL + ' branch below. The order form is attached.\n\nORDER NUMBER: ' + fm.order_no + '\nORDER DATE: ' + dFmt(o.day) + '\nSALON: ' + sal +
      '\nTOTAL: ' + plural(fm.lines.length, 'product') + ', ' + n0(units) + ' pcs\n\nKindly reply to this email, keeping the order number in the subject, with any items that are OUT OF STOCK.';
    // the sign-off of the orders that really go out of info@ (read from info@ Sent, 26 Nov 2026, Kate: "ibase mo kung ano yung nandon tlga sa info email"): Thank you, then the salon coordinator's first name.
    // The info@ signature itself (logo, links) is added as HTML by the draft function (oos-dbd-draft) and by Gmail in a compose window, never typed here.
    const tail = '\n\n\nThank you,\n' + (COORD[fm.branch] || '');
    // Kate, 27 Nov 2026, from the salon coordinators: lines with no barcode / DBD code are NOT written into the email body ("doesn't matter that much", what matters is that everything is in the xlsx).
    // They are only counted (need) so the preview and the confirm step can still say how many are left out.
    const secs = [], need = [];
    lists.forEach(L => {
      const ok = L.rows.filter(r => !r._need); L.rows.filter(r => r._need).forEach(r => need.push(r.d));
      if (ok.length) secs.push(L.label.toUpperCase() + '\n' + ok.map(r => r.code + ' | ' + r.d + ' | ' + pcs(r.q)).join('\n'));
    });
    const full = head + '\n\n' + secs.join('\n\n') + tail;
    const short = head + '\n\n' + lists.map(L => L.label.toUpperCase() + ': ' + plural(L.rows.length, 'product') + ', ' + pcs(L.units)).join('\n') + '\n\nThe full list is in the attached order form.' + tail;
    return { subject, full, short, need: need.length };
  }
  // test = the same draft, but the To is only the person signed in, no Cc, the subject says TEST ONLY and the top of the body says nothing goes to the supplier; it does not count as drafted.
  // DBD's OWN order forms, filled by the system (Kate, 26 Nov 2026: "autofill dapat haha. gamitin mo order form pa rin nila tho", "no need downloading not unless needed"). The edge function oos-dbd-draft fills them
  // (oos-order-forms) and attaches them to a DRAFT it makes in info@, so nobody downloads or attaches anything. It needs the one-time info@ permission (scripts/get-info-gmail-token.py);
  // until that is done, or if it fails, the old way runs: a Gmail compose link, and the filled DBD forms are downloaded to attach by hand.
  const dbdItems = fm => (fm.lines || []).filter(l => l.code).map(l => ({ bc: String(l.key || '').split('|').pop(), nm: l.name, brand: l.brand, type: l.type, q: l.q, code: l.code }));   // the DBD code: the filler searches DBD's own form by its Code column first and reads only the forms that hold these codes
  const saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };
  const b64Blob = (b64, type) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); };
  // a line with no DBD code is on no DBD form (the codes come from the forms), so it is not sent to the form filler: it would only make it read all 40 forms every time (about 20 seconds, and it ran out of resources on the first real order); the email body lists it by name
  const noCodeNote = fm => { const n = (fm.lines || []).filter(l => !l.code).length; return n ? ' ' + plural(n, 'line') + ' with no DBD code ' + (n === 1 ? 'is' : 'are') + ' not in the email or on the forms: order ' + (n === 1 ? 'it' : 'them') + ' by hand or add the code.' : ''; };
  const notIn = nf => nf && nf.length ? ' ' + plural(nf.length, 'product') + ' ' + (nf.length === 1 ? 'is' : 'are') + ' not on the filled forms (' + nf.slice(0, 3).map(x => x.name).join(', ') + (nf.length > 3 ? ', ...' : '') + '): add ' + (nf.length === 1 ? 'it' : 'them') + ' by hand.' : '';
  async function downloadDbdForms(fm) {
    try {
      const r = await sb.functions.invoke('oos-order-forms', { body: { salon: fm.branch, items: dbdItems(fm) } });
      const d = r.data || {};
      if (r.error || !Array.isArray(d.files) || !d.files.length) throw new Error('no forms');
      if (d.files.length === 1) saveBlob(b64Blob(d.files[0].b64), d.files[0].name);
      else {
        if (!window.JSZip) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('zip')); document.head.appendChild(sc); });
        const z = new window.JSZip(); d.files.forEach(f => z.file(f.name, b64Blob(f.b64))); saveBlob(await z.generateAsync({ type: 'blob' }), fm.order_no + ' ' + BN[fm.branch] + ' DBD forms.zip');
      }
      return 'Saved ' + plural(d.files.length, 'DBD form') + '.' + notIn(d.notFound) + noCodeNote(fm);
    } catch (e) { return await saveForms([fm]); }
  }
  // ===== PVM:BEGIN  The email preview (Kate, 27 Nov 2026: "preview of the email to be sent to DBD before I confirm it is sent", inside the dashboard, mockup docs/mockups/dbd-email-preview.html) =====
  // A button in the Send group of the DBD order window opens a window over it: From, To, Cc, Subject, the whole message with the exact info@ signature, and the DBD forms that will be attached
  // (each opens right here as the xlsx looks, with Download xlsx as a choice, never automatic). Nothing is sent from it. The forms are filled by the same function the draft uses (oos-order-forms).
  const SIG_HTML = "<div><div dir=\"ltr\" class=\"gmail_signature\" data-smartmail=\"gmail_signature\"><div dir=\"ltr\"><div><p dir=\"ltr\" style=\"line-height:1.656;margin-top:0pt;margin-bottom:0pt\"><br></p></div><div><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt\"><span style=\"font-size:8.5pt;font-family:Arial;color:rgb(28,27,22);vertical-align:baseline\">\u00a0 \u00a0 \u00a0 \u00a0 \u00a0\u00a0<img width=\"96\" height=\"29\" src=\"https://ci3.googleusercontent.com/mail-sig/AIorK4zhEXVm7PLalJEhVf4JDo46bG3tFjok7Lu6O64jyuldvDv4UmhWpe9Yw1Hslvi-0SYOjO9V-hmRjlNx\" style=\"color:rgb(3,3,3);font-family:arial,sans-serif;font-size:12.96px\"></span></p><table cellpadding=\"0\" cellspacing=\"0\" style=\"font-stretch:normal;line-height:normal;font-size:initial;color:rgb(3,3,3)\"><tbody><tr><td style=\"vertical-align:top\"><table cellpadding=\"0\" cellspacing=\"0\" style=\"font-stretch:normal;font-size:14.4px;line-height:normal\"><tbody><tr><td><table cellpadding=\"0\" cellspacing=\"0\" style=\"font-stretch:normal;font-size:12.96px;line-height:normal\"><tbody><tr><td style=\"padding:0px 5px 0px 0px\"><font face=\"arial, sans-serif\"><img src=\"https://img.newoldstamp.com/t/8/w.png\" style=\"display:inline-block;vertical-align:middle\">\u00a0<a href=\"http://tararosesalon.com/en/ae/\" style=\"font-size:1em;color:rgb(3,3,3)\" target=\"_blank\">tararosesalon.com/en/ae/</a><span style=\"font-size:14.4px;white-space:nowrap\"><b><br></b></span></font></td><td><font face=\"arial, sans-serif\">\u00a0</font></td></tr></tbody></table></td></tr><tr><td style=\"font-stretch:normal;font-size:12.96px;line-height:normal;border-bottom:2px solid rgb(3,3,3);padding:0px 0px 3px\"></td></tr><tr><td style=\"font-stretch:normal;line-height:normal;padding:3px 0px 0px\"><font face=\"arial, sans-serif\" style=\"font-size:12.96px\"><span style=\"color:rgb(28,27,22);font-size:11.3333px\">Tara Rose Ladies Salon</span></font></td></tr></tbody></table></td></tr></tbody></table><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt\"><span style=\"color:rgb(28,27,22);font-family:Arial;font-size:8.5pt\">Khalifa City A | Saadiyat | Motor City | Al Quoz</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt\"><span style=\"font-size:11.3333px;color:rgb(28,27,22);font-family:Arial\">💻\u00a0\u00a0<i>Click</i></span><i><b style=\"font-size:11.3333px;color:rgb(28,27,22);font-family:Arial\">\u00a0<a href=\"https://wa.me/971524960903\" target=\"_blank\">here</a></b><span style=\"font-size:11.3333px;color:rgb(28,27,22);font-family:Arial\">\u00a0to book your appointment</span></i></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt\"><font size=\"1\" style=\"color:rgb(3,3,3)\">We&#39;re hiring across Dubai &amp; Abu Dhabi \u2192\u00a0<a href=\"http://tararosesalon.com/careers\" target=\"_blank\">tararosesalon.com/careers</a></font></p></div></div></div></div>";   // the info@ signature, copied exactly from a real order in info@ Sent (the same block as in the function oos-dbd-draft)
  const PV_LOGO = { SKP: 'assets/dbd/brand-skp.png', ABC: 'assets/dbd/brand-abc.jpg', ALTERNA: 'assets/dbd/brand-alterna.png' };
  const pvTop = [];   // the preview windows that are open, the last one on top
  function pvOverlay(label) {
    const ov = document.createElement('div'); ov.className = 'pvm-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', label);
    document.body.appendChild(ov);
    const w = { ov, close: () => { const i = pvTop.indexOf(w); if (i >= 0) pvTop.splice(i, 1); ov.remove(); } };
    pvTop.push(w);
    ov.addEventListener('click', e => { if (e.target === ov) w.close(); });
    if (!window._pvmEsc) { window._pvmEsc = 1; document.addEventListener('keydown', e => { if (e.key === 'Escape' && pvTop.length) { e.stopImmediatePropagation(); e.preventDefault(); pvTop[pvTop.length - 1].close(); } }, true); }
    return w;
  }
  const pvNum = t => { const m = /[0-9]+(\.[0-9]+)?/.exec(String(t).replace(/,/g, '')); return m ? parseFloat(m[0]) : 0; };
  const pvF2 = n => (+n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // one filled form opened in the dashboard: DBD's own columns look like the xlsx, what we add (Order Qty., Total (AED), the total lines) is in our brand colours
  function openFormView(file) {
    const v = file.view || {}, rows = v.rows || [], fam = v.family || '', own = !!v.hadTotal;
    const w = pvOverlay(file.name);
    const HEAD = ['Category', 'Sub-category', 'Code', 'Description', 'Size', 'WSP (AED)', 'Suggested RSP (AED)'];
    let g = '<div class="lt rn"></div>' + 'ABCDEFGHIJK'.split('').map(c => '<div class="lt">' + c + '</div>').join('');
    g += '<div class="rn rn8"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></div>';
    g += '<div class="bn">' + (fam === 'SKP' || fam === 'ABC' ? '<div class="bl"></div>' : '') + (PV_LOGO[fam] ? '<img class="br" alt="" src="' + PV_LOGO[fam] + '">' : '') + '</div>';
    g += '<div class="rn">9</div>' + HEAD.map(t => '<div class="hh">' + t + '</div>').join('') + '<div class="hh brh">Order Qty.</div><div class="hh">EAN</div><div class="hh">Status</div><div class="hh' + (own ? '' : ' brh') + '">Total (AED)</div>';
    let n = 9, last = '', q = 0, a = 0;
    rows.forEach(r => {
      const tot = r[7] * pvNum(r[5]); q += r[7]; a += tot;
      if (fam === 'SKP' && r[0] !== last) { n++; g += '<div class="rn">' + n + '</div><div></div><div></div><div></div><div class="band">' + esc(r[0]) + '</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>'; last = r[0]; }
      n++;
      g += '<div class="rn">' + n + '</div>' + [r[0], r[1], r[2], r[3], r[4], r[5], r[6]].map(t => '<div>' + esc(t) + '</div>').join('') + '<div class="brq">' + r[7] + '</div><div>' + esc(r[8]) + '</div><div>' + esc(r[9]) + '</div><div class="' + (own ? '' : 'brc') + '">' + pvF2(tot) + '</div>';
    });
    n += 2;
    g += '<div class="rn">' + n + '</div><div></div><div></div><div></div><div class="brt">TOTAL QTY</div><div></div><div></div><div></div><div class="brt">' + q + '</div><div></div><div></div><div></div>';
    n++;
    g += '<div class="rn">' + n + '</div><div></div><div></div><div></div><div class="brt">TOTAL (AED, at WSP)</div><div></div><div></div><div></div><div></div><div></div><div></div><div class="brt">' + pvF2(a) + '</div>';
    w.ov.innerHTML = '<div class="pvm-box pvm-vbox"><div class="pvm-hd"><div><h3>' + esc(file.name) + '</h3><p>Opened here, nothing is downloaded. DBD’s own form with the quantities filled in.</p></div><button type="button" class="pvm-x" data-c>Close</button></div>' +
      '<div class="pvm-xlwrap"><div class="pvm-xlscroll"><div class="pvm-xl">' + g + '</div></div><div class="pvm-tabs"><span class="pvm-tab">' + esc(v.sheet || 'Sheet1') + '</span></div></div>' +
      '<div class="pvm-ft"><button type="button" class="pvm-b" data-c>Close</button><button type="button" class="pvm-b pvm-main" data-dl>Download xlsx</button></div></div>';
    w.ov.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', w.close));
    w.ov.querySelector('[data-dl]').addEventListener('click', () => saveBlob(b64Blob(file.b64), file.name));
    const bl = w.ov.querySelector('.bl'); if (bl) bl.style.backgroundImage = 'url(assets/dbd/dbd-banner.jpg)';
  }
  async function previewEmail(sup, sals) {
    const m = SUP_MAIL[sup]; if (!m) return 'No email address for ' + sup + ' yet.';
    const lf = await loadForms(sup, sals); if (lf.err) return lf.err;
    const open = lf.forms.filter(f => f.status === 'confirmed');
    if (!open.length) return 'Every confirmed order here has been sent already.';
    const fm = open.filter(f => !drafted[f.order_no])[0] || open[0], o = S.po.filter(x => x.order_no === fm.order_no)[0] || { day: S.editDay };
    const mail = stdMail(fm, o), units = fm.lines.reduce((a, l) => a + (+l.q || 0), 0);
    const w = pvOverlay('Email preview');
    const addr = a => '<span class="pvm-addr">' + esc(a) + '</span>';
    // the message is a text box the coordinator can edit (Kate, 27 Nov 2026); the info@ signature under it is added by the draft itself and stays as it is
    const std = mail.full, cur = mailEdits[fm.order_no] != null ? mailEdits[fm.order_no] : std;
    const body = '<textarea class="pvm-ta" spellcheck="true" aria-label="Email message, you can edit it">' + esc(cur) + '</textarea>' + SIG_HTML;
    w.ov.innerHTML = '<div class="pvm-box"><div class="pvm-hd"><div><h3>Email preview, ' + esc(fm.order_no) + ' ' + esc(BN[fm.branch]) + '</h3><p>This is what ' + esc(sup) + ' will receive. Nothing is sent from here.</p></div><button type="button" class="pvm-x" data-c>Close</button></div>' +
      '<div class="pvm-body"><div class="pvm-chips"><span class="pvm-chip ok">Order confirmed</span><span class="pvm-chip">' + plural(fm.lines.length, 'line') + ' · ' + n0(units) + ' pcs</span>' +
      (mail.need ? '<span class="pvm-chip warn">' + plural(mail.need, 'line') + (mail.need === 1 ? ' has' : ' have') + ' no DBD code: not in the email or on the forms, order by hand</span>' : '') + '</div>' +
      '<div class="pvm-cols"><div class="pvm-left"><div class="pvm-f1"><div class="pvm-fld"><span class="k">From</span><span class="v">' + esc(m.from) + '</span></div>' +
      '<div class="pvm-fld"><span class="k">To</span><span class="v">' + m.to.map(addr).join('') + '</span></div>' +
      (m.cc.length ? '<div class="pvm-fld"><span class="k">Cc</span><span class="v">' + m.cc.map(addr).join('') + '</span></div>' : '') +
      '<div class="pvm-fld"><span class="k">Subject</span><span class="v"><b>' + esc(mail.subject) + '</b> <span class="pvm-hint">Kept as it is: ' + esc(sup) + '’s reply is matched by the order number in it.</span></span></div></div>' +
      '<div class="pvm-f3"><div class="pvm-sec pvm-sech">Message <span class="pvm-hint">Click in the text to edit it</span><span class="pvm-edited" hidden>Edited</span><button type="button" class="pvm-b pvm-rst" data-rst hidden>Back to the standard text</button></div><div class="pvm-mail" aria-label="Email body">' + body + '</div></div></div>' +
      '<div class="pvm-right pvm-f2"><div class="pvm-sec">Attached DBD order forms</div><div class="pvm-att"><div class="pvm-wait">Preparing the DBD forms, a few seconds…</div></div></div></div></div>' +
      '<div class="pvm-ft"><span class="pvm-msg" role="status"></span><button type="button" class="pvm-b" data-c>Back to the order</button><button type="button" class="pvm-b" data-send="test">Test email to me</button><button type="button" class="pvm-b pvm-main" data-send="real">Email order to ' + esc(sup) + '</button></div></div>';
    w.ov.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', w.close));
    const msg = w.ov.querySelector('.pvm-msg'), btns = w.ov.querySelectorAll('.pvm-ft button');
    const ta = w.ov.querySelector('.pvm-ta'), edTag = w.ov.querySelector('.pvm-edited'), rst = w.ov.querySelector('[data-rst]');
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(160, ta.scrollHeight + 2) + 'px'; };
    const edState = () => { const on = ta.value !== std; edTag.hidden = !on; rst.hidden = !on; if (on && ta.value.trim()) mailEdits[fm.order_no] = ta.value; else delete mailEdits[fm.order_no]; };
    ta.addEventListener('input', () => { edState(); grow(); });
    rst.addEventListener('click', () => { ta.value = std; edState(); grow(); ta.focus(); });
    edState(); requestAnimationFrame(grow); setTimeout(grow, 120);
    w.ov.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', async () => {
      if (b.disabled) return;
      if (b.dataset.send === 'real' && !(await guardSend([{ sup, sals }]))) { msg.textContent = 'Not emailed.'; return; }
      btns.forEach(x => { x.disabled = true; });
      const lab = b.textContent; b.textContent = 'Working…'; msg.textContent = 'Working, this can take a few seconds.';
      let r = ''; try { r = await emailToDbd(sup, sals, b.dataset.send === 'test'); } catch (e) { r = 'That did not work. Try again.'; }
      btns.forEach(x => { x.disabled = false; }); b.textContent = lab; msg.textContent = r || '';
    }));
    // the forms: filled by the function (a few seconds), shown as a list when ready; the window is already open and usable meanwhile, a press on a form opens it here
    (async () => {
      const att = w.ov.querySelector('.pvm-att');
      let d = null, err = '';
      try { const r = await sb.functions.invoke('oos-order-forms', { body: { salon: fm.branch, items: dbdItems(fm) } }); d = r.data; if (r.error || !d || !Array.isArray(d.files)) err = (d && d.error) || 'The DBD forms could not be prepared.'; else if (!d.files.length) err = 'No DBD order form holds these products.'; } catch (e) { err = 'The DBD forms could not be prepared.'; }
      if (!w.ov.isConnected) return;
      if (err) { att.innerHTML = '<div class="pvm-wait">' + esc(err) + '</div>'; return; }
      let tp = 0, tq = 0, ta = 0;
      att.innerHTML = d.files.map((f, i) => { const v = f.view || {}; tp += f.products || 0; tq += v.totQ || 0; ta += v.totA || 0;
        return '<button type="button" class="pvm-fl" data-i="' + i + '"><span class="n">' + esc(f.name) + '</span><span class="m"><span>' + plural(f.products || 0, 'product') + '</span><span>' + n0(v.totQ || 0) + ' pcs</span><span>AED ' + pvF2(v.totA) + '</span></span><span class="vw">View</span></button>'; }).join('') +
        '<div class="pvm-sum"><span>' + plural(d.files.length, 'form') + '</span><span>' + plural(tp, 'product') + '</span><span>' + n0(tq) + ' pcs</span><span>AED ' + pvF2(ta) + '</span></div>' +
        (d.notFound && d.notFound.length ? '<div class="pvm-nf">' + plural(d.notFound.length, 'product') + (d.notFound.length === 1 ? ' is' : ' are') + ' not on the forms (' + esc(d.notFound.slice(0, 3).map(x => x.name).join(', ')) + (d.notFound.length > 3 ? ', ...' : '') + '): they are in the email.</div>' : '');
      att.querySelectorAll('.pvm-fl').forEach(b => b.addEventListener('click', () => openFormView(d.files[+b.dataset.i])));
    })();
    return '';
  }
  // The barrier in front of every real "Email order to ..." button (Kate, 27 Nov 2026: "paki barred nung send to dbd or send to madi buttons para hindi aksidenteng mapipindot"). The press opens a
  // small window that says who gets what; nothing is made until "Yes, email it" is pressed. "Not yet" has the focus, so Enter or Space cannot send, Escape and a press outside close it.
  // groups = [{ sup, sals }], one per supplier. Resolves true only on Yes. The test email to yourself has no barrier: it goes to nobody else.
  function guardSend(groups) {
    return new Promise(done => {
      const w = pvOverlay('Email the order');
      const base = w.close; let out = false; w.close = () => { base(); done(out); };
      const rowsH = groups.map(g => { const os = openOrders(g.sup, g.sals).filter(o => o.status === 'confirmed'), m = SUP_MAIL[g.sup];
        return '<div class="pvm-gd-r"><b>' + esc(g.sup) + '</b><span>' + (os.length ? os.map(o => esc(o.order_no) + ' ' + esc(BN[o.branch])).join(', ') : 'the confirmed order') + '</span>' +
          (m ? '<span class="pvm-gd-to">to ' + esc(m.to.length === 1 ? m.to[0] : m.to.length + ' people at ' + String(m.to[0]).split('@')[1]) + '</span>' : '') + '</div>'; }).join('');
      const names = groups.map(g => g.sup).join(' and ');
      w.ov.innerHTML = '<div class="pvm-box pvm-gd"><div class="pvm-hd"><div><h3>Email the order to ' + esc(names) + '?</h3><p>Check the preview first. This makes the email in info@ with the order forms attached.</p></div></div>' +
        '<div class="pvm-body">' + rowsH + '</div>' +
        '<div class="pvm-ft"><button type="button" class="pvm-b pvm-main" data-no>Not yet</button><button type="button" class="pvm-b pvm-danger" data-yes>Yes, email it</button></div></div>';
      w.ov.querySelector('[data-no]').addEventListener('click', w.close);
      w.ov.querySelector('[data-yes]').addEventListener('click', () => { out = true; w.close(); });
      w.ov.querySelector('[data-no]').focus();
    });
  }
  // ===== PVM:END =====
  // ===== RESET:BEGIN  Reset one salon's order (Kate, 27 Nov 2026: "walang reset ng order per branch?", "kasama lang ang qty at ticks") =====
  // Puts the quantities typed in and the products ticked off of ONE salon back to the calculated order, for this order day (oos_order_reset, migrations/out_of_stock_order_reset.sql).
  // Shelf counts and Verified stay, the other salons stay, confirmed supplier orders stay (cancel them on their own).
  let rsMsg = '';
  const rsKeys = (c, o) => Object.keys(o).filter(k => k.indexOf(c.toLowerCase() + '|') === 0);
  function paintResets() {
    const el = $('oosResets'); if (!el) return;
    const bs = S.canEdit ? S.br.map(c => ({ c, q: rsKeys(c, S.edits).length, t: rsKeys(c, S.skips).length })).filter(x => x.q || x.t) : [];
    if (!bs.length && !rsMsg) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = (bs.length ? '<span class="oos-rs-k">Back to the calculated order</span>' + bs.map(x => '<button type="button" class="cm-pill" data-reset="' + x.c + '">Reset ' + esc(BN[x.c]) + ' <small>' + (x.q ? plural(x.q, 'amount') : '') + (x.q && x.t ? ', ' : '') + (x.t ? plural(x.t, 'untick') : '') + '</small></button>').join('') : '') + (rsMsg ? '<span class="oos-rs-m" role="status">' + esc(rsMsg) + '</span>' : '');
  }
  async function resetSalon(c) {
    if (!S.canEdit) return;
    const q = rsKeys(c, S.edits), t = rsKeys(c, S.skips); if (!q.length && !t.length) return;
    const open = S.po.filter(o => o.branch === c && o.status !== 'cancelled' && o.day === S.editDay).length;
    if (!window.confirm('Reset the ' + BN[c] + ' order?\n\n' + (q.length ? plural(q.length, 'typed amount') : '') + (q.length && t.length ? ' and ' : '') + (t.length ? plural(t.length, 'untick') : '') + ' go back to the calculated order. Shelf counts and Verified stay, and so do the other salons.' + (open ? '\n\n' + plural(open, 'confirmed order') + ' for ' + BN[c] + (open === 1 ? ' stays' : ' stay') + ' as ' + (open === 1 ? 'it is' : 'they are') + ': cancel ' + (open === 1 ? 'it' : 'them') + ' separately.' : ''))) return;
    let r; try { r = await sb.rpc('oos_order_reset', { p_branch: c }); } catch (e) { r = { error: e }; }
    if (r.error) { rsMsg = /oos_order_reset|schema cache|does not exist|Could not find/i.test(String(r.error.message || r.error)) ? 'The reset is not switched on yet: the database step (out_of_stock_order_reset.sql) is waiting to be applied.' : 'That did not work. Try again.'; paintResets(); return; }
    if (r.data && r.data.denied) { rsMsg = 'Only people who may edit the Weekly Product Plan can reset an order.'; paintResets(); return; }
    q.forEach(k => { delete S.edits[k]; delete S.editWho[k]; }); t.forEach(k => { delete S.skips[k]; delete S.editWho[k]; });
    S.eds++; memoM = {}; sigNow(); S.dirty = true;
    // the numbers locked for a bulk order: this salon's untyped quantities go back to the live figures too, the other salons' stay locked
    if (S.bulk && S.bulk.lock && S.bulk.lock.sig === lockSig() && !S.bulkOff) {
      try {
        const lq = Object.assign({}, S.bulk.lock.q); Object.keys(lq).forEach(k => { if (k.indexOf(c.toLowerCase() + '|') === 0) delete lq[k]; });
        all().filter(x => x.b === c && x.qm > 0).forEach(x => { lq[x.key] = x.qm; });
        const sv = await sb.rpc('oos_bulk_save', { p_ticks: (S.bulk && S.bulk.ticks) || {}, p_lock: { sig: lockSig(), q: lq }, p_new: false, p_done: false });
        if (!sv.error && sv.data && !sv.data.denied) applyBulk({ data: sv.data });
      } catch (e) { console.error(e); }
    }
    rsMsg = BN[c] + ' is back to the calculated order (' + n0(r.data && r.data.cleared != null ? r.data.cleared : q.length + t.length) + ' changed).';
    draw();
  }
  // ===== RESET:END =====
  // ===== BULK:BEGIN  Order all suppliers (Kate, 27 Nov 2026: "i-build mo na sa live"; mockup docs/mockups/out-of-stock.html in the cowork repo) =====
  // One window with a row per supplier: tick, Confirm (each supplier and salon its own TRS-PO number), Preview email and Email (each its own email). The place is kept under a BO number in the
  // database (oos_bulk_get / oos_bulk_save, migrations/out_of_stock_bulk_batches.sql), so closing the window, reloading or someone else opening the page carries on where it was left. Whether a
  // supplier is Confirmed or Sent is read from the supplier orders (oos_orders_get), never kept twice. Only DBD has its email and forms set up; the others are confirmed here and sent by hand.
  function applyBulk(r) {
    const off = /oos_bulk|schema cache|does not exist|Could not find/i;
    if (r && r.error) { S.bulkOff = off.test(String(r.error.message || r.error) + String(r.error.code || '')); return; }   // a failed read keeps what is on screen
    S.bulkOff = false;
    const d = r && r.data && !r.data.denied ? r.data : null, b = d ? d.batch : null;
    S.bulk = b || null;
    S.bulkSig = JSON.stringify(b ? [b.ref, b.ticks, b.locked_at, b.updated_at] : null);
  }
  const bkKeys = sup => { const k = {}; groupRows('sup', '', sup).concat(all().filter(r => inSel(r.b) && r.sup === sup && lowOf(r))).forEach(r => { k[r.key] = 1; }); return k; };
  const bkOn = sup => { const t = (S.bulk && S.bulk.ticks) || {}; return sup in t ? !!t[sup] : sup !== NOSUP; };
  const bkClock = t => t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }) : '';
  function bkLines() {
    return supRows().map(r => {
      const keys = bkKeys(r.sup), rows = all().filter(x => keys[x.key] && x.o > 0), sals = B.filter(c => rows.some(x => x.b === c)), mine = openOrders(r.sup, sals);
      const sentAll = mine.length > 0 && mine.length >= sals.length && mine.every(o => o.status !== 'confirmed');
      const st = !mine.length ? 'new' : sentAll ? 'sent' : 'confirmed';
      const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
      const chip = st === 'new' ? 'Not confirmed' : st === 'sent' ? cap(PO_ST[mine[0].status] || mine[0].status) + ' ' + mine.map(o => o.order_no).join(', ') : 'Confirmed ' + mine.map(o => o.order_no).join(', ') + (mine.length < sals.length ? ' (' + mine.length + ' of ' + sals.length + ' salons)' : '');
      return { r, sup: r.sup, keys, rows, sals, mine, st, chip, link: r.sup !== NOSUP, mail: !!SUP_MAIL[r.sup], none: !rows.length };
    });
  }
  const bkLockNow = () => { const q = {}; all().forEach(r => { if (r.qm > 0) q[r.key] = r.qm; }); return { sig: lockSig(), q }; };
  // opts: ticks (the new ticks), relock (read the numbers again), fresh (close this batch and start another)
  async function bkSave(opts) {
    opts = opts || {};
    const ticks = opts.ticks || (S.bulk && S.bulk.ticks) || {};
    const lock = opts.relock || opts.fresh || !S.bulk || !S.bulk.lock || !S.bulk.lock.sig ? bkLockNow() : null;
    let r; try { r = await sb.rpc('oos_bulk_save', { p_ticks: ticks, p_lock: lock, p_new: !!opts.fresh, p_done: false }); } catch (e) { r = { error: e }; }
    if (r.error) { applyBulk({ error: r.error }); throw r.error; }
    if (r.data && r.data.denied) throw new Error('not allowed');
    applyBulk({ data: r.data }); S.eds++; memoM = {}; S.dirty = true;
  }
  function paintBulkCard() {
    const c = $('oosBulkCard'), btn = $('oosBulk'); if (!c) return;
    const can = !!(S.canEdit && S.poOn && S.rows);
    if (btn) btn.hidden = !can;
    if (!can || !S.bulk) { c.hidden = true; return; }
    const L = bkLines().filter(x => x.link && bkOn(x.sup)), conf = L.filter(x => x.st !== 'new').length, sent = L.filter(x => x.st === 'sent').length;
    if (L.length && sent >= L.length) { c.hidden = true; return; }
    c.hidden = false;
    c.innerHTML = '<div class="oos-bk-t"><div class="oos-bk-k">Continue where you left off</div><div class="oos-bk-l"><b>' + esc(S.bulk.ref) + '</b> · ' + conf + ' of ' + L.length + ' suppliers confirmed' + (sent ? ', ' + sent + ' sent' : '') + ' · saved ' + esc(bkClock(S.bulk.updated_at)) + (S.bulk.updated_by ? ' by ' + esc(String(S.bulk.updated_by).split('@')[0]) : '') + '</div></div>' +
      '<div class="oos-bk-b"><button type="button" class="pvm-b pvm-main" data-bkc="open">Continue</button><button type="button" class="pvm-b" data-bkc="fresh">Start a new one</button></div>';
  }
  async function bkFresh() {
    if (!window.confirm('Start a new bulk order?\n\n' + (S.bulk ? S.bulk.ref + ' is closed. Its confirmed and sent orders stay as they are.' : ''))) return;
    try { await bkSave({ fresh: true, ticks: {} }); } catch (e) { return; }
    paintBulkCard(); openBulk();
  }
  let bkW = null;
  async function openBulk() {
    if (!S.canEdit || !S.poOn) return;
    if (bkW && bkW.ov.isConnected) return;
    let err = '';
    if (!S.bulk && !S.bulkOff) { try { await bkSave({ ticks: {} }); } catch (e) { err = ''; } }
    const w = bkW = pvOverlay('Order all suppliers');
    // a supplier window (Open order, or a figure in this one) opens over the page: this window steps aside while one is open and comes back, redrawn, when it closes
    const mo = new MutationObserver(() => { const dr = document.body.classList.contains('dr-open'); w.ov.style.display = dr ? 'none' : ''; if (!dr && w.ov.isConnected) paint(); });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const baseClose = w.close; w.close = () => { mo.disconnect(); baseClose(); bkW = null; draw(); };
    let busy = false, note = err;
    const paint = () => {
      const L = bkLines(), on = L.filter(x => x.link && bkOn(x.sup)), toC = on.filter(x => x.st !== 'sent' && !x.none && (x.st === 'new' || x.mine.length < x.sals.length)), toE = on.filter(x => x.st === 'confirmed' && x.mail);
      const hasC = on.some(x => x.st === 'confirmed'), np = L.reduce((a, x) => a + x.rows.length, 0), tot = L.reduce((a, x) => a + x.rows.reduce((b, r) => b + r.o * r.c, 0), 0);
      const lockOk = S.bulk && S.bulk.lock && S.bulk.lock.sig === lockSig();
      const rows = L.map(x => {
        const how = !x.link ? '<b>Not linked to a supplier yet.</b> Link these products first.' : x.none ? '<b>Nothing to order.</b> Every Quantity is 0.' : x.mail ? '<b>Email</b> to the ' + esc(x.sup) + ' order team with their own order forms filled' : '<b>No email address yet.</b> Confirm it here, send it yourself.';
        const chip = '<span class="oos-bk-chip' + (x.st === 'sent' ? ' s' : x.st === 'confirmed' ? ' c' : '') + '">' + esc(x.chip) + '</span>';
        return '<div class="oos-bk-row' + (x.link ? '' : ' off') + '"><label class="oos-bk-tick"><input type="checkbox" data-bk="tick" data-s="' + esc(x.sup) + '" aria-label="Include ' + esc(x.sup) + '"' + (bkOn(x.sup) && x.link ? ' checked' : '') + (x.link ? '' : ' disabled') + '></label>' +
          '<div><span class="oos-bk-name">' + esc(x.sup) + '</span><span class="oos-bk-sub">' + fig(n0(x.rows.length), 'sup', '', x.sup) + (x.rows.length === 1 ? ' product' : ' products') + ' · AED ' + n0(x.rows.reduce((b, r) => b + r.o * r.c, 0)) + '</span></div><div>' + chip + '</div><div class="oos-bk-how">' + how + '</div>' +
          '<div class="oos-bk-gb">' + (x.mail && x.st !== 'new' ? '<button type="button" class="pvm-b" data-bk="preview" data-s="' + esc(x.sup) + '">Preview email</button>' : '') + '<button type="button" class="pvm-b" data-bk="open" data-s="' + esc(x.sup) + '">Open order</button></div></div>';
      }).join('');
      const saved = S.bulkOff ? 'Not saved yet: the database step (out_of_stock_bulk_batches.sql) is waiting to be applied.' : S.bulk ? '<b>Saved ' + esc(bkClock(S.bulk.updated_at)) + '.</b> You can close this and come back to ' + esc(S.bulk.ref) + '.' : '';
      w.ov.innerHTML = '<div class="pvm-box"><div class="pvm-hd"><div><h3>Order all suppliers, ' + esc(scope()) + (S.bulk ? '<span class="oos-bk-ref">' + esc(S.bulk.ref) + '</span>' : '') + '</h3><p>' + plural(L.length, 'supplier') + ' · ' + plural(np, 'product') + ' · ' + A(tot) + ' · each supplier gets its own order and its own email</p></div><button type="button" class="pvm-x" data-c>Close</button></div>' +
        '<div class="oos-bk-steps"><span><b>1</b> Tick the suppliers</span><span><b>2</b> Confirm</span><span><b>3</b> Email</span></div>' +
        '<div class="oos-bk-saved" role="status" aria-live="polite">' + saved + '</div>' +
        '<div class="pvm-body"><div class="oos-bk-list">' + rows + '</div></div>' +
        '<div class="oos-bk-msg" role="status" aria-live="polite">' + esc(note) + '</div>' +
        '<div class="oos-bk-acts"><div class="oos-bk-g"><span class="oos-bk-gl">Order</span><div class="oos-bk-gb"><button type="button" class="pvm-b' + (toC.length ? ' pvm-main' : '') + '" data-bk="confirm"' + (toC.length && !busy ? '' : ' disabled') + '>' + (toC.length ? 'Confirm ' + plural(toC.length, 'order') : 'Confirm orders') + '</button><button type="button" class="pvm-b" data-bk="cancel"' + (hasC && !busy ? '' : ' disabled') + '>Cancel confirmed</button></div></div>' +
        '<div class="oos-bk-g"><span class="oos-bk-gl">Send</span><div class="oos-bk-gb"><button type="button" class="pvm-b" data-bk="preview-all"' + (toE.length && !busy ? '' : ' disabled') + '>Preview emails</button><button type="button" class="pvm-b' + (!toC.length && toE.length ? ' pvm-main' : '') + '" data-bk="send"' + (toE.length && !busy ? '' : ' disabled') + '>' + (toE.length ? 'Email ' + plural(toE.length, 'order') : 'Email orders') + '</button></div></div>' +
        (S.bulk ? '<div class="oos-bk-g"><span class="oos-bk-gl">Numbers</span><div class="oos-bk-gb"><span class="oos-bk-how" style="align-self:center">' + (lockOk ? 'Locked at ' + esc(bkClock(S.bulk.locked_at)) : 'Not locked for these settings') + '</span><button type="button" class="pvm-b" data-bk="refresh"' + (busy ? ' disabled' : '') + '>Refresh numbers</button></div></div>' : '') + '</div></div>';
      w.ov.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', w.close));
    };
    const run = async fn => { if (busy) return; busy = true; paint(); try { note = (await fn()) || ''; } catch (e) { console.error(e); note = e && e.message === 'not allowed' ? 'Only people who may edit the Weekly Product Plan can do this.' : 'That did not work. Try again.'; } busy = false; paint(); };
    w.ov.addEventListener('change', e => {
      const t = e.target.closest('[data-bk="tick"]'); if (!t) return;
      const ticks = Object.assign({}, (S.bulk && S.bulk.ticks) || {}); ticks[t.dataset.s] = t.checked;
      run(async () => { if (!S.bulkOff) await bkSave({ ticks }); else S.bulk = Object.assign({}, S.bulk || {}, { ticks }); return ''; });
    });
    w.ov.addEventListener('click', e => {
      const b = e.target.closest('[data-bk]'); if (!b || b.disabled || b.dataset.bk === 'tick') return;
      const k = b.dataset.bk, sup = b.dataset.s, L = bkLines(), tk = L.filter(x => x.link && bkOn(x.sup));
      if (k === 'open') {
        const line = L.filter(x => x.sup === sup)[0], sp = line && supSpec(sup, ''); if (!sp) return;
        TRSD.open(sp, b);
        return;
      }
      if (k === 'preview' || k === 'preview-all') {
        const line = k === 'preview' ? L.filter(x => x.sup === sup)[0] : tk.filter(x => x.st === 'confirmed' && x.mail)[0]; if (!line) return;
        run(async () => await previewEmail(line.sup, line.sals));
        return;
      }
      if (k === 'refresh') { run(async () => { await bkSave({ relock: true }); return 'Numbers read again from the shelf lists. Your ticks and typed amounts are kept.'; }); return; }
      if (k === 'confirm') {
        const go = tk.filter(x => x.st !== 'sent' && !x.none && (x.st === 'new' || x.mine.length < x.sals.length)); if (!go.length) return;
        if (!window.confirm('Confirm ' + plural(go.length, 'supplier order') + '?\n\n' + go.map(x => x.sup + ': ' + plural(x.rows.length, 'product') + ', ' + A(x.rows.reduce((a, r) => a + r.o * r.c, 0)) + ' (' + x.sals.map(c => BN[c]).join(', ') + ')').join('\n') + '\n\nEach salon gets its own order number. Nothing is sent to the suppliers yet.')) { note = 'Not confirmed.'; paint(); return; }
        run(async () => { const out = []; for (const x of go) out.push(x.sup + ': ' + await confirmOrder(x.sup, x.keys, true)); return out.join(' ') + ' Next: email them.'; });
        return;
      }
      if (k === 'cancel') {
        run(async () => { const out = []; for (const x of tk) if (x.mine.some(o => o.status === 'confirmed')) out.push(await cancelOrders(x.sup, x.sals)); return out.join(' ') || 'No confirmed order to cancel here.'; });
        return;
      }
      if (k === 'send') {
        const go = tk.filter(x => x.st === 'confirmed' && x.mail), hand = tk.filter(x => x.st === 'confirmed' && !x.mail); if (!go.length) return;
        guardSend(go.map(x => ({ sup: x.sup, sals: x.sals }))).then(ok => {
          if (!ok) { note = 'Not emailed.'; paint(); return; }
          run(async () => { const out = []; for (const x of go) out.push(await emailToDbd(x.sup, x.sals)); if (hand.length) out.push(hand.map(x => x.sup).join(', ') + ' has no email address yet: send it yourself.'); return out.join(' '); });
        });
        return;
      }
    });
    paint();
  }
  // ===== BULK:END =====
  async function emailToDbd(sup, sals, test) {
    const m = SUP_MAIL[sup]; if (!m) return 'No email address for ' + sup + ' yet.';
    const lf = await loadForms(sup, sals); if (lf.err) return lf.err;
    const open = lf.forms.filter(f => f.status === 'confirmed' || (test && f.status === 'sent'));
    if (!open.length) return 'Every confirmed order here has been sent already.';
    const fm = open.filter(f => !drafted[f.order_no])[0] || open[0], o = S.po.filter(x => x.order_no === fm.order_no)[0] || { day: S.editDay };
    const mail = stdMail(fm, o);
    if (mailEdits[fm.order_no] != null) mail.full = mailEdits[fm.order_no];   // the text edited in the preview window goes out as typed
    let me = '';
    if (test) {
      try { me = ((await sb.auth.getUser()).data.user || {}).email || ''; } catch (e) { /* not known */ }
      if (!me) return 'Your own email address is not known here, so no test email was opened. Sign in again.';
      mail.subject = 'TEST ONLY, NOT FOR ' + sup + ': ' + mail.subject;
      const note = 'THIS IS A TEST of the Email to ' + sup + ' flow. It goes only to you. Nothing is sent to ' + sup + '.\n\n----\n\n';
      mail.full = note + mail.full; mail.short = note + mail.short;
    }
    if (!test && mail.need && !window.confirm(plural(mail.need, 'line') + ' of ' + fm.order_no + ' have no DBD code yet, so ' + (mail.need === 1 ? 'it is' : 'they are') + ' not in the email or on the forms. Open the email anyway?')) return 'Not opened.';
    let dr = null;
    try { const r = await sb.functions.invoke('oos-dbd-draft', { body: { salon: fm.branch, items: dbdItems(fm), to: test ? [me] : m.to, cc: test ? [] : m.cc, subject: mail.subject, body: mail.full } }); dr = r.error ? { ok: false } : (r.data || { ok: false }); } catch (e) { dr = { ok: false }; }
    if (dr.ok) {
      window.open(dr.url, '_blank', 'noopener');
      if (!test) drafted[fm.order_no] = 1;
      const more0 = test ? 0 : open.filter(f => f.order_no !== fm.order_no && !drafted[f.order_no]).length;
      return (test ? 'A TEST draft to ' + me + ' only is ready in info@' : 'The draft is ready in info@') + ' for ' + fm.order_no + ' ' + BN[fm.branch] + ', with ' + plural(dr.forms.length, 'DBD order form') + ' filled and attached (' + dr.forms.map(f => f.name).join(', ') + ').' + notIn(dr.notFound) + noCodeNote(fm) + (test ? ' Read it and press Send to get it in your inbox; nothing goes to ' + sup + '.' : ' Read it and press Send. The order turns to Sent by itself within the hour.') + (more0 ? ' ' + plural(more0, 'order') + ' more: press Email order to ' + sup + ' again after.' : '');
    }
    const whyNot = dr.notSetUp ? ' (DBD forms are not attached by themselves yet: the one-time info@ permission is not done.)' : dr.error ? ' (' + dr.error + ')' : '';
    const q = b => 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(m.from) + '&view=cm&fs=1&tf=1&to=' + encodeURIComponent(test ? me : m.to.join(',')) + '&cc=' + encodeURIComponent(test ? '' : m.cc.join(',')) + '&su=' + encodeURIComponent(mail.subject) + '&body=' + encodeURIComponent(b);
    let url = q(mail.full), long = url.length > 6500;
    if (long) { url = q(mail.short); try { await navigator.clipboard.writeText(mail.full); } catch (e) { /* no clipboard */ } }
    window.open(url, '_blank', 'noopener');
    if (!test) drafted[fm.order_no] = 1;
    const saved = await downloadDbdForms(fm) + whyNot;
    const more = test ? 0 : open.filter(f => f.order_no !== fm.order_no && !drafted[f.order_no]).length;
    if (test) return 'Gmail is open with a TEST email to ' + me + ' only, for ' + fm.order_no + ' ' + BN[fm.branch] + '. ' + saved + ' Press Send to get it in your inbox; nothing goes to ' + sup + '.';
    return 'Gmail is open for ' + fm.order_no + ' ' + BN[fm.branch] + (long ? ' (long order: the full list is copied, paste it if you want it in the body)' : '') + '. ' + saved + ' Attach it and press Send. The order turns to Sent by itself within the hour.' + (more ? ' ' + plural(more, 'order') + ' more: press Email order to ' + sup + ' again after.' : '');
  }
  // DBD's out-of-stock reply and our confirmation of it (Kate, 26 Nov 2026, step 4 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md: "they then proceed to click confirm orders with dbd oos button,
  // follow standardised format, dbd gets notified"). The reply is found by the database (oos_replies_scan: DBD keeps our subject, the order number is in it). The person decides every item
  // (cancel it, wait for stock, or take another product), the page opens the standard confirmation as a Gmail draft, and the database turns the order to "out of stock confirmed" by itself once that mail is in info@ Sent (oos_sent_scan).
  const draftedOos = {};
  function askDecisions(o, rp) {
    return new Promise(done => {
      const prev = {}; (rp.decisions || []).forEach(d => { prev[d.code] = d; });
      const ov = document.createElement('div'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Out of stock items');
      ov.style.cssText = 'position:fixed;inset:0;z-index:700;background:rgba(20,16,14,.6);display:flex;align-items:center;justify-content:center;padding:16px';
      const sel = 'font:inherit;font-size:15px;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);min-height:40px';
      ov.innerHTML = '<div style="background:var(--bg);color:var(--text);border:1px solid var(--text);border-radius:14px;width:min(980px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:18px 20px;box-shadow:0 26px 90px rgba(0,0,0,.6)">' +
        '<h3 style="font-family:\'Playfair Display\',serif;font-size:22px;margin:0 0 4px">DBD says these are out of stock</h3>' +
        '<p style="margin:0 0 12px;color:var(--muted);font-size:14px">' + esc(o.order_no) + ' · ' + esc(BN[o.branch]) + ' · DBD replied ' + esc(dFmt(rp.at)) + '. Choose what happens to each item. Everything not listed stays on the order.</p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:15px"><thead><tr><th style="text-align:left;padding:6px 8px">Item</th><th style="text-align:right;padding:6px 8px">Qty</th><th style="text-align:left;padding:6px 8px">What do we do?</th></tr></thead><tbody>' +
        rp.items.map((it, i) => '<tr style="border-top:1px solid var(--border)"><td style="padding:8px"><b>' + esc(it.name) + '</b><br><span style="color:var(--muted);font-size:13px">' + esc(it.code) + '</span></td><td style="padding:8px;text-align:right">' + esc(it.qty) + '</td>' +
          '<td style="padding:8px"><select data-i="' + i + '" style="' + sel + '"><option value="">Choose…</option><option value="cancel">Cancel this item</option><option value="wait">Keep it, we wait for stock</option><option value="replace">Take another product instead</option></select> ' +
          '<input data-r="' + i + '" type="text" placeholder="Which product instead?" style="' + sel + ';min-width:240px" hidden></td></tr>').join('') +
        '</tbody></table><p data-m style="margin:10px 0 0;color:#c62828;font-weight:700;min-height:1.4em"></p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px"><button type="button" data-no style="font:inherit;font-size:16px;padding:12px 22px;border-radius:12px;border:1px solid var(--border);background:none;color:var(--text);cursor:pointer">Close</button>' +
        '<button type="button" data-ok style="font:inherit;font-size:16px;font-weight:700;padding:12px 22px;border-radius:12px;border:0;background:var(--text);color:var(--bg);cursor:pointer">Save and open the email to DBD</button></div></div>';
      const fin = v => { document.removeEventListener('keydown', esc_); ov.remove(); done(v); };
      const esc_ = e => { if (e.key === 'Escape') { e.stopPropagation(); fin(null); } };
      document.addEventListener('keydown', esc_);
      document.body.appendChild(ov);
      rp.items.forEach((it, i) => { const sl = ov.querySelector('[data-i="' + i + '"]'), tx = ov.querySelector('[data-r="' + i + '"]'), pv = prev[it.code]; if (pv) { sl.value = pv.action; tx.value = pv.replace_with || ''; tx.hidden = pv.action !== 'replace'; } });
      ov.addEventListener('change', e => { const sl = e.target.closest('[data-i]'); if (sl) { const tx = ov.querySelector('[data-r="' + sl.dataset.i + '"]'); tx.hidden = sl.value !== 'replace'; if (!tx.hidden) tx.focus(); } });
      ov.querySelector('[data-no]').addEventListener('click', () => fin(null));
      ov.querySelector('[data-ok]').addEventListener('click', () => {
        const out = [], msg = ov.querySelector('[data-m]');
        for (let i = 0; i < rp.items.length; i++) {
          const a = ov.querySelector('[data-i="' + i + '"]').value, t = ov.querySelector('[data-r="' + i + '"]').value.trim();
          if (!a) { msg.textContent = 'Choose what happens to ' + rp.items[i].name + '.'; return; }
          if (a === 'replace' && !t) { msg.textContent = 'Write which product we take instead of ' + rp.items[i].name + '.'; return; }
          out.push({ code: rp.items[i].code, action: a, replace_with: a === 'replace' ? t : null });
        }
        fin(out);
      });
      const first = ov.querySelector('select'); if (first) first.focus();
    });
  }
  function oosMail(o, rp, decisions) {
    const sal = BN[o.branch], SAL = sal.toUpperCase(), by = {}; decisions.forEach(d => { by[d.code] = d; });
    const sec = (title, act) => { const ls = rp.items.filter(it => by[it.code].action === act).map(it => it.code + ' | ' + it.name + ' | ' + pcs(it.qty) + (act === 'replace' ? ' | TAKE INSTEAD: ' + by[it.code].replace_with : '')); return ls.length ? title + '\n' + ls.join('\n') : ''; };
    const body = [sec('CANCEL (please remove from the order)', 'cancel'), sec('KEEP ON THE ORDER (we will wait for stock)', 'wait'), sec('REPLACE (please send the other product)', 'replace')].filter(Boolean).join('\n\n');
    const text = 'Hello DBD Team,\n\nThank you for your out-of-stock list for our order ' + o.order_no + ' (' + SAL + ' branch). Please see our decision for each item below.\n\nORDER NUMBER: ' + o.order_no + '\nSALON: ' + sal +
      '\n\n' + body + '\n\nEverything else on the order stays as ordered. Kindly reply to confirm.' + '\n\nThank you,\nTara Rose Ladies Salon\nPurchasing | info@tararosesalon.com';
    return { subject: o.order_no + ' | OOS CONFIRMATION | ' + SAL + ' | ' + dFmt(o.day), text };
  }
  async function confirmOos(sup, sals) {
    if (!S.canEdit) return 'Only people who may edit the Weekly Product Plan can confirm the out-of-stock list with ' + sup + '.';
    const m = SUP_MAIL[sup]; if (!m) return 'No email address for ' + sup + ' yet.';
    const mine = openOrders(sup, sals).filter(o => o.status === 'oos_reply');
    if (!mine.length) return sup + ' has not sent an out-of-stock list for an order here (or it has been confirmed already).';
    const o = mine.filter(x => !draftedOos[x.order_no])[0] || mine[0];
    let r; try { r = await sb.rpc('oos_order_replies_get', { p_order_no: o.order_no }); } catch (e) { r = { error: e }; }
    if (r.error || !r.data || r.data.denied) return 'The reply could not be read. Try again.';
    const rp = (r.data.replies || []).filter(x => !x.confirm_sent_at)[0];
    if (!rp) return 'The latest ' + sup + ' list of ' + o.order_no + ' is already confirmed.';
    const dec = await askDecisions(o, rp); if (!dec) return 'Nothing saved.';
    let sv; try { sv = await sb.rpc('oos_reply_decide', { p_reply_id: rp.id, p_decisions: dec }); } catch (e) { sv = { error: e }; }
    if (sv.error) return 'That did not save: ' + String(sv.error.message || sv.error);
    if (sv.data && (sv.data.denied || sv.data.refused)) return 'That did not save (' + (sv.data.why || 'no access') + ').';
    const mail = oosMail(o, rp, dec);
    window.open('https://mail.google.com/mail/?authuser=' + encodeURIComponent(m.from) + '&view=cm&fs=1&tf=1&to=' + encodeURIComponent(m.to.join(',')) + '&cc=' + encodeURIComponent(m.cc.join(',')) + '&su=' + encodeURIComponent(mail.subject) + '&body=' + encodeURIComponent(mail.text), '_blank', 'noopener');
    draftedOos[o.order_no] = 1; await loadPO();
    return 'Decision saved. Gmail is open with the confirmation for ' + o.order_no + ' ' + BN[o.branch] + '. Press Send. The order turns to out of stock confirmed by itself within the hour.';
  }

  // Step 5: "on the way" and the invoice are found by the database from DBD's mail (oos_replies_scan), and the coordinator and accounts are told on WhatsApp once their templates are approved.
  // There is no Mark as on the way button: DBD has never sent a plain "on the way" mail, so the order goes from sent to invoiced when the invoice mail arrives.
  // The order form window (Kate, 27 Nov 2026: it "looks like a mess", it should be "easy to use, seamless", and should copy DBD's own form). One tab per list, DBD's own columns (Category, Sub-category,
  // Code, Description, Size, WSP, Order Qty., Total, EAN, Status), the lines with no DBD code first and tinted, their Code box open to type in. A 6 to 8 digit code typed in, or one of the closest DBD
  // products picked from the box's list, is saved for that product (oos_dbd_code_set) and every later order of every salon shows it; clearing the box goes back to the automatic match.
  const toks = x => String(x || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !/^(ml|g|gm|pcs|pc)$/.test(t) && (t.length > 1 || /[0-9]/.test(t)));
  function suggest(cat, l) {
    const w = toks(l.name); if (!w.length) return [];
    return cat.map(p => { const t = new Set(toks(p.desc + ' ' + (p.size || ''))); let sc = 0; w.forEach(x => { if (t.has(x)) sc += /[0-9]/.test(x) ? 2 : 1; }); return { p, s: sc / Math.sqrt(t.size || 1) }; })
      .filter(x => x.s >= 0.4).sort((a, b) => b.s - a.s).slice(0, 8).map(x => ({ v: x.p.code, l: x.p.desc + (x.p.size ? ' · ' + x.p.size : '') }));
  }
  async function orderFormWindow(sup, sals) {
    const lf = await loadForms(sup, sals); if (lf.err) return lf.err;
    if (typeof TRSD === 'undefined') return 'The window is not ready. Try again.';
    let cat = [];
    if (S.canEdit && lf.forms.some(fm => fm.lines.some(l => !l.code))) { try { const r = await sb.rpc('dbd_catalog_get'); if (r && r.data && Array.isArray(r.data.products)) cat = r.data.products; } catch (e) {} }
    const cols = FCOLS.slice(0, 9).map(c => c.k === 'code' ? Object.assign({}, c, { edit: S.canEdit ? 'text' : false, ph: 'Type code' }) : c).concat([{ k: 'st', l: 'Status', t: 'txt' }]);
    const nLines = () => lf.forms.reduce((a, fm) => a + fm.lines.length, 0), nNeed = () => lf.forms.reduce((a, fm) => a + fm.lines.filter(l => !l.code).length, 0);
    const subAll = () => plural(nLines(), 'line') + ' · ' + (nNeed() ? plural(nNeed(), 'line') + ' need a DBD code' : 'every line has its DBD code') + ' · the same columns as DBD\'s own forms';
    const loaded = [], tint = r => { r._opts = r._need ? suggest(cat, r._l) : null; return r; };
    const sums = res => { const u = res.rows.reduce((a, r) => a + r.q, 0), t = res.rows.reduce((a, r) => a + (r.tot === '' ? 0 : +r.tot), 0); res.foot = { d: 'Total', q: u, tot: f2(t) }; res.sub = subAll(); };
    const say = m => Object.assign(new Error(m), { say: m });
    const onEdit = async (row, k, val) => {
      if (k !== 'code') return;
      const v = String(val || '').replace(/\s+/g, ''), l = row._l;
      if (v && !/^\d{6,8}$/.test(v)) throw say('A DBD code is 6 to 8 digits.');
      if ((l.code || '') === v) return;
      let r; try { r = await sb.rpc('oos_dbd_code_set', { p_key: l.key, p_name: l.name, p_code: v }); } catch (e) { r = { error: e }; }
      if (r.error) throw say(/oos_dbd_code_set|schema cache|Could not find/i.test(String(r.error.message || r.error)) ? 'Saving a code is not switched on yet (out_of_stock_dbd_code_links.sql).' : 'Not saved: ' + String(r.error.message || r.error));
      if (r.data && r.data.denied) throw say('Only people who may edit the Weekly Product Plan can save a code.');
      // read the order again so the row shows exactly what the database now gives (description, size, price, EAN), and the same product in the other salons' lists follows
      const nf = await loadForms(sup, sals); if (nf.err) throw say(nf.err);
      nf.forms.forEach((f, i) => { const o = lf.forms[i]; if (o && o.order_no === f.order_no) f.lines.forEach((nl, j) => { if (o.lines[j]) Object.assign(o.lines[j], nl); }); });
      loaded.forEach(res => { res.rows.forEach(x => { Object.assign(x, tint(rowOf(x._l))); }); sums(res); });
    };
    const views = [];
    lf.forms.forEach(fm => listsOf(fm).forEach(L => views.push({ id: fm.order_no + L.label, label: (lf.forms.length > 1 ? BN[fm.branch] + ' ' : '') + L.label.replace('Professional', 'Pro'), load: async () => {
      L.rows.forEach(tint);
      const res = { cols, rows: L.rows, onEdit }; sums(res); loaded.push(res); return res;
    } })));
    if (!views.length) return 'The order has no lines.';
    TRSD.open({ title: 'DBD order form, ' + lf.forms.map(fm => fm.order_no + ' ' + BN[fm.branch]).join(', '), sub: subAll(), views,
      actions: [{ label: 'Save DBD forms (xlsx)', run: () => saveForms(lf.forms) }] });
    return '';
  }
  // A list of products. Every product, number and the product name open the product's own window. The Total row adds up the rows listed.
  // sheet = a supplier's order (Kate, 26 Nov 2026, from Phorest's Create Order screen: "similar da sa ganito, per supplier daw mas madaling mag order"): the first tab lists the products the way Phorest's
  // Create Order does (brand, category, name, cost, status, stock, min, max, Quantity), with the Quantity box and a tick to take a product out, so the order can be keyed in line by line.
  function rowsSpec(title, rows, sk, sheet, extra, supName) {
    const C = cover(), byKey = {}, loaded = [];
    rows.concat(extra || []).forEach(r => { byKey[r.key] = r; });
    const fresh = key => all().filter(x => x.key === key)[0] || byKey[key];
    // every figure that can change when a count, a quantity or a tick is saved
    const fill = (row, r) => {
      const f = ordOf(r.key, r.qm), d = prodSpec(r, 'how'), on = r.lines.length ? prodSpec(r, 'orders') : null;
      row.st = row._sh ? stX(r) : stTxt(r); row.in = r.s; row.on = r.i; row.q = r.q; row.qm = r.qm; row.am = Math.round(r.am * 100) / 100; row.a = Math.round(r.aed * 100) / 100;
      row.o = f.ov; row.ix = f.sk ? 0 : 1; row.oa = Math.round(f.o * r.c * 100) / 100; row.ct = r.cn ? r.s : ''; row.vf = r.vf ? 1 : 0;
      row._oe = f.oe; row._cls = f.sk ? 'oos-skip' : ''; row._tip = tipOf(r, f);
      row._dn = Object.assign({ p: d, in: d, mn: d, qm: d, am: d, mx: d, q: d, a: d, oa: d }, on ? { on } : {});
    };
    const sumO = x => x.ix ? (+x.o || 0) : 0;
    const footOf = res => { const rs = res.rows, t = k => rs.reduce((a, x) => a + (+x[k] || 0), 0); res.foot.o = rs.reduce((a, x) => a + sumO(x), 0); res.foot.oa = Math.round(t('oa') * 100) / 100; ['qm', 'am', 'q', 'a'].forEach(k => { if (k in res.foot) res.foot[k] = Math.round(t(k) * 100) / 100; }); };
    const onEdit = async (row, k, val) => {
      const key = row._ek; if (!byKey[key]) return;
      if (k === 'ix') await commitSkip(key, val === '0');
      else if (k === 'vf') await commitVerify(key, val === '1');
      else { const v = parseQty(val); if (v !== v) throw new Error('not a number'); if (k === 'ct') await commitCount(key, v); else await commitEdit(key, v); }
      const r = fresh(key); byKey[key] = r;
      loaded.forEach(res => { res.rows.forEach(x => { if (x._ek === key) fill(x, r); }); footOf(res); });
    };
    const mk = res => { res.onEdit = onEdit; loaded.push(res); footOf(res); return res; };
    const ordNote = (S.canEdit ? ' <b>Qty to Order</b> starts as the minimum order: type the amount you will really order (clear the box to go back), and untick <b>In order</b> to take a product out. The totals, the supplier table and the downloads follow.' : ' <b>Qty to Order</b> is the amount that will be ordered: the minimum order, unless someone typed another amount or took the product out.');
    const colsQ = [{ k: 'o', l: 'Qty to Order', t: 'num', edit: S.canEdit, sum: sumO }, { k: 'ix', l: 'In order', t: 'yn', check: S.canEdit, edit: S.canEdit }];
    const colsC = [];   // Kate, 26 Nov 2026: Counted and Verified taken out of this window (they stay on the page's own table)
    const sheetView = { id: 'sheet', label: 'Order sheet', load: async () => {
      const allr = rows.concat(extra || []), multi = new Set(allr.map(r => r.b)).size > 1;
      const poNow = supName ? openOrders(supName, B.filter(c => allr.some(r => r.b === c))) : [];
      const rs = allr.slice().sort((x, y) => (multi ? SALORD[x.b] - SALORD[y.b] : 0) || x.cat.localeCompare(y.cat, undefined, { sensitivity: 'base' }) || x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }) || x.brand.localeCompare(y.brand));
      const dr = rs.map(r => { const row = { s: BN[r.b], br: r.brand, ca: r.cat, p: r.name, c: Math.round(r.c * 100) / 100, mn: r.mn, mx: r.mx, _ek: r.key, _sh: 1 }; fill(row, r); return row; });
      return mk({ cols: (multi ? [{ k: 's', l: 'Salon', cx: 'nw' }] : []).concat([{ k: 'br', l: 'Brand', cx: 'nw' }, { k: 'ca', l: 'Category', cx: 'dr-cat' }, { k: 'p', l: 'Name', cx: 'dr-nm' }], colsQ, [{ k: 'oa', l: 'Quantity AED', t: 'aed' }],
          [{ k: 'c', l: 'Cost (AED)', t: 'num' }, { k: 'st', l: 'Status', cx: 'nw' }, { k: 'in', l: 'Stock', t: 'num' }], colsC, [{ k: 'on', l: 'On order', t: 'num' }, { k: 'mn', l: 'Min', t: 'num' }, { k: 'mx', l: 'Max', t: 'num' }, { k: 'qm', l: 'Min order', t: 'num' }, { k: 'q', l: 'Max order', t: 'num' }]),
        rows: dr, foot: { [multi ? 's' : 'br']: 'Total: ' + plural(rs.length, 'product') },
        note: (poNow.length ? '<b>Orders:</b> ' + poNow.map(o => poFmt(o).replace(/^[^ ]+/, m => esc(m)) + ' confirmed by ' + esc(String(o.by || '').split('@')[0])).join('; ') + '. ' : (supName && S.poOn ? '<b>Not confirmed yet.</b> ' : '')) + 'The products of this order, A to Z by category and then name.' + (extra && extra.length ? ' <b>' + n0(extra.length) + ' of them are low stock</b>: at or under Min but not ordered by the rule. Type a Quantity to add one to the order.' : '') + ordNote + (S.ordersOk ? '' : ' On-order counts are not loaded yet, so On order shows 0.') });
    } };
    const prodView = { id: 'products', label: sheet ? 'Counts and AED' : 'Products', load: async () => {
      const dr = rows.map(r => { const row = { p: r.name, br: r.brand, s: BN[r.b], ty: r.type, pr: r.prio, mn: r.mn, _ek: r.key }; fill(row, r); return row; });
      return mk({
        cols: [{ k: 'p', l: 'Product' }].concat(colsQ, [{ k: 'oa', l: 'Order AED', t: 'aed' }], [{ k: 'br', l: 'Brand' }, { k: 's', l: 'Salon' }, { k: 'ty', l: 'Type' }, { k: 'pr', l: 'Priority' }, { k: 'st', l: 'Status' },
          { k: 'in', l: 'In stock', t: 'num' }], colsC, [{ k: 'on', l: 'On order', t: 'num' }, { k: 'mn', l: 'Min', t: 'num' }, { k: 'qm', l: 'Min order', t: 'num' }, { k: 'am', l: 'Min AED', t: 'aed' }, { k: 'q', l: 'Max order', t: 'num' }, { k: 'a', l: 'Max AED', t: 'aed' }]),
        rows: dr,
        foot: { p: 'Total: ' + plural(rows.length, 'product'), qm: 0, am: 0, q: 0, a: 0 },
        note: 'Every product is listed with its real counts. Tap a number or a product to see how its order is worked out; On order opens the order lines.' + ordNote + (S.ordersOk ? '' : ' On-order counts are not loaded yet, so On order shows 0.')
      });
    } };
    // DBD supplier: the window opens in DBD's own format, one tab per salon, no Order sheet or Counts tab (Kate, 27 Nov 2026: "pag DBD supplier, default DBD format na lang so easy to navigate for salon coordss").
    // It works before the order is confirmed: oos_dbd_match finds each line's DBD code, size, price and EAN the way the confirmed order form does. Order Qty. is the same amount as Qty to Order (typing here saves
    // it, 0 takes the product out, clearing the box goes back to the calculated amount) and a line with no DBD code comes first, its Code box open to type in.
    const dbdSals = B.filter(c => rows.concat(extra || []).some(r => r.b === c));
    const dbdView = c => ({ id: 'dbd-' + c, label: BN[c], load: async () => {
      const mine = rows.concat(extra || []).filter(r => r.b === c);
      const inRows = new Set(rows.map(r => r.key));   // the products the rule orders (the low-stock extras are not counted in the Min / Max totals)
      const lineOf = r => ({ key: r.key, brand: r.brand, fam: r.brand === 'Schwarzkopf' ? 'SKP' : String(r.brand).toUpperCase(), type: r.type, cat: r.cat, name: r.name, q: ordOf(r.key, r.qm).o, c: Math.round(r.c * 100) / 100 });
      const matchAll = async () => {
        let r; try { r = await sb.rpc('oos_dbd_match', { p_lines: mine.map(lineOf) }); } catch (e) { r = { error: e }; }
        if (r.error) throw new Error(/oos_dbd_match|schema cache|Could not find/i.test(String(r.error.message || r.error)) ? 'The DBD format is not switched on yet (out_of_stock_dbd_match.sql).' : 'That did not work: ' + String(r.error.message || r.error));
        if (!Array.isArray(r.data)) throw new Error('The DBD format could not be read.');
        return r.data;
      };
      let lines; try { lines = await matchAll(); } catch (e) { return { cols: [{ k: 'n', l: 'DBD format' }], rows: [], empty: e.message }; }
      let cat = [];
      if (S.canEdit && lines.some(l => !l.code)) { try { const r = await sb.rpc('dbd_catalog_get'); if (r && r.data && Array.isArray(r.data.products)) cat = r.data.products; } catch (e) { /* no suggestions */ } }
      const listOf = l => (l.fam || String(l.brand || '').toUpperCase()) + ' ' + (l.type === 'Retail' ? 'Retail' : 'Professional');
      const mk1 = l => { const x = byKey[l.key], q = x ? ordOf(l.key, x.qm).o : (+l.q || 0), row = rowOf(Object.assign({}, l, { q })); row.ls = listOf(l); row.qm = x ? x.qm : 0; row.qx = x ? x.q : 0; row.am = x ? Math.round(x.am * 100) / 100 : 0; row.ax = x ? Math.round(x.aed * 100) / 100 : 0; row._pl = x && inRows.has(x.key) ? 1 : 0; row._opts = row._need ? suggest(cat, l) : null; return row; };
      const sortRows = rs => rs.sort((a, b) => (b._need - a._need) || a.ls.localeCompare(b.ls) || a.cat.localeCompare(b.cat, undefined, { sensitivity: 'base' }) || a.sub.localeCompare(b.sub, undefined, { sensitivity: 'base' }) || a.d.localeCompare(b.d, undefined, { sensitivity: 'base' }));
      const dr = sortRows(lines.map(mk1));
      const res = { rows: dr };
      const sums = () => { const on = res.rows.filter(r => r.q > 0), t = on.reduce((a, r) => a + (r.tot === '' ? 0 : +r.tot), 0), need = on.filter(r => r._need).length; const pl = k => Math.round(res.rows.reduce((a, r) => a + (r._pl ? (+r[k] || 0) : 0), 0) * 100) / 100; res.foot = { ls: 'Total: ' + plural(on.length, 'line'), q: on.reduce((a, r) => a + r.q, 0), tot: f2(t), qm: pl('qm'), qx: pl('qx'), am: pl('am'), ax: pl('ax') }; res.sub = plural(on.length, 'line') + ' in the order · ' + (need ? plural(need, 'line') + ' need a DBD code' : 'every line has its DBD code') + ' · DBD\'s own columns'; };
      const say = m => Object.assign(new Error(m), { say: m });
      res.cols = [{ k: 'ls', l: 'List', cx: 'nw' }].concat(FCOLS.slice(0, 9).map(f => f.k === 'code' ? Object.assign({}, f, { edit: S.canEdit ? 'text' : false, ph: 'Type code' }) : f.k === 'q' ? Object.assign({}, f, { edit: S.canEdit }) : f), [{ k: 'st', l: 'Status', t: 'txt' }], [{ k: 'qm', l: 'Min qty', t: 'num', cx: 'dr-ref dr-sep' }, { k: 'qx', l: 'Max qty', t: 'num', cx: 'dr-ref' }, { k: 'am', l: 'Min AED', t: 'aed', cx: 'dr-ref' }, { k: 'ax', l: 'Max AED', t: 'aed', cx: 'dr-ref' }]);
      res.onEdit = async (row, k, val) => {
        if (k === 'q') {
          const v = parseQty(val); if (v !== v) throw say('Type a whole number, 0 or more.');
          await commitEdit(row._ek, v);
          const x = byKey[row._ek]; row.q = x ? ordOf(row._ek, x.qm).o : 0; row.tot = row._l.wsp != null ? f2(row._l.wsp * row.q) : ''; sums(); return;
        }
        if (k !== 'code') return;
        const v = String(val || '').replace(/\s+/g, ''), l = row._l;
        if (v && !/^\d{6,8}$/.test(v)) throw say('A DBD code is 6 to 8 digits.');
        if ((l.code || '') === v) return;
        let r; try { r = await sb.rpc('oos_dbd_code_set', { p_key: l.key, p_name: l.name, p_code: v }); } catch (e) { r = { error: e }; }
        if (r.error) throw say(/oos_dbd_code_set|schema cache|Could not find/i.test(String(r.error.message || r.error)) ? 'Saving a code is not switched on yet (out_of_stock_dbd_code_links.sql).' : 'Not saved: ' + String(r.error.message || r.error));
        if (r.data && r.data.denied) throw say('Only people who may edit the Weekly Product Plan can save a code.');
        let nl; try { nl = await matchAll(); } catch (e) { throw say(e.message); }
        const fresh1 = sortRows(nl.map(mk1)); res.rows.length = 0; fresh1.forEach(x => res.rows.push(x)); sums();
      };
      sums();
      const poNow = openOrders(supName, [c]);
      res.note = (poNow.length ? '<b>Orders:</b> ' + poNow.map(o => poFmt(o).replace(/^[^ ]+/, m => esc(m)) + ' confirmed by ' + esc(String(o.by || '').split('@')[0])).join('; ') + '. ' : (S.poOn ? '<b>Not confirmed yet.</b> ' : '')) + 'The columns up to Status are DBD\'s own form, A to Z by list, category and name. The four grey columns after it (Min qty, Max qty, Min AED, Max AED) are our own planning figures and are not on DBD\'s form. <b>Order Qty.</b> is the Qty to Order'
        + (S.canEdit ? ': type the amount you will really order, 0 takes a product out, and clearing the box goes back to the calculated amount. Lines with no DBD code come first: type the 6 to 8 digit code, it is saved for that product.' : '.')
        + (S.ordersOk ? '' : ' On-order counts are not loaded yet.');
      return res;
    } });
    return { fadeZero: 1, title, sub: plural(rows.length, 'product') + ' · ' + A(sum(rows, 'am')) + ' minimum to ' + A(sum(rows, 'aed')) + ' maximum order · ' + wk(C) + ' of cover · shelf of ' + shelfDate(), cur: 'AED', sk,
      views: sheet && supName === 'DBD' && dbdSals.length ? dbdSals.map(dbdView) : sheet ? [sheetView, prodView] : [prodView],
      // Order of the buttons (Kate, 27 Nov 2026: "then it shouldnt be the first button, yes?" about Order form, which is made from the CONFIRMED order): Confirm order comes first and is the filled one
      // until an order is confirmed; once one is, Email order to DBD is the filled one. Order form and Cancel only matter once an order is confirmed, so they follow Confirm order.
      actions: sheet && supName ? [].concat(
        S.canEdit ? [{ label: 'Confirm order', grp: 'Order', main: !openOrders(supName, B.filter(c => rows.concat(extra || []).some(r => r.b === c))).length, run: () => { const keys = {}; rows.concat(extra || []).forEach(r => { keys[r.key] = 1; }); return confirmOrder(supName, keys); } }] : [],
        supName === 'DBD' ? [{ label: 'Order form', grp: 'Order', alt: 1, run: () => orderFormWindow(supName, B.filter(c => rows.concat(extra || []).some(r => r.b === c))) }] : [],
        S.canEdit ? [{ label: 'Cancel confirmed order', grp: 'Order', alt: 1, run: () => cancelOrders(supName, B.filter(c => rows.concat(extra || []).some(r => r.b === c))) }] : [],
        SUP_MAIL[supName] ? [{ label: 'Preview email', grp: 'Send', alt: 1, run: () => previewEmail(supName, B.filter(c => rows.concat(extra || []).some(r => r.b === c))) },
                             { label: 'Email order to ' + supName, grp: 'Send', main: openOrders(supName, B.filter(c => rows.concat(extra || []).some(r => r.b === c))).length > 0, run: async () => { const sl = B.filter(c => rows.concat(extra || []).some(r => r.b === c)); return (await guardSend([{ sup: supName, sals: sl }])) ? emailToDbd(supName, sl) : 'Not emailed.'; } },
                             { label: 'Test email to me', grp: 'Send', alt: 1, run: () => emailToDbd(supName, B.filter(c => rows.concat(extra || []).some(r => r.b === c)), true) }] : [],
        S.canEdit && SUP_MAIL[supName] && openOrders(supName, B.filter(c => rows.concat(extra || []).some(r => r.b === c))).some(o => o.status === 'oos_reply') ? [{ label: 'Confirm order with ' + supName + ' OOS', grp: 'DBD reply', run: () => confirmOos(supName, B.filter(c => rows.concat(extra || []).some(r => r.b === c))) }] : [],
      ) : undefined };
  }
  // One product at one salon: how its order is worked out, and the order lines behind On order (the last step: a single order line has nothing behind it).
  // "x 1.22 + x 1.15 + ..." for the weeks a colour product counts, with where it comes from
  function colWeeksTxt(r) {
    const bk = S.dem[r.b], ws = bk.wk.slice(0, r.C);
    return ws.map(w => 'week ' + w.k + ' x ' + (w.ok ? w.f : 1).toFixed(2)).join(' + ') + ' = ' + r.fw.toFixed(2) + ' colour weeks (' + BN[r.b] + ': ' + n0(ws.reduce((a, w) => a + w.exp, 0)) + ' colour services expected, ' + n0(bk.typ * r.C) + ' in ' + wk(r.C) + ' of a normal week)';
  }
  function prodSpec(r, first) {
    const how = { id: 'how', label: 'How the order is worked out', load: async () => {
      const ordSpec = r.lines.length ? prodSpec(r, 'orders') : null;
      const steps = [
        ['On the shelf', (r.cn ? nu(r.s) + ' (counted by hand; the Stock List says ' + nu(r.s0) + ')' : nu(r.s)) + (r.neg ? ' (the list shows a minus: stock was used before it was booked in, counted as none)' : '') + (r.noshelf ? ' (not on the Stock List now, counted as none)' : '')],
        ['Shelf figure verified', r.vf ? vfTip(r) : 'Not verified yet. It is the Stock List as it was read.'],
        ['On order, not arrived', S.ordersOk ? nu(r.i) + (r.i ? ' units on ' + plural(r.lines.length, 'order line') : '') : 'not loaded yet, counted as 0'],
        ['Shelf and on order together', nu(r.have)],
        ['Min in the Weekly Product Plan (one week of use)', nu(r.mn)],
        ['Max in the Weekly Product Plan', nu(r.mx)],
        [r.C > 1 ? 'Colour demand, the weeks counted' : 'Next week\'s colour demand', r.col && S.dm === 'book' ? colWeeksTxt(r) : (r.col ? 'Not counted: Order for is a normal week' : 'None: this product is not tied to bookings, so a normal week'), r.col && S.dm === 'book' ? histSpec(r.b) : null],
        ['Weeks left at that rate', r1(r.cov).toFixed(1)],
        ['Order when shelf and on order are under', nu(r.trig) + (r.col && S.dm === 'book' ? ' (Min x ' + nu(r.fw) + ' colour weeks = ' + nu(r.mn * r.fw) + ', in whole units)' : ' (Min x ' + r.C + ')')],
        ['Order up to (maximum)', nu(r.tgt) + ' (the order point ' + nu(r.trig) + ' + the plan\'s cushion ' + nu(r.cush) + ' = Max ' + nu(r.mx) + ' - Min ' + nu(r.mn) + ')'],
        ['Minimum order', nu(r.qm) + ' units, to reach ' + nu(r.trig) + (r.col && S.dm === 'book' ? ' (the order point, in whole units)' : ' (Min x ' + r.C + ')')],
        ['Maximum order', nu(r.q) + ' units, up to ' + nu(r.tgt) + ' (order point + cushion)'],
        ['Quantity to order', r.sk ? '0 units: taken out of the order (the box holds ' + nu(r.ov) + ')' : r.oe ? nu(r.o) + ' units, typed in' + (whoTxt(r.key) ? ' by ' + whoTxt(r.key) : '') + ' on the order list (the minimum order is ' + nu(r.qm) + ')' : nu(r.o) + ' units, the minimum order (nothing typed in)'],
        ['Cost a unit, Stock List', r.nocost ? 'No cost on the plan yet, counted as 0' : 'AED ' + r.c.toFixed(2)]];
      return { cols: [{ k: 'step', l: 'Step' }, { k: 'fig', l: 'Figure' }],
        rows: steps.map((x, i) => ({ step: x[0], fig: x[1], _dn: i === 1 && ordSpec ? { fig: ordSpec } : (x[2] ? { fig: x[2] } : null) })),
        foot: { step: 'AED to order', fig: A(r.am) + ' minimum, ' + A(r.aed) + ' maximum' + (r.oe || r.sk ? ', ' + A(r.oa) + ' for the quantity in the order' : '') },
        note: 'This is the last step for these figures: one product at one salon has nothing behind it, except the order lines on the second tab. Which clients bought a retail product at the till is not on this page yet. Phorest does not record which client a professional product was used on.' };
    } };
    const orders = { id: 'orders', label: 'On order (' + r.lines.length + ')', load: async () => {
      if (!S.ordersOk) return { cols: [{ k: 'n', l: 'Order lines' }], rows: [], empty: 'On-order counts are not loaded yet.' };
      return { cols: [{ k: 'no', l: 'Order no' }, { k: 'od', l: 'Ordered', t: 'date' }, { k: 's', l: 'Salon' }, { k: 'u', l: 'Units', t: 'num' }],
        rows: r.lines.map(l => ({ no: l.no, od: l.od, s: BN[l.b] || l.b, u: l.u })),
        foot: r.lines.length ? { no: plural(r.lines.length, 'order line'), od: '', s: '', u: r.i } : null, empty: 'Nothing on order for this product.',
        note: 'This is the last step: a single order line has nothing behind it. Orders from the last 60 days that have not arrived, from Phorest\'s Stock Orders report' + (S.ordersAt ? ', read ' + fdt(S.ordersAt) : '') + '.' };
    } };
    return { fadeZero: 1, title: r.name, cur: 'AED', sk: slug('oos-p-' + r.b + '-' + r.name),
      sub: r.brand + ' · ' + r.type.toLowerCase() + ' · ' + BN[r.b] + ' · Priority ' + r.prio + ' from the plan · supplier ' + r.sup,
      views: first === 'orders' ? [orders, how] : [how, orders] };
  }

  // The colour services booked for next week, by kind; how next week is expected (the weeks behind it, then the steps); and the colour products the plan scales by that (Kate, 26 Nov 2026:
  // "dapat nakalagay din what possible products will they be using"). c = one salon, or 'ALL' = the salons picked. The last step: nothing lies behind a count of services.
  const lbl = c => c === 'ALL' ? scope() : BN[c];
  function demFor(c) {
    if (c !== 'ALL') return S.dem[c];
    const ds = S.br.filter(x => S.dem[x]).map(x => S.dem[x]), s = k => ds.reduce((a, d) => a + d[k], 0), hm = {};
    ds.forEach(d => d.hist.forEach(h => { const w = hm[h[0]] || (hm[h[0]] = h.map((v, i) => i ? 0 : v)); for (let i = 1; i < h.length; i++) w[i] += +h[i] || 0; }));
    const hist = Object.keys(hm).sort().map(k => hm[k]), n = hist.length, sc = hist.reduce((a, h) => a + h[1], 0), typ = s('typ'), nw = ds.length ? ds[0].wk.length : 0;
    const wk = [];
    for (let i = 0; i < nw; i++) {
      const ws = ds.map(d => d.wk[i]), t = k => ws.reduce((a, w) => a + w[k], 0), gm = {}, sbk = hist.reduce((a, h) => a + (+h[2 + i] || 0), 0), ok = ws.every(w => w.ok), exp = t('exp');
      ws.forEach(w => w.grp.forEach(x => { gm[x[0]] = (gm[x[0]] || 0) + x[1]; }));
      wk.push({ k: i + 1, from: ws[0].from, to: ws[0].to, lead: ws[0].lead, now: t('now'), usual: t('usual'), pick: sbk ? sc / sbk : 0, pace: t('pace'), exp, f: ok && typ ? r2f(exp / typ) : 1, ok, g: ws[0].g, capped: ws.some(w => w.capped), grp: Object.keys(gm).map(x => [x, gm[x]]).sort((x, y) => y[1] - x[1]) });
    }
    const w1 = wk[0] || { now: 0, usual: 0, pick: 0, pace: 0, exp: 0, f: 1, ok: false, grp: [] };
    return { hist, n, typ, wk, now: w1.now, usual: w1.usual, pick: w1.pick, pace: w1.pace, exp: w1.exp, f: w1.f, ok: w1.ok, grp: w1.grp };
  }
  const allFour = () => B.every(c => S.br.indexOf(c) >= 0) && S.br.length === B.length && S.demAll;
  // distinct clients for the weeks ws (one week, or weeks 1 to n): the total, and per kind of colour service
  function clTotal(c, ws) {
    const last = Math.max.apply(null, ws), one = ws.length === 1;
    const of = (bk, src) => one ? ((src.cl_k || [])[last - 1] || 0) : ((src.cl_cum || [])[last - 1] || 0);
    if (c !== 'ALL') return one ? (S.dem[c].wk[last - 1] || {}).cl || 0 : (S.dem[c].cum[last - 1] || 0);
    if (allFour()) return of(null, S.demAll);
    return S.br.reduce((a, x) => a + (one ? (S.dem[x].wk[last - 1] || {}).cl || 0 : (S.dem[x].cum[last - 1] || 0)), 0);
  }
  function clKind(c, ws, kd) {
    const last = Math.max.apply(null, ws), one = ws.length === 1;
    const pick = (src) => { const a = one ? (src.grp_k || [])[last - 1] : (src.grp_cum || [])[last - 1]; const x = (a || []).filter(y => y[0] === kd)[0]; return x ? (one ? x[2] : x[1]) || 0 : 0; };
    if (c !== 'ALL') return pick({ grp_k: S.dem[c].wk.map(w => w.grp), grp_cum: S.dem[c].gcum });
    if (allFour()) return pick(S.demAll);
    return S.br.reduce((a, x) => a + pick({ grp_k: S.dem[x].wk.map(w => w.grp), grp_cum: S.dem[x].gcum }), 0);
  }
  // the weeks a window shows: one week (k), or every week counted for the cover picked (k = 0)
  const wksOf = k => { const C = cover(), a = []; for (let j = 1; j <= (k ? 1 : C); j++) a.push(k || j); return a; };
  const wkLbl = (c, j) => 'Week ' + j + ' · ' + rangeTxt(j);
  // The colour products of the plan that the page scales by the colour factor, for one salon or the salons picked, worked out for next week. Ranked by Min (one week of use, from Phorest Product Usage).
  function colourRows(c) {
    return all('book').filter(r => r.col && (c === 'ALL' ? inSel(r.b) : r.b === c)).sort((x, y) => y.mn - x.mn || SALORD[x.b] - SALORD[y.b] || x.name.localeCompare(y.name));
  }
  function planView(c) {
    return { id: 'plan', label: 'The plan\'s colour products', load: async () => {
      const rs = colourRows(c), many = c === 'ALL' && S.br.length > 1;
      return { cols: [{ k: 'p', l: 'Product' }].concat(many ? [{ k: 's', l: 'Salon' }] : []).concat([{ k: 'mn', l: 'Min', t: 'num' }, { k: 'need', l: 'Needed', t: 'num' }, { k: 'in', l: 'In stock', t: 'num' }, { k: 'on', l: 'On order', t: 'num' },
          { k: 'qm', l: 'Min order', t: 'num' }, { k: 'q', l: 'Max order', t: 'num' }, { k: 'a', l: 'Max AED', t: 'aed' }]),
        rows: rs.map(r => { const h = prodSpec(r, 'how'), o = prodSpec(r, 'orders');
          return { p: r.name, s: BN[r.b], mn: r.mn, need: r2f(r.mn * r.fw), in: r.s, on: r.i, qm: r.qm, q: r.q, a: Math.round(r.aed * 100) / 100, _dn: Object.assign({ p: h, mn: h, need: h, in: h, qm: h, q: h, a: h }, r.lines.length ? { on: o } : {}) }; }),
        foot: { p: 'Total: ' + plural(rs.length, 'product'), qm: sum(rs, 'qm'), q: sum(rs, 'q'), a: Math.round(sum(rs, 'aed') * 100) / 100 },
        empty: 'No colour product in the plan for the salons and Priority picked.',
        note: '<b>Not a recipe per service.</b><br>Phorest does not record which client a tube was used on.<br>These are the colour products the plan scales by how busy colour is.<br><b>Min</b> = one week of use, from Phorest Product Usage. The list is ranked by it.<br><b>Needed</b> = what the product needs over the weeks counted = Min x the colour weeks (' + wk(cover()) + ' of cover).<br>Priority ' + (S.prio === 'A' ? 'A' : 'A and B') + ': change it at the top.<br>Tap a product to see how its order is worked out.' };
    } };
  }
  // Claude's picks (Kate, 26 Nov 2026: "gamitan nga natin to ng API anthropic para makapag decide sya which possible products shall be used"):
  // the edge function oos-products (supabase/functions/oos-products) reads the salon's colour products from the plan with the caller's own sign-in and decides, for each KIND of colour service,
  // which of them will possibly be used, with a rough share and a one-line reason. It sees only the kinds and the product names, never a client. The answer is kept per salon and product list
  // (oos_product_ai), so opening this window is not a call unless the list changed. It is Claude's estimate from names, NOT a measured recipe. If it cannot answer the tab says why and shows the plan's list.
  async function aiGet(c) {
    const a = S.ai[c]; if (a && a.ok) return a;
    try {
      const r = await sb.functions.invoke('oos-products', { body: { salon: c } });
      if (r.error) { let m = ''; try { m = (await r.error.context.json()).error; } catch (e) { /* no body */ } throw new Error(m || 'Claude could not answer just now.'); }
      const d = r.data || {}; if (d.error) throw new Error(d.error);
      return (S.ai[c] = { ok: true, kinds: d.kinds || [], model: d.model || '', cached: !!d.cached, at: d.generated_at || '' });
    } catch (e) { return { ok: false, err: (e && e.message) || 'Claude could not answer just now.' }; }
  }
  function prodView(c, k) {
    const plan = planView(c);
    return { id: 'pick', label: 'Possible products', load: async () => {
      const cs = c === 'ALL' ? S.br.slice() : [c], res = await Promise.all(cs.map(aiGet)), good = res.filter(x => x.ok);
      if (!good.length) {
        const base = await plan.load();
        return Object.assign({}, base, { note: '<b>Claude did not answer.</b><br>' + esc(res[0].err) + '<br>Below are the colour products of the plan.<br>' + base.note });
      }
      const ws = wksOf(k), many = cs.length > 1, byKey = {};
      colourRows(c).forEach(r => { byKey[r.key] = r; });
      const bookedOf = (sc, kd) => ws.reduce((t, j) => { const w = S.dem[sc].wk[j - 1], g = w && w.grp.filter(x => x[0] === kd)[0]; return t + (g ? g[1] : 0); }, 0);
      const kindTot = {}, rows = [];
      cs.forEach((sc, i) => { const a = res[i]; if (!a.ok) return; a.kinds.forEach(kd => { const b = bookedOf(sc, kd.kind); kindTot[kd.kind] = (kindTot[kd.kind] || 0) + b;
        kd.products.forEach((p, rank) => { const r = byKey[p.key]; if (!r || !b) return; rows.push({ sc, kind: kd.kind, booked: b, rank, share: p.share, why: p.why, r }); }); }); });
      rows.sort((x, y) => (kindTot[y.kind] - kindTot[x.kind]) || (SALORD[x.sc] - SALORD[y.sc]) || (x.rank - y.rank));
      const out = rows.map(x => { const r = x.r, h = prodSpec(r, 'how'), o = prodSpec(r, 'orders'), bk = bkSpec(x.sc, k);
        return { kind: x.kind + ' · ' + n0(x.booked) + ' booked', p: r.name, s: BN[r.b], sh: x.share, why: x.why, need: r2f(r.mn * r.fw), in: r.s, qm: r.qm, q: r.q,
          _dn: { kind: bk, p: h, sh: h, need: h, in: h, qm: h, q: h } }; });
      const when = good.filter(x => x.at).map(x => fdt(x.at))[0];
      return { cols: [{ k: 'kind', l: 'Service' }, { k: 'p', l: 'Product' }].concat(many ? [{ k: 's', l: 'Salon' }] : []).concat([{ k: 'sh', l: 'Share %', t: 'num' }, { k: 'need', l: 'Needed', t: 'num' }, { k: 'in', l: 'In stock', t: 'num' }, { k: 'qm', l: 'Min order', t: 'num' }, { k: 'q', l: 'Max order', t: 'num' },
          { k: 'why', l: 'Why Claude picked it' }]),
        rows: out, empty: 'Nothing colour is booked for the weeks counted, so there is nothing to pick products for.',
        sub: 'Claude\'s estimate from product names, not a measured recipe',
        note: '<b>Claude\'s estimate, not a measured recipe.</b><br>Phorest does not record which client a tube was used on.<br>Claude read the kind of colour service and the product names. Nothing else: no clients.<br><b>Share %</b> = Claude\'s rough share of that kind\'s colour use.<br><b>Needed</b> = Min x the colour weeks.<br>' +
          (res.length > good.length ? '<b>' + (res.length - good.length) + ' salon did not answer</b> and is left out.<br>' : '') + (when ? 'Made ' + esc(when) + (good.every(x => x.cached) ? ', kept so Claude is not asked again until the plan\'s product list changes.' : '.') + '<br>' : '') + 'Tap a product to see how its order is worked out.' };
    } };
  }
  function bkSpec(c, k) {
    const d = demFor(c), ws = wksOf(k).filter(j => d.wk[j - 1]), tot = ws.reduce((a, j) => a + d.wk[j - 1].now, 0), one = ws.length === 1, ncl = clTotal(c, ws);
    return { fadeZero: 1, title: (one ? 'Colour services booked for ' + rangeTxt(ws[0]) : 'Colour services booked, ' + ws.length + ' weeks counted') + ', ' + lbl(c), sub: n0(tot) + ' colour services booked so far for ' + n0(ncl) + ' clients · ' + lbl(c) + ' · read ' + (S.demInfo && S.demInfo.synced ? fdt(S.demInfo.synced) : 'today'), cur: 'AED', sk: slug('oos-bk-' + c + '-' + (k || 0)),
      views: [{ id: 'bk', label: 'Booked', load: async () => {
        const kinds = []; ws.forEach(j => d.wk[j - 1].grp.forEach(x => { if (kinds.indexOf(x[0]) < 0) kinds.push(x[0]); }));
        const g = (j, kd) => { const x = d.wk[j - 1].grp.filter(y => y[0] === kd)[0]; return x ? x[1] : 0; };
        const kt = kd => ws.reduce((a, j) => a + g(j, kd), 0); kinds.sort((x, y) => kt(y) - kt(x));
        const cols = [{ k: 'g', l: 'Kind of colour service' }].concat(ws.map(j => ({ k: 'w' + j, l: one ? 'Services booked' : 'Week ' + j, t: 'num' }))).concat(one ? [] : [{ k: 'n', l: 'Services booked', t: 'num' }]).concat([{ k: 'cl', l: 'Clients', t: 'num' }]);
        const rows = kinds.map(kd => { const o = { g: kd, n: kt(kd), cl: clKind(c, ws, kd) }; ws.forEach(j => { o['w' + j] = g(j, kd); }); return o; });
        const foot = { g: 'Total', n: tot, cl: ncl }; ws.forEach(j => { foot['w' + j] = d.wk[j - 1].now; });
        return { cols, rows, foot, empty: 'Nothing colour is booked yet.',
          note: (one ? '' : ws.map(j => '<b>Week ' + j + '</b> ' + rangeTxt(j)).join('<br>') + '<br>') + '<b>Services booked</b> = booked colour services, one line each in Phorest Staff Appointments.<br><b>Clients</b> = how many different clients are behind them. One client can book several services.<br>A client with roots and a toner is counted once in the Total. Counts only, no names.<br>Toners and gloss, roots, foils, balayage, ombre, all over colour and bleach count. Colour lock treatments, polish, brows and tints do not.<br>Cancelled appointments are not in it.' };
      } }, prodView(c, k), planView(c)] };
  }
  function histSpec(c, k) {
    const d = demFor(c), ws = wksOf(k).filter(j => d.wk[j - 1]), one = ws.length === 1;
    const weeks = { id: 'weeks', label: 'The weeks before', load: async () => ({ cols: [{ k: 'w', l: 'Week starting', t: 'date' }, { k: 'done', l: 'Done in the week', t: 'num' }].concat(ws.map(j => ({ k: 'b' + j, l: one ? 'Booked by the same day the week before' : 'Booked ' + (d.wk[j - 1].lead) + ' days ahead (week ' + j + ')', t: 'num' }))),
      rows: d.hist.map(h => { const o = { w: h[0], done: h[1] }; ws.forEach(j => { o['b' + j] = h[1 + j]; }); return o; }),
      foot: (() => { const o = { w: 'Normal week (average)', done: Math.round(d.typ) }; ws.forEach(j => { o['b' + j] = Math.round(d.wk[j - 1].usual); }); return o; })(), empty: 'No finished weeks of bookings are held yet.',
      note: 'Colour services per finished week, from Phorest Staff Appointments, and how many of them were booked by the same day of the week before' + (one ? '' : ' (each week at its own distance: week ' + ws[0] + ' is ' + d.wk[ws[0] - 1].lead + ' days away, and so on)') + '.<br>Phorest drops cancelled appointments, so these are the appointments that were kept.' }) };
    const steps = { id: 'steps', label: one ? 'Next week' : 'The weeks counted', load: async () => {
      const rows = ws.map(j => { const w = d.wk[j - 1]; return { w: wkLbl(c, j), now: w.now, cl: clTotal(c, [j]), pace: Math.round(w.pace), ty: Math.round(d.typ), ex: w.exp, f: w.ok ? 'x ' + w.f.toFixed(2) + (w.capped ? ' (capped)' : '') : 'normal week' }; });
      const fs = ws.reduce((a, j) => a + (d.wk[j - 1].ok ? d.wk[j - 1].f : 1), 0);
      return { cols: [{ k: 'w', l: 'Week' }, { k: 'now', l: 'Services booked so far', t: 'num' }, { k: 'cl', l: 'Clients', t: 'num' }, { k: 'pace', l: 'By booking pace', t: 'num' }, { k: 'ty', l: 'A normal week', t: 'num' }, { k: 'ex', l: 'Expected', t: 'num' }, { k: 'f', l: 'Colour factor' }],
        rows, foot: { w: one ? 'Colour order factor' : 'Colour weeks counted (' + ws.length + ' weeks)', now: ws.reduce((a, j) => a + d.wk[j - 1].now, 0), cl: clTotal(c, ws), pace: rows.reduce((a, r) => a + r.pace, 0), ty: rows.reduce((a, r) => a + r.ty, 0), ex: rows.reduce((a, r) => a + r.ex, 0), f: one ? 'x ' + d.wk[ws[0] - 1].f.toFixed(2) : fs.toFixed(2) },
        note: '<b>Estimate.</b><br>Pace = what is booked now x how many services weeks like it end at per one booked by then.<br>Expected = ' + ws.map(j => 'week ' + j + ': ' + Math.round(100 * WTS[j - 1]) + '% pace + ' + (100 - Math.round(100 * WTS[j - 1])) + '% a normal week').join(' · ') + '.<br>Further weeks are less booked, so they lean more on a normal week.<br><b>Capped</b> = a week cannot go above the busiest of the last 12 weeks + 20%, the chairs are limited.<br>Tried on 11 weeks leaving one out: a normal week alone missed 16%, this 7% (week 1), 8% (week 2), 10% (week 3), 11% (week 4).<br>Cancellations, walk-ins and holidays are not modelled. Only about 12 weeks of bookings are held, so December is the first time it meets the busy weeks.' };
    } };
    return { fadeZero: 1, title: (one ? 'How ' + rangeTxt(ws[0]) + ' is expected' : 'How the weeks counted are expected') + ', ' + lbl(c), sub: 'Colour services, ' + lbl(c) + ' · ' + (one ? rangeTxt(ws[0]) : ws.length + ' weeks of cover'), cur: 'AED', sk: slug('oos-bh-' + c + '-' + (k || 0)), views: [steps, weeks, prodView(c, k), planView(c)] };
  }

  // ── THE PAGE (built once, then redrawn from the data) ────────────────────────────────
  function skeleton() {
    return `
    <div class="oos-ctl">
      <label for="oosDemand">Order for</label>
      <select id="oosDemand" style="width:196px" aria-label="What the colour order is worked out from"><option value="book">Next week's bookings</option><option value="typ">A normal week</option></select>
      <label for="oosPrio">Priority</label>
      <select id="oosPrio" style="width:108px" aria-label="Which priority to show"><option value="A">A only</option><option value="AB">A and B</option></select>
      <label for="oosCover">Weeks of cover</label>
      <select id="oosCover" style="width:108px" aria-label="Weeks of usual use to order up to"><option value="1">1 week</option><option value="2">2 weeks</option><option value="3">3 weeks</option><option value="4">4 weeks</option></select>
      <span class="oos-ctl-t" id="oosCoverT"></span>
    </div>
    <section class="oos-bkcard" id="oosBulkCard" aria-label="Continue where you left off" hidden></section>
    <section class="oos-ans" aria-label="The answer in one line"><div class="oos-ans-k">The answer in one line</div><div class="oos-ans-t" id="oosAns"></div><div class="oos-ans-s" id="oosAns0"></div><div class="oos-cards" id="oosAns2"></div><div class="oos-ans-s" id="oosAns5"></div><div class="oos-ans-n" id="oosAns3"></div><div class="oos-ans-n" id="oosAns4" hidden></div></section>

    <section class="oos-sec" id="oos-1" data-jn="1 Next week's bookings">
      <h3>1 Next week's bookings</h3>
      <div class="oos-learn">
        <p><b>What is this?</b> Colour services already booked for next week, per salon.</p>
        <p><b>Services, not clients.</b> One booked service is one line in Phorest. A client can book several, so the Clients column counts each client once.</p>
        <p><b>Why it matters.</b> Colour is about 7 in 10 of our product spend. More bookings means more tubes.</p>
        <p class="ex" id="oosExB"></p>
        <p class="watch"><b>What to watch.</b> <span id="oosWB"></span></p>
      </div>
      <div class="oos-learn oos-wks" id="oosWks"></div>
      <div class="oos-bar oos-bar-plain">${typeof rexButtons === 'function' ? '<span class="oos-sp"></span>' + rexButtons('oosExportBook') : ''}</div>
      <div class="oos-card oos-tcell"><table id="oosBookTbl"></table></div>
      <div class="oos-learn oos-bkn">
        <p><b>Measured</b> <span class="oos-sub">counted from Phorest</span>
          <span class="oos-ln">The colour services booked</span>
          <span class="oos-ln">The weeks before them</span>
          <span class="oos-ln">The shelf and the supplier orders not yet delivered</span></p>
        <p><b>Estimated</b> <span class="oos-sub">a good guess</span>
          <span class="oos-ln">Only 1 in 3 colour services is booked by the Thursday before</span>
          <span class="oos-ln">Services done = half of what is booked now + half of a normal week</span>
          <span class="oos-ln">Weeks further ahead lean more on a normal week (week 4: a quarter booked)</span>
          <span class="oos-ln">Tried on the last 11 weeks: a normal week missed by <b>16%</b>, this one by <b>7%</b> (week 1) to <b>11%</b> (week 4)</span></p>
        <p><b>Not known</b>
          <span class="oos-ln">Phorest does not say which client a tube was used on</span>
          <span class="oos-ln">So colour products go up or down with how busy colour is</span>
          <span class="oos-ln">Shampoo, treatments, nails, beauty and retail stay on a normal week's Min</span>
          <span class="oos-ln">Holidays are not counted</span></p>
      </div>
    </section>

    <section class="oos-sec" id="oos-2" data-jn="2 What to order">
      <h3>2 What to order, salon by salon</h3>
      <div class="oos-learn">
        <p><b>What is this?</b> Per salon: what is short for next week, and what it costs.</p>
        <p><b>Why it matters.</b> A colour that is out on a Thursday means a client is told no.</p>
        <p class="ex" id="oosEx"></p>
        <p class="watch"><b>What to watch.</b> <span id="oosW1"></span></p>
      </div>
      <div class="oos-fun" id="oosBars"></div>
      <div class="oos-resets" id="oosResets" hidden></div>
    </section>

    <section class="oos-sec" id="oos-3" data-jn="3 The order list">
      <h3>3 The order list</h3>
      <div class="oos-learn">
        <p><b>What is this?</b> Every product to order, one line each.</p>
        <p><b>Why it matters.</b> One list for the Monday order. Nothing ordered twice or missed.</p>
        <p class="watch"><b>What to watch.</b> <span id="oosW2"></span></p>
      </div>
      <div class="oos-bar" id="oosBar">
        <div class="sc-seg oos-seg" role="group" aria-label="Show"><button type="button" class="on" data-of="all" aria-pressed="true">All to order</button><button type="button" data-of="out" aria-pressed="false">Out now</button><button type="button" data-of="u1" aria-pressed="false">Under 1 week</button><button type="button" data-of="low" aria-pressed="false">Low stock</button><button type="button" data-of="every" aria-pressed="false">Every product</button></div>
        <button type="button" class="cm-pill" id="oosMore" aria-pressed="false">All columns</button>
        <button type="button" class="cm-pill oos-phone" data-sxcm="oosOrder">Sort and filter</button>
        <span class="oos-sp"></span>
        <button type="button" class="cm-pill" id="oosClear" hidden>Clear filters</button>${typeof rexButtons === 'function' ? rexButtons('oosExportOrder') : ''}
      </div>
      <div class="oos-card oos-tcell"><table id="oosTbl"></table></div>
      <div class="oos-pager"><span id="oosPgTxt"></span><span class="oos-sp"></span><span class="slv-eyebrow">Rows</span><select id="oosRows" aria-label="Rows per page"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
        <button type="button" class="cm-pill" id="oosPrev">‹ Previous</button><span class="oos-pgn" id="oosPgN"></span><button type="button" class="cm-pill" id="oosNext">Next ›</button></div>
      <p class="oos-hint">The page shows 10 rows to start with; pick 20, 50 or 100. Every column has a heading menu: sort, filter by condition or tick the values you want.${S.canEdit ? ' <b>Qty to Order</b> starts as the minimum order: type the amount you will really order and untick <b>In order</b> to take a product out. <b>Low stock</b> shows the products at or under Min that the rule does not order: type a Qty to Order to add one. The totals, the supplier table and the downloads follow. It is the same for everyone until the order goes out on Monday. <b>Counted</b> is the number really on the shelf: it replaces the Stock List figure for this order and ticks <b>Verified</b>; tick <b>Verified</b> alone when the Stock List figure is right. In <b>4 Order by supplier</b>, a supplier opens its order the way Phorest lists it.' : ' <b>Qty to Order</b> is the amount that will be ordered: the minimum order, unless someone typed another amount or took the product out.'}</p>
      <p class="oos-hint" id="oosEdMsg" role="status" hidden></p>
    </section>

    <details class="oos-sec oos-det" id="oos-4" data-jn="4 Order by supplier" open>
      <summary><h3>4 Order by supplier</h3></summary>
      <div class="oos-learn">
        <p><b>What is this?</b> The same order, split by supplier. Names are from the Orders and Receipts page.</p>
        <p><b>Why it matters.</b> Each supplier is ordered separately. Order all suppliers does it in one go: one order and one email each.</p>
        <p class="watch"><b>What to watch.</b> <span id="oosW3"></span></p>
      </div>
      <div class="oos-ctl oos-ctl4">
        <label for="oosDemand4">Order for</label>
        <select id="oosDemand4" style="width:196px" aria-label="What the colour order is worked out from"><option value="book">Next week's bookings</option><option value="typ">A normal week</option></select>
        <label for="oosPrio4">Priority</label>
        <select id="oosPrio4" style="width:108px" aria-label="Which priority to show"><option value="A">A only</option><option value="AB">A and B</option></select>
        <label for="oosCover4">Weeks of cover</label>
        <select id="oosCover4" style="width:108px" aria-label="Weeks of usual use to order up to"><option value="1">1 week</option><option value="2">2 weeks</option><option value="3">3 weeks</option><option value="4">4 weeks</option></select>
        <span class="oos-ref4" id="oosRef4"></span>
      </div>
      <div class="oos-refmsg4" id="oosRefMsg4" role="status" hidden></div>
      <div class="oos-bar oos-bar-plain"><button type="button" class="cm-pill oos-bkgo" id="oosBulk" hidden>Order all suppliers</button><button type="button" class="cm-pill" id="oosMore3" aria-pressed="false">All columns</button><button type="button" class="cm-pill oos-phone" data-sxcm="oosSup">Sort and filter</button><span class="oos-sp"></span>${typeof rexButtons === 'function' ? rexButtons('oosExportSup') : ''}</div>
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
    $('oosDemand').value = S.dm;
    if ($('oosCover4')) { $('oosCover4').value = String(C); $('oosPrio4').value = S.prio; $('oosDemand4').value = S.dm; }   // the same pickers in section 4
    $('oosCoverT').textContent = 'Order when under the order point (Min x weeks; colour counts each week ahead at its own expected size). ' + (C === usual ? 'This is the usual for today.' : 'Not the usual for today.') + ' Usual: 2 weeks from 15 Nov to 31 Dec, 1 week the rest of the year.';
  }
  // The Refresh stock now button and what it last said: in the Last sync block and again in section 4 (Kate, 26 Nov 2026: "make also available" in Order by supplier). sfx '' = the top one, '4' = section 4.
  const refHtml = sfx => (sfx ? fresh().text : '') + '<span class="oos-ln"><button type="button" class="cm-pill" id="oosRefresh' + sfx + '"' + (S.refreshing ? ' disabled' : '') + '>' + (S.refreshing ? 'Reading Phorest…' : 'Refresh stock now') + '</button></span>' + (S.refMsg && !sfx ? '<span class="oos-ln" role="status">' + esc(S.refMsg) + '</span>' : '');
  function paintAnswer() {
    const cs = S.br, T = cs.map(salTot), aed = sum(T, 'aed'), aedm = sum(T, 'aedm'), out = sum(T, 'out'), n = sum(T, 'n'), f = fresh();
    const a = $('oosAns'), a0 = $('oosAns0'), a2 = $('oosAns2'), a5 = $('oosAns5');
    const bs = all('typ').filter(r => inSel(r.b)), base = sum(bs, 'aed'), basem = sum(bs, 'am');
    const dem = !S.dem ? ln('Next week\'s bookings are not loaded, so this is a normal week.') : S.dm === 'book' ? ln((cover() === 1 ? 'Next week\'s bookings' : 'The bookings of the ' + cover() + ' weeks') + ' add <b>' + A(aedm - basem) + '</b> (min) and <b>' + A(aed - base) + '</b> (max) to a normal week. All colour.') : ln('A normal week: bookings are not counted (change <b>Order for</b> at the top).');
    if (!n) { a.textContent = 'Nothing to order for ' + scope() + ' on Priority ' + (S.prio === 'A' ? 'A' : 'A and B') + '.'; a0.textContent = ''; }
    else {
      a.innerHTML = 'Order between ' + fig(A(aedm), 'all') + ' (minimum) and ' + fig(A(aed), 'all') + ' (maximum) for ' + (cover() === 1 ? 'next week' : 'the next ' + cover() + ' weeks') + '.';
      a0.textContent = 'Priority ' + (S.prio === 'A' ? 'A' : 'A and B') + ' · ' + (cs.length === 1 ? BN[cs[0]] : 'every salon') + ' · ' + wk(cover()) + ' of cover';
    }
    // one container per salon picked (Kate, 26 Nov 2026: "make 4 containers, per branch"): the order, then what is short
    a2.innerHTML = cs.map((c, i) => { const t = T[i];
      return '<div class="oos-c"><div class="oos-ct">' + BN[c] + '</div>' +
        ln('<b class="oos-big">' + fig(A(t.aedm), 'all', c) + '</b>') + ln('<b>minimum</b>') + ln(fig(A(t.aed), 'all', c) + ' maximum') +
        ln(fig(n0(t.n), 'all', c) + (t.n === 1 ? ' product' : ' products') + ' to order') + ln(fig(n0(t.out), 'out', c) + ' out now') + ln(fig(n0(t.u1), 'u1', c) + ' under 1 week') + '</div>'; }).join('');
    a5.innerHTML = ln(fig(n0(out), 'out') + (out === 1 ? ' product is' : ' products are') + ' out on the shelf now (all salons picked).') + dem;
    const bkd = S.demInfo && S.demInfo.synced ? ln('<b>Bookings:</b> ' + fdt(S.demInfo.synced)) : '';
    const ord = S.ordersOk && S.ordersAt ? ln('<b>Supplier orders not yet delivered:</b> ' + fdt(S.ordersAt)) : '';
    const plc = (S.planAt ? ln('<b>Weekly Product Plan last changed:</b> ' + fdt(S.planAt)) : '') + (S.refreshedAt ? ln('<b>This page refreshed itself:</b> ' + fdt(S.refreshedAt)) : '');
    $('oosAns3').innerHTML = '<b>Last sync</b>' + f.text + ord + bkd + plc + ln('Anything ordered or delivered after that is not counted.') + ln('The Period at the top does not apply here.') + refHtml('');
    const r4 = $('oosRef4'); if (r4) r4.innerHTML = refHtml('4');
    const m4 = $('oosRefMsg4'); if (m4) { m4.textContent = S.refMsg || ''; m4.hidden = !S.refMsg; }   // the same button and answer in section 4, beside the shelf date
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
        `<div class="oos-num"><b>${fig(A(t.aedm), 'all', c)}</b> <span>minimum</span><span>·</span><span>${fig(A(t.aed), 'all', c)} maximum</span><span>·</span><span>${fig(n0(t.n), 'all', c)} products</span><span>·</span><span>${fig(n0(t.out), 'out', c)} out now</span><span>·</span><span>${fig(n0(t.u1), 'u1', c)} under 1 week</span></div></div>`;
    }).join('') + (cs.length > 1 ? (() => {   // the Total of the salons picked (Kate, 26 Nov 2026: "dpat may totals eh")
      const tn = sum(T, 'n'), to = sum(T, 'out'), tu = sum(T, 'u1'), ta = sum(T, 'aed'), tm = sum(T, 'aedm');
      return `<div class="oos-step oos-tot"><div class="oos-nm">Total<small>${n0(tn)} to order</small></div><div class="oos-tbar"></div>` +
        `<div class="oos-num"><b>${fig(A(tm), 'all')}</b> <span>minimum</span><span>·</span><span>${fig(A(ta), 'all')} maximum</span><span>·</span><span>${fig(n0(tn), 'all')} products</span><span>·</span><span>${fig(n0(to), 'out')} out now</span><span>·</span><span>${fig(n0(tu), 'u1')} under 1 week</span></div></div>`;
    })() : '');
    let hi = 0, lo = 0; T.forEach((t, i) => { if (t.aed > T[hi].aed) hi = i; if (t.aed < T[lo].aed) lo = i; });
    const w = $('oosW1');
    if (cs.length < 2) w.textContent = 'One salon is picked. Add the others in the header to compare them.';
    else w.innerHTML = ln('Biggest maximum order: <b>' + BN[cs[hi]] + '</b> ' + fig(A(T[hi].aed), 'all', cs[hi])) + ln('Smallest: <b>' + BN[cs[lo]] + '</b> ' + fig(A(T[lo].aed), 'all', cs[lo])) +
      ln(T[lo].out === 0 ? BN[cs[lo]] + ' has nothing out on the shelf. Copy that shelf.' : 'Look at what ' + BN[cs[lo]] + ' does differently.');
    const e = exRow(), ex = $('oosEx');
    ex.hidden = !e;
    if (e) ex.innerHTML = '<b>Example.</b> ' + esc(BN[e.b]) + ', ' + esc(e.name) + ln('Shelf: ' + nu(e.s) + ' · on order: ' + (e.i ? nu(e.i) : 'none')) + ln('Plan: Min ' + nu(e.mn) + ', Max ' + nu(e.mx) + (e.col && S.dm === 'book' ? ' (colour counted x ' + e.f.toFixed(2) + ')' : '')) + ln('We order when under <b>' + nu(e.trig) + '</b>') +
      ln('<b>Minimum</b> order: up to ' + nu(e.trig) + ' = ' + num(A(e.am), prodSpec(e, 'how'))) + ln('<b>Maximum</b> order: up to ' + nu(e.tgt) + ' (order point + cushion ' + nu(e.cush) + ') = ' + num(A(e.aed), prodSpec(e, 'how')));
  }

  // ── 1 NEXT WEEK'S BOOKINGS ───────────────────────────────────────────────────────────
  const bkRows = () => { if (!S.dem) return []; const C = cover(), r = []; S.br.forEach(c => { const bk = S.dem[c]; for (let j = 1; j <= C; j++) { const w = bk.wk[j - 1]; if (w) r.push({ b: c, k: j, d: Object.assign({}, w, { typ: bk.typ }) }); } }); return r; };
  function bkTotal(rs) { const s = k => rs.reduce((a, r) => a + r.d[k], 0); return { now: s('now'), cl: clTotal('ALL', wksOf(0)), usual: s('usual'), exp: s('exp'), typ: s('typ'), ok: rs.every(r => r.d.ok) }; }
  function buildBook() {
    const nm = (k, l, get, spec, bold) => ({ k, l, t: 'num', raw: r => Math.round(get(r)), disp: r => String(Math.round(get(r))), cell: r => num(bold ? '<b>' + n0(get(r)) + '</b>' : n0(get(r)), spec(r)) });
    TB = TRSheet.table({ id: 'oosBook', el: '#oosBookTbl', rows: bkRows,
      cols: [
        { k: 's', l: 'Salon', t: 'txt', raw: r => BN[r.b], disp: r => BN[r.b], cell: r => esc(BN[r.b]) },
        { k: 'wk', l: 'Week', t: 'txt', raw: r => 'Week ' + r.k, disp: r => 'Week ' + r.k + ' · ' + rangeTxt(r.k), cell: r => num('Week ' + r.k + ' <span class="oos-sub oos-in">' + esc(rangeTxt(r.k)) + '</span>', histSpec(r.b, r.k)) },
        nm('now', 'Services booked', r => r.d.now, r => bkSpec(r.b, r.k)),
        nm('cl', 'Clients', r => r.d.cl, r => bkSpec(r.b, r.k)),
        nm('us', 'Usual by now', r => r.d.usual, r => histSpec(r.b, r.k)),
        { k: 'ex', l: 'Expected', t: 'num', raw: r => r.d.exp, disp: r => r.d.ok ? String(r.d.exp) : 'n/a', cell: r => r.d.ok ? num('<b>' + n0(r.d.exp) + '</b>', histSpec(r.b, r.k)) : 'n/a' },
        nm('ty', 'A normal week', r => r.d.typ, r => histSpec(r.b, r.k)),
        { k: 'fa', l: 'Busier', t: 'num', raw: r => r.d.f, disp: r => r.d.ok ? pctUp(r.d.f) : 'n/a', cell: r => r.d.ok ? num('<b>' + pctUp(r.d.f) + '</b> <span class="oos-sub oos-in">x ' + r.d.f.toFixed(2) + '</span>', histSpec(r.b, r.k)) : 'n/a' }],
      total: rs => { const t0 = bkTotal(rs); return { s: '<b>All salons</b>', wk: wk(cover()), now: num(n0(t0.now), bkSpec('ALL', 0)), cl: num(n0(t0.cl), bkSpec('ALL', 0)), us: num(n0(t0.usual), histSpec('ALL', 0)), ex: t0.ok ? num('<b>' + n0(t0.exp) + '</b>', histSpec('ALL', 0)) : '', ty: num(n0(t0.typ), histSpec('ALL', 0)), fa: t0.ok && t0.typ ? num('<b>' + pctUp(t0.exp / t0.typ) + '</b>', histSpec('ALL', 0)) : '' }; } });
  }
  // which weeks are counted, with what is booked and expected in each (all salons picked)
  function paintWeeks() {
    const C = cover(), el = $('oosWks'); if (!el) return;
    const ws = []; for (let j = 1; j <= C; j++) ws.push(j);
    const rowsW = ws.map(j => { const rs = S.br.map(c => S.dem[c].wk[j - 1]).filter(Boolean); return { j, now: rs.reduce((a, w) => a + w.now, 0), cl: clTotal('ALL', [j]), exp: rs.reduce((a, w) => a + w.exp, 0), ok: rs.every(w => w.ok) }; });
    el.innerHTML = ln('<b>' + (C === 1 ? 'Week counted' : 'Weeks counted (' + wk(C) + ' of cover)') + '</b>') + rowsW.map(w => ln('<b>Week ' + w.j + '</b> ' + esc(rangeTxt(w.j)) + ' · services booked ' + num(n0(w.now), bkSpec('ALL', w.j)) + ' for ' + num(n0(w.cl), bkSpec('ALL', w.j)) + ' clients · expected ' + (w.ok ? num(n0(w.exp), histSpec('ALL', w.j)) : 'n/a'))).join('') +
      (C > 1 ? ln('Later weeks are less booked, so they lean more on a normal week.') : '');
  }
  const exCol = () => selRows().filter(r => r.col && r.mn >= 3).sort((a, b) => b.q - a.q).filter(r => r.mn <= 8)[0] || selRows().filter(r => r.col && r.mn >= 3).sort((a, b) => b.q - a.q)[0] || null;
  function paintBook() {
    const sec = $('oos-1'); if (!sec) return;
    if (!S.dem) { $('oosWB').textContent = 'Next week\'s bookings are not loaded, so every product is worked out on a normal week.'; $('oosExB').hidden = true; $('oosWks').innerHTML = ''; TB.draw(); return; }
    TB.draw();
    paintWeeks();
    const cs = S.br.filter(c => S.dem[c].ok);
    if (!cs.length) { $('oosWB').textContent = 'Not enough weeks of bookings are held yet to work out a factor for the salons picked.'; $('oosExB').hidden = true; return; }
    const hi = cs.reduce((a, c) => S.dem[c].f > S.dem[a].f ? c : a, cs[0]), d = S.dem[hi], tn = S.br.reduce((a, c) => a + S.dem[c].now, 0);
    $('oosWB').innerHTML = ln('<b>' + BN[hi] + '</b> is furthest ahead for ' + esc(rangeTxt())) + ln('Services booked: ' + num(n0(d.now), bkSpec(hi)) + ' for ' + num(n0(d.cl), bkSpec(hi)) + ' clients (usually ' + n0(d.usual) + ' services by now)') + ln('Colour is counted <b>' + pctUp(d.f) + '</b> on a normal week') + ln('All salons picked: ' + n0(tn) + ' booked');
    const e = exCol(), ex = $('oosExB'); ex.hidden = !e;
    if (e) { const x = S.dem[e.b]; ex.innerHTML = '<b>Example.</b> ' + esc(BN[e.b]) + ', ' + esc(e.name) + ln('Min: ' + nu(e.mn)) + ln('Services booked: ' + n0(x.now) + ' for ' + n0(x.cl) + ' clients') + ln('Expected: ' + n0(x.exp) + ' (a normal week: ' + n0(x.typ) + ')') + ln((cover() === 1 ? 'Next week needs' : wk(cover()) + ' need') + ' about <b>' + num(nu(e.mn * e.fw), histSpec(e.b, 0)) + '</b> (Min x ' + e.fw.toFixed(2) + (cover() === 1 ? '' : ' colour weeks') + '), not ' + nu(e.mn * e.C)); }
  }

  // ── 2 THE ORDER LIST ─────────────────────────────────────────────────────────────────
  function orderRows() {
    const rs = selRows();
    if (S.filt === 'every') return selRowsX();   // every product of the plan, with or without a Min: a Quantity can be typed for any of them, and then it is in the order
    if (S.filt === 'out') return rs.filter(r => r.s <= 0);
    if (S.filt === 'u1') return rs.filter(r => r.q > 0 && r.s > 0 && r.have < r.mn);
    if (S.filt === 'low') return rs.filter(r => r.s <= r.mn);   // everything at or under Min, ordered by the rule or not: a Quantity can be typed for any of them
    return rs.filter(listed);
  }
  function buildTables() {
    buildBook();
    const nc = (k, l, get, x, first) => ({ k, l, t: 'num', x, raw: get, disp: r => nu(get(r)), cell: r => (first === 'orders' && !r.lines.length) ? nu(get(r)) : num(nu(get(r)), prodSpec(r, first || 'how')) });
    const tc = (k, l, get, x, cellf) => ({ k, l, t: 'txt', x, raw: get, disp: get, cell: cellf || (r => esc(get(r))) });
    TO = TRSheet.table({ id: 'oosOrder', el: '#oosTbl', limit: 10, rows: orderRows, rowCls: r => r.sk ? 'oos-skip' : '',
      cols: [
        tc('p', 'Product', r => r.name, 0, r => num('<b>' + esc(r.name) + '</b>', prodSpec(r, 'how')) + '<span class="oos-sub">' + esc(r.brand) + '</span>'),
        { k: 'o', l: 'Qty to Order', t: 'num', raw: r => r.o, disp: r => nu(r.o), cell: r => S.canEdit ? `<input type="number" min="0" step="1" inputmode="numeric" class="oos-ed${r.oe ? ' on' : ''}" data-ed="${esc(r.key)}" value="${r.ov}" aria-label="Quantity to order, ${esc(r.name)}, ${esc(BN[r.b])}" title="${esc(tipOf(r, r))}">` : (r.oe ? '<b>' + nu(r.o) + '</b>' : nu(r.o)) },
        { k: 'ix', l: 'In order', t: 'txt', raw: r => r.sk ? 'No' : 'Yes', disp: r => r.sk ? 'No' : 'Yes', cell: r => S.canEdit ? `<input type="checkbox" class="oos-ck" data-ck="${esc(r.key)}"${r.sk ? '' : ' checked'} aria-label="In the order: ${esc(r.name)}, ${esc(BN[r.b])}">` : (r.sk ? 'No' : 'Yes') },
        { k: 'oa', l: 'Quantity AED', t: 'num', raw: r => r.oa, disp: r => n0(r.oa), cell: r => num(n0(r.oa), prodSpec(r, 'how')) },
        tc('s', 'Salon', r => BN[r.b]), tc('ty', 'Type', r => r.type), tc('pr', 'Priority', r => r.prio),
        tc('st', 'Status', stX, 0, r => '<span class="oos-st ' + r.st + '">' + esc(stX(r)) + '</span>'),
        tc('dm', 'Demand', demTxt, 0, r => r.col && S.dm === 'book' ? '<span class="oos-dm">' + num(esc(demTxt(r)), histSpec(r.b)) + '</span>' : '<span class="oos-dm">Normal week</span>'),
        { k: 'in', l: 'In stock', t: 'num', raw: r => r.s, disp: r => nu(r.s), cell: r => num(nu(r.s), prodSpec(r, 'how')) + (r.cn ? '<span class="oos-sub">counted, Phorest ' + nu(r.s0) + '</span>' : '') },
        { k: 'ct', l: 'Counted', t: 'num', raw: r => r.cn ? r.s : -1, disp: r => r.cn ? nu(r.s) : '', cell: r => S.canEdit ? `<input type="number" min="0" step="1" inputmode="numeric" class="oos-ct${r.cn ? ' on' : ''}" data-ct="${esc(r.key)}" value="${r.cn ? r.s : ''}" placeholder="${nu(r.s0)}" aria-label="Counted on the shelf, ${esc(r.name)}, ${esc(BN[r.b])}" title="Type the number really on the shelf. It replaces the Stock List figure and ticks Verified.">` : (r.cn ? nu(r.s) : '') },
        { k: 'vf', l: 'Verified', t: 'txt', raw: r => r.vf ? 'Yes' : 'No', disp: r => r.vf ? 'Yes' : 'No', cell: r => S.canEdit ? `<input type="checkbox" class="oos-ck oos-vk" data-vk="${esc(r.key)}"${r.vf ? ' checked' : ''} aria-label="Verified: ${esc(r.name)}, ${esc(BN[r.b])}" title="${esc(vfTip(r))}">` : (r.vf ? '<span title="' + esc(vfTip(r)) + '">Yes</span>' : 'No') },
        nc('qm', 'Min order', r => r.qm),
        { k: 'am', l: 'Min AED', t: 'num', raw: r => r.am, disp: r => n0(r.am), cell: r => num(n0(r.am), prodSpec(r, 'how')) },
        nc('q', 'Max order', r => r.q),
        { k: 'a', l: 'Max AED', t: 'num', raw: r => r.aed, disp: r => n0(r.aed), cell: r => num(n0(r.aed), prodSpec(r, 'how')) },
        nc('on', 'On order', r => r.i, 1, 'orders'), nc('mn', 'Min', r => r.mn, 1), nc('mx', 'Max', r => r.mx, 1), nc('tg', 'Order up to', r => r.tgt, 1),
        { k: 'cv', l: 'Weeks left', t: 'num', x: 1, raw: r => r1(r.cov), disp: r => r1(r.cov).toFixed(1), cell: r => num(r1(r.cov).toFixed(1), prodSpec(r, 'how')) },
        tc('su', 'Supplier', r => r.sup, 1), tc('ca', 'Category', r => r.cat, 1)],
      total: rs => { const sal = {}; rs.forEach(r => { sal[r.b] = 1; }); const ns = Object.keys(sal).length, sp = rowsSpec('Products in the list, ' + scope(), rs, 'oos-list');
        return { p: '<b>' + num('Total: ' + plural(rs.length, 'product'), sp) + '</b>', s: ns + ' salon' + (ns === 1 ? '' : 's'), qm: num(nu(sum(rs, 'qm')), sp), am: num(n0(sum(rs, 'am')), sp), q: num(nu(sum(rs, 'q')), sp), a: num(n0(sum(rs, 'aed')), sp), o: num(nu(sum(rs, 'o')), sp), oa: num(n0(sum(rs, 'oa')), sp) }; },
      after: (T, rows) => {
        fadeZeros('#oosTbl');
        const c = $('oosClear'); if (c) c.hidden = !T.active();
        const n = rows.length, pages = T.pages(n), from = n ? T.page * T.shown + 1 : 0, to = Math.min(n, (T.page + 1) * T.shown);
        $('oosPgTxt').textContent = from + ' to ' + to + ' of ' + plural(n, 'product');
        $('oosPrev').disabled = T.page <= 0; $('oosNext').disabled = T.page >= pages - 1; $('oosPgN').textContent = 'Page ' + (T.page + 1) + ' of ' + pages;
      } });
    TS = TRSheet.table({ id: 'oosSup', el: '#oosSupTbl', rows: supRows, after: () => fadeZeros('#oosSupTbl'),
      cols: [
        { k: 'su', l: 'Supplier', t: 'txt', raw: r => r.sup, disp: r => r.sup, cell: r => fig('<b>' + esc(r.sup) + '</b>', 'sup', '', r.sup) },
        { k: 'n', l: 'Products', t: 'num', raw: r => r.n, disp: r => String(r.n), cell: r => fig(n0(r.n), 'sup', '', r.sup) },
        { k: 'am', l: 'Min AED', t: 'num', raw: r => r.am, disp: r => n0(r.am), cell: r => fig(n0(r.am), 'sup', '', r.sup) },
        { k: 'a', l: 'Max AED', t: 'num', raw: r => r.aed, disp: r => n0(r.aed), cell: r => fig(n0(r.aed), 'sup', '', r.sup) },
        { k: 'oa', l: 'Quantity AED', t: 'num', raw: r => r.oa, disp: r => n0(r.oa), cell: r => fig(n0(r.oa), 'sup', '', r.sup) },
        // Order now (Kate, 27 Nov 2026): opens the supplier's order window. DBD only for now; the other suppliers' button is shown but cannot be clicked yet.
        { k: 'od', l: '', t: 'txt', raw: r => r.sup === 'DBD' ? 1 : 0, disp: r => r.sup === 'DBD' ? 'Order now' : '', cell: r => r.sup === 'DBD' ? fig('<span class="oos-ordnow">Order now</span>', 'sup', '', r.sup) : '<span class="oos-ordnow" aria-disabled="true" title="Not switched on yet: DBD first">Order now</span>' }
      ].concat(B.map(c => ({ k: 'c' + c, l: BN[c] + ' max', t: 'num', x: 1, hide: () => !inSel(c), raw: r => r.by[c] ? r.by[c].aed : 0, disp: r => n0(r.by[c] ? r.by[c].aed : 0), cell: r => r.by[c] ? fig(n0(r.by[c].aed), 'sup', c, r.sup) : '0' }))),
      total: rs => { const o = { su: '<b>Total</b>', n: fig(n0(sum(rs, 'n')), 'all'), am: n0(sum(rs, 'am')), a: n0(sum(rs, 'aed')), oa: n0(sum(rs, 'oa')) }; B.forEach(c => { o['c' + c] = n0(rs.reduce((a, r) => a + (r.by[c] ? r.by[c].aed : 0), 0)); }); return o; } });
  }
  function paintW2() {
    const rs = selRows().filter(r => r.s <= 0), none = rs.filter(r => r.i === 0);
    $('oosW2').innerHTML = ln(fig(n0(rs.length), 'out') + (rs.length === 1 ? ' product has' : ' products have') + ' nothing on the shelf') + ln(none.length === rs.length && rs.length ? 'None of them has anything on order either' : n0(none.length) + ' of them have nothing on order either') + ln('<b>Start the order with those.</b>') + (S.ordersOk ? '' : ln('On order is not loaded yet, so this count is not reliable.')) + ln(vfLine());
  }

  // ── 3 BY SUPPLIER ────────────────────────────────────────────────────────────────────
  function supRows() {
    const rs = selRows().filter(listed), m = {};
    rs.forEach(r => { const o = m[r.sup] || (m[r.sup] = { sup: r.sup, n: 0, aed: 0, am: 0, oa: 0, by: {} }); if (!r.sk) o.n++; o.aed += r.aed; o.am += r.am; o.oa += r.oa; const b = o.by[r.b] || (o.by[r.b] = { n: 0, aed: 0 }); b.n++; b.aed += r.aed; });
    return Object.keys(m).map(k => m[k]).sort((a, b) => b.aed - a.aed || a.sup.localeCompare(b.sup));
  }
  function paintW3() {
    const rs = supRows(), tot = sum(rs, 'aed'), nl = rs.filter(x => x.sup === NOSUP)[0];
    if (!rs.length) { $('oosW3').textContent = 'Nothing to order for the salons picked.'; return; }
    const top = rs.filter(x => x.sup !== NOSUP)[0] || rs[0]; $('oosW3').innerHTML = ln('<b>' + esc(top.sup) + '</b> is ' + Math.round(100 * top.aed / (tot || 1)) + '% of the maximum order') + ln('AED ' + fig(n0(top.aed), 'sup', '', top.sup) + ' maximum · ' + fig(n0(top.am), 'sup', '', top.sup) + ' minimum') + ln('<b>Send that order first.</b>') + (nl ? ln(fig(n0(nl.n), 'sup', '', NOSUP) + (nl.n === 1 ? ' product (AED ' : ' products (AED ') + fig(n0(nl.aed), 'sup', '', NOSUP) + ')' + ' with no supplier yet. Ask ate Tine.') : '');
  }

  // ── HOW IT IS WORKED OUT, ABOUT: one card at a time ──────────────────────────────────
  const HOW = {
    qmin: ['Minimum order', 'Up to the order point, less the shelf and what is on order. Only when under the order point. The least that gets the product back to cover. The order point is Min x weeks; for colour, each week ahead counts at its own expected size.', e => num(nu(e.qm), prodSpec(e, 'how')) + ' = ' + nu(e.trig) + ' − ' + nu(e.s) + ' − ' + nu(e.i), e => esc(e.name) + ', ' + BN[e.b] + '. Min ' + nu(e.mn) + ', weeks ' + e.C + '.'],
    qty: ['Maximum order', 'Up to the order point + the plan\'s cushion (Max - Min), less the shelf and what is on order. Only when under the order point.', e => num(nu(e.q), prodSpec(e, 'how')) + ' = ' + nu(e.tgt) + ' − ' + nu(e.s) + ' − ' + nu(e.i), e => esc(e.name) + ', ' + BN[e.b] + '. Min ' + nu(e.mn) + ', Max ' + nu(e.mx) + ', cushion ' + nu(e.cush) + ', weeks ' + e.C + (e.col && S.dm === 'book' ? ', colour factor ' + e.f.toFixed(2) : '') + '.'],
    use: ['Min and Max', 'Min is one week of use. Max is Min plus 3, or the number set in the plan. Max - Min is the cushion the maximum order adds above the order point.', e => 'Min ' + num(nu(e.mn), prodSpec(e, 'how')) + ' · Max ' + num(nu(e.mx), prodSpec(e, 'how')), e => esc(e.name) + ', ' + BN[e.b] + '. The order starts under Min x weeks.'],
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
    rule: ['The order rule', 'Order when shelf and on order are under the order point. The minimum order goes up to the order point. The maximum order goes up to the order point + the plan\'s cushion (Max - Min).', 'The order point is Min x weeks. For colour, each week ahead counts at its own expected size: Min x (week 1 + week 2 + ...). At 1 week the maximum is Max, as before. At 2 weeks or more it is higher, so Max is never below Min x weeks.'],
    demand: ['Next week\'s bookings', 'Colour products (IGORA Vibrance, Royal, Zero, Color 10, BLONDME, Vario, Color Expert) are scaled by how busy the salon\'s colour is next week.', 'Measured: the colour services booked. Estimated: how many will be done in all. Not tied to bookings: everything else, retail included. Order for A normal week turns it off.'],
    plan: ['Priority and type', 'Both come from the Weekly Product Plan, read live. Change them there, not here.', 'A is the first 80% of spend, or what the plan marks A.'],
    cover: ['Weeks of cover', '1 week as a rule. 2 weeks from 15 Nov to 31 Dec, for the busy weeks.', 'It moves the order point: Min x weeks. Change it with the picker at the top.'],
    mov: ['Which products', 'Priority A by default. A and B is a switch at the top. Products with Min 0 never show here.', 'Only the four UAE salons: Bahrain is not in these numbers.'],
    min: ['Min and Max', 'Min is one week of use. Max is Min plus 3, unless the plan sets its own number.', 'The gap between them is the cushion. Edit them in the Weekly Product Plan, not here.'],
    fresh: ['How fresh', 'Shelf counts come from the Phorest Stock List, bookings from Phorest Staff Appointments. The dates are under the answer at the top.', 'Both are read by the Phorest sync (9 am, 1 pm, 5 pm, 9 pm and 1 am). On order counts the last 60 days.'],
    sup: ['Suppliers', 'The names are the suppliers of the Orders and Receipts page. The plan names DBD, Eideal and Madi; the others come from the brand, read off the orders and receipts there. A brand with no supplier on that page shows as Not linked yet.', 'Tell Kate when a supplier is wrong and it is changed here.'],
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
    paintNote(); paintAnswer(); paintBook(); paintBars(); TO.draw(); paintW2(); TS.draw(); paintW3(); paintHow(); paintAbout(); paintBulkCard(); paintResets();
    if (S.edFail) edMsg('Your saved amounts and ticks did not load just now (the database was slow). They are safe. This page asks again by itself; do not type amounts until they are back.');
    offsets();
  }
  function wire() {
    const host = $('outofstockContent');
    host.addEventListener('click', e => {
      const v = e.target.closest('[data-of]');
      if (v) { S.filt = v.dataset.of; host.querySelectorAll('[data-of]').forEach(b => { b.classList.toggle('on', b === v); b.setAttribute('aria-pressed', b === v); }); TO.page = 0; TO.draw(); paintW2(); offsets(); return; }
      if (e.target.closest('#oosMore')) { TO.toggleMore(); e.target.closest('#oosMore').classList.toggle('on', TO.more); e.target.closest('#oosMore').setAttribute('aria-pressed', TO.more); offsets(); return; }
      if (e.target.closest('#oosMore3')) { TS.toggleMore(); e.target.closest('#oosMore3').classList.toggle('on', TS.more); e.target.closest('#oosMore3').setAttribute('aria-pressed', TS.more); return; }
      const rs = e.target.closest('[data-reset]'); if (rs) { resetSalon(rs.dataset.reset); return; }
      if (e.target.closest('#oosBulk')) { openBulk(); return; }
      const bc = e.target.closest('[data-bkc]'); if (bc) { if (bc.dataset.bkc === 'open') openBulk(); else bkFresh(); return; }
      if (e.target.closest('#oosRefresh, #oosRefresh4')) { refreshStock(); return; }
      if (e.target.closest('#oosClear')) { TO.clear(); TO.draw(); return; }
      if (e.target.closest('#oosPrev')) { if (TO.page > 0) { TO.page--; TO.draw(); } return; }
      if (e.target.closest('#oosNext')) { TO.page++; TO.draw(); return; }
      const h = e.target.closest('[data-how]'); if (h) { S.hk = h.dataset.how; paintHow(); return; }
      const a = e.target.closest('[data-about]'); if (a) { S.ak = a.dataset.about; paintAbout(); return; }
    });
    let fkey = null;   // the box the reader is in (Quantity or Counted): the list is drawn again after a save, and the focus goes back to it
    const fkOf = i => i ? (i.dataset.ed ? 'e:' + i.dataset.ed : 'c:' + i.dataset.ct) : null;
    host.addEventListener('focusin', e => { fkey = fkOf(e.target.closest && e.target.closest('input.oos-ed, input.oos-ct')); });
    new MutationObserver(() => { if (!document.body.classList.contains('dr-open') && S.dirty) refreshLists(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });   // typed or ticked inside a window: the page behind is drawn again when it closes
    host.addEventListener('change', async e => {
      const ei = e.target.closest && e.target.closest('input.oos-ed'), ck = e.target.closest && e.target.closest('input.oos-ck:not(.oos-vk)'), ci = e.target.closest && e.target.closest('input.oos-ct'), vk = e.target.closest && e.target.closest('input.oos-vk');
      if (ei || ck || ci || vk) {
        try {
          if (ck) await commitSkip(ck.dataset.ck, !ck.checked);
          else if (vk) await commitVerify(vk.dataset.vk, vk.checked);
          else { const x = ci || ei, v = parseQty(x.value); if (v !== v) edMsg('Type a whole number, 0 or more.'); else { if (ci) await commitCount(ci.dataset.ct, v); else await commitEdit(ei.dataset.ed, v); edMsg(''); } }
          if (ck || vk) edMsg('');
        } catch (x) { console.error(x); edMsg('That was not saved. Try again.'); }
        setTimeout(() => { refreshLists(); offsets(); const t = fkey && Array.from(host.querySelectorAll('input.oos-ed, input.oos-ct')).find(y => fkOf(y) === fkey); if (t) { t.focus(); try { t.select(); } catch (z) {} } }, 60);
        return;
      }
      const id = /^(oosDemand|oosPrio|oosCover)4$/.test(e.target.id) ? e.target.id.slice(0, -1) : e.target.id;   // the pickers in section 4 do the same as the top ones
      if (id === 'oosDemand') { S.dm = e.target.value === 'typ' ? 'typ' : 'book'; TO.clear(); TS.clear(); TO.page = 0; draw(); }
      else if (id === 'oosPrio') { S.prio = e.target.value; TO.clear(); TS.clear(); TO.page = 0; draw(); }
      else if (id === 'oosCover') { S.cover = +e.target.value; TO.clear(); TS.clear(); TO.page = 0; draw(); }
      else if (id === 'oosRows') { TO.shown = +e.target.value || 10; TO.page = 0; TO.draw(); offsets(); }
    });
    $('oos-4').addEventListener('toggle', () => { if ($('oos-4').open) TS.draw(); offsets(); });
  }
  window.renderOutOfStock = async function renderOutOfStock() {
    const host = $('outofstockContent'); if (!host) return;
    if (!$('oosMsg')) {
      host.innerHTML = '<div class="oos-msg" id="oosMsg"></div><div id="oosBody"></div>';
      const intro = $('outofstockIntro');
      if (intro) intro.innerHTML = `<section class="slv-intro"><h2>Out of stock: what to order for next week</h2><p><span class="oos-ln">What each salon is short of, and what it costs, for the <b>Monday order</b>.</span><span class="oos-ln">A <b>minimum</b> order and a <b>maximum</b> order.</span><span class="oos-ln">Colour follows the colour services already booked for next week.</span><span class="oos-ln">The <b>Branch</b> at the top picks the salons. The <b>Period</b> does not apply here.</span></p></section>`;
    }
    const seq = ++S.seq;
    if (!S.rows) msg('Loading the order list…');
    try {
      await load(false);
      if (seq !== S.seq) return;
      if (S.state === 'denied') { msg('This page is for coordinators and above. Ask Kate if you need it.'); return; }
      draw(); watchPlan();
    } catch (e) {
      console.error(e);
      if (seq === S.seq) msg('The order list did not load. <button type="button" class="cm-pill" id="oosRetry">Try again</button>');
      const r = $('oosRetry'); if (r) r.onclick = () => { S.rows = null; window.renderOutOfStock(); };
    }
  };
  // Watch the plan while the page is open (Kate, 26 Nov 2026). Every 45 seconds, and the moment the tab is looked at again, one small call (oos_plan_stamp: when the plan was last edited,
  // how many edits and scope rows it holds, the newest price list, the newest finished Phorest sync). If it differs from the stamp the data was read with, the page reads everything again and redraws.
  let pollT = null, checking = false;
  async function checkStamp() {
    if (checking || document.hidden || !S.rows || typeof CURRENT_VIEW === 'undefined' || CURRENT_VIEW !== 'outofstock') return;
    checking = true;
    try {
      if (document.activeElement && document.activeElement.classList && (document.activeElement.classList.contains('oos-ed') || document.activeElement.classList.contains('oos-ct'))) return;   // someone is typing a quantity: not now
      const er = await Promise.resolve(sb.rpc('oos_order_edits_get')).then(x => x, e => ({ error: e }));   // quantities typed in or products ticked off by someone else
      if (er && !er.error && er.data && !er.data.denied) {
        const wasFail = S.edFail, sig0 = S.bulkSig; S.edFail = false;
        applyBulk(await Promise.resolve(sb.rpc('oos_bulk_get')).then(x => x, e => ({ error: e })));
        if (wasFail || S.bulkSig !== sig0 || JSON.stringify([er.data.day || '', er.data.edits || {}, er.data.skips || {}, er.data.counts || {}, er.data.verified || {}]) !== S.edSig) { applyEdits(er.data); S.eds++; memoM = {}; draw(); }
      }
      const r = await sb.rpc('oos_plan_stamp'), d = r && !r.error ? r.data : null;
      if (!d || d.denied || !S.stamp || JSON.stringify(d) === S.stamp) return;
      await load(true); S.refreshedAt = new Date().toISOString(); draw();
    } catch (e) { console.error(e); } finally { checking = false; }
  }
  window.oosCheckNow = checkStamp;
  function watchPlan() {
    if (pollT) return;
    pollT = setInterval(checkStamp, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkStamp(); });
    window.addEventListener('focus', checkStamp);
  }
  window.addEventListener('resize', () => { if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'outofstock') offsets(); });
  window.addEventListener('scroll', () => { if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW === 'outofstock') offsets(); }, { passive: true });

  // ── DOWNLOADS (report-export.js draws the buttons; page-export.js puts one pair in the masthead) ──
  const r2 = x => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
  const subtitle = () => scope() + ' · ' + (demOn() ? 'next week\'s bookings counted (' + rangeTxt() + ')' : 'a normal week') + ' · Priority ' + (S.prio === 'A' ? 'A' : 'A and B') + ' · ' + wk(cover()) + ' of cover · shelf of ' + shelfDate() + (S.ordersOk ? '' : ' · on-order counts not loaded yet, on order shows 0');
  const fileName = part => ['out-of-stock', part, scope()].map(slug).join('-');
  function orderSheet() {
    if (!S.rows || !TO) return null;
    const rows = TO.rows(); if (!rows.length) return null;
    const cols = [{ key: 'b', label: 'Salon', fmt: 'text' }, { key: 'sup', label: 'Supplier', fmt: 'text' }, { key: 'brand', label: 'Brand', fmt: 'text' }, { key: 'p', label: 'Product', fmt: 'text' }, { key: 'ty', label: 'Stock type', fmt: 'text' },
      { key: 'cat', label: 'Category', fmt: 'text' }, { key: 'pr', label: 'Priority', fmt: 'text' }, { key: 'st', label: 'Status', fmt: 'text' }, { key: 'in', label: 'In stock', fmt: 'num' }, { key: 'on', label: 'On order', fmt: 'num' },
      { key: 'mn', label: 'Min', fmt: 'num' }, { key: 'mx', label: 'Max', fmt: 'num' }, { key: 'fa', label: 'Colour weeks counted (cover)', fmt: 'num' }, { key: 'tg', label: 'Order up to (order point + cushion)', fmt: 'num' }, { key: 'cv', label: 'Weeks left', fmt: 'num' }, { key: 'qm', label: 'Min order', fmt: 'num' }, { key: 'q', label: 'Max order', fmt: 'num' },
      { key: 'c', label: 'Cost a unit (AED)', fmt: 'aed' }, { key: 'am', label: 'Min AED', fmt: 'aed' }, { key: 'a', label: 'Max AED', fmt: 'aed' },
      { key: 'ix', label: 'In the order', fmt: 'text' }, { key: 'o', label: 'Quantity (what will be ordered)', fmt: 'num' }, { key: 'oe', label: 'Quantity typed in', fmt: 'text' }, { key: 'oa', label: 'Quantity AED', fmt: 'aed' },
      { key: 'ct', label: 'Counted on the shelf', fmt: 'num' }, { key: 'vf', label: 'Shelf figure verified', fmt: 'text' }];
    const lines = rows.map(r => ({ cells: [BN[r.b], r.sup, r.brand, r.name, r.type, r.cat, r.prio, stTxt(r), r.s, r.i, r.mn, r.mx, (r.col && S.dm === 'book' ? r2(r.fw) : r.C), r.tgt, r1(r.cov), r.qm, r.q, r2(r.c), r2(r.am), r2(r.aed), r.sk ? 'No' : 'Yes', r.o, r.oe ? 'Yes' : '', r2(r.oa), r.cn ? r.s : null, r.vf ? 'Yes' : 'No'] }));
    return { name: 'Order list', title: 'Out of Stock: the order list', subtitle: subtitle() + '.', blocks: [{ cols, rows: lines }],
      legend: [['Min order', 'Up to the order point, less the shelf and what is on order. Only when shelf and on order are under the order point (Min x weeks; for colour, next week counts Min x the colour factor).'], ['Max order', 'Up to the order point + the plan\'s cushion (Max - Min), less the shelf and what is on order. Only when shelf and on order are under the order point.'], ['Colour factor', 'Expected colour services next week divided by a normal week, for colour products. 1 for everything else.'], ['Qty to Order', 'The amount that will be ordered: the minimum order, unless an amount was typed in for the product on the page (Quantity typed in = Yes). 0 when the product was taken out (In the order = No).'], ['Counted on the shelf', 'A shelf count typed by hand. When there is one, the order is worked out from it and the In stock column holds it. Shelf figure verified = Yes when someone ticked it or typed a count.'], ['Min', 'One week of use, from the Weekly Product Plan.'], ['Weeks left', 'Shelf and on order together, divided by Min.'], ['On order', 'Units on stock orders from the last 60 days that have not arrived.']] };
  }
  function supSheet() {
    if (!S.rows || !TS) return null;
    const rows = TS.rows(); if (!rows.length) return null;
    const cols = [{ key: 'su', label: 'Supplier', fmt: 'text' }, { key: 'n', label: 'Products', fmt: 'num' }, { key: 'am', label: 'Min AED', fmt: 'aed' }, { key: 'a', label: 'Max AED', fmt: 'aed' }, { key: 'oa', label: 'Quantity AED', fmt: 'aed' }].concat(B.filter(inSel).map(c => ({ key: 'c' + c, label: BN[c] + ' (max AED)', fmt: 'aed' })));
    const lines = rows.map(r => ({ cells: [r.sup, r.n, r2(r.am), r2(r.aed), r2(r.oa)].concat(B.filter(inSel).map(c => r2(r.by[c] ? r.by[c].aed : 0))) }));
    return { name: 'By supplier', title: 'Out of Stock: by supplier', subtitle: subtitle() + '.', blocks: [{ cols, rows: lines }] };
  }
  function bookSheet() {
    if (!S.dem || !TB) return null;
    const rows = TB.rows(); if (!rows.length) return null;
    const cols = [{ key: 's', label: 'Salon', fmt: 'text' }, { key: 'wk', label: 'Week', fmt: 'text' }, { key: 'now', label: 'Colour services booked so far', fmt: 'num' }, { key: 'cl', label: 'Clients (distinct)', fmt: 'num' }, { key: 'us', label: 'Usually booked by now', fmt: 'num' }, { key: 'ex', label: 'Expected (estimate)', fmt: 'num' }, { key: 'ty', label: 'A normal week', fmt: 'num' }, { key: 'f', label: 'Colour factor', fmt: 'num' }];
    return { name: 'Next weeks', title: 'Out of Stock: next weeks\' bookings', subtitle: 'Colour services, ' + wk(cover()) + ' of cover from ' + rangeTxt(1) + '.', blocks: [{ cols, rows: rows.map(r => ({ cells: [BN[r.b], 'Week ' + r.k + ' ' + rangeTxt(r.k), r.d.now, r.d.cl, Math.round(r.d.usual), r.d.ok ? r.d.exp : null, Math.round(r.d.typ), r.d.ok ? r.d.f : null] })) }] };
  }
  window.oosExportBook = () => { const s = bookSheet(); return s ? { name: fileName('next-week-bookings'), csv: 0, sheets: [s] } : null; };
  window.oosExportOrder = () => { const s = orderSheet(); return s ? { name: fileName('order-list'), csv: 0, sheets: [s] } : null; };
  window.oosExportSup = () => { const s = supSheet(); return s ? { name: fileName('by-supplier'), csv: 0, sheets: [s] } : null; };
  // The whole page in one workbook: the order list, then by supplier. The CSV is the order list.
  window.oosExportPage = () => { const a = orderSheet(); if (!a) return null; const b = supSheet(); const k = bookSheet(); return { name: fileName('page'), csv: 0, sheets: [a].concat(b ? [b] : []).concat(k ? [k] : []) }; };
})();
