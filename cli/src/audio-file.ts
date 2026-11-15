/**
 * Decode a music file to float samples for the analysis: WAV (PCM 16/24/32-bit or 32-bit
 * float) is read directly; anything else (MP3, M4A, FLAC, OGG) goes through ffmpeg when
 * it is installed. Local only: nothing leaves the machine. The path must name an existing
 * regular file (not a URL or an ffmpeg protocol string such as `concat:` or `https://`), and
 * ffmpeg is held to the `file` protocol (`-protocol_whitelist file`), so a playlist inside
 * the file cannot fetch over the network either.
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
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

/** The absolute path of an existing regular local file, or an error naming `path`. */
export function localAudioPath(path: string): string {
  const abs = resolve(path);
  let isFile = false;
  try { isFile = statSync(abs).isFile(); } catch { /* reported below */ }
  if (isFile) return abs;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error(`${path} is not a local file: give a path on this machine, not a URL or an ffmpeg protocol`);
  throw new Error(`${path} is not an existing file`);
}

export function decodeAudioFile(path: string): Decoded {
  const abs = localAudioPath(path);
  if (/\.wav$/i.test(abs)) return readWav(new Uint8Array(readFileSync(abs)));
  let raw: Buffer;
  try {
    // `file:` + the absolute path: ffmpeg never reads a protocol prefix out of the name, and the whitelist keeps every nested open local.
    raw = execFileSync("ffmpeg", ["-v", "error", "-protocol_whitelist", "file", "-i", `file:${abs}`, "-f", "f32le", "-ac", "1", "-ar", "44100", "-"], { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    throw new Error(`could not decode ${path}: use a WAV file, or install ffmpeg for MP3/M4A/FLAC/OGG (${(e as Error).message.split("\n")[0]})`, { cause: e });
  }
  const n = Math.floor(raw.byteLength / 4);   // copied: the Buffer's offset need not be 4-byte aligned
  return { channels: [new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + n * 4))], sampleRate: 44100 };
}
