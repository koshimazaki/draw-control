/**
 * The glider: an abstract figure with no limbs, for guide clips where only travel and
 * facing matter. One flat colour a video model can be told to follow ("the orange figure"):
 * a square pyramid with a sphere floating above it, both orange, and a white front marker
 * (the pyramid's front face and a short nose on the sphere), so the facing reads from the
 * front, the side and in silhouette. It glides (no legs): the root carries it along the
 * walk path; the sphere bobs gently on the beat. It ignores poses. Pure function of the
 * frame state, like every character.
 */
import * as THREE from "three";
import type { FrameState } from "@motion-studio/core/internal";
import type { Character } from "./types";

/** The guide's fixed colour coding (README "Beat Path"): orange figure, white front. */
export const GLIDER_COLOURS = { body: 0xff6a13, front: 0xffffff } as const;
/** Proportions, metres. */
export const GLIDER = { base: 0.36, apex: 0.86, hover: 0.04, sphereY: 1.16, sphereR: 0.19, bob: 0.035 } as const;

/** A square pyramid on its base, with the +Z face in its own material group (index 1). */
function pyramid(half: number, height: number): THREE.BufferGeometry {
  const a = [0, height, 0], fl = [-half, 0, half], fr = [half, 0, half], br = [half, 0, -half], bl = [-half, 0, -half];
  // Front first (group 1), then right, back, left (group 0), then the base.
  const tris = [[fl, fr, a], [fr, br, a], [br, bl, a], [bl, fl, a], [fl, bl, br], [fl, br, fr]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(2), 3));
  geo.computeVertexNormals();
  geo.addGroup(0, 3, 1);
  geo.addGroup(3, 15, 0);
  return geo;
}

export function createGlider(): Character {
  const body = new THREE.MeshStandardMaterial({ color: GLIDER_COLOURS.body, roughness: 0.62, metalness: 0, flatShading: true });
  const front = new THREE.MeshStandardMaterial({ color: GLIDER_COLOURS.front, roughness: 0.55, metalness: 0, flatShading: true });
  const orb = new THREE.MeshStandardMaterial({ color: GLIDER_COLOURS.body, roughness: 0.5, metalness: 0 });
  const root = new THREE.Group();
  root.name = "glider";
  const lift = new THREE.Group();
  lift.position.y = GLIDER.hover;
  root.add(lift);
  const base = new THREE.Mesh(pyramid(GLIDER.base, GLIDER.apex), [body, front]);
  lift.add(base);
  const head = new THREE.Group();
  head.position.y = GLIDER.sphereY;
  lift.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(GLIDER.sphereR, 32, 20), orb));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.15, 16), front);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = GLIDER.sphereR + 0.05;
  head.add(nose);
  root.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });

  return {
    kind: "glider",
    object: root,
    clips: [],
    apply(state: FrameState) {
      // Highest on the beat, lowest half way between beats.
      head.position.y = GLIDER.sphereY + GLIDER.bob * Math.cos(2 * Math.PI * state.beat);
    },
    dispose() {
      root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      body.dispose(); front.dispose(); orb.dispose();
    },
  };
}
