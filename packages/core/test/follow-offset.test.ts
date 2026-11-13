/**
 * Follow offsets (camera segment `follow`): the script words read and print back, the rig
 * puts the camera at the offset (distance, height, the chosen side), and a camera beyond a
 * street's row of blocks with sight "passes" keeps the occlusion caps.
 */
import { describe, expect, it } from "vitest";
import {
  PASSES, analyseSamples, applyScript, beatPathBase, buildDrive, frameAt, hiddenSamples, placeLandmarks, planCamera, printScript, scenePaths, validateRecipe, type Recipe,
} from "@motion-studio/core";
import { followWords, foldDegrees, parseFollowArgs, patternTimes, synthDrums } from "@motion-studio/core/internal";

const f = analyseSamples([synthDrums(patternTimes(120, 8, 0.1), 16.6)], 44100);
const drive = buildDrive(f, 24, 500), ctx = { drive, bands: drive.bands };
const base = () => beatPathBase({ seconds: 8, bpm: 120, offsetSeconds: f.estimatedOffsetSeconds });
const STRAIGHT = "walk on path (-10,0) (10,0)";
const run = (camera: string, extra = "", path = STRAIGHT): Recipe => applyScript(base(), { script: `${extra}beats 0-17 | action: ${path} lock kick 1 | camera: ${camera}` }, ctx);
const no = (msg: string): never => { throw new Error(msg); };

/** The camera's offset from the subject at frame n, in the subject's frame: + right, + ahead; and its height. */
function offsetAt(r: Recipe, n: number) {
  const plan = planCamera(r, drive, 200), root = frameAt(r, n, drive).root, c = plan.samples[n].position, h = root.yawRadians;
  const dx = c[0] - root.x, dz = c[2] - root.z;
  return { right: -Math.cos(h) * dx + Math.sin(h) * dz, ahead: Math.sin(h) * dx + Math.cos(h) * dz, height: c[1], distance: Math.hypot(dx, dz) };
}

describe("follow offset words", () => {
  it("read and print: side, distance, height, angle", () => {
    expect(parseFollowArgs("side", ["right", "distance", "14m", "height", "2.5m"], no)).toEqual({ distance: 14, height: 2.5, angle: 180 });
    expect(parseFollowArgs("side", ["left"], no)).toBeUndefined();
    expect(parseFollowArgs("chase", ["distance", "6", "angle", "-30"], no)).toEqual({ distance: 6, angle: -30 });
    expect(followWords("side", { distance: 14, angle: 170 })).toBe("right distance 14m angle -10");
    expect(followWords("chase", { height: 3 })).toBe("height 3m");
    expect(foldDegrees(190)).toBe(-170);
    expect(() => parseFollowArgs("chase", ["right"], no)).toThrow(/follow side/);
    expect(() => parseFollowArgs("chase", ["distance", "40m"], no)).toThrow(/1–30/);
  });
  it("round-trips through the script and the recipe; today's scripts are unchanged", () => {
    const r = run("follow side right distance 14m height 2.5m lock kick 1 hold");
    expect(r.camera!.segments[0]).toMatchObject({ modes: ["side"], follow: { distance: 14, height: 2.5, angle: 180 } });
    expect(printScript(r)).toMatch(/camera: side right distance 14m height 2\.5m lock kick 1 hold/);
    expect(applyScript(base(), { script: printScript(r) }, ctx)).toEqual(r);
    expect(run("follow side").camera!.segments[0].follow).toBeUndefined();
    expect(() => validateRecipe({ ...r, camera: { ...r.camera!, segments: [{ ...r.camera!.segments[0], modes: ["orbit"] }] } })).toThrow(/follow rig/);
  });
});

describe("the rig follows the offset", () => {
  it("follow side: left by default, right when asked, at the distance and height given", () => {
    const left = offsetAt(run("follow side"), 120), right = offsetAt(run("follow side right distance 18m height 3m"), 120);
    expect(left.right).toBeLessThan(-1);
    expect(right.right).toBeGreaterThan(15);
    expect(right.distance).toBeGreaterThan(15); expect(right.distance).toBeLessThan(21);
    expect(right.height).toBeGreaterThan(2.4); expect(right.height).toBeLessThan(3.8);
  });
  it("follow behind: the distance moves it out, the angle turns it around the subject", () => {
    const near = offsetAt(run("follow behind distance 3m"), 120), far = offsetAt(run("follow behind distance 12m"), 120), turned = offsetAt(run("follow behind distance 8m angle 60"), 120);
    expect(near.ahead).toBeLessThan(0); expect(far.ahead).toBeLessThan(near.ahead - 6);
    // + angle turns towards the subject's left (the rig's yaw grows anticlockwise seen from above).
    expect(Math.abs(turned.right)).toBeGreaterThan(4);
  });
  it("a side camera beyond a street's row of blocks, sight passes: the blocks between keep the occlusion caps", () => {
    const r = run("follow side right distance 20m height 2m", "scenery: street sight passes\n");
    const plan = planCamera(r, drive, 200), blocks = placeLandmarks(r, plan, drive), { subject, camera } = scenePaths(r, plan, drive);
    expect(blocks.length).toBeGreaterThan(4);
    const hidden = new Uint8Array(Math.min(subject.length, camera.length));
    for (const b of blocks) for (const i of hiddenSamples(b, subject, camera)) hidden[i] = 1;
    let run1 = 0, longest = 0, total = 0;
    for (const v of hidden) { run1 = v ? run1 + 1 : 0; longest = Math.max(longest, run1); total += v; }
    expect(longest).toBeLessThanOrEqual(Math.floor(PASSES.maxHiddenSeconds * 24 / 2));
    expect(total).toBeLessThanOrEqual(hidden.length * PASSES.maxHiddenShare);
    // The camera stays on the far (right) side, beyond the street's row.
    expect(offsetAt(r, 120).right).toBeGreaterThan(15);
  });
});
