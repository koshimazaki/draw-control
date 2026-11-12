/**
 * The Examples menu: ready states stored as shot scripts in examples/scripts/beat-path-*.txt,
 * so agents use the same files. Each carries a suggested prompt (a `# prompt:` comment) for a
 * subject a video model would render over the abstract guide. The first is the page's first run.
 */
import { BLANK_STATE, fromScript, type BeatPathState } from "./script";

export { BLANK_STATE, DEFAULT_CAMERA_PATH } from "./script";
import road from "../../../../examples/scripts/beat-path-road-bend.txt?raw";
import leap from "../../../../examples/scripts/beat-path-run-leap.txt?raw";
import flight from "../../../../examples/scripts/beat-path-flight.txt?raw";
import spin from "../../../../examples/scripts/beat-path-orbit-spin.txt?raw";

export const EXAMPLES = [
  { id: "road", label: "Car on a road with a bend", script: road },
  { id: "leap", label: "Runner leaps a gap", script: leap },
  { id: "flight", label: "Something flying", script: flight },
  { id: "spin", label: "Dancer spins, camera circles", script: spin },
] as const;

export const exampleState = (i: number): BeatPathState => fromScript(EXAMPLES[i].script, BLANK_STATE).state;
