/**
 * Lane fitting: adapts a guide to what one model accepts, or refuses with a
 * message that says why and what to do instead. Capabilities come from each
 * model's published schema (see providers/runware-api/models.ts); this file
 * holds only the rules, so it stays provider-agnostic.
 */
export interface MediaLimits {
    max: number;
    minSeconds?: number;
    maxSeconds?: number;
    totalMaxSeconds?: number;
    minSide?: number;
    maxSide?: number;
    minFps?: number;
    maxFps?: number;
    maxBytes?: number;
    minRatio?: number;
    maxRatio?: number;
}
export interface ModelCaps {
    /** How the guide reaches this model. */
    approach: "reference-video" | "audio-first-frame" | "keyframes" | "router";
    referenceVideos?: MediaLimits;
    referenceAudios?: MediaLimits;
    referenceImages?: MediaLimits;
    frameImages?: MediaLimits & {
        indexPositions: boolean;
    };
    /** Whether a start frame may sit beside reference videos or images. */
    startFrameWithReferences: boolean;
    /** LTX-style audio drive: the audio plus one reference image. */
    drivingAudio?: MediaLimits;
}
export interface FitMedia {
    name: string;
    info?: {
        width?: number;
        height?: number;
        seconds?: number;
        fps?: number | null;
        bytes?: number;
    };
}
export interface FitInput<M extends FitMedia> {
    modelName: string;
    guideVideo?: M;
    firstFrame?: M;
    /** A character or product still that replaces the guide's placeholder figure. */
    character?: M;
    /** An environment or setting still, a reference image after the character. */
    environment?: M;
    audio?: M;
    keyframes?: {
        media: M;
        frame: number | "first" | "last";
    }[];
}
export interface FitResult<M> {
    referenceVideos: M[];
    referenceAudios: M[];
    referenceImages: M[];
    frameImages: {
        media: M;
        frame: number | "first" | "last";
    }[];
    drivingAudio?: M;
    notes: string[];
}
export declare class FitError extends Error {
    constructor(message: string);
}
/** Problems with one file against one limit set, in plain words. */
export declare function checkMedia(model: string, role: string, m: FitMedia, lim: MediaLimits): string[];
export declare function fitLane<M extends FitMedia>(caps: ModelCaps, input: FitInput<M>): FitResult<M>;
