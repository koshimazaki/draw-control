import { describe, expect, it } from "vitest";
import { BEAT_PATH_RIG, DEFAULT_RECIPE, applyScript, beatPathBase, planCamera, printScript, cameraAtFrame } from "../src/internal";

const ROWS = "beats 0-8 | action: walk on path (0,0) (4,0) (8,2) | camera: three-quarter | shot: -\nbeats 8-16 | action: continue | camera: orbit 40 | shot: -\n";
const base = () => beatPathBase({ seconds: 8 });

describe("the rig: script line", () => {
  it("sets the rig's start framing, every field optional and in any order", () => {
    const r = applyScript(base(), { script: `rig: yaw 45 distance 8m height 5 fov 30\n${ROWS}` });
    expect(r.camera).toMatchObject({ distance: 8, height: 5, fov: 30, startYaw: 45 });
    const some = applyScript(base(), { script: `rig: height 4.5m\n${ROWS}` });
    expect(some.camera).toMatchObject({ ...BEAT_PATH_RIG, height: 4.5 });
  });
  it("frame 0 is the rig start", () => {
    const r = applyScript(base(), { script: `rig: distance 8m height 5m fov 30 yaw 45\n${ROWS}` });
    const at0 = cameraAtFrame(planCamera(r), 0);
    expect(at0.position[1]).toBeCloseTo(5, 1);
    expect(at0.fov).toBeCloseTo(30, 5);
  });
  it("a script without the line leaves the rig as it was", () => {
    const set = applyScript(base(), { script: `rig: distance 9m\n${ROWS}` });
    expect(applyScript(set, { script: ROWS }).camera?.distance).toBe(9);
  });
  it("refuses a value outside the camera's limits, or a word it does not know, saying how the line reads", () => {
    expect(() => applyScript(base(), { script: `rig: distance 20m\n${ROWS}` })).toThrow(/script line 1: distance 20 is outside 1.5 to 12; rig reads "rig: distance 8m/);
    expect(() => applyScript(base(), { script: `rig: height 7\n${ROWS}` })).toThrow(/height 7 is outside 0.2 to 6/);
    expect(() => applyScript(base(), { script: `rig: fov 90\n${ROWS}` })).toThrow(/fov 90 is outside 15 to 80/);
    expect(() => applyScript(base(), { script: `rig: yaw 400\n${ROWS}` })).toThrow(/yaw 400 is outside -360 to 360/);
    expect(() => applyScript(base(), { script: `rig: zoom 2\n${ROWS}` })).toThrow(/"zoom" is not a rig field/);
    expect(() => applyScript(base(), { script: `rig: distance\n${ROWS}` })).toThrow(/rig reads/);
    expect(() => applyScript(base(), { script: `rig: distance 4 distance 5\n${ROWS}` })).toThrow(/distance is given twice/);
    expect(() => applyScript(base(), { script: `rig: fov wide\n${ROWS}` })).toThrow(/fov must be a number/);
    for (const line of ["rig: toString 3", "rig: constructor 3", "rig: __proto__ 3"]) expect(() => applyScript(base(), { script: `${line}\n${ROWS}` })).toThrow(/is not a rig field; rig reads/);
    expect(() => applyScript(base(), { script: `rig: yaw deg\n${ROWS}` })).toThrow(/yaw must be a number \(got "deg"\); rig reads/);
    expect(() => applyScript(base(), { script: `rig: distance m\n${ROWS}` })).toThrow(/distance must be a number \(got "m"\); rig reads/);
  });
  it("prints first, only the fields off the base, and reads back to the same recipe", () => {
    const r = applyScript(base(), { script: `rig: distance 8m height 5m fov 30 yaw 45\n${ROWS}` });
    const text = printScript(r);
    expect(text.split("\n")[0]).toBe("rig: distance 8m height 5m fov 30 yaw 45");
    expect(applyScript(base(), { script: text })).toEqual(r);
    const one = applyScript(base(), { script: `rig: yaw -30\n${ROWS}` });
    expect(printScript(one).split("\n")[0]).toBe("rig: yaw -30");
  });
  it("prints no rig line at the base rig, so existing scripts print unchanged", () => {
    expect(printScript(applyScript(base(), { script: ROWS }))).not.toMatch(/^rig:/m);
    expect(printScript(DEFAULT_RECIPE)).not.toMatch(/^rig:/m);
  });
});
