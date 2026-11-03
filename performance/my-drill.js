/* ============================================================
   My Numbers: every figure opens the rows behind it (Kate, 30 Oct 2026: "all values are supposed to be clickable").
   Built on the shared drill window (/drill.js, TRSD): the same list, filters, Save as xlsx / csv and Esc to close as the rest of the dashboard.
   Kate's display rule, decided when the figure is tapped, so turning a phone sideways does the right thing:
     laptop (wider than 619px, the width this page already calls a phone): a big pop-up over the page, X, Esc or a tap outside to close
     phone (619px or less): the list opens in another window (figure.html), always, and closing it closes that window
   The rows are HER OWN and nothing else. Days, weeks, reviews and posts come from three token-only functions
   (migrations/perf_my_drill.sql: perf_my_days, perf_my_reviews, perf_my_socials); the Podium board shows the names, salons and figures the
   board already shows. No ids, tokens, emails or client names. A figure with nothing behind it stays plain.

     MyDrill.init({ token })        turns it on for a token link (not in the dashboard frame)
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
  const st = { on: false, token: null };
  const REG = new Map();
  let seq = 0;
  const PHONE = () => matchMedia('(max-width:619px)').matches;

  function init(o) {
    let embed = false; try { embed = new URLSearchParams(location.search).get('embed') === '1'; } catch (e) {}
    st.token = o && o.token || null;
    st.on = !!st.token && !embed && typeof window.TRSD === 'object';
  }

  // ── Her days, read once per window ───────────────────────────
  const CACHE = new Map();
  async function rpcList(fn, from, to) {
    const key = fn + '|' + from + '|' + to;
    if (CACHE.has(key)) return CACHE.get(key);
    const p = (async () => {
      const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: await PerfAuth.headers(), body: JSON.stringify({ p_token: st.token, p_from: from, p_to: to }) });
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
    treat:    { t: 'Treatments', c: () => [['treat', 'Treatments', AED]], f: r => ({ treat: r.treat }), keep: r => r.treat > 0,
      s: () => 'Treatment sales from the branch sheet.' },
    treatpct: { t: 'Treatments %', c: () => [['treat', 'Treatments', AED], ['hs', 'Hair services', AED], ['p', 'Treatments %', PCT]], f: r => ({ treat: r.treat, hs: r.svc - r.treat, p: pc(r.treat, r.svc - r.treat) }), keep: r => r.treat > 0 || r.svc > 0,
      s: () => 'Treatments as a share of your hair services. The total row is the figure on your page.' },
    retail:   { t: 'Retail', c: () => [['retail', 'Retail', AED]], f: r => ({ retail: r.retail }), keep: r => r.retail > 0,
      s: () => 'Home care you sold before VAT, from Phorest.' },
    retailpct:{ t: 'Retail %', c: () => [['retail', 'Retail', AED], ['svc', 'Services', AED], ['p', 'Retail %', PCT]], f: r => ({ retail: r.retail, svc: r.svc, p: pc(r.retail, r.svc) }), keep: r => r.retail > 0 || r.svc > 0,
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
  const SUMF = ['svc', 'retail', 'visits', 'pvisits', 'rqs', 'pnew', 'rb_visits', 'rb_n', 'clients', 'req', 'salon', 'newc', 'ncr', 'lreb', 'treat', 'uh', 'ah'];
  const blank = () => Object.fromEntries(SUMF.map(k => [k, 0]));
  const add = (a, d) => { SUMF.forEach(k => { a[k] += A(d[k]); }); return a; };
  const nice = v => Math.round(v * 10) / 10;

  function build(kind, days, o, view) {
    const k = K[kind], src = o.src === 'phorest' ? 'phorest' : 'ledger';
    ALL = src === 'phorest' && !!o.free;
    const cols = [{ k: 'date', l: view === 'week' ? 'Week starting' : 'Date', t: 'date' }].concat(k.c(src).map(([key, l, t]) => ({ k: key, l, t })));
    const recs = view === 'week'
      ? [...days.reduce((m, d) => { const w = mondayOf(d.date); m.set(w, add(m.get(w) || blank(), d)); return m; }, new Map())].map(([date, r]) => Object.assign(r, { date }))
      : days.map(d => { const r = add(blank(), d); r.date = d.date; return r; });
    const rows = recs.filter(r => k.keep(r, src)).map(r => Object.assign({ date: r.date }, k.f(r, src)));
    const tot = recs.reduce((a, r) => add(a, r), blank());
    const foot = Object.assign({ date: 'Total' }, k.f(tot, src));
    return { cols, rows, foot, sub: `${esc(k.s(src))} ${esc(o.window || '')}`.trim(), empty: 'Nothing here for these dates yet.' };
  }
  const winText = o => o.from === o.to ? `${dText(o.from)}.` : `${dText(o.from)} to ${dText(o.to)}.`;
  function days(kind, o) {
    const k = K[kind]; if (!k) return null;
    o = Object.assign({ src: 'ledger' }, o);
    o.window = winText(o);
    const long = (new Date(o.to) - new Date(o.from)) / 864e5 > 14;
    const load = view => async () => {
      const d = await rpcList('perf_my_days', o.from, o.to);
      return d == null ? NOTREADY : build(kind, d, o, view);
    };
    const views = [{ id: 'day', label: 'By day', load: load('day') }];
    if (long) views.push({ id: 'week', label: 'By week', load: load('week') });
    return { title: (o.title || k.t) + ' by day', sk: `${kind}-${o.src}-${o.free ? 'all' : 'paid'}-${o.from}-${o.to}`, cur: 'AED', views };
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
    return { title: o.title || 'Your Google reviews', sk: `reviews-${o.from}-${o.to}`, views: [{ id: 'rv', label: 'Reviews', load: async () => {
      const list = o.list || await rpcList('perf_my_reviews', o.from, o.to);
      return list == null ? NOTREADY : reviewRes(list, o.sub || `The Google reviews that count for you, ${winText(o)}`);
    } }] };
  }
  function posts(o) {
    const TYPE = { VIDEO: 'Reel', CAROUSEL_ALBUM: 'Carousel', IMAGE: 'Post' };
    return { title: o.title || 'Your Instagram posts', sk: `posts-${o.from}-${o.to}`, views: [{ id: 'ig', label: 'Posts', load: async () => {
      const list = o.list || await rpcList('perf_my_socials', o.from, o.to);
      if (list == null) return NOTREADY;
      const rows = list.map(p => ({ date: p.date, kind: p.via === 'collab' ? 'Collab on a salon post' : (TYPE[p.type] || 'Post'), link: p.link ? `<a class="dr-ext" href="${esc(p.link)}" target="_blank" rel="noopener">View on Instagram<span class="dr-ar" aria-hidden="true">&#8599;</span></a>` : '' }));
      return { cols: [{ k: 'date', l: 'Date', t: 'date' }, { k: 'kind', l: 'What' }, { k: 'link', l: 'Link', t: 'html' }], rows, foot: rows.length ? { date: 'Total', kind: rows.length + (rows.length === 1 ? ' post' : ' posts'), link: '' } : null,
        sub: esc(o.sub || `Posts and Reels that tag the salon and you, ${winText(o)}`), empty: 'Nothing tagged in these dates yet.' };
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
  function show(sp, el) { if (!st.on || !sp) return; if (PHONE()) openWindow(sp, el); else TRSD.open(sp, el); }
  function open(id, el) { show(REG.get(id), el); }
  document.addEventListener('click', e => { const n = e.target.closest && e.target.closest('[data-md]'); if (!n) return; e.stopPropagation(); e.preventDefault(); open(n.dataset.md, n); }, true);
  document.addEventListener('keydown', e => { const n = e.target.closest && e.target.closest('[data-md]'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(n.dataset.md, n); } });

  window.MyDrill = { init, fig, show, days, reviews, posts, rows, month, week, addDays, mondayOf, esc, dText, get on() { return st.on; } };
})();
