/** Hit sensitivity (lock.ts sensitiveBands): fewer, stronger, spaced hits for every lock; read from and printed to the script. */
import { describe, expect, it } from "vitest";
import { hitBands, sensitiveBands } from "../src/internal";
import { validateRecipe } from "../src/recipe";
import type { BandAnalysis } from "../src/audio-bands";

// A busy arpeggio in the mid band: 16 notes 0.125 s apart, every fourth an accent.
const arp = Array.from({ length: 16 }, (_, i) => ({ seconds: 1 + i * 0.125, strength: i % 4 === 0 ? 1 : 0.35 }));
const bands = { hopSeconds: 0.01, low: [{ seconds: 1, strength: 1 }, { seconds: 3, strength: 0.2 }], mid: arp, high: [], peaks: [] } as BandAnalysis;

describe("Hit sensitivity", () => {
  it("1 or absent keeps every hit", () => {
    expect(sensitiveBands(bands, undefined)).toBe(bands);
    expect(sensitiveBands(bands, 1)).toBe(bands);
  });
  it("lower collapses a fast arpeggio to its accents and drops weak hits", () => {
    const half = sensitiveBands(bands, 0.5)!;
    expect(half.mid.map(o => o.seconds)).toEqual([1, 1.5, 2, 2.5]);
    expect(half.low.map(o => o.seconds)).toEqual([1]);
    expect(sensitiveBands(bands, 0)!.mid.length).toBeLessThan(half.mid.length + 1);
  });
  it("a band of uniformly quiet hits keeps its accents rather than emptying", () => {
    const quiet = { ...bands, high: Array.from({ length: 24 }, (_, i) => ({ seconds: i * 0.25, strength: 0.2 + (i % 8 === 0 ? 0.1 : 0) })) } as BandAnalysis;
    const kept = sensitiveBands(quiet, 0.3)!.high.map(o => o.seconds);
    expect(kept).toEqual(expect.arrayContaining([0, 2, 4]));   // every accent stays
    expect(kept.length).toBeLessThan(24);                       // and the row thins
  });
  it("hand-added markers always count", () => {
    const r = { hitSensitivity: 0, addedHits: [{ band: "mid" as const, seconds: 1.3 }] };
    expect(hitBands(bands, r)!.mid.map(o => o.seconds)).toContain(1.3);
  });
  it("the recipe keeps it rounded to hundredths, and drops 1", () => {
    const base = { version: 2, fps: 24, durationBeats: 8, energy: 1, moves: [], jumps: [], beatGrid: { bpm: 120, offsetSeconds: 0, beatsPerBar: 4, source: "manual" }, character: { kind: "glider", name: "g", licence: "MIT" }, rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }] };
    expect(validateRecipe({ ...base, hitSensitivity: 0.456 }).hitSensitivity).toBe(0.46);
    expect(validateRecipe({ ...base, hitSensitivity: 1 }).hitSensitivity).toBeUndefined();
    expect(() => validateRecipe({ ...base, hitSensitivity: 2 })).toThrow(/0–1/);
  });
});
