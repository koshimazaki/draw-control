/**
 * Any image as a reference (round 10), called from smoke-beat-path.mjs: in the gallery, Example
 * 1's guide frame goes to Character through its "Use as reference" menu; Example 2's guide is
 * dragged onto the Environment drop. Both drops fill (thumbnail, clear button, a tooltip saying
 * where the image came from), the cost dialog says it sends the reference images, Clear empties a
 * drop, and the preview's own frame can be used too. Any console error or warning fails the run.
 */
export async function smokeBeatPathRefs(browser, base, { fail, SHOTS }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html?theme=runware`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio && document.querySelector("#keySlot arena-key"), null, { timeout: 60_000 });
  await page.evaluate(() => document.getElementById("gallery").scrollIntoView());
  await page.waitForFunction(() => document.querySelectorAll("#gallerySlot .row-media video").length >= 2, null, { timeout: 180_000 })
    .catch(() => fail("the gallery guides did not render"));
  const guides = page.locator("#gallerySlot .gallery-row .row-media:has(video)");
  // 1. Example 1's guide frame → Character, from the menu.
  await guides.nth(0).hover();
  await guides.nth(0).locator(".ref-use").click();
  await page.click('#menu button:has-text("Character")');
  await page.waitForFunction(() => document.getElementById("thumbCharacter").classList.contains("set"), null, { timeout: 10_000 }).catch(() => fail("Use as reference → Character did not fill the drop"));
  // 2. Example 2's guide dragged onto Environment (the drag's events, with one DataTransfer as a browser would: the gallery
  //    sits below the fold, so a pointer drag would have to scroll mid-drag).
  await page.evaluate(() => {
    const src = [...document.querySelectorAll("#gallerySlot .gallery-row .row-media")].filter(b => b.querySelector("video"))[1];
    const dst = document.getElementById("dropEnvironment"), dt = new window.DataTransfer();
    src.dispatchEvent(new window.DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
    dst.dispatchEvent(new window.DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    dst.dispatchEvent(new window.DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    src.dispatchEvent(new window.DragEvent("dragend", { dataTransfer: dt, bubbles: true }));
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => document.getElementById("thumbEnvironment").classList.contains("set"), null, { timeout: 10_000 }).catch(() => fail("dragging a gallery guide onto Environment did not fill the drop"));
  const tips = await page.evaluate(() => [document.getElementById("dropCharacter").dataset.tip, document.getElementById("dropEnvironment").dataset.tip, !document.getElementById("clearCharacter").hidden]);
  console.log(`draw control refs: ${JSON.stringify(tips)}`);
  if (!/frame of the guide/.test(tips[0] ?? "") || !/frame of the guide/.test(tips[1] ?? "") || !tips[2]) fail(`the drops do not say where their images came from: ${JSON.stringify(tips)}`);
  await page.screenshot({ path: `${SHOTS}beat-path-refs.png` });
  // The cost dialog sends them.
  await page.click("#runGenerate"); await page.waitForSelector("#costDialog:not([hidden])");
  const sends = await page.textContent("#costText");
  await page.click("#costCancel");
  if (!/the reference images/.test(sends ?? "")) fail(`the cost dialog does not send the references: ${sends}`);
  // Clear one; the preview's own frame can fill it again.
  await page.click("#clearEnvironment");
  if (await page.evaluate(() => document.getElementById("thumbEnvironment").classList.contains("set"))) fail("Clear did not empty the Environment drop");
  await page.hover("#screenPreview"); await page.click("#screenPreview > .ref-use");
  await page.click('#menu button:has-text("Environment")');
  await page.waitForFunction(() => /frame of the preview/.test(document.getElementById("dropEnvironment").dataset.tip ?? ""), null, { timeout: 10_000 }).catch(() => fail("the preview's frame did not become the Environment reference"));
  if (errors.length) fail(`refs step logged: ${errors.join(" | ")}`);
  await page.close();
}
