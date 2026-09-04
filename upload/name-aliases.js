// ── STAFF NAME RECONCILIATION ──────────────────────────────────
// Phorest data entry sometimes splits one stylist's numbers across two
// spellings (e.g. a typo'd second row). Map every known misspelling to
// the canonical name here — applied right after data loads in both the
// Staff Performance and Sheets Sync tabs, so branch totals, sorting, and
// the column value filter all see one name instead of two.
const STAFF_NAME_ALIASES = {
  'LIZANNIE': 'LIZANIE',
  // Her stylist card in the Canva deck spells her EDZ; EDS is the correct
  // spelling and the one the ledger uses (Kate confirmed, 2026-08-12).
  'EDZ': 'EDS',
  // One stylist, logged both ways: 368 rows as LUCIA (Motor City, Saadiyat) and 16
  // as LUCY (Al Quoz). Phorest knows her only as Lucia Gonzalez Rodriguez, while
  // her stylist card says Lucy — so LUCY is canonical for display and LUCIA folds
  // into it. Kate confirmed same person, 2026-08-12. Branch attribution is
  // per-row, so merging the name moves no revenue between branches.
  'LUCIA': 'LUCY',
  // Motor City wrote her XYHRY on 31 Aug 2026. XYRHY is the spelling (Kate, 3 Sep 2026).
  'XYHRY': 'XYRHY',
  // Both found by the Targets tab's roster check on the September target sheets,
  // which flagged them as names no branch's ledger has ever seen (Kate, 4 Sep 2026).
  //
  // Saadiyat's target sheet writes Bethany as BETH. Nothing else does: BETHANY has
  // 212 ledger rows at Saadiyat since February and BETH has none anywhere.
  'BETH': 'BETHANY',
  // One person, and ARNALYN is the spelling: 219 ledger rows (212 Saadiyat, 7
  // Khalifa) against 21 for ARNI, all of them Khalifa cover days between March and
  // July. dashboard.js already said so in a comment beside its own reconcile map;
  // this is the same fact, in the one place every page reads. Branch attribution is
  // per row, so folding the name moves no revenue between branches.
  'ARNI': 'ARNALYN',
};

function canonicalStaffName(name){
  if (!name) return name;
  const key = String(name).trim().toUpperCase();
  return STAFF_NAME_ALIASES[key] || name;
}
