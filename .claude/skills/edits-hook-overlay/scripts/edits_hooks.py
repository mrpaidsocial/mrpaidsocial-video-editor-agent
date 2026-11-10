#!/usr/bin/env python3
"""Render hook texts in Instagram Edits on a USB iPhone, one export per hook, and pull them.

    edits_hooks.py --template "HOOK TEMPLATE black box" --out exports/ \
        "FIRST HOOK LINE ONE\\nLINE TWO" "SECOND HOOK" ...

Needs: a running WebDriverAgent reachable at --wda (default http://localhost:8100, i.e. a
usbmux port-forward), an unlocked phone, and pymobiledevice3 for the camera-roll pull.
The template project is made once by hand (SKILL.md "One-time template"): the black/white
plate with ONE styled text clip stretched across both halves. For each hook this script
opens the template, retypes the text (style, size and position stay), exports with
Download, waits for the new camera-roll MP4 and pulls it to --out. It never shares,
posts or deletes anything; the template keeps the last hook's text afterwards.

Element ids are Edits iOS ids observed 2026-10; if Edits renames one, the step that waits
for it fails with its name.
"""
import argparse, json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

BUNDLE = "com.burbn.basel"
OVERLAY_EL = "project.timeline.combined-overlay.element"


class WDA:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.sid = self.http("POST", "/session", {"capabilities": {"alwaysMatch": {}}})["sessionId"]

    def http(self, method, path, body=None, timeout=60):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            return json.loads(e.read() or b"{}")

    def s(self, method, path, body=None):
        return self.http(method, f"/session/{self.sid}{path}", body)

    def find(self, name=None, prefix=None, label_prefix=None):
        if name:
            q = {"using": "accessibility id", "value": name}
        elif prefix:
            q = {"using": "predicate string", "value": f"name BEGINSWITH '{prefix}'"}
        else:
            q = {"using": "predicate string", "value": f"label BEGINSWITH '{label_prefix}'"}
        v = self.s("POST", "/elements", q).get("value")
        return [e.get("ELEMENT") or next(iter(e.values())) for e in v] if isinstance(v, list) else []

    def wait(self, timeout=20, **kw):
        end = time.time() + timeout
        while time.time() < end:
            els = self.find(**kw)
            if els:
                return els[0]
            time.sleep(0.5)
        raise SystemExit(f"timed out waiting for element {kw}")

    def label(self, eid):
        return self.s("GET", f"/element/{eid}/attribute/label").get("value") or ""

    def click(self, eid):
        self.s("POST", f"/element/{eid}/click")

    def tap(self, x, y):
        self.s("POST", "/wda/tap", {"x": x, "y": y})

    def keys(self, text, freq):
        # Edits' text box drops letters at WDA's default typing speed; ~6 keys/s is reliable.
        self.s("POST", "/wda/keys", {"value": list(text), "frequency": freq})

    def launch(self, bundle):
        self.s("POST", "/wda/apps/launch", {"bundleId": bundle})


def dcim_mp4s(pmd3):
    out = subprocess.run([pmd3, "afc", "ls", "/DCIM"], capture_output=True, text=True, timeout=60).stdout
    dirs = sorted(d for d in out.split() if re.search(r"\d{3}APPLE$", d))[-2:]
    files = set()
    for d in dirs:
        ls = subprocess.run([pmd3, "afc", "ls", d], capture_output=True, text=True, timeout=120).stdout
        files |= {f for f in ls.split() if f.upper().endswith(".MP4")}
    return files


def to_grid(w):
    """From anywhere in Edits back to the project grid."""
    for _ in range(4):
        if w.find(name="new-project-button"):
            return
        if w.find(name="bsl_export_download_button"):
            w.tap(30, 81)                      # export sheet's close X has no accessibility id
        elif w.find(name="project_navigation_close_button"):
            w.click(w.find(name="project_navigation_close_button")[0])
        time.sleep(2)
    w.wait(name="new-project-button")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("hooks", nargs="+", help=r"hook texts; \n = line break")
    ap.add_argument("--template", required=True, help="Edits project name (its tile label starts with it)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--prefix", default="hook")
    ap.add_argument("--wda", default=os.environ.get("WDA_URL", "http://localhost:8100"))
    ap.add_argument("--pmd3", default=os.environ.get("PMD3") or shutil.which("pymobiledevice3") or "pymobiledevice3")
    ap.add_argument("--freq", type=int, default=6)
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    w = WDA(a.wda)
    w.launch(BUNDLE)
    time.sleep(2)
    manifest = []
    for i, raw in enumerate(a.hooks, 1):
        text = raw.replace("\\n", "\n")
        to_grid(w)
        w.tap(201, 8)                          # status-bar tap: grid to the top (template sorts first once used)
        time.sleep(1.5)
        w.click(w.wait(label_prefix=f"{a.template},"))
        clip = w.wait(prefix=OVERLAY_EL)
        old = w.label(clip)
        w.click(clip)
        w.click(w.wait(name="edit-button"))
        w.wait(name="text-entry-done-button")
        time.sleep(1)
        w.keys("\b" * (len(old) + 6), 20)
        w.keys(text, a.freq)
        time.sleep(0.5)
        w.click(w.wait(name="text-entry-done-button"))
        got = w.label(w.wait(prefix=OVERLAY_EL))
        want = " ".join(text.split())
        if " ".join(got.split()) != want:
            raise SystemExit(f"hook {i}: Edits shows {got!r}, expected {want!r} (typing dropped keys?)")

        before = dcim_mp4s(a.pmd3)
        w.click(w.wait(name="project_navigation_export_button"))
        # With the project set above HD, Edits asks once per export. Higher = sharper text
        # (2K renders it at 1440x2560, the size of a phone selfie master).
        end = time.time() + 120
        while time.time() < end and not w.find(name="bsl_export_download_button"):
            anyway = w.find(label_prefix="Export in 2K anyway") or w.find(label_prefix="Export in 4K anyway")
            if anyway:
                w.click(anyway[0])
            time.sleep(1)
        w.click(w.wait(name="bsl_export_download_button", timeout=5))
        new, end = set(), time.time() + 90
        while not new and time.time() < end:
            time.sleep(3)
            new = dcim_mp4s(a.pmd3) - before
        if len(new) != 1:
            raise SystemExit(f"hook {i}: expected one new camera-roll MP4, found {sorted(new)}")
        src = new.pop()
        dst = out / f"{a.prefix}-{i:02d}.mp4"
        tmp = out / ".pull"
        tmp.mkdir(exist_ok=True)
        subprocess.run([a.pmd3, "afc", "pull", src, str(tmp)], check=True, timeout=180)
        (tmp / Path(src).name).replace(dst)
        manifest.append({"hook": text, "file": dst.name, "camera_roll": src})
        print(f"hook {i}: {want!r} -> {dst} ({src})")
        to_grid(w)
    (out / f"{a.prefix}-manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
