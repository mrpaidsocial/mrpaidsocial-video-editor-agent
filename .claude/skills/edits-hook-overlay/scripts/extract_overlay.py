#!/usr/bin/env python3
"""Lift an Instagram Edits text layer out of a black/white plate export as a transparent PNG.

The plate (make_plate.sh) is solid black for the first half and solid white for the second.
The same static text sits over both halves in Edits. For every pixel:

    black frame  B = a*C + (1-a)*bgB
    white frame  W = a*C + (1-a)*bgW
 => a = 1 - (W - B) / (bgW - bgB)          C = (B - (1-a)*bgB) / a

which recovers Instagram's own anti-aliasing, rounded boxes, outlines and any partial
opacity exactly — no chroma key, no guessing. Several frames per half are median-averaged
to cancel the HEVC noise.

    extract_overlay.py EXPORT.MP4 OUTDIR [--name hook]

Writes OUTDIR/<name>.png (full 1080x1920 RGBA, Instagram's own placement),
OUTDIR/<name>-sprite.png (cropped to the text) and OUTDIR/<name>.json (bbox, checks).
"""
import argparse, json, os, shutil, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image

FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = os.environ.get("FFPROBE") or shutil.which("ffprobe") or "ffprobe"


def frames(path, w, h):
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-f", "rawvideo",
                          "-pix_fmt", "rgb48le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype="<u2").reshape(-1, h, w, 3).astype(np.float32) / 65535.0


def probe(path):
    out = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout.strip()
    w, h = map(int, out.split(",")[:2])
    return w, h


def border(f):
    """Median of a 40 px frame border: the plate colour, whatever the text covers."""
    edge = np.concatenate([f[:40].reshape(-1, 3), f[-40:].reshape(-1, 3),
                           f[:, :40].reshape(-1, 3), f[:, -40:].reshape(-1, 3)])
    return np.median(edge, axis=0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export")
    ap.add_argument("outdir")
    ap.add_argument("--name", default="hook")
    ap.add_argument("--pad", type=int, default=6, help="sprite padding in px")
    a = ap.parse_args()

    w, h = probe(a.export)
    fr = frames(a.export, w, h)
    lum = np.array([border(f).mean() for f in fr])
    # Content = frame differs from its own plate colour somewhere (text present).
    has_text = np.array([np.abs(f - border(f)).max() > 0.25 for f in fr])
    blk = np.where((lum < 0.1) & has_text)[0]
    wht = np.where((lum > 0.9) & has_text)[0]
    # Skip the frames next to the cut and the text's own in/out edges.
    blk, wht = blk[3:-3] if len(blk) > 8 else blk, wht[3:-3] if len(wht) > 8 else wht
    if len(blk) < 3 or len(wht) < 3:
        sys.exit(f"need text over both plates: black frames {len(blk)}, white frames {len(wht)}. "
                 "Stretch the text clip across the whole plate in Edits.")

    B = np.median(fr[blk], axis=0)
    W = np.median(fr[wht], axis=0)
    bgB = np.median([border(fr[i]) for i in blk], axis=0)
    bgW = np.median([border(fr[i]) for i in wht], axis=0)


    a_ch = 1.0 - (W - B) / (bgW - bgB)
    alpha = np.clip(a_ch.mean(axis=2), 0, 1)
    alpha[alpha < 0.03] = 0
    alpha[alpha > 0.97] = 1
    safe = np.maximum(alpha, 1e-3)[..., None]
    color = np.clip((B - (1 - alpha[..., None]) * bgB) / safe, 0, 1)
    color[alpha == 0] = 0

    # Static check: an entrance animation breaks the matte. Compare the early and late
    # black-plate medians inside the text (HEVC noise is ~1/255 there; real motion is far more).
    k = max(len(blk) // 3, 1)
    inside = alpha > 0
    motion = float(np.abs(np.median(fr[blk[:k]], axis=0) - np.median(fr[blk[-k:]], axis=0))[inside].mean())

    rgba = np.dstack([color, alpha])
    out = Path(a.outdir)
    out.mkdir(parents=True, exist_ok=True)
    full = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8))
    full.save(out / f"{a.name}.png")

    ys, xs = np.where(alpha > 0)
    y0, y1 = max(ys.min() - a.pad, 0), min(ys.max() + a.pad + 1, h)
    x0, x1 = max(xs.min() - a.pad, 0), min(xs.max() + a.pad + 1, w)
    full.crop((x0, y0, x1, y1)).save(out / f"{a.name}-sprite.png")

    # Self-check: re-composite over both plates and compare with the export.
    reB = rgba[..., :3] * alpha[..., None] + (1 - alpha[..., None]) * bgB
    reW = rgba[..., :3] * alpha[..., None] + (1 - alpha[..., None]) * bgW
    err = max(float(np.abs(reB - B).mean()), float(np.abs(reW - W).mean())) * 255
    meta = {
        "export": str(a.export), "size": [w, h],
        "black_frames": [int(blk[0]), int(blk[-1])], "white_frames": [int(wht[0]), int(wht[-1])],
        "plate_black": (bgB * 255).round(1).tolist(), "plate_white": (bgW * 255).round(1).tolist(),
        "bbox": {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)},
        "center_y_frac": round((y0 + y1) / 2 / h, 4), "width_frac": round((x1 - x0) / w, 4),
        "motion_between_black_frames": round(motion * 255, 2),
        "recomposite_mean_abs_err_8bit": round(err, 3),
    }
    (out / f"{a.name}.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))
    if motion * 255 > 3:
        print("WARNING: the text moves between frames — remove its animation in Edits.", file=sys.stderr)


if __name__ == "__main__":
    main()
