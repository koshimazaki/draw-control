/**
 * Path overlay for the top and orbit views: the rig's camera path as a solid line, a
 * small camera frustum at each downbeat accent (and a brighter one at the live camera),
 * and the character's floor path as a dotted line. During playback the part of each path
 * that belongs to the current block (the camera block, the action block) is drawn brighter,
 * and the stations of a beat-locked travel or camera block are marked as ticks. Preview
 * only: hidden in exports.
 */
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import {
  activeMoveIndex, beatAtSeconds, cameraAtFrame, frameAt, moveEndBeat, secondsAtBeat, travelStations,
  type AudioDrive, type CameraPlan, type CameraSample, type Recipe,
} from "@motion-studio/core";

const CAMERA_COLOUR = 0xffa040, FRUSTUM_COLOUR = 0xffd34d, LIVE_COLOUR = 0xffffff, FLOOR_COLOUR = 0x46c2ff, CURRENT_COLOUR = 0xffffff, STATION_COLOUR = 0xff4d6d;

/** Edges of a small camera frustum (apex at the camera, a 16:9 frame towards the target). */
function frustumEdges(s: CameraSample, size: number): number[] {
  const pos = new THREE.Vector3(...s.position), fwd = new THREE.Vector3(...s.target).sub(pos).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const h = Math.tan(s.fov * Math.PI / 360) * size, w = h * 16 / 9;
  const c = pos.clone().addScaledVector(fwd, size);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => c.clone().addScaledVector(right, x * w).addScaledVector(up, y * h));
  const out: number[] = [];
  const seg = (a: THREE.Vector3, b: THREE.Vector3) => out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let i = 0; i < 4; i++) { seg(pos, corners[i]); seg(corners[i], corners[(i + 1) % 4]); }
  // A small tick on the top edge marks "up", so the frustum reads as a camera.
  const top = corners[2].clone().add(corners[3]).multiplyScalar(0.5);
  seg(top, top.clone().addScaledVector(up, h * 0.6));
  return out;
}

export class PathsOverlay {
  readonly group = new THREE.Group();
  private materials: LineMaterial[] = [];
  private live?: LineSegments2;
  private stroke?: Line2;
  private handles?: LineSegments2;
  private points: { x: number; y: number; z: number }[] = [];
  private selectedPoint = -1;
  private plan: CameraPlan | null = null;
  private resolution = new THREE.Vector2(1, 1);
  private recipe: Recipe | null = null;
  private floorAt: { x: number; y: number; z: number }[] = [];
  private current?: { key: string; lines: Line2[] };
  bounds = new THREE.Box3();

  constructor() { this.group.renderOrder = 10; }

  private material(colour: number, width: number, dashed = false) {
    const m = new LineMaterial({ color: colour, linewidth: width, dashed, dashSize: 0.12, gapSize: 0.1, depthTest: false, transparent: true });
    m.resolution.copy(this.resolution);
    this.materials.push(m);
    return m;
  }

  /** Rebuild from the recipe and the camera plan (null: floor path only). */
  update(recipe: Recipe, plan: CameraPlan | null, drive: AudioDrive | undefined, frames: number) {
    this.clear();
    this.plan = plan;
    this.recipe = recipe;
    this.bounds.makeEmpty();
    const floor: number[] = [];
    this.floorAt = [];
    for (let n = 0; n < frames; n++) {
      const r = frameAt(recipe, n, drive).root;
      this.floorAt.push({ x: r.x, y: 0.015, z: r.z });
      if (n % 2) continue;
      floor.push(r.x, 0.015, r.z);
      this.bounds.expandByPoint(new THREE.Vector3(r.x, 0, r.z));
    }
    if (floor.length >= 6 && new THREE.Box3().setFromArray(floor).getSize(new THREE.Vector3()).length() > 0.05) {
      const line = new Line2(new LineGeometry().setPositions(floor), this.material(FLOOR_COLOUR, 2.5, true));
      line.computeLineDistances();
      this.group.add(line);
    } else {
      // A stationary character: a dotted ring marks its floor spot.
      const ring: number[] = [];
      const r0 = frameAt(recipe, 0, drive).root;
      for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; ring.push(r0.x + Math.cos(a) * 0.45, 0.015, r0.z + Math.sin(a) * 0.45); }
      const line = new Line2(new LineGeometry().setPositions(ring), this.material(FLOOR_COLOUR, 2.5, true));
      line.computeLineDistances();
      this.group.add(line);
    }
    this.points = recipe.camera?.path ?? [];
    this.drawHandles();
    // Stations of a locked travel: a short red post at each.
    const ticks: number[] = [];
    const post = (p: { x: number; z: number }, y0: number, y1: number) => ticks.push(p.x, y0, p.z, p.x, y1, p.z);
    for (const b of travelStations(recipe, drive)) { const p = this.floorAt[Math.round(secondsAtBeat(recipe.beatGrid, b) * recipe.fps)]; if (p) post(p, 0.02, 0.35); }
    if (plan) plan.programmed.hits.forEach(list => list.forEach(b => { const s = plan.samples[Math.round(secondsAtBeat(recipe.beatGrid, b) * plan.fps)]; if (s) post({ x: s.position[0], z: s.position[2] }, s.position[1] - 0.15, s.position[1] + 0.15); }));
    if (ticks.length) this.group.add(new LineSegments2(new LineSegmentsGeometry().setPositions(ticks), this.material(STATION_COLOUR, 3)));
    if (!plan) return;
    const path: number[] = [];
    for (let n = 0; n < Math.min(frames, plan.frames); n++) {
      const p = plan.samples[n].position;
      path.push(p[0], p[1], p[2]);
      this.bounds.expandByPoint(new THREE.Vector3(p[0], 0, p[2]));
    }
    if (path.length >= 6) this.group.add(new Line2(new LineGeometry().setPositions(path), this.material(CAMERA_COLOUR, 3)));
    const edges: number[] = [];
    for (const a of plan.accents) if (a.downbeat && a.seconds * plan.fps < frames) edges.push(...frustumEdges(cameraAtFrame(plan, a.seconds * plan.fps), 0.32));
    if (edges.length) this.group.add(new LineSegments2(new LineSegmentsGeometry().setPositions(edges), this.material(FRUSTUM_COLOUR, 1.8)));
    this.live = new LineSegments2(new LineSegmentsGeometry().setPositions(frustumEdges(plan.samples[0], 0.5)), this.material(LIVE_COLOUR, 2.5));
    this.group.add(this.live);
  }

  /** Square handles at the drawn path's points (the selected one larger). */
  private drawHandles() {
    if (this.handles) { this.group.remove(this.handles); this.handles.geometry.dispose(); this.handles = undefined; }
    if (!this.points.length) return;
    const seg: number[] = [];
    this.points.forEach((p, i) => {
      const s = i === this.selectedPoint ? 0.2 : 0.12;
      const c = [[-s, -s], [s, -s], [s, s], [-s, s]];
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; seg.push(p.x + a[0], p.y, p.z + a[1], p.x + b[0], p.y, p.z + b[1]); }
      seg.push(p.x, 0.02, p.z, p.x, p.y, p.z);   // a stem down to the floor shows the height
    });
    this.handles = new LineSegments2(new LineSegmentsGeometry().setPositions(seg), this.material(0xffffff, 2));
    this.group.add(this.handles);
  }
  setSelectedPoint(i: number) { this.selectedPoint = i; this.drawHandles(); }
  /** The stroke being drawn, on the floor (null clears it). */
  setStroke(points: { x: number; z: number }[] | null) {
    if (this.stroke) { this.group.remove(this.stroke); this.stroke.geometry.dispose(); this.stroke = undefined; }
    if (!points || points.length < 2) return;
    this.stroke = new Line2(new LineGeometry().setPositions(points.flatMap(p => [p.x, 0.03, p.z])), this.material(CAMERA_COLOUR, 2, true));
    this.stroke.computeLineDistances();
    this.group.add(this.stroke);
  }

  /** Move the live frustum to the camera at a frame, and brighten the current blocks' parts of the paths. */
  showFrame(frame: number) {
    if (this.plan && this.live) (this.live.geometry as LineSegmentsGeometry).setPositions(frustumEdges(cameraAtFrame(this.plan, frame), 0.5));
    this.highlight(frame);
  }

  /** The camera block and the action block playing at a frame, drawn over their paths. */
  private highlight(frame: number) {
    const r = this.recipe;
    if (!r) return;
    const beat = beatAtSeconds(r.beatGrid, frame / r.fps), toFrame = (b: number) => Math.round(secondsAtBeat(r.beatGrid, b) * r.fps);
    const seg = r.camera?.segments.find(s => beat >= s.fromBeat && beat < s.toBeat);
    const k = r.moves.length ? activeMoveIndex(r, beat) : -1, mv = k >= 0 && r.moves[k].atBeat <= beat && beat < moveEndBeat(r, k) ? [r.moves[k].atBeat, moveEndBeat(r, k)] : null;
    const key = `${seg ? `${seg.fromBeat}-${seg.toBeat}` : ""}|${mv?.join("-") ?? ""}`;
    if (this.current?.key === key) return;
    for (const l of this.current?.lines ?? []) {
      this.group.remove(l); l.geometry.dispose();
      const m = l.material as LineMaterial;
      this.materials = this.materials.filter(x => x !== m); m.dispose();
    }
    const lines: Line2[] = [];
    const add = (pts: { x: number; y: number; z: number }[], colour: number) => {
      if (pts.length < 2) return;
      const l = new Line2(new LineGeometry().setPositions(pts.flatMap(p => [p.x, p.y + 0.01, p.z])), this.material(colour, 5));
      this.group.add(l); lines.push(l);
    };
    if (seg && this.plan) add(this.plan.samples.slice(toFrame(seg.fromBeat), toFrame(seg.toBeat) + 1).map(s => ({ x: s.position[0], y: s.position[1], z: s.position[2] })), CURRENT_COLOUR);
    if (mv) {
      const part = this.floorAt.slice(toFrame(mv[0]), toFrame(mv[1]) + 1);
      if (part.some(p => Math.hypot(p.x - part[0].x, p.z - part[0].z) > 0.05)) add(part, CURRENT_COLOUR);
    }
    this.current = { key, lines };
  }

  setResolution(width: number, height: number) {
    this.resolution.set(width, height);
    for (const m of this.materials) m.resolution.set(width, height);
  }

  private clear() {
    for (const c of [...this.group.children]) { this.group.remove(c); (c as Line2).geometry.dispose(); }
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.live = undefined;
    this.current = undefined;
    this.stroke = undefined;
    this.handles = undefined;
  }
}
