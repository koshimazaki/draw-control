/**
 * The glider's heading and lean along its path, smooth through the corners. A path is a
 * polyline whose points each carry a yaw (the direction of travel there, or the held facing
 * of a glide that does not turn), so the raw yaw steps at every point and its turning rate
 * jumps. Here:
 * - the heading is the path's yaw averaged over a short window of the path's own time
 *   (HEADING_SECONDS wide: the exact mean of the straight-line yaw, one pass over the
 *   points). It is read at the path beat (root-travel.ts `pathBeatAt`), so it holds wherever
 *   the figure holds (a station of the travel lock, a freeze, standing still), and a held
 *   facing stays held because its yaw is constant. The window narrows to nothing at the
 *   ends of the travel, so the first and last headings are the path's own;
 * - the lean (bank) comes from the heading's turning rate, averaged with a raised-cosine
 *   weight over a longer window of real time (LEAN_SECONDS), then soft-limited (tanh) so it
 *   approaches the shape's most lean without a flat top. `BANK` is the tuning surface.
 * Both are pure functions of the recipe and the beat or frame: nothing carries between
 * frames, so export, scrubbing and the renderer read the same value for any frame.
 */
import type { AudioDrive } from "./audio-drive";
import { beatAtSeconds } from "./beats";
import { frozenBeat } from "./freeze";
import type { FigureShape, Recipe, RootPoint } from "./recipe";
import { pathBeatAt, sampleRootPath, travelRange } from "./root-travel";

/** How far each glider shape leans into a turn: radians of bank per radian a second of turning, and the most it leans. */
export const BANK: Record<FigureShape, readonly [number, number]> = { flyer: [0.45, 0.65], car: [0.05, 0.08], runner: [0.12, 0.2], glider: [0, 0] };
/**
 * The heading's window: seconds of the path's time its yaw is averaged over. Wider turns a
 * hard corner more gently but points the nose further inside the curve (at 0.5 s up to ~13°
 * on a tight drawn S at Corners 0.5).
 */
export const HEADING_SECONDS = 0.5;
/**
 * The lean's window: seconds of real time its turning rate is averaged over (raised-cosine
 * weights, so the roll builds and releases over about half of it).
 */
export const LEAN_SECONDS = 1.2;
/** Heading samples each side of the frame for the lean. */
const LEAN_TAPS = 4;

/** ∫ yaw over [lo, hi] of the path's beats, degree-beats: straight between points, held before the first and after the last. */
function yawIntegral(points: readonly RootPoint[], lo: number, hi: number): number {
  const first = points[0], last = points[points.length - 1];
  let sum = 0;
  if (lo < first.beat) sum += (Math.min(hi, first.beat) - lo) * first.yaw;
  if (hi > last.beat) sum += (hi - Math.max(lo, last.beat)) * last.yaw;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], span = b.beat - a.beat;
    const from = Math.max(lo, a.beat), to = Math.min(hi, b.beat);
    if (!(to > from) || !(span > 0)) continue;
    const yaw = (t: number) => a.yaw + (b.yaw - a.yaw) * (t - a.beat) / span;
    sum += (to - from) * (yaw(from) + yaw(to)) / 2;
  }
  return sum;
}

/** The smoothed yaw, degrees, at a beat of the path's own time. */
export function smoothPathYaw(recipe: Recipe, pathBeat: number): number {
  const points = recipe.rootPath;
  if (points.length < 2) return sampleRootPath(points, pathBeat).yaw;
  const range = travelRange(points);
  if (!range) return sampleRootPath(points, pathBeat).yaw;
  const h = Math.min(HEADING_SECONDS / 2 * recipe.beatGrid.bpm / 60, pathBeat - range.from, range.to - pathBeat);
  if (!(h > 1e-6)) return sampleRootPath(points, pathBeat).yaw;
  return yawIntegral(points, pathBeat - h, pathBeat + h) / (2 * h);
}

/** The glider's smoothed heading at a beat, degrees (the path's facing; spins and jumps add on top). */
export function glideHeadingAt(recipe: Recipe, beat: number, drive?: AudioDrive): number {
  return smoothPathYaw(recipe, pathBeatAt(recipe, frozenBeat(recipe, beat), drive));
}

/** The path's own yaw at a beat, degrees, as the engine reads it (what the smoothed heading replaces). */
export function rawHeadingAt(recipe: Recipe, beat: number, drive?: AudioDrive): number {
  return sampleRootPath(recipe.rootPath, pathBeatAt(recipe, frozenBeat(recipe, beat), drive)).yaw;
}

/** The lean into a turn at a frame, radians (+ leans right), for a shape's [gain, most lean]. */
export function glideBankAt(recipe: Recipe, frame: number, [k, max]: readonly [number, number], drive?: AudioDrive): number {
  if (!(k > 0 && max > 0)) return 0;
  const fps = recipe.fps, g = recipe.beatGrid, step = LEAN_SECONDS / 2 / LEAN_TAPS;
  const heading = (j: number) => glideHeadingAt(recipe, beatAtSeconds(g, frame / fps + j * step), drive) * Math.PI / 180;
  // Raised-cosine weighted mean of the turning rate over the window, one interval between each pair of taps.
  let prev = heading(-LEAN_TAPS), sum = 0, weights = 0;
  for (let j = -LEAN_TAPS; j < LEAN_TAPS; j++) {
    const next = heading(j + 1), w = 0.5 + 0.5 * Math.cos(Math.PI * (j + 0.5) / LEAN_TAPS);
    sum += w * (next - prev) / step;
    weights += w;
    prev = next;
  }
  const rate = sum / weights;
  return max * Math.tanh(-rate * k / max);
}
