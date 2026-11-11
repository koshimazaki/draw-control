import { describe, expect, it } from "vitest";
import { analyseBands, applyCommands, applyMotionCommand, defaultRiggedRecipe, frameAt, planCamera, subjectAt, validateRecipe } from "../src/internal";
import { patternTimes, synthDrums } from "./drum-synth";

const bands = analyseBands([synthDrums(patternTimes(120, 4, 0), 8.5)], 44100);
const rigged = () => applyMotionCommand(defaultRiggedRecipe(), { type: "setCamera", distance: 5, height: 1.4 });

describe("camera rigs relative to the character", () => {
  it.each([["lead", 0], ["threeQuarter", 45], ["side", 90], ["chase", 180]] as const)("%s sits %s° from the heading at the set distance", (mode, deg) => {
    const r = applyMotionCommand(rigged(), { type: "setCameraModes", modes: [mode] });
    const plan = planCamera({ ...r, camera: { ...r.camera!, intensity: 0 } });
    const s = plan.samples[48], subj = subjectAt(r, 4);
    const angle = Math.atan2(s.position[0] - subj.x, s.position[2] - subj.z) * 180 / Math.PI;
    expect(Math.abs(((angle - deg + 540) % 360) - 180)).toBeLessThan(2);
    expect(Math.hypot(s.position[0] - subj.x, s.position[2] - subj.z)).toBeCloseTo(5, 1);
    expect(s.position[1]).toBeCloseTo(1.4, 1);
  });
  it("top looks down from above; fixed holds its place while the subject walks away", () => {
    const top = applyMotionCommand(rigged(), { type: "setCameraModes", modes: ["top", "chase"] });
    const s = planCamera(top).samples[96];
    expect(s.position[1]).toBeGreaterThan(5);
    const walk = applyMotionCommand(rigged(), { type: "setRootPath", points: [{ x: 0, z: 0 }, { x: 0, z: 6 }], fromBeat: 0, toBeat: 16 });
    const fixed = planCamera(applyMotionCommand(walk, { type: "setCameraModes", modes: ["fixed"] }));
    expect(fixed.samples[150].position[0]).toBeCloseTo(fixed.samples[40].position[0], 3);
    expect(fixed.samples[150].position[2]).toBeCloseTo(fixed.samples[40].position[2], 3);
    expect(fixed.samples[150].target[2]).toBeGreaterThan(fixed.samples[40].target[2] + 2);   // it pans to follow
  });
  it("starts a camera move on the first snare and keeps the rest", () => {
    const r = applyCommands(rigged(), [
      { type: "setCameraModes", modes: ["orbit"] },
      { type: "startCameraMove", modes: ["pushIn"], target: "snare", index: 0, lengthBeats: 4 },
    ], { bands });
    const seg = r.camera!.segments;
    expect(seg.map(s => s.modes[0])).toEqual(["orbit", "pushIn", "orbit"]);
    expect(Math.abs(seg[1].fromBeat - 1)).toBeLessThan(0.05);   // first snare on beat 1 (120 BPM, offset 0)
    expect(() => applyMotionCommand(rigged(), { type: "startCameraMove", modes: ["pushIn"], target: "snare" })).toThrow(/no snare/);
    expect(() => applyMotionCommand(rigged(), { type: "setCameraModes", modes: ["lead", "side"] })).toThrow(/one follow rig/);
  });
});

describe("root path", () => {
  it("travels a drawn path over the chosen range at a steady speed, facing along it", () => {
    const stroke = Array.from({ length: 60 }, (_, i) => ({ x: Math.sin(i / 59 * Math.PI) * 2, z: i / 59 * 6 }));
    const r = applyMotionCommand(rigged(), { type: "setRootPath", points: stroke, fromBeat: 4, toBeat: 12, gait: "Walk_Loop" });
    expect(r.rootPath.length).toBeLessThanOrEqual(48);
    expect(r.rootPath[0]).toMatchObject({ beat: 0 });
    const at = (beat: number) => frameAt(r, Math.round(beat * 12)).root;
    expect(at(2).z).toBeCloseTo(0, 2);              // waits at the start
    expect(at(14).z).toBeCloseTo(6, 1);             // stays at the end
    const steps = [5, 6, 7, 8, 9, 10, 11].map(b => Math.hypot(at(b + 1).x - at(b).x, at(b + 1).z - at(b).z));
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.25);   // steady speed
    expect(at(5).yawRadians).toBeGreaterThan(0.3);                       // turned along the curve (heading +x first)
    expect(at(11).yawRadians).toBeLessThan(-0.3);                        // then back towards -x
    expect(r.moves.some(m => m.clip === "Walk_Loop" && m.lengthBeats === 8)).toBe(true);
    expect(validateRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
  it("refuses a path without two points", () => {
    expect(() => applyMotionCommand(rigged(), { type: "setRootPath", points: [{ x: 0, z: 0 }] })).toThrow(/2–4096/);
  });
});
