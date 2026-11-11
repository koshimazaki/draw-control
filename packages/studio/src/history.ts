/**
 * Undo and redo for every recipe edit. The studio routes all edits through one `edit`
 * function, which records the recipe before each change here. A gesture (one pointer
 * press: a drag of a marker, a phase edge, the energy pencil, a step bar, a blend handle
 * or the camera path, or a slider) records once, so it undoes in one step.
 */
import type { Recipe } from "@motion-studio/core/internal";

export class History {
  private past: Recipe[] = [];
  private future: Recipe[] = [];
  private gesture = false;
  private recorded = false;

  constructor(private limit = 200) {}

  /** Call with the recipe as it was, before a change that differs from it. */
  record(before: Recipe) {
    if (this.gesture && this.recorded) return;
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    if (this.gesture) this.recorded = true;
  }
  begin() { this.gesture = true; this.recorded = false; }
  end() { this.gesture = false; }

  undo(current: Recipe): Recipe | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    return prev;
  }
  redo(current: Recipe): Recipe | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  clear() { this.past = []; this.future = []; }
}

/** True when two recipes would play and save the same. */
export const sameRecipe = (a: Recipe, b: Recipe) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Wire the history to the page: Cmd-Z / Ctrl-Z undo, Shift-Cmd-Z / Ctrl-Y redo (text
 * fields keep their own undo), the Undo and Redo buttons, and one gesture per pointer press.
 */
export function bindUndo(history: History, host: { current(): Recipe; restore(r: Recipe): void }) {
  const undoBtn = document.getElementById("undo") as HTMLButtonElement | null, redoBtn = document.getElementById("redo") as HTMLButtonElement | null;
  const sync = () => { if (undoBtn) undoBtn.disabled = !history.canUndo; if (redoBtn) redoBtn.disabled = !history.canRedo; };
  const undo = () => { const r = history.undo(host.current()); if (r) host.restore(r); sync(); };
  const redo = () => { const r = history.redo(host.current()); if (r) host.restore(r); sync(); };
  if (undoBtn) undoBtn.onclick = undo;
  if (redoBtn) redoBtn.onclick = redo;
  window.addEventListener("keydown", e => {
    if ((e.target as HTMLElement).closest("input[type=text], input[type=number], textarea")) return;
    const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
    if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (e.ctrlKey && key === "y") { e.preventDefault(); redo(); }
  });
  document.addEventListener("pointerdown", () => history.begin(), true);
  const end = () => { history.end(); sync(); };
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  return sync;
}
