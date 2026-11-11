/**
 * The rigged mannequin, built from a loaded GLB scene (rigged.ts loads the bundled file).
 * The bundled rigged mannequin (assets/characters/AnimationLibrary.glb: Ecctrl, MIT;
 * animations based on the Quaternius Universal Animation Library, CC0): one skinned mesh
 * on a Rigify-style DEF- skeleton with fingers, and 46 clips. Driven by the engine's clip
 * layers: loops (with per-bone-group lag for overlapping action) scaled by amplitude
 * against the idle pose, then accent clips mixed over them by their weight.
 */
import * as THREE from "three";
import { LOOP_CLIPS, type FrameState } from "@motion-studio/core/internal";
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
    } else applyBones(accents);
    if (state.sync) addSync(state.sync);
  }

  /**
   * Per-bone sync, added on top of the posed clip in the character's own frame (it faces +Z,
   * its left is +X): the head nods forward, the shoulders shrug, the arms pump forward and
   * the hips drop and tilt to alternate sides.
   */
  const SYNC = { head: 14, neck: 5, shoulder: 10, arm: 16, hipsDrop: 0.04, hipsTilt: 5 };
  const byName = (n: string) => sampler.bones.find(b => b.name === n);
  const syncBones = {
    head: byName("DEF-head"), neck: byName("DEF-neck"), shoulderL: byName("DEF-shoulderL"), shoulderR: byName("DEF-shoulderR"),
    armL: byName("DEF-upper_armL"), armR: byName("DEF-upper_armR"),
  };
  const legs = (["L", "R"] as const).map(k => ({ thigh: byName(`DEF-thigh${k}`), shin: byName(`DEF-shin${k}`), foot: byName(`DEF-foot${k}`) }))
    .filter((l): l is { thigh: THREE.Object3D; shin: THREE.Object3D; foot: THREE.Object3D } => !!(l.thigh && l.shin && l.foot));
  /** Turn a bone about a world axis through its own origin (its joint). */
  function rotateWorld(bone: THREE.Object3D, worldAxis: THREE.Vector3, radians: number) {
    if (!Number.isFinite(radians) || Math.abs(radians) < 1e-6 || worldAxis.lengthSq() < 1e-12) return;
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    const turned = new THREE.Quaternion().setFromAxisAngle(worldAxis.clone().normalize(), radians).multiply(world);
    const parent = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    bone.quaternion.copy(parent.invert().multiply(turned));
    bone.updateMatrixWorld(true);
  }
  /** Analytic two-bone IK: bend the knee to reach `target`, aim the thigh at it, keep the foot's world rotation. */
  function twoBoneIk(thigh: THREE.Object3D, shin: THREE.Object3D, foot: THREE.Object3D, target: THREE.Vector3, footQ: THREE.Quaternion) {
    const p = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
    const H = p(thigh), K = p(shin), A = p(foot);
    const l1 = H.distanceTo(K), l2 = K.distanceTo(A), d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, H.distanceTo(target)));
    const now = H.clone().sub(K).angleTo(A.clone().sub(K));
    const want = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
    rotateWorld(shin, A.clone().sub(K).cross(H.clone().sub(K)), now - want);
    const A2 = p(foot);
    rotateWorld(thigh, A2.clone().sub(H).cross(target.clone().sub(H)), A2.clone().sub(H).angleTo(target.clone().sub(H)));
    const parent = foot.parent ? foot.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    foot.quaternion.copy(parent.invert().multiply(footQ));
    foot.updateMatrixWorld(true);
  }
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1), deg = Math.PI / 180;
  function rotateInCharacterFrame(bone: THREE.Object3D | undefined, axis: THREE.Vector3, degrees: number) {
    if (!bone || Math.abs(degrees) < 1e-4) return;
    model.updateMatrixWorld(true);
    const frame = model.getWorldQuaternion(new THREE.Quaternion());
    const worldAxis = axis.clone().applyQuaternion(frame);
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    const turned = new THREE.Quaternion().setFromAxisAngle(worldAxis, degrees * deg).multiply(world);
    const parent = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    bone.quaternion.copy(parent.invert().multiply(turned));
  }
  function addSync(s: NonNullable<FrameState["sync"]>) {
    if (hips && hips.parent && (s.hips > 0 || s.sway !== 0)) {
      model.updateMatrixWorld(true);
      const planted = legs.map(l => ({ ...l, at: l.foot.getWorldPosition(new THREE.Vector3()), q: l.foot.getWorldQuaternion(new THREE.Quaternion()) }));
      model.updateMatrixWorld(true);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
      const p0 = hips.getWorldPosition(new THREE.Vector3());
      const scale = model.getWorldScale(new THREE.Vector3()).y || 1;
      const p1 = p0.clone().addScaledVector(up, -SYNC.hipsDrop * s.hips * scale);
      hips.position.add(hips.parent.worldToLocal(p1).sub(hips.parent.worldToLocal(p0.clone())));
      rotateInCharacterFrame(hips, Z, SYNC.hipsTilt * s.sway);
      // The knees take the drop: each foot goes back where the clip planted it.
      for (const l of planted) twoBoneIk(l.thigh, l.shin, l.foot, l.at, l.q);
    }
    rotateInCharacterFrame(syncBones.neck, X, SYNC.neck * s.head);
    rotateInCharacterFrame(syncBones.head, X, SYNC.head * s.head);
    rotateInCharacterFrame(syncBones.shoulderL, Z, SYNC.shoulder * s.shoulders);
    rotateInCharacterFrame(syncBones.shoulderR, Z, -SYNC.shoulder * s.shoulders);
    rotateInCharacterFrame(syncBones.armL, X, -SYNC.arm * s.arms);
    rotateInCharacterFrame(syncBones.armR, X, -SYNC.arm * s.arms);
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
