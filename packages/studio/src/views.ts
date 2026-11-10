/**
 * Camera views. Front, side and top are fixed perspective cameras; orbit is user-driven;
 * isometric is an orthographic game camera at about 35° pitch and 45° yaw.
 */
import * as THREE from "three";

export const VIEWS = ["front", "side", "top", "orbit", "iso"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_LABELS: Record<View, string> = { front: "Front", side: "Side", top: "Top", orbit: "Orbit", iso: "Isometric" };

export const TARGET = new THREE.Vector3(0, 1.0, 0);
const DISTANCE = 4.4;
const ISO_PITCH = THREE.MathUtils.degToRad(35);
const ISO_YAW = THREE.MathUtils.degToRad(45);
/**
 * Framing: the fixed views keep at least this much of the scene around the target, in
 * metres, whatever the aspect ratio. Raised arms (about 2.2 m) fit vertically and arms out
 * (about 0.85 m from the centre) fit horizontally, so a portrait export does not crop them.
 */
const FRAME_HALF_HEIGHT = 1.28;
const FRAME_HALF_WIDTH = 1.0;
const ISO_HALF_HEIGHT = 1.4;
const ISO_HALF_WIDTH = 1.1;

const halfHeightFor = (aspect: number, h: number, w: number) => Math.max(h, w / aspect);
const fitFov = (aspect: number) => 2 * THREE.MathUtils.radToDeg(Math.atan(halfHeightFor(aspect, FRAME_HALF_HEIGHT, FRAME_HALF_WIDTH) / DISTANCE));

/** A new camera for a view at an aspect ratio. Orbit copies the given orbit camera. */
export function cameraFor(view: View, aspect: number, orbit?: THREE.PerspectiveCamera): THREE.Camera {
  if (view === "iso") {
    const h = halfHeightFor(aspect, ISO_HALF_HEIGHT, ISO_HALF_WIDTH), w = h * aspect;
    const cam = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 100);
    cam.userData.fit = true;
    const d = 12;
    cam.position.set(
      TARGET.x + d * Math.sin(ISO_YAW) * Math.cos(ISO_PITCH),
      TARGET.y + d * Math.sin(ISO_PITCH),
      TARGET.z + d * Math.cos(ISO_YAW) * Math.cos(ISO_PITCH),
    );
    cam.lookAt(TARGET);
    return cam;
  }
  const cam = new THREE.PerspectiveCamera(view === "orbit" ? 35 : fitFov(aspect), aspect, 0.1, 100);
  if (view !== "orbit") cam.userData.fit = true;
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
  if (cam instanceof THREE.PerspectiveCamera) {
    cam.aspect = aspect;
    if (cam.userData.fit) cam.fov = fitFov(aspect);
  } else if (cam instanceof THREE.OrthographicCamera) {
    const h = halfHeightFor(aspect, ISO_HALF_HEIGHT, ISO_HALF_WIDTH);
    Object.assign(cam, { top: h, bottom: -h, left: -h * aspect, right: h * aspect });
  }
  (cam as THREE.PerspectiveCamera | THREE.OrthographicCamera).updateProjectionMatrix();
}
