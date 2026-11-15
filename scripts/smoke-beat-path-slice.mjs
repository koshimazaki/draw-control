/**
 * The audio slicer (round 9), called from smoke-beat-path.mjs: a generated three-minute drum
 * track is loaded (analysed in a worker, the page still responds), the overview shows with the
 * clip's window; the window is dragged (it lands on a beat), nudged with an arrow key, a kick
 * marker is added with Alt-click on the strip; the guide is exported in memory and its
 * audio.wav is the clip's length and its beats.json starts on a beat. 10 s clips export 241
 * frames. Then Example 2 is sliced with a hit switched off and a marker on a kick, Example 3 shown
 * and Example 2 again: it comes back with its cut, and both still sit on kicks of the music loaded
 * (Example 2's groove is longer than its clip; Example 1's loop is shorter than its clip).
 * Then slicing again for a loop, zoom and the playhead (smoke-beat-path-reslice.mjs).
 * Any console error or warning fails the run.
 */
import { writeFileSync } from "node:fs";
import { drumWav } from "./smoke-features.mjs";
import { smokeBeatPathReslice } from "./smoke-beat-path-reslice.mjs";

export async function smokeBeatPathSlice(browser, base, { fail, OUT, SHOTS }) {
  const wav = `${OUT}long-track.wav`;
  writeFileSync(wav, drumWav(120, 90).buf);   // 90 bars at 120 BPM: 180.6 s
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html?theme=runware`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
  const t0 = Date.now();
  await page.setInputFiles("#trackFile", wav);
  // The page keeps answering while the worker analyses.
  const alive = await page.evaluate(() => new Promise(r => window.requestAnimationFrame(() => r(true))));
  await page.waitForFunction(() => window.__beatPath.trackName() === "long-track.wav", null, { timeout: 120_000 });
  console.log(`draw control slice: a 3-minute track analysed in ${((Date.now() - t0) / 1000).toFixed(1)} s (page responsive: ${alive})`);
  if (!(await page.locator("#overview").isVisible())) { fail("the track overview does not show for a track longer than the clip"); await page.close(); return; }
  const state = () => page.evaluate(() => window.__beatPath.state());
  const grid = () => page.evaluate(() => window.__beatPath.recipe().beatGrid);
  // Drag the window by its middle to about a third of the way along (its brackets resize it instead).
  const box = await page.locator("#overview").boundingBox();
  const s0 = await state(), len0 = await page.evaluate(() => window.__beatPath.trackLength?.() ?? null);
  const startX = box.x + ((s0.slice ?? 0) + s0.clip / 2) / (len0 ?? 180) * box.width, y = box.y + box.height / 2;
  await page.mouse.move(startX, y); await page.mouse.down(); await page.mouse.move(box.x + box.width / 3, y, { steps: 8 }); await page.mouse.up();
  let s = await state(), g = await grid();
  const beat = 60 / g.bpm, phase = (x) => Math.abs(((x - 0.1) / beat) - Math.round((x - 0.1) / beat));
  console.log(`draw control slice: window at ${s.slice} s (grid offset ${g.offsetSeconds}, ${g.bpm} BPM)`);
  if (!(s.slice > 40 && s.slice < 80)) fail(`dragging the window did not move the clip (slice ${s.slice})`);
  if (Math.abs(g.offsetSeconds - s.slice) > 1e-6) fail("the beat grid does not start at the slice");
  if (phase(s.slice) > 0.06) fail(`the slice does not start on a beat (${s.slice})`);
  const before = s.slice;
  await page.locator("#overview").focus(); await page.keyboard.press("ArrowRight");
  s = await state();
  if (Math.abs(s.slice - before - beat) > 0.01) fail(`an arrow key did not nudge the window by a beat (${before} → ${s.slice})`);
  if (/Not applied/.test(await page.textContent("#status") ?? "")) fail(`the recipe refused the slice: ${await page.textContent("#status")}`);
  if (Math.abs((await grid()).offsetSeconds - s.slice) > 1e-6) fail("after the nudge the beat grid does not start at the slice");
  // A kick marker with Alt-click on the strip, in the clip's second half.
  const strip = await page.locator("#wave").boundingBox();
  await page.keyboard.down("Alt"); await page.mouse.click(strip.x + strip.width * 0.6, strip.y + 8); await page.keyboard.up("Alt");
  s = await state();
  if (s.markers?.length !== 1 || s.markers[0].band !== "low" || !(s.markers[0].seconds > s.slice)) fail(`Alt-click did not add a kick marker in the clip: ${JSON.stringify(s.markers)}`);
  if (!/markers: kick/.test(await page.evaluate(() => window.__beatPath.script()))) fail("the marker is not in the shot script");
  await page.keyboard.press("ControlOrMeta+z");
  if ((await state()).markers?.length) fail("undo did not take the marker back");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.screenshot({ path: `${SHOTS}beat-path-slice-1280.png` });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}beat-path-slice-1440.png` });
  await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(200);
  // The window's right bracket drags like a loop region: a longer clip in whole seconds, the start held.
  {
    const b = await page.locator("#overview").boundingBox(), st = await state(), L = await page.evaluate(() => window.__beatPath.trackLength());
    const x1 = b.x + (st.slice + st.clip) / L * b.width, yy = b.y + b.height / 2;
    await page.mouse.move(x1 - 0.5, yy); await page.mouse.down(); await page.mouse.move(x1 + 4 / L * b.width, yy, { steps: 6 }); await page.mouse.up();
    const after = await state();
    console.log(`draw control slice: bracket drag ${st.clip} s → ${after.clip} s (start ${st.slice} → ${after.slice})`);
    if (!(after.clip > st.clip && Number.isInteger(after.clip)) || Math.abs(after.slice - st.slice) > 1e-6) fail(`dragging the right bracket did not lengthen the clip in whole seconds, start held (${st.clip} → ${after.clip}, ${st.slice} → ${after.slice})`);
  }
  // Export in memory: the audio is the slice, beats.json starts on a beat.
  const out = await page.evaluate(async () => {
    const b = await window.beatPath.exportGuideInMemory();
    const wav = new Uint8Array(await b.files["audio.wav"].arrayBuffer()), dv = new DataView(wav.buffer);
    const rate = dv.getUint32(24, true), ch = dv.getUint16(22, true), bits = dv.getUint16(34, true);
    const beats = JSON.parse(await b.files["beats.json"].text());
    return { seconds: (wav.length - 44) / (rate * ch * bits / 8), firstBeat: beats.beats[0], count: beats.beats.length };
  });
  console.log(`draw control slice: exported audio ${out.seconds.toFixed(3)} s, first beat ${out.firstBeat} s, ${out.count} beats`);
  if (Math.abs(out.seconds - (await state()).clip) > 0.1) fail(`the exported audio is not the clip's length (${out.seconds} s)`);
  if (!(out.firstBeat >= 0 && out.firstBeat < 0.05)) fail(`beats.json does not start on the clip's first beat (${out.firstBeat})`);
  if (errors.length) fail(`slice step logged: ${errors.join(" | ")}`);
  await page.close();
  await smokeSliceReturn(browser, base, { fail });
  await smokeBeatPathReslice(browser, base, { fail, OUT });
}

/** Example 2 sliced, Example 3 shown, Example 2 again: its cut comes back (slot-music.ts), and the switched-off hit and the marker sit on kicks of the music loaded. */
async function smokeSliceReturn(browser, base, { fail }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio && window.__beatPath.trackName() === "neon-rain-loop.mp3", null, { timeout: 30_000 });
  const ex = slot => page.click(`[data-control="example"] [data-value="${slot}"]`);
  await ex("1");
  await page.waitForFunction(() => window.__beatPath.slot() === "1" && window.__beatPath.trackName() === "generated-drive-140.wav", null, { timeout: 30_000 });
  await page.$eval("#sliceStart", el => { el.value = "4"; el.dispatchEvent(new window.Event("change")); });
  const s0 = await page.evaluate(() => window.__beatPath.state());
  // A kick a second into the clip switched off (a click on it), and a marker added on a later kick (Alt-click on it).
  const kicks = (await page.evaluate(() => window.__beatPath.kicks())).filter(t => t > s0.slice + 1 && t < s0.slice + s0.clip - 1);
  const strip = await page.locator("#wave").boundingBox(), xOf = t => strip.x + (t - s0.slice) / s0.clip * strip.width, y = strip.y + strip.height * 0.15;
  await page.mouse.click(xOf(kicks[0]), y);
  await page.keyboard.down("Alt"); await page.mouse.click(xOf(kicks[2]), y); await page.keyboard.up("Alt");
  const onKicks = async () => {
    const { state, kicks: k, name } = await page.evaluate(() => ({ state: window.__beatPath.state(), kicks: window.__beatPath.kicks(), name: window.__beatPath.trackName() }));
    const off = t => Math.min(...k.map(x => Math.abs(x - t)));
    return { name, muted: state.muted, markers: (state.markers ?? []).map(m => m.seconds), worst: Math.max(...state.muted.map(off), ...(state.markers ?? []).map(m => off(m.seconds))) };
  };
  const set = await onKicks();
  if (set.muted.length !== 1 || set.markers.length !== 1) fail(`the step could not switch a kick off and add a marker (${JSON.stringify(set)})`);
  await page.click("#sliceTrack");
  await page.waitForFunction(() => /\(/.test(window.__beatPath.trackName() ?? ""), null, { timeout: 30_000 });
  const sliced = await onKicks();
  await ex("2");
  await page.waitForFunction(() => window.__beatPath.slot() === "2" && window.__beatPath.trackName() === "generated-laidback-100.wav", null, { timeout: 30_000 });
  await ex("1");
  await page.waitForFunction(() => window.__beatPath.slot() === "1", null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  const back = await onKicks();
  console.log(`draw control slice: Example 2 sliced (${sliced.name}), away and back: ${back.name}, muted ${back.muted} markers ${back.markers}, worst ${(back.worst * 1000).toFixed(1)} ms off a kick`);
  if (sliced.worst > 0.02) fail(`after Slice the switched-off hit or the marker is off the kicks (${JSON.stringify(sliced)})`);
  if (back.name !== sliced.name || back.worst > 0.02 || back.muted.length !== 1 || back.markers.length !== 1) fail(`Example 2 came back with its markers off the music loaded (${JSON.stringify(back)}, sliced ${JSON.stringify(sliced)})`);
  if (errors.length) fail(`slice return logged: ${errors.join(" | ")}`);
  await page.close();
}
