#!/usr/bin/env node
/**
 * Measure clip timing on a skinned GLB: per frame (30 Hz) the foot and hip heights, the
 * hips' z, both hands' reach from the shoulder and the right hand's z. Used to set the
 * loop steps and the accent contact frames in packages/core/src/clip-library.ts.
 *   node scripts/analyse-clips.mjs assets/characters/AnimationLibrary.glb [Clip_Name ...]
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const buf = readFileSync(process.argv[2]);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej));
const scene = gltf.scene;
const get = n => scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
const mixer = new THREE.AnimationMixer(scene);
const want = process.argv.slice(3);
const box = new THREE.Box3().setFromObject(scene); console.log("bounds", box.min.toArray().map(x=>x.toFixed(2)), box.max.toArray().map(x=>x.toFixed(2)));
for (const clip of gltf.animations) {
  if (want.length && !want.includes(clip.name)) continue;
  mixer.stopAllAction();
  const a = mixer.clipAction(clip); a.play();
  const rows = [];
  for (let t = 0; t <= clip.duration + 1e-6; t += 1 / 30) {
    a.time = t; mixer.update(0); scene.updateMatrixWorld(true);
    const p = n => new THREE.Vector3().setFromMatrixPosition(get(n).matrixWorld);
    const fl = p("DEF-foot.L"), fr = p("DEF-foot.R"), hips = p("DEF-hips"), hl = p("DEF-hand.L"), hr = p("DEF-hand.R"), sh = p("DEF-upper_arm.R");
    rows.push([t.toFixed(3), fl.y.toFixed(3), fr.y.toFixed(3), hips.y.toFixed(3), hips.z.toFixed(2), hr.distanceTo(sh).toFixed(3), hl.distanceTo(p("DEF-upper_arm.L")).toFixed(3), hr.z.toFixed(2)].join(" "));
  }
  a.stop();
  console.log(`== ${clip.name} ${clip.duration.toFixed(3)}  [t footL footR hipsY hipsZ reachR reachL handRz]`);
  console.log(rows.join("\n"));
}
