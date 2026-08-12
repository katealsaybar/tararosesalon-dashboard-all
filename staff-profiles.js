// ── STYLIST PROFILES ───────────────────────────────────────────
// Photo + Instagram handle per stylist, used by the "Top Performer" win card on
// the KPI dashboard. Kate, 2026-08-12: the card should show the actual person,
// and their name should open their Instagram.
//
// Source: the "FINAL STYLIST CARD" Canva deck (34 A3 pages, 27 stylists + four
// branch dividers). Avatars in assets/staff/ were cropped from each card's
// headshot panel; handles were read off the same cards.
//
// Keyed by the CANONICAL staff name in UPPER CASE — the same name
// canonicalStaffName() (upload/name-aliases.js) produces, so a stylist logged
// under two spellings in Phorest still resolves to one profile. Load this file
// AFTER name-aliases.js.
//
//   photo  filename inside assets/staff/. Square, 240x240.
//   ig     Instagram handle WITHOUT the leading @.
//
// BOTH FIELDS ARE OPTIONAL AND INDEPENDENT. No photo = no avatar. No handle =
// the name stays plain text. Anyone missing from this map renders exactly as the
// card always has, and a photo that 404s hides itself rather than showing a
// broken image — so this stays safe while it is incomplete.
//
// Grouped by branch, matching the deck's own divider pages. The beauty team,
// assistants and everyone else in the ledger simply have no entry here yet.
const STAFF_PROFILES = {
  // ── Khalifa City A ──
  'KATE':     { photo: 'kate.jpg',     ig: 'katesirik' },
  'TEGAN':    { photo: 'tegan.jpg',    ig: 'teganskinnerhair' },
  'KYLIE':    { photo: 'kylie.jpg',    ig: 'thathairgirlkylie' },
  // Olena's card in the Canva deck carries @thathairgirlkylie — Kylie's handle,
  // not hers. Kate supplied the correct one and is fixing the card itself
  // (Kate, 2026-08-12). If the deck is ever re-exported, re-check this one.
  'OLENA':    { photo: 'olena.jpg',    ig: 'ostertag.olena' },
  'KATIE':    { photo: 'katie.jpg',    ig: 'katiesanchez_' },
  'NIKKI':    { photo: 'nikki.jpg',    ig: 'hairbynikki.na' },
  'LIZANIE':  { photo: 'lizanie.jpg',  ig: 'lizaniejacobsz_hair' },
  'CHALANI':  { photo: 'chalani.jpg',  ig: 'authentics.ck' },
  'MAY':      { photo: 'may.jpg',      ig: 'hairby_mhay' },
  'IRLYN':    { photo: 'irlyn.jpg',    ig: 'hairby_lyn11' },

  // ── Mamsha Al Saadiyat ──
  'EMMA':     { photo: 'emma.jpg',     ig: 'emmalou.williamson' },
  'JEIDA':    { photo: 'jeida.jpg',    ig: 'jeida11' },
  'HOLLY':    { photo: 'holly.jpg',    ig: 'holly_the_hairdresser' },
  'MOLLY':    { photo: 'molly.jpg',    ig: 'mollyrobinsonhair' },
  'TAMMY':    { photo: 'tammy.jpg',    ig: 'tammy_peter_hair' },
  'BETHANY':  { photo: 'bethany.jpg',  ig: 'bethanysmith.hair' },
  'SHELLEY':  { photo: 'shelley.jpg',  ig: 'shelley_the_global_hairstylist' },
  'APRIL':    { photo: 'april.jpg',    ig: 'april_apple_13' },
  // EDS is the correct spelling; only her Canva card says EDZ (Kate confirmed,
  // 2026-08-12). Keyed under EDS alone — 'EDZ': 'EDS' now lives in
  // STAFF_NAME_ALIASES, so either spelling canonicalises here before lookup.
  'EDS':      { photo: 'eds.jpg',      ig: 'edzasuncion' },

  // ── Motor City ──
  'ASHLEIGH': { photo: 'ashleigh.jpg', ig: 'ashleighfairgrievehair' },
  'ALAN':     { photo: 'alan.jpg',     ig: 'alan_joseph_hair' },
  'ROBYN':    { photo: 'robyn.jpg',    ig: 'robynharthair' },
  'ELISE':    { photo: 'elise.jpg',    ig: 'ehfhair' },
  'LUCY':     { photo: 'lucy.jpg',     ig: 'lucy.glow.hair' },

  // ── Al Quoz ──
  'RUTH':     { photo: 'ruth.jpg',     ig: 'rainbowsby_ruth' },
  'IBRAHIM':  { photo: 'ibrahim.jpg',  ig: 'almofdi.hairstylist' },
  'AREANNE':  { photo: 'areanne.jpg',  ig: 'hairbyareanne' },
};

function staffProfile(name) {
  if (!name) return null;
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName(name) : name;
  return STAFF_PROFILES[String(canon).trim().toUpperCase()] || null;
}
