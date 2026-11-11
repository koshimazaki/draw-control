/**
 * Deterministic engine: `baseFrameAt(recipe, n)` returns the full state of frame n on the
 * time-stretch path; `frameAt` (perform.ts) adds the audio-reactive layer when the recipe has one.
 * No wall clock, no randomness, no mutable state, so preview, export and an agent
 * replaying a recipe all see identical frames.
 */
import { beatAtSeconds } from "./beats";
import { POSES, mixPoses, neutralPose, scalePose, type Pose } from "./poses";
import { moveBeats, phaseBeats, type Expression, type Recipe, type RootPoint } from "./recipe";

export type ClipLayer = {
  moveId: string; clip: string; /** 0–1 through one clip cycle */ cyclePhase: number; weight: number;
  /** Clip time in seconds; when set it wins over cyclePhase (rigged mannequin). */
  time?: number;
  /** An accent clip (never lagged, mixed over the loops by its weight). */
  accent?: boolean;
  /** "Hit harder": push the pose past the clip by `gain`, away from the clip pose at `refTime` (the strike's start). */
  overshoot?: { gain: number; refTime: number };
};
export type ActivePhase = {
  moveIndex: number; moveId: string; moveName: string;
  phaseIndex: number; phaseName: string; caption: string; expression?: Expression;
  /** 0–1 through the phase, after preview-fps stepping. */
  progress: number;
};
export type FrameState = {
  frame: number; seconds: number; beat: number;
  root: { x: number; y: number; z: number; yawRadians: number };
  pose: Pose;
  layers: ClipLayer[];
  active: ActivePhase | null;
  /** Reactive layer only: the accent move playing, and its blend weight. */
  accent?: { key: string; hitSeconds: number; weight: number };
  /** Reactive layer only: the smoothed audio energy at this frame. */
  energy?: number;
  /** Rigged mannequin: amplitude of the loops relative to idle (0–1.5). */
  amplitude?: number;
  /** Rigged mannequin: loop layers sampled late for each bone group (overlapping action). */
  lagged?: { group: string; layers: ClipLayer[] }[];
  /** Rigged mannequin: the total weight of accent clips (0–1). */
  accentWeight?: number;
  /** Rigged mannequin: per-bone sync signals added on top of the clips (reactive.sync). */
  sync?: { head: number; shoulders: number; arms: number; hips: number; sway: number };
  /** Rigged mannequin: the accent phase playing, for the caption and the phase lane. */
  phase?: { name: string; kind: string; accent: string };
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const mod = (a: number, b: number) => ((a % b) + b) % b;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
const EPS = 1e-9;

export function sampleRootPath(points: readonly RootPoint[], beat: number) {
  const first = points[0];
  if (beat <= first.beat) return { x: first.x, z: first.z, yaw: first.yaw };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (beat <= b.beat) {
      const t = clamp((beat - a.beat) / (b.beat - a.beat), 0, 1);
      return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), yaw: lerp(a.yaw, b.yaw, t) };
    }
  }
  const end = points[points.length - 1];
  return { x: end.x, z: end.z, yaw: end.yaw };
}

export function jumpHeight(recipe: Recipe, beat: number): number {
  let y = 0;
  for (const j of recipe.jumps) {
    const p = (beat - j.atBeat) / j.durationBeats;
    if (p > 0 && p < 1) y += j.height * Math.pow(Math.sin(Math.PI * p), 1.25);
  }
  return y;
}

/** Evaluate one move at a beat, as if it were the only move playing. */
export function evaluateMove(recipe: Recipe, moveIndex: number, beat: number) {
  const move = recipe.moves[moveIndex];
  const total = moveBeats(move, recipe);
  const raw = Math.max(0, beat - move.atBeat);
  const local = move.loop ? mod(raw, total) : Math.min(raw, total - EPS);
  let start = 0, index = 0;
  for (; index < move.phases.length - 1; index++) {
    const len = phaseBeats(move.phases[index], recipe);
    if (local < start + len - EPS) break;
    start += len;
  }
  const phase = move.phases[index];
  const len = phaseBeats(phase, recipe);
  let progress = clamp((local - start) / len, 0, 1);
  if (phase.previewFps < recipe.fps) {
    const steps = Math.max(1, Math.round(len * 60 / recipe.beatGrid.bpm * phase.previewFps));
    progress = Math.floor(progress * steps + EPS) / steps;
  }
  const target = (i: number) => {
    const p = move.phases[i];
    return scalePose(POSES[p.pose], p.amplitude * recipe.energy);
  };
  const from = target(index > 0 ? index - 1 : move.phases.length - 1);
  const pose = mixPoses(from, target(index), easeInOut(progress));
  const cycle = move.clipCycleBeats ?? total;
  return { pose, phaseIndex: index, progress, cyclePhase: mod(raw, cycle) / cycle };
}

/** Index of the move playing at a beat: the last one that has started (the first, before any). */
export function activeMoveIndex(recipe: Recipe, beat: number): number {
  let k = 0;
  for (let i = 0; i < recipe.moves.length; i++) if (recipe.moves[i].atBeat <= beat + EPS) k = i;
  return k;
}

/**
 * The move layer at a beat: the active move, cross-faded from the previous one over its
 * blend beats. `rate` plays the moves' phases faster or slower (2 = double time) while the
 * scheduling (which move is active, the blends) stays on the real beat.
 */
export function poseAtBeat(recipe: Recipe, beat: number, rate = 1): { pose: Pose; layers: ClipLayer[]; active: ActivePhase | null } {
  if (recipe.moves.length === 0) return { pose: neutralPose(), layers: [], active: null };
  const k = activeMoveIndex(recipe, beat);
  const move = recipe.moves[k];
  const local = (m: { atBeat: number }) => m.atBeat + (beat - m.atBeat) * rate;
  const cur = evaluateMove(recipe, k, local(move));
  let weight = 1;
  if (k > 0 && move.blendBeats > 0) weight = easeInOut((beat - move.atBeat) / move.blendBeats);
  let pose = cur.pose;
  const layers: ClipLayer[] = [];
  if (weight < 1) {
    const pm = recipe.moves[k - 1];
    const prev = evaluateMove(recipe, k - 1, local(pm));
    pose = mixPoses(prev.pose, cur.pose, weight);
    if (pm.clip) layers.push({ moveId: pm.id, clip: pm.clip, cyclePhase: prev.cyclePhase, weight: 1 - weight });
  }
  if (move.clip) layers.push({ moveId: move.id, clip: move.clip, cyclePhase: cur.cyclePhase, weight });
  const phase = move.phases[cur.phaseIndex];
  const active: ActivePhase = {
    moveIndex: k, moveId: move.id, moveName: move.name,
    phaseIndex: cur.phaseIndex, phaseName: phase.name, caption: phase.caption, progress: cur.progress,
  };
  if (phase.expression) active.expression = phase.expression;
  return { pose, layers, active };
}

/** The time-stretch path: moves on the beat grid, root path and jumps, no audio input. */
export function baseFrameAt(recipe: Recipe, frame: number): FrameState {
  const seconds = frame / recipe.fps;
  const beat = beatAtSeconds(recipe.beatGrid, seconds);
  const path = sampleRootPath(recipe.rootPath, beat);
  const root = { x: path.x, y: jumpHeight(recipe, beat), z: path.z, yawRadians: path.yaw * Math.PI / 180 };
  return { frame, seconds, beat, root, ...poseAtBeat(recipe, beat) };
}

export type SpeedClass = "hold" | "move" | "fast";
export function classifySpeed(radiansPerSecond: number): SpeedClass {
  if (radiansPerSecond < 0.5) return "hold";
  return radiansPerSecond > 12 ? "fast" : "move";
}

export type TimelineBlock = { moveIndex: number; moveId: string; name: string; startBeat: number; endBeat: number;
  phases: { name: string; startBeat: number; endBeat: number }[] };

/** Which move and phase sits on which beats, for the beat strip and for tests. */
export function timeline(recipe: Recipe): TimelineBlock[] {
  return recipe.moves.map((move, i) => {
    const endBeat = Math.min(recipe.moves[i + 1]?.atBeat ?? recipe.durationBeats, recipe.durationBeats);
    const phases: TimelineBlock["phases"] = [];
    let t = move.atBeat;
    const total = moveBeats(move, recipe);
    do {
      for (const p of move.phases) {
        const len = phaseBeats(p, recipe);
        if (t >= endBeat - EPS) break;
        phases.push({ name: p.name, startBeat: t, endBeat: Math.min(t + len, endBeat) });
        t += len;
      }
    } while (move.loop && total > 0 && t < endBeat - EPS);
    return { moveIndex: i, moveId: move.id, name: move.name, startBeat: move.atBeat, endBeat, phases };
  });
}
