import { describe, expect, it } from "vitest";
import { defaultRiggedRecipe, deleteMove, moveMarker, paintEnergy, validateRecipe, type Recipe } from "@motion-studio/core/internal";
import { History, sameRecipe } from "../src/history";

/** The studio's edit path, without the page: record the recipe before each real change. */
function editor(start: Recipe) {
  const h = new History();
  let r = start;
  const edit = (fn: (x: Recipe) => Recipe) => { const next = fn(r); if (!sameRecipe(r, next)) h.record(r); r = next; };
  return { h, edit, get: () => r, undo: () => { r = h.undo(r) ?? r; }, redo: () => { r = h.redo(r) ?? r; } };
}

describe("undo and redo", () => {
  const start = validateRecipe({ ...defaultRiggedRecipe(), reactive: { ...defaultRiggedRecipe().reactive!, markers: [{ seconds: 2, accent: "jab", source: "manual" }] } });

  it("undoes and redoes a delete exactly", () => {
    const e = editor(start);
    e.edit(r => deleteMove(r, { moveId: "Dance_Loop-4", mode: "close" }));
    expect(e.get().moves).toHaveLength(1);
    e.undo();
    expect(e.get()).toEqual(start);
    e.redo();
    expect(e.get().moves).toHaveLength(1);
  });

  it("records a drag (one gesture of many edits) as one undo step", () => {
    const e = editor(start);
    e.h.begin();
    for (const s of [2.1, 2.2, 2.3, 2.4]) e.edit(r => moveMarker(r, undefined, 0, s));
    e.h.end();
    e.h.begin();
    for (let t = 0; t < 4; t += 0.5) e.edit(r => paintEnergy(r, undefined, t, t + 0.5, 0.2, 0.9));
    e.h.end();
    expect(e.get().reactive!.markers![0].seconds).toBe(2.4);
    e.undo();
    expect(e.get().energyCurve).toBeUndefined();
    expect(e.get().reactive!.markers![0].seconds).toBe(2.4);
    e.undo();
    expect(e.get()).toEqual(start);
    expect(e.h.canUndo).toBe(false);
  });

  it("skips edits that change nothing, and a new edit clears redo", () => {
    const e = editor(start);
    e.edit(r => moveMarker(r, undefined, 5, 1));   // no marker 5: unchanged
    expect(e.h.canUndo).toBe(false);
    e.edit(r => moveMarker(r, undefined, 0, 3));
    e.undo();
    e.edit(r => moveMarker(r, undefined, 0, 1));
    expect(e.h.canRedo).toBe(false);
  });
});
