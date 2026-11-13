#!/usr/bin/env node
/**
 * Copy the Model Arena embed (key panel, generateFromGuide, player, gallery) from the sibling
 * repository's built folder into packages/studio/public/vendor/model-arena/ (a copy, not a
 * link), and record the source commit in packages/studio/public/vendor/README.md.
 *   npm run vendor:arena            (ARENA_DIR overrides the sibling path)
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const sibling = process.env.ARENA_DIR ?? new URL("../../model-arena-ma-floor/", import.meta.url).pathname;
const from = `${sibling.replace(/\/$/, "")}/dist/embed`, to = new URL("../packages/studio/public/vendor/model-arena/", import.meta.url).pathname;
if (!existsSync(`${from}/model-arena-embed.js`)) { console.error(`vendor:arena: no built embed at ${from} (run npm run build:embed there)`); process.exit(1); }
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, dereference: true });
let commit = "unknown";
try { commit = execFileSync("git", ["-C", sibling, "rev-parse", "--short", "HEAD"]).toString().trim(); } catch { /* not a git checkout */ }
const readme = new URL("../packages/studio/public/vendor/README.md", import.meta.url);
const text = readFileSync(readme, "utf8").replace(/\n## Vendored[\s\S]*$/, "");
const size = readFileSync(`${to}/model-arena-embed.js`).length;
writeFileSync(readme, `${text.trimEnd()}\n\n## Vendored\n\n\`model-arena/\` is a copy of the sibling repository's \`dist/embed/\` (Model Arena embed: \`<arena-key>\`, \`generateFromGuide()\`, \`offeredModels()\`, \`composePrompt()\`, \`<arena-player>\`, \`<arena-gallery>\`), source commit \`${commit}\`, ${(size / 1024).toFixed(0)} kB, copied ${new Date().toISOString().slice(0, 10)} by \`npm run vendor:arena\`. Do not edit it here: change the sibling repository and copy again.\n`);
console.log(`vendor:arena: copied ${from} → ${to} (commit ${commit}, ${(size / 1024).toFixed(0)} kB)`);
