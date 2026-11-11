/**
 * Retarget the user's own Mixamo clips onto the rigged mannequin (Mixamo bone names to the
 * Rigify-style DEF skeleton). Per frame, each mapped bone takes the source bone's world
 * rotation change from its rest pose, applied to the target bone's rest in world space,
 * then converted back to the target's local space (parents first). Both rests are
 * T-poses (Mixamo's bind pose and the mannequin's bind pose), so arms line up. Hips
 * height follows the source, scaled by leg length; travel (if any) is reported, and the
 * engine keeps clips in place. Mixamo files are never bundled: they come from the user's
 * disk (assets-local/mixamo/ in dev, or drag and drop) and stay in the browser.
 */
import * as THREE from "three";
import { baseBoneName } from "./mixamo";

const SIDES: [string, string][] = [["Left", "L"], ["Right", "R"]];
const FINGERS: [string, string][] = [["Index", "f_index"], ["Middle", "f_middle"], ["Ring", "f_ring"], ["Pinky", "f_pinky"], ["Thumb", "thumb"]];

/** Mixamo bone (without the mixamorig prefix) to the mannequin's DEF bone (glTF name, dots kept). */
export const MIXAMO_TO_DEF: Record<string, string> = (() => {
  const m: Record<string, string> = {
    Hips: "DEF-hips", Spine: "DEF-spine.001", Spine1: "DEF-spine.002", Spine2: "DEF-spine.003", Neck: "DEF-neck", Head: "DEF-head",
  };
  for (const [side, s] of SIDES) {
    Object.assign(m, {
      [`${side}Shoulder`]: `DEF-shoulder.${s}`, [`${side}Arm`]: `DEF-upper_arm.${s}`, [`${side}ForeArm`]: `DEF-forearm.${s}`, [`${side}Hand`]: `DEF-hand.${s}`,
      [`${side}UpLeg`]: `DEF-thigh.${s}`, [`${side}Leg`]: `DEF-shin.${s}`, [`${side}Foot`]: `DEF-foot.${s}`, [`${side}ToeBase`]: `DEF-toe.${s}`,
    });
    for (const [f, d] of FINGERS) for (const k of [1, 2, 3]) m[`${side}Hand${f}${k}`] = `DEF-${d}.0${k}.${s}`;
  }
  return m;
})();

/** glTF loaders strip dots from node names; match either form. */
export const sanitise = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name);

export type RetargetReport = { mapped: number; missing: string[]; travelMetres: number; hipsRange: [number, number] };

export function retargetMixamoClip(source: THREE.Object3D, clip: THREE.AnimationClip, target: THREE.Object3D, opts: { fps?: number; name?: string } = {}): { clip: THREE.AnimationClip; report: RetargetReport } {
  const fps = opts.fps ?? 30;
  const srcBones = new Map<string, THREE.Object3D>();
  source.traverse(o => { if ((o as THREE.Bone).isBone || /mixamorig/i.test(o.name)) srcBones.set(baseBoneName(o.name), o); });
  const tgtByName = new Map<string, THREE.Object3D>();
  target.traverse(o => tgtByName.set(o.name, o));
  const pairs: { src: THREE.Object3D; tgt: THREE.Object3D }[] = [];
  const missing: string[] = [];
  for (const [mx, def] of Object.entries(MIXAMO_TO_DEF)) {
    const src = srcBones.get(mx), tgt = tgtByName.get(sanitise(def)) ?? tgtByName.get(def);
    if (src && tgt) pairs.push({ src, tgt }); else missing.push(mx);
  }
  // Parents before children, so each target bone sees its parent's new world rotation.
  const depth = (o: THREE.Object3D) => { let d = 0; for (let p = o.parent; p; p = p.parent) d++; return d; };
  pairs.sort((a, b) => depth(a.tgt) - depth(b.tgt));

  const restLocal = new Map(pairs.map(p => [p.tgt, { q: p.tgt.quaternion.clone(), pos: p.tgt.position.clone() }]));
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  const srcRest = new Map(pairs.map(p => [p.src, wq(p.src)]));
  const tgtRest = new Map(pairs.map(p => [p.tgt, wq(p.tgt)]));
  const srcHips = srcBones.get("Hips"), tgtHips = tgtByName.get(sanitise("DEF-hips"));
  const srcHipsRest = srcHips ? srcHips.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  const tgtHipsRest = tgtHips ? tgtHips.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  const scale = srcHipsRest.y > 0 ? tgtHipsRest.y / srcHipsRest.y : 1;

  const mixer = new THREE.AnimationMixer(source);
  const action = mixer.clipAction(clip);
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = Array.from({ length: frames }, (_, i) => Math.min(clip.duration, i / fps));
  const qValues = new Map(pairs.map(p => [p.tgt, new Float32Array(frames * 4)]));
  const hipsPos = new Float32Array(frames * 3);
  let travel = 0, minY = Infinity, maxY = -Infinity;
  const first = new THREE.Vector3(), cur = new THREE.Vector3(), q = new THREE.Quaternion(), pq = new THREE.Quaternion();
  for (let f = 0; f < frames; f++) {
    action.time = times[f];
    mixer.update(0);
    source.updateMatrixWorld(true);
    for (const { src, tgt } of pairs) {
      // world target = (source world · source rest⁻¹) · target rest
      q.copy(wq(src)).multiply(srcRest.get(src)!.clone().invert()).multiply(tgtRest.get(tgt)!);
      if (tgt.parent) tgt.parent.getWorldQuaternion(pq); else pq.identity();
      tgt.quaternion.copy(pq.invert().multiply(q));
      tgt.updateMatrixWorld(true);
      tgt.quaternion.toArray(qValues.get(tgt)!, f * 4);
    }
    if (srcHips && tgtHips) {
      srcHips.getWorldPosition(cur);
      if (f === 0) first.copy(cur);
      travel = Math.max(travel, Math.hypot(cur.x - first.x, cur.z - first.z) * scale);
      const worldWanted = tgtHipsRest.clone().add(cur.clone().sub(srcHipsRest).multiplyScalar(scale));
      const local = tgtHips.parent ? tgtHips.parent.worldToLocal(worldWanted.clone()) : worldWanted;
      local.toArray(hipsPos, f * 3);
      minY = Math.min(minY, worldWanted.y); maxY = Math.max(maxY, worldWanted.y);
    }
  }
  action.stop();
  for (const [bone, r] of restLocal) { bone.quaternion.copy(r.q); bone.position.copy(r.pos); }
  target.updateMatrixWorld(true);
  const tracks: THREE.KeyframeTrack[] = [...qValues].map(([bone, v]) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, Array.from(v)));
  if (tgtHips) tracks.push(new THREE.VectorKeyframeTrack(`${tgtHips.name}.position`, times, Array.from(hipsPos)));
  return {
    clip: new THREE.AnimationClip(opts.name ?? clip.name, clip.duration, tracks),
    report: { mapped: pairs.length, missing, travelMetres: Math.round(travel * 1000) / 1000, hipsRange: [Math.round(minY * 1000) / 1000, Math.round(maxY * 1000) / 1000] },
  };
}
