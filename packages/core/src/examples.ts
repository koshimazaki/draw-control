/**
 * Example recipes for the camera and reactive-motion test, all on one 48-beat track at
 * 120 BPM with the first beat at 0.25 s (`scripts/examples.mjs` generates that track):
 * quiet bars 0–7, a build over bars 8–15, the drop on beat 16, loud to beat 40, quiet outro.
 * - A: dancing mannequin, static camera (the control);
 * - C: the same dance, audio-reactive camera (orbit with energy, push-in on the drop);
 * - D: the target: a dancer whose moves follow the music (energy, accents on hits and
 *      downbeats, overlapping action) with the audio-reactive camera on the same beats.
 * B (colour-coded blocking) needs blocking mode, not built yet.
 */
import type { CameraConfig } from "./camera";
import { makeMove } from "./moves";
import { RECIPE_VERSION, validateRecipe, type Recipe } from "./recipe";

export const EXAMPLE_TRACK = { bpm: 120, offsetSeconds: 0.25, beats: 48, dropBeat: 16, outroBeat: 40 } as const;
export type ExampleId = "A" | "C" | "D";
export type Example = { id: ExampleId; title: string; recipe: Recipe; view: "rig"; range: { unit: "beats"; start?: number; length?: number } };

const DANCE = () => [
  makeMove("stepTouch", 0), makeMove("disco", 8), makeMove("bounce", 16), makeMove("armsUp", 20),
  makeMove("stepTouch", 24), makeMove("punches", 28), makeMove("disco", 32), makeMove("stepTouch", 40),
];

function base(over: Partial<Recipe>): Recipe {
  return validateRecipe({
    version: RECIPE_VERSION, fps: 24, durationBeats: EXAMPLE_TRACK.beats,
    beatGrid: { bpm: EXAMPLE_TRACK.bpm, offsetSeconds: EXAMPLE_TRACK.offsetSeconds, beatsPerBar: 4, source: "manual" },
    character: { kind: "mannequin", name: "Procedural mannequin", licence: "MIT (motion-studio)" },
    energy: 1, moves: DANCE(), rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }], jumps: [],
    audio: { name: "example-track.wav", licence: "Generated test signal (MIT, motion-studio)" },
    ...over,
  });
}

const REACTIVE_CAMERA: CameraConfig = {
  segments: [
    { fromBeat: 0, toBeat: 14, modes: ["orbit"] },
    { fromBeat: 14, toBeat: 18, modes: ["orbit", "pushIn"] },    // push in on the drop (beat 16)
    { fromBeat: 18, toBeat: 40, modes: ["orbit"] },
    { fromBeat: 40, toBeat: 48, modes: ["pullOut", "rise"] },    // the outro pulls out and cranes up
  ],
  intensity: 0.85, orbitDegreesPerBeat: 7, distance: 4.4, height: 1.15, fov: 38, startYaw: -20,
};

export function exampleRecipes(): Example[] {
  const short = { unit: "beats" as const, start: 12, length: 16 };
  return [
    { id: "A", title: "Dancing mannequin, static camera", view: "rig", range: short, recipe: base({
      camera: { segments: [{ fromBeat: 0, toBeat: 48, modes: ["static"] }], intensity: 0, orbitDegreesPerBeat: 0, distance: 4.4, height: 1.15, fov: 38, startYaw: 0 } }) },
    { id: "C", title: "Dancing mannequin, audio-reactive camera", view: "rig", range: short, recipe: base({ camera: REACTIVE_CAMERA }) },
    { id: "D", title: "Audio-reactive dancer, audio-reactive camera", view: "rig", range: { unit: "beats" }, recipe: base({
      camera: REACTIVE_CAMERA,
      reactive: { seed: 7, speed: 0.6, amplitude: 0.7, accents: ["hit", "point", "jump", "spin"], accentOn: "both",
        accentGapBeats: 2, onsetThreshold: 0.6, idleBelow: 0.15, humanise: 0.8 },
    }) },
  ];
}
