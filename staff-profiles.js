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

function staffProfile(name) {
  if (!name) return null;
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName(name) : name;
  return STAFF_PROFILES[String(canon).trim().toUpperCase()] || null;
}
