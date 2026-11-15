/**
 * The carry-over rule (docs/recipe.md, "settings lines", rig): frame 0 is the rig start; each block starts where the block
 * before it ended, and a follow offset, a shot preset, a fov or a programmed dolly/rise carries on into every later block
 * until another block changes it. `top`/`above` is the exception: it lifts the camera overhead from the carried values
 * without changing them, so the block after it comes back to the distance and height from before it (its fov carries on).
 */
import { describe, expect, it } from "vitest";
import { applyScript, beatPathBase, cameraAtFrame, frameAt, planCamera } from "../src/internal";

/** Distance (ground plane) and height of the camera from the subject at a beat, and its fov (120 BPM, 24 fps). */
function framing(first: string, second: string, beat: number) {
  const script = `rig: distance 8m height 5m fov 30\nbeats 0-8 | action: walk on path (-10,0) (10,0) | camera: ${first}\nbeats 8-16 | action: continue | camera: ${second}\n`;
  const r = applyScript(beatPathBase({ seconds: 8 }), { script }), n = Math.round(beat / 2 * 24);
  const c = cameraAtFrame(planCamera(r), n), root = frameAt(r, n).root;
  return { d: Math.hypot(c.position[0] - root.x, c.position[2] - root.z), h: c.position[1] - root.y, fov: c.fov };
}
const near = (got: { d: number; h: number; fov: number }, d: number, h: number, fov: number) => {
  expect(got.d).toBeCloseTo(d, 0); expect(got.h).toBeCloseTo(h, 1); expect(got.fov).toBeCloseTo(fov, 1);
};

describe("camera carry-over between blocks", () => {
  it("frame 0 is the rig start", () => near(framing("chase | shot: -", "orbit 70 | shot: -", 0), 8, 5, 30));
  it("a block that sets nothing keeps the rig's framing", () => near(framing("chase | shot: -", "orbit 70 | shot: -", 15.9), 8, 5, 30));
  it("a follow offset carries on into a later orbit (not back to the rig)", () => near(framing("three-quarter distance 3m height 1m | shot: -", "orbit 70 | shot: -", 15.9), 3, 1, 30));
  it("a follow offset carries on into a later follow block", () => near(framing("follow side distance 3m height 1m | shot: -", "follow behind | shot: -", 15.9), 3, 1, 30));
  it("a shot preset carries on", () => near(framing("chase | shot: medium", "orbit 70 | shot: -", 15.9), 4.2, 1.35, 35));
  it("a fov carries on", () => near(framing("chase fov 60 | shot: -", "follow side | shot: -", 15.9), 8, 5, 60));
  it("a programmed dolly's end carries on", () => near(framing("chase + dolly in 3m | shot: -", "follow behind | shot: -", 15.9), 5, 5, 30));
  it("top / above does not: the next block comes back to the framing from before it, with the top block's fov", () => {
    near(framing("above fov 70 | shot: -", "orbit 70 | shot: -", 15.9), 8, 5, 70);
    near(framing("top | shot: -", "follow side | shot: -", 15.9), 8, 5, 30);
  });
});
