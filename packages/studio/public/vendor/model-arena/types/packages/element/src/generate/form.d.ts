export declare const SHOT_FIELDS: readonly [readonly ["subject", "Subject", "Who or what moves"], readonly ["environment", "Environment", "Where it happens"], readonly ["action", "Action", "What it does along the path"], readonly ["legend", "Colour legend", "e.g. The orange figure is the character"]];
export type ShotField = (typeof SHOT_FIELDS)[number][0];
export type RefRole = "character" | "environment";
export declare const IMAGE_TYPES: string[];
export interface RefSlot {
    node: HTMLElement;
    input: HTMLInputElement;
    shown: HTMLElement;
}
/** A drop zone plus file input for one reference image. */
export declare function refSlot(role: RefRole, onFile: (f: File | undefined) => void): RefSlot;
export declare function buildForm(attr: (name: string) => string | null): {
    radios: {
        m: import("../embed.ts").GuideModel;
        r: HTMLInputElement;
    }[];
    model: () => string;
    setModel: (key: string) => void;
    modelSet: HTMLFieldSetElement;
    fields: Record<"subject" | "action" | "environment" | "legend", HTMLInputElement>;
    override: HTMLTextAreaElement;
    own: HTMLDetailsElement;
    shotSet: HTMLFieldSetElement;
    bundleInput: HTMLInputElement;
    guideInfo: HTMLParagraphElement;
    maxPrice: HTMLInputElement;
    run: HTMLButtonElement;
    stop: HTMLButtonElement;
    preview: HTMLDivElement;
    estimate: HTMLParagraphElement;
    confirmSlot: HTMLDivElement;
    status: HTMLParagraphElement;
    error: HTMLParagraphElement;
    result: HTMLDivElement;
};
export type Form = ReturnType<typeof buildForm>;
