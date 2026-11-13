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
  const preset = sceneryOf(recipe);
  if (preset === "none") return [];
  const cfg = { seed: recipe.landmarks?.seed ?? DEFAULT_LANDMARKS.seed };
  const { subject, camera } = scenePaths(recipe, plan, drive);
  if (preset !== "scatter") return placeBuildings(preset, cfg.seed, subject, camera);
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
    if (near(subject, LANDMARKS.subjectMargin) || near(camera, LANDMARKS.cameraMargin) || near(sight, LANDMARKS.sightMargin)) continue;
    if (out.some(o => Math.hypot(o.x - b.x, o.z - b.z) < Math.hypot(o.w, o.d) / 2 + Math.hypot(b.w, b.d) / 2 + LANDMARKS.gap)) continue;
    out.push(b);
  }
  return out;
}

/** The clearances for buildings (metres): a pavement either side of the subject, room for the camera, a clear sight line. */
export const BUILDINGS = { pavement: 3.2, cameraMargin: 1.6, sightMargin: 0.5, block: 14, street: 10, reach: 24 } as const;

function sightPoints(subject: P[], camera: P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < Math.min(subject.length, camera.length); i += 2)
    for (let t = 0.05; t < 1.3; t += 0.08) out.push({ x: camera[i].x + (subject[i].x - camera[i].x) * t, z: camera[i].z + (subject[i].z - camera[i].z) * t });
  return out;
}

/** A street of buildings along the subject's path, or a city grid around both paths; clear of the subject, the camera and the sight line. */
function placeBuildings(preset: "street" | "city", seed: number, subject: P[], camera: P[]): Landmark[] {
  const sight = sightPoints(subject, camera), out: Landmark[] = [];
  const clear = (b: Landmark) => !subject.some(p => footprintDistance(b, p) < BUILDINGS.pavement) && !camera.some(p => footprintDistance(b, p) < BUILDINGS.cameraMargin)
    && !sight.some(p => footprintDistance(b, p) < BUILDINGS.sightMargin) && !out.some(o => Math.hypot(o.x - b.x, o.z - b.z) < (Math.max(o.w, o.d) + Math.max(b.w, b.d)) / 2 * 0.9);
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
