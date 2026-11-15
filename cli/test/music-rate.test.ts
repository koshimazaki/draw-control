/**
 * Example 1's music decoded at two rates: the analysis is not rate-independent (the band analysis
 * works in windows of samples), so the CLI, the editor and the Gallery all decode at 44.1 kHz
 * (cli/src/audio-file.ts, packages/studio/src/audio.ts DECODE_RATE). This pins what 44.1 kHz finds
 * and documents what 48 kHz would have found instead. Needs ffmpeg (skipped without it).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyseSamples } from "../../packages/core/src/index.ts";

const mp3 = fileURLToPath(new URL("../../packages/studio/public/tracks/neon-rain-loop.mp3", import.meta.url));
const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();
const decode = (rate: number) => {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", mp3, "-f", "f32le", "-ac", "1", "-ar", String(rate), "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
};
const near = (list: number[], t: number) => list.some(x => Math.abs(x - t) < 0.03);

describe.skipIf(!hasFfmpeg)("Example 1's loop: the decode rate changes the analysis", () => {
  it("at 44.1 kHz: 107.5 BPM, and the kicks the turn and the moves land on", () => {
    const f = analyseSamples([decode(44100)], 44100), kicks = f.bands!.low.map(o => o.seconds);
    expect(f.lengthSeconds).toBeCloseTo(13.488, 2);
    expect(f.estimatedBpm).toBeCloseTo(107.5, 1);
    for (const t of [0.05, 2.31, 2.6, 3.43, 4.56, 5.67, 7.65, 7.93]) expect(near(kicks, t), `kick at ${t} s`).toBe(true);
  });
  it("at 48 kHz it reads another tempo and misses kicks (why every decode is at 44.1 kHz)", () => {
    const f = analyseSamples([decode(48000)], 48000), kicks = f.bands!.low.map(o => o.seconds);
    expect(Math.abs((f.estimatedBpm ?? 0) - 107.5)).toBeGreaterThan(5);
    expect([2.6, 3.43, 5.67, 7.65, 7.93].filter(t => !near(kicks, t)).length).toBeGreaterThan(0);
  });
});
