/**
 * Pose speed for the timeline graph: how fast the character's joints turn, sampled every
 * second frame by posing the character and summing each bone's rotation change.
 * Normalised to 0–1 so it overlays the energy curve: motion following the music shows as
 * the two curves moving together.
 */
import * as THREE from "three";
import { frameAt, type AudioDrive, type Recipe } from "@motion-studio/core/internal";
import type { Character } from "../characters/types";

export function computePoseSpeed(c: Character, recipe: Recipe, drive: AudioDrive | undefined, frames: number): Float32Array {
  const bones: THREE.Object3D[] = [];
  c.object.traverse(o => { if ((o as THREE.Bone).isBone || (o.type === "Group" && o.name && o !== c.object)) bones.push(o); });
  const prev = bones.map(() => new THREE.Quaternion());
  const out = new Float32Array(Math.ceil(frames / 2));
  for (let i = 0; i < out.length; i++) {
    c.apply(frameAt(recipe, i * 2, drive));
    let sum = 0;
    bones.forEach((b, k) => { if (i > 0) sum += prev[k].angleTo(b.quaternion); prev[k].copy(b.quaternion); });
    out[i] = sum;
  }
  if (out.length > 1) out[0] = out[1];
  let max = 0;
  for (const v of out) max = Math.max(max, v);
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}
