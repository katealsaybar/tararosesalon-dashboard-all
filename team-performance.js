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
const tpAed  = n => CUR() + ' ' + Math.round(Number(n) || 0).toLocaleString('en-GB');
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
  'LHANG': 'Assistant', 'LHANG ANN': 'Assistant', 'MA. ERCELY': 'Assistant', 'MA.': 'Assistant',
  // Kate, 30 Sep 2026: Phorest-only assistants, a few days each in 2026. Ara
  // Gonzales (KCA), Joyce Dy (SAA), Maan Solis (AQ, MC).
  'ARA': 'Assistant', 'JOYCE': 'Assistant', 'MAAN': 'Assistant',
  // Oliver Green, barber at Al Quoz, Dec 2025 to Jan 2026 (Kate, 30 Sep 2026).
  'OLIVER': 'Barber', 'OLIVER GREEN': 'Barber',
  // May Manguiat, Saadiyat (TP_SPLIT_FULL below), is an assistant (Kate, 1 Oct 2026).
  'MAY MANGUIAT': 'Assistant' };
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
// The split keeps the two Mays apart, but both rows still looked up the one MAY
// profile, so Saadiyat's May printed as "May Fernandez · Junior Stylist" with
// Khalifa City May's photo and read as a duplicate (Comet, 1 Oct 2026). The row
// away from the profile's branch takes her full name, which matches no profile.
const TP_SPLIT_FULL = { 'MAY|SAA': 'MAY MANGUIAT' };

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

  rows.forEach(r => {
    const full = TP_SPLIT_FULL[tpMergeKey(r.name) + '|' + r.branchCode];
    if (full) r.name = full;
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
  // Kate, 28 Sep 2026: assistants are left off this page altogether (Lhang, Cristine,
  // Ma. Ercely, whom the Motor City ledger spells just "MA.").
  const list = order.map(key => tpCombine(groups[key], key))
    .filter(st => (st.net || 0) > 0 || (st.total || 0) > 0)
    .filter(st => tpRole(st) !== 'Assistant');
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
// The portrait's URL, or null when there is no shoot yet. Shared by the <img>
// avatars and the quadrant chart, which draws the same PNG as an SVG <image>.
function tpPhotoSrc(name) {
  const fixed = TP_PHOTO_FIX[tpMergeKey(name)];
  if (fixed) return fixed;
  const prof = (typeof staffProfile === 'function') ? staffProfile(name) : null;
  if (prof && prof.photo) return 'assets/staff/' + encodeURIComponent(prof.photo);
  // Kate, 30 Sep 2026: leavers have no card photo, only the black-and-white
  // headshot from the RESIGNED board (photoFull), which they had here as initials.
  return (prof && prof.photoFull) ? encodeURI(prof.photoFull) : null;
}
function tpAvatar(name, cls) {
  const src = tpPhotoSrc(name);
  if (src) return `<img class="tp-av ${cls || ''}" src="${src}"
      alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
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
  if (target == null) return '';   // no target for this branch (Bahrain's avg bills): not scored
  const r = target ? (Number(val) || 0) / target : 0;
  return r >= 1 ? 'good' : r >= 0.8 ? 'warn' : 'bad';
}
// The four targets every card is read against, as one list the podium rings and
// the chasing-row tiles both draw from. Beauty carries no treatment target, so
// that one drops out rather than being scored against a number that does not
// apply to the bench.
function tpTargets(st) {
  // Rebooking and treatment come off the ledger, which Bahrain does not have yet:
  // leave them off rather than draw an empty ring that reads as 0%.
  const ledger = !(typeof isBahrainView === 'function' && isBahrainView());
  const out = ledger ? [{ l: 'Rebook', v: st.rebookPct, t: TARGETS.rebookPct, f: tpPct }] : [];
  if (!st.isBeauty && ledger) out.push({ l: 'Treat', v: st.treatmentPct, t: TARGETS.treatmentPct, f: tpPct });
  out.push({ l: 'Retail', v: st.retailPct, t: TARGETS.retailPct, f: tpPct });
  out.push({ l: 'Avg bill', v: st.avgBill, t: st.isBeauty ? TARGETS.beautyAvgBill : TARGETS.hairAvgBill, f: tpNum });
  return out;
}
// Podium: a ring per target, filled to the share of target reached (capped at a
// full ring), coloured by the same band as everywhere else.
function tpRings(st) {
  const r = 20, c = 2 * Math.PI * r;
  return tpTargets(st).map(m => {
    const v = Number(m.v) || 0, frac = m.t ? Math.min(1, v / m.t) : 0;
    return `<div class="tp-ring" title="${m.l}: ${m.f(v)}${m.t == null ? ', no target set' : ` against ${m.f(m.t)}`}">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="5"/>
        <circle class="${tpBand(v, m.t)}" cx="24" cy="24" r="${r}" fill="none" stroke-width="5" stroke-linecap="round"
          stroke-dasharray="${c * frac} ${c}" transform="rotate(-90 24 24)"/>
        <text x="24" y="28" text-anchor="middle">${m.f(v)}</text></svg>${m.l}${tpAim(m)}</div>`;
  }).join('');
}
// The aim printed under a figure. Kate, 1 Oct 2026 (Comet PR1): the colour said
// good or bad but the target itself was only in a hover tooltip, which a phone
// never shows, so nobody could see what a stylist was being read against.
function tpAim(m) {
  return m.t == null ? '' : `<small class="tp-aim tabular">aim ${m.f(m.t)}</small>`;
}
// Ranks 4-10: the same four targets as small tinted tiles.
function tpTiles(st) {
  return tpTargets(st).map(m => `<div class="tp-tile ${tpBand(m.v, m.t)}" title="${m.t == null ? 'no target set' : `target ${m.f(m.t)}`}">
    <span>${m.l}</span><b class="tabular">${m.f(m.v)}</b>${tpAim(m)}</div>`).join('');
}

// ── THE PAGE ─────────────────────────────────────────────────
// Async for one reason: aggByBranch() reads caches that renderDashboard() fills,
// and landing here directly — a bookmark, a reload on this view — would find
// them empty. Same guard the ledger pages use. refreshActiveView() already
// renders the dashboard before calling this, so on a filter change it is a
// no-op.
// Kate, 28 Sep 2026: Team Performance is two pages in the sidebar now, Podium Race
// (view 'team', #teamContent) and Takings vs Rebooking (view 'teamquad',
// #teamQuadContent). One renderer serves both and draws into whichever is on
// screen; the other is emptied so there is only ever one #tpTray in the page.
function tpPart() {
  const q = document.getElementById('view-teamquad');
  return (q && q.style.display !== 'none') ? 'quad' : 'race';
}
async function renderTeam() {
  const part = tpPart();
  const host  = document.getElementById(part === 'quad' ? 'teamQuadContent' : 'teamContent');
  const other = document.getElementById(part === 'quad' ? 'teamContent' : 'teamQuadContent');
  if (!host) return;
  if (other) other.innerHTML = '';
  if (!window._lastDashState && typeof renderDashboard === 'function') {
    host.innerHTML = '<div class="loading">Loading data...</div>';
    await renderDashboard();
  }

  // The emptiness test is the roster itself, not a weekly_data row count: on a
  // part-week window there are no weekly rows at all and the figures come from
  // the daily join, so counting weeks would call a full page of data empty.
  const roster = tpRoster(tpDept);
  const branchLabel = sel.branch.includes('all')
    ? allLabel()
    : sel.branch.map(b => (BRANCH_INFO[b] || {}).name || b).join(', ');

  // Anyone dropped out of the selection leaves the tray with them — a compare
  // column for a stylist who is not in the filtered period would be a figure
  // from a window you are no longer looking at.
  const present = new Set(roster.map(tpKey));
  tpCompare = tpCompare.filter(k => present.has(k));

  // Kate, 28 Sep 2026: podium (1-3), chasing the podium (4-10), then the rest.
  const podium = roster.slice(0, 3);
  const chase  = roster.slice(3, 10);
  const rest   = roster.slice(10);
  const lead   = roster.length ? (roster[0].net || 0) : 0;
  const benchWord = tpDept === 'beauty' ? 'beauty bench' : 'hair floor';

  host.innerHTML = `
    <div class="tp-bar">
      <div class="tp-seg">
        <button class="${tpDept === 'hair'   ? 'on' : ''}" onclick="tpSetDept('hair')">Hair</button>
        <button class="${tpDept === 'beauty' ? 'on' : ''}" onclick="tpSetDept('beauty')">Beauty</button>
      </div>
      ${part === 'race' ? `<div class="tp-seg" role="group" aria-label="Rank by">
        <button class="${tpSort === 'net'   ? 'on' : ''}" onclick="tpSetSort('net')" title="One race, everyone ranked by net salon take">Takings</button>
        <button class="${tpSort === 'level' ? 'on' : ''}" onclick="tpSetSort('level')" title="Grouped by position (Style Director, Senior Stylist and so on), ranked by net take inside each group">Position</button>
      </div>` : ''}
      <span class="tp-bar-n">${branchLabel} · ${roster.length} ${roster.length === 1 ? 'person' : 'people'}</span>
      <span class="tp-bar-sp"></span>
      <span class="tp-bar-n">${part === 'quad' ? 'Tap a face' : 'Tap + on anyone'} to compare · up to ${TP_MAX_COMPARE}</span>
    </div>

    ${!roster.length ? '<div class="empty">Nobody on this bench in the selected period.</div>'
      : part === 'quad' ? (tpQuadrant(roster) || '<div class="empty">The chart needs at least four people on this bench.</div>') : `
      ${tpSort === 'level' ? tpByLevel(roster, lead) : `
      <div class="section-label">Leading this period
        <span class="tp-sec-n">by net salon take</span></div>
      <div class="tp-podium">${podium.map(tpPodiumCard).join('')}</div>

      ${chase.length ? `
        <div class="section-label">Chasing the podium
          <span class="tp-sec-n">ranks 4 to ${3 + chase.length} · bar is her take against the leader's · tiles are green at or above the aim, amber within a fifth of it, red below</span></div>
        <div class="tp-race">${chase.map((st, i) => tpChaseRow(st, i + 4, roster[i + 2], lead)).join('')}</div>` : ''}

      ${rest.length ? `
        <div class="section-label">The rest of the ${benchWord}
          <span class="tp-sec-n">${rest.length} ${rest.length === 1 ? 'person' : 'people'}</span></div>
        <div class="tp-race">${rest.map((st, i) => tpRaceRow(st, i + 11, lead)).join('')}</div>` : ''}
    `}`}

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

// Her name as the rest of the page prints it: first name (the Instagram link when
// she has one), surname in italics outside the link, wrapped for the hover menu.
function tpName(st, withIg) {
  const prof = (typeof staffProfile === 'function') ? staffProfile(st.name) : null;
  const nm = escapeHtml(tpTitle(st.name));   // title case, as in the quadrant panel
  const linked = (withIg && prof && prof.ig)
    ? `<a href="https://instagram.com/${encodeURIComponent(prof.ig)}" target="_blank" rel="noopener noreferrer"
         title="@${escapeHtml(prof.ig)} on Instagram">${nm}</a>`
    : nm;
  const last = (typeof staffSurname === 'function') ? staffSurname(st.name) : (prof && prof.last);
  const html = linked + (last ? ` <span class="tp-last">${escapeHtml(last)}</span>` : '');
  return (typeof staffWho === 'function') ? staffWho(st.name, html, { dept: tpDept, branch: st.branchCode }) : html;
}
function tpAddBtn(st) {
  const picked = tpCompare.includes(tpKey(st));
  return `<button class="tp-add ${picked ? 'on' : ''}" onclick="tpPick('${tpKey(st).replace(/'/g, "\\'")}')"
      aria-label="${picked ? 'Remove from comparison' : 'Add to comparison'}">${picked ? '✓' : '+'}</button>`;
}
// The race bar: her net take as a share of the leader's, in her home branch colour.
// A floor of 18% keeps the figure inside the bar readable for the smallest books.
function tpBar(st, lead, cls) {
  const w = lead ? Math.max(18, (st.net || 0) / lead * 100) : 18;
  return `<div class="tp-trk ${cls || ''}"><div class="tp-fill tabular" style="width:${Math.min(100, w)}%;background:${st.branchColor}">${tpAed(st.net)}</div></div>`;
}
function tpRoleBranch(st) {
  return `${escapeHtml(tpRole(st))} · ${(st.branches || [{ name: st.branchName }]).map(b => escapeHtml(b.name)).join(' + ')}`;
}

// Kate, 28 Sep 2026 (sample C): podium centred and photo-led, net take large,
// and the four targets as rings under it instead of the old benchmark bars.
function tpPodiumCard(st, i) {
  const medal = ['#E7C86A', '#C9CBD1', '#D3A17A'][i] || 'var(--border)';
  return `<div class="card tp-pod" style="--tp-medal:${medal}">
    <div class="tp-pod-rk">${i + 1}</div>
    ${tpAddBtn(st)}
    ${tpAvatar(st.name, 'lg')}
    <div class="tp-pod-nm">${tpName(st, true)}</div>
    <div class="tp-role">${escapeHtml(tpRole(st))}</div>
    <div class="tp-branch">${tpBranchTag(st)}</div>
    <div class="tp-pod-v tabular">${tpAed(st.net)}</div>
    <div class="tp-pod-s tabular">${tpNum(st.total)} clients${(typeof isBahrainView === 'function' && isBahrainView()) ? '' : ` · ${tpNum(st.rebooked)} rebooked`}</div>
    <div class="tp-rings">${tpRings(st)}</div>
  </div>`;
}

// Ranks 4-10: a fuller row than the rest, with the four targets as tiles and how
// far she sits behind the person one place above her.
function tpChaseRow(st, rank, ahead, lead) {
  const gap = ahead ? Math.max(0, (ahead.net || 0) - (st.net || 0)) : 0;
  return `<div class="card tp-ch">
    <span class="tp-ch-rk tabular">${rank}</span>
    ${tpAvatar(st.name)}
    <div class="tp-ch-who">
      <div class="tp-row-nm">${tpName(st)}</div>
      <div class="tp-row-s">${tpRoleBranch(st)}</div>
      ${ahead ? `<div class="tp-gap tabular">${tpAed(gap)} behind ${escapeHtml(ahead.name)}</div>` : ''}
    </div>
    ${tpBar(st, lead, 'lg')}
    <div class="tp-tiles">${tpTiles(st)}</div>
    ${tpAddBtn(st)}
  </div>`;
}

// Everyone from 11 down, and every row of the Position view: one line, the bar
// and her rebooking, which is the figure that decides whether you look closer.
function tpRaceRow(st, rank, lead) {
  return `<div class="card tp-rr">
    <span class="tp-rk tabular">${rank}</span>
    ${tpAvatar(st.name, 'xs')}
    <div class="tp-ch-who">
      <div class="tp-row-nm">${tpName(st)}</div>
      <div class="tp-row-s">${tpRoleBranch(st)}</div>
    </div>
    ${tpBar(st, lead)}
    ${(typeof isBahrainView === 'function' && isBahrainView()) ? '<div class="tp-rb tabular"><b>—</b>rebook</div>'
      : `<div class="tp-rb tabular ${tpBand(st.rebookPct, TARGETS.rebookPct)}"><b>${tpPct(st.rebookPct)}</b>rebook${tpAim({ t: TARGETS.rebookPct, f: tpPct })}</div>`}
    ${tpAddBtn(st)}
  </div>`;
}

// Position view: one section per role, top of the ladder first, each ranked by
// net take (roster is already in that order). Bars stay scaled to the overall
// leader so a group's length still reads against the whole bench.
function tpByLevel(roster, lead) {
  const groups = {};
  roster.forEach(st => (groups[tpRole(st)] ||= []).push(st));
  return Object.keys(groups).sort((a, b) => tpRoleRank(a) - tpRoleRank(b)).map(r => `
      <div class="section-label">${escapeHtml(r)}
        <span class="tp-sec-n">${groups[r].length} ${groups[r].length === 1 ? 'person' : 'people'} · by net salon take</span></div>
      <div class="tp-race">${groups[r].map((st, i) => tpRaceRow(st, i + 1, lead)).join('')}</div>`).join('');
}

/* ── THE QUADRANT ─────────────────────────────────────────────
   Kate, 28 Sep 2026 (sample D). Net take across, rebooking up, split by the
   rebooking target and the bench's median take into four groups, with the side
   panel naming who sits in each. The owner is left off: her own few clients are
   not a floor figure to coach against. Needs four people to be worth drawing.

   Faces are the same head-over-the-block PNGs as the cards, drawn unclipped so
   the head still breaks out of the top; anyone without a shoot gets the dashed
   placeholder block with initials. Branch is the dot under each face. */
const TP_QUAD = {
  leak:  { t: 'Earning, not keeping', cls: 'warn', d: 'Above-median take, rebooking under target. The retention conversation.' },
  focus: { t: 'Needs support',        cls: 'bad',  d: 'Below-median take and below the rebooking target.' },
  star:  { t: 'Earning and keeping',  cls: 'good', d: 'Above-median take, rebooking at target.' },
  grow:  { t: 'Keeping, still building', cls: 'good', d: 'Clients come back; the book needs filling.' },
};
// The ledger spells names in capitals; the side panel reads them as names.
const tpTitle = n => String(n).toLowerCase().replace(/(^|[\s.'-])\S/g, c => c.toUpperCase());
function tpNiceMax(v) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = [1, 2, 2.5, 5, 10].find(s => s * p >= v);
  return m * p;
}
function tpQuadrant(roster) {
  const pts = roster.filter(st => tpRole(st) !== 'Owner');
  if (pts.length < 4) return '';
  const target = TARGETS.rebookPct;
  const nets = pts.map(st => st.net || 0).sort((a, b) => a - b);
  const median = nets[Math.floor(nets.length / 2)];
  const W = 820, H = 500, pad = { l: 58, r: 22, t: 26, b: 46 }, IW = 34, IH = 40;
  const xMax = tpNiceMax(nets[nets.length - 1]);
  const x = v => pad.l + Math.min(v, xMax) / xMax * (W - pad.l - pad.r);
  const y = v => pad.t + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - pad.t - pad.b);
  const k = v => v >= 1000 ? Math.round(v / 1000) + 'k' : String(Math.round(v));
  const group = st => (st.net || 0) >= median
    ? ((st.rebookPct || 0) >= target ? 'star' : 'leak')
    : ((st.rebookPct || 0) >= target ? 'grow' : 'focus');

  const axes = [0, 25, 50, 75, 100].map(v =>
      `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="tp-q-grid"/>
       <text x="${pad.l - 10}" y="${y(v) + 4}" text-anchor="end" class="tp-q-ax">${v}%</text>`).join('')
    + [0, .25, .5, .75, 1].map(f =>
      `<text x="${x(xMax * f)}" y="${H - pad.b + 20}" text-anchor="middle" class="tp-q-ax">${k(xMax * f)}</text>`).join('');

  // Kate, 1 Oct 2026 (Comet TR1): in the busy middle the faces sat on top of each
  // other and nobody could tell who was who or tap the right one. Each face now
  // starts on its exact point and is pushed off any face it overlaps, with a weak
  // pull back towards its point, then a last pass of pushes only. A face that had to
  // move keeps a small dot on its exact spot and a thin line to it, so the chart
  // still says where the figures are. Same input, same layout every time.
  const nodes = pts.map(st => {
    const tx = x(st.net || 0), ty = y(st.rebookPct || 0);
    return { st, tx, ty, x: tx, y: ty };
  });
  const MX = IW + 2, MY = IH - 4;
  const clampN = n => {
    n.x = Math.max(pad.l + IW / 2, Math.min(W - pad.r - IW / 2, n.x));
    n.y = Math.max(pad.t + IH / 2, Math.min(H - pad.b - IH / 2, n.y));
  };
  for (let it = 0; it < 160; it++) {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const ox = MX - Math.abs(dx), oy = MY - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      if (ox / MX < oy / MY) { const s = (dx >= 0 ? 1 : -1) * ox / 2; a.x -= s; b.x += s; }
      else { const s = (dy >= 0 ? 1 : -1) * oy / 2; a.y -= s; b.y += s; }
    }
    if (it < 120) nodes.forEach(n => { n.x += (n.tx - n.x) * 0.05; n.y += (n.ty - n.y) * 0.05; });
    nodes.forEach(clampN);
  }
  const leaders = nodes.filter(n => Math.hypot(n.x - n.tx, n.y - n.ty) > 6).map(n =>
    `<line x1="${n.tx}" y1="${n.ty}" x2="${n.x}" y2="${n.y}" class="tp-q-lead"/>
     <circle cx="${n.tx}" cy="${n.ty}" r="2.5" fill="${n.st.branchColor}" class="tp-q-true"/>`).join('');

  const faces = nodes.map(n => {
    const st = n.st;
    const cx = n.x, cy = n.y, on = tpCompare.includes(tpKey(st));
    const src = tpPhotoSrc(st.name);
    const face = src
      ? `<image href="${src}" x="${cx - IW / 2}" y="${cy - IH / 2}" width="${IW}" height="${IH}" preserveAspectRatio="xMidYMax meet"/>`
      : `<rect x="${cx - IW / 2 + 2}" y="${cy - IH / 2 + 8}" width="${IW - 4}" height="${IH - 8}" rx="7" class="tp-q-ph"/>
         <text x="${cx}" y="${cy + IH / 2 - 8}" text-anchor="middle" class="tp-q-in">${escapeHtml(initials(st.name))}</text>`;
    return `<g class="tp-q-dot" data-k="${escapeHtml(tpKey(st))}" onclick="tpPick('${tpKey(st).replace(/'/g, "\\'")}')">
      <title>${escapeHtml(st.name)} · ${tpAed(st.net)} · ${tpPct(st.rebookPct)} rebook · ${escapeHtml(tpRole(st))}</title>
      ${on ? `<rect x="${cx - IW / 2 - 4}" y="${cy - IH / 2 + 4}" width="${IW + 8}" height="${IH}" rx="9" class="tp-q-on"/>` : ''}
      ${face}
      <circle cx="${cx}" cy="${cy + IH / 2 + 6}" r="3.5" fill="${st.branchColor}"/></g>`;
  }).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net salon take against rebooking, one face per person">
    ${axes}
    <rect x="${x(median)}" y="${pad.t}" width="${W - pad.r - x(median)}" height="${y(target) - pad.t}" class="tp-q-star"/>
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(target)}" y2="${y(target)}" class="tp-q-tgt"/>
    <text x="${W - pad.r}" y="${y(target) - 7}" text-anchor="end" class="tp-q-tgt-l">rebook target ${target}%</text>
    <line x1="${x(median)}" x2="${x(median)}" y1="${pad.t}" y2="${H - pad.b}" class="tp-q-med"/>
    <text x="${x(median) + 6}" y="${pad.t + 14}" class="tp-q-ax">bench median ${tpAed(median)}</text>
    <text x="${(pad.l + W - pad.r) / 2}" y="${H - 6}" text-anchor="middle" class="tp-q-ttl">Net salon take →</text>
    <text transform="translate(14 ${(pad.t + H - pad.b) / 2}) rotate(-90)" text-anchor="middle" class="tp-q-ttl">Rebooking % →</text>
    ${leaders}${faces}</svg>`;

  const side = ['leak', 'focus', 'star', 'grow'].map(g => {
    const ps = pts.filter(st => group(st) === g);
    if (!ps.length) return '';
    return `<div class="tp-q-grp">
      <div class="tp-q-h ${TP_QUAD[g].cls}">${TP_QUAD[g].t} · ${ps.length}</div>
      <p>${TP_QUAD[g].d}</p>
      <div class="tp-q-chips">${ps.map(st => `<span class="tp-q-chip" data-k="${escapeHtml(tpKey(st))}" onmouseenter="tpQHl(this,true)" onmouseleave="tpQHl(this,false)" onclick="tpQHl(this,true)">${tpAvatar(st.name, 'xs')}<span class="tp-q-cn">${escapeHtml(tpTitle(st.name))}</span></span>`).join('')}</div>
    </div>`;
  }).join('');

  return `<div class="section-label">Takings against rebooking
      <span class="tp-sec-n">tap a face to compare · green dashed line: rebook target · grey dashed line: bench median take · shaded corner: above both · a dot and a thin line mean the face was moved off its exact spot to stay readable · point at a name to find her</span></div>
    <div class="tp-quad">
      <div class="card tp-q-plot">${svg}</div>
      <div class="card tp-q-side">${side}</div>
    </div>`;
}

// A name in the side lists lights her face on the chart and dims the rest
// (pointer on desktop, tap on a phone). Kate, 1 Oct 2026.
function tpQHl(el, on) {
  const svg = document.querySelector('.tp-q-plot svg');
  if (!svg) return;
  svg.classList.toggle('hl-on', !!on);
  svg.querySelectorAll('.tp-q-dot').forEach(g => {
    const hit = on && g.dataset.k === el.dataset.k;
    g.classList.toggle('hl', hit);
    if (hit) g.parentNode.appendChild(g);   // drawn last, so on top
  });
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
