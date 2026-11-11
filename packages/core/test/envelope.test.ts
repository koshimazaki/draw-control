import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE, analyseBands, applyMotionCommand, buildDrive, defaultRiggedRecipe, envelopeAt, envelopeValues, frameAt, poseDistance, simplifyEnvelope,
  validateRecipe, type Recipe,
} from "../src/internal";
import { patternTimes, synthDrums } from "./drum-synth";

const dance = (r: Recipe) => r.moves.find(m => m.clip === "Dance_Loop")!.id;

describe("the amplitude control", () => {
  it("move amplitude now reaches the rigged mannequin (it was ignored: only the step lane and energy set its amplitude)", () => {
    const r = defaultRiggedRecipe();
    const f = 5 * 12;   // beat 5, inside Dance_Loop
    const before = frameAt(r, f).amplitude!;
    const big = applyMotionCommand(r, { type: "setAmplitude", moveId: dance(r), value: 2 });
    expect(frameAt(big, f).amplitude).toBeCloseTo(Math.min(3, before * 2), 5);
    const off = applyMotionCommand(r, { type: "setAmplitude", moveId: dance(r), value: 0 });
    expect(frameAt(off, f).amplitude).toBe(0);
  });
  it("goes up to 3 and no further", () => {
    const r = applyMotionCommand(structuredClone(DEFAULT_RECIPE), { type: "setAmplitude", moveId: "bounce-0", value: 3 });
    expect(r.moves[0].phases[0].amplitude).toBe(3);
    expect(() => applyMotionCommand(r, { type: "setAmplitude", moveId: "bounce-0", value: 3.5 })).toThrow(/0–3/);
  });
});

describe("amplitude envelope", () => {
  it("changes frameAt on the procedural mannequin: 0 rests, 2 doubles the pose", () => {
    const r = structuredClone(DEFAULT_RECIPE);
    const n = 30, base = frameAt(r, n).pose;
    const zero = applyMotionCommand(r, { type: "setEnvelopePoints", points: [[0, 0]] });
    expect(poseDistance(frameAt(zero, n).pose, { rootY: 0, joints: Object.fromEntries(Object.keys(base.joints).map(k => [k, [0, 0, 0]])) } as never)).toBeLessThan(1e-9);
    const two = applyMotionCommand(r, { type: "paintEnvelope", fromFrame: 0, toFrame: 100, from: 2, to: 2 });
    expect(frameAt(two, n).pose.joints.leftKnee[0]).toBeCloseTo(base.joints.leftKnee[0] * 2, 6);
    expect(frameAt(two, n).envelope).toBe(2);
  });
  it("changes frameAt on the rigged mannequin, per frame", () => {
    const r = defaultRiggedRecipe();
    const ramp = applyMotionCommand(r, { type: "paintEnvelope", fromFrame: 0, toFrame: 192, from: 0, to: 3 });
    const a = (rr: Recipe, n: number) => frameAt(rr, n).amplitude!;
    expect(a(ramp, 96) / a(r, 96)).toBeCloseTo(1.5, 1);
    expect(a(ramp, 24)).toBeLessThan(a(r, 24));
  });
  it("stores a freehand stroke compactly and within 0.01 of it", () => {
    const values = Array.from({ length: 480 }, (_, i) => 1.5 + Math.sin(i / 20));
    const pts = simplifyEnvelope(values);
    expect(pts.length).toBeLessThan(120);   // a quarter of the 480 frames
    const env = { points: pts };
    values.forEach((v, i) => expect(Math.abs(envelopeAt(env, i) - v)).toBeLessThanOrEqual(0.011));
    const r = applyMotionCommand(structuredClone(DEFAULT_RECIPE), { type: "drawEnvelope", startFrame: 0, values });
    expect(validateRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(JSON.stringify(r.envelope).length).toBeLessThan(2000);
  });
  it("edits as points: move, add, remove", () => {
    let r = applyMotionCommand(structuredClone(DEFAULT_RECIPE), { type: "setEnvelopePoints", points: [[0, 1], [48, 2], [96, 1]] });
    r = applyMotionCommand(r, { type: "setEnvelopePoint", index: 1, frame: 60, value: 2.8 });
    expect(r.envelope!.points[1]).toEqual([60, 2.8]);
    r = applyMotionCommand(r, { type: "setEnvelopePoint", frame: 20, value: 0.2 });
    expect(r.envelope!.points.map(p => p[0])).toEqual([0, 20, 60, 96]);
    r = applyMotionCommand(r, { type: "removeEnvelopePoint", index: 1 });
    expect(r.envelope!.points).toHaveLength(3);
    expect(applyMotionCommand(r, { type: "setEnvelopePoints", points: [[0, 4]] }).envelope!.points).toEqual([[0, 3]]);   // clamped to 3
    expect(() => applyMotionCommand(r, { type: "setEnvelopePoints", points: [[10, 1], [5, 1]] })).toThrow(/after the point/);
  });
  it("starts from the kicks or from the loudness", () => {
    const audio = synthDrums(patternTimes(120, 4, 0), 8.5);
    const bands = analyseBands([audio], 44100);
    const r = applyMotionCommand(structuredClone(DEFAULT_RECIPE), { type: "envelopeFromAudio", source: "kick", min: 0.5, max: 2.5 }, { bands });
    const v = envelopeValues(r.envelope, 200);
    expect(v[24]).toBeGreaterThan(1.8);   // kick at 1.0 s (beat 2)
    expect(v[36]).toBeLessThan(1.2);      // 0.5 s later, decayed
    const drive = buildDrive({ rms: new Float32Array(200).fill(0.5), hopSeconds: 0.05 }, 24, 200);
    const loud = applyMotionCommand(structuredClone(DEFAULT_RECIPE), { type: "envelopeFromAudio", source: "amplitude", min: 0, max: 2 }, { drive });
    expect(envelopeAt(loud.envelope, 50)).toBeGreaterThan(1);
    expect(() => applyMotionCommand(structuredClone(DEFAULT_RECIPE), { type: "envelopeFromAudio", source: "snare" })).toThrow(/no snare/);
  });
});
