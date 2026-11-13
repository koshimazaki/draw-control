/**
 * Presets for <arena-generate>: a bundle URL, reference image URLs, a shot
 * and a model, so a host can open the element with an example already loaded,
 * and a published record can be opened back into it ("Run this yourself").
 * Fetches go to the host's own origin (or wherever the preset points); none
 * of them carries the key.
 */
import type { ArenaRecord } from "../../../core/src/record.ts";
import { type GuideShot } from "../../../../providers/runware-api/guide-bundle.ts";
export interface GeneratePreset {
    /** The bundle directory, holding bundle.json and the files it names. */
    bundle: string;
    references?: {
        character?: string;
        environment?: string;
    };
    shot?: GuideShot;
    model?: string;
    /** Free text that replaces the composed prompt. */
    prompt?: string;
}
/** Validates an untrusted preset; throws with the first bad field. */
export declare function parsePreset(v: unknown): GeneratePreset;
/** Fetches bundle.json from a directory URL, then every file it names. */
export declare function fetchBundle(dirUrl: string): Promise<{
    files: Record<string, Blob>;
    dir: string;
}>;
/** A reference image from a URL, with that URL kept for the record. */
export declare function fetchReference(href: string): Promise<{
    blob: Blob;
    src: string;
    name: string;
}>;
/**
 * A preset that reruns a record's first lane: its bundle (the guide video's
 * directory), the reference images it was sent, its shot and its model.
 * Null when the record has no guide or no lane the generate flow can run.
 */
export declare function presetFromRecord(record: ArenaRecord, base: string): GeneratePreset | null;
