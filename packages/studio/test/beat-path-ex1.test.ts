/**
 * Example 1 (examples/scripts/beat-path-ex1-flyer.txt): the ship down the avenue on the owner's loop,
 * a 13.488 s music file under a 14 s clip, in three moves (isometric, right behind as it turns left
 * into a gap, the top pushing in as it lands), with no hold on each hit (no camera or travel lock).
 * Its lanes end where the page fits them (clipBeats), so loading the music moves no edge off its
 * hit, and frame 0 is the CLI render's.
 */
import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cameraAtFrame, clipBeats, planCamera } from "@motion-studio/core";
import { EXAMPLES, exampleState } from "../src/beat-path/examples";
import { beatPathRecipe } from "../src/beat-path/recipe-map";
import { BLANK_STATE, fitLanes, fromScript, toScript } from "../src/beat-path/script";
import { EXAMPLE_TRACKS } from "../src/beat-path/tracks";

const i = EXAMPLES.findIndex(e => e.id === "flyer");
const t = EXAMPLE_TRACKS.flyer;
const info = { name: t.name, licence: t.licence, bpm: t.grid!.bpm, offsetSeconds: t.grid!.offsetSeconds, lengthSeconds: 13.488 };

describe("Example 1: the ship on the owner's loop", () => {
  it("is the first example, on its own music file and its given beat grid", () => {
    expect(i).toBe(0);
    const s = exampleState(i);
    expect(s.track).toBe("flyer");
    expect(s.clip).toBe(14);
    expect(t.file).toBe(`tracks/${t.name}`);
    expect(t.grid).toEqual({ bpm: 107.5, offsetSeconds: 0 });
    expect(t.licence).toBe("the owner's track (glitchcandies, made with Suno), used with permission");
    const path = new URL(`../public/${t.file}`, import.meta.url);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeLessThan(700_000);
  });
  it("the track comment names the file, and reads back to Example 1", () => {
    const text = toScript(exampleState(i));
    expect(text).toMatch(/^# track: file neon-rain-loop\.mp3$/m);
    expect(fromScript(text, BLANK_STATE).state.track).toBe("flyer");
    expect(fromScript("# track: laidback 6 bars\nbeats 0-4 | action: rest\n", BLANK_STATE).state.track).toBe("drone");
    expect(fromScript("# track: file other.mp3\nbeats 0-4 | action: rest\n", BLANK_STATE).state.track).toBeUndefined();
  });
  it("its lanes already end where the page fits a 14 s clip, so loading the music moves no edge", () => {
    const s = exampleState(i), beats = clipBeats(s.clip, info.bpm);
    expect(beats).toBe(26);
    expect(s.cameraLane.at(-1)!.to).toBe(beats);
    expect(fitLanes(s, beats)).toEqual(s);
    expect(s.cameraLane.map(b => b.from)).toEqual([0, 6, 7, 8, 16, 18]);   // 6–7: one zoom in on the kick at beat 6.15
    expect(s.character.map(b => [b.from, b.to, b.word])).toEqual([[0, 26, "glide"]]);
    expect(s.cameraLane.every(b => b.shot === "-")).toBe(true);
  });
  it("no hold on each hit: the page carries no camera or travel lock, and prints none back", () => {
    const s = exampleState(i);
    expect(s.camLock.lock).toBe("off");
    expect(s.charLock.lock).toBe("off");
    expect(toScript(s)).not.toMatch(/\block (kick|snare|hat|beat)\b/);
    const r = beatPathRecipe(s, info);
    expect(r.travelLock).toBeUndefined();
    expect(r.camera!.segments.every(g => !g.lock)).toBe(true);
  });
  it("three moves: isometric, right behind, the top; frame 0 as the CLI render has it", () => {
    const s = exampleState(i);
    expect(s.rig).toEqual({ distance: 7, height: 5, fov: 50, yaw: 145 });
    const r = beatPathRecipe(s, info);
    expect(r.camera!.segments.map(g => g.modes.join("+"))).toEqual(["threeQuarter", "threeQuarter", "threeQuarter", "chase", "top", "top+pushIn"]);
    // out/ex5/final/camera.json track[0].position: behind the ship's left, at the 8 m ceiling.
    const c = cameraAtFrame(planCamera(r), 0);
    expect(c.position[0]).toBeCloseTo(-21.234, 1);
    expect(c.position[1]).toBeCloseTo(8, 1);
    expect(c.position[2]).toBeCloseTo(-4.015, 1);
  });
});
