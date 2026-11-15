import { describe, expect, it } from "vitest";
import { timedPrompt } from "@motion-studio/core";
import { exampleState } from "../src/beat-path/examples";
import { beatPathRecipe } from "../src/beat-path/recipe-map";
import { BLANK_STATE, fromScript, toScript, type BeatPathState } from "../src/beat-path/script";
import { SETUP_KIND, SETUP_VERSION, readSetup, setupJson } from "../src/beat-path/setup-file";
import { promptWarning } from "../src/beat-path/generate";
import { replacesEdited, timedStyleFor } from "../src/beat-path/shot-editor";

const flyer = () => beatPathRecipe(exampleState(0), { name: "x.wav", licence: "MIT", bpm: 120, offsetSeconds: 0.09, lengthSeconds: 30 });
const multi: BeatPathState["shot"] = { subject: "a flying car\nsleek and low", environment: "a city at night", action: "0.0–2.5 s: it flies\n\n2.5–8.0 s, on the snare: top view | camera: top" };

describe("the timed prompt on the page (shot-editor.ts)", () => {
  it("Example 1: one line per camera block, the drawn path in its second", () => {
    const t = timedPrompt(flyer(), { seconds: 8 }).split("\n");
    expect(t).toHaveLength(2);
    expect(t[0]).toMatch(/^0\.0–2\.5 s: wide shot; the camera follows from behind as it flies along its path/);
    expect(t[1]).toMatch(/^2\.5–8\.0 s, on the beat: the camera travels along its own route/);
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
