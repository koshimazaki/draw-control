import { describe, expect, it } from "vitest";
import { analyseSamples, beatGridJson, snapFrames8k1 } from "../src/internal";

/** Synthetic click track: short decaying noise bursts on each beat. Deterministic. */
function clickTrack(bpm: number, offset: number, seconds: number, sampleRate = 22050): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  for (let t = offset; t < seconds; t += 60 / bpm) {
    const start = Math.round(t * sampleRate);
    for (let i = 0; i < 0.03 * sampleRate && start + i < out.length; i++) out[start + i] = rand() * Math.exp(-i / (0.006 * sampleRate));
  }
  return out;
}

describe("beat grid", () => {
  it.each([[120, 0.25], [96, 0.1], [140, 0.3]])("estimates %s BPM and its offset from a click track", (bpm, offset) => {
    const f = analyseSamples([clickTrack(bpm, offset, 12)], 22050);
    expect(f.estimatedBpm).not.toBeNull();
    expect(Math.abs(f.estimatedBpm! - bpm)).toBeLessThan(2);
    expect(Math.abs(f.estimatedOffsetSeconds - offset)).toBeLessThan(0.03);
  });
  it("returns no tempo for silence", () => {
    expect(analyseSamples([new Float32Array(22050 * 4)], 22050).estimatedBpm).toBeNull();
  });
  it("lists beats and downbeats", () => {
    const g = beatGridJson({ bpm: 120, offsetSeconds: 0.25, beatsPerBar: 4, source: "manual" }, 9);
    expect(g.beats).toEqual([0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 4.25]);
    expect(g.downbeats).toEqual([0.25, 2.25, 4.25]);
  });
  it("snaps frame counts to 8k+1", () => {
    expect([1, 2, 9, 10, 96, 97, 120.2].map(snapFrames8k1)).toEqual([1, 9, 9, 17, 97, 97, 121]);
  });
});
