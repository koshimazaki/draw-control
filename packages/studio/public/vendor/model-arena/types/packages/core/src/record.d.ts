/**
 * Record schema, version 1. The JSON Schemas in `../schema/` are the published
 * contract; these types mirror them, and `parseRecord` is the dependency-free
 * runtime check the element runs before it renders anything it fetched.
 */
import type { ShotDescription } from "./compose.ts";
export declare const SCHEMA_VERSION: 1;
export interface MediaRef {
    src: string;
    contentType?: string;
    width?: number;
    height?: number;
    fps?: number;
    seconds?: number;
    bytes?: number;
    label?: string;
}
/** One onset or peak: seconds from the clip's frame 0, strength 0-1. */
export interface Onset {
    seconds: number;
    strength: number;
}
export interface GuideBundle {
    schemaVersion: 1;
    id?: string;
    title?: string;
    video: MediaRef;
    audio?: MediaRef;
    firstFrame?: MediaRef;
    firstFrameStyled?: MediaRef;
    passes?: Record<string, MediaRef>;
    keyframes?: {
        time: number;
        src: string;
    }[];
    beats?: number[];
    /** Drum-band onsets from a Motion Studio 0.3.0 beats.json: low = kick, mid = snare, high = hat. */
    onsets?: {
        low: Onset[];
        mid: Onset[];
        high: Onset[];
    };
    /** Amplitude peaks from a Motion Studio 0.3.0 beats.json. */
    peaks?: Onset[];
    /** The camera track (a Motion Studio camera.json, 0.2.0). */
    camera?: MediaRef;
    recipe?: Record<string, unknown>;
    meta?: {
        author?: string;
        createdAt?: string;
        licences?: {
            asset: string;
            licence: string;
            source?: string;
            attribution?: string;
        }[];
        [key: string]: unknown;
    };
}
export type InputRole = "referenceVideo" | "referenceImage" | "referenceAudio" | "frameImage" | "audio" | "video";
export interface InputSent {
    role: InputRole;
    /** Where the reader can see the input: a local path, a URL, or a media UUID. */
    src: string;
    frame?: string | number;
    label?: string;
}
/** A raw frame 0 of the guide, B a restyled still, C no first frame. */
export type FirstFrameVariant = "A" | "B" | "C";
export interface Lane {
    id: string;
    label?: string;
    provider: string;
    /** The model asked for: an AIR id, or `auto` for the router. */
    model: string;
    modelName?: string;
    /** The model that actually ran; null when the provider did not say. */
    modelRan: string | null;
    prompt: string;
    inputsSent: InputSent[];
    firstFrameVariant: FirstFrameVariant;
    output: {
        src: string;
        contentType?: string;
        remoteUrl?: string;
    } | null;
    costUsd: number | null;
    /** Wall-clock seconds from submission to result. */
    generationSeconds: number | null;
    durationSeconds?: number | "auto";
    taskUUID?: string;
    routing?: {
        maxPrice?: number;
        requirements?: string;
    };
    settings?: Record<string, unknown>;
    status?: "ready" | "pending" | "error" | "placeholder";
    note?: string;
    /** Set when the prompt came from the composer: the record's `shot`, written for this model. */
    composed?: {
        model: string;
        notes?: string[];
        dropped?: string[];
    };
    /** The shot this lane's prompt was composed from, when the lane carries its own (the generate flow). */
    shot?: ShotDescription;
}
export interface ArenaRecord {
    schemaVersion: 1;
    id: string;
    title: string;
    createdAt?: string;
    guide?: GuideBundle;
    lanes: Lane[];
    observations?: string[];
    preferredLane?: string;
    /** The one neutral shot description behind every composed lane prompt (optional, still version 1). */
    shot?: ShotDescription;
}
export declare class RecordError extends Error {
    path: string;
    constructor(path: string, message: string);
}
export declare function parseGuide(v: unknown, path?: string): GuideBundle;
/** Checks a list of `{ seconds, strength }`; shared with the bundle reader. */
export declare function onsetList(v: unknown, path: string): Onset[];
/** Checks `{ low, mid, high }` onset lists. */
export declare function onsetBands(v: unknown, path: string): GuideBundle["onsets"];
/** Validates an untrusted record; throws `RecordError` naming the first bad field. */
export declare function parseRecord(v: unknown): ArenaRecord;
