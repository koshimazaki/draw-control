/**
 * The Beat Path page's controls: the global lock, on-hit and clip choices, the map tools,
 * the lane menus, the Examples menu, Copy and Paste script (and a dropped .txt), Export
 * guide, the full-studio link, and the keyboard (Space plays, Cmd/Ctrl-Z undoes, Shift
 * redoes, Escape cancels a stroke or closes a menu). Split from page.ts.
 */
import { clipBeats } from "@motion-studio/core";
import { exportBundle } from "../export/bundle";
import { browserStore, saveSequence } from "../sequence-library";
import { download } from "../shared/download";
import { DEFAULT_CAMERA_PATH, EXAMPLES, exampleState } from "./examples";
import { removeAt, splitAt, type LaneView, type MenuItem } from "./lanes";
import type { Page } from "./page";
import { beatPathRecipe, exportRange } from "./recipe-map";
import { fitLanes, fromScript, setWord, toScript, type BeatPathState, type Block, type ClipChoice } from "./script";

export const STUDIO_SEQUENCE = "Beat Path";
const EXPORT = { width: 1280, height: 720 } as const;

export function bindActions(p: Page) {
  const { $ } = p;
  const input = (id: string) => $<HTMLInputElement>(id);

  function sync() {
    const s = p.state;
    const pick = (name: string, value: string | number) => document.querySelectorAll<HTMLButtonElement>(`[data-control="${name}"] button`).forEach(b => {
      const on = b.dataset.value === String(value);
      b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on));
    });
    pick("tool", p.tool); pick("view", p.view); pick("lock", s.lock); pick("hit", s.onHit); pick("clip", s.clip);
    const locked = s.lock !== "off";
    input("strength").disabled = !locked;
    input("strength").closest(".slider")!.classList.toggle("off", !locked);
    document.querySelector('[data-control="hit"]')!.classList.toggle("off", !locked);
    input("strength").value = String(s.strength);
    input("landmarksExport").checked = s.landmarks.on;
    $("strengthOut").textContent = s.strength.toFixed(2);
    const corners = p.tool === "subject" ? s.subjectCorners : s.cameraCorners;
    input("corners").value = String(corners);
    $("cornersOut").textContent = corners.toFixed(2);
    $("hudLock").textContent = locked ? `lock ${s.lock} ${s.strength.toFixed(2)}` : "no lock";
    $("prompt").textContent = s.prompt ?? "Pick an example for a suggested prompt, or write your own.";
    const pts = p.tool === "subject" ? s.subject : s.camera;
    const empty = $("mapEmpty");
    empty.hidden = pts.length >= 2;
    empty.textContent = p.view === "side" ? `Draw the ${p.tool} path in the top view first.` : `Draw the ${p.tool === "subject" ? "subject’s" : "camera’s"} path: drag on the map, or click to place points.`;
    $("mapHint").textContent = p.view === "top"
      ? "Drag to draw · click to add a point · drag a point to move it · double-click removes it"
      : `Drag a point up or down to set the ${p.tool}’s height`;
  }

  // Segmented controls
  document.querySelectorAll<HTMLElement>("[data-control]").forEach(group => group.addEventListener("click", e => {
    const v = (e.target as HTMLElement).closest("button")?.dataset.value;
    if (!v) return;
    const s = p.state, name = group.dataset.control;
    if (name === "tool") return p.setTool(v as "subject" | "camera");
    if (name === "view") return p.setView(v as "top" | "side");
    if (name === "lock") p.update({ ...s, lock: v as BeatPathState["lock"] });
    if (name === "hit") p.update({ ...s, onHit: v as BeatPathState["onHit"] });
    if (name === "clip") { const clip = Number(v) as ClipChoice; p.update(fitLanes({ ...s, clip }, clipBeats(clip, p.info?.bpm ?? 120))); }
  }));
  input("strength").oninput = () => p.update({ ...p.state, strength: Number(input("strength").value) }, false);
  input("strength").onchange = () => p.update({ ...p.state, strength: Number(input("strength").value) }, true);
  const corners = (final: boolean) => { const c = Number(input("corners").value); p.update({ ...p.state, ...(p.tool === "subject" ? { subjectCorners: c } : { cameraCorners: c }) }, final); };
  input("corners").oninput = () => corners(false);
  input("corners").onchange = () => corners(true);
  input("landmarksExport").onchange = () => p.update({ ...p.state, landmarks: { ...p.state.landmarks, on: input("landmarksExport").checked } });
  input("gridExport").onchange = () => { p.viewport.setExportGrid(input("gridExport").checked); p.viewport.setGrid(input("gridExport").checked); p.rebuild(); };
  $("clearPath").onclick = () => {
    const s = p.state;
    if (p.tool === "subject") p.update({ ...s, subject: [] });
    else p.update({ ...s, camera: [], cameraLane: s.cameraLane.map(b => (b.word === "path" ? { ...b, word: "behind" as const } : b)) });
  };

  // Lane block menus: the lane's words, then split and remove.
  function openBlock<W extends string>(key: "character" | "cameraLane", view: LaneView<W>, anchor: HTMLElement, i: number, beat: number,
    labels: Record<W, string>, words: readonly W[], single?: W) {
    const blocks = p.state[key] as unknown as Block<W>[], b = blocks[i];
    const set = (next: Block<W>[] | null, extra: Partial<BeatPathState> = {}) => { if (next) p.update({ ...p.state, [key]: next, ...extra }); };
    const items: MenuItem[] = words.map(w => ({
      label: labels[w], on: w === b.word,
      run: () => {
        const extra: Partial<BeatPathState> = {};
        if (w === "path" && p.state.camera.length < 2) extra.camera = DEFAULT_CAMERA_PATH.map(q => ({ ...q }));
        set(setWord(blocks, i, w, single), extra);
      },
    }));
    items.push("-",
      { label: `Split at beat ${Math.round(beat * 2) / 2}`, disabled: !splitAt(blocks, i, beat), run: () => set(splitAt(blocks, i, beat)) },
      { label: "Remove (the block before takes its beats)", disabled: blocks.length < 2, run: () => set(removeAt(blocks, i)) });
    view.render(i);   // marks the block open; it replaces the clicked element, so anchor on the new one
    p.menu.show((view.root.children[i] as HTMLElement) ?? anchor, `${key === "character" ? "Character" : "Camera"} · beats ${b.from}–${b.to}`, items, () => view.render());
  }

  // Examples
  $("examples").onclick = () => p.menu.show($("examples"), "Examples", EXAMPLES.map((ex, i) => ({
    label: ex.label, run: () => { const s = exampleState(i); p.load(fitLanes(s, clipBeats(s.clip, p.info?.bpm ?? 120))); p.say(`Example: ${ex.label}`); },
  })));
  $("copyPrompt").onclick = () => void copy(p.state.prompt ?? "", "Prompt copied");

  // Scripts in and out
  const script = () => toScript(p.state);
  async function copy(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); p.say(done); }
    catch { download(text, "beat-path-script.txt", "text/plain"); p.say("Clipboard blocked: saved as a file"); }
  }
  /** Read a script into the state; the reason when it cannot be applied. */
  function applyScript(text: string): string | null {
    try {
      const { state, notes } = fromScript(text, p.state);
      const next = fitLanes(state, clipBeats(state.clip, p.info?.bpm ?? 120));
      beatPathRecipe(next, p.info, p.track && p.drive ? { drive: p.drive, bands: p.drive.bands } : {});
      p.load(next);
      p.say(notes.length ? `Script applied; ${notes.join("; ")}` : "Script applied");
      return null;
    } catch (e) { return (e as Error).message; }
  }
  $("copyScript").onclick = () => void copy(script(), "Shot script copied");
  const dialog = $("pasteDialog");
  const closeDialog = () => { dialog.hidden = true; $("pasteScript").focus(); };
  $("pasteScript").onclick = async () => {
    $("pasteError").textContent = "";
    $<HTMLTextAreaElement>("pasteText").value = await navigator.clipboard.readText().catch(() => "") || script();
    dialog.hidden = false;
    $<HTMLTextAreaElement>("pasteText").focus();
  };
  $("pasteCancel").onclick = closeDialog;
  $("pasteApply").onclick = () => { const err = applyScript($<HTMLTextAreaElement>("pasteText").value); if (err) $("pasteError").textContent = err; else closeDialog(); };

  // Export
  $("exportGuide").onclick = async () => {
    if (p.busy) return;
    p.busy = true;
    p.setPlaying(false);
    const button = $<HTMLButtonElement>("exportGuide");
    button.disabled = true;
    try {
      const recipe = p.recipe, range = exportRange(recipe, p.state.clip);
      const result = await exportBundle({ recipe, range, viewport: p.viewport, ...EXPORT, audio: p.track?.buffer ?? null, drive: p.drive,
        onProgress: (d, t) => { button.textContent = `Rendering ${Math.round(d / t * 100)}%`; } });
      download(result.zip, "beat-path-guide.zip", "application/zip");
      p.say(`Exported ${result.frames} frames, ${EXPORT.width}×${EXPORT.height}, ${(result.zip.length / 1e6).toFixed(1)} MB`);
    } catch (e) { p.say(`Export failed: ${(e as Error).message}`); }
    finally { p.busy = false; button.disabled = false; button.textContent = "Export guide"; }
  };
  $("openStudio").onclick = e => {
    const store = browserStore();
    if (!store) return;
    e.preventDefault();
    saveSequence(store, STUDIO_SEQUENCE, p.recipe);
    window.open(`./?sequence=${encodeURIComponent(STUDIO_SEQUENCE)}`, "_blank");
  };

  // Transport and files
  $("play").onclick = () => p.setPlaying(!p.player.playing);
  $("bigPlay").onclick = () => p.setPlaying(true);
  $("demoTrack").onclick = () => void p.useDemo();
  input("trackFile").onchange = () => { const f = input("trackFile").files?.[0]; if (f) void p.useFile(f); };
  const wrap = $("waveWrap");
  window.addEventListener("dragover", e => { e.preventDefault(); wrap.classList.add("drop"); });
  window.addEventListener("dragleave", e => { if (!e.relatedTarget) wrap.classList.remove("drop"); });
  window.addEventListener("drop", e => {
    e.preventDefault();
    wrap.classList.remove("drop");
    for (const f of e.dataTransfer?.files ?? []) {
      if (/\.txt$/i.test(f.name) || f.type === "text/plain") void f.text().then(t => { const err = applyScript(t); if (err) p.say(`Script not applied: ${err}`); });
      else if (f.type.startsWith("audio/") || /\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(f.name)) void p.useFile(f);
    }
  });
  window.addEventListener("keydown", e => {
    const typing = (e.target as HTMLElement).closest("input[type=text], textarea");
    if (e.key === "Escape") { if (!dialog.hidden) closeDialog(); else if (p.map.busy) p.map.cancelStroke(); return; }
    if (typing || !dialog.hidden) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); p.undo(e.shiftKey); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); p.undo(true); return; }
    if (e.code === "Space" && !(e.target as HTMLElement).closest("button, [role=listitem]")) { e.preventDefault(); p.setPlaying(!p.player.playing); }
  });

  if (import.meta.env.DEV) {
    // Dev-only probe for the smoke script.
    (window as unknown as { __beatPath: unknown }).__beatPath = {
      recipe: () => p.recipe, state: () => structuredClone(p.state), script, mapPoint: (q: { x: number; z: number }) => p.map.clientAt(q),
      playing: () => p.player.playing, head: () => p.head,
    };
  }
  return { sync, openBlock };
}
