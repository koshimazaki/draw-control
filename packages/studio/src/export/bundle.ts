/**
 * Render the guide bundle frame by frame and zip it:
 * guide.mp4, frame0.png, audio.wav, beats.json, recipe.json, meta.json, bundle.json.
 */
import { strToU8, zipSync } from "fflate";
import {
  BUNDLE_FILES, buildBeats, buildManifest, buildMeta, encodeWav, exportFrameCount, frameAt, type Recipe,
} from "@motion-studio/core";
import { makeRenderer, type Viewport } from "../viewport";
import { createMp4Writer } from "./mp4";

export type ExportOptions = {
  recipe: Recipe; viewport: Viewport; width: number; height: number;
  audio: AudioBuffer | null; onProgress?: (done: number, total: number) => void;
};
export type ExportResult = { zip: Uint8Array; frames: number; mp4Bytes: number; audioInVideo: boolean; codec: string; files: string[] };

const json = (x: unknown) => strToU8(JSON.stringify(x, null, 2) + "\n");
const pngBytes = (canvas: HTMLCanvasElement) => new Promise<Uint8Array>((resolve, reject) =>
  canvas.toBlob(b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject) : reject(new Error("PNG capture failed"))), "image/png"));

export async function exportBundle(o: ExportOptions): Promise<ExportResult> {
  const { recipe, viewport, width, height } = o;
  const frames = exportFrameCount(recipe);
  const seconds = frames / recipe.fps;
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
    audio: channels && o.audio ? { channels, sampleRate: o.audio.sampleRate, seconds } : undefined,
  });

  let firstFrame: Uint8Array | null = null;
  try {
    for (let n = 0; n < frames; n++) {
      viewport.pose(frameAt(recipe, n));
      renderer.render(viewport.scene, camera);
      if (n === 0) firstFrame = await pngBytes(canvas);
      await writer.addFrame(canvas, n);
      if (n % 8 === 0) o.onProgress?.(n, frames);
    }
  } finally { renderer.dispose(); }
  const mp4 = await writer.finish();
  o.onProgress?.(frames, frames);

  const hasAudio = !!channels;
  const files: Record<string, Uint8Array> = {
    [BUNDLE_FILES.video]: mp4.bytes,
    [BUNDLE_FILES.firstFrame]: firstFrame!,
    [BUNDLE_FILES.beats]: json(buildBeats(recipe, frames)),
    [BUNDLE_FILES.recipe]: json(recipe),
    [BUNDLE_FILES.meta]: json(buildMeta(recipe, { width, height, frames, view: viewport.view, audioInVideo: mp4.audioInVideo, hasAudio })),
    [BUNDLE_FILES.manifest]: json(buildManifest(hasAudio)),
  };
  if (channels && o.audio) files[BUNDLE_FILES.audio] = encodeWav(channels, o.audio.sampleRate, 0, seconds);
  // MP4, PNG and WAV gain little from deflate; store them.
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.endsWith(".json") ? 6 : 0 }]])));
  return { zip, frames, mp4Bytes: mp4.bytes.length, audioInVideo: mp4.audioInVideo, codec: mp4.codec, files: Object.keys(files) };
}
