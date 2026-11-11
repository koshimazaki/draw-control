/**
 * Edits of a performance on the audio clock, shared by the studio timeline and agents:
 * the amplitude-per-step lane, the move lane, hit markers, retimed accent phases, the
 * hand-drawn energy curve, and snapping to beats, subdivisions and onsets.
 * Every edit returns a fresh validated recipe.
 */
import { energyAtSeconds, type AudioDrive } from "./audio-drive";
import { beatAtSeconds, secondsAtBeat } from "./beats";
import { CLIP_ACCENTS, defaultPhaseBoundaries } from "./clip-library";
import { clipPlanFor, clipSpan, effectiveDrive, laneAmplitudeAt } from "./clip-perform";
import { riggedMove } from "./examples";
import { stepCount, type StepDivision } from "./performance-config";
import { detectedMarkers } from "./reactive";
import type { HitMarker } from "./reactive-config";
import { validateRecipe, type Recipe } from "./recipe";
import type { AccentKey } from "./accents";
import { MAX_BLEND_FRAMES, MIN_BLEND_FRAMES, framesToBeats } from "./transitions";

const r4 = (x: number) => Math.round(x * 10000) / 10000;
const clone = (r: Recipe): Recipe => structuredClone(r);

/** The step lane as it plays now: the recipe's own, or values from the energy curve. */
export function currentSteps(recipe: Recipe, drive: AudioDrive | undefined, division: StepDivision): number[] {
  if (recipe.steps && recipe.steps.division === division) return [...recipe.steps.amplitude];
  const plan = clipPlanFor({ ...recipe, steps: undefined }, drive);
  return Array.from({ length: stepCount(recipe.durationBeats, division) }, (_, i) =>
    r4(laneAmplitudeAt({ ...recipe, steps: undefined, reactive: recipe.reactive && { ...recipe.reactive, humanise: 0 } }, plan, secondsAtBeat(recipe.beatGrid, i * 4 / division))));
}

export function setStepAmplitude(recipe: Recipe, args: { division: StepDivision; index: number; value: number; drive?: AudioDrive }): Recipe {
  const values = currentSteps(recipe, args.drive, args.division);
  if (args.index < 0 || args.index >= values.length) return recipe;
  values[args.index] = r4(Math.max(0, Math.min(1.5, args.value)));
  return validateRecipe({ ...clone(recipe), steps: { division: args.division, amplitude: values } });
}

/** Back to amplitude from the energy curve. */
export function clearSteps(recipe: Recipe): Recipe {
  const next = clone(recipe);
  delete next.steps;
  return validateRecipe(next);
}

/** Move lane: the clip starting at a whole beat (null removes the move that starts there). */
export function setMoveAtBeat(recipe: Recipe, beat: number, clip: string | null): Recipe {
  const at = Math.max(0, Math.min(recipe.durationBeats - 1, Math.round(beat)));
  const moves = recipe.moves.filter(m => m.atBeat !== at);
  if (clip) moves.push(riggedMove(clip, at, recipe.beatGrid.bpm));
  moves.sort((a, b) => a.atBeat - b.atBeat);
  return validateRecipe({ ...clone(recipe), moves });
}

/** Blend into a move (the transition from the move before it), in frames: 6–24, kept as beats. */
export function setMoveBlend(recipe: Recipe, args: { moveId: string; frames: number }): Recipe {
  const next = clone(recipe);
  const m = next.moves.find(x => x.id === args.moveId);
  if (!m) return recipe;
  const frames = Math.round(Math.max(MIN_BLEND_FRAMES, Math.min(MAX_BLEND_FRAMES, args.frames)));
  m.blendBeats = Math.min(8, r4(framesToBeats(frames, recipe.beatGrid.bpm)));
  return validateRecipe(next);
}

/** The markers the recipe plays: its own, or the detected hits made editable. */
export function currentMarkers(recipe: Recipe, drive?: AudioDrive): HitMarker[] {
  if (recipe.reactive?.markers) return recipe.reactive.markers.map(m => ({ ...m, phases: m.phases && [...m.phases] }));
  if (!recipe.reactive) return [];
  const span = recipe.character.kind === "rigged" ? clipSpan(60 / recipe.beatGrid.bpm) : undefined;
  return detectedMarkers(recipe, effectiveDrive(recipe, drive), span);
}

export function withMarkers(recipe: Recipe, markers: HitMarker[]): Recipe {
  if (!recipe.reactive) throw new Error("markers need the reactive layer");
  markers.sort((a, b) => a.seconds - b.seconds);
  return validateRecipe({ ...clone(recipe), reactive: { ...recipe.reactive, markers } });
}

export const addMarker = (recipe: Recipe, drive: AudioDrive | undefined, seconds: number, accent: AccentKey): Recipe =>
  withMarkers(recipe, [...currentMarkers(recipe, drive), { seconds: r4(Math.max(0, seconds)), accent, source: "manual" }]);

export const removeMarker = (recipe: Recipe, drive: AudioDrive | undefined, index: number): Recipe =>
  withMarkers(recipe, currentMarkers(recipe, drive).filter((_, i) => i !== index));

export function moveMarker(recipe: Recipe, drive: AudioDrive | undefined, index: number, seconds: number): Recipe {
  const markers = currentMarkers(recipe, drive);
  if (!markers[index]) return recipe;
  markers[index] = { ...markers[index], seconds: r4(Math.max(0, seconds)) };
  return withMarkers(recipe, markers);
}

export function setMarkerAccent(recipe: Recipe, drive: AudioDrive | undefined, index: number, accent: AccentKey): Recipe {
  const markers = currentMarkers(recipe, drive);
  if (!markers[index]) return recipe;
  markers[index] = { seconds: markers[index].seconds, accent, source: markers[index].source };   // phases, skip and hold belong to the old accent
  return withMarkers(recipe, markers);
}

/** Phase boundaries of a marker in beats from its hit (its own, or the defaults). */
export function markerPhases(recipe: Recipe, marker: HitMarker): number[] | null {
  const accent = CLIP_ACCENTS[marker.accent];
  if (!accent) return null;
  const own = marker.phases;
  return own && own.length === accent.phases.length + 1 ? [...own] : defaultPhaseBoundaries(accent, 60 / recipe.beatGrid.bpm);
}

/**
 * Retime one phase boundary of a marker to `beatsFromHit`. The key frame boundary (0)
 * moves the whole accent: the marker moves and the other boundaries keep their offsets.
 */
export function retimePhase(recipe: Recipe, drive: AudioDrive | undefined, index: number, boundary: number, beatsFromHit: number): Recipe {
  const markers = currentMarkers(recipe, drive);
  const m = markers[index];
  if (!m) return recipe;
  const b = markerPhases(recipe, m);
  if (!b || boundary < 0 || boundary >= b.length) return recipe;
  const key = b.indexOf(0);
  if (boundary === key) return moveMarker(recipe, drive, index, m.seconds + beatsFromHit * 60 / recipe.beatGrid.bpm);
  const MIN = 0.03;
  const lo = boundary > 0 ? b[boundary - 1] + MIN : -16, hi = boundary < b.length - 1 ? b[boundary + 1] - MIN : 16;
  b[boundary] = r4(Math.max(lo, Math.min(hi, beatsFromHit)));
  markers[index] = { ...m, phases: b };
  return withMarkers(recipe, markers);
}

export type SnapOptions = { division: StepDivision; onsets?: boolean; free?: boolean };
/** Snap a time to the nearest beat subdivision (and onset, when asked); free leaves it. */
export function snapSeconds(recipe: Recipe, drive: AudioDrive | undefined, seconds: number, opts: SnapOptions): number {
  if (opts.free) return seconds;
  const g = recipe.beatGrid, step = 4 / opts.division;
  let best = secondsAtBeat(g, Math.round(beatAtSeconds(g, seconds) / step) * step);
  if (opts.onsets) for (const o of drive?.onsets ?? []) if (Math.abs(o.seconds - seconds) < Math.abs(best - seconds)) best = o.seconds;
  return r4(best);
}

/** Paint the energy curve between two times (linear from `a` to `b`), starting from the analysed curve. */
export function paintEnergy(recipe: Recipe, drive: AudioDrive | undefined, from: number, to: number, a: number, b: number, rate = 12): Recipe {
  const seconds = secondsAtBeat(recipe.beatGrid, recipe.durationBeats) + 0.5;
  const eff = effectiveDrive(recipe, drive);
  const values = recipe.energyCurve && recipe.energyCurve.rate === rate ? [...recipe.energyCurve.values]
    : Array.from({ length: Math.ceil(seconds * rate) + 1 }, (_, i) => r4(energyAtSeconds(eff, i / rate)));
  const [t0, t1, v0, v1] = from <= to ? [from, to, a, b] : [to, from, b, a];
  const i0 = Math.max(0, Math.round(t0 * rate)), i1 = Math.min(values.length - 1, Math.round(t1 * rate));
  for (let i = i0; i <= i1; i++) values[i] = r4(Math.max(0, Math.min(1, i1 === i0 ? v1 : v0 + (v1 - v0) * (i - i0) / (i1 - i0))));
  return validateRecipe({ ...clone(recipe), energyCurve: { rate, values } });
}

export function clearEnergyCurve(recipe: Recipe): Recipe {
  const next = clone(recipe);
  delete next.energyCurve;
  return validateRecipe(next);
}
