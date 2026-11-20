#!/usr/bin/env python3
"""Cut edit-ready B-roll clips (and pre-composited walls) from a spec, for a split-screen comp.

Every clip is one source window, cropped for its slot (top panel 1080x930, full screen 1080x1920, or any size), resampled
to the comp's frame rate, H.264 CRF 16 with a keyframe every second, no audio. Cropping and scaling only: no grade, LUT,
tone map or speed change (a rate change belongs in the comp, where it is visible and reversible). Sources stay untouched.

A wall is a grid of windows pre-composited into ONE video with ffmpeg xstack. Many live <video> players in one beat break
caption gating in the renderer, so a montage of N clips is always one file.

Spec (JSON; paths relative to the project folder):
{
  "out": "comp/assets/clips", "fps": 30,
  "clips": [{"name": "c01-hook", "source": "broll/source/x/video.mp4", "start": 0.0, "duration": 10.5,
             "crop": "2348:2022:650:0", "size": [1080, 930], "shows": "what the clip shows, for the storyboard"}],
  "walls": [{"name": "c06-wall-panel", "cols": 3, "rows": 2, "cell": [360, 465], "pad": 5, "bg": "0x04050A",
             "duration": 4.0, "shows": "...", "cells": [{"source": "...", "start": 0.0, "crop": "1565:2022:1041:0"}]}]
}
crop = W:H:X:Y in SOURCE pixels (omit to fit the whole frame). For a panel slot keep the crop's aspect at 1080/930.
Usage: python3 -I cut_clips.py <project> <spec.json> [name ...]     (no names = everything)
Writes <out>/<name>.mp4 and <out>/clips.json (window, crop, size, what it shows). Look at every clip afterwards
(clip_strips.py): creators burn captions and titles into their own videos, and a crop often has to dodge them.
"""
import json, os, subprocess, sys

FF = os.environ.get("FFMPEG", "ffmpeg")

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("ffmpeg failed: " + r.stderr[-1500:])

def enc(fps):
    return ["-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-g", str(fps), "-keyint_min", str(fps),
            "-sc_threshold", "0", "-an", "-movflags", "+faststart"]

def cut(proj, out, c, fps):
    src = os.path.join(proj, c["source"]); w, h = c["size"]
    vf = (f"crop={c['crop']}," if c.get("crop") else "") + f"scale={w}:{h}:flags=lanczos,fps={fps},setsar=1"
    run([FF, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{c['start']}", "-i", src, "-t", f"{c['duration']}",
         "-vf", vf, *enc(fps), os.path.join(out, c["name"] + ".mp4")])

def even(n):
    return int(n) // 2 * 2

def wall(proj, out, wl, fps):
    cols, rows = wl["cols"], wl["rows"]; pad = wl.get("pad", 4); bg = wl.get("bg", "0x04050A")
    cells = wl["cells"]
    if len(cells) != cols * rows:
        sys.exit(f"wall {wl['name']}: {len(cells)} cells for a {cols}x{rows} grid")
    # 4:2:0 video needs even sizes: ffmpeg's pad silently rounds an odd cell (465 -> 464), and a grid placed on the odd
    # size ends one pixel short of even (929) and x264 refuses it. Lay the grid out on even cells, then pad the stack
    # back to the size asked for (rounded down to even), centred.
    cw, ch = even(wl["cell"][0]), even(wl["cell"][1])
    W, H = even(cols * wl["cell"][0]), even(rows * wl["cell"][1])
    ins, chains = [], []
    for k, c in enumerate(cells):
        ins += ["-ss", f"{c['start']}", "-t", f"{wl['duration']}", "-i", os.path.join(proj, c["source"])]
        crop = f"crop={c['crop']}," if c.get("crop") else ""
        chains.append(f"[{k}:v]{crop}scale={cw - 2 * pad}:{ch - 2 * pad}:flags=lanczos,pad={cw}:{ch}:{pad}:{pad}:color={bg},"
                      f"fps={fps},setsar=1,trim=duration={wl['duration']},setpts=PTS-STARTPTS[v{k}]")
    layout = "|".join(f"{(k % cols) * cw}_{(k // cols) * ch}" for k in range(len(cells)))
    fc = (";".join(chains) + ";" + "".join(f"[v{k}]" for k in range(len(cells))) + f"xstack=inputs={len(cells)}:layout={layout},"
          f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color={bg}[out]")
    run([FF, "-hide_banner", "-loglevel", "error", "-y", *ins, "-filter_complex", fc, "-map", "[out]", *enc(fps),
         os.path.join(out, wl["name"] + ".mp4")])

def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    proj = os.path.abspath(sys.argv[1]); spec = json.load(open(sys.argv[2])); want = set(sys.argv[3:])
    out = os.path.join(proj, spec.get("out", "comp/assets/clips")); os.makedirs(out, exist_ok=True)
    fps = int(spec.get("fps", 30)); f = os.path.join(out, "clips.json")
    meta = json.load(open(f)) if os.path.exists(f) else {}

    def done(name, entry):   # record each clip as soon as it exists, so a later failure loses nothing
        meta[name] = entry; json.dump(meta, open(f, "w"), indent=1); print("ok", name)

    for c in spec.get("clips", []):
        if want and c["name"] not in want:
            continue
        cut(proj, out, c, fps)
        done(c["name"], {k: c.get(k) for k in ("source", "start", "duration", "crop", "size", "shows")})
    for wl in spec.get("walls", []):
        if want and wl["name"] not in want:
            continue
        wall(proj, out, wl, fps)
        done(wl["name"], {"cells": wl["cells"], "grid": [wl["cols"], wl["rows"]], "cell": wl["cell"], "duration": wl["duration"],
                          "shows": wl.get("shows")})
    missing = want - {c["name"] for c in spec.get("clips", [])} - {w["name"] for w in spec.get("walls", [])}
    if missing:
        sys.exit("not in the spec: " + ", ".join(sorted(missing)))

if __name__ == "__main__":
    main()
