// ── TARGETS FROM SUPABASE ────────────────────────────────────
// Kate, 4 Sep 2026: "i-flip mo na yung dashboard para sa supabase."
//
// ledger-targets.js is a hand-typed file holding exactly one month. That was the
// whole limitation the Ledgers pages were built around: lgTargetsApply() drops
// Target, Variance, % done and Remaining on every month except the one somebody
// last keyed in, because measuring June's takings against the August sheet would
// be worse than showing nothing. The file's own comment named the fix —
//
//     "When a past target sheet is keyed in, this is the only thing that has to
//      change: LEDGER_TARGETS becomes a map by month and lgTargetsApply() asks it
//      for the selected one. Nothing on the pages needs to know."
//
// — and this is that, with Supabase as the map. The Upload Portal's Targets tab
// writes staff_targets and branch_targets a month at a time, so every month
// anybody has pasted now carries its own targets and the pages follow the Month
// picker instead of being pinned to one.
//
// THE FILE IS STILL THE FALLBACK, not dead weight. Any month Supabase has wins;
// August 2026 still comes off ledger-targets.js because that is where it was
// keyed and nobody is going back to re-paste it. The two never merge for one
// month, which matters: half a month from each would be a set of figures that
// never appeared on any sheet.
//
// WHERE EACH BRANCH METRIC COMES FROM. The pages ask ledgerBranchTarget() for
// eleven. Six are money and are summed out of staff_targets, per dept:
//
//     hairRevenue      Σ service_target   where dept = HAIR
//     beautyServices   Σ service_target   where dept = BEAUTY
//     servicesTotal    the two above
//     hairTreatment    Σ treatment_target where dept = HAIR
//     hairRetail       Σ retail_target    where dept = HAIR
//     retailTotal      Σ retail_target    across both
//
// which reproduces the sheet's own definitions: servicesTotal is hair INCLUDING
// treatments plus beauty, so LG_SERVICES_TARGET's ['servicesTotal','-hairTreatment']
// still gives services excluding treatments, and LG_TOTAL_TARGET still adds retail
// on top. The other five are head counts and cannot be derived from money at all —
// they are typed into the Targets tab off Emma's Monday sheet and read straight
// off the branch_targets row.
//
// A NULL HEAD COUNT IS NOT A ZERO. Nobody keying the client-count boxes must read
// as "no target", the way a blank already does on these pages, and not as a target
// of zero clients that every branch is beating by hundreds. So the metric is
// reported as absent and the row keeps its dash.

// month -> { branch: {CODE: {metrics}}, staff: {CODE:{HAIR:{},BEAUTY:{}}}, staffCount, branches }
// A month that has been fetched and holds nothing is cached as null, so an empty
// month is asked for once rather than on every render.
const LG_DB_TARGETS = {};
const lgDbInflight = {};

function lgDbHas(month){
  return !!(month && LG_DB_TARGETS[month]);
}

// The metrics a branch row can supply, in the shape ledgerBranchTarget() reads.
// Money keys always exist (a branch with rows has sums, even if they are 0);
// the five counts are present only when somebody keyed them.
function lgDbBranchMetrics(staffRows, branchRow){
  const sum = (dept, col) => staffRows
    .filter(r => !dept || r.dept === dept)
    .reduce((n, r) => n + (Number(r[col]) || 0), 0);

  const hairRevenue    = sum('HAIR', 'service_target');
  const beautyServices = sum('BEAUTY', 'service_target');
  const m = {
    hairRevenue,
    beautyServices,
    servicesTotal:  hairRevenue + beautyServices,
    hairTreatment:  sum('HAIR', 'treatment_target'),
    hairRetail:     sum('HAIR', 'retail_target'),
    retailTotal:    sum(null, 'retail_target'),
  };
  // Head counts, only where set. `== null` catches both null and undefined and is
  // the one place this file wants that looseness.
  const counts = { totalClients:'total_clients', newClients:'new_clients', ncr:'ncr',
                   rebooked:'rebooked', beautyRebooked:'beauty_rebooked' };
  Object.entries(counts).forEach(([metric, col]) => {
    const v = branchRow ? branchRow[col] : null;
    if (v !== null && v !== undefined) m[metric] = Number(v);
  });
  return m;
}

// One fetch per month, deduplicated: four renders fire on a month change and each
// awaits this, so without lgDbInflight the same month would be pulled four times.
async function lgLoadDbTargets(month){
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  if (month in LG_DB_TARGETS) return LG_DB_TARGETS[month];
  if (lgDbInflight[month]) return lgDbInflight[month];

  lgDbInflight[month] = (async () => {
    const iso = `${month}-01`;
    let staff = [], branches = [];
    try {
      const [s, b] = await Promise.all([
        sb.from('staff_targets').select('*').eq('month', iso),
        sb.from('branch_targets').select('*').eq('month', iso),
      ]);
      // A missing table or a network failure must leave the pages exactly as they
      // were, on the file. Cached as null so it is not retried every render.
      if (s.error || b.error) { LG_DB_TARGETS[month] = null; return null; }
      staff = s.data || [];
      branches = b.data || [];
    } catch (e) {
      LG_DB_TARGETS[month] = null; return null;
    }
    if (!staff.length) { LG_DB_TARGETS[month] = null; return null; }

    const byBranch = {};
    staff.forEach(r => { (byBranch[r.branch] = byBranch[r.branch] || []).push(r); });
    const branchRow = {};
    branches.forEach(r => { branchRow[r.branch] = r; });

    const out = { branch: {}, staff: {}, staffCount: staff.length,
                  branches: Object.keys(byBranch).sort() };
    Object.entries(byBranch).forEach(([code, rows]) => {
      out.branch[code] = lgDbBranchMetrics(rows, branchRow[code]);
      const dept = { HAIR: {}, BEAUTY: {} };
      rows.forEach(r => {
        const d = String(r.dept).toUpperCase() === 'BEAUTY' ? 'BEAUTY' : 'HAIR';
        // Same shape ledgerStaffTarget() has always returned, so every caller and
        // every export column is untouched.
        dept[d][String(r.staff_name).toUpperCase()] = {
          services:  Number(r.service_target)   || 0,
          treatment: Number(r.treatment_target) || 0,
          retail:    Number(r.retail_target)    || 0,
        };
      });
      out.staff[code] = dept;
    });

    LG_DB_TARGETS[month] = out;
    return out;
  })();

  try { return await lgDbInflight[month]; }
  finally { delete lgDbInflight[month]; }
}

// Which set is in force for the month on screen. Returned rather than branched on
// at every call site, so "Supabase for September, the file for August" is decided
// once and the four lookup functions below stay short.
//
// `month` defaults to the Ledgers month picker. The Pulse and the stylist cards
// call the lookups without a month in scope, and they only ever ask about the
// month they are already showing, which is the same one.
function lgTargetSource(month){
  const m = month || (typeof lgMonth !== 'undefined' ? lgMonth : null);
  if (lgDbHas(m)) return { kind: 'db', data: LG_DB_TARGETS[m], month: m };
  const file = (typeof LEDGER_TARGETS !== 'undefined') ? LEDGER_TARGETS : null;
  if (file && m === file.month) return { kind: 'file', data: file, month: m };
  return { kind: 'none', data: null, month: m };
}

// One line for the provenance paragraphs, so every page says where its own
// figures came from rather than all of them naming the file.
function lgTargetSourceLabel(month){
  const src = lgTargetSource(month);
  if (src.kind === 'db'){
    return `<code>staff_targets</code> in Supabase, pasted into the Upload Portal's Targets tab`;
  }
  if (src.kind === 'file'){
    return `<code>ledger-targets.js</code>, read out of ${src.data.source} and keyed by hand`;
  }
  return 'no target sheet for this month';
}
