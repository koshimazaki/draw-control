import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE, applyMotionCommand, flatDrive, frameAt, gaitSpeedFor, lockedMoveBeat, pulseBeat, stationProgress, travelStations, validateRecipe,
  type AudioDrive, type BandAnalysis, type Recipe,
} from "../src";

// 120 BPM, first beat at 0: beat b is frame 12·b. Kicks at beats 5, 7.5 and 10.
const bands: BandAnalysis = { hopSeconds: 0.01, low: [5, 7.5, 10].map(b => ({ seconds: b / 2, strength: 1 })), mid: [], high: [], peaks: [] };
const drive: AudioDrive = { ...flatDrive(24, 600, 0.6), source: "audio", bands };
const line = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 8, z: 0 }];

const glide = (figure: Recipe["character"]["kind"], extra: Record<string, unknown> = {}): Recipe => applyMotionCommand(
  validateRecipe({ ...structuredClone(DEFAULT_RECIPE), durationBeats: 16, character: { ...DEFAULT_RECIPE.character, kind: figure } }),
  { type: "setRootPath", points: line, fromBeat: 4, toBeat: 12, gait: "glide", ...extra },
);
const rootX = (r: Recipe, beat: number, d: AudioDrive = drive) => frameAt(r, Math.round(beat * 12), d).root.x;

describe("time warps", () => {
  it("stations: k/(N+1) on each hit, holds after it, identity at the edges, steady at strength 0", () => {
    const hits = [5, 7.5, 10];
    hits.forEach((h, k) => expect(stationProgress(h, 4, 12, hits, 1)).toBeCloseTo((k + 1) / 4, 9));
    expect(stationProgress(7.6, 4, 12, hits, 1)).toBeCloseTo(0.5, 9);
    expect(stationProgress(4, 4, 12, hits, 1)).toBe(0);
    expect(stationProgress(12, 4, 12, hits, 1)).toBe(1);
    expect(stationProgress(6.3, 4, 12, hits, 0)).toBeCloseTo((6.3 - 4) / 8, 12);
  });
  it("pulse: every hit and both edges keep their beat; monotonic", () => {
    const hits = [5, 7.5, 10];
    for (const b of [4, ...hits, 12]) expect(pulseBeat(b, 4, 12, hits, 1)).toBeCloseTo(b, 9);
    let last = -Infinity;
    for (let b = 4; b <= 12; b += 0.01) { const w = pulseBeat(b, 4, 12, hits, 1); expect(w).toBeGreaterThanOrEqual(last - 1e-9); last = w; }
  });
});

describe("glide travel", () => {
  for (const kind of ["mannequin", "stick", "blob"] as const) it(`slides the ${kind} along the path with no gait block, facing where it faced`, () => {
    const r = glide(kind);
    expect(r.moves.some(m => m.id.endsWith("-path"))).toBe(false);
    expect(rootX(r, 12)).toBeCloseTo(8, 2);
    expect(frameAt(r, 8 * 12).root.yawRadians).toBeCloseTo(0, 6);
  });
  it("rises where the path carries a height", () => {
    const r = applyMotionCommand(validateRecipe({ ...structuredClone(DEFAULT_RECIPE), durationBeats: 16 }),
      { type: "setRootPath", points: [{ x: 0, z: 0, y: 0 }, { x: 2, z: 0, y: 1 }, { x: 4, z: 0, y: 2 }], fromBeat: 0, toBeat: 8, gait: "glide" });
    expect(frameAt(r, 8 * 12).root.y).toBeCloseTo(2, 2);
    expect(frameAt(r, 0).root.y).toBeCloseTo(0, 6);
  });
});

describe("beat-locked travel", () => {
  const locked = glide("mannequin", { lock: "kick", strength: 1 });
  it("stations land within one frame of the kicks, evenly spaced", () => {
    expect(travelStations(locked, drive)).toEqual([5, 7.5, 10]);
    [5, 7.5, 10].forEach((b, k) => expect(rootX(locked, b)).toBeCloseTo(8 * (k + 1) / 4, 1));
    // Within a frame of the hit the figure is already (or still) at the station.
    expect(Math.abs(rootX(locked, 7.5 + 1 / 12) - rootX(locked, 7.5))).toBeLessThan(0.01);
  });
  it("leaves the start and end where they were drawn", () => {
    const plain = glide("mannequin");
    for (const b of [0, 4, 12, 15]) expect(rootX(locked, b)).toBeCloseTo(rootX(plain, b), 9);
  });
  it("strength 0 is exactly the steady travel; the same input gives the same frames", () => {
    const zero = glide("mannequin", { lock: "kick", strength: 0 }), plain = glide("mannequin");
    for (let n = 0; n < 200; n += 7) expect(frameAt(zero, n, drive).root).toEqual(frameAt(plain, n, drive).root);
    expect(frameAt(locked, 90, drive)).toEqual(frameAt(locked, 90, drive));
  });
});

describe("beat-locked clip speed", () => {
  const r0 = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), durationBeats: 16, moves: [DEFAULT_RECIPE.moves[0]] });
  it("keeps every hit and the block's edges; strength 0 changes nothing", () => {
    const r = applyMotionCommand(r0, { type: "setMoveFields", moveId: r0.moves[0].id, lock: "kick", strength: 0.8 });
    for (const b of [5, 7.5, 10]) expect(lockedMoveBeat(r, 0, b, bands)).toBeCloseTo(b, 9);
    expect(lockedMoveBeat(r, 0, 6, bands)).not.toBeCloseTo(6, 3);
    const zero = applyMotionCommand(r0, { type: "setMoveFields", moveId: r0.moves[0].id, lock: "kick", strength: 0 });
    for (let n = 0; n < 190; n += 5) expect(frameAt(zero, n, drive).pose).toEqual(frameAt(r0, n, drive).pose);
  });
  it("lock off clears it", () => {
    const r = applyMotionCommand(r0, { type: "setMoveFields", moveId: r0.moves[0].id, lock: "beat" });
    expect(applyMotionCommand(r, { type: "setMoveFields", moveId: r0.moves[0].id, lock: "off" }).moves[0].lock).toBeUndefined();
  });
});

describe("gait speed follows the path", () => {
  it("a rigged walk plays at the speed whose steps cover the path's speed", () => {
    expect(gaitSpeedFor("Walk_Loop", 0, 120)).toBeUndefined();
    const fast = gaitSpeedFor("Walk_Loop", 2.8, 120)!, slow = gaitSpeedFor("Walk_Loop", 1.4, 120)!;
    expect(fast / slow).toBeCloseTo(2, 2);
    expect(gaitSpeedFor("walk", 1.4, 120)).toBeUndefined();   // procedural: no authored travel speed
  });
});
