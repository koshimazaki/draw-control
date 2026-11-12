#!/usr/bin/env node
/**
 * Real-browser smoke test: starts the Vite dev server, drives the studio in headless
 * Google Chrome, loads a generated click track and a generated skinned character,
 * exports two guide bundles and checks their contents. Fixtures are synthetic.
 * Covers: the 1280×720 default and the inline size and length warnings; a mid-track
 * range export (trimmed audio, re-based beats.json, ffprobe); the inline confirm that
 * clears library moves when switching to a loaded character; the Beat Path page (smoke-beat-path.mjs).
 * Output: out/smoke/ (gitignored). Needs Google Chrome installed (or CHROME_PATH).
 *   npm run smoke
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { unzipSync, strFromU8 } from "fflate";
import { smokeBands, smokeBlocks, smokeCameraPath, smokeEnvelope } from "./smoke-features.mjs";
import { smokeCameraTrack, smokeDemo } from "./smoke-camera.mjs";
import { smokeBeatPath } from "./smoke-beat-path.mjs";

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

/** Samples of a 16-bit PCM WAV, first channel, and its rate. */
function readWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = v.getUint16(22, true), rate = v.getUint32(24, true), n = v.getUint32(40, true) / 2 / channels;
  return { rate, n, at: i => v.getInt16(44 + i * channels * 2, true) / 32768 };
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
  if (expect.width && (meta.width !== expect.width || meta.height !== expect.height)) fail(`${label} size ${meta.width}x${meta.height}`);
  if (expect.frames && meta.frames !== expect.frames) fail(`${label} frames ${meta.frames}, expected ${expect.frames}`);
  if (expect.range) {
    // beats.json is re-based: the first beat sits within one frame of frame 0, and beats span the clip.
    if (!(beats.offsetSeconds >= 0 && beats.offsetSeconds < 1 / 24)) fail(`${label} beats offset ${beats.offsetSeconds} not re-based`);
    if (beats.beats.length !== expect.range.beats) fail(`${label} ${beats.beats.length} beats, expected ${expect.range.beats}`);
    if (beats.beats.at(-1) > meta.durationSeconds + 1e-6) fail(`${label} beat after the clip end`);
    if (!meta.assets[0].name.includes(expect.range.asset)) fail(`${label} range not recorded: ${meta.assets[0].name}`);
    // audio.wav is trimmed: its length matches the clip and its first click lands on the first beat.
    const wav = readWav(files["audio.wav"]);
    if (Math.abs(wav.n - Math.round(meta.durationSeconds * wav.rate)) > 1) fail(`${label} WAV ${wav.n} samples for ${meta.durationSeconds}s`);
    let first = -1;
    for (let i = 0; i < wav.n; i++) if (Math.abs(wav.at(i)) > 0.2) { first = i; break; }
    const click = first / wav.rate;
    console.log(`${label}: first click in audio.wav at ${click.toFixed(4)} s, first beat in beats.json at ${beats.offsetSeconds} s`);
    if (first < 0 || Math.abs(click - beats.offsetSeconds) > 0.012) fail(`${label} audio not trimmed to the range (click ${click}, beat ${beats.offsetSeconds})`);
  }
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
    if (expect.width && (v?.width !== expect.width || v?.height !== expect.height)) fail(`${label} ffprobe size ${v?.width}x${v?.height}`);
    const a = probe.streams.find(s => s.codec_type === "audio");
    if (expect.audio && !a) console.warn(`${label}: no audio stream in MP4 (WAV beside it)`);
    if (a && Math.abs(Number(a.duration) - meta.durationSeconds) > 0.1) fail(`${label} MP4 audio ${a.duration}s vs clip ${meta.durationSeconds}s`);
    if (expect.sheet) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", dir + "guide.mp4", "-vf", `select='${expect.sheet.map(n => `eq(n\\,${n})`).join("+")}',scale=426:-1,tile=4x2`, "-frames:v", "1", dir + "sheet.png"]);
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
  page.on("dialog", d => { errors.push(`browser dialog shown: ${d.message()}`); void d.dismiss(); });
  await page.goto("http://127.0.0.1:5181/");
  await page.waitForSelector("#viewport canvas");
  console.log("WebCodecs:", await page.evaluate(() => ({ video: typeof VideoEncoder, audio: typeof AudioEncoder })));
  // The rigged mannequin is the default; this run covers the procedural figure's library moves.
  await page.waitForFunction(() => document.querySelector("#clipPalette button"), null, { timeout: 30_000 });
  if (await page.inputValue("#character") !== "rigged") fail(`default character ${await page.inputValue("#character")}`);
  await page.screenshot({ path: `${OUT}rigged-default.png` });
  await page.selectOption("#character", "mannequin");
  if (await page.isVisible("#switchConfirm")) await page.click("#switchClear");
  const warning = async () => (await page.isVisible("#exportWarning")) ? await page.textContent("#exportWarning") : "";

  // 0. Export size: 1280×720 by default; a small custom size and a short clip warn but do not block.
  if (await page.inputValue("#resolution") !== "1280x720") fail(`default size ${await page.inputValue("#resolution")}`);
  if (await warning()) fail(`warning on the default export: ${await warning()}`);
  await page.selectOption("#resolution", "custom");
  await page.fill("#customW", "832"); await page.fill("#customH", "480"); await page.dispatchEvent("#customH", "change");
  if (!/height 480 px is under the 700 px minimum/.test(await warning())) fail(`no size warning: "${await warning()}"`);
  console.log("size warning:", await warning());
  await page.selectOption("#resolution", "1280x720");
  await page.selectOption("#rangeUnit", "beats");
  await page.fill("#rangeLength", "2");
  if (!/under the 3 s minimum/.test(await warning())) fail(`no length warning: "${await warning()}"`);
  if (await page.isDisabled("#export")) fail("export disabled by a warning");
  console.log("length warning:", await warning());
  await page.fill("#rangeLength", "");

  // 1. Music in: a 112 BPM click track, first beat at 0.2 s.
  await page.setInputFiles("#trackFile", { name: "click-112.wav", mimeType: "audio/wav", buffer: clickWav(112, 0.2, 12) });
  await page.waitForFunction(() => /detected|no clear tempo/.test(document.querySelector("#trackStatus").textContent));
  console.log("track:", await page.textContent("#trackStatus"));

  // 2. Moves on beats: replace the default with bounce, clap, bounce and kick, 4 beats each.
  await page.fill("#lengthBeats", "20"); await page.dispatchEvent("#lengthBeats", "change");
  for (const [beat, move] of [[0, "bounce"], [4, "clap"], [8, "bounce"], [12, "kick"]]) {
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
  // 2b. The abstract figures play the same recipe: switching keeps every move (no confirm).
  await page.fill("#cursorBeat", "13"); await page.dispatchEvent("#cursorBeat", "change");
  for (const figure of ["stick", "blob", "block", "mannequin"]) {
    await page.selectOption("#character", figure);
    const r = JSON.parse(await page.inputValue("#recipeJson"));
    if (await page.isVisible("#switchConfirm") || r.character.kind !== figure || JSON.stringify(r.moves) !== JSON.stringify(recipe.moves)) fail(`switching to ${figure} changed the moves`);
    await page.click("#next");
    await page.locator("#viewport").screenshot({ path: `${OUT}figure-${figure}.png` });
  }
  console.log("figures: stick, blob, block, mannequin play the same moves (screenshots figure-*.png)");

  // 3. Export a mid-track section of the mannequin at 1280×720: beats 8–16 of 20.
  //    Beat 8 is at 0.2 + 8 × 60/112 = 4.486 s → frame 107; 8 beats = 102.9 frames → 105 (8k+1).
  await page.fill("#rangeStart", "8"); await page.fill("#rangeLength", "8"); await page.dispatchEvent("#rangeLength", "input");
  console.log("range:", await page.textContent("#rangeInfo"));
  let dl = page.waitForEvent("download", { timeout: 180_000 });
  await page.click("#export");
  let file = await (await dl).path();
  console.log("export:", await page.textContent("#exportStatus"));
  checkBundle((await import("node:fs")).readFileSync(file), "mannequin", {
    kind: "mannequin", audio: true, width: 1280, height: 720, frames: 105,
    range: { beats: 9, asset: "recipe frames 107-211" }, sheet: [1, 7, 13, 19, 25, 31, 70, 82],
  });
  await page.fill("#rangeStart", ""); await page.fill("#rangeLength", ""); await page.dispatchEvent("#rangeLength", "input");
  // Portrait framing: the arms-out kick (beat 13.5) has to fit inside 720×1280 (checked by eye in portrait-kick.png).
  await page.selectOption("#resolution", "720x1280");
  const stripBox = await page.locator("#strip").boundingBox();
  await page.click("#strip", { position: { x: stripBox.width * 13.5 / 20, y: stripBox.height - 12 } });
  await page.locator("#viewport").screenshot({ path: `${OUT}portrait-kick.png` });
  await page.selectOption("#resolution", "1280x720");

  // 4. A loaded skinned character with embedded clips sequenced on beats.
  const glb = await page.evaluate(async () => Array.from(await (await window.__msDev()).syntheticCharacterGlb()));
  await page.setInputFiles("#characterFile", { name: "synthetic-figure.glb", mimeType: "model/gltf-binary", buffer: Buffer.from(glb) });
  await page.waitForFunction(() => /clip\(s\)/.test(document.querySelector("#characterStatus").textContent), null, { timeout: 20_000 });
  console.log("character:", await page.textContent("#characterStatus"));
  // 4a. The switch asks inline before clearing library moves; "Keep" leaves a valid recipe.
  const libraryMoves = async () => JSON.parse(await page.inputValue("#recipeJson")).moves.filter(m => !m.clip).length;
  if (!(await page.isVisible("#switchConfirm"))) fail("no inline confirm after switching to the loaded character");
  console.log("confirm:", await page.textContent("#switchConfirmText"));
  await page.click("#switchKeep");
  if (await page.isVisible("#switchConfirm") || (await libraryMoves()) !== 4) fail("Keep did not keep the library moves");
  await page.selectOption("#character", "mannequin");
  if (await page.isVisible("#switchConfirm")) fail("confirm shown with nothing to clear");
  await page.selectOption("#character", "file");
  await page.click("#switchClear");
  const afterClear = JSON.parse(await page.inputValue("#recipeJson"));
  if ((await libraryMoves()) !== 0 || afterClear.character.kind !== "file") fail("Clear left library moves in the recipe");
  console.log("after clear:", afterClear.moves.length, "moves, character", afterClear.character.kind);
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
  checkBundle((await import("node:fs")).readFileSync(file), "file", { kind: "file", audio: true, width: 1280, height: 720 });

  // 5. Editor features on a fresh page with the default rigged mannequin.
  await page.goto("http://127.0.0.1:5181/");
  await page.waitForFunction(() => document.querySelector("#clipPalette button"), null, { timeout: 30_000 });
  await smokeBands(page, { fail, OUT });
  await smokeBlocks(page, { fail, OUT });
  await smokeEnvelope(page, { fail, OUT });
  await smokeCameraPath(page, { fail, OUT, checkBundle });
  await smokeCameraTrack(page, { fail, OUT });
  await smokeDemo(page, { fail, OUT });

  if (errors.length) fail(`page errors: ${errors.join(" | ")}`);

  // 6. The Beat Path page (path.html): first run, a drawn path, lock on kick, a lane menu, a pasted script, an export.
  await smokeBeatPath(browser, "http://127.0.0.1:5181", { fail, OUT, SHOTS: new URL("../out/", import.meta.url).pathname });
} finally {
  await browser.close();
  await server.close();
}
console.log(process.exitCode ? "SMOKE: FAILED" : `SMOKE: OK (output in ${OUT})`);
