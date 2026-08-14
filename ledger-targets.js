// ── LEDGER TARGETS ────────────────────────────────────────────
// The monthly targets from the Monday Target Sheet. Read out of
// "08 AUG 2026 TARGET SHEET" on 14 Aug 2026 — see docs/LEDGER-REFERENCE.md for
// the full structure of that sheet and where each number below comes from.
//
// WHY THIS FILE EXISTS: the dashboard could only ever show actuals. The ledger's
// whole spine is Target → MTD Actual → Variance → % Done → Remaining, which is
// what Emma coaches against, and nothing in Supabase holds a target. Same
// pattern as TARGETS in dashboard.js:12 — a hand-maintained config.
//
// ⚠️ HAND-UPDATED MONTHLY. One target sheet per month, same shape every month.
// When the September sheet lands, update `month`/`label` and the numbers, and
// nothing else has to change. If a figure here disagrees with Emma's sheet, this
// file is stale — it is not computed from anything.
//
// Load AFTER name-aliases.js: staff keys below are canonical UPPER CASE names,
// i.e. what canonicalStaffName() produces (Lucia → LUCY, Edz → EDS).

const LEDGER_TARGETS = {
  month: '2026-08',
  label: 'August 2026',
  prevLabel: 'July 2026',
  source: '08 AUG 2026 TARGET SHEET',

  // Benchmark ratios. These already agree with TARGETS in dashboard.js, and are
  // repeated per branch in the sheet rather than varied — every branch is held to
  // the same standard. Rebooking is 45% per branch; the sheet's group row shows
  // 44% because it is a weighted average of actuals, not a target.
  benchmarks: {
    rebookPct: 45,
    treatmentPct: 20,
    retailPct: 12,
    hairAvgBill: 650,
    beautyAvgBill: 200,
  },

  // Per-branch revenue targets.
  //
  // SOURCED FROM THE MTD PACING PANEL, not the left-hand roll-up. The two
  // disagree, and the panel is the one that is internally consistent — every
  // block's Grand Total is exactly the sum of its four branches, and Motor City
  // has a services figure there but no services row in its own section. The
  // roll-up's revenue targets do not sum their own branches (group hair-excl
  // reads 376,500 against a branch sum of 1,356,000), so they are stale.
  //
  // Client-count targets come from the branch sections, which DO reconcile:
  // 100 + 100 + 270 + 400 = 870 total, 225 new, 150 NCR, matching the group row.
  // Flagged for Kate: Saadiyat and Khalifa are set to 100 clients/month against
  // ~780 and ~640 actual, so those two look like placeholders rather than targets.
  branch: {
    SAA: {
      servicesTotal:     570000,
      retailTotal:        40000,
      hairServicesExcl:  500000,
      hairTreatment:      62400,
      hairRetail:         50000,
      beautyServices:     70000,
      totalClients:         100,
      newClients:            75,
      ncr:                   50,
      rebooked:              80,
      beautyRebooked:        15,
    },
    KCA: {
      servicesTotal:     530000,
      retailTotal:        30000,
      hairServicesExcl:  485000,
      hairTreatment:      60600,
      hairRetail:         30000,
      beautyServices:     45000,
      totalClients:         100,
      newClients:            75,
      ncr:                   50,
      rebooked:              80,
      beautyRebooked:        15,
    },
    AQ: {
      servicesTotal:     152500,
      retailTotal:        13000,
      hairServicesExcl:  131000,
      hairTreatment:      18120,
      hairRetail:         11500,
      beautyServices:     21500,
      totalClients:         270,
      newClients:            25,
      ncr:                   25,
      rebooked:              80,
      beautyRebooked:        15,
    },
    // Motor City runs hair only, so beautyServices is 0 rather than absent —
    // the pacing panel carries it as a real zero and the page renders a dash.
    MC: {
      servicesTotal:     250000,
      retailTotal:        20000,
      hairServicesExcl:  240000,
      hairTreatment:      30000,
      hairRetail:         20000,
      beautyServices:         0,
      totalClients:         400,
      newClients:            50,
      ncr:                   25,
      rebooked:             140,
      beautyRebooked:         0,
    },
  },

  // Per-stylist targets from the Daily Stylist Target tab.
  //
  // Keyed branch → dept → canonical name, and it has to stay that way: nicknames
  // repeat. Chalani works at both Khalifa and Motor City, and MJ and Shine each
  // appear under both HAIR and BEAUTY at Al Quoz. A name alone is not a key.
  //
  // `treatment: 0` on the beauty team is real, not missing — beauty carries no
  // treatment target in the sheet.
  staff: {
    SAA: {
      HAIR: {
        APRIL:    { services: 50000, treatment: 6000,  retail:  5000 },
        BETHANY:  { services: 25000, treatment: 3000,  retail:  3000 },
        EDS:      { services: 40000, treatment: 5000,  retail:  6000 },
        EMMA:     { services: 65000, treatment: 15000, retail: 15000 },
        HELEN:    { services: 10000, treatment: 1000,  retail:  1000 },
        HOLLY:    { services: 60000, treatment: 10000, retail:  5000 },
        JEIDA:    { services: 55000, treatment: 10000, retail:  5000 },
        MOLLY:    { services: 60000, treatment: 8000,  retail: 10000 },
        MYRA:     { services: 10000, treatment: 1000,  retail:  1000 },
        SHELLEY:  { services: 40000, treatment: 3000,  retail:  3000 },
        TAMMY:    { services: 50000, treatment: 5000,  retail:  5000 },
      },
      BEAUTY: {
        ARNALYN:  { services: 12500, treatment: 0, retail:  500 },
        JUDY:     { services: 12500, treatment: 0, retail:  500 },
        MONA:     { services: 18000, treatment: 0, retail: 1000 },
        REDA:     { services: 15000, treatment: 0, retail:  500 },
      },
    },
    KCA: {
      HAIR: {
        CHALANI:    { services: 42000, treatment: 6000,  retail: 2800 },
        'HAZEL MAE':{ services: 15000, treatment: 2000,  retail: 1000 },
        IRLYN:      { services: 35000, treatment: 5000,  retail: 3000 },
        KATE:       { services: 70000, treatment: 15000, retail: 5000 },
        KATIE:      { services: 55000, treatment: 8000,  retail: 3500 },
        KYLIE:      { services: 55000, treatment: 6000,  retail: 3500 },
        LIZANIE:    { services: 60000, treatment: 8000,  retail: 4000 },
        MAY:        { services: 40000, treatment: 8000,  retail: 3000 },
        MEVIL:      { services: 15000, treatment: 2000,  retail: 1000 },
        NIKKI:      { services: 75000, treatment: 10000, retail: 5000 },
        OLENA:      { services: 42000, treatment: 6000,  retail: 2800 },
      },
      BEAUTY: {
        GRACE: { services: 13000, treatment: 0, retail: 800 },
        KIM:   { services: 15000, treatment: 0, retail: 800 },
        MIMI:  { services: 13000, treatment: 0, retail: 800 },
        SHILA: { services: 15000, treatment: 0, retail: 800 },
      },
    },
    AQ: {
      HAIR: {
        ANDREA:  { services: 50000, treatment: 5000, retail: 5000 },
        AREANNE: { services:  5000, treatment:  500, retail:  500 },
        DORAH:   { services:  5000, treatment:  500, retail:  500 },
        IBRAHIM: { services: 50000, treatment: 5000, retail: 5000 },
        MJ:      { services: 10000, treatment:    0, retail:  500 },
        RUTH:    { services: 65000, treatment: 5000, retail: 6000 },
        SHINE:   { services: 10000, treatment:    0, retail:  500 },
      },
      BEAUTY: {
        GALINA: { services: 10000, treatment: 0, retail: 500 },
        MJ:     { services: 10000, treatment: 0, retail: 500 },
        SHINE:  { services: 10000, treatment: 0, retail: 500 },
      },
    },
    MC: {
      HAIR: {
        ALAN:     { services: 50000, treatment: 6000, retail: 4000 },
        ASHLEIGH: { services: 45000, treatment: 5000, retail: 4000 },
        CHALANI:  { services: 40000, treatment: 3000, retail: 3000 },
        CLARISSA: { services: 25000, treatment: 2000, retail: 1500 },
        ELISE:    { services: 40000, treatment: 3000, retail: 3000 },
        LUCY:     { services: 25000, treatment: 2000, retail: 2000 },
        ROBYN:    { services: 45000, treatment: 5000, retail: 4000 },
        XYRHY:    { services: 25000, treatment: 2000, retail: 1500 },
      },
      // Motor City has no beauty team in the sheet.
      BEAUTY: {},
    },
  },
};

// ── LOOKUPS ───────────────────────────────────────────────────
// The pages never index LEDGER_TARGETS directly: a target is often the sum of
// several branches (any multi-branch filter selection), and every caller would
// otherwise repeat the same reduce.

// Sum a branch-level target across a selection of branch codes. Pass the same
// array the filters hold — ['all'] expands to every active branch.
function ledgerBranchTarget(metric, branchCodes) {
  const codes = (!branchCodes || branchCodes.includes('all'))
    ? Object.keys(LEDGER_TARGETS.branch)
    : branchCodes;
  return codes.reduce((sum, code) => {
    const b = LEDGER_TARGETS.branch[code];
    return sum + ((b && b[metric]) || 0);
  }, 0);
}

// One stylist's targets, or null when she has none. Branch + dept + name,
// because nicknames repeat across both.
function ledgerStaffTarget(branchCode, dept, name) {
  const byBranch = LEDGER_TARGETS.staff[branchCode];
  if (!byBranch) return null;
  const byDept = byBranch[String(dept || '').toUpperCase() === 'BEAUTY' ? 'BEAUTY' : 'HAIR'];
  if (!byDept) return null;
  const key = typeof canonicalStaffName === 'function'
    ? String(canonicalStaffName(name) || '').toUpperCase()
    : String(name || '').trim().toUpperCase();
  return byDept[key] || null;
}

// Where else does this person have a target?
//
// Stylists cover shifts at other branches, and some have moved since the sheet
// was written — as of 14 Aug the live data has Irlyn, Grace and Shila working at
// Saadiyat while the sheet has them at Khalifa, and Ibrahim and Olena at Motor
// City against Al Quoz and Khalifa. ledgerStaffTarget() is deliberately strict
// about the branch, because a nickname is not unique and inventing a target for
// the wrong person would be worse than showing none. But a bare dash reads as a
// bug, so the pages use this to say "her target sits at Khalifa" instead.
//
// Returns the branch code, or null. Never used to supply a number — only to
// explain the absence of one.
function ledgerStaffTargetElsewhere(branchCode, dept, name) {
  const key = typeof canonicalStaffName === 'function'
    ? String(canonicalStaffName(name) || '').toUpperCase()
    : String(name || '').trim().toUpperCase();
  const d = String(dept || '').toUpperCase() === 'BEAUTY' ? 'BEAUTY' : 'HAIR';
  const found = Object.keys(LEDGER_TARGETS.staff).find(code =>
    code !== branchCode && LEDGER_TARGETS.staff[code][d] && LEDGER_TARGETS.staff[code][d][key]);
  return found || null;
}

// The pacing arithmetic, in one place so every block agrees.
//
// % done is raw progress through the target — deliberately NOT paced against
// elapsed days. The ledger does it this way, and Emma reads both side by side,
// so a "smarter" number here would just look like the dashboard is wrong.
function ledgerPace(actual, target) {
  const a = Number(actual) || 0;
  const t = Number(target) || 0;
  return {
    actual: a,
    target: t,
    variance:  a - t,
    pctDone:   t ? (a / t) * 100 : null,
    remaining: Math.max(0, t - a),
    onTrack:   t ? a >= t : null,
  };
}
