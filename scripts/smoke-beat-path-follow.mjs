/**
 * Follow cameras on the map, called from smoke-beat-path.mjs:
 * 1. Example 1: drag the Follow behind line outwards; the block is still Follow behind with a
 *    larger distance, and Cmd/Ctrl-Z takes the drag back in one step;
 * 2. Example 2 (a street, sight "passes"): Follow side → Right, distance 20 m typed; the block
 *    stays Follow side, the camera is on the subject's right beyond the row of blocks, and the
 *    blocks between hide the subject within the caps;
 * any console error or warning fails the run.
 */
export async function smokeBeatPathFollow(browser, base, { fail, SHOTS }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html?theme=runware`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
  const lane = () => page.evaluate(() => window.__beatPath.state().cameraLane);
  await page.click('[data-control="tool"] [data-value="camera"]');
  await page.click('[data-control="pen"] [data-value="edit"]');

  // 1. Drag the Follow behind line out by half again its distance.
  const seg = (await page.evaluate(() => window.__beatPath.followSegs())).find(s => s.word === "behind");
  if (!seg) { fail("Example 1 has no draggable Follow behind line on the map"); return; }
  const k = Math.floor(seg.points.length / 2), p0 = seg.points[k], a = seg.anchors[k];
  const out = { x: a.x + (p0.x - a.x) * 1.6, z: a.z + (p0.z - a.z) * 1.6 };
  const before = (await lane())[seg.block];
  const s0 = await page.evaluate(q => window.__beatPath.mapPoint(q), p0), s1 = await page.evaluate(q => window.__beatPath.mapPoint(q), out);
  await page.mouse.move(s0.x, s0.y); await page.mouse.down(); await page.mouse.move(s1.x, s1.y, { steps: 8 }); await page.mouse.up();
  const after = (await lane())[seg.block];
  const was = Math.hypot(p0.x - a.x, p0.z - a.z);
  console.log(`beat path follow: dragged Follow behind from ${was.toFixed(1)} m to ${JSON.stringify(after.follow)}`);
  if (after.word !== "behind" || after.phrase) fail(`dragging the follow line changed the block (${after.word}${after.phrase ? `, "${after.phrase}"` : ""})`);
  if (!(after.follow?.distance > was * 1.3)) fail(`dragging the follow line out did not raise its distance (${JSON.stringify(after.follow)}, was ${was.toFixed(1)} m)`);
  if (!/distance \d/.test(await page.evaluate(() => window.__beatPath.script()))) fail("the follow offset is not in the shot script");
  if (await page.locator("#followRow").isHidden()) fail("the follow fields are hidden for a follow block under the playhead");
  await page.locator("#map").focus(); await page.keyboard.press("ControlOrMeta+z");
  if (JSON.stringify((await lane())[seg.block]) !== JSON.stringify(before)) fail("undo did not take the follow drag back in one step");

  // 2. Example 2: Follow side, right, 20 m, beyond the street's row, sight passes.
  await page.click('[data-control="example"] [data-value="1"]');
  await page.waitForFunction(() => window.__beatPath.trackName() === "generated-drive-140.wav", null, { timeout: 30_000 });
  await page.click('[data-control="tool"] [data-value="camera"]');
  if (!(await page.evaluate(() => window.__beatPath.state().sight === "passes"))) fail("Example 2 is not set to sight passes");
  await page.click("#followRight");
  await page.fill("#followDistance", "20"); await page.press("#followDistance", "Enter"); await page.locator("#map").focus();
  await page.waitForTimeout(200);
  const b0 = (await lane())[0], probe = await page.evaluate(() => window.__beatPath.followProbe(0));
  console.log(`beat path follow: Example 2 block ${JSON.stringify(b0)}; camera ${probe.right.toFixed(1)} m right; ${probe.blocks} blocks, longest hidden ${probe.longest}/${probe.maxRun} samples, share ${(probe.share * 100).toFixed(1)} %/${probe.maxShare * 100} %`);
  if (b0.word !== "side" || b0.phrase || Math.abs(b0.follow?.angle ?? 0) < 90 || b0.follow?.distance !== 20) fail(`the side block did not stay Follow side, right, 20 m: ${JSON.stringify(b0)}`);
  if (!(probe.right > 14)) fail(`the side camera is not on the far (right) side (${probe.right.toFixed(1)} m)`);
  if (probe.longest > probe.maxRun || probe.share > probe.maxShare + 1e-9) fail(`the blocks hide the subject beyond the caps (${probe.longest} samples, ${(probe.share * 100).toFixed(1)} %)`);
  await page.screenshot({ path: `${SHOTS}beat-path-follow-side-right.png` });
  if (errors.length) fail(`follow step logged: ${errors.join(" | ")}`);
  await page.close();
}
