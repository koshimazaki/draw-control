/**
 * A local GLB or FBX with a skeleton, playing its own embedded clips. Nothing is
 * bundled: the file comes from the user's disk and never leaves the browser.
 * Clip layers from the engine set each action's time and weight directly, so a
 * frame depends only on the recipe (random access, no accumulated mixer time).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { FrameState } from "@motion-studio/core/internal";
import { findMixamoBones, MIXAMO_BONES } from "./mixamo";
import type { Character } from "./types";

const MAX_BYTES = 150 * 1024 * 1024;

function disposeTree(root: THREE.Object3D) {
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) m.dispose();
  });
}

export async function loadFileCharacter(file: File, opts: { neutralMaterial: boolean }): Promise<Character> {
  if (file.size > MAX_BYTES) throw new Error("Keep character files below 150 MB.");
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext !== "glb" && ext !== "gltf" && ext !== "fbx") throw new Error("Load a .glb or .fbx file that contains a skinned character.");
  const url = URL.createObjectURL(file);
  let model: THREE.Object3D;
  let clips: THREE.AnimationClip[];
  try {
    if (ext === "fbx") { const fbx = await new FBXLoader().loadAsync(url); model = fbx; clips = fbx.animations; }
    else { const gltf = await new GLTFLoader().loadAsync(url); model = gltf.scene; clips = gltf.animations; }
  } finally { URL.revokeObjectURL(url); }

  let hasSkin = false;
  model.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true; });
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height < 1e-5) {
    disposeTree(model);
    throw new Error("This file has no visible character. An animation-only FBX needs a skinned export (with skin).");
  }
  if (opts.neutralMaterial) {
    const plain = new THREE.MeshStandardMaterial({ color: 0xebe8e2, roughness: 0.85, metalness: 0 });
    model.traverse(o => { if (o instanceof THREE.Mesh) o.material = plain; });
  }
  // Normalise a wrapper to 1.8 m tall, feet on the floor, so keyed bone transforms stay untouched.
  const factor = 1.8 / height;
  const wrapper = new THREE.Group();
  wrapper.name = "file-character";
  wrapper.scale.setScalar(factor);
  wrapper.position.set(-(bounds.min.x + bounds.max.x) / 2 * factor, -bounds.min.y * factor, -(bounds.min.z + bounds.max.z) / 2 * factor);
  wrapper.add(model);
  model.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.frustumCulled = false; } });

  const usable = clips.filter(c => c.duration > 0 && c.tracks.length > 0);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(usable.map(c => {
    const a = mixer.clipAction(c);
    a.play();
    a.setEffectiveWeight(0);
    return [c.name || "clip", { action: a, clip: c }] as const;
  }));
  const bones = findMixamoBones(model);
  const hips = bones.pelvis;
  const hipsRest = hips?.position.clone();

  return {
    kind: "file",
    object: wrapper,
    clips: [...actions.entries()].map(([name, { clip }]) => ({ name, seconds: clip.duration })),
    mixamo: hasSkin ? { mapped: Object.keys(bones).length, total: Object.keys(MIXAMO_BONES).length } : undefined,
    apply(state: FrameState) {
      for (const { action } of actions.values()) action.setEffectiveWeight(0);
      for (const layer of state.layers) {
        const entry = actions.get(layer.clip);
        if (!entry) continue;
        entry.action.time = layer.cyclePhase * entry.clip.duration;
        entry.action.setEffectiveWeight(layer.weight);
      }
      // With every weight at 0 the property mixer falls back to the rest pose.
      mixer.update(0);
      // Keep clips in place: the recipe root path owns travel, not the clip's hips.
      if (hips && hipsRest) { hips.position.x = hipsRest.x; hips.position.z = hipsRest.z; }
    },
    dispose() { mixer.stopAllAction(); disposeTree(model); },
  };
}
