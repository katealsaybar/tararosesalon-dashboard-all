// The Organisation Pulse's figures open the rows behind them (Kate, 27 Oct 2026). The window itself is drill.js (TRSD).
//
// Two kinds of list, and the card says which:
//   Staff, day and branch lists are read from the SAME rows the Pulse already loaded (window._fnRows: the ledger rows and Phorest's staff rows of the
//   window, after the branch filter) and run through the SAME aggregator (aggDailyData) one branch, one day or one month at a time. So they add up to
//   the figure by construction. Where a list ends a little off the card (the card works a window out as a whole, the list branch by branch) the last
//   row says so and brings the list to the card's figure; it is never hidden.
//   Client lists are the one place with real client rows: drill_door_clients (migrations/drill_door_clients.sql), the same rules as door_clients.
//
// Needs from dashboard.js (shared script scope): aggDailyData, staffMapKey, titleCaseName, BRANCH_INFO, CUR, sel, dateFrom, dateTo, dateToIso, scopeCodes, sb.
const PD = (() => {
  const esc = s => TRSD.esc(s);
  const bname = c => (BRANCH_INFO[c] && BRANCH_INFO[c].name) || c;
  // A person's first and last name (Kate, 27 Oct 2026). The ledgers write first names only, so the surname is read from the roster (staff-profiles.js),
  // then from Phorest's own name for her; a name that already has a space (Phorest's, or the stylist pages') is left as it is.
  const nm = s => {
    const t = titleCaseName(s);
    if (/\s/.test(String(s).trim())) return t;
    const last = (typeof staffSurname === 'function') ? staffSurname(s) : null;
    if (last) return t + ' ' + titleCaseName(last);
    const ph = (typeof PHOREST_FULL_NAMES !== 'undefined') ? PHOREST_FULL_NAMES[staffMapKey(s)] : null;
    return ph && ph.indexOf(' ') > 0 ? t + ' ' + titleCaseName(ph.slice(ph.indexOf(' ') + 1)) : t;
  };
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const money = (v, cur) => (cur || 'AED') + ' ' + Math.round(+v || 0).toLocaleString('en-GB');
  const cnt = v => Math.round(+v || 0).toLocaleString('en-GB');
  const DAY_VIEW_MAX = 92;   // up to this many days the day-by-day list is by day, longer windows go by month

  // The window as the Pulse drew it. Called from renderDashboard with the card's own figures, so the lists can say what they must add up to.
  function snap(s, card, label, range) {
    const codes = sel.branch.includes('all') ? null : sel.branch;
    const list = (codes && codes.length) ? codes : scopeCodes();
    const weekly = (!window._fnRows && Array.isArray(window._cachedWeeklyTotals) && window._cachedWeeklyTotals.length)
      ? window._cachedWeeklyTotals.filter(r => sel.branch.includes('all') || sel.branch.includes(r.branch)) : null;
    return {
      s, card, label, range, cur: CUR(), rows: window._fnRows || null, weekly,
      from: dateFrom ? dateToIso(dateFrom) : null, to: dateTo ? dateToIso(dateTo) : null,
      days: (dateFrom && dateTo) ? Math.round((dateTo - dateFrom) / 86400000) + 1 : 0,
      door: { codes: list, count: s.doorClients },
    };
  }

  // One aggregation per branch, from the rows already loaded.
  function branches(ctx) {
    if (ctx._bb) return ctx._bb;
    const L = (ctx.rows && ctx.rows.ledger) || [], P = (ctx.rows && ctx.rows.phorest) || [];
    const order = Object.keys(BRANCH_INFO);
    const codes = [...new Set(L.map(r => r.branch).concat(P.map(r => r.branch)))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    ctx._bb = codes.map(code => ({ code, d: aggDailyData([], L.filter(r => r.branch === code), P.filter(r => r.branch === code)) })).filter(x => x.d);
    return ctx._bb;
  }

  const deptTitle = dept => dept === 'hair' ? ' · Hair' : dept === 'beauty' ? ' · Beauty' : '';
  const deptCols = dept => dept ? [] : [{ k: 'dp', l: 'Department' }];
  // One row per person per branch, with the hair side and the beauty side as the Pulse splits them.
  function staffRows(ctx, dept) {
    const out = [];
    branches(ctx).forEach(b => {
      if (dept !== 'beauty') (b.d.hairStaff || []).forEach(st => out.push({ b: bname(b.code), n: nm(st.name), dp: 'Hair', st, code: b.code }));
      if (dept !== 'hair') (b.d.beautyStaff || []).forEach(st => out.push({ b: bname(b.code), n: nm(st.name), dp: 'Beauty', st, code: b.code }));
    });
    return out;
  }
  // The retail nobody was credited with. In the all-department lists it is split by what was sold (the product names on the BUSINESS TRS lines of the
  // sales lines: Hair, Beauty, Unsorted), scaled to the ledger's own figure so the lines still add to the card. In the Hair and Beauty lists it is shared the
  // way the card shares it, so those still add to their card. One line per branch.
  async function ensureHouseSplit(ctx) {
    if (ctx._hs !== undefined) return;
    ctx._hs = null;
    const codes = branches(ctx).filter(b => Math.abs(+b.d.summary.retailUnattributed || 0) >= 0.005).map(b => b.code);
    if (!codes.length || !ctx.from || !ctx.to) return;
    try {
      const { data, error } = await sb.rpc('drill_house_retail', { p_from: ctx.from, p_to: ctx.to, p_branches: codes });
      if (error) throw error;
      const m = {};
      (data || []).forEach(r => { (m[r.b] = m[r.b] || { hair: 0, beauty: 0, unsorted: 0 })[r.d] += +r.v || 0; });
      ctx._hs = m;
    } catch (e) { ctx._hs = null; }   // the split is a bonus: without it the lists fall back to the card's own share
  }
  function houseRetail(ctx, dept) {
    const out = [];
    branches(ctx).forEach(b => {
      const s = b.d.summary, ua = +s.retailUnattributed || 0;
      if (Math.abs(ua) < 0.005) return;
      const hs = !dept && ctx._hs && ctx._hs[b.code];
      if (hs) {
        const tot = hs.hair + hs.beauty + hs.unsorted;
        if (tot > 0.005) {
          [['Hair', hs.hair], ['Beauty', hs.beauty], ['Unsorted', hs.unsorted]].forEach(([dp, v]) => {
            const x = v / tot * ua;
            if (Math.abs(x) >= 0.005) { const sp = houseRetailSpec(ctx, { code: b.code, dept: dp.toLowerCase() }); out.push({ b: bname(b.code), n: 'Retail rung with no stylist', dp, svc: 0, rt: x, net: x, cl: null, _cls: 'dr-muted', _sp: sp, _dn: { rt: sp, net: sp } }); }
          });
          return;
        }
      }
      const sh = ctx.s.retailHairShare == null ? 1 : ctx.s.retailHairShare;   // the card's share for the whole window, so the hair and beauty lists add up to the card
      const row = (v, dp) => { if (Math.abs(v) >= 0.005) { const sp = houseRetailSpec(ctx, { code: b.code, dept: dp ? dp.toLowerCase() : (dept || null) }); out.push({ b: bname(b.code), n: 'Retail rung with no stylist', dp, svc: 0, rt: v, net: v, cl: null, _cls: 'dr-muted', _sp: sp, _dn: { rt: sp, net: sp } }); } };
      if (dept === 'hair') row(ua * sh, '');
      else if (dept === 'beauty') row(ua * (1 - sh), '');
      else { row(ua * sh, 'Hair'); row(ua * (1 - sh), 'Beauty'); }   // both departments listed: one line each, so the department column is never blank and the two still add to the card
    });
    return out;
  }
  const HOUSE_NOTE = 'The retail rung with no stylist is the BUSINESS TRS house account, and the ledger does not say whether it was hair or beauty. Its Hair, Beauty and Unsorted lines go by the product names on those sales lines (Unsorted is what the name does not settle), scaled to the ledger figure so the lines add to the card. The Hair and Beauty net take lists add the Unsorted line to Hair and Beauty by credited retail, the way the cards do, so their house line is the Hair or Beauty line here plus its share of Unsorted.';
  const DIFF_NOTE = 'The last grey line is the gap between the figure and the rows above. The two are worked out in a slightly different order (for example the retail nobody was credited with is shared between hair and beauty over the whole window in one, and branch by branch or day by day in the other). It brings the list to the figure.';
  function diffRow(label, have, want, extra) {
    if (!(Math.abs(have - want) >= 0.5)) return null;
    return Object.assign({ b: '', n: label, _cls: 'dr-muted' }, extra);
  }

  // ── Net take by staff ──
  function netStaff(ctx, dept) {
    const rows = staffRows(ctx, dept).map(r => {
      const svc = r.dp === 'Hair' ? r.st.hairSalesNet : r.st.beautySales;
      return withServicesDn(ctx, r, withServicesDn(ctx, r, withServicesDn(ctx, r, withClientsDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, svc, rt: r.st.retail, net: r.st.netSalonTake, cl: r.st.total }), 'svc', svc), 'rt', r.st.retail, 'retail'), 'net', r.st.netSalonTake, 'net');
    }).filter(r => r.net || r.cl).sort((a, b) => b.net - a.net);
    const house = houseRetail(ctx, dept);
    const all = rows.concat(house);
    const want = dept === 'hair' ? ctx.card.hairNet : dept === 'beauty' ? ctx.card.beautyNet : ctx.card.net;
    const sum = all.reduce((a, r) => a + (r.net || 0), 0);
    const d = diffRow('Not matched to a branch row', sum, want, { svc: '', rt: '', net: want - sum, cl: null });
    if (d) all.push(d);
    return {
      cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, ...deptCols(dept), { k: 'svc', l: 'Services', t: 'aed' }, { k: 'rt', l: 'Retail', t: 'aed' }, { k: 'net', l: 'Net take', t: 'aed' }, { k: 'cl', l: 'Clients', t: 'num' }],
      rows: all,
      foot: { b: 'Total', n: '', dp: '', svc: all.reduce((a, r) => a + (+r.svc || 0), 0), rt: all.reduce((a, r) => a + (+r.rt || 0), 0), net: want, cl: all.reduce((a, r) => a + (+r.cl || 0), 0) },
      sub: `${esc(ctx.label)}. Services and retail each stylist was credited with, from the branch ledgers matched to Phorest by staff and day. Retail rung with no stylist is shown on its own line per branch, split ${!dept && ctx._hs ? 'by what was sold: Hair, Beauty and Unsorted' : "between Hair and Beauty by the card's share"}.`,
      note: (d ? DIFF_NOTE + ' ' : '') + (!dept && ctx._hs ? HOUSE_NOTE : ''),
    };
  }

  // ── Clients per staff (the ledgers) ──
  // ── The clients behind a staff member's Clients figure (Kate, 27 Oct 2026) ──
  // The ledger count is typed in, so the names come from Phorest's sales lines: every client each staff member handled that day, the rule Kate gave for
  // "clients handled per staff". It is a different count from the ledger's and the window says both. Level 3 and above (the names are Phorest's).
  const canNames = () => typeof TRS_LEVEL !== 'undefined' && TRS_LEVEL >= 3;
  function phoneNames(ctx, code, staffName) {
    const key = ledgerNameKey(staffName), out = new Set();
    ((ctx.rows && ctx.rows.phorest) || []).forEach(r => {
      if (r.is_total || r.branch !== code) return;
      const k = cleanPhorestName(r.employee_name);
      if (k === key || k.indexOf(key + ' ') === 0) out.add(r.employee_name);
    });
    return [...out];
  }
  // Every Phorest name a department's staff go by, for a list that is one department's (the Hair and Beauty By day lists).
  function deptEmps(ctx, dept) { const set = new Set(); staffRows(ctx, dept).forEach(r => phoneNames(ctx, r.code, r.st.name).forEach(n => set.add(n))); return [...set]; }
  async function staffClientsLoad(ctx, o) {
    const { data, error } = await sb.rpc('drill_staff_clients', { p_from: o.from, p_to: o.to, p_branches: o.branches, p_employees: o.employees });
    if (error) throw error;
    return data;
  }
  // ── What a client spent (Kate, 27 Oct 2026: "clickable din yung AED amounts, to show ano yung ginastos nung client") ──
  // The Spent figure on a client row opens the lines behind it, as a receipt: date, branch, who rang it, what it was, what it came to.
  async function clientLinesLoad(o) {
    const { data, error } = await sb.rpc('drill_client_lines', { p_from: o.from, p_to: o.to, p_branches: o.branches, p_client: o.client, p_employees: o.employees });
    if (error) throw error;
    return data;
  }
  function clientLinesSpec(ctx, o) {
    if (!canNames() || !o.from || !o.client) return null;
    const one = o.from === o.to;
    return { title: `Spent · ${o.client}`, cur: ctx.cur, views: [
      { id: 'lines', label: 'Lines', load: async () => {
        const data = await clientLinesLoad(o), rows = data.rows || [];
        let t = `${esc(ctx.label)}. ${esc(o.client)}${o.who ? ', seen by ' + esc(o.who) : ''}${one ? ', ' + TRSD.fmt.day(o.from) : ''}: AED ${cnt(Math.round(data.total))} over ${cnt(data.lines)} line${data.lines === 1 ? '' : 's'}, from Phorest's sales lines (a deposit, a balance payment or a voucher bought on its own is left out, refunds come off).`;
        if (data.lines > rows.length) t += ` The newest ${cnt(rows.length)} are shown.`;
        return { sub: t, cols: [...(one ? [] : [{ k: 'd', l: 'Date', t: 'date' }]), { k: 'b', l: 'Branch' }, { k: 'e', l: 'Staff' }, { k: 'i', l: 'Item' }, { k: 'n', l: 'Net', t: 'aed' }],
          rows: rows.map(r => ({ d: r.d, b: bname(r.b), e: nm(r.e), i: r.r ? r.i + ' (refund)' : r.i, n: r.n })), foot: data.lines <= rows.length ? { d: '', b: '', e: '', i: cnt(data.lines) + ' lines', n: data.total } : null };
      } },
    ] };
  }
  // ── One client in her own window (Kate, 27 Oct 2026: "client name clickable, to show appointment history", "pop up in new window") ──
  // Her visits come from the sales lines (a visit is a client-day with a paid sale, the rule of clients through the door) and her upcoming bookings from the Phorest
  // bookings pulled into client_bookings (drill_client_history, Level 3 and above). Phone and email are in the summary at Level 5 only, as in Client Book. Phorest visit and
  // client notes are deliberately not here: they are complaint-scan material.
  function clientHistorySpec(ctx, o) {
    if (!canNames() || !o.client) return null;
    let P = null;
    const load = () => P || (P = (async () => { const { data, error } = await sb.rpc('drill_client_history', { p_client: o.client, p_branches: o.branches || null }); if (error) throw error; return data; })().catch(e => { P = null; throw e; }));
    const people = t => (t || []).map(x => `${esc(nm(x.e))} (${cnt(x.d)})`).join(', ');
    const sub = d => {
      let t = `${esc(o.client)}: ${cnt(d.visits)} visit${d.visits === 1 ? '' : 's'}`;
      if (d.visits) t += `, first ${TRSD.fmt.day(d.first)}, last ${TRSD.fmt.day(d.last)}, AED ${cnt(Math.round(d.spent))} spent`;
      t += ' (from Phorest sales lines: a visit is a day with a paid sale; deposits, balance payments and vouchers are not visits).';
      if (d.team && d.team.length) t += ` Most often seen by ${people(d.team)}.`;
      if (d.since) t += ` Phorest profile created ${TRSD.fmt.day(d.since)}.`;
      if (d.contact && (d.contact.m || d.contact.e)) t += ` ${d.contact.m ? 'Phone ' + esc(d.contact.m) + '. ' : ''}${d.contact.e ? 'Email ' + esc(d.contact.e) + '.' : ''}${d.contact.n > 1 ? ' (' + cnt(d.contact.n) + ' Phorest profiles carry this name.)' : ''}`;
      return t;
    };
    return { title: `Client · ${o.client}`, panel: true, tip: 'See her visits', cur: ctx.cur, views: [
      { id: 'visits', label: 'Visits', load: async () => {
        const d = await load(), rows = d.rows || [];
        return { sub: sub(d), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Branch' }, { k: 'e', l: 'Staff' }, { k: 's', l: 'Services' }, { k: 'p', l: 'Retail' }, { k: 'n', l: 'Spent', t: 'aed' }],
          rows: rows.map(r => ({ d: r.d, b: bname(r.b), e: String(r.e || '').split(', ').filter(Boolean).map(nm).join(', '), s: r.s || '', p: r.p || '', n: r.n,
            _dn: { n: clientLinesSpec(ctx, { from: r.d, to: r.d, branches: [r.b], employees: null, client: o.client }) } })),
          foot: d.visits <= rows.length ? { d: '', b: '', e: '', s: cnt(d.visits) + ' visits', p: '', n: d.spent } : null,
          empty: 'No paid visits found for this name.' };
      } },
      { id: 'upcoming', label: 'Upcoming', load: async () => {
        const d = await load(), rows = d.upcoming || [];
        return { sub: `${esc(o.client)}: ${cnt(rows.length)} upcoming booking${rows.length === 1 ? '' : 's'}, from the Phorest bookings pulled on ${d.pulled ? TRSD.fmt.day(d.pulled) : 'an earlier day'}. A booking made or changed since then is not here.`,
          cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Branch' }, { k: 'e', l: 'Staff' }, { k: 's', l: 'Services' }],
          rows: rows.map(r => ({ d: r.d, b: bname(r.b), e: String(r.e || '').split(', ').filter(Boolean).map(nm).join(', '), s: r.s || '' })), empty: 'No upcoming bookings found.' };
      } },
    ] };
  }
  // ── The lines behind "Retail rung with no stylist" (Kate, 27 Oct 2026: "business trs values not clickable") ──
  // What the front desk rings against the BUSINESS TRS house account: the products, with the Hair, Beauty or Unsorted word read from the product name, as the split on the
  // Hair and Beauty cards does it. The figure on the row is scaled to the ledger's own retail, so the lines can differ a little from it, and the window says so.
  function houseRetailSpec(ctx, o) {
    if (!canNames() || !o.code) return null;
    const dword = { hair: 'Hair', beauty: 'Beauty', unsorted: 'Unsorted' }[o.dept] || '';
    return { title: `Retail with no stylist · ${bname(o.code)}${dword ? ', ' + dword : ''}`, cur: ctx.cur, tip: 'See the lines', views: [
      { id: 'lines', label: 'By product', load: async () => {
        const d = await houseLinesLoad(ctx, o), rows = d.rows || [];
        if (d.lines > rows.length) return { sub: houseSub(ctx, o, d, dword), rows: [], empty: 'Too many lines to group by product. Pick a shorter window.' };
        const m = new Map();
        rows.forEach(r => { const k = String(r.i).toLowerCase().trim(), x = m.get(k) || { i: r.i, k: r.k, v: 0, n: 0 }; x.v += r.r ? -1 : 1; x.n += +r.n || 0; m.set(k, x); });
        const list = [...m.values()].sort((a, b) => b.n - a.n || a.i.localeCompare(b.i));
        return { sub: houseSub(ctx, o, d, dword), cols: [{ k: 'i', l: 'Product' }, { k: 'k', l: 'Department' }, { k: 'v', l: 'Sold', t: 'num' }, { k: 'n', l: 'Net', t: 'aed' }],
          rows: list.map(x => ({ i: x.i, k: { hair: 'Hair', beauty: 'Beauty', unsorted: 'Unsorted' }[x.k] || x.k, v: x.v, n: x.n })), foot: { i: 'Total', k: '', v: list.reduce((a, x) => a + x.v, 0), n: d.total } };
      } },
      { id: 'each', label: 'Each line', load: async () => {
        const d = await houseLinesLoad(ctx, o), rows = d.rows || [];
        return { sub: houseSub(ctx, o, d, dword), client: { k: 'c', b: 'bc' }, cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'c', l: 'Client' }, { k: 'i', l: 'Product' }, { k: 'k', l: 'Department' }, { k: 'n', l: 'Net', t: 'aed' }],
          rows: rows.map(r => ({ d: r.d, bc: r.b, c: r.c, i: r.r ? r.i + ' (refund)' : r.i, k: { hair: 'Hair', beauty: 'Beauty', unsorted: 'Unsorted' }[r.k] || r.k, n: r.n, _dn: { c: r.c === 'No name' ? null : clientHistorySpec(ctx, { client: r.c }) } })),
          foot: d.lines <= rows.length ? { d: '', c: cnt(d.lines) + ' lines', i: '', k: '', n: d.total } : null };
      } },
    ] };
  }
  async function houseLinesLoad(ctx, o) {
    const { data, error } = await sb.rpc('drill_house_retail_lines', { p_from: ctx.from, p_to: ctx.to, p_branches: [o.code], p_dept: o.dept || null });
    if (error) throw error;
    return data;
  }
  function houseSub(ctx, o, d, dword) {
    let t = `${esc(ctx.label)}. ${esc(bname(o.code))}${dword ? ', ' + dword : ''}: ${cnt(d.lines)} line${d.lines === 1 ? '' : 's'}, AED ${cnt(Math.round(d.total))}, products rung to the BUSINESS TRS house account (retail with no stylist), from Phorest's sales lines (on a paid sale; blow-dry packages and sessions are left out, refunds come off).`;
    if (dword) t += ` Hair, Beauty and Unsorted are read from the product names, the way the Hair and Beauty cards split it.`;
    t += ` The figure you clicked is scaled to the ledger's own retail for the branch, so it can differ a little from these lines.`;
    if (d.lines > (d.rows || []).length) t += ` The newest ${cnt((d.rows || []).length)} are shown.`;
    return t;
  }
  function staffClientsSpec(ctx, o) {
    if (!canNames() || !o.from) return null;
    const lead = o.who ? `${esc(o.who)}, ${esc(o.when)}` : esc(o.when);
    const sub = data => {
      const shown = (data.rows || []).length;
      let t = `${esc(ctx.label)}. ${lead}: ${cnt(data.total)} client${data.total === 1 ? '' : 's'} handled, from Phorest's sales lines (every client each staff member handled that day, so a client seen by two staff is in the list twice; a deposit, a balance payment or a voucher bought on its own, staff bookings and the BUSINESS TRS house account are left out).`;
      if (o.kind === 'req') t += ` ${cnt(o.ledger)} of them asked for ${o.who ? esc(o.who) : 'a stylist'} by name, but neither the ledger nor Phorest keeps which clients those were, only the count, so this is every client handled and not only the requests.`;
      else if (o.ledger != null) t += ` The branch ledger, typed by reception, shows ${cnt(o.ledger)}${o.ledger === data.total ? ', the same.' : ': they are two separate counts, so they can differ.'}`;
      if (data.total > shown) t += ` The newest ${cnt(shown)} are shown.`;
      return t;
    };
    const head = o.kind === 'req' ? 'Requests' : 'Clients handled';
    return { title: o.who ? `${head} · ${o.who}` : `${head} · ${o.when}`, cur: ctx.cur, views: [
      { id: 'each', label: 'Each client', load: async () => {
        const data = await staffClientsLoad(ctx, o), rows = data.rows || [];
        return { sub: sub(data), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Branch' }, ...(o.who ? [] : [{ k: 'e', l: 'Staff' }]), { k: 'c', l: 'Client' }, { k: 's', l: 'Spent', t: 'aed' }],
          client: { k: 'c', b: 'bc' }, rows: rows.map(r => ({ d: r.d, b: bname(r.b), bc: r.b, e: r.e, c: r.c, s: r.s, _dn: { c: clientHistorySpec(ctx, { client: r.c }), s: clientLinesSpec(ctx, { from: r.d, to: r.d, branches: [r.b], employees: [r.e], client: r.c, who: nm(r.e) }) } })), foot: data.total <= rows.length ? { d: '', b: '', e: '', c: cnt(data.total) + ' clients', s: data.spend } : null };
      } },
      { id: 'by', label: 'By client', load: async () => {
        const data = await staffClientsLoad(ctx, o), rows = data.rows || [];
        if (data.total > rows.length) return { sub: sub(data), rows: [], empty: 'Too many to group by client. Pick a shorter window.' };
        const m = new Map();
        rows.forEach(r => { const k = String(r.c).toLowerCase().trim(), x = m.get(k) || { c: r.c, v: 0, s: 0, e: new Set() }; x.v++; x.s += +r.s || 0; x.e.add(r.e); m.set(k, x); });
        const list = [...m.values()].sort((a, b) => b.v - a.v || b.s - a.s || a.c.localeCompare(b.c));
        return { sub: sub(data) + ` ${cnt(list.length)} different client names.`, cols: [{ k: 'c', l: 'Client' }, { k: 'v', l: o.who ? 'Days' : 'Times handled', t: 'num' }, { k: 's', l: 'Spent', t: 'aed' }, ...(o.who ? [] : [{ k: 'e', l: 'Staff' }])],
          client: { k: 'c' }, rows: list.map(x => { const sp = clientLinesSpec(ctx, { from: o.from, to: o.to, branches: o.branches, employees: o.employees, client: x.c, who: o.who || '' }); return { c: x.c, v: x.v, s: x.s, e: [...x.e].map(nm).join(', '), _dn: { s: sp, v: sp, c: clientHistorySpec(ctx, { client: x.c }) } }; }), foot: { c: 'Total', v: data.total, s: data.spend, e: '' } };
      } },
    ] };
  }
  // ── The services behind a staff member's Services figure (Kate, 27 Oct 2026) ──
  // The ledger's services figure is typed in, so the lines come from Phorest's sales lines (services only, on a paid sale). Two counts, and the window says both.
  async function staffServicesLoad(ctx, o) {
    const { data, error } = await sb.rpc(o.kind === 'retail' ? 'drill_staff_retail' : o.kind === 'net' ? 'drill_staff_net' : 'drill_staff_services', { p_from: o.from, p_to: o.to, p_branches: o.branches, p_employees: o.employees });
    if (error) throw error;
    return data;
  }
  function staffServicesSpec(ctx, o) {
    if (!canNames() || !o.from) return null;
    // The same list for the Retail figure and the Net take figure (Kate, 27 Oct 2026): over the products, or over every line, instead of the services.
    const RT = o.kind === 'retail', NT = o.kind === 'net', W = RT ? 'Retail' : NT ? 'Net take' : 'Services', w1 = RT ? 'product' : NT ? 'item' : 'service', lab = RT ? 'Product' : NT ? 'Item' : 'Service';
    const sub = data => {
      const shown = (data.rows || []).length;
      let t = `${esc(ctx.label)}. ${o.who ? esc(o.who) + ', ' : ''}${esc(o.when)}: ${cnt(data.total)} ${RT ? 'retail' : NT ? 'sales' : 'service'} line${data.total === 1 ? '' : 's'}, AED ${cnt(Math.round(data.net))}, from Phorest's sales lines (${RT ? 'products only; services, courses and memberships are left out' : NT ? 'services, retail, courses and memberships' : 'services only; products, courses and memberships are left out'}; on a paid sale, a deposit, a balance payment or a voucher bought on its own is left out, refunds come off).`;
      if (o.ledger != null) t += ` The branch ledger, typed by reception, shows AED ${cnt(Math.round(o.ledger))}: they are two separate counts, so they can differ.`;
      if (data.total > shown) t += ` The newest ${cnt(shown)} are shown.`;
      return t;
    };
    return { title: o.who ? `${W} · ${o.who}` : `${W} · ${o.when}`, cur: ctx.cur, views: [
      { id: 'by', label: `By ${w1}`, load: async () => {
        const data = await staffServicesLoad(ctx, o), rows = data.rows || [];
        if (data.total > rows.length) return { sub: sub(data), rows: [], empty: `Too many lines to group by ${w1}. Pick a shorter window.` };
        const m = new Map();
        rows.forEach(r => { const k = String(r.i).toLowerCase().trim(), x = m.get(k) || { i: r.i, v: 0, n: 0 }; x.v += r.r ? -1 : 1; x.n += +r.n || 0; m.set(k, x); });
        const list = [...m.values()].sort((a, b) => b.n - a.n || a.i.localeCompare(b.i));
        return { sub: sub(data) + ` ${cnt(list.length)} different ${w1}s.`, cols: [{ k: 'i', l: lab }, { k: 'v', l: RT ? 'Sold' : 'Times', t: 'num' }, { k: 'n', l: 'Net', t: 'aed' }],
          rows: list, foot: { i: 'Total', v: list.reduce((a, x) => a + x.v, 0), n: data.net } };
      } },
      { id: 'each', label: 'Each line', load: async () => {
        const data = await staffServicesLoad(ctx, o), rows = data.rows || [];
        return { sub: sub(data), cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Branch' }, ...(o.who ? [] : [{ k: 'e', l: 'Staff' }]), { k: 'c', l: 'Client' }, { k: 'i', l: lab }, { k: 'n', l: 'Net', t: 'aed' }],
          client: { k: 'c', b: 'bc' }, rows: rows.map(r => ({ d: r.d, b: bname(r.b), bc: r.b, e: nm(r.e), c: r.c, i: r.r ? r.i + ' (refund)' : r.i, n: r.n, _dn: { c: r.c === 'No name' ? null : clientHistorySpec(ctx, { client: r.c }) } })), foot: data.total <= rows.length ? { d: '', b: '', e: '', c: cnt(data.total) + ' lines', i: '', n: data.net } : null };
      } },
    ] };
  }
  function withServicesDn(ctx, r, row, key, ledgerValue, kind) {
    const emps = canNames() ? phoneNames(ctx, r.code, r.st.name) : [];
    if (emps.length && ledgerValue) row._dn = Object.assign(row._dn || {}, { [key]: staffServicesSpec(ctx, { from: ctx.from, to: ctx.to, branches: [r.code], employees: emps, who: r.n, when: `${bname(r.code)}, ${ctx.range || ctx.label}`, ledger: ledgerValue, kind }) });
    return row;
  }
  // ── The new clients behind a New clients figure (Kate, 27 Oct 2026) ──
  // New clients are a client's first paid visit, worked out the way new clients through the door are (drill_staff_new_clients, from door_first_visits), so the
  // names come from the sales lines. The count in the list above is typed in (ledger) or Phorest's own, so the window says both.
  function newClientsSpec(ctx, o) {
    if (!canNames() || !o.from) return null;
    return { title: o.who ? `New clients \u00b7 ${o.who}` : `New clients \u00b7 ${o.when}`, cur: ctx.cur, views: [{ id: 'each', label: 'Each client', load: async () => {
      const { data, error } = await sb.rpc('drill_staff_new_clients', { p_from: o.from, p_to: o.to, p_branches: o.branches, p_employees: o.employees });
      if (error) throw error;
      const rows = data.rows || [];
      let t = `${esc(ctx.label)}. ${o.who ? esc(o.who) + ', ' : ''}${esc(o.when)}: ${cnt(data.total)} new client${data.total === 1 ? '' : 's'}, each on her first paid visit, from Phorest's sales lines with her Phorest profile date settling whether she is really new (the same rule as new clients through the door; a client seen by two staff on that day is under each).`;
      if (o.kind === 'ncr') t += ` ${cnt(o.ledger)} of them asked for ${o.who ? esc(o.who) : 'a stylist'} by name on that first visit, but only the count is kept, not which clients, so this lists every new client.`;
      else if (o.ledger != null) t += ` The figure you clicked, ${cnt(o.ledger)}, is a separate count (typed by reception or from Phorest's staff report), so they can differ.`;
      if (data.total > rows.length) t += ` The newest ${cnt(rows.length)} are shown.`;
      return { sub: t, cols: [{ k: 'd', l: 'First visit', t: 'date' }, { k: 'b', l: 'Branch' }, ...(o.who ? [] : [{ k: 'e', l: 'Staff' }]), { k: 'c', l: 'Client' }],
        client: { k: 'c', b: 'bc' }, rows: rows.map(r => ({ d: r.d, b: bname(r.b), bc: r.b, e: nm(r.e), c: r.c, _dn: { c: clientHistorySpec(ctx, { client: r.c }) } })), foot: data.total <= rows.length ? { d: '', b: '', e: '', c: cnt(data.total) + ' new clients' } : null };
    } }] };
  }
  // A staff row's Phorest or ledger counts (her total, her new clients, her requests) opening the list behind each: x = { code, raw (her name), b, n, v, t }.
  function personListDn(ctx, x, row, rowKind) {
    const emps = canNames() ? phoneNames(ctx, x.code, x.raw) : [];
    if (!emps.length) return row;
    const base = { from: ctx.from, to: ctx.to, branches: [x.code], employees: emps, who: x.n, when: `${x.b}, ${ctx.range || ctx.label}` };
    row._dn = row._dn || {};
    if (x.t) row._dn.t = staffClientsSpec(ctx, Object.assign({}, base, { ledger: x.t }));
    if (x.v) {
      if (rowKind === 'nw') row._dn.v = newClientsSpec(ctx, Object.assign({}, base, { ledger: x.v }));
      else if (rowKind === 'req') row._dn.v = staffClientsSpec(ctx, Object.assign({}, base, { ledger: x.v, kind: 'req' }));
      else if (rowKind === 'ncr') row._dn.v = newClientsSpec(ctx, Object.assign({}, base, { ledger: x.v, kind: 'ncr' }));
      else if (rowKind === 't' && row._dn.t) row._dn.v = row._dn.t;
    }
    return row;
  }
  function withListDn(ctx, r, row, key, kind, ledgerValue) {   // a staff row built from staffRows (r.code, r.st.name)
    const emps = canNames() ? phoneNames(ctx, r.code, r.st.name) : [];
    if (emps.length && ledgerValue) {
      const o = { from: ctx.from, to: ctx.to, branches: [r.code], employees: emps, who: r.n, when: `${bname(r.code)}, ${ctx.range || ctx.label}`, ledger: ledgerValue, kind };
      row._dn = Object.assign(row._dn || {}, { [key]: (kind === 'new' || kind === 'ncr') ? newClientsSpec(ctx, o) : staffClientsSpec(ctx, o) });
    }
    return row;
  }
  // The Clients figure on a staff row, wherever a list has one (Clients, Net take, Avg bill, Requested): it opens that person's clients.
  function withClientsDn(ctx, r, row) {
    const emps = canNames() ? phoneNames(ctx, r.code, r.st.name) : [];
    if (emps.length && row.cl) row._dn = Object.assign(row._dn || {}, { cl: staffClientsSpec(ctx, { from: ctx.from, to: ctx.to, branches: [r.code], employees: emps, who: r.n, when: `${bname(r.code)}, ${ctx.range || ctx.label}`, ledger: row.cl }) });
    return row;
  }
  function clientsStaff(ctx, dept) {
    const rows = staffRows(ctx, dept).map(r => withClientsDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, cl: r.st.total })).filter(r => r.cl).sort((a, b) => b.cl - a.cl);
    const want = dept === 'hair' ? ctx.s.hairTotalClients : dept === 'beauty' ? ctx.s.beautyTotalClients : ctx.s.totalClients;
    const sum = rows.reduce((a, r) => a + r.cl, 0);
    const d = diffRow('Not matched to a branch row', sum, want, { cl: want - sum });
    if (d) rows.push(d);
    return {
      cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, ...deptCols(dept), { k: 'cl', l: 'Clients', t: 'num' }],
      rows, foot: { b: 'Total', n: '', dp: '', cl: want },
      sub: `${esc(ctx.label)}. Counted per staff member: a client seen by two staff counts once for each. Reception types these into the branch ledger, so there is no client name behind them. The clients through the door are on the figure under it.`,
      note: d ? DIFF_NOTE : '',
    };
  }

  // ── Avg bill per staff ──
  // Headline: net take over clients counted by staff. Hair and Beauty chips: that side's services over that side's clients, as the cards do.
  function avgStaff(ctx, dept) {
    const rows = staffRows(ctx, dept).map(r => {
      const svc = r.dp === 'Hair' ? r.st.hairSalesNet : r.st.beautySales;
      const m = dept ? svc : r.st.netSalonTake;
      const row = withClientsDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, m, cl: r.st.total, avg: r.st.total ? m / r.st.total : null });
      if (row._dn && row._dn.cl) row._dn.avg = row._dn.cl;   // the average is net take over these clients: it opens them
      return withServicesDn(ctx, r, row, 'm', m, dept ? undefined : 'net');
    }).filter(r => r.m || r.cl).sort((a, b) => (b.avg || 0) - (a.avg || 0));
    if (!dept) houseRetail(ctx, null).forEach(h => rows.push({ b: h.b, n: h.n, dp: h.dp, m: h.net, cl: null, avg: null, _cls: 'dr-muted', _dn: { m: h._sp } }));
    const wantM = dept === 'hair' ? ctx.card.hairSvc : dept === 'beauty' ? ctx.card.beautySvc : ctx.card.net;
    const wantC = dept === 'hair' ? ctx.s.hairTotalClients : dept === 'beauty' ? ctx.s.beautyTotalClients : ctx.s.totalClients;
    const sumM = rows.reduce((a, r) => a + (r.m || 0), 0), sumC = rows.reduce((a, r) => a + (r.cl || 0), 0);
    const d = (Math.abs(sumM - wantM) >= 0.5 || Math.abs(sumC - wantC) >= 0.5) ? { b: '', n: 'Not matched to a branch row', m: wantM - sumM, cl: wantC - sumC, _cls: 'dr-muted' } : null;
    if (d) rows.push(d);
    return {
      cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, ...deptCols(dept), { k: 'm', l: dept ? 'Services' : 'Net take', t: 'aed' }, { k: 'cl', l: 'Clients', t: 'num' }, { k: 'avg', l: 'Avg bill', t: 'aed' }],
      rows, foot: { b: 'Total', n: '', dp: '', m: wantM, cl: wantC, avg: wantC ? wantM / wantC : null },
      sub: `${esc(ctx.label)}. ${dept ? 'Services' : 'Net take'} divided by the clients counted by staff, the way the card does it. The line at the foot is the card's figure.`,
      note: d ? DIFF_NOTE : '',
    };
  }

  // ── Requests per staff ──
  function reqStaff(ctx, dept) {
    const rows = staffRows(ctx, dept).map(r => withListDn(ctx, r, withClientsDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, rq: r.st.req || 0, cl: r.st.total, pc: r.st.total ? (r.st.req || 0) / r.st.total * 100 : null }), 'rq', 'req', r.st.req || 0)).filter(r => r.cl).sort((a, b) => b.rq - a.rq);
    const bd = dept === 'beauty' ? ctx.s.beautyBreakdown : ctx.s.hairBreakdown;
    const wantR = dept ? ((bd && bd.req) || 0) : (((ctx.s.hairBreakdown && ctx.s.hairBreakdown.req) || 0) + ((ctx.s.beautyBreakdown && ctx.s.beautyBreakdown.req) || 0));
    const wantC = dept === 'hair' ? ctx.s.hairTotalClients : dept === 'beauty' ? ctx.s.beautyTotalClients : ctx.s.totalClients;
    const sumR = rows.reduce((a, r) => a + r.rq, 0), sumC = rows.reduce((a, r) => a + r.cl, 0);
    const d = (Math.abs(sumR - wantR) >= 0.5 || Math.abs(sumC - wantC) >= 0.5) ? { b: '', n: 'Not matched to a branch row', rq: wantR - sumR, cl: wantC - sumC, pc: null, _cls: 'dr-muted' } : null;
    if (d) rows.push(d);
    return {
      cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, ...deptCols(dept), { k: 'rq', l: 'Requests', t: 'num' }, { k: 'cl', l: 'Clients', t: 'num' }, { k: 'pc', l: 'Requested', t: 'pct' }],
      rows, foot: { b: 'Total', n: '', dp: '', rq: wantR, cl: wantC, pc: wantC ? wantR / wantC * 100 : null },
      sub: `${esc(ctx.label)}. Returning clients who asked for the stylist by name (the ledger's request column), out of the clients counted for her. Hand-typed by reception, so no client names.`,
      note: d ? DIFF_NOTE : '',
    };
  }

  // ── By day, or by month for a long window ──
  function buckets(ctx) {
    if (ctx._bk) return ctx._bk;
    const byDay = ctx.days <= DAY_VIEW_MAX;
    const key = d => byDay ? d : String(d).slice(0, 7);
    const m = new Map();
    const at = k => m.get(k) || (m.set(k, { L: [], P: [] }), m.get(k));
    ((ctx.rows && ctx.rows.ledger) || []).forEach(r => at(key(r.date)).L.push(r));
    ((ctx.rows && ctx.rows.phorest) || []).forEach(r => at(key(r.date)).P.push(r));
    ctx._bk = { byDay, list: [...m.keys()].sort().map(k => ({ k, L: m.get(k).L, P: m.get(k).P })) };
    return ctx._bk;
  }
  const whenLabel = (k, byDay) => byDay ? TRSD.fmt.day(k) : MON[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4);
  function byTime(ctx, what, dept) {
    const bk = buckets(ctx), demps = dept && canNames() ? deptEmps(ctx, dept) : [];
    const rows = [];
    bk.list.forEach(x => {
      const d = aggDailyData([], x.L, x.P);
      if (!d) return;
      const s = d.summary;
      const net = dept === 'hair' ? (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0) : dept === 'beauty' ? (s.beautyServicesTotal || 0) + (s.beautyRetailOnly || 0) : s.netTake;
      const cl = dept === 'hair' ? s.hairTotalClients : dept === 'beauty' ? s.beautyTotalClients : s.totalClients;
      const row = { k: x.k, w: whenLabel(x.k, bk.byDay), net, cl };
      // the clients through that day (or month): every client each staff member handled
      const svcL = dept === 'hair' ? (s.hairServicesIncl || 0) : dept === 'beauty' ? (s.beautyServicesTotal || 0) : (s.hairServicesIncl || 0) + (s.beautyServicesTotal || 0);
      if (what === 'net') row.svc = svcL;
      if (canNames() && (!dept || demps.length)) {
        const last = new Date(+x.k.slice(0, 4), +x.k.slice(5, 7), 0).getDate();
        const a = bk.byDay ? x.k : x.k + '-01', b = bk.byDay ? x.k : x.k + '-' + String(last).padStart(2, '0');
        const win = { from: a < ctx.from ? ctx.from : a, to: b > ctx.to ? ctx.to : b, branches: ctx.door.codes, employees: dept ? demps : null, who: '', when: whenLabel(x.k, bk.byDay) + (dept ? ', ' + (dept === 'hair' ? 'Hair' : 'Beauty') : '') };
        row._dn = {};
        if (cl) row._dn.cl = staffClientsSpec(ctx, Object.assign({}, win, { ledger: cl }));
        if (what === 'net' && svcL) row._dn.svc = staffServicesSpec(ctx, Object.assign({}, win, { ledger: svcL }));
        if (net) row._dn.net = staffServicesSpec(ctx, Object.assign({}, win, { ledger: net, kind: 'net' }));
      }
      rows.push(row);
    });
    rows.sort((a, b) => b.k.localeCompare(a.k));
    const wantN = dept === 'hair' ? ctx.card.hairNet : dept === 'beauty' ? ctx.card.beautyNet : ctx.card.net;
    const wantC = dept === 'hair' ? ctx.s.hairTotalClients : dept === 'beauty' ? ctx.s.beautyTotalClients : ctx.s.totalClients;
    const sumN = rows.reduce((a, r) => a + r.net, 0), sumC = rows.reduce((a, r) => a + r.cl, 0);
    const d = (Math.abs(sumN - wantN) >= 0.5 || Math.abs(sumC - wantC) >= 0.5) ? { w: 'Not matched to a day', net: wantN - sumN, cl: wantC - sumC, _cls: 'dr-muted' } : null;
    if (d) rows.push(d);
    return {
      cols: [{ k: 'w', l: bk.byDay ? 'Day' : 'Month' }, ...(what === 'net' ? [{ k: 'svc', l: 'Services', t: 'aed' }] : []), { k: 'net', l: 'Net take', t: 'aed' }, { k: 'cl', l: 'Clients by staff', t: 'num' }],
      rows, foot: { w: 'Total', ...(what === 'net' ? { svc: rows.reduce((a, r) => a + (r.svc || 0), 0) } : {}), net: wantN, cl: wantC },
      sub: `${esc(ctx.label)}. Every ${bk.byDay ? 'day' : 'month'} of the window, worked out the way the card is.${bk.byDay ? '' : ' A window this long is listed by month.'}`,
      note: d ? 'The last grey line is the difference between the card, which works the whole window out in one go, and the rows above, which work it out one ' + (bk.byDay ? 'day' : 'month') + ' at a time.' : '',
    };
  }

  // ── Full weeks: the Pulse reads the uploaded weekly totals, no staff rows ──
  function weeklyList(ctx, dept) {
    const rows = ctx.weekly.map(r => ({ w: TRSD.fmt.day(r.week_start) + ' to ' + TRSD.fmt.day(r.week_end), b: bname(r.branch), net: +r.net_take || 0, cl: (+r.hair_clients || 0) + (+r.beauty_clients || 0) }))
      .sort((a, b) => a.w.localeCompare(b.w) || a.b.localeCompare(b.b));
    return {
      cols: [{ k: 'w', l: 'Week' }, { k: 'b', l: 'Branch' }, { k: 'net', l: 'Net take', t: 'aed' }, { k: 'cl', l: 'Clients by staff', t: 'num' }],
      rows, foot: { w: 'Total', b: '', net: rows.reduce((a, r) => a + r.net, 0), cl: rows.reduce((a, r) => a + r.cl, 0) },
      sub: `${esc(ctx.label)}. A whole-week window reads the weekly totals uploaded for each branch, so it is listed by week and branch. Staff rows are not kept for these.`,
    };
  }

  // ── One person's days (the Wins cards) ──
  function personDays(ctx, o) {
    const key = staffMapKey(o.name), bk = buckets(ctx), rows = [];
    bk.list.forEach(x => {
      const d = aggDailyData([], x.L, x.P);
      if (!d) return;
      const st = (o.dept === 'beauty' ? d.beautyStaff : d.hairStaff || []).find(p => staffMapKey(p.name) === key);
      if (!st || !(st.netSalonTake || st.total)) return;
      const codes = [...new Set(x.L.filter(r => staffMapKey(r.staff_name) === key).map(r => r.branch))], bs = codes.map(bname).join(', ');
      const row = { k: x.k, w: whenLabel(x.k, bk.byDay), b: bs, net: st.netSalonTake, cl: st.total, rq: st.req || 0, nw: st.newC || 0 };
      const emps = canNames() ? [...new Set(codes.flatMap(c => phoneNames(ctx, c, o.name)))] : [];
      if (emps.length) {
        const last = new Date(+x.k.slice(0, 4), +x.k.slice(5, 7), 0).getDate(), a = bk.byDay ? x.k : x.k + '-01', b = bk.byDay ? x.k : x.k + '-' + String(last).padStart(2, '0');
        const win = { from: a < ctx.from ? ctx.from : a, to: b > ctx.to ? ctx.to : b, branches: codes, employees: emps, who: nm(o.name), when: whenLabel(x.k, bk.byDay) };
        row._dn = {};
        if (st.total) row._dn.cl = staffClientsSpec(ctx, Object.assign({}, win, { ledger: st.total }));
        if (st.netSalonTake) row._dn.net = staffServicesSpec(ctx, Object.assign({}, win, { ledger: st.netSalonTake, kind: 'net' }));
        if (st.req) row._dn.rq = staffClientsSpec(ctx, Object.assign({}, win, { ledger: st.req, kind: 'req' }));
        if (st.newC) row._dn.nw = newClientsSpec(ctx, Object.assign({}, win, { ledger: st.newC }));
      }
      rows.push(row);
    });
    rows.sort((a, b) => b.k.localeCompare(a.k));
    const p = o.card;
    const sum = f => rows.reduce((a, r) => a + (+r[f] || 0), 0);
    const diff = (sum('net') - p.net >= 0.5 || p.net - sum('net') >= 0.5 || sum('cl') !== p.total || sum('rq') !== (p.req || 0) || sum('nw') !== (p.newC || 0))
      ? { w: 'Not matched to a day', b: '', net: p.net - sum('net'), cl: p.total - sum('cl'), rq: (p.req || 0) - sum('rq'), nw: (p.newC || 0) - sum('nw'), _cls: 'dr-muted' } : null;
    if (diff) rows.push(diff);
    return {
      cols: [{ k: 'w', l: bk.byDay ? 'Day' : 'Month' }, { k: 'b', l: 'Branch' }, { k: 'net', l: 'Net take', t: 'aed' }, { k: 'cl', l: 'Clients', t: 'num' }, { k: 'rq', l: 'Requests', t: 'num' }, { k: 'nw', l: 'New clients', t: 'num' }],
      rows, foot: { w: 'Total', b: '', net: p.net, cl: p.total, rq: p.req || 0, nw: p.newC || 0 },
      sub: `${esc(ctx.label)}. ${esc(nm(o.name))}'s ${bk.byDay ? 'days' : 'months'} in this window. Clients, requests and new clients are what reception typed into the ledger for her, so there are no client names behind them.`,
      note: diff ? 'The last grey line is the difference between the card, which works the whole window out in one go, and the rows above, which work it out one ' + (bk.byDay ? 'day' : 'month') + ' at a time.' : '',
    };
  }

  // ── The clients through the door ──
  async function doorLoad(ctx) {
    if (!ctx._door) {
      const p = sb.rpc('drill_door_clients', { p_from: ctx.from, p_to: ctx.to, p_branches: ctx.door.codes }).then(r => { if (r.error) throw r.error; return r.data; });
      ctx._door = p; p.catch(() => { if (ctx._door === p) ctx._door = null; });
    }
    return ctx._door;
  }
  const doorSub = (ctx, data, perVisit) => {
    const shown = (data.rows || []).length;
    let t = `${esc(ctx.label)}. ${cnt(data.total)} client${data.total === 1 ? '' : 's'} through the door, each client once a day however many sales or staff she had. A deposit, a balance payment or a voucher bought on its own is not a visit; staff bookings and the BUSINESS TRS house account are left out.`;
    if (data.total > shown) t += ` The newest ${cnt(shown)} are shown.`;
    if (ctx.door.count != null && data.total !== ctx.door.count) t += ` <b>The card shows ${cnt(ctx.door.count)}: this list does not match it.</b>`;
    if (perVisit) t += ` Net take on the card ${money(ctx.card.net, ctx.cur)} ÷ ${cnt(ctx.door.count)} = ${money(ctx.door.count ? ctx.card.net / ctx.door.count : 0, ctx.cur)} a visit. "Spent" below is Phorest's own lines for these clients, so it will not match Net take to the dirham.`;
    return t;
  };
  function doorViews(ctx, perVisit) {
    return [
      { id: 'visits', label: 'Each visit', load: async () => {
        const data = await doorLoad(ctx), rows = data.rows || [];
        return {
          sub: doorSub(ctx, data, perVisit),
          cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Branch' }, { k: 'c', l: 'Client' }, { k: 's', l: 'Spent', t: 'aed' }, { k: 'st', l: 'Seen by' }],
          client: { k: 'c', b: 'bc' }, rows: rows.map(r => ({ d: r.d, b: bname(r.b), bc: r.b, c: r.c, s: r.s, st: r.st, _dn: { c: clientHistorySpec(ctx, { client: r.c }), s: clientLinesSpec(ctx, { from: r.d, to: r.d, branches: [r.b], employees: null, client: r.c }) } })),
          foot: data.total <= rows.length ? { d: '', b: '', c: cnt(data.total) + ' visits', s: data.spend, st: '' } : null,
        };
      } },
      { id: 'clients', label: 'By client', load: async () => {
        const data = await doorLoad(ctx), rows = data.rows || [];
        if (data.total > rows.length) return { sub: doorSub(ctx, data, perVisit), rows: [], empty: 'This window has too many visits to group by client. Pick a shorter window.' };
        const m = new Map();
        rows.forEach(r => {
          const k = String(r.c).toLowerCase().trim(), x = m.get(k) || { c: r.c, v: 0, s: 0, b: new Set() };
          x.v++; x.s += +r.s || 0; x.b.add(bname(r.b)); m.set(k, x);
        });
        const list = [...m.values()].sort((a, b) => b.v - a.v || b.s - a.s || a.c.localeCompare(b.c));
        return {
          sub: doorSub(ctx, data, perVisit) + ` ${cnt(list.length)} different client names; one who came on two days is two visits.`,
          cols: [{ k: 'c', l: 'Client' }, { k: 'v', l: 'Visits', t: 'num' }, { k: 's', l: 'Spent', t: 'aed' }, { k: 'b', l: 'Branches' }],
          client: { k: 'c' }, rows: list.map(x => { const sp = clientLinesSpec(ctx, { from: ctx.from, to: ctx.to, branches: ctx.door.codes, employees: null, client: x.c }); return { c: x.c, v: x.v, s: x.s, b: [...x.b].join(', '), _dn: { s: sp, v: sp, c: clientHistorySpec(ctx, { client: x.c }) } }; }),
          foot: { c: 'Total', v: data.total, s: data.spend, b: '' },
        };
      } },
    ];
  }


  // ── Request rate (the More measures tile): asked by name over all clients, per staff ──
  function askStaff(ctx, dept) {
    const rows = staffRows(ctx, dept).map(r => {
      const st = r.st, ask = (st.req || 0) + (st.newClientReq || 0), all = (st.req || 0) + (st.salon || 0) + (st.newC || 0) + (st.newClientReq || 0);
      return withListDn(ctx, r, withListDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, ask, all, pc: all ? ask / all * 100 : null }, 'ask', 'req', ask), 'all', undefined, all);
    }).filter(r => r.all).sort((a, b) => b.ask - a.ask);
    const bd = o => o ? { ask: (o.req || 0) + (o.ncr || 0), all: (o.req || 0) + (o.salon || 0) + (o.new || 0) + (o.ncr || 0) } : { ask: 0, all: 0 };
    const h = bd(ctx.s.hairBreakdown), b = bd(ctx.s.beautyBreakdown);
    const wantA = dept === 'hair' ? h.ask : dept === 'beauty' ? b.ask : h.ask + b.ask, wantC = dept === 'hair' ? h.all : dept === 'beauty' ? b.all : h.all + b.all;
    const sumA = rows.reduce((a, r) => a + r.ask, 0), sumC = rows.reduce((a, r) => a + r.all, 0);
    const d = (Math.abs(sumA - wantA) >= 0.5 || Math.abs(sumC - wantC) >= 0.5) ? { b: '', n: 'Not matched to a branch row', ask: wantA - sumA, all: wantC - sumC, pc: null, _cls: 'dr-muted' } : null;
    if (d) rows.push(d);
    return {
      cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, ...deptCols(dept), { k: 'ask', l: 'Asked by name', t: 'num' }, { k: 'all', l: 'Clients', t: 'num' }, { k: 'pc', l: 'Rate', t: 'pct' }],
      rows, foot: { b: 'Total', n: '', dp: '', ask: wantA, all: wantC, pc: wantC ? wantA / wantC * 100 : null },
      sub: `${esc(ctx.label)}. Clients who asked for their stylist by name (requests plus new clients who asked) out of the clients the ledger types: request, salon, new and new request. Per staff, from the ledgers, so there are no client names.`,
      note: d ? DIFF_NOTE : '',
    };
  }

  // ── The benchmarks (Below target, Working): the two numbers each ratio is made of, per staff ──
  const pctOf = (n, d) => d ? n / d * 100 : null;
  const fix2 = v => (Math.round(v * 100) / 100).toFixed(2) + '%';
  function benchList(ctx, name, dept) {
    const s = ctx.s;
    const sd = dept === 'hair' ? 'hair' : dept === 'beauty' ? 'beauty' : null;
    const svcOf = r => r.dp === 'Hair' ? (r.st.hairSalesNet || 0) : (r.st.beautySales || 0);
    // The foot is worked out from the rows. When it is not the card's figure the line says so, in bold, and does not paper over it.
    const wrap = (cols, rows, foot, want, sub) => {
      const got = foot.pc;
      const off = want != null && got != null && Math.abs(got - want) > 0.05;
      return { cols, rows, foot, sub: `${esc(ctx.label)}. ${sub}${off ? ` <b>This list works out to ${fix2(got)}, the card shows ${fix2(want)}.</b>` : ''}` };
    };
    const head = [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, ...deptCols(sd)];
    if (name === 'NCR') {
      const rows = staffRows(ctx, sd).map(r => withListDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, v: r.st.newClientReq || 0 }, 'v', 'ncr', r.st.newClientReq || 0)).filter(r => r.v).sort((a, b) => b.v - a.v);
      const want = sd === 'hair' ? ctx.s.hairNCR : sd === 'beauty' ? ctx.s.beautyNCR : (ctx.s.hairNCR || 0) + (ctx.s.beautyNCR || 0);
      const sum = rows.reduce((a, r) => a + r.v, 0);
      const d = Math.abs(sum - want) >= 0.5 ? { b: '', n: 'Not matched to a branch row', v: want - sum, _cls: 'dr-muted' } : null;
      if (d) rows.push(d);
      return { cols: [...head, { k: 'v', l: 'New client requests', t: 'num' }], rows, foot: { b: 'Total', n: '', dp: '', v: want },
        sub: `${esc(ctx.label)}. New clients who asked for their stylist by name on their first visit, counted per staff from the ledger. No client names are kept.`, note: d ? DIFF_NOTE : '' };
    }
    if (name === 'Rebooking %') {
      const rows = staffRows(ctx, sd).map(r => { const base = r.st.ledgerClients != null ? r.st.ledgerClients : r.st.total; return withListDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, rb: r.st.rebooked || 0, base, pc: pctOf(r.st.rebooked || 0, base) }, 'base', undefined, base); }).filter(r => r.base).sort((a, b) => (b.pc || 0) - (a.pc || 0));
      const rb = rows.reduce((a, r) => a + r.rb, 0), base = rows.reduce((a, r) => a + r.base, 0);
      const want = sd === 'hair' ? s.hairRebookPct : sd === 'beauty' ? s.beautyRebookPct : s.rebookPct;
      return wrap([...head, { k: 'rb', l: 'Rebooked', t: 'num' }, { k: 'base', l: 'Clients', t: 'num' }, { k: 'pc', l: 'Rebooking', t: 'pct' }], rows, { b: 'Total', n: '', dp: '', rb, base, pc: pctOf(rb, base) }, want,
        'Clients who booked their next visit before leaving, out of the clients the ledger typed for each staff member. Counted per staff, so no client names.');
    }
    if (name === 'Treatment %') {
      const rows = staffRows(ctx, sd).map(r => { const tx = r.dp === 'Hair' ? (r.st.treatments || 0) : 0; return withServicesDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, tx, svc: svcOf(r), pc: pctOf(tx, svcOf(r)) }, 'svc', svcOf(r)); }).filter(r => r.svc || r.tx).sort((a, b) => b.svc - a.svc);
      const tx = rows.reduce((a, r) => a + r.tx, 0), svc = rows.reduce((a, r) => a + r.svc, 0);
      const want = sd === 'hair' ? (s.hairServicesIncl ? (s.treatmentSales || 0) / s.hairServicesIncl * 100 : 0) : (ctx.card.hairSvc + ctx.card.beautySvc ? (s.treatmentSales || 0) / (ctx.card.hairSvc + ctx.card.beautySvc) * 100 : 0);
      return wrap([...head, { k: 'tx', l: 'Treatments', t: 'aed' }, { k: 'svc', l: 'Services', t: 'aed' }, { k: 'pc', l: 'Treatment', t: 'pct' }], rows, { b: 'Total', n: '', dp: '', tx, svc, pc: pctOf(tx, svc) }, want,
        `Treatment takings (a ledger column, hair only) over ${sd === 'hair' ? 'hair' : 'hair and beauty'} services, including courses.`);
    }
    if (name === 'Retail %') {
      const rows = staffRows(ctx, sd).map(r => withServicesDn(ctx, r, withServicesDn(ctx, r, { b: r.b, n: r.n, dp: r.dp, svc: svcOf(r), rt: r.st.retail || 0 }, 'svc', svcOf(r)), 'rt', r.st.retail || 0, 'retail')).filter(r => r.svc || r.rt);
      houseRetail(ctx, sd).forEach(h => rows.push({ b: h.b, n: h.n, dp: h.dp, svc: 0, rt: h.net, _cls: 'dr-muted', _dn: { rt: h._sp } }));
      rows.forEach(r => { r.pc = pctOf(r.rt, sd ? r.svc + r.rt : r.svc); });
      rows.sort((a, b) => b.rt - a.rt);
      const svc = rows.reduce((a, r) => a + r.svc, 0), rt = rows.reduce((a, r) => a + r.rt, 0);
      const want = sd === 'hair' ? (ctx.card.hairNet ? (s.hairRetailOnly || 0) / ctx.card.hairNet * 100 : 0) : sd === 'beauty' ? (ctx.card.beautyNet ? (s.beautyRetailOnly || 0) / ctx.card.beautyNet * 100 : 0) : (ctx.card.hairSvc + ctx.card.beautySvc ? (s.hairRetail || 0) / (ctx.card.hairSvc + ctx.card.beautySvc) * 100 : 0);
      return wrap([...head, { k: 'svc', l: 'Services', t: 'aed' }, { k: 'rt', l: 'Retail', t: 'aed' }, { k: 'pc', l: sd ? 'Retail of net take' : 'Retail of services', t: 'pct' }], rows, { b: 'Total', n: '', dp: '', svc, rt, pc: pctOf(rt, sd ? svc + rt : svc) }, want,
        sd ? 'Retail over that department\'s net take (services plus retail). Retail rung with no stylist is shared between hair and beauty and shown on its own line.' : 'All retail, including what was rung with no stylist, over hair and beauty services.');
    }
    if (name === 'Hair Avg Bill' || name === 'Beauty Avg Bill') return avgStaff(ctx, name === 'Hair Avg Bill' ? 'hair' : 'beauty');
    if (name === 'Utilisation %') {
      const per = s._utilPer;
      if (!per || !per.size) return { cols: [], rows: [], empty: 'No rota hours for this window.' };
      const rows = [...per.values()].filter(x => (!sd || x.dept === sd) && (x.dept === 'hair' || x.dept === 'beauty')).map(x => ({ b: bname(x.branch), n: nm(x.name), dp: x.dept === 'hair' ? 'Hair' : 'Beauty', h: x.hours, a: x.avail, pc: pctOf(x.hours, x.avail) })).filter(x => x.a).sort((a, b) => (b.pc || 0) - (a.pc || 0));
      const h = rows.reduce((a, r) => a + r.h, 0), a = rows.reduce((x, r) => x + r.a, 0);
      const want = sd === 'hair' ? s.hairUtilPct : sd === 'beauty' ? s.beautyUtilPct : s.utilPct;
      return wrap([...head, { k: 'h', l: 'Booked hours', t: 'num' }, { k: 'a', l: 'Rota hours', t: 'num' }, { k: 'pc', l: 'Utilisation', t: 'pct' }], rows, { b: 'Total', n: '', dp: '', h, a, pc: pctOf(h, a) }, want,
        'Booked hours over the hours each person was on the rota (Phorest), added up across people, not an average of their percentages. Assistants are left out. A leaver\'s empty rota days and booked time on a day with no rota hours are not counted.');
    }
    return null;
  }

  // ── More measures: per stylist, from org_pulse_extra ──
  const MORE = {
    'Retention': { n: 'ret_n', b: 'ret_back', bl: 'Came back', nl: 'Seen 3 to 6 months ago', rl: 'Retention', why: 'Clients a stylist saw 3 to 6 months ago who came back to her in the last 3 months, counted per stylist. Looks back 180 days, so it does not move with the period on screen. The counts are kept per stylist, not the clients themselves.' },
    'Conversion': { n: 'conv_n', b: 'conv_back', bl: 'Came back', nl: 'New clients', rl: 'Conversion', why: 'New clients whose first visit was with a stylist and who came back, to anyone, within 12 weeks. Looks back 180 days. The counts are kept per stylist, not the clients themselves.' },
    'Colour': { n: 'visits', b: 'colour', bl: 'Visits with colour', nl: 'Hair visits', rl: 'Colour', hairOnly: true, why: 'Hair visits that included a colour service, out of all hair visits, per stylist, from the sales lines. A visit is one client on one day.' },
  };
  function moreList(ctx, name, dept) {
    const x = ctx.extra;
    if (!x || !x.staff || !x.staff.some(r => r.name)) return null;
    const codes = ctx.extraCodes || [];
    const D = dept === 'hair' ? 'Hair' : dept === 'beauty' ? 'Beauty' : null;
    const st = x.staff.filter(r => codes.includes(r.branch) && (!D || r.dept === D));
    const base = [{ k: 'n', l: 'Stylist' }, { k: 'b', l: 'Branch' }, { k: 'dp', l: 'Department' }];
    const who = r => ({ n: nm(r.name), b: bname(r.branch), dp: r.dept });
    const m = MORE[name];
    if (m) {
      const list = st.filter(r => !m.hairOnly || r.dept === 'Hair');
      const rows = list.map(r => {
        const row = Object.assign(who(r), { v: +r[m.b] || 0, d: +r[m.n] || 0, pc: pctOf(+r[m.b] || 0, +r[m.n] || 0) });
        const ref = { code: r.branch, st: { name: r.name }, n: row.n };
        if (m.n === 'visits') withListDn(ctx, ref, row, 'd', undefined, row.d);
        else if (m.n === 'conv_n') withListDn(ctx, ref, row, 'd', 'new', row.d);
        return row;
      }).filter(r => r.d || r.v).sort((a, b) => (b.pc || 0) - (a.pc || 0));
      const v = rows.reduce((a, r) => a + r.v, 0), d = rows.reduce((a, r) => a + r.d, 0);
      return { cols: [...base, { k: 'v', l: m.bl, t: 'num' }, { k: 'd', l: m.nl, t: 'num' }, { k: 'pc', l: m.rl, t: 'pct' }], rows, foot: { n: 'Total', b: '', dp: '', v, d, pc: pctOf(v, d) },
        sub: `${esc(ctx.label)}. ${m.why}`, note: m.n === 'visits' ? '' : (x.cache_asof ? `Counted from the client history as of ${esc(String(x.cache_asof).slice(0, 10))}.` : '') };
    }
    const key = name === 'Social posts' ? 'social_feed' : name === 'Social workdays' ? 'social_workdays' : null;
    if (!key) return null;
    const rows = st.map(r => Object.assign(who(r), { v: +r[key] || 0 })).filter(r => r.v).sort((a, b) => b.v - a.v);
    return { cols: [...base, { k: 'v', l: name === 'Social posts' ? 'Posts' : 'Days', t: 'num' }], rows, foot: { n: 'Total', b: '', dp: '', v: rows.reduce((a, r) => a + r.v, 0) },
      sub: `${esc(ctx.label)}. ${name === 'Social posts' ? 'Posts and collabs on Instagram that tag the salon, per stylist.' : 'Days a stylist worked and posted or shared a story, per stylist.'}` };
  }
  const REV_BRANCH = { 'Al Quoz': 'AQ', 'Khalifa': 'KCA', 'Motor': 'MC', 'Saadiyat': 'SAA' };
  const revCode = b => { const k = Object.keys(REV_BRANCH).find(p => String(b || '').indexOf(p) === 0); return k ? REV_BRANCH[k] : null; };
  async function reviewsList(ctx, which) {
    const today = new Date().toISOString().slice(0, 10);
    const to90 = ctx.to < today ? ctx.to : today;
    const d90 = new Date(to90 + 'T00:00:00Z'); d90.setUTCDate(d90.getUTCDate() - 89);
    const from = which === '90' ? d90.toISOString().slice(0, 10) : ctx.from, to = which === '90' ? to90 : ctx.to;
    const { data, error } = await sb.from('google_reviews').select('review_id,branch,stars,reviewer,comment,review_date').gte('review_date', from).lte('review_date', to).order('review_date', { ascending: false }).limit(3000);
    if (error) throw error;
    const codes = ctx.extraCodes || [];
    const rows = (data || []).filter(r => codes.includes(revCode(r.branch))).map(r => ({ d: r.review_date, b: bname(revCode(r.branch)), st: r.stars, rv: r.reviewer || '', cm: String(r.comment || '').replace(/\s+/g, ' ').slice(0, 160) }));
    const stars = rows.reduce((a, r) => a + (+r.st || 0), 0);
    return { cols: [{ k: 'd', l: 'Date', t: 'date' }, { k: 'b', l: 'Branch' }, { k: 'st', l: 'Stars', t: 'num' }, { k: 'rv', l: 'Reviewer' }, { k: 'cm', l: 'What she wrote' }], rows,
      foot: { d: '', b: rows.length + ' review' + (rows.length === 1 ? '' : 's'), st: rows.length ? stars / rows.length : null, rv: '', cm: rows.length ? 'average stars' : '' },
      sub: `${esc(ctx.label)}. ${which === '90' ? 'Google reviews in the last 90 days up to ' + TRSD.fmt.day(to) + ', which is what the star rating is worked from (shown once there are at least 3).' : 'Google reviews posted in the period, for the branches on screen.'}`, empty: 'No reviews in this window.' };
  }

  // ── The client funnel: one row's number, per staff ──
  const FN_FIELD = { t: 'total', salon: 'salon', req: 'req', reb: 'rebooked', nw: 'new_client', ncr: 'ncr' };
  const FN_NAME = { t: 'Total clients', salon: 'Salon clients', req: 'Request clients', reb: 'Rebooked', nw: 'New clients', ncr: 'New client requests' };
  function fnList(ctx, o) {
    const F = o.F, side = o.side, rows = [];
    const sideWord = side === 'hair' ? 'Hair' : 'Beauty';
    if (o.led) {
      const f = FN_FIELD[o.row];
      if (!f) return null;
      const g = new Map();
      ((ctx.rows && ctx.rows.ledger) || []).forEach(r => {
        const up = String(r.staff_name || '').trim().toUpperCase();
        if (LEDGER_NON_PERSON_NAMES.has(up) || isLedgerAssistantName(up)) return;
        if ((String(r.dept || '').trim().toLowerCase() === 'beauty' ? 'beauty' : 'hair') !== side) return;
        const k = r.branch + '|' + staffMapKey(r.staff_name);
        const x = g.get(k) || { b: bname(r.branch), n: nm(staffMapKey(r.staff_name)), v: 0, t: 0, code: r.branch, raw: r.staff_name };
        x.v += Number(r[f]) || 0; x.t += Number(r.total) || 0; g.set(k, x);
      });
      [...g.values()].filter(x => x.v).sort((a, b) => b.v - a.v).forEach(x => rows.push(personListDn(ctx, x, { b: x.b, n: x.n, v: x.v, t: x.t, pc: pctOf(x.v, x.t) }, o.row)));   // her total, her new clients and her requests open the list behind them
      const want = F.ledger[side][o.row], sum = rows.reduce((a, r) => a + r.v, 0), tot = rows.reduce((a, r) => a + r.t, 0);
      const d = Math.abs(sum - want) >= 0.5 ? { b: '', n: 'Not matched to a branch row', v: want - sum, t: null, pc: null, _cls: 'dr-muted' } : null;
      if (d) rows.push(d);
      return { cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, { k: 'v', l: FN_NAME[o.row], t: 'num' }, { k: 't', l: 'Her ledger total', t: 'num' }, { k: 'pc', l: 'Share', t: 'pct' }], rows, foot: { b: 'Total', n: '', v: want, t: tot, pc: pctOf(want, tot) },
        sub: `${esc(ctx.label)}. ${sideWord}, ${FN_NAME[o.row].toLowerCase()} from the branch ledger, per staff member. Reception types these in, so there are no client names.`, note: d ? DIFF_NOTE : '' };
    }
    // Phorest's own counts per staff
    const deptMap = (typeof buildStaffDeptMap === 'function') ? buildStaffDeptMap() : {}, ledgerDept = {};
    ((ctx.rows && ctx.rows.ledger) || []).forEach(r => { const dp = String(r.dept || '').trim().toLowerCase(); if (dp) ledgerDept[staffMapKey(r.staff_name)] = dp === 'beauty' ? 'beauty' : 'hair'; });
    const g = new Map();
    const at = (r, who) => { const k = r.branch + '|' + who.key; if (!g.has(k)) g.set(k, { b: bname(r.branch), n: nm(who.key), v: 0, t: 0, code: r.branch, raw: who.key }); return g.get(k); };
    const pick = o.row === 'req' ? 'rqs' : o.row === 'nw' ? 'new_clients' : 'visits';
    if (o.row === 'reb') {
      (F.rebook || []).forEach(r => { const who = fnPhorestPerson(r.employee_name, r.branch, ledgerDept, deptMap); if (!who || who.side !== side) return; const x = at(r, who); x.v += Number(r.rebooked) || 0; x.t += Number(r.visits) || 0; });
    } else {
      ((ctx.rows && ctx.rows.phorest) || []).forEach(r => { if (r.is_total) return; const who = fnPhorestPerson(r.employee_name, r.branch, ledgerDept, deptMap); if (!who || who.side !== side) return; const x = at(r, who); x.v += Number(r[pick]) || 0; x.t += Number(r.visits) || 0; });
    }
    [...g.values()].filter(x => x.v).sort((a, b) => b.v - a.v).forEach(x => rows.push(personListDn(ctx, x, { b: x.b, n: x.n, v: x.v, t: x.t, pc: pctOf(x.v, x.t) }, o.row)));
    const want = F.phorest[side][o.row], sum = rows.reduce((a, r) => a + r.v, 0), tot = rows.reduce((a, r) => a + r.t, 0);
    const d = (want != null && Math.abs(sum - want) >= 0.5) ? { b: '', n: 'Not matched to a branch row', v: want - sum, t: null, pc: null, _cls: 'dr-muted' } : null;
    if (d) rows.push(d);
    const lbl = { t: 'Staff visits', req: 'Requests (RQ)', nw: 'New clients', reb: 'Rebooked' }[o.row] || FN_NAME[o.row];
    return { cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, { k: 'v', l: lbl, t: 'num' }, { k: 't', l: 'Her Phorest visits', t: 'num' }, { k: 'pc', l: 'Share', t: 'pct' }], rows, foot: { b: 'Total', n: '', v: want, t: tot, pc: pctOf(want, tot) },
      sub: `${esc(ctx.label)}. ${sideWord}, ${lbl.toLowerCase()} from Phorest's own staff reports, per staff member. A client seen by two staff is two visits. Phorest keeps counts here, not client names.`, note: d ? DIFF_NOTE : '' };
  }

  // A branch column on the Branch Performance chart: that branch's own rows and summary, as the chart drew them (not cut by the Branch filter).
  function branchCtx(ctx, code, bs) {
    const j = window._cachedDailyJoin;
    if (!bs || !j || !j.branchStaffRows) return null;
    const hairNet = (bs.hairServicesIncl || 0) + (bs.hairRetailOnly || 0), beautyNet = (bs.beautyServicesTotal || 0) + (bs.beautyRetailOnly || 0);
    return Object.assign({}, ctx, { s: bs, label: `${bname(code)}, ${ctx.range || ''}`, weekly: null, _bb: null, _bk: null,
      rows: { ledger: j.branchStaffRows.filter(r => r.branch === code), phorest: j.phorestStaffRows.filter(r => r.branch === code) },
      card: { net: bs.netTake, hairNet, beautyNet, hairSvc: bs.hairServicesIncl, beautySvc: bs.beautyServicesTotal },
      door: { codes: [code], count: bs.doorClients } });
  }


  // ── One money or count column per staff (Comparison rows, and the same lists wherever a page prints that figure) ──
  const FIELDS = {
    hairSvc:      { title: 'Hair revenue', dept: 'hair', get: r => r.st.hairSalesNet, want: c => c.s.hairServicesIncl, t: 'aed', l: 'Services incl. treatments and courses', why: 'Hair services, treatments and courses, from Phorest matched to the ledger by staff and day.' },
    treatments:   { title: 'Hair treatments', dept: 'hair', get: r => r.st.treatments, want: c => c.s.treatmentSales, t: 'aed', l: 'Treatments', why: 'Treatment takings, a ledger column (hair only).' },
    beautySvc:    { title: 'Beauty services', dept: 'beauty', get: r => r.st.beautySales, want: c => c.s.beautyServicesTotal, t: 'aed', l: 'Services', why: 'Beauty services, treatments and courses, from Phorest matched to the ledger by staff and day.' },
    retail:       { title: 'Retail', dept: null, get: r => r.st.retail, want: c => c.s.retailTotal, t: 'aed', l: 'Retail', house: null, why: 'Retail each stylist was credited with, plus the retail rung with no stylist.' },
    hairRetail:   { title: 'Hair retail', dept: 'hair', get: r => r.st.retail, want: c => c.s.hairRetailOnly, t: 'aed', l: 'Retail', house: 'hair', why: 'Retail credited to hair stylists, plus hair\'s share of the retail rung with no stylist.' },
    beautyRetail: { title: 'Beauty retail', dept: 'beauty', get: r => r.st.retail, want: c => c.s.beautyRetailOnly, t: 'aed', l: 'Retail', house: 'beauty', why: 'Retail credited to beauty staff, plus beauty\'s share of the retail rung with no stylist.' },
    courses:      { title: 'Courses', dept: null, get: r => r.st.courses, want: c => (c.s.hairCourses || 0) + (c.s.beautyCourses || 0), t: 'aed', l: 'Courses performed', why: 'Courses performed (redeemed sessions), from Phorest.' },
    treatUnits:   { title: 'Treatment units', dept: 'hair', get: r => r.st.treatmentUnits, want: c => c.s.hairTreatmentUnits, t: 'num', l: 'Treatments', why: 'Treatments sold, a ledger column (hair only).' },
    retailUnits:  { title: 'Retail units', dept: null, get: r => r.st.retailUnits, want: c => (c.s.hairRetailUnits || 0) + (c.s.beautyRetailUnits || 0), t: 'num', l: 'Retail items', why: 'Retail items sold, a ledger column.' },
    salon:        { title: 'Salon clients', dept: null, get: r => r.st.salon, want: c => c.s.salonClientTotal, t: 'num', l: 'Salon clients', why: 'Returning clients with no preference, so the salon booked them. Per staff, from the ledgers: no client names.' },
    newc:         { title: 'New clients', dept: null, get: r => r.st.newC, want: c => c.s.newClientsTotal, t: 'num', l: 'New clients', why: 'First-visit clients, per staff, from the ledgers: no client names.' },
    rebooked:     { title: 'Rebooked', dept: null, get: r => r.st.rebooked, want: c => c.s.totalRebooked, t: 'num', l: 'Rebooked', why: 'Clients who booked their next visit before leaving, per staff, from the ledgers: no client names.' },
    finServices:  { title: 'Services', dept: null, get: r => (r.dp === 'Hair' ? (r.st.hairSalesNet || 0) : (r.st.beautySales || 0)) - (r.st.courses || 0), want: c => (c.s.hairServicesIncl || 0) + (c.s.beautyServicesTotal || 0) - ((c.s.hairCourses || 0) + (c.s.beautyCourses || 0)), t: 'aed', l: 'Services', why: 'Services with courses taken out, hair and beauty, as the Sales block of Financial Totals reads them.' },
    servicesTotal: { title: 'Services total', dept: null, get: r => r.dp === 'Hair' ? (r.st.hairSalesNet || 0) - (r.st.treatments || 0) - (r.st.courses || 0) : (r.st.beautySales || 0), want: c => (c.s.hairServicesExcl == null) ? null : c.s.hairServicesExcl + (c.s.beautyServicesTotal || 0), t: 'aed', l: 'Services', why: 'Hair services with treatments and courses taken out, plus beauty services, no retail.' },
    hairSvcEx:    { title: 'Hair services (excl. treatments and courses)', dept: 'hair', get: r => (r.st.hairSalesNet || 0) - (r.st.treatments || 0) - (r.st.courses || 0), want: c => c.s.hairServicesExcl, t: 'aed', l: 'Services', why: 'Hair services with treatments and courses taken out.' },
    hairCourses:  { title: 'Hair courses (performed)', dept: 'hair', get: r => r.st.courses, want: c => c.s.hairCourses, t: 'aed', l: 'Courses performed', why: 'Courses performed (redeemed sessions) by hair staff, from Phorest.' },
    hairRetailUnitsH:   { title: 'Hair retail items sold', dept: 'hair', get: r => r.st.retailUnits, want: c => c.s.hairRetailUnits, t: 'num', l: 'Retail items', why: 'Retail items sold by hair staff, a ledger column.' },
    beautyRetailUnitsB: { title: 'Beauty retail items sold', dept: 'beauty', get: r => r.st.retailUnits, want: c => c.s.beautyRetailUnits, t: 'num', l: 'Retail items', why: 'Retail items sold by beauty staff, a ledger column.' },
    beautyRebooked:     { title: 'Beauty rebooked', dept: 'beauty', get: r => r.st.rebooked, want: c => c.s.beautyRebookedCount, t: 'num', l: 'Rebooked', why: 'Beauty clients who booked their next visit before leaving, per staff, from the ledgers: no client names.' },
    request:      { title: 'Request clients', dept: null, get: r => r.st.req, want: c => c.s.requestClientTotal, t: 'num', l: 'Request clients', why: 'Returning clients who asked for their stylist by name, per staff, from the ledgers: no client names.' },
  };
  function fieldList(ctx, key) {
    const F = FIELDS[key], dept = F.dept;
    // each figure opens the lines behind it: the retail lists the products, the service lists the services
    const lineKind = { retail: 'retail', hairRetail: 'retail', beautyRetail: 'retail', retailUnits: 'retail', hairRetailUnitsH: 'retail', beautyRetailUnitsB: 'retail', hairSvc: 'service', beautySvc: 'service', finServices: 'service', servicesTotal: 'service', hairSvcEx: 'service' }[key];
    const listKind = { newc: 'new', request: 'req' }[key];
    const rows = staffRows(ctx, dept).map(r => { const row = { b: r.b, n: r.n, dp: r.dp, v: +F.get(r) || 0 }; return lineKind ? withServicesDn(ctx, r, row, 'v', row.v, lineKind) : listKind ? withListDn(ctx, r, row, 'v', listKind, row.v) : row; }).filter(r => r.v).sort((a, b) => b.v - a.v);
    if (F.house !== undefined) houseRetail(ctx, F.house).forEach(h => rows.push({ b: h.b, n: h.n, dp: h.dp, v: h.net, _cls: 'dr-muted', _dn: { v: h._sp } }));
    const want = F.want(ctx), sum = rows.reduce((a, r) => a + r.v, 0);
    const d = (want != null && Math.abs(sum - want) >= 0.5) ? { b: '', n: 'Not matched to a branch row', dp: '', v: want - sum, _cls: 'dr-muted' } : null;
    if (d) rows.push(d);
    return { cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, ...deptCols(dept), { k: 'v', l: F.l, t: F.t }], rows, foot: { b: 'Total', n: '', dp: '', v: want != null ? want : sum },
      sub: `${esc(ctx.label)}. ${F.why}`, note: d ? DIFF_NOTE : '' };
  }
  // Phorest's own counts for one column, both sides together (Comparison's "New clients, Phorest" and "Requests (RQ)")
  function phAll(ctx, row) {
    const deptMap = (typeof buildStaffDeptMap === 'function') ? buildStaffDeptMap() : {}, ledgerDept = {};
    ((ctx.rows && ctx.rows.ledger) || []).forEach(r => { const dp = String(r.dept || '').trim().toLowerCase(); if (dp) ledgerDept[staffMapKey(r.staff_name)] = dp === 'beauty' ? 'beauty' : 'hair'; });
    const g = new Map(), pick = row === 'req' ? 'rqs' : 'new_clients';
    ((ctx.rows && ctx.rows.phorest) || []).forEach(r => {
      if (r.is_total) return;
      const who = fnPhorestPerson(r.employee_name, r.branch, ledgerDept, deptMap); if (!who) return;
      const k = r.branch + '|' + who.side + '|' + who.key;
      const x = g.get(k) || { b: bname(r.branch), n: nm(who.key), dp: who.side === 'hair' ? 'Hair' : 'Beauty', v: 0, t: 0, code: r.branch, raw: who.key };
      x.v += Number(r[pick]) || 0; x.t += Number(r.visits) || 0; g.set(k, x);
    });
    const rows = [...g.values()].filter(x => x.v).sort((a, b) => b.v - a.v).map(x => personListDn(ctx, x, x, row));
    const want = ctx.s.ph ? ctx.s.ph.hair[row] + ctx.s.ph.beauty[row] : null, sum = rows.reduce((a, r) => a + r.v, 0), tot = rows.reduce((a, r) => a + r.t, 0);
    const d = (want != null && Math.abs(sum - want) >= 0.5) ? { b: '', n: 'Not matched to a branch row', dp: '', v: want - sum, t: null, _cls: 'dr-muted' } : null;
    if (d) rows.push(d);
    const lbl = row === 'req' ? 'Requests (RQ)' : 'New clients';
    return { cols: [{ k: 'b', l: 'Branch' }, { k: 'n', l: 'Staff' }, { k: 'dp', l: 'Department' }, { k: 'v', l: lbl, t: 'num' }, { k: 't', l: 'Her Phorest visits', t: 'num' }], rows, foot: { b: 'Total', n: '', dp: '', v: want != null ? want : sum, t: tot },
      sub: `${esc(ctx.label)}. ${lbl} from Phorest's own staff reports, per staff member. Phorest counts these differently from the ledger, so they will not match it. Phorest keeps counts here, not client names.`, note: d ? DIFF_NOTE : '' };
  }

  // A page that has its own summary and rows (Comparison's two sides, the Daily Performance branch tiles): the same context the Pulse uses.
  function snapSide(s, o) {
    const hairNet = (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0), beautyNet = (s.beautyServicesTotal || 0) + (s.beautyRetailOnly || 0);
    const ctx = { s, card: { net: s.netTake, hairNet, beautyNet, hairSvc: s.hairServicesIncl, beautySvc: s.beautyServicesTotal }, label: o.label, range: o.range || '', cur: o.cur || CUR(),
      rows: o.rows || null, weekly: null, from: o.from, to: o.to, days: o.days || 0, door: { codes: o.codes, count: s.doorClients } };
    if (s.opx && s.opx.raw) { ctx.extra = s.opx.raw.data; ctx.extraCodes = s.opx.raw.codes; }
    return ctx;
  }
  // The Ledgers pages (Daily Target Sheet, Actuals vs Targets): a figure for one branch (or the branches picked) over one window of the ledger month.
  // The rows of that window are read the way lgSeries read them, and the list is the staff behind it, through the same lists as everywhere else.
  const LEDGER = {
    totalRevenue: ['net', {}], finServices: ['field', { key: 'finServices' }], courses: ['field', { key: 'courses' }], servicesTotal: ['field', { key: 'servicesTotal' }], retailTotal: ['field', { key: 'retail' }], hairRevenue: ['field', { key: 'hairSvc' }],
    hairServicesExcl: ['field', { key: 'hairSvcEx' }], hairTreatments: ['field', { key: 'treatments' }], hairTreatmentUnits: ['field', { key: 'treatUnits' }],
    hairCourses: ['field', { key: 'hairCourses' }], hairRetail: ['field', { key: 'hairRetail' }], hairRetailUnits: ['field', { key: 'hairRetailUnitsH' }],
    beautyServices: ['field', { key: 'beautySvc' }], beautyRetail: ['field', { key: 'beautyRetail' }], beautyRetailUnits: ['field', { key: 'beautyRetailUnitsB' }],
    beautyRebooked: ['field', { key: 'beautyRebooked' }], rebooked: ['field', { key: 'rebooked' }], totalClients: ['clients', {}], newClients: ['field', { key: 'newc' }], ncr: ['bench', { name: 'NCR' }],
    rebookPct: ['bench', { name: 'Rebooking %' }], treatmentPct: ['bench', { name: 'Treatment %', dept: 'hair' }], retailPct: ['bench', { name: 'Retail %', dept: 'hair' }],
    hairAvgBill: ['avg', { dept: 'hair' }], beautyAvgBill: ['avg', { dept: 'beauty' }],
  };
  const isoDate = v => new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10));
  function ledgerSpec(xk, codes, from, to, label) {
    const m = LEDGER[xk];
    if (!m || !from || !to) return null;
    return { title: `${(m[0] === 'field' ? FIELDS[m[1].key].title : m[0] === 'net' ? 'Total revenue' : m[0] === 'bench' ? m[1].name : m[0] === 'clients' ? 'Total clients' : 'Avg bill' + deptTitle(m[1].dept))} · ${label}`, cur: 'AED',
      views: [{ id: 'staff', label: 'By staff', load: async () => {
        const f = isoDate(from), t = isoDate(to);
        const [B, P] = await Promise.all([loadBranchStaffDailyRange(f, t), loadPhorestStaffDailyRange(f, t)]);
        const L = B.filter(r => codes.includes(r.branch)), Ph = P.filter(r => codes.includes(r.branch)), d = aggDailyData([], L, Ph);
        if (!d) return { cols: [], rows: [], empty: 'No staff rows for this window.' };
        const ctx = snapSide(d.summary, { rows: { ledger: L, phorest: Ph }, from, to, days: Math.round((t - f) / 864e5) + 1, label, codes, cur: 'AED' });
        const sp = spec(m[0], ctx, m[1]);
        if (!sp) return { cols: [], rows: [], empty: 'No staff rows for this window.' };
        return sp.views[0].load();
      } }] };
  }

  // What each Comparison row opens. door: whether the page is on the through-the-door basis.
  const METRIC = {
    'Net take': ['net'], 'Hair revenue': ['field', 'hairSvc'], 'Hair treatments': ['field', 'treatments'], 'Beauty services': ['field', 'beautySvc'], 'Retail': ['field', 'retail'],
    'Hair retail': ['field', 'hairRetail'], 'Beauty retail': ['field', 'beautyRetail'], 'Courses': ['field', 'courses'], 'Treatment units': ['field', 'treatUnits'], 'Retail units': ['field', 'retailUnits'],
    'Handled by staff': ['clients'], 'Hair clients': ['clients', 'hair'], 'Beauty clients': ['clients', 'beauty'], 'Request clients': ['field', 'request'], 'Salon clients': ['field', 'salon'],
    'New clients': ['field', 'newc'], 'Rebooked': ['field', 'rebooked'], 'New clients, Phorest': ['phall', 'nw'], 'Requests (RQ)': ['phall', 'req'],
    'Avg bill, per staff count': ['avg'], 'Hair avg bill': ['avg', 'hair'], 'Beauty avg bill': ['avg', 'beauty'],
    'NCR': ['bench', 'NCR'], 'Rebooking %': ['bench', 'Rebooking %'], 'Request rate': ['ask'], 'Treatment %': ['bench', 'Treatment %', 'hair'], 'Retail %': ['bench', 'Retail %'],
    'Hair utilisation %': ['bench', 'Utilisation %', 'hair'], 'Beauty utilisation %': ['bench', 'Utilisation %', 'beauty'],
    'Colour %': ['more', 'Colour', 'hair'], 'Reputation': ['more', 'Reputation'], 'Google reviews': ['more', 'Google reviews'], 'Social posts': ['more', 'Social posts'], 'Social workdays': ['more', 'Social workdays'],
  };
  function metric(name, ctx, o) {
    o = o || {};
    if (name === 'Clients') return o.door ? spec('door', ctx, {}) : spec('clients', ctx, {});
    if (name === 'Avg bill') return o.door ? spec('door', ctx, { perVisit: true }) : spec('avg', ctx, {});
    const m = METRIC[name]; if (!m) return null;
    const kind = m[0];
    if (kind === 'field') return spec('field', ctx, { key: m[1] });
    if (kind === 'phall') return spec('phall', ctx, { row: m[1] });
    if (kind === 'bench') return spec('bench', ctx, { name: m[1], dept: m[2] || null });
    if (kind === 'more') return spec('more', ctx, { name: m[1], dept: m[2] || null });
    return spec(kind, ctx, { dept: m[1] || null });
  }

  // What the page asks for. null = this window has nothing behind the figure, so it stays plain.
  // The all-department lists read the product split of the retail rung with no stylist first (ensureHouseSplit), so every view waits for it.
  function spec(kind, ctx, o) {
    const sp = specInner(kind, ctx, o);
    if (sp && sp.views && !(o && o.dept)) sp.views.forEach(v => { const l = v.load; v.load = async function () { await ensureHouseSplit(ctx); return l.apply(this, arguments); }; });
    return sp;
  }
  function specInner(kind, ctx, o) {
    o = o || {};
    const dept = o.dept || null;
    const t = what => `${what}${deptTitle(dept)}`;
    const staffOK = !!(ctx.rows && ctx.rows.ledger && (ctx.rows.ledger.length || ctx.rows.phorest.length));
    const cur = ctx.cur;
    if (kind === 'door') {
      if (ctx.door.count == null || !ctx.from) return null;
      return { title: o.perVisit ? 'Avg bill per visit, through the door' : 'Clients through the door', cur, views: doorViews(ctx, !!o.perVisit) };
    }
    if (kind === 'person') {
      if (!staffOK) return null;
      return { title: `${nm(o.name)} · ${o.what}`, cur, views: [{ id: 'days', label: 'Her days', load: async () => personDays(ctx, o) }] };
    }
    if (kind === 'bench') {
      if (!staffOK && !(o.name === 'Utilisation %' && ctx.s._utilPer)) return null;
      return { title: `${o.name}${deptTitle(dept)}`, cur, views: [{ id: 'bench', label: 'By staff', load: async () => { const r = benchList(ctx, o.name, dept); if (!r) throw new Error('No list for ' + o.name); return r; } }] };
    }
    if (kind === 'ask') {
      if (!staffOK) return null;
      return { title: t('Request rate'), cur, views: [{ id: 'ask', label: 'By staff', load: async () => askStaff(ctx, dept) }] };
    }
    if (kind === 'more') {
      if (o.name === 'Google reviews' || o.name === 'Reputation') {
        if (!ctx.from || !ctx.extraCodes) return null;
        const which = o.name === 'Reputation' ? '90' : 'window';
        return { title: o.name === 'Reputation' ? 'Reputation, last 90 days' : 'Google reviews in the period', cur, views: [{ id: 'rv', label: 'Reviews', load: async () => reviewsList(ctx, which) }] };
      }
      if (!ctx.extra) return null;
      return { title: t(o.name), cur, views: [{ id: 'more', label: 'By stylist', load: async () => { const r = moreList(ctx, o.name, dept); if (!r) throw new Error('No list for ' + o.name); return r; } }] };
    }
    if (kind === 'fn') {
      if (!staffOK || o.uns || !FN_FIELD[o.row]) return null;
      if (!o.led && !['t', 'req', 'nw', 'reb'].includes(o.row)) return null;
      return { title: `${FN_NAME[o.row]} · ${o.side === 'hair' ? 'Hair' : 'Beauty'}, ${o.led ? 'ledger' : 'Phorest'}`, cur, views: [{ id: 'fn', label: 'By staff', load: async () => { const r = fnList(ctx, o); if (!r) throw new Error('No list'); return r; } }] };
    }
    if (kind === 'field') {
      if (!staffOK || !FIELDS[o.key]) return null;
      return { title: FIELDS[o.key].title, cur, views: [{ id: 'field', label: 'By staff', load: async () => fieldList(ctx, o.key) }] };
    }
    if (kind === 'phall') {
      if (!staffOK) return null;
      return { title: o.row === 'req' ? 'Requests (RQ), Phorest' : 'New clients, Phorest', cur, views: [{ id: 'ph', label: 'By staff', load: async () => phAll(ctx, o.row) }] };
    }
    const byStaff = { net: netStaff, clients: clientsStaff, avg: avgStaff, req: reqStaff }[kind];
    const title = { net: t('Net take'), clients: t('Clients by staff'), avg: t(dept ? 'Avg bill per staff' : 'Avg bill, per staff'), req: t('Requested by name') }[kind];
    if (!byStaff) return null;
    if (staffOK) {
      const views = [{ id: 'staff', label: 'By staff', load: async () => byStaff(ctx, dept) }];
      if (kind === 'net' || kind === 'clients') views.push({ id: 'time', label: ctx.days <= DAY_VIEW_MAX ? 'By day' : 'By month', load: async () => byTime(ctx, kind, dept) });
      return { title, cur, views };
    }
    if (ctx.weekly && !dept && (kind === 'net' || kind === 'clients')) return { title, cur, views: [{ id: 'wk', label: 'By week', load: async () => weeklyList(ctx, dept) }] };
    return null;
  }

  return { snap, spec, branchCtx, snapSide, metric, ledgerSpec };
})();
