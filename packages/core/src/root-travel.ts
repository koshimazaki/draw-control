/**
 * Where the character's root is at a beat: the walk path (recipe `rootPath`), with an
 * optional height per point (a glide can rise as well as slide), re-timed by the travel
 * lock (`travelLock`) so the figure arrives at a station on each locked hit (where steady
 * travel would be then, so every leg has the same average speed) and holds briefly.
 * The travel range is from the path's first move to its last point; the lock changes only
 * when the figure is where, never where it starts or ends.
 */
import type { AudioDrive } from "./audio-drive";
import { DEFAULT_LOCK_STRENGTH, lockHits, stationProgress, hitBands } from "./lock";
import type { Recipe, RootPoint } from "./recipe";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The path at a beat, straight lines between its points; held before the first and after the last. */
export function sampleRootPath(points: readonly RootPoint[], beat: number) {
  const first = points[0];
  if (beat <= first.beat) return { x: first.x, y: first.y ?? 0, z: first.z, yaw: first.yaw };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (beat <= b.beat) {
      const t = clamp((beat - a.beat) / (b.beat - a.beat), 0, 1);
      return { x: lerp(a.x, b.x, t), y: lerp(a.y ?? 0, b.y ?? 0, t), z: lerp(a.z, b.z, t), yaw: lerp(a.yaw, b.yaw, t) };
    }
  }
  const end = points[points.length - 1];
  return { x: end.x, y: end.y ?? 0, z: end.z, yaw: end.yaw };
}

/** Beats over which the root travels: from the first point that moves to the last point (null: it stands). */
export function travelRange(points: readonly RootPoint[]): { from: number; to: number } | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.x !== b.x || a.z !== b.z || (a.y ?? 0) !== (b.y ?? 0)) return { from: a.beat, to: points[points.length - 1].beat };
  }
  return null;
}

/** The locked hits of the travel (its stations), in beats; empty without a lock. */
export function travelStations(recipe: Recipe, drive?: AudioDrive): number[] {
  const lock = recipe.travelLock, range = travelRange(recipe.rootPath);
  if (!lock?.lock || !range) return [];
  return lockHits(recipe.beatGrid, hitBands(drive?.bands, recipe), lock.lock, range.from, range.to);
}

/** The root at a beat, after the travel lock. */
export function rootAt(recipe: Recipe, beat: number, drive?: AudioDrive) {
  const lock = recipe.travelLock, range = lock?.lock ? travelRange(recipe.rootPath) : null;
  if (!lock || !range || !(lock.strength ?? DEFAULT_LOCK_STRENGTH) || beat <= range.from || beat >= range.to) return sampleRootPath(recipe.rootPath, beat);
  const hits = travelStations(recipe, drive);
  // Stations where steady travel is on each hit: every leg at the same average speed (no dash in a short leg).
  const p = stationProgress(beat, range.from, range.to, hits, lock.strength ?? DEFAULT_LOCK_STRENGTH, "time");
  return sampleRootPath(recipe.rootPath, range.from + (range.to - range.from) * p);
}
