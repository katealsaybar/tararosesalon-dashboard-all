# Stylist photos

Avatars for the **Top Performer** card on the KPI dashboard.

Drop files here, then add the stylist to `staff-profiles.js` at the repo root:

```js
const STAFF_PROFILES = {
  'NIKKI': { photo: 'nikki.jpg', ig: 'somehandle' },
};
```

The key is the stylist's name **in upper case, exactly as it appears in Phorest**
(after `canonicalStaffName()` runs, so use the canonical spelling — e.g. `LIZANIE`,
not `LIZANNIE`).

## File rules

- **Square crop.** The avatar renders as a 40px circle; anything else gets
  centre-cropped and heads end up off-centre.
- **240x240 or smaller, JPG.** These are decorative thumbnails, not gallery
  images. A 3MB export bloats the repo permanently — git keeps every version
  forever, so oversized files can't be cleaned up later without rewriting history.
- **Lower-case filenames, no spaces.** `nikki.jpg`, not `NIKKI Photo (1).JPG`.

Both `photo` and `ig` are optional and independent, so a stylist can have one
without the other. Anyone missing from `staff-profiles.js` renders as a plain
text card, exactly as before — nothing breaks while this is half-populated.
