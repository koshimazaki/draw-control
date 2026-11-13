/**
 * The page's slicer state (round 9): the window's start (snap on and off, clamped to the track),
 * the slice and own markers in the page's script, a hat lock, and a 10 s clip.
 */
import { describe, expect, it } from "vitest";
import { BLANK_STATE, fromScript, toScript, type BeatPathState } from "../src/beat-path/script";
import { sliceFor, sliceable } from "../src/beat-path/page-slice";
import { beatPathRecipe } from "../src/beat-path/recipe-map";

const info = { name: "long.wav", licence: "test", bpm: 120, offsetSeconds: 0.1, lengthSeconds: 180.6 };

describe("the window", () => {
  it("snaps to the beat with Snap on, to the frame's time with it off, and stays in the track", () => {
    expect(sliceFor(61.37, info, 8, true)).toBeCloseTo(61.6, 6);
    expect(sliceFor(61.37, info, 8, false)).toBeCloseTo(61.37, 6);
    expect(sliceFor(1000, info, 10, true) + 10).toBeLessThanOrEqual(180.6);
    expect(sliceable(info, 8)).toBe(true);
    expect(sliceable({ ...info, lengthSeconds: 8.3 }, 8)).toBe(false);
  });
});

describe("slice, markers, hat lock and 10 s in the page's script", () => {
  const state: BeatPathState = { ...BLANK_STATE, clip: 10, slice: 61.6, markers: [{ band: "low", seconds: 62.35 }, { band: "high", seconds: 63 }],
    charLock: { lock: "hat", strength: 1 }, subject: [{ x: -5, z: 0 }, { x: 5, z: 0 }], character: [{ from: 0, to: 21, word: "glide" }], cameraLane: [{ from: 0, to: 21, word: "behind" }] };
  it("prints and reads back", () => {
    const text = toScript(state);
    expect(text).toMatch(/^slice: 61\.6s$/m);
    expect(text).toMatch(/^markers: kick 62\.35 hat 63$/m);
    expect(text).toMatch(/lock hat 1/);
    const back = fromScript(text, BLANK_STATE).state;
    expect([back.slice, back.markers, back.charLock.lock, back.clip]).toEqual([61.6, state.markers, "hat", 10]);
  });
  it("makes a recipe whose beat 0 is the slice, 21 beats long (10 s at 120 BPM)", () => {
    const r = beatPathRecipe(state, info);
    expect(r.beatGrid.offsetSeconds).toBe(61.6);
    expect(r.durationBeats).toBe(21);
    expect(r.addedHits?.length).toBe(2);
  });
});
