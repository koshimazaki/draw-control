/**
 * generateFromGuide: a guide bundle through one model, with the reader's own
 * key. Loads the bundle, plans the lane with `planGuideLane` (the composer's
 * prompt, the per-model fitting), refuses a price over `maxPrice`, asks
 * `confirm` with the estimate, then uploads through `mediaStorage`, submits,
 * polls and resolves with the lane of a record. Every request goes through
 * RunwareClient, which talks to api.runware.ai only; the key is never put in
 * an error, an event, a log line or the record.
 */
import type { ArenaRecord, InputSent, Lane } from "../../packages/core/src/record.ts";
import { type CostRow } from "../cost-row.ts";
import { type CostEstimate } from "../types.ts";
import { type FetchLike } from "./client.ts";
import { type BundleEntry, type GuideShot, type LoadedGuide } from "./guide-bundle.ts";
import type { PollOptions } from "./poll.ts";
export type GenerateErrorCode = "bad-bundle" | "refused" | "over-price" | "no-estimate" | "not-confirmed" | "invalid-key" | "timeout" | "aborted" | "provider";
export declare class GenerateError extends Error {
    code: GenerateErrorCode;
    taskUUID?: string | undefined;
    constructor(code: GenerateErrorCode, message: string, taskUUID?: string | undefined);
}
/** A bundle as a FileList or File[] (a folder pick or a drop), name → Blob, or one already loaded. */
export type GuideSource = Iterable<Blob & {
    name?: string;
}> | ArrayLike<File> | Record<string, Blob> | LoadedGuide;
/** A reference image as a Blob, or with the URL a record reader can see it at. */
export type ReferenceInput = Blob | {
    blob: Blob;
    src?: string;
    name?: string;
};
export interface CostQuestion {
    model: string;
    modelName: string;
    usd: number;
    basis: string;
    maxPrice: number;
    inputs: InputSent[];
    prompt: string;
    /**
     * Images only. "bound": `usd` is an upper bound. "estimate": `usd` is an
     * estimate from approximate published token counts plus a stated margin
     * (MiniMax H3 Image), checked against the cap but not a strict bound.
     * "unpriced": a token-priced model with no published figures, run with
     * allowUnpriced; `usd` is then the highest published example, not a bound,
     * and `rates` and `examples` say so.
     */
    priced?: "bound" | "estimate" | "unpriced";
    rates?: string;
    examples?: string;
}
export interface GenerateProgress {
    stage: "plan" | "confirm" | "upload" | "submit" | "poll" | "done";
    message: string;
    progress?: number;
}
export interface GenerateOptions {
    guide: GuideSource;
    /** kling-4, seedance-2.5, h3 or ltx-2.5. */
    model: string;
    /** The neutral shot; defaults to the bundle's recipe.json `shot`. */
    shot?: GuideShot;
    /** Free text that replaces the composed prompt. */
    prompt?: string;
    /** Optional reference images: a character sheet and an environment still. */
    references?: {
        character?: ReferenceInput;
        environment?: ReferenceInput;
    };
    /** USD; a plan estimated above it is refused before anything is sent. */
    maxPrice: number;
    /**
     * The key by reference: the key panel itself (anything with getKey()), a
     * getter, or a string. Read only when a request is sent.
     */
    key: string | (() => string | undefined) | {
        getKey(): string | undefined;
    };
    /** Shown the estimate; nothing is uploaded or submitted unless it resolves true. */
    confirm: (q: CostQuestion) => boolean | Promise<boolean>;
    signal?: AbortSignal;
    onProgress?: (p: GenerateProgress) => void;
    /** For tests and the fake provider; defaults to the page's fetch. */
    fetch?: FetchLike;
    poll?: Omit<PollOptions, "signal" | "onProgress" | "urlField">;
    resolution?: string;
    /** Refuse instead of sending the guide without its separate audio (MiniMax H3 over 15 s together). */
    requireAudio?: boolean;
    laneId?: string;
    /** Fixes the task UUID (tests). */
    taskUUID?: string;
}
export interface GenerateResult {
    videoURL: string;
    costUsd: number | null;
    generationSeconds: number;
    taskUUID: string;
    modelRan: string | null;
    estimate: CostEstimate;
    inputsSent: InputSent[];
    /** The lane, with the composed prompt, inputs sent and shot. */
    lane: Lane;
    /** A one-lane record (guide media named relative to it: ./guide.mp4) for the gallery. */
    record: ArenaRecord;
    /** The docs/costs.md row for this run, as data and as the table line. */
    costRow: CostRow;
    costRowText: string;
    notes: string[];
    /** The task as sent, media ids filled in. */
    task: Record<string, unknown>;
}
/** A reference image checked for type and size, then loaded for upload. */
export declare function reference(r: ReferenceInput | undefined, role: "character" | "environment"): Promise<import("../types.ts").LaneMedia | undefined>;
export declare function blobEntry(blob: Blob, name: string): BundleEntry;
/** Entries from a FileList, File[] or a name → Blob map. */
export declare function entriesOf(src: Exclude<GuideSource, LoadedGuide>): BundleEntry[];
export declare function classify(e: unknown, signal: AbortSignal | undefined, submitted: string | undefined, redact: (s: string) => string): GenerateError;
export declare function generateFromGuide(o: GenerateOptions): Promise<GenerateResult>;
