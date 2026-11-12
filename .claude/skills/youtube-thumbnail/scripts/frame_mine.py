#!/usr/bin/env python3
"""Mine thumbnail candidate frames from a video.

Samples the video, scores every sample for sharpness (edge energy) and exposure, keeps the
best sample in each window, and writes full-resolution JPGs plus a timestamped contact sheet
to look at. Faces and expressions are judged by eye on the sheet — this script only removes
the blurry, dark and duplicate frames so the sheet is worth looking at.

Usage:
  python3 frame_mine.py <video> <out_dir> [--every 0.5] [--window 4] [--top 48]
                        [--ranges 10-40,170-200]

Needs ffmpeg/ffprobe on PATH and Pillow.
"""
import argparse, json, os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFilter, ImageStat

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("out")
ap.add_argument("--every", type=float, default=0.5, help="seconds between samples")
ap.add_argument("--window", type=float, default=4.0, help="keep the best sample per window (s)")
ap.add_argument("--top", type=int, default=48, help="max candidates on the sheet")
ap.add_argument("--ranges", default="", help="only these source ranges, e.g. 10-40,170-200")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.video],
                           capture_output=True, text=True).stdout)
ranges = [tuple(map(float, r.split("-"))) for r in a.ranges.split(",") if r] or [(0.0, dur)]

def score(im):
    g = im.convert("L").resize((320, 180))
    edges = ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).var[0]
    mean = ImageStat.Stat(g).mean[0]
    exposure = 1.0 - abs(mean - 128) / 128          # penalise very dark / blown frames
    return edges * (0.35 + 0.65 * exposure), mean

samples = []
with tempfile.TemporaryDirectory() as tmp:
    for r0, r1 in ranges:
        pat = os.path.join(tmp, f"r{int(r0*1000)}_%06d.jpg")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{r0:.3f}", "-to", f"{r1:.3f}", "-i", a.video,
                        "-vf", f"fps=1/{a.every},scale=640:-2", "-q:v", "3", pat], check=True)
        files = sorted(f for f in os.listdir(tmp) if f.startswith(f"r{int(r0*1000)}_"))
        for i, f in enumerate(files):
            t = r0 + i * a.every
            s, mean = score(Image.open(os.path.join(tmp, f)))
            samples.append({"t": round(t, 2), "score": round(s, 1), "luma": round(mean, 1)})

# best sample per window, then the overall top N in time order
best = {}
for s in samples:
    k = int(s["t"] // a.window)
    if k not in best or s["score"] > best[k]["score"]:
        best[k] = s
keep = sorted(sorted(best.values(), key=lambda s: -s["score"])[: a.top], key=lambda s: s["t"])

tiles = []
for s in keep:
    p = os.path.join(a.out, f"cand_{s['t']:08.2f}.jpg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{s['t']:.3f}", "-i", a.video, "-frames:v", "1",
                    "-q:v", "2", p], check=True)
    s["file"] = p; tiles.append(s)
json.dump(tiles, open(os.path.join(a.out, "candidates.json"), "w"), indent=1)

TW, TH, COLS = 384, 216, 6
rows = (len(tiles) + COLS - 1) // COLS
sheet = Image.new("RGB", (TW * COLS, TH * max(rows, 1)), (20, 20, 20))
for i, s in enumerate(tiles):
    im = Image.open(s["file"]).convert("RGB"); im.thumbnail((TW, TH))
    d = ImageDraw.Draw(im); m, sec = divmod(s["t"], 60)
    d.rectangle((0, 0, 92, 18), fill=(0, 0, 0)); d.text((4, 3), f"{int(m)}:{sec:05.2f}", fill=(255, 220, 0))
    sheet.paste(im, ((i % COLS) * TW, (i // COLS) * TH))
sheet.save(os.path.join(a.out, "candidates_sheet.jpg"), quality=85)
print(f"{len(tiles)} candidates -> {a.out}/candidates_sheet.jpg")
