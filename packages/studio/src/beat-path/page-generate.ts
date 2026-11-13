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
import { composePrompt, ERROR_MESSAGES, MAX_PRICE, MODELS, type ModelId, type References } from "./generate";
import type { Page } from "./page";
import { exportRange } from "./recipe-map";
import { legendFor } from "./script";
import { bindGallery, type Run } from "./gallery";
import { captureDrag } from "./drag";

const EXPORT = { width: 1280, height: 720 } as const;
const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
type Player = HTMLElement & { currentTime: number; play(): void; pause(): void };

export function bindGenerate(p: Page) {
  const { $ } = p;
  const refs = new Map<string, References>(), outputs = new Map<string, { url: string; record: unknown; model: string; prompt: string }>();
  let model: ModelId = MODELS[0].id, swapped = false, arena: ArenaModule | null = null, key: ArenaKeyElement | null = null;
  let player: Player | null = null, fakeResult = "";
  const fake = import.meta.env.DEV || new URLSearchParams(location.search).has("fake");
  const style = document.createElement("style");
  style.textContent = ARENA_THEME;
  document.head.appendChild(style);

  /** The shot for a model: the three fields and the legend built from the figure's colours. */
  const shot = () => ({ ...p.state.shot, legend: legendFor(p.state.figure) });
  const currentPrompt = () => arena
    ? arena.composePrompt(shot(), model, { character: !!refs.get(p.slot)?.character, environment: !!refs.get(p.slot)?.environment }, { seconds: p.state.clip, hasAudio: !!p.track }).prompt
    : composePrompt(p.state.shot, legendFor(p.state.figure));

  /** The guide bundle in memory: every file as a Blob (the same content as the zip), the references, the shot and the prompt. */
  async function exportGuideInMemory(onProgress?: (done: number, total: number) => void) {
    const recipe = p.recipe, range = exportRange(recipe, p.state.clip);
    const result = await exportBundle({ recipe, range, viewport: p.viewport, ...EXPORT, audio: p.track?.buffer ?? null, drive: p.drive, onProgress });
    const type = (name: string) => (name.endsWith(".mp4") ? "video/mp4" : name.endsWith(".png") ? "image/png" : name.endsWith(".wav") ? "audio/wav" : "application/json");
    const files = Object.fromEntries(Object.entries(result.contents).map(([name, bytes]) => [name, new Blob([bytes as BlobPart], { type: type(name) })]));
    return { files, references: { ...refs.get(p.slot) }, shot: recipe.shot ?? null, prompt: currentPrompt() };
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
    player.setAttribute("src", url);
    $("generateSlot").replaceChildren(player);
  }
  const divider = $("divider");
  divider.addEventListener("pointerdown", e => {
    const r = screens.getBoundingClientRect();
    captureDrag(divider, e, ev => { const f = (ev.clientX - r.left) / r.width; setSplit(swapped ? 1 - f : f); });
  });
  divider.addEventListener("dblclick", () => setSplit(0.5));
  $("swapScreens").onclick = () => { swapped = !swapped; screens.classList.toggle("swapped", swapped); };

  // The result follows the page's clock: its time set every frame (the embed's player matches it within a frame).
  const follow = () => {
    if (player && !$("screenOutput").hidden) {
      const t = Math.max(0, p.head - p.window0());
      if (arena) player.currentTime = t;
      else if (Math.abs(player.currentTime - t) > 0.08) player.currentTime = t;
    }
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);

  // References: per example, never in the recipe or the script.
  const thumb = (id: string, blob?: Blob) => { const el = $(id); el.style.backgroundImage = blob ? `url(${URL.createObjectURL(blob)})` : ""; el.classList.toggle("set", !!blob); };
  for (const [k, input, th] of [["character", "refCharacter", "thumbCharacter"], ["environment", "refEnvironment", "thumbEnvironment"]] as const) {
    $<HTMLInputElement>(input).onchange = () => {
      const file = $<HTMLInputElement>(input).files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      refs.set(p.slot, { ...refs.get(p.slot), [k]: file });
      thumb(th, file);
      sync();
      p.say(`${k === "character" ? "Character sheet" : "Environment"}: ${file.name}`);
    };
  }

  // Model choice and the prompt it will get.
  const labelOf = (id: string) => arena?.offeredModels().find(m => m.key === id)?.name ?? MODELS.find(m => m.id === id)?.label ?? id;
  function sync() {
    document.querySelectorAll<HTMLButtonElement>('[data-control="model"] button').forEach(b => { b.classList.toggle("on", b.dataset.value === model); b.textContent = labelOf(b.dataset.value!); });
    $("shotLegend").textContent = currentPrompt();
    $("shotLegend").title = `The prompt this model gets:\n\n${$("shotLegend").textContent}`;
  }
  document.querySelector('[data-control="model"]')!.addEventListener("click", e => {
    const v = (e.target as HTMLElement).closest("button")?.dataset.value as ModelId | undefined;
    if (v) { model = v; sync(); }
  });

  /** The page's own cost dialog: resolves true only on Generate. */
  const confirmCost = (q: { usd: number; modelName: string; inputs: unknown[] }) => new Promise<boolean>(resolve => {
    $("costText").textContent = `Up to ${q.usd.toFixed(2)} USD on ${q.modelName} (limit ${MAX_PRICE} USD). It sends the guide video${(q.inputs?.length ?? 0) > 1 ? ", the reference images" : ""} and the prompt from your shot description.${fake && !key?.connected ? " Local preview: nothing is sent and nothing is charged." : ""}`;
    $("costDialog").hidden = false;
    $("costOk").focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); done(false); } };
    const done = (v: boolean) => { $("costDialog").hidden = true; window.removeEventListener("keydown", esc, true); resolve(v); };
    window.addEventListener("keydown", esc, true);
    $("costOk").onclick = () => done(true);
    $("costCancel").onclick = () => done(false);
  });

  // One run at a time; while it runs the Generate button stops it. The run belongs to the example it
  // started on: switching examples mid-run files the result there and never shows it on another.
  let running: AbortController | null = null;
  // The note and the progress bar are held here: a shown result replaces them in the output frame,
  // and a second run looked them up by id and found nothing (it threw and left the button on Stop).
  const bar = $("genProgress"), note = $("outputNote");
  const runButton = $<HTMLButtonElement>("runGenerate");
  const setRunning = (c: AbortController | null) => { running = c; runButton.textContent = c ? "Stop" : "Generate"; runButton.classList.toggle("running", !!c); };
  runButton.onclick = async () => {
    if (running) { running.abort(); p.say("Stopping…"); return; }
    if (p.busy) return;
    if (!arena) { p.say("Generate needs the Model Arena embed in vendor/ (npm run vendor:arena)."); return; }
    if (!key?.connected && !fake) { p.say("Add your Runware API key first (top right)."); return; }
    // An empty shot is refused by every model: say so before rendering the guide, and point at the field.
    if (!p.state.shot.subject?.trim() && !p.state.shot.action?.trim()) { p.say("Describe the shot first: a subject or an action (the fields under the preview)."); $("shotSubject").focus(); return; }
    const slot = p.slot, runModel = model, abort = new AbortController();
    setRunning(abort);
    const here = () => p.slot === slot;
    const fill = bar.firstElementChild as HTMLElement;
    setOutputPane(true); $("addToGallery").hidden = true;
    bar.hidden = false; note.textContent = "Rendering the guide…"; fill.style.width = "0%";
    $("generateSlot").replaceChildren(note, bar);
    try {
      // The page is busy (playback paused) only while the guide renders in the shared viewport.
      p.busy = true;
      const bundle = await exportGuideInMemory((d, t) => { fill.style.width = `${Math.round(d / t * 40)}%`; }).finally(() => { p.busy = false; });
      if (abort.signal.aborted) throw Object.assign(new Error("Stopped. Nothing was submitted."), { code: "aborted" });
      fakeResult = URL.createObjectURL(bundle.files["guide.mp4"]);
      const r = refs.get(slot) ?? {};
      const result = await arena.generateFromGuide({
        guide: bundle.files, model: runModel, shot: shot(), signal: abort.signal, references: { character: r.character, environment: r.environment }, maxPrice: MAX_PRICE,
        key: key?.connected ? key : "local-preview-key-0000000000000000", confirm: confirmCost,
        onProgress: (g: { stage: string; message: string; progress?: number }) => { if (!here()) return; note.textContent = g.message; fill.style.width = `${40 + Math.round((g.progress ?? ({ plan: 5, confirm: 10, upload: 30, submit: 40, poll: 60, done: 100 } as Record<string, number>)[g.stage] ?? 50) * 0.6)}%`; },
        ...(fake && !key?.connected ? { fetch: fakeFetch(() => fakeResult), poll: { initialDelayMs: 100, intervalMs: 100, maxIntervalMs: 200 } } : {}),
      });
      outputs.set(slot, { url: result.videoURL, record: result.record, model: runModel, prompt: bundle.prompt });
      if (here()) { showResult(result.videoURL); if (fake && !key?.connected) player?.classList.add("fake"); }
      p.say(`${labelOf(runModel)}${here() ? "" : ` (${slot === "own" ? "Your own" : `Example ${Number(slot) + 1}`})`}: done${result.costUsd !== null ? `, ${result.costUsd.toFixed(2)} USD` : ""}${fake && !key?.connected ? " (local preview: the guide stands in for the result)" : ""}`);
      renderGallery();
    } catch (e) {
      const err = e as { code?: string; message: string };
      const plain = err.code ? ERROR_MESSAGES[err.code] ?? err.message : err.message;
      note.textContent = err.code === "refused" || err.code === "provider" ? `${plain}: ${err.message}` : plain;
      p.say(note.textContent);
      if (here()) { if (!outputs.get(slot)) { bar.hidden = true; } else showResult(outputs.get(slot)!.url); }
    } finally { setRunning(null); bar.hidden = true; }
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
  const gallery = bindGallery({ root: $("gallerySlot"), load: slot => void p.switchSlot(slot), refs: slot => refs.get(slot), runs: () => runs });
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
      const button = $("keyButton"), label = () => { button.lastChild!.textContent = key!.connected ? "Runware key connected" : "Add your Runware API key"; button.classList.toggle("connected", key!.connected); };
      button.onclick = () => { pop.hidden = !pop.hidden; };
      window.addEventListener("pointerdown", e => { if (!pop.hidden && !$("keySlot").contains(e.target as Node)) pop.hidden = true; });
      window.addEventListener("keydown", e => { if (e.key === "Escape") pop.hidden = true; });
      key.addEventListener("arena-key-change", () => { label(); if (key!.connected) pop.hidden = true; p.say(key!.connected ? "Runware key connected (kept in this tab only)" : "Runware key removed"); });
      label();
    }
    sync();
  });
  sync();

  return {
    exportGuideInMemory, sync,
    /** A new slot: its references, its output (if any). */
    onSlot(slot: string) {
      const r = refs.get(slot);
      thumb("thumbCharacter", r?.character); thumb("thumbEnvironment", r?.environment);
      // A run in progress on another example keeps going; this example shows its own output (or none).
      showResult(outputs.get(slot)?.url ?? null);
      sync();
    },
  };
}
