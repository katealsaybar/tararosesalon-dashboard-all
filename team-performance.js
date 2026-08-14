/* ============================================================
   TEAM PERFORMANCE — the podium, the floor, and the compare tray.
   Kate, 2026-08-14.

   Replaces the leaderboard-plus-comparator-plus-wide-table version that lived in
   dashboard.js. Three faults it had, all of them about the work you had to do
   before the page told you anything:

     - The leaderboard ranked by a metric pill, so the first thing on the page
       was a control rather than a result.
     - Comparing two stylists meant setting three branch dropdowns and three name
       dropdowns — six choices before a single chart drew.
     - The supporting table ran to nineteen columns behind a horizontal scroll,
       which is a spreadsheet, and Emma already has the spreadsheet.

   What it does instead:

     1. THE PODIUM — top three by net salon take, photo-led, the way the stylist
        cards read. It is a result you can see from the doorway.
     2. THE FLOOR — everyone else, one dense row each, ranked, with the two
        figures that decide whether you look closer.
     3. THE TRAY — comparison you build by tapping +, up to three, side by side
        on the same four benchmark bars. No dropdowns, and it survives a filter
        change so you can hold two people and step through the months.

   BENCHMARK BARS ARE SCORED AGAINST TARGET, NEVER AGAINST THE FIELD. Green means
   she hit the number in TARGETS. Ranking the bars against the best performer is
   the thing that makes a weak month look green, which is exactly the read this
   page must not give.

   Every figure is aggData()'s own per-stylist output through the shared branch +
   period filters, so this page and Organisation Pulse cannot disagree.
   ============================================================ */

// ── FORMATTERS ───────────────────────────────────────────────
// Whole units. The two decimals in dashboard.js's fmtAED are right for one
// headline figure and wrong for a wall of cards.
const tpAed  = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-GB');
const tpNum  = n => Math.round(Number(n) || 0).toLocaleString('en-GB');
const tpPct  = n => (Math.round((Number(n) || 0) * 10) / 10) + '%';

// ── STATE ────────────────────────────────────────────────────
// Which bench is on show, and who is in the tray. The tray holds branch|name
// keys rather than objects: the objects are rebuilt on every filter change, so
// holding one would pin a stylist's January figures into an August comparison.
let tpDept = 'hair';
let tpCompare = [];
const TP_MAX_COMPARE = 3;
const tpKey = st => st.branchCode + '|' + st.name;

// The selected bench, flattened across whichever branches are in the filter,
// each stylist tagged with where she works. Sorted by net salon take: the podium
// and the floor are one ranked list, cut at three.
//
// Per branch and then flattened — rather than aggregating the whole selection at
// once — is what lets every stylist carry the branch she worked in. Nicknames
// repeat across branches (Chalani is at both Khalifa City and Motor City), so
// name alone is never a key here. Same reason the ledger's stylist rows are
// keyed branch + dept + name.
//
// aggByBranch() rather than a private aggregator: it is the one place that knows
// which source answers for a given window — weekly_totals for whole weeks, the
// branch_staff_daily/phorest_staff_daily join for part-weeks, weekly_data
// otherwise. Rolling our own read weekly_data only, which is why this page went
// blank for August while every other page had figures.
function tpRoster(dept) {
  const byBranch = (typeof aggByBranch === 'function') ? aggByBranch() : {};
  const branches = sel.branch.includes('all') ? ACTIVE_BRANCHES : sel.branch;
  const list = [];
  branches.forEach(code => {
    const bd = byBranch[code];
    if (!bd) return;
    const staff = dept === 'beauty' ? bd.beautyStaff : bd.hairStaff;
    staff.forEach(st => list.push({
      ...st,
      isBeauty:    dept === 'beauty',
      branchCode:  code,
      branchName:  (BRANCH_INFO[code] || {}).name  || code,
      branchColor: (BRANCH_INFO[code] || {}).color || 'var(--border)',
      // One revenue figure for the whole page. Net salon take is services plus
      // retail, which is the number the ledger calls Net Salon Take.
      net: st.netSalonTake || 0,
    }));
  });
  return list.sort((a, b) => (b.net || 0) - (a.net || 0));
}

// ── AVATARS ──────────────────────────────────────────────────
// The soft-square block with the head breaking out over its top edge is baked
// into the PNG, so the img carries no border-radius, background or border — any
// of the three clips the overhang. Identical reasoning to .av on the win cards,
// and .tp-av is a size variant of it rather than a new treatment.
function tpAvatar(name, cls) {
  const prof = (typeof staffProfile === 'function') ? staffProfile(name) : null;
  if (prof && prof.photo) {
    return `<img class="tp-av ${cls || ''}" src="assets/staff/${encodeURIComponent(prof.photo)}"
      alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  }
  // No shoot yet — the beauty bench has no cards in the deck. The placeholder
  // rebuilds the same footprint by hand and has no head to protrude, which is
  // the honest tell that a portrait is missing rather than broken.
  return `<div class="tp-av-ph ${cls || ''}" title="Portrait to come"><b>${escapeHtml(initials(name))}</b></div>`;
}

// ── BENCHMARK BARS ───────────────────────────────────────────
// Scored against target: at or above is good, within a fifth of it is warn,
// below that is bad. The tick on the track sits at 100% of target, so someone
// running at 130% visibly overshoots it instead of just filling the bar.
function tpBand(val, target) {
  const r = target ? (Number(val) || 0) / target : 0;
  return r >= 1 ? 'good' : r >= 0.8 ? 'warn' : 'bad';
}
function tpMeter(label, val, target, fmt) {
  const v = Number(val) || 0;
  const pctOfTarget = target ? (v / target * 100) : 0;
  const scale = Math.max(100, pctOfTarget);          // the track's own top end
  return `<div class="tp-mtr ${tpBand(v, target)}">
    <div class="tp-mtr-l"><span>${label}</span><span class="tabular">${fmt(target)}</span></div>
    <div class="tp-mtr-v tabular">${fmt(v)}</div>
    <div class="tp-mtr-t">
      <span class="tp-mtr-tick" style="left:${100 / scale * 100}%"></span>
      <span class="tp-mtr-f" style="width:${Math.min(100, pctOfTarget / scale * 100)}%"></span>
    </div>
  </div>`;
}
// Beauty carries no treatment target, so that bar drops out rather than being
// scored against a number that does not apply to the bench.
function tpMeters(st) {
  const avgTarget = st.isBeauty ? TARGETS.beautyAvgBill : TARGETS.hairAvgBill;
  const out = [tpMeter('Rebooking', st.rebookPct, TARGETS.rebookPct, tpPct)];
  if (!st.isBeauty) out.push(tpMeter('Treatment', st.treatmentPct, TARGETS.treatmentPct, tpPct));
  out.push(tpMeter('Retail', st.retailPct, TARGETS.retailPct, tpPct));
  out.push(tpMeter('Avg bill', st.avgBill, avgTarget, tpNum));
  return out.join('');
}

// ── THE PAGE ─────────────────────────────────────────────────
// Async for one reason: aggByBranch() reads caches that renderDashboard() fills,
// and landing here directly — a bookmark, a reload on this view — would find
// them empty. Same guard the ledger pages use. refreshActiveView() already
// renders the dashboard before calling this, so on a filter change it is a
// no-op.
async function renderTeam() {
  const host = document.getElementById('teamContent');
  if (!host) return;
  if (!window._lastDashState && typeof renderDashboard === 'function') {
    host.innerHTML = '<div class="loading">Loading data...</div>';
    await renderDashboard();
  }

  // The emptiness test is the roster itself, not a weekly_data row count: on a
  // part-week window there are no weekly rows at all and the figures come from
  // the daily join, so counting weeks would call a full page of data empty.
  const roster = tpRoster(tpDept);
  const branchLabel = sel.branch.includes('all')
    ? 'All Branches'
    : sel.branch.map(b => (BRANCH_INFO[b] || {}).name || b).join(', ');

  // Anyone dropped out of the selection leaves the tray with them — a compare
  // column for a stylist who is not in the filtered period would be a figure
  // from a window you are no longer looking at.
  const present = new Set(roster.map(tpKey));
  tpCompare = tpCompare.filter(k => present.has(k));

  const podium = roster.slice(0, 3);
  const floor  = roster.slice(3);
  const benchWord = tpDept === 'beauty' ? 'beauty bench' : 'hair floor';

  host.innerHTML = `
    <div class="tp-bar">
      <div class="tp-seg">
        <button class="${tpDept === 'hair'   ? 'on' : ''}" onclick="tpSetDept('hair')">Hair</button>
        <button class="${tpDept === 'beauty' ? 'on' : ''}" onclick="tpSetDept('beauty')">Beauty</button>
      </div>
      <span class="tp-bar-n">${branchLabel} · ${roster.length} ${roster.length === 1 ? 'person' : 'people'}</span>
      <span class="tp-bar-sp"></span>
      <span class="tp-bar-n">Tap + on anyone to compare · up to ${TP_MAX_COMPARE}</span>
    </div>

    ${!roster.length ? '<div class="empty">Nobody on this bench in the selected period.</div>' : `
      <div class="section-label">Leading this period
        <span class="tp-sec-n">by net salon take</span></div>
      <div class="tp-podium">${podium.map(tpPodiumCard).join('')}</div>

      ${floor.length ? `
        <div class="section-label">The rest of the ${benchWord}
          <span class="tp-sec-n">${floor.length} ${floor.length === 1 ? 'person' : 'people'}</span></div>
        <div class="tp-floor">${floor.map((st, i) => tpFloorRow(st, i + 4)).join('')}</div>` : ''}
    `}

    <!-- Fixed to the bottom of the window, but rendered inside the view so it
         disappears with it: a fixed child of a display:none parent is hidden. -->
    <div class="tp-tray ${tpCompare.length ? 'up' : ''}" id="tpTray">
      <div class="tp-tray-in">
        <div class="tp-tray-hd">Comparing ${tpCompare.length} of ${TP_MAX_COMPARE}
          <button class="tp-btn" onclick="tpClearCompare()">Clear</button></div>
        <div class="tp-tray-cols">
          ${tpCompare.map(k => tpTrayCol(roster.find(st => tpKey(st) === k))).join('')}
        </div>
      </div>
    </div>
    ${tpCompare.length ? '<div class="tp-tray-space"></div>' : ''}
  `;
}

function tpPodiumCard(st, i) {
  const prof = (typeof staffProfile === 'function') ? staffProfile(st.name) : null;
  const medal = ['#E7C86A', '#C9CBD1', '#D3A17A'][i] || 'var(--border)';
  const nm = escapeHtml(st.name);
  const name = (prof && prof.ig)
    ? `<a href="https://instagram.com/${encodeURIComponent(prof.ig)}" target="_blank" rel="noopener noreferrer"
         title="@${escapeHtml(prof.ig)} on Instagram">${nm}</a>`
    : nm;
  const picked = tpCompare.includes(tpKey(st));
  return `<div class="card tp-pod" style="--tp-medal:${medal}">
    <div class="tp-pod-rk">${i + 1}</div>
    <div class="tp-pod-top">
      ${tpAvatar(st.name, 'lg')}
      <div class="tp-pod-who">
        <div class="tp-pod-nm">${name}</div>
        ${prof && prof.role ? `<div class="tp-role">${escapeHtml(prof.role)}</div>` : ''}
        <div class="tp-branch"><span class="tp-bdot" style="background:${st.branchColor}"></span>${escapeHtml(st.branchName)}</div>
      </div>
    </div>
    <div class="tp-pod-fig">
      <div class="tp-k">Net salon take</div>
      <div class="tp-pod-v tabular">${tpAed(st.net)}</div>
      <div class="tp-pod-s tabular">${tpNum(st.total)} clients · ${tpNum(st.rebooked)} rebooked</div>
    </div>
    <div class="tp-pod-mtrs">${tpMeters(st)}</div>
    <button class="tp-add ${picked ? 'on' : ''}" onclick="tpPick('${tpKey(st).replace(/'/g, "\\'")}')"
      aria-label="${picked ? 'Remove from comparison' : 'Add to comparison'}">${picked ? '✓' : '+'}</button>
  </div>`;
}

// The two figures that decide whether you look closer: what she took, and
// whether they came back. Everything else is a tap away in the tray.
function tpFloorRow(st, rank) {
  const picked = tpCompare.includes(tpKey(st));
  return `<div class="card tp-row">
    <span class="tp-rk tabular">${rank}</span>
    ${tpAvatar(st.name, 'sm')}
    <div class="tp-row-who">
      <div class="tp-row-nm">${escapeHtml(st.name)}</div>
      <div class="tp-row-s tabular">${tpAed(st.net)} · ${tpPct(st.rebookPct)} rebook</div>
      <div class="tp-branch"><span class="tp-bdot" style="background:${st.branchColor}"></span>${escapeHtml(st.branchName)}</div>
    </div>
    <button class="tp-add ${picked ? 'on' : ''}" onclick="tpPick('${tpKey(st).replace(/'/g, "\\'")}')"
      aria-label="${picked ? 'Remove from comparison' : 'Add to comparison'}">${picked ? '✓' : '+'}</button>
  </div>`;
}

function tpTrayCol(st) {
  if (!st) return '';
  return `<div class="tp-tray-col">
    <div class="tp-tray-who">
      ${tpAvatar(st.name, 'sm')}
      <div class="tp-tray-meta">
        <div class="tp-tray-nm">${escapeHtml(st.name)}</div>
        <div class="tp-tray-s tabular">${escapeHtml(st.branchName)} · ${tpAed(st.net)}</div>
      </div>
      <button class="tp-x" onclick="tpPick('${tpKey(st).replace(/'/g, "\\'")}')" aria-label="Remove">×</button>
    </div>
    <div class="tp-tray-mtrs">${tpMeters(st)}</div>
  </div>`;
}

// ── HANDLERS ─────────────────────────────────────────────────
// Switching bench clears the tray on purpose: a hair stylist beside a beautician
// compares an avg bill against two different targets, and the bars would say one
// of them is failing when they are being read on different scales.
function tpSetDept(dept) {
  if (tpDept === dept) return;
  tpDept = dept;
  tpCompare = [];
  renderTeam();
}

function tpPick(key) {
  const i = tpCompare.indexOf(key);
  if (i >= 0) tpCompare.splice(i, 1);
  else {
    if (tpCompare.length >= TP_MAX_COMPARE) tpCompare.shift();   // oldest drops out
    tpCompare.push(key);
  }
  renderTeam();
}

function tpClearCompare() {
  tpCompare = [];
  renderTeam();
}
