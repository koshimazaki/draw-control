/**
 * The MP4 writer's close(): safe in every state, and it always releases both encoders.
 * WebCodecs is faked here (node has none): a closed codec throws on close(), as the real one does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMp4Writer } from "../src/export/mp4";

type Init = { output: (chunk: unknown, meta?: unknown) => void; error: (e: Error) => void };
class FakeCodec {
  static made: FakeCodec[] = [];
  static isConfigSupported = async () => ({ supported: true });
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  encodeQueueSize = 0;
  closes = 0;
  failEncode = false;
  constructor(readonly init: Init) { FakeCodec.made.push(this); }
  configure() { this.state = "configured"; }
  encode() { if (this.state !== "configured") throw new Error("InvalidStateError: encode"); if (this.failEncode) throw new Error("encode failed"); }
  async flush() { if (this.state !== "configured") throw new Error("InvalidStateError: flush"); }
  close() { if (this.state === "closed") throw new Error("InvalidStateError: close"); this.state = "closed"; this.closes++; }
  /** An encoder error, as WebCodecs reports it: the codec closes itself, then calls back. */
  die() { this.state = "closed"; this.init.error(new Error("hardware encoder lost")); }
}
class FakeVideo extends FakeCodec {}
class FakeAudio extends FakeCodec {}
class FakeData { closed = false; close() { this.closed = true; } }

const canvas = {} as HTMLCanvasElement;
const audio = { channels: [new Float32Array(48000), new Float32Array(48000)], sampleRate: 48000, startSeconds: 0, seconds: 1 };
const video = () => FakeCodec.made.find(c => c instanceof FakeVideo)!;
const audioEnc = () => FakeCodec.made.find(c => c instanceof FakeAudio);

beforeEach(() => {
  FakeCodec.made = [];
  vi.stubGlobal("VideoEncoder", FakeVideo);
  vi.stubGlobal("AudioEncoder", FakeAudio);
  vi.stubGlobal("VideoFrame", FakeData);
  vi.stubGlobal("AudioData", FakeData);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Mp4Writer.close()", () => {
  it("before any frame, and twice", async () => {
    const w = await createMp4Writer({ width: 64, height: 36, fps: 24 });
    expect(() => { w.close(); w.close(); }).not.toThrow();
    expect(video().state).toBe("closed");
    expect(video().closes).toBe(1);
    await expect(w.addFrame(canvas, 0)).rejects.toThrow(/closed/);
  });
  it("after frames", async () => {
    const w = await createMp4Writer({ width: 64, height: 36, fps: 24 });
    await w.addFrame(canvas, 0); await w.addFrame(canvas, 1);
    w.close();
    expect(video().closes).toBe(1);
  });
  it("after the encoder failed (it closed itself)", async () => {
    const w = await createMp4Writer({ width: 64, height: 36, fps: 24 });
    await w.addFrame(canvas, 0);
    video().die();
    await expect(w.addFrame(canvas, 1)).rejects.toThrow("hardware encoder lost");
    expect(() => w.close()).not.toThrow();
  });
  it("after an encode call throws: the frame is closed, and so is the encoder", async () => {
    const frames: FakeData[] = [];
    vi.stubGlobal("VideoFrame", class extends FakeData { constructor() { super(); frames.push(this); } });
    const w = await createMp4Writer({ width: 64, height: 36, fps: 24 });
    video().failEncode = true;
    await expect(w.addFrame(canvas, 0)).rejects.toThrow("encode failed");
    expect(frames.every(f => f.closed)).toBe(true);
    w.close();
    expect(video().state).toBe("closed");
  });
  it("when the audio fails mid-finish: the audio encoder is closed too", async () => {
    const w = await createMp4Writer({ width: 64, height: 36, fps: 24, audio });
    await w.addFrame(canvas, 0);
    const configure = FakeAudio.prototype.configure;
    vi.spyOn(FakeAudio.prototype, "configure").mockImplementation(function (this: FakeAudio) { configure.call(this); this.failEncode = true; });
    await expect(w.finish()).rejects.toThrow("encode failed");
    expect(audioEnc()?.state).toBe("configured");   // left open by the failure
    w.close();
    expect(audioEnc()?.state).toBe("closed");
    expect(video().state).toBe("closed");
    expect(() => w.close()).not.toThrow();
  });
});
