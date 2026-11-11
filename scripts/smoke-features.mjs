/**
 * Smoke steps for the editor features, run by scripts/smoke.mjs on a fresh page:
 * 1. a synthetic kick/snare/hat track: band onsets analysed, markers drawn per band on
 *    the audio lane (checked by reading the canvas pixels);
 * later steps (added per feature) drive real pointer events on the timeline and export.
 * Fixtures are generated (packages/core/test/drum-synth.ts), licence-clean.
 */
import { patternTimes, synthDrums } from "../packages/core/test/drum-synth.ts";

export const DRUM_BPM = 120;

/** 16-bit mono WAV of a synthetic drum pattern. */
export function drumWav(bpm = DRUM_BPM, bars = 8, rate = 44100) {
  const truth = patternTimes(bpm, bars, 0.1);
  const seconds = 0.1 + bars * 4 * 60 / bpm + 0.5;
  const s = synthDrums(truth, seconds, rate);
  const buf = Buffer.alloc(44 + s.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + s.length * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2);
  return { buf, truth };
}

export const probe = page => page.evaluate(() => window.__msProbe());

/** Count pixels of a colour (within a tolerance) in a canvas rectangle, in CSS pixels. */
export async function countColour(page, rect, rgb, tol = 40) {
  return page.evaluate(({ rect, rgb, tol }) => {
    const c = document.querySelector("#strip"), dpr = c.width / c.clientWidth;
    const d = c.getContext("2d").getImageData(Math.round(rect.x * dpr), Math.round(rect.y * dpr), Math.round(rect.w * dpr), Math.round(rect.h * dpr)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) < tol && Math.abs(d[i + 1] - rgb[1]) < tol && Math.abs(d[i + 2] - rgb[2]) < tol) n++;
    return n;
  }, { rect, rgb, tol });
}

/** Feature 1: load the drum track, check the analysed onsets and the markers on the audio lane. */
export async function smokeBands(page, { fail, OUT }) {
  const { buf, truth } = drumWav();
  await page.setInputFiles("#trackFile", { name: "drums-120.wav", mimeType: "audio/wav", buffer: buf });
  await page.waitForFunction(() => /kicks/.test(document.querySelector("#trackStatus").textContent), null, { timeout: 30_000 });
  console.log("drum track:", await page.textContent("#trackStatus"));
  await page.click("#fitTrack");
  const p = await probe(page);
  if (!p.bands) return fail("no band analysis in the drive");
  const within = (found, list) => list.filter(t => found.some(f => Math.abs(f - t) < 0.03)).length;
  const kick = within(p.bands.low, truth.kicks), snare = within(p.bands.mid, truth.snares);
  console.log(`bands in the browser: kicks ${kick}/${truth.kicks.length} (found ${p.bands.low.length}), snares ${snare}/${truth.snares.length} (found ${p.bands.mid.length}), hats found ${p.bands.high.length}, peaks ${p.bands.peaks}`);
  if (kick < truth.kicks.length * 0.9 || snare < truth.snares.length * 0.9) fail("kick or snare onsets missing in the browser analysis");
  // Markers drawn: red (kick) pixels in the lower third of the audio lane, yellow (snare) in the middle.
  const box = await page.locator("#strip").boundingBox();
  const top = p.lanes.audio, h = p.lanes.height - p.lanes.audio;
  const red = await countColour(page, { x: 0, y: top + 2 * h / 3, w: box.width, h: h / 3 }, [255, 90, 90]);
  const yellow = await countColour(page, { x: 0, y: top + h / 3, w: box.width, h: h / 3 }, [255, 211, 77]);
  console.log(`audio lane pixels: kick-red ${red}, snare-yellow ${yellow}`);
  if (red < 40 || yellow < 40) fail("onset markers not drawn on the audio lane");
  await page.locator("#strip").screenshot({ path: `${OUT}timeline-bands.png` });
  return { truth, box };
}
