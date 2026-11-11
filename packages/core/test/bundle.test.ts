import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  BUNDLE_SCHEMA_VERSION, DEFAULT_RECIPE, buildBeats, buildCameraTrack, buildManifest, buildMeta, encodeWav, exportFrameCount, planCamera,
  suggestLtxCameraMovement, validateRecipe, CAMERA_MODES, type CameraSegment,
} from "../src/internal";

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
  it("beats carry drum-band onsets and peaks, re-based to the range (schema 0.3.0)", () => {
    const bands = { hopSeconds: 0.01, low: [{ seconds: 0.5, strength: 1 }, { seconds: 4.2, strength: 0.8 }], mid: [{ seconds: 4.7, strength: 0.6 }], high: [], peaks: [{ seconds: 4.2, strength: 1 }] };
    const whole = buildBeats(recipe, frames, 0, bands);
    expect(whole.onsets?.low).toHaveLength(2);
    expect(check("guide-bundle.schema.json#/$defs/beats", whole)).toBe(true);
    const part = buildBeats(recipe, 49, 96, bands);   // 4.0 s to 6.04 s
    expect(part.onsets).toEqual({ low: [{ seconds: 0.2, strength: 0.8 }], mid: [{ seconds: 0.7, strength: 0.6 }], high: [] });
    expect(part.peaks).toEqual([{ seconds: 0.2, strength: 1 }]);
    expect(check("guide-bundle.schema.json#/$defs/beats", part)).toBe(true);
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

describe("camera track (schema 0.2.0)", () => {
  const recipe = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), camera: {
    segments: [{ fromBeat: 0, toBeat: 8, modes: ["orbit"] }, { fromBeat: 8, toBeat: 16, modes: ["pushIn"] }],
    intensity: 0.8, orbitDegreesPerBeat: 10, distance: 4.4, height: 1.15, fov: 38, startYaw: 0 } });
  const plan = planCamera(recipe);
  it("validates against the pinned schema, with the manifest and meta naming it", () => {
    const track = buildCameraTrack(plan, recipe, 24, 97, 16 / 9, BUNDLE_SCHEMA_VERSION);
    expect(track.track).toHaveLength(97);
    expect(track.track[0].position).toEqual(plan.samples[24].position.map(x => Math.round(x * 10000) / 10000));
    expect(check("guide-bundle.schema.json#/$defs/camera", JSON.parse(JSON.stringify(track)))).toBe(true);
    expect(check("guide-bundle.schema.json", buildManifest(true, true))).toBe(true);
    const meta = buildMeta(recipe, { width: 1280, height: 720, frames: 97, view: "rig", audioInVideo: true, hasAudio: false, hasCamera: true });
    expect(check("guide-bundle.schema.json#/$defs/meta", meta)).toBe(true);
    expect(meta.assets.some(a => a.role === "camera" && a.file === "camera.json")).toBe(true);
  });
  it("suggests the nearest LTX preset, marked approximate", () => {
    expect(suggestLtxCameraMovement(plan, 0, 8 * 12).settings.cameraMovement).toBe("dolly_right");
    expect(suggestLtxCameraMovement(plan, 8 * 12 + 6, 8 * 12).settings.cameraMovement).toBe("dolly_in");
    const left = planCamera({ ...recipe, camera: { ...recipe.camera!, orbitDegreesPerBeat: -10 } });
    expect(suggestLtxCameraMovement(left, 0, 96).settings.cameraMovement).toBe("dolly_left");
    const still = planCamera({ ...recipe, camera: { ...recipe.camera!, intensity: 0, segments: [{ fromBeat: 0, toBeat: 16, modes: ["static"] }] } });
    const s = suggestLtxCameraMovement(still, 0, 96);
    expect(s.settings.cameraMovement).toBe("static");
    expect(s.approximate).toBe(true);
  });
  it("every camera mode validates against the schema (0.4.0); shots, amounts and locks stay out of camera.json", () => {
    const segments: CameraSegment[] = CAMERA_MODES.map((m, i) => ({ fromBeat: i, toBeat: i + 1, modes: [m], ...(m === "truck" ? { amount: 1 } : m === "orbit" ? { amount: 90, shot: "close", lock: "beat" } : {}) }));
    const r = validateRecipe({ ...structuredClone(DEFAULT_RECIPE), camera: { ...recipe.camera!, segments, path: [{ x: 0, y: 1, z: 3 }, { x: 3, y: 1, z: 0 }] } });
    const track = buildCameraTrack(planCamera(r), r, 0, 97, 16 / 9, BUNDLE_SCHEMA_VERSION);
    expect(track.modes.map(s => s.modes[0])).toEqual([...CAMERA_MODES]);
    expect(check("guide-bundle.schema.json#/$defs/camera", JSON.parse(JSON.stringify(track)))).toBe(true);
  });
  it("a bundle without the rig has no camera entry (0.1.0 readers see the same files)", () => {
    expect(buildManifest(true)).not.toHaveProperty("camera");
  });
});
