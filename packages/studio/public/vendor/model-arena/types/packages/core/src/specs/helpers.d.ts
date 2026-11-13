/** Small builders so each spec file reads as data. */
import type { InputLimits, InputSpec } from "./types.ts";
export declare const DOCS = "https://runware.ai/docs/models";
export declare const modelPage: (slug: string) => string;
export declare const schemaUrl: (slug: string) => string;
export declare const guide: (slug: string, page: string) => string;
export declare const PRICING_DOCS = "https://runware.ai/docs/models-api/pricing";
export declare const MB = 1048576;
export declare function limits(l: Partial<InputLimits>): InputLimits;
export declare const range: (min: number | null, max: number | null) => {
    min: number | null;
    max: number | null;
};
export declare function yes(field: string, maxCount: number | null, source: string, l?: InputLimits | null, note?: string): InputSpec;
export declare function no(source: string, note?: string): InputSpec;
