/**
 * The ground grid: one large plane whose fragment shader draws 1 m cells and bolder 4 m
 * sections, anti-aliased with screen-space derivatives, centred under the camera that
 * renders it so it reads as infinite, and fading with distance. Two looks:
 * - "lines": transparent lines over the background (the studio's look, as the old GridHelpers);
 * - "ground": an opaque floor (dark by default) with lighter lines, fading into the
 *   background colour at the horizon (the Draw Control guide).
 * Deterministic: it depends on the camera only (no time), so exports are frame-exact.
 *
 * The grid line function and the distance fade are adapted from the `Grid` shader of
 * @react-three/drei (https://github.com/pmndrs/drei, src/core/Grid.tsx), under its licence:
 *
 * MIT License
 *
 * Copyright (c) 2020 react-spring
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import * as THREE from "three";

export type GridLook = {
  mode: "lines" | "ground";
  /** Floor colour (ground mode), cell and section line colours, and the colour the far ground fades into. */
  floor: number; cell: number; section: number; horizon: number;
  /** Metres from the camera where the grid has faded out. */
  fade: number;
};

export const GRID_LOOKS = {
  /** The studio's grid on its grey or dark background: lines only. */
  studio: { mode: "lines", floor: 0x000000, cell: 0x8e9196, section: 0x55585e, horizon: 0x77797c, fade: 26 },
  /** Dark ground, lighter lines, fading to a dark horizon. */
  dark: { mode: "ground", floor: 0x23262b, cell: 0x464b53, section: 0x737882, horizon: 0x16181b, fade: 34 },
  /** Light grey ground with darker lines. */
  light: { mode: "ground", floor: 0x8a8d92, cell: 0x9c9fa4, section: 0x63666b, horizon: 0x77797c, fade: 34 },
} as const satisfies Record<string, GridLook>;

const vertex = /* glsl */ `
uniform float uFade;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const fragment = /* glsl */ `
uniform vec3 uFloor; uniform vec3 uCell; uniform vec3 uSection; uniform vec3 uHorizon;
uniform float uFade; uniform float uGround;
varying vec3 vWorld;
// Line coverage of a grid of 'size' metres, about 'thickness' pixels wide (drei Grid).
float gridLine(float size, float thickness) {
  vec2 r = vWorld.xz / size;
  vec2 g = abs(fract(r - 0.5) - 0.5) / fwidth(r);
  float line = min(g.x, g.y) + 1.0 - thickness;
  // Fade a grid out where its cells shrink below a few pixels, so the distance never shimmers.
  float px = max(fwidth(r).x, fwidth(r).y);
  return (1.0 - min(line, 1.0)) * clamp(1.0 - (px - 0.22) * 3.0, 0.0, 1.0);
}
void main() {
  float d = 1.0 - min(distance(cameraPosition.xz, vWorld.xz) / uFade, 1.0);
  float near = pow(d, 1.6);
  float cell = gridLine(1.0, 1.0);
  float section = gridLine(4.0, 1.6);
  vec3 lineCol = mix(uCell, uSection, min(1.0, section * 1.5));
  float lineA = max(cell * 0.85, section) * near;
  if (uGround > 0.5) {
    vec3 col = mix(uFloor, lineCol, lineA);
    gl_FragColor = vec4(mix(uHorizon, col, smoothstep(0.0, 0.55, d)), 1.0);
  } else {
    if (lineA <= 0.002) discard;
    gl_FragColor = vec4(lineCol, lineA);
  }
  #include <colorspace_fragment>
}`;

export class GroundGrid {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private look: GridLook = GRID_LOOKS.studio;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } as never,
      uniforms: {
        uFloor: { value: new THREE.Color() }, uCell: { value: new THREE.Color() }, uSection: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uFade: { value: 30 }, uGround: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.002;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    // Follow whichever camera renders it, so it reads as infinite (snapped to whole sections: lines never swim).
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.mesh.position.x = Math.round(camera.position.x / 4) * 4;
      this.mesh.position.z = Math.round(camera.position.z / 4) * 4;
      this.mesh.updateMatrixWorld();
    };
    this.setLook(GRID_LOOKS.studio);
  }

  setLook(look: GridLook) {
    this.look = look;
    const u = this.material.uniforms;
    (u.uFloor.value as THREE.Color).setHex(look.floor);
    (u.uCell.value as THREE.Color).setHex(look.cell);
    (u.uSection.value as THREE.Color).setHex(look.section);
    (u.uHorizon.value as THREE.Color).setHex(look.horizon);
    u.uFade.value = look.fade;
    u.uGround.value = look.mode === "ground" ? 1 : 0;
    this.material.transparent = look.mode === "lines";
    this.material.depthWrite = look.mode === "ground";
    this.mesh.position.y = look.mode === "ground" ? -0.002 : 0.002;
    this.mesh.scale.set(look.fade * 2.2, look.fade * 2.2, 1);
    this.material.needsUpdate = true;
  }
  getLook() { return this.look; }
  /** The studio's two line colours (fine 1 m, bold 4 m). */
  setLineColours(cell: number, section: number) { this.setLook({ ...this.look, cell, section }); }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}
