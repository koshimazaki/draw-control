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
    if (!/character (reference )?sheet|front.*side.*back/i.test(prompt)) fail(`the Character prompt is not a character sheet: ${prompt}`);
    await pop.locator(".ip-family").selectOption(familyName);
    await pop.locator(".ip-model").selectOption(modelKey);
    if (/gpt-image/.test(modelKey)) await pop.locator('.ip-quality button[data-value="high"]').click();
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
  // Round 11: the prompt is written per model (same shot, four models), typing stops the rewrite, "Rewrite for this model" restores it.
  await page.click("#genCharacter");
  const prompts = {};
  for (const [fam, key] of [["OpenAI GPT Image", "gpt-image-2.6-flare"], ["MiniMax H3", "h3-image"], ["ByteDance Seedream", "seedream-5.5"], ["FLUX", "flux-3-image-klein"]]) {
    await pop.locator(".ip-family").selectOption(fam); await pop.locator(".ip-model").selectOption(key);
    prompts[key] = await pop.locator(".ip-prompt").inputValue();
  }
  console.log(`draw control images: per-model prompts ${JSON.stringify(Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.slice(0, 70)])))}`);
  if (new Set(Object.values(prompts)).size !== 4) fail("the prompt does not differ per model for the same shot");
  const link = await pop.locator(".ip-guide a").evaluate(a => ({ href: a.href, target: a.target, rel: a.rel })).catch(() => null);
  const want = await page.evaluate(() => import(new URL("vendor/model-arena/model-arena-embed.js", document.baseURI).href).then(m => m.imageModels().find(x => x.key === "flux-3-image-klein").guide.url));
  if (!link || link.href !== want || link.target !== "_blank" || link.rel !== "noopener noreferrer") fail(`the guide link is missing or wrong: ${JSON.stringify(link)} (want ${want})`);
  if ((await pop.locator(".ip-tips li").count()) < 2) fail("the model's tips are not shown");
  await pop.locator(".ip-prompt").fill("My own words about the character.");
  await pop.locator(".ip-family").selectOption("ByteDance Seedream");
  if ((await pop.locator(".ip-prompt").inputValue()) !== "My own words about the character.") fail("typing in the prompt did not stop the automatic rewrite");
  if (!(await pop.locator(".ip-rewrite").isVisible())) fail("no Rewrite for this model control after typing");
  await page.keyboard.press("Escape"); await page.click("#genCharacter");
  if ((await pop.locator(".ip-prompt").inputValue()) !== "My own words about the character.") fail("Escape and reopen lost the typed prompt");
  await pop.locator(".ip-family").selectOption("ByteDance Seedream"); await pop.locator(".ip-model").selectOption("seedream-5.5");
  await pop.locator(".ip-rewrite").click();
  if ((await pop.locator(".ip-prompt").inputValue()) !== prompts["seedream-5.5"]) fail("Rewrite for this model did not restore the model's prompt");
  await page.keyboard.press("Escape");
  const a = await make("ByteDance Seedream", "seedream-5.5", false);
  console.log(`draw control images: seedream ${JSON.stringify(a)}`);
  if (a && !/Up to .* USD on .*limit 0\.50 USD/.test(a.cost ?? "")) fail(`the per-image cost dialog does not show the bound and the 0.50 USD limit: ${a.cost}`);
  const b = await make("OpenAI GPT Image", "gpt-image-2.6-flare", true);
  console.log(`draw control images: flare ${JSON.stringify(b)}`);
  if (b && (b.notice?.title !== "No published price limit" || !/no upper price/i.test(b.notice?.text ?? ""))) fail(`no plain no-bound notice before the token-priced run: ${JSON.stringify(b.notice)}`);
  if (b && !/No published upper price/.test(b.cost ?? "")) fail(`the token-priced cost dialog does not say there is no bound: ${b.cost}`);
  // GPT quality reaches the request (fake mode records what would be sent).
  const tasks = await page.evaluate(() => JSON.stringify(globalThis.__fakeTasks ?? []));
  if (!/"quality":"high"/.test(tasks)) fail("the GPT quality did not reach the image request");
  // MiniMax H3: an estimate, no no-bound notice, and a size sent.
  const c = await make("MiniMax H3", "h3-image", false);
  console.log(`draw control images: h3 ${JSON.stringify(c?.cost)}`);
  if (c && !/estimate/i.test(c.cost ?? "")) fail(`the H3 cost dialog does not show the embed's estimate: ${c.cost}`);
  const h3 = JSON.parse(await page.evaluate(() => JSON.stringify(globalThis.__fakeTasks ?? []))).filter(t => t.taskType === "imageInference" && /h3/.test(t.model)).at(-1);
  if (!h3 || h3.width !== 1280 || h3.height !== 720) fail(`H3 was not sent a size: ${JSON.stringify(h3 && { width: h3.width, height: h3.height, resolution: h3.resolution })}`);
  // Two fast clicks on Generate for a token-priced model (its no-bound question comes first) send one image task, not two.
  const imageTasks = () => page.evaluate(() => (globalThis.__fakeTasks ?? []).filter(t => t.taskType === "imageInference").length);
  const before = await imageTasks();
  await page.click("#genCharacter");
  await pop.locator(".ip-family").selectOption("OpenAI GPT Image"); await pop.locator(".ip-model").selectOption("gpt-image-2.6-flare");
  await page.evaluate(() => { const b = document.querySelector(".image-pop .ip-run"); b.click(); b.click(); });
  let answered = 0;
  for (let k = 0; k < 6; k++) {
    const up = await page.waitForSelector("#costDialog:not([hidden])", { timeout: 3_000 }).then(() => true, () => false);
    if (!up) break;
    await page.click("#costOk"); answered++;
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => document.querySelector(".image-pop").hidden, null, { timeout: 30_000 }).catch(() => fail("the double-clicked image run did not finish"));
  await page.waitForTimeout(500);
  const sentTwice = (await imageTasks()) - before;
  console.log(`draw control images: double click on Generate sent ${sentTwice} image task(s), ${answered} question(s) answered`);
  if (sentTwice !== 1 || answered !== 2) fail(`two fast clicks on the image Generate sent ${sentTwice} image tasks after ${answered} questions (want 1 after 2)`);
  // The gallery's "Your runs" shows the images.
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
