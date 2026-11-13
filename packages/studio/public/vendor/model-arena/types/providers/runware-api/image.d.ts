/**
 * Image inference for the character still and other reference images. The
 * models and their schema facts live in image-models.ts. `planImage` is pure:
 * it checks the request against the model's schema rules and refuses what the
 * model cannot take with a PlanError; `runImage` uploads, submits and polls.
 */
import type { InputSent } from "../../packages/core/src/record.ts";
import type { CostEstimate, LaneMedia } from "../types.ts";
import { type RunwareClient } from "./client.ts";
import { type SizeRule } from "./image-models.ts";
import { type PollOptions } from "./poll.ts";
export * from "./image-models.ts";
export { tokenBound, tokenEstimate, type TokenPricing, type TokenQuery } from "./image-tokens.ts";
/** A still is a raster; these are the formats offered where the schema lists them. */
export declare const STILL_FORMATS: readonly ["PNG", "JPG", "WEBP"];
export type StillFormat = (typeof STILL_FORMATS)[number];
export interface ImageRequest {
    model: string;
    prompt: string;
    /** A pose or edit reference, e.g. the guide's first frame. Shorthand for one `references` entry. */
    reference?: LaneMedia;
    /** Reference images in the order they are sent (the first one sizes the output when no size is given). */
    references?: LaneMedia[];
    width?: number;
    height?: number;
    /** A `resolution` preset, where the schema has one (Kling IMAGE 3.0 and FLUX 3 Image only beside a reference). */
    resolution?: string;
    /** A transparent background, where the schema has `settings.background`. */
    transparent?: boolean;
    /** PNG by default. */
    outputFormat?: StillFormat;
    /** `settings.quality`, where the schema has it (GPT-Image-2.6); left out, the schema default applies. */
    quality?: string;
}
export interface ImagePlan {
    modelId: string;
    modelName: string;
    uploads: {
        placeholder: string;
        media: LaneMedia;
    }[];
    task: Record<string, unknown>;
    inputsSent: InputSent[];
    estimate: CostEstimate;
    /**
     * Token-priced with no published bound: what a caller shows instead of a
     * price, and the highest published example its cap is compared with.
     */
    unpriced?: {
        highestExampleUsd: number;
        rates: string;
        examples: string;
    };
    notes: string[];
}
/** The grid rule in words, for refusals and hosts. */
export declare function describeSize(s: SizeRule): string;
export declare function planImage(req: ImageRequest, taskUUID?: string): ImagePlan;
export type PriceCheck = {
    ok: true;
    usd: number;
    basis: string;
    priced: "bound" | "estimate" | "unpriced";
    rates?: string;
    examples?: string;
} | {
    ok: false;
    code: "no-estimate" | "over-price";
    message: string;
};
/**
 * Whether a plan may run under `maxPrice`. A bound is checked against the cap.
 * A token-priced plan with no published bound runs only with `allowUnpriced`,
 * and then the cap is compared with the highest published example price.
 */
export declare function checkImagePrice(plan: ImagePlan, maxPrice: number, allowUnpriced?: boolean): PriceCheck;
/** Uploads the references, submits, polls `imageURL`. Never resubmits. */
export declare function runImage(client: RunwareClient, plan: ImagePlan, opts?: Omit<PollOptions, "urlField"> & {
    onUpload?: (name: string) => void;
    onSubmit?: () => void;
}): Promise<{
    task: Record<string, unknown>;
    result: import("./poll.ts").ImageResult;
}>;
