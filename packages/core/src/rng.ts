/**
 * Seeded, stateless randomness: a hash of (seed, keys) instead of a generator with state,
 * so any frame can be evaluated on its own and two runs with one seed match exactly.
 */
export function hash32(seed: number, ...keys: number[]): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const k of keys) {
    h = Math.imul(h ^ (Math.floor(k) >>> 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h;
}

/** Uniform in [0, 1). */
export const rand01 = (seed: number, ...keys: number[]) => hash32(seed, ...keys) / 4294967296;
/** Uniform in [-1, 1). */
export const randSigned = (seed: number, ...keys: number[]) => rand01(seed, ...keys) * 2 - 1;

/** Smooth value noise in [-1, 1]: random values on whole x, cosine-blended between them (C1). */
export function smoothNoise(seed: number, channel: number, x: number): number {
  const i = Math.floor(x), f = x - i;
  const a = randSigned(seed, channel, i), b = randSigned(seed, channel, i + 1);
  const t = 0.5 - 0.5 * Math.cos(Math.PI * f);
  return a + (b - a) * t;
}
