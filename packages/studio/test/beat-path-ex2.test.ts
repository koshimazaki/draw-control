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
import { beatPathRecipe } from "../src/beat-path/recipe-map";
import { BLANK_STATE, fitLanes, fromScript, toScript } from "../src/beat-path/script";
import { EXAMPLE_TRACKS } from "../src/beat-path/tracks";

const i = EXAMPLES.findIndex(e => e.id === "runner");
const t = EXAMPLE_TRACKS.runner;
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
    expect(s.character.map(b => [b.from, b.to])).toEqual([[0, 35]]);
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
