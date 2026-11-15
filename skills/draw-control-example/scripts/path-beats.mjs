#!/usr/bin/env node
/**
 * Where the subject is, and which way it heads, at given beats: the walk path after the travel lock,
 * exactly as the render moves it. Use it to land a turn on a hit: a corner's middle is where the
 * heading is half way round (yaw 45 between 90 and 0).
 *
 *   node skills/draw-control-example/scripts/path-beats.mjs out/x/shot.json out/x/m.json 3,11.03,15.67
 *
 * Run from the repository root. Yaw: 0 = towards +z, 90 = towards +x.
 */
import { registerHooks } from "node:module";

registerHooks({ resolve(s, c, next) { try { return next(s, c); } catch (e) { if ((s.startsWith(".") || s.startsWith("/")) && !/\.[cm]?[jt]s$/.test(s)) return next(`${s}.ts`, c); throw e; } } });
const [recipeFile, analysisFile, list] = process.argv.slice(2);
if (!recipeFile || !analysisFile) { console.error("usage: path-beats.mjs <recipe.json> <analysis.json> [beat,beat,…]"); process.exit(2); }
const { readFileSync } = await import("node:fs");
const { validateRecipe } = await import("../../../packages/core/src/index.ts");
const { rootAt } = await import("../../../packages/core/src/root-travel.ts");
const { driveFrom, parseAnalysis } = await import("../../../cli/src/analysis.ts");
const r = validateRecipe(JSON.parse(readFileSync(recipeFile, "utf8"))), drive = driveFrom(parseAnalysis(readFileSync(analysisFile, "utf8")));
const beats = list ? list.split(",").map(Number) : Array.from({ length: Math.ceil(r.durationBeats) + 1 }, (_, i) => i);
for (const b of beats) { const p = rootAt(r, b, drive); console.log(`beat ${b}: x ${p.x.toFixed(2)} z ${p.z.toFixed(2)} height ${p.y.toFixed(2)} yaw ${p.yaw.toFixed(0)}`); }
