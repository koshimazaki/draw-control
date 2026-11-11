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
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  const feet = sampler.bones.filter(b => b.name === "DEF-footL" || b.name === "DEF-footR");

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
    const applyBones = (acct: Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>) => {
      for (const bone of sampler.bones) {
        const ref = idle.get(bone) ?? sampler.restOf(bone);
        const loop = loops.get(bone) ?? ref;
        // Amplitude: 0 = idle, 1 = the clip as authored, above 1 exaggerates.
        bone.quaternion.copy(ref.q).slerp(loop.q, amp);
        bone.position.copy(ref.p).lerp(loop.p, amp);
        const acc = acct.get(bone);
        if (acc && aw > 0) { tmpQ.copy(acc.q); bone.quaternion.slerp(tmpQ, aw); bone.position.lerp(acc.p, aw); }
      }
      if (hips) { const r = sampler.restOf(hips).p; hips.position.x = r.x; hips.position.z = r.z; }
    };
    // Hit harder: push the accent pose past the clip, away from the strike's starting pose,
    // then lower the hips so the planted foot stays where the plain strike puts it (a deeper squash).
    const pushed = state.layers.filter(l => l.accent && l.overshoot && l.overshoot.gain > 0);
    if (accentTotal > 0 && pushed.length && hips) {
      applyBones(accents);
      const before = lowestFoot();
      const gain = Math.max(...pushed.map(l => l.overshoot!.gain));
      const refs = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();
      sampler.blend(state.layers.filter(l => l.accent).map(l => ({ clip: l.clip, weight: l.weight / accentTotal, time: l.overshoot?.refTime ?? l.time ?? 0 })), refs);
      const pushedPose = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();
      for (const [bone, acc] of accents) {
        const ref = refs.get(bone);
        pushedPose.set(bone, ref ? { q: ref.q.clone().slerp(acc.q, 1 + gain), p: ref.p.clone().lerp(acc.p, 1 + gain) } : acc);
      }
      applyBones(pushedPose);
      const after = lowestFoot();
      if (before && after && hips.parent) {
        const a = hips.parent.worldToLocal(new THREE.Vector3(0, after, 0)), b = hips.parent.worldToLocal(new THREE.Vector3(0, before, 0));
        hips.position.sub(a.sub(b));   // the parent may be rotated (Z-up armature): move along world up
      }
      return;
    }
    applyBones(accents);
  }
  /** World height of the lower foot, after updating the skeleton's matrices. */
  function lowestFoot(): number | null {
    if (!feet.length) return null;
    model.updateMatrixWorld(true);
    return Math.min(...feet.map(f => f.getWorldPosition(tmpV).y));
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
