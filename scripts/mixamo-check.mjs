#!/usr/bin/env node
/**
 * Mixamo check: load the user's own clips from assets-local/mixamo/ (gitignored, never
 * committed) into the studio in headless Chrome, retarget each onto the rigged mannequin,
 * and write to out/mixamo-check/ (gitignored):
 *   <clip>-sheet.png   front (top row) and side (bottom row) at four frames;
 *   <clip>.mp4         the clip on the mannequin, front view, from the studio's export;
 *   metrics.json       hips height, planted-foot drift, arm direction error, wrist twist, scale.
 * Verdicts per clip go in docs/friction.md.   npm run mixamo-check
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { unzipSync } from "fflate";

const OUT = new URL("../out/mixamo-check/", import.meta.url).pathname;
const LOCAL = new URL("../assets-local/mixamo/", import.meta.url).pathname;
if (!existsSync(LOCAL) || !readdirSync(LOCAL).some(f => /\.(fbx|glb)$/i.test(f))) {
  console.log("MIXAMO CHECK: no clips in assets-local/mixamo/ (put your own Mixamo FBX files there).");
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });
const slug = name => name.replace(/^mixamo\//, "").replace(/[^\w-]+/g, "-").toLowerCase();
const server = await createServer({ root: new URL("../packages/studio/", import.meta.url).pathname, server: { port: 5184, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
// The port Vite actually took (it moves on when 5184 is busy), so the run never drives someone else's server.
const BASE = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome", headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => document.querySelector("#clipPalette button"), null, { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector("#mixamoLocal").hidden, null, { timeout: 10_000 });
  await page.click("#mixamoLocal");
  await page.waitForFunction(() => /Added|:/.test(document.querySelector("#mixamoStatus").textContent) && !/Retargeting/.test(document.querySelector("#mixamoStatus").textContent), null, { timeout: 120_000 });
  console.log("import:", await page.textContent("#mixamoStatus"));
  const clips = await page.evaluate(async () => (await window.__msDev()).mixamoNames());
  const metrics = [];
  for (const clip of clips) {
    const m = await page.evaluate(async name => (await window.__msDev()).mixamoCheck(name), clip.name);
    metrics.push(m);
    // One move playing the clip once at its own speed, no reactive layer (amplitude 1).
    const recipe = JSON.parse(await page.inputValue("#recipeJson"));
    const cycle = Math.round(clip.seconds * recipe.beatGrid.bpm / 60 * 10000) / 10000;
    const beats = Math.max(4, Math.min(16, Math.ceil(cycle)));
    const next = { ...recipe, durationBeats: beats, steps: undefined, energyCurve: undefined, reactive: undefined, camera: undefined,
      moves: [{ id: "check", name: clip.name, atBeat: 0, blendBeats: 1, loop: true, clip: clip.name, clipCycleBeats: Math.min(64, Math.max(0.25, cycle)),
        phases: [{ name: "clip", caption: clip.name, pose: "neutral", amplitude: 1, length: { beats: Math.min(64, Math.max(0.125, cycle)) }, previewFps: 24 }] }] };
    await page.evaluate(json => { document.querySelector("#recipeJson").value = json; document.querySelector("#applyJson").click(); }, JSON.stringify(next));
    const status = await page.textContent("#jsonStatus");
    if (status) { errors.push(`${clip.name}: ${status}`); continue; }
    const frames = Math.round((beats * 60 / recipe.beatGrid.bpm) * 24);
    const picks = [0, 0.25, 0.5, 0.75].map(f => Math.round(f * (frames - 1)));
    const tmp = `${OUT}tmp/`;
    rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
    let shot = 0;
    for (const view of ["front", "side"]) {
      await page.click(`[data-view="${view}"]`);
      await page.click("#tStart");
      let at = 0;
      for (const p of picks) {
        for (; at < p; at++) await page.click("#next");
        await page.waitForTimeout(50);
        await page.locator("#viewport").screenshot({ path: `${tmp}${String(shot++).padStart(2, "0")}.png` });
      }
    }
    const name = slug(clip.name);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", `${tmp}%02d.png`, "-vf", "scale=400:-1,tile=4x2", "-frames:v", "1", `${OUT}${name}-sheet.png`]);
    rmSync(tmp, { recursive: true, force: true });
    await page.click('[data-view="front"]');
    await page.selectOption("#rangeUnit", "beats");
    await page.fill("#rangeStart", ""); await page.fill("#rangeLength", "");
    await page.dispatchEvent("#rangeLength", "input");
    const dl = page.waitForEvent("download", { timeout: 300_000 });
    await page.click("#export");
    const files = unzipSync(new Uint8Array(readFileSync(await (await dl).path())));
    writeFileSync(`${OUT}${name}.mp4`, files["guide.mp4"]);
    console.log(`${clip.name}: ${JSON.stringify(m)}`);
  }
  writeFileSync(`${OUT}metrics.json`, JSON.stringify(metrics, null, 2) + "\n");
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) { console.error(`MIXAMO CHECK FAIL: ${errors.join(" | ")}`); process.exitCode = 1; }
else console.log(`MIXAMO CHECK: OK (${OUT})`);
