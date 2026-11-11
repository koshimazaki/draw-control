/**
 * Clip metadata for the bundled rigged mannequin (assets/characters/AnimationLibrary.glb,
 * Ecctrl, MIT; animations based on the Quaternius Universal Animation Library, CC0).
 * Times were measured with `scripts/analyse-clips.mjs` (foot and hip heights, hand reach):
 * - loops: `steps` per cycle and the clip time of the first step (hips at their lowest);
 * - accents: phases, each a stretch of one clip, with the key frame (landing, impact) at
 *   the end of the `contact` phase. A performance places phase boundaries on the audio
 *   clock and time-warps each phase linearly, so the key frame lands on the hit.
 */
import type { AccentKey } from "./accents";

export const RIGGED_CHARACTER = {
  name: "Rigged mannequin (Ecctrl AnimationLibrary)",
  licence: "MIT (c) 2023-2026 Erdong Chen (Ecctrl); animations based on Quaternius Universal Animation Library (CC0)",
  file: "AnimationLibrary.glb",
} as const;

export type LoopClip = { seconds: number; steps: number; firstStep: number; /** in-place travel speed it was authored for, m/s */ travel?: number };
export const LOOP_CLIPS: Record<string, LoopClip> = {
  Idle_Loop: { seconds: 2.5, steps: 4, firstStep: 0 },
  Dance_Loop: { seconds: 1, steps: 2, firstStep: 0.267 },
  Walk_Loop: { seconds: 1.333, steps: 2, firstStep: 0.067, travel: 1.4 },
  Jog_Fwd_Loop: { seconds: 0.933, steps: 2, firstStep: 0.1, travel: 3 },
  Sprint_Loop: { seconds: 0.667, steps: 2, firstStep: 0.067, travel: 6 },
  Crouch_Idle_Loop: { seconds: 2.933, steps: 4, firstStep: 0 },
  Crouch_Fwd_Loop: { seconds: 2, steps: 2, firstStep: 0, travel: 1 },
  Sword_Idle: { seconds: 1.667, steps: 2, firstStep: 0 },
  Spell_Simple_Idle_Loop: { seconds: 2.1, steps: 4, firstStep: 0 },
};
export const isLoopClip = (name: string) => Object.prototype.hasOwnProperty.call(LOOP_CLIPS, name);

export type PhaseKind = "hold" | "fast" | "move" | "recover";
export type ClipPhase = {
  name: string; kind: PhaseKind;
  /** The clip played in this phase (null: the loop keeps playing, root motion only). */
  clip: string | null;
  from: number; to: number;
  /** Natural length in seconds (defaults to to - from; a hold needs one). */
  seconds?: number;
};
export type ClipAccent = {
  name: string;
  phases: ClipPhase[];
  /** Index of the phase whose end is the key frame placed on the hit. */
  contact: number;
  /** Airborne from the end of phase `from` to the hit (ballistic lift). */
  airborne?: { from: number };
  /** Turns of the root between the start of phase `from` and the hit. */
  spin?: { from: number; turns: number };
};

export const CLIP_ACCENTS: Partial<Record<AccentKey, ClipAccent>> = {
  jump: {
    name: "Jump", contact: 4, airborne: { from: 1 },
    phases: [
      { name: "coil", kind: "hold", clip: "Jump_Start", from: 0, to: 0, seconds: 0.28 },
      { name: "take-off", kind: "fast", clip: "Jump_Start", from: 0, to: 0.13 },
      { name: "rise", kind: "move", clip: "Jump_Start", from: 0.13, to: 0.35 },
      { name: "hang", kind: "hold", clip: "Jump_Start", from: 0.35, to: 0.8 },
      { name: "land", kind: "fast", clip: "Jump_Land", from: 0, to: 0.1 },
      { name: "absorb", kind: "move", clip: "Jump_Land", from: 0.1, to: 0.4 },
      { name: "recover", kind: "recover", clip: "Jump_Land", from: 0.4, to: 1.0 },
    ],
  },
  jab: {
    name: "Jab", contact: 1,
    phases: [
      { name: "wind-up", kind: "hold", clip: "Punch_Jab", from: 0, to: 0.133, seconds: 0.25 },
      { name: "impact", kind: "fast", clip: "Punch_Jab", from: 0.133, to: 0.2 },
      { name: "follow-through", kind: "move", clip: "Punch_Jab", from: 0.2, to: 0.45 },
      { name: "recover", kind: "recover", clip: "Punch_Jab", from: 0.45, to: 0.867 },
    ],
  },
  cross: {
    name: "Cross", contact: 1,
    phases: [
      { name: "wind-up", kind: "hold", clip: "Punch_Cross", from: 0, to: 0.133, seconds: 0.25 },
      { name: "impact", kind: "fast", clip: "Punch_Cross", from: 0.133, to: 0.267 },
      { name: "follow-through", kind: "move", clip: "Punch_Cross", from: 0.267, to: 0.55 },
      { name: "recover", kind: "recover", clip: "Punch_Cross", from: 0.55, to: 1.0 },
    ],
  },
  sword: {
    name: "Sword strike", contact: 1,
    phases: [
      { name: "wind-up", kind: "hold", clip: "Sword_Attack", from: 0, to: 0.267 },
      { name: "impact", kind: "fast", clip: "Sword_Attack", from: 0.267, to: 0.4 },
      { name: "follow-through", kind: "move", clip: "Sword_Attack", from: 0.4, to: 0.8 },
      { name: "recover", kind: "recover", clip: "Sword_Attack", from: 0.8, to: 1.533 },
    ],
  },
  roll: {
    name: "Roll", contact: 1,
    phases: [
      { name: "tuck", kind: "move", clip: "Roll", from: 0, to: 0.4 },
      { name: "roll", kind: "fast", clip: "Roll", from: 0.4, to: 0.8 },
      { name: "recover", kind: "recover", clip: "Roll", from: 0.8, to: 1.467 },
    ],
  },
  spin: {
    name: "Spin", contact: 1, spin: { from: 1, turns: 1 },
    phases: [
      { name: "gather", kind: "hold", clip: null, from: 0, to: 0, seconds: 0.2 },
      { name: "spin", kind: "fast", clip: null, from: 0, to: 0, seconds: 0.4 },
      { name: "settle", kind: "recover", clip: null, from: 0, to: 0, seconds: 0.3 },
    ],
  },
};
export const clipAccent = (key: AccentKey): ClipAccent | undefined => CLIP_ACCENTS[key];
const phaseSeconds = (p: ClipPhase) => p.seconds ?? Math.max(0.02, p.to - p.from);

/**
 * Default phase boundaries in beats relative to the hit (contact end = 0). An airborne
 * accent squeezes its air phases to a musical airtime (0.9 beat, 0.38–0.6 s).
 */
export function defaultPhaseBoundaries(accent: ClipAccent, beatSeconds: number): number[] {
  const secs = accent.phases.map(phaseSeconds);
  if (accent.airborne) {
    const air = Math.max(0.38, Math.min(0.6, 0.9 * beatSeconds));
    const idx = accent.phases.map((_, i) => i).filter(i => i > accent.airborne!.from && i <= accent.contact);
    const natural = idx.reduce((s, i) => s + secs[i], 0);
    for (const i of idx) secs[i] *= air / natural;
  }
  const b = new Array(secs.length + 1).fill(0);
  for (let i = accent.contact; i >= 0; i--) b[i] = b[i + 1] - secs[i];
  b[accent.contact + 1] = 0;
  for (let i = accent.contact + 1; i < secs.length; i++) b[i + 1] = b[i] + secs[i];
  // Shift so the contact end sits at 0 (b[contact + 1]).
  const zero = b[accent.contact + 1];
  return b.map(x => Math.round((x - zero) / beatSeconds * 10000) / 10000);
}

/** Clip loop cycle in beats for a tempo rate: each step on a power-of-two beat division, rate within 0.5–2. */
export function loopCycleBeats(clip: LoopClip, bpm: number, level: number): number {
  const beat = 60 / bpm;
  const naturalStepBeats = clip.seconds / clip.steps / beat;
  let stepBeats = Math.pow(2, Math.round(Math.log2(naturalStepBeats)));
  const scaled = stepBeats / level;
  const rate = clip.seconds / (scaled * clip.steps * beat);
  if (rate >= 0.5 && rate <= 2) stepBeats = scaled;
  return stepBeats * clip.steps;
}
