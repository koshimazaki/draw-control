/**
 * Headless render: drives the studio in headless Google Chrome (the same path as
 * `npm run smoke`), loads the track and the recipe, picks the view, size, range and grid,
 * exports the guide bundle and unzips it into the output folder. Needs Chrome installed
 * (or CHROME_PATH) and the repo's dev dependencies (vite, playwright-core, fflate).
 * Local only: the dev server listens on 127.0.0.1.
 * The options are checked before a server or a browser starts, and an export the page
 * reports as failed (a refused range, an encoder error) fails at once instead of waiting
 * for a download that never comes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Recipe } from "../../packages/core/src/index.ts";
import { resolveExportRange } from "../../packages/core/src/internal.ts";

export type RenderOptions = { audio?: string; out: string; view?: string; size?: string; start?: number; length?: number; unit?: "beats" | "seconds"; grid?: boolean; log?: (s: string) => void };

export const RENDER_VIEWS = ["rig", "front", "side", "top", "orbit", "iso"] as const;
/** What the page's Export button writes to #exportStatus when it gives up (export/button.ts). */
export const EXPORT_FAILURE = /^Export (range|failed):/;
const EXPORT_TIMEOUT = 30 * 60_000;

/** Reject options the studio would refuse, before anything is started. Returns the parsed size. */
export function checkRenderOptions(recipe: Recipe, o: RenderOptions): { width: number; height: number } | undefined {
  if (recipe.character.kind === "file") throw new Error("render: a loaded GLB/FBX character is not available headless; use rigged, mannequin or block");
  if (o.view !== undefined && !(RENDER_VIEWS as readonly string[]).includes(o.view)) throw new Error(`render: --view must be one of ${RENDER_VIEWS.join(", ")}`);
  if (o.unit !== undefined && o.unit !== "beats" && o.unit !== "seconds") throw new Error("render: --unit must be beats or seconds");
  let size: { width: number; height: number } | undefined;
  if (o.size !== undefined) {
    const [w, h] = o.size.split("x").map(Number);
    if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0)) throw new Error("render: --size must look like 1280x720");
    size = { width: w, height: h };
  }
  if (o.start !== undefined || o.length !== undefined) {
    // The same resolver the page's Export button runs: start below zero, a length of zero or less, or a start past the end.
    try { resolveExportRange(recipe, { unit: o.unit ?? "beats", start: o.start ?? 0, length: o.length }); }
    catch (e) { throw new Error(`render: ${(e as Error).message.replace(/^Recipe: /, "")} (start ${o.start ?? 0}, length ${o.length ?? "to the end"} ${o.unit ?? "beats"})`, { cause: e }); }
  }
  return size;
}

/** The download, or an error as soon as the page reports the export failed; the loser never surfaces as an unhandled rejection. */
export async function downloadOrFailure<T>(download: Promise<T>, failure: Promise<string>): Promise<T> {
  download.catch(() => {});
  failure.catch(() => {});
  const first = await Promise.race([download.then(d => ({ ok: true as const, d })), failure.then(m => ({ ok: false as const, m }))]);
  if (!first.ok) throw new Error(`render: the studio did not export: ${first.m}`);
  return first.d;
}

export async function render(recipe: Recipe, o: RenderOptions): Promise<string[]> {
  const size = checkRenderOptions(recipe, o);
  const log = o.log ?? (() => {});
  const { createServer } = await import("vite");
  const { chromium } = await import("playwright-core");
  const { unzipSync } = await import("fflate");
  const root = new URL("../../packages/studio/", import.meta.url).pathname;
  const server = await createServer({ root, server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await server.listen();
    const url = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5180/";
    try { browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome", headless: true }); }
    catch (e) { throw new Error(`render: could not start Chrome (install Google Chrome, or set CHROME_PATH to a Chrome or Chromium binary): ${(e as Error).message.split("\n")[0]}`, { cause: e }); }
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector("#clipPalette button"), null, { timeout: 60_000 });
    if (o.audio) {
      // The track first (its analysis sets a detected tempo), then the recipe restores its own grid.
      await page.setInputFiles("#trackFile", { name: basename(o.audio), mimeType: "audio/wav", buffer: readFileSync(o.audio) });
      await page.waitForFunction(() => /detected|no clear tempo|Could not/.test(document.querySelector("#trackStatus")!.textContent ?? ""), null, { timeout: 120_000 });
      log(`track: ${await page.textContent("#trackStatus")}`);
    }
    await page.evaluate(() => { (document.querySelector("#recipeJson")!.closest("details") as HTMLDetailsElement).open = true; });
    await page.fill("#recipeJson", JSON.stringify(recipe));
    await page.click("#applyJson");
    const status = (await page.textContent("#jsonStatus")) ?? "";
    if (status) throw new Error(`render: the studio refused the recipe: ${status}`);
    if (recipe.character.kind === "rigged") await page.waitForFunction(() => document.querySelector("#character") && (document.querySelector("#character") as HTMLSelectElement).value === "rigged");
    const view = o.view ?? (recipe.camera ? "rig" : "front");
    await page.click(`[data-view="${view}"]`);
    if (size) {
      const { width: w, height: h } = size;
      const preset = await page.$(`#resolution option[value="${w}x${h}"]`);
      if (preset) await page.selectOption("#resolution", `${w}x${h}`);
      else { await page.selectOption("#resolution", "custom"); await page.fill("#customW", String(w)); await page.fill("#customH", String(h)); await page.dispatchEvent("#customH", "change"); }
    }
    if (o.grid) { await page.check("#grid"); await page.check("#gridExport"); }
    if (o.start !== undefined || o.length !== undefined) {
      await page.selectOption("#rangeUnit", o.unit ?? "beats");
      await page.fill("#rangeStart", String(o.start ?? 0));
      await page.fill("#rangeLength", o.length === undefined ? "" : String(o.length));
      await page.dispatchEvent("#rangeLength", "input");
      log(`range: ${await page.textContent("#rangeInfo")}`);
    }
    const warning = (await page.isVisible("#exportWarning")) ? await page.textContent("#exportWarning") : "";
    if (warning) log(`warning: ${warning}`);
    // A refused range or an encoder error leaves a message in #exportStatus and no download: race the two.
    await page.evaluate(() => { document.querySelector("#exportStatus")!.textContent = ""; });
    const download = page.waitForEvent("download", { timeout: EXPORT_TIMEOUT });
    const failure = page.waitForFunction(re => new RegExp(re).test(document.querySelector("#exportStatus")?.textContent ?? ""), EXPORT_FAILURE.source, { timeout: EXPORT_TIMEOUT, polling: 250 })
      .then(async () => (await page.textContent("#exportStatus")) ?? "export failed");
    await page.click("#export");
    const file = await (await downloadOrFailure(download, failure)).path();
    log(`export: ${await page.textContent("#exportStatus")}`);
    if (errors.length) log(`page errors: ${errors.join(" | ")}`);
    mkdirSync(o.out, { recursive: true });
    const files = unzipSync(new Uint8Array(readFileSync(file)));
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(o.out, name), bytes);
    return Object.keys(files).sort();
  } finally {
    await browser?.close();
    await server.close();
  }
}
