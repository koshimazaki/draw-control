/**
 * Generate in place: the reference drops, the model, Generate, the output pane beside the
 * preview (absent until there is a result; a draggable divider, double-click resets, a swap
 * control; the split remembered for the session), the output following the page's playhead,
 * the in-memory guide export, and the Gallery. The sibling repo's module supplies the key
 * panel, the generate call and a result player (vendor/); until then a faked result (the
 * guide itself, tinted) sits behind a dev flag (`?fake=1`, on in dev) so the layout can be judged.
 * A model receives the guide video, the reference images and the shot description only.
 */
import { exportBundle } from "../export/bundle";
import { EXAMPLES, exampleState } from "./examples";
import { composePrompt, MODELS, type ModelId, type References } from "./generate";
import type { Page } from "./page";
import { exportRange } from "./recipe-map";
import { legendFor } from "./script";
import { EXAMPLE_TRACKS } from "./tracks";

const EXPORT = { width: 1280, height: 720 } as const;
const store = (() => { try { return window.sessionStorage; } catch { return null; } })();

export function bindGenerate(p: Page) {
  const { $ } = p;
  const refs = new Map<string, References>(), outputs = new Map<string, string>();
  let model: ModelId = MODELS[0].id, swapped = false;
  const fake = import.meta.env.DEV || new URLSearchParams(location.search).has("fake");
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.className = "output-video";

  /**
   * The guide bundle in memory: every file as a Blob (the same content as the zip), the
   * references and the shot description. This is what a generate call works from; it sends
   * the model guide.mp4, the references and the prompt from the shot description only.
   */
  async function exportGuideInMemory(onProgress?: (done: number, total: number) => void) {
    const recipe = p.recipe, range = exportRange(recipe, p.state.clip);
    const result = await exportBundle({ recipe, range, viewport: p.viewport, ...EXPORT, audio: p.track?.buffer ?? null, drive: p.drive, onProgress });
    const type = (name: string) => (name.endsWith(".mp4") ? "video/mp4" : name.endsWith(".png") ? "image/png" : name.endsWith(".wav") ? "audio/wav" : "application/json");
    const files = Object.fromEntries(Object.entries(result.contents).map(([name, bytes]) => [name, new Blob([bytes as BlobPart], { type: type(name) })]));
    return { files, references: { ...refs.get(p.slot) }, shot: recipe.shot ?? null, prompt: currentPrompt() };
  }
  const currentPrompt = () => composePrompt(p.state.shot, legendFor(p.state.figure));
  (window as unknown as { beatPath: unknown }).beatPath = { exportGuideInMemory, prompt: currentPrompt };

  // The two screens: the output pane exists only once there is a result.
  const screens = $("screens");
  const setSplit = (f: number) => { screens.style.setProperty("--split", String(Math.max(0.2, Math.min(0.8, f)))); try { store?.setItem("beatPath.split", String(f)); } catch { /* storage off */ } };
  setSplit(Number(store?.getItem("beatPath.split") ?? 0.5) || 0.5);
  function showOutput(url: string | null) {
    $("screenOutput").hidden = !url;
    $("divider").hidden = !url;
    screens.classList.toggle("split", !!url);
    if (url) { video.src = url; $("generateSlot").replaceChildren(video); }
    p.viewport.canvas.dispatchEvent(new Event("resize"));
  }
  const divider = $("divider");
  divider.addEventListener("pointerdown", e => {
    divider.setPointerCapture(e.pointerId);
    const r = screens.getBoundingClientRect();
    const move = (ev: PointerEvent) => { const f = (ev.clientX - r.left) / r.width; setSplit(swapped ? 1 - f : f); };
    const up = () => { divider.removeEventListener("pointermove", move); divider.removeEventListener("pointerup", up); };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", up);
  });
  divider.addEventListener("dblclick", () => setSplit(0.5));
  $("swapScreens").onclick = () => { swapped = !swapped; screens.classList.toggle("swapped", swapped); };

  // The output follows the page's clock.
  const follow = () => {
    if (!$("screenOutput").hidden && video.src) {
      const t = Math.max(0, p.head - p.window0());
      if (Math.abs(video.currentTime - t) > 0.08) video.currentTime = t;
      if (p.player.playing && video.paused) void video.play().catch(() => {}); else if (!p.player.playing && !video.paused) video.pause();
    }
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);

  // References: per example, never in the recipe or the script.
  const thumb = (id: string, blob?: Blob) => { const el = $(id); el.style.backgroundImage = blob ? `url(${URL.createObjectURL(blob)})` : ""; el.classList.toggle("set", !!blob); };
  for (const [key, input, th] of [["character", "refCharacter", "thumbCharacter"], ["environment", "refEnvironment", "thumbEnvironment"]] as const) {
    $<HTMLInputElement>(input).onchange = () => {
      const file = $<HTMLInputElement>(input).files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      refs.set(p.slot, { ...refs.get(p.slot), [key]: file });
      thumb(th, file);
      p.say(`${key === "character" ? "Character sheet" : "Environment"}: ${file.name}`);
    };
  }

  // Model and Generate.
  const syncModel = () => document.querySelectorAll<HTMLButtonElement>('[data-control="model"] button').forEach(b => b.classList.toggle("on", b.dataset.value === model));
  document.querySelector('[data-control="model"]')!.addEventListener("click", e => {
    const v = (e.target as HTMLElement).closest("button")?.dataset.value as ModelId | undefined;
    if (v) { model = v; syncModel(); }
  });
  syncModel();
  $("runGenerate").onclick = async () => {
    if (p.busy) return;
    const label = MODELS.find(m => m.id === model)!.label;
    if (!fake) { p.say(`Add your Runware API key to generate with ${label} (the key panel arrives with the generate module)`); return; }
    p.busy = true;
    showOutput(outputs.get(p.slot) ?? null);
    $("screenOutput").hidden = false; $("divider").hidden = false; screens.classList.add("split");
    const bar = $("genProgress"), note = $("outputNote");
    bar.hidden = false; note.textContent = `Generating with ${label}…`;
    $("generateSlot").replaceChildren(note, bar);
    try {
      const bundle = await exportGuideInMemory((d, t) => { (bar.firstElementChild as HTMLElement).style.width = `${Math.round(d / t * 100)}%`; });
      // Faked result (dev flag): the guide itself stands in for the model's clip.
      const url = URL.createObjectURL(bundle.files["guide.mp4"]);
      outputs.set(p.slot, url);
      showOutput(url);
      video.classList.add("fake");
      p.say(`Faked result (dev): the ${label} call is not wired yet; the prompt was "${bundle.prompt}"`);
      renderGallery();
    } catch (e) { note.textContent = `Generate failed: ${(e as Error).message}`; }
    finally { p.busy = false; bar.hidden = true; }
  };

  // The Gallery: the three examples with their inputs and outputs.
  function renderGallery() {
    const grid = $("gallerySlot");
    grid.replaceChildren(...EXAMPLES.map((ex, i) => {
      const s = exampleState(i), card = document.createElement("article");
      card.className = "gallery-card panel";
      const t = EXAMPLE_TRACKS[ex.id], out = outputs.get(String(i));
      const h = document.createElement("h3"); h.textContent = `Example ${i + 1}: ${ex.label}`;
      const media = document.createElement("div"); media.className = "gallery-media";
      if (out) { const v = document.createElement("video"); v.src = out; v.muted = true; v.loop = true; v.controls = true; media.append(v); }
      else { const ph = document.createElement("p"); ph.className = "muted"; ph.textContent = "No clip yet: load the example and press Generate."; media.append(ph); }
      const meta = document.createElement("dl");
      for (const [k, v] of [["Figure", s.figure.shape], ["Music", `${t.name}`], ["Subject", s.shot.subject], ["Environment", s.shot.environment], ["Action", s.shot.action]]) {
        const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; meta.append(dt, dd);
      }
      const open = document.createElement("button"); open.type = "button"; open.className = "btn outline"; open.textContent = "Load this example";
      open.onclick = () => { void p.switchSlot(String(i)); window.scrollTo({ top: 0 }); };
      card.append(h, media, meta, open);
      return card;
    }));
  }
  renderGallery();

  return {
    exportGuideInMemory,
    /** A new slot: its references, its output (if any). */
    onSlot(slot: string) {
      const r = refs.get(slot);
      thumb("thumbCharacter", r?.character); thumb("thumbEnvironment", r?.environment);
      showOutput(outputs.get(slot) ?? null);
    },
  };
}
