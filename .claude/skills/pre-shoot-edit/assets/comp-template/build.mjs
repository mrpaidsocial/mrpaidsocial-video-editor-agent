// build.mjs: assemble the split-screen comp from the section modules (pre-shoot-edit template).
// node build.mjs [--ver pre|preB|v1|...] [--hook A|B|C] [--only 00] [--out index.html]
// Inputs per version <ver>:
//   ../cuts/<ver>/words-<ver>.json      output-time word list [{word, start, end}] (stand-in from scripts/standin.py, or the real readback)
//   ../cuts/<ver>/caption-words.json    optional: caption spelling/punctuation with the readback's timing
//   ../cuts/<ver>/onsets-<ver>.json     optional: measured speech onsets per kept island
//   assets/base4k-<ver>.mp4             the camera layer (placeholder before filming, the synced cut after)
//   framing.json  key <ver>             the speaker's eye point for this camera layer
// "pre*" versions are stand-in builds: ctx.STANDIN is true, so sections can show to-do markers that never reach a real cut.
import fs from "fs"; import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
import { execFileSync } from "child_process"; import { createBuilder } from "./lib.mjs";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const VER = arg("--ver", "pre");
const HOOK = arg("--hook", /B$/.test(VER) ? "B" : /C$/.test(VER) ? "C" : "A");
const BASE = `assets/base4k-${VER}.mp4`;
const FFPROBE = process.env.FFPROBE || "ffprobe";
const baseLen = parseFloat(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(DIR, BASE)]).toString());
const framing = JSON.parse(fs.readFileSync(path.join(DIR, "framing.json"), "utf8"));
const ctx = createBuilder({ dir: DIR, baseLen, framing: Object.assign({}, framing._default, framing[VER] || {}), tail: 0.6,
  wordsPath: path.join(DIR, `../cuts/${VER}/words-${VER}.json`), sfxDurPath: path.join(DIR, "assets/sfx/durations.json") });
const rd = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
const ONSETS = rd(path.join(DIR, `../cuts/${VER}/onsets-${VER}.json`)) || [];
ctx.ONS = (island, k = 0) => { const o = ONSETS.filter((x) => x.island === island)[k]; if (!o) throw new Error(`no onset for island ${island}`); return o.out; };
ctx.CAPWORDS = rd(path.join(DIR, `../cuts/${VER}/caption-words.json`));
ctx.VER = VER; ctx.HOOK = HOOK; ctx.STANDIN = VER.startsWith("pre");
const only = arg("--only", "").split(",").filter(Boolean);
const files = fs.readdirSync(path.join(DIR, "sections")).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort();
for (const f of files) {
  if (only.length && !only.some((o) => f.startsWith(o))) continue;
  const mod = await import(pathToFileURL(path.join(DIR, "sections", f)).href);
  try { mod.default(ctx); console.log("section", f, "ok"); } catch (e) { console.error("section", f, "FAILED:", e.message); process.exitCode = 1; }
}
// a failed section leaves index.html as it was: a half-built page must never be the thing that renders
if (process.exitCode) { console.error(`build ${VER} FAILED: index.html not written (fix the anchor or section above)`); process.exit(1); }
const out = ctx.finish({ title: `${path.basename(path.dirname(DIR))} ${VER} hook ${HOOK}`, baseSrc: BASE });
fs.writeFileSync(path.join(DIR, arg("--out", "index.html")), out.html);
console.log(`build ${VER} hook ${HOOK}: DUR ${out.dur}s | beats ${out.counts.beats} · sfx ${out.counts.sfx} · captions ${out.counts.captions} · tweens ${out.counts.tweens}`);
console.log("scenes:", out.counts.scenes.map((s) => `${s.mode} ${s.a.toFixed(2)}-${s.b.toFixed(2)}`).join(" | "));
