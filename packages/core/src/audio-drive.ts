/**
 * Audio drive: what the music hands to the camera rig and the reactive animation layer.
 * One smoothed energy value per video frame and a list of onsets (hits), both derived
 * from the RMS envelope in beats.ts. Pure and deterministic: the same decoded audio
 * always gives the same drive, so preview, export and tests agree.
 */
import { onsetNovelty } from "./beats";
import type { BandAnalysis } from "./audio-bands";

export type Onset = { seconds: number; /** 0–1, relative to the strongest onset */ strength: number };
export type AudioDrive = {
  fps: number;
  /** Smoothed loudness per frame, 0–1. */
  energy: Float32Array;
  onsets: Onset[];
  /** "audio" when built from a track, "flat" when no track is loaded. */
  source: "audio" | "flat";
  /** Low-band (kick and bass) loudness per frame, 0–1, with a fast attack and release. */
  low?: Float32Array;
  /** Drum-band onsets and amplitude peaks (kick, snare, hat), when analysed. */
  bands?: BandAnalysis;
};
export type EnvelopeOptions = {
  attackSeconds?: number; releaseSeconds?: number;
  /** Normalise to at least this share of the peak (sparse signals: a lone kick should not make every tick loud). */
  minRefOfPeak?: number;
};

/**
 * Per-frame energy: the mean RMS inside each frame, normalised to the 95th percentile,
 * then an asymmetric one-pole follower (fast attack, slow release) so it breathes with
 * the music without flicker.
 */
export function energyEnvelope(rms: Float32Array, hopSeconds: number, fps: number, frames: number, opts: EnvelopeOptions = {}): Float32Array {
  const attack = opts.attackSeconds ?? 0.12, release = opts.releaseSeconds ?? 0.5;
  const raw = new Float32Array(frames);
  for (let n = 0; n < frames; n++) {
    const from = Math.floor(n / fps / hopSeconds), to = Math.max(from + 1, Math.floor((n + 1) / fps / hopSeconds));
    let sum = 0, count = 0;
    for (let i = from; i < to && i < rms.length; i++) { sum += rms[i]; count++; }
    raw[n] = count ? sum / count : 0;
  }
  const sorted = Array.from(raw).sort((a, b) => a - b);
  const ref = Math.max(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))], (sorted[sorted.length - 1] ?? 0) * (opts.minRefOfPeak ?? 0)) || 1;
  const up = 1 - Math.exp(-1 / (fps * attack)), down = 1 - Math.exp(-1 / (fps * release));
  const out = new Float32Array(frames);
  let y = Math.min(1, (raw[0] ?? 0) / ref);
  for (let n = 0; n < frames; n++) {
    const x = Math.min(1, raw[n] / ref);
    y += (x - y) * (x > y ? up : down);
    out[n] = y;
  }
  return out;
}

/**
 * Onsets: local peaks of onset novelty above an adaptive threshold (median-free: the
 * running mean plus `k` standard deviations over the past second), at least `minGap`
 * apart. Times are the start of the hop that holds the attack, so within one hop
 * (about 12 ms) of the true hit.
 */
export function detectOnsets(rms: Float32Array, hopSeconds: number, opts: { k?: number; minGapSeconds?: number } = {}): Onset[] {
  const k = opts.k ?? 1.5, minGap = opts.minGapSeconds ?? 0.12;
  const novelty = onsetNovelty(rms);
  const win = Math.max(8, Math.round(1 / hopSeconds));
  const found: { i: number; v: number }[] = [];
  for (let i = 1; i < novelty.length - 1; i++) {
    const v = novelty[i];
    if (v <= novelty[i - 1] || v < novelty[i + 1]) continue;
    let sum = 0, sq = 0, n = 0;
    for (let j = Math.max(0, i - win); j < i; j++) { sum += novelty[j]; sq += novelty[j] * novelty[j]; n++; }
    const mean = n ? sum / n : 0, sd = n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0;
    if (v < mean + k * sd || v < 0.02) continue;
    const last = found[found.length - 1];
    if (last && (i - last.i) * hopSeconds < minGap) { if (v > last.v) found[found.length - 1] = { i, v }; continue; }
    found.push({ i, v });
  }
  // The peak of the final list: a stronger onset within minGap may have replaced the last one.
  const peak = found.reduce((p, f) => Math.max(p, f.v), 0);
  return found.map(f => ({ seconds: Math.round(f.i * hopSeconds * 10000) / 10000, strength: peak ? f.v / peak : 0 }));
}

export function buildDrive(features: { rms: Float32Array; hopSeconds: number; lowRms?: Float32Array; bands?: BandAnalysis }, fps: number, frames: number): AudioDrive {
  const drive: AudioDrive = { fps, energy: energyEnvelope(features.rms, features.hopSeconds, fps, frames), onsets: detectOnsets(features.rms, features.hopSeconds), source: "audio" };
  if (features.bands) drive.bands = features.bands;
  if (features.lowRms) drive.low = energyEnvelope(features.lowRms, features.hopSeconds, fps, frames, { attackSeconds: 0.02, releaseSeconds: 0.15, minRefOfPeak: 0.5 });
  return drive;
}

/** No track: constant mid energy and no onsets, so the rig and the layer still run. */
export function flatDrive(fps: number, frames: number, energy = 0.5): AudioDrive {
  return { fps, energy: new Float32Array(frames).fill(energy), onsets: [], source: "flat" };
}

export function energyAtFrame(drive: AudioDrive | undefined, frame: number): number {
  if (!drive || drive.energy.length === 0) return 0.5;
  return drive.energy[Math.max(0, Math.min(drive.energy.length - 1, Math.round(frame)))];
}

/** Energy at a time, linearly interpolated between frames. */
export function energyAtSeconds(drive: AudioDrive | undefined, seconds: number): number {
  if (!drive || drive.energy.length === 0) return 0.5;
  const x = Math.max(0, Math.min(drive.energy.length - 1, seconds * drive.fps));
  const i = Math.floor(x), f = x - i;
  const a = drive.energy[i], b = drive.energy[Math.min(drive.energy.length - 1, i + 1)];
  return a + (b - a) * f;
}
