/** The model spec database: one data-only spec per video model. */
import { FLUX_3_VIDEO } from "./flux-3-video.ts";
import { KLING_VIDEO_4_0 } from "./kling-video-4-0.ts";
import { KLING_VIDEO_4_0_FLASH } from "./kling-video-4-0-flash.ts";
import { LTX_2_5_FAST, LTX_2_5_PRO } from "./ltx-2-5.ts";
import { MINIMAX_H3 } from "./minimax-h3.ts";
import { SEEDANCE_2_5 } from "./seedance-2-5.ts";
import type { InputKind, ModelSpec } from "./types.ts";
export * from "./types.ts";
export { FLUX_3_VIDEO, KLING_VIDEO_4_0, KLING_VIDEO_4_0_FLASH, LTX_2_5_FAST, LTX_2_5_PRO, MINIMAX_H3, SEEDANCE_2_5 };
export declare const MODEL_SPECS: readonly ModelSpec[];
export declare function findSpec(idOrAir: string): ModelSpec;
/** Inputs this model takes, in the fixed display order. */
export declare const supportedInputs: (s: ModelSpec) => InputKind[];
/** The cheapest per-second rate, for the matrix. */
export declare const cheapestRate: (s: ModelSpec) => import("./types.ts").Rate;
