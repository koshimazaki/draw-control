/**
 * Example 1 when its music file cannot load (called from smoke-beat-path.mjs): the request is aborted;
 * the page plays the generated groove under its own name and licence (never the file's), keeps the
 * example's beat grid so the lane edges stay put, and says so in the status line.
 */
export async function smokeBeatPathFallback(browser, base, { fail }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/tracks/neon-rain-loop.mp3", route => route.abort());
  await page.goto(`${base}/path.html?theme=neutral`);
  await page.waitForFunction(() => window.__beatPath?.recipe().audio, null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => ({ audio: window.__beatPath.recipe().audio, bpm: window.__beatPath.recipe().beatGrid.bpm, edges: window.__beatPath.state().cameraLane.map(b => b.from).concat(window.__beatPath.state().cameraLane.at(-1).to).join(" "), status: document.getElementById("status").textContent }));
  console.log(`draw control: Example 1 without its file: ${got.audio.name} (${got.audio.licence}), ${got.bpm} BPM, edges ${got.edges}; "${got.status}"`);
  if (got.audio.name !== "generated-straight-120.wav" || !/MIT/.test(got.audio.licence)) fail(`the fallback groove went out as ${got.audio.name} (${got.audio.licence})`);
  if (got.bpm !== 107.5 || got.edges !== "0 8 16 18 26") fail(`the fallback moved Example 1's timing (${got.bpm} BPM, edges ${got.edges})`);
  if (!/playing a generated groove/.test(got.status)) fail(`the status does not say the music fell back ("${got.status}")`);
  if (errors.length) fail(`fallback logged: ${errors.join(" | ")}`);
  await page.close();
}
