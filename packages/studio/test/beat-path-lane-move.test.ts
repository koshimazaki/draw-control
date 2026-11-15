/** Moving a lane block to another place (lane-cuts.ts): lengths and words kept, the lane still tiles. */
import { describe, expect, it } from "vitest";
import { dropIndex, moveBlock, movedIndex } from "../src/beat-path/lane-cuts";
import { BLANK_STATE, fromScript, toScript, type Block, type CameraWord, type CharacterWord } from "../src/beat-path/script";

const cam: Block<CameraWord>[] = [
  { from: 0, to: 4, word: "orbit" }, { from: 4, to: 6.5, word: "top" },
  { from: 6.5, to: 12, word: "side", follow: { distance: 5, height: 1.5 } }, { from: 12, to: 17, word: "push", phrase: "dolly in 2m fast" },
];
const shape = (lane: Block<string>[]) => lane.map(b => [b.word, b.to - b.from]);
/** Starts at 0, ends where it ended, every block touching the next, none shorter than nothing. */
function tiles(lane: Block<string>[], end: number) {
  expect(lane[0].from).toBe(0);
  expect(lane.at(-1)!.to).toBe(end);
  for (let k = 1; k < lane.length; k++) expect(lane[k].from).toBe(lane[k - 1].to);
  for (const b of lane) expect(b.to).toBeGreaterThan(b.from);
}

describe("Moving a lane block", () => {
  it("first to last: the others slide forward, each keeping its length", () => {
    const out = moveBlock(cam, 0, 3)!;
    expect(shape(out)).toEqual([["top", 2.5], ["side", 5.5], ["push", 5], ["orbit", 4]]);
    tiles(out, 17);
  });
  it("last to first", () => {
    const out = moveBlock(cam, 3, 0)!;
    expect(shape(out)).toEqual([["push", 5], ["orbit", 4], ["top", 2.5], ["side", 5.5]]);
    tiles(out, 17);
  });
  it("one place each way", () => {
    expect(shape(moveBlock(cam, 1, 2)!)).toEqual([["orbit", 4], ["side", 5.5], ["top", 2.5], ["push", 5]]);
    expect(shape(moveBlock(cam, 2, 1)!)).toEqual([["orbit", 4], ["side", 5.5], ["top", 2.5], ["push", 5]]);
    tiles(moveBlock(cam, 2, 1)!, 17);
  });
  it("onto its own place, off the lane, or on a one-block lane: no change (null, so no undo step)", () => {
    for (let i = 0; i < cam.length; i++) expect(moveBlock(cam, i, i)).toBeNull();
    expect(moveBlock(cam, 0, 4)).toBeNull();
    expect(moveBlock(cam, 0, -1)).toBeNull();
    expect(moveBlock([{ from: 0, to: 17, word: "behind" }], 0, 1)).toBeNull();
  });
  it("keeps every block's word and settings (phrase, follow offset), and the total beats", () => {
    const out = moveBlock(cam, 3, 1)!;
    expect(out[1]).toEqual({ from: 4, to: 9, word: "push", phrase: "dolly in 2m fast" });
    expect(out.find(b => b.word === "side")!.follow).toEqual({ distance: 5, height: 1.5 });
    expect(out.reduce((t, b) => t + b.to - b.from, 0)).toBe(17);
    expect(cam[0]).toEqual({ from: 0, to: 4, word: "orbit" });   // the input is untouched
  });
  it("a two-block lane swaps", () => {
    const two: Block<CharacterWord>[] = [{ from: 0, to: 5, word: "glide" }, { from: 5, to: 17, word: "freeze" }];
    expect(moveBlock(two, 0, 1)).toEqual([{ from: 0, to: 12, word: "freeze" }, { from: 12, to: 17, word: "glide" }]);
    expect(moveBlock(two, 1, 0)).toEqual([{ from: 0, to: 12, word: "freeze" }, { from: 12, to: 17, word: "glide" }]);
  });
  it("fractional lengths stay on the grid (no float creep) and the last block ends exactly at the end", () => {
    const odd: Block<CameraWord>[] = [{ from: 0, to: 0.1, word: "top" }, { from: 0.1, to: 0.3, word: "orbit" }, { from: 0.3, to: 7.7, word: "push" }];
    const out = moveBlock(odd, 0, 2)!;
    expect(out.map(b => [b.from, b.to])).toEqual([[0, 0.2], [0.2, 7.6], [7.6, 7.7]]);
  });
  it("keeps the lane's rules: one Glide, and the drawn path prints on the first My path block in the new order", () => {
    const state = { ...BLANK_STATE, camLock: { ...BLANK_STATE.camLock, lock: "off" as const }, camera: [{ x: 0, z: 0 }, { x: 4, z: 2 }], subject: [{ x: 0, z: 0 }, { x: 3, z: 0 }],
      character: [{ from: 0, to: 8, word: "glide" as const }, { from: 8, to: 17, word: "hover" as const }],
      cameraLane: [{ from: 0, to: 6, word: "orbit" as const }, { from: 6, to: 10, word: "path" as const }, { from: 10, to: 17, word: "path" as const }] };
    const moved = { ...state, character: moveBlock(state.character, 0, 1)!, cameraLane: moveBlock(state.cameraLane, 0, 2)! };
    expect(moved.character.filter(b => b.word === "glide")).toHaveLength(1);
    const script = toScript(moved);
    expect(script).toMatch(/beats 0-4 \| action: rest \| camera: path \(0,0\) \(4,2\)/);
    expect(script).toMatch(/beats 4-9 \| action: continue \| camera: path \| shot: -/);   // the second resumes the same path
    expect(script).toMatch(/beats 9-11 \| action: walk on path .* \| camera: continue/);
    expect(script).toMatch(/beats 11-17 \| action: continue \| camera: orbit 90\b/);   // 15° a beat over its own 6 beats
    const back = fromScript(script, BLANK_STATE).state;
    expect(shape(back.cameraLane)).toEqual(shape(moved.cameraLane));
    expect(shape(back.character)).toEqual(shape(moved.character));
  });
});

describe("Where a dragged block lands", () => {
  it("changes places once its leading edge passes a neighbour's middle", () => {
    // Middles: orbit 2, top 5.25, side 9.25, push 14.5. Orbit is 4 beats long, push 5.
    expect(dropIndex(cam, 0, 0)).toBe(0);
    expect(dropIndex(cam, 0, 1)).toBe(0);      // right edge 5: not past top's middle yet
    expect(dropIndex(cam, 0, 1.5)).toBe(1);    // right edge 5.5
    expect(dropIndex(cam, 0, 8)).toBe(2);
    expect(dropIndex(cam, 0, 13)).toBe(3);
    expect(dropIndex(cam, 3, 12)).toBe(3);     // its own place
    expect(dropIndex(cam, 3, 9.5)).toBe(3);    // left edge 9.5: not before side's middle yet
    expect(dropIndex(cam, 3, 9)).toBe(2);
    expect(dropIndex(cam, 3, 0)).toBe(0);      // all the way left: first, however long it is
  });
  it("a selection by index follows the move", () => {
    expect(movedIndex(0, 0, 3)).toBe(3);       // the moved block itself
    expect(movedIndex(2, 0, 3)).toBe(1);       // a block it passed slides back
    expect(movedIndex(1, 3, 0)).toBe(2);       // or forward
    expect(movedIndex(3, 0, 2)).toBe(3);       // one beyond it stays
  });
});
