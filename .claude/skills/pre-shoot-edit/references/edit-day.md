# Edit day: dropping the real take into a pre-built comp

The comp, clips, captures and storyboard are already built. What changes is the word list, the camera base and the
framing. Work in this order.

1. **Run the pipeline's Stage 0 intake on the raw.** Probe it, record its appearance, and where the camera records apart
   from its mic, run the intake's lip-sync step. Every later step uses the intake's output, never the raw.
2. **Pick takes and cut.** Each script line was filmed as its own take; choose the best complete delivery per line,
   cut the pauses and restarts, and keep the hooks as separate takes. Use the pack's take checks (per-take
   transcription, a listen pass, gap checks). Whisper merges restarts when one window holds both takes, so do not
   trust a single whole-file transcript.
3. **Write the version's inputs** (here `v1`; hook cuts get their own versions, such as `v1B`):
   - `cuts/v1/words-v1.json`: the readback's words in OUTPUT time, `[{word, start, end}]`.
   - optional `cuts/v1/caption-words.json` (caption spelling with the readback's timing) and `onsets-v1.json`
     (measured speech onsets, for one-word lines whose word times run late).
   - `comp/assets/base4k-v1.mp4`: the base cut (camera picture + mic audio).
   - `framing.json` key `v1`: the eye point measured on the synced raw (`ex`, `ey`, `eyeY`, `pushAnchorY`).
4. **Build.** `node build.mjs --ver v1`. If a word was said differently, the build stops with
   `word not found: "..."` or `phrase not found: "..."`. Change that anchor to the words actually said. Common: numbers
   and versions ("5.2" vs "five point two"), money ("$5.75" vs "five seventy-five"), hyphenated words, an ad-libbed
   opening. If a line was cut or re-ordered, its block's anchors must move with it.
5. **Shots that waited on the speaker.** Record them now (the app shot, the screen only they can open) and replace
   the `STANDIN`-only marker's slot with the real clip.
6. **Check.** `npx hyperframes check .` (0 errors), `storyboard.py <project> v1` + `qa:storyboard` (same ids as the
   stand-in), then the pipeline's Stage 4: render, `qa:video`, the sync check on the render when the intake synced the
   raw, frames from the actual MP4.
7. **Deliver.** Add the `v1` version to the same review canvas config (keep the stand-in versions for comparison) and
   republish the same slug, so notes left on the stand-in beats carry over by beat id. The reply leads with the URL.

If the real read is much faster or slower than the stand-in pace, nothing breaks: beats are word-anchored. Check only
that clips are at least as long as their lines (stretch with `rate` or pick a longer window) and that pushes still start
before their words.
