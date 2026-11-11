/**
 * Guide bundle: the files `model-arena` reads. Pure builders for the JSON parts and
 * the WAV, so tests can check them against `schema/guide-bundle.schema.json`.
 * The schema is a pinned local copy, to be re-synced with `model-arena/packages/core`.
 */
import { beatAtSeconds, beatGridJson, secondsAtBeat, snapFrames8k1, type BeatsJson } from "./beats";
import { recipeSeconds, type Recipe } from "./recipe";

/** 0.2.0 adds the optional camera track (manifest `camera`, asset role "camera"). */
export const BUNDLE_SCHEMA_VERSION = "0.2.0";
export const GENERATOR = { name: "motion-studio", version: "0.1.0", motion: "local-time-stretch" } as const;
export const BUNDLE_FILES = {
  video: "guide.mp4", audio: "audio.wav", firstFrame: "frame0.png",
  beats: "beats.json", recipe: "recipe.json", meta: "meta.json", manifest: "bundle.json", camera: "camera.json",
} as const;

export type AssetRole = "video" | "audio" | "firstFrame" | "character" | "motion" | "recipe" | "beats" | "camera";
export type AssetLicence = { role: AssetRole; name: string; licence: string; file?: string };
export type BundleMeta = {
  schemaVersion: string;
  width: number; height: number; fps: number; frames: number; durationSeconds: number;
  view: string;
  character: { kind: Recipe["character"]["kind"]; name: string };
  generator: { name: string; version: string; motion: string };
  /** False when the audio could not be muxed into the MP4 and ships only beside it. */
  audioInVideo: boolean;
  assets: AssetLicence[];
};
export type BundleManifest = {
  schemaVersion: string;
  video: string; audio?: string; firstFrame: string; firstFrameStyled?: string;
  beats: string; recipe: string; meta: string;
  /** Optional camera track (schema 0.2.0), written when the export used the camera rig. */
  camera?: string;
};

/** Frame count for an export: the recipe length at 24 fps, rounded up to 8k+1. */
export function exportFrameCount(recipe: Recipe): number {
  return snapFrames8k1(recipeSeconds(recipe) * recipe.fps);
}

/**
 * Beats inside an exported clip of `frames` frames starting at recipe frame `startFrame`,
 * re-based so times count from the clip's frame 0. `offsetSeconds` becomes the time of
 * the first beat inside the clip; downbeats keep their place in the bar.
 */
export function buildBeats(recipe: Recipe, frames: number, startFrame = 0): BeatsJson {
  const g = recipe.beatGrid;
  if (startFrame === 0) {
    const count = Math.max(0, Math.floor((frames / recipe.fps - g.offsetSeconds) * g.bpm / 60 + 1e-9) + 1);
    return beatGridJson(g, count);
  }
  const from = startFrame / recipe.fps, to = (startFrame + frames) / recipe.fps;
  const first = Math.max(0, Math.ceil(beatAtSeconds(g, from) - 1e-9));
  const beats: number[] = [], downbeats: number[] = [];
  for (let i = first; secondsAtBeat(g, i) <= to + 1e-9; i++) {
    const t = Math.round((secondsAtBeat(g, i) - from) * 10000) / 10000;
    beats.push(t);
    if (i % g.beatsPerBar === 0) downbeats.push(t);
  }
  return { bpm: g.bpm, offsetSeconds: beats[0] ?? 0, beatsPerBar: g.beatsPerBar, source: g.source, beats, downbeats };
}

/**
 * The pinned schema has no field for the exported section yet, so a mid-recipe range is
 * recorded in the video asset's name (proposed for the next schema version: `meta.range`).
 */
export function videoAssetName(recipe: Recipe, startFrame: number, frames: number): string {
  if (startFrame === 0) return "Rendered guide";
  const s = (f: number) => (f / recipe.fps).toFixed(3);
  return `Rendered guide, recipe frames ${startFrame}-${startFrame + frames - 1} (${s(startFrame)}-${s(startFrame + frames)} s)`;
}

export function buildMeta(recipe: Recipe, opts: {
  width: number; height: number; frames: number; view: string; audioInVideo: boolean; hasAudio: boolean; startFrame?: number; hasCamera?: boolean;
}): BundleMeta {
  const own = "MIT (motion-studio)";
  const assets: AssetLicence[] = [
    { role: "video", name: videoAssetName(recipe, opts.startFrame ?? 0, opts.frames), licence: own, file: BUNDLE_FILES.video },
    { role: "firstFrame", name: "Frame 0", licence: own, file: BUNDLE_FILES.firstFrame },
    { role: "character", name: recipe.character.name, licence: recipe.character.licence },
    { role: "motion", name: recipe.reactive ? "Move library, engine and audio-reactive layer" : "Move library and engine", licence: own },
    { role: "recipe", name: "Recipe", licence: own, file: BUNDLE_FILES.recipe },
    { role: "beats", name: "Beat grid", licence: own, file: BUNDLE_FILES.beats },
  ];
  if (opts.hasCamera) assets.push({ role: "camera", name: "Audio-reactive camera track", licence: own, file: BUNDLE_FILES.camera });
  if (opts.hasAudio && recipe.audio) assets.splice(1, 0, { role: "audio", name: recipe.audio.name, licence: recipe.audio.licence, file: BUNDLE_FILES.audio });
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    width: opts.width, height: opts.height, fps: recipe.fps, frames: opts.frames,
    durationSeconds: Math.round(opts.frames / recipe.fps * 10000) / 10000,
    view: opts.view,
    character: { kind: recipe.character.kind, name: recipe.character.name },
    generator: { ...GENERATOR, motion: recipe.reactive ? "local-time-stretch+audio-reactive" : GENERATOR.motion },
    audioInVideo: opts.audioInVideo,
    assets,
  };
}

export function buildManifest(hasAudio: boolean, hasCamera = false): BundleManifest {
  const m: BundleManifest = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    video: BUNDLE_FILES.video, firstFrame: BUNDLE_FILES.firstFrame,
    beats: BUNDLE_FILES.beats, recipe: BUNDLE_FILES.recipe, meta: BUNDLE_FILES.meta,
  };
  if (hasAudio) m.audio = BUNDLE_FILES.audio;
  if (hasCamera) m.camera = BUNDLE_FILES.camera;
  return m;
}

/** 16-bit PCM WAV of a section of decoded audio (silence-padded past the end). */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number, startSeconds: number, durationSeconds: number): Uint8Array {
  const n = Math.max(0, Math.round(durationSeconds * sampleRate));
  const from = Math.round(startSeconds * sampleRate);
  const ch = Math.max(1, channels.length);
  const bytes = new Uint8Array(44 + n * ch * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ascii(0, "RIFF"); view.setUint32(4, 36 + n * ch * 2, true); ascii(8, "WAVE");
  ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c]?.[from + i] ?? 0));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return bytes;
}
