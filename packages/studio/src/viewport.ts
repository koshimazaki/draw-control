/**
 * Three.js viewport without React Three Fiber. One scene is shared by the live
 * preview canvas and the export renderer, which draws at the export size.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { FrameState } from "@motion-studio/core";
import type { Character } from "./characters/types";
import { TARGET, cameraFor, setAspect, type View } from "./views";

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
  private grid: THREE.GridHelper;
  private observer: ResizeObserver;
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
    this.grid = new THREE.GridHelper(20, 20, 0x9a9ca0, 0x8a8c90);
    this.grid.position.y = 0.002;
    this.grid.visible = false;
    this.scene.add(this.grid);
    this.scene.add(this.actor);
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
  }
  getCharacter() { return this.character; }

  setView(view: View) {
    this.view = view;
    this.controls.enabled = view === "orbit";
    this.camera = view === "orbit" ? this.orbitCam : cameraFor(view, this.aspect());
    this.resize();
  }
  setBackground(bg: Background) { this.scene.background = new THREE.Color(BACKGROUNDS[bg]); this.redraw(); }
  setGrid(on: boolean) { this.grid.visible = on; this.redraw(); }

  /** Pose the scene for one frame. Pure function of `state`. */
  pose(state: FrameState) {
    this.character?.apply(state);
    this.actor.position.set(state.root.x, state.root.y, state.root.z);
    this.actor.rotation.set(0, state.root.yawRadians, 0);
  }
  show(state: FrameState) { this.pose(state); this.redraw(); }
  redraw() { this.renderer.render(this.scene, this.camera); }

  /** Camera for the export at its own aspect ratio, matching the current view. */
  exportCamera(aspect: number) { return cameraFor(this.view, aspect, this.orbitCam); }

  private aspect() { return Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight); }
  private resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    setAspect(this.camera, w / h);
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
