#!/usr/bin/env node
/**
 * Smoke step for the Beat Path page (path.html), run by scripts/smoke.mjs and on its own
 * (`node scripts/smoke-beat-path.mjs`, which starts its own dev server):
 * 1. the page opens with the demo track, the first example and lock on kick, and plays after one click;
 * 2. a subject path is drawn with the mouse on the map, lock set to kick, a lane block swapped by its menu;
 * 3. a pasted script round-trips (Copy script gives it back);
 * 4. the guide is exported at 1280×720 (193 frames) and the bundle checked against the pinned schema;
 * 5. screenshots of both themes at 1280×720 and 1440×900 in out/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

const SCRIPT = `beats 0-2 | action: rest | camera: follow behind lock kick 1 hold | shot: medium
beats 2-12 | action: walk on path (-5,3) (0,-2) (5,2) corners 0.6 lock kick 1 | camera: follow side lock kick 1 hold | shot: medium
beats 12-17 | action: rest, spin @beat 14.5 | camera: orbit 75 lock kick 1 hold | shot: medium
`;

export async function smokeBeatPath(browser, base, { fail, OUT, SHOTS }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${base}/path.html`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio?.name === "demo-drums-120.wav", null, { timeout: 30_000 })
    .catch(async e => {
      const seen = await page.evaluate(() => ({ probe: !!window.__beatPath, audio: window.__beatPath?.recipe().audio ?? null, status: document.getElementById("status")?.textContent, url: window.location.href })).catch(x => x.message);
      throw new Error(`Beat Path did not load the demo (${e.message}); page: ${JSON.stringify(seen)}; page errors: ${errors.join(" | ") || "none"}`);
    });
  const probe = () => page.evaluate(() => ({ recipe: window.__beatPath.recipe(), state: window.__beatPath.state(), playing: window.__beatPath.playing(), head: window.__beatPath.head() }));
  let p = await probe();
  console.log(`beat path: first run ${p.recipe.character.kind}, ${p.recipe.durationBeats} beats, travel lock ${JSON.stringify(p.recipe.travelLock)}, camera ${p.recipe.camera.segments.map(s => s.modes.join("+")).join(" / ")}`);
  if (p.recipe.character.kind !== "glider" || p.recipe.travelLock?.lock !== "kick") fail("Beat Path did not open on the glider locked to the kicks");
  const noScroll = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1);
  if (!noScroll) fail("Beat Path scrolls at 1280×720");
  await page.click("#bigPlay");
  await page.waitForTimeout(1500);
  p = await probe();
  if (!p.playing || p.head < 0.8) fail(`Beat Path is not playing after one click (head ${p.head})`);
  await page.screenshot({ path: `${SHOTS}beat-path-playing.png` });
  await page.click("#play");

  // Draw the subject's path with the mouse: a stroke from (-6, 4) through (0, -3) to (6, 3).
  await page.click('[data-control="tool"] [data-value="subject"]');
  await page.click("#clearPath");
  const at = q => page.evaluate(q => window.__beatPath.mapPoint(q), q);
  const stroke = [];
  for (let t = 0; t <= 1.0001; t += 0.05) stroke.push({ x: -6 + 12 * t, z: 4 - 14 * t + 13 * t * t });
  const first = await at(stroke[0]);
  await page.mouse.move(first.x, first.y); await page.mouse.down();
  for (const q of stroke.slice(1)) { const s = await at(q); await page.mouse.move(s.x, s.y, { steps: 3 }); }
  await page.mouse.up();
  await page.click('[data-control="lock"] [data-value="kick"]');
  p = await probe();
  const pts = p.recipe.rootShape?.points ?? [];
  console.log(`beat path: drawn path ${p.state.subject.length} points, from (${pts[0]?.x},${pts[0]?.z}) to (${pts.at(-1)?.x},${pts.at(-1)?.z}); lock ${p.recipe.travelLock?.lock}`);
  if (p.state.subject.length < 3 || Math.abs(pts[0].x + 6) > 0.3 || Math.abs(pts.at(-1).x - 6) > 0.3 || p.recipe.travelLock?.lock !== "kick") fail("drawing the path on the map did not set the walk path");
  // Swap the second camera block to Orbit through its menu.
  await page.click("#laneCamera .block >> nth=1");
  await page.click('#menu button:has-text("Orbit")');
  p = await probe();
  console.log(`beat path: camera lane ${p.state.cameraLane.map(b => `${b.word} ${b.from}-${b.to}`).join(", ")}`);
  if (!p.recipe.camera.segments.some(s => s.modes[0] === "orbit")) fail("the lane menu did not make an orbit block");
  await page.keyboard.press("ControlOrMeta+z");
  p = await probe();
  if (p.recipe.camera.segments.some(s => s.modes[0] === "orbit")) fail("undo did not take the orbit back");

  // Paste a script, read it back.
  await page.evaluate(() => window.navigator.clipboard?.writeText?.("").catch(() => {}));
  await page.click("#pasteScript");
  await page.fill("#pasteText", SCRIPT);
  await page.click("#pasteApply");
  p = await probe();
  const back = await page.evaluate(() => window.__beatPath.script());
  console.log(`beat path: pasted script → ${p.state.character.map(b => b.word).join(", ")} | ${p.state.cameraLane.map(b => b.word).join(", ")}`);
  if (!back.includes("walk on path (-5,3) (0,-2) (5,2) corners 0.6 lock kick 1") || !back.includes("orbit 75")) fail(`the pasted script does not read back:\n${back}`);
  await page.screenshot({ path: `${SHOTS}beat-path-script.png` });

  // Landmarks: on by default, the toggle turns them off in the recipe and the script, and back on.
  const lm = async () => (await probe()).recipe.landmarks;
  if (!(await lm())?.on) fail("landmarks are not on by default");
  await page.click("label:has(#landmarksExport)");
  const offScript = await page.evaluate(() => window.__beatPath.script());
  if ((await lm())?.on !== false || !/^landmarks: off$/m.test(offScript)) fail("the landmarks toggle did not turn them off");
  await page.click("label:has(#landmarksExport)");
  console.log(`beat path: landmarks ${JSON.stringify(await lm())}, toggle off and on`);

  // Export the guide.
  const dl = page.waitForEvent("download", { timeout: 180_000 });
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
  if (!ok || meta.frames !== 193 || meta.width !== 1280 || meta.character.kind !== "glider" || meta.schemaVersion !== "0.5.0" || !exported.landmarks?.on) fail("the Beat Path bundle is wrong");
  mkdirSync(`${OUT}beat-path/`, { recursive: true });
  for (const [k, v] of Object.entries(zip)) writeFileSync(`${OUT}beat-path/${k}`, v);

  // Themes and sizes.
  await page.goto(`${base}/path.html?theme=runware`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
  await page.click("#bigPlay"); await page.waitForTimeout(1200); await page.click("#play");
  await page.screenshot({ path: `${SHOTS}beat-path-runware.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
  if (!fits) fail("Beat Path scrolls at 1440×900");
  await page.screenshot({ path: `${SHOTS}beat-path-runware-1440.png` });
  if (errors.length) fail(`Beat Path page errors: ${errors.join(" | ")}`);
  await page.close();
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
