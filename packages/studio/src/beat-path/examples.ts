/**
 * The example switcher: Example 1 (the ship on the Neon Rain loop) and Example 2 (the street guide
 * on the drum and bass loop), each its own subject shape, path, scenery, camera, music (tracks.ts)
 * and shot description, stored as shot scripts in examples/scripts/ so agents use the same files;
 * "Your own" starts from a plain state. The other scripts in examples/scripts/ (beat-path-*.txt)
 * stay for agents, tests and the skill, off the page: beat-path-ex3-car.txt and
 * beat-path-ex4-drone.txt were Examples 3 and 4 until 15 Nov 2026 (`scriptState` reads them).
 */
import { BLANK_STATE, fromScript, type BeatPathState } from "./script";
import type { ExampleId } from "./tracks";
import flyer from "../../../../examples/scripts/beat-path-ex1-flyer.txt?raw";
import runner from "../../../../examples/scripts/beat-path-ex2-runner.txt?raw";

export { BLANK_STATE, DEFAULT_CAMERA_PATH } from "./script";

export const EXAMPLES = [
  { id: "flyer", label: "Flying car", script: flyer },
  { id: "runner", label: "Street, any subject", script: runner },
] as const satisfies readonly { id: ExampleId; label: string; script: string }[];

const TEMPO: Record<ExampleId, number> = { flyer: 107.5, runner: 174 };
/** A shot script's page state, its lanes timed at `bpm` (a script-only example's groove is 100 BPM). */
export const scriptState = (script: string, bpm: number): BeatPathState => fromScript(script, BLANK_STATE, { bpm, offsetSeconds: 0.09 }).state;
export const exampleState = (i: number): BeatPathState => scriptState(EXAMPLES[i].script, TEMPO[EXAMPLES[i].id]);

/**
 * The slot the switcher shows for a slot id: "own", or an example's index ("0", "1"); anything else
 * opens as Your own. A run logged before 15 Nov 2026 can name "2" or "3" (Examples 3 and 4, off the page).
 */
export const pageSlot = (id: string): string => (id === "own" || (/^\d+$/.test(id) && Number(id) < EXAMPLES.length) ? id : "own");
/** What a slot id that left the page says when it opens as Your own. */
export const SLOT_GONE = "that example left the page: opened as Your own";

/** "Your own": a plain path and camera to start from, no music of its own. */
export const ownState = (): BeatPathState => ({
  ...structuredClone(BLANK_STATE),
  subject: [{ x: -6, z: 3 }, { x: -2, z: -1 }, { x: 2, z: 1.5 }, { x: 6, z: -1 }], subjectCorners: 0.6,
  character: [{ from: 0, to: 17, word: "glide" }], cameraLane: [{ from: 0, to: 17, word: "behind" }],
});
