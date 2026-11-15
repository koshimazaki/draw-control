/**
 * The clumsy-user pass for the Beat Path page, called from smoke-beat-path.mjs. Each step is a
 * regression check for a bug found in the round-5 hunt:
 * - rapid example switching while playing lands on the last example with its own music;
 * - a selected scenery box or lane block never carries over to another example (Delete there did nothing wrong);
 * - typing in the API key's password field or the box height keeps Backspace and Cmd/Ctrl-Z for the field;
 * - undo after deleting points never leaves a selection pointing past the path;
 * - a Camera block dragged by its body changes places with its neighbour (Escape cancels, a click stays a click, one undo);
 * - an edge dragged in small steps across several beats follows all the way (one undo); a block drag
 *   held while Generate starts the guide render goes back, with no undo step of its own;
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

  // 4b. Move a Camera block by dragging its body past its neighbour; a plain click still opens the menu; undo puts it back.
  await smokeLaneMove(page, { fail });

  // 5. Generate on every model: Escape at the cost dialog, Stop mid-run, switch example mid-run, run twice.
  await page.waitForFunction(() => document.querySelector("#keySlot arena-key"), null, { timeout: 30_000 });
  await ex("0");
  await smokeLaneEdge(page, { fail });
  await smokeLaneInterrupted(page, { fail });
  await smokeLaneUndoHeld(page, { fail });
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
  console.log("beat path hunt: switching, selections, field keys, undo, generate (cancel, stop, twice, mid-switch), gallery, no track, paid-run safety checked");
  await page.close();
  await smokePaidRuns(browser, base, { fail });
}

/** The Camera lane's body drag (lanes.ts): order changes, lengths and tiling kept, Escape cancels, a click is still a click, one undo step. */
async function smokeLaneMove(page, { fail }) {
  const lane = () => page.evaluate(() => window.__beatPath.state().cameraLane.map(b => ({ from: b.from, to: b.to, word: b.word })));
  const tiles = l => l[0].from === 0 && l.every((b, k) => k === 0 || b.from === l[k - 1].to) && l.every(b => b.to > b.from);
  const shape = l => JSON.stringify(l.map(b => [b.word, +(b.to - b.from).toFixed(3)]));
  if ((await lane()).length < 2) {
    await page.click("#laneCamera .block >> nth=0"); await page.click('#menu button:has-text("Split every 4 beats")');
  }
  // Give the first two blocks different words, so a swap shows in the order.
  const first = await lane();
  if (first[0].word === first[1].word) { await page.click("#laneCamera .block >> nth=1"); await page.click(`#menu button:has-text("${first[1].word === "top" ? "Orbit" : "Top"}")`); }
  const before = await lane();
  const drag = async (end, escape = false) => {
    const [a, b] = await laneBoxes(page), y = a.y + a.height / 2;
    await page.mouse.move(a.x + a.width / 2, y); await page.mouse.down();
    // Far enough that block 1's middle is passed: the right edge of block 0 goes past it.
    const dx = b.x + b.width / 2 - (a.x + a.width) + 12;
    for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + a.width / 2 + dx * k / 8, y);
    const during = await page.evaluate(() => ({ moving: !!document.querySelector("#laneCamera .block.moving"), slot: !!document.querySelector("#laneCamera .lane-slot") }));
    if (!during.moving || !during.slot) fail(`a block drag shows no moving block or landing slot (${JSON.stringify(during)})`);
    if (escape) await page.keyboard.press("Escape");
    await page.mouse.up();
    if (end) await end();
  };
  // Escape during the drag: everything goes back, and the release opens no menu.
  await drag(null, true);
  if (shape(await lane()) !== shape(before)) fail(`Escape during a block drag did not put the lane back: ${shape(await lane())} vs ${shape(before)}`);
  if (!(await page.evaluate(() => document.getElementById("menu").hidden))) fail("releasing a cancelled block drag opened the menu");
  // A real move: block 0 lands after block 1, both keep their lengths, the lane tiles to the same end.
  await drag();
  const after = await lane();
  const swapped = shape([before[1], before[0], ...before.slice(2)]);
  if (shape(after) !== swapped || !tiles(after) || after.at(-1).to !== before.at(-1).to) fail(`dragging Camera block 1 past block 2 did not swap them: ${shape(after)} (wanted ${swapped})`);
  if (!(await page.evaluate(() => document.getElementById("menu").hidden))) fail("releasing a block drag opened the menu");
  // A plain click still opens the block's menu.
  await page.click("#laneCamera .block >> nth=0");
  if (await page.evaluate(() => document.getElementById("menu").hidden)) fail("a plain click on a Camera block no longer opens its menu");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  // One undo step takes the move back.
  await page.keyboard.press("ControlOrMeta+z");
  if (shape(await lane()) !== shape(before)) fail(`undo after a block move did not restore the order: ${shape(await lane())}`);
  console.log(`beat path lanes: block drag ${shape(before)} → ${shape(after)}, Escape, click, undo checked`);
}

/**
 * Where the Camera lane's blocks (or edges) are, measured together in the page once the lane is ready
 * to grab: no menu open, at least two blocks, each laid out. One measurement for all of them, so a
 * lane re-rendered between two lookups (it replaces its elements) can never hand back a detached one.
 */
const laneBoxes = (page, what = ".block") => page.waitForFunction(sel => {
  const els = [...document.querySelectorAll(`#laneCamera ${sel}`)];
  if (!document.getElementById("menu").hidden || els.length < (sel === ".block" ? 2 : 1)) return null;
  const r = els.map(e => e.getBoundingClientRect());
  return r.every(b => b.width > 0 && b.height > 0) ? r.map(b => ({ x: b.x, y: b.y, width: b.width, height: b.height })) : null;
}, what, { timeout: 10_000 }).then(h => h.jsonValue());

const cameraLane = page => page.evaluate(() => JSON.stringify(window.__beatPath.state().cameraLane.map(b => [b.word, b.from, b.to])));

/** The edge between two Camera blocks dragged in small steps over four beats: the cut follows to the end (the lane re-renders each step), one undo. */
async function smokeLaneEdge(page, { fail }) {
  const before = await cameraLane(page), total = await page.evaluate(() => window.__beatPath.state().cameraLane.at(-1).to);
  const lane = await page.locator("#laneCamera").boundingBox(), [edge] = await laneBoxes(page, ".edge");
  const x0 = edge.x + 2, y = edge.y + edge.height / 2, cut0 = JSON.parse(before)[0][2];
  await page.mouse.move(x0, y); await page.mouse.down();
  const cuts = [];
  for (let k = 1; k <= 40; k++) { await page.mouse.move(x0 + k / 40 * 4 * lane.width / total, y); cuts.push(JSON.parse(await cameraLane(page))[0][2]); }
  await page.mouse.up();
  const after = JSON.parse(await cameraLane(page))[0][2], steps = new Set(cuts).size;
  console.log(`beat path lanes: edge drag in 40 small steps, cut ${cut0} → ${after} through ${steps} positions`);
  if (!(after >= cut0 + 3) || steps < 3) fail(`an edge drag lost the pointer after the first step (cut ${cut0} → ${after}, ${steps} positions: ${cuts.join(",")})`);
  if (!(await page.evaluate(() => document.getElementById("menu").hidden))) fail("releasing an edge drag opened the menu");
  await page.keyboard.press("ControlOrMeta+z");
  if (await cameraLane(page) !== before) fail(`one undo after an edge drag did not restore the lane: ${await cameraLane(page)} vs ${before}`);
}

/** Cmd/Ctrl-Z while a block drag is held: the drag ends (the lane put back) and that is all; the edit before it stays. */
async function smokeLaneUndoHeld(page, { fail }) {
  const sight = () => page.evaluate(() => window.__beatPath.state().sight);
  await page.evaluate(() => document.getElementById("sightPasses").click());
  const sight1 = await sight(), before = await cameraLane(page);
  const [a, b] = await laneBoxes(page), y = a.y + a.height / 2;
  await page.mouse.move(a.x + a.width / 2, y); await page.mouse.down();
  const dx = b.x + b.width / 2 - (a.x + a.width) + 12;
  for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + a.width / 2 + dx * k / 8, y);
  const moved = await cameraLane(page);
  await page.keyboard.press("ControlOrMeta+z");
  const after = { lane: await cameraLane(page), sight: await sight() };
  await page.mouse.up();
  console.log(`beat path lanes: undo during a held block drag: ${moved} → ${after.lane}, sight ${sight1} → ${after.sight}`);
  if (moved === before) fail("the held block drag did not rearrange the lane (the undo step proves nothing)");
  if (after.lane !== before || after.sight !== sight1) fail(`one undo during a held drag did more than end the drag: ${JSON.stringify(after)} (lane ${before}, sight ${sight1})`);
  await page.keyboard.press("ControlOrMeta+z");   // the sight toggle, taken back for the steps after
}

/**
 * A block drag still held when Generate (pressed with the keyboard) starts the guide render: the lane goes
 * back to its order before the drag, the release changes nothing, and the drag leaves no undo step (one
 * undo takes back the edit before it, a lane-free one).
 */
async function smokeLaneInterrupted(page, { fail }) {
  const sight = () => page.evaluate(() => window.__beatPath.state().sight);
  const sight0 = await sight();
  await page.evaluate(() => document.getElementById("sightPasses").click());   // the last undo step: no lane in it
  const before = await cameraLane(page);
  const [a, b] = await laneBoxes(page), y = a.y + a.height / 2;
  await page.mouse.move(a.x + a.width / 2, y); await page.mouse.down();
  const dx = b.x + b.width / 2 - (a.x + a.width) + 12;
  for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + a.width / 2 + dx * k / 8, y);
  const moved = await cameraLane(page);
  await page.focus("#runGenerate"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("outputNote").textContent === "Rendering the guide…", null, { timeout: 15_000 }).catch(() => fail("Generate from the keyboard did not start the guide render"));
  const during = { lane: await cameraLane(page), moving: await page.evaluate(() => !!document.querySelector("#laneCamera .block.moving, #laneCamera .lane-slot")) };
  await page.mouse.move(a.x + a.width / 2 + dx + 30, y); await page.mouse.up();
  const released = await cameraLane(page);
  await page.waitForSelector("#costDialog:not([hidden])", { timeout: 120_000 }); await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("runGenerate").textContent === "Generate" && !window.__beatPath.busy(), null, { timeout: 15_000 }).catch(() => fail("the run did not end after Escape at its question"));
  console.log(`beat path lanes: a block drag interrupted by the guide render: ${before} → mid-drag ${moved} → render ${during.lane}, released ${released}`);
  if (moved === before) fail("the block drag did not rearrange the lane before the render (the step proves nothing)");
  if (during.lane !== before || during.moving) fail(`the render started with the lane mid-drag: ${JSON.stringify(during)} (before ${before})`);
  if (released !== before) fail(`releasing a block drag the render ended changed the lane: ${released} vs ${before}`);
  await page.keyboard.press("ControlOrMeta+z");
  const undone = { lane: await cameraLane(page), sight: await sight() };
  if (undone.lane !== before || undone.sight !== sight0) fail(`one undo after the interrupted drag did not take back the edit before it, and only it: ${JSON.stringify(undone)} (lane before ${before}, sight ${sight0})`);
}

/**
 * Paid-run safety, with the fake provider:
 * - Stop while the guide renders: Generate again within about a second, "nothing was submitted", no
 *   inference task sent, the page free (not busy, the shot fields on); a second run then goes to the end;
 * - a switch during "Rendering the guide…" is refused, and the run completes on the example it started on;
 * - the image panel's question while the video guide renders waits its turn: OK answers the question on screen;
 * - switching away from the running job and back shows its progress again; Stop ends a question still waiting.
 */
async function smokePaidRuns(browser, base, { fail }) {
  // A page of its own: each guide render makes a WebGL context, and the pass above has made many.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio && document.querySelector("#keySlot arena-key"), null, { timeout: 60_000 });
  const bp = fn => page.evaluate(fn);
  const ex = slot => page.click(`[data-control="example"] [data-value="${slot}"]`);
  const title = () => page.textContent("#costTitle");
  const dialogOpen = () => page.waitForSelector("#costDialog:not([hidden])", { timeout: 120_000 });
  const idle = () => page.waitForFunction(() => document.getElementById("runGenerate").textContent === "Generate", null, { timeout: 120_000 });
  // A page control while the dialog covers the page: clicked as a script would.
  const press = sel => page.evaluate(s => document.querySelector(s).click(), sel);
  await ex("0");
  await page.waitForFunction(() => window.__beatPath.slot() === "0", null, { timeout: 30_000 });

  // 0. Stop while the guide renders.
  const videoTasks = () => page.evaluate(() => (globalThis.__fakeTasks ?? []).filter(t => t.taskType === "videoInference").length);
  const tasks0 = await videoTasks();
  await page.click("#runGenerate");
  await page.waitForFunction(() => document.getElementById("outputNote").textContent === "Rendering the guide…" && window.__beatPath.busy(), null, { timeout: 30_000 });
  const t0 = Date.now();
  await page.click("#runGenerate");
  const gaveBack = await page.waitForFunction(() => document.getElementById("runGenerate").textContent === "Generate", null, { timeout: 5_000 }).then(() => true, () => false);
  const stopMs = Date.now() - t0;
  await page.waitForTimeout(500);   // a render that kept going would reach its task by now
  const stopped = await page.evaluate(() => ({ status: document.getElementById("status").textContent, busy: window.__beatPath.busy(), shotOn: !document.getElementById("shotSubject").disabled, dialog: !document.getElementById("costDialog").hidden }));
  const sentAfterStop = await videoTasks() - tasks0;
  console.log(`beat path paid runs: Stop during the render: Generate again after ${stopMs} ms, ${JSON.stringify(stopped)}, ${sentAfterStop} tasks sent`);
  if (!gaveBack || stopMs > 1500) fail(`Stop during the guide render took ${stopMs} ms to give Generate back`);
  if (!/stopped/i.test(stopped.status ?? "") || !/nothing was submitted/i.test(stopped.status ?? "")) fail(`Stop during the render did not say it stopped with nothing submitted: ${stopped.status}`);
  if (stopped.busy || !stopped.shotOn || stopped.dialog) fail(`Stop during the render left the page busy, the shot locked or a question open (${JSON.stringify(stopped)})`);
  if (sentAfterStop) fail(`Stop during the render still sent ${sentAfterStop} inference task(s)`);
  await page.click("#runGenerate"); await dialogOpen(); await page.click("#costOk"); await idle();
  if (!(await page.evaluate(() => !!document.querySelector("#generateSlot arena-player"))) || await videoTasks() - tasks0 !== 1) fail("the run after a Stop during the render did not go to the end");

  // 1. A switch during the render is refused; the run goes out with Example 1's shot.
  const subject = (await bp(() => window.__beatPath.state())).shot.subject;
  await page.click("#runGenerate");
  await page.waitForFunction(() => document.getElementById("outputNote").textContent === "Rendering the guide…" && document.getElementById("outputNote").isConnected);
  await ex("1");
  const during = await bp(() => ({ slot: window.__beatPath.slot(), status: document.getElementById("status").textContent, on: document.querySelector('[data-control="example"] button.on')?.dataset.value }));
  console.log(`beat path paid runs: switch during the render: ${JSON.stringify(during)}`);
  if (during.slot !== "0" || during.on !== "0" || !/guide is rendering/.test(during.status ?? "")) fail(`a switch during the guide render was not refused: ${JSON.stringify(during)}`);
  // An edit refused during the render says so, not that it landed (Whole clip once reported success over the refusal).
  const laneNow = () => bp(() => JSON.stringify(window.__beatPath.state().cameraLane));
  const lane0 = await laneNow();
  const whole = await bp(() => { document.getElementById("status").textContent = ""; document.getElementById("wholeClip").click(); return { status: document.getElementById("status").textContent, busy: window.__beatPath.busy() }; });
  whole.same = (await laneNow()) === lane0;
  console.log(`beat path paid runs: Whole clip during the render: ${JSON.stringify(whole)}`);
  if (!whole.busy) fail("the render ended before Whole clip was pressed (the step proves nothing)");
  else if (!/guide is rendering/.test(whole.status ?? "") || !whole.same) fail(`Whole clip during the guide render did not say it was refused: ${JSON.stringify(whole)}`);
  await dialogOpen(); await page.click("#costOk"); await idle();
  const sent = await page.evaluate(() => (globalThis.__fakeTasks ?? []).filter(t => t.taskType === "videoInference").at(-1)?.positivePrompt ?? "");
  const shown = await bp(() => ({ slot: window.__beatPath.slot(), player: !!document.querySelector("#generateSlot arena-player") }));
  const words = subject.toLowerCase().match(/[a-z]{5,}/g) ?? [];
  if (shown.slot !== "0" || !shown.player || !words.length || !words.every(w => sent.toLowerCase().includes(w))) fail(`the run did not complete on Example 1 with its shot (slot ${shown.slot}, prompt "${sent}", subject "${subject}")`);

  // 2. Two questions at once: the image's shows first, the video's waits and shows after it.
  await page.click("#runGenerate");
  await page.waitForFunction(() => document.getElementById("outputNote").textContent === "Rendering the guide…");
  await page.click("#genCharacter");
  const pop = page.locator(".image-pop");
  await pop.locator(".ip-family").selectOption("ByteDance Seedream"); await pop.locator(".ip-model").selectOption("seedream-5.5");
  await pop.locator(".ip-run").click();
  await dialogOpen();
  const first = await title();
  // The guide finishes behind the dialog: the video run reaches its own question, which waits.
  await page.waitForFunction(() => /^estimated/.test(document.getElementById("outputNote").textContent ?? ""), null, { timeout: 120_000 });
  const still = await title();
  await page.click("#costCancel");
  const imageNote = await page.textContent("#status");
  await page.waitForFunction(() => document.getElementById("costTitle").textContent === "Generate with this model?" && !document.getElementById("costDialog").hidden, null, { timeout: 10_000 })
    .catch(() => fail("the video run's question did not show after the image's was answered"));
  console.log(`beat path paid runs: questions in turn: "${first}", still "${still}" after the guide, then "${await title()}"; status: ${imageNote}`);
  if (first !== "Generate this image?" || still !== first) fail(`the second question overwrote the first (${first} → ${still})`);
  if (!/Cancelled/.test(imageNote ?? "")) fail(`Cancel did not answer the image's question: ${imageNote}`);
  await page.click("#costOk"); await idle();
  if (!(await page.evaluate(() => !!document.querySelector("#generateSlot arena-player")))) fail("the video run did not finish after its question");
  await page.keyboard.press("Escape");

  // 3. Away from the running job and back: its progress shows again. Stop ends its question.
  await page.click("#runGenerate");
  await dialogOpen();
  await press('[data-control="example"] [data-value="1"]');
  await page.waitForFunction(() => window.__beatPath.slot() === "1", null, { timeout: 30_000 });
  const away = await page.evaluate(() => !document.getElementById("screenOutput").hidden && !!document.querySelector("#generateSlot #genProgress"));
  await press('[data-control="example"] [data-value="0"]');
  await page.waitForFunction(() => window.__beatPath.slot() === "0", null, { timeout: 30_000 });
  const back = await page.evaluate(() => { const b = document.querySelector("#generateSlot #genProgress"); return { bar: !!b && !b.hidden, note: document.querySelector("#generateSlot #outputNote")?.textContent ?? null }; });
  console.log(`beat path paid runs: progress away ${away}, back ${JSON.stringify(back)}`);
  if (away || !back.bar || !back.note) fail(`the running job's progress was not shown again on its example (away ${away}, back ${JSON.stringify(back)})`);
  await press("#runGenerate");
  await idle().catch(() => fail("Stop did not end a run waiting on its question"));
  if (!(await page.evaluate(() => document.getElementById("costDialog").hidden))) fail("Stop left the run's question on screen");

  // 4. Runs: a local preview's link is the page's own (it is released), so a run is offered only through its kept copy; Show plays it.
  await page.waitForFunction(() => window.__beatPath.slot() === "0");
  await page.click("#runsButton");
  const rows = await page.evaluate(() => [...document.querySelectorAll("#runsList .run-row.done")].map(r => ({
    kept: /kept in this browser/.test(r.textContent ?? ""), offers: [...r.querySelectorAll("button, a")].map(b => b.textContent).filter(t => t === "Show" || t === "Download" || /^Open/.test(t ?? "")),
  })));
  console.log(`beat path paid runs: Runs rows ${JSON.stringify(rows)}`);
  if (rows.some(r => !r.kept && r.offers.length)) fail(`Runs offers a local preview's released link: ${JSON.stringify(rows)}`);
  const shows = page.locator("#runsList .run-row.done button", { hasText: "Show" });
  if ((await shows.count()) < 2) fail(`Runs has fewer than two kept videos to show (${await shows.count()})`);
  else for (const k of [0, 1]) {
    if (k) await page.click("#runsButton");
    await shows.nth(k).click();
    await page.waitForFunction(() => /shown from Runs/.test(document.getElementById("status").textContent ?? "") && !!document.querySelector("#generateSlot arena-player, #generateSlot video"), null, { timeout: 15_000 })
      .catch(() => fail(`Show on kept run ${k + 1} did not put it in the output pane`));
    await page.evaluate(() => { document.getElementById("status").textContent = ""; });
  }
  if (errors.length) fail(`paid-run pass logged: ${errors.join(" | ")}`);
  console.log("beat path paid runs: render lock, question queue, progress on return, Stop on a waiting question checked");
  await page.close();
}
