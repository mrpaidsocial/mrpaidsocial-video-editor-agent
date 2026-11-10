---
name: edits-hook-overlay
description: Put Instagram's NATIVE text hook (the Edits app's own font, boxes and styling) on many videos without opening each one in Edits. Type each hook once in Edits on a USB-connected iPhone over a black/white plate, export it, lift the text out as an exact transparent PNG (difference matte), and burn it onto any number of videos, keeping HDR (HLG) phone footage untouched. Use for "put my IG text hook on these videos", "native Instagram title on all of these", "same hook overlay on 100 clips", "make the Edits text once and reuse it", "hook text in my feed style on this batch", or a batch of clips that each need a native-looking title. Not for animated text, auto-captions (use the platform's own captions), posting, or designed motion-graphic titles (branded-ad-edit / reel-recut).
---

# Edits hook overlay

Instagram's native text (Edits / the IG composer) is a look you cannot reproduce exactly in
a renderer: its font, per-line rounded boxes and anti-aliasing are Instagram's. This skill
gets that exact look onto any number of videos while the phone only ever touches a 6-second
template project.

```
plate (black 3 s | white 3 s) ──► Edits template project: ONE styled text clip over both halves
        │  per hook: retype text → Export → Download          (scripts/edits_hooks.py)
        ▼
 hook-NN.mp4 (camera roll → pulled over USB)
        │  difference matte                                  (scripts/extract_overlay.py)
        ▼
 hook-NN.png  +  hook-NN-sprite.png  +  hook-NN.json (bbox, checks)
        │  scale · place · time · HLG-safe burn-in            (scripts/apply_overlay.py)
        ▼
 <video>-hook.mp4   × as many videos as you like
```

**Why a black and a white plate, not a mask or chroma key:** for every pixel,
`black = a·C` and `white = a·C + (1−a)`, so `a = 1 − (white − black)` and `C = black / a`.
That recovers Instagram's own soft edges, rounded box corners, outlines and any partial
opacity exactly. A key or a threshold mask would eat the anti-aliasing and fringe on the
box corners. Both plates must show identical, *static* text.

## Requirements

- An iPhone with Edits, over USB, with WebDriverAgent running and port-forwarded
  (`--wda`, default `http://localhost:8100`) and the screen unlocked. Where that runner and
  its helper live is machine-specific: see MASTER_CONTEXT.md.
- `pymobiledevice3` (camera-roll listing + pull; `--pmd3` or `PMD3=`), `ffmpeg`/`ffprobe`
  (or `FFMPEG`/`FFPROBE`), Python 3 with numpy + Pillow.
- No phone? Steps 2–3 work on ANY export of static text over the plate, made by hand.

## One-time template (by hand, ~2 minutes)

1. `scripts/make_plate.sh plate-bw.mp4` → get it into the phone's Photos (AirDrop, iCloud,
   or the working repo's phone hand-off).
2. Edits → **+** → Gallery → the plate → Add. **Text** → type a placeholder → set the style
   (e.g. font **Classic**, emphasis **Background** = black box / white text; Inverted
   Background = white box; red text + Background = red box) → Done.
3. **Stretch the text clip across the whole plate.** Edits gives new text 3 s by default,
   which only covers the black half: select the clip and drag its right handle past 3 s.
   No text animation (Animation tab = none); the extractor refuses moving text.
4. Rename the project (project name ▾ → Rename), e.g. `HOOK TEMPLATE black box`. One
   template per style; position and size in the template don't matter much, because
   placement is decided at burn-in.

## 1. Render the hooks on the phone

```bash
python3 scripts/edits_hooks.py --template "HOOK TEMPLATE black box" --out <project>/exports \
  "FIRST HOOK\nSECOND LINE" "ANOTHER HOOK"
```

Per hook: open the template from the grid, open the text clip → Edit, delete the old text,
type the new one at ~6 keys/s, **verify the clip's label equals the hook**, Next → (accepts
the "export at higher resolution anyway" prompt if Edits shows it) → Download, wait for
exactly one new camera-roll MP4, pull it to `hook-NN.mp4`. Writes `hook-manifest.json`.
About 40 s per hook. It never shares or posts; the template keeps the last hook's text.

Line breaks are yours (`\n`); Edits wraps long lines on its own. ALL CAPS reads like the
native feed titles. Hook copy is public copy: write it from the speaker's own words and run
the house copy QA before rendering.

## 2. Lift each hook out

```bash
python3 scripts/extract_overlay.py <project>/exports/hook-01.mp4 <project>/overlays --name hook-01
```

Medians many frames from each half (HEVC noise cancels), writes the full-frame RGBA PNG,
a cropped `-sprite.png` and a `.json`. **Gates, read every time:**
`recomposite_mean_abs_err_8bit` (re-composite over both plates vs the export; ~0.01 is
normal, > 1 means the plates or text differ) and `motion_between_black_frames` (> 3 =
animated text, fix the template). Fails loudly if the text does not cover both halves.

## 3. Burn it onto videos

```bash
python3 scripts/apply_overlay.py <project>/overlays/hook-01-sprite.png <project>/out \
  video1.mov video2.mp4 … [--center-y 0.165] [--start 0] [--end 3.2] [--trim 8]
```

- Size: scaled by `video_width / export_width`, i.e. the size it had in Edits.
- Place: centred horizontally; `--center-y` = box centre as a fraction of height
  (`native` = where it sat in Edits). Check the face and the platform's UI bands in the first
  frame; a feed-measured title position may sit inside the top UI band, which is a
  per-account call.
- Time: `--start/--end` (the native-feed habit is "on from 0 s until the first hard cut").
- **HDR (HLG) phone footage stays untouched**: the sprite goes through an SDR709→HLG2020
  LUT (`make_hlg_lut.py`, generated once into `~/.cache/edits-hook-overlay/`; SDR white →
  `--hlg-white`, default 0.91, so text white sits just above skin; BT.2408's 0.75 reads as a
  grey filter on bright selfies) and is overlaid on the original pixels, out as HEVC Main10
  HLG with the source tags. SDR sources → H.264. Audio is stream-copied.

## 4. Verify, then deliver

- Look at a frame of every output in the medium the reviewer uses. For HLG, use an
  AVFoundation/Apple SDR frame grab plus a colour-managed conversion, not a naive ffmpeg
  PNG (that shows HLG as washed-out 709).
- Outside the box the output must match the source (mean abs diff ≈ 1/255 = encode noise).
- Run `video-qa` on finished edits and deliver on `video-review-canvas`.

## Scaling to a batch

- Same hook on N videos: one export, one `apply_overlay.py` call with N files.
- Different hook per video: one `edits_hooks.py` call with all the hook texts (one template,
  sequential exports), then pair hook i with video i in a loop.
- A new style (red box, white box, outline) = a second template project, made once.

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Hook shows dropped letters ("MADES HOOK") | WDA types too fast for Edits' text box | `/wda/keys` with `frequency` ≈ 6 (the script verifies the label and stops) |
| Text missing on the white half | new text clips default to 3 s | stretch the clip across the plate in the template |
| `filter… No such file` / quoting errors | apostrophes or colons in the LUT path break ffmpeg's filter parser | the script runs ffmpeg beside the cached LUT and refers to it by name |
| Script stuck before Download | Edits' "HD is the best fit… export anyway" prompt | handled; if Edits adds another dialog, the wait names the missing id |
| Wrong project opened | template name not unique / grid not at top | unique template names; the script taps the status bar to scroll up first |
| Washed-out text or footage on HDR clips | an 8-bit/SDR path somewhere | keep `apply_overlay.py`'s HLG branch; never tone-map the base |
