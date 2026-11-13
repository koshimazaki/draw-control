/**
 * Freeze: the character holds its position, height and pose for a block (`recipe.freezes`,
 * the script's `freeze` action word), mid-air if it was jumping, while the camera keeps
 * moving. Afterwards it carries on from where it stopped: the rest of its motion is
 * re-timed to fit what is left of the clip, so it still finishes on the last beat (after a
 * freeze, stations land a little off their hits; say so when it matters). Pure.
 */
import type { Recipe } from "./recipe";

export type Freeze = { fromBeat: number; toBeat: number };

/** The beat the character's motion is evaluated at: held inside a freeze, compressed after it. */
export function frozenBeat(recipe: Pick<Recipe, "freezes" | "durationBeats">, beat: number): number {
  const list = recipe.freezes;
  if (!list?.length) return beat;
  const end = recipe.durationBeats;
  let t = beat;
  // Latest first: each freeze maps real time onto the time before it.
  for (let i = list.length - 1; i >= 0; i--) {
    const { fromBeat: a, toBeat: b } = list[i];
    if (t <= a) continue;
    t = t <= b ? a : a + (t - b) * (end - a) / Math.max(1e-9, end - b);
  }
  return t;
}
