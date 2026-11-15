/**
 * "Next move on each hit" (camLock.advance) prints "@kick 1" on every camera block after the first.
 * Example 1's one-beat accent blocks (beats 6–7 zoom in, 7–8 ease out) sit between two kicks, so
 * 7–8 holds none: that block starts on its row instead of failing the whole shot. With no track
 * analysed the anchor still refuses (the page says the shot is not built until the track loads).
 */
import { describe, expect, it } from "vitest";
import { analyseSamples, applyScript, beatPathBase, buildDrive, onsetBeats } from "@motion-studio/core";
import { synthDrums } from "@motion-studio/core/internal";
import { TRACKS } from "../src/beat-path/tracks";
import { exampleState } from "../src/beat-path/examples";
import { beatPathRecipe } from "../src/beat-path/recipe-map";
import { toScript } from "../src/beat-path/script";

const t = TRACKS.flyer, beat = 60 / t.grid!.bpm;
// Example 1's music hits, as the page finds them in neon-rain-loop.mp3: a kick every two beats from 2.31 s
// (2.31, 3.43, 4.56 s ...: beats 4.14, 6.15, 8.17), a snare on the beats between.
const kicks = Array.from({ length: 10 }, (_, k) => 2.31 + k * 2 * beat), snares = kicks.map(s => s - beat).filter(s => s > 0);
const f = analyseSamples([synthDrums({ kicks, snares, hats: [] }, 13.488)], 44100);
const drive = buildDrive(f, 24, Math.ceil(f.lengthSeconds * 24) + 1), bands = drive.bands;
const info = { name: t.name, licence: t.licence, bpm: t.grid!.bpm, offsetSeconds: t.grid!.offsetSeconds, lengthSeconds: 13.488 };
const locked = { ...exampleState(0), camLock: { lock: "kick" as const, strength: 1, onHit: "hold" as const, advance: true } };

describe("a camera block that holds no hit of its anchor", () => {
  it("Example 1 has no kick in beats 7–8, and the script anchors that block on one", () => {
    const r = beatPathRecipe(exampleState(0), info, { drive, bands });
    const k = onsetBeats(r, bands, "kick");
    expect(k.some(b => b > 6 && b < 7)).toBe(true);
    expect(k.some(b => b >= 7 && b < 8)).toBe(false);
    expect(toScript(locked)).toMatch(/^beats 7-8 .*@kick 1/m);
  });
  it("locked to kick with next move on each hit, Example 1 builds; 7–8 starts on its row, the others on their kick", () => {
    const r = beatPathRecipe(locked, info, { drive, bands });
    const starts = r.camera!.segments.map(g => g.fromBeat);
    expect(starts).toContain(7);
    const k = onsetBeats(r, bands, "kick");
    for (const from of [6, 8, 16, 18]) {
      const first = k.find(b => b >= from - 1e-6)!;
      expect(starts.some(s => Math.abs(s - first) < 1e-3)).toBe(true);
    }
  });
  it("still refuses with no track analysed, and when the row has fewer hits than the index", () => {
    const base = beatPathBase({ seconds: 8 });
    expect(() => applyScript(base, { script: "beats 0-4 | camera: top\nbeats 4-8 | camera: orbit 30 @kick 1\n" })).toThrow(/no kicks in beats 4-8/);
    const g = analyseSamples([synthDrums({ kicks: [2.1], snares: [], hats: [] }, 8)], 44100), d = buildDrive(g, 24, 8 * 24 + 1);
    expect(() => applyScript(base, { script: "beats 0-4 | camera: top\nbeats 4-8 | camera: orbit 30 @kick 2\n" }, { drive: d, bands: d.bands })).toThrow(/@kick 2/);
  });
});
