---
name: youtube-thumbnail
description: >-
  Design YouTube thumbnails that get clicked: a question-and-emotion brief first, then 10–15
  references mined for the mechanism behind them, candidate frames pulled from the real footage,
  a spec-driven composite (so A/B variants are cheap), and a check sheet that shows the
  thumbnail at feed and sidebar size, under the TV "top half only" view, in grayscale and
  beside the channel's current thumbnails. Use whenever someone asks for a thumbnail, a
  "sick / clickable / better thumbnail", thumbnail variants or an A/B test set, a cover image
  for a long-form video, a thumbnail review or critique ("why isn't this getting clicks?"),
  or "make it match our channel's thumbnails" — even if they only say "cover" or "the image
  for the video". Also for a Shorts/Reel cover frame. NOT for in-video title cards or
  captions (reel-recut / branded-ad-edit) and NOT for static ad creatives.
---

# youtube-thumbnail — the click happens here

YouTube keeps growing thumbnails and shrinking titles, on every surface: the new suggested
panel, the home feed and above all **TV**. Viewers look at the image first and read the title
only if the image earned it. So a thumbnail cannot lean on its title to be interesting. It has
to make someone **wonder something** and **feel something** by itself.

The process below came out of a working session plus the feedback a thumbnail strategist gives
creators most often
([source talk](https://www.youtube.com/watch?v=KE4zqD0ONDI)). Every step leaves an artifact,
so the reviewer can see why the thumbnail looks the way it does.

## 0. Intake (probe, don't assume)

- **The video**: path, its title (final or working), runtime, what actually happens in it.
- **The channel's look**: open the channel's Videos tab and save its 6–12 most recent
  thumbnails (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`) into `refs/channel/`. Note the
  house fonts, colors, text boxes, how faces are framed and how many words they use. A new
  thumbnail should look like it belongs there, only better.
- **TV share**: ask for (or read) YouTube Studio → Analytics → Audience → Device type. If TV is
  **10% or more**, the TV rule in step 5 is mandatory, not a nice-to-have.
- **Privacy screen**: list anything in frame that must not be legible: screens with client
  names, calendars, dashboards, addresses, plates, minors. You will blur it (step 4).

## 1. The brief: what should they wonder and feel? (before any pixels)

Do not start from "what should I show?". Write three short lines:

- **Question** it makes the viewer ask (e.g. "how is a 25-year-old running this?").
- **Emotion** it makes them feel (envy, curiosity, shock, relief, aspiration, humor,
  vulnerability).
- **Main character**: the one thing the eye must land on first (a face, an object, a number).

Every element that goes on the canvas must serve one of those three lines. If it doesn't, it
is clutter (step 5).

## 2. References: never start from a blank canvas

Collect **10–15** references, drawn from all five of these sources:

1. **Your own outliers**: this channel's videos that beat its median views. Their formats are
   proven with this audience.
2. **Outliers elsewhere in the niche**: videos that beat *their* channel's average (search
   YouTube; outlier tools exist if the user has one).
3. **Model channels**: channels with the same *format* (vlog, tutorial, interview) on a
   different topic. Their structures carry over.
4. **Bookmarks**: thumbnails that stopped the user's own scroll. A private "inspiration"
   playlist works as storage.
5. **Off-platform**: posters, film/TV stills, album covers, billboards, current ads.

For each reference, write one line in `refs/REFERENCES.md`: **what question it raises, what it
makes you feel, and the mechanism doing it** (contrast of scale, an unexpected element,
before/after, a number with a red arrow, a face reacting to something hidden, breaking the
2D frame, editorial type that signals taste...). **Copy the mechanism, not the picture.**
Applying a mechanism from outside the niche usually gives the most original result.

## 3. Mine the footage for the frame

```bash
python3 scripts/frame_mine.py <video> thumb/cands --every 0.5 --window 4 --top 48 [--ranges 10-40,170-200]
```

It drops blurry, dark and near-duplicate frames and writes full-resolution candidates plus
`candidates_sheet.jpg` with timecodes. **Look at the sheet**: pick on expression (a real
reaction beats a neutral face), on eyeline (someone looking or pointing *at* the thing creates
the question), and on a clean background. Two frames can be combined: a face from one moment
and the subject from another, joined by a feathered edge.

If the footage has no usable frame for the brief, say so, and suggest a 2-minute photo shoot
(the face and pose the brief needs) rather than settling for a weak frame.

## 4. Compose from a spec (and make variants)

```bash
python3 scripts/compose.py thumb/spec_a.json      # → 1280x720 JPEG, kept under 2 MB
```

The spec is a list of layers (`assets/spec.example.json` shows all of them): `image` (crop,
cover-fit, grade, blur, B&W, feathered edges), `gradient`, `spotlight` (darkens around the
subject), `text` (`*WORD*` gets the highlight color; optional pill box and rotation), `arrow`
and `ring`. Because it's data, a variant is a copied file with one change.

Composition rules that held up in review:

- **Main character first.** It must contrast with everything around it: brighter, larger,
  sharper, or a color nothing else has. Use `spotlight`, a grade, or a recolor; label it if
  needed.
- **Text adds; it doesn't repeat the title.** 2–4 words, huge, one highlight color. The
  title and the image are read together, so the text carries what the title doesn't say (a
  number, the stakes, the twist).
- **Faces**: never put text or graphics over the eyes or mouth; crop tight enough that the
  expression reads at 168 px.
- **Blur anything private** (step 0) with `"blur": 2–4` on that image layer, and check at full
  size that nothing can be read.
- **Match the channel**: reuse its fonts, box colors and text treatment unless the brief
  says to break the pattern.

Make **3 variants** that differ in *concept* or *text*, not in tiny nudges. YouTube's
Test & Compare takes up to three. Also write 3–5 alternative text lines. Text is the cheapest
thing to A/B test.

## 5. Check like a viewer, then fix

```bash
python3 scripts/check.py thumb/check_sheet.jpg thumb/A.jpg thumb/B.jpg thumb/C.jpg --feed refs/channel
```

Open the sheet and go down this list for every variant. Each item is pass/fail:

| Test | Pass when |
|---|---|
| **TV 50% test** | With the bottom half dimmed, the top half alone still says what the video is about and makes you want to see the rest. Fail → move the key element or a text line into the top third. |
| **No-title test** | Cover the title: the image alone raises the brief's question and emotion. |
| **Main character** | At feed size the eye lands on it first, within a second. |
| **Sidebar 168 px** | Text is readable and the face still shows an expression. |
| **Clutter** | Nothing on the canvas is unrelated to the brief: rails, cables, stray people, extra text. Remove it, crop it out or darken it. |
| **Grayscale** | Subject and text still separate from the background by brightness alone. |
| **In the feed** | Next to the channel's current thumbnails it stands out, yet still looks like the same channel. |
| **Privacy / face rule** | No readable private data; nothing covers the eyes or mouth. |

Fix → recompose → re-check. Nothing ships on "looks fine at full size".

## 6. Deliver

- Files: `<prefix>_<slug>_thumb_<variant>_v<N>.jpg` (1280x720, sRGB, < 2 MB). New versions
  are new files. Show the check sheet with the delivery.
- Write the A/B plan in one line per variant: what concept or text it tests.
- Upload: YouTube Studio → the video → Thumbnail → **Test & Compare** (up to 3). A scheduler
  API can usually set only one custom thumbnail, and only on a verified channel. Say which
  route you're using.
- After ~1–2 weeks, record the winner and *why* (which mechanism) in the project log. The
  channel's next "own outliers" reference set grows from these results.

## Gotchas

- `ImageOps.fit` crops to fill. Set `focus` (0–1, 0–1) so it keeps the face, not the wall.
- `Impact`/`Arial Black` ship with macOS (`/System/Library/Fonts/Supplemental/`); Linux needs a
  font path in the spec.
- Hosted thumbnails at `i.ytimg.com/vi/<id>/maxresdefault.jpg` don't exist for every video;
  fall back to `hqdefault.jpg`.
- Shorts/Reels covers are 9:16 and get cropped to 1:1 or 4:5 on profile grids. Keep the
  text in the center square.
