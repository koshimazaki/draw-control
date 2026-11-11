/** Per-bone sync on the real mannequin: the head nods on the beat, the feet stay planted, nothing pops. */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { defaultRiggedRecipe, frameAt, riggedMove, validateRecipe, type Recipe } from "@motion-studio/core/internal";
import { createRiggedCharacter } from "../src/characters/rigged-core";

async function mannequin() {
  const b = readFileSync(new URL("../../../assets/characters/AnimationLibrary.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "");
  return createRiggedCharacter(gltf.scene, gltf.animations);
}

describe("per-bone sync (rigged mannequin)", () => {
  it("nods on the beat, keeps the feet where the clip plants them, and never pops", async () => {
    const c = await mannequin();
    const r0 = defaultRiggedRecipe();
    const plain: Recipe = validateRecipe({ ...r0, moves: [riggedMove("Dance_Loop", 0)], reactive: { ...r0.reactive!, accents: [], humanise: 0 } });
    const synced = validateRecipe({ ...plain, reactive: { ...plain.reactive!, sync: { head: 1, shoulders: 1, arms: 1, hips: 1 } } });
    const bones = c.rigged.sampler.bones, head = bones.find(b => b.name === "DEF-head")!;
    const feet = bones.filter(b => b.name === "DEF-footL" || b.name === "DEF-footR");
    const pose = (r: Recipe, n: number) => { c.apply(frameAt(r, n)); c.object.updateMatrixWorld(true); };
    const headQ = (r: Recipe, n: number) => { pose(r, n); return head.getWorldQuaternion(new THREE.Quaternion()); };
    // On beat 8 (frame 96) the head is nodded; half a beat later it is nearly back.
    expect(headQ(synced, 96).angleTo(headQ(plain, 96)) * 180 / Math.PI).toBeGreaterThan(8);
    expect(headQ(synced, 102).angleTo(headQ(plain, 102)) * 180 / Math.PI).toBeLessThan(4);
    let footErr = 0, worstStep = 0;
    const prev = bones.map(() => new THREE.Quaternion());
    for (let n = 0; n < 190; n++) {
      pose(plain, n);
      const want = feet.map(f => f.getWorldPosition(new THREE.Vector3()));
      pose(synced, n);
      feet.forEach((f, k) => { footErr = Math.max(footErr, f.getWorldPosition(new THREE.Vector3()).distanceTo(want[k])); });
      bones.forEach((b, k) => { const q = b.getWorldQuaternion(new THREE.Quaternion()); if (n) worstStep = Math.max(worstStep, q.angleTo(prev[k])); prev[k].copy(q); });
    }
    expect(footErr).toBeLessThan(0.01);
    // The dance alone moves a joint up to about 14 degrees a frame; sync adds little on top.
    expect(worstStep * 180 / Math.PI).toBeLessThan(30);
  });
});
