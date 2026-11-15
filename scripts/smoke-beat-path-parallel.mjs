/**
 * The parallel-street shot by hand (round 8), called from smoke-beat-path.mjs, on Your own:
 * a block, Cmd/Ctrl-D three times for a row; Subject: a click and a Shift-click make a
 * straight street (a new path, not added to the old one); Camera: the same on the far side of
 * the row. The camera path flies the whole clip and the Parallel street preset sets Follow
 * side beyond the row. Any console error or warning fails the run.
 */
export async function smokeBeatPathParallel(browser, base, { fail, SHOTS }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html?theme=runware`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
  await page.click('[data-control="example"] [data-value="own"]');
  await page.waitForTimeout(300);
  const at = q => page.evaluate(q => window.__beatPath.mapPoint(q), q);
  const state = () => page.evaluate(() => window.__beatPath.state());
  let steps = 1;
  // A row of blocks: draw one, duplicate it three times.
  await page.click('[data-control="tool"] [data-value="blocks"]'); await page.click('[data-control="pen"] [data-value="draw"]'); steps += 2;
  const a = await at({ x: -12, z: 4 }), b = await at({ x: -9, z: 8 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up(); steps++;
  for (let k = 0; k < 3; k++) { await page.keyboard.press("ControlOrMeta+d"); steps++; }
  const boxes = (await state()).boxes ?? [];
  const row = boxes.filter(x => Math.abs(x.z - 6) < 0.6);
  if (row.length < 4) fail(`Cmd/Ctrl-D did not make a row of four blocks (${row.length})`);
  // The subject's street: a click, then a Shift-click (straight along the axis), a new path.
  await page.click('[data-control="tool"] [data-value="subject"]'); steps++;
  for (const [q, shift] of [[{ x: -14, z: 0 }, false], [{ x: 14, z: 0.8 }, true]]) {
    const s = await at(q);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.click(s.x, s.y); steps++;
    if (shift) await page.keyboard.up("Shift");
  }
  const subj = (await state()).subject;
  if (subj.length !== 2 || subj[0].z !== subj[1].z) fail(`the subject's street is not a new straight two-point path: ${JSON.stringify(subj)}`);
  // The camera's street on the far side of the row.
  await page.click('[data-control="tool"] [data-value="camera"]'); steps++;
  for (const [q, shift] of [[{ x: -14, z: 12 }, false], [{ x: 14, z: 12.6 }, true]]) {
    const s = await at(q);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.click(s.x, s.y); steps++;
    if (shift) await page.keyboard.up("Shift");
  }
  const st = await state();
  console.log(`draw control parallel by hand: ${steps} steps; subject ${JSON.stringify(st.subject)}, camera ${JSON.stringify(st.camera)}, lane ${st.cameraLane.map(x => `${x.word} ${x.from}-${x.to}`).join(", ")}`);
  if (st.camera.length !== 2 || st.camera[0].z !== st.camera[1].z) fail(`the camera's street is not a straight two-point path: ${JSON.stringify(st.camera)}`);
  if (st.cameraLane.length !== 1 || st.cameraLane[0].word !== "path") fail(`the drawn camera path does not fly the whole clip: ${JSON.stringify(st.cameraLane)}`);
  await page.screenshot({ path: `${SHOTS}beat-path-parallel-by-hand.png` });
  // The one-click alternative: Parallel street on the camera block.
  await page.click("#laneCamera .block >> nth=0");
  await page.click('#menu button:has-text("Parallel street")');
  const ps = await state();
  if (ps.cameraLane[0].word !== "side" || !(ps.cameraLane[0].follow?.distance >= 10) || ps.sight !== "passes") fail(`Parallel street did not set Follow side beyond the row with Pass in front: ${JSON.stringify(ps.cameraLane[0])}, sight ${ps.sight}`);
  if (errors.length) fail(`parallel step logged: ${errors.join(" | ")}`);
  await page.close();
}
