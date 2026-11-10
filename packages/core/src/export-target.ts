/**
 * What an export has to satisfy to be accepted downstream, and which section of the
 * recipe it covers. Pure, so the studio, tests and a future CLI share one source.
 *
 * TARGET MODEL CONSTRAINTS: a deliberately small local table. The sibling repo
 * `model-arena` holds the full per-model spec database (every provider's schema);
 * re-sync this table with it whenever that database changes. The studio only warns
 * when an export falls outside these limits; it never blocks the export.
 */
import { snapFrames8k1 } from "./beats";
import { recipeSeconds, RecipeError, type Recipe } from "./recipe";

export type ModelConstraint = {
  id: string;
  label: string;
  /** Allowed pixel range for each side of a reference video. */
  minSidePx: number; maxSidePx: number;
  minFps: number; maxFps: number;
  minSeconds: number; maxSeconds: number;
};

/** Re-sync with the per-model spec database in `model-arena`. */
export const TARGET_MODEL_CONSTRAINTS: readonly ModelConstraint[] = [
  {
    id: "reference-video",
    label: "Reference-video input of the target video model",
    minSidePx: 700, maxSidePx: 4553,
    minFps: 24, maxFps: 60,
    minSeconds: 3, maxSeconds: 30,
  },
];
export const DEFAULT_TARGET = TARGET_MODEL_CONSTRAINTS[0];

export type ExportSize = { width: number; height: number; label: string };
export const EXPORT_SIZES: readonly ExportSize[] = [
  { width: 1280, height: 720, label: "1280×720 (landscape)" },
  { width: 1920, height: 1080, label: "1920×1080 (landscape)" },
  { width: 720, height: 1280, label: "720×1280 (portrait)" },
];
export const DEFAULT_EXPORT_SIZE = EXPORT_SIZES[0];

/** Human-readable reasons an export would be refused by the target. Empty when it fits. */
export function constraintWarnings(
  e: { width: number; height: number; fps: number; seconds: number },
  target: ModelConstraint = DEFAULT_TARGET,
): string[] {
  const out: string[] = [];
  for (const [side, px] of [["width", e.width], ["height", e.height]] as const) {
    if (px < target.minSidePx) out.push(`${side} ${px} px is under the ${target.minSidePx} px minimum`);
    if (px > target.maxSidePx) out.push(`${side} ${px} px is over the ${target.maxSidePx} px maximum`);
  }
  if (e.fps < target.minFps || e.fps > target.maxFps) out.push(`${e.fps} fps is outside ${target.minFps}–${target.maxFps} fps`);
  if (e.seconds < target.minSeconds) out.push(`clip length ${e.seconds.toFixed(2)} s is under the ${target.minSeconds} s minimum`);
  if (e.seconds > target.maxSeconds) out.push(`clip length ${e.seconds.toFixed(2)} s is over the ${target.maxSeconds} s maximum`);
  return out;
}

export type RangeUnit = "beats" | "seconds";
/** A requested section. Omitted `start` = frame 0; omitted `length` = to the end of the recipe. */
export type RangeRequest = { unit: RangeUnit; start?: number; length?: number };
export type ExportRange = {
  /** First recipe frame of the export (frame 0 of the clip). */
  startFrame: number;
  /** Frame count, always 8k+1. */
  frames: number;
  startSeconds: number;
  seconds: number;
};

const toSeconds = (recipe: Recipe, unit: RangeUnit, x: number) => unit === "seconds" ? x : x * 60 / recipe.beatGrid.bpm;

/**
 * Resolve a section of the recipe to whole frames. A start in beats counts from beat 0
 * (which sits at the grid offset); in seconds it counts from frame 0. The start is
 * floored to a frame so a beat at the start lands on frame 0 or just after it; the
 * length is clamped to the recipe end and then rounded up to 8k+1 frames.
 */
export function resolveExportRange(recipe: Recipe, req: RangeRequest = { unit: "seconds" }): ExportRange {
  const totalFrames = snapFrames8k1(recipeSeconds(recipe) * recipe.fps);
  const start = req.start;
  if (start !== undefined && (!Number.isFinite(start) || start < 0)) throw new RecipeError("export range: start must be zero or more");
  const startSeconds = start === undefined ? 0
    : req.unit === "beats" ? recipe.beatGrid.offsetSeconds + toSeconds(recipe, "beats", start) : start;
  const startFrame = Math.floor(startSeconds * recipe.fps + 1e-6);
  if (startFrame >= totalFrames - 1) throw new RecipeError("export range: start is past the end of the recipe");
  const remaining = totalFrames - startFrame;
  let wanted = remaining;
  if (req.length !== undefined) {
    if (!Number.isFinite(req.length) || req.length <= 0) throw new RecipeError("export range: length must be more than zero");
    wanted = Math.min(remaining, toSeconds(recipe, req.unit, req.length) * recipe.fps);
  }
  const frames = snapFrames8k1(wanted - 1e-6);
  return { startFrame, frames, startSeconds: startFrame / recipe.fps, seconds: frames / recipe.fps };
}
