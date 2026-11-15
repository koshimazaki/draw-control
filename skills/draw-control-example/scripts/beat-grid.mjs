#!/usr/bin/env node
/**
 * Check a music file's tempo against its hits: the tempo estimate can read half (or some other
 * fraction) of what the drums play (a 174 BPM drum and bass loop read 69.7 BPM). Scores candidate
 * grids by how close the strong kicks and snares of an analysis file land to their half beats, and
 * prints the best tempi with their offset and the hits in beats on the best grid.
 *
 *   node skills/draw-control-example/scripts/beat-grid.mjs out/x/m.json [bpm …]
 *
 * With BPM arguments it scores just those (the estimate, its double, a bar count that fits the file).
 * Compare like with like: a tempo and its double score the same on half beats, so prefer the one
 * whose bars divide the file (11.04 s × 174 / 60 = 32.0 beats) and whose kicks and snares make a pattern.
 */
import { readFileSync } from "node:fs";

const [file, ...given] = process.argv.slice(2);
if (!file) { console.error("usage: beat-grid.mjs <analysis.json> [bpm …]"); process.exit(2); }
const a = JSON.parse(readFileSync(file, "utf8"));
const hits = [...a.bands.low, ...a.bands.mid].filter(o => (o.strength ?? 1) >= 0.3);
/** Score a grid of half beats: each hit counts by its strength, fading with its distance from the nearest half beat (12 ms). */
function score(bpm) {
  const step = 60 / bpm / 2;
  let best = { off: 0, s: -1 };
  for (let off = 0; off < step; off += 0.002) {
    let s = 0;
    for (const o of hits) { const d = (o.seconds - off) / step, e = Math.abs(d - Math.round(d)) * step; s += (o.strength ?? 1) * Math.exp(-(e * e) / (2 * 0.012 ** 2)); }
    if (s > best.s) best = { off, s };
  }
  return { bpm, off: best.off, s: best.s / hits.length };
}
const list = given.length ? given.map(Number).map(score) : Array.from({ length: (200 - 60) * 10 + 1 }, (_, i) => score(60 + i / 10)).sort((x, y) => y.s - x.s).slice(0, 8);
console.log(`estimate ${a.bpm} BPM; ${hits.length} kicks and snares; file ${a.lengthSeconds} s`);
for (const g of list) console.log(`${g.bpm.toFixed(1)} BPM, hits ${g.off.toFixed(3)} s after the grid: score ${g.s.toFixed(2)}; ${(a.lengthSeconds * g.bpm / 60).toFixed(2)} beats in the file`);
const top = list.reduce((x, y) => (y.s > x.s ? y : x)), beat = s => ((s - top.off) * top.bpm / 60).toFixed(2);
for (const [band, name] of [["low", "kicks"], ["mid", "snares"]]) console.log(`${name} at ${top.bpm} BPM (beats): ${a.bands[band].filter(o => o.strength >= 0.5).map(o => `${beat(o.seconds)}(${o.strength.toFixed(2)})`).join(" ")}`);
