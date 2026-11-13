/**
 * Reads a Motion Studio guide bundle (bundle.json, meta.json, beats.json, the
 * media and an optional recipe.json) from a list of named entries, so the
 * browser (File, Blob) and the CLI (files on disk) load it through one path
 * and so produce byte-identical tasks. Media facts come from meta.json, the
 * bundle's published contract; bytes become data URIs for `mediaStorage`.
 */
import { type BundleBeats, type BundleManifest, type BundleMeta } from "../../packages/core/src/bundle.ts";
import type { GuideBundle } from "../../packages/core/src/record.ts";
import { type CameraMove } from "../../packages/core/src/specs/types.ts";
import type { LaneMedia } from "../types.ts";
/** One file of a bundle, whatever holds it. */
export interface BundleEntry {
    name: string;
    size: number;
    bytes(): Promise<Uint8Array>;
}
/** The neutral shot a guide's recipe.json may carry (Beat Path writes one). */
export interface GuideShot {
    subject: string;
    environment?: string;
    action: string;
    /** How to read the guide's colours, e.g. "The orange figure is the character." */
    legend?: string;
    camera?: CameraMove;
}
export interface LoadedGuide {
    manifest: BundleManifest;
    meta: BundleMeta;
    beats: BundleBeats;
    recipe?: Record<string, unknown>;
    /** `recipe.shot`, when the recipe carries a valid one. */
    shot?: GuideShot;
    video: LaneMedia;
    audio?: LaneMedia;
    firstFrame: LaneMedia;
    seconds: number;
    /** The inline guide a record embeds, with media named relative to the record ("./guide.mp4"). */
    guide: GuideBundle;
}
export declare class GuideError extends Error {
    constructor(message: string);
}
/** The content type from the file name, so every host labels a file the same way. */
export declare function typeOf(name: string): string | undefined;
/** Standard base64, the same in the browser and in Node. */
export declare function base64(bytes: Uint8Array): string;
/** Width and height from a PNG or baseline/progressive JPEG header; undefined otherwise. */
export declare function imageSize(b: Uint8Array): {
    width: number;
    height: number;
} | undefined;
/**
 * A character sheet or environment still for the lane, its size read from the
 * header. `src` is where a record reader can see it (a URL); the name otherwise.
 */
export declare const loadImage: (entry: BundleEntry, src?: string) => Promise<LaneMedia>;
/** A shot object from untrusted JSON, or undefined when it is not one. */
export declare function parseGuideShot(v: unknown): GuideShot | undefined;
/** Loads a bundle from its entries; refuses a bundle that does not match the schema. */
/**
 * Loads a bundle from its entries; refuses a bundle that does not match the
 * schema. `base` is where the bundle is published (a directory URL), so the
 * record can point at it; without it media are named relative ("./guide.mp4").
 */
export declare function loadGuideBundle(entries: Iterable<BundleEntry>, opts?: {
    base?: string;
}): Promise<LoadedGuide>;
