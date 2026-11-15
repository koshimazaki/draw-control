/** An example sliced, switched away from and back (slot-music.ts): it comes back with its cut, so its markers stay on their hits. */
import { describe, expect, it } from "vitest";
import { musicFor, type Cut } from "../src/beat-path/slot-music";
import { moveOntoCut } from "../src/beat-path/track-cut";
import { BLANK_STATE, type BeatPathState } from "../src/beat-path/script";

type K = "flyer" | "runner" | "car" | "drone";
const example: BeatPathState = { ...structuredClone(BLANK_STATE), track: "flyer", slice: 4.1, clip: 8, muted: [4.6, 9.1], markers: [{ band: "low", seconds: 6.1 }] };
const cut: Cut<string, K> = { track: "generated-straight-120.wav (4.1–12.1 s)", licence: "MIT", grid: { bpm: 120, offsetSeconds: 0 }, from: "flyer" };

describe("An example's music when it shows again", () => {
  it("sliced: the cut, on the cut's beat grid, and the saved state's times are the cut's", () => {
    const saved = moveOntoCut(example, 4.1, 8);
    const music = musicFor<string, K>(saved, cut);
    expect(music).toEqual({ kind: "cut", cut });
    // The times the state carries are seconds into the cut (the whole music would put them 4.1 s early).
    expect(saved.muted).toEqual([0.5, 5]);
    expect(saved.markers).toEqual([{ band: "low", seconds: 2 }]);
    expect(saved.slice).toBeUndefined();
  });
  it("never sliced: the example's own music", () => {
    expect(musicFor<string, K>(example, undefined)).toEqual({ kind: "example", id: "flyer" });
  });
  it("a cut of another example's music (a script loaded since) is not brought back", () => {
    expect(musicFor<string, K>({ ...example, track: "runner" }, cut)).toEqual({ kind: "example", id: "runner" });
  });
  it("Your own (no example music) keeps the loaded track, as before", () => {
    expect(musicFor<string, K>({ ...example, track: undefined }, undefined)).toEqual({ kind: "keep" });
    expect(musicFor<string, K>({ ...example, track: undefined }, cut)).toEqual({ kind: "keep" });
  });
});
