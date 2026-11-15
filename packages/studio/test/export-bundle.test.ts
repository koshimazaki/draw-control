/**
 * The guide export, driven with a fake viewport, renderer and writer:
 * - the view and the rig plan are read once at the start, so a view switch or a rig edit
 *   mid-export changes neither the per-frame camera nor meta.json and camera.json;
 * - whatever fails, the writer is closed and the export's renderer disposed with its context lost;
 * - an abort signal stops the render between frames, cleans up the same way and throws ExportAborted.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { strFromU8, strToU8 } from "fflate";
import { analyseSamples, buildDrive, planCamera } from "@motion-studio/core";
import { BUNDLE_FILES, BUNDLE_SCHEMA_VERSION, buildCameraTrack, cameraAtFrame, patternTimes, synthDrums, type CameraPlan } from "@motion-studio/core/internal";
import { beatPathRecipe, exportRange, type TrackInfo } from "../src/beat-path/recipe-map";
import { exampleState } from "../src/beat-path/examples";
import { exportBundle, isExportAborted, type ExportDeps, type ExportViewport } from "../src/export/bundle";
import type { Mp4Writer } from "../src/export/mp4";
import { applyRigSample } from "../src/views";

const samples = synthDrums(patternTimes(120, 8, 0.1), 16.6);
const features = analyseSamples([samples], 44100);
const drive = buildDrive(features, 24, Math.ceil(features.lengthSeconds * 24) + 1);
const info: TrackInfo = { name: "demo-drums-120.wav", licence: "generated", bpm: features.estimatedBpm!, offsetSeconds: features.estimatedOffsetSeconds, lengthSeconds: features.lengthSeconds };
const state = exampleState(0);
const recipe = beatPathRecipe(state, info, { drive, bands: drive.bands });
const range = { ...exportRange(recipe, state.clip), frames: 12 };
const plan = planCamera(recipe, drive, 400);
const W = 64, H = 36;

type Calls = { events: string[]; cameras: THREE.Vector3[] };
function harness(over: { writer?: Partial<Mp4Writer>; makeWriter?: ExportDeps["writer"]; onRender?: (n: number) => void } = {}) {
  const calls: Calls = { events: [], cameras: [] };
  let rendered = 0;
  const viewport = {
    scene: new THREE.Scene(), view: "rig" as ExportViewport["view"], plan: plan as CameraPlan | null,
    getRigPlan() { return this.plan; },
    exportCamera: () => new THREE.PerspectiveCamera(),
    pose: () => {},
    setExporting: (on: boolean) => { calls.events.push(`exporting ${on}`); },
  };
  const writer: Mp4Writer = {
    addFrame: async () => {},
    finish: async () => ({ bytes: new Uint8Array([1, 2, 3]), audioInVideo: false, codec: "fake" }),
    close: () => { calls.events.push("writer close"); },
    ...over.writer,
  };
  const deps: ExportDeps = {
    canvas: () => ({}) as HTMLCanvasElement,
    renderer: () => ({
      setPixelRatio: () => {}, setSize: () => {},
      render: (_s: THREE.Object3D, cam: THREE.Camera) => { calls.cameras.push(cam.position.clone()); over.onRender?.(rendered++); },
      dispose: () => { calls.events.push("renderer dispose"); },
      forceContextLoss: () => { calls.events.push("context lost"); },
    }) as unknown as ReturnType<ExportDeps["renderer"]>,
    writer: over.makeWriter ?? (async () => writer),
    png: async () => new Uint8Array([9]),
  };
  return { calls, viewport, deps };
}

describe("exportBundle: a snapshot of the view and the rig plan", () => {
  it("keeps the rig camera and its metadata when the view and the plan change mid-export", async () => {
    const other = planCamera({ ...recipe, camera: { ...recipe.camera!, segments: recipe.camera!.segments.slice().reverse() } }, drive, 400);
    const h = harness({ onRender: n => { if (n === 3) { h.viewport.view = "front"; h.viewport.plan = other; } } });
    const result = await exportBundle({ recipe, range, viewport: h.viewport, width: W, height: H, audio: null, drive }, h.deps);

    expect(h.viewport.view).toBe("front");   // it did change underneath
    const expected = Array.from({ length: range.frames }, (_, n) => {
      const cam = new THREE.PerspectiveCamera();
      applyRigSample(cam, cameraAtFrame(plan, range.startFrame + n), W / H);
      return cam.position;
    });
    expect(h.calls.cameras).toHaveLength(range.frames);
    h.calls.cameras.forEach((p, n) => expect(p.distanceTo(expected[n])).toBeLessThan(1e-9));
    expect(new Set(h.calls.cameras.map(p => p.toArray().join())).size).toBeGreaterThan(1);   // a moving rig, not a fixed camera

    const meta = JSON.parse(strFromU8(result.contents[BUNDLE_FILES.meta]));
    expect(meta.view).toBe("rig");
    expect(result.files).toContain(BUNDLE_FILES.camera);
    expect(JSON.parse(strFromU8(result.contents[BUNDLE_FILES.camera])))
      .toEqual(JSON.parse(JSON.stringify(buildCameraTrack(plan, recipe, range.startFrame, range.frames, W / H, BUNDLE_SCHEMA_VERSION))));
  });

  it("a fixed view stays fixed and writes no camera track, even if the rig turns on mid-export", async () => {
    const h = harness({ onRender: n => { if (n === 2) h.viewport.view = "rig"; } });
    h.viewport.view = "front";
    const result = await exportBundle({ recipe, range, viewport: h.viewport, width: W, height: H, audio: null, drive }, h.deps);
    expect(new Set(h.calls.cameras.map(p => p.toArray().join())).size).toBe(1);
    expect(JSON.parse(strFromU8(result.contents[BUNDLE_FILES.meta])).view).toBe("front");
    expect(result.files).not.toContain(BUNDLE_FILES.camera);
  });

  it("extra files (the page's setup.json) ride in the zip, never over the guide's own, and stay out of bundle.json", async () => {
    const h = harness({});
    const result = await exportBundle({ recipe, range, viewport: h.viewport, width: W, height: H, audio: null, drive,
      extra: { "setup.json": strToU8("{}"), [BUNDLE_FILES.recipe]: strToU8("not the recipe") } }, h.deps);
    expect(strFromU8(result.contents["setup.json"])).toBe("{}");
    expect(JSON.parse(strFromU8(result.contents[BUNDLE_FILES.recipe]))).toEqual(JSON.parse(JSON.stringify(recipe)));
    expect(Object.values(JSON.parse(strFromU8(result.contents[BUNDLE_FILES.manifest])))).not.toContain("setup.json");
  });
});

describe("exportBundle: cleanup on every path", () => {
  const run = (h: ReturnType<typeof harness>) => exportBundle({ recipe, range, viewport: h.viewport, width: W, height: H, audio: null, drive }, h.deps);
  const cleanup = ["writer close", "renderer dispose", "context lost"];

  it("on success", async () => {
    const h = harness();
    await run(h);
    expect(h.calls.events.slice(-3)).toEqual(cleanup);
    expect(h.calls.events.filter(e => e === "exporting false")).toHaveLength(1);
  });
  it("when a frame fails to encode", async () => {
    const h = harness({ writer: { addFrame: async (_c, n) => { if (n === 4) throw new Error("encoder died"); } } });
    await expect(run(h)).rejects.toThrow("encoder died");
    expect(h.calls.events.slice(-4)).toEqual(["exporting false", ...cleanup]);
  });
  it("when finishing fails", async () => {
    const h = harness({ writer: { finish: async () => { throw new Error("flush failed"); } } });
    await expect(run(h)).rejects.toThrow("flush failed");
    expect(h.calls.events.slice(-3)).toEqual(cleanup);
  });
  it("when the writer cannot be made (no encoder): the renderer still goes", async () => {
    const h = harness({ makeWriter: async () => { throw new Error("no H.264"); } });
    await expect(run(h)).rejects.toThrow("no H.264");
    expect(h.calls.events).toEqual(["renderer dispose", "context lost"]);
  });
});

describe("exportBundle: an abort signal", () => {
  it("stops within a frame of the abort, cleans up, never finishes the video, and throws an error the caller recognises", async () => {
    const abort = new AbortController();
    let finished = false;
    const h = harness({ onRender: n => { if (n === 3) abort.abort(); }, writer: { finish: async () => { finished = true; return { bytes: new Uint8Array(), audioInVideo: false, codec: "fake" }; } } });
    const err = await exportBundle({ recipe, range, viewport: h.viewport, width: W, height: H, audio: null, drive, signal: abort.signal }, h.deps).catch(e => e);
    expect(isExportAborted(err)).toBe(true);
    expect((err as { code: string }).code).toBe("aborted");
    expect(h.calls.cameras).toHaveLength(4);   // frames 0-3 rendered; frame 4 never started
    expect(finished).toBe(false);
    expect(h.calls.events.slice(-4)).toEqual(["exporting false", "writer close", "renderer dispose", "context lost"]);
  });
  it("an already-aborted signal renders nothing; no signal exports every frame as before", async () => {
    const h = harness(), abort = new AbortController();
    abort.abort();
    await expect(exportBundle({ recipe, range, viewport: h.viewport, width: W, height: H, audio: null, drive, signal: abort.signal }, h.deps)).rejects.toSatisfy(isExportAborted);
    expect(h.calls.cameras).toHaveLength(0);
    const h2 = harness();
    const result = await exportBundle({ recipe, range, viewport: h2.viewport, width: W, height: H, audio: null, drive }, h2.deps);
    expect(result.frames).toBe(range.frames);
    expect(h2.calls.cameras).toHaveLength(range.frames);
  });
});
