// ── STAFF LINKS ───────────────────────────────────────────────
// Kate, 7 Sep 2026: "hyperlink all stylist names ... when you hover over their names
// may lalabas na 2 options". A person's name appears on three surfaces of this
// dashboard, each showing a different side of the same colleague:
//
//   card   Staff Cards          who she is: photo, role, Instagram, the A3 card
//   stats  Team Performance     how she ranks: podium, floor, the compare tray
//   row    Branch Performance   her figures: the Staff table, hair or beauty
//
// Every name now offers the OTHER two as a small menu on hover (tap on touch, Enter
// on a keyboard). The name itself is left as it was, so the Instagram links on the
// cards and podium still open Instagram; the menu is the thing that appears beside
// it. One menu element is shared by every name on the page and every listener is
// delegated from the document, so the renderers can rebuild their HTML as often as
// they like without re-binding anything.
//
// Names are matched across surfaces by the same canonical key the surname map
// uses (canonicalStaffName, then upper case), so LUCIA on a ledger row finds the
// LUCY card. Loaded after team-performance.js; the renderers only call staffWho()
// when it exists, so nothing here is load-order critical.

// The canonical key for a name, or '' when there is no name.
function staffLinkKey(name) {
  if (!name) return '';
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName(name) : name;
  return String(canon).trim().toUpperCase();
}

// Key made safe for an element id: LUCY GONZALES → scCard-LUCY-GONZALES.
function staffLinkId(key) {
  return 'scCard-' + String(key).replace(/[^A-Z0-9]+/gi, '-');
}

// Wrap a name's HTML so the menu knows who it is. innerHtml is already escaped by
// the caller (it may carry the surname span or an Instagram link). dept is 'hair'
// or 'beauty', branch a branch code — both optional, both help the Team jump land.
function staffWho(name, innerHtml, opts) {
  const key = staffLinkKey(name);
  if (!key) return innerHtml;
  const o = opts || {};
  const dept = o.dept ? String(o.dept).toLowerCase() : '';
  return `<span class="who" tabindex="0" role="button" aria-haspopup="menu"
    data-who="${escapeHtml(key)}"${dept ? ` data-dept="${escapeHtml(dept)}"` : ''}${o.branch ? ` data-branch="${escapeHtml(o.branch)}"` : ''}>${innerHtml}</span>`;
}

// Who has a card on the Staff Cards page. stylistBranchGroups() is the roster that
// page renders, so asking it is the same as asking the page — and it answers for
// people who are not on the page yet (Andrea, the assistants) with "no card".
// Kate, 3 Oct 2026: asked across both countries. It used to ask only the masthead's,
// so with Bahrain picked every UAE colleague (Grace at KCA) showed "No card yet"
// while former staff, who sit outside any branch, still had theirs.
function staffHasCard(key) {
  return !!staffCardBranch(key);
}
// The Staff Cards section a person's card is in, or '' when she has none.
function staffCardBranch(key) {
  if (typeof stylistBranchGroups !== 'function') return '';
  const g = stylistBranchGroups(true).find(g => g.list.some(p => staffLinkKey(p.name) === key));
  return g ? g.branch : '';
}

// ── THE MENU ──────────────────────────────────────────────────
let whoMenuEl = null, whoOpenFor = null, whoShowTimer = 0, whoHideTimer = 0;

function whoMenu() {
  if (whoMenuEl) return whoMenuEl;
  whoMenuEl = document.createElement('div');
  whoMenuEl.id = 'whoMenu';
  whoMenuEl.setAttribute('role', 'menu');
  whoMenuEl.hidden = true;
  document.body.appendChild(whoMenuEl);
  whoMenuEl.addEventListener('mouseenter', () => clearTimeout(whoHideTimer));
  whoMenuEl.addEventListener('mouseleave', () => whoScheduleHide());
  return whoMenuEl;
}

// Which surface a name sits on, read from the view container around it.
function whoSurface(span) {
  const view = span.closest('[id^="view-"]');
  const id = view ? view.id.slice(5) : '';
  return id === 'stylists' ? 'card' : id === 'team' ? 'stats' : id === 'dailyperf' ? 'row' : id === 'staffweeks' ? 'weeks' : id === 'stafflevels' ? 'bench' : '';
}

function whoShow(span) {
  clearTimeout(whoHideTimer);
  const key = span.dataset.who;
  const dept = span.dataset.dept || '';
  const branch = span.dataset.branch || '';
  const here = whoSurface(span);
  const menu = whoMenu();
  const hasCard = staffHasCard(key);
  const items = [
    ['card', 'Staff card', hasCard ? 'Staff Cards' : 'No card yet', `whoGoCard('${key}')`],
    ['stats', 'Staff stats', 'Team Performance', `whoGoStats('${key}','${dept}','${branch}')`],
    // Audit 18 Oct 2026 (P3-19): the manager's walk, who is winning, then the person, then the trend, then the level.
    ['dash', 'Staff Dashboards', 'Her page', `whoGoDash('${key}')`],
    ['weeks', 'Staff’s 13 Week', 'Her year, week by week', `whoGoWeeks('${key}')`],
    ['bench', 'Stylist’s Benchmarks', 'Her level and aims', `whoGoBench()`],
    ['row', 'Branch figures', 'Daily Performance · Staff', `whoGoRow('${key}','${branch}')`],
  ].filter(it => it[0] !== here);
  menu.innerHTML = items.map(([k, label, sub, go]) => {
    const off = k === 'card' && !hasCard;
    return `<button type="button" role="menuitem" class="who-opt${off ? ' off' : ''}"
      ${off ? 'disabled' : `onclick="whoHide();${go.replace(/"/g, '&quot;')}"`}>
      <span class="who-opt-t">${label}</span>${sub ? `<span class="who-opt-s">${sub}</span>` : ''}</button>`;
  }).join('');
  menu.hidden = false;
  whoOpenFor = span;
  span.classList.add('who-on');
  // Under the name, left-aligned; above it when the bottom of the window is close.
  const r = span.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - mw - 8);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = r.top - mh - 6;
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top = Math.max(8, top) + 'px';
}

function whoHide() {
  clearTimeout(whoShowTimer); clearTimeout(whoHideTimer);
  if (whoMenuEl) whoMenuEl.hidden = true;
  if (whoOpenFor) whoOpenFor.classList.remove('who-on');
  whoOpenFor = null;
}

function whoScheduleHide() {
  clearTimeout(whoHideTimer);
  whoHideTimer = setTimeout(whoHide, 260);
}

document.addEventListener('mouseover', e => {
  const span = e.target.closest && e.target.closest('.who');
  if (!span) return;
  clearTimeout(whoHideTimer);
  if (whoOpenFor === span) return;
  clearTimeout(whoShowTimer);
  whoShowTimer = setTimeout(() => whoShow(span), 140);
});
document.addEventListener('mouseout', e => {
  const span = e.target.closest && e.target.closest('.who');
  if (!span) return;
  clearTimeout(whoShowTimer);
  if (whoOpenFor === span) whoScheduleHide();
});
// Tap toggles, for touch. A click on an Instagram link inside the name is left
// alone: the link is the older promise and it still keeps it.
document.addEventListener('click', e => {
  const span = e.target.closest && e.target.closest('.who');
  if (span) {
    if (e.target.closest('a')) return;
    e.preventDefault();
    e.stopPropagation();
    if (whoOpenFor === span) whoHide(); else whoShow(span);
    return;
  }
  if (whoMenuEl && !whoMenuEl.hidden && !whoMenuEl.contains(e.target)) whoHide();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { whoHide(); return; }
  const span = e.target.closest && e.target.closest('.who');
  if (span && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    if (whoOpenFor === span) whoHide(); else whoShow(span);
  }
});
addEventListener('scroll', () => { if (whoOpenFor) whoHide(); }, { passive: true });
addEventListener('resize', whoHide);

// ── THE JUMPS ─────────────────────────────────────────────────
// Land an element below the fixed masthead (and any sticky bar the page has), then
// light it for a moment so the eye finds it after the page change.
function whoLand(el) {
  const masthead = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--topbar-cond-h')) || 104;
  const bar = document.querySelector('.sc-bar, .tp-bar, .dp-bar');
  const top = el.getBoundingClientRect().top + window.scrollY
    - masthead - (bar && bar.offsetParent ? bar.offsetHeight : 0) - 16;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  el.classList.remove('who-flash');
  void el.offsetWidth;
  el.classList.add('who-flash');
  setTimeout(() => el.classList.remove('who-flash'), 2200);
}

// The renderers are not all synchronous (renderTeam awaits the data, Branch
// Performance redraws once its figures arrive), so a jump waits for its target to
// exist, up to ~2.5s, before giving up. And having landed, it keeps watching for the
// same window: a view that redraws after the landing swaps the element out from
// under the highlight, so the fresh one is landed on again. Same target, same place,
// no visible jump — only the highlight survives the redraw.
function whoWaitFor(find, then, miss) {
  const t0 = Date.now();
  let landed = null;
  (function tick() {
    const el = find();
    if (el && el !== landed) { landed = el; then(el); }
    else if (!el && !landed && Date.now() - t0 > 2500) return miss && miss();
    // A timer rather than requestAnimationFrame: frames stop in a background tab,
    // and a jump started from one should still be finished when you come back.
    if (Date.now() - t0 < 2500) setTimeout(tick, 80);
  })();
}

function whoShowView(view) {
  const node = document.getElementById('view-' + view);
  if (node && node.style.display !== 'none') return;
  showView(view, document.querySelector(`.nav-sub[onclick*="'${view}'"]`));
}

// A quiet line under the masthead when the person is not on the page you land on:
// filtered out by branch or period, or simply not there yet.
function whoNote(msg) {
  let n = document.getElementById('whoNote');
  if (!n) { n = document.createElement('div'); n.id = 'whoNote'; document.body.appendChild(n); }
  n.textContent = msg;
  n.classList.add('on');
  clearTimeout(n._t);
  n._t = setTimeout(() => n.classList.remove('on'), 3200);
}

function whoGoCard(key) {
  // Staff Cards' words load on first use: wait for them, so the card page draws with its cards.
  if (typeof trsLazy === 'function' && !trsLazyDone('sc')) { trsLazy('sc').then(() => whoGoCard(key), () => {}); return; }
  // A card in the other country: switch the masthead there first, or the Staff
  // Cards page won't have drawn it.
  const b = staffCardBranch(key);
  if (b && typeof isBahrainView === 'function' && typeof sel !== 'undefined') {
    const bah = BH_BRANCHES.includes(b);
    if (bah !== isBahrainView() && (bah || !['other', 'other-beauty', 'other-front-desk'].includes(b))) {
      if (typeof GROUP_MODE !== 'undefined') GROUP_MODE = false;
      sel.branch = bah ? [b] : ['all'];
      if (typeof pendingSel !== 'undefined') pendingSel.branch = [...sel.branch];
      if (typeof paintFilterChips === 'function') paintFilterChips();
    }
  }
  whoShowView('stylists');
  whoWaitFor(() => document.getElementById(staffLinkId(key)), whoLand,
    () => whoNote('No card for ' + key + ' yet.'));
}

function whoGoStats(key, dept, branch) {
  // Podium Race's script loads on first use: wait for it, so tpDept and tpCompare exist to be set.
  if (typeof trsLazy === 'function' && !trsLazyDone('tp')) { trsLazy('tp').then(() => whoGoStats(key, dept, branch), () => {}); return; }
  // The Team page shows one department at a time; switch it to hers first.
  if (dept && typeof tpDept !== 'undefined' && tpDept !== dept) {
    tpDept = dept; tpCompare = [];
  }
  whoShowView('team');
  if (typeof renderTeam === 'function') renderTeam();
  const find = () => document.querySelector(`#view-team .who[data-who="${key}"]`);
  whoWaitFor(find, el => whoLand(el.closest('.tp-pod, .tp-ch, .tp-rr') || el),
    () => whoNote(key + ' is not in the selected branch or period.'));
}

// The slug the performance pages know her by: her full name, and the menu's key is the name the ledgers use (often
// the first name alone, with the surname kept beside it by staffSurname).
function whoSlug(key) {
  const last = (typeof staffSurname === 'function') ? staffSurname(key) : '';
  const full = last && !String(key).toUpperCase().includes(String(last).toUpperCase()) ? key + ' ' + last : key;
  return (typeof w13SlugOf === 'function') ? w13SlugOf(full) : String(full).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
// Staff Dashboards opens on one person through the frame's ?staff= slug (the same slug the address carries).
function whoGoDash(key) {
  window.spfWantStaff = whoSlug(key);
  window.spfStaffSlug = window.spfWantStaff;
  const frame = document.getElementById('spfFrame');
  if (frame) { frame.removeAttribute('src'); delete frame.dataset.loaded; }   // a loaded frame is on someone else
  whoShowView('staffperf');
}
// Staff's 13 Week opens straight on her report (staff-weeks.js reads w13WantSlug when it draws).
function whoGoWeeks(key) {
  // staff-weeks.js loads on first use: wait for it, so w13WantSlug exists to be set.
  if (typeof w13WantSlug === 'undefined' && typeof trsLazy === 'function') { trsLazy('wk').then(() => whoGoWeeks(key), () => {}); return; }
  if (typeof w13WantSlug !== 'undefined') { w13WantSlug = whoSlug(key); w13Pick = null; }
  whoShowView('staffweeks');
}
function whoGoBench() { whoShowView('stafflevels'); }

function whoGoRow(key, branch) {
  // Daily Performance's script loads on first use: wait for it, so the Measure reset below has something to reset.
  if (typeof trsLazy === 'function' && !trsLazyDone('dp')) { trsLazy('dp').then(() => whoGoRow(key, branch), () => {}); return; }
  // Daily Performance's Staff card (Branch Performance is part of it now, 16 Oct 2026). The card is ranked by the Measure and a
  // hair-only or beauty-only measure leaves one department's table out, so go back to Total sales, which shows both; then open the
  // branch's panel (only the first is open) and land on her row.
  const shown = (() => { const n = document.getElementById('view-dailyperf'); return !!(n && n.style.display !== 'none'); })();
  const changed = typeof DP !== 'undefined' && DP.measure !== 'sales';
  if (changed) { DP.measure = 'sales'; try { if (typeof dpSave === 'function') dpSave(); } catch (e) { /* the page is fine without it */ } }
  whoShowView('dailyperf');
  if (shown && changed && typeof renderDailyPerf === 'function') renderDailyPerf();
  const find = () => document.querySelector(`#view-dailyperf #daStaff .who[data-who="${key}"]`);
  whoWaitFor(find, el => { const d = el.closest('details'); if (d) d.open = true; whoLand(el.closest('tr') || el); },
    () => whoNote(key + ' is not in the selected branch or period.'));
}
