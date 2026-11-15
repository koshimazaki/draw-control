/**
 * The lane's moves against a page that may refuse them (a guide rendering), without a browser:
 * the window is an EventTarget, the lane's root a stub, render a no-op. A refused commit is
 * never taken for success, the selection follows a move before the page rebuilds, and a second
 * press ends the drag before it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { LaneView, type LaneHost } from "../src/beat-path/lanes";
import { movedIndex } from "../src/beat-path/lane-cuts";
import type { Block } from "../src/beat-path/script";

type W = "a" | "b" | "c";
const LANE: Block<W>[] = [{ from: 0, to: 4, word: "a" }, { from: 4, to: 8, word: "b" }, { from: 8, to: 12, word: "c" }];

/** A page in miniature: its lane, its selection (an index into the lane), and whether it refuses edits. */
function page(opts: { refuse?: "all" | "final" } = {}) {
  const log: string[] = [];
  const p = {
    lane: LANE.map(b => ({ ...b })), selection: 0, refuse: opts.refuse, log,
    /** The selection the page saw when each commit rebuilt it. */
    seenAtCommit: [] as number[],
  };
  const host: LaneHost<W> = {
    blocks: () => p.lane, total: () => 12, label: w => w, snap: b => b,
    commit: (blocks, final) => {
      if (p.refuse === "all" || (p.refuse === "final" && final)) { log.push(`refused${final ? " final" : ""}`); return false; }
      p.lane = blocks; p.seenAtCommit.push(p.selection); log.push(`commit${final ? " final" : ""}`);
      return true;
    },
    cancel: () => { p.lane = LANE.map(b => ({ ...b })); log.push("cancel"); },
    open: () => {},
    moved: (from, to) => { p.selection = movedIndex(p.selection, from, to); },
  };
  const root = { getBoundingClientRect: () => ({ left: 0, width: 120 }), querySelector: () => null, children: [] };
  const view = new LaneView<W>(root as unknown as HTMLElement, host);
  view.render = () => {};
  return { p, view };
}

const pointer = (type: string, clientX: number, pointerId = 1) => Object.assign(new Event(type), { clientX, pointerId, button: 0 });
const press = (view: LaneView<W>, i: number, clientX: number, pointerId = 1) =>
  (view as unknown as { press(e: unknown, i: number): void }).press({ ...pointer("pointerdown", clientX, pointerId), button: 0, target: { classList: { contains: () => false } } }, i);
const send = (e: Event) => (globalThis as unknown as { window: EventTarget }).window.dispatchEvent(e);

/** A window for the lane's listeners. Node's EventTarget has no capture phase and does not match a listener added with `true` on removal: the flag is dropped. */
class Win extends EventTarget {
  addEventListener(type: string, fn: EventListenerOrEventListenerObject | null) { super.addEventListener(type, fn); }
  removeEventListener(type: string, fn: EventListenerOrEventListenerObject | null) { super.removeEventListener(type, fn); }
}
// A fresh window per test (kept afterwards: the click a drag eats is released on a timer).
beforeEach(() => { (globalThis as unknown as { window: EventTarget }).window = new Win(); });

describe("Lane moves on a page that may refuse them", () => {
  it("Alt+Left/Right: the selection follows the block before the page rebuilds", () => {
    const { p, view } = page();
    expect(view.place(0, 1)).toBe(true);
    expect(p.lane.map(b => b.word)).toEqual(["b", "a", "c"]);
    expect(p.seenAtCommit).toEqual([1]);   // the rebuild already read the moved selection
    expect(p.selection).toBe(1);
  });
  it("Alt+Left/Right refused: false, the lane and the selection as they were", () => {
    const { p, view } = page({ refuse: "all" });
    expect(view.place(0, 1)).toBe(false);
    expect(p.lane.map(b => b.word)).toEqual(["a", "b", "c"]);
    expect(p.selection).toBe(0);
  });
  it("a body drag: the selection moves first, the move is one final commit", () => {
    const { p, view } = page();
    press(view, 0, 10);
    send(pointer("pointermove", 70));   // well past the next block
    send(pointer("pointerup", 70));
    expect(p.log.at(-1)).toBe("commit final");
    expect(p.seenAtCommit.at(-1)).toBe(p.selection);
    expect(p.lane[p.selection].word).toBe("a");
  });
  it("a body drag refused while held: the lane is put back and nothing follows it", () => {
    const { p, view } = page({ refuse: "all" });
    press(view, 0, 10);
    send(pointer("pointermove", 70));
    expect(p.log).toEqual(["refused", "cancel"]);
    expect(view.dragging).toBe(false);
    send(pointer("pointerup", 70));   // the drag's listeners are gone
    expect(p.log).toEqual(["refused", "cancel"]);
    expect(p.selection).toBe(0);
  });
  it("a body drag whose final commit is refused: put back, the selection where it was", () => {
    const { p, view } = page({ refuse: "final" });
    press(view, 0, 10);
    send(pointer("pointermove", 70));
    send(pointer("pointerup", 70));
    expect(p.log.slice(-2)).toEqual(["refused final", "cancel"]);
    expect(p.selection).toBe(0);
  });
  it("a second press ends the drag already held (put back), and only the new one listens", () => {
    const { p, view } = page();
    press(view, 0, 10, 1);
    send(pointer("pointermove", 70, 1));
    expect(view.dragging).toBe(true);
    press(view, 2, 110, 2);
    expect(p.log.at(-1)).toBe("cancel");
    const before = p.log.length;
    send(pointer("pointerup", 70, 1));   // the first pointer no longer reaches anything
    expect(p.log.length).toBe(before);
    expect(view.dragging).toBe(true);
    send(pointer("pointerup", 110, 2));
    expect(view.dragging).toBe(false);
  });
  it("abort says whether it ended a drag (undo then stops there)", () => {
    const { view } = page();
    expect(view.abort()).toBe(false);
    press(view, 0, 10);
    send(pointer("pointermove", 70));
    expect(view.abort()).toBe(true);
    expect(view.abort()).toBe(false);
  });
});
