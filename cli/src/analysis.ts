/**
 * analysis.json: what `motion-studio analyse` writes and every other command can read with
 * `--analysis`. It carries the tempo estimate, the drum-band onsets and peaks, and the RMS
 * envelopes the audio drive (energy, onsets, the low band) is rebuilt from, so commands that
 * read the music give the same result in the CLI, over MCP and in the studio.
 */
import { analyseSamples, buildDrive, type AudioDrive, type BandAnalysis } from "../../packages/core/src/index.ts";
import type { Decoded } from "./audio-file.ts";

export const ANALYSIS_VERSION = 1;
export type AnalysisJson = {
  version: number;
  source: string;
  sampleRate: number;
  lengthSeconds: number;
  /** Tempo estimate (null: no clear tempo) and the first beat. */
  bpm: number | null;
  offsetSeconds: number;
  hopSeconds: number;
  /** RMS envelope (0–1) per hop, and the low band's. */
  rms: number[];
  lowRms: number[];
  /** low = kick, mid = snare, high = hat; each { seconds, strength }. */
  bands: BandAnalysis;
};

const r4 = (x: number) => Math.round(x * 10000) / 10000;

export function analyse(decoded: Decoded, source: string): AnalysisJson {
  const f = analyseSamples(decoded.channels, decoded.sampleRate);
  return {
    version: ANALYSIS_VERSION, source, sampleRate: decoded.sampleRate, lengthSeconds: r4(f.lengthSeconds),
    bpm: f.estimatedBpm, offsetSeconds: f.estimatedOffsetSeconds, hopSeconds: f.hopSeconds,
    rms: Array.from(f.rms, r4), lowRms: Array.from(f.lowRms ?? [], r4), bands: f.bands!,
  };
}

export function parseAnalysis(text: string): AnalysisJson { return checkAnalysis(JSON.parse(text)); }

/** An already-parsed analysis.json, checked. */
export function checkAnalysis(json: unknown): AnalysisJson {
  const a = json as AnalysisJson;
  if (!a || a.version !== ANALYSIS_VERSION || !Array.isArray(a.rms) || !a.bands) throw new Error(`not a motion-studio analysis.json (version ${ANALYSIS_VERSION})`);
  return a;
}

/** The audio drive for a recipe at 24 fps, rebuilt from the analysis. */
export function driveFrom(a: AnalysisJson, fps = 24): AudioDrive {
  return buildDrive({ rms: Float32Array.from(a.rms), hopSeconds: a.hopSeconds, lowRms: a.lowRms.length ? Float32Array.from(a.lowRms) : undefined, bands: a.bands }, fps, Math.ceil(a.lengthSeconds * fps) + 1);
}
