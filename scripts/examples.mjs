#!/usr/bin/env node
/**
 * Headless export of the example recipes (A, C, D) on a generated 48-beat track:
 * quiet intro, a build, the drop on beat 16, a loud section with off-grid hits, a quiet
 * outro. Drives the studio in headless Chrome exactly as a person would (load the track,
 * apply the recipe JSON, pick the Camera rig view, export), then checks each bundle.
 * Output: examples/recipes/<id>.json (committed) and examples/bundles/<id>/ (gitignored):
 * the unzipped bundle, a contact sheet, and for D the top and orbit path views.
 *   npm run examples            (all)       npm run examples -- D   (one)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { strFromU8, unzipSync } from "fflate";

const ROOT = new URL("../examples/", import.meta.url).pathname;
const only = process.argv.slice(2);
const fail = msg => { console.error(`EXAMPLES FAIL: ${msg}`); process.exitCode = 1; };
const BPM = 120, OFFSET = 0.25, BEATS = 48, RATE = 44100;
/** Off-grid hits in the loud section (beats): onsets that are not downbeats. */
const HITS = [18.5, 22.75, 26.5, 30.5, 34.75, 37.5];

function exampleTrack() {
  const seconds = OFFSET + BEATS * 60 / BPM, n = Math.round(seconds * RATE), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let seed = 11;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const out = new Float32Array(n);
  const beatOf = t => (t - OFFSET) * BPM / 60;
  // Pad: filtered noise whose level follows the song's shape.
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const b = beatOf(i / RATE);
    const level = b < 8 ? 0.03 : b < 16 ? 0.03 + 0.12 * (b - 8) / 8 : b < 40 ? 0.2 : 0.03;
    lp += (rand() - lp) * 0.08;
    out[i] = lp * level * 2.2;
  }
  const hit = (t, gain, decay) => {
    const s = Math.round(t * RATE);
    for (let i = 0; i < 0.12 * RATE && s + i < n; i++) out[s + i] += gain * Math.exp(-i / (decay * RATE)) * (Math.sin(2 * Math.PI * 70 * i / RATE) * 0.6 + rand() * 0.4);
  };
  for (let b = 0; b < BEATS; b++) {
    const quiet = b < 8 || b >= 40, build = b >= 8 && b < 16;
    const gain = quiet ? 0.12 : build ? 0.2 + 0.25 * (b - 8) / 8 : (b % 4 === 0 ? 0.75 : 0.5);
    hit(OFFSET + b * 60 / BPM, gain, 0.03);
  }
  for (const b of HITS) hit(OFFSET + b * 60 / BPM, 0.95, 0.05);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i])) * 32767), 44 + i * 2);
  return buf;
}

const server = await createServer({ root: new URL("../packages/studio/", import.meta.url).pathname, server: { port: 5183, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:5183/");
  await page.waitForSelector("#viewport canvas");
  const track = exampleTrack();
  mkdirSync(`${ROOT}bundles`, { recursive: true });
  writeFileSync(`${ROOT}bundles/example-track.wav`, track);
  await page.setInputFiles("#trackFile", { name: "example-track.wav", mimeType: "audio/wav", buffer: track });
  await page.waitForFunction(() => /detected|no clear tempo/.test(document.querySelector("#trackStatus").textContent));
  console.log("track:", await page.textContent("#trackStatus"));
  const examples = await page.evaluate(async () => (await window.__msDev()).exampleRecipes());
  mkdirSync(`${ROOT}recipes`, { recursive: true });
  for (const ex of examples) {
    if (only.length && !only.includes(ex.id)) continue;
    writeFileSync(`${ROOT}recipes/${ex.id}.json`, JSON.stringify(ex.recipe, null, 2) + "\n");
    await page.click('[data-view="front"]');
    // The JSON panel sits in a closed <details>: set it and press Apply through the DOM.
    await page.evaluate(json => { document.querySelector("#recipeJson").value = json; document.querySelector("#applyJson").click(); }, JSON.stringify(ex.recipe));
    const status = await page.textContent("#jsonStatus");
    if (status) fail(`${ex.id} recipe refused: ${status}`);
    await page.selectOption("#rangeUnit", ex.range.unit);
    await page.fill("#rangeStart", ex.range.start === undefined ? "" : String(ex.range.start));
    await page.fill("#rangeLength", ex.range.length === undefined ? "" : String(ex.range.length));
    await page.dispatchEvent("#rangeLength", "input");
    const dir = `${ROOT}bundles/${ex.id}/`;
    mkdirSync(dir, { recursive: true });
    // Path views first (preview only; the overlay never reaches the export).
    for (const v of ["top", "orbit"]) {
      await page.click(`[data-view="${v}"]`);
      await page.locator("#viewport").screenshot({ path: `${dir}paths-${v}.png` });
    }
    await page.click(`[data-view="${ex.view}"]`);
    console.log(`${ex.id}: ${ex.title} · ${await page.textContent("#rangeInfo")}`);
    const dl = page.waitForEvent("download", { timeout: 600_000 });
    await page.click("#export");
    const zip = readFileSync(await (await dl).path());
    console.log(`${ex.id}: ${await page.textContent("#exportStatus")}`);
    const files = unzipSync(new Uint8Array(zip));
    for (const [k, v] of Object.entries(files)) writeFileSync(dir + k, v);
    const meta = JSON.parse(strFromU8(files["meta.json"]));
    const manifest = JSON.parse(strFromU8(files["bundle.json"]));
    const camera = files["camera.json"] ? JSON.parse(strFromU8(files["camera.json"])) : null;
    if (!camera || manifest.camera !== "camera.json") fail(`${ex.id} has no camera track`);
    else {
      if (camera.track.length !== meta.frames) fail(`${ex.id} camera track ${camera.track.length} frames, video ${meta.frames}`);
      console.log(`${ex.id}: camera ${camera.track.length} frames, LTX ${camera.ltx.settings.cameraMovement} (approximate), scores ${JSON.stringify(camera.ltx.scores)}`);
    }
    if (meta.schemaVersion !== "0.2.0") fail(`${ex.id} schema ${meta.schemaVersion}`);
    try {
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v", "-show_entries", "stream=codec_name,width,height,nb_read_frames", "-of", "json", dir + "guide.mp4"]).toString()).streams[0];
      console.log(`${ex.id} ffprobe: ${JSON.stringify(probe)}`);
      if (Number(probe.nb_read_frames) !== meta.frames) fail(`${ex.id} decoded ${probe.nb_read_frames} frames, meta ${meta.frames}`);
      const picks = Array.from({ length: 8 }, (_, i) => Math.round(i * (meta.frames - 1) / 7));
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", dir + "guide.mp4", "-vf", `select='${picks.map(p => `eq(n\\,${p})`).join("+")}',scale=426:-1,tile=4x2`, "-frames:v", "1", dir + "sheet.png"]);
    } catch (e) { console.warn(`ffprobe/ffmpeg unavailable or failed: ${e.message}`); }
  }
  if (errors.length) fail(`page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(process.exitCode ? "EXAMPLES: FAILED" : `EXAMPLES: OK (bundles in ${ROOT}bundles/)`);
