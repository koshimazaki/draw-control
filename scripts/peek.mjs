#!/usr/bin/env node
/** Dev helper: open the studio headless, turn on the rig and reactive moves, screenshot the views. Output: out/peek/. */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright-core";
const OUT = new URL("../out/peek/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: new URL("../packages/studio/", import.meta.url).pathname, server: { port: 5182, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:5182/");
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
  await page.check("#rigOn");
  await page.check('#rigModes input[value="pushIn"]');
  await page.check("#reactOn");
  for (const [v, x] of [["rig", 0.3], ["rig", 0.6], ["orbit", 0.5], ["top", 0.5]]) {
    await page.click(`[data-view="${v}"]`);
    const box = await page.locator("#strip").boundingBox();
    await page.click("#strip", { position: { x: box.width * x, y: box.height - 12 } });
    await page.locator("#viewport").screenshot({ path: `${OUT}${v}-${x}.png` });
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}page.png`, fullPage: true });
  await page.locator(".stage").screenshot({ path: `${OUT}stage.png` });
  console.log(errors.length ? `errors: ${errors.join(" | ")}` : "no page errors");
} finally { await browser.close(); await server.close(); }
