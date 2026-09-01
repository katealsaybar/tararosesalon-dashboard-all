# Stylist photos

Avatars for the **Top Performer** cards on the KPI dashboard.

These are **transparent PNGs**, not plain headshots. Each one is the stylist over
their own accent block from the Canva stylist card, with the head breaking out
above the block and everything above it transparent. That overhang is the whole
look — the dashboard deliberately applies no `border-radius`, background or
border, because any of those would clip it.

Drop files here, then add the stylist to `staff-profiles.js` at the repo root:

```js
const STAFF_PROFILES = {
  'NIKKI': { photo: 'nikki.png', ig: 'somehandle' },
};
```

The key is the stylist's name **in upper case, exactly as it appears in Phorest**
(after `canonicalStaffName()` runs, so use the canonical spelling — e.g. `EDS`,
not `EDZ`; `LIZANIE`, not `LIZANNIE`).

## Regenerating from the Canva deck

Run `python scripts/cut-staff-avatars.py "<cards folder>" <slug> ...` — it holds
the template geometry (accent panel at **(72,143)–(542,600)** in a 1414x2000
page) and the method. The two traps, learned the hard way:

- Take the panel colour from a thin strip inside the panel's left edge. Don't take
  it from the whole card — the "SPECIALISES IN" boxes below reuse the same accent
  for their borders and will drag the detected bounds down with them.
- Above the panel line, key by **flood fill from the image edge with a tight
  tolerance**, never by a global colour key; below it, mask with a rounded
  rectangle. A global key measures every pixel against the background and eats
  dark hair, which sits within ~45 RGB units of the card's dark navy — that is
  how seven of the 2nd-batch cutouts shipped with transparent hair (fixed 1 Sep
  2026).

## File rules

- **200px wide, PNG with alpha**, quantised to ~192 colours. The whole set is
  ~343KB. Git keeps every version of a binary forever, so oversized files can't be
  cleaned up later without rewriting history.
- **Lower-case filenames, no spaces.** `nikki.png`, not `NIKKI Photo (1).PNG`.

Both `photo` and `ig` are optional and independent, so a stylist can have one
without the other. Anyone missing from `staff-profiles.js` renders as a plain
text card — which is how the beauty team currently appears, since they have no
cards in the deck yet.
