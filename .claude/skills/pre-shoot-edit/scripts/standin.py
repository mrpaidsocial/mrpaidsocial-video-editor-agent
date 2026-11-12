#!/usr/bin/env python3
"""Stand-in timing and a placeholder talking-head layer for a pre-shoot build.

For each version (main read, alternate hooks) it lays the script's words out at the speaker's pace and writes
<project>/cuts/<ver>/words-<ver>.json: [{"word", "start", "end"}] in output seconds, the same shape the real readback
will have on edit day. Longer words get a little more time; commas and sentence ends add short pauses; every line is
followed by a breath (each line is filmed as its own take, and the cut keeps a short gap).

It also writes the placeholder camera layer <project>/comp/assets/base4k-<ver>.mp4 (16:9, 30 fps, silent audio) for the
first version and symlinks the others to it:
  --still IMAGE                 hold this image (best: a frame of the speaker from an earlier take on the same set,
                                so FULL/SPLIT framing and the caption positions read true)
  --from-video FILE --at SEC    take that frame from an earlier take
  (neither)                     a plain dark card (framing cannot be judged; say so in the review)
The placeholder only shows framing. Label it as a stand-in wherever the preview is reviewed.

Usage:
  python3 -I standin.py --project <dir> --version pre=lines-main.txt [--version preB=lines-hookB.txt ...]
                        [--wpm 193] [--line-gap 0.30] [--still IMG | --from-video FILE --at SEC]
Lines files: one spoken line per line, in spoken order (blank lines ignored). Compose a hook variant's file as its own
opening lines followed by the body lines it keeps.
"""
import argparse, json, os, re, subprocess, sys

FF = os.environ.get("FFMPEG", "ffmpeg")

def lay_out(lines, wpm, line_gap, comma=0.10, stop=0.16, lead=0.25):
    out, t = [], lead
    for line in lines:
        toks = line.split()
        weights = [1.0 + 0.07 * len(re.sub(r"[^A-Za-z0-9$%]", "", w)) for w in toks]
        total = len(toks) * 60.0 / wpm
        for w, k in zip(toks, weights):
            d = total * k / sum(weights)
            out.append({"word": w, "start": round(t, 3), "end": round(t + d * 0.9, 3)})
            t += d
            if w.endswith(","):
                t += comma
            elif w.endswith((".", "?", "!")):
                t += stop
        t += line_gap
    return out

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("ffmpeg failed: " + r.stderr[-800:])

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True)
    ap.add_argument("--version", action="append", required=True, help="VER=lines.txt (first one also names the base file)")
    ap.add_argument("--wpm", type=float, default=193.0)
    ap.add_argument("--line-gap", type=float, default=0.30)
    ap.add_argument("--still")
    ap.add_argument("--from-video")
    ap.add_argument("--at", type=float, default=0.0)
    a = ap.parse_args()
    proj = os.path.abspath(a.project)
    vers = []
    for spec in a.version:
        ver, _, f = spec.partition("=")
        if not ver or not f:
            sys.exit(f"bad --version {spec!r}: use VER=lines.txt")
        lines = [l.strip() for l in open(f, encoding="utf-8") if l.strip()]
        vers.append((ver, lines))
    dur = 0.0
    for ver, lines in vers:
        words = lay_out(lines, a.wpm, a.line_gap)
        d = os.path.join(proj, "cuts", ver); os.makedirs(d, exist_ok=True)
        json.dump(words, open(os.path.join(d, f"words-{ver}.json"), "w"), indent=0)
        dur = max(dur, words[-1]["end"] + 1.0)
        n = len(words)
        print(f"{ver}: {len(lines)} lines, {n} words, last word ends {words[-1]['end']:.2f} s ({n / a.wpm * 60:.0f} s of speech at {a.wpm:.0f} wpm)")
    assets = os.path.join(proj, "comp", "assets"); os.makedirs(assets, exist_ok=True)
    first = vers[0][0]; base = os.path.join(assets, f"base4k-{first}.mp4")
    still = a.still
    if a.from_video:
        still = os.path.join(proj, "cuts", first, "standin-frame.png")
        run([FF, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{a.at}", "-i", a.from_video, "-frames:v", "1",
             "-vf", "scale=1920:1080:flags=lanczos", still])
    if still:
        vin = ["-loop", "1", "-framerate", "30", "-i", still]
        vf = ["-vf", "scale=1920:1080:flags=lanczos,setsar=1"]
    else:
        vin = ["-f", "lavfi", "-i", "color=c=0x1B1D24:s=1920x1080:r=30"]
        vf = []
    run([FF, "-hide_banner", "-loglevel", "error", "-y", *vin, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
         "-t", f"{dur:.2f}", *vf, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-g", "30",
         "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", base])
    for ver, _ in vers[1:]:
        link = os.path.join(assets, f"base4k-{ver}.mp4")
        if os.path.lexists(link):
            os.remove(link)
        os.symlink(os.path.basename(base), link)
    print(f"placeholder camera: {base} ({dur:.2f} s, {'still ' + still if still else 'dark card'})")

if __name__ == "__main__":
    main()
