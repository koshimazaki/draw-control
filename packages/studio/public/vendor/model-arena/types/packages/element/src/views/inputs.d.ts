/**
 * layout="inputs": everything a model was given beside what it made. A
 * compact strip of the reference images (character sheet, environment), then
 * the guide and one to three outputs in one row on one playhead, each output
 * with its model, cost, seconds and composed prompt. The record's audio plays
 * once, from the guide's audio file; the outputs' own sound is muted unless
 * the reader turns "Clip sound" on, which mutes the guide audio instead.
 */
import type { Lane } from "../../../core/src/record.ts";
import { type View, type ViewContext } from "./arena.ts";
/** The reference images the record's lanes were sent, deduplicated, named by the shot's reference ids where known. */
export declare function referenceStrip(lanes: Lane[]): {
    src: string;
    label: string;
}[];
export declare function inputsView(ctx: ViewContext): View;
