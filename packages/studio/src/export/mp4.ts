/**
 * H.264 MP4 through WebCodecs and mp4-muxer (MIT). Frames are pushed one at a time by
 * the caller, so the video is rendered deterministically rather than screen-captured.
 * AAC audio is muxed in when the browser can encode it; otherwise the caller ships
 * the WAV beside the video.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

const AVC_CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42002a", "avc1.42001f"];

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
};

export async function createMp4Writer(opts: {
  width: number; height: number; fps: number;
  audio?: { channels: Float32Array[]; sampleRate: number; seconds: number };
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
  let failure: unknown = null;
  const video = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
  video.configure(videoConfig);
  const frameUs = 1_000_000 / opts.fps;

  return {
    async addFrame(canvas, n) {
      if (failure) throw failure;
      const frame = new VideoFrame(canvas, { timestamp: Math.round(n * frameUs), duration: Math.round(frameUs) });
      video.encode(frame, { keyFrame: n % (opts.fps * 2) === 0 });
      frame.close();
      while (video.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 1));
    },
    async finish() {
      await video.flush();
      video.close();
      let audioInVideo = false;
      if (audioConfig && opts.audio) {
        await encodeAudio(opts.audio, channelCount, audioConfig, muxer);
        audioInVideo = true;
      }
      if (failure) throw failure;
      muxer.finalize();
      return { bytes: new Uint8Array(target.buffer), audioInVideo, codec: videoConfig.codec };
    },
  };
}

async function encodeAudio(audio: { channels: Float32Array[]; sampleRate: number; seconds: number },
  channelCount: number, config: AudioEncoderConfig, muxer: Muxer<ArrayBufferTarget>) {
  let failure: unknown = null;
  const encoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: e => { failure = e; } });
  encoder.configure(config);
  const total = Math.round(audio.seconds * audio.sampleRate);
  const block = audio.sampleRate; // one second per AudioData
  for (let start = 0; start < total; start += block) {
    const n = Math.min(block, total - start);
    const planar = new Float32Array(n * channelCount);
    for (let c = 0; c < channelCount; c++) {
      const src = audio.channels[c];
      for (let i = 0; i < n; i++) planar[c * n + i] = src[start + i] ?? 0;
    }
    const data = new AudioData({ format: "f32-planar", sampleRate: audio.sampleRate, numberOfFrames: n, numberOfChannels: channelCount,
      timestamp: Math.round(start / audio.sampleRate * 1_000_000), data: planar });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
}
