#!/usr/bin/env python3
"""storyboard-<ver>.json/.md from a built split-screen comp: one element per timed beat or panel video, with a stable id,
the script line it carries and the output-time interval the comp schedules (data-start / data-duration in index.html).
The JSON is the video-qa storyboard schema (version 1, elements[id, label, selector, start, end]), ready for
  npm --prefix <pack>/tools/video-qa run qa:storyboard -- --storyboard <json> --html <comp>/index.html [--video <render>]
Ids come from the section code, so a stand-in build and the real cut share them and notes carry across versions.
Usage: python3 -I storyboard.py <project> <ver> [--labels labels.json]
labels.json: {"<element id>": "line 3: what the panel shows", ...}; unlabelled elements are listed so none slip through.
"""
import html, json, os, re, sys

def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    proj, ver = os.path.abspath(sys.argv[1]), sys.argv[2]
    labels = {}
    if "--labels" in sys.argv:
        labels = json.load(open(sys.argv[sys.argv.index("--labels") + 1]))
    src = open(os.path.join(proj, "comp", "index.html"), encoding="utf-8").read()
    title = re.search(r"<title>(.*?)</title>", src).group(1)
    if ver not in title.split():
        sys.exit(f"comp/index.html is '{title}', not version {ver}: build that version first")
    els = []
    for m in re.finditer(r'<(?:div|video) id="([^"]+)" class="clip (?:beat|pv)[^"]*"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"', src):
        eid, a, d = m.groups()
        els.append({"id": eid, "label": labels.get(eid, eid), "selector": "#" + eid, "start": float(a), "end": round(float(a) + float(d), 3)})
    els.sort(key=lambda e: (e["start"], e["id"]))
    out = os.path.join(proj, f"storyboard-{ver}.json")
    json.dump({"version": 1, "elements": els}, open(out, "w"), indent=1)
    rows = [f"| {e['id']} | {e['start']:.2f}-{e['end']:.2f} | {html.escape(e['label'], quote=False)} |" for e in els]
    open(os.path.join(proj, f"storyboard-{ver}.md"), "w").write(
        f"# Storyboard {ver} ({title})\n\nOutput seconds in this build. A stand-in build's times come from the stand-in word list; "
        "the edit-day build re-anchors every beat to the real words.\n\n| id | seconds | what shows |\n|---|---|---|\n" + "\n".join(rows) + "\n")
    missing = [e["id"] for e in els if e["id"] not in labels]
    print(f"{out}: {len(els)} elements" + (f"; no label for: {', '.join(missing)}" if missing and labels else ""))

if __name__ == "__main__":
    main()
