/** A drag on the page (drag-edit.ts): one undo step when it lands, none and nothing left behind when it is put back. */
import { describe, expect, it } from "vitest";
import { editStep, endDrag, type DragAt } from "../src/beat-path/drag-edit";

type S = { lane: string[] };
/** The page's values (page.ts): the state, where a drag began, the undo steps. */
function page(lane: string[]) {
  let at: DragAt<S> = { state: { lane }, base: null };
  const past: S[] = [];
  return {
    get state() { return at.state; }, get base() { return at.base; }, past,
    edit(next: string[], final: boolean) { const r = editStep(at, { lane: next }, final); at = { state: r.state, base: r.base }; if (r.step) past.push(r.step); },
    cancel() { const r = endDrag(at); at = { state: r.state, base: r.base }; return r.restored; },
    undo() { const s = past.pop(); if (s) at = { state: s, base: null }; },
  };
}

describe("A drag's edits", () => {
  it("moves change the state with no undo step; the release makes the whole drag one, from where it began", () => {
    const p = page(["a", "b", "c"]);
    p.edit(["b", "a", "c"], false); p.edit(["b", "c", "a"], false);
    expect(p.past).toEqual([]);
    p.edit(["b", "c", "a"], true);
    expect(p.past).toEqual([{ lane: ["a", "b", "c"] }]);
    expect(p.base).toBeNull();
    p.undo();
    expect(p.state.lane).toEqual(["a", "b", "c"]);
  });
  it("Escape or a drop back on its own place: the state as before, no undo step, no drag left", () => {
    const p = page(["a", "b", "c"]);
    p.edit(["b", "a", "c"], false);
    expect(p.cancel()).toBe(true);
    expect(p.state.lane).toEqual(["a", "b", "c"]);
    expect(p.past).toEqual([]);
    expect(p.base).toBeNull();
  });
  it("a guide render starting mid-drag puts the lane back; the next edit is its own undo step, not merged with the drag", () => {
    const p = page(["a", "b", "c"]);
    p.edit(["b", "a", "c"], false);
    p.cancel();   // the page about to go busy ends the drag
    p.edit(["a", "b", "x"], true);
    expect(p.past).toEqual([{ lane: ["a", "b", "c"] }]);
    p.undo();
    expect(p.state.lane).toEqual(["a", "b", "c"]);
  });
  it("cancel with no drag in progress changes nothing", () => {
    const p = page(["a"]);
    p.edit(["b"], true);
    expect(p.cancel()).toBe(false);
    expect(p.state.lane).toEqual(["b"]);
    expect(p.past).toEqual([{ lane: ["a"] }]);
  });
  it("the drag's base is a copy: later changes to the state object never reach the undo step", () => {
    const p = page(["a", "b"]);
    const before = p.state;
    p.edit(["b", "a"], false);
    before.lane.push("mutated");
    p.cancel();
    expect(p.state.lane).toEqual(["a", "b"]);
  });
});
