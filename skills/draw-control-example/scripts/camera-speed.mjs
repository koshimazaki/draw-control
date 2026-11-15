#!/usr/bin/env node
/**
 * The camera's speed per frame in a rendered camera.json, block by block: catches a plateau (the
 * camera stopping on each hit inside a block: a `lock … hold` the owner did not want) and a whip (an
 * offset eased in over one beat, which is 0.34 s at 174 BPM: 39 m/s once).
 *
 *   node skills/draw-control-example/scripts/camera-speed.mjs out/x/v3/camera.json 0,9,21,35 174
 *
 * Arguments: camera.json, the camera block edges in beats, the BPM (beat 0 at 0 s; add camera.json's
 * startFrame yourself for a partial render). Prints, per block, the camera's and the target's slowest
 * and fastest speed (m/s), and the frames slower than a quarter of the block's median.
 */
import { readFileSync } from "node:fs";

const [file, edgesArg, bpmArg] = process.argv.slice(2);
if (!file || !edgesArg || !bpmArg) { console.error("usage: camera-speed.mjs <camera.json> <edge,edge,…> <bpm>"); process.exit(2); }
const tr = JSON.parse(readFileSync(file, "utf8")).track, edges = edgesArg.split(",").map(Number), bpm = Number(bpmArg);
const speed = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 24;
const cam = tr.map((f, i) => (i ? speed(f.position, tr[i - 1].position) : 0)), tgt = tr.map((f, i) => (i ? speed(f.target, tr[i - 1].target) : 0));
for (let k = 0; k + 1 < edges.length; k++) {
  const a = Math.max(1, Math.round(edges[k] * 60 / bpm * 24)), b = Math.min(tr.length - 1, Math.round(edges[k + 1] * 60 / bpm * 24));
  const cs = cam.slice(a, b + 1), ts = tgt.slice(a, b + 1), med = [...cs].sort((x, y) => x - y)[cs.length >> 1];
  const slow = cs.map((v, i) => (v < 0.25 * med ? a + i : -1)).filter(i => i >= 0);
  console.log(`beats ${edges[k]}-${edges[k + 1]} (frames ${a}-${b}): camera ${Math.min(...cs).toFixed(2)}–${Math.max(...cs).toFixed(2)} m/s (median ${med.toFixed(2)}), target ${Math.min(...ts).toFixed(2)}–${Math.max(...ts).toFixed(2)}; slow frames ${slow.length ? `${slow[0]}…${slow.at(-1)} (${slow.length})` : "none"}`);
}
