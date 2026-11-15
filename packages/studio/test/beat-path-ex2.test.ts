/**
 * Example 2 (examples/scripts/beat-path-ex2-runner.txt): one street guide for any travelling subject (a runner, a
 * skater, a forklift: only the shot lines change), on the owner's 11.04 s drum and bass loop under a 12 s clip. Three
 * camera blocks, each starting on a hit (the first kick, the snares at beats 9 and 21) with no stations inside them: low
 * and close on the feet, pulling back alongside as the subject passes behind the blocks, rising to a high three-quarter
 * view. Its lanes end where the page fits them (clipBeats), so loading the music moves no edge, and frame 0 is the CLI's.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyScript, cameraAtFrame, clipBeats, describeRecipe, planCamera } from "@motion-studio/core";
import { EXAMPLES, exampleState } from "../src/beat-path/examples";
import { baseFor, beatPathRecipe } from "../src/beat-path/recipe-map";
import { BLANK_STATE, fitLanes, fromScript, toScript } from "../src/beat-path/script";
import { buildSetup, readSetup } from "../src/beat-path/setup-file";
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
    // The core lands it there, so the CLI and MCP (applyScript on the same script) build the same recipe.
    expect(applyScript(baseFor(12, info), { script: toScript(exampleState(i)) })).toEqual(r);
    // With hits but none in its row: the same, and describe names the anchor that fell back.
    const bands = { hopSeconds: 0.01, low: [{ seconds: 1, strength: 0.4 }], mid: [], high: [], peaks: [] } as never;
    const withHits = beatPathRecipe(exampleState(i), info, { bands });
    expect(withHits.reactive?.markers).toEqual(r.reactive?.markers);
    expect(applyScript(baseFor(12, info), { script: toScript(exampleState(i)) }, { bands })).toEqual(withHits);
    expect(describeRecipe(withHits)).toMatch(/jump@19 \(@kick 1: no such hit in its row, on the row's start\)/);
  });
  it("a hop keeps the anchor it was written with: @beat, @snare N print back as read", () => {
    for (const a of ["@beat 19.5", "@snare 2"]) {
      const text = toScript(exampleState(i)).replace("continue, jump @kick 1", `continue, jump ${a}`);
      const s = fromScript(text, BLANK_STATE, { bpm: 174, offsetSeconds: 0 }).state;
      expect(s.character.find(b => b.word === "hop")).toBeDefined();
      expect(toScript(s)).toMatch(new RegExp(`^beats 19-21 \\| action: continue, jump ${a} \\|`, "m"));
    }
    expect(fromScript(toScript(exampleState(i)), BLANK_STATE, { bpm: 174, offsetSeconds: 0 }).state.character.find(b => b.word === "hop")!.at).toBeUndefined();
    const s = fromScript(toScript(exampleState(i)).replace("jump @kick 1", "jump @snare 2"), BLANK_STATE, { bpm: 174, offsetSeconds: 0 }).state;
    const read = readSetup(JSON.stringify(buildSetup(s, info)));
    expect(read.ok && read.state.character.find(b => b.word === "hop")!.at).toEqual({ band: "snare", n: 2 });
  });
  it("a hop's @beat outside its block lands inside it, with a note, the same in a script and a setup file", () => {
    // The hop block runs 19-35 (the walk carries on through it): a beat past 35 lands on its last half beat.
    const text = toScript(exampleState(i)).replace("continue, jump @kick 1", "continue, jump @beat 40");
    const read = fromScript(text, BLANK_STATE, { bpm: 174, offsetSeconds: 0 });
    expect(read.state.character.find(b => b.word === "hop")!.at).toEqual({ band: "beat", n: 15.5 });
    expect(read.notes.join(" ")).toMatch(/the hop at beats 19-35: @beat 40 is outside it, so it lands on beat 34\.5/);
    expect(toScript(read.state)).toMatch(/continue, jump @beat 34\.5 \|/);
    expect(fromScript(text.replace("@beat 40", "@beat 25"), BLANK_STATE, { bpm: 174, offsetSeconds: 0 }).notes.join(" ")).not.toMatch(/outside/);
    const hop = (at: unknown) => {
      const st = structuredClone(exampleState(i)) as unknown as { character: { word: string; at?: unknown }[] };
      st.character.find(b => b.word === "hop")!.at = at;
      return readSetup(JSON.stringify(buildSetup(st as never, info)));
    };
    for (const [at, n] of [[{ band: "beat", n: 30 }, 15.5], [{ band: "beat", n: -2 }, 0]] as const) {
      const r = hop(at);
      expect(r.ok && r.state.character.find(b => b.word === "hop")!.at).toEqual({ band: "beat", n });
      expect(r.ok && r.notes.join(" ")).toMatch(/1 hop on a beat outside the block moved inside it/);
    }
    const bad = hop({ band: "kick", n: 0 });
    expect(bad.ok && bad.state.character.find(b => b.word === "hop")!.at).toBeUndefined();
    expect(bad.ok && bad.notes.join(" ")).toMatch(/1 unreadable hop anchor dropped/);
    // A hop index past 64 (or not whole) is dropped with a note, as a setup file drops it; the hop lands on the first kick.
    const far = fromScript(text.replace("@beat 40", "@kick 1000"), BLANK_STATE, { bpm: 174, offsetSeconds: 0 });
    expect(far.state.character.find(b => b.word === "hop")!.at).toBeUndefined();
    expect(far.notes.join(" ")).toMatch(/@kick 1000: count from 1 to 64/);
    // A setup block whose edges are joined shorter: its @beat is held inside the joined block.
    const st = structuredClone(exampleState(i)) as unknown as { character: { from: number; to: number; word: string; at?: unknown }[] };
    st.character = [{ from: 0, to: 22, word: "glide" }, { from: 19, to: 23, word: "hop", at: { band: "beat", n: 1.8 } }, { from: 23, to: 35, word: "hover" }];
    const joined = readSetup(JSON.stringify(buildSetup(st as never, info)));
    expect(joined.ok && joined.state.character.find(b => b.word === "hop")).toMatchObject({ from: 22, to: 23, at: { band: "beat", n: 0.5 } });
    expect(joined.ok && joined.notes.join(" ")).toMatch(/1 hop on a beat outside the block moved inside it/);
    // Refitting the lanes scales the hop's beat with its block, so it stays where it was in it.
    const fitted = fitLanes(read.state, 70).character.find(b => b.word === "hop")!;
    expect(fitted.at).toEqual({ band: "beat", n: 31 });
    // A block that shrinks under its @beat prints the hop inside it.
    const shrunk = structuredClone(read.state), h = shrunk.character.find(b => b.word === "hop")!;
    h.to = 21; shrunk.character.push({ from: 21, to: 35, word: "hover" });
    expect(toScript(shrunk)).toMatch(/continue, jump @beat 20\.5 \|/);
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
