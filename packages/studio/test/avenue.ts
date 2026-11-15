/**
 * The avenue shot that was Example 1 until 15 Nov 2026 (examples/scripts/beat-path-avenue-cross.txt:
 * behind, then the parallel street through the gaps, snare-locked camera, 8 s at 120 BPM). Tests that
 * need a two-block, snare-locked, drawn-camera-path state use it; Example 1 is now the ship on the
 * owner's loop (beat-path-ex1.test.ts).
 */
import { readFileSync } from "node:fs";
import { BLANK_STATE, fromScript, type BeatPathState } from "../src/beat-path/script";

const text = readFileSync(new URL("../../../examples/scripts/beat-path-avenue-cross.txt", import.meta.url), "utf8");
export const avenueState = (): BeatPathState => fromScript(text, BLANK_STATE, { bpm: 120, offsetSeconds: 0.09 }).state;
