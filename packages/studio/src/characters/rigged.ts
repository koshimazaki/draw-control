/**
 * Loads the bundled rigged mannequin (assets/characters/AnimationLibrary.glb: Ecctrl, MIT;
 * animations based on the Quaternius Universal Animation Library, CC0) once, and builds
 * a character from a clone of it. See rigged-core.ts for how it is driven.
 */
import type * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import glbUrl from "../../../../assets/characters/AnimationLibrary.glb?url";
import { createRiggedCharacter, type RiggedCharacter } from "./rigged-core";

export { boneGroup, type RiggedCharacter } from "./rigged-core";

let cache: Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> | null = null;
const loadGlb = () => (cache ??= new GLTFLoader().loadAsync(glbUrl).then(g => ({ scene: g.scene, clips: g.animations })));

export async function loadRiggedCharacter(): Promise<RiggedCharacter> {
  const { scene, clips } = await loadGlb();
  return createRiggedCharacter(clone(scene), clips);
}

/** An unposed copy of the mannequin's skeleton (retarget target). */
export async function riggedBindScene(): Promise<THREE.Object3D> {
  return clone((await loadGlb()).scene);
}
