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
          ],
        });
      }));
    }

    if (typeof ACTIVE_BRANCHES !== 'undefined') {
      ACTIVE_BRANCHES.forEach(code => {
        const b = BRANCH_INFO[code];
        items.push({
          kind: 'branch', id: 'branch:' + code, t: b.name, s: 'Show this branch only',
          words: code + ' branch salon', colour: b.colorLight || b.color,
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
  function score(item, q) {
    const t = norm(item.t), w = norm(item.words), s = norm(item.s);
    let total = 0;
    for (const part of q.split(/\s+/).filter(Boolean)) {
      let best = 0;
      if (t === part) best = 100;
      else if (t.startsWith(part)) best = 80;
      else if (t.split(/[\s·-]+/).some(x => x.startsWith(part))) best = 65;
      else if (t.includes(part)) best = 45;
      else if (w.split(/\s+/).some(x => x.startsWith(part))) best = 30;
      else if (s.includes(part)) best = 20;
      else if (part.length >= 2 && initials(t).startsWith(part)) best = 25;
      if (!best) return 0;
      total += best;
    }
    if (item.resigned) total -= 5;
    return total;
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
      trig.innerHTML = ICON + '<span class="gs-trig-t">Search</span><kbd>/</kbd>';
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
          enterkeyhint="go" placeholder="Pages, team, branches, periods" role="combobox"
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

  const GROUPS = [['page', 'Pages', 6], ['staff', 'Team', 6], ['branch', 'Branches', 5], ['period', 'Period', 3]];

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
      const scored = index.map(x => [x, score(x, q)]).filter(([, s]) => s > 0);
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
      html = `<div class="gs-empty">Nothing matches “${esc(input.value.trim())}”. Try a page, a name or a branch.</div>`;
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
