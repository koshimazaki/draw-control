/**
 * Dev-only synthetic test character: a skinned capsule figure with Mixamo-style bone
 * names and three embedded clips, exported as GLB bytes. Generated, so it is licence-clean.
 * Loaded only through `window.__msDev()` in `npm run dev`; never part of a build.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const BONES: [name: string, parent: string | null, x: number, y: number][] = [
  ["mixamorigHips", null, 0, 1.0], ["mixamorigSpine", "mixamorigHips", 0, 0.12], ["mixamorigHead", "mixamorigSpine", 0, 0.5],
  ["mixamorigLeftArm", "mixamorigSpine", 0.2, 0.42], ["mixamorigLeftForeArm", "mixamorigLeftArm", 0, -0.3],
  ["mixamorigRightArm", "mixamorigSpine", -0.2, 0.42], ["mixamorigRightForeArm", "mixamorigRightArm", 0, -0.3],
  ["mixamorigLeftUpLeg", "mixamorigHips", 0.1, -0.05], ["mixamorigLeftLeg", "mixamorigLeftUpLeg", 0, -0.45],
  ["mixamorigRightUpLeg", "mixamorigHips", -0.1, -0.05], ["mixamorigRightLeg", "mixamorigRightUpLeg", 0, -0.45],
];

/** One capsule per bone, rigidly skinned to it, merged into a single SkinnedMesh. */
function buildFigure() {
  const bones = new Map<string, THREE.Bone>();
  for (const [name, parent, x, y] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, 0);
    bones.get(parent ?? "")?.add(b);
    bones.set(name, b);
  }
  const hips = bones.get("mixamorigHips")!;
  const list = [...bones.values()];
  const scene = new THREE.Group();
  scene.add(hips);
  scene.updateMatrixWorld(true);
  const positions: number[] = [], normals: number[] = [], skinIndex: number[] = [], skinWeight: number[] = [], index: number[] = [];
  list.forEach((bone, bi) => {
    const isLimb = /Arm|Leg/.test(bone.name);
    const geo = isLimb ? new THREE.CapsuleGeometry(0.05, 0.28, 4, 8).translate(0, -0.2, 0)
      : bone.name.endsWith("Head") ? new THREE.SphereGeometry(0.12, 12, 8).translate(0, 0.15, 0)
      : new THREE.CapsuleGeometry(0.14, 0.25, 4, 10).translate(0, bone.name.endsWith("Spine") ? 0.2 : 0, 0);
    geo.applyMatrix4(bone.matrixWorld);
    const base = positions.length / 3;
    const p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      skinIndex.push(bi, 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
    for (const i of geo.index!.array) index.push(base + i);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(index);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc08060 }));
  mesh.name = "SyntheticFigure";
  scene.add(mesh);
  mesh.bind(new THREE.Skeleton(list));
  return scene;
}

const q = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
const track = (bone: string, times: number[], eulers: [number, number, number][]) =>
  new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, eulers.flatMap(e => q(...e)));

function clips(): THREE.AnimationClip[] {
  return [
    new THREE.AnimationClip("Idle", 2, [track("mixamorigSpine", [0, 1, 2], [[0, 0, 0], [0.08, 0, 0], [0, 0, 0]])]),
    new THREE.AnimationClip("Wave", 1, [
      track("mixamorigLeftArm", [0, 0.5, 1], [[0, 0, 2.4], [0, 0, 2.9], [0, 0, 2.4]]),
      track("mixamorigLeftForeArm", [0, 0.5, 1], [[0, 0, 0.4], [0, 0, -0.4], [0, 0, 0.4]]),
    ]),
    new THREE.AnimationClip("Kick", 1, [
      track("mixamorigRightUpLeg", [0, 0.5, 1], [[0, 0, 0], [-1.4, 0, 0], [0, 0, 0]]),
      track("mixamorigLeftArm", [0, 0.5, 1], [[0, 0, 0], [0, 0, 1.2], [0, 0, 0]]),
      track("mixamorigRightArm", [0, 0.5, 1], [[0, 0, 0], [0, 0, -1.2], [0, 0, 0]]),
    ]),
  ];
}

export async function syntheticCharacterGlb(): Promise<Uint8Array> {
  const scene = buildFigure();
  const out = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips() });
  return new Uint8Array(out as ArrayBuffer);
}
