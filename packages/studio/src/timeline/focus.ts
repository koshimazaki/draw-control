/**
 * What the timeline has in focus (a move, a phase block, a hit marker or a step), the hit
 * test that finds one under the pointer, and deleting it: the Delete key closes the gap,
 * Shift-Delete holds it, and the right-click menu offers both (see core delete-edits.ts).
 */
import {
  CLIP_ACCENTS, beatAtSeconds, deleteMove, deletePhase, deleteStep, removeMarker, restorePhase,
  type AudioDrive, type GapMode, type HitMarker, type Recipe, type StepDivision,
} from "@motion-studio/core";
import { LANES, laneTop } from "./draw";

export type Focus =
  | { kind: "move"; id: string }
  | { kind: "phase"; marker: number; phase: number }
  | { kind: "marker"; marker: number }
  | { kind: "step"; index: number };

export type FocusModel = { recipe: Recipe; markers: HitMarker[]; phases: (number[] | null)[]; division: number };

/** The deletable thing at (x, y) on the canvas, in CSS pixels. */
export function targetAt(m: FocusModel, x: number, y: number, width: number): Focus | null {
  const r = m.recipe, total = r.durationBeats, beat = Math.max(0, Math.min(total, x / width * total));
  const markerBeat = (i: number) => beatAtSeconds(r.beatGrid, m.markers[i].seconds);
  if (y >= laneTop.cameraHead) return null;   // the Camera track selects blocks itself
  if (y < laneTop.move) {
    for (let i = m.markers.length - 1; i >= 0; i--) {
      const b = m.phases[i];
      if (!b) continue;
      const rel = beat - markerBeat(i);
      for (let k = 0; k < b.length - 1; k++) if (rel >= b[k] && rel < b[k + 1]) return { kind: "phase", marker: i, phase: k };
    }
    return null;
  }
  if (y < laneTop.envelope) {
    const mv = [...r.moves].reverse().find(v => v.atBeat <= beat);
    return mv ? { kind: "move", id: mv.id } : null;
  }
  if (y < laneTop.steps) return null;
  if (y < laneTop.graph) return { kind: "step", index: Math.floor(beat * m.division / 4) };
  const near = m.markers.findIndex((_, i) => Math.abs(markerBeat(i) / total * width - x) < (y < laneTop.graph + LANES.markerStrip ? 7 : 4));
  return near >= 0 ? { kind: "marker", marker: near } : null;
}

/** The edit that deletes a focus with a gap mode. */
export function deleteFocus(f: Focus, mode: GapMode, drive: AudioDrive | undefined, division: StepDivision): (r: Recipe) => Recipe {
  switch (f.kind) {
    case "move": return r => deleteMove(r, { moveId: f.id, mode });
    case "phase": return r => deletePhase(r, drive, { marker: f.marker, phase: f.phase, mode });
    case "marker": return r => removeMarker(r, drive, f.marker);
    case "step": return r => deleteStep(r, drive, { division, index: f.index, mode });
  }
}

export type MenuItem = { label: string; hint?: string; run: () => void };

/** Menu entries for a focus. */
export function menuFor(f: Focus, m: FocusModel, act: (fn: (r: Recipe) => Recipe) => void, drive: AudioDrive | undefined, division: StepDivision): MenuItem[] {
  const del = (mode: GapMode) => () => act(deleteFocus(f, mode, drive, division));
  if (f.kind === "move") {
    const mv = m.recipe.moves.find(v => v.id === f.id);
    const name = (mv?.clip ?? mv?.name ?? "move").replace(/_Loop$/, "").replace(/_/g, " ");
    return [
      { label: `Delete ${name}, close the gap`, hint: "Delete", run: del("close") },
      { label: `Delete ${name}, hold the move before`, hint: "Shift-Delete", run: del("hold") },
    ];
  }
  if (f.kind === "phase") {
    const mk = m.markers[f.marker], phaseName = (k: number) => CLIP_ACCENTS[mk.accent]?.phases[k]?.name ?? String(k);
    const items: MenuItem[] = [
      { label: `Delete "${phaseName(f.phase)}", close up`, hint: "Delete", run: del("close") },
      { label: `Hold "${phaseName(f.phase)}" (freeze, no turn)`, hint: "Shift-Delete", run: del("hold") },
    ];
    for (const k of [...(mk.skip ?? []), ...(mk.hold ?? [])])
      items.push({ label: `Restore "${phaseName(k)}"`, run: () => act(r => restorePhase(r, drive, { marker: f.marker, phase: k })) });
    items.push({ label: `Delete the ${mk.accent} marker`, run: () => act(r => removeMarker(r, drive, f.marker)) });
    return items;
  }
  if (f.kind === "marker") return [{ label: `Delete the ${m.markers[f.marker]?.accent ?? ""} marker`, hint: "Delete", run: del("close") }];
  return [
    { label: `Delete step ${f.index + 1}, close the gap`, hint: "Delete", run: del("close") },
    { label: `Delete step ${f.index + 1}, hold the step before`, hint: "Shift-Delete", run: del("hold") },
  ];
}

let open: HTMLElement | null = null;
export function closeMenu() { open?.remove(); open = null; }

/** A small context menu at page coordinates; closes on choice, Escape or a click elsewhere. */
export function showMenu(pageX: number, pageY: number, items: MenuItem[]) {
  closeMenu();
  if (!items.length) return;
  const el = document.createElement("div");
  el.className = "ctx-menu";
  el.setAttribute("role", "menu");
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    const label = document.createElement("span");
    label.textContent = it.label;
    b.appendChild(label);
    if (it.hint) { const k = document.createElement("kbd"); k.textContent = it.hint; b.appendChild(k); }
    b.onclick = () => { closeMenu(); it.run(); };
    el.appendChild(b);
  }
  document.body.appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${Math.min(pageX, window.scrollX + window.innerWidth - w - 8)}px`;
  el.style.top = `${Math.min(pageY, window.scrollY + window.innerHeight - h - 8)}px`;
  open = el;
  setTimeout(() => {
    const away = (e: Event) => { if (!el.contains(e.target as Node)) { closeMenu(); document.removeEventListener("pointerdown", away, true); } };
    document.addEventListener("pointerdown", away, true);
  });
}
window.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
