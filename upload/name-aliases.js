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
  // Same pattern as LUCY/TAMMY/KIM below: MJ is the name on the page, same as her
  // stylist card (STAFF_PROFILES key 'MJ', photo mj.png). PHOREST_RECONCILE_ALIASES
  // in dashboard.js already has 'MJ': 'MARY JOY' to find her Phorest rows, so this
  // alias just closes the loop — without it her win cards read MARY JOY and her
  // profile lookup missed, so she showed initials instead of her card photo.
  // Kate, 10 Sep 2026.
  'MARY JOY': 'MJ',
  // Kate, 24 Sep 2026, off Branch Performance: Phorest writes her Marjorie (Sevilla),
  // her profile is keyed MARGIE. Assistant at Al Quoz.
  'MARJORIE': 'MARGIE',
  // Same day: the data writes him SIMOUN (his IG bio spells it that way too), his
  // profile is SIMON Faddoul, Al Quoz.
  'SIMOUN': 'SIMON',
  // Motor City writes Virginija as VIRGINIA; the profile is VIRGINIJA Lisauskaite.
  'VIRGINIA': 'VIRGINIJA',
  // Kate, 30 Sep 2026, off Takings vs Rebooking. Saadiyat's ledger wrote Shelley
  // (Douglas) as SHELEY for one week, 11-17 May 2026 (7 rows). And Al Quoz wrote
  // Marjorie as MARJ once (26 Jun 2026); she folds into MARGIE like MARJORIE does,
  // so the assistant filters catch her.
  'SHELEY': 'SHELLEY',
  'MARJ': 'MARGIE',
  // Same day: Khalifa City's ledger wrote Tammy by her full first name, TAMRYN,
  // on the one day she covered there (14 Feb 2026), so she had a second face.
  // TAMMY is the card name; PHOREST_RECONCILE_ALIASES still maps TAMMY to
  // Phorest's "Tamryn Peter".
  'TAMRYN': 'TAMMY',
  // Kate, 8 Oct 2026: one stylist, two Phorest profiles in Jan to Mar 2025: "Cory xx"
  // (Senior Stylist, Khalifa City and a day each at Saadiyat and Al Quoz) and "Cori Paul"
  // (Stylist, one Al Quoz booking on 4 Feb). Cori Paul is the Phorest spelling, so CORY
  // folds into CORI. Archived in Phorest; greyed out on the Podium Race.
  'CORY': 'CORI',
  // Kate, 8 Oct 2026: Tara is the owner across all four branches. The ledger writes her
  // TARA at Khalifa City, Saadiyat and Al Quoz and TARA KIDD at Motor City, so the Podium
  // Race showed her twice. TARA is the name the profile map and the photo fix key on.
  'TARA KIDD': 'TARA',
  // Kate, 15 Oct 2026: "reconcile names" off the Podium Race, where one person showed under two or three
  // spellings. Each is the ledger's own typo or short form for someone already on the page, same branch and
  // the dates running on from hers (14 Oct's surname-only pass left them separate; this folds the figures
  // too). Left alone on purpose, not clear enough to merge: Dina (hair), Kat, Anne, Nikka, Allan, Sarah.
  // Jaime Booth: the ledger wrote her JAIMIE (Jun to Dec 2022) and JAMIE (Jan to Feb 2023), KCA.
  'JAIMIE': 'JAIME',
  'JAMIE': 'JAIME',
  // Sherine Baghdadi: CHERINE Jan to Aug 2021 (KCA, Marasy), SHERINE from Sep 2021; Phorest has one Sherine.
  'CHERINE': 'SHERINE',
  // Mevil Miraflor (Blow-Dry Specialist): MEVEL one KCA day, MAVE KCA Jun to Sep 2022.
  'MEVEL': 'MEVIL',
  'MAVE': 'MEVIL',
  // Mihaela Solomei (Al Quoz): MIKAELA Nov 2023 to Mar 2024.
  'MIKAELA': 'MIHAELA',
  // Areanne Miranda (Al Quoz): AREAANE and ARREANE.
  'AREAANE': 'AREANNE',
  'ARREANE': 'AREANNE',
  // Ashleigh Fairgrieve: AHLEIGH and AHSLEIGH, Motor City, Jan to Feb 2023, as she started (30 Jan 2023).
  'AHLEIGH': 'ASHLEIGH',
  'AHSLEIGH': 'ASHLEIGH',
  // Clarissa Destacamento: CLARISA and CLARRISA, Motor City, Sep to Oct 2023, the week before she starts as CLARISSA.
  'CLARISA': 'CLARISSA',
  'CLARRISA': 'CLARISSA',
  // Xyrhy Unisa: XYRYH, Motor City, Aug 2024 (XYHRY is mapped above).
  'XYRYH': 'XYRHY',
  // One-day typos: RITCHEL (Motor City) is Richel Modilla, SAMATHA (Motor City) is Samantha Ahmad, LORI (KCA) is Lorie.
  'RITCHEL': 'RICHEL',
  'SAMATHA': 'SAMANTHA',
  'LORI': 'LORIE',
  // Lizanie Jacobsz: LIZ (KCA, 15 to 29 Sep 2024) runs straight into LIZANIE from 30 Sep; LIZANNE is two Saadiyat days in Nov 2024.
  'LIZ': 'LIZANIE',
  'LIZANNE': 'LIZANIE',
  // Kate, 15 Oct 2026: Phorest has Rany Altahesh as "Ranya x".
  'RANYA': 'RANY',
  // Kate, 15 Oct 2026: more ledger spellings of people already on the page. CAT (Marasy, May to Dec 2022) is Catrin Birkby; ALLAN and ALLAN JOSEPH
  // (Al Quoz) are Alan Joseph Russell; ABIGAEL (Saadiyat 2021) is Abigail Yanga; EMALYN is Emmalyn; MELIZZA is Melliza.
  'CAT': 'CATRIN',
  'ALLAN': 'ALAN',
  'ALLAN JOSEPH': 'ALAN',
  'ABIGAEL': 'ABIGAIL',
  'EMALYN': 'EMMALYN',
  'MELIZZA': 'MELLIZA',
};

function canonicalStaffName(name){
  if (!name) return name;
  const key = String(name).trim().toUpperCase();
  return STAFF_NAME_ALIASES[key] || name;
}
