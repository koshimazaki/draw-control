/**
 * Transitions of the rigged mannequin's clips, so one move flows into the next without a pop:
 * - move to move: an eased crossfade over the move's `blendBeats`, never shorter than
 *   MIN_BLEND_FRAMES (a 0 blend would cut); the per-transition length is edited on the move lane;
 * - pose matching: when a gait (walk, jog, sprint, crouch walk) follows a gait, the new loop
 *   starts on the step of the same foot the old one was about to take, so the legs do not
 *   cross during the crossfade;
 * - accents: each fades in and out over at least MIN_BLEND_FRAMES (holding its first or last
 *   frame when a phase is shorter), a clip switch inside an accent (take-off clip to landing
 *   clip) crossfades over SWITCH_FRAMES centred on the boundary, and a later accent covers an
 *   earlier one as it fades in (a jab into a cross hands over instead of averaging).
 * All pure: functions of the recipe and the frame.
 */
import { LOOP_CLIPS, loopCycleBeats } from "./clip-library";
import type { Move, Recipe } from "./recipe";

export const MIN_BLEND_FRAMES = 6;
/** Upper end offered by the move lane's blend handle (the recipe allows up to 8 beats). */
export const MAX_BLEND_FRAMES = 24;
export const SWITCH_FRAMES = 8;
const FPS = 24;

export const framesToBeats = (frames: number, bpm: number) => frames / FPS * bpm / 60;
export const beatsToFrames = (beats: number, bpm: number) => beats * 60 / bpm * FPS;

/** The blend into a move as it plays, in beats: its own, at least MIN_BLEND_FRAMES. */
export function blendBeatsOf(move: Pick<Move, "blendBeats">, recipe: Pick<Recipe, "beatGrid">): number {
  return Math.max(move.blendBeats, framesToBeats(MIN_BLEND_FRAMES, recipe.beatGrid.bpm));
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

/**
 * Cycle offsets (0–1) per move: a gait following a gait starts on the foot the previous
 * one would step with next. Others start at 0 (their first step on the move's beat).
 * `levelAt(beat)` is the tempo level the loop plays at on that beat.
 */
export function gaitOffsets(recipe: Recipe, levelAt: (beat: number) => number): number[] {
  const bpm = recipe.beatGrid.bpm;
  const offsets: number[] = [];
  recipe.moves.forEach((m, i) => {
    offsets.push(0);
    const prev = recipe.moves[i - 1];
    const a = prev?.clip ? LOOP_CLIPS[prev.clip] : undefined, b = m.clip ? LOOP_CLIPS[m.clip] : undefined;
    if (!a?.gait || !b?.gait) return;
    const cycle = loopCycleBeats(a, bpm, levelAt(m.atBeat - 1e-6));
    const phase = mod((m.atBeat - prev.atBeat) / cycle + offsets[i - 1], 1);
    const step = Math.round(phase * a.steps) % a.steps;     // the step the old gait takes on this beat
    offsets[i] = (step % 2) / b.steps;                       // step 0 is the left foot in both
  });
  return offsets;
}

/**
 * Accent weights after layering: a later accent covers the earlier ones as it fades in.
 * `weights` are in hit order; the result sums to at most 1.
 */
export function layeredWeights(weights: readonly number[]): number[] {
  const out = weights.map(() => 0);
  let cover = 1;
  for (let j = weights.length - 1; j >= 0; j--) { out[j] = weights[j] * cover; cover *= 1 - weights[j]; }
  return out;
}

/**
 * Phase boundaries as played, with skipped phases removed and their neighbours closing
 * the gap: a phase before the key frame pulls the earlier phases later, a phase after it
 * pulls the later phases earlier, so the key frame (0) stays on the hit.
 */
export function playedBoundaries(boundaries: readonly number[], skip?: readonly number[]): number[] {
  const out = [...boundaries];
  if (!skip?.length) return out;
  const key = out.indexOf(0);
  for (const i of skip) {
    if (i < 0 || i >= out.length - 1) continue;
    const len = out[i + 1] - out[i];
    if (i < key) for (let k = 0; k <= i; k++) out[k] += len;
    else for (let k = i + 1; k < out.length; k++) out[k] -= len;
  }
  return out;
}
