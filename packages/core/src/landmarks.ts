/**
 * Landmark blocks: a sparse set of grey block-out volumes (boxes, tall pillars, low walls)
 * around the scene, so a follow camera's stills show travel and parallax instead of a
 * figure standing still on a sliding grid. Placed from `recipe.landmarks.seed` with the
 * stateless hash (rng.ts), so the same recipe (and track) gives the same blocks; every block
 * keeps a margin from the subject's travel, from the camera's path, and from the line of
 * sight between them on every sampled frame, so none ever stands between camera and subject.
 * Re-placed whenever a path changes. Pure; the studio draws them (viewport, map).
 */
import type { AudioDrive } from "./audio-drive";
import { beatAtSeconds } from "./beats";
import type { CameraPlan } from "./camera-rig";
import { rand01 } from "./rng";
import { recipeSeconds, type Recipe } from "./recipe";
import { rootAt } from "./root-travel";
import { frozenBeat } from "./freeze";

export type LandmarkKind = "box" | "pillar" | "wall" | "building";
/** Scenery presets: nothing, the seeded scatter of blocks, a street of buildings along the subject's path, a city grid. */
export const SCENERY = ["none", "scatter", "street", "city"] as const;
export type Scenery = (typeof SCENERY)[number];
/** A block on the ground: centre (x, z), footprint w × d, height h (metres), turned `yaw` radians. */
export type Landmark = { kind: LandmarkKind; x: number; z: number; w: number; d: number; h: number; yaw: number };
export type LandmarkConfig = { seed: number; on: boolean };

/** How many blocks a scene aims for, and the clearances (metres) around them. */
export const LANDMARKS = { count: 14, tries: 900, subjectMargin: 1.6, cameraMargin: 1.1, sightMargin: 0.35, gap: 1.2, reach: 7, minHalf: 9 } as const;
export const DEFAULT_LANDMARKS: LandmarkConfig = { seed: 7, on: true };

type P = { x: number; z: number };

/** Distance from a point to a block's footprint (0 inside). */
export function footprintDistance(b: Landmark, p: P): number {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = p.x - b.x, dz = p.z - b.z;
  const lx = c * dx + s * dz, lz = -s * dx + c * dz;
  return Math.hypot(Math.max(0, Math.abs(lx) - b.w / 2), Math.max(0, Math.abs(lz) - b.d / 2));
}

/** Where the subject and the camera are over the clip, sampled every other frame. */
export function scenePaths(recipe: Recipe, plan: CameraPlan | null, drive?: AudioDrive): { subject: P[]; camera: P[] } {
  const frames = Math.ceil(recipeSeconds(recipe) * recipe.fps) + 1, subject: P[] = [], camera: P[] = [];
  for (let n = 0; n < frames; n += 2) {
    const r = rootAt(recipe, frozenBeat(recipe, beatAtSeconds(recipe.beatGrid, n / recipe.fps)), drive);
    subject.push({ x: r.x, z: r.z });
    const c = plan?.samples[Math.min(plan.frames - 1, n)];
    if (c) camera.push({ x: c.position[0], z: c.position[2] });
  }
  return { subject, camera };
}

function shape(seed: number, i: number): Omit<Landmark, "x" | "z" | "yaw"> {
  const k = rand01(seed, i, 1), a = rand01(seed, i, 2), b = rand01(seed, i, 3);
  if (k < 0.2) { const t = 0.5 + 0.3 * a; return { kind: "pillar", w: t, d: t, h: 2.6 + 1.6 * b }; }
  if (k < 0.38) return { kind: "wall", w: 2.4 + 1.6 * a, d: 0.3, h: 0.7 + 0.4 * b };
  return { kind: "box", w: 0.7 + 1.1 * a, d: 0.7 + 1.1 * rand01(seed, i, 4), h: 0.5 + 1.2 * b };
}

/** The scenery a recipe asks for: `scenery` when set, else the scatter when `landmarks` is on; `landmarks.on: false` turns any off. */
export function sceneryOf(recipe: Recipe): Scenery {
  if (recipe.landmarks && !recipe.landmarks.on) return "none";
  return recipe.scenery ?? (recipe.landmarks?.on ? "scatter" : "none");
}

/** The recipe's scenery blocks (none when off): the scatter, a street or a city, every block clear of both paths and the line of sight. */
export function placeLandmarks(recipe: Recipe, plan: CameraPlan | null, drive?: AudioDrive): Landmark[] {
  // Boxes given explicitly (edited on the map, or by an agent) are the scenery as they are.
  if (recipe.sceneryBoxes) return sceneryOf(recipe) === "none" ? [] : recipe.sceneryBoxes.map(b => ({ kind: "building" as const, x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, yaw: b.yaw ?? 0 }));
  const preset = sceneryOf(recipe);
  if (preset === "none") return [];
  const cfg = { seed: recipe.landmarks?.seed ?? DEFAULT_LANDMARKS.seed };
  const { subject, camera } = scenePaths(recipe, plan, drive);
  const passes = recipe.scenerySight === "passes" ? new Occlusion(subject, camera) : null;
  if (preset !== "scatter") return placeBuildings(preset, cfg.seed, subject, camera, passes);
  // Lines of sight, every second sample, as points along each line and on past the subject
  // (so no block stands right behind the figure in frame, where its silhouette would merge).
  const sight: P[] = [];
  for (let i = 0; i < Math.min(subject.length, camera.length); i += 2)
    for (let t = 0.1; t < 1.75; t += 0.1) sight.push({ x: camera[i].x + (subject[i].x - camera[i].x) * t, z: camera[i].z + (subject[i].z - camera[i].z) * t });
  const all = [...subject, ...camera];
  const xs = all.map(p => p.x), zs = all.map(p => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const hx = Math.max(LANDMARKS.minHalf, (Math.max(...xs) - Math.min(...xs)) / 2 + LANDMARKS.reach);
  const hz = Math.max(LANDMARKS.minHalf, (Math.max(...zs) - Math.min(...zs)) / 2 + LANDMARKS.reach);
  const out: Landmark[] = [];
  for (let i = 0; i < LANDMARKS.tries && out.length < LANDMARKS.count; i++) {
    const b: Landmark = {
      ...shape(cfg.seed, i),
      x: Math.round((cx + (rand01(cfg.seed, i, 5) * 2 - 1) * hx) * 100) / 100,
      z: Math.round((cz + (rand01(cfg.seed, i, 6) * 2 - 1) * hz) * 100) / 100,
      yaw: Math.round(rand01(cfg.seed, i, 7) * Math.PI * 100) / 100,
    };
    const near = (pts: P[], margin: number) => pts.some(p => footprintDistance(b, p) < margin);
    if (near(subject, LANDMARKS.subjectMargin) || near(camera, LANDMARKS.cameraMargin) || (!passes && near(sight, LANDMARKS.sightMargin))) continue;
    if (out.some(o => Math.hypot(o.x - b.x, o.z - b.z) < Math.hypot(o.w, o.d) / 2 + Math.hypot(b.w, b.d) / 2 + LANDMARKS.gap)) continue;
    if (passes && !passes.tryAdd(b)) continue;
    out.push(b);
  }
  return out;
}

/** The clearances for buildings (metres): a pavement either side of the subject, room for the camera, a clear sight line. */
export const BUILDINGS = { pavement: 3.2, cameraMargin: 1.6, sightMargin: 0.5, block: 14, street: 10, reach: 12 } as const;

function sightPoints(subject: P[], camera: P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < Math.min(subject.length, camera.length); i += 2)
    for (let t = 0.05; t < 1.3; t += 0.08) out.push({ x: camera[i].x + (subject[i].x - camera[i].x) * t, z: camera[i].z + (subject[i].z - camera[i].z) * t });
  return out;
}

/** A street of buildings along the subject's path, or a city grid around both paths; clear of the subject, the camera and the sight line. */
function placeBuildings(preset: "street" | "city", seed: number, subject: P[], camera: P[], passes: Occlusion | null): Landmark[] {
  const sight = sightPoints(subject, camera), out: Landmark[] = [];
  const room = (b: Landmark) => !subject.some(p => footprintDistance(b, p) < BUILDINGS.pavement) && !camera.some(p => footprintDistance(b, p) < BUILDINGS.cameraMargin)
    && !out.some(o => Math.hypot(o.x - b.x, o.z - b.z) < (Math.max(o.w, o.d) + Math.max(b.w, b.d)) / 2 * 0.9);
  // Clear sight: nothing on the line of sight. Passes: a block may cross it briefly (Occlusion caps); a building that
  // would hide the subject too long is tried as a column instead, as in a tracking shot through a colonnade.
  const clear = (b: Landmark) => {
    if (!room(b)) return false;
    if (!passes) return !sight.some(p => footprintDistance(b, p) < BUILDINGS.sightMargin);
    if (passes.tryAdd(b)) return true;
    const column: Landmark = { ...b, kind: "pillar", w: 0.7, d: 0.7, h: Math.min(b.h, 6) };
    if (room(column) && passes.tryAdd(column)) { Object.assign(b, column); return true; }
    return false;
  };
  const r2 = (x: number) => Math.round(x * 100) / 100;
  if (preset === "street") {
    // Walk the path (extended 10 m at both ends) and set a building either side every 6–9 m.
    const pts = subject.filter((p, i) => i === 0 || Math.hypot(p.x - subject[i - 1].x, p.z - subject[i - 1].z) > 1e-3);
    if (pts.length < 2) return out;
    const a = pts[0], b = pts[1], y = pts[pts.length - 1], z = pts[pts.length - 2];
    const ext = (p: P, q: P, d: number) => { const l = Math.hypot(p.x - q.x, p.z - q.z) || 1; return { x: p.x + (p.x - q.x) / l * d, z: p.z + (p.z - q.z) / l * d }; };
    const line = [ext(a, b, 10), ...pts, ext(y, z, 10)];
    let along = 0, next = 0, k = 0;
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1], q = line[i], seg = Math.hypot(q.x - p.x, q.z - p.z);
      if (seg < 1e-6) continue;
      const dx = (q.x - p.x) / seg, dz = (q.z - p.z) / seg;
      while (next <= along + seg) {
        const t = next - along, cx = p.x + dx * t, cz = p.z + dz * t, yaw = Math.atan2(dz, dx);
        for (const side of [-1, 1]) {
          const w = 5 + 4 * rand01(seed, k, 1), d = 6 + 4 * rand01(seed, k, 2), h = 6 + 10 * rand01(seed, k, 3), off = BUILDINGS.pavement + 0.6 + d / 2;
          const bl: Landmark = { kind: "building", w: r2(w), d: r2(d), h: r2(h), x: r2(cx - dz * side * off), z: r2(cz + dx * side * off), yaw: r2(-yaw) };
          k++;
          if (clear(bl)) out.push(bl);
        }
        next += 6 + 3 * rand01(seed, k, 4);
      }
      along += seg;
    }
    // Passes: a colonnade at the pavement's edge on both sides, columns every 3.5 m, kept only where the subject is hidden briefly.
    if (passes) {
      let at = 0, next2 = 0, j = 0;
      for (let i = 1; i < line.length; i++) {
        const p = line[i - 1], q = line[i], seg = Math.hypot(q.x - p.x, q.z - p.z);
        if (seg < 1e-6) continue;
        const dx = (q.x - p.x) / seg, dz = (q.z - p.z) / seg;
        while (next2 <= at + seg) {
          const t = next2 - at, cx = p.x + dx * t, cz = p.z + dz * t, off = BUILDINGS.pavement + 0.35;
          for (const side of [-1, 1]) {
            const col: Landmark = { kind: "pillar", w: 0.7, d: 0.7, h: r2(4.5 + 1.5 * rand01(seed, 5000 + j, 1)), x: r2(cx - dz * side * off), z: r2(cz + dx * side * off), yaw: r2(-Math.atan2(dz, dx)) };
            j++;
            if (!subject.some(s2 => footprintDistance(col, s2) < BUILDINGS.pavement - 0.2) && !camera.some(c2 => footprintDistance(col, c2) < BUILDINGS.cameraMargin)
              && !out.some(o => footprintDistance(o, col) < 0.3) && passes.tryAdd(col)) out.push(col);
          }
          next2 += 3.5;
        }
        at += seg;
      }
    }
    return out;
  }
  // City: one building per block of a grid around both paths, smaller where a full block would not clear.
  const all = [...subject, ...camera], xs = all.map(p => p.x), zs = all.map(p => p.z), pitch = BUILDINGS.block + BUILDINGS.street;
  const x0 = Math.floor((Math.min(...xs) - BUILDINGS.reach) / pitch), x1 = Math.ceil((Math.max(...xs) + BUILDINGS.reach) / pitch);
  const z0 = Math.floor((Math.min(...zs) - BUILDINGS.reach) / pitch), z1 = Math.ceil((Math.max(...zs) + BUILDINGS.reach) / pitch);
  for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
    const k = (gx + 1000) * 2003 + (gz + 1000), h = 8 + 20 * Math.pow(rand01(seed, k, 1), 1.6);
    for (const size of [BUILDINGS.block, 9, 5]) {
      const bl: Landmark = { kind: "building", w: size, d: size, h: r2(size < BUILDINGS.block ? Math.min(h, 10) : h), x: gx * pitch, z: gz * pitch, yaw: 0 };
      if (clear(bl)) { out.push(bl); break; }
    }
  }
  return out;
}

/** Caps for foreground passes (scenerySight "passes"): the longest the subject may be hidden at once, and the share of the clip. */
export const PASSES = { maxHiddenSeconds: 0.33, maxHiddenShare: 0.15 } as const;

/** Which samples (every other frame) a block hides the subject on: its footprint crosses the line from the camera to the subject. */
export function hiddenSamples(b: Landmark, subject: P[], camera: P[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(subject.length, camera.length); i++) {
    for (let t = 0.06; t < 0.95; t += 0.04) {
      if (footprintDistance(b, { x: camera[i].x + (subject[i].x - camera[i].x) * t, z: camera[i].z + (subject[i].z - camera[i].z) * t }) < 0.05) { out.push(i); break; }
    }
  }
  return out;
}

/** Foreground passes: blocks may hide the subject only briefly (PASSES), counted over all the blocks placed so far. */
export class Occlusion {
  private hidden: Uint8Array;
  private maxRun: number;
  private subject: P[];
  private camera: P[];
  // No parameter properties: the CLI runs core under Node's type stripping.
  constructor(subject: P[], camera: P[]) {
    this.subject = subject; this.camera = camera;
    this.hidden = new Uint8Array(Math.min(subject.length, camera.length));
    this.maxRun = Math.floor(PASSES.maxHiddenSeconds * 24 / 2);
  }
  /** Add a block if the subject stays hidden for no longer than the caps; false (and nothing added) otherwise. */
  tryAdd(b: Landmark): boolean {
    const idx = hiddenSamples(b, this.subject, this.camera);
    if (!idx.length) return true;
    const next = this.hidden.slice();
    for (const i of idx) next[i] = 1;
    let run = 0, longest = 0, total = 0;
    for (const v of next) { run = v ? run + 1 : 0; longest = Math.max(longest, run); total += v; }
    if (longest > this.maxRun || total > next.length * PASSES.maxHiddenShare) return false;
    this.hidden = next;
    return true;
  }
}
