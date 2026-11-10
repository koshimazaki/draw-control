/**
 * Mixamo bone names, mapped to the recipe joints. Used to recognise a Mixamo-style
 * rig and to keep its clips in place. Driving these bones from recipe poses needs
 * rest-pose retargeting and is a documented next step.
 */
import type * as THREE from "three";
import type { JointName } from "@motion-studio/core";

export const MIXAMO_BONES: Record<JointName, string> = {
  pelvis: "Hips", spine: "Spine", head: "Head",
  leftShoulder: "LeftArm", leftElbow: "LeftForeArm", rightShoulder: "RightArm", rightElbow: "RightForeArm",
  leftHip: "LeftUpLeg", leftKnee: "LeftLeg", rightHip: "RightUpLeg", rightKnee: "RightLeg",
};

/** Strip the usual prefixes: "mixamorig:Hips", "mixamorig1:Hips", "mixamorigHips", "Armature|Hips". */
export const baseBoneName = (name: string) => name.replace(/^.*[:|]/, "").replace(/^mixamorig\d*/i, "");

export function findMixamoBones(root: THREE.Object3D): Partial<Record<JointName, THREE.Object3D>> {
  const byName = new Map<string, THREE.Object3D>();
  root.traverse(o => { if ((o as THREE.Bone).isBone) byName.set(baseBoneName(o.name).toLowerCase(), o); });
  const found: Partial<Record<JointName, THREE.Object3D>> = {};
  for (const [joint, bone] of Object.entries(MIXAMO_BONES) as [JointName, string][]) {
    const o = byName.get(bone.toLowerCase());
    if (o) found[joint] = o;
  }
  return found;
}
