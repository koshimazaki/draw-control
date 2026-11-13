/**
 * Runtime check for the neutral shot description a record may carry (the one
 * intent behind every lane's composed prompt). Records are fetched, so the
 * shot is validated like the rest before anything renders it.
 */
import type { ComposedPrompt, ReferenceRole, ShotDescription } from "./compose.ts";
export declare const REFERENCE_ROLES: readonly ReferenceRole[];
export declare class ShotError extends Error {
    path: string;
    constructor(path: string, message: string);
}
export declare function parseShot(v: unknown, path?: string): ShotDescription;
/** One line for a caption: the intent in plain words. */
export declare function shotSummary(s: ShotDescription): string;
/** The record marker for a lane whose prompt came from the composer. */
export declare function composedMarker(c: ComposedPrompt): {
    model: string;
    notes?: string[];
    dropped?: string[];
};
