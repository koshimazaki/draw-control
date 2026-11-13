/**
 * Reference images made with an image model (round 10, part 2), with the local fake provider
 * (dev, no key): Character on a per-image model (Seedream 5.5: one cost dialog), then on a
 * token-priced one (GPT-Image-2.6 Flare: first the plain no-bound notice, then the cost dialog
 * with the embed's rates and example). Each lands in the Character drop (its tooltip says which
 * model) and in the gallery's "Your runs"; the video cost dialog then sends the reference images.
 * Any console error or warning fails the run.
 */
export async function smokeBeatPathImages(browser, base, { fail, SHOTS }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}/path.html?theme=runware`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio && document.querySelector("#keySlot arena-key"), null, { timeout: 60_000 });
  const pop = page.locator(".image-pop");
  async function make(familyName, modelKey, expectNotice) {
    await page.click("#genCharacter");
    if (!(await pop.isVisible())) { fail("the Generate button beside Character did not open the image panel"); return null; }
    const prompt = await pop.locator(".ip-prompt").inputValue();
    if (!/character sheet/i.test(prompt)) fail(`the Character prompt is not a character sheet: ${prompt}`);
    await pop.locator(".ip-family").selectOption(familyName);
    await pop.locator(".ip-model").selectOption(modelKey);
    await pop.locator(".ip-run").click();
    await page.waitForSelector("#costDialog:not([hidden])");
    let notice = null;
    if (expectNotice) {
      notice = { title: await page.textContent("#costTitle"), text: await page.textContent("#costText") };
      await page.click("#costOk");
      await page.waitForFunction(() => document.getElementById("costTitle").textContent === "Generate this image?" && !document.getElementById("costDialog").hidden, null, { timeout: 30_000 });
    }
    const cost = await page.textContent("#costText");
    await page.click("#costOk");
    await page.waitForFunction(() => /generated with/.test(document.getElementById("dropCharacter").dataset.tip ?? "") && document.querySelector(".image-pop").hidden, null, { timeout: 60_000 })
      .catch(() => fail(`${modelKey}: the image did not land in the Character drop (${page.url()})`));
    return { notice, cost, tip: await page.evaluate(() => document.getElementById("dropCharacter").dataset.tip) };
  }
  const a = await make("ByteDance Seedream", "seedream-5.5", false);
  console.log(`beat path images: seedream ${JSON.stringify(a)}`);
  if (a && !/Up to .* USD on .*limit 0\.50 USD/.test(a.cost ?? "")) fail(`the per-image cost dialog does not show the bound and the 0.50 USD limit: ${a.cost}`);
  const b = await make("OpenAI GPT Image", "gpt-image-2.6-flare", true);
  console.log(`beat path images: flare ${JSON.stringify(b)}`);
  if (b && (b.notice?.title !== "No published price limit" || !/no upper price/i.test(b.notice?.text ?? ""))) fail(`no plain no-bound notice before the token-priced run: ${JSON.stringify(b.notice)}`);
  if (b && !/No published upper price/.test(b.cost ?? "")) fail(`the token-priced cost dialog does not say there is no bound: ${b.cost}`);
  // The gallery's "Your runs" shows both images.
  const imgs = await page.locator("#gallerySlot .gallery-row:last-child .row-media img").count();
  if (imgs < 2) fail(`"Your runs" does not show the two images (${imgs})`);
  // The video model gets the generated Character.
  await page.click("#runGenerate"); await page.waitForSelector("#costDialog:not([hidden])");
  const sends = await page.textContent("#costText");
  await page.click("#costCancel");
  if (!/the reference images/.test(sends ?? "")) fail(`the video cost dialog does not send the generated reference: ${sends}`);
  await page.click("#genEnvironment"); await page.keyboard.press("Escape");
  if (await pop.isVisible()) fail("Escape did not close the image panel");
  await page.screenshot({ path: `${SHOTS}beat-path-images.png` });
  if (errors.length) fail(`images step logged: ${errors.join(" | ")}`);
  await page.close();
}
