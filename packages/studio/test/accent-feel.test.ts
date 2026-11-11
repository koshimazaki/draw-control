/** Hit harder on the real mannequin: the strike goes further, the feet stay on the floor, no pop. */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { defaultRiggedRecipe, frameAt, riggedMove, setImpact, validateRecipe, type Recipe } from "@motion-studio/core/internal";
import { createRiggedCharacter } from "../src/characters/rigged-core";

async function mannequin() {
  const b = readFileSync(new URL("../../../assets/characters/AnimationLibrary.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "");
  return createRiggedCharacter(gltf.scene, gltf.animations);
}

describe("hit harder (rigged mannequin)", () => {
  it("extends the strike past the clip's key pose and keeps the feet down", async () => {
    const c = await mannequin();
    const r0 = defaultRiggedRecipe();
    const soft: Recipe = validateRecipe({ ...r0, durationBeats: 16, moves: [riggedMove("Idle_Loop", 0)],
      reactive: { ...r0.reactive!, humanise: 0, markers: [{ seconds: 3, accent: "cross", source: "manual" }, { seconds: 5, accent: "jump", source: "manual" }] } });
    const hard = setImpact(setImpact(soft, undefined, 0, 1), undefined, 1, 1);
    const pose = (r: Recipe, n: number) => { c.apply(frameAt(r, n)); c.object.updateMatrixWorld(true); return c.rigged.sampler.bones.map(b => b.quaternion.clone()); };
    const strike = (r: Recipe) => { const a = pose(r, 72 - 4), b = pose(r, 72); return Math.max(...a.map((q, k) => q.angleTo(b[k]))); };
    // The strike (wind-up end to impact) turns some joint further when hitting harder.
    expect(strike(hard)).toBeGreaterThan(strike(soft) * 1.25);
    // Feet: after the landing hit, the hard version runs 3 frames late (the held impact frame);
    // frame for frame against the soft one, the lower foot stays at the same height (the hips drop instead).
    const foot = c.rigged.sampler.bones.filter(b => b.name === "DEF-footL" || b.name === "DEF-footR");
    const low = (r: Recipe, n: number) => { pose(r, n); return Math.min(...foot.map(f => f.getWorldPosition(new THREE.Vector3()).y)); };
    let worst = 0;
    for (let n = 120; n < 140; n++) worst = Math.max(worst, Math.abs(low(hard, n + 3) - low(soft, n)));
    expect(worst).toBeLessThan(0.01);
  });
});
