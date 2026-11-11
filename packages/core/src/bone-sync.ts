/**
 * Per-bone sync for dance (`reactive.sync`): signals, 0 to about 1, that the rigged
 * mannequin adds on top of its clips so body parts move to the music on their own.
 * Pure: a function of the recipe, the drive and the time. Each signal rises over a frame
 * or two (never a step) and decays, so the additive layers never pop.
 * - head: a nod that lands on every beat (a short dip before, a decay after), louder = bigger;
 * - shoulders: an impulse on each onset (snare, clap); without a track, on the backbeat;
 * - arms: the shoulder signal a frame later (follow-through);
 * - hips: a drop on each beat, scaled by the low band (kick and bass) on that beat.
 */
import { energyAtSeconds, type AudioDrive } from "./audio-drive";
import { beatAtSeconds, secondsAtBeat } from "./beats";
import type { BoneSync } from "./reactive-config";
import type { Recipe } from "./recipe";

export type SyncSignals = BoneSync & { /** -1 to 1, scaled by the hips amount: the hips' sideways tilt */ sway: number };

const mod = (a: number, b: number) => ((a % b) + b) % b;
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));
/** Rise over `rise` seconds, decay with time constant `tau`. */
const impulse = (dt: number, rise: number, tau: number) => (dt < 0 ? 0 : ease(dt / rise) * Math.exp(-Math.max(0, dt - rise) / tau));

function lowAt(drive: AudioDrive | undefined, seconds: number): number {
  if (!drive?.low?.length) return energyAtSeconds(drive, seconds);
  const x = Math.max(0, Math.min(drive.low.length - 1, seconds * drive.fps)), i = Math.floor(x), f = x - i;
  return drive.low[i] + (drive.low[Math.min(drive.low.length - 1, i + 1)] - drive.low[i]) * f;
}

/** The sync signals at a time, already scaled by the recipe's amounts; null without `reactive.sync`. */
export function syncAt(recipe: Recipe, drive: AudioDrive | undefined, seconds: number): SyncSignals | null {
  const cfg = recipe.reactive?.sync;
  if (!cfg) return null;
  const g = recipe.beatGrid, beatSeconds = 60 / g.bpm, beat = beatAtSeconds(g, seconds);
  if (beat < -0.5) return { head: 0, shoulders: 0, arms: 0, hips: 0, sway: 0 };
  const energy = energyAtSeconds(drive, seconds), phase = mod(beat, 1);
  // Head: down onto the beat over the last fifth of the beat before it, then back up.
  const nod = Math.max(phase > 0.8 ? ease((phase - 0.8) / 0.2) : 0, Math.exp(-phase * beatSeconds / 0.14));
  const head = cfg.head * (0.45 + 0.75 * energy) * nod;
  // Shoulders and arms: onsets, or the backbeat without a track.
  const hits = drive?.source === "audio" && drive.onsets.length
    ? drive.onsets.filter(o => o.strength >= 0.3 && o.seconds <= seconds && o.seconds > seconds - 1.5)
    : [Math.floor(beat), Math.floor(beat) - 1].filter(b => b >= 0 && mod(b, 2) === 1).map(b => ({ seconds: secondsAtBeat(g, b), strength: 0.8 }));
  const pulse = (t: number) => Math.min(1, hits.reduce((s, o) => s + o.strength * impulse(t - o.seconds, 0.12, 0.2), 0));
  const shoulders = cfg.shoulders * pulse(seconds), arms = cfg.arms * pulse(seconds - 1 / recipe.fps);
  // Hips: a drop on each beat as strong as the low band on that beat, swaying to alternate
  // sides; the previous beat's decay is kept so nothing jumps when the side changes.
  let hips = 0, sway = 0;
  for (const b of [Math.floor(beat), Math.floor(beat) - 1]) {
    if (b < 0) continue;
    const at = secondsAtBeat(g, b), k = Math.min(1, 0.3 + lowAt(drive, at + 0.03)) * impulse(seconds - at, 0.1, 0.18);
    hips += k; sway += (mod(b, 2) === 0 ? 1 : -1) * k;
  }
  return { head, shoulders, arms, hips: cfg.hips * Math.min(1, hips), sway: cfg.hips * Math.max(-1, Math.min(1, sway)) };
}
