/**
 * The Beat Path page's controls: the example switcher, the map tools, the lane menus and
 * lock chips, Settings (clip, locks, snap, grid, scenery, figure, download guide), the shot
 * fields, the music strip, and the keyboard (Space plays, Cmd/Ctrl-Z undoes, Shift redoes,
 * Delete removes the selection, Escape cancels a stroke or clears it). Split from page.ts.
 * The shot script is the engine's format (CLI, MCP, examples/scripts); nothing about it shows here.
 */
import { clipBeats } from "@motion-studio/core";
import { exportBundle } from "../export/bundle";
import { download } from "../shared/download";
import { DEFAULT_CAMERA_PATH } from "./examples";
import { removeAt, splitAt, type LaneView, type MenuField, type MenuItem } from "./lanes";
import type { Page } from "./page";
import { beatPathRecipe, exportRange } from "./recipe-map";
import { HIT_CHOICES, LABELS, LOCK_CHOICES, fitLanes, setWord, toScript, type BeatPathState, type Block, type CameraWord, type ClipChoice } from "./script";
import { isTyping } from "./drag";
import { bindFollowFields, followProbe } from "./page-follow";

/** What each block's shape on the map is, said in its popover. */
const CAMERA_NOTES: Record<CameraWord, string> = {
  behind: "Follow behind: the camera trails the subject, turning with its heading; on the map its line is where the camera goes as the subject travels.",
  side: "Follow side: the camera keeps level with the subject at its side, turning with it; the line is the camera's track beside the subject's.",
  orbit: "Orbit: circles the subject, 15° a beat; the line shows where the camera ends up because the subject is moving while it circles.",
  top: "Top: rises into a view from above (eased, not a cut) and follows from there.",
  path: "My path: flies the camera path you drew (Camera path tool), always aiming at the subject.",
  push: "Push in: moves in towards the subject to 2.6 m over the block, keeping its angle.",
};
const CHARACTER_NOTES = {
  glide: "Glide: travels the subject path over the block (one glide per clip), facing along it; locked, it lands on each hit.",
  hover: "Hover: stands still at the start or the end of its path.",
  spin: "Spin: turns on the spot half way through the block.",
  jump: "Jump: a hop that lands half way through the block.",
  freeze: "Freeze: holds still, mid-air too, while the camera keeps moving; then carries on.",
};

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

const EXPORT = { width: 1280, height: 720 } as const;

export function bindActions(p: Page) {
  const { $ } = p;
  const input = (id: string) => $<HTMLInputElement>(id);

  const followFields = bindFollowFields(p);
  function sync() {
    const s = p.state;
    const pick = (name: string, value: string | number) => document.querySelectorAll<HTMLButtonElement>(`[data-control="${name}"] button`).forEach(b => {
      const on = b.dataset.value === String(value);
      b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on));
    });
    pick("tool", p.tool); pick("view", p.view); pick("clip", s.clip); pick("pen", p.pen); pick("example", p.slot);
    $<HTMLSelectElement>("scenery").value = s.scenery;
    input("sightPasses").checked = s.sight === "passes";
    $<HTMLSelectElement>("figureShape").value = s.figure.shape;
    input("figureBody").value = s.figure.body; input("figureHead").value = s.figure.head;
    const chip = (id: string, l: { lock: string; strength: number }, extra = "") => {
      $(id).textContent = l.lock === "off" ? "no lock" : `${l.lock}${l.strength < 1 ? ` ${+l.strength.toFixed(2)}` : ""}${extra}`;
      $(id).classList.toggle("off", l.lock === "off");
    };
    chip("chipCharacterLock", s.charLock);
    chip("chipCameraLock", s.camLock, s.camLock.lock === "off" ? "" : ` · ${s.camLock.advance ? "next" : { move: "moves", hold: "holds", punch: "punches" }[s.camLock.onHit]}`);
    const corners = p.tool === "camera" ? s.cameraCorners : s.subjectCorners;
    const box = p.tool === "blocks" ? p.blocks.selected : -1, boxes = p.tool === "blocks" ? (s.boxes ?? null) : null;
    $("boxHeightRow").hidden = box < 0; $("cornersRow").hidden = p.tool === "blocks";
    followFields.sync();
    if (box >= 0 && document.activeElement !== input("boxHeight")) input("boxHeight").value = String((boxes ?? [])[box]?.h ?? 8);
    input("corners").value = String(corners);
    $("cornersOut").textContent = corners.toFixed(2);
    $("hudLock").textContent = `figure ${s.charLock.lock === "off" ? "free" : s.charLock.lock} · camera ${s.camLock.lock === "off" ? "free" : s.camLock.lock}`;
    for (const k of ["subject", "environment", "action"] as const) {
      const el = input(`shot${k[0].toUpperCase()}${k.slice(1)}`);
      if (document.activeElement !== el) el.value = s.shot[k];
      el.title = s.shot[k];   // the whole text on hover when the field cuts it
    }
    const pts = p.tool === "subject" ? s.subject : p.tool === "camera" ? s.camera : [];
    const empty = $("mapEmpty");
    const rigs = p.tool === "camera" && pts.length < 2 && !s.cameraLane.some(b => b.word === "path");
    empty.hidden = pts.length >= 2 || p.tool === "blocks" || rigs;
    empty.textContent = p.view === "side" ? `Draw the ${p.tool} path in the top view first.` : `No ${p.tool} path yet: press Draw new, then drag on the map or click to place points.`;
    $("mapHint").textContent = rigs ? "The camera follows the Camera lane · drag a follow line to adjust it · Draw new replaces it with your path"
      : p.tool === "blocks" ? (p.pen === "draw" ? "Drag a rectangle to add a block · Esc stops" : "Click to select · drag to move · corners resize · ⌘D duplicates · Delete removes")
      : p.view !== "top" ? `Drag a point up or down to set the ${p.tool}’s height`
      : p.pen === "draw" ? (p.tool === "camera" ? "Drawing replaces the block's camera with your path · Esc stops" : "Drag a stroke or click points · Esc stops")
      : "Drag points to move · Delete removes · Draw new starts a path";
    $("mapHint").title = $("mapHint").textContent ?? "";   // the full hint when two lines cut it
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
    if (name === "example") return void p.switchSlot(v);
    if (name === "clip") { const clip = Number(v) as ClipChoice; p.update(fitLanes({ ...s, clip }, clipBeats(clip, p.info?.bpm ?? 120))); }
  }));
  // Lane lock chips: each lane's own source and strength; the camera's also what it does on each hit.
  const lockMenu = (lane: "charLock" | "camLock", anchor?: HTMLElement) => {
    const l = p.state[lane], set = (patch: Partial<BeatPathState["camLock"]>) => p.update({ ...p.state, [lane]: { ...p.state[lane], ...patch } });
    const items: MenuItem[] = LOCK_CHOICES.map(v => ({ label: `Lock to ${LABELS.lock[v].toLowerCase()}`, on: l.lock === v, run: () => set({ lock: v }) }));
    items.push("-", ...[0.25, 0.5, 0.75, 1].map(v => ({ label: `Strength ${v.toFixed(2)}`, on: Math.abs(l.strength - v) < 1e-6, disabled: l.lock === "off", run: () => set({ strength: v }) })));
    if (lane === "camLock") {
      const c = p.state.camLock;
      items.push("-", ...HIT_CHOICES.map(v => ({ label: `On each hit: ${LABELS.hit[v].toLowerCase()}`, on: c.onHit === v, disabled: c.lock === "off", run: () => set({ onHit: v }) })),
        { label: "Next move on each hit", on: c.advance, disabled: c.lock !== "kick" && c.lock !== "snare", run: () => set({ advance: !c.advance }) });
    }
    p.menu.show(anchor ?? $(lane === "charLock" ? "chipCharacter" : "chipCamera"), lane === "charLock" ? "Character lock" : "Camera lock", items);
  };
  $("setCharLock").onclick = () => lockMenu("charLock", $("setCharLock"));
  $("setCamLock").onclick = () => lockMenu("camLock", $("setCamLock"));
  $("chipCharacter").onclick = () => lockMenu("charLock");
  $("chipCamera").onclick = () => lockMenu("camLock");
  const corners = (final: boolean) => { const c = Number(input("corners").value); p.update({ ...p.state, ...(p.tool === "camera" ? { cameraCorners: c } : { subjectCorners: c }) }, final); };
  input("boxHeight").onchange = () => p.blocks.setHeight(Number(input("boxHeight").value));
  $("zoomIn").onclick = () => p.map.zoomBy(0.8);
  $("zoomOut").onclick = () => p.map.zoomBy(1.25);
  $("zoomFit").onclick = () => p.map.fit();
  input("corners").oninput = () => corners(false);
  input("corners").onchange = () => corners(true);
  /** A colour too close to the landmarks' greys (low chroma, mid lightness) loses the figure: say so. */
  const greyish = (hex: string) => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v) < 48 && Math.max(...v) > 90 && Math.max(...v) < 230; };
  const figure = (final: boolean) => {
    const body = input("figureBody").value, head = input("figureHead").value;
    p.update({ ...p.state, figure: { ...p.state.figure, body, head } }, final);
    if (final) p.say(greyish(body) || greyish(head) ? "That colour is close to the grey landmarks: the figure may not stand out" : `Figure: body ${body}, head ${head}`);
  };
  for (const id of ["figureBody", "figureHead"]) { input(id).oninput = () => figure(false); input(id).onchange = () => figure(true); }
  // A preset fills the scene again with its own (editable) boxes.
  $<HTMLSelectElement>("scenery").onchange = () => { const v = $<HTMLSelectElement>("scenery").value as BeatPathState["scenery"]; p.update({ ...p.state, scenery: v, boxes: undefined, landmarks: { ...p.state.landmarks, on: v !== "none" } }); };
  $<HTMLSelectElement>("figureShape").onchange = () => p.update({ ...p.state, figure: { ...p.state.figure, shape: $<HTMLSelectElement>("figureShape").value as BeatPathState["figure"]["shape"] } });
  input("sightPasses").onchange = () => p.update({ ...p.state, sight: input("sightPasses").checked ? "passes" : "clear" });
  input("gridExport").onchange = () => { p.viewport.setExportGrid(input("gridExport").checked); p.viewport.setGrid(input("gridExport").checked); p.rebuild(); };
  $("clearPath").onclick = () => {
    const s = p.state;
    if (p.tool === "blocks") { p.update({ ...s, boxes: [] }); return; }
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
    p.menu.show((view.root.children[i] as HTMLElement) ?? anchor, `${key === "character" ? "Character" : "Camera"} · beats ${b.from}–${b.to}`, items, () => view.render(), field,
      key === "cameraLane" ? CAMERA_NOTES[b.word as CameraWord] : CHARACTER_NOTES[b.word as keyof typeof CHARACTER_NOTES]);
  }

  // The shot description: three fields, stored in the recipe (recipe.json in the bundle) and the script.
  for (const k of ["subject", "environment", "action"] as const) {
    const el = input(`shot${k[0].toUpperCase()}${k.slice(1)}`);
    el.oninput = () => p.update({ ...p.state, shot: { ...p.state.shot, [k]: el.value } }, false);
    el.onchange = () => p.update({ ...p.state, shot: { ...p.state.shot, [k]: el.value } }, true);
  }
  const script = () => toScript(p.state);

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
    finally { p.busy = false; button.disabled = false; button.textContent = "Download guide (.zip)"; }
  };
  // Transport and files
  $("play").onclick = () => p.setPlaying(!p.player.playing);
  $("barPlay").onclick = () => p.setPlaying(!p.player.playing);
  // A click on the preview or the output toggles play (not on their own buttons).
  for (const id of ["preview", "screenOutput"]) $(id).addEventListener("click", e => { if (!(e.target as HTMLElement).closest("button")) p.setPlaying(!p.player.playing); });
  // The scrub bar: the same clock as the music strip; scrubbing while playing keeps playing from there.
  input("scrub").oninput = () => p.seek(p.window0() + Number(input("scrub").value) * p.state.clip);
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
      if (f.type.startsWith("audio/") || /\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(f.name)) void p.useFile(f);
    }
  });
  window.addEventListener("keydown", e => {
    // Any text-like field (the shot fields, the box height, the API key's password field) keeps its own keys.
    const typing = isTyping(e.target);
    if (e.key === "Escape") {
      if (!$("costDialog").hidden) return;   // the cost dialog handles its own Escape
      if (p.map.busy) p.map.cancelStroke();
      else { p.setSelection(null); if (p.pen === "draw") p.setPen("edit"); }
      return;
    }
    if (typing) return;
    // The Blocks tool: Delete removes the selected block, Cmd/Ctrl-D duplicates, -C and -V copy and paste at the pointer.
    if (p.tool === "blocks" && p.blocks.selected >= 0 && !(e.target as HTMLElement).closest("input")) {
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if ((e.key === "Delete" || e.key === "Backspace") && p.blocks.remove()) { e.preventDefault(); return; }
      if (mod && k === "d" && p.blocks.duplicate()) { e.preventDefault(); return; }
      if (mod && k === "c" && p.blocks.copy()) { e.preventDefault(); p.say("Block copied: Cmd/Ctrl-V pastes it at the pointer"); return; }
    }
    if (p.tool === "blocks" && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v" && p.blocks.paste()) { e.preventDefault(); return; }
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
    // Arrows step one frame when paused, Shift one beat.
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !p.player.playing && !(e.target as HTMLElement).closest("input, select")) {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1, step = e.shiftKey ? 60 / p.recipe.beatGrid.bpm : 1 / 24;
      p.seek(Math.round((p.head + dir * step) * 24) / 24);
      return;
    }
    if (e.code === "Space" && !p.map.hovering && !(e.target as HTMLElement).closest("button, [role=listitem], input, select")) { e.preventDefault(); p.setPlaying(!p.player.playing); }
  });

  if (import.meta.env.DEV) {
    // Dev-only probe for the smoke script.
    (window as unknown as { __beatPath: unknown }).__beatPath = {
      recipe: () => p.recipe, state: () => structuredClone(p.state), script, mapPoint: (q: { x: number; z: number }) => p.map.clientAt(q),
      playing: () => p.player.playing, head: () => p.head, selection: () => p.selection, mapInside: () => p.map.allInside(), shown: () => p.shown,
      boxes: () => p.blocks.host.boxes(), boxSelected: () => p.blocks.selected, slot: () => p.slot, trackName: () => p.info?.name ?? null,
      followSegs: () => p.followSegs.map(s => ({ block: s.block, word: s.word, points: s.points, anchors: s.anchors })),
      followProbe: (k: number) => followProbe(p.recipe, p.drive, p.state.cameraLane[k]),
    };
  }
  return { sync, openBlock };
}
