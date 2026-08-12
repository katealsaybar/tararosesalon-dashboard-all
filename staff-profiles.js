// ── STYLIST PROFILES ───────────────────────────────────────────
// Photo + Instagram handle per stylist, used by the "Top Performer" win card on
// the KPI dashboard. Kate, 2026-08-12: the card should show the actual person,
// and their name should open their Instagram.
//
// Keyed by the CANONICAL staff name in UPPER CASE — the same name
// canonicalStaffName() (upload/name-aliases.js) produces, so a stylist logged
// under two spellings in Phorest still resolves to one profile. Load this file
// AFTER name-aliases.js.
//
//   photo  filename inside assets/staff/, e.g. 'nikki.jpg'. Square crops look
//          best — the avatar is rendered as a circle at 38px.
//   ig     Instagram handle WITHOUT the leading @, e.g. 'tararosesalon'.
//
// BOTH FIELDS ARE OPTIONAL AND INDEPENDENT. No photo = no avatar. No handle =
// the name stays plain text. A stylist missing from this map entirely renders
// exactly as the card always has, so this can be filled in one name at a time
// as photos and handles come in from socials@ — nothing breaks while it is
// half-populated, and a photo that 404s hides itself rather than showing a
// broken image.
const STAFF_PROFILES = {
  // 'NIKKI':   { photo: 'nikki.jpg',   ig: 'somehandle' },
  // 'LIZANIE': { photo: 'lizanie.jpg'                   },  // photo, no IG yet
  // 'KATE':    {                       ig: 'somehandle' },  // IG, no photo yet
};

function staffProfile(name) {
  if (!name) return null;
  const canon = (typeof canonicalStaffName === 'function') ? canonicalStaffName(name) : name;
  return STAFF_PROFILES[String(canon).trim().toUpperCase()] || null;
}
