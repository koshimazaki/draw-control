/**
 * The example switcher: three examples, each its own subject shape, path, scenery, camera,
 * music (tracks.ts) and shot description, stored as shot scripts in examples/scripts/ so
 * agents use the same files; "Your own" starts from a plain state. The other scripts in
 * examples/scripts/ (beat-path-*.txt) stay for agents and tests.
 */
import { BLANK_STATE, fromScript, type BeatPathState } from "./script";
import flyer from "../../../../examples/scripts/beat-path-ex1-flyer.txt?raw";
import runner from "../../../../examples/scripts/beat-path-ex2-runner.txt?raw";
import car from "../../../../examples/scripts/beat-path-ex3-car.txt?raw";

export { BLANK_STATE, DEFAULT_CAMERA_PATH } from "./script";

export const EXAMPLES = [
  { id: "flyer", label: "Flying car", script: flyer },
  { id: "runner", label: "Runner", script: runner },
  { id: "car", label: "Car on a bend", script: car },
] as const;

const TEMPO = { flyer: 120, runner: 140, car: 100 } as const;
export const exampleState = (i: number): BeatPathState => fromScript(EXAMPLES[i].script, BLANK_STATE, { bpm: TEMPO[EXAMPLES[i].id], offsetSeconds: 0.09 }).state;

/** "Your own": a plain path and camera to start from, no music of its own. */
export const ownState = (): BeatPathState => ({
  ...structuredClone(BLANK_STATE),
  subject: [{ x: -6, z: 3 }, { x: -2, z: -1 }, { x: 2, z: 1.5 }, { x: 6, z: -1 }], subjectCorners: 0.6,
  character: [{ from: 0, to: 17, word: "glide" }], cameraLane: [{ from: 0, to: 17, word: "behind" }],
});
