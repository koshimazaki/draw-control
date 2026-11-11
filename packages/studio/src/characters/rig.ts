/**
 * Procedural characters: the jointed mannequin and the block figure share one joint
 * hierarchy, so a recipe pose drives both. Neutral by design: plain light matte limbs,
 * no texture, and dark slate joints, so a video model reads a jointed human placeholder
 * against either background. Arms hang clear of the torso so the silhouette separates.
 */
import * as THREE from "three";
import { JOINTS, type FrameState, type JointName } from "@motion-studio/core/internal";
import type { Character } from "./types";
import { createAbstractFigure } from "./abstract";
import { DIMS } from "./dims";

type Style = "mannequin" | "block";

function materials(style: Style) {
  // Limbs light, joints a dark slate: high contrast with each other and with mid grey.
  const body = new THREE.MeshStandardMaterial({ color: style === "mannequin" ? 0xe6e2da : 0xd6dbe0, roughness: 0.62, metalness: 0 });
  const joint = new THREE.MeshStandardMaterial({ color: style === "mannequin" ? 0x3b3f46 : 0x4a525c, roughness: 0.55, metalness: 0 });
  return { body, joint };
}

/** A limb segment pointing down from its joint, `length` long. */
function segment(style: Style, length: number, radius: number, mat: THREE.Material): THREE.Mesh {
  const geo = style === "mannequin"
    ? new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 6, 14)
    : new THREE.BoxGeometry(radius * 2.1, length * 0.94, radius * 2.1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -length / 2;
  return mesh;
}

function jointBall(style: Style, radius: number, mat: THREE.Material): THREE.Object3D {
  if (style === "block") return new THREE.Group();
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), mat);
}

export function createProceduralCharacter(style: Style | "stick" | "blob"): Character {
  if (style === "stick" || style === "blob") return createAbstractFigure(style);
  const { body, joint } = materials(style);
  const root = new THREE.Group();
  root.name = style;
  const j = {} as Record<JointName, THREE.Group>;
  const group = (name: JointName, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    j[name] = g;
    return g;
  };
  const add = (parent: THREE.Object3D, obj: THREE.Object3D, x = 0, y = 0, z = 0) => { obj.position.add(new THREE.Vector3(x, y, z)); parent.add(obj); return obj; };

  const pelvis = group("pelvis", root, 0, DIMS.pelvisY);
  add(pelvis, style === "mannequin" ? new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12).scale(1, 0.62, 0.75), body) : new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.2), body));
  const spine = group("spine", pelvis, 0, DIMS.spineUp);
  add(spine, jointBall(style, 0.075, joint));
  const torso = style === "mannequin"
    ? new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.2, 6, 16).scale(1.05, 1, 0.72), body)
    : new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.22), body);
  add(spine, torso, 0, DIMS.torso / 2 + 0.03);
  const head = group("head", spine, 0, DIMS.neck);
  add(head, style === "mannequin" ? new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12), joint) : new THREE.Group(), 0, 0.02);
  const skull = style === "mannequin"
    ? new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16).scale(0.9, 1.12, 1), body)
    : new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.22), body);
  add(head, skull, 0, 0.16);
  // A small nose in the body colour marks the facing direction by shading alone, so it
  // does not read as an eye or a face.
  add(head, new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), body), 0, 0.15, 0.105);

  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    const shoulder = group(`${side}Shoulder`, spine, sign * DIMS.shoulderX, DIMS.shoulderY);
    add(shoulder, jointBall(style, 0.055, joint));
    add(shoulder, segment(style, DIMS.upperArm, 0.045, body));
    const elbow = group(`${side}Elbow`, shoulder, 0, -DIMS.upperArm);
    add(elbow, jointBall(style, 0.045, joint));
    add(elbow, segment(style, DIMS.forearm, 0.038, body));
    add(elbow, style === "mannequin" ? new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10).scale(0.8, 1.1, 0.6), body) : new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.05), body), 0, -DIMS.forearm - 0.05);
    const hip = group(`${side}Hip`, pelvis, sign * DIMS.hipX, DIMS.hipY);
    add(hip, jointBall(style, 0.07, joint));
    add(hip, segment(style, DIMS.thigh, 0.065, body));
    const knee = group(`${side}Knee`, hip, 0, -DIMS.thigh);
    add(knee, jointBall(style, 0.058, joint));
    add(knee, segment(style, DIMS.shin, 0.05, body));
    add(knee, jointBall(style, 0.045, joint), 0, -DIMS.shin);
    add(knee, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.24), body), 0, -DIMS.shin - 0.035, 0.06);
  }
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; } });

  return {
    kind: style,
    object: root,
    clips: [],
    apply(state: FrameState) {
      for (const name of JOINTS) {
        const [x, y, z] = state.pose.joints[name];
        j[name].rotation.set(x, y, z);
      }
      j.pelvis.position.y = DIMS.pelvisY + state.pose.rootY;
    },
    dispose() {
      root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      body.dispose();
      joint.dispose();
    },
  };
}
