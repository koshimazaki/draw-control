/**
 * Beat grid and local-only audio analysis. Pure functions over decoded samples,
 * so they run in the browser and in tests alike. BPM detection is approximate:
 * the studio always lets the user correct BPM and offset by hand.
 * The RMS envelope and BPM estimator come from the seed kit; offset estimation is new.
 */
import type { BeatGrid } from "./recipe";
import { analyseBands, type BandAnalysis, type BandOnset } from "./audio-bands";

export type AudioFeatures = {
  lengthSeconds: number;
  sampleRate: number;
  hopSeconds: number;
  /** RMS envelope normalised to 0–1. */
  rms: Float32Array;
  /** 100 peak values for a waveform strip. */
  waveform: number[];
  estimatedBpm: number | null;
  estimatedOffsetSeconds: number;
  /** RMS envelope of the low band (below about 150 Hz: kick and bass), on the same hops as `rms`. */
  lowRms?: Float32Array;
  /** Drum-band onsets (kick, snare, hat) and amplitude peaks. */
  bands?: BandAnalysis;
};

/** Mono, low-passed twice at `hz` (two one-pole filters): the kick and bass band. */
export function lowBand(channels: readonly Float32Array[], sampleRate: number, hz = 150): Float32Array {
  const length = channels[0]?.length ?? 0, out = new Float32Array(length);
  const a = 1 - Math.exp(-2 * Math.PI * hz / sampleRate);
  let y1 = 0, y2 = 0;
  for (let j = 0; j < length; j++) {
    let v = 0;
    for (const ch of channels) v += ch[j] / channels.length;
    y1 += a * (v - y1); y2 += a * (y1 - y2);
    out[j] = y2;
  }
  return out;
}

export type BeatsJson = {
  bpm: number;
  offsetSeconds: number;
  beatsPerBar: number;
  source: BeatGrid["source"];
  /** Beat times in seconds from frame 0. */
  beats: number[];
  /** The subset of beats that start a bar. */
  downbeats: number[];
  /** Optional (0.3.0): drum-band onsets, re-based like the beats. low = kick, mid = snare, high = hat. */
  onsets?: { low: BandOnset[]; mid: BandOnset[]; high: BandOnset[] };
  /** Optional (0.3.0): overall amplitude peaks, re-based like the beats. */
  peaks?: BandOnset[];
};

function normalise(input: Float32Array): Float32Array {
  let maximum = 0;
  for (const x of input) maximum = Math.max(maximum, x);
  return input.map(x => (maximum > 0 ? x / maximum : 0));
}

/** RMS envelope at roughly 86 hops per second, mixed down across channels. */
export function rmsEnvelope(channels: readonly Float32Array[], sampleRate: number) {
  const length = channels[0]?.length ?? 0;
  const hop = Math.max(256, Math.round(sampleRate / 86));
  const count = Math.ceil(length / hop);
  const rms = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const from = i * hop, to = Math.min(length, from + hop);
    let sum = 0, n = 0;
    for (let j = from; j < to; j += 4) {
      let v = 0;
      for (const ch of channels) v += ch[j] / channels.length;
      sum += v * v;
      n++;
    }
    rms[i] = Math.sqrt(sum / Math.max(1, n));
  }
  return { rms: normalise(rms), hopSeconds: hop / sampleRate };
}

/** Onset strength: how much each hop rises above its recent past. */
export function onsetNovelty(rms: Float32Array): Float32Array {
  const novelty = new Float32Array(rms.length);
  let running = 0;
  for (let i = 0; i < rms.length; i++) {
    running = running * 0.92 + rms[i] * 0.08;
    const previous = i > 0 ? rms[i - 1] : 0;
    novelty[i] = Math.max(0, rms[i] - Math.max(previous, running * 0.8));
  }
  return novelty;
}

/** Approximate tempo from autocorrelation of onset novelty, 60–180 BPM. */
export function estimateBpm(rms: Float32Array, hopSeconds: number): number | null {
  if (rms.length < 128 || !Number.isFinite(hopSeconds) || hopSeconds <= 0) return null;
  const novelty = onsetNovelty(rms);
  const minLag = Math.max(1, Math.floor(60 / (180 * hopSeconds)));
  const maxLag = Math.min(rms.length - 1, Math.ceil(60 / (60 * hopSeconds)));
  const scores = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0, normA = 0, normB = 0;
    for (let i = lag; i < novelty.length; i++) {
      const a = novelty[i], b = novelty[i - lag];
      score += a * b; normA += a * a; normB += b * b;
    }
    scores[lag] = score / (Math.sqrt(normA * normB) + 1e-9);
  }
  let best = 0, bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) if (scores[lag] > best) { best = scores[lag]; bestLag = lag; }
  if (bestLag < 0 || best < 0.12) return null;
  // Prefer the shorter period when half the lag correlates nearly as well (avoids half-tempo).
  const half = Math.round(bestLag / 2);
  if (half >= minLag && Math.max(scores[half - 1] ?? 0, scores[half], scores[half + 1] ?? 0) > best * 0.8) bestLag = half;
  // Refine the period with a parabola through the neighbouring scores.
  const a = scores[bestLag - 1] ?? 0, b = scores[bestLag], c = scores[bestLag + 1] ?? 0;
  const denom = a - 2 * b + c;
  const refined = denom < 0 ? bestLag + 0.5 * (a - c) / denom : bestLag;
  return Math.round(60 / (refined * hopSeconds) * 10) / 10;
}

/** Offset of beat 0 within one beat period: the phase whose beat positions carry the most onset energy. */
export function estimateBeatOffset(rms: Float32Array, hopSeconds: number, bpm: number): number {
  const novelty = onsetNovelty(rms);
  const period = 60 / bpm;
  const steps = Math.max(8, Math.round(period / hopSeconds));
  let bestPhase = 0, best = -1;
  for (let s = 0; s < steps; s++) {
    const phase = s * period / steps;
    let sum = 0;
    for (let t = phase; t < novelty.length * hopSeconds; t += period) {
      const i = Math.round(t / hopSeconds);
      sum += Math.max(novelty[i] ?? 0, novelty[i + 1] ?? 0);
    }
    if (sum > best) { best = sum; bestPhase = phase; }
  }
  return Math.round(bestPhase * 1000) / 1000;
}

function waveformPeaks(rms: Float32Array, count = 100): number[] {
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * rms.length / count);
    const end = Math.max(start + 1, Math.floor((i + 1) * rms.length / count));
    let peak = 0;
    for (let j = start; j < Math.min(end, rms.length); j++) peak = Math.max(peak, rms[j]);
    return Math.max(0.03, peak);
  });
}

/**
 * Octave check with the drum onsets: the RMS estimate can lock to half the tempo when the
 * kick and snare alternate (the bar-long pattern correlates better than the beat). When the
 * double tempo's grid still lands on a kick or snare at least 75% of the time, take it.
 */
export function refineTempo(bpm: number | null, bands: BandAnalysis | undefined, lengthSeconds: number): number | null {
  if (!bpm || !bands || bpm * 2 > 180) return bpm;
  const hits = [...bands.low, ...bands.mid].map(o => o.seconds).sort((a, b) => a - b);
  if (hits.length < 8) return bpm;
  const rate = (b: number) => {
    const period = 60 / b;
    let best = 0;
    for (const anchor of hits.slice(0, 8)) {
      let n = 0, hit = 0;
      for (let t = anchor % period; t < lengthSeconds; t += period, n++) if (hits.some(h => Math.abs(h - t) < 0.035)) hit++;
      best = Math.max(best, n ? hit / n : 0);
    }
    return best;
  };
  return rate(bpm * 2) >= 0.75 ? Math.round(bpm * 20) / 10 : bpm;
}

export function analyseSamples(channels: readonly Float32Array[], sampleRate: number): AudioFeatures {
  const { rms, hopSeconds } = rmsEnvelope(channels, sampleRate);
  const bands = analyseBands(channels, sampleRate);
  const estimatedBpm = refineTempo(estimateBpm(rms, hopSeconds), bands, (channels[0]?.length ?? 0) / sampleRate);
  return {
    lengthSeconds: (channels[0]?.length ?? 0) / sampleRate,
    sampleRate,
    hopSeconds,
    rms,
    waveform: waveformPeaks(rms),
    estimatedBpm,
    estimatedOffsetSeconds: estimatedBpm ? estimateBeatOffset(rms, hopSeconds, estimatedBpm) : 0,
    lowRms: rmsEnvelope([lowBand(channels, sampleRate)], sampleRate).rms,
    bands,
  };
}

export function audioEnergyAt(audio: AudioFeatures | null, seconds: number): number {
  if (!audio || !Number.isFinite(seconds) || seconds < 0) return 0;
  return audio.rms[Math.min(audio.rms.length - 1, Math.floor(seconds / audio.hopSeconds))] ?? 0;
}

/** Beat at a time in seconds (fractional; negative before the first beat). */
export const beatAtSeconds = (grid: BeatGrid, seconds: number) => (seconds - grid.offsetSeconds) * grid.bpm / 60;
export const secondsAtBeat = (grid: BeatGrid, beat: number) => grid.offsetSeconds + beat * 60 / grid.bpm;

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** Beat and downbeat times for the first `count` beats. */
export function beatGridJson(grid: BeatGrid, count: number): BeatsJson {
  const beats: number[] = [], downbeats: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = round4(secondsAtBeat(grid, i));
    beats.push(t);
    if (i % grid.beatsPerBar === 0) downbeats.push(t);
  }
  return { bpm: grid.bpm, offsetSeconds: grid.offsetSeconds, beatsPerBar: grid.beatsPerBar, source: grid.source, beats, downbeats };
}

/** Smallest frame count of the form 8k+1 that is at least `frames`. */
export function snapFrames8k1(frames: number): number {
  const n = Math.max(1, Math.ceil(frames));
  return Math.ceil((n - 1) / 8) * 8 + 1;
}
