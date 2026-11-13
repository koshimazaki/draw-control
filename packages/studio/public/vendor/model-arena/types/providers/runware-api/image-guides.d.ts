export type PromptDialect = "gpt" | "h3" | "seedream" | "flux3" | "klein3" | "neutral";
export interface ImageGuide {
    key: string;
    guide: {
        /** The main prompting guide, or null when the model has none. */
        url: string | null;
        read: string;
        /** Other guide pages the composer follows (references, optimiser, quality). */
        related: string[];
        note?: string;
    };
    tips: string[];
    dialect: PromptDialect;
}
export declare const IMAGE_GUIDES: ImageGuide[];
export declare function imageGuide(key: string): ImageGuide | undefined;
/** Copies for hosts: guide link, related pages and tips per model key. */
export declare function imageGuides(): Omit<ImageGuide, "dialect">[];
