/**
 * Clip editing like a video editor: moves are blocks on a track.
 * - Drag a block to move it; drag either edge to make it longer or shorter. Length and
 *   speed are tied: a block twice as long plays its move at half the speed (the move's
 *   content is stretched to the block), so `speed` rescales with every length change.
 * - Snapping to the beat grid, or to the analysed kicks, snares or hats.
 * - "Start this move on the nearest kick" and "place move X on every Nth kick/snare".
 * Every edit is pure and returns a fresh validated recipe.
 */
import { BAND_ALIASES, bandOnsets, type BandAnalysis } from "./audio-bands";
import { beatAtSeconds } from "./beats";
import { LOOP_CLIPS } from "./clip-library";
import { moveEndBeat } from "./engine";
import { riggedMove } from "./examples";
import { MOVE_LIBRARY, makeMove, type MoveKey } from "./moves";
import { isAccentKey, type AccentKey } from "./accents";
import { DEFAULT_REACTIVE } from "./reactive-config";
import { AMPLITUDE_MAX, RecipeError, SPEED_RANGE, validateRecipe, type Move, type Recipe } from "./recipe";

export const SNAP_TARGETS = ["beat", "halfBeat", "kick", "snare", "hat", "free"] as const;
export type SnapTarget = (typeof SNAP_TARGETS)[number];
/** Shortest block a drag or a field can make, in beats. */
export const MIN_BLOCK_BEATS = 0.25;

const r4 = (x: number) => Math.round(x * 10000) / 10000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clone = (r: Recipe): Recipe => structuredClone(r);
const clampSpeed = (s: number) => r4(clamp(s, SPEED_RANGE[0], SPEED_RANGE[1]));

function indexOf(recipe: Recipe, moveId: string): number {
  const i = recipe.moves.findIndex(m => m.id === moveId);
  if (i < 0) throw new RecipeError(`no move with id "${moveId}"`);
  return i;
}

/** The block a move occupies on the track, in beats. */
export function blockSpan(recipe: Recipe, moveId: string): { start: number; end: number; length: number; speed: number } {
  const i = indexOf(recipe, moveId), m = recipe.moves[i], end = moveEndBeat(recipe, i);
  return { start: m.atBeat, end, length: end - m.atBeat, speed: m.speed ?? 1 };
}

/** Beats of a band's onsets (kick, snare, hat), in time order. */
export function onsetBeats(recipe: Recipe, bands: BandAnalysis | undefined, band: string, minStrength = 0): number[] {
  return bandOnsets(bands, band, minStrength).map(o => r4(beatAtSeconds(recipe.beatGrid, o.seconds))).filter(b => b >= 0 && b < recipe.durationBeats);
}

/** Snap a beat to the nearest beat, half beat, kick, snare or hat; "free" leaves it (to 1/1000 beat). */
export function snapBeat(recipe: Recipe, beat: number, target: SnapTarget, bands?: BandAnalysis): number {
  if (target === "free") return Math.round(beat * 1000) / 1000;
  if (target === "beat") return Math.round(beat);
  if (target === "halfBeat") return Math.round(beat * 2) / 2;
  const list = onsetBeats(recipe, bands, target);
  if (!list.length) return Math.round(beat);
  return list.reduce((best, b) => (Math.abs(b - beat) < Math.abs(best - beat) ? b : best), list[0]);
}

/** Set a move's length and rescale its speed so the same content fills the new block. */
function setLength(m: Move, oldLength: number, newLength: number) {
  m.speed = clampSpeed((m.speed ?? 1) * oldLength / newLength);
  m.lengthBeats = r4(newLength);
  if (m.speed === 1) delete m.speed;
}

/** Move a block to start at `toBeat`, keeping its length and speed. It stays between its neighbours' starts. */
export function moveMoveTo(recipe: Recipe, args: { moveId: string; toBeat: number }): Recipe {
  const next = clone(recipe), i = indexOf(next, args.moveId), m = next.moves[i];
  const span = blockSpan(recipe, args.moveId);
  const lo = i > 0 ? next.moves[i - 1].atBeat + 0.001 : 0;
  const hi = Math.min(next.moves[i + 1] ? next.moves[i + 1].atBeat - 0.001 : Infinity, recipe.durationBeats - MIN_BLOCK_BEATS);
  m.atBeat = r4(clamp(args.toBeat, lo, hi));
  if (m.lengthBeats === undefined && next.moves[i + 1]) m.lengthBeats = r4(span.length);
  return validateRecipe(next);
}

/**
 * Drag an edge. The end edge sets the block's length; past the next block's start it rolls
 * the cut (the next block starts later and gets shorter, so it plays faster). The start edge
 * keeps the end fixed; before the previous block's end it rolls that cut too.
 */
export function resizeMove(recipe: Recipe, args: { moveId: string; edge: "start" | "end"; toBeat: number }): Recipe {
  const next = clone(recipe), i = indexOf(next, args.moveId), m = next.moves[i];
  const { start, end, length } = blockSpan(recipe, args.moveId);
  if (args.edge === "end") {
    const after = next.moves[i + 1];
    const afterEnd = after ? moveEndBeat(recipe, i + 1) : recipe.durationBeats;
    const newEnd = clamp(args.toBeat, start + MIN_BLOCK_BEATS, after ? afterEnd - MIN_BLOCK_BEATS : recipe.durationBeats);
    setLength(m, length, newEnd - start);
    if (after && newEnd > after.atBeat) {
      setLength(after, afterEnd - after.atBeat, afterEnd - newEnd);
      after.atBeat = r4(newEnd);
    }
  } else {
    const before = next.moves[i - 1];
    const lo = before ? before.atBeat + MIN_BLOCK_BEATS : 0;
    const newStart = clamp(args.toBeat, lo, end - MIN_BLOCK_BEATS);
    setLength(m, length, end - newStart);
    m.atBeat = r4(newStart);
    if (before) {
      const beforeEnd = moveEndBeat(recipe, i - 1);
      if (newStart < beforeEnd) setLength(before, beforeEnd - before.atBeat, newStart - before.atBeat);
    }
  }
  return validateRecipe(next);
}

/**
 * The selected block's fields. `start` moves the block (as a drag), `length` resizes it from
 * its start (rescaling speed), `speed` sets the playback rate only, `amplitude` sets every phase.
 */
export function setMoveFields(recipe: Recipe, args: { moveId: string; start?: number; length?: number; speed?: number; amplitude?: number }): Recipe {
  let r = recipe;
  if (args.start !== undefined) r = moveMoveTo(r, { moveId: args.moveId, toBeat: args.start });
  if (args.length !== undefined) r = resizeMove(r, { moveId: args.moveId, edge: "end", toBeat: blockSpan(r, args.moveId).start + args.length });
  if (args.speed !== undefined || args.amplitude !== undefined) {
    r = clone(r);
    const m = r.moves[indexOf(r, args.moveId)];
    if (args.speed !== undefined) { m.speed = clampSpeed(args.speed); if (m.speed === 1) delete m.speed; }
    if (args.amplitude !== undefined) for (const p of m.phases) p.amplitude = r4(clamp(args.amplitude, 0, AMPLITUDE_MAX));
    r = validateRecipe(r);
  }
  return r;
}

/** Start a move on a kick, snare or hat: the nearest one to its start, or the `index`-th (0-based). */
export function snapMoveTo(recipe: Recipe, args: { moveId: string; target: string; index?: number }, bands?: BandAnalysis): Recipe {
  const list = onsetBeats(recipe, bands, args.target);
  if (!list.length) throw new RecipeError(`snapMoveTo: no ${args.target} onsets (analyse a track first)`);
  const from = recipe.moves[indexOf(recipe, args.moveId)].atBeat;
  let to: number;
  if (args.index !== undefined) {
    if (!Number.isInteger(args.index) || args.index < 0 || args.index >= list.length) throw new RecipeError(`snapMoveTo: index must be 0–${list.length - 1}`);
    to = list[args.index];
  } else to = list.reduce((best, b) => (Math.abs(b - from) < Math.abs(best - from) ? b : best), list[0]);
  return moveMoveTo(recipe, { moveId: args.moveId, toBeat: to });
}

/** A move for the recipe's character from a name: a rigged loop clip, a library move, or an imported clip id. */
export function makeMoveFor(recipe: Recipe, name: string, atBeat: number): Move {
  if (recipe.character.kind === "rigged" && LOOP_CLIPS[name]) return riggedMove(name, atBeat, recipe.beatGrid.bpm);
  if (Object.prototype.hasOwnProperty.call(MOVE_LIBRARY, name)) return makeMove(name as MoveKey, atBeat, { id: `${name}-${r4(atBeat)}` });
  throw new RecipeError(`unknown move ${JSON.stringify(name)} for the ${recipe.character.kind} character`);
}

/**
 * Place move X on every Nth kick, snare or hat (`every` 1 = each, 2 = every second; `offset`
 * skips the first ones). An accent (jump, spin, hit…) becomes a hit marker on each onset;
 * a loop or library move becomes a block starting there (lasting `lengthBeats`, or until
 * the next one). `fromBeat`/`toBeat` limit the range; `replace` clears the old markers or
 * the moves inside the range first.
 */
export function placeOnEvery(recipe: Recipe, args: { move: string; target: string; every?: number; offset?: number; fromBeat?: number; toBeat?: number; lengthBeats?: number; replace?: boolean }, bands?: BandAnalysis): Recipe {
  const every = args.every ?? 1, offset = args.offset ?? 0;
  if (!Number.isInteger(every) || every < 1 || every > 64) throw new RecipeError("placeOnEvery: every must be a whole number 1–64");
  if (!BAND_ALIASES[args.target]) throw new RecipeError(`placeOnEvery: target must be kick, snare or hat (got ${JSON.stringify(args.target)})`);
  const from = args.fromBeat ?? 0, to = args.toBeat ?? recipe.durationBeats;
  const beats = onsetBeats(recipe, bands, args.target).filter(b => b >= from && b < to).filter((_, k) => k >= offset && (k - offset) % every === 0);
  if (!beats.length) throw new RecipeError(`placeOnEvery: no ${args.target} onsets in beats ${from}–${to} (analyse a track first)`);
  const next = clone(recipe);
  if (isAccentKey(args.move)) {
    const reactive = next.reactive ?? { ...DEFAULT_REACTIVE, accents: [] };
    const kept = args.replace ? [] : (reactive.markers ?? []);
    const secs = beats.map(b => r4(next.beatGrid.offsetSeconds + b * 60 / next.beatGrid.bpm));
    const added = secs.map(seconds => ({ seconds, accent: args.move as AccentKey, source: "manual" as const }));
    const markers = [...kept.filter(m => !secs.some(s => Math.abs(s - m.seconds) < 1e-3)), ...added].sort((a, b) => a.seconds - b.seconds);
    next.reactive = { ...reactive, markers };
    return validateRecipe(next);
  }
  let moves = args.replace ? next.moves.filter(m => m.atBeat < from || m.atBeat >= to) : next.moves;
  moves = moves.filter(m => !beats.some(b => Math.abs(b - m.atBeat) < 1e-3));
  for (const b of beats) {
    const m = makeMoveFor(next, args.move, b);
    let id = m.id, n = 2;
    while (moves.some(x => x.id === id)) id = `${m.id}-${n++}`;
    m.id = id;
    if (args.lengthBeats !== undefined) m.lengthBeats = r4(clamp(args.lengthBeats, MIN_BLOCK_BEATS, 512));
    moves.push(m);
  }
  next.moves = moves.sort((a, b) => a.atBeat - b.atBeat);
  return validateRecipe(next);
}
