/**
 * Two more abstract procedural figures on the same joint hierarchy as the mannequin, so the
 * same recipe pose drives them: a stick figure (dark lines between the joints, a white dot
 * on every joint, a ring for the head) and a capsule figure (soft overlapping capsules with
 * no visible joints). They let the owner test which abstraction a video model follows best.
 */
import * as THREE from "three";
import { JOINTS, type FrameState, type JointName } from "@motion-studio/core/internal";
import type { Character } from "./types";
import { DIMS } from "./dims";

type Look = "stick" | "blob";

/** A capsule (or a stick) from a joint's origin down `length`, `overhang` past both ends. */
function limb(length: number, radius: number, mat: THREE.Material, overhang = 0): THREE.Mesh {
  const total = length + 2 * overhang;
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, total - radius * 2), 6, 16), mat);
  mesh.position.y = -length / 2;
  return mesh;
}

/** A capsule between two points in a joint's frame. */
function bone(from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const d = to.clone().sub(from), len = d.length();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2 + radius * 2 * 0.6), 6, 16), mat);
  mesh.position.copy(from).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return mesh;
}

export function createAbstractFigure(look: Look): Character {
  const stick = look === "stick";
  const line = new THREE.MeshStandardMaterial({ color: stick ? 0x1d1f24 : 0xe6e2da, roughness: stick ? 0.8 : 0.55, metalness: 0 });
  const dot = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5, metalness: 0, emissive: stick ? 0x303030 : 0x000000 });
  const r = (stickR: number, blobR: number) => (stick ? stickR : blobR);
  const root = new THREE.Group();
  root.name = look;
  const j = {} as Record<JointName, THREE.Group>;
  const group = (name: JointName, parent: THREE.Object3D, x: number, y: number) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, 0);
    parent.add(g);
    j[name] = g;
    return g;
  };
  const jointDot = (parent: THREE.Object3D, y = 0) => {
    if (!stick) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), dot);
    m.position.y = y;
    parent.add(m);
  };
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

  const pelvis = group("pelvis", root, 0, DIMS.pelvisY);
  const spine = group("spine", pelvis, 0, DIMS.spineUp);
  // Torso: a spine line (stick) or one soft capsule from the hips to the shoulders (blob).
  spine.add(bone(V(0, -DIMS.spineUp), V(0, DIMS.shoulderY), r(0.016, 0.15), line));
  if (stick) {
    spine.add(bone(V(-DIMS.shoulderX, DIMS.shoulderY), V(DIMS.shoulderX, DIMS.shoulderY), 0.016, line));
    pelvis.add(bone(V(-DIMS.hipX, DIMS.hipY), V(DIMS.hipX, DIMS.hipY), 0.016, line));
  } else {
    spine.add(bone(V(-DIMS.shoulderX * 0.75, DIMS.shoulderY - 0.02), V(DIMS.shoulderX * 0.75, DIMS.shoulderY - 0.02), 0.085, line));
    pelvis.add(bone(V(-DIMS.hipX * 1.2, DIMS.hipY + 0.04), V(DIMS.hipX * 1.2, DIMS.hipY + 0.04), 0.12, line));
  }
  jointDot(pelvis); jointDot(spine);
  const head = group("head", spine, 0, DIMS.neck);
  head.add(bone(V(0, DIMS.shoulderY - DIMS.neck), V(0, 0.05), r(0.016, 0.06), line));
  if (stick) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.016, 10, 32), line);
    ring.position.y = 0.16;
    head.add(ring);
    jointDot(head);
  } else {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16).scale(0.92, 1.1, 1), line);
    skull.position.y = 0.15;
    head.add(skull);
  }
  // Facing: a small nose on the capsule figure; a short tick forward on the stick figure.
  const nose = stick ? bone(V(0, 0.16, 0.1), V(0, 0.16, 0.16), 0.012, line) : new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), line);
  if (!stick) nose.position.set(0, 0.14, 0.11);
  head.add(nose);

  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    const shoulder = group(`${side}Shoulder`, spine, sign * DIMS.shoulderX, DIMS.shoulderY);
    shoulder.add(limb(DIMS.upperArm, r(0.016, 0.055), line, stick ? 0 : 0.03));
    jointDot(shoulder);
    const elbow = group(`${side}Elbow`, shoulder, 0, -DIMS.upperArm);
    elbow.add(limb(DIMS.forearm + (stick ? 0 : 0.06), r(0.016, 0.048), line, stick ? 0 : 0.03));
    jointDot(elbow); jointDot(elbow, -DIMS.forearm);
    const hip = group(`${side}Hip`, pelvis, sign * DIMS.hipX, DIMS.hipY);
    hip.add(limb(DIMS.thigh, r(0.016, 0.075), line, stick ? 0 : 0.04));
    jointDot(hip);
    const knee = group(`${side}Knee`, hip, 0, -DIMS.thigh);
    knee.add(limb(DIMS.shin, r(0.016, 0.06), line, stick ? 0 : 0.04));
    jointDot(knee); jointDot(knee, -DIMS.shin);
    // Feet: a short line forward, or a flattened capsule.
    const foot = bone(V(0, -DIMS.shin - 0.03, -0.03), V(0, -DIMS.shin - 0.035, 0.16), r(0.016, 0.05), line);
    knee.add(foot);
  }
  root.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });

  return {
    kind: look,
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
      line.dispose();
      dot.dispose();
    },
  };
}
