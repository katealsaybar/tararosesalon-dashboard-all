// ── STYLIST PROFILES ──────────────────────────────
// The hair and beauty teams, used by the Top Performer cards on the KPI dashboard
// and by the Stylist Cards view. Kate, 2026-08-12.
//
// Source: the "FINAL STYLIST CARD" Canva deck plus the matching HEAD ICON exports
// (27 stylists across four branches, Aug 2026), then the 2nd batch of cards and the
// "FINAL BEAUTICIAN CARD" deck (17 more, Sep 2026 - the blow-dry bench, the beauty
// team and the nail desk). Role and branch come from the icon filenames and their
// folders; Instagram handles were read off the A3 cards.
//
// Keyed by the CANONICAL staff name in UPPER CASE — the same name
// canonicalStaffName() (upload/name-aliases.js) produces, so a stylist logged
// under two spellings in Phorest still resolves to one profile. Load this file
// AFTER name-aliases.js.
//
//   last    surname, in Title Case. NOT written on the profiles — it is filled in
//           from STAFF_SURNAMES at the foot of this file, so the dashboard holds one
//           list of surnames and not two that drift apart. Kate, 2026-08-14: the
//           cards show it after the first name, set differently, so "KATE" reads as
//           a name and not a label. A stylist Phorest has no surname for renders on
//           her first name alone, which the optional-field rule below already allows
//           for — inventing one off an Instagram handle would put a made-up surname
//           on a real colleague.
//   photo   filename in assets/staff/. A transparent PNG of the stylist over her
//           card's accent block, head breaking out above it. See the README there.
//   role    Style Director | Senior Stylist | Stylist | Junior Stylist |
//           Blow-Dry Specialist | Senior Beauty Therapist | Beauty Therapist |
//           Senior Nail Technician | Nail Technician. A role added here must also be
//           added to STYLIST_ROLE_ORDER in dashboard.js, or everyone holding it sorts
//           to the top of their branch instead of into the list.
//   branch  BRANCH_INFO key — KCA | SAA | MC | AQ
//   ig      Instagram handle WITHOUT the leading @
//
// EVERY FIELD IS OPTIONAL AND INDEPENDENT. No photo = no avatar; no handle = the
// name stays plain text; anyone missing from this map renders exactly as the win
// card always has, and a photo that 404s hides itself rather than showing a broken
// image. That is what carried the beauty team while they had no cards, and it is
// what carries Arni now: she has a card but no cutout, so she renders without a face
// rather than with a broken one.
//
// Two source-file corrections are baked in rather than left to surprise someone:
// the icon named "RUTH - JUNIOR STYLIST" is actually AREANNE (verified against both
// A3 cards), and EDS is spelled EDZ on her card. Olena's card also carries Kylie's
// Instagram handle; the correct one is below.
const STAFF_PROFILES = {
  // -- Khalifa City A --
  'KATE':      { photo: 'kate.png',      role: 'Style Director', branch: 'KCA',  ig: 'katesirik' },
  'TEGAN':     { photo: 'tegan.png',     role: 'Style Director', branch: 'KCA',  ig: 'teganskinnerhair' },
  'KATIE':     { photo: 'katie.png',     role: 'Senior Stylist', branch: 'KCA',  ig: 'katiesanchez_' },
  'KYLIE':     { photo: 'kylie.png',     role: 'Senior Stylist', branch: 'KCA',  ig: 'thathairgirlkylie' },
  'NIKKI':     { photo: 'nikki.png',     role: 'Senior Stylist', branch: 'KCA',  ig: 'hairbynikki.na' },
  'OLENA':     { photo: 'olena.png',     role: 'Senior Stylist', branch: 'KCA',  ig: 'ostertag.olena' },
  'CHALANI':   { photo: 'chalani.png',   role: 'Stylist',        branch: 'KCA',  ig: 'authentics.ck' },
  'LIZANIE':   { photo: 'lizanie.png',   role: 'Stylist',        branch: 'KCA',  ig: 'lizaniejacobsz_hair' },
  'IRLYN':     { photo: 'irlyn.png',     role: 'Junior Stylist', branch: 'KCA',  ig: 'hairby_lyn11' },
  'MAY':       { photo: 'may.png',       role: 'Junior Stylist', branch: 'KCA',  ig: 'hairby_mhay' },
  // 2nd batch cards, Sep 2026 ("FINAL CARDS 2ND BATCH"): the blow-dry bench, the
  // beauty team and the nail desk. Branch comes from branch_staff_daily (home =
  // the branch with the recent rows), role and handle read off each card. HAZEL
  // MAE is NOT May — the ledger carries both at KCA as separate rows (May
  // Fernandez / Hazel Mae Marco); her card is the blow-dry one.
  'HAZEL MAE': { photo: 'hazel-mae.png', role: 'Blow-Dry Specialist',     branch: 'KCA', ig: 'hairby_hazelmae' },
  'MEVIL':     { photo: 'mevil.png',     role: 'Blow-Dry Specialist',     branch: 'KCA', ig: '' },
  'GRACE':     { photo: 'grace.png',     role: 'Senior Beauty Therapist', branch: 'KCA', ig: 'beautybygracels' },
  'MIMI':      { photo: 'mimi.png',      role: 'Senior Beauty Therapist', branch: 'KCA', ig: 'beauty_bymimi15' },
  'SHILA':     { photo: 'shila.png',     role: 'Senior Beauty Therapist', branch: 'KCA', ig: 'mandalshila' },
  'KIM':       { photo: 'kim.png',       role: 'Senior Nail Technician',  branch: 'KCA', ig: 'kimberly_nails27' },
  // Her card shipped with the photo box empty — no cutout to make yet.
  //
  // Keyed ARNALYN, and filed at Saadiyat. Both were wrong here until 4 Sep 2026 and
  // for the same reason: this entry was written by looking up ARNI, which only ever
  // matches her 21 Khalifa cover days. Under ARNALYN she has 212 Saadiyat rows since
  // February, so her review saying Mamsha was right all along. The key matters
  // because staffProfile() and the surname join both canonicalise first — as ARNI
  // she matched neither STAFF_SURNAMES nor anything the ledger writes, which is why
  // her card had no surname on it.
  'ARNALYN':   {                         role: 'Nail Technician',         branch: 'SAA', ig: 'nailsby_rni13' },
  // Assistants. Kate, 4 Sep 2026: they work the floor and belong on the dashboard as
  // Assistant, which is why the role joined STYLIST_ROLE_ORDER at the same time. No
  // photo for any of them yet, which the map allows - the name renders plain.
  'CHONA':     { role: 'Assistant', branch: 'KCA' },
  'ESTHER':    { role: 'Assistant', branch: 'KCA' },
  'PEARL':     { role: 'Assistant', branch: 'KCA' },
  // A cell two assistants shared for a week, named after both of them.
  'CHONA/ ESTHER': { role: 'Assistant', branch: 'KCA' },
  'ESTHER/PEARL':  { role: 'Assistant', branch: 'KCA' },

  // -- Mamsha Al Saadiyat --
  'EMMA':      { photo: 'emma.png',      role: 'Style Director', branch: 'SAA',  ig: 'emmalou.williamson' },
  'JEIDA':     { photo: 'jeida.png',     role: 'Style Director', branch: 'SAA',  ig: 'jeida11' },
  'HOLLY':     { photo: 'holly.png',     role: 'Senior Stylist', branch: 'SAA',  ig: 'holly_the_hairdresser' },
  'MOLLY':     { photo: 'molly.png',     role: 'Senior Stylist', branch: 'SAA',  ig: 'mollyrobinsonhair' },
  'APRIL':     { photo: 'april.png',     role: 'Stylist',        branch: 'SAA',  ig: 'april_apple_13' },
  'BETHANY':   { photo: 'bethany.png',   role: 'Stylist',        branch: 'SAA',  ig: 'bethanysmith.hair' },
  'SHELLEY':   { photo: 'shelley.png',   role: 'Stylist',        branch: 'SAA',  ig: 'shelley_the_global_hairstylist' },
  'TAMMY':     { photo: 'tammy.png',     role: 'Stylist',        branch: 'SAA',  ig: 'tammy_peter_hair' },
  'EDS':       { photo: 'eds.png',       role: 'Junior Stylist', branch: 'SAA',  ig: 'edzasuncion' },
  // 2nd batch cards, Sep 2026 — see the KCA note above. Helen's card carries no
  // Instagram handle (Kate: "yung iba wala talaga"), so hers stays blank.
  //
  // MYRA moved bench between the two card batches: her 31 Aug card said Junior
  // Stylist, the 3 Sep one says Blow-Dry Specialist and the contents page files her
  // under Saadiyat's blow-dry bench beside Helen. KIM moved the same way, Nail Art
  // Expert to Senior Nail Technician. The card wins - it is the newer document and
  // it is the one a client reads.
  'MYRA':      { photo: 'myra.png',      role: 'Blow-Dry Specialist',     branch: 'SAA', ig: 'hairstyle_by_myra' },
  'HELEN':     { photo: 'helen.png',     role: 'Blow-Dry Specialist',     branch: 'SAA', ig: '' },
  'MONA':      { photo: 'mona.png',      role: 'Senior Beauty Therapist', branch: 'SAA', ig: 'hairnbeautyby_mona' },
  'REDA':      { photo: 'reda.png',      role: 'Senior Beauty Therapist', branch: 'SAA', ig: 'beautybyreda' },
  'SANIA':     { photo: 'sania.png',     role: 'Senior Beauty Therapist', branch: 'SAA', ig: 'sania.tararose' },
  'JUDY':      { photo: 'judy.png',      role: 'Nail Technician',         branch: 'SAA', ig: 'nailsbyjudy.1' },
  // Saadiyat's assistants shared a cell, so the block is named after the people IN it, not
  // after anyone they assisted (Kate, 4 Sep 2026, correcting the opposite note). Every one
  // of these is an Assistant because that is what those people were at the time: Myra is a
  // Blow-Dry Specialist now and May a Junior Stylist, and both keep their own entries
  // above; the shared cell is the older, assistant-era record. 174 rows in all.
  'MYRA/APOL':          { role: 'Assistant', branch: 'SAA' },
  'MYRA/MICHELLE':      { role: 'Assistant', branch: 'SAA' },
  'MYRA/KATHY':         { role: 'Assistant', branch: 'SAA' },
  'MYRA/MAY':           { role: 'Assistant', branch: 'SAA' },
  'MYRA/MARIA':         { role: 'Assistant', branch: 'SAA' },
  'MYRA/APOL/XAVRINA':  { role: 'Assistant', branch: 'SAA' },
  'MARIA/APOL':         { role: 'Assistant', branch: 'SAA' },
  'MAY/XAV':            { role: 'Assistant', branch: 'SAA' },
  'APOL':      { role: 'Assistant', branch: 'SAA' },
  'KATHY':     { role: 'Assistant', branch: 'SAA' },
  'MARIA':     { role: 'Assistant', branch: 'SAA' },   // Maria Theresa
  // A leaver, let go when the staff was reduced (Christine, 4 Sep 2026). Stays here on
  // purpose: the tables list whoever had sales in the window you are looking at, and her
  // 22 days run Jan to May 2025.
  'XAVRINA':   { role: 'Assistant', branch: 'SAA' },

  // -- Motor City --
  'ALAN':      { photo: 'alan.png',      role: 'Style Director', branch: 'MC',   ig: 'alan_joseph_hair' },
  'ASHLEIGH':  { photo: 'ashleigh.png',  role: 'Style Director', branch: 'MC',   ig: 'ashleighfairgrievehair' },
  'LUCY':      { photo: 'lucy.png',      role: 'Style Director', branch: 'MC',   ig: 'lucy.glow.hair' },
  'ELISE':     { photo: 'elise.png',     role: 'Senior Stylist', branch: 'MC',   ig: 'ehfhair' },
  'ROBYN':     { photo: 'robyn.png',     role: 'Senior Stylist', branch: 'MC',   ig: 'robynharthair' },
  // 2nd batch cards, Sep 2026 — see the KCA note above.
  'CLARISSA':  { photo: 'clarissa.png',  role: 'Blow-Dry Specialist', branch: 'MC', ig: 'hairbyclarissa' },
  'XYRHY':     { photo: 'xyrhy.png',     role: 'Blow-Dry Specialist', branch: 'MC', ig: 'hairgoalsbyxy' },
  'ERCELY':    { role: 'Assistant', branch: 'MC' },

  // -- Al Quoz --
  'RUTH':      { photo: 'ruth.png',      role: 'Style Director', branch: 'AQ',   ig: 'rainbowsby_ruth' },
  'IBRAHIM':   { photo: 'ibrahim.png',   role: 'Senior Stylist', branch: 'AQ',   ig: 'almofdi.hairstylist' },
  'AREANNE':   { photo: 'areanne.png',   role: 'Junior Stylist', branch: 'AQ',   ig: 'hairbyareanne' },
  // 2nd batch cards, Sep 2026 — see the KCA note above. MJ is keyed the way the
  // ledger writes her (MJ, not Mary Joy — 242 recent AQ rows against none).
  'SHINE':     { photo: 'shine.png',     role: 'Beauty Therapist', branch: 'AQ', ig: 'beauty_by_shineshine' },
  'MJ':        { photo: 'mj.png',        role: 'Nail Technician',  branch: 'AQ', ig: 'mj_torresgalos' },
  'IVY':       { role: 'Assistant', branch: 'AQ' },
  'LUNINGNING':{ role: 'Assistant', branch: 'AQ' },
};

// ── SURNAMES ──────────────────────────────────────────────────
// Everyone the ledgers can show, not just the 27 with a card: the beauty bench and
// the leavers are in here too, because the tables list whoever had sales in the
// window you are looking at and a leaver still appears across the months she
// worked. The Phorest TSV of 31 May 2026, keyed the way canonicalStaffName()
// produces (UPPER CASE), since the ledger writes first names in caps.
//
// Kate, 14 Aug 2026 — the Ledgers tables show first name + surname now, the way the
// stylist cards do, so this had to cover the whole team rather than the card roster.
// stylist/stylist.js carries its own Title-Case copy of the same TSV for the
// standalone Stylist page, which does not load this file. If a surname changes,
// both need it.
//
// Kate, 14 Aug 2026 — CHALANI and IVY are filled in now, read off the Staff
// Performance Overview upload rather than the TSV: "Chalani Kaushallya" (first seen
// 30 Jul 2026, i.e. after the TSV was taken) and "Ivy Sierra". Phorest is the payroll
// system, so its spelling is the authority.
//
// Still missing on purpose rather than forgotten: "Lhang Ann" carries a literal "."
// where her surname belongs in Phorest, so hers is genuinely blank at source. She
// renders on the first name alone — a made-up surname on a real colleague is worse
// than none.
const STAFF_SURNAMES = {
  'ALAN':      'Russell',
  'APRIL':     'Miraflor',
  'AREANNE':   'Miranda',
  'ARNALYN':   'Salisi',
  'ASHLEIGH':  'Fairgrieve',
  'BETHANY':   'Smith',
  'CHALANI':   'Kaushallya',
  'CLARISSA':  'Destacamento',
  'CHONA':     'Manlapaz',
  'DAISY':     'Cropper',
  'DANIKA':    'Ogrady',
  'DORAH':     'Namayanja',
  'EDS':       'Asuncion',
  'ELISE':     'Ford',
  'EMMA':      'Williamson',
  'GALINA':    'Spierling',
  'GONCALO':   'de Almeida',
  'GRACE':     'Sarmiento',
  'HAZEL MAE': 'Marco',
  'HELEN':     'Lita',
  'HOLLY':     'Branchett',
  'IBRAHIM':   'Al Mofdi',
  'IRLYN':     'Padilla',
  'IVY':       'Sierra',
  'JEIDA':     'Rachmanova',
  'JUDY':      'Barias',
  'KATE':      'Siryk',
  'KATIE':     'Sanchez',
  'KIM':       'Casas',
  'KIMBERLY':  'Casas',
  'KYLIE':     'Bazely',
  'LIZANIE':   'Jacobsz',
  'LUCIA':     'Rodriguez',
  'LUCY':      'Rodriguez',
  'MARIA THERESA':    'Lascanu',
  'MARJORIE':  'Sevilla',
  'MARY JOY':  'Galos',
  'MAY':       'Fernandez',
  'MEVIL':     'Miraflor',
  'MIMI':      'Vertudes',
  'MJ':        'Galos',
  'MOLLY':     'Robinson',
  'MONA':      'Soba',
  'MYRA':      'Sarmiento',
  'NIKKI':     'Asuncion',
  'OLENA':     'Ostertag',
  'OLIVER':    'Green',
  'PEARL':     'Lozano',   // assistant — Kate, 1 Sep 2026
  'PRINCESS':  'Miranda',
  'PRINCESS AREANNE': 'Miranda',
  'REDA':      'Ramirez',
  'ROBYN':     'Hart',
  'ROJA':      'Pudtado',
  'ROVINA':    'Jordan',
  'RUTH':      'Bocock',
  'SAMANTHA':  'Ahmad',
  'SANIA':     'Ayaz',
  'SHELLEY':   'Douglas',
  'SHILA':     'Mandal',
  'SHINE':     'Castillo',
  'SOPHIE':    'Harrison',
  'STELLA':    'Mendes',
  'STUART':    'Hastings',
  'TAMMY':     'Peter',
  'TAMRYN':    'Peter',
  'TARA':      'Kidd',
  'TEGAN':     'Skinner',
  'TONI':      'Brits',
  'XYRHY':     'Unisa',
  'ZANDRI':    'Wilson',
};

// The surname on its own, canonical name in and Title Case out, or null when we do
// not know it. Everything that prints a name goes through this rather than reading
// the map, so aliases (Lucia → Lucy, Edz → Eds) resolve in one place.
function staffSurname(name) {
  if (!name) return null;
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName(name) : name;
  return STAFF_SURNAMES[String(canon).trim().toUpperCase()] || null;
}

// The profiles carry their surname from the map above, so the stylist cards keep
// reading profile.last and there is still only one list to edit.
Object.keys(STAFF_PROFILES).forEach(key => {
  const last = STAFF_SURNAMES[key];
  if (last) STAFF_PROFILES[key].last = last;
});

function staffProfile(name) {
  if (!name) return null;
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName(name) : name;
  return STAFF_PROFILES[String(canon).trim().toUpperCase()] || null;
}
