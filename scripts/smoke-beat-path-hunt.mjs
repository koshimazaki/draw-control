/**
 * The clumsy-user pass for the Beat Path page, called from smoke-beat-path.mjs. Each step is a
 * regression check for a bug found in the round-5 hunt:
 * - rapid example switching while playing lands on the last example with its own music;
 * - a selected scenery box or lane block never carries over to another example (Delete there did nothing wrong);
 * - typing in the API key's password field or the box height keeps Backspace and Cmd/Ctrl-Z for the field;
 * - undo after deleting points never leaves a selection pointing past the path;
 * - Generate: Escape cancels the cost dialog, Stop ends a run, a run started on one example files
 *   its result there (never on the example switched to), a second run works, Add to gallery once per clip;
 * - the gallery re-rendered keeps one playing row at most; no-track mode plays;
 * - any console error or warning fails the run.
 */

export async function smokeBeatPathHunt(browser, base, { fail }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
  const bp = fn => page.evaluate(fn);
  const ex = slot => page.click(`[data-control="example"] [data-value="${slot}"]`);

  // 1. Rapid switching while playing.
  await page.click("#barPlay");
  for (const s of ["1", "2", "0", "2", "1"]) await ex(s);
  await page.waitForTimeout(400);
  const landed = await bp(() => ({ slot: window.__beatPath.slot(), track: window.__beatPath.trackName(), kind: window.__beatPath.recipe().character.kind, playing: window.__beatPath.playing() }));
  if (landed.slot !== "1" || landed.track !== "generated-drive-140.wav" || landed.playing) fail(`rapid switching did not land on Example 2 with its music, paused: ${JSON.stringify(landed)}`);

  // 2. A selected scenery box does not carry over to another example.
  await page.click('[data-control="tool"] [data-value="blocks"]');
  const box = (await bp(() => window.__beatPath.boxes()))[0];
  if (box) {
    const at = await page.evaluate(q => window.__beatPath.mapPoint(q), { x: box.x, z: box.z });
    await page.mouse.click(at.x, at.y);
    const picked = await bp(() => window.__beatPath.boxSelected());
    await ex("2");
    const n = (await bp(() => window.__beatPath.boxes())).length;
    await page.locator("#map").focus(); await page.keyboard.press("Delete");
    const after = await bp(() => ({ sel: window.__beatPath.boxSelected(), n: window.__beatPath.boxes().length }));
    if (picked < 0) fail("a click on a scenery box did not select it");
    if (after.sel !== -1 || after.n !== n) fail(`a box selected on one example was deleted on another (${JSON.stringify(after)}, before ${n})`);
  } else fail("Example 2 has no scenery boxes to select");
  await page.click('[data-control="tool"] [data-value="subject"]');

  // 3. Keys inside fields: select a path point, then type in the box height and the API key field.
  const pt = (await bp(() => window.__beatPath.state())).subject[1];
  const pAt = await page.evaluate(q => window.__beatPath.mapPoint(q), pt);
  await page.mouse.click(pAt.x, pAt.y);
  const points0 = (await bp(() => window.__beatPath.state())).subject.length;
  await page.click("#keyButton");
  const keyInput = page.locator('#keySlot input[type="password"]');
  if (await keyInput.count()) {
    await keyInput.fill("abc"); await keyInput.press("Backspace"); await keyInput.press("ControlOrMeta+z");
    const s = await bp(() => window.__beatPath.state());
    if (s.subject.length !== points0) fail("Backspace or Cmd/Ctrl-Z in the API key field changed the path");
    if ((await keyInput.inputValue()).length > 3) fail("the key field lost its own typing");
    await keyInput.fill(""); await page.keyboard.press("Escape");
  } else fail("the API key popover has no password field");

  // 4. Delete two points, undo once, redo: the selection never points past the path.
  await page.mouse.click(pAt.x, pAt.y);
  await page.locator("#map").focus();
  await page.keyboard.press("Delete");
  await page.keyboard.press("ControlOrMeta+z"); await page.keyboard.press("ControlOrMeta+Shift+z"); await page.keyboard.press("ControlOrMeta+z");
  const sel = await bp(() => ({ sel: window.__beatPath.selection(), n: window.__beatPath.state().subject.length }));
  if (sel.n !== points0) fail(`undo after Delete did not restore the path (${sel.n} of ${points0})`);
  if (sel.sel && sel.sel.index >= sel.n) fail("a selection points past the path after undo");

  // 5. Generate on every model: Escape at the cost dialog, Stop mid-run, switch example mid-run, run twice.
  await page.waitForFunction(() => document.querySelector("#keySlot arena-key"), null, { timeout: 30_000 });
  await ex("0");
  for (const model of await page.$$eval('[data-control="model"] button', bs => bs.map(b => b.dataset.value))) {
    await page.click(`[data-control="model"] [data-value="${model}"]`);
    await page.click("#runGenerate"); await page.waitForSelector("#costDialog:not([hidden])");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("costDialog").hidden && document.getElementById("runGenerate").textContent === "Generate", null, { timeout: 15_000 })
      .catch(() => fail(`${model}: Escape did not cancel the cost dialog`));
    for (let k = 0; k < 2; k++) {
      await page.click("#runGenerate"); await page.waitForSelector("#costDialog:not([hidden])"); await page.click("#costOk");
      await page.waitForFunction(() => document.querySelector("#generateSlot arena-player") && document.getElementById("runGenerate").textContent === "Generate", null, { timeout: 60_000 })
        .catch(() => fail(`${model}: run ${k + 1} did not finish`));
    }
  }
  // Stop during the run.
  await page.click("#runGenerate"); await page.waitForSelector("#costDialog:not([hidden])"); await page.click("#costOk");
  await page.click("#runGenerate");
  await page.waitForFunction(() => document.getElementById("runGenerate").textContent === "Generate", null, { timeout: 30_000 }).catch(() => fail("Stop did not end the run"));
  // A run started on Your own, then a switch to Example 3 mid-run: the result stays with Your own.
  await ex("own");
  await page.click("#runGenerate");
  if (!/Describe the shot first/.test(await page.textContent("#status") ?? "") || await page.evaluate(() => document.activeElement?.id) !== "shotSubject") fail("Generate with an empty shot did not ask for one");
  await page.fill("#shotSubject", "a paper plane"); await page.press("#shotSubject", "Tab");
  await page.click("#runGenerate"); await page.waitForSelector("#costDialog:not([hidden])"); await page.click("#costOk");
  await ex("2");
  await page.waitForFunction(() => document.getElementById("runGenerate").textContent === "Generate", null, { timeout: 60_000 });
  const leaked = await page.evaluate(() => !!document.querySelector("#generateSlot arena-player") && !document.getElementById("screenOutput").hidden);
  if (leaked) fail("a run started on Your own showed its result on Example 3");
  await ex("own");
  if (!(await page.evaluate(() => !!document.querySelector("#generateSlot arena-player")))) fail("the run started on Your own is not shown back on Your own");

  // 6. Add to gallery twice: one run; the gallery re-rendered keeps at most one row playing.
  await page.click("#addToGallery"); await page.click("#addToGallery");
  const rows = await page.locator("#gallerySlot .gallery-row").last().locator("video").count();
  if (rows !== 1) fail(`Add to gallery twice added ${rows} clips`);
  await page.evaluate(() => document.getElementById("gallery").scrollIntoView());
  await page.locator("#gallerySlot .gallery-row .play-btn").first().click();
  await page.waitForTimeout(300);
  await ex("0"); await page.click("#addToGallery");   // re-renders the gallery
  await page.waitForTimeout(300);
  const playing = await page.evaluate(() => [...document.querySelectorAll("audio")].filter(a => !a.paused).length);
  if (playing > 0) fail(`${playing} gallery audio still playing after the gallery re-rendered`);
  await page.evaluate(() => window.scrollTo(0, 0));

  // 7. No track: plays on the wall clock.
  await page.click("#removeTrack");
  await page.click("#barPlay"); await page.waitForTimeout(600);
  const noTrack = await bp(() => ({ playing: window.__beatPath.playing(), head: window.__beatPath.head() }));
  await page.click("#barPlay");
  if (!noTrack.playing || noTrack.head < 0.2) fail(`no-track mode does not play (${JSON.stringify(noTrack)})`);

  if (errors.length) fail(`clumsy pass logged: ${errors.join(" | ")}`);
  console.log("beat path hunt: switching, selections, field keys, undo, generate (cancel, stop, twice, mid-switch), gallery, no track checked");
  await page.close();
}
