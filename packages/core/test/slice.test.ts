/**
 * Slicing a clip out of a longer track (round 9): the window's start snaps to the track's beats
 * and stays inside it; "slice: 42.5s" moves beat 0 there (hits, beats.json and audio follow);
 * markers added by hand join the hits every lock lands on; both lines round-trip.
 */
import { describe, expect, it } from "vitest";
import { analyseSamples, applyScript, beatPathBase, buildDrive, printScript, secondsAtBeat } from "@motion-studio/core";
import { hitBands, lockHits, patternTimes, sliceStart, synthDrums } from "@motion-studio/core/internal";

const f = analyseSamples([synthDrums(patternTimes(120, 40, 0.1), 0.1 + 40 * 2 + 0.5)], 44100);   // 80.6 s at 120 BPM
const drive = buildDrive(f, 24, Math.ceil(f.lengthSeconds * 24) + 1), ctx = { drive, bands: drive.bands };
const base = () => beatPathBase({ seconds: 8, bpm: 120, offsetSeconds: f.estimatedOffsetSeconds });
const ROW = "beats 0-17 | action: rest | camera: follow behind lock kick 1 hold | shot: wide";

describe("slice start", () => {
  const track = { bpm: 120, firstBeat: 0.1, lengthSeconds: 80.6 };
  it("snaps to the nearest beat and stays inside the track", () => {
    expect(sliceStart(42.37, track, 8)).toBeCloseTo(42.6, 6);
    expect(sliceStart(42.37, track, 8, false)).toBeCloseTo(42.37, 6);
    expect(sliceStart(500, track, 8)).toBeLessThanOrEqual(80.6 - 8);
    expect(sliceStart(-3, track, 8)).toBeCloseTo(0.1, 6);
    expect(sliceStart(75, track, 10) + 10).toBeLessThanOrEqual(80.6);
  });
});

describe("slice and markers in the script", () => {
  it("moves beat 0 to the slice; its hits are the slice's; it round-trips", () => {
    const r = applyScript(base(), { script: `slice: 42.6s\n${ROW}` }, ctx);
    expect(r.slice).toBe(42.6);
    expect(r.beatGrid.offsetSeconds).toBe(42.6);
    expect(secondsAtBeat(r.beatGrid, 0)).toBe(42.6);
    const hits = lockHits(r.beatGrid, hitBands(drive.bands, r), "kick", 0, 4);
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every(b => b >= 0 && b <= 4)).toBe(true);
    expect(printScript(r)).toMatch(/^slice: 42\.6s$/m);
    expect(applyScript(base(), { script: printScript(r) }, ctx)).toEqual(r);
  });
  it("markers join the hits the locks land on, and read back", () => {
    const r = applyScript(base(), { script: `slice: 42.6s\nmarkers: kick 43.85 snare 44.1 hat 44.3 44.35\n${ROW}` }, ctx);
    expect(r.addedHits).toEqual([{ band: "low", seconds: 43.85 }, { band: "mid", seconds: 44.1 }, { band: "high", seconds: 44.3 }, { band: "high", seconds: 44.35 }]);
    const kicks = lockHits(r.beatGrid, hitBands(drive.bands, r), "kick", 0, 17);
    expect(kicks.some(b => Math.abs(secondsAtBeat(r.beatGrid, b) - 43.85) < 1e-6)).toBe(true);
    expect(printScript(r)).toMatch(/^markers: kick 43\.85 snare 44\.1 hat 44\.3 44\.35$/m);
    expect(applyScript(base(), { script: printScript(r) }, ctx)).toEqual(r);
    expect(() => applyScript(base(), { script: `markers: 3.2\n${ROW}` }, ctx)).toThrow(/markers reads/);
  });
});
