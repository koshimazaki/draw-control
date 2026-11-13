/**
 * The Gallery: one full-width row per example, everything in one go, left to right: a map
 * thumbnail of both paths and the blocks, the guide clip (rendered in the browser from the
 * example the first time the row comes into view, in a hidden viewport of its own), the
 * reference images (placeholders when none), the shot description and composed prompt (two
 * lines, click to expand), then one output tile per model ("No clip yet" until a run). All
 * the row's video runs on one playhead with the example's music. "Load into the editor"
 * loads it. Runs added by the visitor form an extra row, "Your runs". Never empty: paths and
 * guides show before any model clip exists.
 */
import { analyseSamples, buildDrive, frameAt, placeLandmarks, planCamera, secondsAtBeat, synthDrums, grooveTimes, GROOVES } from "@motion-studio/core";
import { createGlider } from "../characters/glider";
import { exportBundle } from "../export/bundle";
import { GRID_LOOKS } from "../ground-grid";
import { Viewport } from "../viewport";
import { EXAMPLES, exampleState } from "./examples";
import { composePrompt, MODELS } from "./generate";
import { beatPathRecipe, exportRange, type TrackInfo } from "./recipe-map";
import { legendFor } from "./script";
import { EXAMPLE_TRACKS } from "./tracks";

export type Run = { slot: string; model: string; modelName: string; url: string; prompt: string };
type Media = { guide: string; audio: string } | null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/** An example's recipe on its own music (analysed here, as the page does). */
function exampleRecipe(i: number) {
  const s = exampleState(i), t = EXAMPLE_TRACKS[EXAMPLES[i].id], bpm = GROOVES[t.groove].bpm, seconds = 0.1 + t.bars * 4 * 60 / bpm + 0.5;
  const samples = synthDrums(grooveTimes(t.groove, t.bars, 0.1), seconds), f = analyseSamples([samples], 44100);
  const drive = buildDrive(f, 24, Math.ceil(f.lengthSeconds * 24) + 1);
  const info: TrackInfo = { name: t.name, licence: t.licence, bpm: f.estimatedBpm ?? bpm, offsetSeconds: f.estimatedOffsetSeconds, lengthSeconds: f.lengthSeconds };
  return { s, recipe: beatPathRecipe(s, info, { drive, bands: drive.bands }), drive, samples };
}

/** A static map of both paths and the blocks, fitted to them. */
function thumbnail(i: number): HTMLCanvasElement {
  const { recipe, drive } = exampleRecipe(i), c = el("canvas", "row-map");
  c.width = 320; c.height = 200;
  const g = c.getContext("2d")!, frames = Math.ceil((secondsAtBeat(recipe.beatGrid, recipe.durationBeats)) * 24), plan = planCamera(recipe, drive, frames + 2);
  const floor: [number, number][] = [], cam: [number, number][] = [];
  for (let n = 0; n < frames; n += 2) { const r = frameAt(recipe, n, drive).root, p = plan.samples[n].position; floor.push([r.x, r.z]); cam.push([p[0], p[2]]); }
  const boxes = placeLandmarks(recipe, plan, drive);
  const all = [...floor, ...cam, ...boxes.flatMap(b => [[b.x - b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z + b.d / 2]] as [number, number][])];
  const xs = all.map(p => p[0]), zs = all.map(p => p[1]), x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, z0 = Math.min(...zs) - 2, z1 = Math.max(...zs) + 2;
  const k = Math.min(c.width / (x1 - x0), c.height / (z1 - z0)), ox = (c.width - (x1 - x0) * k) / 2, oz = (c.height - (z1 - z0) * k) / 2;
  const at = (x: number, z: number): [number, number] => [ox + (x - x0) * k, oz + (z - z0) * k];
  const css = getComputedStyle(document.documentElement), tok = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
  g.fillStyle = tok("--map-bg", "#16181b"); g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = tok("--map-text", "#6f747c"); g.globalAlpha = 0.35;
  for (const b of boxes) { const [a, bb] = at(b.x - b.w / 2, b.z - b.d / 2); g.fillRect(a, bb, b.w * k, b.d * k); }
  g.globalAlpha = 1;
  const line = (pts: [number, number][], colour: string, w: number) => { g.strokeStyle = colour; g.lineWidth = w; g.beginPath(); pts.forEach(([x, z], j) => { const [px, py] = at(x, z); if (j) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); };
  line(cam, tok("--map-camera", "#6cc4ff"), 1.5);
  line(floor, tok("--map-subject", "#ff8a3d"), 2.5);
  return c;
}

/** Render an example's guide in a hidden viewport of its own (the editor's preview is untouched). */
async function renderGuide(i: number): Promise<Media> {
  if (typeof VideoEncoder === "undefined") return null;
  const { s, recipe, drive, samples } = exampleRecipe(i);
  const host = el("div"); host.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px";
  document.body.appendChild(host);
  try {
    const v = new Viewport(host), glider = createGlider();
    glider.setShape(s.figure.shape); glider.setColours(parseInt(s.figure.body.slice(1), 16), parseInt(s.figure.head.slice(1), 16));
    v.setCharacter(glider); v.setShowPaths(false); v.setGrid(true); v.setGridLook(GRID_LOOKS.dark); v.setBackgroundColour(GRID_LOOKS.dark.horizon); v.setExportGrid(true);
    const frames = Math.ceil((secondsAtBeat(recipe.beatGrid, recipe.durationBeats) + 0.3) * 24), plan = planCamera(recipe, drive, frames);
    v.setRig(plan, recipe, drive, frames); v.setView("rig"); v.setLandmarks(placeLandmarks(recipe, plan, drive));
    const audio = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: 44100 });
    audio.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const result = await exportBundle({ recipe, range: exportRange(recipe, s.clip), viewport: v, width: 640, height: 360, audio, drive });
    v.dispose();
    return { guide: URL.createObjectURL(new Blob([result.contents["guide.mp4"] as BlobPart], { type: "video/mp4" })), audio: URL.createObjectURL(new Blob([result.contents["audio.wav"] as BlobPart], { type: "audio/wav" })) };
  } catch { return null; } finally { host.remove(); }
}

/** One row's player: the music is the clock, every video in the row follows it. */
function rowPlayer(row: HTMLElement, audioUrl: string | null) {
  const audio = el("audio"); audio.preload = "auto"; if (audioUrl) audio.src = audioUrl;
  const button = el("button", "icon-btn small"); button.type = "button"; button.setAttribute("aria-label", "Play the row"); button.append(el("span", "glyph"));
  button.onclick = () => { if (audio.paused) void audio.play().catch(() => {}); else audio.pause(); };
  audio.onplay = () => button.classList.add("playing"); audio.onpause = () => button.classList.remove("playing");
  const tick = () => { for (const v of row.querySelectorAll("video")) { if (Math.abs(v.currentTime - audio.currentTime) > 0.08) v.currentTime = audio.currentTime; if (!audio.paused && v.paused) void v.play().catch(() => {}); if (audio.paused && !v.paused) v.pause(); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return { button, audio, setAudio: (url: string) => { audio.src = url; } };
}

const tile = (label: string, content: HTMLElement | string) => { const t = el("figure", "row-tile"); const cap = el("figcaption", "", label); const body = typeof content === "string" ? el("div", "row-empty muted", content) : content; t.append(body, cap); return t; };
const video = (src: string) => { const v = el("video"); v.src = src; v.muted = true; v.playsInline = true; v.loop = true; return v; };

export function bindGallery(opts: { root: HTMLElement; load(slot: string): void; refs(slot: string): { character?: Blob; environment?: Blob } | undefined; runs(): Run[] }) {
  const media = new Map<number, Media>();
  let queue = Promise.resolve();

  function exampleRow(i: number): HTMLElement {
    const ex = EXAMPLES[i], s = exampleState(i), row = el("article", "gallery-row panel"), t = EXAMPLE_TRACKS[ex.id];
    const head = el("header", "row-head"), player = rowPlayer(row, media.get(i)?.audio ?? null);
    const open = el("button", "btn outline", "Load into the editor"); open.type = "button"; open.onclick = () => { opts.load(String(i)); window.scrollTo({ top: 0 }); };
    head.append(player.button, el("h3", "", `Example ${i + 1}: ${ex.label}`), el("span", "muted", `${s.figure.shape} · ${t.name}`), open);
    const strip = el("div", "row-strip");
    strip.append(tile("Path", thumbnail(i)));
    const guide = tile("Guide", media.get(i) ? video(media.get(i)!.guide) : "Rendering the guide…");
    strip.append(guide);
    const r = opts.refs(String(i));
    for (const [k, label] of [["character", "Character"], ["environment", "Environment"]] as const) {
      const img = r?.[k] ? Object.assign(el("img"), { src: URL.createObjectURL(r[k]!), alt: label }) : null;
      strip.append(tile(label, img ?? "No image"));
    }
    const text = el("div", "row-text clamp");
    text.append(el("p", "", [s.shot.subject, s.shot.environment, s.shot.action].join(" · ")), el("p", "muted", composePrompt(s.shot, legendFor(s.figure))));
    text.title = "Click to expand"; text.onclick = () => text.classList.toggle("clamp");
    strip.append(tile("Shot", text));
    const runs = opts.runs().filter(x => x.slot === String(i));
    for (const m of MODELS) { const run = runs.find(x => x.model === m.id); strip.append(tile(m.label, run ? video(run.url) : "No clip yet")); }
    row.append(head, strip);
    if (!media.has(i)) {
      // Render the guide when the row first comes into view, one row at a time.
      const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect();
        queue = queue.then(async () => {
          const m = await renderGuide(i);
          media.set(i, m);
          guide.firstElementChild!.replaceWith(m ? video(m.guide) : el("div", "row-empty muted", "The guide renders in Chrome or Edge (WebCodecs)."));
          if (m) player.setAudio(m.audio);
        });
      });
      io.observe(row);
    }
    return row;
  }

  function runsRow(): HTMLElement | null {
    const runs = opts.runs();
    if (!runs.length) return null;
    const row = el("article", "gallery-row panel"), player = rowPlayer(row, null);
    const head = el("header", "row-head"); head.append(player.button, el("h3", "", "Your runs"), el("span", "muted", `${runs.length} added this session`));
    const strip = el("div", "row-strip");
    for (const run of runs) strip.append(tile(`${run.modelName} · Example ${run.slot === "own" ? "yours" : Number(run.slot) + 1}`, video(run.url)));
    row.append(head, strip);
    return row;
  }

  function render() {
    const rows = EXAMPLES.map((_, i) => exampleRow(i)), own = runsRow();
    opts.root.replaceChildren(...rows, ...(own ? [own] : []));
  }
  render();
  return { render };
}
