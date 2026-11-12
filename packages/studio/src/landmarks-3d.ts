/**
 * The landmark blocks (core landmarks.ts) in the scene: neutral grey boxes, pillars and low
 * walls with a soft contact shade under each, so scale and parallax read in every still.
 * Greys only, far from the figure's orange. Rebuilt only when the list changes.
 */
import * as THREE from "three";
import type { Landmark } from "@motion-studio/core/internal";

/** Block colours by kind (the guide's colour coding: neutral greys). */
export const LANDMARK_COLOURS = { box: 0xa7aaaf, pillar: 0xc3c5c9, wall: 0x8f9297 } as const;

/** A soft dark rectangle with blurred edges, for contact shading. */
function contactTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.filter = "blur(7px)";
  g.fillStyle = "#000";
  g.fillRect(14, 14, 36, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LandmarkLayer {
  readonly group = new THREE.Group();
  private key = "";
  private materials = Object.fromEntries(Object.entries(LANDMARK_COLOURS).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 })])) as Record<keyof typeof LANDMARK_COLOURS, THREE.MeshStandardMaterial>;
  private shade = new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.42, depthWrite: false });

  constructor() { this.group.name = "landmarks"; }

  set(list: Landmark[]) {
    const key = JSON.stringify(list);
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    for (const b of list) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), this.materials[b.kind]);
      block.position.set(b.x, b.h / 2, b.z);
      block.rotation.y = -b.yaw;
      block.castShadow = true;
      block.receiveShadow = true;
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 1.9 + 0.6, b.d * 1.9 + 0.6), this.shade);
      shade.rotation.set(-Math.PI / 2, 0, -b.yaw);
      shade.position.set(b.x, 0.004, b.z);
      shade.renderOrder = 1;
      this.group.add(shade, block);
    }
  }
}
