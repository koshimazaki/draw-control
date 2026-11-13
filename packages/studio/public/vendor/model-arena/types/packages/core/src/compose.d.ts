import type { CameraMove, InputKind, ModelSpec } from "./specs/types.ts";
export type ReferenceKind = "image" | "video" | "audio";
/**
 * The camera of a shot: a neutral move, or "guide" to take it from the guide
 * video (its camera path and pacing) in each model's own reference wording.
 */
export type ShotCamera = CameraMove | "guide";
/** What a reference is for, in neutral terms. */
export type ReferenceRole = "first-frame" | "last-frame" | "keyframe" | "character" | "product" | "garment" | "style" | "setting" | "motion" | "source" | "soundtrack";
export interface ShotReference {
    id: string;
    kind: ReferenceKind;
    role: ReferenceRole;
    /** What the model should keep from it; a default per role otherwise. */
    keep?: string;
    /** For an image beside a motion guide: what in the guide it replaces, e.g. "the mannequin". */
    replaces?: string;
}
/** A timed beat, written as "0–3 s: …" where the model's guide supports it. */
export interface ShotBeat {
    start: number;
    end: number;
    text: string;
}
export interface ShotDescription {
    subject: string;
    action: string;
    /** Where it happens, e.g. "a sunlit warehouse"; written after the subject and action. */
    environment?: string;
    /**
     * How to read a coloured guide, e.g. "The orange figure is the character";
     * written beside the reference that carries the guide.
     */
    legend?: string;
    camera: ShotCamera;
    references: ShotReference[];
    /** What the sound should be, in words. */
    audio?: string;
    /** Seconds. */
    duration: number;
    /** What the camera frames and ends on, e.g. "the mannequin"; "the subject" otherwise. */
    focus?: string;
    beats?: ShotBeat[];
}
export interface ComposeOptions {
    /**
     * When an input forbids the camera parameter (LTX audio mode), keep the
     * parameter and drop the input ("camera-parameter", the default), or keep
     * the input and write the move into the prompt ("inputs").
     */
    prefer?: "camera-parameter" | "inputs";
}
export interface UsedInput {
    ref: string;
    role: ReferenceRole;
    input: InputKind;
    field: string;
    /** How the prompt names it, e.g. `<<<video_1>>>`; null when it is not named. */
    address: string | null;
    /** Set when the reference went in as another kind of input. */
    convertedFrom?: InputKind;
}
export interface DroppedInput {
    ref: string;
    role: ReferenceRole;
    wanted: InputKind;
    reason: string;
}
export type CameraMode = "parameter" | "guide-video" | "prompt";
export interface ComposedCamera {
    move: ShotCamera;
    mode: CameraMode;
    /** The parameter path and value, when mode is "parameter". */
    field?: string;
    value?: string;
    /** The words the prompt carries for the move; null when the parameter carries it alone. */
    text: string | null;
}
export interface ComposedPrompt {
    model: string;
    name: string;
    prompt: string;
    /** Request fields beyond the prompt and inputs, e.g. `settings.cameraMovement`. */
    params: Record<string, string | number>;
    camera: ComposedCamera;
    used: UsedInput[];
    dropped: DroppedInput[];
    /** Input kinds this model cannot take at all, from the spec database. */
    cannotTake: InputKind[];
    duration: {
        requested: number;
        sent: number;
    };
    notes: string[];
}
/** The input kind a reference asks for, before the model's rules apply. */
export declare function wantedInput(spec: ModelSpec, ref: ShotReference): InputKind;
export declare const label: (k: InputKind) => string;
/** Compose the shot for one model. */
export declare function composeFor(model: string | ModelSpec, shot: ShotDescription, opts?: ComposeOptions): ComposedPrompt;
/** The five lanes of the comparison, in display order. */
export declare const COMPARISON_MODELS: readonly ["kling-4", "seedance-2.5", "h3", "ltx-2.5", "flux-3-video"];
/** Compose the shot for several models; defaults to the five comparison lanes. */
export declare function compose(shot: ShotDescription, models?: readonly string[], opts?: ComposeOptions): ComposedPrompt[];
