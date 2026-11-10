/**
 * Built-in move library for the procedural characters, and helpers that turn a
 * library entry or an embedded clip into a recipe move. All moves are original.
 */
import type { PoseName } from "./poses";
import { RECIPE_VERSION, type Move, type Phase, type PreviewFps, type Recipe } from "./recipe";

type PhaseSpec = [name: string, pose: PoseName, beats: number, caption: string];
export type MoveTemplate = { name: string; summary: string; blendBeats: number; phases: PhaseSpec[] };

export const MOVE_LIBRARY = {
  idle: { name: "Idle", summary: "Settle and breathe", blendBeats: 1, phases: [
    ["settle", "ready", 2, "Settle into the knees"], ["rise", "neutral", 2, "Rise back to standing"]] },
  bounce: { name: "Bounce", summary: "Knee bounce on every beat", blendBeats: 0.5, phases: [
    ["down", "bounceDown", 0.5, "Drop on the beat"], ["up", "bounceUp", 0.5, "Lift between beats"]] },
  stepTouch: { name: "Step touch", summary: "Side to side, two beats", blendBeats: 0.5, phases: [
    ["left", "stepLeft", 1, "Step to the left"], ["right", "stepRight", 1, "Step to the right"]] },
  clap: { name: "Clap", summary: "Clap on the beat", blendBeats: 0.5, phases: [
    ["open", "ready", 0.5, "Open the hands"], ["clap", "clapFront", 0.5, "Clap in front"]] },
  armsUp: { name: "Arms up", summary: "Out, then overhead", blendBeats: 1, phases: [
    ["out", "armsOut", 1, "Arms out to the sides"], ["up", "armsUp", 1, "Arms overhead"]] },
  disco: { name: "Disco point", summary: "Point up, point down", blendBeats: 0.5, phases: [
    ["up", "pointUpRight", 1, "Point up to the right"], ["down", "pointDownLeft", 1, "Point down to the left"]] },
  walk: { name: "Walk", summary: "Walk cycle in place", blendBeats: 1, phases: [
    ["left foot", "walkA", 1, "Left foot forward"], ["right foot", "walkB", 1, "Right foot forward"]] },
  run: { name: "Run", summary: "Run cycle in place", blendBeats: 0.5, phases: [
    ["left foot", "runA", 0.5, "Drive the left knee"], ["right foot", "runB", 0.5, "Drive the right knee"]] },
  kick: { name: "Kick", summary: "Chamber and front kick", blendBeats: 0.5, phases: [
    ["chamber", "crouch", 1, "Load the weight"], ["kick", "kickRight", 0.5, "Front kick, right leg"], ["recover", "ready", 0.5, "Recover"]] },
  punches: { name: "Punches", summary: "Left, right on the beat", blendBeats: 0.5, phases: [
    ["left", "punchLeft", 1, "Punch left"], ["right", "punchRight", 1, "Punch right"]] },
} satisfies Record<string, MoveTemplate>;
export type MoveKey = keyof typeof MOVE_LIBRARY;
export const MOVE_KEYS = Object.keys(MOVE_LIBRARY) as MoveKey[];

export type MakeMoveOptions = { id?: string; amplitude?: number; previewFps?: PreviewFps; loop?: boolean };

export function makeMove(key: MoveKey, atBeat: number, opts: MakeMoveOptions = {}): Move {
  const t: MoveTemplate = MOVE_LIBRARY[key];
  if (!t) throw new Error(`Unknown move "${key}"`);
  return {
    id: opts.id ?? `${key}-${atBeat}`,
    name: t.name,
    atBeat,
    blendBeats: t.blendBeats,
    loop: opts.loop ?? true,
    phases: t.phases.map(([name, pose, beats, caption]): Phase => ({
      name, caption, pose, amplitude: opts.amplitude ?? 1, length: { beats }, previewFps: opts.previewFps ?? 24,
    })),
  };
}

/** A move that plays an embedded clip of a loaded character, time-stretched to whole beats. */
export function makeClipMove(clip: string, atBeat: number, cycleBeats: number, opts: { id?: string; blendBeats?: number } = {}): Move {
  return {
    id: opts.id ?? `clip-${atBeat}`,
    name: clip,
    atBeat,
    blendBeats: opts.blendBeats ?? 1,
    loop: true,
    clip,
    clipCycleBeats: cycleBeats,
    phases: [{ name: "clip", caption: clip, pose: "neutral", amplitude: 1, length: { beats: cycleBeats }, previewFps: 24 }],
  };
}

/** Beats one pass of a clip should take, snapped to a power of two near its natural length. */
export function clipCycleBeatsFor(clipSeconds: number, bpm: number): number {
  const natural = clipSeconds * bpm / 60;
  const options = [0.5, 1, 2, 4, 8, 16];
  return options.reduce((best, b) => Math.abs(Math.log2(b / natural)) < Math.abs(Math.log2(best / natural)) ? b : best, 4);
}

export const DEFAULT_RECIPE: Recipe = {
  version: RECIPE_VERSION,
  fps: 24,
  durationBeats: 16,
  beatGrid: { bpm: 120, offsetSeconds: 0, beatsPerBar: 4, source: "manual" },
  character: { kind: "mannequin", name: "Procedural mannequin", licence: "MIT (motion-studio)" },
  energy: 1,
  moves: [makeMove("bounce", 0), makeMove("stepTouch", 4), makeMove("armsUp", 8), makeMove("kick", 12)],
  rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }],
  jumps: [],
};
