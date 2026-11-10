#!/usr/bin/env python3
"""Thumbnail check sheet: see each thumbnail the way viewers will before you ship it.

For every thumbnail passed, one row shows:
  1. full size (1280x720 scaled to 640)
  2. home-feed size on a phone/desktop grid (~360 px wide)
  3. suggested-sidebar size (168 px wide) — the hardest legibility test
  4. TV 50% test — the bottom half dimmed, as the TV home row first shows it
  5. grayscale — value contrast without color doing the work
With --feed DIR, a final row puts every thumbnail at feed size beside the channel's (or the
niche's) current thumbnails, so you can judge whether it stands out next to its neighbours.

Usage: python3 check.py <out_sheet.jpg> <thumb.jpg> [<thumb2.jpg> ...] [--feed DIR]
"""
import glob, os, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageOps

args = sys.argv[1:]
feed_dir = None
if "--feed" in args:
    i = args.index("--feed"); feed_dir = args[i + 1]; args = args[:i] + args[i + 2:]
out, thumbs = args[0], args[1:]

LABELS = ["full", "feed 360px", "sidebar 168px", "TV: top half only", "grayscale"]
COLW = [640, 360, 168, 360, 360]
ROWH, PAD, HEAD = 360, 16, 28

def fit(im, w):
    return im.resize((w, int(w * 9 / 16)), Image.LANCZOS)

def tv(im):
    im = fit(im, 360).convert("RGB"); d = Image.new("RGB", im.size, (0, 0, 0))
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rectangle((0, im.height // 2, im.width, im.height), fill=215)
    return Image.composite(d, im, m)

rows = []
for t in thumbs:
    im = Image.open(t).convert("RGB")
    rows.append([fit(im, 640), fit(im, 360), fit(im, 168), tv(im), ImageOps.grayscale(fit(im, 360)).convert("RGB")])

feed = []
if feed_dir:
    feed = [Image.open(p).convert("RGB") for p in sorted(glob.glob(os.path.join(feed_dir, "*.jpg")) + glob.glob(os.path.join(feed_dir, "*.png")))][:8]

W = sum(COLW) + PAD * (len(COLW) + 1)
feed_h = (HEAD + 202 * ((len(feed) + len(thumbs) + 3) // 4) + PAD * 2) if feed else 0
H = HEAD + len(rows) * (ROWH + PAD) + PAD + feed_h
sheet = Image.new("RGB", (W, H), (245, 245, 245)); d = ImageDraw.Draw(sheet)
x = PAD
for lab, w in zip(LABELS, COLW):
    d.text((x, 8), lab, fill=(40, 40, 40)); x += w + PAD
y = HEAD
for t, r in zip(thumbs, rows):
    x = PAD
    for im, w in zip(r, COLW):
        sheet.paste(im, (x, y)); x += w + PAD
    d.text((PAD, y + ROWH - 4), os.path.basename(t), fill=(90, 90, 90))
    y += ROWH + PAD
if feed:
    d.text((PAD, y + 6), "in the feed (yours marked with a red bar)", fill=(40, 40, 40)); y += HEAD
    tiles = [(Image.open(t).convert("RGB"), True) for t in thumbs] + [(f, False) for f in feed]
    for i, (im, mine) in enumerate(tiles):
        tx, ty = PAD + (i % 4) * (360 + PAD), y + (i // 4) * (202 + PAD)
        sheet.paste(fit(im, 360), (tx, ty))
        if mine:
            d.rectangle((tx, ty + 198, tx + 360, ty + 203), fill=(230, 30, 30))
sheet.save(out, quality=88)
print("wrote", out)
