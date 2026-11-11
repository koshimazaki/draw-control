/**
 * Drum-band analysis: onsets per frequency band and the overall amplitude peaks of a
 * track. Pure functions over decoded samples, so the studio, the CLI and the tests run
 * the same numbers.
 *
 * Method (after the owner's camera-director audio DSP): a Hann-windowed short-time
 * Fourier transform, log-compressed magnitudes, spectral flux (the positive change of
 * log magnitude) averaged over each band's bins, and a peak picker that keeps a flux
 * peak only when the band's power really rises after it (an attack, not a steady tone).
 *
 * Bands:
 * - low, 30–150 Hz: kicks and bass;
 * - mid, 1.5–6 kHz: the snare's crack (and claps);
 * - high, 6 kHz and up: hi-hats and cymbals.
 * Hats also reach the mid band and a snare's noise reaches the high band, so each mid onset
 * is classed by its brightness (power per bin above 6 kHz over power per bin in the mid
 * band, over the attack): a snare is roughly flat, a hat is several times brighter. Mid
 * onsets brighter than HAT_BRIGHTNESS are hats; a high onset within 30 ms of a snare is
 * part of the snare. A kick's beater click can reach the mid band, so a weak mid onset on
 * top of a low onset is dropped from the snares; likewise a snare reaches the low band, so
 * a low onset on a snare with under a fifth of the loudest kick's low-band power is dropped.
 * These are heuristics checked on synthetic patterns, not a drum transcription.
 */

export const DRUM_BANDS = { low: [30, 150], mid: [1500, 6000], high: [6000, 16000] } as const;
export type DrumBand = keyof typeof DRUM_BANDS;
export const DRUM_BAND_NAMES = Object.keys(DRUM_BANDS) as DrumBand[];
/** Plain names for people and agents: kick = low, snare = mid, hat = high. */
export const BAND_ALIASES: Record<string, DrumBand> = { low: "low", kick: "low", kicks: "low", mid: "mid", snare: "mid", snares: "mid", high: "high", hat: "high", hats: "high" };

export type BandOnset = { seconds: number; /** 0–1, relative to the band's strongest onset */ strength: number };
export type BandAnalysis = {
  /** Analysis hop, seconds. */
  hopSeconds: number;
  low: BandOnset[]; mid: BandOnset[]; high: BandOnset[];
  /** Local maxima of the overall loudness (RMS), strength relative to the loudest. */
  peaks: BandOnset[];
};

/** Flux peaks lead the attack slightly (the attack slides into the window); measured on synthetic hits. */
const ONSET_LAG = 0.008;
const COINCIDE = 0.03;
/** Power per bin above 6 kHz over power per bin at 1.5–6 kHz above which a mid onset is a hat, not a snare. */
export const HAT_BRIGHTNESS = 3;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

/** In-place iterative radix-2 FFT over a power-of-two length. */
function makeFft(size: number) {
  const bits = Math.round(Math.log2(size));
  const reverse = new Uint32Array(size);
  for (let i = 0; i < size; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); reverse[i] = r; }
  const cos = new Float64Array(size / 2), sin = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / size); sin[i] = Math.sin(-2 * Math.PI * i / size); }
  return (re: Float64Array, im: Float64Array) => {
    for (let i = 0; i < size; i++) {
      const j = reverse[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= size; len *= 2) {
      const half = len / 2, step = size / len;
      for (let start = 0; start < size; start += len) for (let k = 0; k < half; k++) {
        const wr = cos[k * step], wi = sin[k * step], a = start + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  };
}

export function mixDown(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0]?.length ?? 0, out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

type Spectral = { frameRate: number; flux: Record<DrumBand, Float32Array>; power: Record<DrumBand, Float32Array>; bins: Record<DrumBand, number>; rms: Float32Array };

function spectral(samples: Float32Array, sampleRate: number): Spectral {
  const size = sampleRate >= 32000 ? 2048 : 1024, hop = size / 4;
  const frames = Math.floor(samples.length / hop) + 1;
  const fft = makeFft(size);
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size);
  const re = new Float64Array(size), im = new Float64Array(size), bins = size / 2 + 1;
  let prev = new Float64Array(bins), cur = new Float64Array(bins);
  const binW = sampleRate / size;
  const range = (b: DrumBand) => {
    const first = Math.max(1, Math.round(DRUM_BANDS[b][0] / binW));
    const last = Math.min(bins, Math.round(Math.min(DRUM_BANDS[b][1], sampleRate / 2) / binW) + 1);
    return [first, Math.max(first + 1, last)] as const;
  };
  const ranges = { low: range("low"), mid: range("mid"), high: range("high") };
  const flux = { low: new Float32Array(frames), mid: new Float32Array(frames), high: new Float32Array(frames) };
  const power = { low: new Float32Array(frames), mid: new Float32Array(frames), high: new Float32Array(frames) };
  const rms = new Float32Array(frames);
  const scale = 4 / size;
  for (let f = 0; f < frames; f++) {
    const start = f * hop - size / 2;
    for (let i = 0; i < size; i++) { const at = start + i; re[i] = at >= 0 && at < samples.length ? samples[at] * win[i] : 0; im[i] = 0; }
    let sq = 0, count = 0;
    for (let i = Math.max(0, f * hop - hop / 2); i < Math.min(samples.length, f * hop + hop / 2); i++) { sq += samples[i] * samples[i]; count++; }
    rms[f] = Math.sqrt(sq / Math.max(1, count));
    fft(re, im);
    for (let k = 0; k < bins; k++) cur[k] = Math.hypot(re[k], im[k]) * scale;
    for (const b of DRUM_BAND_NAMES) {
      const [first, last] = ranges[b];
      let p = 0, fl = 0;
      for (let k = first; k < last; k++) {
        p += cur[k] * cur[k];
        fl += Math.max(0, Math.log1p(1000 * cur[k]) - Math.log1p(1000 * prev[k]));   // frame 0 rises from silence
      }
      power[b][f] = p;
      flux[b][f] = fl / (last - first);
    }
    [prev, cur] = [cur, prev];
  }
  const width = (b: DrumBand) => ranges[b][1] - ranges[b][0];
  return { frameRate: sampleRate / hop, flux, power, rms, bins: { low: width("low"), mid: width("mid"), high: width("high") } };
}

/** The band's power over the next 46 ms is at least 1.5 times its power over the 100 ms before (ending 35 ms back). */
function isAttack(power: Float32Array, i: number, frameRate: number): boolean {
  const after = Math.max(1, Math.round(frameRate * 0.046)), gap = Math.max(1, Math.round(frameRate * 0.035)), before = Math.max(1, Math.round(frameRate * 0.1));
  let post = 0, pre = 0, n = 0;
  const end = Math.min(power.length, i + after);
  for (let f = i; f < end; f++) post += power[f];
  post /= Math.max(1, end - i);
  for (let f = Math.max(0, i - gap - before); f < i - gap; f++) { pre += power[f]; n++; }
  pre /= Math.max(1, n);
  return post > 1e-12 && post >= 1.5 * pre;
}

/** Peaks of one band's flux: a local maximum over ±35 ms, above the local mean, 50 ms after the last onset, and a real attack. */
function pickOnsets(flux: Float32Array, power: Float32Array, frameRate: number, minStrength: number): BandOnset[] {
  let top = 0;
  for (const v of flux) top = Math.max(top, v);
  if (top < 1e-6) return [];
  const around = Math.max(1, Math.round(frameRate * 0.035)), meanW = Math.max(1, Math.round(frameRate * 0.1)), wait = Math.max(1, Math.round(frameRate * 0.05));
  const out: BandOnset[] = [];
  let last = -Infinity;
  for (let i = 0; i < flux.length - 1; i++) {
    const v = flux[i] / top;
    if (v < minStrength || i - last < wait) continue;
    let peak = true;
    for (let j = Math.max(0, i - around); j <= Math.min(flux.length - 1, i + around) && peak; j++) if (flux[j] > flux[i]) peak = false;
    if (!peak) continue;
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - meanW); j <= Math.min(flux.length - 1, i + meanW); j++) { sum += flux[j] / top; n++; }
    if (v < sum / n + 0.07 || !isAttack(power, i, frameRate)) continue;
    // Parabolic vertex for a sub-hop time.
    const a = flux[i - 1] ?? 0, b = flux[i], c = flux[i + 1], d = a - 2 * b + c;
    const off = d < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / d)) : 0;
    out.push({ seconds: r4(Math.max(0, (i + off) / frameRate + ONSET_LAG)), strength: Math.round(v * 1000) / 1000 });
    last = i;
  }
  return out;
}

/** Overall amplitude peaks: local maxima of the RMS over ±60 ms, at least 0.3 of the loudest, 100 ms apart. */
function amplitudePeaks(rms: Float32Array, frameRate: number): BandOnset[] {
  let top = 0;
  for (const v of rms) top = Math.max(top, v);
  if (top <= 0) return [];
  const around = Math.max(1, Math.round(frameRate * 0.06)), wait = Math.round(frameRate * 0.1);
  const out: BandOnset[] = [];
  let last = -Infinity;
  for (let i = 0; i < rms.length; i++) {
    const v = rms[i] / top;
    if (v < 0.3 || i - last < wait) continue;
    let peak = true;
    for (let j = Math.max(0, i - around); j <= Math.min(rms.length - 1, i + around) && peak; j++) if (rms[j] > rms[i] || (rms[j] === rms[i] && j < i)) peak = false;
    if (!peak) continue;
    out.push({ seconds: r4(i / frameRate), strength: Math.round(v * 1000) / 1000 });
    last = i;
  }
  return out;
}

const near = (list: BandOnset[], t: number) => list.some(o => Math.abs(o.seconds - t) <= COINCIDE);

/** Mean power of a band over the 46 ms after an onset. */
function postPower(s: Spectral, band: DrumBand, seconds: number): number {
  const i = Math.max(0, Math.round((seconds - ONSET_LAG) * s.frameRate)), n = Math.max(1, Math.round(0.046 * s.frameRate));
  let p = 0;
  for (let f = i; f < Math.min(s.rms.length, i + n); f++) p += s.power[band][f];
  return p / n;
}

/** Brightness of the attack at a time: high-band over mid-band power per bin, over the next 30 ms. */
function brightness(s: Spectral, seconds: number): number {
  const i = Math.max(0, Math.round((seconds - ONSET_LAG) * s.frameRate)), n = Math.max(1, Math.round(0.03 * s.frameRate));
  let hi = 0, mid = 0;
  for (let f = i; f < Math.min(s.rms.length, i + n); f++) { hi += s.power.high[f]; mid += s.power.mid[f]; }
  return (hi / s.bins.high) / Math.max(1e-12, mid / s.bins.mid);
}

export function analyseBands(channels: readonly Float32Array[], sampleRate: number, opts: { minStrength?: number } = {}): BandAnalysis {
  const samples = mixDown(channels);
  const s = spectral(samples, sampleRate);
  const min = opts.minStrength ?? 0.1;
  const lowAll = pickOnsets(s.flux.low, s.power.low, s.frameRate, min);
  const midAll = pickOnsets(s.flux.mid, s.power.mid, s.frameRate, min);
  const mid = midAll.filter(o => brightness(s, o.seconds) < HAT_BRIGHTNESS && (o.strength >= 0.5 || !near(lowAll, o.seconds)));
  // A snare's body and noise reach the low band too: a weak low onset on a snare is the snare.
  const lowPower = lowAll.map(o => postPower(s, "low", o.seconds)), loudest = Math.max(0, ...lowPower);
  const low = lowAll.filter((o, i) => lowPower[i] >= 0.2 * loudest || !near(mid, o.seconds));
  const high = pickOnsets(s.flux.high, s.power.high, s.frameRate, min).filter(o => !near(mid, o.seconds));
  return { hopSeconds: 1 / s.frameRate, low, mid, high, peaks: amplitudePeaks(s.rms, s.frameRate) };
}

/** Onsets of a band (name or alias: kick, snare, hat), optionally only those at least `minStrength`. */
export function bandOnsets(bands: BandAnalysis | undefined, band: string, minStrength = 0): BandOnset[] {
  const key = BAND_ALIASES[band];
  if (!key) throw new Error(`unknown band ${JSON.stringify(band)}: use low, mid, high (or kick, snare, hat)`);
  return (bands?.[key] ?? []).filter(o => o.strength >= minStrength);
}

/** Min and max sample per bucket of `bucketSeconds`, for drawing the waveform at any zoom. */
export function waveformMinMax(channels: readonly Float32Array[], sampleRate: number, bucketSeconds = 0.005) {
  const samples = mixDown(channels), step = Math.max(1, Math.round(bucketSeconds * sampleRate));
  const n = Math.ceil(samples.length / step), min = new Float32Array(n), max = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let lo = 0, hi = 0;
    for (let i = b * step; i < Math.min(samples.length, (b + 1) * step); i++) { const v = samples[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    min[b] = lo; max[b] = hi;
  }
  return { min, max, bucketSeconds: step / sampleRate };
}
