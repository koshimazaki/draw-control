/**
 * Generate in place, through the Model Arena embed (arena.ts): the key panel in the header,
 * the model choice and the composed prompt under the shot fields, the reference drops,
 * Generate (the guide from exportGuideInMemory(), the reference blobs, the shot; the cost
 * confirmed in the page's own dialog), progress and the result in the output pane beside
 * the preview (absent until there is a result; a draggable divider, double-click resets, a
 * swap control, the split remembered for the session), the result player following the
 * page's clock, "Add to gallery", and the Gallery. A model receives the guide video, the
 * reference images and the shot description only.
 */
import { exportBundle } from "../export/bundle";
import { ARENA_THEME, fakeFetch, loadArena, type ArenaKeyElement, type ArenaModule } from "./arena";
import { clipRefusal, composePrompt, promptWarning, runErrorText, MAX_PRICE, MODELS, type ModelId, type References, type RunError } from "./generate";
import type { Page } from "./page";
import { exportRange } from "./recipe-map";
import { shotRefusal } from "./page-setup";
import { clipLabel, legendFor } from "./script";
import { setFader } from "./ui/fader";
import { RunLog, loggingFetch } from "./run-log";
import { bindHistory } from "./page-history";
import { textSpinner } from "./ui/spinner";
import { bindGallery, type Run } from "./gallery";
import { captureDrag } from "./drag";
import { RefStore } from "./ref-store";
import { bindRefs, readableVideo, videoFrame } from "./page-refs";
import { bindImages } from "./page-image";
import { applyStep, followStep, playLocal } from "./result-sync";
import { bindCostDialog } from "./cost-dialog";
import { bindShotEditor } from "./shot-editor";
import { SLOT_GONE, pageSlot } from "./examples";

const EXPORT = { width: 1280, height: 720 } as const;
const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
const lasting = (() => { try { return window.localStorage; } catch { return null; } })();
type Player = HTMLElement & { currentTime: number; play(): void; pause(): void };

export function bindGenerate(p: Page) {
  const { $ } = p;
  const refStore = new RefStore(), outputs = new Map<string, { url: string; record: unknown; model: string; prompt: string }>();
  // Every fetch handed to the embed is wrapped: the run log writes each task id down before it is sent.
  type Fetch = Parameters<typeof loggingFetch>[0];
  const runLog = new RunLog(lasting);
  const logged = (inner: Fetch | null, name: string, local: boolean, slot: string) =>
    loggingFetch(inner ?? ((u, i) => globalThis.fetch(u, i as RequestInit) as ReturnType<Fetch>), runLog, () => ({ slot, model: name, ...(local ? { local: true } : {}) }));
  let model: ModelId = MODELS[0].id, swapped = false, arena: ArenaModule | null = null, key: ArenaKeyElement | null = null;
  let player: Player | null = null, fakeResult = "";
  const fake = import.meta.env.DEV || new URLSearchParams(location.search).has("fake");
  const style = document.createElement("style");
  style.textContent = ARENA_THEME;
  document.head.appendChild(style);

  /** The shot for a model: the three fields and the legend built from the figure's colours. */
  const shot = () => ({ ...p.state.shot, legend: legendFor(p.state.figure) });
  const currentPrompt = () => arena
    ? arena.composePrompt(shot(), model, { character: !!refStore.get(p.slot, "character"), environment: !!refStore.get(p.slot, "environment") }, { seconds: p.state.clip, hasAudio: !!p.track }).prompt
    : composePrompt(p.state.shot, legendFor(p.state.figure));

  /** The guide bundle in memory: every file as a Blob (the same content as the zip), the references, the shot and the prompt. */
  // Everything the bundle carries is read before the first await: the render awaits between frames.
  // A signal stops the render between frames (Stop while the guide renders): it throws an error with code "aborted".
  async function exportGuideInMemory(onProgress?: (done: number, total: number) => void, signal?: AbortSignal) {
    // A shot that did not build would render the last recipe that did, under this one's clip and prompt.
    const unbuilt = shotRefusal(p);
    if (unbuilt) throw new Error(unbuilt);
    const recipe = p.recipe, range = exportRange(recipe, p.state.clip), references = refStore.blobs(p.slot) as References, prompt = currentPrompt();
    const result = await exportBundle({ recipe, range, viewport: p.viewport, ...EXPORT, audio: p.track?.buffer ?? null, drive: p.drive, onProgress, signal });
    const type = (name: string) => (name.endsWith(".mp4") ? "video/mp4" : name.endsWith(".png") ? "image/png" : name.endsWith(".wav") ? "audio/wav" : "application/json");
    const files = Object.fromEntries(Object.entries(result.contents).map(([name, bytes]) => [name, new Blob([bytes as BlobPart], { type: type(name) })]));
    return { files, references, shot: recipe.shot ?? null, prompt };
  }
  (window as unknown as { beatPath: unknown }).beatPath = { exportGuideInMemory, prompt: currentPrompt };

  // The two screens: the output pane exists only once there is a result (or a run in progress).
  const screens = $("screens");
  const setSplit = (f: number) => { screens.style.setProperty("--split", String(Math.max(0.2, Math.min(0.8, f)))); try { store?.setItem("beatPath.split", String(f)); } catch { /* storage off */ } };
  setSplit(Number(store?.getItem("beatPath.split") ?? 0.5) || 0.5);
  function setOutputPane(on: boolean) { $("screenOutput").hidden = !on; $("divider").hidden = !on; screens.classList.toggle("split", on); }
  function showResult(url: string | null) {
    setOutputPane(!!url);
    $("addToGallery").hidden = !url || !arena;
    if (!url) return;
    player = document.createElement(arena ? "arena-player" : "video") as Player;
    if (arena) { player.setAttribute("controls", "none"); player.setAttribute("label", "Output"); }
    else Object.assign(player, { muted: true, playsInline: true });
    player.className = "output-video";
    // No src on the player itself: it would stream the provider's link beside the copy (a second download).
    $("generateSlot").replaceChildren(player);
    // Played from a copy in this tab, not streamed from the provider's link (result-sync.ts).
    // A remote result (another origin, served without CORS) would taint a canvas, so its frames cannot be taken:
    // the control shows once the local copy is in, and stays hidden when the page may only play the link.
    const v = resultVideo();
    refUi.showControl($("screenOutput"), readableVideo(url));
    if (!v) return;
    // While the copy downloads the video has no source (a black box): a short note says so until it does.
    const wait = /^https?:/i.test(url) ? Object.assign(document.createElement("p"), { className: "output-loading muted", textContent: "Loading the clip…" }) : null;
    if (wait) $("generateSlot").append(wait);
    void playLocal(v, url).then(src => { if (resultVideo() === v) refUi.showControl($("screenOutput"), readableVideo(src)); }).finally(() => wait?.remove());
  }
  const divider = $("divider");
  divider.addEventListener("pointerdown", e => {
    const r = screens.getBoundingClientRect();
    captureDrag(divider, e, ev => { const f = (ev.clientX - r.left) / r.width; setSplit(swapped ? 1 - f : f); });
  });
  divider.addEventListener("dblclick", () => setSplit(0.5));
  $("swapScreens").onclick = () => { swapped = !swapped; screens.classList.toggle("swapped", swapped); };

  // The result follows the page's clock: it plays while the page plays and is put back only when it
  // drifts; paused, it shows the page's frame. Driven on the video itself (the embed's player
  // would seek on every frame while its video is paused).
  const follow = () => {
    const v = player && !$("screenOutput").hidden ? resultVideo() : null;
    if (v && v.readyState >= 1) applyStep(v, followStep({ time: v.currentTime, paused: v.paused, duration: v.duration }, { time: Math.max(0, p.head - p.window0()), playing: p.playing }));
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);

  // References: per example, never in the recipe or the script (ref-store.ts, page-refs.ts). Any image in the page can become one.
  const refUi = bindRefs(p, refStore, () => { sync(); renderGallery(); });
  const head = () => Math.max(0, p.head - p.window0());
  refUi.attach($("screenPreview"), async () => { const blob = await p.viewport.grabFrame(); return blob ? { blob, source: { kind: "frame", of: "preview", seconds: head() } } : null; }, "this frame of the preview");
  refUi.attach($("screenOutput"), async () => {
    const v = resultVideo();
    const blob = v && readableVideo(v.currentSrc || v.src) ? await videoFrame(v) : null;
    return blob ? { blob, source: { kind: "frame", of: "result", seconds: head() } } : null;
  }, "this frame of the result");
  /** The result's video element (inside the player's shadow root when the embed draws it). */
  const resultVideo = (): HTMLVideoElement | null => {
    const el = $("generateSlot").firstElementChild as (HTMLElement & { video?: HTMLVideoElement }) | null;
    return !el ? null : el instanceof HTMLVideoElement ? el : el.video ?? el.shadowRoot?.querySelector("video") ?? null;
  };

  // Model choice and the prompt it will get.
  const labelOf = (id: string) => arena?.offeredModels().find(m => m.key === id)?.name ?? MODELS.find(m => m.id === id)?.label ?? id;
  let shotEditor: ReturnType<typeof bindShotEditor> | null = null;
  function sync() {
    shotEditor?.refresh();
    // The clip fader: hatched past what this model takes, and a note when the clip is beyond it.
    const reach = MODELS.find(m => m.id === model)!.seconds.max, refusal = clipRefusal(model, p.state.clip);
    setFader($("clipFader"), p.state.clip, reach);
    $("clipOut").textContent = clipLabel(p.state.clip); $("clipOut").classList.toggle("over", !!refusal);
    $("clipNote").textContent = refusal ?? ""; $("clipNote").hidden = !refusal;
    document.querySelectorAll<HTMLButtonElement>('[data-control="model"] button').forEach(b => { b.classList.toggle("on", b.dataset.value === model); b.textContent = labelOf(b.dataset.value!); });
    $("shotLegend").textContent = currentPrompt();
    $("shotLegend").title = `The prompt this model gets:\n\n${$("shotLegend").textContent}`;
  }
  document.querySelector('[data-control="model"]')!.addEventListener("click", e => {
    const v = (e.target as HTMLElement).closest("button")?.dataset.value as ModelId | undefined;
    if (v) { model = v; sync(); }
  });

  /** The page's own cost dialog (video, images, the no-bound notice): one question at a time, true only on OK (cost-dialog.ts). */
  const ask = bindCostDialog($);
  const localNote = () => (fake && !key?.connected ? " Local preview: nothing is sent and nothing is charged." : "");
  const confirmCost = (q: { usd: number; modelName: string; inputs: unknown[] }, signal: AbortSignal) => ask("Generate with this model?",
    `Up to ${q.usd.toFixed(2)} USD on ${q.modelName} (limit ${MAX_PRICE} USD). It sends the guide video${(q.inputs?.length ?? 0) > 1 ? ", the reference images" : ""} and the prompt from your shot description.${localNote()}${(w => (w ? ` ${w}` : ""))(promptWarning(model, currentPrompt()))}`, "Generate", signal);
  // The larger prompt editor and the Timed action (shot-editor.ts): Timed writes in the chosen model's time syntax.
  shotEditor = bindShotEditor(p, { ask, model: () => model, changed: () => sync() });

  // One run at a time; while it runs the Generate button stops it. The run belongs to the example it
  // started on: switching examples mid-run files the result there and never shows it on another.
  let running: AbortController | null = null, runStarted = 0, runSlot: string | null = null;
  // The note and the progress bar are held here: a shown result replaces them in the output frame,
  // and a second run looked them up by id and found nothing (it threw and left the button on Stop).
  const bar = $("genProgress"), note = $("outputNote"), spin = textSpinner(), noteRow = document.createElement("div");
  noteRow.className = "note-row"; noteRow.append(spin.el, note);
  const runButton = $<HTMLButtonElement>("runGenerate");
  /** The running job's note and progress bar in the output pane (its example showing again after a switch puts them back). */
  const showProgress = () => { setOutputPane(true); $("addToGallery").hidden = true; bar.hidden = false; $("generateSlot").replaceChildren(noteRow, bar); };
  const setRunning = (c: AbortController | null, slot: string | null = null) => { running = c; runSlot = c ? slot : null; runButton.querySelector(".btn-label")!.textContent = c ? "Stop" : "Generate"; runButton.classList.toggle("running", !!c); };
  runButton.onclick = async () => {
    if (running) { running.abort(); p.say("Stopping…"); return; }
    if (p.busy) return;
    // Before anything else (the cost question, the render, any request): the shot must have built.
    const unbuilt = shotRefusal(p);
    if (unbuilt) { p.say(unbuilt); return; }
    if (!arena) { p.say("Generate needs the Model Arena embed in vendor/ (npm run vendor:arena)."); return; }
    if (!key?.connected && !fake) { p.say("Add your Runware API key first (top right)."); return; }
    // An empty shot is refused by every model: say so before rendering the guide, and point at the field.
    if (!p.state.shot.subject?.trim() && !p.state.shot.action?.trim()) { p.say("Describe the shot first: a subject or an action (the fields under the preview)."); $("shotSubject").focus(); return; }
    // A clip longer (or shorter) than the model takes is refused before the guide renders or anything is sent.
    const refusal = clipRefusal(model, p.state.clip);
    if (refusal) { p.say(refusal); return; }
    // The run's shot is taken now: the slot, the model, the shot and (in the bundle) the prompt and references.
    // While the guide renders, page.ts refuses example switches and edits, so the guide matches them.
    const slot = p.slot, runModel = model, runShot = shot(), abort = new AbortController();
    runStarted = Date.now();
    setRunning(abort, slot);
    const here = () => p.slot === slot;
    const fill = bar.firstElementChild as HTMLElement;
    note.textContent = "Rendering the guide…"; fill.style.width = "0%";
    showProgress();
    spin.start();
    try {
      // The page is busy only while the guide renders in the shared viewport: playback stops first, as for the zip export.
      p.setPlaying(false);
      p.busy = true;
      // Stop ends the render within a frame (the export's own error carries code "aborted": "Stopped. Nothing was submitted.").
      const bundle = await exportGuideInMemory((d, t) => { fill.style.width = `${Math.round(d / t * 40)}%`; }, abort.signal).finally(() => { p.busy = false; });
      if (abort.signal.aborted) throw Object.assign(new Error("Stopped. Nothing was submitted."), { code: "aborted" });
      // The local preview's "result" is the guide itself: one link per run, and the last one released
      // unless an output pane or the gallery still shows it.
      if (fake && !key?.connected) {
        const before = fakeResult;
        fakeResult = URL.createObjectURL(bundle.files["guide.mp4"]);
        if (before && !inUse(before)) URL.revokeObjectURL(before);
      }
      const r = bundle.references;
      const result = await arena.generateFromGuide({
        guide: bundle.files, model: runModel, shot: runShot, signal: abort.signal, references: { character: r.character, environment: r.environment }, maxPrice: MAX_PRICE,
        key: key?.connected ? key : "local-preview-key-0000000000000000", confirm: (q: Parameters<typeof confirmCost>[0]) => confirmCost(q, abort.signal),
        onProgress: (g: { stage: string; message: string; progress?: number }) => { note.textContent = g.message; fill.style.width = `${40 + Math.round((g.progress ?? ({ plan: 5, confirm: 10, upload: 30, submit: 40, poll: 60, done: 100 } as Record<string, number>)[g.stage] ?? 50) * 0.6)}%`; },
        fetch: logged(fake && !key?.connected ? fakeFetch(() => fakeResult) : null, labelOf(runModel), fake && !key?.connected, slot),
        ...(fake && !key?.connected ? { poll: { initialDelayMs: 100, intervalMs: 100, maxIntervalMs: 200 } } : {}),
      });
      outputs.set(slot, { url: result.videoURL, record: result.record, model: runModel, prompt: bundle.prompt });
      if (here()) { showResult(result.videoURL); if (fake && !key?.connected) player?.classList.add("fake"); }
      p.say(`${labelOf(runModel)}${here() ? "" : ` (${slot === "own" ? "Your own" : `Example ${Number(slot) + 1}`})`}: done${result.costUsd !== null ? `, ${result.costUsd.toFixed(2)} USD` : ""}${fake && !key?.connected ? " (local preview: the guide stands in for the result)" : ""}`);
      renderGallery();
      if (key?.connected) void key.refreshBalance?.();
    } catch (e) {
      // Stopped or timed out after the task was submitted: it may still be billed and lands in Runs (generate.ts).
      note.textContent = runErrorText(e as RunError);
      p.say(note.textContent);
      if (here()) { if (!outputs.get(slot)) { bar.hidden = true; } else showResult(outputs.get(slot)!.url); }
    } finally { setRunning(null); bar.hidden = true; spin.stop(); }
  };
  $("addToGallery").onclick = () => {
    const out = outputs.get(p.slot);
    if (!out) return;
    if (runs.some(r => r.url === out.url && r.model === out.model)) { p.say("Already in the gallery below"); return; }
    runs.push({ slot: p.slot, model: out.model, modelName: labelOf(out.model), url: out.url, prompt: out.prompt });
    renderGallery();
    p.say("Added to the gallery below");
  };

  // The Gallery: one row per example (path, guide, references, shot, outputs per model), then the visitor's runs.
  const runs: Run[] = [];
  /** A link the page still shows: an example's output pane, or the gallery. */
  const inUse = (url: string) => [...outputs.values()].some(o => o.url === url) || runs.some(r => r.url === url);
  const gallery = bindGallery({ root: $("gallerySlot"), load: slot => void p.switchSlot(slot), refs: slot => ({ character: refStore.get(slot, "character"), environment: refStore.get(slot, "environment") }), runs: () => runs,
    attach: (host, get, what) => refUi.attach(host, get, what) });
  // Reference images made with an image model, from the Generate buttons beside the drops (page-image.ts).
  bindImages({
    $, slot: () => p.slot, shot: () => p.state.shot, arena: () => arena, key: () => key, fake, ask, store: refStore, runs, renderGallery: () => renderGallery(),
    fakeFetch: image => fakeFetch(() => fakeResult, image), setExtra: f => refUi.setExtra(f), say: t => p.say(t),
    logged: (inner, name, local) => logged(inner as Fetch | null, name, local, p.slot),
  });
  // Runs: every generation's task id and result, kept in this browser so a reload never loses one (run-log.ts, page-history.ts).
  bindHistory({
    $, log: runLog, key: () => (key?.connected ? key.getKey() ?? null : null), say: t => p.say(t),
    live: e => !!running && e.kind === "video" && e.at >= runStarted, inUse,
    show: (e, url) => {
      // A run made on an example that left the page (Example 3 or 4) shows on Your own.
      const slot = pageSlot(e.slot);
      outputs.set(slot, { url, record: null, model: e.model, prompt: "" });
      if (p.slot === slot) showResult(url); else void p.switchSlot(slot);
      p.say(`${e.model}: shown from Runs${slot !== e.slot ? ` · ${SLOT_GONE}` : ""}`);
    },
  });
  const renderGallery = () => gallery.render();

  // The embed: the key panel in the header, the model names, the gallery element.
  void loadArena().then(m => {
    arena = m;
    if (m) {
      // The key panel opens from the header button, in a small popover (the panel itself is a full form).
      key = document.createElement("arena-key") as ArenaKeyElement;
      key.setAttribute("signup-url", "https://runware.ai");
      const pop = document.createElement("div");
      pop.className = "key-pop panel"; pop.hidden = true; pop.append(key);
      $("keySlot").append(pop);
      const button = $("keyButton"), label = () => { button.lastChild!.textContent = key!.connected ? "Runware key connected" : "Add your Runware API key"; const b = $("balance"), known = key!.connected && typeof key!.balance === "number"; b.hidden = !known; if (known) { const n = document.createElement("span"); n.className = "balance-amount"; n.textContent = `${key!.balance!.toFixed(2)} USD`; b.replaceChildren("Balance ", n); } else b.replaceChildren(); button.classList.toggle("connected", key!.connected); };
      button.onclick = () => { pop.hidden = !pop.hidden; };
      window.addEventListener("pointerdown", e => { if (!pop.hidden && !$("keySlot").contains(e.target as Node)) pop.hidden = true; });
      window.addEventListener("keydown", e => { if (e.key === "Escape") pop.hidden = true; });
      key.addEventListener("arena-key-change", () => { label(); if (key!.connected) pop.hidden = true; p.say(key!.connected ? "Runware key connected (kept in this tab only)" : "Runware key removed"); });
      key.addEventListener("arena-balance-change", label);
      label();
    }
    sync();
  });
  sync();

  return {
    exportGuideInMemory, sync, get shotEditor() { return shotEditor; },
    /** A new slot: its references, its output (if any). */
    onSlot(slot: string) {
      refUi.sync();
      // A run in progress on another example keeps going; this example shows its own output (or none),
      // or, when the running job is this example's, its note and progress bar again.
      if (running && runSlot === slot) showProgress(); else showResult(outputs.get(slot)?.url ?? null);
      sync();
    },
  };
}
