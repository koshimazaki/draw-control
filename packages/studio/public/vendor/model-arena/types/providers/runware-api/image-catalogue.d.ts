/**
 * The image models as plain data for a host's picker: one flat list in a
 * stable order (`imageModels`), or grouped by family for a two-step picker
 * (`imageFamilies`). Every fact comes from the table in image-models.ts.
 */
import type { CostEstimate } from "../types.ts";
import { type ImageFamily, type ImagePricing, type ReferenceRule, type SizeRule } from "./image-models.ts";
export interface ImageModelInfo {
    key: string;
    name: string;
    air: string;
    family: ImageFamily;
    provider: "runware-api";
    maker: string;
    accepts: {
        text: true;
        /** Reference or edit images: how many, and each one's limits. */
        referenceImages: ReferenceRule;
        transparent: boolean;
        /** Output formats offered for a still (a subset of the schema's list). */
        outputFormats: string[];
        /** Schema features this planner does not send. */
        notOffered: string[];
    };
    prompt: {
        min: number;
        max: number;
    };
    size: {
        rule: SizeRule;
        summary: string;
        default: [number, number];
    };
    /** The estimate for a text-to-image still at the default size; `usd: null` means none, and a capped run is refused. */
    estimate: CostEstimate;
    pricing: ImagePricing;
    schemaUrl: string;
    pageUrl: string;
}
export interface ImageFamilyInfo {
    family: ImageFamily;
    models: ImageModelInfo[];
}
/** Every image model, by family then table order. Fresh objects each call. */
export declare function imageModels(): ImageModelInfo[];
/** The families in picker order, each with its models. */
export declare function imageFamilies(): ImageFamilyInfo[];
