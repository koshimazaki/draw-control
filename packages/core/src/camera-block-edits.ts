/**
 * The Camera track, edited like the move track: each camera range is a block (addressed by
 * its index, in time order). Drag a block to move it, drag an edge to resize it; a block
 * pushed into its neighbour trims it, and an edge shared with a neighbour rolls the cut.
 * `setCameraSegment` sets a block's modes, shot, amount and beat lock. Every edit is pure
 * and returns a fresh validated recipe.
 */
import { DEFAULT_CAMERA, type CameraConfig, type CameraSegment } from "./camera";
import { MIN_BLOCK_BEATS } from "./move-edits";
import { RecipeError, validateRecipe, type Recipe } from "./recipe";

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function cameraWith(recipe: Recipe, index: number): { cam: CameraConfig; seg: CameraSegment } {
  if (!recipe.camera) throw new RecipeError("the recipe has no camera rig (setCamera or setCameraModes adds one)");
  const cam = structuredClone(recipe.camera);
  const seg = cam.segments[index];
  if (!Number.isInteger(index) || !seg) throw new RecipeError(`no camera block ${index} (there are ${cam.segments.length}, from 0)`);
  return { cam, seg };
}
const done = (recipe: Recipe, cam: CameraConfig) => validateRecipe({ ...structuredClone(recipe), camera: cam });

/** Move a camera block to start at `toBeat`, keeping its length; neighbours it runs into are trimmed. */
export function moveCameraSegment(recipe: Recipe, args: { index: number; toBeat: number }): Recipe {
  const { cam, seg } = cameraWith(recipe, args.index);
  const prev = cam.segments[args.index - 1], next = cam.segments[args.index + 1], len = seg.toBeat - seg.fromBeat;
  const lo = prev ? prev.fromBeat + MIN_BLOCK_BEATS : 0, hi = (next ? next.toBeat - MIN_BLOCK_BEATS : recipe.durationBeats) - len;
  const from = r3(clamp(args.toBeat, lo, Math.max(lo, hi)));
  seg.fromBeat = from; seg.toBeat = r3(Math.min(recipe.durationBeats, from + len));
  if (prev && prev.toBeat > seg.fromBeat) prev.toBeat = seg.fromBeat;
  if (next && next.fromBeat < seg.toBeat) next.fromBeat = seg.toBeat;
  return done(recipe, cam);
}

/** Drag a camera block's edge; an edge shared with the neighbour (or pushed into it) rolls the cut. */
export function resizeCameraSegment(recipe: Recipe, args: { index: number; edge: "start" | "end"; toBeat: number }): Recipe {
  const { cam, seg } = cameraWith(recipe, args.index);
  const prev = cam.segments[args.index - 1], next = cam.segments[args.index + 1];
  if (args.edge === "end") {
    const old = seg.toBeat;
    seg.toBeat = r3(clamp(args.toBeat, seg.fromBeat + MIN_BLOCK_BEATS, next ? next.toBeat - MIN_BLOCK_BEATS : recipe.durationBeats));
    if (next && (next.fromBeat < seg.toBeat || Math.abs(next.fromBeat - old) < 1e-6)) next.fromBeat = seg.toBeat;
  } else {
    const old = seg.fromBeat;
    seg.fromBeat = r3(clamp(args.toBeat, prev ? prev.fromBeat + MIN_BLOCK_BEATS : 0, seg.toBeat - MIN_BLOCK_BEATS));
    if (prev && (prev.toBeat > seg.fromBeat || Math.abs(prev.toBeat - old) < 1e-6)) prev.toBeat = seg.fromBeat;
  }
  return done(recipe, cam);
}

export type CameraSegmentFields = Partial<Omit<CameraSegment, "fromBeat" | "toBeat" | "lock">> & { lock?: CameraSegment["lock"] | "off" };
const CLEARABLE = ["shot", "cut", "amount", "from", "to", "lock", "strength", "onHit", "punch"] as const;

/**
 * A camera block's fields: modes, shot, cut, amount, from, to, lock (off clears it),
 * strength, onHit, punch. `null` clears a field; fields left out keep their value.
 */
export function setCameraSegment(recipe: Recipe, args: { index: number } & { [K in keyof CameraSegmentFields]?: CameraSegmentFields[K] | null }): Recipe {
  const { cam, seg } = cameraWith(recipe, args.index);
  if (args.modes) seg.modes = (Array.isArray(args.modes) ? args.modes : [args.modes]) as CameraSegment["modes"];
  const out = seg as Record<string, unknown>;
  for (const k of CLEARABLE) {
    const v = (args as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (v === null || (k === "lock" && v === "off")) delete out[k]; else out[k] = v;
  }
  if (!seg.lock) for (const k of ["strength", "onHit", "punch"]) delete out[k];
  return done(recipe, cam);
}

/** A camera rig with one static range, for a recipe that has none. */
export const cameraOrDefault = (r: Recipe): CameraConfig => structuredClone(r.camera ?? { ...DEFAULT_CAMERA, segments: [{ fromBeat: 0, toBeat: r.durationBeats, modes: ["static"] }] });
