/**
 * Example 2 (examples/scripts/beat-path-ex2-runner.txt): one street guide for any travelling subject (a runner, a
 * skater, a forklift: only the shot lines change), on the owner's 11.04 s drum and bass loop under a 12 s clip. Three
 * camera blocks, each starting on a hit (the first kick, the snares at beats 9 and 21) with no stations inside them: low
 * and close on the feet, pulling back alongside as the subject passes behind the blocks, rising to a high three-quarter
 * view. Its lanes end where the page fits them (clipBeats), so loading the music moves no edge, and frame 0 is the CLI's.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cameraAtFrame, clipBeats, planCamera } from "@motion-studio/core";
import { EXAMPLES, exampleState } from "../src/beat-path/examples";
import { beatPathRecipe, hopOnBeat } from "../src/beat-path/recipe-map";
import { BLANK_STATE, fitLanes, fromScript, toScript } from "../src/beat-path/script";
import { TRACKS } from "../src/beat-path/tracks";

const i = EXAMPLES.findIndex(e => e.id === "runner");
const t = TRACKS.runner;
const info = { name: t.name, licence: t.licence, bpm: t.grid!.bpm, offsetSeconds: t.grid!.offsetSeconds, lengthSeconds: 11.04 };

describe("Example 2: one street guide for any subject", () => {
  it("is the second example, on the owner's drum and bass file and its 174 BPM grid", () => {
    expect(i).toBe(1);
    const s = exampleState(i);
    expect(s.track).toBe("runner");
    expect(s.clip).toBe(12);
    expect(t.file).toBe(`tracks/${t.name}`);
    expect(t.grid).toEqual({ bpm: 174, offsetSeconds: 0 });
    expect(t.licence).toBe("the owner's track, used with permission");
    const path = new URL(`../public/${t.file}`, import.meta.url);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeLessThan(700_000);
    expect(toScript(s)).toMatch(/^# track: file drum-n-bass\.mp3$/m);
  });
  it("its lanes end where the page fits a 12 s clip at 174 BPM, so loading the music moves no edge", () => {
    const s = exampleState(i), beats = clipBeats(s.clip, info.bpm);
    expect(beats).toBe(35);
    expect(s.cameraLane.at(-1)!.to).toBe(beats);
    expect(fitLanes(s, beats)).toEqual(s);
    expect(s.cameraLane.map(b => b.from)).toEqual([0, 9, 21]);
    expect(s.character.map(b => [b.from, b.to, b.word])).toEqual([[0, 19, "glide"], [19, 35, "hop"]]);
  });
  it("three moves with no stations: the detail, alongside through the blocks, the high view; frame 0 as the CLI has it", () => {
    const s = exampleState(i), r = beatPathRecipe(s, info);
    expect(r.camera!.segments.map(g => g.modes.join("+"))).toEqual(["side", "side+pullOut", "threeQuarter+rise"]);
    expect(r.camera!.segments.every(g => !g.lock)).toBe(true);
    expect(r.travelLock).toBeUndefined();
    expect(r.camera!.segments.map(g => g.follow?.aim)).toEqual([0.3, 1, 1]);
    expect(r.figure?.shape).toBe("runner");
    expect(r.sceneryBoxes).toHaveLength(8);
    // out/ex2/final/camera.json track[0].position: beside the subject's left at shoe height.
    const c = cameraAtFrame(planCamera(r), 0);
    expect(c.position[0]).toBeCloseTo(-24, 1);
    expect(c.position[1]).toBeCloseTo(0.3, 1);
    expect(c.position[2]).toBeCloseTo(-2.5, 1);
  });
  it("one hop on the kick at 6.64 s (beat 19.24), in the gap between the first two blocks, while the travel runs on", () => {
    const s = exampleState(i), r = beatPathRecipe(s, info, { bands: { hopSeconds: 0.01, low: [{ seconds: 6.117, strength: 0.41 }, { seconds: 6.636, strength: 0.36 }, { seconds: 6.972, strength: 0.39 }], mid: [], high: [], peaks: [] } as never });
    expect(toScript(s)).toMatch(/^beats 19-21 \| action: continue, jump @kick 1 \| camera: continue$/m);
    expect(r.reactive?.markers).toEqual([{ seconds: 6.636, accent: "jump", source: "manual" }]);
    expect(r.moves[0].lengthBeats).toBe(35);   // the walk runs the whole clip: the hop does not end the travel
    const x = -24 + 48 * 6.636 / (35 * 60 / 174);   // where steady travel puts it on the kick: between the blocks at x -3..0 and 3.5..6.5
    expect(x).toBeGreaterThan(0.5); expect(x).toBeLessThan(3);
  });
  it("with no kick to land on (no track analysed yet), the hop lands on its row's start and the shot still builds", () => {
    const r = beatPathRecipe(exampleState(i), info);
    expect(r.reactive?.markers?.map(m => [Math.round(m.seconds * 1000) / 1000, m.accent])).toEqual([[Math.round(19 * 60 / 174 * 1000) / 1000, "jump"]]);
    expect(hopOnBeat("beats 19-21 | action: continue, jump @kick 1 | camera: continue")).toBe("beats 19-21 | action: continue, jump @beat 19 | camera: continue");
  });
  it("the page prints the script back to the same shot", () => {
    const s = exampleState(i);
    expect(fromScript(toScript(s), BLANK_STATE, { bpm: 174, offsetSeconds: 0 }).state).toEqual(s);
  });
  it("carries the skater and the forklift as ready-to-paste shot lines", () => {
    const text = readFileSync(new URL("../../../examples/scripts/beat-path-ex2-runner.txt", import.meta.url), "utf8");
    for (const who of ["skateboarder", "forklift"]) expect(text).toMatch(new RegExp(`^#\\s+shot subject: [^\\n]*${who}`, "m"));
    expect(exampleState(i).shot.subject).toMatch(/running/);
  });
});
