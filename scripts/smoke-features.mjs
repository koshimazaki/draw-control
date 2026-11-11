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
/** Bring the timeline canvas to the top of the window so every lane is under the pointer. */
export const showTimeline = page => page.evaluate(() => document.querySelector("#strip").scrollIntoView({ block: "start" }));

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

/** Drag on the timeline canvas with real pointer events, from one beat to another, on a lane row (CSS px from the canvas top). */
export async function dragBeats(page, fromBeat, toBeat, rowY, opts = {}) {
  await showTimeline(page);
  const box = await page.locator("#strip").boundingBox(), p = await probe(page), total = p.recipe.durationBeats;
  const x = b => box.x + b / total * box.width;
  await page.mouse.move(x(fromBeat) + (opts.nudge ?? 0), box.y + rowY);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(x(fromBeat + (toBeat - fromBeat) * k / 8), box.y + rowY);
  await page.mouse.up();
}

/** Feature 2: drag-extend a block, move one onto a snare, undo. */
export async function smokeBlocks(page, { fail }) {
  let p = await probe(page);
  const row = p.lanes.move + 17;
  const idle = () => p.recipe.moves.find(m => m.clip === "Idle_Loop");
  if (!idle()) return fail("default recipe has no Idle_Loop block");
  // Drag the cut between Idle (0–4) and Dance (4–) to beat 6: Idle is longer and slower, Dance starts at 6.
  await dragBeats(page, 4, 6, row, { nudge: -2 });
  p = await probe(page);
  const dance = p.recipe.moves.find(m => m.clip === "Dance_Loop");
  console.log(`after edge drag: Idle length ${idle()?.lengthBeats} speed ${idle()?.speed}, Dance at ${dance?.atBeat}`);
  if (idle()?.lengthBeats !== 6 || Math.abs((idle()?.speed ?? 1) - 0.6667) > 1e-3 || dance?.atBeat !== 6) fail("edge drag did not lengthen and slow the block");
  // Snap to snares: drag Dance's body towards beat 8.6; it lands on the snare at beat 9 (120 BPM, offset 0.1 s: snares on odd beats).
  await page.selectOption("#tlSnapTarget", "snare");
  await dragBeats(page, 10, 12.6, row);
  p = await probe(page);
  const moved = p.recipe.moves.find(m => m.clip === "Dance_Loop");
  const beatOf = s => (s - p.recipe.beatGrid.offsetSeconds) * p.recipe.beatGrid.bpm / 60;
  const nearestSnare = Math.min(...p.bands.mid.map(s => Math.abs(beatOf(s) - moved.atBeat)));
  console.log(`after body drag with snare snap: Dance at beat ${moved.atBeat} (${nearestSnare.toFixed(3)} beats from a snare)`);
  if (nearestSnare > 0.01) fail("block did not snap to a snare");
  // The inspector shows the selected block; "On nearest kick" moves it onto a kick.
  if (!(await page.isVisible("#selected"))) fail("no inspector for the selected block");
  await page.click("#selOnKick");
  p = await probe(page);
  const onKick = p.recipe.moves.find(m => m.clip === "Dance_Loop");
  if (Math.min(...p.bands.low.map(s => Math.abs(beatOf(s) - onKick.atBeat))) > 0.01) fail("On nearest kick did not land on a kick");
  // Undo twice restores the snare position, then the first drag's result.
  await page.click("#undo");
  p = await probe(page);
  if (p.recipe.moves.find(m => m.clip === "Dance_Loop").atBeat !== moved.atBeat) fail("undo did not restore the block");
  const log = JSON.parse(await page.inputValue("#commandLog"));
  console.log(`command log: ${log.map(c => c.type).join(", ")}`);
  if (!log.some(c => c.type === "snapMoveTo") || !log.some(c => c.type === "resizeMove")) fail("command log misses a drag or a panel command");
}

/** Feature 3: draw the envelope freehand with the pencil and check it scales the motion. */
export async function smokeEnvelope(page, { fail, OUT }) {
  let p = await probe(page);
  const top = p.lanes.envelope, h = 130, pad = 4;
  const yOf = v => top + h - pad - v / 3 * (h - 2 * pad);
  const before = await page.evaluate(() => window.__msFrame(6 * 12 + 2));
  await page.click("#envPencil");
  await showTimeline(page);
  const box = await page.locator("#strip").boundingBox(), total = p.recipe.durationBeats;
  const x = b => box.x + b / total * box.width;
  await page.mouse.move(x(2), box.y + yOf(1));
  await page.mouse.down();
  for (let b = 2; b <= 12; b += 0.5) await page.mouse.move(x(b), box.y + yOf(b < 4 ? 1 + (b - 2) * 0.75 : 2.5));
  await page.mouse.up();
  p = await probe(page);
  const pts = p.recipe.envelope?.points ?? [];
  const after = await page.evaluate(() => window.__msFrame(6 * 12 + 2));
  console.log(`envelope: ${pts.length} points, at frame 74: ${after.envelope?.toFixed(2)}; rigged amplitude ${before.amplitude?.toFixed(3)} -> ${after.amplitude?.toFixed(3)}`);
  if (!pts.length || !(after.envelope > 2.3 && after.envelope < 2.7)) fail("pencil stroke did not set the envelope to about 2.5");
  if (!(after.amplitude > before.amplitude * 1.8)) fail("the envelope did not scale the motion");
  // Points mode: Shift-click the first point away, then start from the kicks.
  await page.click("#envPoints");
  await page.selectOption("#envSource", "kick");
  await page.click("#envInit");
  p = await probe(page);
  console.log(`envelope from kicks: ${p.recipe.envelope?.points.length} points`);
  if (!(p.recipe.envelope?.points.length > 10)) fail("envelope from kicks is empty");
  await page.locator("#strip").screenshot({ path: `${OUT}timeline-envelope.png` });
}

/** Feature 4: draw a walk path in the top view, start a camera move on the first snare, export through the rig with the grid. */
export async function smokeCameraPath(page, { fail, OUT, checkBundle }) {
  await page.evaluate(() => window.scrollTo(0, 0));
  if (!(await page.isChecked("#rigOn"))) await page.click("#rigOn");
  await page.fill("#walkFrom", "4"); await page.fill("#walkTo", "20");
  await page.selectOption("#walkGait", "Walk_Loop");
  await page.click("#drawWalk");
  const vp = await page.locator("#viewport canvas").boundingBox();
  const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let k = 1; k <= 24; k++) await page.mouse.move(cx + Math.sin(k / 24 * Math.PI) * vp.width * 0.18, cy - k / 24 * vp.height * 0.35);
  await page.mouse.up();
  let p = await probe(page);
  const path = p.recipe.rootPath;
  const a = await page.evaluate(() => window.__msFrame(2 * 12)), b = await page.evaluate(() => window.__msFrame(16 * 12));
  console.log(`walk path: ${path.length} root points, beats ${path[1]?.beat}–${path.at(-1)?.beat}; root at beat 2 (${a.root.x.toFixed(2)}, ${a.root.z.toFixed(2)}), at beat 16 (${b.root.x.toFixed(2)}, ${b.root.z.toFixed(2)})`);
  if (path.length < 3 || Math.hypot(b.root.x - a.root.x, b.root.z - a.root.z) < 0.5) fail("the drawn walk path does not move the character");
  if (!p.recipe.moves.some(m => m.clip === "Walk_Loop")) fail("no walk block over the path range");
  await page.locator("#viewport").screenshot({ path: `${OUT}walk-path-top.png` });
  // Camera: follow three-quarter, distance 5, then a push-in starting on the first snare.
  await page.selectOption("#camMoveMode", "threeQuarter");
  await page.selectOption("#camMoveTarget", "beat");
  await page.fill("#camMoveIndex", "0"); await page.fill("#camMoveLen", "32");
  await page.click("#camMoveGo");
  await page.selectOption("#camMoveMode", "pushIn");
  await page.selectOption("#camMoveTarget", "snare");
  await page.fill("#camMoveIndex", "0"); await page.fill("#camMoveLen", "4");
  await page.click("#camMoveGo");
  p = await probe(page);
  const segs = p.recipe.camera?.segments ?? [];
  console.log(`camera ranges: ${segs.map(s => `${s.modes.join("+")} ${s.fromBeat}-${s.toBeat}`).join(", ")}`);
  const push = segs.find(s => s.modes.includes("pushIn"));
  const firstSnare = (p.bands.mid[0] - p.recipe.beatGrid.offsetSeconds) * p.recipe.beatGrid.bpm / 60;
  if (!push || Math.abs(push.fromBeat - firstSnare) > 0.01) fail("camera push-in does not start on the first snare");
  // Export a short section through the rig camera, with the grid rendered.
  await page.click('[data-view="rig"]');
  await page.check("#grid"); await page.check("#gridExport");
  await page.selectOption("#rangeUnit", "beats");
  await page.fill("#rangeStart", "4"); await page.fill("#rangeLength", "8"); await page.dispatchEvent("#rangeLength", "input");
  const dl = page.waitForEvent("download", { timeout: 180_000 });
  await page.click("#export");
  const file = await (await dl).path();
  const meta = checkBundle((await import("node:fs")).readFileSync(file), "rig-walk", { kind: "rigged", audio: true, width: 1280, height: 720, sheet: [0, 12, 24, 36, 48, 60, 72, 96] });
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array((await import("node:fs")).readFileSync(file)));
  const beats = JSON.parse(strFromU8(files["beats.json"]));
  console.log(`rig export: view ${meta.view}, camera.json ${files["camera.json"] ? "present" : "missing"}, beats.json onsets: ${beats.onsets?.low.length} kicks, ${beats.onsets?.mid.length} snares, ${beats.onsets?.high.length} hats`);
  if (meta.view !== "rig" || !files["camera.json"]) fail("export did not render through the rig camera");
  // camera.json against the pinned schema's camera definition.
  const { Ajv2020 } = await import("ajv/dist/2020.js");
  const ajv = new Ajv2020({ strict: false });
  ajv.addSchema(JSON.parse((await import("node:fs")).readFileSync(new URL("../schema/guide-bundle.schema.json", import.meta.url), "utf8")));
  const camOk = ajv.validate("guide-bundle.schema.json#/$defs/camera", JSON.parse(strFromU8(files["camera.json"])));
  console.log(`rig export: camera.json ${camOk ? "validates" : "does NOT validate"} against the pinned schema`);
  if (!camOk) fail(`camera.json fails the schema: ${ajv.errorsText()}`);
  if (!beats.onsets || beats.onsets.low.length < 3) fail("beats.json has no band onsets");
}
