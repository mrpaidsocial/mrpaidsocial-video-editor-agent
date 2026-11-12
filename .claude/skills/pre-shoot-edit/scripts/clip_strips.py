#!/usr/bin/env python3
"""Frame strips for checking cut clips: four evenly spaced frames of each clip side by side, clips stacked into a few
sheets, so every clip can be looked at in one or two image reads (no drawtext needed; some ffmpeg builds lack it).
Usage: python3 -I clip_strips.py <clips dir> <out dir> [name ...]
Writes <out>/strips-panel-N.png (panel and other landscape or near-square clips) and strips-tall-N.png (clips at least
1.5x taller than wide: full-screen 9:16), six clips per sheet, and prints which clips each sheet holds.
Look for: creators' own burned-in captions or titles inside the crop, a subject cut by the crop, black frames, a clip
shorter than its beat.
"""
import json, os, shutil, subprocess, sys

FF = os.environ.get("FFMPEG", "ffmpeg"); FP = os.environ.get("FFPROBE", "ffprobe")

def probe(f):
    j = json.loads(subprocess.check_output([FP, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                            "-show_entries", "format=duration", "-of", "json", f]))
    return j["streams"][0]["width"], j["streams"][0]["height"], float(j["format"]["duration"])

def strip(f, out, w, h, dur):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", f, "-vf",
                    f"fps=4/{dur:.3f},scale={w}:{h},tile=4x1:padding=4:color=white", "-frames:v", "1", out], check=True)

def stack(files, out):
    if not files:
        return
    if len(files) == 1:   # vstack needs two inputs or more
        shutil.copyfile(files[0], out); return
    width = max(int(subprocess.check_output([FP, "-v", "error", "-show_entries", "stream=width", "-of", "csv=p=0", f]).decode()) for f in files)
    ins, fl = [], ""
    for k, f in enumerate(files):
        ins += ["-i", f]; fl += f"[{k}:v]pad={width}:ih:0:0:color=white[p{k}];"
    fl += "".join(f"[p{k}]" for k in range(len(files))) + f"vstack=inputs={len(files)}"
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", *ins, "-filter_complex", fl, out], check=True)

def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]; want = set(sys.argv[3:]); os.makedirs(out, exist_ok=True)
    panel, tall = [], []
    for name in sorted(f[:-4] for f in os.listdir(src) if f.endswith(".mp4")):
        if want and name not in want:
            continue
        f = os.path.join(src, name + ".mp4"); w, h, d = probe(f)
        o = os.path.join(out, f"strip-{name}.png")
        if h >= w * 1.5:
            strip(f, o, 180, round(180 * h / w / 2) * 2, d); tall.append((name, o))
        else:
            strip(f, o, 300, round(300 * h / w / 2) * 2, d); panel.append((name, o))
    for label, group in (("panel", panel), ("tall", tall)):
        for i in range(0, len(group), 6):
            part = group[i:i + 6]; sheet = os.path.join(out, f"strips-{label}-{i // 6 + 1}.png")
            stack([p for _, p in part], sheet)
            print(sheet, "=", ", ".join(n for n, _ in part))

if __name__ == "__main__":
    main()
