/**
 * The rigged mannequin, built from a loaded GLB scene (rigged.ts loads the bundled file).
 * The bundled rigged mannequin (assets/characters/AnimationLibrary.glb: Ecctrl, MIT;
 * animations based on the Quaternius Universal Animation Library, CC0): one skinned mesh
 * on a Rigify-style DEF- skeleton with fingers, and 46 clips. Driven by the engine's clip
 * layers: loops (with per-bone-group lag for overlapping action) scaled by amplitude
 * against the idle pose, then accent clips mixed over them by their weight.
 */
import * as THREE from "three";
import { LOOP_CLIPS, type FrameState } from "@motion-studio/core";
import { ClipSampler, type Layer } from "./clip-sampler";
import type { Character } from "./types";

/** DEF bone (sanitised name) to lag group; unlisted bones (hips, legs) lead. */
export function boneGroup(name: string): string | null {
  if (/^DEF-spine/.test(name)) return "spine";
  if (/^DEF-(neck|head)/.test(name)) return "head";
  if (/^DEF-(shoulder|upper_arm)/.test(name)) return "shoulder";
  if (/^DEF-(forearm|hand|f_|thumb)/.test(name)) return "arm";
  return null;
}

export type RiggedExtras = {
  sampler: ClipSampler;
  skinned: THREE.SkinnedMesh;
  model: THREE.Object3D;
  /** Pose the skeleton for a frame without touching anything else (ghosts, arcs). */
  poseSkeleton(state: FrameState): void;
};
export type RiggedCharacter = Character & { rigged: RiggedExtras };

/** Engine layers to sampler layers; a clip without a library entry (an imported Mixamo clip) uses its own length. */
const toLayers = (sampler: ClipSampler, layers: FrameState["layers"], accent: boolean): Layer[] => layers.filter(l => !!l.accent === accent).map(l => {
  const seconds = LOOP_CLIPS[l.clip]?.seconds ?? sampler.clips.get(l.clip)?.seconds ?? 1;
  return { clip: l.clip, weight: l.weight, time: l.time ?? l.cyclePhase * seconds };
});

/** Build the character from a scene of its own (clone it first when the GLB is shared). */
export function createRiggedCharacter(model: THREE.Object3D, clips: THREE.AnimationClip[]): RiggedCharacter {
  let skinned: THREE.SkinnedMesh | null = null;
  const plain = new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.62, metalness: 0 });
  model.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
    if (o instanceof THREE.Mesh) { o.material = plain; o.castShadow = true; o.frustumCulled = false; }
  });
  if (!skinned) throw new Error("AnimationLibrary.glb has no skinned mesh");
  const sampler = new ClipSampler(model, clips);
  const groups = new Map<THREE.Object3D, string | null>(sampler.bones.map(b => [b, boneGroup(b.name)]));
  const hips = sampler.bones.find(b => b.name === "DEF-hips");
  const tmpQ = new THREE.Quaternion();

  function poseSkeleton(state: FrameState) {
    const amp = state.amplitude ?? 1;
    const idle = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();
    sampler.blend([{ clip: "Idle_Loop", time: state.seconds % 2.5, weight: 1 }], idle);
    const base = toLayers(sampler, state.layers, false);
    const loops = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();
    sampler.blend(base, loops);
    for (const lag of state.lagged ?? []) {
      const subset = new Set(sampler.bones.filter(b => groups.get(b) === lag.group));
      sampler.blend(toLayers(sampler, lag.layers, false), loops, subset);
    }
    const accentLayers = toLayers(sampler, state.layers, true);
    const accents = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();
    let accentTotal = 0;
    for (const l of accentLayers) accentTotal += l.weight;
    if (accentTotal > 0) sampler.blend(accentLayers.map(l => ({ ...l, weight: l.weight / accentTotal })), accents);
    const aw = Math.min(1, accentTotal);
    for (const bone of sampler.bones) {
      const ref = idle.get(bone) ?? sampler.restOf(bone);
      const loop = loops.get(bone) ?? ref;
      // Amplitude: 0 = idle, 1 = the clip as authored, above 1 exaggerates.
      bone.quaternion.copy(ref.q).slerp(loop.q, amp);
      bone.position.copy(ref.p).lerp(loop.p, amp);
      const acc = accents.get(bone);
      if (acc && aw > 0) { tmpQ.copy(acc.q); bone.quaternion.slerp(tmpQ, aw); bone.position.lerp(acc.p, aw); }
    }
    // In place: the recipe root path owns travel; the clip keeps its hip height.
    if (hips) { const r = sampler.restOf(hips).p; hips.position.x = r.x; hips.position.z = r.z; }
  }

  return {
    kind: "rigged",
    object: model,
    clips: [...sampler.clips.values()].map(c => ({ name: c.name, seconds: c.seconds })),
    apply: poseSkeleton,
    dispose() { plain.dispose(); },
    rigged: { sampler, skinned, model, poseSkeleton },
  };
}
