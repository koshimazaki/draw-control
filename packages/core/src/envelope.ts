/**
 * The amplitude envelope: one value per frame (0–3, 1 = as authored) that scales how big
 * every move is on that frame, on every character: the procedural figures' pose angles and
 * the rigged mannequin's clip amplitude. Stored compactly as breakpoints `[frame, value]`
 * with straight lines between them (a freehand stroke is simplified to the fewest points
 * within 0.01 of it), so it reads and edits as points too.
 * The same breakpoints and edits serve the camera automation lanes (automation.ts): every
 * edit takes an optional `lane` (amplitude, distance, height, yaw, fov; default amplitude).
 * Every edit is pure; the command table validates the result.
 */
import type { AudioDrive } from "./audio-drive";
import { bandOnsets, type BandAnalysis } from "./audio-bands";
import { LANE_SPECS, isCameraLane, laneAt, validateLanePoints, type Envelope, type EnvelopeLane, type EnvelopePoint } from "./automation";
import { DEFAULT_CAMERA } from "./camera";
import { fail } from "./validate";
import type { Recipe } from "./recipe";

export { ENVELOPE_LANES, ENVELOPE_MAX_POINTS, type Envelope, type EnvelopeLane, type EnvelopePoint } from "./automation";
export const ENVELOPE_MAX = 3;
export const ENVELOPE_SOURCES = ["amplitude", "peaks", "kick", "snare", "hat"] as const;
export type EnvelopeSource = (typeof ENVELOPE_SOURCES)[number];

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clampFor = (lane: EnvelopeLane) => (v: number) => r3(Math.max(LANE_SPECS[lane].min, Math.min(LANE_SPECS[lane].max, v)));
const clampV = clampFor("amplitude");

export const validateEnvelope = (input: unknown): Envelope => validateLanePoints(input, "envelope", LANE_SPECS.amplitude);

/** The envelope at a (fractional) frame: 1 without an envelope; held flat before the first and after the last point. */
export const envelopeAt = (env: Envelope | undefined, frame: number): number => laneAt(env, frame, 1);

/** One value per frame. */
export function envelopeValues(env: Envelope | undefined, frames: number): number[] {
  return Array.from({ length: frames }, (_, n) => envelopeAt(env, n));
}

/** Fewest breakpoints that stay within `tolerance` of per-frame values (Ramer–Douglas–Peucker); `start` is the first value's frame. */
export function simplifyEnvelope(values: readonly number[], tolerance = 0.01, clamp: (v: number) => number = clampV, start = 0): EnvelopePoint[] {
  const n = values.length;
  if (n === 0) return [[start, clamp(1)]];
  if (n === 1) return [[start, clamp(values[0])]];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, wd = tolerance;
    for (let i = a + 1; i < b; i++) {
      const line = values[a] + (values[b] - values[a]) * (i - a) / (b - a);
      const d = Math.abs(values[i] - line);
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst >= 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  const out: EnvelopePoint[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push([start + i, clamp(values[i])]);
  // Drop the middle of flat runs.
  return out.filter((p, i) => i === 0 || i === out.length - 1 || !(out[i - 1][1] === p[1] && out[i + 1][1] === p[1]));
}

const framesOf = (recipe: Recipe) => Math.ceil((recipe.beatGrid.offsetSeconds + recipe.durationBeats * 60 / recipe.beatGrid.bpm) * recipe.fps) + 1;

/** A lane's breakpoints: the amplitude envelope, or one of the camera rig's lanes. */
export function laneEnvelope(recipe: Recipe, lane: EnvelopeLane = "amplitude"): Envelope | undefined {
  if (!LANE_SPECS[lane]) return fail(`lane must be one of ${Object.keys(LANE_SPECS).join(", ")}`);
  return lane === "amplitude" ? recipe.envelope : isCameraLane(lane) ? recipe.camera?.lanes?.[lane] : undefined;
}

/** The recipe with a lane replaced (undefined removes it). A camera lane adds a static rig if there is none. */
export function withLane(recipe: Recipe, lane: EnvelopeLane, env: Envelope | undefined): Recipe {
  const next = structuredClone(recipe);
  if (lane === "amplitude") { if (env) next.envelope = env; else delete next.envelope; return next; }
  if (!isCameraLane(lane)) return fail(`unknown lane ${JSON.stringify(lane)}`);
  const cam = next.camera ?? { ...structuredClone(DEFAULT_CAMERA), segments: [{ fromBeat: 0, toBeat: recipe.durationBeats, modes: ["static" as const] }] };
  const lanes = { ...(cam.lanes ?? {}) };
  if (env) lanes[lane] = env; else delete lanes[lane];
  if (Object.keys(lanes).length) cam.lanes = lanes; else delete cam.lanes;
  next.camera = cam;
  return next;
}

/**
 * Per-frame values of a lane and the frames they cover: the amplitude envelope covers every
 * frame (1 where unset); a camera lane covers only its span, so an edit never spreads an
 * override over the whole clip. `extra` widens the span to take in a new stroke.
 */
function laneSpan(recipe: Recipe, lane: EnvelopeLane, extra?: [number, number]): { start: number; values: number[] } {
  const n = framesOf(recipe), env = laneEnvelope(recipe, lane);
  if (lane === "amplitude") return { start: 0, values: envelopeValues(env, n) };
  const pts = env?.points ?? [];
  let lo = pts.length ? pts[0][0] : Infinity, hi = pts.length ? pts[pts.length - 1][0] : -Infinity;
  if (extra) { lo = Math.min(lo, extra[0]); hi = Math.max(hi, extra[1]); }
  lo = Math.max(0, lo); hi = Math.min(hi, 200000);
  if (!(hi >= lo)) return { start: 0, values: [] };
  return { start: lo, values: Array.from({ length: hi - lo + 1 }, (_, k) => laneAt(env, lo + k, LANE_SPECS[lane].rest ?? 0)) };
}
const store = (recipe: Recipe, lane: EnvelopeLane, start: number, values: number[]): Recipe =>
  withLane(recipe, lane, { points: simplifyEnvelope(values, LANE_SPECS[lane].tolerance, clampFor(lane), start) });

/** Draw a straight segment from (fromFrame, from) to (toFrame, to) into a lane (default: the amplitude envelope). */
export function paintEnvelope(recipe: Recipe, args: { fromFrame: number; toFrame: number; from: number; to: number; lane?: EnvelopeLane }): Recipe {
  const lane = args.lane ?? "amplitude", c = clampFor(lane);
  const [f0, f1, v0, v1] = args.fromFrame <= args.toFrame ? [args.fromFrame, args.toFrame, args.from, args.to] : [args.toFrame, args.fromFrame, args.to, args.from];
  const i0 = Math.max(0, Math.round(f0)), i1 = Math.max(i0, Math.round(f1));
  const span = laneSpan(recipe, lane, [i0, i1]), end = span.start + span.values.length - 1;
  for (let i = i0; i <= Math.min(i1, end); i++) span.values[i - span.start] = c(i1 === i0 ? v1 : v0 + (v1 - v0) * (i - i0) / (i1 - i0));
  return store(recipe, lane, span.start, span.values);
}

/** A freehand stroke: one value per frame from `startFrame`. */
export function drawEnvelope(recipe: Recipe, args: { startFrame: number; values: number[]; lane?: EnvelopeLane }): Recipe {
  if (!Array.isArray(args.values) || !args.values.length || args.values.length > 200000 || args.values.some(v => typeof v !== "number" || !Number.isFinite(v))) return fail("drawEnvelope: values must be a list of numbers");
  const lane = args.lane ?? "amplitude", c = clampFor(lane), s = Math.max(0, Math.round(args.startFrame));
  const span = laneSpan(recipe, lane, [s, s + args.values.length - 1]), end = span.start + span.values.length - 1;
  args.values.forEach((v, k) => { if (s + k <= end) span.values[s + k - span.start] = c(v); });
  return store(recipe, lane, span.start, span.values);
}

export function setEnvelopePoints(recipe: Recipe, args: { points: EnvelopePoint[]; lane?: EnvelopeLane }): Recipe {
  const lane = args.lane ?? "amplitude", c = clampFor(lane);
  if (!Array.isArray(args.points)) return fail("points must be a list of [frame, value]");
  const env = validateLanePoints({ points: args.points.map(p => (Array.isArray(p) ? [Math.round(p[0]), c(p[1])] : p)) }, lane === "amplitude" ? "envelope" : `camera.lanes.${lane}`, LANE_SPECS[lane]);
  return withLane(recipe, lane, env);
}

/** Move (or without an index, add) one breakpoint; it stays between its neighbours. */
export function setEnvelopePoint(recipe: Recipe, args: { index?: number; frame: number; value: number; lane?: EnvelopeLane }): Recipe {
  const lane = args.lane ?? "amplitude", env = laneEnvelope(recipe, lane);
  const pts: EnvelopePoint[] = env ? env.points.map(p => [p[0], p[1]]) : lane === "amplitude" ? [[0, 1]] : [];
  const f = Math.max(0, Math.round(args.frame)), v = clampFor(lane)(args.value);
  if (args.index === undefined) {
    const at = pts.findIndex(p => p[0] >= f);
    if (at >= 0 && pts[at][0] === f) pts[at] = [f, v]; else pts.splice(at < 0 ? pts.length : at, 0, [f, v]);
  } else {
    const i = args.index;
    if (!pts[i]) return fail(`setEnvelopePoint: no point ${i}`);
    const lo = i > 0 ? pts[i - 1][0] + 1 : 0, hi = i < pts.length - 1 ? pts[i + 1][0] - 1 : 200000;
    pts[i] = [Math.max(lo, Math.min(hi, f)), v];
  }
  return setEnvelopePoints(recipe, { points: pts, lane });
}

export function removeEnvelopePoint(recipe: Recipe, args: { index: number; lane?: EnvelopeLane }): Recipe {
  const lane = args.lane ?? "amplitude", pts = laneEnvelope(recipe, lane)?.points ?? [];
  if (!pts[args.index]) return recipe;
  if (pts.length === 1) return clearEnvelope(recipe, { lane });
  return setEnvelopePoints(recipe, { points: pts.filter((_, i) => i !== args.index), lane });
}

export function clearEnvelope(recipe: Recipe, args: { lane?: EnvelopeLane } = {}): Recipe {
  if (!laneEnvelope(recipe, args.lane ?? "amplitude")) return recipe;
  return withLane(recipe, args.lane ?? "amplitude", undefined);
}

/**
 * Start the envelope from the music: "amplitude" follows the smoothed loudness (energy);
 * "peaks", "kick", "snare" or "hat" put a pulse on each onset, as high as its strength,
 * decaying over `decayBeats`. Values run from `min` (quiet, between hits) to `max`.
 */
export function envelopeFromAudio(recipe: Recipe, args: { source: EnvelopeSource; min?: number; max?: number; decayBeats?: number }, ctx: { drive?: AudioDrive; bands?: BandAnalysis }): Recipe {
  if (!ENVELOPE_SOURCES.includes(args.source)) return fail(`envelopeFromAudio: source must be one of ${ENVELOPE_SOURCES.join(", ")}`);
  const min = args.min ?? 0.5, max = args.max ?? 2, n = framesOf(recipe), fps = recipe.fps;
  const values = new Array<number>(n).fill(min);
  if (args.source === "amplitude") {
    const e = ctx.drive?.energy;
    if (!e?.length || ctx.drive?.source === "flat") return fail("envelopeFromAudio: no track analysed (load one, or pass --analysis)");
    for (let i = 0; i < n; i++) values[i] = min + (max - min) * e[Math.min(e.length - 1, i)];
  } else {
    const bands = ctx.bands ?? ctx.drive?.bands;
    const list = args.source === "peaks" ? bands?.peaks ?? [] : bandOnsets(bands, args.source);
    if (!list.length) return fail(`envelopeFromAudio: no ${args.source} onsets (analyse a track first)`);
    const decay = Math.max(0.05, (args.decayBeats ?? 0.5) * 60 / recipe.beatGrid.bpm) * fps;
    const pulse = new Array<number>(n).fill(0);
    for (const o of list) {
      const f0 = Math.round(o.seconds * fps);
      for (let i = Math.max(0, f0); i < Math.min(n, f0 + Math.ceil(decay * 4)); i++) pulse[i] = Math.max(pulse[i], o.strength * Math.exp(-(i - f0) / decay));
    }
    for (let i = 0; i < n; i++) values[i] = min + (max - min) * pulse[i];
  }
  return store(recipe, "amplitude", 0, values);
}
