import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, applyMotionCommand, describeRecipe, planCamera, validateRecipe, type Recipe } from "../src";

const r0 = (): Recipe => validateRecipe({ ...structuredClone(DEFAULT_RECIPE), durationBeats: 16,
  camera: { segments: [{ fromBeat: 0, toBeat: 16, modes: ["orbit"], shot: "medium" }], intensity: 1, orbitDegreesPerBeat: 8, distance: 4.4, height: 1.15, fov: 38, startYaw: 0 } });

describe("camera automation lanes", () => {
  it("a lane overrides its parameter where it has points, and only there", () => {
    const r = applyMotionCommand(r0(), { type: "paintEnvelope", lane: "distance", fromFrame: 48, toFrame: 96, from: 2, to: 8 });
    expect(r.camera!.lanes!.distance!.points).toEqual([[48, 2], [96, 8]]);
    const p = planCamera(r), plain = planCamera(r0());
    expect(p.channels.distance[72]).toBeCloseTo(5, 6);
    expect(p.channels.distance[30]).toBe(plain.channels.distance[30]);
    expect(p.channels.distance[120]).toBe(plain.channels.distance[120]);
  });
  it("every edit the pencil makes is a command: draw, set points, move a point, remove, clear", () => {
    let r = applyMotionCommand(r0(), { type: "drawEnvelope", lane: "height", startFrame: 10, values: [1, 1.5, 2, 2.5, 3] });
    expect(r.camera!.lanes!.height!.points[0]).toEqual([10, 1]);
    r = applyMotionCommand(r, { type: "setEnvelopePoints", lane: "fov", points: [[0, 30], [100, 60]] });
    expect(planCamera(r).samples[50].fov).toBeCloseTo(45, 6);
    r = applyMotionCommand(r, { type: "setEnvelopePoint", lane: "fov", index: 1, frame: 120, value: 50 });
    expect(r.camera!.lanes!.fov!.points).toEqual([[0, 30], [120, 50]]);
    r = applyMotionCommand(r, { type: "removeEnvelopePoint", lane: "fov", index: 0 });
    expect(r.camera!.lanes!.fov!.points).toEqual([[120, 50]]);
    r = applyMotionCommand(r, { type: "clearEnvelope", lane: "fov" });
    expect(r.camera!.lanes!.fov).toBeUndefined();
    expect(r.envelope).toBeUndefined();   // the amplitude envelope is its own lane
  });
  it("yaw is an offset, held outside its span; values outside a lane's range are clamped", () => {
    const r = applyMotionCommand(r0(), { type: "setEnvelopePoints", lane: "yaw", points: [[24, 0], [48, 90]] });
    const p = planCamera(r), plain = planCamera(r0());
    expect(p.channels.yaw[100] - plain.channels.yaw[100]).toBeCloseTo(Math.PI / 2, 6);
    expect(applyMotionCommand(r0(), { type: "setEnvelopePoint", lane: "fov", frame: 5, value: 500 }).camera!.lanes!.fov!.points).toEqual([[5, 100]]);
    expect(() => applyMotionCommand(r0(), { type: "paintEnvelope", lane: "zoom", fromFrame: 0, toFrame: 4, from: 1, to: 1 })).toThrow(/amplitude, distance, height, yaw, fov/);
  });
  it("describe reports the lanes", () => {
    const r = applyMotionCommand(r0(), { type: "paintEnvelope", lane: "distance", fromFrame: 48, toFrame: 96, from: 2, to: 8 });
    expect(describeRecipe(r)).toMatch(/distance lane: 2 breakpoints, frames 48–96, 2–8 m, overrides the rig there/);
  });
});
