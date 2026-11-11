/**
 * Decode a music file to float samples for the analysis: WAV (PCM 16/24/32-bit or 32-bit
 * float) is read directly; anything else (MP3, M4A, FLAC, OGG) goes through ffmpeg when
 * it is installed. Local only: nothing leaves the machine.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export type Decoded = { channels: Float32Array[]; sampleRate: number };

export function readWav(bytes: Uint8Array): Decoded {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a RIFF/WAVE file");
  let o = 12, format = 0, channels = 0, rate = 0, bits = 0, data = -1, size = 0;
  while (o + 8 <= bytes.length) {
    const id = tag(o), len = v.getUint32(o + 4, true);
    if (id === "fmt ") { format = v.getUint16(o + 8, true); channels = v.getUint16(o + 10, true); rate = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); if (format === 0xfffe) format = v.getUint16(o + 32, true); }
    if (id === "data") { data = o + 8; size = Math.min(len, bytes.length - data); break; }
    o += 8 + len + (len % 2);
  }
  if (data < 0 || !channels || !rate) throw new Error("WAV without fmt or data chunk");
  const bytesPer = bits / 8, frames = Math.floor(size / (bytesPer * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const at = data + (i * channels + c) * bytesPer;
    let x: number;
    if (format === 3 && bits === 32) x = v.getFloat32(at, true);
    else if (bits === 16) x = v.getInt16(at, true) / 32768;
    else if (bits === 24) x = ((v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getInt8(at + 2) << 16))) / 8388608;
    else if (bits === 32) x = v.getInt32(at, true) / 2147483648;
    else if (bits === 8) x = (v.getUint8(at) - 128) / 128;
    else throw new Error(`unsupported WAV: format ${format}, ${bits} bits`);
    out[c][i] = x;
  }
  return { channels: out, sampleRate: rate };
}

export function decodeAudioFile(path: string): Decoded {
  if (/\.wav$/i.test(path)) return readWav(new Uint8Array(readFileSync(path)));
  let raw: Buffer;
  try {
    raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "44100", "-"], { maxBuffer: 1 << 30 });
  } catch (e) {
    throw new Error(`could not decode ${path}: use a WAV file, or install ffmpeg for MP3/M4A/FLAC/OGG (${(e as Error).message.split("\n")[0]})`, { cause: e });
  }
  const n = Math.floor(raw.byteLength / 4);   // copied: the Buffer's offset need not be 4-byte aligned
  return { channels: [new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + n * 4))], sampleRate: 44100 };
}
