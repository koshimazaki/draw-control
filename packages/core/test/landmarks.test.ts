import { describe, expect, it } from "vitest";
import { analyseSamples, applyMotionCommand, applyScript, beatPathBase, buildDrive, footprintDistance, hiddenSamples, placeLandmarks, planCamera, printScript, scenePaths, LANDMARKS, PASSES, DEFAULT_RECIPE, type Recipe } from "@motion-studio/core";
import { patternTimes, synthDrums } from "@motion-studio/core/internal";

const f = analyseSamples([synthDrums(patternTimes(120, 8, 0.1), 16.6)], 44100);
const drive = buildDrive(f, 24, 500);
const SCRIPTS = [
  "beats 0-17 | action: walk on path (-6,5) (-1.5,5) (2.5,2.5) (3.5,-2) (1,-6) corners 0.8 lock kick 1 | camera: follow behind lock kick 1 hold | shot: wide",
  "beats 0-9 | action: walk on path (-7,0) (6,0) corners 0.5 | camera: follow side | shot: wide\nbeats 9-17 | action: rest | camera: orbit 120 | shot: wide",
  "beats 0-17 | action: walk on path (-6,3,1.2) (2,1.5,3) (6,-2,1.5) corners 1 | camera: path (-7,7,2.4) (5,7.5,3.2) (8,2,2.4) corners 1",
];
const ctx = { drive, bands: drive.bands };
const build = (s: string, base = beatPathBase({ seconds: 8, bpm: 120, offsetSeconds: f.estimatedOffsetSeconds })) => applyScript(base, { script: s }, { drive, bands: drive.bands });
const place = (r: Recipe) => placeLandmarks(r, planCamera(r, drive, 500), drive);

describe("landmark blocks", () => {
  it("are deterministic: the same recipe gives the same blocks; another seed others", () => {
    const r = build(SCRIPTS[0]);
    expect(place(r)).toEqual(place(structuredClone(r)));
    expect(place(r).length).toBeGreaterThanOrEqual(10);
    const other = applyMotionCommand(r, { type: "setLandmarks", seed: 99 });
    expect(place(other)).not.toEqual(place(r));
  });
  for (const [i, s] of SCRIPTS.entries()) it(`keep clear of the subject, the camera and the line of sight (script ${i + 1})`, () => {
    const r = build(s), plan = planCamera(r, drive, 500), blocks = placeLandmarks(r, plan, drive);
    const { subject, camera } = scenePaths(r, plan, drive);
    for (const b of blocks) {
      for (const p of subject) expect(footprintDistance(b, p)).toBeGreaterThanOrEqual(LANDMARKS.subjectMargin);
      for (const p of camera) expect(footprintDistance(b, p)).toBeGreaterThanOrEqual(LANDMARKS.cameraMargin);
      // every frame (not only the sampled ones): nothing between camera and subject
      for (let n = 0; n < plan.frames && n < 410; n++) {
        const c = plan.samples[n].position, k = Math.min(subject.length - 1, Math.round(n / 2)), sp = subject[k];
        for (let t = 0.15; t < 0.9; t += 0.05) expect(footprintDistance(b, { x: c[0] + (sp.x - c[0]) * t, z: c[2] + (sp.z - c[2]) * t })).toBeGreaterThan(0);
      }
    }
  });
  it("move when a path changes", () => {
    expect(place(build(SCRIPTS[0]))).not.toEqual(place(build(SCRIPTS[1])));
  });
  it("are off unless the recipe has them on; the script round-trips on and off", () => {
    expect(placeLandmarks({ ...DEFAULT_RECIPE }, null)).toEqual([]);
    const on = build(SCRIPTS[0]);
    expect(printScript(on)).toMatch(/^landmarks: on seed 7\n/);
    const off = build(`landmarks: off\n${SCRIPTS[0]}`);
    expect(off.landmarks).toEqual({ seed: 7, on: false });
    expect(place(off)).toEqual([]);
    expect(printScript(off)).toMatch(/^landmarks: off\n/);
    expect(build(printScript(off))).toEqual(off);
    expect(build(`landmarks: on seed 12\n${SCRIPTS[0]}`).landmarks).toEqual({ seed: 12, on: true });
    expect(() => build(`landmarks: maybe\n${SCRIPTS[0]}`)).toThrow(/landmarks reads/);
    // a recipe without the field prints no settings line, as before
    expect(printScript(DEFAULT_RECIPE)).not.toMatch(/landmarks/);
  });
});

describe("scenery passes and explicit boxes", () => {
  const street = (sight: string) => build(`scenery: street${sight}\nbeats 0-17 | action: walk on path (-16,0) (-6,0.4) (3,0) (18,-2) corners 0.8 lock kick 0.6 | camera: follow side | shot: wide`);
  it("passes: blocks cross the line of sight only briefly (the caps), and some do", () => {
    const r = street(" sight passes"), plan = planCamera(r, drive, 500), blocks = placeLandmarks(r, plan, drive);
    const { subject, camera } = scenePaths(r, plan, drive), n = Math.min(subject.length, camera.length), hidden = new Uint8Array(n);
    for (const b of blocks) for (const i of hiddenSamples(b, subject, camera)) hidden[i] = 1;
    let run = 0, longest = 0, total = 0;
    for (const v of hidden) { run = v ? run + 1 : 0; longest = Math.max(longest, run); total += v; }
    expect(total).toBeGreaterThan(0);
    expect(longest * 2 / 24).toBeLessThanOrEqual(PASSES.maxHiddenSeconds);
    expect(total / n).toBeLessThanOrEqual(PASSES.maxHiddenShare);
    // clear sight: nothing crosses it
    const c = street(""), cp = planCamera(c, drive, 500), cs = scenePaths(c, cp, drive);
    expect(placeLandmarks(c, cp, drive).flatMap(b => hiddenSamples(b, cs.subject, cs.camera))).toEqual([]);
    expect(printScript(r)).toMatch(/^scenery: street sight passes$/m);
  });
  it("explicit boxes replace the preset, round-trip through the script and the commands", () => {
    let r = build(`scenery: street\nbox: 4 6 3 5 12\nbox: -4 6 3 5 9 0.5\n${SCRIPTS[0]}`);
    expect(r.sceneryBoxes).toEqual([{ x: 4, z: 6, w: 3, d: 5, h: 12 }, { x: -4, z: 6, w: 3, d: 5, h: 9, yaw: 0.5 }]);
    expect(place(r).map(b => [b.x, b.h])).toEqual([[4, 12], [-4, 9]]);
    expect(build(printScript(r))).toEqual(r);
    r = applyMotionCommand(r, { type: "addSceneryBox", x: 0, z: -8, w: 2, d: 2, h: 4 }, ctx);
    r = applyMotionCommand(r, { type: "removeSceneryBox", index: 0 }, ctx);
    expect(r.sceneryBoxes!.map(b => b.x)).toEqual([-4, 0]);
    expect(applyMotionCommand(r, { type: "setScenerySight", sight: "passes" }, ctx).scenerySight).toBe("passes");
  });
});

