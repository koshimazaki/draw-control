/**
 * The Beat Path base recipe: what a Beat Path shot script is applied to (the page, the CLI's
 * `new --character glider --clip 8` and the MCP server's `new_recipe { character: "glider" }`
 * all start here, so the same script gives the same recipe everywhere). A clip of 5 or 8
 * seconds from beat 0, the glider, and a camera rig framed like the "wide" shot that rises
 * and aims with the figure's height. No moves and no paths: the script brings those.
 */
import { validateRecipe, type Recipe } from "./recipe";

export const BEAT_PATH_RIG = { distance: 7, height: 1.6, fov: 40, intensity: 0.25, orbitDegreesPerBeat: 0, startYaw: 0 } as const;
export const GLIDER_CHARACTER = { kind: "glider", name: "Glider (pyramid and sphere)", licence: "MIT (motion-studio)" } as const;

/** Whole beats a clip of `seconds` needs from beat 0 (with one spare frame). */
export function clipBeats(seconds: number, bpm: number): number {
  return Math.ceil((seconds + 1 / 24) * bpm / 60 - 1e-9);
}

export function beatPathBase(opts: { seconds: number; bpm?: number; offsetSeconds?: number; audio?: { name: string; licence: string } }): Recipe {
  const bpm = opts.bpm ?? 120, beats = clipBeats(opts.seconds, bpm);
  return validateRecipe({
    version: 2, fps: 24, durationBeats: beats, energy: 1, moves: [], jumps: [],
    beatGrid: { bpm, offsetSeconds: opts.offsetSeconds ?? 0, beatsPerBar: 4, source: opts.bpm ? "analysis" : "manual" },
    character: { ...GLIDER_CHARACTER },
    rootPath: [{ beat: 0, x: 0, z: 0, yaw: 0 }],
    ...(opts.audio ? { audio: { name: opts.audio.name.slice(0, 120), licence: opts.audio.licence.slice(0, 120) } } : {}),
    camera: { segments: [{ fromBeat: 0, toBeat: beats, modes: ["chase"] }], ...BEAT_PATH_RIG, followHeight: true },
  });
}
