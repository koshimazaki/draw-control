/**
 * Recipe edits as pure functions, and the one command entry point (`applyMotionCommand`)
 * the studio UI, the CLI and the MCP server share. Each command returns a new validated
 * recipe and never mutates its input. Commands that read the music (kicks, snares, the
 * detected hits, the energy curve) take a context with the analysed bands and drive.
 */
import type { AccentKey } from "./accents";
import { COMMAND_TABLE, runTableCommand } from "./command-table";
import type { AudioDrive } from "./audio-drive";
import type { BandAnalysis } from "./audio-bands";
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
  if (!Number.isFinite(args.atBeat)) throw new RecipeError("insertMove: atBeat must be a beat");
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

/**
 * Moves that have no effect on a character kind: library moves on a loaded file (its
 * rig is not driven by recipe poses, so they show the rest pose), and clip moves on the
 * procedural figures (they have no embedded clips).
 */
export function incompatibleMoves(recipe: Recipe, kind: Recipe["character"]["kind"]): Move[] {
  return recipe.moves.filter(m => (kind === "file" || kind === "rigged" ? !m.clip : !!m.clip));
}

/** Remove the moves `incompatibleMoves` lists. The result is a valid recipe, possibly with no moves. */
export function clearIncompatibleMoves(recipe: Recipe, kind: Recipe["character"]["kind"]): Recipe {
  const drop = new Set(incompatibleMoves(recipe, kind).map(m => m.id));
  return validateRecipe({ ...clone(recipe), moves: recipe.moves.filter(m => !drop.has(m.id)).map(clone) });
}

/** What a command may read besides the recipe: the analysed drum bands and the audio drive. */
export type CommandContext = { bands?: BandAnalysis; drive?: AudioDrive };

/** Set any recipe field by path ("beatGrid.bpm", "moves[2].speed", "moves#Dance_Loop-4.speed", "camera.distance"); null deletes it. */
export function setField(recipe: Recipe, args: { path: string; value: unknown }): Recipe {
  const parts = parsePath(args.path);
  if (!parts.length) throw new RecipeError("set: empty path");
  const next = clone(recipe) as unknown as Record<string, unknown>;
  let obj: Record<string, unknown> | unknown[] = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    let child: unknown = typeof key === "number" ? (obj as unknown as unknown[])[key] : (obj as Record<string, unknown>)[key];
    if (child === undefined) {
      if (typeof parts[i + 1] === "number") throw new RecipeError(`set: ${args.path}: no list at ${String(key)}`);
      child = {};
      (obj as Record<string, unknown>)[key as string] = child;
    }
    if (!child || typeof child !== "object") throw new RecipeError(`set: ${args.path}: ${String(key)} is not an object`);
    obj = child as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (args.value === null && typeof last === "string") delete (obj as Record<string, unknown>)[last];
  else if (typeof last === "number") (obj as unknown as unknown[])[last] = args.value;
  else (obj as Record<string, unknown>)[last] = args.value;
  return validateRecipe(next);

  function parsePath(path: string): (string | number)[] {
    if (typeof path !== "string" || path.length > 200 || !/^[A-Za-z0-9_.#[\]-]+$/.test(path)) throw new RecipeError("set: path must be letters, digits, dots, [n] or #id");
    const out: (string | number)[] = [];
    for (const seg of path.split(".")) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)?((?:\[\d+\])*)(?:#([A-Za-z0-9_.-]+))?$/.exec(seg);
      if (!m) throw new RecipeError(`set: bad path segment ${JSON.stringify(seg)}`);
      if (m[1]) out.push(m[1]);
      for (const idx of m[2].match(/\d+/g) ?? []) out.push(Number(idx));
      if (m[3]) {
        if (out[out.length - 1] !== "moves") throw new RecipeError("set: #id addresses moves only (moves#<id>)");
        const i = recipe.moves.findIndex(mv => mv.id === m[3]);
        if (i < 0) throw new RecipeError(`set: no move with id "${m[3]}"`);
        out.push(i);
      }
    }
    if (out.some(p => p === "__proto__" || p === "constructor" || p === "prototype")) throw new RecipeError("set: forbidden path");
    return out;
  }
}

export type MotionCommand =
  | { type: "insertMove"; move: MoveKey; atBeat: number }
  | { type: "swapMove"; moveId: string; to: MoveKey }
  | { type: "removeMove"; moveId: string }
  | { type: "setAmplitude"; moveId: string; phase?: number | string; value: number }
  | { type: "extendPhase"; moveId: string; phase: number | string; by: number }
  | { type: "set"; path: string; value: unknown }
  | ({ type: string } & Record<string, unknown>);

/** The core commands with their one-line help, for the CLI, the MCP server and docs/agents.md. */
export const CORE_COMMANDS: Record<string, string> = {
  insertMove: "{ move, atBeat } a library move (procedural figures) at a beat",
  swapMove: "{ moveId, to } replace a move with a library move",
  removeMove: "{ moveId } remove a move",
  setAmplitude: "{ moveId, phase?, value } amplitude of a phase or of every phase, 0–3",
  extendPhase: "{ moveId, phase, by } lengthen (negative: shorten) a phase by beats",
  set: "{ path, value } set any recipe field by path, e.g. beatGrid.bpm, moves#<id>.speed, camera.distance; null deletes",
};

/** Single entry point: one typed command in, one validated recipe out. */
export function applyMotionCommand(recipe: Recipe, command: MotionCommand, ctx: CommandContext = {}): Recipe {
  if (!command || typeof command !== "object") throw new RecipeError("command must be an object");
  const { type, ...args } = command as { type: string } & Record<string, unknown>;
  switch (type) {
    case "insertMove": return insertMove(recipe, args as Parameters<typeof insertMove>[1]);
    case "swapMove": return swapMove(recipe, args as Parameters<typeof swapMove>[1]);
    case "removeMove": return removeMove(recipe, args as Parameters<typeof removeMove>[1]);
    case "setAmplitude": return setAmplitude(recipe, args as Parameters<typeof setAmplitude>[1]);
    case "extendPhase": return extendPhase(recipe, args as Parameters<typeof extendPhase>[1]);
    case "set": return setField(recipe, args as Parameters<typeof setField>[1]);
  }
  if (typeof type === "string" && Object.prototype.hasOwnProperty.call(COMMAND_TABLE, type)) return runTableCommand(recipe, type, args, ctx);
  throw new RecipeError(`unknown command type ${JSON.stringify(type)}`);
}

/** Apply a list of commands in order (a script). */
export function applyCommands(recipe: Recipe, commands: readonly MotionCommand[], ctx: CommandContext = {}): Recipe {
  if (!Array.isArray(commands)) throw new RecipeError("commands must be a list");
  return commands.reduce((r, c, i) => {
    try { return applyMotionCommand(r, c, ctx); }
    catch (e) { throw new RecipeError(`command ${i} (${JSON.stringify((c as { type?: unknown })?.type)}): ${(e as Error).message.replace(/^Recipe: /, "")}`); }
  }, recipe);
}

/** Every command type with its help line. */
export const commandHelp = (): Record<string, string> => ({ ...CORE_COMMANDS, ...Object.fromEntries(Object.entries(COMMAND_TABLE).map(([k, v]) => [k, v.help])) });
export type { AccentKey };
