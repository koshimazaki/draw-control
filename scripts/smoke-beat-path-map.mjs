/**
 * Map checks for the Beat Path page, called from smoke-beat-path.mjs:
 * - the map's tool row stays visible and clickable after every tool and view switch, after zooming,
 *   after dragging the divider to both extremes, and at 1100 and 1280 px wide;
 * - Camera → Draw new → drag draws the camera path on every example and on Your own, a block flies it,
 *   and a second stroke draws again (the pen stays armed);
 * - any console error or warning fails the run.
 */

const TOOL_BUTTONS = ".map-tools [data-control] button";

/** Every tool-row button has a box and is the topmost element at its own centre. */
export const toolbarReachable = page => page.evaluate(sel => {
  const all = [...document.querySelectorAll(sel)];
  const bad = all.filter(b => {
    const r = b.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom > window.innerHeight || r.right > window.innerWidth) return true;
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(el === b || b.contains(el));
  });
  return { count: all.length, bad: bad.map(b => b.textContent.trim()) };
}, TOOL_BUTTONS);

async function stroke(page, from, to) {
  const at = q => page.evaluate(q => window.__beatPath.mapPoint(q), q);
  const a = await at(from);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const q = await at({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t + 2 * Math.sin(t * Math.PI) });
    await page.mouse.move(q.x, q.y, { steps: 2 });
  }
  await page.mouse.up();
}

export async function smokeBeatPathMap(browser, base, { fail, SHOTS }) {
  for (const width of [1100, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 720 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    await page.goto(`${base}/path.html?theme=runware`);
    await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
    const check = async label => {
      const r = await toolbarReachable(page);
      if (r.count < 7 || r.bad.length) fail(`at ${width} px the map tool row is not clickable ${label} (${r.count} buttons; blocked: ${r.bad.join(", ") || "none"})`);
    };
    await check("on load");
    for (const [control, value] of [["tool", "camera"], ["view", "side"], ["tool", "blocks"], ["view", "top"], ["tool", "subject"], ["pen", "draw"], ["tool", "camera"], ["pen", "edit"]]) {
      await page.click(`[data-control="${control}"] [data-value="${value}"]`);
      await check(`after ${control} → ${value}`);
    }
    for (const id of ["zoomIn", "zoomIn", "zoomIn", "zoomOut", "zoomFit"]) { await page.click(`#${id}`); await check(`after ${id}`); }

    // Camera → Draw new → drag, on every example and on Your own.
    for (const slot of ["0", "1", "2", "own"]) {
      await page.click(`[data-control="example"] [data-value="${slot}"]`);
      await page.waitForTimeout(300);
      await page.click('[data-control="tool"] [data-value="camera"]');
      await check(`after Camera on example ${slot}`);
      await page.click('[data-control="pen"] [data-value="draw"]');
      const before = JSON.stringify((await page.evaluate(() => window.__beatPath.state())).camera);
      await stroke(page, { x: -5, z: 5 }, { x: 5, z: 6 });
      const s1 = await page.evaluate(() => window.__beatPath.state());
      if (JSON.stringify(s1.camera) === before || s1.camera.length < 2) fail(`at ${width} px a camera stroke did not draw on example ${slot}`);
      if (!s1.cameraLane.some(b => b.word === "path")) fail(`example ${slot}: the drawn camera path is not flown by any block`);
      const status = await page.textContent("#status");
      if (!/Camera lane|whole clip/.test(status ?? "")) fail(`example ${slot}: the page did not say which block flies the path (${status})`);
      // The pen stays armed: a second stroke draws again.
      await stroke(page, { x: -4, z: -5 }, { x: 4, z: -3 });
      const s2 = await page.evaluate(() => window.__beatPath.state());
      if (JSON.stringify(s2.camera) === JSON.stringify(s1.camera)) fail(`example ${slot}: a second camera stroke did not draw`);
      await check(`after drawing on example ${slot}`);
      await page.keyboard.press("Escape");
    }

    // A (fake) result beside the preview, then the divider to both extremes.
    await page.click('[data-control="example"] [data-value="0"]');
    await page.waitForFunction(() => document.querySelector("#keySlot arena-key"), null, { timeout: 30_000 });
    await page.click("#runGenerate"); await page.waitForSelector("#costDialog:not([hidden])"); await page.click("#costOk");
    await page.waitForFunction(() => document.querySelector("#generateSlot arena-player"), null, { timeout: 60_000 });
    for (const dx of [-2000, 4000]) {
      const d = await page.locator("#divider").boundingBox();
      await page.mouse.move(d.x + d.width / 2, d.y + 30); await page.mouse.down();
      await page.mouse.move(d.x + dx, d.y + 30, { steps: 6 }); await page.mouse.up();
      await check(`after the divider went ${dx < 0 ? "left" : "right"}`);
    }
    await page.screenshot({ path: `${SHOTS}beat-path-map-${width}.png` });
    if (errors.length) fail(`at ${width} px the page logged: ${errors.join(" | ")}`);
    console.log(`beat path map: ${width} px tool row and camera drawing checked`);
    await page.close();
  }
}
