// 00-reel.example.mjs: a small worked section showing every pattern the pre-shoot build uses. Copy it to
// sections/00-reel.mjs and replace the anchors, clips and captures with the project's own (one block per script line).
// The script this example assumes (one take per line):
//   1 "Someone gave the new model one prompt, and an hour later it built this game."
//   2 "Save this video so you have it."
//   3 "It's twice as fast as the last version, and they lowered the price."
//   4 "Look at this one. Every frame is painted by hand."
//   5 "Now here's the catch. It's not cheap."
//   6 "If you want the links, just comment WORD and I'll send them straight to you."
// Assets it expects: assets/clips/c01-hook.mp4 (1080x930), c04-painted-vis.mp4 (1080x1920), c06-wall-panel.mp4 (1080x930);
// captures "post-a" (a post with phrases "one prompt" and "VIEWS") and "page-a" (a page with phrases "twice as fast", "lower price")
// in assets/captures/captures.json.
export default function (x) {
  const { S, P, DUR, full, vis, beat, pvid, card, slide, rise, slam, punch, out, fade, hit, captions, SET, TO, type, HOOK, STANDIN } = x;
  const L = (t) => t - 0.03;                                    // cut a hair before the word lands
  const CLIP = (n) => `assets/clips/${n}.mp4`;
  const FILL = { x: 0, y: 0, w: 1080, h: 930, radius: 0, fit: "cover" };      // the top panel
  const TALL = { x: 0, y: 0, w: 1080, h: 1920, radius: 0, fit: "cover" };     // VIS: the whole frame
  const OVER = { z: 20, enter: "none", flash: false, drift: 0 };              // an overlay above a playing clip (videos sit at z 15)

  // ---- anchors: word or phrase lookups in the output-time word list; pass `from` for repeated words
  const t1 = P("someone", "gave"), tPrompt = S("prompt"), tHour = S("hour"), tGame = S("game");
  const t2 = P("save", "this", "video");
  const t3 = P("it's", "twice"), tFast = S("fast"), tLowered = S("lowered");
  const t4 = P("look", "at", "this"), tHand = S("hand");
  const t5 = P("now", "here's", "the", "catch"), tCatch = S("catch");
  const t6 = P("if", "you", "want"), tComment = S("comment", t6), tWord = S("word", tComment), tSend = S("send", tComment);

  // ---- 1 (SPLIT from frame 0): the most impressive real clip fills the panel; the creator's post slides in with its view
  // count marked, pushes in on the phrase as it is said, and leaves before the line ends so the clip plays clean
  if (HOOK === "A") {
    pvid("v01", 0, L(t2), CLIP("c01-hook"), FILL);
    const c = card("b01c", "post-a", [{ crop: [0, 0, 1080, 470], hl: ["one prompt"] }, { crop: [0, 1160, 1080, 84], hl: ["VIEWS"] }]);
    beat("b01", tPrompt - 0.5, L(tGame), c.html, OVER);
    slide("#b01c", tPrompt - 0.5, -180, 0.34); hit(tPrompt - 0.45, "swipe", 0.22);
    c.hl("VIEWS", tPrompt, 0.3);
    c.push(["one prompt"], tHour - 0.6, 1.6); c.hl("one prompt", tHour - 0.2, 0.42); hit(tHour, "ding", 0.3);
    out("#b01c", L(tGame) - 0.22, 0.2);
  }
  // ---- 2 (FULL): the speaker is the content on the save line
  full(L(t2), L(t3), 1.0);
  // ---- 3 (SPLIT): a page crop cut to the lines that carry the beat, marked on the spoken words
  {
    const c = card("b03c", "page-a", [{ crop: [0, 150, 1080, 250], hl: ["twice as fast", "lower price"] }], { x: 20, y: 400, w: 1040 });
    beat("b03", L(t3), L(t4), c.html);
    c.hl("twice as fast", tFast - 0.3, 0.5);
    c.push(["lower price"], tLowered - 0.45, 1.25); c.hl("lower price", tLowered - 0.1, 0.6); hit(tLowered + 0.2, "ding", 0.28);
  }
  // ---- 4 (VIS): the build itself full screen while the speaker talks (only when it needs the whole frame)
  vis(L(t4), L(t5));
  pvid("v04", L(t4), L(t5), CLIP("c04-painted-vis"), TALL); hit(L(t4) + 0.02, "click", 0.28);
  void tHand;
  // ---- 5 (FULL): the catch, with a punch-in
  full(L(t5), L(t6), 1.06); hit(tCatch + 0.05, "thud", 0.4);
  // ---- 6 end card: the builds under a scrim on "if you want the links", then the comment word and the field typing it
  {
    const a = L(t6);
    pvid("v06", a, DUR, CLIP("c06-wall-panel"), { ...FILL, rate: 0.6 });
    beat("b06", a, DUR, `<div class="scrim" id="b06s"></div><div class="ctab" id="b06t" style="top:380px"><span>COMMENT "WORD"</span></div>
      <div class="cbar" id="b06b" style="top:600px"><i class="av2"></i><div class="fld"><span class="ph" id="b06ph">Add a comment...</span><span class="ty" id="b06ty"><span class="tt"></span><i class="cur"></i></span></div><b class="post" id="b06p">Post</b></div>`, OVER);
    fade("#b06s", tComment - 0.6, 0.4);
    slam("#b06t", tComment - 0.1, 0.22); hit(tComment + 0.1, "thud", 0.42);
    rise("#b06b", tComment - 0.02, 50, 0.28);
    TO("#b06ph", { opacity: 0, duration: 0.06 }, tWord - 0.04);
    type("#b06ty", "WORD", tWord - 0.04, tWord + 0.3, true);
    SET("#b06p", { color: "#0095F6" }, tWord + 0.3);
    punch("#b06p", tSend - 0.04, 1.25, 0.3); hit(tSend, "ding", 0.32);
    // a to-do marker that only renders in stand-in builds (a shot that waits on the speaker, for example)
    if (STANDIN) beat("b06todo", a, a + 1.5, `<div class="todo">APP SHOT GOES HERE</div>`, OVER);
  }
  // ---- captions on every line: white on a black box, on the seam in SPLIT/VIS, under the chin in FULL
  captions({
    words: x.CAPWORDS || undefined,
    fix: (w) => (/^"?word"?[.,]?$/i.test(w.word) && w.start > tComment - 0.2 ? "WORD" : null),   // the comment word in caps
    maxChars: 25,
    keep: ["one prompt", "twice as", "the price", "comment word", "straight to"],   // spoken pairs a chunk boundary must not split (nz form)
  });
}
