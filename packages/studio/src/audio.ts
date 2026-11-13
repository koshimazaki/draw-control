/** Local-only audio: decode the user's track, analyse it, and play it in sync with the preview. */
import { analyseSamples, waveformMinMax, type AudioFeatures } from "@motion-studio/core/internal";

export type Track = { name: string; buffer: AudioBuffer; features: AudioFeatures; wave: ReturnType<typeof waveformMinMax> };

/** Decode and analyse a track; `stage` hears what it is doing. Long tracks analyse in a worker, so the page never freezes. */
export async function loadTrack(file: File, stage: (text: string) => void = () => {}): Promise<Track> {
  if (file.size > 150 * 1024 * 1024) throw new Error("Keep the track below 150 MB.");
  const ctx = new AudioContext();
  let buffer: AudioBuffer;
  try {
    stage(`Decoding ${file.name}…`);
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } finally { await ctx.close().catch(() => {}); }
  const m = Math.floor(buffer.duration / 60), sec = Math.round(buffer.duration % 60);
  stage(`Analysing ${file.name} (${m}:${String(sec).padStart(2, "0")}): kicks, snares, hats…`);
  if (buffer.duration < 30 || typeof Worker === "undefined") return trackFromBuffer(file.name, buffer);
  return analyseInWorker(file.name, buffer);
}

function analyseInWorker(name: string, buffer: AudioBuffer): Promise<Track> {
  // Copies go to the worker (the buffer keeps its own data for playback).
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice());
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./analyse-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ features?: AudioFeatures; wave?: ReturnType<typeof waveformMinMax>; error?: string }>) => {
      worker.terminate();
      if (e.data.error || !e.data.features || !e.data.wave) reject(new Error(e.data.error ?? "the analysis failed"));
      else resolve({ name, buffer, features: e.data.features, wave: e.data.wave });
    };
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message || "the analysis worker failed")); };
    worker.postMessage({ channels, sampleRate: buffer.sampleRate }, channels.map(c => c.buffer));
  });
}

/** Analyse a decoded buffer into a track. */
export function trackFromBuffer(name: string, buffer: AudioBuffer): Track {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return { name, buffer, features: analyseSamples(channels, buffer.sampleRate), wave: waveformMinMax(channels, buffer.sampleRate) };
}

/** A track from raw samples (a generated one): no decoding, no audio context, no user gesture needed. */
export function trackFromSamples(name: string, channels: Float32Array[], sampleRate: number): Track {
  const buffer = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate });
  channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return trackFromBuffer(name, buffer);
}

/** Plays a track from a time; `position()` is the transport clock while playing. */
export class Player {
  private ctx?: AudioContext;
  private source?: AudioBufferSourceNode;
  private startedAt = 0;
  private from = 0;
  private wallStart = 0;
  private rate = 1;
  playing = false;
  private gain?: GainNode;
  /** Silent playback: the clock still runs on the track. */
  muted = false;
  setMuted(on: boolean) { this.muted = on; if (this.gain) this.gain.gain.value = on ? 0 : 1; }

  /** Play from a time. Below 1× the preview runs silent on the wall clock (slow motion). */
  play(track: Track | null, fromSeconds: number, rate = 1) {
    this.stop();
    this.from = fromSeconds;
    this.rate = rate;
    this.playing = true;
    if (!track || rate !== 1) { this.wallStart = performance.now(); return; }
    this.ctx ??= new AudioContext();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = track.buffer;
    this.gain ??= this.ctx.createGain();
    this.gain.gain.value = this.muted ? 0 : 1;
    this.gain.connect(this.ctx.destination);
    this.source.connect(this.gain);
    this.startedAt = this.ctx.currentTime;
    this.source.start(0, fromSeconds);
  }
  stop() {
    this.source?.stop();
    this.source?.disconnect();
    this.source = undefined;
    this.playing = false;
  }
  /** Seconds into the track. Preview only; export never reads this clock. */
  position(): number {
    if (!this.playing) return this.from;
    if (this.source && this.ctx) return this.from + this.ctx.currentTime - this.startedAt;
    return this.from + (performance.now() - this.wallStart) / 1000 * this.rate;
  }
}
