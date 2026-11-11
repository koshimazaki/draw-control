import { describe, expect, it } from "vitest";
import { analyseBands, analyseSamples, bandOnsets, buildDrive, waveformMinMax } from "../src/internal";
import { patternTimes, score, synthDrums } from "./drum-synth";

const BPM = 120, BARS = 8, SECONDS = 0.1 + BARS * 2 + 0.5;
const truth = patternTimes(BPM, BARS);
/** Hats that do not share a time with a snare (those count as part of the snare). */
const hatsAlone = truth.hats.filter(h => !truth.snares.some(s => Math.abs(s - h) < 0.03));
const times = (l: { seconds: number }[]) => l.map(o => o.seconds);

describe("drum-band onsets on a synthetic kick/snare/hat pattern at 120 BPM", () => {
  const audio = synthDrums(truth, SECONDS);
  const bands = analyseBands([audio], 44100);
  const report = {
    kick: score(times(bands.low), truth.kicks),
    snare: score(times(bands.mid), truth.snares),
    hat: score(times(bands.high), hatsAlone),
  };
  it("finds the kicks in the low band", () => {
    console.log("band accuracy (clean mix):", JSON.stringify(report));
    expect(report.kick.recall).toBeGreaterThanOrEqual(0.95);
    expect(report.kick.precision).toBeGreaterThanOrEqual(0.95);
    expect(report.kick.meanErrorMs).toBeLessThan(12);
  });
  it("finds the snares in the mid band", () => {
    expect(report.snare.recall).toBeGreaterThanOrEqual(0.95);
    expect(report.snare.precision).toBeGreaterThanOrEqual(0.9);
    expect(report.snare.meanErrorMs).toBeLessThan(12);
  });
  it("finds the hats in the high band", () => {
    expect(report.hat.recall).toBeGreaterThanOrEqual(0.8);
    expect(report.hat.precision).toBeGreaterThanOrEqual(0.8);
  });
  it("lists amplitude peaks on the hits", () => {
    expect(bands.peaks.length).toBeGreaterThan(truth.kicks.length * 0.8);
    for (const p of bands.peaks) expect(p.strength).toBeGreaterThanOrEqual(0.3);
  });
  it("is deterministic and names bands by alias", () => {
    expect(analyseBands([audio], 44100)).toEqual(bands);
    expect(bandOnsets(bands, "kick")).toEqual(bands.low);
    expect(bandOnsets(bands, "snare")).toEqual(bands.mid);
    expect(() => bandOnsets(bands, "cowbell")).toThrow(/unknown band/);
  });
  it("flows into the features and the drive, and fixes the half-tempo estimate", () => {
    const f = analyseSamples([audio], 44100);
    expect(f.estimatedBpm).toBeCloseTo(120, 0);
    expect(f.bands?.low.length).toBe(bands.low.length);
    const d = buildDrive(f, 24, 100);
    expect(d.bands?.mid.length).toBe(bands.mid.length);
  });
});

describe("drum-band onsets under a sustained pad and at 22.05 kHz", () => {
  it("keeps kicks and snares with a steady tone underneath", () => {
    const bands = analyseBands([synthDrums(truth, SECONDS, 44100, { pad: 0.2 })], 44100);
    const kick = score(times(bands.low), truth.kicks), snare = score(times(bands.mid), truth.snares);
    console.log("band accuracy (with pad):", JSON.stringify({ kick, snare }));
    expect(kick.recall).toBeGreaterThanOrEqual(0.9);
    expect(snare.recall).toBeGreaterThanOrEqual(0.9);
    expect(kick.precision).toBeGreaterThanOrEqual(0.9);
  });
  it("holds up at 97 BPM with quiet hats over a noise floor (harder case)", () => {
    const t = patternTimes(97, 8, 0.3), secs = 0.3 + 8 * 4 * 60 / 97 + 0.5;
    const bands = analyseBands([synthDrums(t, secs, 44100, { hatGain: 0.1, pad: 0.15, noise: 0.02 })], 44100);
    const alone = t.hats.filter(h => !t.snares.some(s => Math.abs(s - h) < 0.03));
    const r = { kick: score(times(bands.low), t.kicks), snare: score(times(bands.mid), t.snares), hat: score(times(bands.high), alone) };
    console.log("band accuracy (97 BPM, noise floor, quiet hats):", JSON.stringify(r));
    expect(r.kick.recall).toBeGreaterThanOrEqual(0.9);
    expect(r.snare.recall).toBeGreaterThanOrEqual(0.9);
    expect(r.kick.precision).toBeGreaterThanOrEqual(0.9);
    expect(r.snare.precision).toBeGreaterThanOrEqual(0.9);
  });
  it("works at a lower sample rate", () => {
    const bands = analyseBands([synthDrums(truth, SECONDS, 22050)], 22050);
    expect(score(times(bands.low), truth.kicks).recall).toBeGreaterThanOrEqual(0.9);
    expect(score(times(bands.mid), truth.snares).recall).toBeGreaterThanOrEqual(0.9);
  });
  it("gives a waveform of min and max per bucket", () => {
    const w = waveformMinMax([new Float32Array([0, 0.5, -0.25, 1, -1, 0])], 1000, 0.003);
    expect(Array.from(w.max)).toEqual([0.5, 1]);
    expect(Array.from(w.min)).toEqual([-0.25, -1]);
  });
});
