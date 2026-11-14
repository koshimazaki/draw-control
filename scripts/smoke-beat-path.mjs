#!/usr/bin/env node
/**
 * Smoke step for the Beat Path page (path.html), run by scripts/smoke.mjs and on its own
 * (`node scripts/smoke-beat-path.mjs`, which starts its own dev server):
 * 1. the page opens with the demo track, the first example and lock on kick, and plays after one click;
 * 2. a subject path is drawn with the mouse on the map, lock set to kick, a lane block swapped by its menu;
 * 3. the example switcher (shapes, music, kept edits), scenery, Generate (faked in dev) with the output beside the preview;
 * 4. the guide is exported at 1280×720 (193 frames) and the bundle checked against the pinned schema;
 * 5. screenshots of both themes at 1280×720 and 1440×900 in out/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { smokeBeatPathMap } from "./smoke-beat-path-map.mjs";
import { smokeBeatPathHunt } from "./smoke-beat-path-hunt.mjs";
import { smokeBeatPathFollow } from "./smoke-beat-path-follow.mjs";
import { smokeBeatPathParallel } from "./smoke-beat-path-parallel.mjs";
import { smokeBeatPathSlice } from "./smoke-beat-path-slice.mjs";
import { smokeBeatPathRefs } from "./smoke-beat-path-refs.mjs";
import { smokeBeatPathImages } from "./smoke-beat-path-images.mjs";


export async function smokeBeatPath(browser, base, { fail, OUT, SHOTS }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio?.name === "generated-straight-120.wav", null, { timeout: 30_000 })
    .catch(async e => {
      const seen = await page.evaluate(() => ({ probe: !!window.__beatPath, audio: window.__beatPath?.recipe().audio ?? null, status: document.getElementById("status")?.textContent, url: window.location.href })).catch(x => x.message);
      throw new Error(`Beat Path did not load the demo (${e.message}); page: ${JSON.stringify(seen)}; page errors: ${errors.join(" | ") || "none"}`);
    });
  const probe = () => page.evaluate(() => ({ recipe: window.__beatPath.recipe(), state: window.__beatPath.state(), playing: window.__beatPath.playing(), head: window.__beatPath.head() }));
  let p = await probe();
  console.log(`beat path: first run ${p.recipe.character.kind}, ${p.recipe.durationBeats} beats, travel lock ${JSON.stringify(p.recipe.travelLock)}, camera ${p.recipe.camera.segments.map(s => s.modes.join("+")).join(" / ")}`);
  if (p.recipe.character.kind !== "glider" || p.recipe.travelLock?.lock !== "kick") fail("Beat Path did not open on the glider locked to the kicks");
  const noScroll = await page.evaluate(() => document.getElementById("editor").offsetHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1);
  if (!noScroll) fail("the Beat Path editor does not fit one screen at 1280×720");
  // A click on the picture plays (there is no overlay button any more).
  await page.click("#preview", { position: { x: 200, y: 120 } });
  await page.waitForTimeout(1500);
  p = await probe();
  if (!p.playing || p.head < 0.8) fail(`Beat Path is not playing after one click (head ${p.head})`);
  await page.screenshot({ path: `${SHOTS}beat-path-playing.png` });
  await page.click("#play");

  // Switching Side ↔ Top and Subject ↔ Camera keeps the drawn path on the map (no stale canvas).
  const orange = () => page.evaluate(() => {
    // Read a copy (made for readback), so the test never trips the page canvas's readback warning.
    const m = document.getElementById("map"), c = Object.assign(document.createElement("canvas"), { width: m.width, height: m.height });
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(m, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] > 200 && d[i + 1] > 90 && d[i + 1] < 180 && d[i + 2] < 110) n++; return n;
  });
  const orange0 = await orange();
  for (const sel of ['[data-control="view"] [data-value="side"]', '[data-control="view"] [data-value="top"]', '[data-control="tool"] [data-value="camera"]', '[data-control="tool"] [data-value="subject"]']) await page.click(sel);
  const orange1 = await orange();
  console.log(`beat path: path pixels on the map before ${orange0}, after Side/Top and Camera/Subject ${orange1}`);
  if (!orange0 || orange1 < orange0 * 0.8) fail("the drawn path faded from the map after switching views or tools");

  // Draw the subject's path with the mouse: a stroke from (-6, 4) through (0, -3) to (6, 3).
  await page.click('[data-control="tool"] [data-value="subject"]');
  const at = q => page.evaluate(q => window.__beatPath.mapPoint(q), q);
  // A stray click with the pen not armed never draws, and a camera tool click never rewrites the camera lane.
  const before = (await probe()).state;
  await page.click('[data-control="tool"] [data-value="camera"]');
  const empty = await at({ x: 8, z: 7 });
  await page.mouse.click(empty.x, empty.y);
  const after = (await probe()).state;
  if (JSON.stringify(after.camera) !== JSON.stringify(before.camera) || JSON.stringify(after.cameraLane) !== JSON.stringify(before.cameraLane)) fail("a stray map click changed the camera path or lane");
  await page.click('[data-control="tool"] [data-value="subject"]');
  await page.click("#clearPath");
  await page.click('[data-control="pen"] [data-value="draw"]');
  const stroke = [];
  for (let t = 0; t <= 1.0001; t += 0.05) stroke.push({ x: -6 + 12 * t, z: 4 - 14 * t + 13 * t * t });
  const first = await at(stroke[0]);
  await page.mouse.move(first.x, first.y); await page.mouse.down();
  for (const q of stroke.slice(1)) { const s = await at(q); await page.mouse.move(s.x, s.y, { steps: 3 }); }
  await page.mouse.up();
  // The character's lock chip: kick; the camera's own: snare.
  await page.click("#chipCharacter"); await page.click('#menu button:has-text("Lock to kick")');
  await page.click("#chipCamera"); await page.click('#menu button:has-text("Lock to snare")');
  p = await probe();
  if (p.recipe.camera.segments.some(s => s.lock !== "snare") || (await probe()).state.charLock.lock !== "kick") fail("the lane lock chips did not set kick for the character and snare for the camera");
  const pts = p.recipe.rootShape?.points ?? [];
  console.log(`beat path: drawn path ${p.state.subject.length} points, from (${pts[0]?.x},${pts[0]?.z}) to (${pts.at(-1)?.x},${pts.at(-1)?.z}); lock ${p.recipe.travelLock?.lock}`);
  if (p.state.subject.length < 3 || Math.abs(pts[0].x + 6) > 0.3 || Math.abs(pts.at(-1).x - 6) > 0.3 || p.recipe.travelLock?.lock !== "kick") fail("drawing the path on the map did not set the walk path");
  // Swap the first camera block to Top through its menu; undo brings it back.
  const lane0 = (await probe()).state.cameraLane;
  await page.click("#laneCamera .block >> nth=0");
  await page.click('#menu button:has-text("Top")');
  p = await probe();
  console.log(`beat path: camera lane ${p.state.cameraLane.map(b => `${b.word} ${b.from}-${b.to}`).join(", ")}`);
  if (p.recipe.camera.segments[0].modes[0] !== "top") fail("the lane menu did not make a top block");
  await page.keyboard.press("ControlOrMeta+z");
  p = await probe();
  if (JSON.stringify(p.state.cameraLane) !== JSON.stringify(lane0)) fail("undo did not take the block back");
  // A typed camera phrase in the block's popover; invalid words show inline.
  await page.click("#laneCamera .block >> nth=0");
  await page.fill(".menu-field input", "swoop around");
  await page.press(".menu-field input", "Enter");
  const refusal = await page.textContent(".menu-error");
  if (!/use one of/.test(refusal ?? "")) fail(`no inline refusal for an invalid phrase: ${refusal}`);
  await page.fill(".menu-field input", "over shoulder then go above");
  await page.press(".menu-field input", "Enter");
  p = await probe();
  console.log(`beat path: typed phrase → ${p.recipe.camera.segments.map(s => s.modes.join("+") + (s.shoulder ? " (shoulder)" : "")).join(" / ")}`);
  if (!p.recipe.camera.segments.some(s => s.shoulder) || !p.recipe.camera.segments.some(s => s.modes[0] === "top")) fail("the typed phrase did not make an over-shoulder then top block");
  // Delete removes the selected block; undo brings it back.
  const blocks = p.state.cameraLane.length;
  await page.click("#laneCamera .block >> nth=0"); await page.keyboard.press("Escape");
  const selected = await page.evaluate(() => JSON.stringify(window.__beatPath.selection()));
  await page.keyboard.press("Delete");
  if ((await probe()).state.cameraLane.length !== blocks - 1) fail(`Delete did not remove the selected camera block (selection ${selected}, ${blocks} blocks)`);
  await page.keyboard.press("ControlOrMeta+z");
  // A click on a kick marker mutes it (skipped by the lock); Reset markers restores.
  const kickAt = await page.evaluate(() => { const r = window.__beatPath.recipe(); return r.beatGrid.offsetSeconds + 2 * 60 / r.beatGrid.bpm; });
  const box = await page.locator("#wave").boundingBox(), clip = await page.evaluate(() => ({ t0: window.__beatPath.recipe().beatGrid.offsetSeconds, len: window.__beatPath.state().clip }));
  await page.mouse.click(box.x + (kickAt - clip.t0) / clip.len * box.width, box.y + 6);
  const muted = (await probe()).recipe.mutedHits ?? [];
  console.log(`beat path: muted hits ${JSON.stringify(muted)}`);
  if (!muted.length) fail("clicking a kick marker did not mute it");
  await page.click("#resetMarkers");
  if ((await probe()).recipe.mutedHits) fail("Reset markers did not restore the hits");

  // Blocks: draw a block, move it, duplicate, delete, undo (the preset's boxes become explicit on the first edit).
  await page.click('[data-control="tool"] [data-value="blocks"]');
  await page.click('[data-control="pen"] [data-value="draw"]');
  // Example 1's placed blocks (round 8) leave this corner clear, between the block row and the camera's street.
  const a = await at({ x: -18, z: 12 }), b = await at({ x: -14, z: 15 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  let boxes = (await probe()).state.boxes ?? [];
  const added = boxes.at(-1);
  console.log(`beat path: blocks tool drew ${JSON.stringify(added)} (${boxes.length} boxes)`);
  if (!added || Math.abs(added.w - 4) > 0.3 || Math.abs(added.d - 3) > 0.3) fail("the Blocks tool did not draw a 4 × 3 m block");
  await page.click('[data-control="pen"] [data-value="edit"]');
  const mid = await at({ x: -16, z: 13.5 }), to = await at({ x: -13, z: 13.5 });
  await page.mouse.move(mid.x, mid.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  boxes = (await probe()).state.boxes;
  if (Math.abs(boxes.at(-1).x + 13) > 0.3) fail(`dragging the block did not move it (x ${boxes.at(-1).x})`);
  await page.keyboard.press("ControlOrMeta+d");
  if ((await probe()).state.boxes.length !== boxes.length + 1) fail("Cmd/Ctrl-D did not duplicate the block");
  await page.keyboard.press("Delete");
  if ((await probe()).state.boxes.length !== boxes.length) fail("Delete did not remove the block");
  await page.mouse.move(mid.x, mid.y);
  await page.screenshot({ path: `${SHOTS}beat-path-blocks.png` });
  // Example 3's camera follows its lane (no drawn path): the camera tool says so.
  await page.click('[data-control="example"] [data-value="2"]');
  await page.click('[data-control="tool"] [data-value="camera"]');
  const hint = await page.textContent("#mapHint");
  if (!/camera follows the Camera lane/.test(hint ?? "")) fail(`the camera tool does not say the camera follows the lane: ${hint}`);
  await page.click('[data-control="tool"] [data-value="subject"]');

  // Every example loads framed: each path point, camera-track point and scenery box inside the map.
  for (const ex of ["1", "2", "0"]) {
    await page.click(`[data-control="example"] [data-value="${ex}"]`);
    await page.waitForTimeout(400);
    const inside = await page.evaluate(() => window.__beatPath.mapInside());
    if (!inside) fail(`Example ${Number(ex) + 1} does not fit the map after loading`);
    await page.screenshot({ path: `${SHOTS}beat-path-fit-example-${Number(ex) + 1}.png` });
  }
  console.log("beat path: every example framed on the map after loading");

  // The example switcher: each example brings its own figure shape and music; edits stay with their example.
  const edited = (await probe()).state.subject;
  await page.click('[data-control="example"] [data-value="1"]');
  await page.waitForFunction(() => window.__beatPath.recipe().figure?.shape === "runner" && window.__beatPath.recipe().beatGrid.bpm > 130, null, { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}beat-path-example-2.png` });
  await page.click('[data-control="example"] [data-value="2"]');
  await page.waitForFunction(() => window.__beatPath.recipe().figure?.shape === "car" && window.__beatPath.recipe().beatGrid.bpm < 110, null, { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}beat-path-example-3.png` });
  await page.click('[data-control="example"] [data-value="0"]');
  await page.waitForFunction(() => window.__beatPath.recipe().figure?.shape === "flyer", null, { timeout: 30_000 });
  p = await probe();
  console.log(`beat path: examples switch: runner 140, car 100, back to flyer (${p.recipe.beatGrid.bpm} BPM), edits kept ${JSON.stringify(p.state.subject) === JSON.stringify(edited)}`);
  if (JSON.stringify(p.state.subject) !== JSON.stringify(edited)) fail("switching examples lost the edits of Example 1");
  // Scenery: the Settings chevron, scenery none and back to city.
  await page.click("#settings summary");
  await page.selectOption("#scenery", "none");
  if ((await probe()).recipe.scenery !== "none") fail("the scenery picker did not set none");
  await page.selectOption("#scenery", "city");
  if ((await probe()).recipe.scenery !== "city") fail("the scenery picker did not set city");

  // Export the guide.
  const dl = page.waitForEvent("download", { timeout: 180_000 });
  if (!(await page.isVisible("#exportGuide"))) await page.click("#settings summary");
  await page.click("#exportGuide");
  const zip = unzipSync(new Uint8Array(readFileSync(await (await dl).path())));
  const meta = JSON.parse(strFromU8(zip["meta.json"])), manifest = JSON.parse(strFromU8(zip["bundle.json"]));
  const { Ajv2020 } = await import("ajv/dist/2020.js");
  const ajv = new Ajv2020({ strict: false });
  ajv.addSchema(JSON.parse(readFileSync(new URL("../schema/guide-bundle.schema.json", import.meta.url), "utf8")));
  const ok = ajv.validate("guide-bundle.schema.json", manifest) && ajv.validate("guide-bundle.schema.json#/$defs/meta", meta)
    && ajv.validate("guide-bundle.schema.json#/$defs/beats", JSON.parse(strFromU8(zip["beats.json"]))) && ajv.validate("guide-bundle.schema.json#/$defs/camera", JSON.parse(strFromU8(zip["camera.json"])));
  console.log(`beat path export: ${Object.keys(zip).sort().join(", ")}; ${meta.width}x${meta.height} ${meta.frames} frames, ${meta.character.kind}, schema ${meta.schemaVersion} ${ok ? "validates" : `does NOT validate: ${ajv.errorsText()}`}`);
  const exported = JSON.parse(strFromU8(zip["recipe.json"]));
  if (!ok || meta.frames !== 193 || meta.width !== 1280 || meta.character.kind !== "glider" || meta.schemaVersion !== "0.5.0" || !exported.landmarks?.on || exported.figure?.shape !== "flyer" || !exported.shot?.subject) fail("the Beat Path bundle is wrong");
  await page.click("#settings summary");
  mkdirSync(`${OUT}beat-path/`, { recursive: true });
  for (const [k, v] of Object.entries(zip)) writeFileSync(`${OUT}beat-path/${k}`, v);

  // The bundle in memory (for the Generate section), the sections below the editor.
  const mem = await page.evaluate(async () => { const g = await window.beatPath.exportGuideInMemory(); return { files: Object.fromEntries(Object.entries(g.files).map(([k, b]) => [k, b.size])), prompt: g.prompt, shot: g.shot }; });
  console.log(`beat path: in-memory bundle ${Object.keys(mem.files).sort().join(", ")}; prompt "${mem.prompt}"`);
  if (!mem.files["guide.mp4"] || !mem.files["recipe.json"] || !mem.prompt) fail("exportGuideInMemory did not return the bundle's files and the prompt");
  if (/\(-?\d|lock (beat|kick|snare)|punch \d/.test(mem.prompt)) fail(`script words in the prompt: ${mem.prompt}`);
  // Generate (faked in dev): the output pane appears beside the preview, with a divider.
  // Generate through the vendored embed with its fake provider (dev): the page's own cost dialog, then the result player.
  await page.waitForFunction(() => document.querySelector("#keySlot arena-key"), null, { timeout: 30_000 });
  await page.click("#runGenerate");
  await page.waitForSelector("#costDialog:not([hidden])", { timeout: 120_000 });
  console.log(`beat path: cost dialog: ${await page.textContent("#costText")}`);
  await page.click("#costOk");
  await page.waitForFunction(() => !document.getElementById("screenOutput").hidden && document.querySelector("#generateSlot arena-player"), null, { timeout: 120_000 });
  if (await page.isHidden("#addToGallery")) fail("no Add to gallery after a result");
  await page.click("#addToGallery");
  if (await page.isHidden("#divider")) fail("no divider between the preview and the output");
  // The transport bar under the screens: play and pause from it; scrub to the middle while paused, and the
  // preview, the output player and the music playhead agree within a frame; a click on the video toggles play twice.
  // The result plays with the page (not scrubbed by a seek on every frame): count its seeks while playing.
  await page.evaluate(() => { const v = document.querySelector("#generateSlot arena-player").video; window.__seeks = 0; v.addEventListener("seeking", () => { window.__seeks++; }); });
  await page.click("#barPlay");
  await page.waitForTimeout(1500);
  if (!(await probe()).playing) fail("the transport bar did not start playback");
  const out = await page.evaluate(() => { const v = document.querySelector("#generateSlot arena-player").video; return { paused: v.paused, seeks: window.__seeks, src: v.currentSrc.slice(0, 5) }; });
  console.log(`beat path: output while playing 1.5 s: paused ${out.paused}, seeks ${out.seeks}, source ${out.src}…`);
  if (out.paused || out.seeks > 3) fail(`the output does not play with the page (paused ${out.paused}, ${out.seeks} seeks in 1.5 s)`);
  await page.click("#barPlay");
  if ((await probe()).playing) fail("the transport bar did not pause");
  await page.evaluate(() => { const s = document.getElementById("scrub"); s.value = "0.5"; s.dispatchEvent(new window.Event("input", { bubbles: true })); });
  await page.waitForTimeout(300);
  const clocks = await page.evaluate(() => ({ head: window.__beatPath.head(), shown: window.__beatPath.shown(), t0: window.__beatPath.recipe().beatGrid.offsetSeconds, clip: window.__beatPath.state().clip,
    output: document.querySelector("#generateSlot arena-player")?.currentTime ?? null }));
  const middle = clocks.t0 + clocks.clip / 2;
  console.log(`beat path: scrubbed to the middle: playhead ${clocks.head.toFixed(3)} s, preview ${clocks.shown.toFixed(3)} s, output ${clocks.output?.toFixed(3)} s (clip time), middle ${middle.toFixed(3)} s`);
  if (Math.abs(clocks.head - middle) > 1 / 24 || Math.abs(clocks.shown - clocks.head) > 1 / 24 || clocks.output === null || Math.abs(clocks.output - (clocks.head - clocks.t0)) > 1 / 24) fail("scrubbing did not move the preview, the output and the playhead together");
  await page.click("#preview", { position: { x: 60, y: 140 } });
  await page.waitForTimeout(400);
  const playingAfterOne = (await probe()).playing;
  await page.click("#preview", { position: { x: 60, y: 140 } });
  if (!playingAfterOne || (await probe()).playing) fail("clicking the video did not toggle play twice");
  await page.screenshot({ path: `${SHOTS}beat-path-generated.png` });
  if (!(await page.isVisible("#gallery h2"))) fail("no gallery section");
  // No track: a plain timed clip that still plays and exports.
  await page.click("#removeTrack");
  if ((await probe()).recipe.audio) fail("Remove did not take the track off");
  await page.click('[data-control="example"] [data-value="1"]');
  await page.click('[data-control="example"] [data-value="0"]');
  await page.waitForFunction(() => window.__beatPath.recipe().audio, null, { timeout: 30_000 });

  // Themes and sizes.
  await page.goto(`${base}/path.html?theme=runware`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
  await page.click("#barPlay"); await page.waitForTimeout(1200); await page.click("#play");
  await page.screenshot({ path: `${SHOTS}beat-path-runware.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const fits = await page.evaluate(() => document.getElementById("editor").offsetHeight <= window.innerHeight + 1);
  if (!fits) fail("the Beat Path editor does not fit one screen at 1440×900");
  await page.screenshot({ path: `${SHOTS}beat-path-runware-1440.png` });
  await page.evaluate(() => document.getElementById("gallery").scrollIntoView());
  await page.waitForFunction(() => document.querySelectorAll("#gallerySlot .gallery-row video").length >= 3, null, { timeout: 120_000 }).catch(() => fail("the gallery rows did not render their guides"));
  await page.locator("#gallery").screenshot({ path: `${SHOTS}beat-path-gallery-rows.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}beat-path-runware-full.png`, fullPage: true });
  if (errors.length) fail(`Beat Path page errors: ${errors.join(" | ")}`);
  await page.close();
  await smokeBeatPathMap(browser, base, { fail, SHOTS });
  await smokeBeatPathHunt(browser, base, { fail });
  await smokeBeatPathFollow(browser, base, { fail, SHOTS });
  await smokeBeatPathParallel(browser, base, { fail, SHOTS });
  await smokeBeatPathSlice(browser, base, { fail, OUT, SHOTS });
  await smokeBeatPathRefs(browser, base, { fail, SHOTS });
  await smokeBeatPathImages(browser, base, { fail, SHOTS });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { createServer } = await import("vite");
  const { chromium } = await import("playwright-core");
  const OUT = new URL("../out/smoke/", import.meta.url).pathname, SHOTS = new URL("../out/", import.meta.url).pathname;
  mkdirSync(OUT, { recursive: true });
  const fail = msg => { console.error(`SMOKE FAIL: ${msg}`); process.exitCode = 1; };
  const server = await createServer({ root: new URL("../packages/studio/", import.meta.url).pathname, server: { port: 5182, host: "127.0.0.1" }, logLevel: "warn" });
  await server.listen();
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome", headless: true });
  try { await smokeBeatPath(browser, server.resolvedUrls.local[0].replace(/\/$/, ""), { fail, OUT, SHOTS }); }
  finally { await browser.close(); await server.close(); }
  console.log(process.exitCode ? "BEAT PATH SMOKE: FAILED" : "BEAT PATH SMOKE: OK");
}
