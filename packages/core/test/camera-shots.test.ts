import { describe, expect, it } from "vitest";
import {
  CAMERA_MODES, DEFAULT_RECIPE, SHOT_PRESETS, applyMotionCommand, flatDrive, planCamera, validateRecipe,
  type AudioDrive, type BandAnalysis, type CameraConfig, type CameraSegment, type Recipe,
} from "../src";

// 120 BPM, first beat at 0: beat b is frame 12·b exactly.
const at = (beat: number) => Math.round(beat * 12);
const rig = (segments: CameraSegment[], over: Partial<CameraConfig> = {}): Recipe => validateRecipe({
  ...structuredClone(DEFAULT_RECIPE), durationBeats: 16,
  camera: { segments, intensity: 1, orbitDegreesPerBeat: 8, distance: 4.4, height: 1.15, fov: 38, startYaw: 0, ...over },
});
/** Snares at beats 1.5, 2.5 and 3.25 (seconds = beat / 2). */
const bands: BandAnalysis = { hopSeconds: 0.01, low: [], mid: [1.5, 2.5, 3.25].map(b => ({ seconds: b / 2, strength: 1 })), high: [], peaks: [] };
const drive: AudioDrive = { ...flatDrive(24, 400, 0.7), source: "audio", bands };
const yawAt = (r: Recipe, beat: number, d?: AudioDrive) => planCamera(r, d).channels.yaw[at(beat)];
const dist = (p: { position: number[]; target: number[] }) => Math.hypot(p.position[0] - p.target[0], p.position[2] - p.target[2]);

describe("shots", () => {
  it("validates the shot and refuses an unknown one with the list", () => {
    expect(rig([{ fromBeat: 0, toBeat: 16, modes: ["static"], shot: "close" }]).camera!.segments[0].shot).toBe("close");
    expect(() => rig([{ fromBeat: 0, toBeat: 16, modes: ["static"], shot: "huge" as never }])).toThrow(/wide, medium, close, low, top/);
  });
  it("reaches the preset, eased in (no jump) unless the range asks for a cut", () => {
    const segs: CameraSegment[] = [{ fromBeat: 0, toBeat: 8, modes: ["static"] }, { fromBeat: 8, toBeat: 16, modes: ["static"], shot: "close" }];
    const eased = planCamera(rig(segs, { intensity: 0 })), cut = planCamera(rig([segs[0], { ...segs[1], cut: true }], { intensity: 0 }));
    expect(dist(eased.samples[at(12)])).toBeCloseTo(SHOT_PRESETS.close.distance, 3);
    expect(eased.samples[at(12)].fov).toBeCloseTo(SHOT_PRESETS.close.fov, 6);
    let worst = 0;
    for (let n = at(7); n < at(10); n++) worst = Math.max(worst, Math.abs(dist(eased.samples[n + 1]) - dist(eased.samples[n])));
    expect(worst).toBeLessThan(0.3);   // 1.8 m eased over one beat (12 frames)
    expect(Math.abs(dist(cut.samples[at(8)]) - dist(cut.samples[at(8) - 1]))).toBeGreaterThan(1.5);
  });
  it("a recipe without shots or amounts plans exactly as before (rig numbers throughout)", () => {
    const r = rig([{ fromBeat: 0, toBeat: 16, modes: ["orbit"] }]);
    const p = planCamera(r);
    expect(p.programmed.distance.every(d => d === 4.4)).toBe(true);
    expect(p.samples.every(s => s.fov === 38)).toBe(true);
  });
});

describe("camera moves with an amount", () => {
  it("orbit 360 over 4 beats ends exactly 360° on, at full intensity", () => {
    const r = rig([{ fromBeat: 0, toBeat: 4, modes: ["orbit"], amount: 360 }, { fromBeat: 4, toBeat: 16, modes: ["static"] }]);
    expect(yawAt(r, 4) - yawAt(r, 0)).toBeCloseTo(2 * Math.PI, 9);
    const back = rig([{ fromBeat: 0, toBeat: 4, modes: ["orbit"], amount: -90 }]);
    expect(yawAt(back, 4) - yawAt(back, 0)).toBeCloseTo(-Math.PI / 2, 9);
  });
  it("dolly in 2 m, pull out to 6 m, rise 0.3 m to 2 m and truck 1.5 m land on their values", () => {
    const r = rig([
      { fromBeat: 0, toBeat: 4, modes: ["pushIn"], amount: 2 }, { fromBeat: 4, toBeat: 8, modes: ["pullOut"], to: 6 },
      { fromBeat: 8, toBeat: 12, modes: ["rise"], from: 0.3, to: 2, cut: true }, { fromBeat: 12, toBeat: 16, modes: ["truck"], amount: 1.5 },
    ]);
    const p = planCamera(r), ch = p.channels;
    expect(ch.distance[at(4)]).toBeCloseTo(2.4, 9);
    expect(ch.distance[at(8)]).toBeCloseTo(6, 9);
    expect(ch.height[at(8)]).toBeCloseTo(0.3, 9);
    expect(ch.height[at(12)]).toBeCloseTo(2, 9);
    const a = p.samples[at(12)], b = p.samples[at(16)];
    expect(Math.hypot(b.target[0] - a.target[0], b.target[2] - a.target[2])).toBeCloseTo(1.5, 6);
  });
  it("refuses an amount that has no move to belong to, or two moves to choose from", () => {
    expect(() => rig([{ fromBeat: 0, toBeat: 4, modes: ["chase"], amount: 2 }])).toThrow(/exactly one/);
    expect(() => rig([{ fromBeat: 0, toBeat: 4, modes: ["orbit", "pushIn"], amount: 2 }])).toThrow(/exactly one/);
    expect(() => rig([{ fromBeat: 0, toBeat: 4, modes: ["truck"] }])).toThrow(/truck needs an amount/);
  });
  it("is deterministic", () => {
    const r = rig([{ fromBeat: 0, toBeat: 8, modes: ["orbit"], amount: 180, lock: "snare" }]);
    expect(planCamera(r, drive).samples).toEqual(planCamera(r, drive).samples);
  });
});

describe("beat-locked camera", () => {
  const orbit = (lock: Partial<CameraSegment>) => rig([{ fromBeat: 0, toBeat: 4, modes: ["orbit"], amount: 360, ...lock }, { fromBeat: 4, toBeat: 16, modes: ["static"] }]);
  it("an orbit with an amount still ends on its exact angle under a lock", () => {
    const r = orbit({ lock: "snare", strength: 1 });
    expect(yawAt(r, 4, drive) - yawAt(r, 0, drive)).toBeCloseTo(2 * Math.PI, 9);
  });
  it("arrives at evenly spaced stations on the locked hits, then holds", () => {
    const r = orbit({ lock: "snare", strength: 1 }), p = planCamera(r, drive);
    const turned = (beat: number) => (p.channels.yaw[at(beat)] - p.channels.yaw[0]) / (2 * Math.PI);
    expect(turned(1.5)).toBeCloseTo(0.25, 2);
    expect(turned(2.5)).toBeCloseTo(0.5, 2);
    expect(Math.abs(turned(2.5 + 1 / 12) - turned(2.5))).toBeLessThan(1e-3);   // the hold
  });
  it("strength 0 equals the unlocked move exactly", () => {
    expect(planCamera(orbit({ lock: "snare", strength: 0 }), drive).samples).toEqual(planCamera(orbit({}), drive).samples);
  });
  it("punch moves in on each hit by the punch depth and back", () => {
    const base = planCamera(orbit({}), drive), punch = planCamera(orbit({ lock: "snare", onHit: "punch", punch: 0.5 }), drive);
    expect(base.channels.distance[at(2.5)] - punch.channels.distance[at(2.5)]).toBeCloseTo(0.5, 6);
    expect(punch.channels.distance[at(2.2)]).toBeCloseTo(base.channels.distance[at(2.2)], 6);
  });
});

describe("camera block commands", () => {
  const r = rig([{ fromBeat: 0, toBeat: 8, modes: ["chase"] }, { fromBeat: 8, toBeat: 16, modes: ["orbit"] }]);
  it("setCameraSegment sets and clears fields", () => {
    const a = applyMotionCommand(r, { type: "setCameraSegment", index: 1, shot: "wide", amount: 360, lock: "kick", strength: 0.5 });
    expect(a.camera!.segments[1]).toMatchObject({ shot: "wide", amount: 360, lock: "kick", strength: 0.5 });
    const b = applyMotionCommand(a, { type: "setCameraSegment", index: 1, shot: null, lock: "off" });
    expect(b.camera!.segments[1]).toEqual({ fromBeat: 8, toBeat: 16, modes: ["orbit"], amount: 360 });
  });
  it("a shared edge rolls the cut; a moved block trims its neighbour", () => {
    const a = applyMotionCommand(r, { type: "resizeCameraSegment", index: 0, edge: "end", toBeat: 6 });
    expect(a.camera!.segments.map(s => [s.fromBeat, s.toBeat])).toEqual([[0, 6], [6, 16]]);
    const b = applyMotionCommand(a, { type: "moveCameraSegment", index: 0, toBeat: 2 });
    expect(b.camera!.segments.map(s => [s.fromBeat, s.toBeat])).toEqual([[2, 8], [8, 16]]);
  });
});

describe("schema mode list", () => {
  it("every camera mode is a valid range on its own (truck with an amount)", () => {
    for (const m of CAMERA_MODES) {
      const seg: CameraSegment = { fromBeat: 0, toBeat: 16, modes: [m], ...(m === "truck" ? { amount: 1 } : {}) };
      const base = rig([{ fromBeat: 0, toBeat: 16, modes: ["static"] }]);
      expect(() => validateRecipe({ ...base, camera: { ...base.camera!, segments: [seg], ...(m === "path" ? { path: [{ x: 0, y: 1, z: 3 }, { x: 3, y: 1, z: 0 }] } : {}) } })).not.toThrow();
    }
  });
});
