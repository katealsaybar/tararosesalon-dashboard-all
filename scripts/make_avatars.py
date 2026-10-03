"""Round-avatar crops for the Staff Roster (Kate, 3 Oct 2026).

The org chart and staff card photos are cutouts whose head breaks out above a
rounded colour block, so a circle crop cut the head off and showed the block's
corners. This lays each photo on a solid square of its own block colour, then takes
a square centred on the face, with the whole head inside, at 160px.
"""
import sys, os
from collections import Counter
from PIL import Image

def close(a, b, tol=40):
    return sum(abs(x - y) for x, y in zip(a[:3], b[:3])) < tol

def block_colour(im):
    W, H = im.size
    c = Counter()
    for y in range(int(H * .2), int(H * .55)):
        for x in list(range(1, 9)) + list(range(W - 9, W - 1)):
            p = im.getpixel((x, y))
            if p[3] > 240:
                c[(p[0] // 4 * 4, p[1] // 4 * 4, p[2] // 4 * 4)] += 1
    return c.most_common(1)[0][0] if c else (240, 236, 228)

def avatar(src, dst, size=160):
    im = Image.open(src).convert('RGBA')
    W, H = im.size
    bg = block_colour(im)
    px = im.load()
    subj = lambda x, y: px[x, y][3] > 200 and not close(px[x, y], bg)
    top = next(y for y in range(H) if any(subj(x, y) for x in range(0, W, 2)))
    band = range(top, min(H, top + int(W * .25)))
    xs = [x for y in band for x in range(0, W, 2) if subj(x, y)]
    cx = sum(xs) / len(xs)
    # The face sits about a third of the photo's width below the top of the hair;
    # the square is centred on it, wide enough to keep the hair and a little shoulder.
    cy = top + W * .36
    S = int(W * .92)
    left, upper = int(cx - S / 2), int(cy - S / 2)
    canvas = Image.new('RGBA', (W + 2 * S, H + 2 * S), bg + (255,))
    canvas.alpha_composite(im, (S, S))
    crop = canvas.crop((left + S, upper + S, left + 2 * S, upper + 2 * S))
    crop.convert('RGB').resize((size, size), Image.LANCZOS).save(dst, optimize=True)

if __name__ == '__main__':
    root, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for rel in sys.argv[3:]:
        name = os.path.splitext(os.path.basename(rel))[0]
        avatar(os.path.join(root, rel), os.path.join(out, name + '.png'))
        print(name)
