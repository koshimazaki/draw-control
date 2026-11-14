/** A generated clip beside the preview (result-sync.ts): it plays with the page, is corrected only on drift, and is read from a local copy. */
import { describe, expect, it } from "vitest";
import { DRIFT, followStep, localCopy } from "../src/beat-path/result-sync";

const clip = (time: number, paused: boolean, duration = 8) => ({ time, paused, duration });

describe("followStep", () => {
  it("lets a playing clip play: no seek while it is within the drift", () => {
    expect(followStep(clip(2.0, false), { time: 2.0 + DRIFT * 0.9, playing: true })).toEqual({});
  });
  it("puts a playing clip back once it drifts", () => {
    expect(followStep(clip(2.0, false), { time: 2.5, playing: true })).toEqual({ seek: 2.5 });
  });
  it("starts the clip when the page plays", () => {
    expect(followStep(clip(2.0, true), { time: 2.0, playing: true })).toEqual({ play: true });
    expect(followStep(clip(0, true), { time: 3, playing: true })).toEqual({ play: true, seek: 3 });
  });
  it("pauses with the page and shows the page's frame", () => {
    expect(followStep(clip(2.0, false), { time: 2.3, playing: false })).toEqual({ pause: true, seek: 2.3 });
    expect(followStep(clip(2.3, true), { time: 2.3, playing: false })).toEqual({});
  });
  it("never seeks a paused clip on every frame for the same time (the old stutter)", () => {
    let t = 1.0, seeks = 0;
    for (let i = 0; i < 60; i++) { const s = followStep(clip(t, true), { time: 1.0 + 1e-4 * i, playing: false }); if (s.seek !== undefined) { seeks++; t = s.seek; } }
    expect(seeks).toBe(0);
  });
  it("holds the last frame past the clip's end", () => {
    expect(followStep(clip(8, true, 8), { time: 9, playing: false })).toEqual({});
  });
});

describe("localCopy", () => {
  it("keeps a blob URL as it is", async () => {
    expect(await localCopy("blob:http://x/1")).toBe("blob:http://x/1");
  });
  it("fetches a link once and hands back a blob URL", async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response(new Blob([new Uint8Array(4)], { type: "video/mp4" })); }) as unknown as typeof fetch;
    const a = await localCopy("https://example.test/a.mp4", f), b = await localCopy("https://example.test/a.mp4", f);
    expect(a.startsWith("blob:")).toBe(true);
    expect(b).toBe(a);
    expect(calls).toBe(1);
  });
  it("plays the link itself when the page may not read it", async () => {
    const f = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await localCopy("https://example.test/no-cors.mp4", f)).toBe("https://example.test/no-cors.mp4");
  });
});
