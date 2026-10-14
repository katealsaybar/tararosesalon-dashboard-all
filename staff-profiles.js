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
//   alsoAt  optional list of OTHER branch keys she also works at, e.g. ['SAA'].
//           Her card shows under each of them too, and her branch tag names all
//           of them. `branch` stays her home branch; everything else reads that.
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
  // Keyed ARNALYN, and filed at Saadiyat. Both were wrong here until 4 Sep 2026 and
  // for the same reason: this entry was written by looking up ARNI, which only ever
  // matches her 21 Khalifa cover days. Under ARNALYN she has 212 Saadiyat rows since
  // February, so her review saying Mamsha was right all along. The key matters
  // because staffProfile() and the surname join both canonicalise first — as ARNI
  // she matched neither STAFF_SURNAMES nor anything the ledger writes, which is why
  // her card had no surname on it.
  'ARNALYN':   { photo: 'arni.png',      role: 'Nail Technician',         branch: 'SAA', ig: 'nailsby_rni13' },
  // Assistants. Kate, 4 Sep 2026: they work the floor and belong on the dashboard as
  // Assistant, which is why the role joined STYLIST_ROLE_ORDER at the same time. No
  // photo for any of them yet, which the map allows - the name renders plain.
  // Kate, 19 Sep 2026: the ledger sometimes writes two assistants sharing a cell
  // as "CHONA/ ESTHER" or "ESTHER/PEARL" for the week — that used to render as its
  // own combined Staff Card ("two different people, not one"). Removed; each
  // assistant already has her own row below, which is the correct card.
  'CHONA':     { role: 'Assistant', branch: 'KCA' },
  'ESTHER':    { role: 'Assistant', branch: 'KCA' },
  'PEARL':     { role: 'Assistant', branch: 'KCA' },
  // Kate, 19 Sep 2026, confirmed off Phorest's own Staff list (Category: Assistant):
  // "laila pabico is an assistant pls mark her off as such". Filed here rather than
  // under Saadiyat — Kate confirmed she genuinely covers both (422 KCA vs 378 SAA
  // staff_utilisation rows, both still running through Sep 2026, not a one-off cover
  // shift) — but STAFF_PROFILES only carries one branch per card, and KCA edges it.
  'LAILA':     { role: 'Assistant', branch: 'KCA' },

  // -- Mamsha Al Saadiyat --
  // Kate, 8 Oct 2026: Emma and Ashleigh are educators now. `role` stays Style Director because
  // the dashboard counts and groups by it; `title` is what is printed beside their name
  // (org-chart.js has the same two titles).
  'EMMA':      { photo: 'emma.png',      role: 'Style Director', title: 'Treatments & Retail Educator', branch: 'SAA',  ig: 'emmalou.williamson' },
  'JEIDA':     { photo: 'jeida.png',     role: 'Style Director', branch: 'SAA',  ig: 'jeida11' },
  'HOLLY':     { photo: 'holly.png',     role: 'Senior Stylist', branch: 'SAA',  ig: 'holly_the_hairdresser' },
  // Kate, 24 Sep 2026: resigned 9 Sep 2026. Was only on the Former Stylists grid
  // through the Upload Portal's staff_status toggle; marked here too so the two agree.
  'MOLLY':     { photo: 'molly.png',     role: 'Senior Stylist', branch: 'SAA',  ig: 'mollyrobinsonhair', resigned: true },
  'APRIL':     { photo: 'april.png',     role: 'Stylist',        branch: 'SAA',  ig: 'april_apple_13' },
  'BETHANY':   { photo: 'bethany.png',   role: 'Stylist',        branch: 'SAA',  ig: 'bethanysmith.hair' },
  'SHELLEY':   { photo: 'shelley.png',   role: 'Stylist',        branch: 'SAA',  ig: 'shelley_the_global_hairstylist' },
  'TAMMY':     { photo: 'tammy.png',     role: 'Stylist',        branch: 'SAA',  ig: 'tammy_peter_hair' },
  // New joiner, Sep 2026 (Vicki Taylor — NOT Virginija Lisauskaite, a different,
  // separate new stylist also joining this month; Kate, 19 Sep 2026, confirmed
  // after the two got mixed up here). Ledger writes her VICKI (14 SAA Hair rows
  // since 7 Sep), also the name on her Canva card, so it's canonical with no
  // alias needed. No IG handle yet.
  'VICKI':     { photo: 'vicki.png',     role: 'Stylist',        branch: 'SAA',  ig: '' },
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
  'ASHLEIGH':  { photo: 'ashleigh.png',  role: 'Style Director', title: 'Blondes & Extensions Educator', branch: 'MC',   ig: 'ashleighfairgrievehair' },
  'LUCY':      { photo: 'lucy.png',      role: 'Style Director', branch: 'MC',   ig: 'lucy.glow.hair' },
  'ELISE':     { photo: 'elise.png',     role: 'Senior Stylist', branch: 'MC',   ig: 'ehfhair' },
  'ROBYN':     { photo: 'robyn.png',     role: 'Senior Stylist', branch: 'MC',   ig: 'robynharthair' },
  // 2nd batch cards, Sep 2026 — see the KCA note above.
  'CLARISSA':  { photo: 'clarissa.png',  role: 'Blow-Dry Specialist', branch: 'MC', ig: 'hairbyclarissa' },
  'XYRHY':     { photo: 'xyrhy.png',     role: 'Blow-Dry Specialist', branch: 'MC', ig: 'hairgoalsbyxy' },
  // New joiner, confirmed Motor City off the 17 Sep Phorest export ("Virginija
  // Lisauskaite", 2 visits that day, MC). Card photo added 21 Sep 2026.
  // Emma, 1 Oct 2026: she works between Saadiyat and Motor City, so she is shown
  // at Saadiyat too. Emma, 14 Oct 2026: she has moved to Saadiyat for good, so
  // Saadiyat is her branch now and Motor City is dropped.
  'VIRGINIJA': { photo: 'virginija.png', role: 'Stylist', branch: 'SAA', ig: 'hair_by_virginia_dxb' },
  'ERCELY':    { role: 'Assistant', branch: 'MC' },

  // -- Al Quoz --
  'RUTH':      { photo: 'ruth.png',      role: 'Style Director', branch: 'AQ',   ig: 'rainbowsby_ruth' },
  'IBRAHIM':   { photo: 'ibrahim.png',   role: 'Senior Stylist', branch: 'AQ',   ig: 'almofdi.hairstylist' },
  'AREANNE':   { photo: 'areanne.png',   role: 'Junior Stylist', branch: 'AQ',   ig: 'hairbyareanne' },
  // 2nd batch cards, Sep 2026 — see the KCA note above. MJ is keyed the way the
  // ledger writes her (MJ, not Mary Joy — 242 recent AQ rows against none).
  'SHINE':     { photo: 'shine.png',     role: 'Beauty Therapist', branch: 'AQ', ig: 'beauty_by_shineshine' },
  'MJ':        { photo: 'mj.png',        role: 'Nail Technician',  branch: 'AQ', ig: 'mj_torresgalos' },
  // Kate, 7 Sep 2026: photo and handle sent over WhatsApp-style, cut to 200px like the rest.
  'GALINA':    { photo: 'galina.png',    role: 'Beauty Therapist', branch: 'AQ', ig: 'galina_spierling' },
  'IVY':       { role: 'Assistant', branch: 'AQ' },
  'LUNINGNING':{ role: 'Assistant', branch: 'AQ' },
  // Kate, 9 Oct 2026: Eden Domasin is an assistant at Al Quoz.
  'EDEN':      { role: 'Assistant', branch: 'AQ' },
  // Kate, 17 Sep 2026, confirmed off Phorest's Staff list: Marjorie Sevilla, an
  // Assistant, not a stylist — the all-zero ledger rows under her name are exactly
  // what an assistant's row looks like, not a misread.
  'MARGIE':    { role: 'Assistant', branch: 'AQ' },
  // Kate, 7 Sep 2026: held with no card, pending visa + trade test. IG handle
  // added 19 Sep 2026 (instagram.com/andygladstone_hair); card photo 21 Sep 2026.
  'ANDREA':    { photo: 'andrea.png', role: 'Stylist', branch: 'AQ', ig: 'andygladstone_hair' },
  // Same visa/trade-test hold as Andrea above. IG handle added 21 Sep 2026
  // (instagram.com/semon.hairstyle, bio reads "Simoun Faddoul"); card photo same day.
  // Kate, 24 Sep 2026: Senior Stylist per Phorest, not Stylist; photo swapped for the
  // Senior Stylist background (new filename so no browser serves the old one).
  'SIMON':     { photo: 'simon-senior.png', role: 'Senior Stylist', branch: 'AQ', ig: 'semon.hairstyle' },

  // -- Former team, kept for the record (Kate, 17 Sep 2026) --
  // `resigned: true` renders the card in black-and-white/faded (dashboard.js
  // renderStylistCards()) instead of leaving them off the grid entirely. Photos
  // below were the plain colour crops from the standalone Stylist page until 19
  // Sep 2026, when Kate built a proper "RESIGNED" board in the FINAL STYLIST CARD
  // Canva file (pages 40-41) with a uniform black-and-white headshot per person —
  // these paths are that board's exports, cropped one-per-file. `role` is
  // their real former title (Kate, 24 Sep 2026), without a "Former" prefix since
  // the Former Stylists / Former Beauty Team heading already says it.
  'SAMANTHA': { photoFull: 'stylist/photos/KCA/samantha amad.png', role: 'Senior Stylist', branch: 'KCA', ig: 'samanthajhair__', resigned: true },
  'SOPHIE':   { photoFull: 'stylist/photos/KCA/sophie harrison.png', role: 'Style Director', branch: 'KCA', ig: 'sophiepatriciahair', resigned: true },
  'TONI':     { photoFull: 'stylist/photos/KCA/toni brits.png', role: 'Stylist', branch: 'KCA', ig: 'toni.brits', resigned: true },
  'ZANDRI':   { photoFull: 'stylist/photos/MC/zandri wilson.png', role: 'Senior Stylist', branch: 'MC', ig: 'zandrihair', resigned: true },
  'DANIKA':   { photoFull: 'stylist/photos/SAA/danika ogrady.png', role: 'Style Director', branch: 'SAA', ig: 'hairby_danika', resigned: true },
  // Added 19 Sep 2026 from the same RESIGNED board, branch read off their ledger
  // history (staff_utilisation/branch_staff_daily volume) since none of the four
  // had a card before now: Zandra almost entirely at KCA, Beatriz/Zara/Blossom
  // almost entirely at SAA (each also has a single-digit-row cover shift at
  // another branch, which is not their branch).
  // Kate, 24 Sep 2026: Zandra is an Assistant (still Active in Phorest), not a
  // former stylist, so she's off the Former Stylists grid and folds into KCA's
  // Assistants card like the rest.
  'ZANDRA':   { role: 'Assistant', branch: 'KCA' },
  'BEATRIZ':  { photoFull: 'stylist/photos/SAA/beatriz chaparro.png', role: 'Senior Stylist', branch: 'SAA', ig: 'chroniclesofamessyhair', resigned: true },
  'ZARA':     { photoFull: 'stylist/photos/SAA/zara lhouvum.png', role: 'Style Director', branch: 'SAA', ig: 'zaralvhair', resigned: true },
  'BLOSSOM':  { photoFull: 'stylist/photos/SAA/blossom day.png', role: 'Style Director', branch: 'SAA', ig: 'blossomsmagic', resigned: true },
  'STUART':   { photoFull: 'stylist/photos/other/stuart hastings.png', role: 'Style Director', branch: 'other', ig: 'stuarthastings791', resigned: true },
  'GONCALO':  { photoFull: 'stylist/photos/other/goncalo de almeida.png', role: 'Barber', branch: 'other', ig: 'almeida_barber.dxb', resigned: true },
  // Kate, 24 Sep 2026: at KCA in early 2025, last ledger row 12 Jan 2025 (11 daily
  // rows as RACHEL, 3 utilisation rows as Rachel White). Not Rachel Dawson, who is
  // still active at MC.
  'RACHEL':   { photoFull: 'stylist/photos/KCA/rachel white.png', role: 'Stylist', branch: 'KCA', ig: 'hairbyrachel.w', resigned: true },
  // Added 19 Sep 2026, same RESIGNED board. Branch off her ledger history: 499 SAA
  // Beauty rows (Jan 2025-May 2026) against 9 KCA cover rows. Kate, 21 Sep 2026: she
  // was a beautician, not a stylist — role corrected off the placeholder so she sorts
  // into the "Former Beauty Team" subsection in dashboard.js instead of Former Stylists.
  'ROVINA':   { photoFull: 'stylist/photos/SAA/rovina jordan.png', role: 'Beauty Team Member', branch: 'SAA', resigned: true },
  // Kate, 24 Sep 2026: former beautician, same Former Beauty Team subsection as
  // Rovina. Branch off her ledger history: 244 AQ utilisation rows (2025) against
  // 42 at Fratelli, which is closed, so AQ.
  'ROJA':     { photoFull: 'stylist/photos/AQ/roja pudtado.png', role: 'Beauty Team Member', branch: 'AQ', ig: '___roza123', resigned: true },
  // Kate, 24 Sep 2026: KCA beautician (dept Beauty), 194 utilisation rows 4 Jan 2025
  // to 23 Jan 2026. The KCA ledger keeps an all-zero STELLA row after that, which is
  // the template, not shifts.
  'STELLA':   { photoFull: 'stylist/photos/KCA/stella mendes.png', role: 'Beauty Team Member', branch: 'KCA', ig: 'beautybystellamendes', resigned: true },
  // Kate, 14 Oct 2026: Style Director at Al Quoz, Nov 2023 to Jan 2025 (Motor City
  // briefly), archived in Phorest. Photo from her own Canva headshot, 375x435.
  'NIMI':     { photoFull: 'stylist/photos/AQ/nimi firth.png', role: 'Style Director', branch: 'AQ', ig: 'nimistyles', resigned: true },
  // Kate, 14 Oct 2026: Motor City stylist, archived in Phorest (ledger rows from Mar 2024,
  // last hours worked 4 Feb 2025). Listed as "Cori Paul" on the dashboards; IG handle is corypaulhair.
  'CORI':     { photoFull: 'stylist/photos/MC/cori paul.png', role: 'Senior Stylist', branch: 'MC', ig: 'corypaulhair', resigned: true },
  // Kate, 14 Oct 2026: brothers, both Al Quoz (Jul 2023 to 1 Mar 2024, Motor City Jul to Sep 2023
  // first). Title is Creative Director, Phorest's own category off the 14 Oct 2026 roster export (Kate:
  // follow the roster). Photos are her own cleaned-up headshots, 375x435.
  'PAUL':     { photoFull: 'stylist/photos/AQ/paul standenmay.png', role: 'Creative Director', branch: 'AQ', ig: 'paulstandenmay.colour', resigned: true },
  'CALLUM':   { photoFull: 'stylist/photos/AQ/callum standenmay.png', role: 'Creative Director', branch: 'AQ', ig: 'callumstandenmay', resigned: true },
  // Kate, 14 Oct 2026: Motor City stylist Sep to Dec 2025 (91 daily rows), 7 Al Quoz cover
  // rows, archived in Phorest. Headshot is her own cleaned-up one, 375x435.
  'MARCELLA': { photoFull: 'stylist/photos/MC/marcella savicic.png', role: 'Stylist', branch: 'MC', ig: 'marcellastyleshairdxb', resigned: true },
  // Kate, 14 Oct 2026: Fratelli barber, Oct 2025 to May 2026 (185 daily rows, archived in Phorest). Branch is
  // 'other' like Stuart and Goncalo: Fratelli is closed and the Team Roster has no FRT group. Photo converted
  // to black and white off his colour headshot, 375x435.
  'DEMIAN':   { photoFull: 'stylist/photos/other/demian rakic.png', role: 'Barber', branch: 'other', ig: 'barber.demian', resigned: true },
  // Kate, 14 Oct 2026: Al Quoz stylist Mar to Sep 2024 (186 daily rows), also Motor City from Jul 2024 and
  // a week at Fratelli; archived in Phorest. Photo is his own black-and-white headshot, 375x435.
  'EMIN':     { photoFull: 'stylist/photos/AQ/emin salamovic.png', role: 'Senior Stylist', branch: 'AQ', ig: 'hairdoctoremin', resigned: true },
  // Kate, 14 Oct 2026: Senior Stylist, Motor City Dec 2022 to Feb 2023 (one Khalifa City A day in Sep 2022),
  // archived in Phorest. Known on reviews as Triny. Photo is her own black-and-white headshot, 375x435.
  'CATRIN':   { photoFull: 'stylist/photos/MC/catrin birkby.png', role: 'Senior Stylist', branch: 'MC', ig: 'catrinhair.dxb', resigned: true },
  // Kate, 14 Oct 2026: Junior Stylist, mainly Saadiyat Mar 2021 to May 2023 (666 daily rows), Khalifa City A
  // Jan to Sep 2022, archived in Phorest. Photo is her own black-and-white headshot, 375x435.
  'RESHEL':   { photoFull: 'stylist/photos/SAA/reshel tagayuna.png', role: 'Junior Stylist', branch: 'SAA', ig: 'reshelwijesinghe', resigned: true },
  // Kate, 14 Oct 2026: former team with no photo and no client-facing Instagram yet, so each carries the
  // blank line-art template (female or male) as a placeholder and no `ig`. One file per person on purpose:
  // renderStylistCards and the Team Roster dedupe on the photo path, so a shared placeholder would collapse
  // them into one card. Replace the file (same name) when a real headshot comes.
  // Zoe: Al Quoz Sep 2024 to Jan 2025 (KCA early 2021); role and branch not confirmed, so Stylist/AQ is a default.
  'ZOE':      { photoFull: 'stylist/photos/AQ/zoe hogkinson.png', role: 'Stylist', branch: 'AQ', resigned: true },
  // Harriet: Saadiyat Mar to Jun 2025 (one Khalifa City A day), archived in Phorest.
  'HARRIET':  { photoFull: 'stylist/photos/SAA/harriet shannon.png', role: 'Stylist', branch: 'SAA', resigned: true },
  // Venus: Motor City Nov 2022 to Jan 2025 (683 daily rows). Junior Stylist per the roster export.
  'VENUS':    { photoFull: 'stylist/photos/MC/venus solomon.png', role: 'Junior Stylist', branch: 'MC', resigned: true },
  // Oliver: Barber at Al Quoz, Dec 2025 to Jan 2026.
  'OLIVER':   { photoFull: 'stylist/photos/AQ/oliver green.png', role: 'Barber', branch: 'AQ', resigned: true },
  // Aboudi: Al Quoz Sep 2023 to Mar 2024 (136 daily rows). Title is Phorest's own category (3 Style Director,
  // DXB) off the 14 Oct 2026 roster export; the 9 Oct variants note said Stylist. Male placeholder, no ig.
  'ABOUDI':   { photoFull: 'stylist/photos/AQ/aboudi chatila.png', role: 'Style Director', branch: 'AQ', resigned: true },
  // Jaime: Khalifa City A Stylist, Jun 2022 to Aug 2024 on the roster export (two daily ledger rows, Feb 2023).
  // Female placeholder: Kate was not sure ('ata'), so swap the file if that is wrong. No ig.
  'JAIME':    { photoFull: 'stylist/photos/KCA/jaime petzer.png', role: 'Stylist', branch: 'KCA', resigned: true },
  // Josh: Stylist on the roster export, Al Quoz (archived 17 Mar 2026). His ledger rows are mostly Fratelli
  // (44 days, Nov 2023 to Jan 2024) with 6 at Al Quoz; branch follows the roster because the Team Roster
  // has no FRT group. Male placeholder, no ig.
  'JOSH':     { photoFull: 'stylist/photos/AQ/josh thomas.png', role: 'Stylist', branch: 'AQ', resigned: true },
  // Kate, 14 Oct 2026: Michelle was an Assistant (roster export: archived at Saadiyat, Khalifa City A and
  // Marasy); ledger mostly Saadiyat, 315 daily rows May 2022 to Jun 2023. Not the shared 'MYRA/MICHELLE'
  // assistants cell above: that key is a ledger cell, this is her own card. Her photo came in the same two-image
  // message as Mihaela's; Kate confirmed which is which (Mihaela left, Michelle right).
  'MICHELLE': { photoFull: 'stylist/photos/SAA/michelle alinea.png', role: 'Assistant', branch: 'SAA', ig: 'alinea.michelle', resigned: true },
  // Mihaela: Stylist at Al Quoz on the roster export (added 2 Oct 2023, archived 17 Mar 2026); ledger Oct 2023 to Mar 2024.
  'MIHAELA':  { photoFull: 'stylist/photos/AQ/mihaela solomei.png', role: 'Stylist', branch: 'AQ', ig: 'dare.to_hair', resigned: true },
  // Kate, 14 Oct 2026: three former beauticians with no photo and no client-facing Instagram yet, so each
  // carries the blank female line-art template (own file each, for the photo-path dedupe) and no `ig`. Role is
  // 'Beauty Team Member', the former-team label Rovina, Roja and Stella use, so they land in Former Beauty Team
  // (Phorest category: Beautician). Branch off the ledger's busiest one.
  // Cecille: Khalifa City A, 694 daily rows Sep 2021 to Sep 2023 (a little Marasy and Saadiyat in 2022).
  'CECILLE':  { photoFull: 'stylist/photos/KCA/cecille castilio.png', role: 'Beauty Team Member', branch: 'KCA', resigned: true },
  // Maricel: Saadiyat, 1,027 daily rows May 2021 to Jun 2025 (also Khalifa City A, Marasy and Fratelli).
  'MARICEL':  { photoFull: 'stylist/photos/SAA/maricel sape.png', role: 'Beauty Team Member', branch: 'SAA', resigned: true },
  // Melliza: Khalifa City A, 911 daily rows Oct 2021 to May 2024 (Marasy before that). Had a template until Kate sent
  // her real headshot (grey beauty uniform) and her Instagram, 14 Oct 2026.
  'MELLIZA':  { photoFull: 'stylist/photos/KCA/melliza ancajas.png', role: 'Beauty Team Member', branch: 'KCA', ig: 'beautybymelliza', resigned: true },
  // Kate, 14 Oct 2026: Dina and Joanne are former beauticians WITH a client-facing Instagram and a real headshot
  // (black and white, 375x435; Dina's made in ChatGPT from a selfie, in the grey beauty uniform). Same
  // 'Beauty Team Member' label, so they land in Former Beauty Team beside Rovina, Roja and Stella.
  // Dina: Khalifa City A, 1,090 beauty rows Aug 2021 to Dec 2025 (plus Marasy and a little hair floor work).
  'DINA':     { photoFull: 'stylist/photos/KCA/dina paycao.png', role: 'Beauty Team Member', branch: 'KCA', ig: 'beautybydina_bp', resigned: true },
  // Joanne: Saadiyat, 714 beauty rows Jan 2021 to Dec 2022 (Motor City Dec 2022 to Dec 2023).
  'JOANNE':   { photoFull: 'stylist/photos/SAA/joanne pungilan.png', role: 'Beauty Team Member', branch: 'SAA', ig: 'pamperedbyjoanne', resigned: true },
  // Rita: former beautician (Beautician in Phorest, archived), Khalifa City A, 715 beauty rows Jan 2021 to Dec 2022.
  // Black-and-white headshot, 375x435, in the grey beauty uniform she wears in her own feature in the Feb 2022
  // ROSES magazine (Drive: magazines > 2022); IG is her own studio account. Spelled Aryal everywhere (Kate first
  // typed Ayral).
  'RITA':     { photoFull: 'stylist/photos/KCA/rita aryal.png', role: 'Beauty Team Member', branch: 'KCA', ig: 'radream_beautybrandstudio', resigned: true },
  // Kate, 14 Oct 2026: Jackie, former beautician (Beautician in Phorest, archived), IG nailsbyjackie.08 (nails).
  // The ledger only has Marasy (506 beauty rows Jan 2021 to May 2022), which is closed and has no Team Roster
  // group, so branch is Saadiyat, her other Phorest record (Aug 2021 to Mar 2026). Black-and-white headshot, 375x435.
  'JACKIE':   { photoFull: 'stylist/photos/SAA/jackie anog.png', role: 'Beauty Team Member', branch: 'SAA', ig: 'nailsbyjackie.08', resigned: true },
  // Kate, 14 Oct 2026: Karina, former Stylist at Khalifa City A (roster export: added 11 May 2022, archived Aug 2024;
  // 549 daily rows May 2022 to Nov 2023), IG karapuzzo. Her headshot is black and white, 375x435; the same photo ran
  // in her Roses magazine intro (Branch joined: Khalifa City A, Russia, 10 years in hair).
  'KARINA':   { photoFull: 'stylist/photos/KCA/karina kazarian.png', role: 'Stylist', branch: 'KCA', ig: 'karapuzzo', resigned: true },
  // Kate, 14 Oct 2026: Lorena, former Junior Stylist (roster export: Saadiyat and Khalifa City A, archived Mar and
  // Jul 2026). Ledger: Saadiyat 252 daily rows Feb to Nov 2022, Khalifa City A 30 rows. IG workdonebylorena.
  // Black-and-white headshot, 375x435.
  'LORENA':   { photoFull: 'stylist/photos/SAA/lorena factor.png', role: 'Junior Stylist', branch: 'SAA', ig: 'workdonebylorena', resigned: true },
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
  'ANDREA':    'Gladstone',   // Kate, 7 Sep 2026
  'APRIL':     'Miraflor',
  'AREANNE':   'Miranda',
  'ARNALYN':   'Salisi',
  'ASHLEIGH':  'Fairgrieve',
  'BEATRIZ':   'Chaparro',
  'BETHANY':   'Smith',
  'BLOSSOM':   'Day',
  'CHALANI':   'Kaushallya',
  'CLARISSA':  'Destacamento',
  'CHONA':     'Manlapaz',
  'DAISY':     'Cropper',
  'DANIKA':    'Ogrady',
  'DEMIAN':    'Rakic',
  'DORAH':     'Namayanja',
  'EDS':       'Asuncion',
  'ELISE':     'Ford',
  'EMMA':      'Williamson',
  'GALINA':    'Spierling',
  'GONCALO':   'de Almeida',
  'GRACE':     'Sarmiento',
  'HARRIET':   'Shannon',     // Kate, 8 Oct 2026: archived in Phorest, was a stylist
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
  'RACHEL':    'White',
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
  'ZARA':      'Lhouvum',

  // Kate, 16 Sep 2026 — "lagyan mo na lahat ng apelyido across all sections", filled
  // in off the Staff Performance / Utilisation uploads (Phorest spelling, same rule as
  // CHALANI/IVY above). MAY is deliberately NOT touched here: there are two of her
  // (Fernandez at Khalifa City, Manguiat at Saadiyat) and this map only holds one
  // surname per first name — ask Kate before picking one. LHANG ANN and XAVRINA X
  // stay blank on purpose, same reasoning as Lhang Ann above.
  'ABBIE':     'Tuazon',
  'APOL':      'Santos',
  'ARA':       'Gonzales',
  'BELLE':     'Bustos',
  'BEVERLY':   'Arambala',
  'CORI':      'Paul',
  'CRISTINA':  'Cucos',
  'CRISTINE':  'Bracamonte',
  'EDEN':      'Domasin',
  'ELENA':     'Bacabac',
  'EMIN':      'Salamović',    // Phorest has Salamovic; Kate, 14 Oct 2026
  'ERCELY':    'Vacal',
  'ESTHER':    'Gabutin',
  'HAZEL':     'Alcala',
  'JESSA':     'Padilla',
  'JHO':       'Cairel',
  'JOY':       'Hernando',
  'JOYCE':     'Dy',
  'KAISHA':    'Balbuena',
  'KRIS':      'Asuncion',
  'LAILA':     'Pabico',
  'LIBERTY':   'Caparas',
  'LORAINNE':  'Palmon',
  'LUNINGNING':'Stevens',
  'MAAN':      'Solis',
  // Kate, 17 Sep 2026, off Phorest's own Staff list: not a misread ledger row after
  // all — Marjorie Sevilla, an Assistant at Al Quoz, same as the other assistants
  // below. Was flagged unresolved above until now.
  'MARCELLA':  'Savicic',      // Kate, 8 Oct 2026: left; stylist, Motor City and Al Quoz (archived in Phorest)
  'MARGIE':    'Sevilla',
  'NEEKA':     'Kainth',
  'NIMI':      'Firth',        // Kate, 8 Oct 2026: left; Style Director, Al Quoz (archived in Phorest)
  'SHIELA':    'Avena',
  'SIMON':     'Faddoul',
  'SUNITHA':   'Dhakshinamurtht',
  'VICKI':     'Taylor',
  'VIRGINIJA': 'Lisauskaite',
  'ZANDRA':    'Competente',

  // Kate, 14 Oct 2026 — Wins and Podium Race printed first names only for 2022-2023 and
  // for anyone without a card (Maricel, Dina, Paul, Karina, Rhi, Gabby, Kelsey...).
  // Filled off every Phorest staff upload and export we hold (Phorest spelling, same
  // rule as above), one surname per first name. Left out on purpose: names with a blank
  // surname at source (Lhang Ann, Xavrina, the Bahrain team), MARY (Mary Joy Galos is
  // MJ; a second Mary Gale Carolasan is on file), CHARLENE (Payne at Motor City, no
  // surname for the Bahrain one) and anyone with fewer than 20 Phorest rows.
  // Phorest has CALLUM as Standemay, but both brothers are really Standenmay (Kate,
  // 14 Oct 2026), so CALLUM is spelled Standenmay here too.
  'ABBY':      'Peñaflor',
  'ABOUDI':    'Chatila',
  'ALEX':      'Duncan',
  'ANNA':      'Ahaponova',
  'BILLY':     'Gray',
  'CALLUM':    'Standenmay',
  'CATRIN':    'Birkby',
  'CECILLE':   'Castilio',
  'DINA':      'Paycao',
  'ELLIESA':   'Purisima',
  'ELOISA':    'Purisima',
  'EMMALYN':   'Daza',
  'FAYE':      'Madi',
  'FRANCES':   'Sergio',
  'GABBY':     'Nemeth',
  'HAFEZ':     'Abou Hwijj',
  'HARSHA':    'Weerasinghe',
  'JACKIE':    'Anog',
  'JAIME':     'Petzer',
  'JANE':      'Astrande',
  'JANICE':    'Gamit',
  'JAYA':      'Wagle',
  'JENNA':     'Mcdonnell',
  'JOANNE':    'Pungilan',
  'JOSH':      'Thomas',
  'JOSIL':     'Ararao',
  'KARINA':    'Kazarian',
  'KATHY':     'Garcia',
  'KELSEY':    'Lewis',
  'KELSIE':    'Lally',
  'LINA':      'Waled',
  'LORENA':    'Factor',
  'LOUISE':    'Williams',
  'LUCIE':     'Rogers',
  'MARIA':     'Lascanu',
  'MARICEL':   'Sape',
  'MARISSA':   'Dizon',
  'MELCA':     'Reynolds',
  'MELLIZA':   'Ancajas',
  'MICHELLE':  'Alinea',
  'MIHAELA':   'Solomei',
  'NICOLE':    'O\'sullivan',
  'NOEMI':     'Mallari',
  'PAUL':      'Standenmay',
  'RESHEL':    'Tagayuna',
  'RHI':       'George',
  'RICHEL':    'Modilla',
  'RITA':      'Aryal',
  'ROSETTE':   'Melosantos',
  'SAHRA':     'Sayed',
  'SHERINE':   'Baghdadi',
  'SHIAN':     'Davidson',
  'STRAWBERRY':'Alcomendas',
  'VENUS':     'Solomon',
  'ZOE':       'Hogkinson',

  // Kate, 14 Oct 2026, second pass: every name the branch ledgers carry, checked against
  // this map. These are the misspellings and one-offs the ledgers wrote for someone who
  // is already here, same branch and the dates running on from hers (Cherine, Jan-Aug
  // 2021 then Sherine from Sep 2021, both KCA hair). Surname only: the figures stay under
  // the ledger's own spelling, nothing is merged. Mandika's is off Phorest's single row
  // for her (Saadiyat, 2021).
  'MANDIKA':   'Dyola',
  'CHERINE':   'Baghdadi',
  'JAIMIE':    'Petzer',
  'JAMIE':     'Petzer',
  'MIKAELA':   'Solomei',
  'SHILAH':    'Mandal',
  'NEOMI':     'Mallari',
  'NOIME':     'Mallari',
  'ROBINA':    'Jordan',
  'MAVE':      'Miraflor',
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
