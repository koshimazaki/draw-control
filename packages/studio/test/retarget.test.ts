import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MIXAMO_TO_DEF, retargetMixamoClip, sanitise } from "../src/characters/retarget";

/** Joint names of the bundled mannequin, read from the GLB's JSON chunk. */
function mannequinJoints(): string[] {
  const b = readFileSync(new URL("../../../assets/characters/AnimationLibrary.glb", import.meta.url));
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
  return json.skins[0].joints.map((i: number) => json.nodes[i].name);
}

/** A small skeleton: [name, parent, x, y, z, rest rotation about z (radians)]. */
function skeleton(spec: [string, string | null, number, number, number, number][]) {
  const root = new THREE.Group(), bones = new Map<string, THREE.Bone>();
  for (const [name, parent, x, y, z, rz] of spec) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    b.rotation.z = rz;
    (parent ? bones.get(parent)! : root).add(b);
    bones.set(name, b);
  }
  return { root, bones };
}

describe("Mixamo retarget", () => {
  it("maps every Mixamo body and finger bone onto a real DEF bone of the mannequin", () => {
    const joints = new Set(mannequinJoints());
    const targets = Object.values(MIXAMO_TO_DEF);
    expect(targets.length).toBe(52);
    for (const t of targets) expect(joints.has(t), t).toBe(true);
    expect(new Set(targets).size).toBe(targets.length);
    expect(sanitise("DEF-upper_arm.L")).toBe("DEF-upper_armL");
  });

  it("carries each bone's world rotation change across different rest frames (synthetic Mixamo fixture)", () => {
    // Source: Mixamo names in centimetres; target: DEF names in metres with rotated rest frames.
    const src = skeleton([
      ["mixamorigHips", null, 0, 100, 0, 0], ["mixamorigSpine", "mixamorigHips", 0, 10, 0, 0],
      ["mixamorigLeftArm", "mixamorigSpine", 15, 30, 0, 0], ["mixamorigLeftForeArm", "mixamorigLeftArm", 25, 0, 0, 0],
    ]);
    const tgt = skeleton([
      ["root", null, 0, 0, 0, 0], ["DEF-hips", "root", 0, 0.9, 0, 0.3], ["DEF-spine001", "DEF-hips", 0, 0.1, 0, -0.3],
      ["DEF-upper_armL", "DEF-spine001", 0.15, 0.3, 0, -Math.PI / 2], ["DEF-forearmL", "DEF-upper_armL", 0, 0.27, 0, 0.2],
    ]);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.0);   // arm down 57°
    const bend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
    const clip = new THREE.AnimationClip("test", 1, [
      new THREE.QuaternionKeyframeTrack("mixamorigLeftArm.quaternion", [0, 1], [0, 0, 0, 1, ...turn.toArray()]),
      new THREE.QuaternionKeyframeTrack("mixamorigLeftForeArm.quaternion", [0, 1], [0, 0, 0, 1, ...bend.toArray()]),
      new THREE.VectorKeyframeTrack("mixamorigHips.position", [0, 1], [0, 100, 0, 0, 80, 0]),
    ]);
    const { clip: out, report } = retargetMixamoClip(src.root, clip, tgt.root, { fps: 10 });
    expect(report.mapped).toBe(4);
    expect(report.hipsRange[0]).toBeCloseTo(0.9 * 0.8, 3);   // hips drop 20 % of their height, scaled to the target

    // Pose both at the end and compare world rotation changes from rest.
    const restQ = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return o.getWorldQuaternion(new THREE.Quaternion()); };
    const sRest = restQ(src.bones.get("mixamorigForeArm") ?? src.bones.get("mixamorigLeftForeArm")!), tRest = restQ(tgt.bones.get("DEF-forearmL")!);
    const sm = new THREE.AnimationMixer(src.root); const sa = sm.clipAction(clip); sa.play(); sa.time = 1; sm.update(0);
    const tm = new THREE.AnimationMixer(tgt.root); const ta = tm.clipAction(out); ta.play(); ta.time = 1; tm.update(0);
    const sNow = restQ(src.bones.get("mixamorigLeftForeArm")!), tNow = restQ(tgt.bones.get("DEF-forearmL")!);
    const sDelta = sNow.clone().multiply(sRest.clone().invert()), tDelta = tNow.clone().multiply(tRest.clone().invert());
    expect(sDelta.angleTo(tDelta)).toBeLessThan(1e-3);
    expect(sDelta.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.5);
  });
});

describe("an imported clip on the rigged mannequin", () => {
  it("plays at its own length (not the 1 s fallback), driven by a clip move", async () => {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { createRiggedCharacter } = await import("../src/characters/rigged-core");
    const { defaultRiggedRecipe, frameAt, makeClipMove, validateRecipe } = await import("@motion-studio/core");
    const b = readFileSync(new URL("../../../assets/characters/AnimationLibrary.glb", import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "");
    const c = createRiggedCharacter(gltf.scene, gltf.animations);
    const knee = c.rigged.sampler.bones.find(x => x.name === "DEF-shinL")!;
    const bend = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a).toArray();
    // A 2 s clip that bends the knee linearly from 0 to 1 rad.
    c.rigged.sampler.add(new THREE.AnimationClip("mixamo/test", 2, [new THREE.QuaternionKeyframeTrack(`${knee.name}.quaternion`, [0, 2], [...bend(0), ...bend(1)])]));
    const base = defaultRiggedRecipe();
    const r = validateRecipe({ ...base, reactive: undefined, moves: [makeClipMove("mixamo/test", 0, 4, { id: "t" })] });   // 4 beats at 120 BPM = 2 s
    c.apply(frameAt(r, 24));   // 1 s in: halfway
    expect(knee.quaternion.angleTo(new THREE.Quaternion().fromArray(bend(0.5)))).toBeLessThan(0.02);
  });
});
