#!/usr/bin/env node
/**
 * Write a synthetic kick/snare/hat track (WAV) for trying the CLI and the studio:
 *   node scripts/drum-fixture.mjs out/drums-120.wav [bpm] [bars]
 * Generated, licence-clean (packages/core/src/drum-synth.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { drumWav } from "./smoke-features.mjs";

const [path = "out/drums-120.wav", bpm = "120", bars = "8"] = process.argv.slice(2);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, drumWav(Number(bpm), Number(bars)).buf);
console.log(`wrote ${path}: ${bars} bars at ${bpm} BPM (kick on 1 and 3, snare on 2 and 4, hats on eighths)`);
