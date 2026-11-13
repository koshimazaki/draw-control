/**
 * generateImage: one still through one image model, with the reader's own
 * key, for hosts that make character sheets and environment images and feed
 * them back as references. Mirrors generateFromGuide: the key by reference,
 * a refusal over `maxPrice` or without an estimate, `confirm` before anything
 * is sent, then upload, submit and poll. References are checked against the
 * model's count and size rules before upload and are never resized or dropped;
 * a reference the model cannot take is refused.
 */
import type { InputSent } from "../../packages/core/src/record.ts";
import { type CostRow } from "../cost-row.ts";
import type { CostEstimate } from "../types.ts";
import { type FetchLike } from "./client.ts";
import { type CostQuestion, type GenerateProgress } from "./generate.ts";
import { type StillFormat } from "./image.ts";
import type { PollOptions } from "./poll.ts";
/** A reference as a Blob (a File keeps its name), an https URL, or a Blob with the URL a reader can see it at. */
export type ImageReference = Blob | string | {
    blob: Blob;
    src?: string;
    name?: string;
};
export interface GenerateImageOptions {
    /** A key from imageModels(), e.g. "flux-3-image" or "seedream-5.5". */
    model: string;
    prompt: string;
    references?: ImageReference[];
    /** Width and height, or a resolution preset where the model has one. Default: the model's default, or sized from the first reference. */
    size?: {
        width: number;
        height: number;
    } | {
        resolution: string;
    };
    transparent?: boolean;
    outputFormat?: StillFormat;
    /** GPT-Image-2.6 `settings.quality`: auto (the default), low, medium, high, xhigh or max. `low` suits cheap drafts. */
    quality?: string;
    maxPrice: number;
    /**
     * Run a token-priced model that has no published upper bound. The cost
     * question then says so, shows the rates and Runware's examples, and
     * maxPrice is compared with the highest published example.
     */
    allowUnpriced?: boolean;
    key: string | (() => string | undefined) | {
        getKey(): string | undefined;
    };
    confirm: (q: CostQuestion) => boolean | Promise<boolean>;
    signal?: AbortSignal;
    onProgress?: (p: GenerateProgress) => void;
    fetch?: FetchLike;
    poll?: Omit<PollOptions, "signal" | "onProgress" | "urlField">;
    /** Fixes the task UUID (tests). */
    taskUUID?: string;
}
export interface GenerateImageResult {
    imageURL: string;
    costUsd: number | null;
    taskUUID: string;
    modelRan: string;
    estimate: CostEstimate;
    inputsSent: InputSent[];
    notes: string[];
    generationSeconds: number;
    /** The docs/costs.md row for this run, as data and as the table line. */
    costRow: CostRow;
    costRowText: string;
    /** The task as sent, media ids filled in. */
    task: Record<string, unknown>;
}
export declare function generateImage(o: GenerateImageOptions): Promise<GenerateImageResult>;
