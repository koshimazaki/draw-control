/**
 * Samples skeletal clips by hand (no AnimationMixer state): every bone's rotation is
 * evaluated from the clip's keyframe interpolants at an explicit time, so a frame is a
 * pure function of the clip layers the engine hands over. Layers blend by weighted
 * slerp; amplitude scales each bone's offset from an idle reference pose.
 */
import * as THREE from "three";

type BoneTrack = { bone: THREE.Object3D; kind: "quaternion" | "position"; interp: THREE.Interpolant };
export type SampledClip = { name: string; seconds: number; tracks: BoneTrack[] };
export type Layer = { clip: string; time: number; weight: number };

export class ClipSampler {
  readonly clips = new Map<string, SampledClip>();
  /** Bones with at least one track, and their rest transform. */
  readonly bones: THREE.Object3D[] = [];
  private rest = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    const byName = new Map<string, THREE.Object3D>();
    root.traverse(o => byName.set(o.name, o));
    for (const clip of clips) this.add(clip, byName);
    for (const b of this.bones) this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
  }

  /** Register a clip whose track names address bones in this skeleton (`Bone.quaternion`). */
  add(clip: THREE.AnimationClip, byName?: Map<string, THREE.Object3D>) {
    if (!byName) { byName = new Map(); for (const b of this.bones) byName.set(b.name, b); }
    const tracks: BoneTrack[] = [];
    for (const t of clip.tracks) {
      const dot = t.name.lastIndexOf(".");
      const bone = byName.get(t.name.slice(0, dot)), prop = t.name.slice(dot + 1);
      if (!bone || (prop !== "quaternion" && prop !== "position")) continue;
      tracks.push({ bone, kind: prop, interp: (t as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant() });
      if (!this.bones.includes(bone)) { this.bones.push(bone); this.rest.set(bone, { q: bone.quaternion.clone(), p: bone.position.clone() }); }
    }
    this.clips.set(clip.name, { name: clip.name, seconds: clip.duration, tracks });
  }

  restOf(bone: THREE.Object3D) { return this.rest.get(bone)!; }

  /**
   * Blend layers into per-bone rotations and positions. Bones a clip does not key keep
   * the fallback (rest). Returns null when no layer has weight.
   */
  blend(layers: readonly Layer[], out: Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>, bonesFilter?: Set<THREE.Object3D>) {
    const acc = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3; w: number }>();
    const q = new THREE.Quaternion(), p = new THREE.Vector3();
    for (const layer of layers) {
      const clip = this.clips.get(layer.clip);
      if (!clip || layer.weight <= 1e-6) continue;
      const t = Math.max(0, Math.min(clip.seconds, layer.time));
      for (const tr of clip.tracks) {
        if (bonesFilter && !bonesFilter.has(tr.bone)) continue;
        const v = tr.interp.evaluate(t);
        let a = acc.get(tr.bone);
        if (!a) { const r = this.rest.get(tr.bone)!; a = { q: r.q.clone(), p: r.p.clone(), w: 0 }; acc.set(tr.bone, a); }
        if (tr.kind === "quaternion") {
          q.set(v[0], v[1], v[2], v[3]);
          if (a.w === 0) a.q.copy(q); else a.q.slerp(q, layer.weight / (a.w + layer.weight));
        } else {
          p.set(v[0], v[1], v[2]);
          if (a.w === 0) a.p.copy(p); else a.p.lerp(p, layer.weight / (a.w + layer.weight));
        }
      }
      // Weight accumulates once per layer per bone, on its rotation track.
      for (const tr of clip.tracks) { const a = acc.get(tr.bone); if (a && tr.kind === "quaternion") a.w += layer.weight; }
    }
    for (const [bone, a] of acc) out.set(bone, { q: a.q, p: a.p });
    return acc.size > 0;
  }
}
