/**
 * Recipe edits as pure functions. The studio UI and an agent (CLI or MCP, next)
 * use the same commands; each returns a new validated recipe and never mutates its input.
 */
import { MOVE_LIBRARY, makeMove, type MoveKey } from "./moves";
import { RecipeError, validateRecipe, type Move, type Recipe } from "./recipe";

const clone = <T>(x: T): T => structuredClone(x);
const isMoveKey = (x: unknown): x is MoveKey => typeof x === "string" && Object.prototype.hasOwnProperty.call(MOVE_LIBRARY, x);

function findMove(recipe: Recipe, moveId: string): number {
  const i = recipe.moves.findIndex(m => m.id === moveId);
  if (i < 0) throw new RecipeError(`no move with id "${moveId}"`);
  return i;
}
function findPhase(move: Move, phase: number | string): number {
  const i = typeof phase === "number" ? phase : move.phases.findIndex(p => p.name === phase);
  if (!move.phases[i]) throw new RecipeError(`move "${move.id}" has no phase ${JSON.stringify(phase)}`);
  return i;
}
function uniqueId(recipe: Recipe, base: string): string {
  let id = base, n = 2;
  while (recipe.moves.some(m => m.id === id)) id = `${base}-${n++}`;
  return id;
}

/** Insert a library move (or a full move) at a whole beat; a move already on that beat is replaced. */
export function insertMove(recipe: Recipe, args: { move: MoveKey | Move; atBeat: number }): Recipe {
  if (!Number.isInteger(args.atBeat)) throw new RecipeError("insertMove: atBeat must be a whole beat");
  const next = clone(recipe);
  const kept = next.moves.filter(m => m.atBeat !== args.atBeat);
  let move: Move;
  if (isMoveKey(args.move)) move = makeMove(args.move, args.atBeat, { id: uniqueId({ ...next, moves: kept }, `${args.move}-${args.atBeat}`) });
  else if (typeof args.move === "object" && args.move) move = { ...clone(args.move), atBeat: args.atBeat };
  else throw new RecipeError(`insertMove: unknown move ${JSON.stringify(args.move)}`);
  next.moves = [...kept, move].sort((a, b) => a.atBeat - b.atBeat);
  return validateRecipe(next);
}

/** Replace a move with a library move, keeping its beat and id. */
export function swapMove(recipe: Recipe, args: { moveId: string; to: MoveKey }): Recipe {
  if (!isMoveKey(args.to)) throw new RecipeError(`swapMove: unknown move ${JSON.stringify(args.to)}`);
  const next = clone(recipe);
  const i = findMove(next, args.moveId);
  next.moves[i] = makeMove(args.to, next.moves[i].atBeat, { id: next.moves[i].id });
  return validateRecipe(next);
}

export function removeMove(recipe: Recipe, args: { moveId: string }): Recipe {
  const next = clone(recipe);
  next.moves.splice(findMove(next, args.moveId), 1);
  return validateRecipe(next);
}

/** Set the amplitude of one phase, or of every phase when `phase` is omitted. */
export function setAmplitude(recipe: Recipe, args: { moveId: string; phase?: number | string; value: number }): Recipe {
  const next = clone(recipe);
  const move = next.moves[findMove(next, args.moveId)];
  const targets = args.phase === undefined ? move.phases.map((_, i) => i) : [findPhase(move, args.phase)];
  for (const i of targets) move.phases[i].amplitude = args.value;
  return validateRecipe(next);
}

/** Lengthen (or, with a negative `by`, shorten) a phase by a number of beats. */
export function extendPhase(recipe: Recipe, args: { moveId: string; phase: number | string; by: number }): Recipe {
  if (!Number.isFinite(args.by)) throw new RecipeError("extendPhase: by must be a number of beats");
  const next = clone(recipe);
  const move = next.moves[findMove(next, args.moveId)];
  const phase = move.phases[findPhase(move, args.phase)];
  if ("beats" in phase.length) phase.length = { beats: phase.length.beats + args.by };
  else phase.length = { frames: Math.round(phase.length.frames + args.by * 60 / next.beatGrid.bpm * next.fps) };
  return validateRecipe(next);
}

export type MotionCommand =
  | { type: "insertMove"; move: MoveKey; atBeat: number }
  | { type: "swapMove"; moveId: string; to: MoveKey }
  | { type: "removeMove"; moveId: string }
  | { type: "setAmplitude"; moveId: string; phase?: number | string; value: number }
  | { type: "extendPhase"; moveId: string; phase: number | string; by: number };

/** Single entry point for agents: one typed command in, one validated recipe out. */
export function applyMotionCommand(recipe: Recipe, command: MotionCommand): Recipe {
  if (!command || typeof command !== "object") throw new RecipeError("command must be an object");
  const { type, ...args } = command as MotionCommand & Record<string, unknown>;
  switch (type) {
    case "insertMove": return insertMove(recipe, args as Parameters<typeof insertMove>[1]);
    case "swapMove": return swapMove(recipe, args as Parameters<typeof swapMove>[1]);
    case "removeMove": return removeMove(recipe, args as Parameters<typeof removeMove>[1]);
    case "setAmplitude": return setAmplitude(recipe, args as Parameters<typeof setAmplitude>[1]);
    case "extendPhase": return extendPhase(recipe, args as Parameters<typeof extendPhase>[1]);
    default: throw new RecipeError(`unknown command type ${JSON.stringify(type)}`);
  }
}
