/**
 * The amplitude envelope: one value per frame (0–3, 1 = as authored) that scales how big
 * every move is on that frame, on every character: the procedural figures' pose angles and
 * the rigged mannequin's clip amplitude. Stored compactly as breakpoints `[frame, value]`
 * with straight lines between them (a freehand stroke is simplified to the fewest points
 * within 0.01 of it), so it reads and edits as points too.
 * Every edit is pure and returns a fresh validated recipe.
 */
import type { AudioDrive } from "./audio-drive";
import { bandOnsets, type BandAnalysis } from "./audio-bands";
import { fail, isObject, only } from "./validate";
import type { Recipe } from "./recipe";

export const ENVELOPE_MAX = 3;
export const ENVELOPE_MAX_POINTS = 8192;
export type EnvelopePoint = [frame: number, value: number];
export type Envelope = { points: EnvelopePoint[] };
export const ENVELOPE_SOURCES = ["amplitude", "peaks", "kick", "snare", "hat"] as const;
export type EnvelopeSource = (typeof ENVELOPE_SOURCES)[number];

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clampV = (v: number) => r3(Math.max(0, Math.min(ENVELOPE_MAX, v)));

export function validateEnvelope(input: unknown): Envelope {
  if (!isObject(input)) return fail("envelope must be an object");
  only(input, ["points"], "envelope");
  const pts = input.points;
  if (!Array.isArray(pts) || pts.length < 1 || pts.length > ENVELOPE_MAX_POINTS) return fail(`envelope.points needs 1–${ENVELOPE_MAX_POINTS} [frame, value] pairs`);
  let last = -1;
  return {
    points: pts.map((p, i): EnvelopePoint => {
      if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || p[0] < 0 || p[0] > 200000 || typeof p[1] !== "number" || !Number.isFinite(p[1]) || p[1] < 0 || p[1] > ENVELOPE_MAX)
        fail(`envelope.points[${i}] must be [whole frame, value 0–${ENVELOPE_MAX}]`);
      if (p[0] <= last) fail(`envelope.points[${i}] must come after the point before it`);
      last = p[0];
      return [p[0], p[1]];
    }),
  };
}

/** The envelope at a (fractional) frame: 1 without an envelope; held flat before the first and after the last point. */
export function envelopeAt(env: Envelope | undefined, frame: number): number {
  const p = env?.points;
  if (!p?.length) return 1;
  if (frame <= p[0][0]) return p[0][1];
  if (frame >= p[p.length - 1][0]) return p[p.length - 1][1];
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid][0] <= frame) lo = mid; else hi = mid; }
  const [f0, v0] = p[lo], [f1, v1] = p[hi];
  return v0 + (v1 - v0) * (frame - f0) / (f1 - f0);
}

/** One value per frame. */
export function envelopeValues(env: Envelope | undefined, frames: number): number[] {
  return Array.from({ length: frames }, (_, n) => envelopeAt(env, n));
}

/** Fewest breakpoints that stay within `tolerance` of per-frame values (Ramer–Douglas–Peucker). */
export function simplifyEnvelope(values: readonly number[], tolerance = 0.01): EnvelopePoint[] {
  const n = values.length;
  if (n === 0) return [[0, 1]];
  if (n === 1) return [[0, clampV(values[0])]];
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
  for (let i = 0; i < n; i++) if (keep[i]) out.push([i, clampV(values[i])]);
  // Drop the middle of flat runs.
  return out.filter((p, i) => i === 0 || i === out.length - 1 || !(out[i - 1][1] === p[1] && out[i + 1][1] === p[1]));
}

const framesOf = (recipe: Recipe) => Math.ceil((recipe.beatGrid.offsetSeconds + recipe.durationBeats * 60 / recipe.beatGrid.bpm) * recipe.fps) + 1;
const withValues = (recipe: Recipe, values: number[]): Recipe => ({ ...structuredClone(recipe), envelope: { points: simplifyEnvelope(values) } });

/** Draw a straight segment from (fromFrame, from) to (toFrame, to) into the envelope. */
export function paintEnvelope(recipe: Recipe, args: { fromFrame: number; toFrame: number; from: number; to: number }): Recipe {
  const n = framesOf(recipe), values = envelopeValues(recipe.envelope, n);
  const [f0, f1, v0, v1] = args.fromFrame <= args.toFrame ? [args.fromFrame, args.toFrame, args.from, args.to] : [args.toFrame, args.fromFrame, args.to, args.from];
  const i0 = Math.max(0, Math.round(f0)), i1 = Math.min(n - 1, Math.round(f1));
  for (let i = i0; i <= i1; i++) values[i] = clampV(i1 === i0 ? v1 : v0 + (v1 - v0) * (i - i0) / (i1 - i0));
  return withValues(recipe, values);
}

/** A freehand stroke: one value per frame from `startFrame`. */
export function drawEnvelope(recipe: Recipe, args: { startFrame: number; values: number[] }): Recipe {
  if (!Array.isArray(args.values) || args.values.length > 200000 || args.values.some(v => typeof v !== "number" || !Number.isFinite(v))) return fail("drawEnvelope: values must be a list of numbers");
  const n = framesOf(recipe), values = envelopeValues(recipe.envelope, n), s = Math.max(0, Math.round(args.startFrame));
  args.values.forEach((v, k) => { if (s + k < n) values[s + k] = clampV(v); });
  return withValues(recipe, values);
}

export function setEnvelopePoints(recipe: Recipe, args: { points: EnvelopePoint[] }): Recipe {
  return { ...structuredClone(recipe), envelope: validateEnvelope({ points: args.points.map(([f, v]) => [Math.round(f), clampV(v)]) }) };
}

/** Move (or with `insert`, add) one breakpoint; it stays between its neighbours. */
export function setEnvelopePoint(recipe: Recipe, args: { index?: number; frame: number; value: number }): Recipe {
  const pts: EnvelopePoint[] = recipe.envelope ? recipe.envelope.points.map(p => [p[0], p[1]]) : [[0, 1]];
  const f = Math.max(0, Math.round(args.frame)), v = clampV(args.value);
  if (args.index === undefined) {
    const at = pts.findIndex(p => p[0] >= f);
    if (at >= 0 && pts[at][0] === f) pts[at] = [f, v]; else pts.splice(at < 0 ? pts.length : at, 0, [f, v]);
  } else {
    const i = args.index;
    if (!pts[i]) return fail(`setEnvelopePoint: no point ${i}`);
    const lo = i > 0 ? pts[i - 1][0] + 1 : 0, hi = i < pts.length - 1 ? pts[i + 1][0] - 1 : 200000;
    pts[i] = [Math.max(lo, Math.min(hi, f)), v];
  }
  return setEnvelopePoints(recipe, { points: pts });
}

export function removeEnvelopePoint(recipe: Recipe, args: { index: number }): Recipe {
  const pts = recipe.envelope?.points ?? [];
  if (!pts[args.index]) return recipe;
  if (pts.length === 1) return clearEnvelope(recipe);
  return setEnvelopePoints(recipe, { points: pts.filter((_, i) => i !== args.index) });
}

export function clearEnvelope(recipe: Recipe): Recipe {
  const next = structuredClone(recipe);
  delete next.envelope;
  return next;
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
  return withValues(recipe, values);
}
