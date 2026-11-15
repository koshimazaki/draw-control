import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, validateRecipe } from "../../packages/core/src/index.ts";
import { checkRenderOptions, downloadOrFailure, EXPORT_FAILURE, render } from "../src/render.ts";

const recipe = validateRecipe(structuredClone(DEFAULT_RECIPE));
const out = join(mkdtempSync(join(tmpdir(), "ms-render-")), "bundle");
/** Listening servers and file watchers this process holds: a leaked Vite server shows up here. */
const handles = () => process.getActiveResourcesInfo().filter(r => /TCPServerWrap|FSEvent|StatWatcher/.test(r)).length;

describe("render: options are checked before anything starts", () => {
  it("refuses a start past the end, a start below zero and a length of zero, with the page's own reasons", () => {
    expect(() => checkRenderOptions(recipe, { out, start: 9999 })).toThrow(/start is past the end/);
    expect(() => checkRenderOptions(recipe, { out, start: -1 })).toThrow(/start must be zero or more/);
    expect(() => checkRenderOptions(recipe, { out, length: 0 })).toThrow(/length must be more than zero/);
    expect(() => checkRenderOptions(recipe, { out, start: 0, length: Number.NaN, unit: "seconds" })).toThrow(/length must be more than zero/);
  });
  it("refuses a bad size, view or unit and accepts a good set", () => {
    expect(() => checkRenderOptions(recipe, { out, size: "1280" })).toThrow(/--size/);
    expect(() => checkRenderOptions(recipe, { out, size: "0x720" })).toThrow(/--size/);
    expect(() => checkRenderOptions(recipe, { out, view: "fisheye" })).toThrow(/--view must be one of rig, front/);
    expect(() => checkRenderOptions(recipe, { out, unit: "bars" as "beats" })).toThrow(/--unit/);
    expect(checkRenderOptions(recipe, { out, size: "832x480", view: "iso", start: 2, length: 4, unit: "beats" })).toEqual({ width: 832, height: 480 });
  });
  it("render() rejects a bad range without starting a server or a browser", async () => {
    const before = handles(), t0 = Date.now();
    await expect(render(recipe, { out, start: -1 })).rejects.toThrow(/start must be zero or more/);
    await expect(render(recipe, { out, length: 0 })).rejects.toThrow(/length must be more than zero/);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(handles()).toBe(before);
  });
});

describe("render: the export fails fast", () => {
  const never = <T,>() => new Promise<T>(() => {});
  it("matches what the Export button writes when it gives up", () => {
    expect(EXPORT_FAILURE.test("Export range: Recipe: export range: start is past the end of the recipe")).toBe(true);
    expect(EXPORT_FAILURE.test("Export failed: VideoEncoder error")).toBe(true);
    expect(EXPORT_FAILURE.test("Rendering frame by frame…")).toBe(false);
    expect(EXPORT_FAILURE.test("Exported 105 frames from frame 0 (4.38 s, avc1), 1.2 MB zip.")).toBe(false);
  });
  it("throws the page's message as soon as it appears, without waiting for the download", async () => {
    const t0 = Date.now();
    await expect(downloadOrFailure(never(), Promise.resolve("Export failed: encoder closed"))).rejects.toThrow("render: the studio did not export: Export failed: encoder closed");
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it("returns the download when it comes first, and the loser's later rejection is swallowed", async () => {
    let rejectFailure!: (e: Error) => void;
    const failure = new Promise<string>((_, reject) => { rejectFailure = reject; });
    await expect(downloadOrFailure(Promise.resolve("zip"), failure)).resolves.toBe("zip");
    rejectFailure(new Error("Target page, context or browser has been closed"));
    await new Promise(r => setTimeout(r, 10));   // an unhandled rejection would fail the run here
  });
});

describe("render: a browser that will not start", () => {
  it("closes the Vite server and its watcher and reports how to fix it", async () => {
    const saved = process.env.CHROME_PATH;
    process.env.CHROME_PATH = join(tmpdir(), "no-such-chrome-binary");
    const before = handles();
    try {
      await expect(render(recipe, { out })).rejects.toThrow(/could not start Chrome.*CHROME_PATH/);
    } finally {
      if (saved === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = saved;
    }
    expect(handles()).toBe(before);
  });
});
