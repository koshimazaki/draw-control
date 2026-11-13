/**
 * The subject stays in frame: for every frame of the four Beat Path examples and of stress
 * recipes (a long path, few kicks, strength 1, each follow rig), the subject's centre,
 * projected through the planned camera at 16:9, stays inside the frame with a margin.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseSamples, applyScript, beatPathBase, buildDrive, frameAt, planCamera, type AudioDrive, type Recipe } from "@motion-studio/core";
import { patternTimes, synthDrums } from "@motion-studio/core/internal";
import { BLANK_STATE, fromScript, toScript, type BeatPathState, type CameraWord } from "../src/beat-path/script";
import { beatPathRecipe } from "../src/beat-path/recipe-map";

const drumsDrive = (p: ReturnType<typeof patternTimes>, seconds = 16.6) => {
  const f = analyseSamples([synthDrums(p, seconds)], 44100);
  return { f, drive: buildDrive(f, 24, Math.ceil(f.lengthSeconds * 24) + 1) };
};
const demo = drumsDrive(patternTimes(120, 8, 0.1));
// Few kicks: four in eight seconds, unevenly spaced.
const sparse = drumsDrive({ kicks: [0.1, 0.6, 4.1, 6.6], snares: [], hats: [] }, 9);

/** Where a world point lands in the camera's frame: x, y in -1..1 inside, z the depth. */
export function project(cam: { position: number[]; target: number[]; fov: number }, p: [number, number, number]) {
  const f = cam.target.map((v, i) => v - cam.position[i]), fl = Math.hypot(...f), fw = f.map(v => v / fl);
  const r = [fw[1] * 0 - fw[2] * 1, fw[2] * 0 - fw[0] * 0, fw[0] * 1 - fw[1] * 0], rl = Math.hypot(...r), rt = r.map(v => v / rl);
  const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  const rel = p.map((v, i) => v - cam.position[i]), z = rel[0] * fw[0] + rel[1] * fw[1] + rel[2] * fw[2];
  const ty = Math.tan(cam.fov * Math.PI / 360), tx = ty * 16 / 9;
  return { x: (rel[0] * rt[0] + rel[1] * rt[1] + rel[2] * rt[2]) / (z * tx), y: (rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2]) / (z * ty), z };
}

/** The worst frame: the largest |x| or |y| of the subject's centre (0.6 m above its root). */
function worst(r: Recipe, drive?: AudioDrive) {
  const frames = Math.ceil((r.beatGrid.offsetSeconds + r.durationBeats * 60 / r.beatGrid.bpm) * 24);
  const plan = planCamera(r, drive, frames + 2);
  let w = { v: 0, n: 0 };
  for (let n = 0; n < frames; n++) {
    const root = frameAt(r, n, drive).root, q = project(plan.samples[n], [root.x, root.y + 0.6, root.z]);
    const v = q.z <= 0 ? Infinity : Math.max(Math.abs(q.x), Math.abs(q.y));
    if (v > w.v) w = { v, n };
  }
  return w;
}
const MARGIN = 0.85;   // inside 85 % of the half-frame on each axis

const scripts = new URL("../../../examples/scripts/", import.meta.url);
describe("the subject stays in frame", () => {
  for (const file of readdirSync(scripts).filter(f => f.startsWith("beat-path-"))) it(file, () => {
    const s = fromScript(readFileSync(new URL(file, scripts), "utf8"), BLANK_STATE).state;
    const base = beatPathBase({ seconds: s.clip, bpm: demo.f.estimatedBpm!, offsetSeconds: demo.f.estimatedOffsetSeconds });
    const r = applyScript(base, { script: toScript(s) }, { drive: demo.drive, bands: demo.drive.bands });
    expect(worst(r, demo.drive).v).toBeLessThan(MARGIN);
  });
  for (const rig of ["follow behind", "follow side", "over shoulder"]) for (const lock of ["kick 1", "beat 1"]) it(`stress: 26 m path, ${lock}, ${rig}`, () => {
    const f = lock.startsWith("kick") ? sparse : demo;
    const base = beatPathBase({ seconds: 8, bpm: f.f.estimatedBpm ?? 120, offsetSeconds: f.f.estimatedBpm ? f.f.estimatedOffsetSeconds : 0 });
    const script = `beats 0-${base.durationBeats} | action: walk on path (-12,4) (-4,-3) (4,3) (12,-4) corners 0.7 lock ${lock} | camera: ${rig} lock ${lock} hold | shot: wide`;
    const r = applyScript(base, { script }, { drive: f.drive, bands: f.drive.bands });
    const w = worst(r, f.drive);
    expect(w.v, `worst at frame ${w.n}`).toBeLessThan(MARGIN);
  });
  // No track, lock off: every camera word, a fast subject, a camera path that wanders away, and block blends.
  const WANDER = [{ x: -14, z: 12, y: 2 }, { x: 0, z: 18, y: 3 }, { x: 16, z: 6, y: 2.5 }, { x: 10, z: -14, y: 2 }];
  const FAST = [{ x: -13, z: 5 }, { x: -4, z: -4 }, { x: 5, z: 4 }, { x: 13, z: -5 }];
  const words: CameraWord[] = ["behind", "side", "orbit", "top", "path", "push"];
  for (const clip of [5, 8] as const) for (const word of words) it(`no track, lock off, ${clip} s, ${word}`, () => {
    const beats = clip === 5 ? 11 : 17;
    const state: BeatPathState = { ...BLANK_STATE, clip, lock: "off", subject: FAST, subjectCorners: 0.2, camera: WANDER, cameraCorners: 0.5,
      character: [{ from: 0, to: beats, word: "glide" }], cameraLane: [{ from: 0, to: beats, word }] };
    const w = worst(beatPathRecipe(state, null));
    expect(w.v, `worst at frame ${w.n}`).toBeLessThan(MARGIN);
  });
  it("no track, lock off: blends between every pair of camera words", () => {
    let bad = "";
    for (const a of words) for (const b of words) {
      const state: BeatPathState = { ...BLANK_STATE, lock: "off", subject: FAST, subjectCorners: 0.5, camera: WANDER,
        character: [{ from: 0, to: 17, word: "glide" }], cameraLane: [{ from: 0, to: 6, word: a }, { from: 6, to: 11, word: b }, { from: 11, to: 17, word: a }] };
      const w = worst(beatPathRecipe(state, null));
      if (!(w.v < MARGIN)) bad += `${a}->${b} ${w.v.toFixed(2)}@${w.n}; `;
    }
    expect(bad).toBe("");
  });
});
