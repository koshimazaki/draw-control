import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  DEFAULT_EXPORT_SIZE, DEFAULT_RECIPE, EXPORT_SIZES, TARGET_MODEL_CONSTRAINTS, buildBeats, buildMeta,
  clearIncompatibleMoves, constraintWarnings, exportFrameCount, incompatibleMoves, makeClipMove, resolveExportRange,
  validateRecipe, type Recipe,
} from "../src";

const schema = JSON.parse(readFileSync(new URL("../../../schema/guide-bundle.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(schema);
const valid = (ref: string, data: unknown) => {
  const v = ajv.getSchema(ref)!;
  if (!v(data)) throw new Error(JSON.stringify(v.errors));
  return true;
};

/** 112 BPM, first beat at 0.2 s, 20 beats: the smoke test's track. */
const track: Recipe = validateRecipe({
  ...structuredClone(DEFAULT_RECIPE), durationBeats: 20,
  beatGrid: { bpm: 112, offsetSeconds: 0.2, beatsPerBar: 4, source: "analysis" },
});

describe("target model constraints", () => {
  it("is one small table with the reference-video limits", () => {
    expect(TARGET_MODEL_CONSTRAINTS).toHaveLength(1);
    expect(TARGET_MODEL_CONSTRAINTS[0]).toMatchObject({ minSidePx: 700, maxSidePx: 4553, minFps: 24, maxFps: 60, minSeconds: 3, maxSeconds: 30 });
  });
  it("defaults to 1280×720 and offers landscape HD, full HD and portrait", () => {
    expect(DEFAULT_EXPORT_SIZE).toMatchObject({ width: 1280, height: 720 });
    expect(EXPORT_SIZES.map(s => `${s.width}x${s.height}`)).toEqual(["1280x720", "1920x1080", "720x1280"]);
  });
  it("every offered size fits the target for an 8-second clip", () => {
    for (const s of EXPORT_SIZES) expect(constraintWarnings({ ...s, fps: 24, seconds: 8 })).toEqual([]);
  });
  it("warns on a short side under 700 px, a side over 4553 px, and clip length outside 3–30 s", () => {
    expect(constraintWarnings({ width: 832, height: 480, fps: 24, seconds: 8 })).toEqual(["height 480 px is under the 700 px minimum"]);
    expect(constraintWarnings({ width: 5000, height: 720, fps: 24, seconds: 8 })[0]).toMatch(/width 5000 px is over/);
    expect(constraintWarnings({ width: 1280, height: 720, fps: 24, seconds: 2.04 })).toEqual(["clip length 2.04 s is under the 3 s minimum"]);
    expect(constraintWarnings({ width: 1280, height: 720, fps: 24, seconds: 31 })[0]).toMatch(/over the 30 s maximum/);
    expect(constraintWarnings({ width: 1280, height: 720, fps: 12, seconds: 8 })[0]).toMatch(/12 fps is outside 24–60/);
  });
});

describe("export range", () => {
  it("defaults to the whole recipe from frame 0", () => {
    const r = resolveExportRange(DEFAULT_RECIPE);
    expect(r).toEqual({ startFrame: 0, frames: exportFrameCount(DEFAULT_RECIPE), startSeconds: 0, seconds: 193 / 24 });
  });
  it("resolves a mid-track section in beats to whole frames, 8k+1 long", () => {
    const r = resolveExportRange(track, { unit: "beats", start: 8, length: 8 });
    // beat 8 is at 0.2 + 8 × 60/112 = 4.4857 s → frame 107 (floored); 8 beats = 102.9 frames → 105.
    expect(r.startFrame).toBe(107);
    expect(r.frames).toBe(105);
    expect((r.frames - 1) % 8).toBe(0);
    expect(r.seconds).toBeCloseTo(4.375, 6);
  });
  it("resolves a section in seconds and clamps it to the recipe end", () => {
    const r = resolveExportRange(DEFAULT_RECIPE, { unit: "seconds", start: 2, length: 4 });
    expect(r).toMatchObject({ startFrame: 48, frames: 97 });
    const tail = resolveExportRange(DEFAULT_RECIPE, { unit: "seconds", start: 6, length: 30 });
    expect(tail.startFrame).toBe(144);
    expect(tail.frames).toBe(49); // 193 − 144 = 49 frames remain, already 8k+1
  });
  it("refuses a start past the end, a negative start and a zero length", () => {
    expect(() => resolveExportRange(DEFAULT_RECIPE, { unit: "beats", start: 40 })).toThrow(/past the end/);
    expect(() => resolveExportRange(DEFAULT_RECIPE, { unit: "seconds", start: -1 })).toThrow(/zero or more/);
    expect(() => resolveExportRange(DEFAULT_RECIPE, { unit: "beats", start: 0, length: 0 })).toThrow(/more than zero/);
  });
  it("re-bases beats.json to the exported range and keeps downbeats in the bar", () => {
    const r = resolveExportRange(track, { unit: "beats", start: 8, length: 8 });
    const b = buildBeats(track, r.frames, r.startFrame);
    // Beat 8 lands 0.0274 s after the clip's frame 0; beats 8–16 fit in 4.375 s.
    expect(b.offsetSeconds).toBeCloseTo(0.4857 - 107 / 24 + 4, 3);
    expect(b.offsetSeconds).toBeLessThan(1 / 24);
    expect(b.beats).toHaveLength(9);
    expect(b.beats[1] - b.beats[0]).toBeCloseTo(60 / 112, 3);
    expect(b.downbeats).toEqual([b.beats[0], b.beats[4], b.beats[8]]);
    expect(valid("guide-bundle.schema.json#/$defs/beats", b)).toBe(true);
  });
  it("puts the first downbeat where the bar says when the range starts off the bar", () => {
    const r = resolveExportRange(track, { unit: "beats", start: 6, length: 4 });
    const b = buildBeats(track, r.frames, r.startFrame);
    expect(b.downbeats[0]).toBe(b.beats[2]); // beat 8 is the next bar line
  });
  it("records a mid-track range in meta without breaking the pinned schema", () => {
    const r = resolveExportRange(track, { unit: "beats", start: 8, length: 8 });
    const meta = buildMeta(track, { width: 1280, height: 720, frames: r.frames, view: "front", audioInVideo: true, hasAudio: false, startFrame: r.startFrame });
    expect(meta.assets[0].name).toBe("Rendered guide, recipe frames 107-211 (4.458-8.833 s)");
    expect(valid("guide-bundle.schema.json#/$defs/meta", meta)).toBe(true);
  });
});

describe("character switch", () => {
  const withClip = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), moves: [...DEFAULT_RECIPE.moves.slice(0, 2), makeClipMove("Wave", 6, 2)] });
  it("lists library moves as incompatible with a loaded file, and clip moves with the procedural figures", () => {
    expect(incompatibleMoves(withClip, "file").map(m => m.atBeat)).toEqual([0, 4]);
    expect(incompatibleMoves(withClip, "mannequin").map(m => m.name)).toEqual(["Wave"]);
    expect(incompatibleMoves(withClip, "block")).toHaveLength(1);
  });
  it("clearing keeps the recipe valid and leaves the input alone", () => {
    const cleared = clearIncompatibleMoves(withClip, "file");
    expect(cleared.moves.map(m => m.name)).toEqual(["Wave"]);
    expect(validateRecipe(JSON.parse(JSON.stringify(cleared)))).toEqual(cleared);
    expect(withClip.moves).toHaveLength(3);
  });
  it("clearing every move leaves a valid, empty recipe; keeping is valid too", () => {
    const empty = clearIncompatibleMoves({ ...DEFAULT_RECIPE, character: { kind: "file", name: "x.glb", licence: "own" } }, "file");
    expect(empty.moves).toEqual([]);
    expect(validateRecipe(empty)).toEqual(empty);
    const kept = validateRecipe({ ...DEFAULT_RECIPE, character: { kind: "file", name: "x.glb", licence: "own" } });
    expect(kept.moves).toHaveLength(4);
  });
});
