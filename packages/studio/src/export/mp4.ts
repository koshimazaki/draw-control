/**
 * H.264 MP4 through WebCodecs and mp4-muxer (MIT). Frames are pushed one at a time by
 * the caller, so the video is rendered deterministically rather than screen-captured.
 * AAC audio is muxed in when the browser can encode it; otherwise the caller ships
 * the WAV beside the video.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

/** Level 4.0 covers up to 1920×1080; level 5.1 is tried for larger custom sizes. */
const AVC_CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42002a", "avc1.42001f", "avc1.640033", "avc1.4d0033"];

export async function pickVideoConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig> {
  if (typeof VideoEncoder === "undefined") throw new Error("This browser has no WebCodecs VideoEncoder. Use a current Chrome or Edge.");
  for (const codec of AVC_CODECS) {
    const config: VideoEncoderConfig = { codec, width, height, framerate: fps, bitrate: 6_000_000, avc: { format: "avc" } };
    const support = await VideoEncoder.isConfigSupported(config).catch(() => null);
    if (support?.supported) return config;
  }
  throw new Error(`No H.264 encoder for ${width}×${height} in this browser.`);
}

async function pickAudioConfig(sampleRate: number, channels: number): Promise<AudioEncoderConfig | null> {
  if (typeof AudioEncoder === "undefined") return null;
  const config: AudioEncoderConfig = { codec: "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate: 192_000 };
  const support = await AudioEncoder.isConfigSupported(config).catch(() => null);
  return support?.supported ? config : null;
}

export type Mp4Writer = {
  /** Encode one rendered frame. Frame n is shown at n / fps seconds. */
  addFrame(canvas: HTMLCanvasElement, n: number): Promise<void>;
  finish(): Promise<{ bytes: Uint8Array; audioInVideo: boolean; codec: string }>;
  /** Release the encoders. Safe in any state: before a frame, mid-encode, after a failure, after `finish`, twice. */
  close(): void;
};

/** WebCodecs throws on closing a closed codec; a codec that already errored closes itself. */
function shut(codec: { state: CodecState; close(): void } | null) {
  if (!codec || codec.state === "closed") return;
  try { codec.close(); } catch { /* closed meanwhile (an error callback) */ }
}

export async function createMp4Writer(opts: {
  width: number; height: number; fps: number;
  /** `startSeconds` into the decoded track, `seconds` long: trimmed to the exported range. */
  audio?: { channels: Float32Array[]; sampleRate: number; startSeconds: number; seconds: number };
}): Promise<Mp4Writer> {
  const videoConfig = await pickVideoConfig(opts.width, opts.height, opts.fps);
  const channelCount = Math.min(2, opts.audio?.channels.length ?? 0);
  const audioConfig = opts.audio && channelCount ? await pickAudioConfig(opts.audio.sampleRate, channelCount) : null;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: opts.width, height: opts.height, frameRate: opts.fps },
    audio: audioConfig ? { codec: "aac", numberOfChannels: channelCount, sampleRate: audioConfig.sampleRate } : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let failure: unknown = null, closed = false;
  let audio: AudioEncoder | null = null;
  const video = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
  const close = () => { closed = true; shut(video); shut(audio); };
  try { video.configure(videoConfig); } catch (e) { close(); throw e; }
  const frameUs = 1_000_000 / opts.fps;
  const live = () => { if (closed) throw new Error("The MP4 writer is closed."); if (failure) throw failure; };

  return {
    async addFrame(canvas, n) {
      live();
      const frame = new VideoFrame(canvas, { timestamp: Math.round(n * frameUs), duration: Math.round(frameUs) });
      try { video.encode(frame, { keyFrame: n % (opts.fps * 2) === 0 }); } finally { frame.close(); }
      while (video.encodeQueueSize > 6 && !closed && !failure) await new Promise(r => setTimeout(r, 1));
      live();
    },
    async finish() {
      live();
      await video.flush();
      shut(video);
      let audioInVideo = false;
      if (audioConfig && opts.audio) {
        audio = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: e => { failure = e; } });
        await encodeAudio(audio, opts.audio, channelCount, audioConfig);
        shut(audio);
        audioInVideo = true;
      }
      live();
      muxer.finalize();
      closed = true;
      return { bytes: new Uint8Array(target.buffer), audioInVideo, codec: videoConfig.codec };
    },
    close,
  };
}

async function encodeAudio(encoder: AudioEncoder, audio: { channels: Float32Array[]; sampleRate: number; startSeconds: number; seconds: number },
  channelCount: number, config: AudioEncoderConfig) {
  encoder.configure(config);
  const total = Math.round(audio.seconds * audio.sampleRate);
  const from = Math.round(audio.startSeconds * audio.sampleRate);
  const block = audio.sampleRate; // one second per AudioData
  for (let start = 0; start < total; start += block) {
    const n = Math.min(block, total - start);
    const planar = new Float32Array(n * channelCount);
    for (let c = 0; c < channelCount; c++) {
      const src = audio.channels[c];
      for (let i = 0; i < n; i++) planar[c * n + i] = src[from + start + i] ?? 0;
    }
    const data = new AudioData({ format: "f32-planar", sampleRate: audio.sampleRate, numberOfFrames: n, numberOfChannels: channelCount,
      timestamp: Math.round(start / audio.sampleRate * 1_000_000), data: planar });
    try { encoder.encode(data); } finally { data.close(); }
  }
  await encoder.flush();
}
