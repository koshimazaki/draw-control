export interface ComposeReference {
    role: "character" | "environment" | "other";
    /** What the image shows or is for, in a few words; restated where the guide asks for it. */
    note?: string;
}
export interface ComposeImageInput {
    model: string;
    kind: "character" | "environment" | "free";
    /** The character, the place, or (free) the whole subject. */
    subject: string;
    /** An art style, such as "flat cel-shaded animation". */
    style?: string;
    /** Environment: the light and time of day. */
    light?: string;
    /** Environment: the camera height and angle the shot uses. */
    camera?: string;
    references?: ComposeReference[];
    orientation?: "landscape" | "portrait" | "square";
}
export interface ComposedImagePrompt {
    prompt: string;
    notes: string[];
}
export declare function composeImagePrompt(input: ComposeImageInput): ComposedImagePrompt;
