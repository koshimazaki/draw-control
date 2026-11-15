/**
 * Settings › Setup, called from smoke-beat-path.mjs: the page is edited, saved as a setup file,
 * changed, and loaded back (the same state; one undo step takes it back, redo again). The guide zip
 * carries the same setup.json (not in bundle.json) and loads back, so does its unzipped folder.
 * With the user's own track: the setup loads over the same track keeping it; with no track it asks
 * for the file, and loading that file again brings the slice back; the guide zip brings the clip's
 * audio as the track; undo after loading forgets the wait for the track; a guide audio that cannot
 * be read leaves the setup on the music loaded. Any console error or warning fails the run.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { drumWav } from "./smoke-features.mjs";

/** Keys sorted all the way down: two states compare by content, not by key order. */
const canon = v => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

export async function smokeBeatPathSetup(browser, base, { fail, OUT }) {
  const dir = `${OUT}setup/`;
  mkdirSync(`${dir}guide/`, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio?.name === "generated-straight-120.wav", null, { timeout: 30_000 });
  const state = () => page.evaluate(() => window.__beatPath.state());
  const look = () => page.evaluate(() => ({ track: window.__beatPath.trackName(), length: window.__beatPath.trackLength(), status: document.getElementById("status").textContent }));
  const loaded = async (what, input, path) => {
    await page.evaluate(() => { document.getElementById("status").textContent = ""; });
    await page.setInputFiles(input, path);
    await page.waitForFunction(() => /^(Loaded the setup|Not loaded)/.test(document.getElementById("status").textContent), null, { timeout: 60_000 })
      .catch(() => fail(`${what}: the page said nothing after loading`));
    const l = await look();
    console.log(`beat path setup: ${what}: "${l.status}"`);
    if (!l.status.startsWith("Loaded the setup")) fail(`${what} did not load`);
    return l;
  };
  const save = async name => {
    const dl = page.waitForEvent("download", { timeout: 30_000 });
    await page.click("#saveSetup");
    const d = await dl, text = readFileSync(await d.path(), "utf8");
    if (d.suggestedFilename() !== "draw-control-setup.json") fail(`Save setup downloads ${d.suggestedFilename()}`);
    writeFileSync(`${dir}${name}`, text);
    return JSON.parse(text);
  };
  const guide = async name => {
    const dl = page.waitForEvent("download", { timeout: 180_000 });
    await page.click("#exportGuide");
    const path = `${dir}${name}`;
    writeFileSync(path, readFileSync(await (await dl).path()));
    return { path, zip: unzipSync(new Uint8Array(readFileSync(path))) };
  };
  const undo = async redo => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press(redo ? "Control+Shift+z" : "Control+z"); };

  await page.click("#settings summary");
  // 0. Example 1 with "Next move on each hit" on (its camera anchors on snares): saved, it loads back as it was.
  const advance = async () => { await page.click("#setCamLock"); await page.click('#menu button:has-text("Next move on each hit")'); };
  await advance();
  if (!(await state()).camLock.advance) fail("Next move on each hit did not turn on");
  const withAdvance = await state();
  await save("advance-setup.json");
  await page.selectOption("#scenery", "none");
  const la = await loaded("a setup with next move on each hit", "#setupFile", `${dir}advance-setup.json`);
  if (canon(await state()) !== canon(withAdvance) || /lands once/.test(la.status)) fail(`a setup with next move on each hit did not load as saved ("${la.status}")`);
  await advance();
  if ((await state()).camLock.advance) fail("Next move on each hit did not turn off");

  // 1. Save, change, load back; one undo step.
  await page.selectOption("#scenery", "street");
  await page.selectOption("#figureShape", "car");
  const before = await state(), file = await save("setup.json");
  if (file.kind !== "beat-path-setup" || file.version !== 1 || canon(file.state) !== canon(before) || !/^beats /m.test(file.script) || file.music?.name !== "generated-straight-120.wav")
    fail(`the saved setup is not the page: ${JSON.stringify({ kind: file.kind, version: file.version, music: file.music })}`);
  await page.selectOption("#scenery", "none");
  await page.selectOption("#figureShape", "runner");
  await loaded("setup.json", "#setupFile", `${dir}setup.json`);
  if (canon(await state()) !== canon(before)) fail("the loaded setup is not the state that was saved");
  await undo(false);
  let s = await state();
  if (s.scenery !== "none" || s.figure.shape !== "runner") fail(`undo after loading a setup did not go back (${s.scenery}, ${s.figure.shape})`);
  await undo(true);
  if (canon(await state()) !== canon(before)) fail("redo did not bring the loaded setup back");

  // 2. The guide zip carries setup.json, and loads back; so does its unzipped folder.
  const g = await guide("guide.zip");
  const inZip = g.zip["setup.json"] && JSON.parse(strFromU8(g.zip["setup.json"]));
  if (!inZip || canon(inZip.state) !== canon(before)) fail("the guide zip has no setup.json of the page");
  if (Object.values(JSON.parse(strFromU8(g.zip["bundle.json"]))).includes("setup.json")) fail("bundle.json lists setup.json (its schema is the guide's)");
  for (const [k, v] of Object.entries(g.zip)) writeFileSync(`${dir}guide/${k}`, v);
  await page.selectOption("#scenery", "none");
  await loaded("guide.zip", "#setupFile", g.path);
  if ((await state()).scenery !== "street") fail("the guide zip did not load its setup");
  await page.selectOption("#scenery", "none");
  await loaded("the guide folder", "#setupFolder", `${dir}guide`);
  if ((await state()).scenery !== "street") fail("the guide folder did not load its setup");

  // 3. The user's own track, sliced: kept, asked for again, or brought by the guide's audio.
  writeFileSync(`${dir}own.wav`, drumWav(128, 40).buf);
  await page.setInputFiles("#trackFile", `${dir}own.wav`);
  await page.waitForFunction(() => window.__beatPath.trackName() === "own.wav", null, { timeout: 120_000 });
  await page.$eval("#sliceStart", el => { el.value = "12"; el.dispatchEvent(new window.Event("change")); });
  const sliced = await state();
  if (!(sliced.slice > 5)) fail(`the slice did not move (${sliced.slice})`);
  const own = await save("own-setup.json"), ownGuide = await guide("own-guide.zip");
  if (own.music?.name !== "own.wav") fail("the own-track setup does not name own.wav");
  let l = await loaded("own-setup.json over its own track", "#setupFile", `${dir}own-setup.json`);
  if (l.track !== "own.wav" || (await state()).slice !== sliced.slice) fail(`loading over the same track did not keep it (${l.track}, slice ${(await state()).slice})`);
  // Undo after loading forgets the "load your track again": the file then loads as any new track (no slice).
  await page.click("#removeTrack");
  await loaded("own-setup.json, then undo", "#setupFile", `${dir}own-setup.json`);
  await undo(false);
  await page.setInputFiles("#trackFile", `${dir}own.wav`);
  await page.waitForFunction(() => window.__beatPath.trackName() === "own.wav", null, { timeout: 120_000 });
  if ((await state()).slice !== undefined) fail(`after undo, loading own.wav still restored the setup's slice (${(await state()).slice})`);
  await page.click("#removeTrack");
  l = await loaded("own-setup.json with no track", "#setupFile", `${dir}own-setup.json`);
  if (l.track !== null || !/load it again/.test(l.status)) fail("a setup on the user's own track did not ask for the file again");
  await page.setInputFiles("#trackFile", `${dir}own.wav`);
  await page.waitForFunction(() => window.__beatPath.trackName() === "own.wav", null, { timeout: 120_000 });
  s = await state();
  if (s.slice !== sliced.slice || canon([s.character, s.cameraLane]) !== canon([sliced.character, sliced.cameraLane])) fail(`loading own.wav again did not bring back the setup's slice and lanes (slice ${s.slice})`);
  await page.click("#removeTrack");
  l = await loaded("own-guide.zip", "#setupFile", ownGuide.path);
  s = await state();
  console.log(`beat path setup: the guide's audio as the track: ${l.track}, ${l.length?.toFixed(2)} s, slice ${s.slice}`);
  if (!/^own\.wav \(/.test(l.track ?? "") || Math.abs(l.length - sliced.clip) > 0.05 || s.slice !== undefined) fail("the guide zip did not bring the clip's audio as the track");
  if (!/not the music/.test(l.status)) fail("a load that changed the music did not say undo leaves the music");

  // A guide whose audio cannot be read: the setup loads on the music already there, lanes fitted to it.
  writeFileSync(`${dir}bad-audio.zip`, zipSync({ "setup.json": ownGuide.zip["setup.json"], "audio.wav": strToU8("not a wav") }));
  l = await loaded("bad-audio.zip", "#setupFile", `${dir}bad-audio.zip`);
  const fit = await page.evaluate(() => ({ end: window.__beatPath.state().character.at(-1).to, beats: window.__beatPath.recipe().durationBeats }));
  if (!/Could not read the guide's audio/.test(l.status) || fit.end !== fit.beats) fail(`a bad guide audio left the page half loaded (${l.status}; lanes end ${fit.end}, clip ${fit.beats} beats)`);
  // The music that stays is the 8 s cut: the setup's slice (12.3 s) is past its end, so it goes.
  const kept = await page.evaluate(() => ({ slice: window.__beatPath.state().slice, clip: window.__beatPath.state().clip, length: window.__beatPath.trackLength() }));
  if (kept.slice !== undefined && kept.slice + kept.clip > (kept.length ?? 0) + 0.05) fail(`a bad guide audio left a slice past the music's end (slice ${kept.slice}, ${kept.length} s of music)`);
  if (!/slice cleared/.test(l.status)) fail("a bad guide audio cleared the slice without saying so");

  if (errors.length) fail(`setup page errors: ${errors.join(" | ")}`);
  await page.close();
}
