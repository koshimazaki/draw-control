#!/usr/bin/env node
/**
 * The static build works with no server behind it: builds Draw Control alone
 * (`npm run build:beat-path`, packages/studio/dist-beat-path/), serves the folder as plain
 * files from a sub-path (/some/sub/path/), opens it in headless Chrome, and fails on any
 * 404 or page error, or if the first example's music does not load. No deploy, no network
 * beyond localhost: it opens ?theme=neutral, so the Runware default's Google Fonts request is not made.
 *   npm run static-check
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const root = new URL("../packages/studio/dist-beat-path/", import.meta.url).pathname, SUB = "/some/sub/path/";
execFileSync("npm", ["run", "build:beat-path"], { cwd: new URL("..", import.meta.url).pathname, stdio: "inherit" });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/markdown", ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm" };
const missing = [];
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (!url.startsWith(SUB)) { missing.push(url); res.statusCode = 404; res.end(); return; }
  let rel = url.slice(SUB.length) || "index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const file = normalize(join(root, rel));
  if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return; }
  try { const body = await readFile(file); res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream"); res.end(body); }
  catch { missing.push(url); res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}${SUB}`;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome", headless: true });
let ok = true;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}?theme=neutral`);
  await page.waitForFunction(() => /generated-straight-120/.test(document.getElementById("trackName")?.textContent ?? ""), null, { timeout: 30_000 });
  const title = await page.title();
  console.log(`static: ${base} → "${title}", track ${await page.textContent("#trackName")}`);
  if (missing.length) { ok = false; console.error(`STATIC FAIL: not found: ${missing.join(", ")}`); }
  if (errors.length) { ok = false; console.error(`STATIC FAIL: page errors: ${errors.join(" | ")}`); }
} finally { await browser.close(); server.close(); }
console.log(ok ? "STATIC CHECK: OK" : "STATIC CHECK: FAILED");
process.exitCode = ok ? 0 : 1;
