/**
 * The feel of one accent marker, for the studio's marker inspector and phase lane and for agents:
 * - impact ("hit harder", 0–1): overshoot past the key pose, a deeper squash on a landing,
 *   and a hold of up to 3 frames on the impact frame (evaluated in clip-perform.ts);
 * - anticipation: the wind-up before the strike, in beats from the accent's start to the
 *   start of its contact phase. Setting it scales the wind-up phases and keeps the strike
 *   and the key frame on the hit; it is stored in the marker's `phases`.
 */
import type { AudioDrive } from "./audio-drive";
import { CLIP_ACCENTS } from "./clip-library";
import { currentMarkers, markerPhases, withMarkers } from "./performance-edits";
import type { Recipe } from "./recipe";

const r4 = (x: number) => Math.round(x * 10000) / 10000;
export const ANTICIPATION_MIN_BEATS = 0.0625;
export const ANTICIPATION_MAX_BEATS = 4;

export function setImpact(recipe: Recipe, drive: AudioDrive | undefined, index: number, value: number): Recipe {
  const markers = currentMarkers(recipe, drive);
  const m = markers[index];
  if (!m) return recipe;
  const v = r4(Math.max(0, Math.min(1, value)));
  const next = { ...m, impact: v };
  if (!v) delete (next as Partial<typeof next>).impact;
  markers[index] = next;
  return withMarkers(recipe, markers);
}

/** Beats of wind-up before the strike of a marker's accent, or null when it has no clip phases. */
export function anticipationBeats(recipe: Recipe, marker: Parameters<typeof markerPhases>[1]): number | null {
  const a = CLIP_ACCENTS[marker.accent], b = markerPhases(recipe, marker);
  if (!a || !b || a.contact === 0) return null;
  return r4(b[a.contact] - b[0]);
}

/** Set the wind-up length (beats, 1/16 of a beat to 4 beats), scaling the phases before the strike. */
export function setAnticipation(recipe: Recipe, drive: AudioDrive | undefined, index: number, beats: number): Recipe {
  const markers = currentMarkers(recipe, drive);
  const m = markers[index], a = m && CLIP_ACCENTS[m.accent], b = m && markerPhases(recipe, m);
  if (!m || !a || !b || a.contact === 0) return recipe;
  const now = b[a.contact] - b[0], want = Math.max(ANTICIPATION_MIN_BEATS, Math.min(ANTICIPATION_MAX_BEATS, beats));
  if (now <= 0) return recipe;
  const c = b[a.contact];
  for (let i = 0; i < a.contact; i++) b[i] = r4(c - (c - b[i]) * want / now);
  markers[index] = { ...m, phases: b };
  return withMarkers(recipe, markers);
}
