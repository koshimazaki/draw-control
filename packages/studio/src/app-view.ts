/**
 * View-side controls of the studio: the view buttons, background and grid, the preview
 * size, the viewing aids and bone highlight, the move gizmo, the camera path drawer and
 * the rig panel. Split from app.ts; every recipe change still goes through `ctx.edit`.
 */
import { addMarker, setMarkerAccent, setMoveAtBeat, type AudioDrive, type FrameState, type MotionCommand, type Recipe } from "@motion-studio/core/internal";
import { updateExportPanel, exportSize } from "./export/panel";
import { MoveGizmo, previewState } from "./move-gizmo";
import { PathDrawer } from "./path-draw";
import { bindRigPanel, setRecipeSource } from "./rig-panel";
import { $ } from "./ui";
import { boneList } from "./viewing-aids";
import type { Background, Viewport } from "./viewport";
import type { View } from "./views";

export type ViewHost = {
  viewport: Viewport;
  recipe(): Recipe;
  edit(fn: (r: Recipe) => Recipe): void;
  /** Run a core command (logged), as the CLI and MCP do. */
  command(c: MotionCommand): void;
  render(): void;
  say(id: string, text: string): void;
  /** The analysed drive, or undefined without a track. */
  drive(): AudioDrive | undefined;
  frame(): number;
  cursor(): number;
  selectedMarker(): number;
};

export type ViewControls = {
  markView(v: View): void;
  applyResolution(): void;
  fillBones(): void;
  /** The gizmo's preview over a frame state, when it is previewing a move. */
  overlay(state: FrameState): FrameState;
};

export function bindViewControls(host: ViewHost): ViewControls {
  const { viewport } = host;
  const input = (id: string) => $<HTMLInputElement>(id);
  const markView = (v: View) => $("views").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.view === v));

  $("views").onclick = e => {
    const v = (e.target as HTMLElement).dataset.view as View | undefined;
    if (!v) return;
    if (v === "rig" && !host.recipe().camera) { host.say("exportStatus", "Turn on the audio-reactive camera (Camera rig section) first."); return; }
    viewport.setView(v); markView(v); host.render();
  };
  $<HTMLSelectElement>("background").onchange = () => viewport.setBackground($<HTMLSelectElement>("background").value as Background);
  input("grid").onchange = () => viewport.setGrid(input("grid").checked);
  input("gridExport").onchange = () => viewport.setExportGrid(input("gridExport").checked);
  const applyResolution = () => {
    const { width: w, height: h } = exportSize();
    $("viewport").style.aspectRatio = `${w} / ${h}`;
    $("viewport").style.setProperty("--ar", String(w / h));
    updateExportPanel(host.recipe());
  };
  $<HTMLSelectElement>("resolution").onchange = applyResolution;
  for (const id of ["customW", "customH"]) input(id).onchange = applyResolution;
  for (const id of ["rangeUnit", "rangeStart", "rangeLength"]) $<HTMLInputElement>(id).oninput = () => updateExportPanel(host.recipe());

  // Viewing aids and the move gizmo
  $("aids").onclick = e => {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    const aid = b?.dataset.aid as "bones" | "xray" | "onion" | "arcs" | undefined;
    if (!b || !aid) return;
    b.classList.toggle("on");
    viewport.setAids({ [aid]: b.classList.contains("on") });
    host.render();
  };
  $<HTMLSelectElement>("boneSelect").onchange = () => { viewport.setAids({ bone: $<HTMLSelectElement>("boneSelect").value || null }); host.render(); };
  function fillBones() {
    const names = boneList(viewport.getCharacter()).map(b => b.name);
    $("boneSelect").innerHTML = `<option value="">none</option>` + names.map(n => `<option value="${n}">${n}</option>`).join("");
  }
  let previewing = false, previewStart = performance.now();
  const gizmo: MoveGizmo = new MoveGizmo(() => {
    previewStart = performance.now();
    if (gizmo.preview && !previewing) {
      previewing = true;
      const loop = () => { if (!gizmo.preview) { previewing = false; host.render(); return; } host.render(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }, item => {
    if (item.kind === "loop") host.edit(r => setMoveAtBeat(r, host.cursor(), item.clip));
    else if (host.selectedMarker() >= 0) host.edit(r => setMarkerAccent(r, host.drive(), host.selectedMarker(), item.key));
    else host.edit(r => addMarker(r, host.drive(), host.frame() / r.fps, item.key));
  });
  $("gizmoToggle").onclick = () => {
    const on = !$("gizmoToggle").classList.contains("on");
    $("gizmoToggle").classList.toggle("on", on);
    gizmo.setVisible(on && host.recipe().character.kind === "rigged");
    host.render();
  };

  // Camera rig and reactive moves
  setRecipeSource(host.recipe);
  const walkRange = () => {
    const from = Number(input("walkFrom").value), to = input("walkTo").value === "" ? undefined : Number(input("walkTo").value);
    const gait = $<HTMLSelectElement>("walkGait").value;
    return { fromBeat: Number.isFinite(from) ? from : 0, ...(to !== undefined && Number.isFinite(to) ? { toBeat: to } : {}), ...(gait ? { gait } : {}) };
  };
  const travelLock = () => host.command({ type: "setTravelLock", lock: $<HTMLSelectElement>("walkLock").value, strength: Math.max(0, Math.min(1, Number(input("walkLockStrength").value) || 0)) });
  $("walkLock").onchange = travelLock;
  input("walkLockStrength").onchange = () => { if ($<HTMLSelectElement>("walkLock").value !== "off") travelLock(); };
  const pathDrawer = new PathDrawer(viewport, host.recipe, host.command, () => {
    $("drawPath").classList.toggle("on", pathDrawer.drawing && pathDrawer.target === "camera");
    $("drawWalk").classList.toggle("on", pathDrawer.drawing && pathDrawer.target === "root");
    viewport.setSelectedPathPoint(pathDrawer.selected);
    const p = host.recipe().camera?.path?.[pathDrawer.selected];
    $("pointHeightRow").hidden = !p;
    if (p) input("pointHeight").value = String(p.y);
  }, walkRange);
  const startDrawing = (target: "camera" | "root") => {
    pathDrawer.drawing = !(pathDrawer.drawing && pathDrawer.target === target);
    pathDrawer.target = target;
    $("drawPath").classList.toggle("on", pathDrawer.drawing && target === "camera");
    $("drawWalk").classList.toggle("on", pathDrawer.drawing && target === "root");
    if (pathDrawer.drawing) {
      viewport.setView("top"); markView("top"); host.render();
      host.say("exportStatus", target === "root" ? "Click-drag in the top view to draw the path the character walks." : "Click-drag in the top view to draw the camera path.");
    }
  };
  $("drawPath").onclick = () => startDrawing("camera");
  $("drawWalk").onclick = () => startDrawing("root");
  $("clearWalk").onclick = () => host.command({ type: "clearRootPath" });
  $("camMoveGo").onclick = () => host.command({ type: "startCameraMove", modes: [$<HTMLSelectElement>("camMoveMode").value], target: $<HTMLSelectElement>("camMoveTarget").value,
    index: Math.max(0, Math.round(Number(input("camMoveIndex").value) || 0)), lengthBeats: Math.max(0.25, Number(input("camMoveLen").value) || 8) });
  $("clearPath").onclick = () => { pathDrawer.clear(); $("pointHeightRow").hidden = true; };
  input("pointHeight").onchange = () => pathDrawer.setHeight(Number(input("pointHeight").value));
  bindRigPanel(host.edit, on => { const v = on ? "rig" : "front"; viewport.setView(v); markView(v); host.render(); });
  input("showPaths").onchange = () => { viewport.setShowPaths(input("showPaths").checked); host.render(); };

  return {
    markView, applyResolution, fillBones,
    overlay: state => gizmo.preview ? previewState(gizmo.preview, (performance.now() - previewStart) / 1000, state) : state,
  };
}
