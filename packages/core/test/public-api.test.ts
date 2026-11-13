/**
 * Another app's view of the package: only the public entry, by package name (through the
 * `exports` map), in Node with no DOM. Builds a recipe from a shot script and reads frames
 * and the camera from it, as a Three.js or React Three Fiber app would each frame.
 */
import { describe, expect, it } from "vitest";
import * as core from "@motion-studio/core";
import { applyScript, defaultRiggedRecipe, describeRecipe, frameAt, planCamera, printScript, validateRecipe, cameraAtFrame } from "@motion-studio/core";

describe("@motion-studio/core public entry", () => {
  it("runs with no DOM", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
  });
  it("exports the public names and nothing from the studio", () => {
    for (const k of ["validateRecipe", "frameAt", "applyMotionCommand", "applyCommands", "applyScript", "printScript", "describeRecipe", "beatAtSeconds", "bandOnsets", "analyseSamples", "planCamera", "CAMERA_MODES", "encodeWav"])
      expect(typeof (core as Record<string, unknown>)[k]).not.toBe("undefined");
    expect(Object.keys(core).length).toBeLessThan(115);   // grew with Beat Path (scenery, figure shapes, grooves, freezes, corners)
  });
  it("a script in, frames and camera samples out", () => {
    const r = applyScript(defaultRiggedRecipe(), { script: [
      "beats 0-8 | action: glide on path (0,0) (3,0) (3,2,0.4) | camera: chase | shot: medium",
      "beats 8-16 | action: dance | camera: orbit 360 | shot: wide",
    ].join("\n") });
    expect(validateRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
    const frames = [0, 48, 96, 144].map(n => frameAt(r, n));
    expect(frames[2].root.x).toBeCloseTo(3, 1);
    expect(frames.every(f => Number.isFinite(f.root.x) && Array.isArray(f.layers))).toBe(true);
    const plan = planCamera(r);
    expect(cameraAtFrame(plan, 100).position).toHaveLength(3);
    expect(printScript(r)).toContain("glide on path (0,0) (3,0) (3,2,0.4)");
    expect(describeRecipe(r)).toMatch(/Camera rig/);
  });
});
