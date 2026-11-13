/**
 * Per-model facts for the Runware API, each read from that model's published
 * schema on 10 Nov 2026:
 *   https://runware.ai/docs/models/<slug>/schema.json
 * (the path uses the catalogue slug from https://runware.ai/docs/models/index.json,
 * not the AIR id). A field appears here only after its schema showed it.
 * Every task schema sets `additionalProperties: false`, so nothing else may be sent.
 */
import type { ModelCaps } from "../../packages/core/src/fit.ts";
export interface Rate {
    usdPerSecond: number;
    /** Which tier this rate is, as the schema's `x-pricing` labels it. */
    label: string;
    resolution?: string;
    videoInput?: boolean;
}
export interface RunwareModel {
    key: string;
    air: string;
    slug: string;
    name: string;
    caps: ModelCaps;
    prompt: {
        min: number;
        max: number;
        tokens?: string;
    };
    duration: {
        kind: "range";
        min: number;
        max: number;
        auto: boolean;
    } | {
        kind: "enum";
        values: number[];
        auto: boolean;
    };
    /** Values for the `resolution` field, when the schema has one. */
    resolutions?: string[];
    defaultResolution?: string;
    /** Fixed width/height pairs for models sized that way instead (LTX). */
    sizes?: Record<string, {
        width: number;
        height: number;
    }>;
    /** `settings.cameraMovement` values; only LTX-2.5 declares any. */
    cameraMovements?: string[];
    rates: Rate[];
    /** Extra per-second charge on the input video's length (H3: "uploaded video"). */
    inputVideoUsdPerSecond?: number;
    schemaUrl: string;
}
export declare const KLING_4: RunwareModel;
export declare const KLING_4_FLASH: RunwareModel;
export declare const SEEDANCE_25: RunwareModel;
export declare const H3: RunwareModel;
export declare const LTX_25_PRO: RunwareModel;
export declare const LTX_25_FAST: RunwareModel;
export declare const FLUX_3_VIDEO: RunwareModel;
/** The router lane: `model: "auto"` plus `routing` (docs: models-api/model-router). */
export declare const ROUTER: RunwareModel;
export declare const MODELS: RunwareModel[];
export declare function findModel(keyOrAir: string): RunwareModel;
