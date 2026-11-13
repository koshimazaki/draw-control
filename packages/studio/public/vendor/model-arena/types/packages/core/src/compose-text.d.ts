/**
 * The words of each model's dialect. Structure follows each model's own
 * prompting guide, as summarised in its spec's `prompting.rules`:
 * - tags (Kling): "Reference only the … of <<<video_1>>>" when a guide video carries the move, one
 *   sentence per other input, the shot, camera words (move, height, speed, end) only without a guide, timed beats, audio;
 * - at-mentions (Seedance): the camera clause first, tags bound to roles, audio last;
 * - plain words (MiniMax): references by number with roles, subject not move, then "Sound:";
 * - none (LTX): one flowing present-tense paragraph, the move left out when the parameter carries it;
 * - none (FLUX 3 Video): plain prose, frames named in words, always a camera direction.
 */
import type { ComposedCamera, ShotDescription, UsedInput } from "./compose.ts";
import type { CameraMove, ModelSpec } from "./specs/types.ts";
/** The camera sentence from the model's own guide vocabulary, or plain words with a note. */
export declare function cameraSentence(spec: ModelSpec, move: CameraMove, focus?: string): {
    text: string;
    note?: string;
};
export declare function writePrompt(spec: ModelSpec, shot: ShotDescription, used: UsedInput[], cam: ComposedCamera): string;
