/**
 * Camera views. Front, side and top are fixed perspective cameras; orbit is user-driven;
 * isometric is an orthographic game camera at about 35° pitch and 45° yaw; rig is the
 * recipe's audio-reactive camera, posed per frame from the core camera plan.
 */
import * as THREE from "three";
import { fovForAspect, type CameraSample } from "@motion-studio/core/internal";

export const VIEWS = ["front", "side", "top", "orbit", "iso", "rig"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_LABELS: Record<View, string> = { front: "Front", side: "Side", top: "Top", orbit: "Orbit", iso: "Isometric", rig: "Camera rig" };

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
  if (view !== "orbit" && view !== "rig") cam.userData.fit = true;
  if (view === "orbit" && orbit) {
    cam.position.copy(orbit.position);
    cam.quaternion.copy(orbit.quaternion);
    return cam;
  }
  if (view === "front" || view === "orbit" || view === "rig") cam.position.set(0, TARGET.y + 0.15, DISTANCE);
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

/** Pose a perspective camera from a rig sample (fov widened for narrow aspects). */
export function applyRigSample(cam: THREE.PerspectiveCamera, s: CameraSample, aspect: number) {
  cam.position.set(...s.position);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3(...s.target));
  cam.aspect = aspect;
  cam.fov = fovForAspect(s.fov, aspect);
  cam.updateProjectionMatrix();
}

/** A top camera that fits a floor box (for the path overlay). */
export function topCameraFitting(box: THREE.Box3, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(fitFov(aspect), aspect, 0.1, 200);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const half = Math.max(size.z / 2 + 0.8, (size.x / 2 + 0.8) / aspect, 4.5);
  const h = half / Math.tan(cam.fov * Math.PI / 360);
  cam.position.set(c.x, h, c.z + 0.001);
  cam.lookAt(c.x, 0, c.z);
  return cam;
}
