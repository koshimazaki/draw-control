/**
 * Slice again for a loop, the clip following the slice, zoom on any track and the playhead
 * (called from smoke-beat-path-slice.mjs). A one-minute drum track is loaded; the timeline zoom
 * (+/− and Cmd-scroll, over the music strip and the overview) changes the timeline before slicing;
 * it is sliced to 8 s, Slice on the whole-track window only says so, the window's right bracket is
 * dragged to 4 s and sliced again: the track is 4 s, the clip 4 s, the recipe, the export range and
 * the exported audio 4 s. Zoom still changes the timeline. Undo and redo stay on the 4 s track.
 * Then, paused, a click at 50% of the strip puts the clock at half the clip and dragging the
 * playhead to 25% puts it at a quarter. Any console error or warning fails the run.
 */
import { writeFileSync } from "node:fs";
import { drumWav } from "./smoke-features.mjs";

export async function smokeBeatPathReslice(browser, base, { fail, OUT }) {
  const wav = `${OUT}minute-track.wav`;
  writeFileSync(wav, drumWav(120, 30).buf);   // 30 bars at 120 BPM: about a minute
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
  await page.setInputFiles("#trackFile", wav);
  await page.waitForFunction(() => window.__beatPath.trackName() === "minute-track.wav", null, { timeout: 120_000 });
  const bp = fn => page.evaluate(fn);
  const look = () => bp(() => ({ length: window.__beatPath.trackLength(), clip: window.__beatPath.state().clip, slice: window.__beatPath.state().slice, name: window.__beatPath.trackName(),
    seconds: window.__beatPath.exportRange().seconds, frames: window.__beatPath.exportRange().frames, beats: window.__beatPath.recipe().durationBeats, bpm: window.__beatPath.recipe().beatGrid.bpm,
    overview: document.querySelector(".editor").classList.contains("with-overview"), canSlice: !document.getElementById("sliceTrack").disabled, status: document.getElementById("status").textContent }));
  const widths = () => bp(() => ({ zoom: window.__beatPath.timelineZoom(), inner: document.getElementById("tlInner").getBoundingClientRect().width, view: document.getElementById("tlScroll").clientWidth }));

  /** +/− and Cmd-scroll stretch the timeline (and come back to 1×). */
  async function zoomWorks(label) {
    const w0 = await widths();
    await page.click("#tlZoomIn");
    const w1 = await widths();
    const wave = await page.locator("#wave").boundingBox();
    await page.mouse.move(wave.x + 40, wave.y + wave.height / 2);
    await page.keyboard.down("Meta"); await page.mouse.wheel(0, -120); await page.keyboard.up("Meta");
    await page.waitForTimeout(250);
    const w2 = await widths();
    let w3 = w2;
    if (await page.locator("#overview").isVisible()) {
      const ov = await page.locator("#overview").boundingBox();
      await page.mouse.move(ov.x + ov.width * 0.9, ov.y + ov.height / 2);
      await page.keyboard.down("Meta"); await page.mouse.wheel(0, 120); await page.keyboard.up("Meta");
      await page.waitForTimeout(250);
      w3 = await widths();
    }
    while ((await widths()).zoom > 1) await page.click("#tlZoomOut");
    const w4 = await widths();
    console.log(`draw control reslice: zoom ${label}: 1× ${w0.inner.toFixed(0)} px → + ${w1.zoom}× ${w1.inner.toFixed(0)} px → Cmd-scroll ${w2.zoom}× → Cmd-scroll on the overview ${w3.zoom}× → back ${w4.zoom}× ${w4.inner.toFixed(0)} px`);
    if (!(w1.zoom === 2 && w1.inner > w0.inner * 1.9)) fail(`zoom in (+) did not stretch the timeline ${label} (${JSON.stringify([w0, w1])})`);
    if (w2.zoom !== 4) fail(`Cmd-scroll on the music strip did not zoom ${label} (${w2.zoom}×)`);
    if (w3 !== w2 && w3.zoom !== 2) fail(`Cmd-scroll on the overview did not zoom ${label} (${w3.zoom}×)`);
    if (!(w4.zoom === 1 && Math.abs(w4.inner - w4.view) < 2)) fail(`zoom out (−) did not bring the whole clip back ${label} (${JSON.stringify(w4)})`);
  }
  await zoomWorks("on the unsliced one-minute track");

  // Slice to the 8 s window.
  let s = await look();
  if (s.clip !== 8) fail(`the step expects an 8 s clip to start with (${s.clip})`);
  await page.click("#sliceTrack");
  await page.waitForFunction(n => window.__beatPath.trackName() !== n, s.name, { timeout: 30_000 });
  s = await look();
  console.log(`draw control reslice: sliced to ${s.length.toFixed(3)} s, clip ${s.clip} s; overview ${s.overview ? "shows" : "hidden"}, Slice ${s.canSlice ? "enabled" : "disabled"}`);
  if (Math.abs(s.length - 8) > 1 / 24 || s.clip !== 8 || !s.overview || !s.canSlice) fail(`after slicing to 8 s the overview should show and Slice stay available (${JSON.stringify(s)})`);
  await page.locator(".dock").screenshot({ path: `${OUT}beat-path-resliced-8s.png` });
  await page.click("#sliceTrack");
  s = await look();
  if (!/Nothing to slice/.test(s.status) || Math.abs(s.length - 8) > 1 / 24) fail(`Slice on a window that is the whole track should only say so ("${s.status}", ${s.length} s)`);

  // Drag the window's right bracket in to 4 s, then slice again.
  {
    const b = await page.locator("#overview").boundingBox(), y = b.y + b.height / 2, x1 = b.x + b.width * (s.clip / s.length);
    await page.mouse.move(x1 - 1, y); await page.mouse.down(); await page.mouse.move(b.x + b.width * (4.3 / 8), y, { steps: 8 }); await page.mouse.up();
  }
  s = await look();
  console.log(`draw control reslice: right bracket dragged → clip ${s.clip} s from ${s.slice ?? 0} s; Slice ${s.canSlice ? "enabled" : "disabled"}`);
  if (s.clip !== 4) fail(`dragging the window's right bracket did not make a 4 s clip (${s.clip})`);
  await page.click("#sliceTrack");
  await page.waitForFunction(() => window.__beatPath.trackLength() < 6, null, { timeout: 30_000 });
  s = await look();
  const out = await bp(async () => {
    const b = await window.beatPath.exportGuideInMemory();
    const wav = new Uint8Array(await b.files["audio.wav"].arrayBuffer()), dv = new DataView(wav.buffer);
    return { audio: (wav.length - 44) / (dv.getUint32(24, true) * dv.getUint16(22, true) * dv.getUint16(34, true) / 8), frames: JSON.parse(await b.files["meta.json"].text()).frames };
  });
  console.log(`draw control reslice: sliced again → ${s.length.toFixed(3)} s track, clip ${s.clip} s, recipe ${s.beats} beats at ${s.bpm} BPM, export ${s.frames} frames (${s.seconds.toFixed(3)} s), guide audio ${out.audio.toFixed(3)} s, ${out.frames} frames; status "${s.status}"`);
  if (Math.abs(s.length - 4) > 1 / 24 || s.clip !== 4) fail(`slicing again did not make a 4 s track and clip (${s.length} s, ${s.clip} s)`);
  if (s.frames !== 97 || out.frames !== 97 || Math.abs(out.audio - 4) > 0.05) fail(`the export is not the 4 s loop (${s.frames} frames, guide ${out.frames} frames, audio ${out.audio} s)`);
  if (s.beats !== Math.ceil((4 + 1 / 24) * s.bpm / 60 - 1e-9)) fail(`the recipe is not 4 s long (${s.beats} beats at ${s.bpm} BPM)`);
  if (!/Sliced to 4 s/.test(s.status)) fail(`the status line does not say the new length ("${s.status}")`);
  await page.click("#tlZoomIn");
  await page.locator(".dock").screenshot({ path: `${OUT}beat-path-loop-4s-zoom2.png` });
  await page.click("#tlZoomOut");
  await zoomWorks("on the sliced 4 s loop");

  // Undo and redo after two slices: the history is on the 4 s track (the track itself is not an undo step).
  await page.keyboard.press("ControlOrMeta+z");
  const undone = await look();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  const redone = await look();
  console.log(`draw control reslice: undo → clip ${undone.clip} s on ${undone.length.toFixed(1)} s, redo → clip ${redone.clip} s`);
  if (Math.abs(undone.length - 4) > 1 / 24 || redone.clip !== 4 || /Not applied/.test(redone.status)) fail(`undo/redo after slicing again is not coherent (${JSON.stringify({ undone, redone })})`);

  // The playhead, paused: a click at 50% of the strip, then the playhead dragged to 25%.
  if (await bp(() => window.__beatPath.playing())) await page.click("#play");
  const strip = await page.locator("#wave").boundingBox(), w0 = await bp(() => window.__beatPath.window0?.() ?? window.__beatPath.recipe().beatGrid.offsetSeconds);
  const hits = await bp(() => window.__beatPath.hits());
  const xOf = f => strip.x + strip.width * f;
  /** A row of the strip with no detected hit within 7 px of x (a click there seeks rather than switching a hit off). */
  const freeRow = f => {
    const rows = [["low", 0.17], ["mid", 0.5], ["high", 0.83]];
    for (const [band, y] of rows) if (!hits[band].some(t => Math.abs((t - w0) / 4 * strip.width - f * strip.width) < 7)) return strip.y + strip.height * y;
    return null;
  };
  const yHalf = freeRow(0.5);
  if (yHalf === null) fail("every row of the strip has a hit at 50%: the step cannot click there");
  else {
    await page.mouse.click(xOf(0.5), yHalf);
    await page.waitForTimeout(100);
    const half = await bp(() => ({ head: window.__beatPath.head(), shown: window.__beatPath.shown(), muted: window.__beatPath.state().muted.length }));
    // Grab the playhead where it now is and drag it to a quarter.
    await page.mouse.move(xOf(0.5), strip.y + strip.height * 0.5); await page.mouse.down();
    await page.mouse.move(xOf(0.25), strip.y + strip.height * 0.5, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(100);
    const quarter = await bp(() => ({ head: window.__beatPath.head(), shown: window.__beatPath.shown(), muted: window.__beatPath.state().muted.length, playing: window.__beatPath.playing() }));
    console.log(`draw control reslice: playhead click at 50% → ${(half.head - w0).toFixed(3)} s (preview ${(half.shown - w0).toFixed(3)} s), dragged to 25% → ${(quarter.head - w0).toFixed(3)} s (preview ${(quarter.shown - w0).toFixed(3)} s)`);
    if (Math.abs(half.head - w0 - 2) > 0.1 || Math.abs(half.shown - half.head) > 0.05) fail(`a click at 50% of the strip did not put the clock at half the clip (${half.head - w0} s, preview ${half.shown - w0} s)`);
    if (Math.abs(quarter.head - w0 - 1) > 0.1 || Math.abs(quarter.shown - quarter.head) > 0.05) fail(`dragging the playhead to 25% did not put the clock at a quarter of the clip (${quarter.head - w0} s)`);
    if (quarter.muted !== half.muted || quarter.playing) fail("dragging the playhead switched a hit off or started playback");
  }
  if (errors.length) fail(`reslice step logged: ${errors.join(" | ")}`);
  await page.close();
}
