import { describe, expect, it } from "vitest";
import { cameraAtFrame, planCamera } from "@motion-studio/core";
import { EXAMPLES, exampleState } from "../src/beat-path/examples";
import { beatPathRecipe } from "../src/beat-path/recipe-map";
import { BLANK_STATE, fromScript, setWord, toScript, type BeatPathState } from "../src/beat-path/script";
import { SETUP_KIND, SETUP_VERSION, readSetup } from "../src/beat-path/setup-file";

const drone = EXAMPLES.findIndex(e => e.id === "drone");
const file = (state: unknown) => JSON.stringify({ kind: SETUP_KIND, version: SETUP_VERSION, state });

describe("the page's camera start (the rig: line)", () => {
  it("Example 4 carries its rig, and the page's recipe opens on it", () => {
    const s = exampleState(drone);
    expect(s.rig).toEqual({ distance: 8, height: 5, fov: 30, yaw: 45 });
    expect(s.track).toBe("drone");
    const r = beatPathRecipe(s, { name: "generated-laidback-100-6bars.wav", licence: "MIT", bpm: 100, offsetSeconds: 0.09, lengthSeconds: 15 });
    expect(r.camera).toMatchObject({ distance: 8, height: 5, fov: 30, startYaw: 45 });
    expect(r.camera!.segments.map(g => g.modes.join("+"))).toEqual(["threeQuarter", "orbit", "top", "side"]);
    expect(cameraAtFrame(planCamera(r), 0).position[1]).toBeGreaterThan(5);
  });
  it("toScript prints it and fromScript reads it back; absent means the base rig", () => {
    const s: BeatPathState = { ...structuredClone(BLANK_STATE), rig: { height: 4, yaw: -20 } };
    const text = toScript(s);
    expect(text).toMatch(/^rig: height 4m yaw -20$/m);
    expect(fromScript(text, BLANK_STATE).state.rig).toEqual({ height: 4, yaw: -20 });
    expect(toScript(BLANK_STATE)).not.toMatch(/^rig:/m);
    expect(fromScript(toScript(BLANK_STATE), s).state.rig).toBeUndefined();
    expect(beatPathRecipe(BLANK_STATE, null).camera).toMatchObject({ distance: 7, height: 1.6, fov: 40, startYaw: 0 });
  });
  it("the track comment tells Example 3 and Example 4 apart (both laidback)", () => {
    expect(toScript(exampleState(drone))).toMatch(/^# track: laidback 6 bars$/m);
    expect(toScript(exampleState(EXAMPLES.findIndex(e => e.id === "car")))).toMatch(/^# track: laidback$/m);
    expect(fromScript("# track: laidback\nbeats 0-4 | action: rest\n", BLANK_STATE).state.track).toBe("car");
  });
  it("a camera block written with shot: - keeps it (no preset pulls it to the preset's framing); a new word drops it", () => {
    const s = exampleState(drone);
    expect(s.cameraLane.every(b => b.shot === "-")).toBe(true);
    expect(toScript(s).split("\n").filter(l => l.startsWith("beats ")).every(l => l.endsWith("| shot: -"))).toBe(true);
    expect(setWord(s.cameraLane, 2, "top")[2].shot).toBeUndefined();
  });
});

describe("a follow block keeps its fov", () => {
  const cell = "follow side right distance 6m height 1.6m fov 35";
  it("fromScript keeps the side word, its offset and its fov, and prints the same cell back", () => {
    const { state, notes } = fromScript(`beats 0-4 | action: rest | camera: ${cell} | shot: -\n`, BLANK_STATE);
    expect(notes).toEqual([]);
    const b = state.cameraLane[0];
    expect(b).toMatchObject({ word: "side", follow: { distance: 6, height: 1.6, angle: 180 }, fov: 35, shot: "-" });
    expect(b.phrase).toBeUndefined();
    expect(toScript(state)).toContain(`camera: ${cell} | shot: -`);
  });
  it("Example 4's last block is a plain side block with fov 35", () => {
    expect(exampleState(drone).cameraLane.at(-1)).toMatchObject({ word: "side", follow: { distance: 6, height: 1.6, angle: 180 }, fov: 35 });
    expect(exampleState(drone).cameraLane.at(-1)!.phrase).toBeUndefined();
  });
  it("a fov outside the camera's range stays a typed direction; a setup file clamps it", () => {
    expect(fromScript("beats 0-4 | action: rest | camera: follow side fov 200 | shot: -\n", BLANK_STATE).state.cameraLane[0].phrase).toBe("follow side fov 200");
    const r = readSetup(file({ ...BLANK_STATE, cameraLane: [{ from: 0, to: 17, word: "side", fov: 300 }] }));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.cameraLane[0].fov).toBe(110);
  });
});

describe("setup file: the camera start", () => {
  it("comes back as saved, and is clamped to the camera's limits with a note", () => {
    const r = readSetup(file({ ...BLANK_STATE, rig: { distance: 20, height: 0.1, fov: 30, yaw: 900 } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.rig).toEqual({ distance: 12, height: 0.2, fov: 30, yaw: 360 });
    expect(r.notes.join("\n")).toMatch(/camera start distance 20 m → 12 m/);
    expect(r.notes.join("\n")).toMatch(/camera start yaw 900° → 360°/);
  });
  it("an unreadable rig is left out, with a note", () => {
    const r = readSetup(file({ ...BLANK_STATE, rig: "high" }));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.rig).toBeUndefined();
    expect(r.notes).toContain("camera start: not readable, left as on a blank page");
  });
});
