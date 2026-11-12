# Comp patterns for a pre-shoot build

The template comp (`assets/comp-template/`) is a HyperFrames composition at 1080x1920, 30 fps, with one landscape camera
base (drawn at 3413x1920) and a 1080x930 top panel. `build.mjs` calls each `sections/NN-*.mjs` with the builder `x`;
`x.finish()` assembles the page. `sections/00-reel.example.mjs` shows every pattern below in one file.

## Contents
- Anchors
- Scene modes
- Panel videos and overlays
- Cards: post and page crops with highlights and pushes
- Walls
- Hooks as variants
- Stand-in-only markers
- End card
- Captions
- Sound

## Anchors

```js
const t1 = P("someone", "gave");          // start of the first occurrence of a word sequence
const tHour = S("hour");                  // start of a word (E() = its end)
const tEightD = S("eight", t6);           // the first "eight" AFTER t6: always pass `from` for repeated words
const L = (t) => t - 0.03;                // cut a hair before the word lands
```

Words are normalized (lowercase, only `a-z 0-9 $ % ' .`, trailing dot dropped): "5.2." matches "5.2", "seventy-five."
matches "seventy-five", "4K" matches "4k". A real readback may write a number differently ("five seventy-five" vs
"$5.75"); the build fails with `word not found: "..."`, which is the cue to change that one anchor.

## Scene modes

```js
full(L(t2), L(t3), 1.0);      // the speaker full frame; third arg > 1 is a punch-in (1.04-1.08)
vis(L(t4), L(t5));            // visuals full screen, the speaker hidden
// everything not FULL or VIS is SPLIT (panel on top, the speaker under the seam)
```

Mode changes are hard cuts with a short white flash; keep them on line boundaries. A sliding panel between SPLIT and
FULL crosses the face, so the framework never slides.

## Panel videos and overlays

```js
const FILL = { x: 0, y: 0, w: 1080, h: 930, radius: 0, fit: "cover" };
const TALL = { x: 0, y: 0, w: 1080, h: 1920, radius: 0, fit: "cover" };
pvid("v01", 0, L(t2), "assets/clips/c01-hook.mp4", FILL);                 // a clip in the panel
pvid("v09b", L(tWalk), L(t10), "assets/clips/c09b.mp4", { ...FILL, rate: 0.85 });   // stretch a short clip
pvid("v04", L(t4), L(t5), "assets/clips/c04-vis.mp4", TALL);              // inside a vis() window
const OVER = { z: 20, enter: "none", flash: false, drift: 0 };
beat("b01", tStart, tEnd, card.html, OVER);                               // anything on top of a playing clip
beat("b08", tStart, tEnd, card.html, { ...OVER, tall: true });            // an overlay inside a VIS window
```

Panel videos render at z 15; a beat without `z` sits under them. A timed video never goes inside a timed wrapper (the
renderer drops it), so clips are always `pvid`, never HTML inside a beat. A beat's default `drift` slowly scales its
content; overlays use `drift: 0` so a card's push is the only motion.

## Cards: post and page crops with highlights and pushes

```js
const c = card("b01c", "post-a", [
  { crop: [0, 0, 1080, 470], hl: ["one prompt"] },      // the post header and the lines that matter (capture px)
  { crop: [0, 1160, 1080, 84], hl: ["VIEWS"] },        // the views row, stacked under it
], { x: 130, y: 320, w: 820 });
beat("b01", tPrompt - 0.5, L(tGame), c.html, OVER);
slide("#b01c", tPrompt - 0.5, -180, 0.34);             // enter (or rise / pop)
c.hl("VIEWS", tPrompt, 0.3);                           // sweep the highlighter
c.push(["one prompt"], tHour - 0.6, 1.6);              // push in on the phrase (capped by the safe area)
c.hl("one prompt", tHour - 0.2, 0.42);                 // mark it as it is said
out("#b01c", L(tGame) - 0.22, 0.2);                    // leave before the line ends, so the clip plays clean
```

- Crop each part to the lines that carry the beat; skip lines the speaker does not say, above all claims they do not
  make. Several crops of one capture stack into one white card.
- `push(phrases, t, max)` scales about the centre of all the listed phrases. It stops where the phrases would leave
  the safe text area (x 20-1060, y 300-875), so a long, full-width phrase gets little or no push: crop narrower or
  push on a shorter phrase. Start the push about 0.4-0.6 s before the word, so it is big when it is said.
- Captures with a photo or video background (a caption over a frame) take `cls: "ring"` on the part: an outlined box
  instead of a multiply highlighter, which disappears on dark or busy backgrounds.
- A dark page capture takes `cls: "dark"` on the card.
- Long multi-line page paragraphs: crop to 3-6 lines at `w: 1040` and push 1.15-1.3.
- The capture's phrase text must match `captures.json` exactly; for long phrases read it from the file rather than
  retyping it.

## Walls

A montage (the builds at once, a grid of posts) is one pre-composited video from `cut_clips.py` (`walls` in the spec),
played with one `pvid`. Several concurrent `<video>` players in one beat break caption gating in the render.

## Hooks as variants

```js
if (HOOK === "A") { /* lines 1-4 */ } else if (HOOK === "B") { /* B's lines */ } else { /* C's lines */ }
/* body: shared by every hook */
```

Write the shared lines (a line every hook repeats) as functions that take their start and end, and call them from each
hook. Build with `node build.mjs --ver preB` (the hook is read from the version suffix) or `--hook B`.

## Stand-in-only markers

```js
if (STANDIN) beat("b13todo", a, b, `<div class="todo">APP SHOT HERE</div>`, OVER);
```

`STANDIN` is true for `pre*` versions only, so the marker shows in every preview and can never reach a real cut.

## End card

The comment word as a red pill, a comment field typing it, the send button tapped on "send". Give the line's first
words something real behind it (the wall of builds under a dark scrim that fades in before the pill), not an empty
panel. See the example section.

## Captions

```js
captions({ words: x.CAPWORDS || undefined, maxChars: 25,
  fix: (w) => (/^"?word"?[.,]?$/i.test(w.word) && w.start > tComment - 0.2 ? "WORD" : null),
  keep: ["one prompt", "fable 52", "30 faster"] });
```

White on a black box: on the seam in SPLIT and VIS, under the chin in FULL; at most 4 words / 25 characters a chunk.
`keep` pairs use the normalized form (lowercase, no punctuation: "5.2" becomes "52", "30%" becomes "30").

## Sound

`hit(t, name, vol)` from the SFX kit in `assets/sfx/` (its `durations.json` lists the names). A swipe or pop as a card
enters, a ding when a highlight lands, a click on a cut, a thud on the catch. About one hit a second at most; organic
reels usually run no music bed.
