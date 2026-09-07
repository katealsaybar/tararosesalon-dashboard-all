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
function staffHasCard(key) {
  if (typeof stylistBranchGroups !== 'function') return false;
  return stylistBranchGroups().some(g => g.list.some(p => staffLinkKey(p.name) === key));
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
  return id === 'stylists' ? 'card' : id === 'team' ? 'stats' : id === 'branchperf' ? 'row' : '';
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
    ['row', 'Branch figures', 'Branch Performance · Staff', `whoGoRow('${key}','${branch}')`],
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
  const bar = document.querySelector('.sc-bar, .tp-bar');
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
  whoShowView('stylists');
  whoWaitFor(() => document.getElementById(staffLinkId(key)), whoLand,
    () => whoNote('No card for ' + key + ' yet.'));
}

function whoGoStats(key, dept, branch) {
  // The Team page shows one department at a time; switch it to hers first.
  if (dept && typeof tpDept !== 'undefined' && tpDept !== dept) {
    tpDept = dept; tpCompare = [];
  }
  whoShowView('team');
  if (typeof renderTeam === 'function') renderTeam();
  const find = () => document.querySelector(`#view-team .who[data-who="${key}"]`);
  whoWaitFor(find, el => whoLand(el.closest('.tp-pod, .tp-row') || el),
    () => whoNote(key + ' is not in the selected branch or period.'));
}

function whoGoRow(key, branch) {
  whoShowView('branchperf');
  if (typeof sectionState !== 'undefined' && !sectionState.bpStaff
      && document.getElementById('sec-bpStaff') && typeof toggleSection === 'function') toggleSection('bpStaff');
  const find = () => document.querySelector(`#view-branchperf .who[data-who="${key}"]`);
  whoWaitFor(find, el => whoLand(el.closest('tr') || el),
    () => whoNote(key + ' is not in the selected branch or period.'));
}
