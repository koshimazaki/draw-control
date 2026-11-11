/**
 * Synthetic drum patterns for the band-analysis tests, the CLI and smoke fixtures and the
 * studio's demo track (`npm run drums`, *Load demo*):
 * a pitch-dropping sine kick, a noise-and-tone snare and a short bright hat, on a
 * known tempo. Deterministic, generated, licence-clean.
 */
export type DrumPattern = { kicks: number[]; snares: number[]; hats: number[] };

/** Times of a four-on-the-floor-ish pattern: kick on 1 and 3 (and the "and" of 3 every other bar), snare on 2 and 4, hats on every eighth. */
export function patternTimes(bpm: number, bars: number, offset = 0.1): DrumPattern {
  const beat = 60 / bpm, kicks: number[] = [], snares: number[] = [], hats: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = offset + bar * 4 * beat;
    kicks.push(t0, t0 + 2 * beat);
    if (bar % 2 === 1) kicks.push(t0 + 2.5 * beat);
    snares.push(t0 + beat, t0 + 3 * beat);
    for (let e = 0; e < 8; e++) hats.push(t0 + e * beat / 2);
  }
  const sort = (a: number[]) => a.sort((x, y) => x - y);
  return { kicks: sort(kicks), snares: sort(snares), hats: sort(hats) };
}

export function synthDrums(p: DrumPattern, seconds: number, sampleRate = 44100, opts: { hatGain?: number; pad?: number; noise?: number } = {}): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  let seed = 11;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const add = (t: number, len: number, fn: (i: number, s: number) => number) => {
    const start = Math.round(t * sampleRate);
    for (let i = 0; i < len * sampleRate && start + i < out.length; i++) out[start + i] += fn(i, i / sampleRate);
  };
  for (const t of p.kicks) {
    let phase = 0;
    add(t, 0.35, (_, s) => { phase += 2 * Math.PI * (50 + 70 * Math.exp(-s / 0.03)) / sampleRate; return 0.8 * Math.sin(phase) * Math.exp(-s / 0.12); });
  }
  for (const t of p.snares) add(t, 0.2, (_, s) => 0.45 * rand() * Math.exp(-s / 0.05) + 0.3 * Math.sin(2 * Math.PI * 190 * s) * Math.exp(-s / 0.06));
  const hatGain = opts.hatGain ?? 0.25;
  for (const t of p.hats) {
    let last = 0;
    // First difference of white noise: energy tilted towards the top of the spectrum.
    add(t, 0.05, (_, s) => { const n = rand(), v = (n - last) * 0.5; last = n; return hatGain * v * Math.exp(-s / 0.012); });
  }
  // Optional sustained pad (two detuned tones) under everything: a steady tone must give no onsets.
  if (opts.pad) for (let i = 0; i < out.length; i++) { const s = i / sampleRate; out[i] += opts.pad * (Math.sin(2 * Math.PI * 220 * s) + Math.sin(2 * Math.PI * 330.5 * s)) / 2; }
  if (opts.noise) for (let i = 0; i < out.length; i++) out[i] += opts.noise * rand();
  return out;
}

/** Precision and recall of detected times against the truth within `tol` seconds, and the mean absolute timing error. */
export function score(found: number[], truth: number[], tol = 0.03) {
  const used = new Set<number>();
  let hits = 0, err = 0;
  for (const t of truth) {
    let best = -1, bd = tol;
    found.forEach((f, i) => { const d = Math.abs(f - t); if (!used.has(i) && d <= bd) { bd = d; best = i; } });
    if (best >= 0) { used.add(best); hits++; err += bd; }
  }
  return { precision: found.length ? hits / found.length : 0, recall: truth.length ? hits / truth.length : 0, meanErrorMs: hits ? err / hits * 1000 : 0, found: found.length, truth: truth.length };
}
