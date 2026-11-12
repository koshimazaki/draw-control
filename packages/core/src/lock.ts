/**
 * Beat lock ("lock in / lock off"): one parameter on a block, for the Action track (move
 * blocks, travel along the walk path) and the Camera track alike. `lock` names what the
 * block locks to (every beat, or the analysed kicks, snares or hats); `strength` 0–1 blends
 * from steady (0, exactly today's timing) to fully stepped (1).
 *
 * Two time warps, both pure functions of the block's range and the hits inside it, both
 * identity at the block's edges, so a locked block starts and ends where it did:
 * - `stationProgress`: travel (along a path, or a camera move with an amount) arrives at
 *   evenly spaced stations on each hit, easing into it, holding briefly, then going again;
 * - `pulseBeat`: a clip or a move's phases speed up into each hit and slow after it,
 *   keeping their length in beats (identity on every hit), so the average speed is normal.
 */
import { bandOnsets, type BandAnalysis } from "./audio-bands";
import { beatAtSeconds } from "./beats";
import { fail, num } from "./validate";
import type { BeatGrid } from "./recipe";

export const LOCK_TARGETS = ["beat", "kick", "snare", "hat"] as const;
export type LockTarget = (typeof LOCK_TARGETS)[number];
export type BeatLock = { lock?: LockTarget; strength?: number };
/** Hold at each station, in beats (shortened in short legs). */
export const STATION_HOLD_BEATS = 0.25;
/** Strength when a lock is given without one. */
export const DEFAULT_LOCK_STRENGTH = 1;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));

/** Validate the optional `lock` and `strength` fields of a block into `out`. */
export function validateLock(input: Record<string, unknown>, where: string, out: BeatLock) {
  if (input.lock !== undefined && input.lock !== "off") {
    if (!LOCK_TARGETS.includes(input.lock as LockTarget)) fail(`${where}.lock must be off, ${LOCK_TARGETS.join(", ")}`);
    out.lock = input.lock as LockTarget;
  }
  if (input.strength !== undefined) {
    const s = num(input.strength, 0, 1, `${where}.strength`);
    if (out.lock) out.strength = s;
  }
}

/**
 * Beats of the locked hits inside (from, to): whole beats, or the analysed onsets of a band.
 * A hit within EDGE_BEATS of either edge is left out: a block that starts on a kick would
 * otherwise have a first leg a few milliseconds long, and its move would jump.
 */
export const EDGE_BEATS = STATION_HOLD_BEATS;
export function lockHits(grid: BeatGrid, bands: BandAnalysis | undefined, target: LockTarget, from: number, to: number): number[] {
  const inside = (b: number) => b > from + EDGE_BEATS - 1e-6 && b < to - EDGE_BEATS + 1e-6;
  if (target === "beat") {
    const out: number[] = [];
    for (let b = Math.floor(from) + 1; b < to - 1e-6; b++) if (inside(b)) out.push(b);
    return out;
  }
  return bandOnsets(bands, target).map(o => beatAtSeconds(grid, o.seconds)).filter(inside);
}

/** The keys of a locked range: its start, each hit, its end. */
const keysOf = (from: number, to: number, hits: readonly number[]) => [from, ...hits, to];

/**
 * Progress 0–1 through a range under a lock: at the k-th hit (of N) it is exactly k/(N+1)
 * when `strength` is 1; between hits it eases in, after a hit it holds for up to
 * STATION_HOLD_BEATS. `strength` blends with the steady progress. Outside the range it is
 * clamped to 0 or 1.
 */
export function stationProgress(beat: number, from: number, to: number, hits: readonly number[], strength: number): number {
  const steady = clamp01((beat - from) / (to - from));
  if (strength <= 0 || !hits.length || beat <= from || beat >= to) return steady;
  const keys = keysOf(from, to, hits), legs = keys.length - 1;
  let k = 0;
  while (k < legs - 1 && beat >= keys[k + 1]) k++;
  const a = keys[k], b = keys[k + 1], len = b - a;
  const hold = k > 0 ? Math.min(STATION_HOLD_BEATS, 0.35 * len) : 0;
  const stepped = (k + ease((beat - a - hold) / Math.max(1e-9, len - hold))) / legs;
  return steady + (stepped - steady) * strength;
}

/**
 * The beat a locked clip plays at: inside each leg between hits, playback runs at
 * 1 + strength·cos(2πu), fastest into and out of a hit and slowest between them; every hit
 * and both edges keep their beat, so the block keeps its length.
 */
export function pulseBeat(beat: number, from: number, to: number, hits: readonly number[], strength: number): number {
  if (strength <= 0 || beat <= from || beat >= to) return beat;
  const keys = keysOf(from, to, hits);
  let k = 0;
  while (k < keys.length - 2 && beat >= keys[k + 1]) k++;
  const a = keys[k], len = keys[k + 1] - a, u = (beat - a) / len;
  return a + len * (u + Math.min(1, strength) * Math.sin(2 * Math.PI * u) / (2 * Math.PI));
}

/** How much a locked hold stops motion at a beat (1 just after a hit, easing back to 0 over the hold). */
export function holdGate(beat: number, hits: readonly number[], strength: number): number {
  let g = 0;
  for (const h of hits) {
    const u = (beat - h) / STATION_HOLD_BEATS;
    if (u > -0.5 && u < 1) g = Math.max(g, u < 0 ? ease(1 + 2 * u) : 1 - ease(u));
  }
  return g * clamp01(strength);
}

/** A punch-in pulse at each hit: 0–1, peaking on the hit (a quick rise, a slower release). */
export function punchPulse(beat: number, hits: readonly number[]): number {
  let p = 0;
  for (const h of hits) {
    const u = beat - h;
    if (u > -0.2 && u < 0) p = Math.max(p, ease(1 + u / 0.2));
    else if (u >= 0 && u < 0.6) p = Math.max(p, 1 - ease(u / 0.6));
  }
  return p;
}
