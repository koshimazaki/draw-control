/**
 * Clip performance for the rigged mannequin: which clips play, at which clip times and
 * weights, on each frame. Pure: a function of (recipe, drive, frame); the studio samples
 * the clips from these layers.
 * - Loops (dance, walk, jog, sprint) are time-warped so their steps land on beats; the
 *   tempo level per bar (from energy) picks the step division within a 0.5–2 rate.
 * - Accents fire on hits: each phase of the accent clip is placed on the audio clock
 *   (defaults, or the marker's retimed `phases`) and time-warped linearly, so the key
 *   frame (landing, impact) sits exactly on the hit. Jumps add a ballistic lift that
 *   lands on the hit; spins turn the root.
 * - Amplitude comes from the step lane (or the energy curve by default).
 * - Humanise: upper-body bone groups sample the loop a few frames late (overlapping
 *   action); accents are never lagged, so impacts stay on the hit.
 */
import { energyAtSeconds, type AudioDrive } from "./audio-drive";
import { beatAtSeconds, secondsAtBeat } from "./beats";
import {
  CLIP_ACCENTS, LOOP_CLIPS, clipAccent, defaultPhaseBoundaries, loopCycleBeats, type ClipAccent, type PhaseKind,
} from "./clip-library";
import { activeMoveIndex, jumpHeight, poseAtBeat, restWeight, sampleRootPath, type ClipLayer, type FrameState } from "./engine";
import { neutralPose } from "./poses";
import { planReactive, type AccentSpanFn, type Hit } from "./reactive";
import { STEP_AMPLITUDE_MAX, type StepLane } from "./performance-config";
import type { Recipe } from "./recipe";
import { smoothNoise } from "./rng";
import type { AccentKey } from "./accents";
import { syncAt } from "./bone-sync";
import { MIN_BLEND_FRAMES, SWITCH_FRAMES, blendBeatsOf, gaitOffsets, layeredWeights, playedBoundaries } from "./transitions";

const TEMPO_FADE_BEATS = 0.5;
/** Frames each bone group trails the hips at humanise 1 (the studio maps DEF bones to groups). */
export const BONE_LAG_FRAMES = { spine: 1.5, shoulder: 2, head: 3, arm: 3.5 } as const;
export type BoneGroup = keyof typeof BONE_LAG_FRAMES;
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));
const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Span of a clip accent in beats at a tempo (for hit planning). */
export const clipSpan = (beatSeconds: number): AccentSpanFn => (key: AccentKey) => {
  const a = clipAccent(key);
  if (!a) return null;
  const b = defaultPhaseBoundaries(a, beatSeconds);
  return [b[0], b[b.length - 1]];
};

export type ScheduledHit = Hit & { accent: ClipAccent; boundaries: number[]; /** held phase indices */ holds?: number[]; /** hit harder, 0–1 */ impact?: number };
export type ClipPlan = { levels: number[]; hits: ScheduledHit[]; drive?: AudioDrive; /** cycle offset per move (gait foot matching) */ offsets: number[] };

/** The drive with the recipe's hand-edited energy curve, when it has one. */
export function effectiveDrive(recipe: Recipe, drive?: AudioDrive): AudioDrive | undefined {
  const curve = recipe.energyCurve;
  if (!curve) return drive;
  const fps = recipe.fps, frames = Math.max(drive?.energy.length ?? 0, Math.ceil(curve.values.length / curve.rate * fps) + 1);
  const energy = new Float32Array(frames);
  for (let n = 0; n < frames; n++) {
    const x = Math.min(curve.values.length - 1, n / fps * curve.rate), i = Math.floor(x), f = x - i;
    energy[n] = curve.values[i] + ((curve.values[Math.min(curve.values.length - 1, i + 1)]) - curve.values[i]) * f;
  }
  const out: AudioDrive = { fps, energy, onsets: drive?.onsets ?? [], source: drive?.source ?? "flat" };
  if (drive?.low) out.low = drive.low;
  return out;
}

/** How strongly energy drives tempo and amplitude (the config amounts times the master drive). */
export const tempoAmount = (cfg: Recipe["reactive"]) => cfg ? Math.min(1.5, cfg.speed * (cfg.drive ?? 1)) : 0;
export const amplitudeAmount = (cfg: Recipe["reactive"]) => cfg ? Math.min(1.5, cfg.amplitude * (cfg.drive ?? 1)) : 0;
/**
 * Snappier steps when loud: within each step the clip moves fast right after the beat and
 * settles into the next one. 0 below energy 0.4, up to 0.85.
 */
export const stepSnap = (cfg: Recipe["reactive"], energy: number) => Math.max(0, Math.min(0.85, tempoAmount(cfg) * (energy - 0.4) * 1.6));

function barLevels(recipe: Recipe, drive: AudioDrive | undefined): number[] {
  const cfg = recipe.reactive, g = recipe.beatGrid;
  const bars = Math.ceil(recipe.durationBeats / g.beatsPerBar) + 1;
  const levels: number[] = [];
  for (let b = 0; b < bars; b++) {
    const T = tempoAmount(cfg);
    if (!cfg || T <= 0) { levels.push(1); continue; }
    const from = secondsAtBeat(g, b * g.beatsPerBar), to = secondsAtBeat(g, (b + 1) * g.beatsPerBar);
    let sum = 0, n = 0;
    for (let t = from; t < to; t += 1 / recipe.fps) { sum += energyAtSeconds(drive, t); n++; }
    const e = n ? sum / n : 0.5;
    levels.push(e > 0.8 - 0.3 * T ? 2 : e < 0.2 + 0.2 * T ? 0.5 : 1);
  }
  return levels;
}

let memo: { recipe: Recipe; drive?: AudioDrive; plan: ClipPlan } | null = null;
export function clipPlanFor(recipe: Recipe, drive?: AudioDrive): ClipPlan {
  if (memo && memo.recipe === recipe && memo.drive === drive) return memo.plan;
  const eff = effectiveDrive(recipe, drive);
  const beatSeconds = 60 / recipe.beatGrid.bpm;
  const hits: ScheduledHit[] = [];
  if (recipe.reactive) {
    const reactive = planReactive(recipe, eff, clipSpan(beatSeconds));
    const markers = recipe.reactive.markers;
    for (const h of reactive.hits) {
      const accent = CLIP_ACCENTS[h.key]!;
      const marker = markers?.find(m => Math.abs(m.seconds - h.seconds) < 1e-6 && m.accent === h.key);
      const own = marker?.phases;
      const authored = own && own.length === accent.phases.length + 1 ? own : defaultPhaseBoundaries(accent, beatSeconds);
      const hit: ScheduledHit = { ...h, accent, boundaries: playedBoundaries(authored, marker?.skip) };
      if (marker?.hold) hit.holds = marker.hold;
      if (marker?.impact) hit.impact = marker.impact;
      hits.push(hit);
    }
  }
  hits.sort((a, b) => a.seconds - b.seconds);
  const levels = barLevels(recipe, eff);
  const offsets = gaitOffsets(recipe, beat => levels[Math.max(0, Math.floor(beat / recipe.beatGrid.beatsPerBar))] ?? 1);
  const plan = { levels, hits, drive: eff, offsets };
  memo = { recipe, drive, plan };
  return plan;
}

/** Loop layers at a time: the active clip move (and the one blending out), tempo-warped. */
export function loopLayersAt(recipe: Recipe, plan: ClipPlan, seconds: number): ClipLayer[] {
  const g = recipe.beatGrid, beat = beatAtSeconds(g, seconds);
  if (recipe.moves.length === 0) return [];
  const bar = Math.max(0, Math.floor(beat / g.beatsPerBar));
  const level = plan.levels[bar] ?? 1, prevLevel = plan.levels[bar - 1];
  const into = beat - bar * g.beatsPerBar;
  const tempoW = bar > 0 && prevLevel !== undefined && prevLevel !== level && into < TEMPO_FADE_BEATS ? ease(into / TEMPO_FADE_BEATS) : 1;
  const k = activeMoveIndex(recipe, beat);
  const move = recipe.moves[k];
  const blendW = k > 0 ? ease((beat - move.atBeat) / blendBeatsOf(move, recipe)) : 1;
  const layers: ClipLayer[] = [];
  const snap = stepSnap(recipe.reactive, energyAtSeconds(plan.drive, seconds));
  const push = (m: Recipe["moves"][number], lvl: number, w: number, index: number) => {
    const weight = w * (1 - restWeight(recipe, index, beat));
    if (!m.clip || weight <= 1e-6) return;
    const lib = LOOP_CLIPS[m.clip], sp = m.speed ?? 1;
    if (lib) {
      const cycle = loopCycleBeats(lib, g.bpm, lvl);
      let phase = mod((beat - m.atBeat) * sp / cycle + (plan.offsets[index] ?? 0), 1);
      if (snap > 0) {
        const x = phase * lib.steps, step = Math.floor(x), f = x - step;
        phase = (step + f + snap * (1 - Math.pow(1 - f, 2.5) - f)) / lib.steps;
      }
      layers.push({ moveId: m.id, clip: m.clip, cyclePhase: phase, weight, time: mod(lib.firstStep + phase * lib.seconds, lib.seconds) });
    } else {
      const cycle = m.clipCycleBeats ?? 4;
      layers.push({ moveId: m.id, clip: m.clip, cyclePhase: mod((beat - m.atBeat) * lvl * sp / cycle, 1), weight });
    }
  };
  const both = (index: number, weight: number) => {
    const m = recipe.moves[index];
    push(m, level, weight * tempoW, index);
    if (tempoW < 1) push(m, prevLevel!, weight * (1 - tempoW), index);
  };
  both(k, blendW);
  if (blendW < 1) both(k - 1, 1 - blendW);
  return layers;
}

/** Amplitude at a time: the step lane (eased into each step) or the energy curve. */
export function amplitudeAt(recipe: Recipe, plan: ClipPlan, seconds: number): number {
  const cfg = recipe.reactive;
  const beat = beatAtSeconds(recipe.beatGrid, seconds);
  let a: number;
  const lane: StepLane | undefined = recipe.steps;
  if (lane) {
    const x = Math.max(0, beat) * lane.division / 4, i = Math.min(lane.amplitude.length - 1, Math.floor(x));
    const prev = lane.amplitude[Math.max(0, i - 1)], cur = lane.amplitude[i];
    a = i === 0 ? cur : prev + (cur - prev) * ease((x - i) / 0.4);
  } else a = cfg ? 1 + 1.3 * amplitudeAmount(cfg) * (energyAtSeconds(plan.drive, seconds) - 0.5) : 1;
  if (cfg && cfg.humanise > 0) a *= 1 + 0.08 * cfg.humanise * smoothNoise(cfg.seed, 1, beat / 2);
  return Math.max(0, Math.min(STEP_AMPLITUDE_MAX, a));
}

export type AccentEval = { layers: ClipLayer[]; weight: number; lift: number; spin: number; phase: { name: string; kind: PhaseKind }; hit: ScheduledHit };

/**
 * One accent at `u` beats from its hit, or null outside it. It fades in over its first
 * phase and out over its last, each at least MIN_BLEND_FRAMES (holding the first or last
 * clip frame outside the authored phases); a clip switch between two phases crossfades
 * over SWITCH_FRAMES centred on their boundary.
 */
export function evaluateClipAccent(hit: ScheduledHit, raw: number, beatSeconds: number): AccentEval | null {
  const { accent, boundaries: b } = hit;
  // Hit harder: hold the impact frame (up to 3 frames), the follow-through starts later.
  const holdBeats = (hit.impact ?? 0) * IMPACT_HOLD_FRAMES / 24 / beatSeconds;
  const u = raw <= 0 ? raw : raw < holdBeats ? 0 : raw - holdBeats;
  const n = accent.phases.length;
  const minFade = MIN_BLEND_FRAMES / 24 / beatSeconds, half = SWITCH_FRAMES / 48 / beatSeconds;
  const start = Math.min(b[0], b[1] - minFade), end = Math.max(b[n], b[n - 1] + minFade);
  if (u <= start || u >= end) return null;
  const uc = Math.max(b[0], Math.min(b[n] - 1e-9, u));
  let i = 0;
  while (i < n - 1 && uc >= b[i + 1]) i++;
  const p = accent.phases[i], held = !!hit.holds?.includes(i);
  const t = held ? 0 : Math.max(0, Math.min(1, (uc - b[i]) / Math.max(1e-9, b[i + 1] - b[i])));
  const weight = Math.min(ease((u - start) / (b[1] - start)), 1 - ease((u - b[n - 1]) / (end - b[n - 1])));
  const layers: ClipLayer[] = [];
  const id = `accent-${hit.seconds}`;
  if (p.clip) {
    const own: ClipLayer = { moveId: id, clip: p.clip, cyclePhase: 0, weight: 1, time: p.from + (p.to - p.from) * t, accent: true };
    layers.push(own);
    for (let k = 1; k < n; k++) {
      const before = accent.phases[k - 1], after = accent.phases[k], d = u - b[k];
      if (!before.clip || !after.clip || before.clip === after.clip || Math.abs(d) >= half) continue;
      const w = ease((d + half) / (2 * half));
      if (d < 0) { own.weight *= 1 - w; layers.push({ moveId: id, clip: after.clip, cyclePhase: 0, weight: w, time: after.from, accent: true }); }
      else { own.weight *= w; layers.push({ moveId: id, clip: before.clip, cyclePhase: 0, weight: 1 - w, time: before.to, accent: true }); }
    }
    const gain = overshootGain(hit, raw, holdBeats, beatSeconds);
    if (gain > 0) {
      const strike = accent.phases[accent.contact];
      if (strike.clip) for (const l of layers) l.overshoot = { gain, refTime: l.clip === strike.clip ? strike.from : l.time ?? 0 };
    }
  }
  let lift = 0;
  if (accent.airborne) {
    const from = b[accent.airborne.from + 1];
    if (u > from && u < 0) {
      const air = -from * beatSeconds, q = (u - from) / -from;
      lift = 9.81 * air * air / 8 * 4 * q * (1 - q);
    }
  }
  let spin = 0;
  if (accent.spin && !hit.holds?.some(k => k >= accent.spin!.from && k <= accent.contact)) {
    const from = b[accent.spin.from];
    if (u > from) spin = 2 * Math.PI * accent.spin.turns * (u >= 0 ? 1 : ease((u - from) / -from));
  }
  return { layers, weight, lift, spin, phase: { name: p.name, kind: p.kind }, hit };
}

export const IMPACT_HOLD_FRAMES = 3;
export const IMPACT_OVERSHOOT = 0.45;
/**
 * Overshoot of a hit-harder accent at `raw` beats from its hit: rises through the strike
 * (the contact phase), peaks on the key frame and its hold, and settles over half a beat.
 */
export function overshootGain(hit: ScheduledHit, raw: number, holdBeats: number, beatSeconds: number): number {
  const k = hit.impact ?? 0;
  if (k <= 0) return 0;
  const from = hit.boundaries[hit.accent.contact], settle = Math.max(0.25, 0.3 / beatSeconds);
  const env = raw < 0 ? ease((raw - from) / Math.max(1e-6, -from)) : raw <= holdBeats ? 1 : 1 - ease((raw - holdBeats) / settle);
  return k * IMPACT_OVERSHOOT * env;
}

/** Frame state of the rigged mannequin. */
export function clipFrameAt(recipe: Recipe, frame: number, drive?: AudioDrive): FrameState {
  const plan = clipPlanFor(recipe, drive);
  const seconds = frame / recipe.fps, g = recipe.beatGrid, beatSeconds = 60 / g.bpm;
  const beat = beatAtSeconds(g, seconds);
  const path = sampleRootPath(recipe.rootPath, beat);
  const root = { x: path.x, y: jumpHeight(recipe, beat), z: path.z, yawRadians: path.yaw * Math.PI / 180 };
  const base = poseAtBeat(recipe, beat);
  const layers = loopLayersAt(recipe, plan, seconds);
  const h = recipe.reactive?.humanise ?? 0;
  const lagged: FrameState["lagged"] = h > 0
    ? (Object.keys(BONE_LAG_FRAMES) as BoneGroup[]).map(group => ({ group, layers: loopLayersAt(recipe, plan, seconds - BONE_LAG_FRAMES[group] * h / recipe.fps) }))
    : undefined;
  const state: FrameState = { frame, seconds, beat, root, pose: neutralPose(), layers, active: base.active, amplitude: amplitudeAt(recipe, plan, seconds), energy: energyAtSeconds(plan.drive, seconds) };
  if (lagged) state.lagged = lagged;
  let accentWeight = 0;
  const playing: AccentEval[] = [];
  for (const hit of plan.hits) {
    const a = evaluateClipAccent(hit, beat - hit.beat, beatSeconds);
    if (a) playing.push(a);
  }
  // A later accent covers the earlier ones as it fades in (hits are in time order).
  const cover = layeredWeights(playing.map(a => a.weight));
  playing.forEach((a, j) => {
    const hit = a.hit;
    for (const l of a.layers) layers.push({ ...l, weight: l.weight * cover[j] });
    root.y += a.lift * (0.75 + 0.5 * (state.energy ?? 0.5));
    root.yawRadians += a.spin;
    accentWeight = Math.max(accentWeight, a.weight);
    state.accent = { key: hit.key, hitSeconds: hit.seconds, weight: a.weight };
    state.phase = { name: a.phase.name, kind: a.phase.kind, accent: a.hit.accent.name };
  });
  state.accentWeight = accentWeight;
  const sync = syncAt(recipe, plan.drive, seconds);
  if (sync) state.sync = sync;
  return state;
}
