/* ============================================================
   My Numbers: every figure opens the rows behind it (Kate, 30 Oct 2026: "all values are supposed to be clickable").
   Built on the shared drill window (/drill.js, TRSD): the same list, filters, Save as xlsx / csv and Esc to close as the rest of the dashboard.
   Kate's display rule, decided when the figure is tapped, so turning a phone sideways does the right thing:
     laptop (wider than 619px, the width this page already calls a phone): a big pop-up over the page, X, Esc or a tap outside to close
     phone (619px or less): the list opens in another window (figure.html), always, and closing it closes that window
   The rows are HER OWN and nothing else. Days, weeks, reviews and posts come from three token-only functions
   (migrations/perf_my_drill.sql: perf_my_days, perf_my_reviews, perf_my_socials); the Podium board shows the names, salons and figures the
   board already shows. No ids, tokens, emails or client names. A figure with nothing behind it stays plain.

     MyDrill.init({ token, sid, admin }) turns it on for a token link, and for a leader's team key (admin) with the person's staff id (sid) or token
     In the dashboard's frame (embed=1) the list is read here and handed to the dashboard, which opens it over the whole page (type 'perf-drill').
     MyDrill.fig(html, spec)        the figure as tappable html (the plain html when spec is null)
     MyDrill.days(kind, opts)       a spec for her days in a window: kind below, opts { from, to, src, label }
     MyDrill.reviews / posts / rows more specs; MyDrill.month('2026-10') gives { from, to }
   ============================================================ */
(function () {
  'use strict';
  if (window.MyDrill) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dText = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : ''; };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const mondayOf = s => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const A = v => +v || 0;
  const pc = (a, b) => b > 0 ? 100 * a / b : null;
  const st = { on: false, token: null, sid: null, admin: null, embed: false, inline: false };
  const REG = new Map();
  let seq = 0;
  const PHONE = () => matchMedia('(max-width:619px)').matches;

  function init(o) {
    let embed = false; try { embed = new URLSearchParams(location.search).get('embed') === '1'; } catch (e) {}
    if (o && ('token' in o || 'sid' in o)) { st.token = o.token || null; st.sid = o.sid || null; }   // a page for one person: her own, never the one before
    st.inline = st.inline || !!(o && o.inline);                   // inside the dashboard itself: always the shared window over the page, never another browser window
    st.admin = o && o.admin || st.admin || null;                 // a leader's team key: it reads one person's rows by her staff id (perf_my_*_by_id)
    st.embed = embed && window.parent !== window;
    st.on = (!!st.token || !!st.admin) && typeof window.TRSD === 'object';
  }

  // ── Her days, read once per window ───────────────────────────
  const CACHE = new Map();
  // Whose rows: her own token, or (a leader's key) a staff id. Nothing else ever reaches a list.
  const who = o => o && o.token ? { token: o.token } : o && o.sid && st.admin ? { sid: o.sid } : st.token ? { token: st.token } : st.sid && st.admin ? { sid: st.sid } : null;
  async function rpcList(fn, from, to, w) {
    const key = fn + '|' + (w.token || w.sid) + '|' + from + '|' + to;
    if (CACHE.has(key)) return CACHE.get(key);
    const p = (async () => {
      const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${w.sid ? fn + '_by_id' : fn}`, { method: 'POST', headers: await PerfAuth.headers(), body: JSON.stringify(Object.assign(w.sid ? { p_admin: st.admin, p_staff_id: w.sid } : { p_token: w.token }, fn === 'perf_my_day' ? { p_date: from } : { p_from: from, p_to: to })) });
      if (r.status === 404) return null;                 // the functions are not installed yet (migrations/perf_my_drill.sql)
      if (!r.ok) { const t = await r.text(); if (/sign_in_required/.test(t)) throw new Error('Please sign in again to see this list.'); throw new Error(fn + ' ' + r.status); }
      return r.json();
    })();
    CACHE.set(key, p);
    p.catch(() => CACHE.delete(key));
    return p;
  }
  // Save as xlsx / csv (the shared window's buttons) loads the spreadsheet writer the first time; this page has no lazy loader of its own, so a small one.
  if (typeof window.trsLazy !== 'function') {
    let lgx = null;
    window.trsLazy = name => name !== 'lgx' ? Promise.resolve() : lgx || (lgx = new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/ledger-export.js?v=67737bd9'; s.onload = ok; s.onerror = () => { lgx = null; no(new Error('export')); }; document.head.appendChild(s); }));
  }
  const NOTREADY = { cols: [], rows: [], empty: 'This list is not switched on yet. It will be there after the next update.' };

  // ── What each figure is made of ──────────────────────────────
  // c: columns (source-aware), f: the cells of one record (a day, a week or the whole window: they are all sums of days), keep: whether a day belongs on the list.
  const AED = 'aed', NUM = 'num', PCT = 'pct';
  // Kate, 30 Oct 2026: the Phorest clients count is PAID visits (redos, consultations and AED 0 services left out); the page's switch brings them back. ALL says which one this list is in.
  let ALL = false;
  const VIS = r => ALL ? r.visits : r.pvisits;
  const SRC_NOTE = { ledger: 'counted per staff from the branch sheet reception fills in', phorest: 'Phorest’s own count' };
  const K = {
    revenue:  { t: 'Total revenue', c: () => [['svc', 'Services', AED]], f: r => ({ svc: r.svc }), keep: r => r.svc > 0,
      s: () => 'Your services before VAT, from Phorest. The total row is the figure on your page.' },
    services: { t: 'Services', c: () => [['svc', 'Services', AED]], f: r => ({ svc: r.svc }), keep: r => r.svc > 0,
      s: () => 'What you took on services before VAT, from Phorest. The total row is the figure on your page.' },
    sales:    { t: 'Total sales', c: () => [['svc', 'Services', AED], ['retail', 'Retail', AED], ['tot', 'Total', AED]], f: r => ({ svc: r.svc, retail: r.retail, tot: r.svc + r.retail }), keep: r => r.svc > 0 || r.retail > 0,
      s: () => 'Services and retail together, before VAT, from Phorest. The total row is the figure the Podium Race ranks you on.' },
    hair:     { t: 'Hair services', c: () => [['svc', 'Services', AED], ['treat', 'Treatments', AED], ['hs', 'Hair services', AED]], f: r => ({ svc: r.svc, treat: r.treat, hs: r.svc - r.treat }), keep: r => r.svc > 0 || r.treat > 0,
      s: () => 'Your services from Phorest, less the treatments on the branch sheet.' },
    treat:    { t: 'Treatments', c: () => [['treat', 'Treatments', AED], ['tu', 'Treatments (#)', NUM]], f: r => ({ treat: r.treat, tu: r.tu }), keep: r => r.treat > 0 || r.tu > 0,
      s: () => 'Treatment sales from the branch sheet, and how many treatments the till rang up for you (Phorest\u2019s own treatment family: bond repair, scalp, Olaplex and the rest).' },
    treatpct: { t: 'Treatments %', c: () => [['treat', 'Treatments', AED], ['tu', 'Treatments (#)', NUM], ['hs', 'Hair services', AED], ['p', 'Treatments %', PCT]], f: r => ({ treat: r.treat, tu: r.tu, hs: r.svc - r.treat, p: pc(r.treat, r.svc - r.treat) }), keep: r => r.treat > 0 || r.svc > 0,
      s: () => 'Treatments as a share of your hair services. The total row is the figure on your page.' },
    retail:   { t: 'Retail', c: () => [['retail', 'Retail', AED], ['ru', 'Retail units', NUM]], f: r => ({ retail: r.retail, ru: r.ru }), keep: r => r.retail > 0 || r.ru > 0,
      s: () => 'Home care you sold before VAT, from Phorest. Units are the product lines on the till, one per item rung up.' },
    retailpct:{ t: 'Retail %', c: () => [['retail', 'Retail', AED], ['ru', 'Retail units', NUM], ['svc', 'Services', AED], ['p', 'Retail %', PCT]], f: r => ({ retail: r.retail, ru: r.ru, svc: r.svc, p: pc(r.retail, r.svc) }), keep: r => r.retail > 0 || r.svc > 0,
      s: () => 'Retail as a share of your services. The total row is the figure on your page.' },
    avgbill:  { t: 'Average bill', c: () => [['svc', 'Services', AED], ['cl', 'Clients', NUM], ['avg', 'Average bill', AED], ['avgr', 'With retail', AED]],
      f: (r, src) => { const cl = src === 'phorest' ? VIS(r) : r.clients; return { svc: r.svc, cl, avg: cl > 0 ? r.svc / cl : null, avgr: cl > 0 ? (r.svc + r.retail) / cl : null }; }, keep: (r, src) => r.svc > 0 || (src === 'phorest' ? VIS(r) : r.clients) > 0,
      s: src => `Your services before VAT divided by your clients (${SRC_NOTE[src]}). The total row is the figure on your page.` },
    clients:  { t: 'Clients', c: () => [['cl', 'Clients (branch sheet)', NUM], ['vi', ALL ? 'Visits (Phorest, all)' : 'Paid visits (Phorest)', NUM]].concat(ALL ? [] : [['al', 'All visits (Phorest)', NUM]]),
      f: r => ({ cl: r.clients, vi: VIS(r), al: r.visits }), keep: r => r.clients > 0 || r.visits > 0 || r.pvisits > 0,
      s: () => 'The branch sheet counts clients per staff, so a client with two stylists is counted once for each. Phorest counts visits' + (ALL ? ': every visit it rang up under your name, redos, consultations and AED 0 services included.' : ': one paid visit per client per day; redos, consultations and AED 0 services are left out (the last column counts every visit).') },
    rebook:   { t: 'Rebooking', c: src => [['cl', src === 'phorest' ? 'Clients counted' : 'Clients', NUM], ['rb', 'Rebooked', NUM], ['p', 'Rebooking %', PCT]],
      f: (r, src) => { const cl = src === 'phorest' ? r.rb_visits : r.clients, rb = src === 'phorest' ? r.rb_n : r.lreb; return { cl, rb, p: pc(rb, cl) }; }, keep: (r, src) => (src === 'phorest' ? r.rb_visits : r.clients) > 0,
      s: src => `Clients who booked their next visit before leaving (${SRC_NOTE[src]}). The total row is the figure on your page.` },
    request:  { t: 'Request rate', c: src => src === 'phorest' ? [['rq', 'Asked for you', NUM], ['cl', ALL ? 'Visits' : 'Paid visits', NUM], ['p', 'Request rate', PCT]] : [['rq', 'Asked for you', NUM], ['nr', 'New client requests', NUM], ['cl', 'Clients', NUM], ['p', 'Request rate', PCT]],
      f: (r, src) => src === 'phorest' ? { rq: r.rqs, cl: VIS(r), p: pc(r.rqs, VIS(r)) } : { rq: r.req, nr: r.ncr, cl: r.clients, p: pc(r.req + r.ncr, r.clients) }, keep: (r, src) => (src === 'phorest' ? VIS(r) : r.clients) > 0,
      s: src => src === 'phorest' ? 'Visits where the client asked for you by name, from Phorest.' : 'Clients who asked for you by name, plus the new clients who asked for you, over all your clients (branch sheet).' },
    req:      { t: 'Request', c: () => [['n', 'Asked for you', NUM], ['cl', 'Clients', NUM]], f: (r, src) => src === 'phorest' ? { n: r.rqs, cl: VIS(r) } : { n: r.req, cl: r.clients }, keep: (r, src) => (src === 'phorest' ? r.rqs : r.req) > 0,
      s: src => `Clients who asked for you by name (${SRC_NOTE[src]}).` },
    salon:    { t: 'Salon clients', c: () => [['n', 'Salon', NUM], ['cl', 'Clients', NUM]], f: r => ({ n: r.salon, cl: r.clients }), keep: r => r.salon > 0,
      s: () => 'Clients the salon gave you, from the branch sheet.' },
    newc:     { t: 'New clients', c: () => [['n', 'New', NUM], ['cl', 'Clients', NUM]], f: (r, src) => src === 'phorest' ? { n: r.pnew, cl: VIS(r) } : { n: r.newc, cl: r.clients }, keep: (r, src) => (src === 'phorest' ? r.pnew : r.newc) > 0,
      s: src => `New clients (${SRC_NOTE[src]}).` },
    ncr:      { t: 'New client requests', c: () => [['n', 'New client requests', NUM], ['cl', 'Clients', NUM]], f: r => ({ n: r.ncr, cl: r.clients }), keep: r => r.ncr > 0,
      s: () => 'New clients who asked for you by name, from the branch sheet.' },
    fill:     { t: 'Column fill', c: () => [['uh', 'Hours booked', NUM], ['ah', 'Hours available', NUM], ['p', 'Column fill', PCT]], f: r => ({ uh: r.uh, ah: r.ah, p: pc(r.uh, r.ah) }), keep: r => r.ah > 0 || r.uh > 0,
      s: () => 'Hours you had a client, out of the hours you had available, from Phorest. The total row is the figure on your page.' },
    sheet:    { t: 'Your numbers', c: () => [['svc', 'Services', AED], ['retail', 'Retail', AED], ['cl', 'Clients', NUM], ['rb', 'Rebooked', NUM]],
      f: (r, src) => ({ svc: r.svc, retail: r.retail, cl: src === 'phorest' ? VIS(r) : r.clients, rb: src === 'phorest' ? r.rb_n : r.lreb }), keep: r => r.svc > 0 || r.retail > 0 || r.clients > 0 || r.visits > 0,
      s: src => `Your sales from Phorest and your clients and rebooked (${SRC_NOTE[src]}).` },
    phclients:{ t: 'Clients', c: () => [['vi', ALL ? 'Visits (Phorest, all)' : 'Paid visits (Phorest)', NUM]], f: r => ({ vi: VIS(r) }), keep: r => VIS(r) > 0, s: () => 'The visits you looked after, from Phorest.' },
  };
  const SUMF = ['svc', 'retail', 'visits', 'pvisits', 'rqs', 'pnew', 'rb_visits', 'rb_n', 'clients', 'req', 'salon', 'newc', 'ncr', 'lreb', 'treat', 'ru', 'tu', 'uh', 'ah'];
  const blank = () => Object.fromEntries(SUMF.map(k => [k, 0]));
  const add = (a, d) => { SUMF.forEach(k => { a[k] += A(d[k]); }); return a; };
  const nice = v => Math.round(v * 10) / 10;

  // ── One day: the rows behind a day's figure (Kate, 4 Nov 2026) ───
  // perf_my_day (migrations/perf_my_day.sql) gives, for one day, the till lines (grouped into visits, no client names), Phorest's day row, its rebooking row, the
  // branch sheet row and the utilisation hours, per branch: the same sources perf_my_days adds up, so the rows add up to the figure on the list.
  const BR = { SAA: 'Saadiyat', KCA: 'Khalifa City A', MC: 'Motor City', AQ: 'Al Quoz', BAH: 'Bahrain' };
  const brn = b => BR[b] || b;
  const LINES = ['revenue', 'services', 'sales', 'hair', 'retail', 'retailpct', 'avgbill'];
  const sumOf = (list, k) => (list || []).reduce((a, x) => a + A(x[k]), 0);
  const aed0 = v => 'AED ' + Math.round(v).toLocaleString('en-GB');
  // The lines that are retail on a day: the ones the till marks as products (a size in the name), when they add to Phorest's retail figure to the cent.
  // { ok, retail, svc }; ok is false otherwise and the day's lines are shown whole, with Phorest's own split in the heading.
  function splitRetail(L, target) {
    const cents = x => Math.round(A(x) * 100), t = cents(target);
    if (t <= 0) return { ok: true, retail: [], svc: L };
    const prod = L.filter(x => x.kind === 'product'), rest = L.filter(x => x.kind !== 'product');
    if (Math.abs(t - prod.reduce((a, x) => a + cents(x.net), 0)) <= 2) return { ok: true, retail: prod, svc: rest };
    return { ok: false };                                         // the till does not mark them all as products: not guessed, the day's lines are shown whole
  }
  // Client names on a day's lines (Kate, 11 Nov 2026: "beside visit column add another column for client name, clickable, leads to client book deets"). Only a leader's team key
  // asks for them (perf_my_day_clients, Level 3 and above, no name ever reaches her own My Numbers link), and the window is the dashboard's own Client Book (PD.clientHistory),
  // which the dashboard page holds: a frame reaches it through its parent. No Client Book (a login under Level 3, her own link) means no Client column.
  function pdOf() {
    try { if (typeof PD !== 'undefined' && PD && PD.clientHistory) return PD; } catch (e) {}
    try { return window.parent && window.parent !== window ? window.parent.eval("typeof PD !== 'undefined' && PD.clientHistory ? PD : null") : null; } catch (e) { return null; }
  }
  async function dayClients(date, w) {
    if (!st.admin || !w || !w.token || !pdOf()) return null;
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/rpc/perf_my_day_clients`, { method: 'POST', headers: await PerfAuth.headers(), body: JSON.stringify({ p_admin: st.admin, p_token: w.token, p_date: date }) });
      if (!r.ok) return null;
      const list = await r.json();
      if (!Array.isArray(list) || !list.length) return null;
      const m = {}; list.forEach(x => { if (x.client && String(x.client).trim()) m[x.branch + '|' + x.visit] = x; });
      return Object.keys(m).length ? m : null;
    } catch (e) { return null; }
  }
  function clientOf(d, x, date, row) {
    const c = d._cn && d._cn[x.branch + '|' + x.visit];
    if (!c) return row;
    row.cn = String(c.client).trim();
    const P = pdOf(), sp = P && P.clientHistory({ cur: 'AED', label: dText(date) }, { client: row.cn, on: date, branches: [x.branch], cid: c.cid || undefined });
    if (sp) row._dn = Object.assign(row._dn || {}, { cn: sp });
    return row;
  }
  function dayRes(kind, d, o, date) {
    const src = o.src === 'phorest' ? 'phorest' : 'ledger', day = dText(date);
    const one = (cols, rows, foot, sub, note) => ({ cols, rows, foot: rows.length > 1 ? foot : null, sub: esc(sub), note: note || '', empty: 'No rows for this day.' });
    const multi = rows => new Set(rows.map(x => x.branch)).size > 1;
    const bc = rows => multi(rows) ? [{ k: 'br', l: 'Branch' }] : [];
    // Kate, 11 Nov 2026 ("walang treatment names"): a day of Treatments names the treatments. They are the till lines Phorest files under its treatment family; the branch
    // sheet's treatment figure is typed by reception, so the two are compared and any gap is said.
    if ((kind === 'treat' || kind === 'treatpct') && (d.lines || []).length) {
      const T = d.lines.filter(x => x.family === 'treat'), sum = sumOf(T, 'net'), want = sumOf(d.sheet, 'treat');
      const rows = T.map(x => clientOf(d, x, date, { visit: 'Visit ' + x.visit, br: brn(x.branch), item: x.item, net: x.net }));
      const cols = [{ k: 'visit', l: 'Visit' }].concat(d._cn ? [{ k: 'cn', l: 'Client' }] : [], bc(T), [{ k: 'item', l: 'Treatment' }, { k: 'net', l: 'Amount', t: 'aed' }]);
      const gap = Math.abs(sum - want) > 1 ? `Not matched: the treatments on the till add to ${aed0(sum)} and the branch sheet, which reception types, says ${aed0(want)}.` : '';
      return one(cols, rows, { visit: 'Total', item: T.length + (T.length === 1 ? ' treatment' : ' treatments'), net: sum },
        `The treatments you rang up on ${day}, before VAT, grouped by visit, from Phorest.`, gap);
    }
    if (LINES.includes(kind)) {
      const all = d.lines || [], ph = d.phorest || [], svc = sumOf(ph, 'svc'), rt = sumOf(ph, 'retail');
      // Phorest's day report splits the day into services and retail, the till lines do not say which is which. Home care with a size in its name is marked a product,
      // and those are used when they add to Phorest's retail figure to the cent. Otherwise the day's lines are all shown, and it says so.
      if (!all.length && ph.length) {                       // the till lines for this day are not loaded: Phorest's own day row is what there is
        const rows = ph.map(x => ({ br: brn(x.branch), svc: x.svc, rt: x.retail, vi: x.visits }));
        return one(bc(ph).concat([{ k: 'svc', l: 'Services', t: 'aed' }, { k: 'rt', l: 'Retail', t: 'aed' }, { k: 'vi', l: 'Visits', t: 'num' }]), rows, { br: 'Total', svc, rt, vi: sumOf(ph, 'visits') },
          `Phorest’s day report for you on ${day}, before VAT. The till lines for this day are not loaded, so there is no list of items.`);
      }
      const sp = splitRetail(all, rt);
      const retailList = ['retail', 'retailpct'].includes(kind), svcList = ['revenue', 'services', 'hair', 'avgbill'].includes(kind);
      const L = !sp.ok ? all : retailList ? sp.retail : svcList ? sp.svc : all;
      const want = !sp.ok ? svc + rt : retailList ? rt : svcList ? svc : svc + rt, sum = sumOf(L, 'net');
      const hasC = !!d._cn, units = retailList && sp.ok;
      const cols = [{ k: 'visit', l: 'Visit' }].concat(hasC ? [{ k: 'cn', l: 'Client' }] : [], bc(L), [{ k: 'item', l: 'What' }], units ? [{ k: 'u', l: 'Units', t: 'num' }] : [], [{ k: 'net', l: 'Amount', t: 'aed' }]);
      const rows = L.map(x => clientOf(d, x, date, { visit: 'Visit ' + x.visit, br: brn(x.branch), item: x.item, u: 1, net: x.net }));
      const tr = sumOf(d.sheet, 'treat');
      let sub = !sp.ok ? `Everything you rang up on ${day}, before VAT, grouped by visit, from Phorest. Phorest’s day report puts ${aed0(svc)} of it in services and ${aed0(rt)} in retail; the till lines do not say which is which on this day.`
        : retailList ? `The home care you sold on ${day}, before VAT, grouped by visit, from Phorest.`
        : svcList ? `Your services on ${day}, before VAT, grouped by visit, from Phorest.`
        : `Everything you rang up on ${day}, before VAT, grouped by visit, from Phorest.`;
      if (kind === 'hair' && tr) sub += ` Hair services are these services less the ${aed0(tr)} of treatments on the branch sheet.`;
      if (kind === 'avgbill') sub += ' The average bill is these services divided by your clients.';
      const gap = Math.abs(sum - want) > 1 ? `Not matched: these lines add to ${aed0(sum)} and Phorest’s day report to ${aed0(want)}.` : '';
      return one(cols, rows, units ? { visit: 'Total', u: L.length, net: sum } : { visit: 'Total', net: sum }, sub, gap);
    }
    if (kind === 'fill') {
      const U = d.util || [];
      const rows = U.map(x => ({ br: brn(x.branch), uh: x.booked, ah: x.available, p: A(x.available) > 0 ? 100 * A(x.booked) / A(x.available) : null }));
      const uh = sumOf(U, 'booked'), ah = sumOf(U, 'available');
      return one(bc(U).concat([{ k: 'uh', l: 'Hours booked', t: 'num' }, { k: 'ah', l: 'Hours available', t: 'num' }, { k: 'p', l: 'Column fill', t: 'pct' }]), rows,
        { br: 'Total', uh, ah, p: ah > 0 ? 100 * uh / ah : null }, `The hours you had a client, out of the hours you had available on ${day}, from Phorest.`);
    }
    if (kind === 'rebook' && src === 'phorest') {
      const R = d.rebook || [], rows = R.map(x => ({ br: brn(x.branch), v: x.visits, rb: x.rebooked, p: A(x.visits) > 0 ? 100 * A(x.rebooked) / A(x.visits) : null }));
      const v = sumOf(R, 'visits'), rb = sumOf(R, 'rebooked');
      return one(bc(R).concat([{ k: 'v', l: 'Clients counted', t: 'num' }, { k: 'rb', l: 'Rebooked', t: 'num' }, { k: 'p', l: 'Rebooking %', t: 'pct' }]), rows,
        { br: 'Total', v, rb, p: v > 0 ? 100 * rb / v : null }, `Clients who booked their next visit before leaving on ${day}, from Phorest’s own count.`);
    }
    if (src === 'phorest' && ['newc', 'request', 'req', 'clients', 'phclients'].includes(kind)) {
      const P = d.phorest || [];
      const rows = P.map(x => ({ br: brn(x.branch), v: x.visits, rq: x.rqs, nw: x.new }));
      const cols = bc(P).concat([{ k: 'v', l: 'Visits', t: 'num' }, { k: 'rq', l: 'Asked for you', t: 'num' }, { k: 'nw', l: 'New clients', t: 'num' }]);
      return one(cols, rows, { br: 'Total', v: sumOf(P, 'visits'), rq: sumOf(P, 'rqs'), nw: sumOf(P, 'new') }, `Phorest’s own count for you on ${day}.`);
    }
    // everything else counted per staff from the branch sheet reception fills in; a branch where she did not work stays off the list
    const S = (d.sheet || []).filter(x => ['clients', 'req', 'salon', 'new', 'ncr', 'rebooked', 'treat'].some(k => A(x[k]) !== 0));
    const rows = S.map(x => ({ br: brn(x.branch), cl: x.clients, rq: x.req, sa: x.salon, nw: x.new, nr: x.ncr, rb: x.rebooked, tr: x.treat }));
    const cols = bc(S).concat([{ k: 'cl', l: 'Clients', t: 'num' }, { k: 'rq', l: 'Asked for you', t: 'num' }, { k: 'sa', l: 'Salon', t: 'num' }, { k: 'nw', l: 'New', t: 'num' },
      { k: 'nr', l: 'New client requests', t: 'num' }, { k: 'rb', l: 'Rebooked', t: 'num' }, { k: 'tr', l: 'Treatments', t: 'aed' }]);
    const foot = { br: 'Total', cl: sumOf(S, 'clients'), rq: sumOf(S, 'req'), sa: sumOf(S, 'salon'), nw: sumOf(S, 'new'), nr: sumOf(S, 'ncr'), rb: sumOf(S, 'rebooked'), tr: sumOf(S, 'treat') };
    if (!multi(S)) foot.br = '';
    return one(cols, rows, foot, `Your row on the branch sheet reception fills in for ${day}.`);
  }
  function daySpec(kind, o, w, date) {
    if (!K[kind] || !date) return null;
    return { title: (o.title || K[kind].t) + ' · ' + dText(date), sk: `${kind}-day-${o.src === 'phorest' ? 'ph' : 'ld'}-${(w.token || w.sid).slice(0, 8)}-${date}`, cur: 'AED',
      views: [{ id: 'dd', label: 'That day', load: async () => { const d = await rpcList('perf_my_day', date, date, w); if (d == null) return NOTREADY; const run = Object.assign({}, d); if (LINES.includes(kind) || kind === 'treat' || kind === 'treatpct') run._cn = await dayClients(date, w); return dayRes(kind, run, o, date); } }] };
  }

  function build(kind, days, o, view, w) {
    const k = K[kind], src = o.src === 'phorest' ? 'phorest' : 'ledger';
    ALL = src === 'phorest' && !!o.free;
    const cols = [{ k: 'date', l: view === 'week' ? 'Week starting' : 'Date', t: 'date' }].concat(k.c(src).map(([key, l, t]) => ({ k: key, l, t })));
    const recs = view === 'week'
      ? [...days.reduce((m, d) => { const w = mondayOf(d.date); m.set(w, add(m.get(w) || blank(), d)); return m; }, new Map())].map(([date, r]) => Object.assign(r, { date }))
      : days.map(d => { const r = add(blank(), d); r.date = d.date; return r; });
    const rows = recs.filter(r => k.keep(r, src)).map(r => Object.assign({ date: r.date }, k.f(r, src)));
    // Kate, 4 Nov 2026 ("also not clickable"): a day's figure opens that day's rows (the till lines, the branch sheet row, Phorest's and the utilisation rows
    // behind it), a week's figure opens that week's days.
    if (w) rows.forEach(r => {
      const sp = view === 'week' ? days_(kind, Object.assign({}, o, { from: r.date < o.from ? o.from : r.date, to: addDays(r.date, 6) > o.to ? o.to : addDays(r.date, 6), window: '' }), w) : daySpec(kind, o, w, r.date);
      if (!sp) return;
      r._dn = {};
      cols.forEach(c => { if (c.k !== 'date' && r[c.k] != null && r[c.k] !== '' && +r[c.k] !== 0) r._dn[c.k] = sp; });
    });
    const tot = recs.reduce((a, r) => add(a, r), blank());
    const foot = Object.assign({ date: 'Total' }, k.f(tot, src));
    return { cols, rows, foot, sub: `${esc(k.s(src))} ${esc(o.window || '')}`.trim(), empty: 'Nothing here for these dates yet.' };
  }
  const winText = o => o.from === o.to ? `${dText(o.from)}.` : `${dText(o.from)} to ${dText(o.to)}.`;
  function days(kind, o) {
    const w = who(o); if (!w) return null;
    return days_(kind, o, w);
  }
  function days_(kind, o, w) {
    const k = K[kind]; if (!k) return null;
    o = Object.assign({ src: 'ledger' }, o);                                 // nobody to read rows for: the figure stays plain
    // Kate, 3 Nov 2026: a click must show WHY the figure is its value, not say it again. One day, or a window with a single day of figures (o.nd, counted by the page),
    // would open one row that repeats the figure, so the figure stays plain.
    if (o.from === o.to) return daySpec(kind, o, w, o.from);                  // one day: its own rows (4 Nov 2026), not the same figure twice
    if (o.nd != null && o.nd < 2) return null;
    o.window = winText(o);
    const long = (new Date(o.to) - new Date(o.from)) / 864e5 > 14;
    const load = view => async () => {
      const d = await rpcList('perf_my_days', o.from, o.to, w);
      return d == null ? NOTREADY : build(kind, d, o, view, w);
    };
    const views = [{ id: 'day', label: 'By day', load: load('day') }];
    if (long) views.push({ id: 'week', label: 'By week', load: load('week') });
    return { title: (o.title || k.t) + ' by day', sk: `${kind}-${o.src}-${o.free ? 'all' : 'paid'}-${(w.token || w.sid).slice(0, 8)}-${o.from}-${o.to}`, cur: 'AED', views };
  }

  // ── Reviews, posts and fixed lists ───────────────────────────
  function reviewRes(list, sub) {
    const rows = (list || []).map(r => ({ date: r.date, stars: r.url ? `<a class="dr-ext" href="${esc(r.url)}" target="_blank" rel="noopener" title="Open this review on Google">${'★'.repeat(r.stars || 0)}<span class="dr-ar" aria-hidden="true">&#8599;</span></a>` : '★'.repeat(r.stars || 0), who: esc(r.reviewer || 'Anonymous') + (r.how === 'client' ? ' <span class="dr-shared">from your client, who did not name anyone</span>' : ''),
      comment: r.comment ? esc(r.comment) : '<i>Rating only, no written comment</i>' }));
    const avg = (list || []).length ? nice(list.reduce((a, r) => a + A(r.stars), 0) / list.length) : null;
    return { cols: [{ k: 'date', l: 'Date', t: 'date' }, { k: 'stars', l: 'Stars', t: 'html', al: 'l' }, { k: 'who', l: 'Reviewer', t: 'html' }, { k: 'comment', l: 'Review', t: 'html' }],
      rows, foot: rows.length ? { date: 'Total', stars: avg == null ? '' : 'Average ' + avg.toFixed(1), who: rows.length + (rows.length === 1 ? ' review' : ' reviews'), comment: '' } : null, sub: esc(sub), empty: 'No Google reviews for you in these dates yet.' };
  }
  function reviews(o) {
    if (!(o.list || who(o))) return null;
    return { title: o.title || 'Your Google reviews', sk: `reviews-${o.from}-${o.to}`, views: [{ id: 'rv', label: 'Reviews', load: async () => {
      const list = o.list || await rpcList('perf_my_reviews', o.from, o.to, who(o));
      return list == null ? NOTREADY : reviewRes(list, o.sub || `The Google reviews that count for you, ${winText(o)}`);
    } }] };
  }
  function posts(o) {
    if (!(o.list || who(o))) return null;
    const TYPE = { VIDEO: 'Reel', CAROUSEL_ALBUM: 'Carousel', IMAGE: 'Post' };
    return { title: o.title || 'Your Instagram posts', sk: `posts-${o.from}-${o.to}`, views: [{ id: 'ig', label: 'Posts', load: async () => {
      const list = o.list || await rpcList('perf_my_socials', o.from, o.to, who(o));
      if (list == null) return NOTREADY;
      const rows = list.map(p => ({ date: p.date, kind: p.via === 'collab' ? 'Collab on a salon post' : (TYPE[p.type] || 'Post'), link: p.link ? `<a class="dr-ext" href="${esc(p.link)}" target="_blank" rel="noopener">View on Instagram<span class="dr-ar" aria-hidden="true">&#8599;</span></a>` : '' }));
      return { cols: [{ k: 'date', l: 'Date', t: 'date' }, { k: 'kind', l: 'What' }, { k: 'link', l: 'Link', t: 'html' }], rows, foot: rows.length ? { date: 'Total', kind: rows.length + (rows.length === 1 ? ' post' : ' posts'), link: '' } : null,
        sub: esc(o.sub || `Posts and Reels that tag the salon and you, ${winText(o)}`), empty: 'Nothing tagged in these dates yet.' };
    } }] };
  }
  // Social posts (workdays) (Kate, 11 Nov 2026: "not working (pop up)"). The figure is the days she worked (a branch sheet row with clients, or Phorest visits) on which she
  // had a post, a collab or a story mention. The days she worked come from her days, the posts and collabs from her posts, so those are listed with what she posted;
  // a story mention carries no date here, so the days that only had a story are one grey line that brings the list to the figure (o.total).
  function workdays(o) {
    if (!who(o)) return null;
    const TYPE = { VIDEO: 'Reel', CAROUSEL_ALBUM: 'Carousel', IMAGE: 'Post' };
    return { title: o.title || 'Social posts on your workdays', sk: `workdays-${o.from}-${o.to}`, views: [{ id: 'wd', label: 'Workdays', load: async () => {
      const w = who(o);
      const [days, list] = await Promise.all([rpcList('perf_my_days', o.from, o.to, w), o.list ? Promise.resolve(o.list) : rpcList('perf_my_socials', o.from, o.to, w)]);
      if (days == null || list == null) return NOTREADY;
      const worked = new Map();
      days.forEach(d => { if (A(d.clients) > 0 || A(d.visits) > 0) worked.set(d.date, d); });
      const by = new Map();
      list.forEach(p => { if (!by.has(p.date)) by.set(p.date, []); by.get(p.date).push(p); });
      const kind = ps => ps.map(p => p.via === 'collab' ? 'Collab on a salon post' : (TYPE[p.type] || 'Post')).join(', ');
      // A day she posted on but did not work is kept on the list in grey, so the gap to her feed posts can be seen; it is not counted.
      const all = [...by.keys()].sort().reverse().map(date => {
        const d = worked.get(date), what = kind(by.get(date));
        return d ? { w: dText(date), what, cl: A(d.clients), vi: A(d.visits) } : { w: dText(date), what: what + ' (day off, not counted)', cl: null, vi: null, _cls: 'dr-muted' };
      });
      const rows = all.slice(), counted = all.filter(r => !r._cls).length;
      const total = o.total != null ? A(o.total) : counted;
      if (total > counted) rows.push({ w: 'Story mentions only', what: (total - counted) + (total - counted === 1 ? ' day' : ' days') + ' with a story mention and no post, dates not listed', cl: null, vi: null, _cls: 'dr-muted' });
      return { cols: [{ k: 'w', l: 'Day' }, { k: 'what', l: 'What you posted' }, { k: 'cl', l: 'Clients (branch sheet)', t: 'num' }, { k: 'vi', l: 'Visits (Phorest)', t: 'num' }],
        rows, foot: rows.length ? { w: 'Total', what: total + (total === 1 ? ' workday' : ' workdays'), cl: null, vi: null } : null,
        sub: esc(o.sub || `The days you worked, ${dText(o.from)} to ${dText(o.to)}, on which you posted with @tararosesalon, were a collaborator on a salon post or mentioned the salon in your story. Posts on a day off do not count here, so this runs under your feed posts.`),
        empty: 'No workdays with a post in these dates yet.' };
    } }] };
  }
  // A list the page already holds: { title, sub, cols, rows, foot?, note?, cur? }.
  function rows(o) {
    return { title: o.title, sk: o.sk, cur: o.cur || 'AED', views: [{ id: 'r', label: o.label || 'List', load: async () => ({ cols: o.cols, rows: o.rows, foot: o.foot || null, sub: esc(o.sub || ''), note: o.note || '', empty: o.empty || 'Nothing here yet.' }) }] };
  }
  // Month text 'YYYY-MM' (or an ISO first of month) to its first and last day.
  function month(m) {
    const s = String(m).slice(0, 7), a = s + '-01', d = new Date(a + 'T00:00:00'), z = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { from: a, to: z };       // the whole month, as perf_dashboard reads it: a day reception has filled in ahead counts in the figure, so it is on the list
  }
  const week = start => ({ from: start, to: addDays(start, 6) });

  // ── The figure ───────────────────────────────────────────────
  function fig(html, spec, tip) {
    if (!st.on || !spec || html == null || html === '') return html;
    const id = 'm' + (++seq);
    if (REG.size > 4000) REG.clear();
    REG.set(id, spec);
    return `<span class="dn" role="button" tabindex="0" data-md="${id}" title="${esc(tip || 'See the rows behind this')}">${html}</span>`;
  }
  // Another window on a phone. The list is read here, in the tap's own page, and handed over through localStorage so the new window needs no sign-in of its own and survives a reload.
  function storeOk() { try { localStorage.setItem('mydrill:t', '1'); localStorage.removeItem('mydrill:t'); return true; } catch (e) { return false; } }
  function sweep() {
    try { const old = Date.now() - 36e5; Object.keys(localStorage).filter(k => k.indexOf('mydrill:') === 0).forEach(k => { try { const v = JSON.parse(localStorage.getItem(k)); if (!v || v.at < old) localStorage.removeItem(k); } catch (e) { localStorage.removeItem(k); } }); } catch (e) {}
  }
  function openWindow(sp, el) {
    if (!storeOk()) { TRSD.open(sp, el); return; }
    sweep();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const w = window.open('/performance/figure.html?h=' + id, '_blank');
    if (!w) { TRSD.open(sp, el); return; }                 // pop-ups blocked: it opens over this page instead
    (async () => {
      let out;
      try {
        const views = [];
        for (const v of sp.views) views.push({ label: v.label, res: await v.load() });
        out = { at: Date.now(), title: sp.title, cur: sp.cur || '', views, back: location.href };
      } catch (e) { out = { at: Date.now(), error: e && e.message || 'The list did not load.', back: location.href }; }
      try { localStorage.setItem('mydrill:' + id, JSON.stringify(out)); } catch (e) { try { w.close(); } catch (x) {} TRSD.open(sp, el); }
    })();
  }
  // In the dashboard's frame the list is read here and the dashboard opens it (a window inside a frame sized to its page would sit off screen).
  async function toParent(sp) {
    // Kate, 11 Nov 2026: "these underlined numbers are not clickable". A month figure's rows carry a figure of their own that opens that day (row._dn, with load functions),
    // and postMessage cannot send functions, so the click failed without a word. The frame is the dashboard's own page (same origin): hand the live list straight to the
    // dashboard's window, nothing is copied. The message below stays as the fallback, with the day links left out.
    try { if (parent.TRSD && typeof parent.TRSD.open === 'function') { parent.TRSD.open(sp); return; } } catch (e) {}
    let out;
    try {
      const views = [];
      for (const v of sp.views) views.push({ id: v.id, label: v.label, res: await v.load() });
      out = { title: sp.title, cur: sp.cur || '', sk: sp.sk || '', views };
    } catch (e) { out = { title: sp.title || 'Your numbers', cur: '', sk: '', views: [{ id: 'e', label: 'List', res: { cols: [], rows: [], empty: e && e.message || 'The list did not load.' } }] }; }
    parent.postMessage({ type: 'perf-drill', spec: JSON.parse(JSON.stringify(out, (k, v) => k === '_dn' ? undefined : v)) }, location.origin);
  }
  function show(sp, el) { if (!st.on || !sp) return; if (st.embed) toParent(sp); else if (PHONE() && !st.inline) openWindow(sp, el); else TRSD.open(sp, el); }
  function open(id, el) { show(REG.get(id), el); }
  document.addEventListener('click', e => { const n = e.target.closest && e.target.closest('[data-md]'); if (!n) return; e.stopPropagation(); e.preventDefault(); open(n.dataset.md, n); }, true);
  document.addEventListener('keydown', e => { const n = e.target.closest && e.target.closest('[data-md]'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(n.dataset.md, n); } });

  window.MyDrill = { init, fig, show, days, reviews, posts, workdays, rows, month, week, addDays, mondayOf, esc, dText, get on() { return st.on; } };
})();
