/**
 * Energy must visibly drive the rigged mannequin: the same move at energy 0.2 and 0.9,
 * sampled from the real clips, differs in pose speed (rate) and joint angle range
 * (amplitude).
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { defaultRiggedRecipe, frameAt, riggedMove, validateRecipe, type AudioDrive } from "@motion-studio/core";
import { createRiggedCharacter } from "../src/characters/rigged-core";

async function mannequin() {
  const b = readFileSync(new URL("../../../assets/characters/AnimationLibrary.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "");
  return createRiggedCharacter(gltf.scene, gltf.animations);
}
const flat = (e: number): AudioDrive => ({ fps: 24, energy: new Float32Array(600).fill(e), onsets: [], source: "audio" });

describe("energy drives the rigged mannequin", () => {
  it("moves faster and bigger at energy 0.9 than at 0.2", async () => {
    const c = await mannequin();
    const base = defaultRiggedRecipe();
    const recipe = validateRecipe({ ...base, durationBeats: 16, moves: [riggedMove("Dance_Loop", 0)],
      reactive: { ...base.reactive!, accents: [], humanise: 0 } });
    const bones = c.rigged.sampler.bones;
    const knee = bones.find(b => b.name === "DEF-shinL")!, arm = bones.find(b => b.name === "DEF-upper_armL")!, hips = bones.find(b => b.name === "DEF-hips")!;
    const measure = (e: number) => {
      const d = flat(e), prev = bones.map(() => new THREE.Quaternion());
      let speed = 0;
      const range = { knee: [Infinity, -Infinity], arm: [Infinity, -Infinity], hipsY: [Infinity, -Infinity] };
      const kneeRest = c.rigged.sampler.restOf(knee).q, armRest = c.rigged.sampler.restOf(arm).q;
      const track = (r: number[], v: number) => { r[0] = Math.min(r[0], v); r[1] = Math.max(r[1], v); };
      for (let n = 48; n < 144; n++) {
        c.apply(frameAt(recipe, n, d));
        bones.forEach((b, k) => { if (n > 48) speed += prev[k].angleTo(b.quaternion); prev[k].copy(b.quaternion); });
        track(range.knee, knee.quaternion.angleTo(kneeRest));
        track(range.arm, arm.quaternion.angleTo(armRest));
        track(range.hipsY, hips.position.length());
      }
      const span = (r: number[]) => r[1] - r[0];
      return { speed, knee: span(range.knee), arm: span(range.arm), hips: span(range.hipsY) };
    };
    const quiet = measure(0.2), loud = measure(0.9);
    expect(loud.speed).toBeGreaterThan(quiet.speed * 1.8);
    expect(loud.knee).toBeGreaterThan(quiet.knee * 1.4);
    expect(loud.arm).toBeGreaterThan(quiet.arm * 1.4);
    expect(loud.hips).toBeGreaterThan(quiet.hips * 1.4);
  });
});
