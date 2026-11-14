/** Cutting a lane on the beat (lane-cuts.ts): at a point, on every hit, every N beats, and Moves on hits cycling. */
import { describe, expect, it } from "vitest";
import { blockAt, everyBeats, movesOnHits, parseMoves, splitBlockAt } from "../src/beat-path/lane-cuts";
import type { Block, CameraWord } from "../src/beat-path/script";

const lane: Block<CameraWord>[] = [{ from: 0, to: 8, word: "orbit" }, { from: 8, to: 17, word: "path" }];
describe("Lane cuts", () => {
  it("splits a block at the cuts that fit, each part keeping its move", () => {
    expect(splitBlockAt(lane, 0, [2.75])).toEqual([{ from: 0, to: 2.75, word: "orbit" }, { from: 2.75, to: 8, word: "orbit" }, lane[1]]);
    expect(splitBlockAt(lane, 0, [0.5])).toBeNull();                 // under a beat from the edge
    expect(splitBlockAt(lane, 1, [9, 9.5, 12, 16.5])!.map(b => [b.from, b.to])).toEqual([[0, 8], [8, 9], [9, 12], [12, 17]]);
  });
  it("every N beats inside a block", () => {
    expect(everyBeats(8, 17, 4)).toEqual([12, 16]);
    expect(everyBeats(0, 8, 2)).toEqual([2, 4, 6]);
  });
  it("Moves on hits cuts the whole lane at each hit and cycles the moves", () => {
    const out = movesOnHits(16, [2, 2.5, 4, 6, 8, 10.25, 12, 14], ["orbit", "top", "push"]);
    expect(out.map(b => [b.from, b.to, b.word])).toEqual([[0, 2, "orbit"], [2, 4, "top"], [4, 6, "push"], [6, 8, "orbit"], [8, 10.25, "top"], [10.25, 12, "push"], [12, 14, "orbit"], [14, 16, "top"]]);
  });
  it("reads plain move names, and says which word is not one", () => {
    expect(parseMoves("Orbit, top → push in then my path")).toEqual({ words: ["orbit", "top", "push", "path"] });
    expect(parseMoves("orbit, zoom")).toEqual({ error: expect.stringContaining('"zoom"') });
  });
  it("finds the block at a beat", () => {
    expect(blockAt(lane, 8)).toBe(1); expect(blockAt(lane, 17)).toBe(1); expect(blockAt(lane, 3)).toBe(0);
  });
});
