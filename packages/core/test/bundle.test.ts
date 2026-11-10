import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { DEFAULT_RECIPE, buildBeats, buildManifest, buildMeta, encodeWav, exportFrameCount, validateRecipe } from "../src";

const schema = JSON.parse(readFileSync(new URL("../../../schema/guide-bundle.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(schema);
const check = (ref: string, data: unknown) => {
  const v = ajv.getSchema(ref)!;
  const ok = v(data);
  if (!ok) throw new Error(JSON.stringify(v.errors));
  return ok;
};

describe("guide bundle", () => {
  const recipe = { ...structuredClone(DEFAULT_RECIPE), audio: { name: "track.wav", licence: "owner's own music" } };
  const frames = exportFrameCount(recipe);
  it("snaps an 8-second, 16-beat recipe to 8k+1 frames", () => {
    expect(frames).toBe(193);
    expect((frames - 1) % 8).toBe(0);
  });
  it("manifest, beats and meta validate against the pinned schema", () => {
    expect(check("guide-bundle.schema.json", buildManifest(true))).toBe(true);
    expect(check("guide-bundle.schema.json#/$defs/beats", buildBeats(recipe, frames))).toBe(true);
    const meta = buildMeta(recipe, { width: 832, height: 480, frames, view: "front", audioInVideo: true, hasAudio: true });
    expect(check("guide-bundle.schema.json#/$defs/meta", meta)).toBe(true);
    expect(meta.assets.every(a => a.licence.length > 0)).toBe(true);
    expect(meta.assets.find(a => a.role === "audio")?.licence).toBe("owner's own music");
  });
  it("beats cover the clip", () => {
    const b = buildBeats(recipe, frames);
    expect(b.beats).toHaveLength(17);
    expect(b.downbeats).toEqual([0, 2, 4, 6, 8]);
  });
  it("the recipe file validates as a recipe", () => {
    expect(validateRecipe(JSON.parse(JSON.stringify(recipe)))).toEqual(recipe);
  });
  it("writes a PCM WAV header and the requested length", () => {
    const wav = encodeWav([new Float32Array(48000).fill(0.5), new Float32Array(48000)], 48000, 0.5, 1);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(48000 * 2 * 2);
    expect(view.getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff - 0.5));
  });
});
