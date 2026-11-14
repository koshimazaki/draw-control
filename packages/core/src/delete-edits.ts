/**
 * Deleting parts of a performance, with a choice for the gap it leaves:
 * - "close": the neighbours close the gap (later moves move earlier; the phases of an
 *   accent close up towards its key frame; later steps move one step earlier);
 * - "hold": the gap holds (the move before plays on; the accent's phase holds its first
 *   frame; the step takes the value of the step before).
 * Hit markers are deleted outright (they sit on the music). Every edit returns a fresh
 * validated recipe; nothing found to delete returns the recipe unchanged.
 */
import type { AudioDrive } from "./audio-drive";
import { CLIP_ACCENTS } from "./clip-library";
import { currentMarkers, currentSteps, removeMarker, withMarkers } from "./performance-edits";
import type { StepDivision } from "./performance-config";
import { validateRecipe, type Recipe } from "./recipe";

export type GapMode = "close" | "hold";
const clone = (r: Recipe): Recipe => structuredClone(r);

/** Delete a move. "close" moves every later move earlier by the beats it played. */
export function deleteMove(recipe: Recipe, args: { moveId: string; mode: GapMode }): Recipe {
  const i = recipe.moves.findIndex(m => m.id === args.moveId);
  if (i < 0) return recipe;
  const next = clone(recipe);
  const [gone] = next.moves.splice(i, 1);
  if (args.mode === "close") {
    const span = (recipe.moves[i + 1]?.atBeat ?? recipe.durationBeats) - gone.atBeat;
    for (const m of next.moves.slice(i)) m.atBeat -= span;
  }
  return validateRecipe(next);
}

/**
 * Delete one phase block of a marker's accent (e.g. "spin" from gather, spin, settle).
 * Deleting the last phase left deletes the marker.
 */
export function deletePhase(recipe: Recipe, drive: AudioDrive | undefined, args: { marker: number; phase: number; mode: GapMode }): Recipe {
  const markers = currentMarkers(recipe, drive);
  const m = markers[args.marker], accent = m && CLIP_ACCENTS[m.accent];
  if (!m || !accent || args.phase < 0 || args.phase >= accent.phases.length) return recipe;
  const skip = new Set(m.skip ?? []), hold = new Set(m.hold ?? []);
  if (args.mode === "close") { skip.add(args.phase); hold.delete(args.phase); } else { hold.add(args.phase); skip.delete(args.phase); }
  if (skip.size >= accent.phases.length) return removeMarker(recipe, drive, args.marker);
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  const edited = { ...m, skip: sorted(skip), hold: sorted(hold) };
  if (!edited.skip.length) delete (edited as Partial<typeof edited>).skip;
  if (!edited.hold.length) delete (edited as Partial<typeof edited>).hold;
  markers[args.marker] = edited;
  return withMarkers(recipe, markers);
}

/** Bring a deleted phase back. */
export function restorePhase(recipe: Recipe, drive: AudioDrive | undefined, args: { marker: number; phase: number }): Recipe {
  const markers = currentMarkers(recipe, drive);
  const m = markers[args.marker];
  if (!m) return recipe;
  const edited = { ...m, skip: (m.skip ?? []).filter(k => k !== args.phase), hold: (m.hold ?? []).filter(k => k !== args.phase) };
  if (!edited.skip.length) delete (edited as Partial<typeof edited>).skip;
  if (!edited.hold.length) delete (edited as Partial<typeof edited>).hold;
  markers[args.marker] = edited;
  return withMarkers(recipe, markers);
}

/** Delete one step of the amplitude lane. */
export function deleteStep(recipe: Recipe, drive: AudioDrive | undefined, args: { division: StepDivision; index: number; mode: GapMode }): Recipe {
  const values = currentSteps(recipe, drive, args.division);
  const i = args.index;
  // A one-step lane has no neighbour to close up to or hold from: nothing to do.
  if (i < 0 || i >= values.length || values.length < 2) return recipe;
  if (args.mode === "close") { values.splice(i, 1); values.push(values[values.length - 1]); }
  else values[i] = values[i - 1] ?? values[i + 1] ?? values[i];
  return validateRecipe({ ...clone(recipe), steps: { division: args.division, amplitude: values } });
}
