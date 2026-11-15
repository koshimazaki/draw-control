#!/usr/bin/env node
/**
 * Placed boxes against a rendered camera: per frame, is the camera inside a `box:`, within 0.75 m of
 * one, or is a box between the camera and its target? Placed boxes never move out of the camera's
 * way, so run this after every render of a scene with `box:` lines (towers, pillars).
 *
 *   node skills/draw-control-example/scripts/camera-boxes.mjs out/x/v3/camera.json out/x/shot.txt
 *
 * Boxes are read as `box: x z width depth height` (yaw ignored: axis-aligned only). Frame numbers
 * include camera.json's startFrame. Exit code 1 when the camera is inside a box.
 */
import { readFileSync } from "node:fs";

const [cameraFile, scriptFile] = process.argv.slice(2);
if (!cameraFile || !scriptFile) { console.error("usage: camera-boxes.mjs <camera.json> <shot.txt>"); process.exit(2); }
const cam = JSON.parse(readFileSync(cameraFile, "utf8"));
const boxes = readFileSync(scriptFile, "utf8").split("\n").filter(l => /^box:/.test(l)).map(l => l.slice(4).trim().split(/\s+/).map(Number))
  .map(([x, z, w, d, h]) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h, name: `box ${x} ${z}` }));
const inside = (p, b, m = 0) => p[0] > b.x0 - m && p[0] < b.x1 + m && p[2] > b.z0 - m && p[2] < b.z1 + m && p[1] < b.h + m;
const blocked = (a, t, b) => { for (let k = 0.05; k < 0.95; k += 0.02) if (inside(a.map((v, i) => v + (t[i] - v) * k), b)) return true; return false; };
const off = cam.startFrame ?? 0, found = { inside: [], near: [], blocking: [] };
cam.track.forEach((f, i) => {
  for (const b of boxes) {
    if (inside(f.position, b)) found.inside.push([i + off, b.name]);
    else if (inside(f.position, b, 0.75)) found.near.push([i + off, b.name]);
    if (blocked(f.position, f.target, b)) found.blocking.push([i + off, b.name]);
  }
});
const sum = list => {
  const by = new Map();
  for (const [n, name] of list) by.set(name, [...(by.get(name) ?? []), n]);
  return [...by].map(([name, fr]) => `${name}: frames ${fr[0]}–${fr.at(-1)} (${fr.length})`).join("; ") || "none";
};
console.log(`camera inside a box: ${sum(found.inside)}`);
console.log(`camera within 0.75 m of a box: ${sum(found.near)}`);
console.log(`a box between camera and target: ${sum(found.blocking)}`);
process.exitCode = found.inside.length ? 1 : 0;
