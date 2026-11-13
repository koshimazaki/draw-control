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
import { removeAt, splitAt, type LaneView, type MenuField, type MenuItem } from "./lanes";
import type { Page } from "./page";
import { beatPathRecipe, exportRange } from "./recipe-map";
import { HIT_CHOICES, LABELS, LOCK_CHOICES, legendFor, fitLanes, fromScript, setWord, toScript, type BeatPathState, type Block, type CameraWord, type ClipChoice } from "./script";

/** The lane word a typed phrase reads as (its colour and fallback). */
function wordOf(phrase: string, fallback: CameraWord): CameraWord {
  if (/^(follow side|side)\b/.test(phrase)) return "side";
  if (/^(follow behind|chase|over shoulder|shoulder)\b/.test(phrase)) return "behind";
  if (/^orbit\b/.test(phrase)) return "orbit";
  if (/^(go )?(top|above)\b/.test(phrase)) return "top";
  if (/^path\b/.test(phrase)) return "path";
  if (/^(push in|dolly in)\b/.test(phrase)) return "push";
  return fallback;
}

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
    pick("tool", p.tool); pick("view", p.view); pick("clip", s.clip); pick("pen", p.pen);
    input("landmarksExport").checked = s.landmarks.on;
    input("figureBody").value = s.figure.body; input("figureHead").value = s.figure.head;
    const chip = (id: string, l: { lock: string; strength: number }, extra = "") => {
      $(id).textContent = l.lock === "off" ? "no lock" : `${l.lock} ${l.strength.toFixed(2)}${extra}`;
      $(id).classList.toggle("off", l.lock === "off");
    };
    chip("chipCharacterLock", s.charLock);
    chip("chipCameraLock", s.camLock, s.camLock.lock === "off" ? "" : ` · ${s.camLock.advance ? "next on hit" : LABELS.hit[s.camLock.onHit].toLowerCase()}`);
    const corners = p.tool === "subject" ? s.subjectCorners : s.cameraCorners;
    input("corners").value = String(corners);
    $("cornersOut").textContent = corners.toFixed(2);
    $("hudLock").textContent = `figure ${s.charLock.lock === "off" ? "free" : s.charLock.lock} · camera ${s.camLock.lock === "off" ? "free" : s.camLock.lock}`;
    for (const k of ["subject", "environment", "action"] as const) {
      const el = input(`shot${k[0].toUpperCase()}${k.slice(1)}`);
      if (document.activeElement !== el) el.value = s.shot[k];
    }
    $("shotLegend").textContent = `Legend: ${legendFor(s.figure)}.`;
    const pts = p.tool === "subject" ? s.subject : s.camera;
    const empty = $("mapEmpty");
    empty.hidden = pts.length >= 2;
    empty.textContent = p.view === "side" ? `Draw the ${p.tool} path in the top view first.` : `No ${p.tool} path yet: press Draw new, then drag on the map or click to place points.`;
    $("mapHint").textContent = p.view !== "top" ? `Drag a point up or down to set the ${p.tool}’s height`
      : p.pen === "draw" ? "Drawing a new path: drag a stroke, or click to place points · Escape stops"
      : "Drag a point to move it · Delete removes the selected point · Draw new to start a path";
    $("map").classList.toggle("pen", p.pen === "draw");
  }

  // Segmented controls
  document.querySelectorAll<HTMLElement>("[data-control]").forEach(group => group.addEventListener("click", e => {
    const v = (e.target as HTMLElement).closest("button")?.dataset.value;
    if (!v) return;
    const s = p.state, name = group.dataset.control;
    if (name === "tool") return p.setTool(v as "subject" | "camera");
    if (name === "view") return p.setView(v as "top" | "side");
    if (name === "pen") return p.setPen(v as "edit" | "draw");
    if (name === "clip") { const clip = Number(v) as ClipChoice; p.update(fitLanes({ ...s, clip }, clipBeats(clip, p.info?.bpm ?? 120))); }
  }));
  // Lane lock chips: each lane's own source and strength; the camera's also what it does on each hit.
  const lockMenu = (lane: "charLock" | "camLock") => {
    const l = p.state[lane], set = (patch: Partial<BeatPathState["camLock"]>) => p.update({ ...p.state, [lane]: { ...p.state[lane], ...patch } });
    const items: MenuItem[] = LOCK_CHOICES.map(v => ({ label: `Lock to ${LABELS.lock[v].toLowerCase()}`, on: l.lock === v, run: () => set({ lock: v }) }));
    items.push("-", ...[0.25, 0.5, 0.75, 1].map(v => ({ label: `Strength ${v.toFixed(2)}`, on: Math.abs(l.strength - v) < 1e-6, disabled: l.lock === "off", run: () => set({ strength: v }) })));
    if (lane === "camLock") {
      const c = p.state.camLock;
      items.push("-", ...HIT_CHOICES.map(v => ({ label: `On each hit: ${LABELS.hit[v].toLowerCase()}`, on: c.onHit === v, disabled: c.lock === "off", run: () => set({ onHit: v }) })),
        { label: "Next move on each hit", on: c.advance, disabled: c.lock !== "kick" && c.lock !== "snare", run: () => set({ advance: !c.advance }) });
    }
    p.menu.show($(lane === "charLock" ? "chipCharacter" : "chipCamera"), lane === "charLock" ? "Character lock" : "Camera lock", items);
  };
  $("chipCharacter").onclick = () => lockMenu("charLock");
  $("chipCamera").onclick = () => lockMenu("camLock");
  const corners = (final: boolean) => { const c = Number(input("corners").value); p.update({ ...p.state, ...(p.tool === "subject" ? { subjectCorners: c } : { cameraCorners: c }) }, final); };
  input("corners").oninput = () => corners(false);
  input("corners").onchange = () => corners(true);
  /** A colour too close to the landmarks' greys (low chroma, mid lightness) loses the figure: say so. */
  const greyish = (hex: string) => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v) < 48 && Math.max(...v) > 90 && Math.max(...v) < 230; };
  const figure = (final: boolean) => {
    const body = input("figureBody").value, head = input("figureHead").value;
    p.update({ ...p.state, figure: { body, head } }, final);
    if (final) p.say(greyish(body) || greyish(head) ? "That colour is close to the grey landmarks: the figure may not stand out" : `Figure: body ${body}, head ${head}`);
  };
  for (const id of ["figureBody", "figureHead"]) { input(id).oninput = () => figure(false); input(id).onchange = () => figure(true); }
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
        set(setWord(blocks, i, w, single).map((x, k) => (k === i ? { from: x.from, to: x.to, word: x.word } : x)), extra);
      },
    }));
    items.push("-",
      { label: `Split at beat ${Math.round(beat * 2) / 2}`, disabled: !splitAt(blocks, i, beat), run: () => set(splitAt(blocks, i, beat)) },
      { label: "Remove (the block before takes its beats)", disabled: blocks.length < 2, run: () => set(removeAt(blocks, i)) });
    p.setSelection({ kind: "block", lane: key, index: i });
    view.render(i);   // marks the block open; it replaces the clicked element, so anchor on the new one
    const field: MenuField | undefined = key !== "cameraLane" ? undefined : {
      label: "Camera direction (the script's words)", value: b.phrase ?? "", placeholder: `${labels[b.word].toLowerCase()} · e.g. go above then dolly in 2m fast`,
      apply: text => {
        const phrase = text.replace(/\s*\block\s+(beat|kick|snare|hat)\b.*$/i, "").trim().toLowerCase();
        const next = (blocks as unknown as Block<CameraWord>[]).map((x, k) => (k !== i ? x : phrase ? { ...x, word: wordOf(phrase, x.word), phrase } : { from: x.from, to: x.to, word: x.word }));
        const state = { ...p.state, cameraLane: next };
        if (/\bpath\b/.test(phrase) && state.camera.length < 2) state.camera = DEFAULT_CAMERA_PATH.map(q => ({ ...q }));
        try { beatPathRecipe(state, p.info, p.track && p.drive ? { drive: p.drive, bands: p.drive.bands } : {}); }
        catch (e) { return (e as Error).message.replace(/^script line \d+: /, ""); }
        p.update(state);
        return null;
      },
    };
    p.menu.show((view.root.children[i] as HTMLElement) ?? anchor, `${key === "character" ? "Character" : "Camera"} · beats ${b.from}–${b.to}`, items, () => view.render(), field);
  }

  // Examples
  $("examples").onclick = () => p.menu.show($("examples"), "Examples", EXAMPLES.map((ex, i) => ({
    label: ex.label, run: () => { const s = exampleState(i); p.load(fitLanes(s, clipBeats(s.clip, p.info?.bpm ?? 120))); p.say(`Example: ${ex.label}`); },
  })));
  // The shot description: three fields, stored in the recipe (recipe.json in the bundle) and the script.
  for (const k of ["subject", "environment", "action"] as const) {
    const el = input(`shot${k[0].toUpperCase()}${k.slice(1)}`);
    el.oninput = () => p.update({ ...p.state, shot: { ...p.state.shot, [k]: el.value } }, false);
    el.onchange = () => p.update({ ...p.state, shot: { ...p.state.shot, [k]: el.value } }, true);
  }
  $("copyPrompt").onclick = () => {
    const s = p.state.shot, parts = [s.subject, s.environment, s.action].filter(Boolean);
    void copy(`${parts.join(". ")}${parts.length ? ". " : ""}${legendFor(p.state.figure)}.`, "Prompt copied");
  };

  // Scripts in and out
  const script = () => toScript(p.state);
  async function copy(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); p.say(done); }
    catch { download(text, "beat-path-script.txt", "text/plain"); p.say("Clipboard blocked: saved as a file"); }
  }
  /** Read a script into the state; the reason when it cannot be applied. */
  function applyScript(text: string): string | null {
    try {
      const { state, notes } = fromScript(text, p.state, p.recipe.beatGrid);
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
  $("removeTrack").onclick = () => p.removeTrack();
  $("resetMarkers").onclick = () => p.update({ ...p.state, muted: [] });
  $("sound").onclick = () => {
    const on = !p.player.muted;
    p.player.setMuted(on);
    $("sound").setAttribute("aria-pressed", String(!on));
    $("sound").textContent = on ? "Sound off" : "Sound on";
  };
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
    if (e.key === "Escape") {
      if (!dialog.hidden) closeDialog();
      else if (p.map.busy) p.map.cancelStroke();
      else { p.setSelection(null); if (p.pen === "draw") p.setPen("edit"); }
      return;
    }
    if (typing || !dialog.hidden) return;
    // Delete or Backspace removes the selected lane block or path point (undoable).
    if ((e.key === "Delete" || e.key === "Backspace") && p.selection && !(e.target as HTMLElement).closest("input")) {
      e.preventDefault();
      const sel = p.selection, s = p.state;
      if (sel.kind === "point") {
        const key = sel.tool === "subject" ? "subject" : "camera";
        p.update({ ...s, [key]: s[key].filter((_, k) => k !== sel.index) });
      } else {
        const next = removeAt(s[sel.lane] as Block<string>[], sel.index);
        if (next) p.update({ ...s, [sel.lane]: next });
      }
      p.menu.hide();
      p.setSelection(null);
      return;
    }
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
