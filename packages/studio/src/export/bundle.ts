/**
 * Render the guide bundle frame by frame and zip it:
 * guide.mp4, frame0.png, audio.wav, beats.json, recipe.json, meta.json, bundle.json, and
 * camera.json when the Camera rig view is exported.
 */
import { strToU8, zipSync } from "fflate";
import * as THREE from "three";
import {
  BUNDLE_FILES, BUNDLE_SCHEMA_VERSION, buildBeats, buildCameraTrack, buildManifest, buildMeta, cameraAtFrame, encodeWav, frameAt, resolveExportRange,
  type AudioDrive, type ExportRange, type Recipe,
} from "@motion-studio/core/internal";
import { makeRenderer, type Viewport } from "../viewport";
import { applyRigSample } from "../views";
import { createMp4Writer, type Mp4Writer } from "./mp4";

export type ExportOptions = {
  recipe: Recipe;
  /** Section of the recipe to export; the whole recipe when omitted. */
  range?: ExportRange;
  /** Read once, at the start: its view and rig plan are a snapshot, so editing the page mid-export changes nothing. */
  viewport: ExportViewport; width: number; height: number;
  audio: AudioBuffer | null;
  /** The audio drive for the reactive layer and the rig (same one the preview used). */
  drive?: AudioDrive;
  onProgress?: (done: number, total: number) => void;
};
export type ExportResult = { zip: Uint8Array; frames: number; mp4Bytes: number; audioInVideo: boolean; codec: string; files: string[];
  /** The bundle's files by name, the same bytes as in the zip (for in-memory use: a Generate panel). */
  contents: Record<string, Uint8Array> };

/** What the export reads from the live viewport. */
export type ExportViewport = Pick<Viewport, "scene" | "view" | "getRigPlan" | "exportCamera" | "pose" | "setExporting">;
/** The browser pieces the export is made of (fakes in the tests). */
export type ExportDeps = {
  canvas(width: number, height: number): HTMLCanvasElement;
  renderer(canvas: HTMLCanvasElement): Pick<THREE.WebGLRenderer, "setPixelRatio" | "setSize" | "render" | "dispose" | "forceContextLoss">;
  writer: typeof createMp4Writer;
  png(canvas: HTMLCanvasElement): Promise<Uint8Array>;
};

const json = (x: unknown) => strToU8(JSON.stringify(x, null, 2) + "\n");
const pngBytes = (canvas: HTMLCanvasElement) => new Promise<Uint8Array>((resolve, reject) =>
  canvas.toBlob(b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject) : reject(new Error("PNG capture failed"))), "image/png"));
const BROWSER: ExportDeps = {
  canvas: (width, height) => Object.assign(document.createElement("canvas"), { width, height }),
  // Its own canvas and WebGL context: the live viewport's renderer is never touched (only the scene is shared).
  renderer: makeRenderer,
  writer: createMp4Writer,
  png: pngBytes,
};

export async function exportBundle(o: ExportOptions, deps: ExportDeps = BROWSER): Promise<ExportResult> {
  const { recipe, viewport, width, height } = o;
  const range = o.range ?? resolveExportRange(recipe);
  const { frames, startFrame, startSeconds, seconds } = range;
  const channels = o.audio ? Array.from({ length: o.audio.numberOfChannels }, (_, i) => o.audio!.getChannelData(i)) : null;
  const aspect = width / height;
  // The view and the rig plan, once: every frame, meta.json and camera.json use these.
  const view = viewport.view, plan = view === "rig" ? viewport.getRigPlan() : null;
  const camera = viewport.exportCamera(aspect);
  const poseCamera = (frame: number) => { if (plan && camera instanceof THREE.PerspectiveCamera) applyRigSample(camera, cameraAtFrame(plan, frame), aspect); };

  const canvas = deps.canvas(width, height);
  let renderer: ReturnType<ExportDeps["renderer"]> | null = null, writer: Mp4Writer | null = null;
  let firstFrame: Uint8Array | null = null, mp4: Awaited<ReturnType<Mp4Writer["finish"]>>;
  try {
    renderer = deps.renderer(canvas);
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    writer = await deps.writer({
      width, height, fps: recipe.fps,
      audio: channels && o.audio ? { channels, sampleRate: o.audio.sampleRate, startSeconds, seconds } : undefined,
    });
    try {
      for (let n = 0; n < frames; n++) {
        // Again each frame: a view or grid switch mid-export resets what the preview shows.
        viewport.setExporting(true);
        viewport.pose(frameAt(recipe, startFrame + n, o.drive));
        poseCamera(startFrame + n);
        renderer.render(viewport.scene, camera);
        if (n === 0) firstFrame = await deps.png(canvas);
        await writer.addFrame(canvas, n);
        if (n % 8 === 0) o.onProgress?.(n, frames);
      }
    } finally { viewport.setExporting(false); }
    mp4 = await writer.finish();
  } finally {
    writer?.close();
    renderer?.dispose();
    renderer?.forceContextLoss();   // the export's own context, now, not whenever the collector gets to it
  }
  o.onProgress?.(frames, frames);

  const hasAudio = !!channels;
  const files: Record<string, Uint8Array> = {
    [BUNDLE_FILES.video]: mp4.bytes,
    [BUNDLE_FILES.firstFrame]: firstFrame!,
    [BUNDLE_FILES.beats]: json(buildBeats(recipe, frames, startFrame, o.drive?.bands)),
    [BUNDLE_FILES.recipe]: json(recipe),
    [BUNDLE_FILES.meta]: json(buildMeta(recipe, { width, height, frames, view, audioInVideo: mp4.audioInVideo, hasAudio, startFrame, hasCamera: !!plan })),
    [BUNDLE_FILES.manifest]: json(buildManifest(hasAudio, !!plan)),
  };
  if (plan) files[BUNDLE_FILES.camera] = json(buildCameraTrack(plan, recipe, startFrame, frames, aspect, BUNDLE_SCHEMA_VERSION));
  if (channels && o.audio) files[BUNDLE_FILES.audio] = encodeWav(channels, o.audio.sampleRate, startSeconds, seconds);
  // MP4, PNG and WAV gain little from deflate; store them.
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.endsWith(".json") ? 6 : 0 }]])));
  return { zip, frames, mp4Bytes: mp4.bytes.length, audioInVideo: mp4.audioInVideo, codec: mp4.codec, files: Object.keys(files), contents: files };
}
