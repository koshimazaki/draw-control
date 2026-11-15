/** scripts/finish-clip.mjs (`npm run finish`): its command line and the ffmpeg arguments it builds. ffmpeg itself is not run here. */
import { describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs script, no type declarations
import { finishCommand, parseFinishArgs } from "../../scripts/finish-clip.mjs";

describe("npm run finish", () => {
  it("reads two inputs, --out and an optional --crf", () => {
    expect(parseFinishArgs(["take.mp4", "loop.mp3", "--out", "done.mp4"])).toEqual({ video: "take.mp4", audio: "loop.mp3", out: "done.mp4", crf: 16 });
    expect(parseFinishArgs(["take.mp4", "loop.mp3", "--out", "done.mp4", "--crf", "20"]).crf).toBe(20);
  });
  it("refuses a missing input or --out, an unknown option, a bad crf, and URLs or ffmpeg protocols", () => {
    expect(() => parseFinishArgs(["take.mp4", "--out", "done.mp4"])).toThrow(/usage/);
    expect(() => parseFinishArgs(["take.mp4", "loop.mp3"])).toThrow(/usage/);
    expect(() => parseFinishArgs(["take.mp4", "loop.mp3", "--out", "d.mp4", "--fast"])).toThrow(/unknown option/);
    expect(() => parseFinishArgs(["take.mp4", "loop.mp3", "--out", "d.mp4", "--crf", "60"])).toThrow(/crf/);
    expect(() => parseFinishArgs(["https://x/take.mp4", "loop.mp3", "--out", "d.mp4"])).toThrow(/not a local path/);
    expect(() => parseFinishArgs(["take.mp4", "concat:a|b", "--out", "d.mp4"])).toThrow(/not a local path/);
  });
  it("cuts to the given length, maps the video's picture and the audio's sound, and re-encodes", () => {
    const a = finishCommand({ video: "take.mp4", audio: "loop.mp3", out: "done.mp4", crf: 16 }, 13.488);
    expect(a.slice(a.indexOf("-t"), a.indexOf("-t") + 2)).toEqual(["-t", "13.488000"]);
    expect(a.join(" ")).toMatch(/-map 0:v:0 -map 1:a:0/);
    expect(a.join(" ")).toMatch(/-c:v libx264 .*-crf 16 .*-c:a aac/);
    expect(a).toContain("file");   // -protocol_whitelist file
  });
});
