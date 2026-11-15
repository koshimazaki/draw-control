/**
 * ffprobe / ffmpeg checks on an exported guide.mp4, shared by smoke.mjs and examples.mjs.
 * Only a missing tool (ENOENT) is a warning: an empty file, a file ffprobe cannot read and
 * an ffmpeg that fails on the clip are failures, so a corrupt guide.mp4 never ends in OK.
 *   node scripts/probe-guide.mjs <guide.mp4> [frames]   (checks one file, and its frame count when given; exit 1 on failure)
 */
import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const firstLine = e => String(e.stderr?.length ? e.stderr : e.message).trim().split("\n")[0];

/** The ffprobe streams of `path`, or null when ffprobe is not installed or the probe failed (reported through `fail`). */
export function probeStreams(path, label, fail, args = ["-show_entries", "stream=codec_name,codec_type,width,height,r_frame_rate,nb_read_frames,duration"]) {
  if (!existsSync(path) || statSync(path).size === 0) { fail(`${label} guide.mp4 is missing or empty (${path})`); return null; }
  try {
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", ...args, "-of", "json", path], { stdio: ["ignore", "pipe", "pipe"] }).toString());
    return Array.isArray(probe.streams) ? probe.streams : [];
  } catch (e) {
    if (e.code === "ENOENT") { console.warn(`ffprobe not installed: ${label} codec and frame checks skipped`); return null; }
    fail(`${label} ffprobe could not read ${path}: ${firstLine(e)}`);
    return null;
  }
}

/** Run ffmpeg (a contact sheet from the clip); a missing ffmpeg warns, a failing one is reported through `fail`. */
export function runFfmpeg(args, label, fail) {
  try { execFileSync("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) {
    if (e.code === "ENOENT") console.warn(`ffmpeg not installed: ${label} contact sheet skipped`);
    else fail(`${label} ffmpeg failed on the clip: ${firstLine(e)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  let failed = false;
  const streams = probeStreams(path, "guide", msg => { console.error(`PROBE FAIL: ${msg}`); failed = true; });
  const v = streams?.find(s => s.codec_type === "video");
  if (streams && !v) { console.error("PROBE FAIL: no video stream"); failed = true; }
  if (v) console.log(`video: ${v.codec_name} ${v.width}x${v.height}, ${v.nb_read_frames} frames`);
  if (v && process.argv[3] && Number(v.nb_read_frames) !== Number(process.argv[3])) { console.error(`PROBE FAIL: decoded ${v.nb_read_frames} frames, expected ${process.argv[3]}`); failed = true; }
  console.log(failed ? "PROBE: FAILED" : "PROBE: OK");
  process.exitCode = failed ? 1 : 0;
}
