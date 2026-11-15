/** Slice and Export in the track panel (track-cut.ts): the window's samples, its WAV file, the names, the state moved onto the cut. */
import { describe, expect, it } from "vitest";
import { analyseSamples, patternTimes, synthDrums } from "@motion-studio/core/internal";
import { cutChannels, exportName, moveOntoCut, sampleRange, slicedName, windowWav, type Samples } from "../src/beat-path/track-cut";
import { exampleState } from "../src/beat-path/examples";

/** A fake decoded track: channel c holds c * 1e6 + i at sample i, scaled into ±1 (so every sample is identifiable). */
const RATE = 1000;
function ramp(channels: number, length: number): Samples & { data: Float32Array[] } {
  const data = Array.from({ length: channels }, (_, c) => Float32Array.from({ length }, (_, i) => (c * length + i) / (channels * length)));
  return { numberOfChannels: channels, sampleRate: RATE, getChannelData: c => data[c], data };
}
/** A 16-bit WAV's header fields and its samples per channel. */
function readWav(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = v.getUint16(22, true), rate = v.getUint32(24, true), bits = v.getUint16(34, true), n = v.getUint32(40, true) / 2 / channels;
  const at = (c: number, i: number) => v.getInt16(44 + (i * channels + c) * 2, true);
  return { riff: String.fromCharCode(...bytes.subarray(0, 4)), channels, rate, bits, n, at };
}
const int16 = (x: number) => Math.trunc(x < 0 ? x * 0x8000 : x * 0x7fff);   // as DataView.setInt16 stores it

describe("Slice: the samples inside the clip window", () => {
  it("keeps every channel and the rate, the count is the window's, start and end exact to the sample", () => {
    const track = ramp(2, 20 * RATE), cut = cutChannels(track, 12, 8);
    expect(cut).toHaveLength(2);
    expect(cut.map(c => c.length)).toEqual([8000, 8000]);
    for (const c of [0, 1]) {
      expect(cut[c][0]).toBe(track.data[c][12000]);
      expect(cut[c][7999]).toBe(track.data[c][19999]);
    }
  });
  it("rounds a start between samples as the guide's audio.wav does", () => {
    expect(sampleRange(44100, 2.093, 8)).toEqual({ from: Math.round(2.093 * 44100), count: 352800 });
    const track = ramp(1, 5000), cut = cutChannels(track, 1.0004, 2);
    expect(cut[0][0]).toBe(track.data[0][1000]);
    expect(cutChannels(track, 1.0006, 2)[0][0]).toBe(track.data[0][1001]);
  });
  it("past the track's end it is silence, never a shorter cut", () => {
    const cut = cutChannels(ramp(1, 3000), 2, 2);
    expect(cut[0].length).toBe(2000);
    expect(cut[0][999]).toBeGreaterThan(0);
    expect(cut[0][1000]).toBe(0);
  });
});

describe("Export: the window as a WAV file", () => {
  it("is 16-bit PCM at the track's rate, every channel, the window's samples from its first to its last", () => {
    const track = ramp(2, 20 * RATE), wav = readWav(windowWav(track, 12, 8));
    expect(wav).toMatchObject({ riff: "RIFF", channels: 2, rate: RATE, bits: 16, n: 8000 });
    for (const c of [0, 1]) {
      expect(wav.at(c, 0)).toBe(int16(track.data[c][12000]));
      expect(wav.at(c, 7999)).toBe(int16(track.data[c][19999]));
    }
  });
  it("the file of a cut and of the window in the whole track are the same bytes (Export works before or after Slice)", () => {
    const track = ramp(2, 20 * RATE), cut = cutChannels(track, 12, 8);
    const after = windowWav({ numberOfChannels: 2, sampleRate: RATE, getChannelData: c => cut[c] }, 0, 8);
    expect(after).toEqual(windowWav(track, 12, 8));
  });
  it("loaded back, a drum track's window has the same length and tempo", () => {
    const rate = 44100, drums = synthDrums(patternTimes(120, 8, 0.1), 16.6), whole = analyseSamples([drums], rate);
    const start = whole.estimatedOffsetSeconds + 4 * 60 / 120;
    const wav = readWav(windowWav({ numberOfChannels: 1, sampleRate: rate, getChannelData: () => drums }, start, 8));
    const back = Float32Array.from({ length: wav.n }, (_, i) => wav.at(0, i) / 32768);
    const again = analyseSamples([back], rate);
    expect(again.lengthSeconds).toBeCloseTo(8, 6);
    expect(again.estimatedBpm).toBe(whole.estimatedBpm);
  });
});

describe("Slice and Export: names and the state on the cut", () => {
  it("names say the range in the original's seconds", () => {
    expect(slicedName("song.wav", 12, 20)).toBe("song.wav (12.0–20.0 s)");
    expect(exportName("song.wav", 12, 20)).toBe("song 12.0-20.0s.wav");
    expect(exportName("generated-straight-120", 2.093, 10.093)).toBe("generated-straight-120 2.1-10.1s.wav");
  });
  it("markers and switched-off hits move with the music; those outside the cut go; the lanes stay", () => {
    const s = { ...exampleState(0), slice: 12, muted: [5, 13.25, 19.5], markers: [{ band: "low" as const, seconds: 12.5 }, { band: "mid" as const, seconds: 25 }] };
    const out = moveOntoCut(s, 12, 8);
    expect(out.slice).toBeUndefined();
    expect(out.muted).toEqual([1.25, 7.5]);
    expect(out.markers).toEqual([{ band: "low", seconds: 0.5 }]);
    expect(out.cameraLane).toEqual(s.cameraLane);
    expect(out.character).toEqual(s.character);
    expect(moveOntoCut({ ...s, markers: [{ band: "low", seconds: 30 }] }, 12, 8).markers).toBeUndefined();
  });
});
