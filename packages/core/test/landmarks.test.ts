import { describe, expect, it } from "vitest";
import { analyseSamples, applyMotionCommand, applyScript, beatPathBase, buildDrive, footprintDistance, placeLandmarks, planCamera, printScript, scenePaths, LANDMARKS, DEFAULT_RECIPE, type Recipe } from "@motion-studio/core";
import { patternTimes, synthDrums } from "@motion-studio/core/internal";

const f = analyseSamples([synthDrums(patternTimes(120, 8, 0.1), 16.6)], 44100);
const drive = buildDrive(f, 24, 500);
const SCRIPTS = [
  "beats 0-17 | action: walk on path (-6,5) (-1.5,5) (2.5,2.5) (3.5,-2) (1,-6) corners 0.8 lock kick 1 | camera: follow behind lock kick 1 hold | shot: wide",
  "beats 0-9 | action: walk on path (-7,0) (6,0) corners 0.5 | camera: follow side | shot: wide\nbeats 9-17 | action: rest | camera: orbit 120 | shot: wide",
  "beats 0-17 | action: walk on path (-6,3,1.2) (2,1.5,3) (6,-2,1.5) corners 1 | camera: path (-7,7,2.4) (5,7.5,3.2) (8,2,2.4) corners 1",
];
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
