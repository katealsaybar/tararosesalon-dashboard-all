// ── STYLIST PROFILES ──────────────────────────────
// The hair team, used by the Top Performer cards on the KPI dashboard and by the
// Stylist Cards view. Kate, 2026-08-12.
//
// Source: the "FINAL STYLIST CARD" Canva deck plus the matching HEAD ICON exports
// (27 stylists across four branches). Role and branch come from the icon filenames
// and their folders; Instagram handles were read off the A3 cards.
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
//           a name and not a label. CHALANI has none: she is not in the Phorest TSV
//           that map comes from, so hers is genuinely unknown rather than forgotten,
//           and inventing one off her Instagram handle would put a made-up surname on
//           a real colleague. She renders on her first name alone, which the
//           optional-field rule below already allows for.
//   photo   filename in assets/staff/. A transparent PNG of the stylist over her
//           card's accent block, head breaking out above it. See the README there.
//   role    Style Director | Senior Stylist | Stylist | Junior Stylist
//   branch  BRANCH_INFO key — KCA | SAA | MC | AQ
//   ig      Instagram handle WITHOUT the leading @
//
// EVERY FIELD IS OPTIONAL AND INDEPENDENT. No photo = no avatar; no handle = the
// name stays plain text; anyone missing from this map renders exactly as the win
// card always has, and a photo that 404s hides itself rather than showing a broken
// image. That is why the beauty team is absent without breaking anything — they
// have no cards in the deck yet.
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

  // -- Motor City --
  'ALAN':      { photo: 'alan.png',      role: 'Style Director', branch: 'MC',   ig: 'alan_joseph_hair' },
  'ASHLEIGH':  { photo: 'ashleigh.png',  role: 'Style Director', branch: 'MC',   ig: 'ashleighfairgrievehair' },
  'LUCY':      { photo: 'lucy.png',      role: 'Style Director', branch: 'MC',   ig: 'lucy.glow.hair' },
  'ELISE':     { photo: 'elise.png',     role: 'Senior Stylist', branch: 'MC',   ig: 'ehfhair' },
  'ROBYN':     { photo: 'robyn.png',     role: 'Senior Stylist', branch: 'MC',   ig: 'robynharthair' },

  // -- Al Quoz --
  'RUTH':      { photo: 'ruth.png',      role: 'Style Director', branch: 'AQ',   ig: 'rainbowsby_ruth' },
  'IBRAHIM':   { photo: 'ibrahim.png',   role: 'Senior Stylist', branch: 'AQ',   ig: 'almofdi.hairstylist' },
  'AREANNE':   { photo: 'areanne.png',   role: 'Junior Stylist', branch: 'AQ',   ig: 'hairbyareanne' },
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
// Missing on purpose rather than forgotten: CHALANI, ARNI, IVY and "Lhang Ann" are
// not in that TSV. They render on the first name alone — a made-up surname on a real
// colleague is worse than none.
const STAFF_SURNAMES = {
  'ALAN':      'Russell',
  'APRIL':     'Miraflor',
  'AREANNE':   'Miranda',
  'ARNALYN':   'Salisi',
  'ASHLEIGH':  'Fairgrieve',
  'BETHANY':   'Smith',
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
