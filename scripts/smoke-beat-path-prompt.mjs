/**
 * Smoke step for the prompt editor (shot-editor.ts), run by smoke-beat-path.mjs: on Example 1 the
 * chevron opens the larger editor over the screens (focus moves into it, aria-expanded true), the
 * page still fits one screen at 1280×720 and 1440×900, Timed asks before replacing the example's
 * action and then writes one timed line per camera block, the composed prompt carries those lines,
 * the one-line action field turns read-only, and Escape closes the editor with focus back on the
 * chevron. Screenshot: out/prompt/editor.png.
 */
import { mkdirSync } from "node:fs";

const PROMPT_SHOTS = new URL("../out/prompt/", import.meta.url).pathname;

export async function smokeBeatPathPrompt(browser, base, { fail }) {
  mkdirSync(PROMPT_SHOTS, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/path.html`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio?.name === "generated-straight-120.wav", null, { timeout: 30_000 });
  const state = () => page.evaluate(() => window.__beatPath.state());
  const fits = () => page.evaluate(() => document.getElementById("editor").offsetHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1);
  const before = (await state()).shot.action;

  await page.click("#shotExpand");
  await page.waitForSelector("#shotEditor:not([hidden])");
  const opened = await page.evaluate(() => ({ expanded: document.getElementById("shotExpand").getAttribute("aria-expanded"), focus: document.activeElement?.id }));
  if (opened.expanded !== "true" || opened.focus !== "edAction") fail(`the prompt editor did not open with focus in the action (${JSON.stringify(opened)})`);
  if (await page.inputValue("#edAction") !== before) fail("the editor's action is not the shot's action");
  if (!(await fits())) fail("with the prompt editor open, the page does not fit one screen at 1280×720");
  // The editor lies over the screens: the fields below do not move.
  const over = await page.evaluate(() => {
    const e = document.getElementById("shotEditor").getBoundingClientRect(), s = document.getElementById("screens").getBoundingClientRect();
    return Math.abs(e.top - s.top) < 2 && Math.abs(e.height - s.height) < 3 && e.bottom <= document.getElementById("shotSubject").getBoundingClientRect().top;
  });
  if (!over) fail("the prompt editor does not cover the screens above the shot fields");

  // The covered controls are out of the tab order: Tab from the editor never lands in the screens.
  if (!(await page.evaluate(() => document.getElementById("screens").inert))) fail("the screens under the prompt editor are not inert");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.getElementById("screens").contains(document.activeElement))) { fail("Tab reached a control under the prompt editor"); break; }
  }
  await page.focus("#edAction");
  // Timed over the example's own text asks first; Cancel keeps it, Replace writes the timeline.
  await page.click("#shotTimed");
  await page.waitForSelector("#costDialog:not([hidden])");
  if (!/Replace the action/.test(await page.textContent("#costTitle"))) fail("Timed did not ask before replacing the example's action");
  await page.click("#costCancel");
  if ((await state()).shot.action !== before) fail("Cancel on Timed changed the action");
  await page.click("#shotTimed");
  await page.waitForSelector("#costDialog:not([hidden])");
  await page.waitForFunction(() => !document.getElementById("costOk").hasAttribute("aria-disabled"));
  await page.click("#costOk");
  await page.waitForFunction(b => window.__beatPath.state().shot.action !== b, before, { timeout: 5000 }).catch(() => fail("Timed did not write the action"));
  const s = await state(), lines = s.shot.action.split("\n");
  const blocks = s.cameraLane.length;
  console.log(`prompt editor: Timed wrote ${lines.length} line(s) for ${blocks} camera block(s):\n  ${lines.join("\n  ")}`);
  if (lines.length !== blocks) fail(`Timed wrote ${lines.length} lines for ${blocks} camera blocks`);
  if (!lines.every(l => /^\d+\.\d–\d+\.\d s[,:]/.test(l))) fail("a timed line does not start with its seconds");
  const spb = 60 / (await page.evaluate(() => window.__beatPath.recipe().beatGrid.bpm));
  s.cameraLane.forEach((b, i) => {
    const want = `${(b.from * spb).toFixed(1)}–${Math.min(b.to * spb, s.clip).toFixed(1)} s`;
    if (!lines[i]?.startsWith(want)) fail(`timed line ${i + 1} does not match camera block ${b.from}-${b.to} (want ${want}, got ${lines[i]})`);
  });
  const prompt = await page.evaluate(() => window.beatPath.prompt()), legend = await page.textContent("#shotLegend");
  if (!lines.every(l => prompt.includes(l))) fail(`the composed prompt does not carry the timed lines: ${prompt}`);
  if (!lines.every(l => legend.includes(l.slice(0, 30)))) fail("the prompt line under the fields does not show the timed lines");
  if (!(await page.evaluate(() => document.getElementById("shotAction").readOnly))) fail("the one-line action field is editable over several lines");
  await page.screenshot({ path: `${PROMPT_SHOTS}editor.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  if (!(await fits())) fail("with the prompt editor open, the page does not fit one screen at 1440×900");
  await page.screenshot({ path: `${PROMPT_SHOTS}editor-1440.png` });

  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({ hidden: document.getElementById("shotEditor").hidden, expanded: document.getElementById("shotExpand").getAttribute("aria-expanded"), focus: document.activeElement?.id }));
  if (await page.evaluate(() => document.getElementById("screens").inert)) fail("the screens stay inert after the editor closed");
  if (!closed.hidden || closed.expanded !== "false" || closed.focus !== "shotExpand") fail(`Escape did not close the prompt editor and return focus (${JSON.stringify(closed)})`);
  // A click on the read-only action field opens the editor again; a click outside closes it.
  await page.click("#shotAction");
  if (await page.evaluate(() => document.getElementById("shotEditor").hidden)) fail("a click on the multi-line action field did not open the editor");
  await page.mouse.click(4, 4);
  if (!(await page.evaluate(() => document.getElementById("shotEditor").hidden))) fail("a click outside did not close the prompt editor");
  if (errors.length) fail(`prompt editor page errors: ${errors.join(" | ")}`);
  await page.close();
}
