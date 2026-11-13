/**
 * The image models a still can be made with on Runware, each read from its
 * published schema (https://runware.ai/docs/models/<slug>/schema.json; fixtures
 * in tests/fixtures/runware-schemas/). FLUX.2 [klein] 9B and Kling IMAGE 3.0
 * were read on 10 Nov 2026, the rest on 13 Nov 2026. A field, size rule or
 * limit appears here only after its schema showed it; every task schema sets
 * `additionalProperties: false`. Prices come from each schema's `x-pricing`.
 */
import type { CostEstimate } from "../types.ts";
import { type TokenPricing } from "./image-tokens.ts";
export type ImageFamily = "OpenAI GPT Image" | "MiniMax H3" | "ByteDance Seedream" | "FLUX" | "Kling IMAGE";
/** Family order for pickers; models keep table order within a family. */
export declare const IMAGE_FAMILIES: ImageFamily[];
/** Limits on each reference image, from the schema's `maxItems` and `x-constraints`. */
export interface ReferenceRule {
    max: number;
    minSide?: number;
    maxSide?: number;
    minRatio?: number;
    maxRatio?: number;
    maxBytes?: number;
    /** x-constraints `area` on each reference, in pixels. */
    maxPixels?: number;
}
export type SizeRule = {
    /** Free width and height within bounds, on a grid of `multipleOf` (1 when the schema sets none). */
    kind: "grid";
    min: number;
    max: number;
    multipleOf: number;
    default: [number, number];
    /** x-constraints `area` on width × height, in pixels. */
    area?: {
        min: number;
        max: number;
    };
    /** x-constraints `ratio` on width / height. */
    ratio?: {
        min: number;
        max: number;
    };
    /** A `resolution` preset the schema allows instead of width and height (never beside them). */
    resolution?: {
        values: string[];
    };
} | {
    /** A closed list of width/height pairs, grouped by the tier their titles name. */
    kind: "list";
    pairs: Record<string, [number, number][]>;
    default: [number, number];
    /** `resolution` is accepted only beside a reference image. */
    withReference: {
        field: "resolution";
        values: string[];
        default: string;
    };
    /** Whether a listed pair may also be sent beside a reference. */
    pairsWithReference: boolean;
};
export interface PriceQuery {
    width?: number;
    height?: number;
    resolution?: string;
    references: number;
    /** The prompt, for models whose bound counts its tokens. */
    prompt?: string;
}
export interface ImagePricing {
    kind: "per-image" | "token" | "compute-time";
    /** The published rates in words. */
    summary: string;
    /** Where the price was read, and when. */
    source: string;
    read: string;
}
export interface ImageModel {
    key: string;
    air: string;
    slug: string;
    name: string;
    family: ImageFamily;
    provider: "runware-api";
    maker: string;
    prompt: {
        min: number;
        max: number;
    };
    references: ReferenceRule;
    size: SizeRule;
    /** The schema's `outputFormat` enum. A still is a raster, so only PNG, JPG and WEBP are offered. */
    outputFormats: string[];
    /** `settings.background: "transparent"` exists (and then needs PNG or WEBP). */
    transparency: boolean;
    pricing: ImagePricing;
    estimate(q: PriceQuery): CostEstimate;
    /** Token-priced models: the published rates and examples, for the bound and the unpriced path. */
    tokens?: TokenPricing;
    /** What the schema has that this planner does not send. */
    notOffered?: string[];
    schemaUrl: string;
    pageUrl: string;
}
export declare const allPairs: (s: Extract<SizeRule, {
    kind: "list";
}>) => [number, number][];
export declare const tierOf: (s: Extract<SizeRule, {
    kind: "list";
}>, w: number, h: number) => string | undefined;
export declare const KLEIN_9B: ImageModel;
export declare const FLUX_3_IMAGE_KLEIN: ImageModel;
export declare const FLUX_3_IMAGE: ImageModel;
export declare const GPT_IMAGE_26_FLARE: ImageModel;
export declare const GPT_IMAGE_26_SUNBURST: ImageModel;
export declare const H3_IMAGE: ImageModel;
export declare const H3_IMAGE_HIGHSPEED: ImageModel;
export declare const SEEDREAM_55: ImageModel;
export declare const KLING_IMAGE_3: ImageModel;
/** Table order is family order, then the order within each family. */
export declare const IMAGE_MODELS: ImageModel[];
export declare function findImageModel(key: string): ImageModel;
