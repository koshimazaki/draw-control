/**
 * The guide figure (character kind "glider"): abstract primitives whose shape matches the
 * subject a video model will paint over it, one flat colour (body) plus a second (head or
 * cabin), a white front marker, and nothing else. Shapes (recipe.figure.shape):
 * - glider: a square pyramid with a sphere above it (the default);
 * - car: a box body, a cabin box, four wheels, white headlights at the front;
 * - flyer: a wedge body with short wings and a tail fin, a white nose;
 * - runner: an upright capsule body with a sphere head rigidly on top, a white chest marker.
 * Every part is rigid: nothing bobs or nods to the beat. Only travel, holds, jumps and spins
 * move it, and it leans into turns (state.root.bank). Pure function of the frame state.
 */
import * as THREE from "three";
import type { FrameState } from "@motion-studio/core/internal";
import type { Character } from "./types";

export type FigureShape = "glider" | "car" | "flyer" | "runner";
/** The guide's fixed colour coding (README "Beat Path"): orange figure, white front. */
export const GLIDER_COLOURS = { body: 0xff6a13, front: 0xffffff } as const;
/** Proportions of the default shape, metres. */
export const GLIDER = { base: 0.36, apex: 0.86, hover: 0.04, sphereY: 1.16, sphereR: 0.19 } as const;

/** A square pyramid on its base, with the +Z face in its own material group (index 1). */
function pyramid(half: number, height: number): THREE.BufferGeometry {
  const a = [0, height, 0], fl = [-half, 0, half], fr = [half, 0, half], br = [half, 0, -half], bl = [-half, 0, -half];
  const tris = [[fl, fr, a], [fr, br, a], [br, bl, a], [bl, fl, a], [fl, bl, br], [fl, br, fr]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(2), 3));
  geo.computeVertexNormals();
  geo.addGroup(0, 3, 1);
  geo.addGroup(3, 15, 0);
  return geo;
}

type Mats = { body: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial; front: THREE.MeshStandardMaterial };
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

/** Build one shape into `g` (facing +Z, standing on y = 0). */
function build(shape: FigureShape, g: THREE.Group, m: Mats) {
  if (shape === "car") {
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), m.body, 0, 0.55, 0));
    g.add(mesh(new THREE.BoxGeometry(1.55, 0.5, 2.1), m.head, 0, 1.07, -0.25));
    for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
      const w = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20), m.head, x, 0.36, z);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    for (const x of [-0.6, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.4, 0.16, 0.05), m.front, x, 0.65, 2.11));
    return;
  }
  if (shape === "flyer") {
    // A tapered body (lathed, nose forward, flattened), short swept wings, a swept tail fin and a white nose.
    const profile = [[0.001, 1.75], [0.16, 1.45], [0.36, 0.7], [0.44, 0], [0.4, -0.8], [0.26, -1.45], [0.12, -1.6]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(profile, 14);
    body.rotateX(Math.PI / 2); body.scale(1.35, 0.55, 1);
    g.add(mesh(body, m.body, 0, 1.2, 0));
    const wing = (side: number) => {
      const sh = new THREE.Shape([new THREE.Vector2(0.35, 0.5), new THREE.Vector2(1.9, -0.55), new THREE.Vector2(1.9, -0.85), new THREE.Vector2(0.35, -0.75)].map(v => new THREE.Vector2(v.x * side, v.y)));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
      geo.rotateX(Math.PI / 2);
      return mesh(geo, m.head, 0, 1.2, 0);
    };
    g.add(wing(1), wing(-1));
    const fin = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.7, 0), new THREE.Vector2(-1.55, 0.7), new THREE.Vector2(-1.65, 0.7), new THREE.Vector2(-1.5, 0)]), { depth: 0.05, bevelEnabled: false });
    fin.rotateY(-Math.PI / 2);
    g.add(mesh(fin, m.head, 0.025, 1.3, 0));
    g.add(mesh(new THREE.SphereGeometry(0.12, 16, 12), m.front, 0, 1.2, 1.7));
    return;
  }
  if (shape === "runner") {
    g.add(mesh(new THREE.CapsuleGeometry(0.22, 0.85, 6, 16), m.body, 0, 0.66, 0));
    g.add(mesh(new THREE.SphereGeometry(0.17, 24, 16), m.head, 0, 1.38, 0));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.14, 0.06), m.front, 0, 0.92, 0.22));
    return;
  }
  const lift = new THREE.Group();
  lift.position.y = GLIDER.hover;
  lift.add(new THREE.Mesh(pyramid(GLIDER.base, GLIDER.apex), [m.body, m.front]));
  lift.add(mesh(new THREE.SphereGeometry(GLIDER.sphereR, 32, 20), m.head, 0, GLIDER.sphereY, 0));
  const nose = mesh(new THREE.ConeGeometry(0.055, 0.15, 16), m.front, 0, GLIDER.sphereY, GLIDER.sphereR + 0.05);
  nose.rotation.x = Math.PI / 2;
  lift.add(nose);
  g.add(lift);
}

export type GliderCharacter = Character & { setColours(body: number, head: number): void; setShape(shape: FigureShape): void };

export function createGlider(): GliderCharacter {
  const m: Mats = {
    body: new THREE.MeshStandardMaterial({ color: GLIDER_COLOURS.body, roughness: 0.62, metalness: 0, flatShading: true }),
    head: new THREE.MeshStandardMaterial({ color: GLIDER_COLOURS.body, roughness: 0.5, metalness: 0 }),
    front: new THREE.MeshStandardMaterial({ color: GLIDER_COLOURS.front, roughness: 0.55, metalness: 0, flatShading: true }),
  };
  const root = new THREE.Group(), lean = new THREE.Group();
  root.name = "glider";
  root.add(lean);
  let shape: FigureShape | null = null;
  const setShape = (next: FigureShape) => {
    if (next === shape) return;
    shape = next;
    for (const c of [...lean.children]) { lean.remove(c); c.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); }
    const g = new THREE.Group();
    build(next, g, m);
    g.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    lean.add(g);
  };
  setShape("glider");
  return {
    kind: "glider",
    object: root,
    clips: [],
    // Rigid: only the lean into a turn comes from the frame (nothing moves to the beat).
    apply(state: FrameState) { lean.rotation.z = state.root.bank ?? 0; },
    setColours(body: number, head: number) { m.body.color.setHex(body); m.head.color.setHex(head); },
    setShape,
    dispose() {
      root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      m.body.dispose(); m.head.dispose(); m.front.dispose();
    },
  };
}
