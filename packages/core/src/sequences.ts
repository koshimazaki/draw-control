/**
 * Named sequences committed in examples/recipes/ (beside the camera examples A, C, D, D8):
 * recipes that load in the studio's sequence library and replay identically. They carry
 * their own hit markers, so they need no track (the energy is flat without one).
 * - fight-combo: guard stances into a dance, with jab, cross, sword, roll, jump and spin on markers;
 * - gait-change: walk into jog into sprint and back, foot-matched, with a jump on the way.
 * `packages/core/test/sequences.test.ts` checks the committed files match these
 * (UPDATE_SEQUENCES=1 rewrites them).
 */
import { RIGGED_CHARACTER } from "./clip-library";
import { riggedMove } from "./examples";
import type { HitMarker } from "./reactive-config";
import { RECIPE_VERSION, validateRecipe, type Recipe } from "./recipe";
import { framesToBeats } from "./transitions";

export type NamedSequence = { id: string; title: string; recipe: Recipe };

function sequence(durationBeats: number, moves: [clip: string, atBeat: number, blendFrames: number][], markers: HitMarker[]): Recipe {
  return validateRecipe({
    version: RECIPE_VERSION, fps: 24, durationBeats,
    beatGrid: { bpm: 120, offsetSeconds: 0, beatsPerBar: 4, source: "manual" },
    character: { kind: "rigged", name: RIGGED_CHARACTER.name, licence: RIGGED_CHARACTER.licence },
    energy: 1,
    moves: moves.map(([clip, at, frames]) => riggedMove(clip, at, 120, Math.round(framesToBeats(frames, 120) * 10000) / 10000)),
    rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }], jumps: [],
    reactive: { seed: 3, speed: 0.7, amplitude: 0.8, drive: 1, accents: [], accentOn: "both", accentGapBeats: 2,
      onsetThreshold: 0.6, idleBelow: 0, humanise: 0.6, markers },
  });
}

const m = (seconds: number, accent: HitMarker["accent"]): HitMarker => ({ seconds, accent, source: "manual" });

export function namedSequences(): NamedSequence[] {
  return [
    { id: "fight-combo", title: "Fight combo: guard, strikes, a roll and a jump into a dance", recipe: sequence(32,
      [["Sword_Idle", 0, 8], ["Spell_Simple_Idle_Loop", 8, 10], ["Dance_Loop", 16, 12], ["Sword_Idle", 24, 8]],
      [m(1, "jab"), m(1.5, "cross"), m(2.25, "sword"), m(5, "roll"), m(8.5, "jump"), m(10, "spin"), m(12.5, "cross"), m(13, "jab")]) },
    { id: "gait-change", title: "Gait change: walk, jog, sprint and back, foot-matched", recipe: sequence(32,
      [["Walk_Loop", 0, 8], ["Jog_Fwd_Loop", 8, 8], ["Sprint_Loop", 16, 6], ["Jog_Fwd_Loop", 22, 10], ["Walk_Loop", 25, 12], ["Idle_Loop", 29, 12]],
      [m(10, "jump")]) },
  ];
}
