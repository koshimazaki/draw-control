/**
 * The clip length: whole seconds from 3 to 30 (the fader in Settings), read from and printed to
 * the script, exported on the 8k+1 frame grid, and checked against what each model takes.
 */
import { describe, expect, it } from "vitest";
import { clipBeats } from "@motion-studio/core";
import { beatPathRecipe, exportRange } from "../src/beat-path/recipe-map";
import { CLIP_SECONDS, clampClip, clipLabel, fitLanes, fromScript, toScript } from "../src/beat-path/script";
import { BLANK_STATE, exampleState } from "../src/beat-path/examples";
import { MODELS, clipRefusal } from "../src/beat-path/generate";
import { faderHTML } from "../src/beat-path/ui/fader";

describe("Beat Path clip length", () => {
  it("takes whole seconds from 3 to 30", () => {
    expect([clampClip(2), clampClip(3), clampClip(12.4), clampClip(12.6), clampClip(30), clampClip(45), clampClip(NaN)]).toEqual([3, 3, 12, 13, 30, 30, 8]);
    expect(CLIP_SECONDS.marks).toEqual([5, 8, 10, 15, 20, 30]);
  });
  it("any length round-trips through the script; one outside the range is read to the nearest with a note", () => {
    for (const clip of [3, 7, 20, 30]) {
      const s = { ...exampleState(0), clip }, back = fromScript(toScript(s), BLANK_STATE);
      expect(back.state.clip).toBe(clip);
      expect(back.notes).toEqual([]);
    }
    const long = fromScript(toScript(exampleState(0)).replace(/^# clip: \d+/m, "# clip: 45"), BLANK_STATE);
    expect(long.state.clip).toBe(30);
    expect(long.notes).toEqual(["clip 45 s → 30 s (the page takes 3 to 30 s)"]);
  });
  it("exports 24 frames a second plus one, on the 8k+1 grid", () => {
    for (const clip of [3, 5, 8, 10, 20, 30]) {
      const s = fitLanes({ ...exampleState(0), clip }, clipBeats(clip, 120)), frames = exportRange(beatPathRecipe(s, null, {}), clip).frames;
      expect(frames).toBe(clip * 24 + 1);
      expect((frames - 1) % 8).toBe(0);
      expect(clipLabel(clip)).toBe(`${clip} s`);
    }
  });
  it("Generate refuses a clip the model cannot take and names the models that can", () => {
    expect(clipRefusal("kling-4", 30)).toBeNull();
    expect(clipRefusal("seedance-2.5", 30)).toBeNull();
    expect(clipRefusal("h3", 15)).toBeNull();
    expect(clipRefusal("h3", 20)).toBe("MiniMax H3 takes 4 to 15 s; this clip is 20 s. Set the clip to 15 s in Settings, or pick Kling 4.0 or Seedance 2.5.");
    expect(clipRefusal("seedance-2.5", 3)).toBe("Seedance 2.5 takes 4 to 30 s; this clip is 3 s. Set the clip to 4 s in Settings, or pick Kling 4.0.");
    // Every model takes the default and every mark up to its longest.
    for (const m of MODELS) for (const v of CLIP_SECONDS.marks.filter(v => v <= m.seconds.max)) expect(clipRefusal(m.id, v)).toBeNull();
  });
  it("the fader rules one tick a second, taller and labelled at the marks", () => {
    const html = faderHTML({ id: "clip", ...CLIP_SECONDS, label: "Clip length, seconds", unit: "s" });
    expect(html.match(/<i[ >]/g)).toHaveLength(28);
    expect(html.match(/<i class="major"/g)).toHaveLength(6);
    expect([...html.matchAll(/data-value="(\d+)"/g)].map(m => Number(m[1]))).toEqual([5, 8, 10, 15, 20, 30]);
    expect(html).toContain('min="3" max="30" step="1"');
  });
});
