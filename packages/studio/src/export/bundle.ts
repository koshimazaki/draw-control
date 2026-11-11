/**
 * Render the guide bundle frame by frame and zip it:
 * guide.mp4, frame0.png, audio.wav, beats.json, recipe.json, meta.json, bundle.json, and
 * camera.json when the Camera rig view is exported.
 */
import { strToU8, zipSync } from "fflate";
import {
  BUNDLE_FILES, BUNDLE_SCHEMA_VERSION, buildBeats, buildCameraTrack, buildManifest, buildMeta, encodeWav, frameAt, resolveExportRange, type AudioDrive, type ExportRange, type Recipe,
} from "@motion-studio/core";
import { makeRenderer, type Viewport } from "../viewport";
import { createMp4Writer } from "./mp4";

export type ExportOptions = {
  recipe: Recipe;
  /** Section of the recipe to export; the whole recipe when omitted. */
  range?: ExportRange;
  viewport: Viewport; width: number; height: number;
  audio: AudioBuffer | null;
  /** The audio drive for the reactive layer and the rig (same one the preview used). */
  drive?: AudioDrive;
  onProgress?: (done: number, total: number) => void;
};
export type ExportResult = { zip: Uint8Array; frames: number; mp4Bytes: number; audioInVideo: boolean; codec: string; files: string[] };

const json = (x: unknown) => strToU8(JSON.stringify(x, null, 2) + "\n");
const pngBytes = (canvas: HTMLCanvasElement) => new Promise<Uint8Array>((resolve, reject) =>
  canvas.toBlob(b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject) : reject(new Error("PNG capture failed"))), "image/png"));

export async function exportBundle(o: ExportOptions): Promise<ExportResult> {
  const { recipe, viewport, width, height } = o;
  const range = o.range ?? resolveExportRange(recipe);
  const { frames, startFrame, startSeconds, seconds } = range;
  const channels = o.audio ? Array.from({ length: o.audio.numberOfChannels }, (_, i) => o.audio!.getChannelData(i)) : null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const camera = viewport.exportCamera(width / height);
  const writer = await createMp4Writer({
    width, height, fps: recipe.fps,
    audio: channels && o.audio ? { channels, sampleRate: o.audio.sampleRate, startSeconds, seconds } : undefined,
  });

  let firstFrame: Uint8Array | null = null;
  viewport.setExporting(true);
  try {
    for (let n = 0; n < frames; n++) {
      viewport.pose(frameAt(recipe, startFrame + n, o.drive));
      viewport.poseExportCamera(camera, startFrame + n, width / height);
      renderer.render(viewport.scene, camera);
      if (n === 0) firstFrame = await pngBytes(canvas);
      await writer.addFrame(canvas, n);
      if (n % 8 === 0) o.onProgress?.(n, frames);
    }
  } finally { renderer.dispose(); viewport.setExporting(false); }
  const mp4 = await writer.finish();
  o.onProgress?.(frames, frames);

  const hasAudio = !!channels;
  const plan = viewport.view === "rig" ? viewport.getRigPlan() : null;
  const files: Record<string, Uint8Array> = {
    [BUNDLE_FILES.video]: mp4.bytes,
    [BUNDLE_FILES.firstFrame]: firstFrame!,
    [BUNDLE_FILES.beats]: json(buildBeats(recipe, frames, startFrame)),
    [BUNDLE_FILES.recipe]: json(recipe),
    [BUNDLE_FILES.meta]: json(buildMeta(recipe, { width, height, frames, view: viewport.view, audioInVideo: mp4.audioInVideo, hasAudio, startFrame, hasCamera: !!plan })),
    [BUNDLE_FILES.manifest]: json(buildManifest(hasAudio, !!plan)),
  };
  if (plan) files[BUNDLE_FILES.camera] = json(buildCameraTrack(plan, recipe, startFrame, frames, width / height, BUNDLE_SCHEMA_VERSION));
  if (channels && o.audio) files[BUNDLE_FILES.audio] = encodeWav(channels, o.audio.sampleRate, startSeconds, seconds);
  // MP4, PNG and WAV gain little from deflate; store them.
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.endsWith(".json") ? 6 : 0 }]])));
  return { zip, frames, mp4Bytes: mp4.bytes.length, audioInVideo: mp4.audioInVideo, codec: mp4.codec, files: Object.keys(files) };
}
