// lib.mjs: split-screen talking-head comp framework (HyperFrames, 1080x1920, 30 fps), template from the pre-shoot-edit skill.
// Three scene modes on one landscape camera base:
//   SPLIT = visuals in the top 930 px panel, the speaker's wide shot under the seam (the default)
//   FULL  = the speaker full frame (punch-ins on cue; captions under the chin)
//   VIS   = visuals full screen, the speaker hidden, the voice carries on
// Every beat is keyed to output-time word anchors (S / P lookups into the word list), so a build made before filming
// (stand-in words + placeholder camera) re-times itself when the real take's words replace the stand-in.
// Panel text stays at y >= G.SAFE (the vertical-video header band) and ends by y 875 (the seam caption box).
// Fork this folder per project; keep improvements generic and fold them back into the skill's template.
import fs from "fs";
import path from "path";

export const G = { W: 1080, H: 1920, PANEL_H: 930, BASE_W: 3413, SAFE: 300 };
export const C = {
  bg: "#04050A", text: "#EEF2FA", sub: "#97A1B5", dim: "#5B6478", line: "rgba(255,255,255,.10)", glass: "rgba(255,255,255,.06)",
  accent: "#0866FF", blue: "#3B82F6", sky: "#8CC2FF", violet: "#A66BFF", teal: "#18E0C6", orange: "#FF6B35", green: "#3DDC84",
  red: "#FF3B4E", yellow: "#FFD84D", ink: "#0B0E16", paper: "#FFFFFF",
};
export const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9$%'.]/g, "").replace(/\.$/, "");

// deterministic PRNG for particle layouts (a render must not change between builds)
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createBuilder({ wordsPath, sfxDurPath, baseLen, framing, dir, tail = 0.15 }) {
  const FR = Object.assign({ ex: 1744, ey: 680, zoom: 1.0, eyeY: 680, splitZoom: 0.56, splitEyeY: 1241 }, framing || {});
  const WORDS = JSON.parse(fs.readFileSync(wordsPath, "utf8"));
  const SFX_DUR = JSON.parse(fs.readFileSync(sfxDurPath, "utf8"));
  const CAPS = (() => { const f = path.join(dir, "assets/captures/captures.json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []; })();
  const DUR = Math.round(Math.min(WORDS[WORDS.length - 1].end + tail, baseLen) * 1000) / 1000;
  const html = [], tw = [], sfx = [], css = [], scenes = [], pushes = [], fulls = [];
  const ids = new Set();
  const uid = (id) => { if (ids.has(id)) throw new Error("duplicate element id: " + id); ids.add(id); return id; };

  // ------------------------------------------------------------------ word anchors (output time, time-anchored search)
  function W(text, from = 0) {
    const t = norm(text); const w = WORDS.find((x) => x.start >= from - 0.001 && norm(x.word) === t);
    if (!w) throw new Error(`word not found: "${text}" after ${from}`); return w;
  }
  const S = (text, from = 0) => W(text, from).start;
  const E = (text, from = 0) => W(text, from).end;
  function P(...parts) {           // start of the first occurrence of a word sequence after `from` (last arg if numeric)
    const from = typeof parts[parts.length - 1] === "number" ? parts.pop() : 0; const ts = parts.map(norm);
    for (let i = 0; i < WORDS.length - ts.length + 1; i++) {
      if (WORDS[i].start < from - 0.001) continue;
      if (ts.every((t, k) => norm(WORDS[i + k].word) === t)) return WORDS[i].start;
    }
    throw new Error(`phrase not found: "${parts.join(" ")}" after ${from}`);
  }
  function PE(...parts) {          // end of that phrase
    const from = typeof parts[parts.length - 1] === "number" ? parts.pop() : 0; const s = P(...parts, from);
    const i = WORDS.findIndex((w) => w.start === s); return WORDS[i + parts.length - 1].end;
  }

  // ------------------------------------------------------------------ tween helpers (emit timeline JS)
  const J = JSON.stringify;
  const RAW = (js) => tw.push(js);                      // raw timeline JS (function-based values, staggers)
  const FT = (sel, from, to, t) => tw.push(`FT(${J(sel)},${J(from)},${J(to)},${f3(t)});`);
  const SET = (sel, props, t) => tw.push(`tl.set(${J(sel)},${J(props)},${f3(t)});`);
  const TO = (sel, props, t) => tw.push(`tl.to(${J(sel)},${J(props)},${f3(t)});`);
  // ENTER = FT that also pre-applies the from-state at 0 (a fromTo with immediateRender:false leaves the element in its CSS state until t)
  const inited = new Set();
  const ENTER = (sel, from, to, t) => { if (!inited.has(sel)) { inited.add(sel); SET(sel, from, 0); } FT(sel, from, to, t); };
  const pop = (sel, t, d = 0.34, s0 = 0.6) => ENTER(sel, { opacity: 0, scale: s0 }, { opacity: 1, scale: 1, duration: d, ease: "back.out(1.8)" }, t);
  const rise = (sel, t, dy = 40, d = 0.42) => ENTER(sel, { opacity: 0, y: dy }, { opacity: 1, y: 0, duration: d, ease: "power3.out" }, t);
  const drop = (sel, t, dy = -60, d = 0.38) => ENTER(sel, { opacity: 0, y: dy }, { opacity: 1, y: 0, duration: d, ease: "back.out(1.5)" }, t);
  const slide = (sel, t, dx = 160, d = 0.4) => ENTER(sel, { opacity: 0, x: dx }, { opacity: 1, x: 0, duration: d, ease: "power3.out" }, t);
  const fade = (sel, t, d = 0.3) => ENTER(sel, { opacity: 0 }, { opacity: 1, duration: d, ease: "power2.out" }, t);
  const out = (sel, t, d = 0.22) => TO(sel, { opacity: 0, duration: d, ease: "power2.in" }, t);
  const slam = (sel, t, d = 0.3) => ENTER(sel, { opacity: 0, scale: 2.4 }, { opacity: 1, scale: 1, duration: d, ease: "power4.in" }, t);
  const punch = (sel, t, s = 1.08, d = 0.32) => { TO(sel, { scale: s, duration: d * 0.4, ease: "power2.out" }, t); TO(sel, { scale: 1, duration: d * 0.6, ease: "power2.inOut" }, t + d * 0.4); };
  const shake = (sel, t, amp = 14) => { const k = [amp, -amp * 0.8, amp * 0.6, -amp * 0.4, amp * 0.2, 0]; k.forEach((x, i) => TO(sel, { x, duration: 0.035, ease: "none" }, t + i * 0.035)); };
  const grow = (sel, t, d = 0.45, axis = "x") => ENTER(sel, axis === "x" ? { scaleX: 0 } : { scaleY: 0 }, axis === "x" ? { scaleX: 1, duration: d, ease: "power2.out" } : { scaleY: 1, duration: d, ease: "power2.out" }, t);
  const draw = (sel, t, d = 0.6) => ENTER(sel, { strokeDashoffset: 1.1 }, { strokeDashoffset: 0, duration: d, ease: "power2.inOut" }, t);  // SVG paths use pathLength=1 + dasharray 1
  const count = (sel, v0, v1, t0, t1, { prefix = "", suffix = "", dec = 0, ease = "power2.out" } = {}) =>
    tw.push(`COUNT(${J(sel)},${v0},${v1},${f3(t0)},${f3(t1)},${J(prefix)},${J(suffix)},${dec},${J(ease)});`);
  const type = (sel, text, t0, t1, cursor = true) => tw.push(`TYPE(${J(sel)},${J(text)},${f3(t0)},${f3(t1)},${cursor});`);
  // a sweeping highlighter over one phrase rect (scaleX 0 -> 1 from the left)
  const mark = (sel, t, d = 0.38) => ENTER(sel, { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: d, ease: "power2.inOut" }, t);

  // ------------------------------------------------------------------ SFX (kit = V7: pop click thud sub scratch ding swipe tvstatic)
  const BANNED = ["shimmer", "riser", "whoosh"];
  const TRIM = { click: 0.72, swipe: 0.6, pop: 0.8, ding: 0.85, thud: 0.95, scratch: 0.8, sub: 0.85, tvstatic: 0.7, type: 0.7 };
  function hit(t, name, vol = 0.5, dur = null) {
    if (BANNED.includes(name)) throw new Error("banned sfx: " + name);
    if (!SFX_DUR[name]) throw new Error("unknown sfx: " + name);
    sfx.push({ t: Math.max(0, t), name, vol: Math.min(1, vol * (TRIM[name] || 1)), dur });
  }

  // ------------------------------------------------------------------ scenes
  const scene = (mode, a, b) => { if (!["full", "split", "vis"].includes(mode)) throw new Error("scene mode " + mode); scenes.push({ mode, a, b }); };
  const full = (a, b, punchScale = 1.0) => { scene("full", a, b); if (punchScale > 1) pushes.push({ t0: a + 0.02, t1: b, scale: punchScale }); };
  const pushIn = (t0, t1, scale = 1.12) => pushes.push({ t0, t1, scale });
  const vis = (a, b) => scene("vis", a, b);

  // ------------------------------------------------------------------ beats: one panel container per beat
  // beat(id, a, b, inner, {enter, drift}) -> a 1080x930 container in the panel, shown [a, b), snappy enter, slow drift
  const beats = [];
  function beat(id, a, b, inner, { enter = "pop", drift = 1.035, cls = "", z = 0, flash = true, tall = false } = {}) {
    uid(id); beats.push({ id, a, b, inner, enter, drift, cls: cls + (tall ? " tall" : ""), z, flash }); return "#" + id;
  }
  // a FULL-mode sticker (above his brow line only); y = top px, h = height; caller guarantees it clears the brow
  const stickers = [];
  function sticker(id, a, b, inner, { y = 300, cls = "" } = {}) { uid(id); stickers.push({ id, a, b, inner, y, cls }); return "#" + id; }
  const addCss = (s) => css.push(s);
  const roots = []; const root = (h) => roots.push(h);
  // captions: white on a solid black box, one line of
  // <= 4 words / 22 chars, the word being said in yellow. SPLIT: on the seam (box 889-971: panel content ends <= 875, his cap
  // starts ~1000). FULL: under his chin (box 1331-1413, above the IG no-go band at 1421). Muted where the panel already shows
  // the exact words. opts: { fix(w) -> display text | null, mute: [[a, b]], ySplit, yFull, hot }
  let CAP = null, capCount = 0;
  const captions = (opts = {}) => { CAP = opts; };

  // ------------------------------------------------------------------ components (HTML strings)
  const svgCache = {};
  function logo(name, color = "#fff", size = 80, id = "") {
    const f = path.join(dir, `assets/img/logo-${name}.svg`);
    if (!svgCache[name]) svgCache[name] = fs.readFileSync(f, "utf8").replace(/<title>.*?<\/title>/, "");
    return `<span ${id ? `id="${uid(id)}"` : ""} class="logo" style="width:${size}px;height:${size}px;color:${color}">${svgCache[name].replace("<svg ", `<svg fill="currentColor" width="${size}" height="${size}" `)}</span>`;
  }
  // screenshot of a captured page or post (assets/captures) at width w; phrases get highlighter bars with ids `${id}h${k}_${r}`
  function shot(id, cap, { x = 40, y = 300, w = 1000, crop = null, fitH = 0, hl = [], color = C.yellow, cls = "" } = {}) {
    const c = CAPS.find((q) => q.id === cap); if (!c) throw new Error("capture not found: " + cap);
    if (fitH && !crop) {   // crop vertically around the highlighted phrases so the shot is at most fitH px tall on screen
      const ch0 = fitH / (w / c.w); const rs = hl.flatMap((h) => (typeof h === "number" ? c.phrases[h] : c.phrases.find((q) => q.text === h)).rects);
      const top = Math.min(...rs.map((r) => r[1])), bot = Math.max(...rs.map((r) => r[1] + r[3]));
      const cy = Math.max(0, Math.min(c.h - ch0, (top + bot) / 2 - ch0 / 2)); if (ch0 < c.h) crop = [0, cy, c.w, ch0];
    }
    const s = w / (crop ? crop[2] : c.w);
    const ox = crop ? crop[0] : 0, oy = crop ? crop[1] : 0, ch = (crop ? crop[3] : c.h) * s;
    const bars = [];
    const phr = (ptext) => typeof ptext === "number" ? c.phrases[ptext] : c.phrases.find((q) => q.text === ptext && q.found !== false);
    hl.forEach((ptext, k) => {
      const p = phr(ptext); if (!p) throw new Error(`phrase not in capture ${cap}: ${ptext}`);
      p.rects.forEach((r, j) => bars.push(`<i id="${uid(`${id}h${k}_${j}`)}" class="hl" style="left:${((r[0] - ox) * s - 4).toFixed(1)}px;top:${((r[1] - oy) * s + r[3] * s * 0.08).toFixed(1)}px;width:${(r[2] * s + 8).toFixed(1)}px;height:${(r[3] * s * 0.9).toFixed(1)}px;background:${color}"></i>`));
    });
    const img = `<img src="assets/captures/${path.basename(c.file)}" style="position:absolute;left:${(-ox * s).toFixed(1)}px;top:${(-oy * s).toFixed(1)}px;width:${(c.w * s).toFixed(1)}px"/>`;
    const fades = crop ? `${crop[1] > 1 ? '<i class="fadeT"></i>' : ""}${crop[1] + crop[3] < c.h - 1 ? '<i class="fadeB"></i>' : ""}` : "";
    return { html: `<div id="${uid(id)}" class="shot ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${ch.toFixed(1)}px">${img}<div class="hls">${bars.join("")}</div>${fades}</div>`, h: ch,
      marks: hl.map((_, k) => phr(hl[k]).rects.map((__, j) => `#${id}h${k}_${j}`)) };
  }
  // highlight every rect of phrase k in sequence starting at t over d seconds total
  const markPhrase = (sh, k, t, d = 0.5) => { const r = sh.marks[k]; r.forEach((sel, j) => mark(sel, t + (d / r.length) * j, d / r.length)); };
  const chip = (text, { id = "", color = C.accent, solid = false, cls = "" } = {}) =>
    `<span ${id ? `id="${uid(id)}"` : ""} class="chip ${solid ? "solid" : ""} ${cls}" style="--c:${color}">${esc(text)}</span>`;
  const img = (src, { id = "", x = 0, y = 0, w = 300, h = null, cls = "", style = "" } = {}) =>
    `<img ${id ? `id="${uid(id)}"` : ""} class="im ${cls}" src="${src}" style="left:${x}px;top:${y}px;width:${w}px;${h ? `height:${h}px;object-fit:cover;` : ""}${style}"/>`;
  const box = (inner, { id = "", x = 0, y = 0, w = 300, h = null, cls = "", style = "" } = {}) =>
    `<div ${id ? `id="${uid(id)}"` : ""} class="bx ${cls}" style="left:${x}px;top:${y}px;width:${w}px;${h !== null ? `height:${h}px;` : ""}${style}">${inner}</div>`;
  const txt = (text, { id = "", x = 0, y = 0, w = 1080, size = 64, weight = 900, color = C.text, align = "center", cls = "", style = "" } = {}) =>
    `<div ${id ? `id="${uid(id)}"` : ""} class="tx ${cls}" style="left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;font-weight:${weight};color:${color};text-align:${align};${style}">${text}</div>`;
  // Instagram-style feed ad card (a fictional example ad)
  const adCard = ({ id, x = 0, y = 0, w = 420, src = "assets/img/shoe-product.jpg", brand = "Your Brand", head = "The trail shoe built for grip", cta = "Shop now", aspect = 1, cls = "" }) =>
    `<div id="${uid(id)}" class="ad ${cls}" style="left:${x}px;top:${y}px;width:${w}px;--s:${(w / 420).toFixed(3)}">
      <div class="adh"><i class="ava"></i><div><b>${esc(brand)}</b><span>Sponsored</span></div></div>
      <div class="adi" style="height:${Math.round(w * aspect)}px"><img src="${src}"/></div>
      <div class="adc"><span>${esc(head)}</span><em>${esc(cta)}</em></div></div>`;
  const person = (id, { x = 0, y = 0, size = 64, color = C.sky, cls = "" } = {}) =>
    `<div id="${uid(id)}" class="person ${cls}" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;--c:${color}"><i></i><b></b></div>`;
  const stat = (id, { y = 380, big = "0", label = "", sub = "", color = C.green } = {}) =>
    `<div id="${uid(id)}" class="stat" style="top:${y}px;--c:${color}"><div class="sv"><span id="${uid(id + "v")}">${big}</span></div><div class="sl">${label}</div>${sub ? `<div class="ss">${sub}</div>` : ""}</div>`;
  const source = (text = "Source", { id = "", y = 860 } = {}) => `<div ${id ? `id="${uid(id)}"` : ""} class="src" style="top:${y}px">${esc(text)}</div>`;
  // a rubber stamp centred on (x, y): the row is a full-width flex line, GSAP owns the span's rotation and scale
  const stampRot = [];
  const stamp = (text, { id, x = 540, y = 600, color = C.red, rot = -8, size = 120 } = {}) => {
    stampRot.push({ sel: `#${id} span`, rot });
    return `<div id="${uid(id)}" class="stamp" data-layout-allow-overlap style="left:${x - 540}px;top:${y - size * 0.75}px;--c:${color};font-size:${size}px"><span>${esc(text)}</span></div>`;
  };
  const stampIn = (id, t, sfxName = "thud", vol = 0.55) => { ENTER(`#${id} span`, { opacity: 0, scale: 2.2 }, { opacity: 1, scale: 1, duration: 0.22, ease: "power4.in" }, t); if (sfxName) hit(t + 0.2, sfxName, vol); };
  // panel-level <video> (HyperFrames: a timed video never sits inside a timed wrapper)
  const pvids = [];
  function pvid(id, a, b, src, { x = 0, y = 0, w = 1080, h = 608, mediaStart = 0, rate = 1, cls = "", z = 15, radius = 22, fit = "cover" } = {}) {
    uid(id); pvids.push({ id, a, b, src, x, y, w, h, mediaStart, rate, cls, z, radius, fit }); return "#" + id;
  }
  const numBadge = (n, color, { id = "", x = 60, y = 320 } = {}) => `<div ${id ? `id="${uid(id)}"` : ""} class="nb" style="left:${x}px;top:${y}px;--c:${color}">${n}</div>`;


  // ------------------------------------------------------------------ post / page cards with a camera push onto the marked phrase
  // card(id, capId, parts, {x, y, w, cls}) stacks crops of ONE capture on a white card (e.g. the post header, the lines that
  // matter, the views row). parts: [{ crop: [x, y, w, h] in capture px, hl: [phrase text], cls }]. Returns { html, h, hl, push }:
  //   hl(phrase, t, d)        sweeps the highlighter over that phrase at t
  //   push(phrases, t, max)   scales the card about those phrases' centre, as far as `max` allows while the phrases stay inside
  //                           TXT_SAFE (body text at 1080 px is too small at phone width; the push makes the marked words big)
  const TXT_SAFE = { x0: 20, x1: 1060, y0: G.SAFE, y1: 875 };
  function card(id, cap, parts, { x = 130, y = 320, w = 820, cls = "" } = {}) {
    const c = CAPS.find((q) => q.id === cap); if (!c) throw new Error("capture not found: " + cap);
    let top = 0; const out = [], marks = new Map(), geo = [];
    parts.forEach((p, k) => {
      const sh = shot(`${id}${k}`, cap, { x: 0, y: top, w, crop: p.crop, hl: p.hl || [], cls: "flat " + (p.cls || "") });
      out.push(sh.html); (p.hl || []).forEach((ph, j) => marks.set(ph, [sh, j]));
      geo.push({ crop: p.crop, s: w / p.crop[2], top }); top += sh.h;
    });
    const rectsOf = (ph) => { const q = c.phrases.find((z) => z.text === ph); if (!q) throw new Error(`card ${id}: no phrase "${ph}" in ${cap}`); return q.rects; };
    function push(phrases, t, max = 1.5, d = 0.45) {
      const loc = [];
      for (const ph of phrases) for (const [rx, ry, rw, rh] of rectsOf(ph)) {
        const g = geo.find((q) => ry >= q.crop[1] - 1 && ry + rh <= q.crop[1] + q.crop[3] + 1); if (!g) continue;
        loc.push([(rx - g.crop[0]) * g.s, g.top + (ry - g.crop[1]) * g.s, rw * g.s, rh * g.s]);
      }
      if (!loc.length) throw new Error(`card ${id}: phrases not inside any part: ${phrases}`);
      const bx0 = Math.min(...loc.map((r) => r[0])), by0 = Math.min(...loc.map((r) => r[1]));
      const bx1 = Math.max(...loc.map((r) => r[0] + r[2])), by1 = Math.max(...loc.map((r) => r[1] + r[3]));
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, ax = x + cx, ay = y + cy;
      const z = Math.min(max, (2 * Math.min(ax - TXT_SAFE.x0, TXT_SAFE.x1 - ax)) / (bx1 - bx0), (2 * Math.min(ay - TXT_SAFE.y0, TXT_SAFE.y1 - ay)) / (by1 - by0));
      if (z <= 1.02) return 1;
      SET(`#${id}`, { transformOrigin: `${cx.toFixed(1)}px ${cy.toFixed(1)}px` }, 0);
      TO(`#${id}`, { scale: z, duration: d, ease: "power2.inOut" }, t);
      return z;
    }
    return { h: top, push, html: `<div id="${uid(id)}" class="pc ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${top.toFixed(1)}px">${out.join("")}</div>`,
      hl: (ph, t, d = 0.45) => { const m = marks.get(ph); if (!m) throw new Error(`card ${id}: no marked phrase "${ph}"`); markPhrase(m[0], m[1], t, d); } };
  }

  // ------------------------------------------------------------------ finish: scenes, beats, assembly
  function finish({ title = "split reel", baseSrc = "assets/base4k.mp4" } = {}) {
    // scenes: fill gaps with SPLIT (this reel lives in split), merge neighbours
    const sc = scenes.slice().sort((p, q) => p.a - q.a); const filled = []; let cur = 0;
    for (const s of sc) { if (s.a > cur + 0.01) filled.push({ mode: "split", a: cur, b: s.a }); if (s.a < cur - 0.01) throw new Error(`overlapping scenes at ${f3(s.a)}`); filled.push(s); cur = s.b; }
    if (cur < DUR - 0.01) filled.push({ mode: "split", a: cur, b: DUR });
    const merged = []; for (const s of filled) { const l = merged[merged.length - 1]; if (l && l.mode === s.mode) l.b = s.b; else merged.push({ ...s }); }
    const at = (z, eyeY) => ({ x: 540 - FR.ex * z, y: eyeY - FR.ey * z, scale: z });
    const FULLB = at(FR.zoom, FR.eyeY), SPLITB = at(FR.splitZoom, FR.splitEyeY);
    // v2: with captions under his chin, FULL punch-ins scale about a fixed output line (FR.pushAnchorY, the chin line) instead of
    // the eyes, so the chin never drops onto the caption; the top of the cap crops instead
    const pushAt = (z) => { if (!FR.pushAnchorY) return at(z, FR.eyeY); const A = FR.pushAnchorY, pa = (A - FULLB.y) / FULLB.scale; return { x: 540 - FR.ex * z, y: A - pa * z, scale: z }; };
    // FULL punch-ins about the eye point, emitted before the scene sets: the SPLIT re-frame at a scene change must win
    // v2: a punch-in that starts with its FULL scene is folded into the scene's entry settle (lands straight on the punched framing):
    // run as two tweens, the 0.25 s settle outlived the 0.22 s punch and snapped #base back to scale 1 (hyperframes check
    // gsap_tween_tail on every FULL cut, V1 included)
    const entryPush = new Map();
    for (const p of pushes) {
      const k = merged.findIndex((s) => p.t0 >= s.a - 0.01 && p.t0 < s.b); if (k < 0 || merged[k].mode !== "full") continue;
      const end = Math.min(p.t1, merged[k].b - 0.05); if (end - p.t0 < 0.3) continue;
      const IN = pushAt(FR.zoom * p.scale);
      if (FR.pushAnchorY && p.t0 - merged[k].a < 0.3) { entryPush.set(k, IN); if (merged[k].b - end > 0.3) FT("#base", IN, { ...FULLB, duration: 0.3, ease: "power2.inOut" }, end - 0.3); continue; }
      FT("#base", FULLB, { ...IN, duration: 0.22, ease: "power3.out" }, p.t0);
      if (merged[k].b - end > 0.3) FT("#base", IN, { ...FULLB, duration: 0.3, ease: "power2.inOut" }, end - 0.3);
    }
    merged.forEach((s, i) => {
      const b = s.mode === "split" ? SPLITB : FULLB, t = s.a;
      if (i === 0) { SET("#base", { transformOrigin: "0px 0px", ...b }, 0); SET("#panel", { y: s.mode === "full" ? -G.PANEL_H - 20 : 0, height: s.mode === "vis" ? G.H : G.PANEL_H }, 0); SET("#seam", { opacity: s.mode === "split" ? 1 : 0 }, 0); return; }
      // hard cuts between SPLIT and FULL (a camera change): a sliding panel crossed his full-frame face for ~0.2 s (qa:video
      // face_covered at 20.5 s, render v1). The panel and base change on the same frame; a short flash / settle sells the cut.
      if (s.mode === "vis") { SET("#panel", { y: 0, height: G.H }, t); SET("#seam", { opacity: 0 }, t); FT("#flash", { opacity: 0.2 }, { opacity: 0, duration: 0.18 }, t); }
      else if (s.mode === "split") { SET("#panel", { y: 0, height: G.PANEL_H }, t); SET("#base", b, t); SET("#seam", { opacity: 1 }, t); FT("#flash", { opacity: 0.2 }, { opacity: 0, duration: 0.18 }, t); }
      else {
        SET("#panel", { y: -G.PANEL_H - 20, height: G.PANEL_H }, t); SET("#seam", { opacity: 0 }, t);
        const land = entryPush.get(i);
        if (land) FT("#base", pushAt(land.scale * 1.04), { ...land, duration: 0.25, ease: "power2.out" }, t);
        else FT("#base", FR.pushAnchorY ? pushAt(b.scale * 1.05) : { ...b, scale: b.scale * 1.05, x: 540 - FR.ex * b.scale * 1.05, y: FR.eyeY - FR.ey * b.scale * 1.05 }, { ...b, duration: 0.25, ease: "power2.out" }, t);
      }
    });
    // captions: chunk the word list (sentence ends, commas after 2+ words, <= 4 words / 22 chars, a scene change, a 0.4 s gap,
    // a mute window), show each chunk from its first word to the next chunk (2-frame gap: a 1-frame overlap reads as garbage),
    // never across a scene change or into a mute window; the current word turns yellow on its onset
    if (CAP) {
      const sceneAt = (t) => merged.find((s) => t >= s.a - 1e-6 && t < s.b - 1e-6) || merged[merged.length - 1];
      const mutes = (CAP.mute || []).slice().sort((p, q) => p[0] - q[0]);
      const muted = (t) => mutes.some(([a, b]) => t >= a && t < b);
      const ws = (CAP.words || WORDS).map((w) => ({ ...w, text: ((CAP.fix && CAP.fix(w)) ?? w.word).replace(/[.,;:!]+$/, "") })).filter((w) => w.text);
      // 1) segments: split at sentence ends and commas, scene changes, mute windows, gaps > 0.4 s
      const segs = []; let cur = [];
      const flush = () => { if (cur.length) segs.push(cur); cur = []; };
      for (const w of ws) {
        if (muted(w.start)) { flush(); continue; }
        // (gap test on word STARTS: the readback's DTW ends are start + 0.08 s on most words)
        if (cur.length) { const last = cur[cur.length - 1]; if (/[.?!,]$/.test(last.word) || sceneAt(w.start) !== sceneAt(cur[0].start) || w.start - last.start > 1.1) flush(); }
        cur.push(w);
      }
      flush();
      // 2) each segment into balanced chunks (<= 4 words, <= 22 chars): prefer 3 words, never end a chunk on a function word
      const MW = CAP.maxWords || 4, MC = CAP.maxChars || 22;
      const FN = new Set(["the", "a", "an", "to", "of", "for", "and", "or", "that", "with", "in", "on", "my", "your", "these", "those", "is", "was", "are", "be", "at", "by", "so", "if", "i", "i'll", "you", "from", "before"]);
      const nz = (t) => t.toLowerCase().replace(/[^a-z0-9']/g, "");
      const KEEP = new Set((CAP.keep || []).map((k) => k.toLowerCase()));   // word pairs a chunk boundary must not split ("ad copy", "em dash")
      const chars = (c) => c.reduce((n, w) => n + w.text.length + 1, -1);
      const chunks = [];
      for (const sg of segs) {
        const n = sg.length, best = new Array(n + 1).fill(Infinity), prev = new Array(n + 1).fill(-1); best[0] = 0;
        for (let j = 1; j <= n; j++) for (let i = Math.max(0, j - MW); i < j; i++) {
          const c = sg.slice(i, j); if (c.length > 1 && chars(c) > MC) continue;
          const lastw = c[c.length - 1].text.toLowerCase();
          const cost = 0.6 * (c.length - 3) ** 2 + (j < n && FN.has(nz(lastw)) ? 2 : 0) + (c.length === 1 && n > 1 ? 1.5 : 0)
            + (j < n && KEEP.has(nz(sg[j - 1].text) + " " + nz(sg[j].text)) ? 3 : 0);
          if (best[i] + cost < best[j]) { best[j] = best[i] + cost; prev[j] = i; }
        }
        const cuts = []; for (let j = n; j > 0; j = prev[j]) cuts.unshift([prev[j], j]);
        for (const [i, j] of cuts) chunks.push(sg.slice(i, j));
      }
      chunks.forEach((c, i) => {
        const sc = sceneAt(c[0].start), a = Math.max(0, c[0].start - 0.02);
        const nextA = i + 1 < chunks.length ? Math.max(0, chunks[i + 1][0].start - 0.02) : DUR;
        const mNext = mutes.find(([m0]) => m0 > a);
        const b = Math.max(a + 0.2, Math.min(nextA - 2 / 30, c[c.length - 1].end + 0.4, sc.b - 1 / 30, mNext ? mNext[0] - 1 / 30 : DUR, DUR));
        const id = uid(`cap${i}`), y = sc.mode === "full" ? (CAP.yFull ?? 1331) : (CAP.ySplit ?? 889);
        html.push(`<div id="${id}" class="clip capx" data-start="${f3(a)}" data-duration="${f3(b - a)}" style="top:${y}px"><span class="capb">${c.map((w, k) => `<span id="${id}w${k}">${esc(w.text)}</span>`).join(" ")}</span></div>`);
        SET("#" + id, { opacity: 1 }, a); SET("#" + id, { opacity: 0 }, b);
        FT(`#${id} .capb`, { scale: 0.88 }, { scale: 1, duration: 0.12, ease: "back.out(2.2)" }, a);
        c.forEach((w, k) => { SET(`#${id}w${k}`, { color: CAP.hot || "#FFD84D" }, Math.max(a, w.start - 0.02)); if (k + 1 < c.length) SET(`#${id}w${k}`, { color: "#FFFFFF" }, Math.max(a, c[k + 1].start - 0.02)); });
      });
      capCount = chunks.length;
    }
    // beats: container shown [a, b) with an enter flash; the next beat replaces it on the same frame
    for (const bt of beats) {
      html.push(`<div id="${bt.id}" class="clip beat ${bt.cls}" data-start="${f3(bt.a)}" data-duration="${f3(Math.max(0.1, bt.b - bt.a))}"${bt.z ? ` style="z-index:${bt.z}"` : ""}><div class="drift">${bt.inner}</div></div>`);
      SET("#" + bt.id, { opacity: 1 }, bt.a); SET("#" + bt.id, { opacity: 0 }, bt.b);
      if (bt.enter === "pop") FT("#" + bt.id, { scale: 0.94 }, { scale: 1, duration: 0.24, ease: "back.out(1.6)" }, bt.a);
      else if (bt.enter === "up") FT("#" + bt.id, { y: 60 }, { y: 0, duration: 0.28, ease: "power3.out" }, bt.a);
      else if (bt.enter === "left") FT("#" + bt.id, { x: 200 }, { x: 0, duration: 0.28, ease: "power3.out" }, bt.a);
      if (bt.drift && bt.b - bt.a > 0.8) TO("#" + bt.id + " > .drift", { scale: bt.drift, duration: bt.b - bt.a, ease: "none" }, bt.a);
      if (bt.flash) FT("#flash", { opacity: 0.14 }, { opacity: 0, duration: 0.2, ease: "power2.out" }, bt.a);
    }
    for (const r of stampRot) SET(r.sel, { rotation: r.rot }, 0);
    for (const v of pvids) {
      const pr = v.rate !== 1 ? ` data-playback-rate="${v.rate}"` : "";
      html.push(`<video id="${v.id}" class="clip pv ${v.cls}" src="${v.src}" data-start="${f3(v.a)}" data-duration="${f3(Math.max(0.1, v.b - v.a))}" data-media-start="${v.mediaStart.toFixed(2)}"${pr} muted playsinline style="left:${v.x}px;top:${v.y}px;width:${v.w}px;height:${v.h}px;z-index:${v.z};border-radius:${v.radius}px;object-fit:${v.fit}"></video>`);
      SET("#" + v.id, { opacity: 1 }, v.a); SET("#" + v.id, { opacity: 0 }, v.b);
    }
    for (const st of stickers) {
      html.push(`<div id="${st.id}" class="clip sticker ${st.cls}" data-start="${f3(st.a)}" data-duration="${f3(Math.max(0.1, st.b - st.a))}" style="top:${st.y}px">${st.inner}</div>`);
      SET("#" + st.id, { opacity: 1 }, st.a); SET("#" + st.id, { opacity: 0 }, st.b);
    }
    const audio = sfx.map((h, i) => `<audio id="sfx${i}" src="assets/sfx/${h.name}.mp3" data-start="${f3(h.t)}" data-duration="${Math.min(h.dur || SFX_DUR[h.name], DUR - h.t - 0.02).toFixed(3)}" data-track-index="${20 + i}" data-volume="${h.vol.toFixed(2)}"></audio>`);
    const panelBeats = html.filter((h) => h.includes("class=\"clip beat") || h.includes("class=\"clip pv")), stickerHtml = html.filter((h) => h.includes("class=\"clip sticker"));
    const capHtml = html.filter((h) => h.includes("class=\"clip capx"));
    const outHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<title>${esc(title)}</title>
<script src="assets/gsap.min.js"></script>
<style>${BASE_CSS}\n${css.join("\n")}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${DUR}" data-fps="30">
  <video id="base" src="${baseSrc}" data-start="0" data-duration="${DUR}" muted playsinline></video>
  <audio id="base-a" src="${baseSrc}" data-start="0" data-duration="${DUR}" data-volume="1"></audio>
${roots.join("\n")}
  <div id="stickers">
${stickerHtml.map((h) => "    " + h).join("\n")}
  </div>
  <div id="panel"><div id="pbg"><div id="grid"></div><div id="glow1"></div><div id="glow2"></div></div>
${panelBeats.map((h) => "    " + h).join("\n")}
    <div id="flash"></div>
  </div>
  <div id="seam"></div>
${capHtml.map((h) => "  " + h).join("\n")}
${audio.map((h) => "  " + h).join("\n")}
</div>
<script>
${BASE_JS}
tl.to("#grid",{backgroundPosition:"0px 480px",duration:${DUR},ease:"none"},0);
tl.to("#glow1",{x:260,y:120,duration:${DUR},ease:"sine.inOut"},0);
tl.to("#glow2",{x:-300,y:-80,duration:${DUR},ease:"sine.inOut"},0);
${tw.join("\n")}
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
    return { html: outHtml, dur: DUR, counts: { beats: beats.length, stickers: stickers.length, sfx: sfx.length, tweens: tw.length, captions: capCount, scenes: merged } };
  }

  return { WORDS, DUR, W, S, E, P, PE, vis, root, FT, SET, TO, RAW, ENTER, pop, rise, drop, slide, fade, out, slam, punch, shake, grow, draw, count, type, mark, markPhrase, hit,
    scene, full, pushIn, beat, sticker, addCss, logo, shot, chip, img, box, txt, adCard, person, stat, source, stamp, stampIn, pvid, numBadge, captions, card, C, G, rng, esc, finish };
}

export const BASE_CSS = `
@font-face{font-family:"Inter";src:url("assets/fonts/Inter-400-latin.woff2") format("woff2");font-weight:400}
@font-face{font-family:"Inter";src:url("assets/fonts/Inter-700-latin.woff2") format("woff2");font-weight:700}
@font-face{font-family:"Inter";src:url("assets/fonts/Inter-800-latin.woff2") format("woff2");font-weight:800}
@font-face{font-family:"Inter";src:url("assets/fonts/Inter-900-latin.woff2") format("woff2");font-weight:900}
@font-face{font-family:"Montserrat";src:url("assets/fonts/Montserrat.ttf") format("truetype");font-weight:100 900}
.capx{position:absolute;left:0;width:1080px;display:flex;justify-content:center;opacity:0;z-index:40;pointer-events:none}
.capx .capb{display:inline-block;background:#000;color:#fff;font-family:"Montserrat","Inter",sans-serif;font-weight:800;font-size:52px;line-height:1;letter-spacing:-.005em;padding:15px 26px 16px;border-radius:14px;white-space:nowrap;transform-origin:50% 50%}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;font-family:"Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:${C.text}}
#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:#000}
#base{position:absolute;left:0;top:0;width:${G.BASE_W}px;height:1920px;object-fit:fill;z-index:1;transform-origin:0 0}
#stickers{position:absolute;inset:0;z-index:5;pointer-events:none}
.sticker{position:absolute;left:0;width:1080px;opacity:0;display:flex;justify-content:center}
#panel{position:absolute;left:0;top:0;width:1080px;height:${G.PANEL_H}px;overflow:hidden;z-index:10;background:${C.bg}}
#pbg{position:absolute;inset:0;overflow:hidden}
#grid{position:absolute;inset:-2px;background-image:linear-gradient(rgba(120,150,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(120,150,255,.07) 1px,transparent 1px);background-size:60px 60px;
  -webkit-mask-image:radial-gradient(120% 90% at 50% 40%,#000 30%,transparent 85%)}
#glow1{position:absolute;left:-260px;top:-240px;width:900px;height:760px;border-radius:50%;background:radial-gradient(closest-side,rgba(217,119,87,.30),transparent);filter:blur(10px)}
#glow2{position:absolute;right:-300px;bottom:-320px;width:980px;height:820px;border-radius:50%;background:radial-gradient(closest-side,rgba(166,107,255,.22),transparent);filter:blur(10px)}
#flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:30;pointer-events:none}
#seam{position:absolute;left:0;top:${G.PANEL_H - 3}px;width:1080px;height:6px;z-index:12;background:linear-gradient(90deg,#D97757,${C.violet} 50%,#FFB38A);box-shadow:0 0 22px rgba(217,119,87,.75)}
.beat{position:absolute;left:0;top:0;width:1080px;height:${G.PANEL_H}px;opacity:0;transform-origin:50% 62%}
.drift{position:absolute;inset:0;transform-origin:50% 62%}
.beat.tall{height:1920px;transform-origin:50% 50%}
.beat.tall .drift{transform-origin:50% 50%}
.tx{position:absolute;line-height:1.02;letter-spacing:-.03em}
.tx .k{color:var(--k,${C.sky})}
.bx{position:absolute}
.im{position:absolute;display:block}
.logo{display:inline-flex;align-items:center;justify-content:center}
.logo svg{display:block}
.shot{position:absolute;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 80px rgba(0,0,0,.55)}
.shot .hls{position:absolute;inset:0;mix-blend-mode:multiply}
.hl{position:absolute;display:block;border-radius:6px;opacity:0;transform-origin:0 50%}
.shot .fadeT,.shot .fadeB{position:absolute;left:0;right:0;height:46px;pointer-events:none}
.shot .fadeT{top:0;background:linear-gradient(#fff 15%,rgba(255,255,255,0))}
.shot .fadeB{bottom:0;background:linear-gradient(rgba(255,255,255,0),#fff 85%)}
.chip{display:inline-flex;align-items:center;gap:12px;font-weight:800;font-size:34px;letter-spacing:.02em;padding:14px 26px;border-radius:999px;color:var(--c);border:3px solid var(--c);background:rgba(0,0,0,.35);white-space:nowrap}
.chip.solid{background:var(--c);color:#04050A}
.card{position:absolute;border-radius:28px;background:${C.glass};border:2px solid rgba(255,255,255,.12);box-shadow:0 30px 80px rgba(0,0,0,.5)}
.wcard{position:absolute;border-radius:24px;background:#fff;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.wcard img,.wcard video{display:block;width:100%;height:100%;object-fit:contain}
.ad{position:absolute;background:#fff;border-radius:calc(22px*var(--s));overflow:hidden;color:#0B0E16;box-shadow:0 26px 70px rgba(0,0,0,.55)}
.ad .adh{display:flex;align-items:center;gap:calc(12px*var(--s));padding:calc(14px*var(--s)) calc(16px*var(--s))}
.ad .ava{width:calc(40px*var(--s));height:calc(40px*var(--s));border-radius:50%;background:linear-gradient(135deg,#18E0C6,#0866FF);display:block;flex:none}
.ad .adh b{display:block;font-size:calc(20px*var(--s));font-weight:800;letter-spacing:-.01em}
.ad .adh span{display:block;font-size:calc(15px*var(--s));color:#65676B;font-weight:400}
.ad .adi{position:relative;overflow:hidden;background:#EEF0F3}
.ad .adi img{width:100%;height:100%;object-fit:cover;display:block}
.ad .adc{display:flex;align-items:center;justify-content:space-between;gap:calc(10px*var(--s));padding:calc(14px*var(--s)) calc(16px*var(--s));background:#F0F2F5}
.ad .adc span{font-size:calc(18px*var(--s));font-weight:700;line-height:1.15}
.ad .adc em{font-style:normal;font-size:calc(16px*var(--s));font-weight:800;background:#E4E6EB;border-radius:calc(8px*var(--s));padding:calc(8px*var(--s)) calc(14px*var(--s));white-space:nowrap}
.person{position:absolute}
.person i{position:absolute;left:30%;top:6%;width:40%;height:40%;border-radius:50%;background:var(--c)}
.person b{position:absolute;left:12%;top:52%;width:76%;height:44%;border-radius:50% 50% 18% 18%;background:var(--c)}
.stat{position:absolute;left:0;width:1080px;text-align:center}
.stat .sv{font-weight:900;font-size:230px;line-height:.9;letter-spacing:-.05em;color:var(--c);text-shadow:0 0 60px color-mix(in srgb,var(--c) 45%,transparent);font-variant-numeric:tabular-nums}
.stat .sl{font-weight:800;font-size:54px;letter-spacing:-.02em;margin-top:18px;color:${C.text}}
.stat .ss{font-weight:700;font-size:34px;margin-top:12px;color:${C.sub}}
.src{position:absolute;left:0;width:1080px;text-align:center;font-weight:700;font-size:26px;letter-spacing:.06em;color:${C.dim};text-transform:uppercase}
.stamp{position:absolute;width:1080px;display:flex;justify-content:center;pointer-events:none}
.stamp span{display:block;font-weight:900;line-height:1.1;letter-spacing:.02em;color:var(--c);border:12px solid var(--c);border-radius:22px;padding:4px 40px;background:rgba(0,0,0,.5);box-shadow:0 0 50px color-mix(in srgb,var(--c) 50%,transparent);opacity:0}
.pv{position:absolute;opacity:0;overflow:hidden;background:#000}
.nb{position:absolute;width:150px;height:150px;border-radius:36px;background:var(--c);color:#04050A;font-weight:900;font-size:96px;display:flex;align-items:center;justify-content:center;letter-spacing:-.04em;box-shadow:0 0 60px color-mix(in srgb,var(--c) 55%,transparent)}
.mono{font-family:Menlo,ui-monospace,monospace}
.glowtxt{text-shadow:0 0 40px rgba(140,194,255,.55)}
svg.ov{position:absolute;left:0;top:0;width:1080px;height:${G.PANEL_H}px;overflow:visible}
svg.ov path.dr,svg.ov line.dr{stroke-dasharray:1 1.2;stroke-dashoffset:1.1}
.pc{position:absolute;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 30px 80px rgba(0,0,0,.6)}
.pc.dark{background:#141413}
.pc .shot.flat{border-radius:0;box-shadow:none;background:transparent}
.pc .shot .fadeT,.pc .shot .fadeB{display:none}
.shot.ring .hls{mix-blend-mode:normal}
.shot.ring .hl{background:transparent !important;border:5px solid ${C.yellow};border-radius:10px;box-shadow:0 0 18px rgba(255,216,77,.8)}
.scrim{position:absolute;inset:0;background:rgba(4,5,10,.66)}
.ctab{position:absolute;left:0;width:1080px;display:flex;justify-content:center}
.ctab span{display:inline-block;background:${C.red};color:#fff;font-weight:900;font-size:84px;letter-spacing:-.02em;line-height:1;padding:18px 42px 20px;border-radius:24px;box-shadow:0 0 60px rgba(255,59,78,.45)}
.cbar{position:absolute;left:60px;width:960px;height:120px;border-radius:60px;background:#fff;display:flex;align-items:center;gap:22px;padding:0 38px 0 22px;box-shadow:0 26px 70px rgba(0,0,0,.5)}
.cbar .av2{width:76px;height:76px;border-radius:50%;background:linear-gradient(135deg,#F58529,#DD2A7B 50%,#8134AF);flex:none;display:block}
.cbar .fld{flex:1;position:relative;height:120px}
.cbar .ph,.cbar .ty{position:absolute;left:0;top:50%;transform:translateY(-50%);white-space:nowrap}
.cbar .ph{font-size:40px;color:#8E8E8E;font-weight:500}
.cbar .ty{font-size:54px;color:${C.ink};font-weight:900;letter-spacing:.01em}
.cbar .ty .cur{display:inline-block;width:4px;height:52px;background:${C.ink};margin-left:4px;vertical-align:-6px}
.cbar .post{font-size:40px;font-weight:800;color:#B2DFFC}
.todo{position:absolute;left:60px;top:306px;padding:10px 20px;border:3px dashed ${C.yellow};border-radius:14px;color:${C.yellow};font-weight:800;font-size:28px;letter-spacing:.04em;background:rgba(0,0,0,.55)}
`;

export const BASE_JS = `
const tl = gsap.timeline({ paused: true });
const FT = (s,a,b,t) => tl.fromTo(s,a,{...b,immediateRender:false},t);
function COUNT(sel,v0,v1,t0,t1,prefix,suffix,dec,ease){ const el=document.querySelector(sel); const st={n:v0}; const fmt=(n)=>prefix+(dec?n.toFixed(dec):Math.round(n).toLocaleString("en-US"))+suffix; el.textContent=fmt(v0); tl.to(st,{n:v1,duration:Math.max(.05,t1-t0),ease:ease,onUpdate:()=>{el.textContent=fmt(st.n);}},t0); }
function TYPE(sel,text,t0,t1,cursor){ const el=document.querySelector(sel); const tt=el.querySelector(".tt")||el; const cur=el.querySelector(".cur"); const st={n:0}; tt.textContent=""; if(cur)cur.style.opacity=cursor?1:0;
  tl.to(st,{n:text.length,duration:Math.max(.05,t1-t0),ease:"none",onUpdate:()=>{tt.textContent=text.slice(0,Math.round(st.n));}},t0);
  if(cur&&cursor){ for(let k=0;k<6;k++){ tl.set(cur,{opacity:k%2?1:0},t1+0.1+k*0.28); } tl.set(cur,{opacity:0},t1+1.9); } }
`;
