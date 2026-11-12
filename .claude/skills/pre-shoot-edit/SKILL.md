---
name: pre-shoot-edit
description: >-
  Build a split-screen talking-head edit BEFORE the footage exists, with a placeholder where the speaker's take goes,
  so edit day is only "drop in the take": edit-ready B-roll clips, the top-panel motion graphics (post cards with view
  counts, highlights and push-ins on the spoken words, page crops, montage walls, the comment end card), captions and
  sound hits, all keyed to the script's words; stand-in timing at the speaker's pace over a placeholder camera layer;
  a storyboard and stand-in previews (one per hook) on a review canvas. Use whenever the speaker is filming soon and
  wants to "get ahead of the edit", "start pulling B-roll and the motion graphics", "build the edit before I record",
  "prep it with a placeholder for my talking head", or there is an approved script or beats table and no footage yet.
  Also use on edit day to drop the real take into a pre-built comp. Not for already-filmed footage with no prep
  (video-edit-pipeline), writing the script, or one-off B-roll capture (broll-capture).
---

# Pre-shoot edit

The slow part of a split-screen reel is the top panel: finding each clip's best window, capturing the posts and pages,
building cards, timing highlights to words, checking legibility. None of that needs the speaker's footage, only the
script's words. Build all of it against the script with stand-in timing and a placeholder camera, review it before the
shoot, and on edit day the real take's words re-time every beat automatically. The edit that remains is the base cut.

This skill is a lane of [video-edit-pipeline](../video-edit-pipeline/SKILL.md). It owns everything up to the real
footage; on edit day the pipeline's Stage 0 (intake), Stage 4 (QA) and Stage 5/6 (canvas, revisions) take over.

## What you need

- **The script with a beats table**: one row per spoken line with its layout and the real visual it shows (a script
  skill such as a split-screen script workflow produces this). Hooks as separate lines that join one body.
- **The sources**, captured read-only: the source videos, and phone-width stills of every post or page that appears
  with phrase boxes for each phrase you will mark (see [broll-capture](../broll-capture/SKILL.md) and any capture
  scripts named in MASTER_CONTEXT). Keep views, handles and dates visible; they are the proof.
- **From MASTER_CONTEXT.md**: the projects directory, the speaker's measured pace (words per minute), a placeholder
  frame (a still of the speaker from an earlier take on the same set), the house caption/sound look, and the
  full-screen rule for this kind of video.

## Steps

### 1. Cut edit-ready clips

Write `broll/clips.spec.json` from the beats table: one window per line that shows a clip, cropped for its slot (top
panel 1080x930, full screen 1080x1920), plus any montage as a wall. Template: [assets/clips.spec.example.json](assets/clips.spec.example.json).

```bash
python3 -I <skill>/scripts/cut_clips.py <project> <project>/broll/clips.spec.json
python3 -I <skill>/scripts/clip_strips.py <project>/comp/assets/clips <project>/_check/clips
```

Look at every strip, and every cell of every wall. Creators burn captions, titles and timers into their own videos;
re-crop to dodge them (they read as your words in the panel), and carry the fix to every other window cut from the same
source, walls included. Check that the subject stays in the crop for the whole window, that a 16:9 source cropped to 9:16
still shows the thing, and that a clip is at least as long as the line it sits under (or slow it in the comp). Keep the
source's own disclaimers on screen ("sections accelerated") by fitting the whole frame instead of cropping.

The scripts call `ffmpeg` and `ffprobe` from PATH; set `FFMPEG` / `FFPROBE` to use a specific build. Run Python with
`-I`, since the scripts read downloaded media.

### 2. Set up the comp

Copy [assets/comp-template/](assets/comp-template/) to `<project>/comp/`: `lib.mjs` (SPLIT / FULL / VIS, captions,
beats, panel videos, `card()` with `push()`), `build.mjs`, `preview.sh`, `framing.json`, and
`sections/00-reel.example.mjs` as the starting `sections/00-reel.mjs`. Add the fonts and GSAP (`npx hyperframes skills
update talking-head-recut` installs them; or copy from the last split comp) and the SFX kit with its
`assets/sfx/durations.json`. Put the stills in `comp/assets/captures/` and their phrase boxes in `captures.json`
(`{id, file, w, h, phrases: [{text, rects: [[x, y, w, h]]}]}`; add a box by hand when a capture lacks one, and mark it
`"manual": true`).

### 3. Stand-in timing and the placeholder

One lines file per version (the main read; each hook as its own lines followed by the body lines it keeps), then:

```bash
python3 -I <skill>/scripts/standin.py --project <project> --version pre=lines-main.txt --version preB=lines-hookB.txt \
  --wpm <speaker pace> --from-video <earlier take on the same set> --at <seconds>
```

It writes `cuts/<ver>/words-<ver>.json` (the same shape as a real readback) and `comp/assets/base4k-pre.mp4`. Pick a
placeholder frame with the eyes open and centred; add a `pre` key to `framing.json` with that take's eye point. The
placeholder shows framing only; every review of it says "stand-in".

A second route has also worked: a scratch text-to-speech read of the script at the speaker's pace, transcribed for
word times, over a cut of an earlier reel filmed on the same set. The preview is audible and the motion reads truer;
the cost is a voice that is not theirs, so label it just as clearly. Either way the word list has the same shape, and
edit day replaces it.

### 4. Write the beats

One block per script line in `sections/00-reel.mjs`, every time an anchor to a spoken word. The patterns, with code,
are in [references/comp-patterns.md](references/comp-patterns.md). The essentials:

- **SPLIT by default**: the panel shows the thing the line names, the real one. **FULL** where the speaker is the
  content (the save line, a reaction, the catch, the question). **VIS** only where a build needs the whole frame or
  the speaker asked for full-screen B-roll, and the house rules allow it (some reviewers ban takeovers or want the
  speaker kept in a circle inset; MASTER_CONTEXT says); keep it to a line or two each time.
- **The hook gets the most impressive visual**, from frame 0, not a plain talking head.
- **Post and page cards push in on the phrase as it is said.** Body text at 1080 px is unreadable at phone width;
  `card().push()` scales about the marked words as far as the safe text area allows.
- **Overlays above playing clips** need `z: 20` (panel videos sit at 15) and no flash.
- **Hooks are variants** of one section (`HOOK` = A, B, C); B and C swap their own opening lines in front of the
  shared body.
- **Shots that wait on the speaker** (an app recording, a screen only they can open) get a to-do marker that renders
  only when `STANDIN` is true, so it can never reach a real cut.
- Captions only if this reel takes burned-in captions (MASTER_CONTEXT or the reviewer says; some reels ship with the
  platform's own captions). They are word-keyed, so building them costs nothing and dropping the `captions()` call
  removes them. A few sound hits on the words that land (about one per second at most). The comment end card with
  something real behind it from its first frame.

### 5. Build, check, preview, look

```bash
cd <project>/comp && node build.mjs --ver pre && npx hyperframes check .
python3 -I <skill>/scripts/storyboard.py <project> pre --labels <labels.json>
zsh preview.sh pre            # hook A, full length
zsh preview.sh preB 25        # other hooks: their first ~25 s
npm --prefix <pack>/tools/video-qa run qa:storyboard -- --storyboard <project>/storyboard-pre.json \
  --html <project>/comp/index.html --video <project>/renders/preview-pre.mp4 --out <project>/_qa/storyboard-pre
```

`hyperframes check` must show 0 errors; the warnings that come with this framework (caption read floors, the silent
placeholder, the one-file structure, pushed cards larger than the frame) are listed in
[references/lessons.md](references/lessons.md), and anything not on that list is a real finding. A section that throws
(usually an anchor word that is not in the word list) fails the build and leaves `index.html` as it was. Then look at
the rendered frames: a mid frame of every beat, and a late frame of every card beat (that is where the push has
landed). Fix what reads wrong, rebuild, re-render. The other traps that cost time on the first build are in the same
lessons file.

### 6. Review canvas before the shoot

Publish the previews with [video-review-canvas](../video-review-canvas/SKILL.md): one rendered version per hook,
labelled as stand-ins; a beat map per version with `t` from `scripts/line_times.py`; editor's notes that say what is
stand-in, what is built and checked, and what needs the speaker's call; download buttons that reuse the hosted files.
Publishing follows the user's normal review delivery; the reply leads with the canvas URL. A published preview is never
replaced: a fix after publishing renders to a new file (`TAG=r2 zsh preview.sh pre`) and goes up as a new canvas version
beside the old one, on the same link.

### 7. Hand off

Write `EDIT-PREP.md` in the project: what exists and where, the edit-day steps, and the open decisions. Log the session.

## Edit day

Follow [references/edit-day.md](references/edit-day.md): run the intake on the raw, cut it, write the real words in output time
to `cuts/v1/`, the cut to `comp/assets/base4k-v1.mp4`, a `v1` framing key, then `node build.mjs --ver v1`. A word said
differently fails the build by name; fix that anchor, rebuild, run the pipeline's QA, render, and republish the same
canvas slug with the new version so the planning notes carry over.

## Rules that hold throughout

- Real proof only: the creator's actual post, the vendor's page, the tool doing the step. No mock of anything that
  exists, no metaphor images, no text cards repeating the spoken words.
- Outside clips keep their creator's handle on screen and their audio muted; never edit a creator's words (lifting a
  "more" truncation with a display style is fine; changing text is not). Crop around claims the speaker does not make
  (a creator's income figure stays off screen).
- Source appearance is preserved: cropping and scaling only, no grade.
- Never cover the speaker's face; text stays inside the safe area (y 300 to 875 in the panel, the seam caption below).
- Nothing is posted, sent or generated with spend as part of prep; the stand-in is for review only.
