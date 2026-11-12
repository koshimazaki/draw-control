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

export type LandmarkKind = "box" | "pillar" | "wall";
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
    const r = rootAt(recipe, beatAtSeconds(recipe.beatGrid, n / recipe.fps), drive);
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

/** The recipe's landmark blocks (none when `landmarks` is absent or off). */
export function placeLandmarks(recipe: Recipe, plan: CameraPlan | null, drive?: AudioDrive): Landmark[] {
  const cfg = recipe.landmarks;
  if (!cfg?.on) return [];
  const { subject, camera } = scenePaths(recipe, plan, drive);
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
