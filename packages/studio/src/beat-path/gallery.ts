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
import { analyseSamples, buildDrive, clipBeats, frameAt, placeLandmarks, planCamera, secondsAtBeat, GROOVES } from "@motion-studio/core";
import { createGlider } from "../characters/glider";
import { exportBundle } from "../export/bundle";
import { GRID_LOOKS } from "../ground-grid";
import { Viewport } from "../viewport";
import { EXAMPLES, exampleState } from "./examples";
import { exampleMusic, musicIdentity } from "./example-music";
import { composePrompt, MODELS } from "./generate";
import { beatPathRecipe, exportRange, type TrackInfo } from "./recipe-map";
import { fitLanes, legendFor } from "./script";
import { EXAMPLE_TRACKS } from "./tracks";
import { PLAY_GLYPH } from "./ui/glyph";
import { icon } from "./ui/icons";
import type { Ref } from "./ref-store";
import { readableVideo, videoFrame, type RefGetter } from "./page-refs";
import { applyStep, followStep, playLocal } from "./result-sync";
import { loadPublished, tileClip, type PublishedRun } from "./published";

/** A run added to the gallery: a clip (video), or a still made for a reference (image, with its cost and the drop it was for). */
export type Run = { slot: string; model: string; modelName: string; url: string; prompt: string; kind?: "video" | "image"; costUsd?: number | null; for?: "character" | "environment"; blob?: Blob | null };
type Media = { guide: string; audio: string } | null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/** An example's recipe on its own music (its file or the synth groove, analysed here, as the page does). */
export async function exampleRecipe(i: number) {
  const id = EXAMPLES[i].id, t = EXAMPLE_TRACKS[id], music = await exampleMusic(id);
  const f = analyseSamples(music.channels, music.sampleRate);
  const drive = buildDrive(f, 24, Math.ceil(f.lengthSeconds * 24) + 1);
  // The file's grid only with the file: the fallback groove goes out under its own name and its own tempo, as in the editor.
  const grid = music.fromFile ? t.grid : undefined, named = musicIdentity(id, music.fromFile);
  const info: TrackInfo = { name: named.name, licence: named.licence, bpm: grid?.bpm ?? f.estimatedBpm ?? GROOVES[t.groove].bpm, offsetSeconds: grid?.offsetSeconds ?? f.estimatedOffsetSeconds, lengthSeconds: f.lengthSeconds };
  // The lanes fit the clip at this tempo, as the editor fits them on loading a track (on the fallback groove's tempo, more beats).
  const base = exampleState(i), s = fitLanes(base, clipBeats(base.clip, info.bpm));
  return { s, recipe: beatPathRecipe(s, info, { drive, bands: drive.bands }), drive, music };
}

/** A static map of both paths and the blocks, fitted to them; drawn once the example's music is analysed. */
function thumbnail(i: number): HTMLCanvasElement {
  const c = el("canvas", "row-map");
  c.width = 320; c.height = 200;
  void exampleRecipe(i).then(({ recipe, drive }) => drawThumbnail(c, recipe, drive)).catch(() => {});
  return c;
}

function drawThumbnail(c: HTMLCanvasElement, recipe: Awaited<ReturnType<typeof exampleRecipe>>["recipe"], drive: Awaited<ReturnType<typeof exampleRecipe>>["drive"]) {
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
}

/** Render an example's guide in a hidden viewport of its own (the editor's preview is untouched). */
async function renderGuide(i: number): Promise<Media> {
  if (typeof VideoEncoder === "undefined") return null;
  const { s, recipe, drive, music } = await exampleRecipe(i);
  const host = el("div"); host.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px";
  document.body.appendChild(host);
  let v: Viewport | null = null;
  try {
    v = new Viewport(host);
    const glider = createGlider();
    glider.setShape(s.figure.shape); glider.setColours(parseInt(s.figure.body.slice(1), 16), parseInt(s.figure.head.slice(1), 16));
    v.setCharacter(glider); v.setShowPaths(false); v.setGrid(true); v.setGridLook(GRID_LOOKS.dark); v.setBackgroundColour(GRID_LOOKS.dark.horizon); v.setExportGrid(true);
    const frames = Math.ceil((secondsAtBeat(recipe.beatGrid, recipe.durationBeats) + 0.3) * 24), plan = planCamera(recipe, drive, frames);
    v.setRig(plan, recipe, drive, frames); v.setView("rig"); v.setLandmarks(placeLandmarks(recipe, plan, drive));
    const audio = new AudioBuffer({ length: music.channels[0].length, numberOfChannels: music.channels.length, sampleRate: music.sampleRate });
    music.channels.forEach((ch, k) => audio.copyToChannel(ch as Float32Array<ArrayBuffer>, k));
    const result = await exportBundle({ recipe, range: exportRange(recipe, s.clip), viewport: v, width: 640, height: 360, audio, drive });
    return { guide: URL.createObjectURL(new Blob([result.contents["guide.mp4"] as BlobPart], { type: "video/mp4" })), audio: URL.createObjectURL(new Blob([result.contents["audio.wav"] as BlobPart], { type: "audio/wav" })) };
  } catch { return null; } finally { v?.dispose(); host.remove(); }
}

/** One row's player: the music is the clock, every video in the row follows it. */
function rowPlayer(row: HTMLElement, audioUrl: string | null, current: () => boolean) {
  const audio = el("audio"); audio.preload = "auto"; if (audioUrl) audio.src = audioUrl;
  const button = el("button", "play-btn quiet"); button.type = "button"; button.setAttribute("aria-label", "Play the row"); button.innerHTML = PLAY_GLYPH;
  button.onclick = () => { if (audio.paused) void audio.play().catch(() => {}); else audio.pause(); };
  audio.onplay = () => button.classList.add("playing"); audio.onpause = () => button.classList.remove("playing");
  // A thin scrub bar under the row's videos, on the row's clock.
  const scrub = el("input", "scrub row-scrub") as HTMLInputElement;
  scrub.type = "range"; scrub.min = "0"; scrub.max = "1"; scrub.step = "0.0001"; scrub.value = "0"; scrub.setAttribute("aria-label", "Time in this row");
  scrub.oninput = () => { if (audio.duration) audio.currentTime = Number(scrub.value) * audio.duration; };
  // The loop ends with the row: a re-rendered gallery stops the old row's music and its frame loop,
  // also when the row was replaced before it was ever on the page (a background tab runs no frames).
  let shown = false;
  const tick = () => {
    if (row.isConnected) shown = true;
    else if (shown || !current()) { audio.pause(); audio.removeAttribute("src"); audio.load(); return; }
    if (audio.duration) { const f = audio.currentTime / audio.duration; scrub.value = String(f); scrub.style.setProperty("--pos", `${f * 100}%`); } for (const v of row.querySelectorAll("video")) { if (v.readyState >= 1) applyStep(v, followStep({ time: v.currentTime, paused: v.paused, duration: v.duration }, { time: audio.currentTime, playing: !audio.paused })); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return { button, audio, scrub, setAudio: (url: string) => { audio.src = url; } };
}

const tile = (label: string, content: HTMLElement | string) => { const t = el("figure", "row-tile"); const cap = el("figcaption", "", label); const body = typeof content === "string" ? el("div", "row-empty muted", content) : content; t.append(body, cap); return t; };
const video = (src: string) => { const v = el("video"); v.muted = true; v.playsInline = true; v.loop = true; void playLocal(v, src); return v; };
/** A published clip streams from its link (metadata first) instead of being downloaded whole before it shows, as playLocal does for a run's result. */
const streamed = (src: string) => { const v = el("video"); v.muted = true; v.playsInline = true; v.loop = true; v.preload = "metadata"; v.src = src; return v; };

export function bindGallery(opts: {
  root: HTMLElement; load(slot: string): void; refs(slot: string): { character?: Ref; environment?: Ref } | undefined; runs(): Run[];
  /** Give an image's box the "Use as reference" control (page-refs.ts). */
  attach?(host: HTMLElement, get: RefGetter, what: string): void;
}) {
  /** A video tile's current frame as a reference (the page's own blob URLs only). */
  const frameOf = (v: HTMLVideoElement, of: "guide" | "result"): RefGetter => async () => {
    const blob = readableVideo(v.currentSrc || v.src) ? await videoFrame(v) : null;
    return blob ? { blob, source: { kind: "frame", of, seconds: v.currentTime } } : null;
  };
  /** An image or video in a box that carries the "Use as reference" control. */
  const box = (media: HTMLElement, get: RefGetter, what: string) => { const b = el("div", "row-media"); b.append(media); opts.attach?.(b, get, what); return b; };
  const guideBox = (src: string) => { const v = video(src); return box(v, frameOf(v, "guide"), "this frame of the guide"); };
  const runBox = (src: string, stream = false) => { const v = stream ? streamed(src) : video(src); return box(v, frameOf(v, "result"), "this frame of the clip"); };
  /** Clips published with the build (published.ts), shown until the visitor makes their own; filled in once the list loads. */
  let published: PublishedRun[] = [];
  /** A model's tile: the visitor's run, else the published clip (back to "No clip yet" if it fails to load), else "No clip yet". */
  const modelTile = (label: string, pick: ReturnType<typeof tileClip<Run>>) => {
    if (!pick) return tile(label, "No clip yet");
    if (pick.kind === "own") return tile(label, runBox(pick.run.url));
    const b = runBox(pick.run.url, true), p = pick.run;
    b.querySelector("video")?.addEventListener("error", () => t.replaceWith(tile(label, "No clip yet")), { once: true });
    const t: HTMLElement = tile(`${label} · published${p.costUsd != null ? ` · ${p.costUsd.toFixed(2)} USD` : ""}${p.seconds != null ? ` · ${p.seconds} s` : ""}`, b);
    if (p.prompt) t.title = p.prompt;
    return t;
  };
  const media = new Map<number, Media>();
  const jobs = new Map<number, Promise<Media>>();
  let queue: Promise<unknown> = Promise.resolve();
  /** The rows waiting to come into view: a render replaces them, and their observers go with them. */
  const watching = new Set<IntersectionObserver>();
  /** One render per example, ever: a row drawn again while its guide renders waits for the same job. */
  const job = (i: number) => {
    let j = jobs.get(i);
    if (!j) { j = queue.then(() => renderGuide(i)).then(m => { media.set(i, m); return m; }); queue = j; jobs.set(i, j); }
    return j;
  };

  function exampleRow(i: number): HTMLElement {
    const ex = EXAMPLES[i], s = exampleState(i), row = el("article", "gallery-row panel"), t = EXAMPLE_TRACKS[ex.id];
    const head = el("header", "row-head"), player = rowPlayer(row, media.get(i)?.audio ?? null, live());
    const open = el("button", "link-act", "Load into the editor"); open.type = "button"; open.insertAdjacentHTML("beforeend", icon("arrow-right")); open.onclick = () => { opts.load(String(i)); window.scrollTo({ top: 0 }); };
    const badge = el("span", "badge", s.figure.shape);
    head.append(player.button, el("h3", "", `Example ${i + 1}: ${ex.label}`), badge, el("span", "muted", t.name), open);
    const strip = el("div", "row-strip");
    strip.append(tile("Path", thumbnail(i)));
    const guide = tile("Guide", media.get(i) ? guideBox(media.get(i)!.guide) : "Rendering the guide…");
    strip.append(guide);
    const r = opts.refs(String(i));
    for (const [k, label] of [["character", "Character"], ["environment", "Environment"]] as const) {
      // The reference's own URL (the store releases it when the image is replaced or cleared).
      const ref = r?.[k], img = ref ? box(Object.assign(el("img"), { src: ref.url, alt: label }), async () => ({ blob: ref.blob ?? ref.url, source: { kind: "gallery", label: `Example ${i + 1}, ${label.toLowerCase()}` } }), `this ${label.toLowerCase()} image`) : null;
      strip.append(tile(label, img ?? "No image"));
    }
    const text = el("div", "row-text clamp");
    text.append(el("p", "", [s.shot.subject, s.shot.environment, s.shot.action].join(" · ")), el("p", "muted", composePrompt(s.shot, legendFor(s.figure))));
    text.title = "Click to expand"; text.onclick = () => text.classList.toggle("clamp");
    strip.append(tile("Shot", text));
    const runs = opts.runs().filter(x => x.slot === String(i));
    for (const m of MODELS) strip.append(modelTile(m.label, tileClip(runs.find(x => x.model === m.id), published.find(p => p.example === ex.id && p.model === m.id))));
    row.append(head, strip, player.scrub);
    if (!media.has(i)) {
      // Render the guide when the row first comes into view, one row at a time.
      const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect(); watching.delete(io);
        void job(i).then(m => {
          guide.firstElementChild!.replaceWith(m ? guideBox(m.guide) : el("div", "row-empty muted", "The guide renders in Chrome or Edge (WebCodecs)."));
          if (m) player.setAudio(m.audio);
        });
      });
      io.observe(row); watching.add(io);
    }
    return row;
  }

  function runsRow(): HTMLElement | null {
    const runs = opts.runs();
    if (!runs.length) return null;
    const row = el("article", "gallery-row panel"), player = rowPlayer(row, null, live());
    const head = el("header", "row-head"); head.append(player.button, el("h3", "", "Your runs"), el("span", "muted", `${runs.length} added this session`));
    const strip = el("div", "row-strip");
    const where = (slot: string) => `Example ${slot === "own" ? "yours" : Number(slot) + 1}`;
    for (const run of runs) {
      if (run.kind === "image") {
        // A still made for a reference: its model, what it cost, the prompt on hover; it can be used as a reference like any image.
        const img = Object.assign(el("img"), { src: run.url, alt: run.prompt });
        const t = tile(`${run.modelName} · ${run.for ?? "image"}${run.costUsd != null ? ` · ${run.costUsd.toFixed(3)} USD` : ""}`, box(img, async () => ({ blob: run.blob ?? run.url, source: { kind: "generated", model: run.modelName, prompt: run.prompt } }), "this image"));
        t.title = run.prompt;
        strip.append(t);
      } else strip.append(tile(`${run.modelName} · ${where(run.slot)}`, runBox(run.url)));
    }
    row.append(head, strip, player.scrub);
    return row;
  }

  /** Each render is a generation; a row's player stops once a newer render has replaced it. */
  let generation = 0;
  const live = () => { const mine = generation; return () => mine === generation; };
  function render() {
    generation++;
    for (const io of watching) io.disconnect();
    watching.clear();
    const rows = EXAMPLES.map((_, i) => exampleRow(i)), own = runsRow();
    opts.root.replaceChildren(...rows, ...(own ? [own] : []));
  }
  render();
  void loadPublished({ examples: EXAMPLES.map(e => e.id), models: MODELS.map(m => m.id) }, document.baseURI).then(list => { if (list.length) { published = list; render(); } });
  return { render };
}
