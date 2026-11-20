# Lessons from the first pre-shoot build

Each of these cost a render or a re-cut once. Check for them up front.

## Clips
- **Creators' own captions inside the crop.** A film's narration captions ("It began with one sentence.") sat in the
  bottom of a room shot and a time-lapse; in the panel they read as the speaker's words. Re-crop to stop above them
  (a 2067x1780 crop of a 3840x2160 source kept the room and lost the caption).
- **Walls repeat the problem.** The same film went into two montage walls with full-height cell crops, and the caption
  came back in those cells for three seconds while the single clips stayed clean. A crop fixed for one clip is not fixed
  for the other windows cut from that source: check every wall cell on the strip sheets too.
- **Disclaimers stay.** A vendor demo marked "some sections accelerated" in a corner: fit the whole 16:9 frame in the
  panel (1000x562) instead of cropping it away, and never present a sped-up demo as real time.
- **Short clips.** A 4.5 s window under a 5.5 s line holds its last frame; stretch with `rate: 0.85` or take a longer
  window.
- **Montages.** Six live players in one beat break caption gating; pre-composite the wall with xstack.
- **Odd cell sizes.** ffmpeg's pad rounds an odd 4:2:0 cell down (465 to 464), so a 2-row wall of 465 px cells came out
  928 tall, or one pixel short of even and refused by x264. `cut_clips.py` lays walls out on even cells and pads the
  stack back to the requested size.

## Text and legibility
- **Post and page text is too small at phone width.** At w 820 a post's body text is about 9 px on a phone. Push the
  card in on the marked phrase (1.4-1.8 for a short phrase, 1.15-1.3 for a paragraph line).
- **A push can clip a ring.** A 1.47 push put the last of two ringed numbers past the right edge; `push()` now caps by
  the safe area, but check late frames of every card beat anyway.
- **Rings for captures over images.** A multiply highlighter vanishes on a busy frame; use the ring style.
- **Truncated captions.** A platform cut the caption to one line plus "more"; lifting the clamp with a display style
  keeps the creator's words unchanged. Clicking "more" or retyping the text is not acceptable.

## Build and render
- **One root composition.** `hyperframes check` fails with `multiple_root_compositions` when extra `index-*.html` builds
  sit beside `index.html`. Build to `index.html` only (or delete the extras).
- **zsh flags.** `${END:+--end $END}` reaches the CLI as ONE argument ("Unknown flag: --end 25"); use `--end=$END`.
- **No drawtext.** Some ffmpeg builds lack the drawtext filter; `clip_strips.py` and contact sheets avoid it.
- **A failed section used to write an empty page.** `build.mjs` now leaves `index.html` untouched when a section throws,
  and `preview.sh` runs with pipefail, so a missing anchor can never turn into a render of a half-built comp.
- **Expected check warnings.** `hyperframes check` must show 0 errors. These warnings come with the framework and were
  present on builds that rendered correctly: `line_unread` (captions keyed to speech), `audio_clip_silent` (the silent
  placeholder), `nested_structure_needs_subcomposition` and `composition_file_too_large` (one-file comp),
  `duplicate_media_discovery_risk` (a card that stacks two crops of one capture), and the infos `panel_out_of_canvas`,
  `escaped_container`, `container_overflow` (a pushed card is bigger than the frame by design). Anything else is a real
  finding.

## Review canvas
- **Beat ids are semantic and at least 3 characters** (`os` fails; `os-demo` passes); never ordinals like `p01`.
- **A published preview is immutable.** The canvas builder refuses changed media under an existing version, and notes
  are pinned to the frames the reviewer saw. A fix after publishing (two walls re-cut the morning after) renders to new
  files (`TAG=r2`) and is added as new versions beside the old ones, same slug.
- **Downloads reuse the hosted files.** Point `downloadName` / `downloads[].name` at the version's canvas filename, or
  every video uploads twice.
- **Say "stand-in" everywhere.** Title, label, the first editor's note: the placeholder camera is an earlier take, and
  the timing is a guess at the speaker's pace.
