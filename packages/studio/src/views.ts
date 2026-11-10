/**
 * Camera views. Front, side and top are fixed perspective cameras; orbit is user-driven;
 * isometric is an orthographic game camera at about 35° pitch and 45° yaw.
 */
import * as THREE from "three";

export const VIEWS = ["front", "side", "top", "orbit", "iso"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_LABELS: Record<View, string> = { front: "Front", side: "Side", top: "Top", orbit: "Orbit", iso: "Isometric" };

export const TARGET = new THREE.Vector3(0, 0.95, 0);
const DISTANCE = 4.6;
const ISO_PITCH = THREE.MathUtils.degToRad(35);
const ISO_YAW = THREE.MathUtils.degToRad(45);
const ISO_HALF_HEIGHT = 1.45;

/** A new camera for a view at an aspect ratio. Orbit copies the given orbit camera. */
export function cameraFor(view: View, aspect: number, orbit?: THREE.PerspectiveCamera): THREE.Camera {
  if (view === "iso") {
    const h = ISO_HALF_HEIGHT, w = h * aspect;
    const cam = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 100);
    const d = 12;
    cam.position.set(
      TARGET.x + d * Math.sin(ISO_YAW) * Math.cos(ISO_PITCH),
      TARGET.y + d * Math.sin(ISO_PITCH),
      TARGET.z + d * Math.cos(ISO_YAW) * Math.cos(ISO_PITCH),
    );
    cam.lookAt(TARGET);
    return cam;
  }
  const cam = new THREE.PerspectiveCamera(35, aspect, 0.1, 100);
  if (view === "orbit" && orbit) {
    cam.position.copy(orbit.position);
    cam.quaternion.copy(orbit.quaternion);
    return cam;
  }
  if (view === "front" || view === "orbit") cam.position.set(0, TARGET.y + 0.15, DISTANCE);
  else if (view === "side") cam.position.set(DISTANCE, TARGET.y + 0.15, 0);
  else cam.position.set(0, 7.5, 0.001);
  cam.lookAt(TARGET);
  return cam;
}

export function setAspect(cam: THREE.Camera, aspect: number) {
  if (cam instanceof THREE.PerspectiveCamera) cam.aspect = aspect;
  else if (cam instanceof THREE.OrthographicCamera) { cam.left = -ISO_HALF_HEIGHT * aspect; cam.right = ISO_HALF_HEIGHT * aspect; }
  (cam as THREE.PerspectiveCamera | THREE.OrthographicCamera).updateProjectionMatrix();
}
