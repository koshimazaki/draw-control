/**
 * Numbers behind the Mixamo check verdicts (scripts/mixamo-check.mjs): the retargeted clip
 * on the mannequin's skeleton against the source Mixamo skeleton, sampled at 30 fps.
 * - hips: height range on the mannequin, against its rest height;
 * - feet: drift of a planted foot (within 3 cm of its lowest), on the mannequin and in the
 *   source scaled to the mannequin, so slide the retarget adds is told apart from the
 *   treadmill slide an in-place clip has anyway;
 * - arms: angle between the source and mannequin upper arm and forearm directions;
 * - wrist twist: the hand's twist about the forearm, from rest (candy-wrapper risk);
 * - scale: the source height scaled by the hips ratio, against the mannequin's height.
 */
import * as THREE from "three";
import { baseBoneName } from "./mixamo";
import { sanitise } from "./retarget";
import type { ImportedClip } from "./mixamo-import";

export type MixamoMetrics = {
  name: string; seconds: number; mapped: number; missing: string[];
  hips: { restM: number; minM: number; maxM: number };
  feet: { mannequinCm: number; sourceCm: number };
  arms: { maxDegrees: number };
  wristTwist: { maxDegrees: number };
  scale: { sourceScaledM: number; mannequinM: number; factor: number };
};

const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

export function mixamoMetrics(c: ImportedClip, target: THREE.Object3D): MixamoMetrics {
  const src = new Map<string, THREE.Object3D>(), tgt = new Map<string, THREE.Object3D>();
  c.source.traverse(o => src.set(baseBoneName(o.name), o));
  target.traverse(o => tgt.set(o.name, o));
  const T = (n: string) => tgt.get(sanitise(n)) ?? tgt.get(n);
  const pos = (o: THREE.Object3D | undefined) => (o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3());
  c.source.updateMatrixWorld(true); target.updateMatrixWorld(true);
  const tgtRest = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  target.traverse(o => tgtRest.set(o, { q: o.quaternion.clone(), p: o.position.clone() }));
  const srcHipsRest = pos(src.get("Hips")).y, tgtHipsRest = pos(T("DEF-hips")).y;
  const scale = srcHipsRest > 0 ? tgtHipsRest / srcHipsRest : 1;
  const srcTop = pos(src.get("HeadTop_End") ?? src.get("Head")).y - Math.min(pos(src.get("LeftToe_End") ?? src.get("LeftFoot")).y, 0);
  const box = new THREE.Box3().setFromObject(target);
  const restWorldQ = (o?: THREE.Object3D) => (o ? o.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion());
  const restFore = { L: restWorldQ(T("DEF-forearm.L")), R: restWorldQ(T("DEF-forearm.R")) };
  const restHand = { L: restWorldQ(T("DEF-hand.L")), R: restWorldQ(T("DEF-hand.R")) };

  const sm = new THREE.AnimationMixer(c.source), sa = sm.clipAction(c.sourceClip); sa.play();
  const tm = new THREE.AnimationMixer(target), ta = tm.clipAction(c.clip); ta.play();
  const frames = Math.max(2, Math.round(c.seconds * 30));
  let hMin = Infinity, hMax = -Infinity, armMax = 0, twistMax = 0;
  const feet: Record<string, { t: THREE.Vector3[]; s: THREE.Vector3[] }> = { L: { t: [], s: [] }, R: { t: [], s: [] } };
  const dirAngle = (a1: THREE.Vector3, a2: THREE.Vector3, b1: THREE.Vector3, b2: THREE.Vector3) => a2.clone().sub(a1).angleTo(b2.clone().sub(b1)) * 180 / Math.PI;
  for (let f = 0; f <= frames; f++) {
    const t = Math.min(c.seconds, f / 30);
    sa.time = t; sm.update(0); ta.time = t; tm.update(0);
    c.source.updateMatrixWorld(true); target.updateMatrixWorld(true);
    const hy = pos(T("DEF-hips")).y; hMin = Math.min(hMin, hy); hMax = Math.max(hMax, hy);
    for (const [side, mx] of [["L", "Left"], ["R", "Right"]] as const) {
      feet[side].t.push(pos(T(`DEF-foot.${side}`)));
      feet[side].s.push(pos(src.get(`${mx}Foot`)).multiplyScalar(scale));
      armMax = Math.max(armMax,
        dirAngle(pos(T(`DEF-upper_arm.${side}`)), pos(T(`DEF-forearm.${side}`)), pos(src.get(`${mx}Arm`)), pos(src.get(`${mx}ForeArm`))),
        dirAngle(pos(T(`DEF-forearm.${side}`)), pos(T(`DEF-hand.${side}`)), pos(src.get(`${mx}ForeArm`)), pos(src.get(`${mx}Hand`))));
      // Twist of the hand about the forearm's axis (bone +Y), relative to the rest pose.
      const fore = restWorldQ(T(`DEF-forearm.${side}`)).multiply(restFore[side].clone().invert());
      const hand = restWorldQ(T(`DEF-hand.${side}`)).multiply(restHand[side].clone().invert());
      const rel = fore.clone().invert().multiply(hand);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(restFore[side]);
      const twist = Math.abs(2 * Math.atan2(new THREE.Vector3(rel.x, rel.y, rel.z).dot(axis), rel.w)) * 180 / Math.PI;
      twistMax = Math.max(twistMax, twist > 180 ? 360 - twist : twist);
    }
  }
  sa.stop(); ta.stop();
  for (const [o, v] of tgtRest) { o.quaternion.copy(v.q); o.position.copy(v.p); }
  target.updateMatrixWorld(true);
  /** Largest horizontal drift within one planted run (foot within 3 cm of its lowest). */
  const drift = (ps: THREE.Vector3[]) => {
    const low = Math.min(...ps.map(p => p.y));
    let best = 0, start: THREE.Vector3 | null = null;
    for (const p of ps) {
      if (p.y < low + 0.03) { start ??= p; best = Math.max(best, Math.hypot(p.x - start.x, p.z - start.z)); } else start = null;
    }
    return best;
  };
  return {
    name: c.name, seconds: r(c.seconds, 2), mapped: c.report.mapped, missing: c.report.missing,
    hips: { restM: r(tgtHipsRest), minM: r(hMin), maxM: r(hMax) },
    feet: { mannequinCm: r(Math.max(drift(feet.L.t), drift(feet.R.t)) * 100, 1), sourceCm: r(Math.max(drift(feet.L.s), drift(feet.R.s)) * 100, 1) },
    arms: { maxDegrees: r(armMax, 1) },
    wristTwist: { maxDegrees: r(twistMax, 1) },
    scale: { sourceScaledM: r(srcTop * scale), mannequinM: r(box.max.y - box.min.y), factor: r(scale, 5) },
  };
}
