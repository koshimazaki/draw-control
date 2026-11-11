import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE, analyseBands, applyCommands, applyMotionCommand, blockSpan, commandHelp, defaultRiggedRecipe, frameAt, neutralPose, poseAtBeat,
  snapBeat, validateRecipe, type BandAnalysis,
} from "../src";
import { patternTimes, synthDrums } from "./drum-synth";

const base = () => structuredClone(DEFAULT_RECIPE);   // bounce 0, stepTouch 4, armsUp 8, kick 12, 16 beats, 120 BPM
const bands: BandAnalysis = analyseBands([synthDrums(patternTimes(120, 4, 0), 8.5)], 44100);

describe("blocks on the move track", () => {
  it("dragging the end edge longer plays the move slower, shorter faster", () => {
    const r0 = base();
    const long = applyMotionCommand(r0, { type: "resizeMove", moveId: "bounce-0", edge: "end", toBeat: 6 });
    expect(blockSpan(long, "bounce-0")).toMatchObject({ start: 0, end: 6, length: 6, speed: 0.6667 });
    // The cut rolled: stepTouch starts at 6, keeps its end at 8, and plays twice as fast.
    expect(blockSpan(long, "stepTouch-4")).toMatchObject({ start: 6, end: 8, speed: 2 });
    // Same content, stretched: beat 3 of the long block shows beat 2 of the original.
    const half = applyMotionCommand(r0, { type: "resizeMove", moveId: "bounce-0", edge: "end", toBeat: 7.75 });
    expect(blockSpan(half, "bounce-0").end).toBe(7.75);   // the next block keeps at least a quarter beat
    const lone = validateRecipe({ ...r0, moves: [{ ...r0.moves[0], lengthBeats: 4 }] });
    const eight = applyMotionCommand(lone, { type: "resizeMove", moveId: "bounce-0", edge: "end", toBeat: 8 });
    expect(blockSpan(eight, "bounce-0").speed).toBe(0.5);
    expect(poseAtBeat(eight, 3).pose).toEqual(poseAtBeat(lone, 1.5).pose);
    const short = applyMotionCommand(r0, { type: "resizeMove", moveId: "bounce-0", edge: "end", toBeat: 2 });
    expect(blockSpan(short, "bounce-0")).toMatchObject({ length: 2, speed: 2 });
    expect(poseAtBeat(short, 0.5).pose).toEqual(poseAtBeat(r0, 1).pose);
  });
  it("a shortened block leaves a gap where the figure settles to rest", () => {
    const r = applyMotionCommand(base(), { type: "resizeMove", moveId: "bounce-0", edge: "end", toBeat: 2 });
    expect(poseAtBeat(r, 3.5).pose).toEqual(neutralPose());
    expect(poseAtBeat(r, 1.5).pose).not.toEqual(neutralPose());
  });
  it("the start edge keeps the end and rolls into the block before", () => {
    const r = applyMotionCommand(base(), { type: "resizeMove", moveId: "stepTouch-4", edge: "start", toBeat: 2 });
    expect(blockSpan(r, "stepTouch-4")).toMatchObject({ start: 2, end: 8, length: 6 });
    expect(blockSpan(r, "stepTouch-4").speed).toBeCloseTo(4 / 6, 3);
    expect(blockSpan(r, "bounce-0")).toMatchObject({ end: 2, speed: 2 });
  });
  it("moving a block keeps its length and speed and stays between its neighbours", () => {
    const r = applyMotionCommand(base(), { type: "moveMoveTo", moveId: "stepTouch-4", toBeat: 5 });
    expect(blockSpan(r, "stepTouch-4")).toMatchObject({ start: 5, length: 3 });   // its end meets armsUp at 8
    const far = applyMotionCommand(base(), { type: "moveMoveTo", moveId: "stepTouch-4", toBeat: 20 });
    expect(far.moves[1].atBeat).toBeLessThan(8);
  });
  it("the selected block's fields: start, length, speed, amplitude up to 3", () => {
    const r = applyMotionCommand(base(), { type: "setMoveFields", moveId: "armsUp-8", length: 2, amplitude: 2.5 });
    expect(blockSpan(r, "armsUp-8")).toMatchObject({ length: 2, speed: 2 });
    expect(r.moves[2].phases.every(p => p.amplitude === 2.5)).toBe(true);
    const s = applyMotionCommand(r, { type: "setMoveFields", moveId: "armsUp-8", speed: 1 });
    expect(s.moves[2].speed).toBeUndefined();
    expect(() => applyMotionCommand(base(), { type: "setMoveFields", moveId: "nope", speed: 2 })).toThrow(/no move/);
  });
});

describe("snapping and placing on kicks and snares", () => {
  const kicks = [0, 2, 4, 6, 6.5, 8, 10, 12, 14, 14.5];   // 120 BPM, offset 0: one beat = 0.5 s
  it("snaps to beats, kicks and snares", () => {
    const r = base();
    expect(snapBeat(r, 1.3, "beat")).toBe(1);
    expect(snapBeat(r, 1.3, "halfBeat")).toBe(1.5);
    expect(Math.abs(snapBeat(r, 6.4, "kick", bands) - 6.5)).toBeLessThan(0.05);
    expect(Math.abs(snapBeat(r, 2.4, "snare", bands) - 3)).toBeLessThan(0.05);
    expect(snapBeat(r, 1.2345, "free")).toBe(1.235);
  });
  it("starts a move on the nearest kick, or the Nth snare", () => {
    const r = applyMotionCommand(base(), { type: "moveMoveTo", moveId: "stepTouch-4", toBeat: 5.5 });
    const k = applyMotionCommand(r, { type: "snapMoveTo", moveId: "stepTouch-4", target: "kick" }, { bands });
    expect(Math.abs(k.moves[1].atBeat - 6)).toBeLessThan(0.05);
    const s = applyMotionCommand(base(), { type: "snapMoveTo", moveId: "kick-12", target: "snare", index: 5 }, { bands });
    expect(Math.abs(s.moves[3].atBeat - 11)).toBeLessThan(0.05);
    expect(() => applyMotionCommand(base(), { type: "snapMoveTo", moveId: "kick-12", target: "snare" })).toThrow(/no snare onsets/);
    expect(kicks.length).toBe(bands.low.length);
  });
  it("puts a jump (an accent) on every second kick as hit markers", () => {
    const r = applyMotionCommand(defaultRiggedRecipe(), { type: "placeOnEvery", move: "jump", target: "kick", every: 2, replace: true }, { bands });
    const at = r.reactive!.markers!.map(m => m.seconds);
    expect(at.length).toBe(5);
    at.forEach((t, i) => expect(Math.abs(t - kicks[i * 2] * 0.5)).toBeLessThan(0.025));
    expect(r.reactive!.markers!.every(m => m.accent === "jump")).toBe(true);
    // The jump lands on the kick: the figure is lifted just before it and down on it.
    const hitFrame = Math.round(at[1] * 24);
    expect(frameAt(r, hitFrame - 3).root.y).toBeGreaterThan(frameAt(r, hitFrame).root.y);
  });
  it("puts a loop move on every snare as blocks, each its own length", () => {
    const r = applyMotionCommand(defaultRiggedRecipe(), { type: "placeOnEvery", move: "Dance_Loop", target: "snare", lengthBeats: 1, replace: true }, { bands });
    const dances = r.moves.filter(m => m.clip === "Dance_Loop");
    expect(dances.length).toBe(8);
    expect(dances.every(m => m.lengthBeats === 1)).toBe(true);
    expect(() => applyMotionCommand(r, { type: "placeOnEvery", move: "moonwalk", target: "snare" }, { bands })).toThrow(/unknown move/);
  });
});

describe("one entry point for every edit", () => {
  it("sets any field by path, and refuses what the validator refuses", () => {
    const r = applyCommands(base(), [
      { type: "set", path: "beatGrid.bpm", value: 98 },
      { type: "set", path: "moves#kick-12.speed", value: 2 },
      { type: "set", path: "moves[0].phases[0].amplitude", value: 2.8 },
    ]);
    expect(r.beatGrid.bpm).toBe(98);
    expect(r.moves[3].speed).toBe(2);
    expect(r.moves[0].phases[0].amplitude).toBe(2.8);
    expect(() => applyMotionCommand(r, { type: "set", path: "beatGrid.bpm", value: 999 })).toThrow(/bpm/);
    expect(() => applyMotionCommand(r, { type: "set", path: "__proto__.x", value: 1 })).toThrow(/forbidden|bad path/);
    expect(() => applyCommands(r, [{ type: "set", path: "moves#nope.speed", value: 1 }])).toThrow(/command 0/);
  });
  it("lists every command with a help line", () => {
    const help = commandHelp();
    for (const k of ["insertMove", "set", "resizeMove", "placeOnEvery", "snapMoveTo", "addMarker", "paintEnergy"]) expect(help[k]).toBeTruthy();
  });
  it("a recipe with off-grid starts, lengths and speeds round-trips", () => {
    const r = applyMotionCommand(base(), { type: "resizeMove", moveId: "bounce-0", edge: "end", toBeat: 3.37 });
    expect(validateRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});
