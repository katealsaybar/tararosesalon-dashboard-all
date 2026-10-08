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
// Kate, 8 Oct 2026: it reads questions, searches the text of every page (search-index.js,
// built by scripts/build-search-index.py: rebuild it and bump search.js's stamp after
// any change to page wording), and the results page carries a guide to refining.
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
  const PLACEHOLDER = 'Find anything, or ask a question';
  const SELF = document.currentScript ? document.currentScript.src : '';
  const ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  // Words people type that are not in the page's own name.
  const PAGE_WORDS = {
    dashboard: 'home overview kpi sales revenue takings pulse summary',
    branchperf: 'branch staff table figures services retail',
    compare: 'compare versus vs side by side',
    team: 'podium race ranking leaderboard top performer',
    teamquad: 'staff quadrant treatment retail rebook rebooking takings',
    staffperf: 'benchmarks money five kpi promotion rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail',
    staffweeks: 'staff quarterly performance quarter q1 q2 q3 q4 13 week thirteen weekly report emma rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail',
    stafflevels: 'levels promotion grade stylist benchmarks rebooking retention conversion request rate column fill colour client numbers new client requests reputation treatment retail',
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

  // Kate, 8 Oct 2026: a metric is a result in its own right, with its meaning, whether or
  // not Staff Dashboards has been opened this session. Same words as the hover tips in
  // performance/performance.js (TIPS); change one, change the other.
  const GLOSSARY = [
    ['Total revenue', 'Your service sales this month from Phorest, before VAT. Retail is not included.'],
    ['Hair services', 'Your service sales minus treatments, before VAT.'],
    ['Treatments', 'Treatment sales on your clients this month, from the branch ledger, before VAT.'],
    ['Treatments %', 'Treatments as a share of your hair services: treatments ÷ hair services × 100.'],
    ['Retail', 'Products you sold this month, from Phorest, before VAT.'],
    ['Retail %', 'Retail as a share of your service sales: retail ÷ total revenue × 100.'],
    ['Average bill', 'Your service sales divided by your client numbers.'],
    ['Rebooking %', 'The share of your clients who booked their next visit before they left.'],
    ['Retention %', 'Of the returning clients you saw 3 to 6 months ago, the share you have seen again in the last 3 months.'],
    ['Client numbers', 'The clients you saw this month, from the branch ledger.'],
    ['New client requests', 'New clients who asked for you by name, usually through a referral or your socials.'],
    ['Request rate %', 'Clients who asked for you (request clients plus new client requests) as a share of your client numbers.'],
    ['Conversion %', 'Of the brand new clients whose first visit was with you 3 to 6 months ago, the share who came back within 12 weeks.'],
    ['Column fill %', 'Your booked hours as a share of your available hours, from Phorest.'],
    ['Colour %', 'The share of your client visits this month that included a colour service.'],
    ['Reputation score', 'Average star rating of the Google reviews that name you or come from your clients, over the last 90 days. Counts once you have at least 3.'],
    ['Google reviews', 'Google reviews this month that name you.'],
  ];

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
          kind: 'page', id: 'page:' + name, view, t: name, g: group || 'Page', s: '',
          words: (PAGE_WORDS[view] || '') + ' ' + group,
          go: () => n.click(),
        });
      });
    });

    if (typeof stylistBranchGroups === 'function') {
      stylistBranchGroups().forEach(grp => grp.list.forEach(p => {
        if (p.alsoAtCopy) return;   // one row per person, home branch first
        const key = typeof staffLinkKey === 'function' ? staffLinkKey(p.name) : p.name;
        const full = title(p.name) + (p.last ? ' ' + p.last : '');
        const dept = /Beauty|Nail/i.test(p.role || '') ? 'beauty' : 'hair';
        const branch = p.branch || '';
        const bName = [branch, ...(p.alsoAt || [])]
          .map(c => (typeof BRANCH_INFO !== 'undefined' && BRANCH_INFO[c]?.name) || '')
          .filter(Boolean).join(' · ');
        const photo = p.photo ? 'assets/staff/' + p.photo : (p.photoFull || '');
        items.push({
          kind: 'staff', id: 'staff:' + key, t: full, g: 'Team',
          s: [p.title || p.role, p.resigned ? 'Former' : bName].filter(Boolean).join(' · '),
          words: [p.role, p.title, bName, p.ig, p.resigned ? 'former resigned' : ''].join(' '),
          photo, resigned: !!p.resigned,
          go: () => whoGoCard(key),
          acts: [
            ['Card', () => whoGoCard(key)],
            ['Stats', () => whoGoStats(key, dept, branch)],
            ['Figures', () => whoGoRow(key, branch)],
            ['13 week report', () => goWeeks(full)],
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
            kind: 'staff', id: 'org:' + node.name, t: node.name, g: 'Team', s: node.role || '',
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
          kind: 'staff', id: 'staff:' + key, t: full, g: 'Team', s: 'No card yet',
          words: 'staff phorest', photo: '',
          go: () => whoGoRow(key),
          acts: [
            ['Figures', () => whoGoRow(key)],
            ['Stats', () => whoGoStats(key)],
            ['13 week report', () => goWeeks(full)],
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
          kind: 'branch', id: 'branch:' + code, t: b.name, g: 'Branch', s: 'Show this branch only',
          words: code + ' branch salon ' + (BRANCH_WORDS[code] || ''), colour: b.colorLight || b.color,
          go: () => setBranch([code]),
        });
      });
      items.push({
        kind: 'branch', id: 'branch:all', t: 'UAE Branches', g: 'Branch', s: 'Clear the branch filter',
        words: 'all every branches reset', go: () => setBranch(['all']),
      });
    }

    GLOSSARY.forEach(([label, def]) => items.push({
      kind: 'metric', id: 'metric:' + label, t: label, g: 'Metric · Staff Dashboards', s: def,
      words: 'metric kpi measure benchmark', view: 'staffperf',
      go: () => goText('staffperf', label),
    }));

    // Team Home's own sections, so "where is the induction" has an answer.
    ftKb.forEach(([t, blurb, dept, href]) => items.push({
      kind: 'kb', id: 'kbs:' + href, t, g: 'Team Home · ' + dept, s: blurb, href,
      words: dept + ' team home', go: () => { location.href = href; },
    }));

    if (typeof periodPresets === 'function') {
      periodPresets().forEach(p => items.push({
        kind: 'period', id: 'period:' + p.k, t: p.k, g: 'Period', s: 'Set the period',
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
    // A frame does not have the dashboard's stylesheet: give it the same glow.
    const d = el.ownerDocument;
    if (d !== document && !d.getElementById('gsFlashCss')) {
      const st = d.createElement('style');
      st.id = 'gsFlashCss';
      st.textContent = '.who-flash{animation:gsFlash 2.2s ease both}@keyframes gsFlash{0%,35%{box-shadow:0 0 0 3px var(--accent,#2dd4bf)}100%{box-shadow:0 0 0 0 transparent}}';
      d.head.appendChild(st);
    }
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
  // Kate, 8 Oct 2026: "conversion" found nothing while Conversion % sat on screen.
  // Metric names are column headings and KPI labels, which are not headings, and the
  // Staff Dashboards page is a frame, which the page-level search never looked inside.
  // These are read with leafText, so a label's hover tip is not part of its name.
  const LABELS = 'th, label, .kpi-lbl, .metric-label, .r-label, .section-label, .ht-lbl, .bar-lbl';
  const SCAN = 'h2, h3, h4, a, td, th, span, div, b, label';
  const hasWords = t => /[a-z]{2}/i.test(t);
  // A cell's own words first (Products' name, not the brand line under it), then
  // its first child with words in it.
  const leafText = el => {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (hasWords(own)) return own;
    const t = [...el.querySelectorAll('*')].find(c => !c.children.length && hasWords(c.textContent));
    return (t || el).textContent.replace(/\s+/g, ' ').trim();
  };
  // A page's own document, plus any same-origin frame on it (Staff Dashboards,
  // Google Reviews, Wellness Voucher). A frame from another site, or one not loaded
  // yet, is skipped: reading it throws, and there is nothing to read.
  function viewRoots(view) {
    const root = document.getElementById('view-' + view);
    if (!root) return [];
    const out = [{ root, frame: null }];
    root.querySelectorAll('iframe').forEach(f => {
      try {
        const d = f.contentDocument;
        if (d && d.body && d.body.children.length) out.push({ root: d.body, frame: f });
      } catch (e) { /* another origin */ }
    });
    return out;
  }
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
      if (!names[view]) return;
      viewRoots(view).forEach(({ root, frame }) => {
        const add = (el, text, row) => {
          // A section link ("Hair vs Beauty" in Organisation Pulse's contents) lands
          // on the section it points at, not on the link.
          const href = el.getAttribute && el.getAttribute('href');
          const anchor = !frame && href && href[0] === '#' && href.length > 1 ? href.slice(1) : '';
          if (!text || text.length > 80 || !hasWords(text)) return;
          const k = view + '|' + text.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k);
          let snip = '';
          if (row) {
            const val = row.querySelector && row.querySelector('.r-val');
            snip = (val || row).textContent.replace(/\s+/g, ' ').replace(text, '').trim().slice(0, 60);
          }
          out.push({ kind: 'content', view, id: 'content:' + k, t: text,
            g: 'On ' + names[view], s: snip, words: names[view],
            go: () => goText(view, text, null, anchor) });
        };
        root.querySelectorAll(HEADS).forEach(el => add(el, el.textContent.replace(/\s+/g, ' ').trim()));
        root.querySelectorAll(LABELS).forEach(el => add(el, leafText(el), el.closest('.row')));
        root.querySelectorAll('tbody tr').forEach(tr => {
          const cell = [...tr.cells].find(c => hasWords(c.textContent));
          if (cell) add(cell, leafText(cell), tr);
        });
      });
    });
    return out;
  }

  // Open a page (if not already on it) and land on the first thing showing this text,
  // on the page itself or inside its frame.
  function findText(view, text) {
    const want = norm(text);
    const roots = viewRoots(view);
    if (!roots.length) return null;
    const own = el => norm(leafText(el)) === want || norm(el.textContent.replace(/\s+/g, ' ').trim()) === want;
    const all = [];
    roots.forEach(({ root, frame }) => root.querySelectorAll(SCAN).forEach(el => {
      if (own(el) && ![...el.children].some(c => norm(c.textContent.trim()) === want)) all.push([el, frame]);
    }));
    const hit = all.find(([el]) => el.offsetParent);
    // A KPI row in a frame is lit as a whole row, like a table row.
    if (hit) return hit[1] ? (hit[0].closest('tr, .row') || hit[0]) : (hit[0].closest('tr') || hit[0]);
    // Only in a folded section: open it, and the next tick finds it.
    all.forEach(([el]) => {
      const sec = el.closest('[id^="sec-"]');
      const k = sec && sec.id.slice(4);
      if (k && typeof sectionState !== 'undefined' && !sectionState[k] && typeof toggleSection === 'function') toggleSection(k);
      const det = el.closest('details');
      if (det) det.open = true;
    });
    return null;
  }
  // Scroll the dashboard's own page so the thing is under the masthead, whether it is
  // on the page or inside a frame (the frame is sized to its content, so the dashboard
  // page is the only scrollbar), and light it.
  function landOn(el) {
    const f = el.ownerDocument !== document && el.ownerDocument.defaultView && el.ownerDocument.defaultView.frameElement;
    if (!f) { whoLand(el); flash(el); return; }
    const masthead = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-cond-h')) || 104;
    const bar = document.querySelector('.sc-bar, .tp-bar');
    const top = f.getBoundingClientRect().top + scrollY + el.getBoundingClientRect().top
      - masthead - (bar && bar.offsetParent ? bar.offsetHeight : 0) - 16;
    scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    flash(el);
  }
  // A line from the page index may have values where the page's own code fills them in
  // (marked with a gap), so it is found by its pieces: the smallest visible thing on the
  // page whose text holds every piece.
  function findLoose(view, text) {
    const pieces = norm(text).split('…').map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length >= 4);
    if (!pieces.length) return null;
    let best = null, bestLen = Infinity;
    viewRoots(view).forEach(({ root, frame }) => root.querySelectorAll(SCAN + ', p, li, small, em, strong, summary, button, dd').forEach(el => {
      const raw = el.textContent;
      if (raw.length > 900 || raw.length >= bestLen) return;
      const t = norm(raw).replace(/\s+/g, ' ');
      if (pieces.every(p => t.includes(p)) && el.offsetParent !== null) { best = [el, frame]; bestLen = raw.length; }
    }));
    if (!best) return null;
    return best[1] ? (best[0].closest('tr, .row') || best[0]) : (best[0].closest('tr') || best[0]);
  }
  // Pages that fetch their rows can take a few seconds, so this waits up to 8s
  // (whoWaitFor gives up at 2.5s), then lands once. alts: other things to land on when
  // the text itself is not drawn (the heading of its section).
  function goText(view, text, prep, anchor, alts) {
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
    const look = t => findText(view, t) || findLoose(view, t);
    (function tick() {
      const el = (anchor && document.getElementById(anchor)) || look(text);
      if (el) { landOn(el); return; }
      // The line itself is slow or not drawn: its section's heading is the next best place.
      if (alts && alts.length && Date.now() - t0 > 2500) {
        const alt = alts.map(look).find(Boolean);
        if (alt) { landOn(alt); return; }
      }
      if (Date.now() - t0 > 8000) {
        whoNote(alts
          ? `Opened ${viewNames()[view] || 'the page'}, but that line is not showing for the branch and period picked.`
          : `“${text}” isn't on ${viewNames()[view] || 'that page'} for the branch and period picked.`);
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
          g: 'Service Rankings', s: `#${i + 1} · ${aed(r.total_revenue)}`, words: 'service treatment',
          go: () => goService(r.service_name, i + 1) }))),
      sb.rpc('get_top_clients', { p_year: w.year, p_branches: w.branches, p_from: w.from, p_to: w.to, p_limit: 25 })
        .then(({ data }) => (data || []).filter(r => r.client_name).map((r, i) => ({
          kind: 'client', id: 'client:' + r.client_name, t: r.client_name,
          g: 'Top Clients', s: `#${i + 1} · ${aed(r.total_revenue)}${r.top_service ? ' · ' + r.top_service : ''}`, words: 'client',
          go: () => goText('clients', r.client_name, () => { if (typeof tcSearchFor === 'function') tcSearchFor(r.client_name); }) }))),
    ];
    if (typeof prdWindow === 'function') {
      const pw = prdWindow();
      jobs.push(sb.rpc('get_product_spend', { p_branches: pw.branches, p_from: pw.from, p_to: pw.to })
        .then(({ data }) => ((data && data.products) || []).map(p => ({
          kind: 'product', id: 'product:' + p.product, t: p.product,
          g: 'Products', s: [p.brand, p.type, aed(p.spend)].filter(Boolean).join(' · '), words: 'product stock ' + (p.brand || ''),
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

  // ── UNDERSTANDING WHAT WAS TYPED ──
  // Kate, 8 Oct 2026: "search system isn't that robust, i said google right! every
  // section, sub section that has 'conversion' in it must come out", "there has to be a
  // guide on refining your search" and "be intuitive, like it can read questions like
  // where do i find this". So a search is read in three steps:
  //   1. Operators: "an exact phrase", -leave out, on:"a page" (the guide lists them).
  //   2. A question is stripped to what it is about: "where do i find conversion",
  //      "saan makikita yung rebooking" and "what does retention mean" all search for the
  //      one word that matters. Filler words are ignored.
  //   3. Every word has to land somewhere: as itself, as its plural, a letter off, or as
  //      a word that means the same (convert for conversion, sales for revenue).
  const LEAD = /^(?:hey|hi|hello|pls|please|plz|kindly|ok|okay|so|um|uhm|can you|could you|would you|help me|tell me|show me|take me to|bring me to|i want to|i wanna|i need to|i need|i'm looking for|im looking for|looking for|where can i|where do i|where should i|where would i|where is|where are|where's|wheres|where|how can i|how do i|how do we|how to|how is|how are|how does|how's|what is|what are|what's|whats|what does|what do|which page|which tab|which report|which section|which|is there|are there|do we have|do i have|can i|can we|how|what|saan ko|saan po|saan|nasaan|nasan|paano|pano|ano ang|ano yung|ano|pwede ba|pwede)\b[\s,:?-]*/i;
  const GREET = /^(?:hey|hi|hello|pls|please|plz|kindly|ok|okay|so|um|uhm)\b/;
  const STOP = new Set(('a an the my our your their his her this that these those it its to of for in on at by with from and or but ' +
    'is are was were be been am do does did done i we you me us he she they them find see get show look check view tell know want need ' +
    'there here can could would should will please pls plz thanks thank shit damn fuck hell stuff thing things something anything ' +
    'lol haha hihe ba ang ng sa mga yung yun yan ito iyan ung ko mo po naman lang na pala kasi din rin nga pwede makikita makita ' +
    'hanapin nasaan saan mean means meaning define definition calculated calculate explain explained about any some many much ' +
    'page tab report section').split(' '));
  // Words that mean the same thing here. A match through one of these counts for less.
  const SYN = [
    ['sales', 'revenue', 'takings', 'income', 'turnover'],
    ['rebook', 'rebooking', 'rebooked', 'rebookings'],
    ['retention', 'retain', 'retained'],
    ['conversion', 'convert', 'converted', 'conversions'],
    ['client', 'clients', 'customer', 'customers', 'guest', 'guests'],
    ['stylist', 'stylists', 'hairdresser', 'therapist', 'staff'],
    ['target', 'targets', 'goal', 'goals', 'aim', 'aims', 'quota'],
    ['review', 'reviews', 'feedback', 'rating', 'ratings', 'stars'],
    ['spend', 'spending', 'cost', 'costs', 'budget'],
    ['price', 'prices', 'pricing'],
    ['ads', 'advert', 'adverts', 'advertising', 'campaign', 'campaigns'],
    ['payslip', 'payslips', 'payroll', 'salary', 'wage', 'wages'],
    ['stock', 'inventory'],
    ['lost', 'lapsed', 'inactive', 'churn'],
    ['percent', 'percentage', 'pct'],
    ['voucher', 'vouchers', 'giftcard'],
  ];
  const synOf = {};
  SYN.forEach(g => g.forEach(w => { synOf[w] = (synOf[w] || []).concat(g.filter(x => x !== w)); }));

  const tokensOf = s => norm(s).match(/[a-z0-9%]+/g) || [];
  // How well a typed word lands on one word of the page: 3 the same word; 2 it starts with
  // what was typed, or is the plural / singular of it; 1 a keyboard slip (one letter off). Two letters or fewer have to be exact.
  function tokMatch(t, k, noSlip) {
    if (t === k) return 3;
    if (t.length < 3 || k.length < 3) return 0;
    if (k.startsWith(t)) return 2;
    if (k.length >= 4 && t.length - k.length <= 3 && t.startsWith(k)) return 2;
    if (!noSlip && t.length >= 5 && k.length >= 5) {
      const room = t.length >= 9 ? 2 : 1;
      if (Math.abs(t.length - k.length) <= 1 && dist(t, k) <= room) return 1;
    }
    return 0;
  }
  // Best landing of a typed word on any of a line's words, trying what it means the same as.
  function bestTok(term, tk) {
    let best = 0;
    const vars = [[term, 1]].concat((synOf[term] || []).map(w => [w, 0.6]));
    for (const [v, w] of vars) {
      for (const k of tk) {
        const m = tokMatch(v, k, w < 1) * w;
        if (m > best) best = m;
        if (best >= 3) return best;
      }
    }
    return best;
  }

  function pageByName(arg) {
    const a = norm(arg).trim();
    if (!a) return '';
    const names = viewNames();
    let best = '', rank = 9;
    Object.keys(names).forEach(v => {
      const n = norm(names[v]);
      const r = n === a ? 0 : n.startsWith(a) ? 1 : n.split(/\s+/).some(w => w.startsWith(a)) ? 2 : n.includes(a) ? 3 : 9;
      if (r < rank) { rank = r; best = v; }
    });
    return best;
  }

  function parseQuery(raw) {
    let s = String(raw || '').slice(0, 200);
    const Q = { raw: s.trim(), words: [], phrases: [], not: [], on: '', onName: '', onMiss: '', question: false, vague: false, hl: [], has: false };
    s = s.replace(/(?:^|\s)on:(?:"([^"]*)"|(\S+))/gi, (m, a, b) => {
      const arg = a || b || '';
      const v = pageByName(arg);
      if (v) { Q.on = v; Q.onName = viewNames()[v]; } else Q.onMiss = arg;
      return ' ';
    });
    s = s.replace(/(?:^|\s)-"([^"]+)"/g, (m, p) => { const n = norm(p).trim(); if (n) Q.not.push(n); return ' '; });
    s = s.replace(/(?:^|\s)-([^\s"-][^\s"]*)/g, (m, w) => { Q.not.push(norm(w)); return ' '; });
    s = s.replace(/"([^"]+)"/g, (m, p) => { const n = norm(p).trim(); if (n) Q.phrases.push(n); return ' '; });
    s = s.replace(/"/g, ' ');

    let t = norm(s);
    if (/\?/.test(t)) Q.question = true;
    t = t.replace(/[?!]/g, ' ').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 4; i++) {
      const m = t.match(LEAD);
      if (!m || !m[0].trim()) break;
      if (!GREET.test(m[0])) Q.question = true;
      t = t.slice(m[0].length);
    }
    const all = t.match(/[a-z0-9%]+/g) || [];
    let kept = all.filter(w => !STOP.has(w));
    if (!kept.length && !Q.phrases.length && !Q.on && Q.question) Q.vague = true;
    else if (!kept.length && !Q.phrases.length && !Q.on) kept = all;
    Q.words = [...new Set(kept)].slice(0, 8);
    Q.hl = Q.words.concat(Q.phrases);
    Q.has = !!(Q.words.length || Q.phrases.length || Q.on);
    return Q;
  }

  // ── THE TEXT OF EVERY PAGE ──
  // search-index.js is built from the page sources (scripts/build-search-index.py), so
  // a sentence, a hover tip or a table heading is findable whether or not its page has
  // been opened this session. Loaded the first time search opens.
  let ft = null, ftKb = [], ftBusy = false;
  function buildFt() {
    const D = window.TRS_SEARCH_INDEX;
    if (!D || ft) return;
    ft = D.items.map(([view, sec, text, head]) => ({ view, sec, text, head: !!head, nt: norm(text), tk: tokensOf(text), st: tokensOf(sec) }));
    ftKb = D.kb || [];
  }
  function loadFt() {
    if (ft || ftBusy) return;
    if (window.TRS_SEARCH_INDEX) { buildFt(); return; }
    ftBusy = true;
    const s = document.createElement('script');
    const stamp = SELF.indexOf('?') >= 0 ? SELF.slice(SELF.indexOf('?')) : '';
    s.src = new URL('search-index.js' + stamp, SELF || location.href).href;
    s.onload = () => {
      ftBusy = false;
      buildFt();
      if (panel) index = buildIndex();
      if (panel && !panel.hidden && input.value.trim()) render();
      if (serp && !serp.hidden && serpIn.value.trim()) runSerp();
    };
    s.onerror = () => { ftBusy = false; };
    document.head.appendChild(s);
  }

  // Every line of every page that fits what was typed. Lines with all the words come
  // first; when none has them all, the ones with some (so a question never dead-ends).
  function ftSearch(Q) {
    if (!ft) return [];
    const out = [], need = Q.words.length;
    for (const it of ft) {
      if (Q.on && it.view !== Q.on) continue;
      if (Q.not.length && Q.not.some(n => it.nt.includes(n))) continue;
      if (Q.phrases.length && !Q.phrases.every(p => it.nt.includes(p))) continue;
      let s = 0, hit = 0;
      for (const w of Q.words) {
        const m = bestTok(w, it.tk);
        if (m) { hit++; s += m * 10; }
      }
      if (need && !hit) continue;
      if (!need) s = Q.phrases.length ? 25 : (it.head ? 12 : 4);
      else if (it.st.length && Q.words.some(w => bestTok(w, it.st))) s += 4;
      if (it.head) s += 8;
      s -= Math.min(6, it.tk.length / 15);
      out.push({ it, s, full: !need || hit === need });
    }
    return out;
  }
  // The text around the first typed word, for a long line.
  function around(text, terms) {
    if (text.length <= 200) return text;
    const n = norm(text);
    let i = -1;
    for (const w of terms) { const j = n.indexOf(w); if (j >= 0 && (i < 0 || j < i)) i = j; }
    const from = Math.max(0, (i < 0 ? 0 : i) - 70);
    return (from ? '…' : '') + text.slice(from, from + 200).trim() + (from + 200 < text.length ? '…' : '');
  }
  // One result per section of a page: its heading when the heading is the hit, otherwise
  // the section with the line beneath it. +N says how many more lines say it.
  function ftGroup(hits, Q) {
    const names = viewNames(), groups = new Map();
    hits.forEach(h => {
      const key = h.it.view + '|' + (h.it.sec ? norm(h.it.sec) : '#' + h.it.nt);
      const g = groups.get(key);
      if (!g) groups.set(key, { best: h, n: 1 });
      else { g.n++; if (h.s > g.best.s) g.best = h; }
    });
    return [...groups.values()].filter(g => names[g.best.it.view]).map(g => {
      const b = g.best.it, page = names[b.view], sec = b.sec;
      let t, snip, where = 'On ' + page;
      if (b.head || (!sec && b.text.length <= 80)) { t = b.text; snip = ''; }
      else if (sec) { t = sec; snip = b.text; }
      else { t = page; snip = b.text; where = 'Mentioned on this page'; }
      if (b.head && sec && norm(sec) !== b.nt) where += ' › ' + sec;
      return {
        kind: 'content', ft: true, view: b.view, id: 'ft:' + b.view + '|' + b.nt, t, g: where,
        s: snip ? around(snip, Q.hl) : '', words: '', more: g.n - 1,
        score: g.best.s * 1.5 + Math.min(3, g.n - 1) * 2,
        go: () => goText(b.view, b.text, null, '', sec ? [sec] : []),
      };
    });
  }

  // ── MATCHING ──
  // Name matches beat keyword matches; a word that starts with what you typed beats
  // one that merely contains it; initials ("dts" → Daily Target Sheet) are the last
  // resort. Every typed word has to land somewhere.
  function score(item, q, loose) {
    const t = norm(item.t), w = norm(item.words), s = norm((item.g || '') + ' ' + (item.s || ''));
    const tw = t.split(/[\s·,-]+/).filter(Boolean), ww = w.split(/\s+/).filter(Boolean);
    let total = 0;
    const pb = (part, syn) => {
      let best = 0;
      if (t === part) best = 100;
      else if (t.startsWith(part)) best = 80;
      else if (tw.some(x => x.startsWith(part))) best = 65;
      else if (t.includes(part)) best = 45;
      else if (ww.some(x => x.startsWith(part))) best = 30;
      else if (s.includes(part)) best = 20;
      else if (part.length >= 2 && initials(t).startsWith(part)) best = 25;
      // Typos: "jumeira" for Jumera, "saadyat" for Saadiyat, "kaet" for Kate.
      else if (!syn && part.length >= 3 && tw.some(x => near(part, x))) best = 35;
      else if (!syn && loose && part.length >= 3 && ww.some(x => near(part, x))) best = 15;
      return best;
    };
    for (const part of q.split(/\s+/).filter(Boolean)) {
      let best = pb(part);
      if (!best && synOf[part]) best = 0.6 * Math.max(...synOf[part].map(v => pb(v, true)));
      if (!best) return 0;
      total += best;
    }
    if (item.resigned) total -= 5;
    // Kate, 6 Oct 2026: "perf" put a Performance heading on Organisation Pulse above
    // the Branch Performance page. Text on the pages ranks below pages, people and
    // data unless it is the exact words typed.
    if (item.kind === 'content') total -= 30 * q.split(/\s+/).filter(Boolean).length;
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

  // Marks the words of the text that the typed words landed on: the word itself, its
  // plural, a near cousin or a synonym (so "revenue" lights up "sales"), and a phrase as
  // written. terms is the list the parsed search kept.
  function highlight(text, terms) {
    const parts = (Array.isArray(terms) ? terms : String(terms || '').split(/\s+/)).filter(Boolean);
    if (!parts.length) return esc(text);
    const marks = new Array(text.length).fill(false);
    const single = parts.filter(p => p.indexOf(' ') < 0), phrases = parts.filter(p => p.indexOf(' ') >= 0);
    const seen = new Set();
    const re = /[A-Za-z0-9À-ɏ%]+/g;
    let m;
    while ((m = re.exec(text))) {
      const tk = norm(m[0]);
      single.forEach(p => {
        if (bestTok(p, [tk]) >= 1) { seen.add(p); for (let k = m.index; k < m.index + m[0].length; k++) marks[k] = true; }
      });
    }
    // A fragment the word match missed (a hit in the middle of a word), and phrases.
    const n = norm(text);
    if (n.length === text.length) {
      single.filter(p => !seen.has(p)).concat(phrases).forEach(p => {
        const i = n.indexOf(p);
        if (i >= 0) for (let k = i; k < i + p.length && k < text.length; k++) marks[k] = true;
      });
    }
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
  // picked: an arrow key has chosen a row, so Enter opens that row. Without it, Enter
  // on a typed search opens the results page.
  let picked = false, serp, serpIn, serpKind = 'all', serpSeq = 0, serpTimer = 0, serpItems = [], serpAll = [], serpKb = [];
  let serpQ = null, serpView = '', serpTips = false, serpAns = null, serpPage = 0, serpText = '';
  const PAGE = 10;

  function mount() {
    const acts = document.querySelector('.mast-acts');
    if (acts && !document.getElementById('gsTrig')) {
      trig = document.createElement('button');
      trig.type = 'button';
      trig.id = 'gsTrig';
      trig.className = 'gs-trig';
      trig.setAttribute('aria-label', 'Search the dashboard');
      trig.setAttribute('aria-haspopup', 'dialog');
      trig.innerHTML = ICON + '<span class="gs-trig-t">' + PLACEHOLDER + '</span><kbd>/</kbd>';
      trig.addEventListener('click', open);
      acts.insertBefore(trig, acts.firstChild);
      placeTrig();
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
          enterkeyhint="go" placeholder="${PLACEHOLDER}" role="combobox"
          aria-expanded="true" aria-controls="gsList" aria-autocomplete="list">
        <button type="button" class="gs-x gs-clear" aria-label="Clear" hidden>&times;</button>
      </div>
      <div class="gs-list" id="gsList" role="listbox"></div>`;
    document.body.append(scrim, panel);

    input = panel.querySelector('.gs-in');
    list = panel.querySelector('.gs-list');
    const clear = panel.querySelector('.gs-clear');
    input.addEventListener('input', () => { clear.hidden = !input.value; picked = false; render(); });
    clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; picked = false; render(); input.focus(); });
    input.addEventListener('keydown', onKey);

    list.addEventListener('click', e => {
      if (e.target.closest('.gs-more')) { openSerp(input.value.trim()); return; }
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

    mountSerp();
    addEventListener('resize', () => { placeTrig(); if (!panel.hidden) place(); });
    // The phone keyboard shrinks the visible page: the list ends above it.
    if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (!panel.hidden) place(); });
  }

  function open() {
    if (!panel) return;
    // A scoped sign-in (Bahrain's team): the index covers UAE staff, clients and pages.
    if (typeof TRS_SCOPE !== 'undefined' && TRS_SCOPE) return;
    // Not over the sign-in screen: the / would otherwise land in the email field.
    const gate = document.getElementById('loginGate');
    if (gate && gate.style.display !== 'none') return;
    lastFocus = document.activeElement;
    hideBack();
    index = buildIndex();
    loadFt();
    loadData();
    input.value = '';
    picked = false;
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

  // Kate, 6 Oct 2026: "as intuitive as the hub". Team Home's search is a plain bar
  // that drops its results straight below, on every screen. So here too: on a phone
  // the bar gets its own full-width row under the logo (not a round icon), and the
  // panel opens right on top of the bar at every width, its list dropping below,
  // instead of a full-screen sheet. Tap anywhere else to close, as on Team Home.
  function placeTrig() {
    if (!trig) return;
    const mast = document.querySelector('.mast'), top = document.querySelector('.mast-top');
    const acts = document.querySelector('.mast-acts');
    const want = isPhone() ? mast : acts;
    if (!want || trig.parentNode === want) return;
    if (want === mast) top.after(trig); else acts.insertBefore(trig, acts.firstChild);
    if (typeof sizeTopbar === 'function') sizeTopbar();
  }
  // Over the bar when it is on screen, its right edge held on a wide screen so it
  // grows leftwards into the masthead. Otherwise (Ledgers pages, or the phone header
  // tucked away) at the top.
  function place() {
    const phone = isPhone();
    const w = phone ? innerWidth - 32 : Math.min(480, innerWidth - 32);
    const r = trig && trig.offsetParent ? trig.getBoundingClientRect() : null;
    let left, top;
    if (r && r.width && r.bottom > 0) {
      left = phone ? 16 : Math.max(16, Math.min(r.right - w, innerWidth - w - 16));
      top = Math.max(8, r.top - 1);
    } else {
      left = Math.round((innerWidth - w) / 2);
      top = phone ? 8 : 72;
    }
    panel.style.width = w + 'px';
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    const vh = window.visualViewport ? visualViewport.height : innerHeight;
    const head = panel.querySelector('.gs-head').offsetHeight || 48;
    list.style.maxHeight = Math.max(160, Math.min(phone ? 9999 : 520, vh - top - head - 16)) + 'px';
  }

  // How many of each kind can make the short list, so one kind never crowds out the
  // rest. The results page (Enter) has much roomier caps.
  const MAX = { metric: 3, page: 5, staff: 5, branch: 4, period: 3, service: 4, client: 4, product: 4, content: 5, kb: 3 };
  const ORDER = Object.keys(MAX);
  const MAX_SERP = { metric: 12, page: 14, staff: 25, branch: 5, period: 5, service: 20, client: 20, product: 20, content: 60, kb: 20 };
  const KIND_HEAD = { metric: 'Metrics', page: 'Pages', staff: 'Team', branch: 'Branches', period: 'Periods',
    service: 'Services', client: 'Clients', product: 'Products', content: 'On the pages', kb: 'Team Home' };

  function matches(Q) {
    if (!Q.has) return [];
    const q = Q.words.join(' ');
    // Lines of text from every page, grouped by section; page text that just repeats a
    // service, client, product or metric row is left to that row.
    const hits = ftSearch(Q);
    const full = hits.filter(h => h.full);
    const used = full.length ? full : hits;
    const ftItems = ftGroup(used, Q);
    const covered = new Set(used.map(h => h.it.view + '|' + h.it.nt));
    const dataNames = new Set(dataItems.concat(index.filter(x => x.kind === 'metric')).map(x => norm(x.t)));
    let pool = index.concat(dataItems, contentItems().filter(x => !dataNames.has(norm(x.t)) && !covered.has(x.view + '|' + norm(x.t))));
    if (Q.on) pool = pool.filter(x => x.view === Q.on);
    if (Q.phrases.length || Q.not.length) {
      pool = pool.filter(x => {
        const h = norm([x.t, x.g, x.s, x.words].join(' '));
        return Q.phrases.every(p => h.includes(p)) && !Q.not.some(n => h.includes(n));
      });
    }
    let scored = [];
    if (q) {
      scored = pool.map(x => [x, score(x, q)]).filter(([, s]) => s > 0);
      // Nothing close: loosen up and offer the nearest, rather than a dead end.
      if (!scored.length && !ftItems.length) scored = pool.map(x => [x, score(x, q, true)]).filter(([, s]) => s > 0);
    } else if (Q.phrases.length) {
      scored = pool.map(x => [x, 20]);
    }
    scored = scored.concat(ftItems.map(x => [x, x.score]));
    scored.sort((a, b) => b[1] - a[1] || ORDER.indexOf(a[0].kind) - ORDER.indexOf(b[0].kind));
    return scored.map(([x]) => x);
  }
  function capped(all, caps, total) {
    const taken = {};
    return all.filter(x => (taken[x.kind] = (taken[x.kind] || 0) + 1) <= (caps[x.kind] || 10)).slice(0, total);
  }

  // One list, best match first, like Team Home. Each row says where it lives in a
  // small line above its name. Nothing typed: what you opened last, or a hint. The last
  // row, as on a search engine, is the way to the full results page.
  function render() {
    const raw = input.value.trim();
    const Q = parseQuery(raw);
    let rows = [], head = '';
    if (!raw) {
      const byId = new Map(index.map(x => [x.id, x]));
      rows = recentIds().map(id => byId.get(id)).filter(Boolean);
      if (rows.length) head = 'Recent';
    } else {
      rows = capped(matches(Q), MAX, 12);
    }

    shown = rows;
    let html = head ? `<div class="gs-grp" role="presentation">${esc(head)}</div>` : '';
    html += rows.map((item, i) => rowHtml(item, i, Q.hl)).join('');
    if (raw && !rows.length) {
      html += `<div class="gs-empty">${Q.vague ? 'Tell me what you are after, for example “where do I find conversion”.' : 'Nothing yet. Press Enter for tips on narrowing it down.'}</div>`;
    }
    if (raw) html += `<div class="gs-more" role="presentation">See all results for “${esc(raw)}” <kbd>Enter</kbd></div>`;
    if (!raw && !rows.length) html = '<div class="gs-empty">Type a name, a page, a branch, a service, a client or a product, or ask it: “where do I find rebooking”.</div>';
    list.innerHTML = html;
    list.hidden = false;
    cur = 0;
    paintCursor();
  }

  // ── THE RESULTS PAGE ──
  // Kate, 8 Oct 2026: "parang google lang". Enter on a search opens a page of results,
  // not the dropdown again: each one a title, where it lives, and a line of text with the
  // typed words marked. Everything the dropdown can find, plus the Team Home pages whose
  // text mentions it (kb_search, the same search Team Home runs, as the signed-in person),
  // with chips to narrow it to one kind.
  function mountSerp() {
    serp = document.createElement('div');
    serp.className = 'gs-serp';
    serp.hidden = true;
    serp.setAttribute('role', 'dialog');
    serp.setAttribute('aria-label', 'Search results');
    serp.innerHTML = `
      <div class="gs-serp-top">
        <a class="gs-serp-logo" href="/hub/" aria-label="Team Home"><img alt="Tara Rose Salons"></a>
        <div class="gs-serp-bar">${ICON}
          <input class="gs-serp-in" type="search" autocomplete="off" autocapitalize="off" spellcheck="false"
            enterkeyhint="search" placeholder="${PLACEHOLDER}" aria-label="Search">
        </div>
        <a class="gs-serp-home" href="/hub/" aria-label="Team Home"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg><span>Team Home</span></a>
        <button type="button" class="gs-serp-close" aria-label="Close the results and go back to the page you were on">&larr; Back</button>
      </div>
      <div class="gs-serp-body">
        <div class="gs-fresh"></div>
        <div class="gs-sumrow">
          <div class="gs-serp-sum" aria-live="polite"></div>
          <button type="button" class="gs-tips-btn" aria-expanded="false">Search tips</button>
        </div>
        <div class="gs-tips" hidden>
          <div class="gs-tips-h">Narrow it down</div>
          <ul>
            <li><b>Ask it the way you would say it.</b> The filler words are ignored and what is left is searched.
              <span class="gs-exs"><button type="button" class="gs-ex" data-q="where do i find conversion">where do i find conversion</button>
              <button type="button" class="gs-ex" data-q="saan makikita yung rebooking">saan makikita yung rebooking</button>
              <button type="button" class="gs-ex" data-q="what does retention mean">what does retention mean</button></span></li>
            <li><b>An exact phrase:</b> put it in quotes.
              <span class="gs-exs"><button type="button" class="gs-ex" data-q="&quot;came back within 12 weeks&quot;">"came back within 12 weeks"</button></span></li>
            <li><b>Leave a word out:</b> put a minus in front of it.
              <span class="gs-exs"><button type="button" class="gs-ex" data-q="conversion -google">conversion -google</button></span></li>
            <li><b>Look inside one page:</b> add <code>on:</code> and the page name. On its own it lists the whole page.
              <span class="gs-exs"><button type="button" class="gs-ex" data-q="conversion on:&quot;staff dashboards&quot;">conversion on:"staff dashboards"</button>
              <button type="button" class="gs-ex" data-q="on:&quot;google ads&quot;">on:"google ads"</button></span></li>
            <li><b>The chips under the bar</b> narrow the results to one kind (Metrics, Pages, Team and so on) and to one page.</li>
            <li><b>Clients, services and products</b> are read for the branch and period picked at the top of the dashboard. Widen those to widen the search.</li>
            <li><b>Keys:</b> <kbd>/</kbd> or <kbd>Ctrl</kbd> <kbd>K</kbd> opens search from anywhere, <kbd>Enter</kbd> opens this page of results, <kbd>Esc</kbd> closes it.</li>
          </ul>
        </div>
        <div class="gs-ans" hidden></div>
        <div class="gs-filters">
          <div class="gs-chips" role="tablist"></div>
          <div class="gs-pchips"></div>
        </div>
        <div class="gs-serp-list"></div>
        <div class="gs-pager"></div>
      </div>`;
    document.body.append(serp);
    serpIn = serp.querySelector('.gs-serp-in');
    serpIn.addEventListener('input', () => { clearTimeout(serpTimer); serpTimer = setTimeout(runSerp, 200); });
    serpIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(serpTimer); runSerp(); if (isPhone()) serpIn.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSerp(); }
    });
    serp.querySelector('.gs-serp-close').addEventListener('click', closeSerp);
    serp.addEventListener('click', e => {
      const ex = e.target.closest('.gs-ex');
      const rel = e.target.closest('.gs-rel');
      if (ex || rel) { serpIn.value = (ex || rel).dataset.q; serpKind = 'all'; serpView = ''; runSerp(); serp.scrollTop = 0; return; }
      const pg = e.target.closest('.gs-pg');
      if (pg && pg.dataset.p) { serpPage = +pg.dataset.p; paintSerp(); serp.scrollTop = 0; return; }
      if (e.target.closest('.gs-tips-btn')) { serpTips = !serpTips; paintSerp(); return; }
      const ans = e.target.closest('.gs-ans-go');
      if (ans && serpAns) { openResult(serpAns, serpAns.go); return; }
      const chip = e.target.closest('.gs-chip');
      if (chip) {
        if (chip.dataset.v) serpView = serpView === chip.dataset.v ? '' : chip.dataset.v;
        else { serpKind = chip.dataset.k; serpView = ''; }
        serpPage = 0;
        paintSerp();
        return;
      }
      const act = e.target.closest('.gs-act');
      const res = e.target.closest('.gs-res');
      if (!res) return;
      const item = serpItems[+res.querySelector('.gs-r').dataset.i];
      if (!item) return;
      if (item.kind === 'kb') return;           // a real link: opens Team Home in a new tab
      e.preventDefault();
      openResult(item, act ? item.acts[+act.dataset.a][1] : item.go);
    });
  }

  function openSerp(text) {
    if (!text || !serp) return;
    // The dropdown steps aside; the page stays locked behind the results.
    panel.hidden = true;
    scrim.hidden = true;
    serp.hidden = false;
    document.body.classList.add('gs-open');
    serpKind = 'all';
    serpView = '';
    serpPage = 0;
    const logo = serp.querySelector('.gs-serp-logo img'), mast = document.getElementById('headerLogoImg');
    if (logo) logo.src = (mast && mast.getAttribute('src')) || 'assets/mast-ink.png';
    serpIn.value = text;
    runSerp();
    serp.querySelector('.gs-serp-body').scrollTop = 0;
    serp.scrollTop = 0;
  }
  function closeSerp() {
    if (!serp || serp.hidden) return;
    serp.hidden = true;
    document.body.classList.remove('gs-open');
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  // Kate, 8 Oct 2026: "no button for going back where you left". After a result is
  // opened, a pill takes you back to the same results, filters and all.
  let backPill = null;
  function showBack() {
    hideBack();
    const text = serpIn.value.trim();
    if (!text) return;
    const state = { text, kind: serpKind, view: serpView, page: serpPage };
    backPill = document.createElement('div');
    backPill.className = 'gs-back';
    backPill.innerHTML = '<button type="button" class="gs-back-go"></button><button type="button" class="gs-back-x" aria-label="Dismiss">&times;</button>';
    backPill.querySelector('.gs-back-go').textContent = '← Back to results for “' + (text.length > 28 ? text.slice(0, 27) + '…' : text) + '”';
    backPill.querySelector('.gs-back-go').addEventListener('click', () => {
      hideBack();
      openSerp(state.text);
      serpKind = state.kind; serpView = state.view; serpPage = state.page;
      paintSerp();
    });
    backPill.querySelector('.gs-back-x').addEventListener('click', hideBack);
    document.body.append(backPill);
  }
  function hideBack() { if (backPill) { backPill.remove(); backPill = null; } }

  function openResult(item, fn) {
    remember(item.id);
    showBack();
    serp.hidden = true;
    document.body.classList.remove('gs-open');
    if (typeof toggleNav === 'function' && document.body.classList.contains('nav-open') && isPhone()) toggleNav(false);
    fn();
  }

  function runSerp() {
    const text = serpIn.value.trim();
    const Q = serpQ = parseQuery(text);
    if (text !== serpText) { serpText = text; serpPage = 0; }
    const seq = ++serpSeq;
    serpKb = [];
    serpAll = Q.has ? capped(matches(Q), MAX_SERP, 200) : [];
    paintSerp();
    // Team Home's pages come back a moment later. They are searched for what the question
    // is about, not the question.
    const kbq = Q.words.concat(Q.phrases).join(' ');
    if (kbq.length >= 2 && typeof sb !== 'undefined' && !Q.on) {
      sb.rpc('kb_search', { q: kbq }).then(({ data, error }) => {
        if (seq !== serpSeq || error) return;
        serpKb = (data || []).map(r => ({
          kind: 'kb', id: 'kb:' + r.slug, t: r.title, g: kbWhere(r),
          snip: r.snippet ? '…' + r.snippet + '…' : '', href: '/hub/kb.html?p=' + encodeURIComponent(r.slug),
        })).filter(x => !Q.not.some(n => norm(x.t + ' ' + x.snip).includes(n)));
        paintSerp();
        // When each page was last updated, a moment later again (kb_search does not say).
        const slugs = serpKb.map(x => x.id.slice(3));
        if (!slugs.length) return;
        sb.from('kb_pages').select('slug,updated_at').in('slug', slugs).then(({ data: rows, error: e2 }) => {
          if (seq !== serpSeq || e2 || !rows) return;
          const when = new Map(rows.map(r => [r.slug, r.updated_at]));
          serpKb.forEach(x => { x.updated = when.get(x.id.slice(3)) || ''; });
          paintSerp();
        }, () => {});
      }, () => {});
    }
  }

  // "3 Oct", or "3 Oct 2025" when it is not this year.
  function updatedLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const m = d.toLocaleString('en-GB', { month: 'short' });
    return d.getDate() + ' ' + m + (d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear());
  }

  // Where a Team Home page lives: its section, then its group. Hair and Beauty each have an
  // "Induction and skill set checklists" page, so the title alone cannot tell them apart.
  function kbWhere(r) {
    const sec = ftKb.find(k => k[3].endsWith('?s=' + r.section));
    return 'Team Home · ' + (sec ? sec[0] + ' › ' : '') + (r.group_name || 'Page');
  }

  // What a page covers, as its line of text: only the typed words it is known by.
  const pageSnip = (item, q) => {
    const parts = q.split(/\s+/).filter(Boolean);
    const hit = [...new Set((PAGE_WORDS[item.view] || '').split(/\s+/).filter(w => w.length > 1 && parts.some(p => norm(w).startsWith(p))))];
    return hit.length ? 'Covers ' + hit.slice(0, 6).join(', ') : '';
  };

  // Kate, 8 Oct 2026: "add Last updated to the search page". The masthead's Ledger and
  // Phorest dates sit behind the results page, so they are copied here (the numbers
  // searched are only as fresh as those), with the date the page text was indexed.
  function freshHtml() {
    const mast = document.getElementById('mastFresh');
    const bits = mast ? [...mast.children].filter(c => /Ledger|Phorest/.test(c.textContent)).map(c => c.outerHTML) : [];
    const D = window.TRS_SEARCH_INDEX;
    if (D && D.built) {
      const d = new Date(D.built + 'T00:00:00');
      bits.push(`<span title="Pages are searched from an index of their wording, rebuilt when a page's wording changes">Page text <b>${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}</b></span>`);
    }
    return bits.length ? '<span class="gs-fresh-k">Last updated</span>' + bits.join('') : '';
  }

  function paintSerp() {
    serp.querySelector('.gs-fresh').innerHTML = freshHtml();
    const Q = serpQ || parseQuery(serpIn.value), text = serpIn.value.trim(), q = Q.words.join(' ');
    const names = viewNames();
    const all = serpAll.concat(serpKb);
    // Local results lead; Team Home's pages follow. Chips narrow it to one kind, then to one page.
    const counts = {};
    all.forEach(x => { counts[x.kind] = (counts[x.kind] || 0) + 1; });
    const kinds = Object.keys(KIND_HEAD).filter(k => counts[k]);
    if (serpKind !== 'all' && !counts[serpKind]) serpKind = 'all';
    const byKind = serpKind === 'all' ? all : all.filter(x => x.kind === serpKind);
    const vcount = {};
    byKind.forEach(x => { if (x.view && names[x.view]) vcount[x.view] = (vcount[x.view] || 0) + 1; });
    const views = Object.keys(vcount).sort((a, b) => vcount[b] - vcount[a]);
    if (serpView && !vcount[serpView]) serpView = '';
    const inView = serpView ? byKind.filter(x => x.view === serpView) : byKind;

    // A question about a metric ("what does conversion mean") gets its meaning first.
    let ans = null;
    if (Q.words.length && !serpView && serpKind === 'all' && (Q.question || /\b(mean|means|meaning|define|definition|calculated?|explain\w*)\b/.test(norm(Q.raw)))) {
      ans = all.find(x => x.kind === 'metric' && Q.words.every(w => bestTok(w, tokensOf(x.t)) >= 2)) || null;
    }
    serpAns = ans;
    const ansBox = serp.querySelector('.gs-ans');
    ansBox.hidden = !ans;
    ansBox.innerHTML = ans
      ? `<div class="gs-ans-k">Quick answer</div><div class="gs-ans-t">${esc(ans.t)}</div><div class="gs-ans-s">${esc(ans.s)}</div>`
        + `<button type="button" class="gs-ans-go">Show me on Staff Dashboards</button>`
      : '';
    const rows = ans ? inView.filter(x => x !== ans) : inView;
    // The click handler finds a row by position in serpItems (what is on screen). serpAll
    // stays the full set, so a chip can be undone: filtering must never shrink it.
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (serpPage >= pages) serpPage = pages - 1;
    const pageRows = rows.slice(serpPage * PAGE, serpPage * PAGE + PAGE);
    serpItems = pageRows;

    serp.querySelector('.gs-chips').innerHTML = kinds.length > 1
      ? [['all', 'All', all.length]].concat(kinds.map(k => [k, KIND_HEAD[k], counts[k]])).map(([k, l, n]) =>
        `<button type="button" role="tab" class="gs-chip${k === serpKind ? ' on' : ''}" data-k="${k}" aria-selected="${k === serpKind}">${esc(l)} <span>${n}</span></button>`).join('')
      : '';
    serp.querySelector('.gs-pchips').innerHTML = views.length > 1
      ? '<span class="gs-pl">On page</span>' + views.map(v =>
        `<button type="button" class="gs-chip gs-pchip${v === serpView ? ' on' : ''}" data-v="${esc(v)}" aria-pressed="${v === serpView}">${esc(names[v])} <span>${vcount[v]}</span></button>`).join('')
      : '';
    serp.querySelector('.gs-filters').hidden = !(kinds.length > 1 || views.length > 1);

    const read = [];
    if (Q.question && Q.words.length) read.push('looking for ' + Q.words.join(' '));
    if (Q.on) read.push('only on ' + Q.onName);
    if (Q.onMiss) read.push('no page called “' + Q.onMiss + '”');
    if (Q.not.length) read.push('without ' + Q.not.join(', '));
    const note = read.length ? ' · ' + read.join(' · ') : '';
    const sum = serp.querySelector('.gs-serp-sum');
    const n = rows.length + (ans ? 1 : 0);
    sum.textContent = n ? `${n} result${n === 1 ? '' : 's'} for “${text}”${note}` : '';

    // The guide opens by itself when the search finds nothing.
    const showTips = serpTips || !(rows.length || ans);
    const tips = serp.querySelector('.gs-tips'), tbtn = serp.querySelector('.gs-tips-btn');
    tips.hidden = !showTips;
    tbtn.setAttribute('aria-expanded', String(showTips));
    tbtn.textContent = showTips && serpTips ? 'Hide tips' : 'Search tips';

    const empty = Q.onMiss && !Q.words.length && !Q.phrases.length
      ? `There is no page called “${esc(Q.onMiss)}”. Try <code>on:"staff dashboards"</code>.`
      : Q.vague ? 'Tell me what you are after, for example “where do I find conversion”.'
      : `Nothing matches “${esc(text)}”.${Q.words.length > 1 ? ' Try fewer words, or one that says the same thing.' : ' Check the spelling, or try a word that means the same.'}`;
    const cards = pageRows.map((x, i) => {
      const snip = x.snip || x.s || (x.kind === 'page' ? pageSnip(x, q) : '');
      const acts = x.acts ? `<span class="gs-acts">${x.acts.map(([l], a) => `<button type="button" class="gs-act" data-a="${a}">${esc(l)}</button>`).join('')}</span>` : '';
      const open = x.href ? `<a class="gs-r" data-i="${i}" href="${esc(x.href)}" target="_blank" rel="noopener">` : `<a class="gs-r" data-i="${i}" href="#">`;
      const upd = x.updated ? `<div class="gs-r-upd">Updated ${esc(updatedLabel(x.updated))}</div>` : '';
      const more = x.more ? `<div class="gs-r-more">+${x.more} more line${x.more === 1 ? '' : 's'} in this section</div>` : '';
      return `<div class="gs-res">${open}<span class="gs-r-g">${esc(x.g || '')}</span><span class="gs-r-t">${highlight(x.t, Q.hl)}</span></a>`
        + (snip ? `<div class="gs-r-s">${highlight(snip, Q.hl)}</div>` : '') + upd + more + acts + '</div>';
    });
    // Related searches sit in the results, after the fifth, as on Google.
    const rel = relatedHtml(Q, all, ans, vcount, names);
    if (rel && serpPage === 0) cards.splice(Math.min(5, cards.length), 0, rel);
    serp.querySelector('.gs-serp-list').innerHTML = rows.length ? cards.join('')
      : (ans ? (rel || '') : (Q.has || Q.vague || Q.onMiss ? `<div class="gs-empty">${empty}</div>` : ''));
    serp.querySelector('.gs-pager').innerHTML = pagerHtml(pages);
  }

  // "Related searches": what the results suggest searching next. The headings that the
  // top results sit under, the other metrics when one is asked about, and the same
  // search narrowed to each page it was found on.
  const METRIC_SIBLINGS = ['Rebooking %', 'Retention %', 'Conversion %', 'Request rate %', 'Column fill %', 'Colour %'];
  function relatedHtml(Q, all, ans, vcount, names) {
    if (!Q.words.length || !all.length) return '';
    const own = Q.words.join(' '), seen = new Set([norm(own), norm(Q.raw)]), out = [];
    const add = (label, q) => {
      const k = norm(q);
      if (seen.has(k) || k.replace(/ %$/, '') === norm(own) || out.length >= 8) return;
      seen.add(k);
      out.push([label, q]);
    };
    const metric = ans || all.find(x => x.kind === 'metric');
    if (metric) {
      METRIC_SIBLINGS.filter(m => norm(m) !== norm(metric.t)).slice(0, 3).forEach(m => add(m, m));
      if (!Q.question) add('what does ' + own + ' mean', 'what does ' + own + ' mean');
    }
    // The headings the top results sit under, most often named first.
    const tally = new Map();
    all.slice(0, 30).forEach(x => {
      [x.kind === 'content' ? x.t : '', (x.g || '').split(' › ')[1] || ''].forEach(t => {
        t = (t || '').trim();
        if (t.length < 4 || t.length > 40 || t.split(/\s+/).length > 5 || /[.…]/.test(t)) return;
        tally.set(t, (tally.get(t) || 0) + 1);
      });
    });
    [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([t]) => add(t, t));
    Object.keys(vcount).sort((a, b) => vcount[b] - vcount[a]).slice(0, 3).forEach(v => {
      if (names[v] && !Q.on) add(own + ' · ' + names[v], own + ' on:"' + names[v] + '"');
    });
    if (!out.length) return '';
    return '<div class="gs-related"><div class="gs-related-h">Related searches</div><div class="gs-related-g">'
      + out.map(([l, q]) => `<button type="button" class="gs-rel" data-q="${esc(q)}">${ICON}<span>${esc(l)}</span></button>`).join('')
      + '</div></div>';
  }

  // The pager, as Google's: the brand's name over the page numbers. (A first try stretched
  // the name by a letter a page, "Taaara Rose"; it read as a typo, so it stays plain.)
  function pagerHtml(pages) {
    if (pages < 2) return '';
    const nums = [];
    for (let p = 0; p < pages; p++) {
      if (pages > 10 && p !== 0 && p !== pages - 1 && Math.abs(p - serpPage) > 2) { if (nums[nums.length - 1] !== '…') nums.push('…'); continue; }
      nums.push(p);
    }
    const btn = (p, label, cls) => `<button type="button" class="gs-pg ${cls || ''}" data-p="${p}"${p === serpPage && !cls ? ' aria-current="page"' : ''}>${label}</button>`;
    return `<div class="gs-wordmark" aria-hidden="true">Tara Rose</div><nav class="gs-pages" aria-label="Pages of results">`
      + (serpPage > 0 ? btn(serpPage - 1, '‹ Previous', 'gs-pg-n') : '')
      + nums.map(p => p === '…' ? '<span class="gs-pg-dots">…</span>' : btn(p, p + 1, p === serpPage ? 'on' : '')).join('')
      + (serpPage < pages - 1 ? btn(serpPage + 1, 'Next ›', 'gs-pg-n') : '') + '</nav>';
  }

  // Team Home's row: where it lives, the name (matched letters marked), one line
  // more. A person's other jumps (stats, figures, 13 weeks) show on the top row
  // only, when she is clearly the one you were after.
  function rowHtml(item, i, q) {
    const acts = item.acts && q && i === 0
      ? `<span class="gs-acts">${item.acts.slice(1).map(([l], a) => `<button type="button" class="gs-act" data-a="${a + 1}" tabindex="-1">${esc(l)}</button>`).join('')}</span>`
      : '';
    return `<div class="gs-row" role="option" id="gsOpt${i}" data-i="${i}">
      ${item.g ? `<span class="gs-g">${esc(item.g)}</span>` : ''}<span class="gs-t">${highlight(item.t, q)}</span>${item.s ? `<span class="gs-s">${esc(item.s)}</span>` : ''}${acts}</div>`;
  }

  function paintCursor() {
    list.querySelectorAll('.gs-row').forEach(r => {
      const on = +r.dataset.i === cur;
      r.classList.toggle('on', on);
      r.setAttribute('aria-selected', on);
      if (on) r.scrollIntoView({ block: 'nearest' });
    });
    input.setAttribute('aria-activedescendant', shown.length ? 'gsOpt' + cur : '');
  }

  function onKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      picked = true;
      paintCursor();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = shown[cur];
      // Like a search engine: Enter on a typed search opens the results page. An arrowed-to
      // row, or a recent pick with nothing typed, opens straight away.
      if (input.value.trim() && !picked) openSerp(input.value.trim());
      else if (item) choose(item, item.go);
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
    if (e.key === 'Escape' && serp && !serp.hidden) { e.preventDefault(); closeSerp(); return; }
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (serp && !serp.hidden) { closeSerp(); return; }
      panel && !panel.hidden ? close() : open();
    } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      open();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
