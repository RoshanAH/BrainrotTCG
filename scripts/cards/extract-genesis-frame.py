"""
Recover the shared Genesis card frame from the Genesis cards themselves.

All Genesis cards use the same frame; only the art, title and caption differ.
Where every card agrees, the pixel is frame. In the title banner and caption
box, the area comes from the card with the least text (Buh67, Meowl) and that
text is painted out (banner middle repainted with its own gradient, caption
emoji interpolated away). The art
window becomes a transparent hole, keeping frame decorations that overlap it.

Writes scripts/cards/templates/genesis-frame.png (RGBA) and genesis-frame.json.
Run: python3 scripts/cards/extract-genesis-frame.py   (needs numpy + Pillow)
"""
import glob
import json
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
W, H = 687, 1024

files = sorted(glob.glob(os.path.join(ROOT, 'src/content/sets/genesis/art/*.card.*')))
stack = np.stack([np.asarray(Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS), dtype=np.float32) for f in files])
std = stack.std(axis=0).mean(axis=2)
median = np.median(stack, axis=0)

# Regions (measured from the variance map; see the commit that added this script).
TITLE = (170, 84, 520, 166)     # x0, y0, x1, y1 of the banner's text area
CAPTION = (118, 792, 568, 938)  # caption box text area
ART = (122, 214, 566, 733)      # art window


def inpaint_rows(img, mask):
    """Fill masked pixels by interpolating along each row between the nearest clean pixels."""
    out = img.copy()
    h, w = mask.shape
    for y in range(h):
        row = mask[y]
        x = 0
        while x < w:
            if not row[x]:
                x += 1
                continue
            start = x
            while x < w and row[x]:
                x += 1
            left = out[y, start - 1] if start > 0 else out[y, min(x, w - 1)]
            right = out[y, x] if x < w else left
            n = x - start
            for i in range(n):
                t = (i + 1) / (n + 1)
                out[y, start + i] = left * (1 - t) + right * t
    return out


def clean_region(card_name, region, text_box, background_rgb, threshold):
    """Take `region` from one card and paint out its text (pixels far from the background colour)."""
    path = next(f for f in files if os.path.basename(f).startswith(card_name + '.'))
    card = np.asarray(Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS), dtype=np.float32)
    x0, y0, x1, y1 = region
    patch = card[y0:y1, x0:x1].copy()
    tx0, ty0, tx1, ty1 = (text_box[0] - x0, text_box[1] - y0, text_box[2] - x0, text_box[3] - y0)
    dist = np.abs(patch - np.array(background_rgb, dtype=np.float32)).mean(axis=2)
    mask = np.zeros(dist.shape, dtype=np.uint8)
    mask[ty0:ty1, tx0:tx1] = (dist[ty0:ty1, tx0:tx1] > threshold) * 255
    mask = np.asarray(Image.fromarray(mask).filter(ImageFilter.MaxFilter(7))) > 0
    filled = inpaint_rows(patch, mask)
    # Soften only the repaired pixels.
    blurred = np.asarray(Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)
    soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)[..., None] / 255
    return filled * (1 - soft) + blurred * soft


def load_card(card_name):
    path = next(f for f in files if os.path.basename(f).startswith(card_name + '.'))
    return np.asarray(Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS), dtype=np.float32)


def title_band():
    """Per column, the rows titles occupy (from the variance map); follows the banner's arch."""
    tops, bottoms = {}, {}
    for x in range(TITLE[0], TITLE[2]):
        rows = np.nonzero(std[TITLE[1] - 6:TITLE[3] + 8, x] > 35)[0]
        if len(rows) > 10:
            tops[x], bottoms[x] = TITLE[1] - 6 + rows.min(), TITLE[1] - 6 + rows.max()
    xs = np.array(sorted(tops))
    # The banner is a smooth arch: fit a parabola to each edge (robust to noisy columns).
    top = np.polyval(np.polyfit(xs, [tops[x] for x in xs], 2), xs)
    bottom = np.polyval(np.polyfit(xs, [bottoms[x] for x in xs], 2), xs)
    return {int(x): (t, b) for x, t, b in zip(xs, top, bottom)}


def clean_title(frame):
    """Start from Buh67's banner (shortest title) and repaint its middle with the banner's own pink gradient."""
    card = load_card('buh67')
    x0, y0, x1, y1 = TITLE
    frame[y0:y1, x0:x1] = card[y0:y1, x0:x1]
    band = title_band()
    # Banner colour as a function of relative height, sampled from text-free columns either side of "Buh67".
    samples = []
    for sx in (228, 232, 456, 460):
        t0, t1 = band[sx]
        samples.append([card[int(round(t0 + (t1 - t0) * f)), sx] for f in np.linspace(0, 1, 32)])
    profile = np.mean(samples, axis=0)
    left, right, feather = 245, 445, 14.0
    for x in range(left - int(feather), right + int(feather)):
        if x not in band:
            continue
        t0, t1 = band[x]
        weight = min(1.0, (x - (left - feather)) / feather, ((right + feather) - x) / feather)
        for y in range(int(np.ceil(t0)) - 1, int(np.floor(t1)) + 1):
            f = (y - t0) / max(t1 - t0, 1)
            colour = profile[min(31, max(0, int(round(f * 31))))]
            frame[y, x] = frame[y, x] * (1 - weight) + colour * weight
    return frame


frame = median.copy()
frame = clean_title(frame)
# Caption box from Meowl (just an emoji), with the emoji painted out.
x0, y0, x1, y1 = CAPTION
frame[y0:y1, x0:x1] = clean_region('meowl', CAPTION, (280, 810, 410, 915), (246, 236, 226), 30)

# Art hole: high-variance pixels inside the art window, closed into a solid shape.
x0, y0, x1, y1 = ART
hole = np.zeros((H, W), dtype=np.uint8)
hole[y0:y1, x0:x1] = (std[y0:y1, x0:x1] > 30).astype(np.uint8) * 255
hole_img = Image.fromarray(hole).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
# Fill tiny interior gaps (dark areas that happened to agree across cards).
hole_img = hole_img.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
hole_arr = np.asarray(hole_img.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32)
alpha = 255 - hole_arr

rgba = np.dstack([np.clip(frame, 0, 255), alpha]).astype(np.uint8)
os.makedirs(os.path.join(HERE, 'templates'), exist_ok=True)
Image.fromarray(rgba, 'RGBA').save(os.path.join(HERE, 'templates', 'genesis-frame.png'), optimize=True)

band = title_band()
bx = np.array(sorted(band))
centre = np.array([(band[x][0] + band[x][1]) / 2 for x in bx])
mid = band[int(np.median(bx))]
layout = {
    'width': W,
    'height': H,
    'art': {'x': ART[0], 'y': ART[1], 'width': ART[2] - ART[0], 'height': ART[3] - ART[1]},
    # Title baseline follows the banner arch: centre line y = a*x^2 + b*x + c.
    'title': {
        'arc': [float(v) for v in np.polyfit(bx, centre, 2)],
        'xMin': int(bx.min()) + 12,
        'xMax': int(bx.max()) - 12,
        'height': float(mid[1] - mid[0]),
    },
    'caption': {'x': 140, 'y': 810, 'width': 406, 'height': 110},
}
with open(os.path.join(HERE, 'templates', 'genesis-frame.json'), 'w') as f:
    json.dump(layout, f, indent=2)
    f.write('\n')
print('wrote templates/genesis-frame.png from', len(files), 'cards')
