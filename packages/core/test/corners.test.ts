import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE, applyScript, cornerPath, frameAt, planCamera, printScript, validateRecipe, BUNDLE_SCHEMA_VERSION, CHARACTER_KINDS, type Recipe,
} from "@motion-studio/core";

const base = (): Recipe => validateRecipe({
  ...structuredClone(DEFAULT_RECIPE), moves: [], durationBeats: 16,
  character: { kind: "glider", name: "Glider", licence: "MIT (motion-studio)" },
  camera: { segments: [{ fromBeat: 0, toBeat: 16, modes: ["chase"] }], intensity: 0.25, orbitDegreesPerBeat: 0, distance: 5.2, height: 1.7, fov: 34, startYaw: 0, followHeight: true },
});
const L = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }];

describe("corner rounding", () => {
  it("0 keeps the points; more rounds the corner inside the triangle; 1 meets half way", () => {
    expect(cornerPath(L, 0)).toEqual(L);
    const half = cornerPath(L, 0.5), full = cornerPath(L, 1);
    expect(half.length).toBeGreaterThan(3);
    expect(half).not.toContainEqual({ x: 4, z: 0 });
    // the rounded corner starts 1 m before the corner at 0.5, at the segment's middle at 1
    expect(half[1]).toEqual({ x: 3, z: 0 });
    expect(full[1]).toEqual({ x: 2, z: 0 });
    expect(full.at(-1)).toEqual({ x: 4, z: 4 });
  });
  it("the walk path's corners round-trip through the script, and the figure turns hard at 0", () => {
    const script = (c: number) => `beats 0-16 | action: walk on path (0,0) (4,0) (4,4,1) corners ${c} lock beat 0.5 | camera: chase`;
    const r = applyScript(base(), { script: script(0.6) });
    expect(r.rootShape).toEqual({ corners: 0.6, points: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4, y: 1 }] });
    const printed = printScript(r);
    expect(printed).toMatch(/walk on path \(0,0\) \(4,0\) \(4,4,1\) corners 0\.6 lock beat 0\.5/);
    expect(applyScript(base(), { script: printed })).toEqual(r);
    // sharp: the facing jumps by 90° across the corner; round: it turns over several frames
    const yawSteps = (rr: Recipe) => { let worst = 0; for (let n = 1; n < 190; n++) worst = Math.max(worst, Math.abs(frameAt(rr, n).root.yawRadians - frameAt(rr, n - 1).root.yawRadians)); return worst; };
    expect(yawSteps(applyScript(base(), { script: script(0) }))).toBeGreaterThan(1);
    expect(yawSteps(applyScript(base(), { script: script(1) }))).toBeLessThan(0.3);
  });
  it("the camera path's corners round-trip, and change only the path the camera flies", () => {
    const s = "beats 0-16 | action: rest | camera: path (6,3,1.8) (2,8,2.2) (-3,4,1.8) corners 0.4";
    const r = applyScript(base(), { script: s });
    expect(r.camera?.corners).toBe(0.4);
    expect(printScript(r)).toMatch(/camera: path \(6,3,1\.8\) \(2,8,2\.2\) \(-3,4,1\.8\) corners 0\.4/);
    const smooth = applyScript(base(), { script: s.replace(" corners 0.4", "") });
    expect(smooth.camera?.corners).toBeUndefined();
    expect(planCamera(r).samples[100].position).not.toEqual(planCamera(smooth).samples[100].position);
  });
});

describe("glider and follow height", () => {
  it("glider is a character kind; the bundle schema is 0.5.0", () => {
    expect(CHARACTER_KINDS).toContain("glider");
    expect(BUNDLE_SCHEMA_VERSION).toBe("0.5.0");
  });
  it("spin and jump accents turn and lift the glider", () => {
    const r = applyScript(base(), { script: "beats 0-8 | action: rest, spin @beat 4\nbeats 8-16 | action: rest, jump @beat 12" });
    const at = (beat: number) => frameAt(r, Math.round(beat * 12));
    expect(Math.abs(at(4.2).root.yawRadians)).toBeGreaterThan(0.3);
    expect(Math.max(...[11.6, 11.8, 12].map(b => at(b).root.y))).toBeGreaterThan(0.1);
  });
  it("followHeight lifts the camera and its aim with the subject; absent, nothing changes", () => {
    const flying = validateRecipe({ ...base(), rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0, y: 2 }] });
    const still = validateRecipe({ ...flying, camera: { ...flying.camera!, followHeight: undefined } });
    const a = planCamera(flying).samples[50], b = planCamera(still).samples[50];
    expect(a.position[1] - b.position[1]).toBeCloseTo(2, 5);
    expect(a.target[1] - b.target[1]).toBeCloseTo(2, 5);
  });
  it("a locked hold stops a camera path block on each hit; strength 0 changes nothing", () => {
    const s = (lock: string) => `beats 0-16 | action: rest | camera: path (6,3,1.8) (2,8,2.2) (-3,4,1.8)${lock}`;
    const free = planCamera(applyScript(base(), { script: s("") }));
    const held = planCamera(applyScript(base(), { script: s(" lock beat 1 hold") }));
    const zero = planCamera(applyScript(base(), { script: s(" lock beat 0 hold") }));
    expect(zero.samples.map(x => x.position)).toEqual(free.samples.map(x => x.position));
    const speed = (p: typeof free, n: number) => Math.hypot(...p.samples[n + 1].position.map((v, i) => v - p.samples[n].position[i]));
    // on beat 8 (frame 96) the held camera stops
    expect(speed(held, 95)).toBeLessThan(speed(free, 95) * 0.1);
  });
});
