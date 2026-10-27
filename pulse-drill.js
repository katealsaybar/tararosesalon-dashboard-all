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
  const nm = s => titleCaseName(s);
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const money = (v, cur) => (cur || 'AED') + ' ' + Math.round(+v || 0).toLocaleString('en-GB');
  const cnt = v => Math.round(+v || 0).toLocaleString('en-GB');
  const DAY_VIEW_MAX = 92;   // up to this many days the day-by-day list is by day, longer windows go by month

  // The window as the Pulse drew it. Called from renderDashboard with the card's own figures, so the lists can say what they must add up to.
  function snap(s, card, label) {
    const codes = sel.branch.includes('all') ? null : sel.branch;
    const list = (codes && codes.length) ? codes : scopeCodes();
    const weekly = (!window._fnRows && Array.isArray(window._cachedWeeklyTotals) && window._cachedWeeklyTotals.length)
      ? window._cachedWeeklyTotals.filter(r => sel.branch.includes('all') || sel.branch.includes(r.branch)) : null;
    return {
      s, card, label, cur: CUR(), rows: window._fnRows || null, weekly,
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
  // The retail nobody was credited with, shared between hair and beauty the way the card shares it, one line per branch.
  function houseRetail(ctx, dept) {
    const out = [];
    branches(ctx).forEach(b => {
      const s = b.d.summary, ua = +s.retailUnattributed || 0;
      if (Math.abs(ua) < 0.005) return;
      const sh = s.retailHairShare == null ? 1 : s.retailHairShare;
      const v = dept === 'hair' ? ua * sh : dept === 'beauty' ? ua * (1 - sh) : ua;
      if (Math.abs(v) >= 0.005) out.push({ b: bname(b.code), n: 'Retail rung with no stylist', dp: dept ? '' : 'Both', svc: 0, rt: v, net: v, cl: null, _cls: 'dr-muted' });
    });
    return out;
  }
  const DIFF_NOTE = 'The last grey line is the difference between the card, which works the whole window out in one go, and the rows above, which work it out one branch at a time. It brings the list to the card\'s figure.';
  function diffRow(label, have, want, extra) {
    if (!(Math.abs(have - want) >= 0.5)) return null;
    return Object.assign({ b: '', n: label, _cls: 'dr-muted' }, extra);
  }

  // ── Net take by staff ──
  function netStaff(ctx, dept) {
    const rows = staffRows(ctx, dept).map(r => {
      const svc = r.dp === 'Hair' ? r.st.hairSalesNet : r.st.beautySales;
      return { b: r.b, n: r.n, dp: r.dp, svc, rt: r.st.retail, net: r.st.netSalonTake, cl: r.st.total };
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
      sub: `${esc(ctx.label)}. Services and retail each stylist was credited with, from the branch ledgers matched to Phorest by staff and day. Retail rung with no stylist is shown on its own line.`,
      note: d ? DIFF_NOTE : '',
    };
  }

  // ── Clients per staff (the ledgers) ──
  function clientsStaff(ctx, dept) {
    const rows = staffRows(ctx, dept).map(r => ({ b: r.b, n: r.n, dp: r.dp, cl: r.st.total })).filter(r => r.cl).sort((a, b) => b.cl - a.cl);
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
      return { b: r.b, n: r.n, dp: r.dp, m, cl: r.st.total, avg: r.st.total ? m / r.st.total : null };
    }).filter(r => r.m || r.cl).sort((a, b) => (b.avg || 0) - (a.avg || 0));
    if (!dept) houseRetail(ctx, null).forEach(h => rows.push({ b: h.b, n: h.n, dp: '', m: h.net, cl: null, avg: null, _cls: 'dr-muted' }));
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
    const rows = staffRows(ctx, dept).map(r => ({ b: r.b, n: r.n, dp: r.dp, rq: r.st.req || 0, cl: r.st.total, pc: r.st.total ? (r.st.req || 0) / r.st.total * 100 : null })).filter(r => r.cl).sort((a, b) => b.rq - a.rq);
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
    const bk = buckets(ctx);
    const rows = [];
    bk.list.forEach(x => {
      const d = aggDailyData([], x.L, x.P);
      if (!d) return;
      const s = d.summary;
      const net = dept === 'hair' ? (s.hairServicesIncl || 0) + (s.hairRetailOnly || 0) : dept === 'beauty' ? (s.beautyServicesTotal || 0) + (s.beautyRetailOnly || 0) : s.netTake;
      const cl = dept === 'hair' ? s.hairTotalClients : dept === 'beauty' ? s.beautyTotalClients : s.totalClients;
      rows.push({ k: x.k, w: whenLabel(x.k, bk.byDay), net, cl });
    });
    rows.sort((a, b) => b.k.localeCompare(a.k));
    const wantN = dept === 'hair' ? ctx.card.hairNet : dept === 'beauty' ? ctx.card.beautyNet : ctx.card.net;
    const wantC = dept === 'hair' ? ctx.s.hairTotalClients : dept === 'beauty' ? ctx.s.beautyTotalClients : ctx.s.totalClients;
    const sumN = rows.reduce((a, r) => a + r.net, 0), sumC = rows.reduce((a, r) => a + r.cl, 0);
    const d = (Math.abs(sumN - wantN) >= 0.5 || Math.abs(sumC - wantC) >= 0.5) ? { w: 'Not matched to a day', net: wantN - sumN, cl: wantC - sumC, _cls: 'dr-muted' } : null;
    if (d) rows.push(d);
    return {
      cols: [{ k: 'w', l: bk.byDay ? 'Day' : 'Month' }, { k: 'net', l: 'Net take', t: 'aed' }, { k: 'cl', l: 'Clients by staff', t: 'num' }],
      rows, foot: { w: 'Total', net: wantN, cl: wantC },
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
      const bs = [...new Set(x.L.filter(r => staffMapKey(r.staff_name) === key).map(r => bname(r.branch)))].join(', ');
      rows.push({ k: x.k, w: whenLabel(x.k, bk.byDay), b: bs, net: st.netSalonTake, cl: st.total, rq: st.req || 0, nw: st.newC || 0 });
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
          rows: rows.map(r => ({ d: r.d, b: bname(r.b), c: r.c, s: r.s, st: r.st })),
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
          rows: list.map(x => ({ c: x.c, v: x.v, s: x.s, b: [...x.b].join(', ') })),
          foot: { c: 'Total', v: data.total, s: data.spend, b: '' },
        };
      } },
    ];
  }

  // What the page asks for. null = this window has nothing behind the figure, so it stays plain.
  function spec(kind, ctx, o) {
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

  return { snap, spec };
})();
