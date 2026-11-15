#!/usr/bin/env node
/**
 * Publish one model clip to the Beat Path gallery (packages/studio/public/published/index.json,
 * read by src/beat-path/published.ts). A local file is copied into public/published/ as
 * <example>-<model>.<ext> and its entry written; an http(s) URL only writes the entry.
 * Example and model ids are checked against the real lists. Cloudflare Pages refuses a whole
 * deployment when any file is over 25 MiB, so a larger local file is refused (host it on R2 and
 * publish the URL); --force copies it anyway. Only .mp4 and .webm, which every browser plays.
 *   npm run publish:clip -- <example-id> <model-id> <file-or-url> [--prompt "…"] [--cost 0.42] [--seconds 8] [--force]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS } from "../packages/studio/src/beat-path/generate.ts";
import { EXAMPLE_TRACKS } from "../packages/studio/src/beat-path/tracks.ts";
import { checkClip, emptyIndex, isRecord, withClip } from "../packages/studio/src/beat-path/published.ts";

const PAGES_LIMIT = 25 * 1024 * 1024;
const VIDEO_EXT = new Set([".mp4", ".webm"]);
const examples = Object.keys(EXAMPLE_TRACKS), models = MODELS.map(m => m.id);
const usage = "usage: npm run publish:clip -- <example-id> <model-id> <file-or-url> [--prompt \"…\"] [--cost 0.42] [--seconds 8] [--force]";

function fail(msg) { console.error(`publish:clip: ${msg}`); process.exit(1); }

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const k = a.slice(2);
    if (k === "force") { opt.force = true; continue; }
    if (!["prompt", "cost", "seconds", "root"].includes(k)) fail(`unknown option ${a}\n${usage}`);
    if (i + 1 >= argv.length) fail(`${a} needs a value`);
    opt[k] = argv[++i];
  }
  return { pos, opt };
}

const number = (v, name) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} must be a number of 0 or more, got "${v}"`);
  return n;
};

const { pos, opt } = parseArgs(process.argv.slice(2));
if (pos.length !== 3) fail(usage);
const [example, model, source] = pos;
if (!examples.includes(example)) fail(`unknown example "${example}"; one of: ${examples.join(", ")}`);
if (!models.includes(model)) fail(`unknown model "${model}"; one of: ${models.join(", ")}`);
const prompt = opt.prompt ?? "", costUsd = number(opt.cost, "cost"), seconds = number(opt.seconds, "seconds");

// --root is for tests: the repository whose public/published/ is written.
const root = resolve(opt.root ?? fileURLToPath(new URL("..", import.meta.url)));
const dir = join(root, "packages/studio/public/published"), indexFile = join(dir, "index.json");
mkdirSync(dir, { recursive: true });
const realDir = realpathSync(dir);

let index = emptyIndex();
if (existsSync(indexFile)) {
  let raw;
  try { raw = JSON.parse(readFileSync(indexFile, "utf8")); } catch { fail(`${indexFile} is not valid JSON; fix or remove it first`); }
  if (raw?.version !== 1 || !isRecord(raw.clips)) fail(`${indexFile} is not a version 1 list; fix or remove it first`);
  const bad = Object.keys(raw.clips).filter(k => !isRecord(raw.clips[k]));
  if (bad.length) fail(`${indexFile} has clips that are not objects (${bad.join(", ")}); fix or remove it first`);
  // Every existing entry must pass the page's own check, or it would be written back and never shown.
  const unusable = Object.entries(raw.clips).flatMap(([e, byModel]) => Object.entries(byModel).filter(([, c]) => !checkClip(c, "https://example.invalid/")).map(([m]) => `${e}/${m}`));
  if (unusable.length) fail(`${indexFile} has entries the page would not show (${unusable.join(", ")}); fix or remove it first`);
  index = raw;
}

let url;
if (/^https?:\/\//i.test(source)) {
  url = source;
} else {
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) fail(`only a local file or an http(s) URL can be published, got "${source}"`);
  const from = resolve(source);
  if (!existsSync(from) || !statSync(from).isFile()) fail(`no such file: ${from}`);
  const ext = extname(from).toLowerCase();
  if (!VIDEO_EXT.has(ext)) fail(`expected a video file (${[...VIDEO_EXT].join(", ")}), got "${ext || "no extension"}"`);
  // The copy target is built from the checked ids only, and must stay inside public/published/.
  const name = `${example}-${model}${ext}`, target = resolve(realDir, name);
  const rel = relative(realDir, target);
  if (!rel || rel.startsWith("..") || rel.includes(sep)) fail(`refusing to write outside ${realDir}`);
  // Checked before the copy: one file over the limit makes Cloudflare Pages refuse the whole deployment.
  const size = statSync(from).size;
  if (size > PAGES_LIMIT) {
    const msg = `${name} is ${(size / 1024 / 1024).toFixed(1)} MB; Cloudflare Pages refuses a deployment with any file over 25 MiB. Host it on R2 and publish the URL instead (npm run publish:clip -- ${example} ${model} https://…)`;
    if (!opt.force) fail(`${msg}, or pass --force to copy it anyway`);
    console.warn(`publish:clip: WARNING ${msg}`);
  }
  const replaced = existsSync(target);
  if (replaced && realpathSync(target) === realpathSync(from)) { /* already in place */ }
  else { copyFileSync(from, target); if (replaced) console.log(`publish:clip: replaced ${name}`); }
  url = `published/${name}`;
}
// One clip per tile: a copy under another extension (or a local copy now replaced by a URL) would ship unused.
for (const f of readdirSync(realDir)) {
  if (f !== url.replace(/^published\//, "") && VIDEO_EXT.has(extname(f).toLowerCase()) && f.slice(0, -extname(f).length) === `${example}-${model}`) {
    rmSync(join(realDir, f)); console.log(`publish:clip: removed the old ${f}`);
  }
}

const clip = { url, prompt, ...(costUsd !== undefined ? { costUsd } : {}), ...(seconds !== undefined ? { seconds } : {}) };
// The same check the page makes, so an entry written here is one the page will show.
if (!checkClip(clip, "https://example.invalid/")) fail(`the entry would not be shown by the page: ${JSON.stringify(clip)}`);
writeFileSync(indexFile, `${JSON.stringify(withClip(index, example, model, clip), null, 2)}\n`);
console.log(`publish:clip: ${example} / ${model} -> ${url}`);
