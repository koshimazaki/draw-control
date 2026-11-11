/**
 * Viewing aids, preview only (hidden in exports): the skeleton drawn over the mesh, an
 * x-ray (translucent) mesh, the selected bone highlighted, onion skin (ghosts of nearby
 * frames) and arcs (motion trails of the hands, feet and head over nearby frames).
 */
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { FrameState } from "@motion-studio/core/internal";
import type { Character } from "./characters/types";

export type AidOptions = { bones: boolean; xray: boolean; onion: boolean; arcs: boolean; bone: string | null };
export const ONION_OFFSETS = [-8, -4, 4, 8];
const ARC_SPAN = 16, ARC_STEP = 2;
const TRAIL_NAMES = [/^DEF-hand(L|R)$/, /^DEF-foot(L|R)$/, /^DEF-head$/, /^(left|right)(Elbow|Knee)$/, /^head$/];

/** Bones (or joint groups) a character can show: its skeleton or its named joints. */
export function boneList(c: Character | undefined): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  c?.object.traverse(o => { if ((o as THREE.Bone).isBone || (o.type === "Group" && o.name && o !== c.object && !/character|mannequin|block/.test(o.name))) out.push(o); });
  return out;
}

export class ViewingAids {
  readonly group = new THREE.Group();
  options: AidOptions = { bones: false, xray: false, onion: false, arcs: false, bone: null };
  private helper?: THREE.SkeletonHelper;
  private marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff4fd8, depthTest: false }));
  private ghostMats = [0x5fa8ff, 0x5fa8ff, 0xffa040, 0xffa040].map((c, i) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: [0.12, 0.2, 0.2, 0.12][i], depthWrite: false }));
  private arcMat = new LineMaterial({ color: 0x9be37a, linewidth: 2, transparent: true, opacity: 0.85, depthTest: false });
  private arcs: Line2[] = [];
  private xrayed = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private character?: Character;

  constructor() {
    this.marker.renderOrder = 20;
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  setCharacter(c: Character | undefined) {
    this.restoreXray();
    if (this.helper) { this.group.remove(this.helper); this.helper.dispose(); this.helper = undefined; }
    this.character = c;
    this.apply();
  }

  set(options: Partial<AidOptions>) { this.options = { ...this.options, ...options }; this.apply(); }

  private apply() {
    const c = this.character;
    if (this.options.bones && c && !this.helper) {
      this.helper = new THREE.SkeletonHelper(c.object);
      (this.helper.material as THREE.LineBasicMaterial).depthTest = false;
      this.helper.renderOrder = 15;
      this.group.add(this.helper);
    }
    if (this.helper) this.helper.visible = this.options.bones;
    if (this.options.xray && c && this.xrayed.size === 0) {
      c.object.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        this.xrayed.set(o, o.material);
        const m = (Array.isArray(o.material) ? o.material[0] : o.material).clone();
        Object.assign(m, { transparent: true, opacity: 0.32, depthWrite: false });
        o.material = m;
      });
    } else if (!this.options.xray) this.restoreXray();
    if (!this.options.arcs) for (const a of this.arcs) a.visible = false;
  }

  private restoreXray() {
    for (const [mesh, mat] of this.xrayed) { (mesh.material as THREE.Material).dispose(); mesh.material = mat; }
    this.xrayed.clear();
  }

  setResolution(w: number, h: number) { this.arcMat.resolution.set(w, h); }

  /** Update the bone marker and the arcs for a frame; `stateAt` gives nearby frames. */
  update(state: FrameState, stateAt: ((frame: number) => FrameState) | null, actor: THREE.Object3D) {
    const c = this.character;
    const bone = this.options.bone && c ? c.object.getObjectByName(this.options.bone) : undefined;
    this.marker.visible = !!bone;
    if (bone) { actor.updateMatrixWorld(true); this.marker.position.setFromMatrixPosition(bone.matrixWorld); }
    if (!this.options.arcs || !c || !stateAt) return;
    const trail = boneList(c).filter(b => TRAIL_NAMES.some(r => r.test(b.name)));
    const points: number[][] = trail.map(() => []);
    const v = new THREE.Vector3();
    for (let k = -ARC_SPAN; k <= ARC_SPAN; k += ARC_STEP) {
      const s = stateAt(state.frame + k);
      c.apply(s);
      actor.position.set(s.root.x, s.root.y, s.root.z);
      actor.rotation.set(0, s.root.yawRadians, 0);
      actor.updateMatrixWorld(true);
      trail.forEach((b, i) => { v.setFromMatrixPosition(b.matrixWorld); points[i].push(v.x, v.y, v.z); });
    }
    c.apply(state);
    actor.position.set(state.root.x, state.root.y, state.root.z);
    actor.rotation.set(0, state.root.yawRadians, 0);
    actor.updateMatrixWorld(true);
    while (this.arcs.length < trail.length) { const l = new Line2(new LineGeometry(), this.arcMat); l.renderOrder = 16; this.arcs.push(l); this.group.add(l); }
    this.arcs.forEach((a, i) => {
      a.visible = i < trail.length;
      if (!a.visible) return;
      a.geometry.dispose();
      a.geometry = new LineGeometry().setPositions(points[i]);
    });
  }

  /** Draw onion-skin ghosts of nearby frames before the main pass. */
  renderGhosts(renderer: THREE.WebGLRenderer, camera: THREE.Camera, actor: THREE.Object3D, state: FrameState, stateAt: (frame: number) => FrameState) {
    const c = this.character;
    if (!this.options.onion || !c) return false;
    const scene = new THREE.Scene();
    const parent = actor.parent;
    scene.add(actor);
    ONION_OFFSETS.forEach((k, i) => {
      const s = stateAt(state.frame + k);
      c.apply(s);
      actor.position.set(s.root.x, s.root.y, s.root.z);
      actor.rotation.set(0, s.root.yawRadians, 0);
      scene.overrideMaterial = this.ghostMats[i];
      renderer.render(scene, camera);
    });
    parent?.add(actor);
    c.apply(state);
    actor.position.set(state.root.x, state.root.y, state.root.z);
    actor.rotation.set(0, state.root.yawRadians, 0);
    return true;
  }
}
