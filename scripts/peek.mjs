#!/usr/bin/env node
/** Dev helper: open the studio headless, turn on the rig and reactive moves, screenshot the views. Output: out/peek/. */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";
const OUT = new URL("../out/peek/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: new URL("../packages/studio/", import.meta.url).pathname, server: { port: 5182, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
// The port Vite actually took (it moves on when 5182 is busy), so the run never drives someone else's server.
const BASE = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${BASE}/`);
  await page.waitForSelector("#viewport canvas");
  await page.waitForFunction(() => document.querySelector("#clipPalette button"), null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  // With the example track (npm run examples writes it), the timeline shows waveform, energy and hits.
  const wav = new URL("../examples/bundles/example-track.wav", import.meta.url).pathname;
  if (existsSync(wav)) {
    await page.setInputFiles("#trackFile", { name: "example-track.wav", mimeType: "audio/wav", buffer: readFileSync(wav) });
    await page.waitForFunction(() => /detected|no clear tempo/.test(document.querySelector("#trackStatus").textContent));
    await page.fill("#lengthBeats", "32"); await page.dispatchEvent("#lengthBeats", "change");
  }
  // Markers are draggable: drag the first marker one beat later in the marker strip.
  await page.check("#reactOn");
  const before = await page.evaluate(() => JSON.parse(document.querySelector("#recipeJson").value).reactive?.markers?.length ?? 0);
  const sb = await page.locator("#strip").boundingBox();
  const lanesTop = 26 + 22 + 54 + 12;
  const rec = JSON.parse(await page.inputValue("#recipeJson"));
  const bpm = rec.beatGrid.bpm, off = rec.beatGrid.offsetSeconds, total = rec.durationBeats;
  await page.mouse.move(sb.x + sb.width * 16 / total, sb.y + lanesTop + 8);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 17 / total, sb.y + lanesTop + 8, { steps: 6 });
  await page.mouse.up();
  const after = JSON.parse(await page.inputValue("#recipeJson")).reactive?.markers ?? [];
  console.log("marker drag:", before, "stored markers before,", after.length, "after; one at", after.map(m => m.seconds).find(s => Math.abs((s - off) * bpm / 60 - 17) < 0.05) ?? "none", "s (beat 17)");
  await page.check("#rigOn");
  await page.check('#rigModes input[value="pushIn"]');
  for (const [v, x] of [["rig", 0.3], ["rig", 0.6], ["orbit", 0.5], ["top", 0.5]]) {
    await page.click(`[data-view="${v}"]`);
    const box = await page.locator("#strip").boundingBox();
    await page.click("#strip", { position: { x: box.width * x, y: box.height - 12 } });
    await page.locator("#viewport").screenshot({ path: `${OUT}${v}-${x}.png` });
  }
  // Draw a camera path in the top view: an arc in front of the character.
  await page.click("#drawPath");
  const vb = await page.locator("#viewport canvas").boundingBox();
  await page.mouse.move(vb.x + vb.width * 0.25, vb.y + vb.height * 0.75);
  await page.mouse.down();
  for (let k = 0; k <= 30; k++) {
    const a = Math.PI * (0.8 + 1.4 * k / 30);
    await page.mouse.move(vb.x + vb.width * (0.5 + 0.25 * Math.cos(a) * vb.height / vb.width * 1.6), vb.y + vb.height * (0.5 - 0.35 * Math.sin(a)));
  }
  await page.mouse.up();
  await page.locator("#viewport").screenshot({ path: `${OUT}path-top.png` });
  await page.click('[data-view="rig"]');
  await page.locator("#viewport").screenshot({ path: `${OUT}path-rig.png` });
  console.log("drawn path points:", JSON.parse(await page.inputValue("#recipeJson")).camera?.path?.length);
  // Viewing aids: skeleton, x-ray, onion skin, arcs; the move gizmo previewing a jump.
  await page.click('[data-view="front"]');
  for (const aid of ["bones", "xray", "onion", "arcs"]) await page.click(`[data-aid="${aid}"]`);
  await page.selectOption("#boneSelect", { index: 10 });
  await page.locator("#viewport").screenshot({ path: `${OUT}aids-front.png` });
  for (const aid of ["bones", "xray", "onion", "arcs"]) await page.click(`[data-aid="${aid}"]`);
  await page.click("#gizmoToggle");
  await page.hover('#gizmoList button:has-text("Sword")');
  await page.waitForTimeout(500);
  await page.locator("#viewport").screenshot({ path: `${OUT}gizmo.png` });
  await page.click("#gizmoToggle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}page.png`, fullPage: true });
  await page.locator(".stage").screenshot({ path: `${OUT}stage.png` });
  console.log(errors.length ? `errors: ${errors.join(" | ")}` : "no page errors");
} finally { await browser.close(); await server.close(); }
