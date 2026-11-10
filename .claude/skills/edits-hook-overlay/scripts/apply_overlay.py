#!/usr/bin/env python3
"""Burn an extracted Edits text sprite onto any number of videos.

    apply_overlay.py SPRITE.png OUTDIR VIDEO [VIDEO ...]
        [--center-y native|0.165] [--start 0] [--end SECONDS] [--trim SECONDS]
        [--hlg-white 0.91] [--suffix hook]

* Scales the sprite by video_width / export_width, so it keeps the size it had in Edits.
* --center-y is the box centre as a fraction of the frame height. "native" (default) keeps
  the position it had in Edits (read from the sprite's .json).
* HLG sources (phone HDR) keep their original pixels: the sprite goes through an
  SDR709 -> HLG2020 LUT (SDR white = --hlg-white HLG signal) and is laid on the untouched
  clip, written as HEVC Main10 HLG. SDR sources get a plain overlay, written as H.264.
* Audio is stream-copied.
"""
import argparse, json, os, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = os.environ.get("FFPROBE") or shutil.which("ffprobe") or "ffprobe"


def probe(path):
    out = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,color_transfer:format=duration", "-of", "json", str(path)],
                         check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    return s["width"], s["height"], s.get("color_transfer", ""), float(j["format"]["duration"])


def hlg_lut(white):
    """Generated once per white level and cached (a 65^3 .cube is ~7 MB)."""
    cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "edits-hook-overlay"
    cache.mkdir(parents=True, exist_ok=True)
    lut = cache / f"sdr709-to-hlg2020-white{white:.3f}.cube"
    if not lut.exists():
        subprocess.run([sys.executable, str(HERE / "make_hlg_lut.py"), str(lut), "--white", str(white)], check=True)
    return lut


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sprite")
    ap.add_argument("outdir")
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--center-y", default="native")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float, default=None, help="overlay off at this time (default: whole clip)")
    ap.add_argument("--trim", type=float, default=None, help="only render the first N seconds (tests)")
    ap.add_argument("--hlg-white", type=float, default=0.91)
    ap.add_argument("--suffix", default="hook")
    a = ap.parse_args()

    sprite = Path(a.sprite).resolve()
    meta = json.loads(sprite.with_name(sprite.name.replace("-sprite.png", ".json")).read_text())
    box = meta["bbox"]
    out = Path(a.outdir).resolve()
    out.mkdir(parents=True, exist_ok=True)

    for v in a.videos:
        w, h, trc, dur = probe(v)
        k = w / meta["size"][0]
        sw, sh = round(box["w"] * k / 2) * 2, round(box["h"] * k / 2) * 2
        cy = (box["y"] + box["h"] / 2) / meta["size"][1] if a.center_y == "native" else float(a.center_y)
        x, y = round((w - sw) / 2), round(cy * h - sh / 2)
        end = min(a.end if a.end is not None else dur, a.trim or dur)
        enable = f"between(t,{a.start},{end})"
        hdr = trc == "arib-std-b67"
        dst = out / f"{Path(v).stem}-{a.suffix}.mp4"
        cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-stats", "-y",
               "-i", str(Path(v).resolve()), "-loop", "1", "-i", str(sprite)]
        cwd = None
        if hdr:
            lut = hlg_lut(a.hlg_white)
            cwd = lut.parent  # filter-graph paths break on quotes/colons: refer to the LUT by name
            fc = (f"[1:v]scale={sw}:{sh}:flags=lanczos,format=gbrap16le,lut3d=file={lut.name}:interp=tetrahedral,"
                  f"scale=out_color_matrix=bt2020:out_range=tv,format=yuva444p10le[ov];"
                  f"[0:v]format=yuv444p10le[base];"
                  f"[base][ov]overlay={x}:{y}:enable='{enable}':shortest=1:format=yuv444p10:alpha=straight,"
                  f"format=yuv420p10le[v]")
            enc = ["-c:v", "libx265", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1",
                   "-x265-params", "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:range=limited:log-level=error",
                   "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", "-color_range", "tv"]
        else:
            fc = (f"[1:v]scale={sw}:{sh}:flags=lanczos,format=rgba[ov];"
                  f"[0:v][ov]overlay={x}:{y}:enable='{enable}':shortest=1:format=auto,format=yuv420p[v]")
            enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p"]
        cmd += ["-filter_complex", fc, "-map", "[v]", "-map", "0:a?", "-c:a", "copy"]
        if a.trim:
            cmd += ["-t", str(a.trim)]
        cmd += enc + ["-movflags", "+faststart", str(dst)]
        print(f"{v} -> {dst}  ({w}x{h} {'HLG' if hdr else 'SDR'}, sprite {sw}x{sh} at {x},{y}, on {a.start}-{end}s)")
        subprocess.run(cmd, check=True, cwd=cwd)


if __name__ == "__main__":
    main()
