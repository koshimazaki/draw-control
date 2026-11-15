import { describe, expect, it } from "vitest";
import { applyScript, beatPathBase, timedLines, timedPrompt, formatLine, hitAt, isTimedLine, validateRecipe, SHOT_LIMITS, type BandAnalysis } from "../src/index";
import { clipSeconds, MAX_TIMED_LINES } from "../src/timed-prompt";

/** An 8 s Draw Control clip at 120 BPM (first beat at 0.25 s) with the given shot script rows. */
const shot = (rows: string) => applyScript(beatPathBase({ seconds: 8, bpm: 120, offsetSeconds: 0.25 }), { script: rows });
const bands = (b: Partial<Record<"low" | "mid" | "high", number[]>>): BandAnalysis => ({
  hopSeconds: 0.01, peaks: [],
  low: (b.low ?? []).map(seconds => ({ seconds, strength: 1 })), mid: (b.mid ?? []).map(seconds => ({ seconds, strength: 1 })), high: (b.high ?? []).map(seconds => ({ seconds, strength: 1 })),
});
const TWO = "beats 0-5 | action: glide on path (-10,0) (10,0) | camera: follow behind | shot: wide\nbeats 5-17 | action: continue | camera: top | shot: top\n";

describe("the timed prompt (timed-prompt.ts)", () => {
  it("one line per camera block, its edges in seconds from the clip's start, to one decimal", () => {
    const lines = timedLines(shot(TWO));
    expect(lines.map(l => [l.from, l.to])).toEqual([[0, 2.5], [2.5, 8]]);
    expect(lines[0].text).toBe("wide shot; the camera follows from behind as it glides along its path");
    expect(lines[1].text).toBe("top view, looking straight down on it");
  });
  it("the clip defaults to the whole second the recipe was made for; seconds overrides it", () => {
    const r = shot(TWO);
    expect(clipSeconds(r)).toBe(8);
    expect(timedLines(r, { seconds: 4 }).map(l => [l.from, l.to])).toEqual([[0, 2.5], [2.5, 4]]);
  });
  it("the clip estimate inverts clipBeats for a glider recipe, and is a plain recipe's own length", () => {
    for (const [s, bpm] of [[8, 97], [8, 120], [9, 120], [5, 140], [30, 100], [3, 61]]) expect(clipSeconds(beatPathBase({ seconds: s, bpm }))).toBe(s);
    const plain = validateRecipe({ ...beatPathBase({ seconds: 8, bpm: 120 }), durationBeats: 17, character: { kind: "mannequin", name: "m", licence: "MIT" } });
    expect(clipSeconds(plain)).toBe(8.5);
  });
  it("past the cap, the last line carries every block left, each with its start", () => {
    const rows = Array.from({ length: 16 }, (_, i) => `beats ${i}-${i + 1} | action: ${i ? "continue" : "glide on path (-10,0) (10,0)"} | camera: ${i % 2 ? "top" : "orbit 20"} | shot: -`).join("\n") + "\nbeats 16-17 | action: continue | camera: top | shot: -\n";
    const lines = timedLines(shot(rows));
    expect(lines).toHaveLength(MAX_TIMED_LINES);
    expect(lines.at(-1)!.to).toBe(8);
    expect(lines.at(-1)!.text).toMatch(/; then from 6\.0 s, on the downbeat, /);
    expect(lines.at(-1)!.text.match(/; then from/g)).toHaveLength(16 - MAX_TIMED_LINES);   // 16 blocks in the 8 s clip (beat 16 is its end)
  });
  it("after a slice the bar phase is unknown: an edge on a bar says on the beat", () => {
    expect(hitAt(validateRecipe({ ...shot(TWO), slice: 3.25 }), 4)).toBe("beat");
  });
  it("a block's start names the hit on its edge (analysed, within 0.1 s and a quarter beat), else the downbeat or the beat", () => {
    const r = shot(TWO);
    // Beat 5 sits at 0.25 + 2.5 = 2.75 s of the track.
    expect(hitAt(r, 5, bands({ mid: [2.78] }))).toBe("snare");
    expect(hitAt(r, 5, bands({ low: [2.75], mid: [2.79] }))).toBe("kick");
    expect(hitAt(r, 5, bands({ low: [2.83], mid: [2.76] }))).toBe("kick");   // both in reach: the kick names it
    expect(hitAt(r, 5, bands({ mid: [2.84] }))).toBe("snare");
    expect(hitAt(r, 5, bands({ mid: [2.9] }))).toBe("beat");
    expect(hitAt(r, 4)).toBe("downbeat");
    expect(hitAt(r, 4.5)).toBeUndefined();
    expect(hitAt(r, 0, bands({ low: [0.25] }))).toBeUndefined();
    expect(timedPrompt(r, { bands: bands({ mid: [2.75] }) }).split("\n")[1]).toBe("2.5–8.0 s, on the snare: top view, looking straight down on it");
  });
  it("hand-added hits count, muted ones do not", () => {
    const r = validateRecipe({ ...shot(TWO), addedHits: [{ band: "high", seconds: 2.75 }] });
    expect(hitAt(r, 5)).toBe("hat");
    const muted = validateRecipe({ ...shot(TWO), mutedHits: [2.75] });
    expect(hitAt(muted, 5, bands({ mid: [2.75] }))).toBe("beat");
  });
  it("follow offsets, a lens and the lock are said in plain words", () => {
    const r = shot("beats 0-8 | action: glide on path (-10,0) (10,0) | camera: follow side distance 3m height 0.6m fov 100 lock snare 1 hold | shot: wide\nbeats 8-17 | action: continue | camera: orbit 90 | shot: -\n");
    const [a, b] = timedLines(r);
    expect(a.text).toBe("wide shot; the camera tracks alongside it, about 3 m away and 0.6 m up, on a very wide lens as it glides along its path, its move pausing on each snare");
    expect(b.text).toMatch(/^the camera circles (anti)?clockwise around it$/);
  });
  it("turns along the path, left and right, and a stop before the clip ends", () => {
    // East, then north (-z: up on the map, a left turn), then east again (a right turn); travel ends at beat 10.
    const r = shot("beats 0-10 | action: glide on path (0,0) (6,0) (6,-6) (12,-6) | camera: follow behind | shot: wide\nbeats 10-17 | action: rest | camera: continue\n");
    const text = timedPrompt(r);
    expect(text).toMatch(/turns left/);
    expect(text).toMatch(/turns right/);
    expect(text.indexOf("turns left")).toBeLessThan(text.indexOf("turns right"));
  });
  it("brackets style writes Seedance's windows; plain writes en-dash seconds; both read as timed lines", () => {
    const l = { from: 2.5, to: 8, on: "kick" as const, text: "top view" };
    expect(formatLine(l, "brackets")).toBe("[2.5-8s] on the kick: top view");
    expect(formatLine(l)).toBe("2.5–8.0 s, on the kick: top view");
    expect(formatLine({ from: 0, to: 2.5, text: "x" })).toBe("0.0–2.5 s: x");
    expect(isTimedLine(formatLine(l))).toBe(true);
    expect(isTimedLine(formatLine(l, "brackets"))).toBe(true);
    expect(isTimedLine("it flies down the avenue")).toBe(false);
  });
  it("fits the action field and can be written into the shot", () => {
    const t = timedPrompt(shot(TWO));
    expect(t.length).toBeLessThanOrEqual(SHOT_LIMITS.action);
    const r = validateRecipe({ ...shot(TWO), shot: { subject: "a car", environment: "", action: t, legend: "" } });
    expect(r.shot!.action).toBe(t);
  });
  it("the shot limits: the action takes 2000 characters, not more", () => {
    const base = shot(TWO), s = (action: string) => validateRecipe({ ...base, shot: { subject: "", environment: "", action, legend: "" } });
    expect(s("a".repeat(SHOT_LIMITS.action)).shot!.action).toHaveLength(SHOT_LIMITS.action);
    expect(() => s("a".repeat(SHOT_LIMITS.action + 1))).toThrow(/2000/);
    expect(() => s("see https://x.y")).toThrow(/URL/);
  });
});
