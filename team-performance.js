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
// Which bench is on show, and who is in the tray. The tray holds mergeKey
// strings rather than objects: the objects are rebuilt on every filter change, so
// holding one would pin a stylist's January figures into an August comparison.
let tpDept = 'hair';
let tpCompare = [];
// Rank by: 'net' (podium + floor by net salon take) or 'level' (one group per
// position, top of the ladder first, net take order inside each). Kate, 25 Sep
// 2026; remembered per browser.
let tpSort = 'net';
try { if (localStorage.getItem('tp-sort') === 'level') tpSort = 'level'; } catch (e) {}
// The ladder, top first. Hair ladder is perf_benchmarks' level_order; beauty
// roles follow. Roles come from staff-profiles.js; anyone without one goes last.
const TP_LADDER = ['Owner', 'Style Director', 'Senior Stylist', 'Stylist', 'Junior Stylist', 'Blow-Dry Specialist', 'Barber',
  'Senior Beauty Therapist', 'Senior Nail Technician', 'Beauty Therapist', 'Nail Technician', 'Beauty Team Member', 'Assistant'];
// Kate, 25 Sep 2026: people on this page that staff-profiles.js does not place
// (it also drives Staff Cards, where these four are not meant to appear). Keyed by
// tpMergeKey, the ledger's own spelling: Tara is the owner, and Cristine Bracamonte,
// Lhang Ann and Ma. Ercely worked the floor as assistants.
const TP_ROLE_FIX = { 'TARA': 'Owner', 'TARA KIDD': 'Owner',
  'CRISTINE': 'Assistant', 'CRISTINE BRACAMONTE': 'Assistant',
  'LHANG': 'Assistant', 'LHANG ANN': 'Assistant', 'MA. ERCELY': 'Assistant' };
const TP_PHOTO_FIX = { 'TARA': 'assets/org-chart/tara-rose-kidd.png', 'TARA KIDD': 'assets/org-chart/tara-rose-kidd.png' };
const tpRole = st => { const fix = TP_ROLE_FIX[tpMergeKey(st.name)]; if (fix) return fix;
  const p = (typeof staffProfile === 'function') ? staffProfile(st.name) : null; return (p && p.role) || 'No position set'; };
const tpRoleRank = r => { const i = TP_LADDER.indexOf(r); return i < 0 ? TP_LADDER.length : i; };
const TP_MAX_COMPARE = 3;
const tpKey = st => st.mergeKey;

// The canonical key a stylist's rows are grouped under — same resolution
// staff-profiles.js's surname join uses, so LUCIA folds into LUCY here too.
function tpMergeKey(name) {
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName(name) : name;
  return String(canon).trim().toUpperCase();
}

// First names that are genuinely two different colleagues, not one stylist
// covering two branches — merging these would move one person's revenue onto
// another. staff-profiles.js's STAFF_SURNAMES carries the same call for MAY:
// Fernandez at Khalifa City, Manguiat at Saadiyat, kept apart on purpose.
const TP_SPLIT_NAMES = new Set(['MAY']);

// One card per stylist, kahit ilang branch niya na-cover sa window — Kate, 17
// Sep 2026. Rows come in per branch (staff work cover shifts, Chalani is a
// regular at both Khalifa City and Motor City), so they are grouped by
// mergeKey and summed before the podium/floor ever see them; TP_SPLIT_NAMES is
// the one opt-out, for a shared first name that is not a shared person.
//
// aggByBranch() rather than a private aggregator: it is the one place that knows
// which source answers for a given window — weekly_totals for whole weeks, the
// branch_staff_daily/phorest_staff_daily join for part-weeks, weekly_data
// otherwise. Rolling our own read weekly_data only, which is why this page went
// blank for August while every other page had figures.
function tpRoster(dept) {
  const byBranch = (typeof aggByBranch === 'function') ? aggByBranch() : {};
  const branches = sel.branch.includes('all') ? ACTIVE_BRANCHES : sel.branch;
  const rows = [];
  branches.forEach(code => {
    const bd = byBranch[code];
    if (!bd) return;
    const staff = dept === 'beauty' ? bd.beautyStaff : bd.hairStaff;
    staff.forEach(st => rows.push({
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

  const groups = {}, order = [];
  rows.forEach(r => {
    const canon = tpMergeKey(r.name);
    const key = TP_SPLIT_NAMES.has(canon) ? (canon + '|' + r.branchCode) : canon;
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(r);
  });
  // Kate, 25 Sep 2026: a name the ledger still carries with nothing against it in
  // this window (leavers kept on the sheet as blank rows, e.g. Samantha and Zandri
  // into August) is not a person on the floor. Anyone with a sale or a client stays,
  // including assistants who bring no money through their own name; Phorest-only
  // staff count their visits as clients.
  const list = order.map(key => tpCombine(groups[key], key))
    .filter(st => (st.net || 0) > 0 || (st.total || 0) > 0);
  return list.sort((a, b) => (b.net || 0) - (a.net || 0));
}

// Sums the additive figures across every branch a stylist worked in the
// selected window, then rebuilds the ratios from those totals rather than
// averaging percentages — a 90%-rebooking week of 10 clients at one branch and
// a 20%-rebooking week of 40 at another must not average out to 55%.
function tpCombine(group, mergeKey) {
  const first = group[0];
  if (group.length === 1) return { ...first, mergeKey, branches: [{ code: first.branchCode, name: first.branchName, color: first.branchColor }] };

  const sum = k => group.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const total        = sum('total');
  const rebooked     = sum('rebooked');
  const treatments   = sum('treatments');
  const retail       = sum('retail');
  const hairSalesNet = sum('hairSalesNet');
  const beautySales  = sum('beautySales');
  const net          = sum('net');
  const services     = first.isBeauty ? beautySales : hairSalesNet;
  // Every branch she touched gets its own dot on the card, largest net take
  // first. Grouped by branch code rather than listed per row: the same branch
  // can appear twice in `group` when the ledger logged her name in two
  // different cases that week (e.g. "CHALANI" one upload, "Chalani" the next) —
  // canonicalStaffName folds those into one card here, but without this the
  // branch tag would print "Khalifa City + Khalifa City".
  const byBranch = {};
  group.forEach(r => {
    if (!byBranch[r.branchCode]) byBranch[r.branchCode] = { code: r.branchCode, name: r.branchName, color: r.branchColor, net: 0 };
    byBranch[r.branchCode].net += r.net || 0;
  });
  const branches = Object.values(byBranch).sort((a, b) => b.net - a.net);

  return {
    ...first,
    mergeKey,
    total, rebooked, newC: sum('newC'), req: sum('req'), salon: sum('salon'),
    treatments, retail, hairSalesNet, beautySales, net, netSalonTake: net,
    avgBill:      total ? services / total : 0,
    rebookPct:    total ? (rebooked / total * 100) : 0,
    treatmentPct: hairSalesNet ? (treatments / hairSalesNet * 100) : 0,
    retailPct:    net ? (retail / net * 100) : 0,
    branchCode:   branches[0].code,
    branchName:   branches.map(b => b.name).join(' + '),
    branchColor:  branches[0].color,
    branches,
  };
}

// The branch tag: one dot for a single-branch stylist, exactly as before, or
// one dot per branch she worked this window for a merged card — so "combined"
// reads as combined rather than quietly picking one branch to show.
function tpBranchTag(st) {
  if (!st.branches || st.branches.length < 2) {
    return `<span class="tp-bdot" style="background:${st.branchColor}"></span>${escapeHtml(st.branchName)}`;
  }
  return st.branches.map(b =>
    `<span class="tp-bdot" style="background:${b.color}"></span>${escapeHtml(b.name)}`
  ).join(' + ');
}

// ── AVATARS ──────────────────────────────────────────────────
// The soft-square block with the head breaking out over its top edge is baked
// into the PNG, so the img carries no border-radius, background or border — any
// of the three clips the overhang. Identical reasoning to .av on the win cards,
// and .tp-av is a size variant of it rather than a new treatment.
function tpAvatar(name, cls) {
  const fixed = TP_PHOTO_FIX[tpMergeKey(name)];
  if (fixed) return `<img class="tp-av ${cls || ''}" src="${fixed}"
      alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
  const prof = (typeof staffProfile === 'function') ? staffProfile(name) : null;
  if (prof && prof.photo) {
    return `<img class="tp-av ${cls || ''}" src="assets/staff/${encodeURIComponent(prof.photo)}"
      alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
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
      <div class="tp-seg" role="group" aria-label="Rank by">
        <button class="${tpSort === 'net'   ? 'on' : ''}" onclick="tpSetSort('net')">Takings</button>
        <button class="${tpSort === 'level' ? 'on' : ''}" onclick="tpSetSort('level')">Position</button>
      </div>
      <span class="tp-bar-n">${branchLabel} · ${roster.length} ${roster.length === 1 ? 'person' : 'people'}</span>
      <span class="tp-bar-sp"></span>
      <span class="tp-bar-n">Tap + on anyone to compare · up to ${TP_MAX_COMPARE}</span>
    </div>

    ${!roster.length ? '<div class="empty">Nobody on this bench in the selected period.</div>' : tpSort === 'level' ? tpByLevel(roster) : `
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
          <span class="tp-tray-n">${tpCompare.length === 1
            ? 'against the bench and the target — tap + on somebody else to put them side by side'
            : 'the leader in each row is marked'}</span>
          <button class="tp-btn" onclick="tpClearCompare()">Clear</button></div>
        ${tpTrayMatrix(tpCompare.map(k => roster.find(st => tpKey(st) === k)).filter(Boolean), roster)}
      </div>
    </div>
    ${tpCompare.length ? '<div class="tp-tray-space"></div>' : ''}
  `;

  tpSizeTraySpace();
}

// The spacer that keeps the last of the floor out from under the tray is the tray's
// measured height, not a number in the stylesheet. The matrix is ten rows for hair
// and eight for beauty, and one person is shorter than three — the old fixed 230px
// was set against the four-bar tray and left two stylists underneath this one.
// Re-measured on resize as well, because the tray is capped at 52vh.
function tpSizeTraySpace() {
  const tray = document.getElementById('tpTray');
  const space = document.querySelector('.tp-tray-space');
  if (!tray || !space) return;
  space.style.height = (tray.offsetHeight + 16) + 'px';
}
addEventListener('resize', tpSizeTraySpace);

function tpPodiumCard(st, i) {
  const prof = (typeof staffProfile === 'function') ? staffProfile(st.name) : null;
  const medal = ['#E7C86A', '#C9CBD1', '#D3A17A'][i] || 'var(--border)';
  const nm = escapeHtml(st.name);
  const linked = (prof && prof.ig)
    ? `<a href="https://instagram.com/${encodeURIComponent(prof.ig)}" target="_blank" rel="noopener noreferrer"
         title="@${escapeHtml(prof.ig)} on Instagram">${nm}</a>`
    : nm;
  // Outside the Instagram link, same convention as the stylist cards (sc-last):
  // the link is the first name, and a surname that opened Instagram would surprise.
  const surname = prof && prof.last ? ` <span class="tp-last">${escapeHtml(prof.last)}</span>` : '';
  // Wrapped for the hover menu (staff-links.js): her card and her branch figures.
  const name = (typeof staffWho === 'function')
    ? staffWho(st.name, linked + surname, { dept: tpDept, branch: st.branchCode }) : linked + surname;
  const picked = tpCompare.includes(tpKey(st));
  return `<div class="card tp-pod" style="--tp-medal:${medal}">
    <div class="tp-pod-rk">${i + 1}</div>
    <div class="tp-pod-top">
      ${tpAvatar(st.name, 'lg')}
      <div class="tp-pod-who">
        <div class="tp-pod-nm">${name}</div>
        ${prof && prof.role ? `<div class="tp-role">${escapeHtml(prof.role)}</div>` : ''}
        <div class="tp-branch">${tpBranchTag(st)}</div>
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
// Position view: one section per role, top of the ladder first, each ranked by
// net take (roster is already in that order).
function tpByLevel(roster) {
  const groups = {};
  roster.forEach(st => (groups[tpRole(st)] ||= []).push(st));
  return Object.keys(groups).sort((a, b) => tpRoleRank(a) - tpRoleRank(b)).map(r => `
      <div class="section-label">${escapeHtml(r)}
        <span class="tp-sec-n">${groups[r].length} ${groups[r].length === 1 ? 'person' : 'people'} · by net salon take</span></div>
      <div class="tp-floor">${groups[r].map((st, i) => tpFloorRow(st, i + 1)).join('')}</div>`).join('');
}

function tpFloorRow(st, rank) {
  const picked = tpCompare.includes(tpKey(st));
  const nm = escapeHtml(st.name);
  const last = (typeof staffSurname === 'function') ? staffSurname(st.name) : null;
  const plain = last ? `${nm} <span class="tp-last">${escapeHtml(last)}</span>` : nm;
  return `<div class="card tp-row">
    <span class="tp-rk tabular">${rank}</span>
    ${tpAvatar(st.name, 'sm')}
    <div class="tp-row-who">
      <div class="tp-row-nm">${(typeof staffWho === 'function')
        ? staffWho(st.name, plain, { dept: tpDept, branch: st.branchCode }) : plain}</div>
      <div class="tp-row-s tabular">${tpAed(st.net)} · ${tpPct(st.rebookPct)} rebook</div>
      <div class="tp-branch">${tpBranchTag(st)}</div>
    </div>
    <button class="tp-add ${picked ? 'on' : ''}" onclick="tpPick('${tpKey(st).replace(/'/g, "\\'")}')"
      aria-label="${picked ? 'Remove from comparison' : 'Add to comparison'}">${picked ? '✓' : '+'}</button>
  </div>`;
}

/* ── THE TRAY ─────────────────────────────────────────────────
   Kate, 14 Aug 2026: the tray used to be one column per person, each carrying
   tpMeters() — the same four bars already printed on her card. Opening it told you
   nothing you had not just read, and with one person picked it was the card twice.

   It is a matrix now. Metrics down the side, one column per person, then the bench
   and the target. That makes it answer the question the + button implies — who is
   ahead, on what, and by how much — and it stays worth opening on a single pick,
   because there is always a bench column to read her against.

   Rows carry their own target and formatter. `pick` reads a roster row; `bench`
   reads the whole bench, and the ratio rows deliberately do NOT average the
   percentages: mean-of-percentages weights a stylist with 8 clients the same as one
   with 150. They divide the bench's totals instead, which is the same arithmetic
   the group summary uses. `hairOnly` drops treatment for the beauty bench, exactly
   as tpMeters() did. */
const TP_CMP_ROWS = [
  { label: 'Net salon take', fmt: tpAed, pick: st => st.net,
    bench: b => b.n ? b.net / b.n : 0 },
  { label: 'Clients', fmt: tpNum, pick: st => st.total || 0,
    bench: b => b.n ? b.clients / b.n : 0 },
  { label: 'New clients', fmt: tpNum, pick: st => (st.newC != null ? st.newC : st.newClients) || 0,
    bench: b => b.n ? b.newC / b.n : 0 },
  { label: 'Rebooked', fmt: tpNum, pick: st => st.rebooked || 0,
    bench: b => b.n ? b.rebooked / b.n : 0 },
  { label: 'Rebooking %', fmt: tpPct, target: () => TARGETS.rebookPct, pick: st => st.rebookPct,
    bench: b => b.clients ? b.rebooked / b.clients * 100 : 0 },
  { label: 'Treatment AED', fmt: tpAed, hairOnly: true, pick: st => st.treatments || 0,
    bench: b => b.n ? b.treatments / b.n : 0 },
  { label: 'Treatment %', fmt: tpPct, hairOnly: true, target: () => TARGETS.treatmentPct,
    pick: st => st.treatmentPct, bench: b => b.services ? b.treatments / b.services * 100 : 0 },
  { label: 'Retail AED', fmt: tpAed, pick: st => st.retail || 0,
    bench: b => b.n ? b.retail / b.n : 0 },
  { label: 'Retail %', fmt: tpPct, target: () => TARGETS.retailPct, pick: st => st.retailPct,
    bench: b => b.net ? b.retail / b.net * 100 : 0 },
  { label: 'Avg bill', fmt: tpNum,
    target: dept => dept === 'beauty' ? TARGETS.beautyAvgBill : TARGETS.hairAvgBill,
    pick: st => st.avgBill, bench: b => b.clients ? b.services / b.clients : 0 },
];

// The bench's own totals, over whoever is on screen — the current department and
// branch selection, the same roster the podium and floor are drawn from.
function tpBench(roster) {
  const b = { n: roster.length, net:0, clients:0, newC:0, rebooked:0, treatments:0, retail:0, services:0 };
  roster.forEach(st => {
    b.net       += st.net || 0;
    b.clients   += st.total || 0;
    b.newC      += (st.newC != null ? st.newC : st.newClients) || 0;
    b.rebooked  += st.rebooked || 0;
    b.treatments+= st.treatments || 0;
    b.retail    += st.retail || 0;
    // Services, not net take: avg bill and treatment % are both ratios to services.
    b.services  += (st.isBeauty ? st.beautySales : st.hairSalesNet) || 0;
  });
  return b;
}

function tpTrayMatrix(picked, roster) {
  if (!picked.length) return '';
  const bench = tpBench(roster);
  const rows = TP_CMP_ROWS.filter(r => !(r.hairOnly && tpDept === 'beauty'));

  const head = `<tr>
    <th class="tp-cmp-k">Metric</th>
    ${picked.map(st => {
      const last = (typeof staffSurname === 'function') ? staffSurname(st.name) : null;
      const nm = escapeHtml(st.name) + (last ? ` <span class="tp-last">${escapeHtml(last)}</span>` : '');
      return `<th class="tp-cmp-who">
      <div class="tp-cmp-hd">
        ${tpAvatar(st.name, 'sm')}
        <div class="tp-cmp-meta">
          <div class="tp-cmp-nm">${nm}</div>
          <div class="tp-cmp-br">${tpBranchTag(st)}</div>
        </div>
        <button class="tp-x" onclick="tpPick('${tpKey(st).replace(/'/g, "\\'")}')"
          aria-label="Remove ${escapeHtml(st.name)} from comparison">×</button>
      </div></th>`;
    }).join('')}
    <th class="tp-cmp-agg r">Bench avg</th>
    <th class="tp-cmp-agg r">Target</th>
  </tr>`;

  const body = rows.map(r => {
    const target = r.target ? r.target(tpDept) : null;
    const vals   = picked.map(st => Number(r.pick(st)) || 0);
    // The leader is marked only when there is something to lead: one person
    // compared against herself is not a winner. Ties are not marked either.
    const top    = vals.length > 1 ? Math.max(...vals) : null;
    const tied   = top != null && vals.filter(v => v === top).length > 1;
    return `<tr>
      <td class="tp-cmp-k">${r.label}</td>
      ${vals.map(v => `<td class="r tabular ${target ? tpBand(v, target) : ''}${
        (top != null && !tied && v === top) ? ' tp-cmp-best' : ''}">${r.fmt(v)}</td>`).join('')}
      <td class="r tabular tp-cmp-agg">${r.fmt(r.bench(bench))}</td>
      <td class="r tabular tp-cmp-agg">${target ? r.fmt(target) : '—'}</td>
    </tr>`;
  }).join('');

  return `<div class="tp-cmp-wrap">
    <table class="tp-cmp tabular"><thead>${head}</thead><tbody>${body}</tbody></table>
  </div>`;
}

// ── HANDLERS ─────────────────────────────────────────────────
// Switching bench clears the tray on purpose: a hair stylist beside a beautician
// compares an avg bill against two different targets, and the bars would say one
// of them is failing when they are being read on different scales.
function tpSetSort(k) {
  if (tpSort === k) return;
  tpSort = k;
  try { localStorage.setItem('tp-sort', k); } catch (e) {}
  renderTeam();
}

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
