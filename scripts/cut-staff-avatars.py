"""Cut assets/staff/ avatars from full stylist card PNGs.

    python scripts/cut-staff-avatars.py "C:/path/to/CARDS" mona shine mj

First argument is the folder holding the card exports (e.g. "FINAL CARDS 2ND
BATCH"); the rest are slugs. Each slug's card is found by prefix match on the
filename (MONA.png, "HAZEL MAE - BLOW-DRY SPECIALIST (1).png", ...), and the
avatar lands in assets/staff/<slug>.png at the 200px spec in the README there.

The template geometry is fixed: the photo panel sits at (72,143)-(542,600) in a
1414x2000 page. Above the panel line the card background is keyed out; below it
the panel is kept behind a rounded-rectangle mask.

Kate, 1 Sep 2026: the above-panel key is a flood fill from the image edge with a
tight tolerance, NOT a global colour key. The background is one flat colour, so
the fill hugs the silhouette and stops at the hairline; a global key measured
every pixel against the background and ate dark hair, which sits within ~45 RGB
units of the card's own dark navy — that is how Mona, Reda, Grace, Mimi, Shila,
Hazel Mae and Helen all shipped with transparent chunks in their hair.
"""
import os
import re
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "staff")

PANEL = (72, 143, 542, 600)   # x0,y0,x1,y1 in the 1414x2000 card
RADIUS = 64                   # the panel's corner rounding — fitted 62 from the
                              # card arcs (1 Sep 2026); 36 undershot it and left
                              # the card's dark navy as black wedges in every
                              # corner of the shipped avatars
T_FLOOD = 14.0                # flood tolerance: the bg is flat, so keep it tight
T_SOFT = 46.0                 # feather ceiling, keeps the hairline antialiased


def flood_outside(dist, tol):
    """Mask of pixels connected to the image edge through dist<=tol."""
    h, w = dist.shape
    ok = dist <= tol
    seen = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if ok[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if ok[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and ok[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                dq.append((ny, nx))
    return seen


def cutout(card_path, out_path):
    im = Image.open(card_path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    x0, y0, x1, y1 = PANEL

    bg = np.median(a[10:60, x0:x1].reshape(-1, 3), axis=0)

    strip = a[0:y0, x0:x1]
    dist = np.sqrt(((strip - bg) ** 2).sum(-1))
    outside = flood_outside(dist, T_FLOOD)

    alpha_strip = np.full(dist.shape, 255, np.float32)
    alpha_strip[outside] = 0
    # Feather the two pixels bordering the flood so the hairline keeps its
    # antialiasing instead of a hard navy fringe.
    grow = outside.copy()
    for _ in range(2):
        g = grow.copy()
        g[1:, :] |= grow[:-1, :]
        g[:-1, :] |= grow[1:, :]
        g[:, 1:] |= grow[:, :-1]
        g[:, :-1] |= grow[:, 1:]
        grow = g
    edge = grow & ~outside
    ramp = np.clip((dist - T_FLOOD) / (T_SOFT - T_FLOOD), 0, 1) * 255
    alpha_strip[edge] = ramp[edge]

    rows = np.where((alpha_strip > 8).any(axis=1))[0]
    top = max(0, int(rows.min()) - 4) if len(rows) else y0

    crop = a[top:y1, x0:x1]
    h, w = crop.shape[:2]
    alpha = np.zeros((h, w), np.float32)
    alpha[0:y0 - top] = alpha_strip[top:y0]

    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, y0 - top, w - 1, h - 1], radius=RADIUS, fill=255)
    alpha = np.maximum(alpha, np.asarray(mask).astype(np.float32))

    img = Image.fromarray(np.dstack([crop, alpha]).astype(np.uint8), "RGBA")
    img = img.resize((200, round(img.height * 200 / img.width)), Image.LANCZOS)
    img.quantize(colors=192, method=Image.Quantize.FASTOCTREE).save(
        out_path, optimize=True)
    print(f"{os.path.basename(out_path):16s} {img.size[0]}x{img.size[1]} "
          f"{round(os.path.getsize(out_path) / 1024)} KB")


if len(sys.argv) < 3:
    sys.exit(__doc__)
cards_dir, slugs = sys.argv[1], sys.argv[2:]
files = os.listdir(cards_dir)
for slug in slugs:
    pat = re.compile(r"^" + re.escape(slug).replace(r"\-", r"[ -]") + r"\b.*\.png$", re.I)
    hits = sorted(f for f in files if pat.match(f))
    if not hits:
        print(f"WARNING  {slug}: no card in {cards_dir}")
        continue
    # "(1)" re-exports sort after the original; the newest export wins.
    cutout(os.path.join(cards_dir, hits[-1]), os.path.join(OUT, slug + ".png"))
