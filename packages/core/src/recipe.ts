/**
 * Motion Studio recipe, version 2. Units are metres, seconds and musical beats.
 * A recipe is a sequence of moves on a beat grid; each move is a sequence of phases.
 * The validator is strict and bounded: unknown keys, URLs or executable fields are refused.
 * Grown from the seed kit's v1 `MotionSpec` validator.
 */
import { isPoseName, type PoseName } from "./poses";
import { validateCamera, type CameraConfig } from "./camera";
import { validateReactive, type ReactiveConfig } from "./reactive-config";
import { validateEnergyCurve, validateSteps, type EnergyCurve, type StepLane } from "./performance-config";
import { RecipeError, fail, finite, isObject, only, text } from "./validate";
import { validateEnvelope, type Envelope } from "./envelope";
import { validateLock, type BeatLock } from "./lock";

export const RECIPE_VERSION = 2;
/** Upper bound of a phase amplitude and of the amplitude envelope. */
export const AMPLITUDE_MAX = 3;
export const SPEED_RANGE = [0.25, 4] as const;
export const PREVIEW_FPS = [12, 18, 24, 30, 60] as const;
export type PreviewFps = (typeof PREVIEW_FPS)[number];
/** Validated and exported, not yet rendered (reserved for facial expressions). */
export const EXPRESSIONS = ["neutral", "smile", "surprised", "angry", "sad", "focused"] as const;
export type Expression = (typeof EXPRESSIONS)[number];
/**
 * "rigged" is the bundled rigged mannequin (clip-driven); "mannequin" the procedural fallback.
 * "block", "stick" (lines and joint dots) and "blob" (capsules, no visible joints) are more
 * abstract procedural figures on the same skeleton, for testing which a video model follows.
 * "glider" is an abstract figure with no limbs (a pyramid with a sphere floating above it,
 * the front face marked): it travels and faces along the walk path and ignores poses.
 */
export const CHARACTER_KINDS = ["mannequin", "block", "stick", "blob", "file", "rigged", "glider"] as const;
/** The procedural figures: they play the recipe's poses (library moves), not clips. */
export const PROCEDURAL_KINDS = ["mannequin", "block", "stick", "blob"] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

export type PhaseLength = { beats: number } | { frames: number };
export type Phase = {
  name: string;
  caption: string;
  /** Target pose reached at the end of the phase (procedural characters). */
  pose: PoseName;
  /** "Volume" of the move: 0 = rest, 1 = as authored, up to AMPLITUDE_MAX (3). */
  amplitude: number;
  length: PhaseLength;
  previewFps: PreviewFps;
  expression?: Expression;
};
export type Move = {
  id: string;
  name: string;
  /** Beat on the beat grid where the move starts (fractional allowed: a kick or snare off the grid). */
  atBeat: number;
  /**
   * Length of the block in beats. Absent: the move runs until the next one starts. Present:
   * it ends there (the figure settles to rest in a gap) or where the next one starts, if earlier.
   */
  lengthBeats?: number;
  /** Playback rate of the move's phases or clip (1 = as authored, 2 = twice as fast), 0.25–4. */
  speed?: number;
  /** Beats over which the previous move cross-fades into this one. */
  blendBeats: number;
  /** Repeat the phases until the next move starts. */
  loop: boolean;
  phases: Phase[];
  /** Embedded animation clip name, for a loaded GLB/FBX character. */
  clip?: string;
  /** Beats one pass of the clip is stretched to. Defaults to the move's phase length. */
  clipCycleBeats?: number;
  /** Beat lock (lock.ts): the move speeds up into each locked hit and slows after it. */
  lock?: BeatLock["lock"];
  strength?: number;
};
export type BeatGrid = { bpm: number; offsetSeconds: number; beatsPerBar: number; source: "manual" | "analysis" };
export type CharacterRef = { kind: CharacterKind; name: string; licence: string };
/** A point of the walk path; `y` (optional) lifts the root, for a glide that rises. */
export type RootPoint = { beat: number; x: number; z: number; yaw: number; y?: number };
export type Jump = { atBeat: number; durationBeats: number; height: number };
export type AudioRef = { name: string; licence: string };
export type Recipe = {
  version: typeof RECIPE_VERSION;
  fps: 24;
  durationBeats: number;
  beatGrid: BeatGrid;
  character: CharacterRef;
  /** Global multiplier on every phase amplitude (0–3). */
  energy: number;
  moves: Move[];
  rootPath: RootPoint[];
  jumps: Jump[];
  audio?: AudioRef;
  /** Audio-reactive camera rig, used by the "rig" view. */
  camera?: CameraConfig;
  /** Audio-reactive animation layer on top of the moves. */
  reactive?: ReactiveConfig;
  /** Amplitude per step (rigged mannequin). */
  steps?: StepLane;
  /** Hand-edited energy curve; replaces the analysed one. */
  energyCurve?: EnergyCurve;
  /** Amplitude envelope: one value per frame (0–3) scaling every move, as [frame, value] breakpoints. */
  envelope?: Envelope;
  /** Beat lock on the travel along the walk path (root-travel.ts): stations on each locked hit. */
  travelLock?: BeatLock;
  /**
   * The walk path as given point by point with its corner rounding (corners.ts): `rootPath`
   * is built from it, and the shot script prints these points and `corners N`. Set by
   * setRootPath with `corners`; any other walk path edit removes it.
   */
  rootShape?: RootShape;
  /** Landmark blocks around the scene (landmarks.ts), placed from `seed` clear of both paths. Absent: none. */
  landmarks?: { seed: number; on: boolean };
};
export type RootShape = { corners: number; points: { x: number; z: number; y?: number }[] };

export { RecipeError };

function validatePhase(input: unknown, where: string): Phase {
  if (!isObject(input)) return fail(`${where} must be an object`);
  only(input, ["name", "caption", "pose", "amplitude", "length", "previewFps", "expression"], where);
  if (!isPoseName(input.pose)) fail(`${where}.pose is not a known pose`);
  if (!finite(input.amplitude, 0, AMPLITUDE_MAX)) fail(`${where}.amplitude must be 0–${AMPLITUDE_MAX}`);
  const len = input.length;
  let length: PhaseLength;
  if (isObject(len) && "beats" in len) {
    only(len, ["beats"], `${where}.length`);
    if (!finite(len.beats, 0.125, 64)) fail(`${where}.length.beats must be 0.125–64`);
    length = { beats: len.beats as number };
  } else if (isObject(len) && "frames" in len) {
    only(len, ["frames"], `${where}.length`);
    if (!Number.isInteger(len.frames) || !finite(len.frames, 1, 2400)) fail(`${where}.length.frames must be a whole number 1–2400`);
    length = { frames: len.frames as number };
  } else return fail(`${where}.length needs beats or frames`);
  if (!PREVIEW_FPS.includes(input.previewFps as PreviewFps)) fail(`${where}.previewFps must be one of ${PREVIEW_FPS.join(", ")}`);
  const phase: Phase = {
    name: text(input.name, 40, `${where}.name`),
    caption: text(input.caption, 120, `${where}.caption`),
    pose: input.pose as PoseName,
    amplitude: input.amplitude as number,
    length,
    previewFps: input.previewFps as PreviewFps,
  };
  if (input.expression !== undefined) {
    if (!EXPRESSIONS.includes(input.expression as Expression)) fail(`${where}.expression must be one of ${EXPRESSIONS.join(", ")}`);
    phase.expression = input.expression as Expression;
  }
  return phase;
}

function validateMove(input: unknown, where: string, durationBeats: number): Move {
  if (!isObject(input)) return fail(`${where} must be an object`);
  only(input, ["id", "name", "atBeat", "blendBeats", "loop", "phases", "clip", "clipCycleBeats", "lengthBeats", "speed", "lock", "strength"], where);
  if (!finite(input.atBeat, 0, durationBeats - 0.125)) fail(`${where}.atBeat must be a beat inside the recipe`);
  if (!finite(input.blendBeats, 0, 8)) fail(`${where}.blendBeats must be 0–8`);
  if (typeof input.loop !== "boolean") fail(`${where}.loop must be true or false`);
  if (!Array.isArray(input.phases) || input.phases.length < 1 || input.phases.length > 32) fail(`${where}.phases needs 1–32 phases`);
  const move: Move = {
    id: text(input.id, 40, `${where}.id`),
    name: text(input.name, 60, `${where}.name`),
    atBeat: input.atBeat as number,
    blendBeats: input.blendBeats as number,
    loop: input.loop as boolean,
    phases: (input.phases as unknown[]).map((p, i) => validatePhase(p, `${where}.phases[${i}]`)),
  };
  if (input.clip !== undefined) move.clip = text(input.clip, 120, `${where}.clip`);
  if (input.lengthBeats !== undefined) {
    if (!finite(input.lengthBeats, 0.125, 512)) fail(`${where}.lengthBeats must be 0.125–512`);
    move.lengthBeats = input.lengthBeats as number;
  }
  if (input.speed !== undefined) {
    if (!finite(input.speed, SPEED_RANGE[0], SPEED_RANGE[1])) fail(`${where}.speed must be ${SPEED_RANGE[0]}–${SPEED_RANGE[1]}`);
    if (input.speed !== 1) move.speed = input.speed as number;
  }
  if (input.clipCycleBeats !== undefined) {
    if (!finite(input.clipCycleBeats, 0.25, 64)) fail(`${where}.clipCycleBeats must be 0.25–64`);
    move.clipCycleBeats = input.clipCycleBeats as number;
  }
  validateLock(input, where, move);
  return move;
}

/** Strict validation for agent-supplied JSON and imported recipes. Returns a fresh copy. */
export function validateRecipe(input: unknown): Recipe {
  if (!isObject(input)) return fail("expected an object");
  only(input, ["version", "fps", "durationBeats", "beatGrid", "character", "energy", "moves", "rootPath", "jumps", "audio", "camera", "reactive", "steps", "energyCurve", "envelope", "travelLock", "rootShape", "landmarks"], "recipe");
  if (input.version !== RECIPE_VERSION) fail(`expected version ${RECIPE_VERSION}`);
  if (input.fps !== 24) fail("fps must be 24");
  if (!Number.isInteger(input.durationBeats) || !finite(input.durationBeats, 1, 512)) fail("durationBeats must be a whole number 1–512");
  const durationBeats = input.durationBeats as number;
  const g = input.beatGrid;
  if (!isObject(g)) return fail("beatGrid is required");
  only(g, ["bpm", "offsetSeconds", "beatsPerBar", "source"], "beatGrid");
  if (!finite(g.bpm, 40, 240)) fail("beatGrid.bpm must be 40–240");
  if (!finite(g.offsetSeconds, 0, 60)) fail("beatGrid.offsetSeconds must be 0–60");
  if (!Number.isInteger(g.beatsPerBar) || !finite(g.beatsPerBar, 1, 16)) fail("beatGrid.beatsPerBar must be 1–16");
  if (g.source !== "manual" && g.source !== "analysis") fail("beatGrid.source must be manual or analysis");
  const c = input.character;
  if (!isObject(c)) return fail("character is required");
  only(c, ["kind", "name", "licence"], "character");
  if (!CHARACTER_KINDS.includes(c.kind as CharacterKind)) fail(`character.kind must be one of ${CHARACTER_KINDS.join(", ")}`);
  if (!finite(input.energy, 0, AMPLITUDE_MAX)) fail(`energy must be 0–${AMPLITUDE_MAX}`);
  if (!Array.isArray(input.moves) || input.moves.length > 128) fail("moves must be a list of up to 128 moves");
  const moves = (input.moves as unknown[]).map((m, i) => validateMove(m, `moves[${i}]`, durationBeats));
  for (let i = 1; i < moves.length; i++) {
    if (moves[i].atBeat <= moves[i - 1].atBeat) fail(`moves[${i}].atBeat must be after moves[${i - 1}].atBeat`);
  }
  const ids = new Set(moves.map(m => m.id));
  if (ids.size !== moves.length) fail("move ids must be unique");
  if (!Array.isArray(input.rootPath) || input.rootPath.length < 1 || input.rootPath.length > 64) fail("rootPath needs 1–64 points");
  let last = -Infinity;
  const rootPath = (input.rootPath as unknown[]).map((p, i) => {
    if (!isObject(p)) return fail(`rootPath[${i}] must be an object`);
    only(p, ["beat", "x", "z", "yaw", "y"], `rootPath[${i}]`);
    if (p.y !== undefined && !finite(p.y, 0, 30)) fail(`rootPath[${i}].y must be a height 0–30 m`);
    if (!finite(p.beat, 0, durationBeats) || (p.beat as number) <= last ||
        !finite(p.x, -100, 100) || !finite(p.z, -100, 100) || !finite(p.yaw, -720, 720))
      fail(`rootPath[${i}] needs an increasing beat and finite x, z, yaw`);
    last = p.beat as number;
    const point: RootPoint = { beat: p.beat as number, x: p.x as number, z: p.z as number, yaw: p.yaw as number };
    if (p.y !== undefined && p.y !== 0) point.y = p.y as number;
    return point;
  });
  if (!Array.isArray(input.jumps) || input.jumps.length > 64) fail("jumps must be a list of up to 64");
  const jumps = (input.jumps as unknown[]).map((j, i) => {
    if (!isObject(j)) return fail(`jumps[${i}] must be an object`);
    only(j, ["atBeat", "durationBeats", "height"], `jumps[${i}]`);
    if (!finite(j.atBeat, 0, durationBeats) || !finite(j.durationBeats, 0.125, 16) || !finite(j.height, 0, 3))
      fail(`jumps[${i}] needs atBeat, durationBeats 0.125–16 and height 0–3`);
    return { atBeat: j.atBeat as number, durationBeats: j.durationBeats as number, height: j.height as number };
  });
  const recipe: Recipe = {
    version: RECIPE_VERSION,
    fps: 24,
    durationBeats,
    beatGrid: { bpm: g.bpm as number, offsetSeconds: g.offsetSeconds as number, beatsPerBar: g.beatsPerBar as number, source: g.source as BeatGrid["source"] },
    character: { kind: c.kind as CharacterKind, name: text(c.name, 120, "character.name"), licence: text(c.licence, 120, "character.licence") },
    energy: input.energy as number,
    moves,
    rootPath,
    jumps,
  };
  if (input.audio !== undefined) {
    const a = input.audio;
    if (!isObject(a)) return fail("audio must be an object");
    only(a, ["name", "licence"], "audio");
    recipe.audio = { name: text(a.name, 120, "audio.name"), licence: text(a.licence, 120, "audio.licence") };
  }
  if (input.steps !== undefined) recipe.steps = validateSteps(input.steps, durationBeats);
  if (input.energyCurve !== undefined) recipe.energyCurve = validateEnergyCurve(input.energyCurve);
  if (input.envelope !== undefined) recipe.envelope = validateEnvelope(input.envelope);
  if (input.reactive !== undefined) recipe.reactive = validateReactive(input.reactive);
  if (input.travelLock !== undefined) {
    if (!isObject(input.travelLock)) fail("travelLock must be an object");
    only(input.travelLock as Record<string, unknown>, ["lock", "strength"], "travelLock");
    const lock: BeatLock = {};
    validateLock(input.travelLock as Record<string, unknown>, "travelLock", lock);
    if (lock.lock) recipe.travelLock = lock;
  }
  if (input.rootShape !== undefined) recipe.rootShape = validateRootShape(input.rootShape);
  if (input.landmarks !== undefined) {
    const l = input.landmarks;
    if (!isObject(l)) return fail("landmarks must be an object");
    only(l, ["seed", "on"], "landmarks");
    if (!Number.isInteger(l.seed) || !finite(l.seed, 0, 2147483647)) fail("landmarks.seed must be a whole number 0–2147483647");
    if (typeof l.on !== "boolean") fail("landmarks.on must be true or false");
    recipe.landmarks = { seed: l.seed as number, on: l.on as boolean };
  }
  if (input.camera !== undefined) recipe.camera = validateCamera(input.camera, durationBeats);
  return recipe;
}

function validateRootShape(input: unknown): RootShape {
  if (!isObject(input)) return fail("rootShape must be an object");
  only(input, ["corners", "points"], "rootShape");
  if (!finite(input.corners, 0, 1)) fail("rootShape.corners must be 0–1");
  if (!Array.isArray(input.points) || input.points.length < 2 || input.points.length > 63) fail("rootShape.points needs 2–63 points");
  const points = (input.points as unknown[]).map((p, i) => {
    if (!isObject(p)) return fail(`rootShape.points[${i}] must be an object`);
    only(p, ["x", "z", "y"], `rootShape.points[${i}]`);
    if (!finite(p.x, -100, 100) || !finite(p.z, -100, 100) || (p.y !== undefined && !finite(p.y, 0, 30))) fail(`rootShape.points[${i}] needs x, z within ±100 m (y 0–30 m)`);
    return { x: p.x as number, z: p.z as number, ...(p.y !== undefined ? { y: p.y as number } : {}) };
  });
  return { corners: input.corners as number, points };
}

export const secondsPerBeat = (grid: BeatGrid) => 60 / grid.bpm;

/** Length of a phase in beats, converting frame lengths at the recipe fps. */
export function phaseBeats(phase: Phase, recipe: Pick<Recipe, "fps" | "beatGrid">): number {
  return "beats" in phase.length ? phase.length.beats : phase.length.frames / recipe.fps * recipe.beatGrid.bpm / 60;
}

export function moveBeats(move: Move, recipe: Pick<Recipe, "fps" | "beatGrid">): number {
  return move.phases.reduce((sum, p) => sum + phaseBeats(p, recipe), 0);
}

/** Seconds from the start of the track (frame 0) to the end of the last beat. */
export function recipeSeconds(recipe: Recipe): number {
  return recipe.beatGrid.offsetSeconds + recipe.durationBeats * secondsPerBeat(recipe.beatGrid);
}
