#!/usr/bin/env node
/**
 * Finish a generated clip offline: lay the original music over the model's video and cut the video
 * to the music's exact length. Example 1's guide and generation run 14 s, its loop 13.488 s: the
 * last half second of the guide is silent, and this step drops it.
 *
 *   npm run finish -- <video.mp4> <audio> --out <file.mp4> [--crf 16]
 *
 * The video is re-encoded (H.264, yuv420p) so the cut lands on a frame, not on the next keyframe a
 * stream copy would need; the audio is the original file, encoded to AAC. Both inputs must be local
 * files (no URLs or ffmpeg protocols). Prints the input and output durations. Needs ffmpeg and ffprobe.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const usage = "usage: npm run finish -- <video.mp4> <audio> --out <file.mp4> [--crf 16]";
function fail(msg) { console.error(`finish: ${msg}`); process.exit(1); }

/** The command line, read strictly: two inputs, --out, an optional --crf (0–51). */
export function parseFinishArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const k = a.slice(2);
    if (k !== "out" && k !== "crf") throw new Error(`unknown option ${a}\n${usage}`);
    if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
    opt[k] = argv[++i];
  }
  if (pos.length !== 2 || !opt.out) throw new Error(usage);
  const crf = opt.crf === undefined ? 16 : Number(opt.crf);
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) throw new Error("--crf takes a whole number from 0 to 51");
  for (const p of [...pos, opt.out]) if (/^[a-z][a-z0-9+.-]*:/i.test(p)) throw new Error(`${p} is not a local path: give a file on this machine, not a URL or an ffmpeg protocol`);
  return { video: pos[0], audio: pos[1], out: opt.out, crf };
}

/** The ffmpeg arguments: the video's first stream and the audio's, cut to `seconds`, re-encoded. */
export function finishCommand({ video, audio, out, crf }, seconds) {
  return ["-v", "error", "-y", "-protocol_whitelist", "file", "-i", `file:${resolve(video)}`, "-i", `file:${resolve(audio)}`,
    "-map", "0:v:0", "-map", "1:a:0", "-t", seconds.toFixed(6),
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", resolve(out)];
}

/** A file's duration in seconds (one stream type, or the container's). */
function duration(path, stream) {
  const args = ["-v", "error", "-protocol_whitelist", "file", ...(stream ? ["-select_streams", stream] : []), "-show_entries", stream ? "stream=duration" : "format=duration", "-of", "csv=p=0", `file:${resolve(path)}`];
  const v = Number.parseFloat(execFileSync("ffprobe", args, { encoding: "utf8" }).trim().split("\n")[0]);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`could not read the duration of ${path}`);
  return v;
}

function main() {
  let args;
  try { args = parseFinishArgs(process.argv.slice(2)); } catch (e) { fail(e.message); }
  for (const p of [args.video, args.audio]) if (!existsSync(p) || !statSync(p).isFile()) fail(`${p} is not a file`);
  try {
    const video = duration(args.video, "v:0"), audio = duration(args.audio);
    if (audio > video + 0.001) console.warn(`finish: the audio (${audio.toFixed(3)} s) is longer than the video (${video.toFixed(3)} s): the clip keeps the video's length`);
    const seconds = Math.min(video, audio);
    execFileSync("ffmpeg", finishCommand(args, seconds), { stdio: ["ignore", "inherit", "inherit"] });
    const outVideo = duration(args.out, "v:0"), outAudio = duration(args.out, "a:0");
    console.log(`video ${video.toFixed(3)} s, audio ${audio.toFixed(3)} s → ${args.out}: video ${outVideo.toFixed(3)} s, audio ${outAudio.toFixed(3)} s`);
  } catch (e) { fail(e.message.split("\n")[0]); }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
