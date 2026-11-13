/**
 * One guide lane from a bundle: the neutral shot (subject, environment,
 * action, legend) becomes this model's prompt through the composer, the
 * composer's chosen inputs become the lane request, and `planTask` builds the
 * exact task. The `<arena-generate>` element and `npm run lane -- --bundle`
 * both call `planGuideLane`, so for the same files they send the same task.
 * Pure: no network, no DOM.
 */
import { type ComposedPrompt, type ShotDescription } from "../../packages/core/src/compose.ts";
import { composedMarker } from "../../packages/core/src/shot.ts";
import type { ModelSpec } from "../../packages/core/src/specs/types.ts";
import type { LaneMedia, LanePlan, LaneRequest } from "../types.ts";
import type { GuideShot, LoadedGuide } from "./guide-bundle.ts";
/** How a model uses the guide: the whole clip, or only its audio and first frame. */
export type GuideUse = "guide-video" | "audio-first-frame";
export interface GuideModel {
    key: string;
    name: string;
    use: GuideUse;
    /** One line: what the model takes from the guide, built from the spec database. */
    line: string;
    /** The model's prompting guide, from the spec's sources. */
    guide: {
        title: string;
        url: string;
    };
}
/** The models the generate flow offers, in order. FLUX 3 Video is left out (keyframes only). */
export declare const GUIDE_MODEL_KEYS: readonly ["kling-4", "seedance-2.5", "h3", "ltx-2.5"];
/** The three that take the guide video, for "Compare prompts". */
export declare const COMPARE_MODEL_KEYS: readonly ["kling-4", "seedance-2.5", "h3"];
/** What the model takes from the guide, in one line, from its spec. */
export declare function guideLine(spec: ModelSpec, use: GuideUse): string;
export declare function guideModel(key: string): GuideModel;
export declare const guideModels: () => GuideModel[];
/** What the planner needs to know about the inputs, without their bytes. */
export interface GuideFacts {
    seconds: number;
    hasAudio: boolean;
    hasCharacter: boolean;
    hasEnvironment?: boolean;
    /** Whether the guide video carries its own sound (meta.audioInVideo). */
    audioInVideo?: boolean;
    /** Seconds of the separate audio; the guide's length when not given. */
    audioSeconds?: number;
    /** Refuse instead of dropping the audio over a shared seconds cap. */
    requireAudio?: boolean;
}
/** The composer's shot for one model: the guide's references, placed for how that model uses the guide. */
export declare function shotFor(g: GuideShot, model: string, facts: GuideFacts): {
    shot: ShotDescription;
    notes: string[];
};
/** The composed prompt the model would get, for the preview before Run. */
export declare function previewPrompt(g: GuideShot, model: string, facts: GuideFacts): {
    model: GuideModel;
    composed: ComposedPrompt;
    shot: ShotDescription;
    notes: string[];
};
/** The same shot composed for each model, side by side. */
export declare const comparePrompts: (g: GuideShot, facts: GuideFacts, models?: readonly string[]) => {
    model: GuideModel;
    composed: ComposedPrompt;
    shot: ShotDescription;
    notes: string[];
}[];
/** What a host shows before Run: the prompt, the tags it uses and why anything was left out. */
export interface ComposedForHost {
    model: GuideModel;
    prompt: string;
    /** Each addressed input, e.g. { tag: "<<<image_1>>>", input: "character" }. */
    tags: {
        tag: string;
        input: string;
    }[];
    /** Inputs the model will not get, with the reason. */
    dropped: string[];
    notes: string[];
    /** The composer's shot, as stored in the lane. */
    shot: ShotDescription;
}
/**
 * The composed prompt for a host that draws its own controls. `references`
 * says which images will be sent (any truthy value counts); `guide` gives the
 * clip length and whether it has audio (a loaded bundle, or the two facts;
 * defaults 5 s with audio). Throws PlanError for a combination the model refuses.
 */
export declare function composePrompt(shot: GuideShot, model: string, references?: {
    character?: unknown;
    environment?: unknown;
}, guide?: LoadedGuide | {
    seconds?: number;
    hasAudio?: boolean;
    audioInVideo?: boolean;
}): ComposedForHost;
/** The offered models with their one-line notes and prompting-guide links. */
export declare const offeredModels: () => GuideModel[];
export interface GuideLaneInput {
    guide: LoadedGuide;
    model: string;
    /** The neutral shot; defaults to the guide's recipe.json `shot`. */
    shot?: GuideShot;
    /** Free text that replaces the composed prompt. */
    prompt?: string;
    character?: LaneMedia;
    environment?: LaneMedia;
    resolution?: string;
    requireAudio?: boolean;
}
export interface GuideLanePlan {
    plan: LanePlan;
    request: LaneRequest;
    composed: ComposedPrompt;
    shot: ShotDescription;
    /** The record marker for a composed prompt; absent when free text replaced it. */
    marker?: ReturnType<typeof composedMarker>;
    model: GuideModel;
    notes: string[];
}
export declare function planGuideLane(input: GuideLaneInput, taskUUID?: string): GuideLanePlan;
