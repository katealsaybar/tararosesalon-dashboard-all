// ── UNIVERSAL SEARCH ──────────────────────────────────────────
// Kate, 29 Sep 2026: "let's add a universal search bar tapos may mag pop up na
// suggestions", and it has to work as well on a phone. One search, four kinds of
// thing it can find:
//
//   Pages     every entry in the sidebar, read off the sidebar itself, so a page
//             added there is searchable with no change here
//   Team      the Staff Cards roster (stylistBranchGroups), current and former.
//             Enter opens her card; the row also offers her stats and her figures,
//             the same three jumps the name menu in staff-links.js makes
//   Branches  sets the Branch filter to that one branch
//   Periods   the named Period chips (This month, Last month, ...)
//   Services  the Service Rankings list, Top Clients and the top Products, read
//   Clients   in the background the first time search opens (same calls and the
//   Products  same Branch/Period window as those pages), so they are findable
//             without opening the page first
//   Content   text on every page: headings, sections, table rows, names. Picking
//             one opens that page and lands on it, lit for a moment
//
// Kate, 29 Sep 2026, third pass: "anything that is inside this site is searchable".
//
// Kate, 29 Sep 2026, second pass: "jumera" found nothing, because Jumera is on
// the Org Chart and not on Staff Cards. Everyone on ORG_CHART is in Team now, typos
// are forgiven (one letter off, two on a long word), Abu Dhabi / Dubai / Mamsha
// find their branches, and a search with no exact hit still offers the closest.
//
// Open with the bar in the masthead, or / or Ctrl+K from anywhere, including the
// Ledgers pages where the masthead buttons are hidden. Styles in search.css.
// Nothing here is load-order critical: the roster and filters are read when the
// panel opens, not when this file loads.

(function () {
  const RECENT_KEY = 'trs-search-recent';
  const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  // Words people type that are not in the page's own name.
  const PAGE_WORDS = {
    dashboard: 'home overview kpi sales revenue takings pulse summary',
    branchperf: 'branch staff table figures services retail',
    compare: 'compare versus vs side by side',
    team: 'podium race ranking leaderboard top performer',
    teamquad: 'rebook rebooking takings quadrant',
    staffperf: 'benchmarks money five kpi promotion',
    staffweeks: '13 week thirteen weekly report emma',
    stafflevels: 'levels promotion grade',
    stylists: 'cards photos instagram profiles',
    orgchart: 'org chart structure hierarchy',
    ledgerFinancials: 'financial totals ledger cash card payments',
    ledgerTargets: 'daily target sheet ledger',
    ledgerActuals: 'actuals targets pacing ledger',
    ledgerStylist: 'stylist target daily ledger',
    services: 'service rankings treatments top services',
    clients: 'top clients customers',
    products: 'products stock orders retail professional spend',
    reviews: 'google reviews ratings stars',
  };

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s)
    : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const title = s => String(s || '').toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());
  const isPhone = () => matchMedia('(max-width:760px)').matches;
  // Where each branch is, in the words people use for it.
  const BRANCH_WORDS = { SAA: 'abu dhabi ad mamsha saadiyat', KCA: 'abu dhabi ad khalifa kca',
    MC: 'dubai dxb motor', AQ: 'dubai dxb quoz' };

  // ── THE INDEX ──
  // Rebuilt on every open: cheap, and it picks up the roster once it has loaded
  // and the Admin group once sign-in has shown it.
  function buildIndex() {
    const items = [];

    document.querySelectorAll('#sidebar .nav-group').forEach(g => {
      if (g.style.display === 'none') return;
      const tEl = g.querySelector('.nav-title');
      const group = tEl ? title(tEl.firstChild ? tEl.firstChild.textContent : tEl.textContent).trim() : '';
      g.querySelectorAll('.nav-sub').forEach(n => {
        const on = n.getAttribute('onclick') || '';
        const m = on.match(/showView\('([^']+)'/);
        const view = m ? m[1] : '';
        const name = n.textContent.trim();
        if (!name) return;
        // Team Performance and Podium Race land on the same view; keep the page name.
        if (view && items.some(x => x.kind === 'page' && x.view === view && n.id === 'navTeamRace')) return;
        items.push({
          kind: 'page', id: 'page:' + name, view, t: name, s: group,
          words: (PAGE_WORDS[view] || '') + ' ' + group,
          go: () => n.click(),
        });
      });
    });

    if (typeof stylistBranchGroups === 'function') {
      stylistBranchGroups().forEach(grp => grp.list.forEach(p => {
        const key = typeof staffLinkKey === 'function' ? staffLinkKey(p.name) : p.name;
        const full = title(p.name) + (p.last ? ' ' + p.last : '');
        const dept = /Beauty|Nail/i.test(p.role || '') ? 'beauty' : 'hair';
        const branch = p.branch || '';
        const bName = (typeof BRANCH_INFO !== 'undefined' && BRANCH_INFO[branch]?.name) || '';
        const photo = p.photo ? 'assets/staff/' + p.photo : (p.photoFull || '');
        items.push({
          kind: 'staff', id: 'staff:' + key, t: full,
          s: [p.role, p.resigned ? 'Former' : bName].filter(Boolean).join(' · '),
          words: [p.role, bName, p.ig, p.resigned ? 'former resigned' : ''].join(' '),
          photo, resigned: !!p.resigned,
          go: () => whoGoCard(key),
          acts: [
            ['Card', () => whoGoCard(key)],
            ['Stats', () => whoGoStats(key, dept, branch)],
            ['Figures', () => whoGoRow(key, branch)],
            ['13 weeks', () => goWeeks(full)],
          ],
        });
      }));
    }

    // The Org Chart: management, the call centre, educators, coordinators, accounts.
    // A name already in Team from Staff Cards gets an Org chart button instead of a
    // second row.
    if (typeof ORG_CHART !== 'undefined') {
      const walk = (node, parent) => {
        if (node.role !== 'Department') {
          const same = items.find(x => x.kind === 'staff' && norm(x.t) === norm(node.name));
          const go = () => goOrg(node.name);
          if (same) same.acts.push(['Org chart', go]);
          else items.push({
            kind: 'staff', id: 'org:' + node.name, t: node.name, s: node.role || '',
            words: [node.role, parent && parent.role === 'Department' ? parent.name : '', 'org chart'].join(' '),
            photo: node.photo || '', go,
          });
        }
        (node.children || []).forEach(c => walk(c, node));
      };
      ORG_CHART.forEach(team => team.root && walk(team.root, null));
    }

    // Kate, 30 Sep 2026: "sunitha" found nothing, because she has no Staff Card and
    // is not on the Org Chart. Everyone on Phorest's staff list (STAFF_SURNAMES in
    // staff-profiles.js) is in Team now; without a card, Enter opens her row in
    // Branch Performance, and Stats / 13 weeks are still offered.
    // Already listed means: the same person under an alias (Lucia is Lucy, Mary Joy
    // is MJ), or a name with the same surname that shares a first name (Princess
    // Areanne is Areanne's card, and then Princess on her own is her too). Longer
    // names go first so that second step can see the first.
    if (typeof STAFF_SURNAMES !== 'undefined') {
      const seen = items.filter(x => x.kind === 'staff').map(x => {
        const w = norm(x.t).split(/\s+/);
        return { key: x.id.replace(/^(staff|org):/, ''), last: w[w.length - 1], words: w.slice(0, -1), item: x };
      });
      Object.keys(STAFF_SURNAMES).sort((a, b) => b.split(' ').length - a.split(' ').length).forEach(name => {
        const key = typeof staffLinkKey === 'function' ? staffLinkKey(name) : name;
        const last = norm(STAFF_SURNAMES[name]), words = norm(name).split(/\s+/);
        const dup = seen.find(x => x.key === key || (x.last === last && words.some(w => x.words.includes(w))));
        // The other spelling still finds her: "lucia" lands on Lucy's row.
        if (dup) { dup.item.words += ' ' + norm(name); seen.push({ key, last, words, item: dup.item }); return; }
        const full = title(name) + ' ' + STAFF_SURNAMES[name];
        const item = {
          kind: 'staff', id: 'staff:' + key, t: full, s: 'Team · no card yet',
          words: 'staff phorest', photo: '',
          go: () => whoGoRow(key),
          acts: [
            ['Figures', () => whoGoRow(key)],
            ['Stats', () => whoGoStats(key)],
            ['13 weeks', () => goWeeks(full)],
          ],
        };
        items.push(item);
        seen.push({ key, last, words, item });
      });
    }

    if (typeof ACTIVE_BRANCHES !== 'undefined') {
      ACTIVE_BRANCHES.forEach(code => {
        const b = BRANCH_INFO[code];
        items.push({
          kind: 'branch', id: 'branch:' + code, t: b.name, s: 'Show this branch only',
          words: code + ' branch salon ' + (BRANCH_WORDS[code] || ''), colour: b.colorLight || b.color,
          go: () => setBranch([code]),
        });
      });
      items.push({
        kind: 'branch', id: 'branch:all', t: 'All Branches', s: 'Clear the branch filter',
        words: 'all every branches reset', go: () => setBranch(['all']),
      });
    }

    if (typeof periodPresets === 'function') {
      periodPresets().forEach(p => items.push({
        kind: 'period', id: 'period:' + p.k, t: p.k, s: 'Set the period',
        words: 'period date range mtd month', go: () => setPeriod(p),
      }));
    }
    return items;
  }

  // Land on a person on the Org Chart. The chart scrolls sideways inside its own
  // box, so scrollIntoView rather than the window-only whoLand.
  function goOrg(name) {
    whoShowView('orgchart');
    whoWaitFor(() => [...document.querySelectorAll('#view-orgchart .oc-name')]
      .find(n => norm(n.textContent) === norm(name)), el => {
      const node = el.closest('.oc-node') || el;
      node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      flash(node);
    });
  }
  // Her 13-Week Report, by the same slug the page's own links use.
  function goWeeks(full) {
    if (typeof w13SlugOf !== 'function') return;
    w13Pick = null; w13Data = null;
    w13WantSlug = w13SlugOf(full);
    showView('staffweeks', document.querySelector(`#sidebar .nav-sub[onclick*="'staffweeks'"]`));
  }
  function flash(el) {
    el.classList.remove('who-flash');
    void el.offsetWidth;
    el.classList.add('who-flash');
    setTimeout(() => el.classList.remove('who-flash'), 2200);
  }

  // ── EVERYTHING ON THE PAGES ──
  // Every view's headings, section links, names and table rows, read live from the
  // page, hidden views included: whatever a page has drawn this session is
  // findable. A table row is known by its first cell with words in it (so Top
  // Clients' rank number is skipped for the name beside it).
  const HEADS = 'h2, h3, h4, .card-title, .side-nav a, .hero-contents a, .oc-name, .who';
  const hasWords = t => /[a-z]{2}/i.test(t);
  // A cell's own words first (Products' name, not the brand line under it), then
  // its first child with words in it.
  const leafText = el => {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (hasWords(own)) return own;
    const t = [...el.querySelectorAll('*')].find(c => !c.children.length && hasWords(c.textContent));
    return (t || el).textContent.replace(/\s+/g, ' ').trim();
  };
  function viewNames() {
    const m = {};
    document.querySelectorAll('#sidebar .nav-sub').forEach(n => {
      const v = ((n.getAttribute('onclick') || '').match(/showView\('([^']+)'/) || [])[1];
      if (v && !m[v]) m[v] = n.textContent.trim();
    });
    return m;
  }
  function contentItems() {
    const names = viewNames(), out = [], seen = new Set();
    ALL_VIEWS.forEach(view => {
      const root = document.getElementById('view-' + view);
      if (!root || !names[view]) return;
      const add = (el, text, row) => {
        // A section link ("Hair vs Beauty" in Organisation Pulse's contents) lands
        // on the section it points at, not on the link.
        const href = el.getAttribute && el.getAttribute('href');
        const anchor = href && href[0] === '#' && href.length > 1 ? href.slice(1) : '';
        if (!text || text.length > 80 || !hasWords(text)) return;
        const k = view + '|' + text.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        const snip = row ? row.textContent.replace(/\s+/g, ' ').replace(text, '').trim().slice(0, 60) : '';
        out.push({ kind: 'content', view, id: 'content:' + k, t: text,
          s: names[view] + (snip ? ' · ' + snip : ''), words: names[view],
          go: () => goText(view, text, null, anchor) });
      };
      root.querySelectorAll(HEADS).forEach(el => add(el, el.textContent.replace(/\s+/g, ' ').trim()));
      root.querySelectorAll('tbody tr').forEach(tr => {
        const cell = [...tr.cells].find(c => hasWords(c.textContent));
        if (cell) add(cell, leafText(cell), tr);
      });
    });
    return out;
  }

  // Open a page (if not already on it) and land on the first thing showing this text.
  function findText(view, text) {
    const want = norm(text);
    const root = document.getElementById('view-' + view);
    if (!root) return null;
    const own = el => norm(leafText(el)) === want || norm(el.textContent.replace(/\s+/g, ' ').trim()) === want;
    const all = [...root.querySelectorAll('h2, h3, h4, a, td, span, div, b')]
      .filter(el => own(el) && ![...el.children].some(c => norm(c.textContent.trim()) === want));
    const hit = all.find(el => el.offsetParent);
    if (hit) return hit.closest('tr') || hit;
    // Only in a folded section: open it, and the next tick finds it.
    all.forEach(el => {
      const sec = el.closest('[id^="sec-"]');
      const k = sec && sec.id.slice(4);
      if (k && typeof sectionState !== 'undefined' && !sectionState[k] && typeof toggleSection === 'function') toggleSection(k);
      const det = el.closest('details');
      if (det) det.open = true;
    });
    return null;
  }
  // Pages that fetch their rows can take a few seconds, so this waits up to 8s
  // (whoWaitFor gives up at 2.5s), then lands once.
  function goText(view, text, prep, anchor) {
    if (prep) prep(CURRENT_VIEW === view);
    whoShowView(view);
    // Organisation Pulse keeps its sections behind the cover until it is opened.
    if (view === 'dashboard' && !document.body.classList.contains('revealed')) {
      document.body.classList.add('revealed');
      const btn = document.getElementById('revealBtn');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      if (typeof sizeTopbar === 'function') sizeTopbar();
    }
    const t0 = Date.now();
    (function tick() {
      const el = (anchor && document.getElementById(anchor)) || findText(view, text);
      if (el) { whoLand(el); flash(el); return; }
      if (Date.now() - t0 > 8000) {
        whoNote(`“${text}” isn't on ${viewNames()[view] || 'that page'} for the branch and period picked.`);
        return;
      }
      setTimeout(tick, 120);
    })();
  }
  // Service Rankings shows each branch's top 10 by default. A service further down
  // switches it to the combined list and opens enough rows to include it.
  function goService(name, rank) {
    // Set before the page opens, so its own first load is already the right one;
    // when it is already open, reload it.
    goText('services', name, already => {
      const rows = document.getElementById('svc-rows');
      let changed = svcViewMode !== 'combined';
      if (rows) {
        const opts = [...rows.options].map(o => +o.value);
        const need = opts.find(v => v >= rank) || opts[opts.length - 1];
        if (+rows.value < need) { rows.value = String(need); changed = true; }
      }
      if (already && changed) setSvcViewMode('combined');
      else {
        svcViewMode = 'combined';
        document.getElementById('svc-toggle-branch')?.classList.remove('active');
        document.getElementById('svc-toggle-combined')?.classList.add('active');
      }
    });
  }

  // ── DATA THE PAGES SHOW ──
  // Services, clients and products, fetched once per Branch/Period window with the
  // same calls those pages make, so a name is findable before its page is opened.
  let dataItems = [], dataKey = '', dataBusy = false;
  function loadData() {
    if (typeof sb === 'undefined' || typeof _svcWindow !== 'function') return;
    const w = _svcWindow();
    const key = [w.year, w.from, w.to, w.branches.join(',')].join('|');
    if (key === dataKey || dataBusy) return;
    dataBusy = true;
    const aed = v => 'AED ' + Math.round(Number(v) || 0).toLocaleString('en-GB');
    const jobs = [
      sb.rpc('get_top_services', { p_year: w.year, p_branches: w.branches, p_from: w.from, p_to: w.to, p_limit: 100 })
        .then(({ data }) => (data || []).filter(r => r.service_name).map((r, i) => ({
          kind: 'service', id: 'service:' + r.service_name, t: r.service_name,
          s: `Service Rankings · #${i + 1} · ${aed(r.total_revenue)}`, words: 'service treatment',
          go: () => goService(r.service_name, i + 1) }))),
      sb.rpc('get_top_clients', { p_year: w.year, p_branches: w.branches, p_from: w.from, p_to: w.to, p_limit: 25 })
        .then(({ data }) => (data || []).filter(r => r.client_name).map((r, i) => ({
          kind: 'client', id: 'client:' + r.client_name, t: r.client_name,
          s: `Top Clients · #${i + 1} · ${aed(r.total_revenue)}${r.top_service ? ' · ' + r.top_service : ''}`, words: 'client',
          go: () => goText('clients', r.client_name) }))),
    ];
    if (typeof prdWindow === 'function') {
      const pw = prdWindow();
      jobs.push(sb.rpc('get_product_spend', { p_branches: pw.branches, p_from: pw.from, p_to: pw.to })
        .then(({ data }) => ((data && data.products) || []).map(p => ({
          kind: 'product', id: 'product:' + p.product, t: p.product,
          s: ['Products', p.brand, p.type, aed(p.spend)].filter(Boolean).join(' · '), words: 'product stock ' + (p.brand || ''),
          go: () => goText('products', p.product) }))));
    }
    Promise.all(jobs.map(j => j.then(x => x, () => []))).then(lists => {
      dataItems = lists.flat();
      dataKey = key;
      dataBusy = false;
      if (panel && !panel.hidden && input.value.trim()) render();
    });
  }

  // Filters apply to the numbered pages only; from anywhere else, land on
  // Organisation Pulse so the change is visible.
  function toFilteredView() {
    if (typeof FILTERED_VIEWS !== 'undefined' && FILTERED_VIEWS.has(CURRENT_VIEW)) return;
    showView('dashboard', document.querySelector(`#sidebar .nav-sub[onclick*="'dashboard'"]`));
  }
  function setBranch(list) {
    toFilteredView();
    sel.branch = list;
    pendingSel.branch = [...list];
    paintFilterChips();
    refreshActiveView();
  }
  function setPeriod(p) {
    toFilteredView();
    if (typeof LEDGER_VIEWS !== 'undefined' && LEDGER_VIEWS.has(CURRENT_VIEW)) {
      showView('dashboard', document.querySelector(`#sidebar .nav-sub[onclick*="'dashboard'"]`));
    }
    periodPick = null;
    dateFrom = p.from; dateTo = p.to;
    paintFilterChips();
    refreshActiveView();
  }

  // ── MATCHING ──
  // Name matches beat keyword matches; a word that starts with what you typed beats
  // one that merely contains it; initials ("dts" → Daily Target Sheet) are the last
  // resort. Every typed word has to land somewhere.
  function score(item, q, loose) {
    const t = norm(item.t), w = norm(item.words), s = norm(item.s);
    const tw = t.split(/[\s·,-]+/).filter(Boolean), ww = w.split(/\s+/).filter(Boolean);
    let total = 0;
    for (const part of q.split(/\s+/).filter(Boolean)) {
      let best = 0;
      if (t === part) best = 100;
      else if (t.startsWith(part)) best = 80;
      else if (tw.some(x => x.startsWith(part))) best = 65;
      else if (t.includes(part)) best = 45;
      else if (ww.some(x => x.startsWith(part))) best = 30;
      else if (s.includes(part)) best = 20;
      else if (part.length >= 2 && initials(t).startsWith(part)) best = 25;
      // Typos: "jumeira" for Jumera, "saadyat" for Saadiyat, "kaet" for Kate.
      else if (part.length >= 3 && tw.some(x => near(part, x))) best = 35;
      else if (loose && part.length >= 3 && ww.some(x => near(part, x))) best = 15;
      if (!best) return 0;
      total += best;
    }
    if (item.resigned) total -= 5;
    // Text on the page you are looking at outranks the same text elsewhere.
    if (item.kind === 'content' && item.view === CURRENT_VIEW) total += 10;
    return total;
  }
  // Is the typed word within reach of this word (or of its start, while typing)?
  // One slip allowed, two once the word is seven letters or more.
  function near(a, b) {
    const room = a.length >= 7 ? 2 : 1;
    const cands = [b, b.slice(0, a.length), b.slice(0, a.length + 1)];
    return cands.some(c => c.length >= 3 && Math.abs(c.length - a.length) <= room && dist(a, c) <= room);
  }
  // Edit distance, with a swap of two neighbours counted as one slip.
  function dist(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) d[i] = [i];
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  const initials = t => t.split(/[\s·-]+/).map(x => x[0] || '').join('');

  function highlight(text, q) {
    const parts = q.split(/\s+/).filter(Boolean);
    if (!parts.length) return esc(text);
    const n = norm(text);
    const marks = new Array(text.length).fill(false);
    parts.forEach(p => {
      let i = n.indexOf(p);
      if (i < 0) return;
      // Prefer a word start when there is one.
      const re = new RegExp('(^|[\\s·-])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const m = n.match(re);
      if (m) i = m.index + m[1].length;
      for (let k = i; k < i + p.length && k < text.length; k++) marks[k] = true;
    });
    let out = '', open = false;
    for (let k = 0; k < text.length; k++) {
      if (marks[k] && !open) { out += '<mark>'; open = true; }
      if (!marks[k] && open) { out += '</mark>'; open = false; }
      out += esc(text[k]);
    }
    return out + (open ? '</mark>' : '');
  }

  // ── RECENT ──
  function recentIds() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function remember(id) {
    try {
      const list = [id, ...recentIds().filter(x => x !== id)].slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) { /* private window: search still works, it just forgets */ }
  }

  // ── THE PANEL ──
  let trig, scrim, panel, input, list, index = [], shown = [], cur = 0, lastFocus = null;

  function mount() {
    const acts = document.querySelector('.mast-acts');
    if (acts && !document.getElementById('gsTrig')) {
      trig = document.createElement('button');
      trig.type = 'button';
      trig.id = 'gsTrig';
      trig.className = 'gs-trig';
      trig.setAttribute('aria-label', 'Search the dashboard');
      trig.setAttribute('aria-haspopup', 'dialog');
      trig.innerHTML = ICON + '<span class="gs-trig-t">Search names, pages, clients</span><kbd>/</kbd>';
      trig.addEventListener('click', open);
      // On a phone it sits beside the menu button; on desktop it leads the row.
      acts.insertBefore(trig, acts.firstChild);
    }

    scrim = document.createElement('div');
    scrim.className = 'gs-scrim';
    scrim.hidden = true;
    scrim.addEventListener('click', close);

    panel = document.createElement('div');
    panel.className = 'gs-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Search');
    panel.innerHTML = `
      <div class="gs-head">${ICON}
        <input class="gs-in" id="gsIn" type="search" autocomplete="off" autocapitalize="off" spellcheck="false"
          enterkeyhint="go" placeholder="A name, page, branch, client, service…" role="combobox"
          aria-expanded="true" aria-controls="gsList" aria-autocomplete="list">
        <button type="button" class="gs-x gs-clear" aria-label="Clear" hidden>&times;</button>
        <button type="button" class="gs-x gs-cancel">Cancel</button>
      </div>
      <div class="gs-list" id="gsList" role="listbox"></div>
      <div class="gs-foot"><span><kbd>↑↓</kbd>move</span><span><kbd>Enter</kbd>open</span><span><kbd>Esc</kbd>close</span></div>`;
    document.body.append(scrim, panel);

    input = panel.querySelector('.gs-in');
    list = panel.querySelector('.gs-list');
    const clear = panel.querySelector('.gs-clear');
    input.addEventListener('input', () => { clear.hidden = !input.value; render(); });
    clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; render(); input.focus(); });
    panel.querySelector('.gs-cancel').addEventListener('click', close);
    input.addEventListener('keydown', onKey);

    list.addEventListener('click', e => {
      const act = e.target.closest('.gs-act');
      const row = e.target.closest('.gs-row');
      if (!row) return;
      const item = shown[+row.dataset.i];
      if (!item) return;
      if (act) choose(item, item.acts[+act.dataset.a][1]);
      else choose(item, item.go);
    });
    list.addEventListener('mousemove', e => {
      const row = e.target.closest('.gs-row');
      if (row && +row.dataset.i !== cur) { cur = +row.dataset.i; paintCursor(); }
    });

    addEventListener('resize', () => { if (!panel.hidden) place(); });
  }

  function open() {
    if (!panel) return;
    // Not over the sign-in screen: the / would otherwise land in the email field.
    const gate = document.getElementById('loginGate');
    if (gate && gate.style.display !== 'none') return;
    lastFocus = document.activeElement;
    index = buildIndex();
    loadData();
    input.value = '';
    panel.querySelector('.gs-clear').hidden = true;
    scrim.hidden = false;
    panel.hidden = false;
    document.body.classList.add('gs-open');
    place();
    render();
    input.focus();
  }

  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    scrim.hidden = true;
    document.body.classList.remove('gs-open');
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  // Desktop: over the bar when it is on screen, its right edge held so it grows
  // leftwards into the masthead. Otherwise (Ledgers pages, bar hidden) top centre.
  // The phone sheet is all CSS.
  function place() {
    panel.style.left = panel.style.top = panel.style.right = '';
    if (isPhone()) return;
    const w = Math.min(440, innerWidth - 32);
    const r = trig && trig.offsetParent ? trig.getBoundingClientRect() : null;
    if (r && r.width) {
      panel.style.left = Math.max(16, Math.min(r.right - w, innerWidth - w - 16)) + 'px';
      panel.style.top = Math.max(8, r.top - 1) + 'px';
    } else {
      panel.style.left = Math.round((innerWidth - w) / 2) + 'px';
      panel.style.top = '72px';
    }
  }

  const GROUPS = [['page', 'Pages', 6], ['staff', 'Team', 6], ['branch', 'Branches', 5], ['period', 'Period', 3],
    ['service', 'Services', 5], ['client', 'Clients', 5], ['product', 'Products', 5], ['content', 'On the pages', 6]];

  function render() {
    const q = norm(input.value.trim());
    let blocks = [];
    if (!q) {
      // Nothing typed: what you opened last, then the pages people use most.
      const byId = new Map(index.map(x => [x.id, x]));
      const recent = recentIds().map(id => byId.get(id)).filter(Boolean);
      if (recent.length) blocks.push(['Recent', recent]);
      const quick = ['dashboard', 'branchperf', 'team', 'ledgerTargets', 'stylists']
        .map(v => index.find(x => x.kind === 'page' && x.view === v))
        .filter(x => x && !recent.includes(x));
      blocks.push(['Jump to', quick]);
    } else {
      // Page text that just repeats a service, client or product row is left to that row.
      const dataNames = new Set(dataItems.map(x => norm(x.t)));
      const pool = index.concat(dataItems, contentItems().filter(x => !dataNames.has(norm(x.t))));
      let scored = pool.map(x => [x, score(x, q)]).filter(([, s]) => s > 0);
      // Nothing close: loosen up and offer the nearest, rather than a dead end.
      if (!scored.length) scored = pool.map(x => [x, score(x, q, true)]).filter(([, s]) => s > 0);
      GROUPS.forEach(([kind, label, max]) => {
        const hits = scored.filter(([x]) => x.kind === kind).sort((a, b) => b[1] - a[1]).slice(0, max).map(([x]) => x);
        if (hits.length) blocks.push([label, hits, Math.max(...scored.filter(([x]) => x.kind === kind).map(([, s]) => s))]);
      });
      // The group holding the best match goes first, so Enter takes you there.
      blocks.sort((a, b) => b[2] - a[2]);
    }

    shown = [];
    let html = '';
    blocks.forEach(([label, items]) => {
      html += `<div class="gs-grp" role="presentation">${esc(label)}</div>`;
      items.forEach(item => {
        const i = shown.push(item) - 1;
        html += rowHtml(item, i, q);
      });
    });
    if (!shown.length) {
      // Still somewhere to go: the main pages under the message.
      html = `<div class="gs-empty">Nothing matches “${esc(input.value.trim())}”. Search covers every page, the team and the org chart, branches, periods, services, clients and products.</div>`;
      const quick = ['dashboard', 'branchperf', 'team', 'stylists', 'orgchart']
        .map(v => index.find(x => x.kind === 'page' && x.view === v)).filter(Boolean);
      if (quick.length) html += '<div class="gs-grp" role="presentation">Jump to</div>'
        + quick.map(item => rowHtml(item, shown.push(item) - 1, '')).join('');
    }
    list.innerHTML = html;
    cur = 0;
    paintCursor();
  }

  function rowHtml(item, i, q) {
    let ico;
    if (item.kind === 'staff') {
      const init = esc(item.t.split(' ').map(x => x[0]).slice(0, 2).join(''));
      ico = item.photo
        ? `<span class="gs-ico"><img src="${esc(item.photo)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${init}'))"></span>`
        : `<span class="gs-ico">${init}</span>`;
    } else if (item.kind === 'branch') {
      ico = `<span class="gs-ico"><i style="background:${esc(item.colour || 'var(--muted)')}"></i></span>`;
    } else if (item.kind === 'content' || item.kind === 'service' || item.kind === 'client' || item.kind === 'product') {
      ico = `<span class="gs-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>`;
    } else if (item.kind === 'period') {
      ico = `<span class="gs-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></span>`;
    } else {
      ico = `<span class="gs-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16v16H4zM4 9h16M9 9v11"/></svg></span>`;
    }
    const acts = item.acts
      ? `<span class="gs-acts">${item.acts.map(([l], a) => `<button type="button" class="gs-act" data-a="${a}" tabindex="-1">${l}</button>`).join('')}</span>`
      : '<span class="gs-go" aria-hidden="true">↵</span>';
    return `<div class="gs-row" role="option" id="gsOpt${i}" data-i="${i}">${ico}
      <span class="gs-txt"><span class="gs-t">${highlight(item.t, q)}</span>${item.s ? `<span class="gs-s">${esc(item.s)}</span>` : ''}</span>${acts}</div>`;
  }

  function paintCursor() {
    list.querySelectorAll('.gs-row').forEach(r => {
      const on = +r.dataset.i === cur;
      r.classList.toggle('on', on);
      r.setAttribute('aria-selected', on);
      if (on && !isPhone()) r.scrollIntoView({ block: 'nearest' });
    });
    input.setAttribute('aria-activedescendant', shown.length ? 'gsOpt' + cur : '');
  }

  function onKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      paintCursor();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = shown[cur];
      if (item) choose(item, item.go);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function choose(item, fn) {
    remember(item.id);
    close();
    // Close the phone drawer if it is open, so you see where you landed.
    if (typeof toggleNav === 'function' && document.body.classList.contains('nav-open') && isPhone()) toggleNav(false);
    fn();
  }

  // / or Ctrl+K from anywhere, unless you are typing in a field already.
  document.addEventListener('keydown', e => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      panel && !panel.hidden ? close() : open();
    } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      open();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
