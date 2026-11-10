#!/usr/bin/env node
/**
 * Real-browser smoke test: starts the Vite dev server, drives the studio in headless
 * Google Chrome, loads a generated click track and a generated skinned character,
 * exports two guide bundles and checks their contents. Fixtures are synthetic.
 * Output: out/smoke/ (gitignored). Needs Google Chrome installed (or CHROME_PATH).
 *   npm run smoke
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { unzipSync, strFromU8 } from "fflate";

const OUT = new URL("../out/smoke/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const fail = msg => { console.error(`SMOKE FAIL: ${msg}`); process.exitCode = 1; };

/** 16-bit mono WAV click track: decaying noise bursts on each beat. */
function clickWav(bpm, offset, seconds, rate = 44100) {
  const n = Math.round(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  for (let beat = 0, t = offset; t < seconds; t += 60 / bpm, beat++) {
    const start = Math.round(t * rate), gain = beat % 4 === 0 ? 0.9 : 0.6;
    for (let i = 0; i < 0.04 * rate && start + i < n; i++) buf.writeInt16LE(Math.round(rand() * gain * Math.exp(-i / (0.008 * rate)) * 32767), 44 + (start + i) * 2);
  }
  return buf;
}

function checkBundle(zipBytes, label, expect) {
  const files = unzipSync(new Uint8Array(zipBytes));
  const names = Object.keys(files).sort();
  console.log(`${label}: ${names.join(", ")}`);
  for (const f of ["guide.mp4", "frame0.png", "beats.json", "recipe.json", "meta.json", "bundle.json"]) if (!files[f]) fail(`${label} missing ${f}`);
  const meta = JSON.parse(strFromU8(files["meta.json"]));
  const beats = JSON.parse(strFromU8(files["beats.json"]));
  if ((meta.frames - 1) % 8 !== 0) fail(`${label} frames ${meta.frames} not 8k+1`);
  if (meta.fps !== 24) fail(`${label} fps ${meta.fps}`);
  if (meta.character.kind !== expect.kind) fail(`${label} character ${meta.character.kind}`);
  if (meta.assets.some(a => !a.licence)) fail(`${label} asset without licence`);
  console.log(`${label}: ${meta.width}x${meta.height} ${meta.frames} frames, ${beats.bpm} BPM offset ${beats.offsetSeconds}s, audioInVideo=${meta.audioInVideo}`);
  const dir = `${OUT}${label}/`;
  mkdirSync(dir, { recursive: true });
  for (const [k, v] of Object.entries(files)) writeFileSync(dir + k, v);
  try {
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_name,codec_type,width,height,r_frame_rate,nb_read_frames,duration", "-of", "json", dir + "guide.mp4"]).toString());
    for (const s of probe.streams) console.log(`${label} ffprobe: ${JSON.stringify(s)}`);
    const v = probe.streams.find(s => s.codec_type === "video");
    if (v?.codec_name !== "h264") fail(`${label} video codec ${v?.codec_name}`);
    if (Number(v?.nb_read_frames) !== meta.frames) fail(`${label} decoded ${v?.nb_read_frames} frames, meta says ${meta.frames}`);
    if (expect.audio && !probe.streams.some(s => s.codec_type === "audio")) console.warn(`${label}: no audio stream in MP4 (WAV beside it)`);
  } catch (e) { console.warn(`ffprobe unavailable or failed: ${e.message}`); }
  return meta;
}

const server = await createServer({ root: new URL("../packages/studio/", import.meta.url).pathname, server: { port: 5181, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:5181/");
  await page.waitForSelector("#viewport canvas");
  console.log("WebCodecs:", await page.evaluate(() => ({ video: typeof VideoEncoder, audio: typeof AudioEncoder })));

  // 1. Music in: a 112 BPM click track, first beat at 0.2 s.
  await page.setInputFiles("#trackFile", { name: "click-112.wav", mimeType: "audio/wav", buffer: clickWav(112, 0.2, 12) });
  await page.waitForFunction(() => /detected|no clear tempo/.test(document.querySelector("#trackStatus").textContent));
  console.log("track:", await page.textContent("#trackStatus"));

  // 2. Moves on beats: replace the default with bounce, clap and kick, 4 beats each.
  await page.fill("#lengthBeats", "12"); await page.dispatchEvent("#lengthBeats", "change");
  for (const [beat, move] of [[0, "bounce"], [4, "clap"], [8, "kick"]]) {
    await page.fill("#cursorBeat", String(beat));
    await page.click(`[data-move="${move}"]`);
  }
  const recipe = JSON.parse(await page.inputValue("#recipeJson"));
  console.log("moves:", recipe.moves.map(m => `${m.name}@${m.atBeat}`).join(", "), "bpm", recipe.beatGrid.bpm);
  for (const v of ["front", "side", "top", "orbit", "iso"]) {
    await page.click(`[data-view="${v}"]`);
    await page.click("#next");
    await page.locator("#viewport").screenshot({ path: `${OUT}view-${v}.png` });
  }
  await page.click('[data-view="front"]');

  // 3. Export the mannequin bundle.
  let dl = page.waitForEvent("download", { timeout: 180_000 });
  await page.click("#export");
  let file = await (await dl).path();
  console.log("export:", await page.textContent("#exportStatus"));
  checkBundle((await import("node:fs")).readFileSync(file), "mannequin", { kind: "mannequin", audio: true });

  // 4. A loaded skinned character with embedded clips sequenced on beats.
  const glb = await page.evaluate(async () => Array.from(await (await window.__msDev()).syntheticCharacterGlb()));
  await page.setInputFiles("#characterFile", { name: "synthetic-figure.glb", mimeType: "model/gltf-binary", buffer: Buffer.from(glb) });
  await page.waitForFunction(() => /clip\(s\)/.test(document.querySelector("#characterStatus").textContent), null, { timeout: 20_000 });
  console.log("character:", await page.textContent("#characterStatus"));
  await page.fill("#lengthBeats", "8"); await page.dispatchEvent("#lengthBeats", "change");
  for (const [beat, clip] of [[0, "Idle"], [2, "Wave"], [5, "Kick"]]) {
    await page.fill("#cursorBeat", String(beat));
    await page.click(`#clipPalette button:has-text("${clip}")`);
  }
  await page.click('[data-view="iso"]');
  await page.locator("#viewport").screenshot({ path: `${OUT}file-iso.png` });
  dl = page.waitForEvent("download", { timeout: 180_000 });
  await page.click("#export");
  file = await (await dl).path();
  console.log("export:", await page.textContent("#exportStatus"));
  checkBundle((await import("node:fs")).readFileSync(file), "file", { kind: "file", audio: true });

  if (errors.length) fail(`page errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(process.exitCode ? "SMOKE: FAILED" : `SMOKE: OK (output in ${OUT})`);
