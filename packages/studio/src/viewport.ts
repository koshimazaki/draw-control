/**
 * Three.js viewport without React Three Fiber. One scene is shared by the live
 * preview canvas and the export renderer, which draws at the export size.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { cameraAtFrame, cameraAtSeconds, type AudioDrive, type CameraPlan, type FrameState, type Recipe } from "@motion-studio/core/internal";
import type { Character } from "./characters/types";
import { PathsOverlay } from "./paths-overlay";
import { ViewingAids, type AidOptions } from "./viewing-aids";
import { TARGET, applyRigSample, cameraFor, setAspect, topCameraFitting, type View } from "./views";

export const BACKGROUNDS = { grey: 0x77797c, dark: 0x1d1f22 } as const;
export type Background = keyof typeof BACKGROUNDS;

export class Viewport {
  readonly scene = new THREE.Scene();
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private orbitCam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private controls: OrbitControls;
  private camera: THREE.Camera;
  private actor = new THREE.Group();
  private character?: Character;
  private grid: THREE.Group;
  private gridOn = false;
  private exportGrid = false;
  private observer: ResizeObserver;
  private rigCam = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private rigPlan: CameraPlan | null = null;
  private overlay = new PathsOverlay();
  private showPaths = true;
  private lastFrame = 0;
  private lastState?: FrameState;
  private stateAt: ((frame: number) => FrameState) | null = null;
  readonly aids = new ViewingAids();
  view: View = "front";

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    container.appendChild(this.canvas);
    this.renderer = makeRenderer(this.canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.orbitCam.position.set(3.6, 2.2, 4.4);
    this.controls = new OrbitControls(this.orbitCam, this.canvas);
    this.controls.target.copy(TARGET);
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera = cameraFor("front", 1);
    this.rigCam.position.set(0, 1.15, 4.4);
    this.rigCam.lookAt(TARGET);

    // Soft fill, a high frontal key (its shadow falls short and behind the figure, so it
    // never reads as a second shape), and a back rim that separates the silhouette.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x50525a, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(0.2, 8, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    key.shadow.radius = 4;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(3, 2.5, 3);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1);
    rim.position.set(0.5, 3, -4);
    this.scene.add(rim);
    // The floor shows only the contact shadow, so the background stays a flat colour.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.16 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // Blocked-out ground grid: 1 m lines, bolder every 4 m, the two axes darker.
    this.grid = new THREE.Group();
    const fine = new THREE.GridHelper(40, 40, 0x8e9196, 0x8e9196), coarse = new THREE.GridHelper(40, 10, 0x55585e, 0x6a6d72);
    fine.position.y = 0.002; coarse.position.y = 0.003;
    this.grid.add(fine, coarse);
    this.grid.visible = false;
    this.scene.add(this.grid);
    this.scene.add(this.actor);
    this.scene.add(this.overlay.group);
    this.scene.add(this.aids.group);
    this.setBackground("grey");

    this.controls.addEventListener("change", () => this.redraw());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.setView("front");
  }

  setCharacter(c: Character, disposeOld = true) {
    if (this.character) { this.actor.remove(this.character.object); if (disposeOld) this.character.dispose(); }
    this.character = c;
    this.actor.add(c.object);
    this.aids.setCharacter(c);
  }
  /** Where the aids (onion skin, arcs) read nearby frames from. */
  setFrameSource(fn: (frame: number) => FrameState) { this.stateAt = fn; }
  setAids(options: Partial<AidOptions>) { this.aids.set(options); if (this.lastState) this.show(this.lastState); }
  getCharacter() { return this.character; }

  setView(view: View) {
    this.view = view;
    this.controls.enabled = view === "orbit";
    this.camera = view === "orbit" ? this.orbitCam : view === "rig" ? this.rigCam : this.fixedCamera(view, this.aspect());
    this.syncOverlay();
    this.resize();
  }
  /** The rig's camera plan (null when the recipe has no rig), and the paths to draw. */
  setRig(plan: CameraPlan | null, recipe: Recipe, drive: AudioDrive | undefined, frames: number) {
    this.rigPlan = plan;
    this.overlay.update(recipe, plan, drive, frames);
    if (this.view === "top") this.camera = this.fixedCamera("top", this.aspect());
    this.syncOverlay();
    this.resize();
  }
  getRigPlan() { return this.rigPlan; }
  /** The floor point (y = 0) under a screen position, in the current view. */
  floorPoint(clientX: number, clientY: number): { x: number; z: number } | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : null;
  }
  /** Show a stroke being drawn (null clears it). */
  previewStroke(points: { x: number; z: number }[] | null) { this.overlay.setStroke(points); this.redraw(); }
  setSelectedPathPoint(i: number) { this.overlay.setSelectedPoint(i); this.redraw(); }
  setShowPaths(on: boolean) { this.showPaths = on; this.setView(this.view); }
  /** Hide preview-only helpers (paths) while exporting. */
  setExporting(on: boolean) {
    this.exporting = on;
    this.grid.visible = on ? this.exportGrid : this.gridOn;
    this.overlay.group.visible = !on && this.overlayWanted();
    this.aids.group.visible = !on;
  }
  private exporting = false;
  private overlayWanted() { return this.showPaths && (this.view === "top" || this.view === "orbit"); }
  private syncOverlay() { this.overlay.group.visible = this.overlayWanted(); }
  private fixedCamera(view: View, aspect: number): THREE.Camera {
    // With paths shown, the top view widens to fit the camera path and the floor path.
    if (view === "top" && this.showPaths && !this.overlay.bounds.isEmpty()) return topCameraFitting(this.overlay.bounds, aspect);
    return cameraFor(view, aspect, this.orbitCam);
  }
  setBackground(bg: Background) { this.scene.background = new THREE.Color(BACKGROUNDS[bg]); this.redraw(); }
  setGrid(on: boolean) { this.gridOn = on; this.grid.visible = on; this.redraw(); }
  /** Whether the exported guide shows the grid (whatever the preview shows). */
  setExportGrid(on: boolean) { this.exportGrid = on; }

  /** Pose the scene for one frame. Pure function of `state`. */
  pose(state: FrameState) {
    this.character?.apply(state);
    this.actor.position.set(state.root.x, state.root.y, state.root.z);
    this.actor.rotation.set(0, state.root.yawRadians, 0);
  }
  show(state: FrameState) {
    this.pose(state);
    this.lastFrame = state.frame;
    this.lastState = state;
    this.aids.update(state, this.stateAt, this.actor);
    if (this.view === "rig" && this.rigPlan) applyRigSample(this.rigCam, cameraAtSeconds(this.rigPlan, state.seconds), this.aspect());
    this.overlay.showFrame(state.frame);
    this.redraw();
  }
  /** Pose an export camera for a recipe frame (rig view only; other views are fixed). */
  poseExportCamera(cam: THREE.Camera, frame: number, aspect: number) {
    if (this.view === "rig" && this.rigPlan && cam instanceof THREE.PerspectiveCamera) applyRigSample(cam, cameraAtFrame(this.rigPlan, frame), aspect);
  }
  redraw() {
    const ghosts = !this.exporting && this.lastState && this.stateAt;
    if (ghosts) {
      this.renderer.autoClear = false;
      if (this.scene.background instanceof THREE.Color) this.renderer.setClearColor(this.scene.background);
      this.renderer.clear();
      // Ghosts first (on a cleared frame, under the background), then the scene on top.
      const bg = this.scene.background;
      this.scene.background = null;
      const drew = this.aids.renderGhosts(this.renderer, this.camera, this.actor, this.lastState!, this.stateAt!);
      this.scene.background = bg;
      if (drew) {
        this.renderer.clearDepth();
        const prev = this.scene.background;
        this.scene.background = null;
        this.renderer.render(this.scene, this.camera);
        this.scene.background = prev;
        this.renderer.autoClear = true;
        return;
      }
      this.renderer.autoClear = true;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Camera for the export at its own aspect ratio, matching the current view. */
  exportCamera(aspect: number) { return this.view === "top" ? cameraFor("top", aspect) : cameraFor(this.view, aspect, this.orbitCam); }

  private aspect() { return Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight); }
  private resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.overlay.setResolution(w, h);
    this.aids.setResolution(w, h);
    if (this.camera === this.rigCam) {
      if (this.rigPlan) applyRigSample(this.rigCam, cameraAtFrame(this.rigPlan, this.lastFrame), w / h);
    } else if (this.view === "top") this.camera = this.fixedCamera("top", w / h);
    else setAspect(this.camera, w / h);
    if (this.camera !== this.orbitCam) setAspect(this.orbitCam, w / h);
    this.redraw();
  }
  dispose() { this.observer.disconnect(); this.controls.dispose(); this.renderer.dispose(); }
}

export function makeRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}
