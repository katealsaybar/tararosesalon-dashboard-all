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
};

function canonicalStaffName(name){
  if (!name) return name;
  const key = String(name).trim().toUpperCase();
  return STAFF_NAME_ALIASES[key] || name;
}
