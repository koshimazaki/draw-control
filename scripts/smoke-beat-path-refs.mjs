/**
 * Any image as a reference (round 10), called from smoke-beat-path.mjs: in the gallery, Example
 * 1's guide frame goes to Character through its "Use as reference" menu; Example 2's guide is
 * dragged onto the Environment drop. Both drops fill (thumbnail, clear button, a tooltip saying
 * where the image came from), the cost dialog says it sends the reference images, Clear empties a
 * drop, and the preview's own frame can be used too. A published clip in the Gallery (another
 * origin) works the same way, from the menu and by a drag, when its host allows cross-site reads,
 * and says it cannot be read (the drop unchanged) when it does not. Any console error or warning fails the run.
 *
 * The drops may already hold the example's published reference images, so each step waits for the
 * drop's tooltip to name the new source, never only for the drop to be filled.
 */
const tipOf = (page, id) => page.evaluate(id => document.getElementById(id).dataset.tip ?? "", id);
const waitTip = (page, id, re, ms = 10_000) => page.waitForFunction(([id, src]) => new RegExp(src).test(document.getElementById(id).dataset.tip ?? ""), [id, re.source], { timeout: ms }).then(() => true, () => false);

/** The Gallery's boxes (in page order) holding a video: `kind` "guide" for the Guide tiles of the examples' own rows, "published" for published clips. */
const boxes = kind => [...document.querySelectorAll("#gallerySlot .gallery-row")].flatMap(row => {
  const own = !/·/.test(row.querySelector("h3")?.textContent ?? "");
  return [...row.querySelectorAll(".row-tile")].filter(t => {
    const cap = t.querySelector("figcaption")?.textContent ?? "";
    return t.querySelector(".row-media video") && (kind === "guide" ? own && cap === "Guide" : / · published/.test(cap));
  }).map(t => t.querySelector(".row-media"));
});

/** The drag's events onto a drop, with one DataTransfer as a browser would (the gallery sits below the fold, so a pointer drag would have to scroll mid-drag). */
const drag = (page, kind, n, to) => page.evaluate(([kind, n, to]) => {
  const src = window.__refBoxes(kind)[n], dst = document.getElementById(to), dt = new window.DataTransfer();
  src.dispatchEvent(new window.DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
  dst.dispatchEvent(new window.DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
  dst.dispatchEvent(new window.DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  src.dispatchEvent(new window.DragEvent("dragend", { dataTransfer: dt, bubbles: true }));
}, [kind, n, to]);
/** The same boxes as a locator, found again on each action (a Gallery redraw replaces its rows). */
const boxLocator = (page, kind, n) => {
  const rows = page.locator("#gallerySlot .gallery-row"), tiles = (kind === "guide" ? rows.filter({ hasNot: page.locator("h3", { hasText: "·" }) }) : rows).locator(".row-tile");
  return tiles.filter({ has: page.locator("figcaption", { hasText: kind === "guide" ? /^Guide$/ : / · published/ }) }).locator(".row-media:has(video)").nth(n);
};
/** Its "Use as reference" menu → `target`. */
const useAs = async (page, kind, n, target) => {
  const box = boxLocator(page, kind, n);
  await box.scrollIntoViewIfNeeded(); await box.hover(); await box.locator(".ref-use").click();
  await page.click(`#menu button:has-text("${target}")`);
};
const count = (page, kind) => page.evaluate(kind => window.__refBoxes(kind).length, kind);

export async function smokeBeatPathRefs(browser, base, { fail, SHOTS }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html?theme=runware`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio && document.querySelector("#keySlot arena-key"), null, { timeout: 60_000 });
  await page.evaluate(`window.__refBoxes = ${boxes}`);
  await page.evaluate(() => document.getElementById("gallery").scrollIntoView());
  // Example 1's and Example 2's guides (the published clips beside them are videos too, and arrive first).
  const guidesIn = await page.waitForFunction(() => window.__refBoxes("guide").length >= 2, null, { timeout: 180_000 }).then(() => true, () => false);
  if (!guidesIn) { fail("the gallery guides did not render"); await page.close(); return; }
  // 1. Example 1's guide frame → Character, from the menu.
  await useAs(page, "guide", 0, "Character");
  if (!(await waitTip(page, "dropCharacter", /frame of the guide/))) fail(`Use as reference → Character did not fill the drop with the guide's frame (${await tipOf(page, "dropCharacter")})`);
  // 2. Example 2's guide dragged onto Environment.
  await drag(page, "guide", 1, "dropEnvironment");
  await page.evaluate(() => window.scrollTo(0, 0));
  if (!(await waitTip(page, "dropEnvironment", /frame of the guide/))) fail(`dragging a gallery guide onto Environment did not fill the drop with its frame (${await tipOf(page, "dropEnvironment")})`);
  const tips = await page.evaluate(() => [document.getElementById("dropCharacter").dataset.tip, document.getElementById("dropEnvironment").dataset.tip, !document.getElementById("clearCharacter").hidden, document.getElementById("thumbCharacter").classList.contains("set"), document.getElementById("thumbEnvironment").classList.contains("set")]);
  console.log(`draw control refs: ${JSON.stringify(tips)}`);
  if (!/frame of the guide/.test(tips[0] ?? "") || !/frame of the guide/.test(tips[1] ?? "") || !tips[2] || !tips[3] || !tips[4]) fail(`the drops do not show the guides' frames and say where they came from: ${JSON.stringify(tips)}`);
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
  if (!(await waitTip(page, "dropEnvironment", /frame of the preview/))) fail("the preview's frame did not become the Environment reference");
  await smokePublishedClip(page, fail, errors);
  if (errors.length) fail(`refs step logged: ${errors.join(" | ")}`);
  await page.close();
}

/**
 * 3. A published clip in the Gallery, on another origin: its frame is read through a CORS copy. The clip host is answered
 * here with Example 1's guide (so the check needs no network): with `Access-Control-Allow-Origin` the menu and a drag fill
 * the drops; without it the page says the image cannot be read and the drop keeps what it had (the browser's CORS
 * error for that one read is expected, any other console error still fails).
 */
async function smokePublishedClip(page, fail, errors) {
  const clips = await count(page, "published");
  if (!clips) { console.log("draw control refs: no published clip in the gallery (nothing published): the published-clip step is skipped"); return; }
  const guide = await page.evaluate(async () => {
    const v = window.__refBoxes("guide")[0].querySelector("video"), buf = new Uint8Array(await (await window.fetch(v.currentSrc || v.src)).arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return window.btoa(s);
  });
  const body = Buffer.from(guide, "base64");
  let cors = true;
  // Only the CORS copy is answered: the clip on show (no CORS mode) keeps its own request.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost).*\.mp4(\?.*)?$/, (route, req) => {
    if (!req.headers().origin) return route.continue();
    // A host that does not allow this page: another origin named (with none, Playwright's fulfil would allow the request's own).
    return route.fulfill({ status: 200, body, headers: { "content-type": "video/mp4", "access-control-allow-origin": cors ? "*" : "https://elsewhere.invalid" } });
  });
  await useAs(page, "published", 0, "Character");
  if (!(await waitTip(page, "dropCharacter", /frame of the result/, 20_000))) fail(`Use as reference on a published clip did not fill Character (${await tipOf(page, "dropCharacter")}; status: ${await page.textContent("#status")})`);
  await page.click("#clearEnvironment");
  await drag(page, "published", Math.min(1, clips - 1), "dropEnvironment");
  if (!(await waitTip(page, "dropEnvironment", /frame of the result/, 20_000))) fail(`dragging a published clip onto Environment did not fill the drop (${await tipOf(page, "dropEnvironment")}; status: ${await page.textContent("#status")})`);
  // A host without CORS: the page says so, and the drop keeps its image.
  cors = false;
  const kept = await tipOf(page, "dropCharacter"), logged = errors.length;
  await page.evaluate(() => { document.getElementById("status").textContent = ""; });
  await useAs(page, "published", 0, "Character");
  const refused = await page.waitForFunction(() => /cannot be read/.test(document.getElementById("status").textContent ?? ""), null, { timeout: 20_000 }).then(() => true, () => false);
  const now = await tipOf(page, "dropCharacter");
  // The browser's own report of the refused read is expected here; anything else it logged still fails the run.
  errors.splice(logged, Infinity, ...errors.slice(logged).filter(e => !/blocked by CORS policy|net::ERR_FAILED/.test(e)));
  console.log(`draw control refs: published clip → Character and a drag → Environment read through CORS; without CORS: ${refused ? "refused" : "not refused"}, drop ${now === kept ? "kept" : `changed to "${now}"`}`);
  if (!refused || now !== kept) fail(`a published clip on a host without CORS did not say it cannot be read, keeping the drop (status "${await page.textContent("#status")}", drop "${now}", was "${kept}")`);
  await page.unroute(/^https?:\/\/(?!127\.0\.0\.1|localhost).*\.mp4(\?.*)?$/);
}
