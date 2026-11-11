/** Local-only audio: decode the user's track, analyse it, and play it in sync with the preview. */
import { analyseSamples, type AudioFeatures } from "@motion-studio/core";

export type Track = { name: string; buffer: AudioBuffer; features: AudioFeatures };

export async function loadTrack(file: File): Promise<Track> {
  if (file.size > 150 * 1024 * 1024) throw new Error("Keep the track below 150 MB.");
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    return { name: file.name, buffer, features: analyseSamples(channels, buffer.sampleRate) };
  } finally { await ctx.close().catch(() => {}); }
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
    this.source.connect(this.ctx.destination);
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
