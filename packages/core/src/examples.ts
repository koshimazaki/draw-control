/**
 * Example recipes for the camera and reactive-motion test, all on one 48-beat track at
 * 120 BPM with the first beat at 0.25 s (`scripts/examples.mjs` generates that track):
 * quiet bars 0–7, a build over bars 8–15, the drop on beat 16, loud to beat 40, quiet outro.
 * All use the rigged mannequin (clips time-warped so steps land on beats).
 * - A: dancing mannequin, static camera (the control);
 * - C: the same dance, audio-reactive camera (orbit with energy, push-in on the drop);
 * - D: the target: a dancer whose moves follow the music (energy and the step lane set
 *      amplitude, jump / spin / cross accents land on hits and downbeats, overlapping
 *      action) with the audio-reactive camera on the same beats; D8 is D cut to A's 8 s.
 * B (colour-coded blocking) needs blocking mode, not built yet.
 */
import type { CameraConfig } from "./camera";
import { LOOP_CLIPS, RIGGED_CHARACTER, loopCycleBeats } from "./clip-library";
import { makeClipMove, makeMove } from "./moves";
import { RECIPE_VERSION, validateRecipe, type Recipe } from "./recipe";

export const EXAMPLE_TRACK = { bpm: 120, offsetSeconds: 0.25, beats: 48, dropBeat: 16, outroBeat: 40 } as const;
export type ExampleId = "A" | "C" | "D" | "D8";
export type Example = { id: ExampleId; title: string; recipe: Recipe; view: "rig"; range: { unit: "beats"; start?: number; length?: number } };

/** The rigged mannequin: idle through the quiet intro, dancing from the build, idle in the outro. */
const DANCE = () => [riggedMove("Idle_Loop", 0), riggedMove("Dance_Loop", 8), riggedMove("Idle_Loop", 40, 120, 2)];
/** The procedural figure's dance (fallback character). */
export const PROCEDURAL_DANCE = () => [
  makeMove("stepTouch", 0), makeMove("disco", 8), makeMove("bounce", 16), makeMove("armsUp", 20),
  makeMove("stepTouch", 24), makeMove("punches", 28), makeMove("disco", 32), makeMove("stepTouch", 40),
];

function base(over: Partial<Recipe>): Recipe {
  return validateRecipe({
    version: RECIPE_VERSION, fps: 24, durationBeats: EXAMPLE_TRACK.beats,
    beatGrid: { bpm: EXAMPLE_TRACK.bpm, offsetSeconds: EXAMPLE_TRACK.offsetSeconds, beatsPerBar: 4, source: "manual" },
    character: { kind: "rigged", name: RIGGED_CHARACTER.name, licence: RIGGED_CHARACTER.licence },
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

const dancer = () => base({
  camera: REACTIVE_CAMERA,
  reactive: { seed: 7, speed: 0.5, amplitude: 0.7, accents: ["jump", "spin", "cross"], accentOn: "both",
    accentGapBeats: 2, onsetThreshold: 0.6, idleBelow: 0.12, humanise: 0.8 },
});

export function exampleRecipes(): Example[] {
  const short = { unit: "beats" as const, start: 12, length: 16 };
  return [
    { id: "A", title: "Dancing mannequin, static camera", view: "rig", range: short, recipe: base({
      camera: { segments: [{ fromBeat: 0, toBeat: 48, modes: ["static"] }], intensity: 0, orbitDegreesPerBeat: 0, distance: 4.4, height: 1.15, fov: 38, startYaw: 0 } }) },
    { id: "C", title: "Dancing mannequin, audio-reactive camera", view: "rig", range: short, recipe: base({ camera: REACTIVE_CAMERA }) },
    { id: "D", title: "Audio-reactive dancer, audio-reactive camera", view: "rig", range: { unit: "beats" }, recipe: dancer() },
    { id: "D8", title: "Audio-reactive dancer, audio-reactive camera (A's 8 s)", view: "rig", range: short, recipe: dancer() },
  ];
}

/** A clip move for the rigged mannequin, its cycle set so the steps land on beats. */
export function riggedMove(clip: string, atBeat: number, bpm = 120, blendBeats = 1) {
  const lib = LOOP_CLIPS[clip];
  return makeClipMove(clip, atBeat, lib ? loopCycleBeats(lib, bpm, 1) : 4, { id: `${clip}-${atBeat}`, blendBeats });
}

/** The studio's starting recipe: the rigged mannequin dancing, moves following the music. */
export function defaultRiggedRecipe(): Recipe {
  return validateRecipe({
    version: RECIPE_VERSION, fps: 24, durationBeats: 16,
    beatGrid: { bpm: 120, offsetSeconds: 0, beatsPerBar: 4, source: "manual" },
    character: { kind: "rigged", name: RIGGED_CHARACTER.name, licence: RIGGED_CHARACTER.licence },
    energy: 1, moves: [riggedMove("Idle_Loop", 0), riggedMove("Dance_Loop", 4)],
    rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }], jumps: [],
    reactive: { seed: 1, speed: 0.5, amplitude: 0.6, accents: ["jump", "spin", "cross"], accentOn: "both",
      accentGapBeats: 2, onsetThreshold: 0.6, idleBelow: 0.1, humanise: 0.7 },
  });
}
