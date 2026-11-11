/**
 * Smoke steps for the shot script and the Camera track, run by scripts/smoke.mjs after the
 * walk path step (the recipe has a drawn walk path over beats 4–20 and a camera rig):
 * 1. a shot script typed into the Shot script panel builds the Action and Camera tracks;
 * 2. a camera block's edge is dragged on the timeline (the shared cut rolls), then undone;
 * 3. the Distance lane is opened and drawn with the pencil;
 * 4. the Height lane is armed and recorded during playback;
 * 5. the top and orbit views are captured mid-playback (current blocks brightened, stations).
 */
import { probe, showTimeline } from "./smoke-features.mjs";

const SCRIPT = `beats 0-4   | action: idle                      | camera: static    | shot: medium
beats 4-20  | action: walk on path lock kick 0.8 | camera: chase     | shot: wide
beats 20-22 | action: jump @kick 1              | camera: orbit 360 | shot: medium
beats 22-24 | action: rest                      | camera: top       | shot: wide
beats 24-28 | action: run                       | camera: chase lock snare punch 0.4m | shot: close`;

export async function smokeCameraTrack(page, { fail, OUT }) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.fill("#shotScript", SCRIPT);
  await page.click("#applyScript");
  let p = await probe(page);
  const segs = p.recipe.camera.segments;
  const printed = await page.inputValue("#shotScript");
  console.log(`shot script: ${p.recipe.moves.length} moves, ${segs.length} camera blocks; travel lock ${JSON.stringify(p.recipe.travelLock)}; reads back:\n${printed.split("\n").slice(0, 5).join("\n")}`);
  const orbit = segs.findIndex(s => s.modes[0] === "orbit");
  if (orbit < 0 || segs[orbit].amount !== 360 || segs[orbit].shot !== "medium") fail("the script did not make the orbit 360 block");
  if (p.recipe.travelLock?.lock !== "kick" || !p.recipe.moves.some(m => m.clip === "Walk_Loop" && m.lock === "kick")) fail("the script did not lock the walk");
  if (!/beats 20-22 +\| action: jump @kick 1 +\| camera: orbit 360 +\| shot: medium/.test(printed)) fail("the script does not read back");

  // Drag the orbit block's end edge from beat 22 to 23 (snapping to beats): the next block's start rolls with it.
  await page.selectOption("#tlSnapTarget", "beat");
  await showTimeline(page);
  const box = await page.locator("#strip").boundingBox(), total = p.recipe.durationBeats;
  const x = b => box.x + b / total * box.width, y = box.y + p.lanes.camera + 17;
  await page.mouse.move(x(22) - 2, y); await page.mouse.down();
  for (let b = 22; b <= 23.01; b += 0.25) await page.mouse.move(x(b) - 2, y);
  await page.mouse.up();
  p = await probe(page);
  const after = p.recipe.camera.segments;
  console.log(`camera block drag: orbit ${after[orbit].fromBeat}-${after[orbit].toBeat}, next ${after[orbit + 1].fromBeat}-${after[orbit + 1].toBeat}; inspector: ${await page.textContent("#camBlockWords")}`);
  if (after[orbit].toBeat !== 23 || after[orbit + 1].fromBeat !== 23) fail("dragging the camera block's edge did not roll the cut to beat 23");
  if (!(await page.isVisible("#camBlock"))) fail("selecting a camera block did not open its inspector");
  await page.keyboard.press("ControlOrMeta+z");
  p = await probe(page);
  if (p.recipe.camera.segments[orbit].toBeat !== 22) fail("undo did not bring the camera block back");
  console.log("undo: orbit block back to 20-22");

  // Open the Distance lane and draw it with the pencil from beat 8 to 14 at about 3 m.
  await page.click('.lane-toggle[data-lane="camDistance"]');
  await page.click("#envPencil");
  p = await probe(page);
  const top = p.lanes.camDistance, h = 70, pad = 4, yOf = v => box.y + top + h - pad - v / 12 * (h - 2 * pad);
  await showTimeline(page);
  const box2 = await page.locator("#strip").boundingBox(), x2 = b => box2.x + b / total * box2.width, y2 = v => yOf(v) - box.y + box2.y;
  await page.mouse.move(x2(8), y2(3)); await page.mouse.down();
  for (let b = 8; b <= 14; b += 0.5) await page.mouse.move(x2(b), y2(3));
  await page.mouse.up();
  p = await probe(page);
  const lane = p.recipe.camera.lanes?.distance?.points ?? [];
  console.log(`distance lane: ${lane.length} points, frames ${lane[0]?.[0]}–${lane.at(-1)?.[0]}, values ${lane.map(q => q[1]).join(", ")}`);
  if (!lane.length || lane.some(q => Math.abs(q[1] - 3) > 0.3)) fail("the pencil did not draw the distance lane at about 3 m");
  await page.locator("#strip").screenshot({ path: `${OUT}timeline-camera-track.png` });

  // Record the height lane: arm, play from beat 4 for a second with the slider at 2.5 m, stop.
  await page.selectOption("#recLane", "height");
  await page.click("#recArm");
  await page.fill("#recValue", "2.5");
  p = await probe(page);   // arming opened the Height lane: the lanes below moved down
  await page.click("#strip", { position: { x: 4 / total * box2.width, y: p.lanes.audio + 20 } });
  console.log(`record: armed, slider ${await page.inputValue("#recValue")}, frame ${(await probe(page)).frame}`);
  await page.click("#play");
  await page.waitForTimeout(1000);
  console.log(`record: after 1 s, slider ${await page.inputValue("#recValue")}, frame ${(await probe(page)).frame}`);
  await page.click('[data-view="top"]');
  await page.locator("#viewport").screenshot({ path: `${OUT}paths-top-playing.png` });
  await page.click('[data-view="orbit"]');
  await page.locator("#viewport").screenshot({ path: `${OUT}paths-orbit-playing.png` });
  await page.click("#play");
  await page.click("#recArm");
  p = await probe(page);
  const rec = p.recipe.camera.lanes?.height?.points ?? [];
  console.log(`recorded height lane: ${rec.length} points, frames ${rec[0]?.[0]}–${rec.at(-1)?.[0]}, values ${[...new Set(rec.map(q => q[1]))].join(", ")} (screenshots paths-top-playing.png, paths-orbit-playing.png)`);
  if (!rec.length || rec.some(q => q[1] !== 2.5)) fail("recording did not write the height lane at 2.5 m");
}

/** First run with nothing but the repo: Load demo generates the track and applies examples/scripts/glide-path.txt. */
export async function smokeDemo(page, { fail, OUT }) {
  await page.goto(page.url());
  await page.waitForFunction(() => document.querySelector("#clipPalette button"), null, { timeout: 30_000 });
  await page.click("#loadDemo");
  await page.waitForFunction(() => window.__msProbe().recipe.travelLock, null, { timeout: 60_000 });
  const p = await probe(page);
  const script = await page.inputValue("#shotScript");
  console.log(`demo: ${await page.textContent("#trackStatus")}\n${script.split("\n").slice(0, 3).join("\n")}`);
  if (p.recipe.audio?.name !== "demo-drums-120.wav" || p.recipe.camera?.path?.length !== 3 || p.recipe.travelLock?.lock !== "kick") fail("Load demo did not load the track and the glide script");
  if (!(await page.locator('[data-view="rig"]').evaluate(b => b.classList.contains("on")))) fail("Load demo did not switch to the camera rig view");
  await page.fill("#cursorBeat", "8");
  await page.locator("#viewport").screenshot({ path: `${OUT}demo-rig.png` });
}
