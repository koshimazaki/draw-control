/**
 * Editing a follow camera: the drag maths (a point on the map to distance and angle, the side
 * flipping across the path), the block's offset in the page's shot script, and undo-friendly
 * plain blocks (a follow with an offset stays a follow word, not a phrase).
 */
import { describe, expect, it } from "vitest";
import { followFromPoint, sideOf } from "../src/beat-path/map-follow";
import { BLANK_STATE, fromScript, setWord, toScript, type BeatPathState } from "../src/beat-path/script";

const A = { x: 0, z: 0, heading: 0 };   // the subject at the origin, facing +Z (its right is -X)

describe("follow drag maths", () => {
  it("behind: in or out is the distance, sideways is the angle", () => {
    expect(followFromPoint("behind", A, { x: 0, z: -7 })).toEqual({ distance: 7 });
    const turned = followFromPoint("behind", A, { x: 5, z: -5 });
    expect(turned.distance).toBeCloseTo(7.1, 1);
    expect(Math.abs(turned.angle!)).toBeCloseTo(45, 0);
  });
  it("side: the subject's left is the rig's own side; across the path is the right (angle 180)", () => {
    expect(followFromPoint("side", A, { x: 6, z: 0 })).toEqual({ distance: 6 });
    expect(sideOf(A, { x: 6, z: 0 })).toBe(-1);
    const right = followFromPoint("side", A, { x: -18, z: 0 });
    expect(right).toEqual({ distance: 18, angle: 180 });
    expect(sideOf(A, { x: -18, z: 0 })).toBe(1);
  });
  it("clamps the distance to 1–30 m and keeps the height", () => {
    expect(followFromPoint("side", A, { x: 0.2, z: 0 }, { height: 3 }).distance).toBe(1);
    expect(followFromPoint("side", A, { x: 80, z: 0 }, { height: 3 })).toMatchObject({ distance: 30, height: 3 });
  });
  it("turns with the subject's heading", () => {
    const east = { x: 0, z: 0, heading: Math.PI / 2 };   // facing +X: the rig's side (heading + 90°) is (sin, cos) = (0, -1), so -Z
    expect(followFromPoint("side", east, { x: 0, z: -9 })).toEqual({ distance: 9 });
  });
});

describe("the follow offset in the page's script", () => {
  const state: BeatPathState = { ...BLANK_STATE, subject: [{ x: -8, z: 0 }, { x: 8, z: 0 }], character: [{ from: 0, to: 17, word: "glide" }],
    cameraLane: [{ from: 0, to: 8, word: "behind", follow: { distance: 9, angle: -20 } }, { from: 8, to: 17, word: "side", follow: { distance: 20, height: 2.5, angle: 180 } }] };
  it("prints and reads back as plain follow blocks", () => {
    const text = toScript(state);
    expect(text).toMatch(/camera: follow behind distance 9m angle -20/);
    expect(text).toMatch(/camera: follow side right distance 20m height 2\.5m/);
    const back = fromScript(text, BLANK_STATE).state;
    expect(back.cameraLane.map(b => [b.word, b.follow, b.phrase])).toEqual([["behind", { distance: 9, angle: -20 }, undefined], ["side", { distance: 20, height: 2.5, angle: 180 }, undefined]]);
  });
  it("a block turned into another word drops its offset; behind ↔ side keeps it", () => {
    expect(setWord(state.cameraLane, 0, "orbit")[0].follow).toBeUndefined();
    expect(setWord(state.cameraLane, 0, "side")[0].follow).toEqual({ distance: 9, angle: -20 });
  });
});
