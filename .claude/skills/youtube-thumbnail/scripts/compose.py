#!/usr/bin/env python3
"""Compose a YouTube thumbnail from a JSON spec (layers drawn bottom to top).

Usage: python3 compose.py <spec.json> [<out.jpg>]   (out defaults to spec["out"])

Paths in the spec resolve relative to the spec file. Output is a 1280x720 sRGB JPEG kept
under YouTube's 2 MB upload limit. See assets/spec.example.json for every layer type:

  image     — a frame or photo: crop, cover-fit into a box, grade, blur, B&W, feathered edges
  fill      — solid color over the whole canvas or a box
  gradient  — darkening ramp from an edge (makes text readable without a box)
  spotlight — darkens everything outside an ellipse, so the main subject reads first
  text      — Impact / Arial Black / Avenir Next Heavy / DIN Condensed or a font path;
              stroke, soft drop shadow, optional pill box, rotation; "Hi *WORD*" colors WORD
  arrow     — thick arrow with a stroke, from → to
  ring      — outlined ellipse to circle something
"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

spec_path = sys.argv[1]
spec = json.load(open(spec_path))
base = os.path.dirname(os.path.abspath(spec_path))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(base, spec["out"])
W, H = spec.get("size", [1280, 720])

FONTS = {
    "impact": "/System/Library/Fonts/Supplemental/Impact.ttf",
    "arial black": "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "din condensed": "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf",
    "avenir next heavy": ("/System/Library/Fonts/Avenir Next.ttc", "Heavy"),
    "avenir next heavy italic": ("/System/Library/Fonts/Avenir Next.ttc", "Heavy Italic"),
}

def font(name, size):
    f = FONTS.get(name.lower(), name)
    if isinstance(f, tuple):
        for i in range(16):
            try:
                ft = ImageFont.truetype(f[0], size, index=i)
            except OSError:
                break
            if ft.getname()[1] == f[1]:
                return ft
        raise SystemExit(f"font style {f[1]} not found in {f[0]}")
    if not os.path.isabs(f):
        f = os.path.join(base, f)
    return ImageFont.truetype(f, size)

def rgba(c, alpha=None):
    c = c.lstrip("#"); v = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    a = int(c[6:8], 16) if len(c) == 8 else 255
    return (*v, a if alpha is None else int(alpha * 255))

def path(p):
    return p if os.path.isabs(p) else os.path.join(base, p)

canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))

def layer_image(L):
    im = Image.open(path(L["src"])).convert("RGB")
    if "crop" in L:
        im = im.crop(tuple(L["crop"]))
    x, y, w, h = L.get("box", [0, 0, W, H])
    im = ImageOps.fit(im, (w, h), Image.LANCZOS, centering=tuple(L.get("focus", [0.5, 0.5])))
    if L.get("flip"):
        im = ImageOps.mirror(im)
    g = L.get("grade", {})
    im = ImageEnhance.Contrast(im).enhance(g.get("contrast", 1.0))
    im = ImageEnhance.Color(im).enhance(0 if L.get("bw") else g.get("saturation", 1.0))
    im = ImageEnhance.Brightness(im).enhance(g.get("brightness", 1.0))
    if L.get("blur"):
        im = im.filter(ImageFilter.GaussianBlur(L["blur"]))
    mask = Image.new("L", (w, h), int(255 * L.get("opacity", 1.0))); md = ImageDraw.Draw(mask)
    top = int(255 * L.get("opacity", 1.0))
    for side, n in L.get("feather", {}).items():
        for i in range(int(n)):
            v = int(top * i / n)
            if side == "right": md.line([(w - 1 - i, 0), (w - 1 - i, h)], fill=v)
            if side == "left": md.line([(i, 0), (i, h)], fill=v)
            if side == "top": md.line([(0, i), (w, i)], fill=v)
            if side == "bottom": md.line([(0, h - 1 - i), (w, h - 1 - i)], fill=v)
    canvas.paste(im, (x, y), mask)

def layer_fill(L):
    x, y, w, h = L.get("box", [0, 0, W, H])
    o = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(o).rounded_rectangle((x, y, x + w, y + h), radius=L.get("radius", 0), fill=rgba(L["color"], L.get("opacity")))
    canvas.alpha_composite(o)

def layer_gradient(L):
    side, start, op = L.get("from", "bottom"), L.get("start", 0.5), L.get("opacity", 0.85)
    m = Image.new("L", (W, H), 0); d = ImageDraw.Draw(m)
    n = H if side in ("top", "bottom") else W
    for i in range(n):
        f = i / n if side in ("bottom", "right") else 1 - i / n
        v = int(max(0.0, (f - start) / (1 - start)) ** 1.4 * 255 * op)
        if side in ("top", "bottom"): d.line([(0, i), (W, i)], fill=v)
        else: d.line([(i, 0), (i, H)], fill=v)
    canvas.paste(Image.new("RGBA", (W, H), rgba(L.get("color", "#000000"))), (0, 0), m)

def layer_spotlight(L):
    cx, cy, rx, ry = L["ellipse"]
    m = Image.new("L", (W, H), int(255 * L.get("opacity", 0.55)))
    ImageDraw.Draw(m).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=0)
    m = m.filter(ImageFilter.GaussianBlur(L.get("soft", 60)))
    canvas.paste(Image.new("RGBA", (W, H), rgba(L.get("color", "#000000"))), (0, 0), m)

def layer_text(L):
    f = font(L.get("font", "impact"), L["size"])
    parts = [(p.strip("*"), p.startswith("*")) for p in re.split(r"(\*[^*]+\*)", L["text"]) if p]
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    tw = sum(probe.textlength(s, font=f) for s, _ in parts)
    x, y = L["xy"]
    if L.get("align") == "center": x -= tw / 2
    if L.get("align") == "right": x -= tw
    o = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(o)
    stroke, sfill = L.get("stroke", 6), rgba(L.get("stroke_fill", "#000000"))
    if "box" in L:
        b = L["box"]; pl, pt, pr, pb = b.get("pad", [18, 4, 18, 8])
        asc, desc = f.getmetrics()
        d.rounded_rectangle((x - pl, y + desc * 0.6 - pt, x + tw + pr, y + asc + desc * 0.4 + pb),
                            radius=b.get("radius", 16), fill=rgba(b["fill"]))
    if L.get("shadow", True) and "box" not in L:
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh); cx = x
        for s, _ in parts:
            sd.text((cx + 6, y + 8), s, font=f, fill=(0, 0, 0, 190), stroke_width=stroke, stroke_fill=(0, 0, 0, 190))
            cx += probe.textlength(s, font=f)
        o.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    cx = x
    for s, hl in parts:
        d.text((cx, y), s, font=f, fill=rgba(L.get("highlight", "#FFD60A") if hl else L.get("fill", "#FFFFFF")),
               stroke_width=stroke, stroke_fill=sfill)
        cx += probe.textlength(s, font=f)
    if L.get("rotate"):
        o = o.rotate(L["rotate"], center=(x + tw / 2, y + L["size"] / 2), resample=Image.BICUBIC)
    canvas.alpha_composite(o)

def layer_arrow(L):
    import math
    (x0, y0), (x1, y1) = L["from"], L["to"]; w = L.get("width", 26); col = rgba(L.get("color", "#FF2A2A"))
    ang = math.atan2(y1 - y0, x1 - x0); hl, hw = w * 2.6, w * 2.2
    bx, by = x1 - hl * math.cos(ang), y1 - hl * math.sin(ang)
    px, py = -math.sin(ang), math.cos(ang)
    shaft = [(x0 + px * w / 2, y0 + py * w / 2), (bx + px * w / 2, by + py * w / 2),
             (bx - px * w / 2, by - py * w / 2), (x0 - px * w / 2, y0 - py * w / 2)]
    head = [(x1, y1), (bx + px * hw, by + py * hw), (bx - px * hw, by - py * hw)]
    o = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(o)
    for poly in (shaft, head):
        d.polygon(poly, fill=col, outline=(0, 0, 0, 255), width=max(3, w // 6))
    canvas.alpha_composite(o)

def layer_ring(L):
    cx, cy, rx, ry = L["ellipse"]
    o = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(o)
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=rgba(L.get("color", "#FF2A2A")), width=L.get("width", 12))
    canvas.alpha_composite(o)

for L in spec["layers"]:
    {"image": layer_image, "fill": layer_fill, "gradient": layer_gradient, "spotlight": layer_spotlight,
     "text": layer_text, "arrow": layer_arrow, "ring": layer_ring}[L["type"]](L)

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
rgb = canvas.convert("RGB")
for q in (95, 90, 85, 80, 75):
    rgb.save(OUT, quality=q, optimize=True, subsampling=0 if q >= 90 else 2)
    if os.path.getsize(OUT) < 2_000_000:
        break
print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KB)")
