import { describe, expect, it } from "vitest";
import { timedPrompt } from "@motion-studio/core";
import { exampleState } from "../src/beat-path/examples";
import { beatPathRecipe } from "../src/beat-path/recipe-map";
import { BLANK_STATE, fromScript, toScript, type BeatPathState } from "../src/beat-path/script";
import { SETUP_KIND, SETUP_VERSION, readSetup, setupJson } from "../src/beat-path/setup-file";
import { promptWarning } from "../src/beat-path/generate";
import { EXAMPLE_TRACKS } from "../src/beat-path/tracks";
import { replacesEdited, timedStyleFor } from "../src/beat-path/shot-editor";

const onTrack = (i: number) => {
  const st = exampleState(i), g = EXAMPLE_TRACKS[st.track!].grid!;
  return beatPathRecipe(st, { name: "x.mp3", licence: "MIT", bpm: g.bpm, offsetSeconds: g.offsetSeconds, lengthSeconds: 60 });
};
const multi: BeatPathState["shot"] = { subject: "a flying car\nsleek and low", environment: "a city at night", action: "0.0–2.5 s: it flies\n\n2.5–8.0 s, on the snare: top view | camera: top" };

describe("the timed prompt on the page (shot-editor.ts)", () => {
  it("Example 1: one line per camera block; the one-beat accent reads as a move in and back out; the top block pushes in", () => {
    const t = timedPrompt(onTrack(0), { seconds: 14 }).split("\n");
    expect(t).toHaveLength(exampleState(0).cameraLane.length);
    expect(t[0]).toMatch(/^0\.0–3\.3 s: the camera follows from a three-quarter angle, about 7 m away and 5 m up as it flies along its path$/);
    expect(t[1]).toMatch(/^3\.3–3\.9 s, on the beat: the camera moves in closer/);
    expect(t[2]).toMatch(/the camera pulls back out/);
    expect(t[3]).toMatch(/follows from behind.*turns left/);
    expect(t.at(-1)).toMatch(/^10\.0–14\.0 s, .*top view, looking straight down on it, pushing in to about 1 m$/);
  });
  it("Example 2: low and close on the feet, the pull back, the hop on the kick when the hits are known", () => {
    const r = onTrack(1), kick = r.reactive!.markers![0].seconds;
    const t = timedPrompt(r, { seconds: 12, bands: { hopSeconds: 0.01, low: [{ seconds: kick, strength: 1 }], mid: [], high: [], peaks: [] } });
    expect(t).toMatch(/^0\.0–3\.1 s: the camera tracks alongside it, about 2\.5 m away and 0\.3 m up, low and close on its feet/);
    expect(t).toMatch(/pulls back to about 13 m away/);
    expect(t).toMatch(/at 6\.6 s it does a small hop on the kick/);
    expect(t).toMatch(/rises to about 8 m, tilting down/);
  });
  it("each model's time syntax: Seedance brackets, Kling and MiniMax plain seconds", () => {
    expect(timedStyleFor("seedance-2.5")).toBe("brackets");
    expect(timedStyleFor("kling-4")).toBe("plain");
    expect(timedStyleFor("h3")).toBe("plain");
  });
  it("asks before replacing text the person wrote, not before replacing its own", () => {
    expect(replacesEdited("", null)).toBe(false);
    expect(replacesEdited("it flies down the avenue", null)).toBe(true);
    expect(replacesEdited("0.0–2.5 s: x", "0.0–2.5 s: x")).toBe(false);
    expect(replacesEdited("0.0–2.5 s: x, faster", "0.0–2.5 s: x")).toBe(true);
    // After a reload (nothing written yet on this page), a text of only timed lines is its own.
    expect(replacesEdited("0.0–2.5 s: x\n[2.5-8s] on the kick: y", null)).toBe(false);
    expect(replacesEdited("0.0–2.5 s: x\nand then it lands", null)).toBe(true);
  });
  it("the cost dialog warns past a model's prompt limit", () => {
    expect(promptWarning("h3", "a".repeat(7000))).toBeNull();
    expect(promptWarning("h3", "a".repeat(7001))).toMatch(/MiniMax H3 takes up to 7000/);
    expect(promptWarning("kling-4", "a".repeat(7001))).toBeNull();
  });
});

describe("multi-line shot fields round-trip", () => {
  it("through the page's shot script, without adding a row", () => {
    const s: BeatPathState = { ...exampleState(0), shot: multi };
    const text = toScript(s);
    expect(text).toMatch(/^shot action: 0\.0–2\.5 s: it flies\\n\\n2\.5–8\.0 s, on the snare: top view \| camera: top$/m);
    expect(text.split("\n").filter(l => l.startsWith("beats")).length).toBe(toScript(exampleState(0)).split("\n").filter(l => l.startsWith("beats")).length);
    expect(fromScript(text, BLANK_STATE).state.shot).toEqual(multi);
    expect(beatPathRecipe(fromScript(text, BLANK_STATE).state, null).shot).toMatchObject(multi);
  });
  it("through the setup file", () => {
    const s: BeatPathState = { ...exampleState(0), shot: multi };
    const r = readSetup(setupJson(s, null));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.shot).toEqual(multi);
  });
  it("a setup file's text is clamped per field and keeps its breaks", () => {
    const file = JSON.stringify({ kind: SETUP_KIND, version: SETUP_VERSION, state: { ...exampleState(0), shot: { subject: "a\r\n\r\n\r\nb", environment: "", action: "x".repeat(2500) } } });
    const r = readSetup(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.shot.subject).toBe("a\n\nb");
    expect(r.state.shot.action).toHaveLength(2000);
  });
});
